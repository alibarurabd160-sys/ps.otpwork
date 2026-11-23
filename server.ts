import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import { WorkspaceStore } from './server/store.ts';
import {
  parseTgzGetNumResponse,
  parseTgzOtpResponse,
  parseTgzRangesResponse,
  stripCountryCode,
  validateHttpUrl,
} from './src/utils/numberUtils.ts';

const DEMO_POOLS: Record<string, { full: string; national: string; country: string; operator: string; rate: number }[]> = {
  '26134': [
    { full: '+447404333228', national: '7404333228', country: 'United Kingdom', operator: 'EE', rate: 0.5 },
    { full: '+447911123456', national: '7911123456', country: 'United Kingdom', operator: 'Vodafone', rate: 0.5 },
  ],
  '88017': [
    { full: '+8801712345678', national: '1712345678', country: 'Bangladesh', operator: 'Grameenphone', rate: 0.25 },
    { full: '+8801819876543', national: '1819876543', country: 'Bangladesh', operator: 'Robi', rate: 0.25 },
  ],
  '1415': [
    { full: '+14155550142', national: '4155550142', country: 'United States', operator: 'T-Mobile', rate: 0.4 },
    { full: '+14155550199', national: '4155550199', country: 'United States', operator: 'AT&T', rate: 0.4 },
  ],
  '9198': [
    { full: '+919812345670', national: '9812345670', country: 'India', operator: 'Airtel', rate: 0.2 },
  ],
};

const store = new WorkspaceStore();
const adminSessions = new Set<string>();
const sseClients = new Set<Response>();
let demoCounter = 0;

function isDisallowedIp(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) {
      return isDisallowedIp(lower.slice(7));
    }
    return false;
  }
  return true;
}

async function validatePublicHttpUrl(rawUrl: string): Promise<string> {
  const normalized = validateHttpUrl(rawUrl);
  const parsed = new URL(normalized);
  const hostname = parsed.hostname.toLowerCase();

  if (
    hostname === 'localhost' ||
    hostname === 'localhost.localdomain' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Local or internal hostnames are not permitted');
  }

  if (net.isIP(hostname) !== 0) {
    if (isDisallowedIp(hostname)) {
      throw new Error('Private, loopback, or link-local IP addresses are blocked');
    }
    return normalized;
  }

  const resolved = await dns.lookup(hostname, { all: true });
  if (!resolved.length) {
    throw new Error('Could not resolve API hostname');
  }
  for (const record of resolved) {
    if (isDisallowedIp(record.address)) {
      throw new Error('API hostname resolved to a private or blocked IP address');
    }
  }
  return normalized;
}

function getAdminToken(req: Request): string | null {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice(7).trim();
  return adminSessions.has(token) ? token : null;
}

function broadcastConfigUpdate(): void {
  const payload = JSON.stringify({
    type: 'config:updated',
    config: store.getPublicConfig(),
  });
  for (const client of sseClients) {
    client.write(`data: ${payload}\n\n`);
  }
}

async function tgzRequest(
  endpointPath: string,
  options: { method: 'GET' | 'POST'; body?: Record<string, unknown>; timeoutMs?: number },
): Promise<unknown> {
  const config = store.getPublicConfig();
  const apiKey = store.getEffectiveApiKey();
  if (!apiKey) {
    throw new Error('TGZ API key is not configured on the server');
  }

  const cleanBase = (await validatePublicHttpUrl(config.baseUrl)).replace(/\/+$/, '');
  const targetUrl = `${cleanBase}${endpointPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);

  try {
    const response = await fetch(targetUrl, {
      method: options.method,
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        mauthapi: apiKey,
        'X-API-Key': apiKey,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error('Redirects are blocked for outbound API calls');
    }

    const data = (await response.json()) as unknown;
    if (!response.ok) {
      const msg = (data as Record<string, unknown>)?.message;
      throw new Error(String(msg || `API returned HTTP ${response.status}`));
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

const DEMO_FORM_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Phone Verification Demo Page</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; padding: 20px; }
    .card { max-width: 340px; margin: 12px auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; }
    h2 { margin: 0 0 6px; font-size: 16px; }
    p { margin: 0 0 14px; font-size: 12px; color: #64748b; }
    label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; }
    input { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; }
    .hint { margin-top: 10px; font-size: 12px; color: #0f766e; min-height: 18px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Verification Form</h2>
    <p>Ready to receive autofilled or pasted phone numbers.</p>
    <label for="phone">Phone Number</label>
    <input id="phone" name="phone" type="tel" placeholder="Enter phone number" />
    <div id="status" class="hint"></div>
  </div>
  <script>
    window.addEventListener("message", function (event) {
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === "AUTOFILL_NUMBER" && typeof event.data.number === "string") {
        var input = document.getElementById("phone");
        input.value = event.data.number;
        document.getElementById("status").textContent = "Autofilled: " + event.data.number;
      }
    });
  </script>
</body>
</html>`;

async function createAppServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/demo-form', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(DEMO_FORM_HTML);
  });

  app.get('/api/config', (_req: Request, res: Response) => {
    res.json(store.getPublicConfig());
  });

  app.get('/api/config/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.add(res);
    const initialPayload = JSON.stringify({
      type: 'config:init',
      config: store.getPublicConfig(),
    });
    res.write(`data: ${initialPayload}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  app.get('/api/admin/auth-state', (_req: Request, res: Response) => {
    res.json(store.getAuthStatus());
  });

  app.post('/api/admin/setup', (req: Request, res: Response) => {
    try {
      const passcode = String((req.body as Record<string, unknown>)?.passcode ?? '');
      store.claimInitialPasscode(passcode);
      const token = crypto.randomBytes(32).toString('hex');
      adminSessions.add(token);
      res.json({ token, config: store.getPublicConfig() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to set passcode';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/admin/login', (req: Request, res: Response) => {
    const passcode = String((req.body as Record<string, unknown>)?.passcode ?? '');
    if (!store.verifyAdminPasscode(passcode)) {
      res.status(401).json({ error: 'Invalid admin passcode' });
      return;
    }
    const token = crypto.randomBytes(32).toString('hex');
    adminSessions.add(token);
    res.json({ token, config: store.getPublicConfig() });
  });

  app.post('/api/admin/logout', (req: Request, res: Response) => {
    const token = getAdminToken(req);
    if (token) {
      adminSessions.delete(token);
    }
    res.json({ ok: true });
  });

  app.get('/api/admin/config', (req: Request, res: Response) => {
    if (!getAdminToken(req)) {
      res.status(401).json({ error: 'Admin authentication required' });
      return;
    }
    res.json(store.getPublicConfig());
  });

  app.post('/api/admin/config', async (req: Request, res: Response) => {
    if (!getAdminToken(req)) {
      res.status(401).json({ error: 'Admin authentication required' });
      return;
    }

    try {
      const body = req.body as Record<string, unknown>;
      const patch: Partial<ReturnType<typeof store.getPublicConfig>> = {};

      if (typeof body.browserUrl === 'string' && body.browserUrl.trim()) {
        const rawTarget = body.browserUrl.trim();
        patch.browserUrl = rawTarget === '/demo-form' ? '/demo-form' : validateHttpUrl(rawTarget);
      }

      if (typeof body.baseUrl === 'string' && body.baseUrl.trim()) {
        patch.baseUrl = (await validatePublicHttpUrl(body.baseUrl.trim())).replace(/\/+$/, '');
      }

      if (typeof body.defaultRid === 'string' && body.defaultRid.trim()) {
        const cleanRid = body.defaultRid.replace(/\D/g, '');
        if (!cleanRid) {
          throw new Error('Default Range ID (rid) must contain digits');
        }
        patch.defaultRid = cleanRid;
      }

      if (typeof body.demoMode === 'boolean') {
        patch.demoMode = body.demoMode;
      }

      if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
        store.setRuntimeApiKey(body.apiKey.trim());
      }

      const updated = store.updateConfig(patch);
      broadcastConfigUpdate();
      res.json({ ...updated, hasApiKey: Boolean(store.getEffectiveApiKey()) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid configuration';
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/admin/balance', async (req: Request, res: Response) => {
    if (!getAdminToken(req)) {
      res.status(401).json({ error: 'Admin authentication required' });
      return;
    }
    const config = store.getPublicConfig();
    if (config.demoMode || !store.getEffectiveApiKey()) {
      res.json({ demo: true, balance: 12.5, currency: 'USD' });
      return;
    }
    try {
      const payload = await tgzRequest('/balance', { method: 'GET' });
      res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Balance check failed';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/user/ranges', async (_req: Request, res: Response) => {
    const config = store.getPublicConfig();
    if (config.demoMode || !store.getEffectiveApiKey()) {
      res.json({
        demo: true,
        ranges: [
          { range: '26134', rate: 0.5 },
          { range: '88017', rate: 0.25 },
          { range: '1415', rate: 0.4 },
          { range: '9198', rate: 0.2 },
        ],
      });
      return;
    }
    try {
      const payload = await tgzRequest('/ranges', { method: 'GET' });
      res.json({ demo: false, ranges: parseTgzRangesResponse(payload) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch ranges';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/user/get-number', async (req: Request, res: Response) => {
    try {
      const config = store.getPublicConfig();
      const body = (req.body || {}) as Record<string, unknown>;
      const requestedRid = String(body.rid ?? config.defaultRid).replace(/\D/g, '');
      const countryStrip = String(body.countryCode ?? 'api').trim();

      if (!requestedRid) {
        res.status(400).json({ error: 'Please enter a valid Range ID (digits only)' });
        return;
      }

      if (config.demoMode || !store.getEffectiveApiKey()) {
        const pool = DEMO_POOLS[requestedRid] || [
          {
            full: `+${requestedRid.slice(0, 2) || '44'}7404${String(100000 + (demoCounter % 899999))}`,
            national: `7404${String(100000 + (demoCounter % 899999))}`,
            country: `Range ${requestedRid}`,
            operator: 'Demo Carrier',
            rate: 0.35,
          },
        ];
        const pick = pool[demoCounter % pool.length];
        demoCounter += 1;
        const localNumber =
          countryStrip === 'api'
            ? pick.national
            : stripCountryCode(pick.full, countryStrip);

        res.json({
          demo: true,
          fullNumber: pick.full,
          nationalNumber: localNumber,
          noPlusNumber: pick.full.replace(/^\+/, ''),
          country: pick.country,
          operator: pick.operator,
          rate: pick.rate,
          rid: requestedRid,
        });
        return;
      }

      const rawPayload = await tgzRequest('/getnum', {
        method: 'POST',
        body: { rid: requestedRid },
      });
      const parsed = parseTgzGetNumResponse(rawPayload, requestedRid);
      const localNumber =
        countryStrip === 'api'
          ? parsed.nationalNumber
          : stripCountryCode(parsed.fullNumber, countryStrip);

      res.json({
        demo: false,
        ...parsed,
        nationalNumber: localNumber,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to allocate number';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/user/get-otp', async (req: Request, res: Response) => {
    const number = String(req.query.number ?? '').replace(/\D/g, '');
    const wait = Math.max(0, Math.min(25, Number(req.query.wait ?? 10) || 10));
    if (!number) {
      res.status(400).json({ error: 'Number parameter is required' });
      return;
    }

    const config = store.getPublicConfig();
    if (config.demoMode || !store.getEffectiveApiKey()) {
      res.json({
        demo: true,
        status: 'ok',
        number,
        otp: '482910',
        message: 'Demo verification code: 482910',
        service: 'DEMO',
        time: Date.now(),
      });
      return;
    }

    try {
      const rawPayload = await tgzRequest(
        `/otp?number=${encodeURIComponent(number)}&wait=${wait}`,
        { method: 'GET', timeoutMs: (wait + 5) * 1000 },
      );
      res.json({ demo: false, ...parseTgzOtpResponse(rawPayload, number) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OTP lookup failed';
      res.status(502).json({ error: message });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

createAppServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

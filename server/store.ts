import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface WorkspaceConfig {
  browserUrl: string;
  baseUrl: string;
  defaultRid: string;
  demoMode: boolean;
  updatedAt: string;
}

interface PersistedState {
  config: WorkspaceConfig;
  adminPasscodeHash: string | null;
}

const DEFAULT_CONFIG: WorkspaceConfig = {
  browserUrl: 'https://example.com',
  baseUrl: 'https://min-bot-emf8.onrender.com/api/v1',
  defaultRid: '26134',
  demoMode: true,
  updatedAt: new Date().toISOString(),
};

export function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasscodeHash(passcode: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) {
    return false;
  }
  const derived = crypto.scryptSync(passcode, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, storedBuf);
}

export class WorkspaceStore {
  private stateFilePath: string;
  private state: PersistedState;
  private runtimeApiKey: string;

  constructor(stateFilePath = path.resolve(process.cwd(), 'data', 'workspace-state.json')) {
    this.stateFilePath = stateFilePath;
    this.runtimeApiKey = (process.env.TGZ_API_KEY || '').trim();
    this.state = this.loadState();
  }

  private loadState(): PersistedState {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        return {
          config: {
            browserUrl: parsed.config?.browserUrl || DEFAULT_CONFIG.browserUrl,
            baseUrl: parsed.config?.baseUrl || DEFAULT_CONFIG.baseUrl,
            defaultRid: parsed.config?.defaultRid || DEFAULT_CONFIG.defaultRid,
            demoMode:
              typeof parsed.config?.demoMode === 'boolean'
                ? parsed.config.demoMode
                : !this.runtimeApiKey,
            updatedAt: parsed.config?.updatedAt || new Date().toISOString(),
          },
          adminPasscodeHash: parsed.adminPasscodeHash ?? null,
        };
      }
    } catch {
      // Fall back to default state on corrupted file
    }
    return {
      config: {
        ...DEFAULT_CONFIG,
        demoMode: !this.runtimeApiKey,
      },
      adminPasscodeHash: null,
    };
  }

  private saveState(): void {
    const dir = path.dirname(this.stateFilePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  public getPublicConfig(): WorkspaceConfig & { hasApiKey: boolean } {
    return {
      ...this.state.config,
      hasApiKey: Boolean(this.getEffectiveApiKey()),
    };
  }

  public getEffectiveApiKey(): string {
    return (process.env.TGZ_API_KEY || '').trim() || this.runtimeApiKey;
  }

  public setRuntimeApiKey(newKey: string): void {
    this.runtimeApiKey = newKey.trim();
  }

  public getAuthStatus(): { hasPasscode: boolean; usesEnvPasscode: boolean } {
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    return {
      hasPasscode: Boolean(envPasscode || this.state.adminPasscodeHash),
      usesEnvPasscode: Boolean(envPasscode),
    };
  }

  public claimInitialPasscode(passcode: string): void {
    const trimmed = passcode.trim();
    if (trimmed.length < 4) {
      throw new Error('Passcode must be at least 4 characters');
    }
    const status = this.getAuthStatus();
    if (status.hasPasscode) {
      throw new Error('Admin passcode is already configured');
    }
    this.state.adminPasscodeHash = hashPasscode(trimmed);
    this.saveState();
  }

  public verifyAdminPasscode(passcode: string): boolean {
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    if (envPasscode) {
      const a = Buffer.from(passcode);
      const b = Buffer.from(envPasscode);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    }
    if (!this.state.adminPasscodeHash) {
      return false;
    }
    return verifyPasscodeHash(passcode, this.state.adminPasscodeHash);
  }

  public updateConfig(patch: Partial<WorkspaceConfig>): WorkspaceConfig {
    this.state.config = {
      ...this.state.config,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.saveState();
    return this.state.config;
  }
}

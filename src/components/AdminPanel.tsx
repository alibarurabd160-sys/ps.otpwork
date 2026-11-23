import { useEffect, useState } from 'react';
import { Check, KeyRound, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import type { WorkspaceConfig } from '../../server/store';

interface AdminPanelProps {
  adminToken: string | null;
  onAdminTokenChange: (token: string | null) => void;
  config: WorkspaceConfig & { hasApiKey: boolean };
  onConfigSaved: (updated: WorkspaceConfig & { hasApiKey: boolean }) => void;
}

export function AdminPanel({
  adminToken,
  onAdminTokenChange,
  config,
  onConfigSaved,
}: AdminPanelProps) {
  const [authState, setAuthState] = useState<{
    hasPasscode: boolean;
    usesEnvPasscode: boolean;
  } | null>(null);
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [browserUrl, setBrowserUrl] = useState(config.browserUrl);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [defaultRid, setDefaultRid] = useState(config.defaultRid);
  const [demoMode, setDemoMode] = useState(config.demoMode);
  const [apiKeyInput, setApiKeyInput] = useState('');

  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [balanceText, setBalanceText] = useState<string | null>(null);

  useEffect(() => {
    setBrowserUrl(config.browserUrl);
    setBaseUrl(config.baseUrl);
    setDefaultRid(config.defaultRid);
    setDemoMode(config.demoMode);
  }, [config]);

  useEffect(() => {
    fetch('/api/admin/auth-state')
      .then((res) => res.json())
      .then((data: { hasPasscode: boolean; usesEnvPasscode: boolean }) => setAuthState(data))
      .catch(() => setAuthState({ hasPasscode: true, usesEnvPasscode: false }));
  }, [adminToken]);

  const handleSetupOrLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);
    setIsAuthLoading(true);
    try {
      const endpoint = authState?.hasPasscode ? '/api/admin/login' : '/api/admin/setup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = (await res.json()) as {
        token?: string;
        config?: WorkspaceConfig & { hasApiKey: boolean };
        error?: string;
      };
      if (!res.ok || !data.token) {
        throw new Error(data.error || 'Authentication failed');
      }
      setPasscode('');
      onAdminTokenChange(data.token);
      if (data.config) {
        onConfigSaved(data.config);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSaveConfig = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adminToken) return;
    setIsSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          browserUrl,
          baseUrl,
          defaultRid,
          demoMode,
          apiKey: apiKeyInput.trim() || undefined,
        }),
      });
      const data = (await res.json()) as (WorkspaceConfig & { hasApiKey: boolean }) & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save configuration');
      }
      setApiKeyInput('');
      onConfigSaved(data);
      setSaveMessage('Published to all connected user screens');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCheckBalance = async () => {
    if (!adminToken) return;
    setBalanceText('Checking...');
    try {
      const res = await fetch('/api/admin/balance', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(String(data.error || 'Failed'));
      }
      setBalanceText(JSON.stringify(data));
    } catch (err) {
      setBalanceText(err instanceof Error ? err.message : 'Balance unavailable');
    }
  };

  const handleLogout = async () => {
    if (adminToken) {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => undefined);
    }
    onAdminTokenChange(null);
  };

  if (!adminToken) {
    const isFirstRun = authState && !authState.hasPasscode;
    return (
      <main className="mx-auto max-w-md px-6 py-14">
        <section className="rounded-xl border border-slate-200 bg-white p-7">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-slate-900">
              {isFirstRun ? 'Create Admin Passcode' : 'Admin Panel Login'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">
              {isFirstRun
                ? 'Set an admin passcode to control the shared 4-screen browser link and API settings.'
                : 'Sign in to update the target URL synced across all user screens.'}
            </p>
          </div>

          <form onSubmit={handleSetupOrLogin} className="space-y-4">
            <div>
              <label
                htmlFor="admin-passcode-input"
                className="mb-1.5 block text-sm font-medium text-slate-800"
              >
                {isFirstRun ? 'New Admin Passcode (min 4 characters)' : 'Admin Passcode'}
              </label>
              <input
                id="admin-passcode-input"
                type="password"
                required
                minLength={4}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus-visible:border-teal-700 focus-visible:outline-none"
              />
            </div>

            {authError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
              >
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span>
                {isAuthLoading
                  ? 'Verifying...'
                  : isFirstRun
                    ? 'Claim Admin Access'
                    : 'Sign In to Admin Panel'}
              </span>
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <section className="rounded-xl border border-slate-200 bg-white p-7">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Admin Panel</h1>
            <p className="mt-1 text-xs text-slate-500">
              Updates pushed here automatically load inside all 4 screens for every connected user.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Admin Logout</span>
          </button>
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-6">
          <div>
            <label
              htmlFor="admin-browser-url"
              className="mb-1.5 block text-sm font-medium text-slate-800"
            >
              Shared Browser Link (Auto-pushed to All Users)
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="admin-browser-url"
                type="text"
                required
                value={browserUrl}
                onChange={(e) => setBrowserUrl(e.target.value)}
                placeholder="https://example.com"
                className="min-w-[260px] flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus-visible:border-teal-700 focus-visible:outline-none"
              />
              <button
                type="button"
                onClick={() => setBrowserUrl('/demo-form')}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                Use Built-in Autofill Form
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="admin-base-url"
                className="mb-1.5 block text-sm font-medium text-slate-800"
              >
                Number API Base URL
              </label>
              <input
                id="admin-base-url"
                type="url"
                required
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://min-bot-emf8.onrender.com/api/v1"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus-visible:border-teal-700 focus-visible:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="admin-default-rid"
                className="mb-1.5 block text-sm font-medium text-slate-800"
              >
                Default Range / Flex ID (rid)
              </label>
              <input
                id="admin-default-rid"
                type="text"
                inputMode="numeric"
                required
                value={defaultRid}
                onChange={(e) => setDefaultRid(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 tabular-nums focus-visible:border-teal-700 focus-visible:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="admin-api-key"
                className="mb-1.5 block text-sm font-medium text-slate-800"
              >
                API Key (Server-only, Write-only)
              </label>
              <input
                id="admin-api-key"
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  config.hasApiKey ? 'Key configured (enter new key to replace)' : 'Enter API key'
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus-visible:border-teal-700 focus-visible:outline-none"
              />
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                <span>
                  {config.hasApiKey
                    ? 'API key is saved securely on the server.'
                    : 'No API key set yet (Demo Mode active until configured).'}
                </span>
              </p>
            </div>

            <div className="flex flex-col justify-center">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={demoMode}
                  onChange={(e) => setDemoMode(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                />
                <span>Run in Demo Mode (mock numbers &amp; OTP)</span>
              </label>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCheckBalance}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Check API Balance</span>
                </button>
                {balanceText && (
                  <span className="truncate font-mono text-xs text-slate-600">{balanceText}</span>
                )}
              </div>
            </div>
          </div>

          {saveError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700"
            >
              {saveError}
            </div>
          )}

          {saveMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-medium text-teal-800">
              <Check className="h-4 w-4" aria-hidden="true" />
              <span>{saveMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex w-full items-center justify-center rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {isSaving ? 'Publishing...' : 'Save & Push Link to All Screens'}
          </button>
        </form>
      </section>
    </main>
  );
}

import { useState } from 'react';
import { Eye, EyeOff, KeyRound, LayoutGrid } from 'lucide-react';

export interface LoginPayload {
  windowCount: number;
  baseUrl: string;
  apiKey: string;
  browserUrl: string;
  countryCode: string;
  demoMode: boolean;
}

interface LoginViewProps {
  onLogin: (payload: LoginPayload) => Promise<void>;
  isSubmitting: boolean;
  errorMessage: string | null;
}

const COUNTRY_OPTIONS = [
  { value: '880', label: '+880 (Bangladesh)' },
  { value: 'auto', label: 'Auto-detect prefix' },
  { value: '1', label: '+1 (US / Canada)' },
  { value: '44', label: '+44 (United Kingdom)' },
  { value: '91', label: '+91 (India)' },
  { value: '60', label: '+60 (Malaysia)' },
  { value: '971', label: '+971 (UAE)' },
];

export function LoginView({ onLogin, isSubmitting, errorMessage }: LoginViewProps) {
  const [windowCount, setWindowCount] = useState<number>(4);
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [showBaseUrl, setShowBaseUrl] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [browserUrl, setBrowserUrl] = useState<string>('https://example.com');
  const [countryCode, setCountryCode] = useState<string>('880');
  const [demoMode, setDemoMode] = useState<boolean>(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onLogin({
      windowCount,
      baseUrl,
      apiKey,
      browserUrl,
      countryCode,
      demoMode,
    });
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <section className="rounded-xl border border-slate-200 bg-white p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            API Login &amp; Multi-Window Setup
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Choose how many windows to open, connect your number API endpoint and key, and set the
            web link to load across all active panes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <span className="mb-2 block text-sm font-medium text-slate-800">
              Select Window Count
            </span>
            <div
              role="group"
              aria-label="Window count"
              className="grid grid-cols-4 gap-2 rounded-lg bg-slate-100 p-1"
            >
              {[1, 2, 3, 4].map((count) => {
                const active = windowCount === count;
                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setWindowCount(count)}
                    className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                      active
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="tabular-nums">
                      {count} {count === 1 ? 'Window' : 'Windows'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="base-url-input"
                className="mb-1.5 block text-sm font-medium text-slate-800"
              >
                API Base URL
              </label>
              <div className="relative">
                <input
                  id="base-url-input"
                  type={showBaseUrl ? 'url' : 'password'}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  disabled={demoMode}
                  placeholder="https://api.example.com/get"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-teal-700 focus-visible:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowBaseUrl((prev) => !prev)}
                  aria-label={showBaseUrl ? 'Hide Base URL' : 'Show Base URL'}
                  className="absolute inset-y-0 right-2 flex items-center px-1.5 text-slate-400 hover:text-slate-700"
                >
                  {showBaseUrl ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Hidden by default; kept only on the server session.
              </p>
            </div>

            <div>
              <label
                htmlFor="api-key-input"
                className="mb-1.5 block text-sm font-medium text-slate-800"
              >
                API Key
              </label>
              <div className="relative">
                <input
                  id="api-key-input"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={demoMode}
                  placeholder="Enter API key"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-teal-700 focus-visible:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((prev) => !prev)}
                  aria-label={showApiKey ? 'Hide API Key' : 'Show API Key'}
                  className="absolute inset-y-0 right-2 flex items-center px-1.5 text-slate-400 hover:text-slate-700"
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Sent via Bearer and X-API-Key headers on Get Number.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label
                htmlFor="browser-url-input"
                className="mb-1.5 block text-sm font-medium text-slate-800"
              >
                Browser Link (Opened in All Windows)
              </label>
              <input
                id="browser-url-input"
                type="url"
                required
                value={browserUrl}
                onChange={(e) => setBrowserUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-teal-700 focus-visible:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="country-code-select"
                className="mb-1.5 block text-sm font-medium text-slate-800"
              >
                Strip Country Code
              </label>
              <select
                id="country-code-select"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm text-slate-900 focus-visible:border-teal-700 focus-visible:outline-none"
              >
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
              />
              <span>Use built-in Demo API to test without an external key</span>
            </label>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {errorMessage}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span>{isSubmitting ? 'Signing in...' : 'Login & Open Windows'}</span>
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

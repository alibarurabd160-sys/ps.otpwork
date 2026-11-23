import { useState } from 'react';
import { Check, Copy, ExternalLink, LogOut, PhoneCall, RotateCw } from 'lucide-react';
import { getGridClassForCount } from '../utils/numberUtils';

interface WorkspaceViewProps {
  windowCount: number;
  onWindowCountChange: (count: number) => void;
  browserUrl: string;
  countryCode: string;
  onCountryCodeChange: (code: string) => void;
  demoMode: boolean;
  onGetNumber: () => Promise<{ rawNumber: string; localNumber: string }>;
  onLogout: () => Promise<void>;
}

const COUNTRY_CODES = [
  { value: '880', label: '+880 (BD)' },
  { value: 'auto', label: 'Auto' },
  { value: '1', label: '+1 (US/CA)' },
  { value: '44', label: '+44 (UK)' },
  { value: '91', label: '+91 (IN)' },
];

export function WorkspaceView({
  windowCount,
  onWindowCountChange,
  browserUrl,
  countryCode,
  onCountryCodeChange,
  demoMode,
  onGetNumber,
  onLogout,
}: WorkspaceViewProps) {
  const [paneReloadKeys, setPaneReloadKeys] = useState<Record<number, number>>({});
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<{ rawNumber: string; localNumber: string } | null>(
    null,
  );
  const [copyFeedback, setCopyFeedback] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback('Copied without country code');
      return;
    } catch {
      // Fallback for restricted iframe contexts
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopyFeedback(
        ok ? 'Copied without country code' : 'Ready to copy (click Copy Number)',
      );
    } catch {
      setCopyFeedback('Ready to copy (click Copy Number)');
    }
  };

  const handleGetNumberClick = async () => {
    setIsFetching(true);
    setErrorMsg(null);
    setCopyFeedback('');
    try {
      const result = await onGetNumber();
      setLastResult(result);
      await copyToClipboard(result.localNumber);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch number');
    } finally {
      setIsFetching(false);
    }
  };

  const handleReloadPane = (paneIndex: number) => {
    setPaneReloadKeys((prev) => ({
      ...prev,
      [paneIndex]: (prev[paneIndex] || 0) + 1,
    }));
  };

  const paneIndexes = Array.from({ length: windowCount }, (_, index) => index + 1);

  return (
    <div className="flex flex-col">
      <section
        aria-label="Workspace controls"
        className="border-b border-slate-200 bg-white px-6 py-3"
      >
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label="Active window layout"
              className="flex items-center gap-1 rounded-lg bg-slate-100 p-1"
            >
              {[1, 2, 3, 4].map((count) => {
                const active = windowCount === count;
                return (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onWindowCountChange(count)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 tabular-nums ${
                      active
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {count} {count === 1 ? 'Win' : 'Wins'}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-600">
              <label htmlFor="workspace-country-code" className="font-medium text-slate-700">
                Strip code
              </label>
              <select
                id="workspace-country-code"
                value={countryCode}
                onChange={(e) => onCountryCodeChange(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus-visible:border-teal-700 focus-visible:outline-none"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="hidden items-center gap-2 text-xs text-slate-500 md:flex">
              <span>{demoMode ? 'Demo API' : 'Live API'}</span>
              <span aria-hidden="true">·</span>
              <span className="max-w-[260px] truncate">{browserUrl}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGetNumberClick}
              disabled={isFetching}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              <PhoneCall className="h-4 w-4" aria-hidden="true" />
              <span>{isFetching ? 'Fetching...' : 'Get Number'}</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </section>

      <section
        aria-label="Fetched number status"
        className="border-b border-slate-200 bg-slate-50 px-6 py-2.5"
      >
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-slate-500">Current Number</span>
            {lastResult ? (
              <>
                <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {lastResult.localNumber}
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  Raw: {lastResult.rawNumber}
                </span>
                {copyFeedback && (
                  <>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {copyFeedback}
                    </span>
                  </>
                )}
              </>
            ) : (
              <span className="text-xs text-slate-500">
                Click Get Number to fetch and copy a local number without its country code.
              </span>
            )}
            {errorMsg && (
              <span role="alert" className="text-xs font-medium text-red-600">
                {errorMsg}
              </span>
            )}
          </div>

          {lastResult && (
            <button
              type="button"
              onClick={() => copyToClipboard(lastResult.localNumber)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Copy Number</span>
            </button>
          )}
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1600px] p-4">
        <div className={`grid gap-3 ${getGridClassForCount(windowCount)}`}>
          {paneIndexes.map((paneNumber) => (
            <div
              key={paneNumber}
              data-testid={`window-pane-${paneNumber}`}
              className={`flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white ${
                windowCount === 4
                  ? 'h-[340px] lg:h-[calc((100vh-230px)/2)] lg:min-h-[300px]'
                  : 'h-[420px] lg:h-[calc(100vh-218px)] lg:min-h-[440px]'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3.5 py-2">
                <span className="text-xs font-semibold text-slate-700 tabular-nums">
                  Window {paneNumber}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleReloadPane(paneNumber)}
                    aria-label={`Reload Window ${paneNumber}`}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
                  >
                    <RotateCw className="h-3 w-3" aria-hidden="true" />
                    <span>Reload</span>
                  </button>
                  <a
                    href={browserUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open Window ${paneNumber} link in new tab`}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    <span>Tab</span>
                  </a>
                </div>
              </div>
              <iframe
                key={`${paneNumber}-${paneReloadKeys[paneNumber] || 0}`}
                title={`Window ${paneNumber}`}
                src={browserUrl}
                referrerPolicy="no-referrer"
                className="h-full w-full flex-1 border-0 bg-white"
              />
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">
          Note: External sites that set X-Frame-Options or frame-ancestors restrictions can be
          opened using the Tab link on any pane.
        </p>
      </main>
    </div>
  );
}

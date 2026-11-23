import { useEffect, useRef, useState } from 'react';
import { Check, Copy, KeyRound, PhoneCall, Trash2 } from 'lucide-react';
import {
  getGridClassForCount,
  type AllocatedNumberResult,
  type OtpLookupResult,
  type RangeOption,
} from '../utils/numberUtils';

interface QuadScreenWorkspaceProps {
  screenCount: number;
  browserUrl: string;
  defaultRid: string;
  demoMode: boolean;
  configUpdatedAt: string;
}

interface PaneState {
  version: number;
  resetting: boolean;
  fetching: boolean;
  checkingOtp: boolean;
  allocated: AllocatedNumberResult | null;
  otp: OtpLookupResult | null;
  copied: boolean;
  error: string | null;
}

function createInitialPaneState(): PaneState {
  return {
    version: 1,
    resetting: false,
    fetching: false,
    checkingOtp: false,
    allocated: null,
    otp: null,
    copied: false,
    error: null,
  };
}

export function QuadScreenWorkspace({
  screenCount,
  browserUrl,
  defaultRid,
  demoMode,
  configUpdatedAt,
}: QuadScreenWorkspaceProps) {
  const [ridInput, setRidInput] = useState<string>(defaultRid);
  const [liveRanges, setLiveRanges] = useState<RangeOption[]>([]);
  const [panes, setPanes] = useState<Record<number, PaneState>>({
    1: createInitialPaneState(),
    2: createInitialPaneState(),
    3: createInitialPaneState(),
    4: createInitialPaneState(),
  });
  const iframeRefs = useRef<Record<number, HTMLIFrameElement | null>>({});

  useEffect(() => {
    setRidInput(defaultRid);
  }, [defaultRid]);

  useEffect(() => {
    fetch('/api/user/ranges')
      .then((res) => res.json())
      .then((data: { ranges?: RangeOption[] }) => {
        if (Array.isArray(data.ranges)) {
          setLiveRanges(data.ranges);
        }
      })
      .catch(() => undefined);
  }, [demoMode, configUpdatedAt]);

  const updatePane = (paneNumber: number, updater: (prev: PaneState) => PaneState) => {
    setPanes((prev) => ({
      ...prev,
      [paneNumber]: updater(prev[paneNumber] || createInitialPaneState()),
    }));
  };

  const copyToClipboard = async (value: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(value);
      return true;
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
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  };

  const autofillPaneIfSameOrigin = (paneNumber: number, numberValue: string) => {
    const isSameOrigin =
      browserUrl.startsWith('/') || browserUrl.startsWith(window.location.origin);
    if (!isSameOrigin) {
      return;
    }
    const frame = iframeRefs.current[paneNumber];
    try {
      frame?.contentWindow?.postMessage(
        { type: 'AUTOFILL_NUMBER', number: numberValue },
        window.location.origin,
      );
    } catch {
      // Ignore cross-origin frame postMessage restriction
    }
  };

  const handleGetNumberForPane = async (paneNumber: number) => {
    const targetRid = ridInput.replace(/\D/g, '') || defaultRid;
    updatePane(paneNumber, (prev) => ({
      ...prev,
      fetching: true,
      error: null,
      otp: null,
      copied: false,
    }));

    try {
      const res = await fetch('/api/user/get-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rid: targetRid,
          countryCode: 'api',
        }),
      });
      const data = (await res.json()) as AllocatedNumberResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch number');
      }
      const didCopy = await copyToClipboard(data.nationalNumber);
      autofillPaneIfSameOrigin(paneNumber, data.nationalNumber);

      updatePane(paneNumber, (prev) => ({
        ...prev,
        fetching: false,
        allocated: data,
        copied: didCopy,
      }));
    } catch (err) {
      updatePane(paneNumber, (prev) => ({
        ...prev,
        fetching: false,
        error: err instanceof Error ? err.message : 'Unable to fetch number',
      }));
    }
  };

  const handleCheckOtpForPane = async (paneNumber: number) => {
    const current = panes[paneNumber];
    if (!current?.allocated?.noPlusNumber) return;

    updatePane(paneNumber, (prev) => ({
      ...prev,
      checkingOtp: true,
      error: null,
    }));

    try {
      const res = await fetch(
        `/api/user/get-otp?number=${encodeURIComponent(current.allocated.noPlusNumber)}&wait=15`,
      );
      const data = (await res.json()) as OtpLookupResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'OTP check failed');
      }
      updatePane(paneNumber, (prev) => ({
        ...prev,
        checkingOtp: false,
        otp: data,
      }));
    } catch (err) {
      updatePane(paneNumber, (prev) => ({
        ...prev,
        checkingOtp: false,
        error: err instanceof Error ? err.message : 'OTP lookup failed',
      }));
    }
  };

  const handleCopyPaneNumber = async (paneNumber: number) => {
    const num = panes[paneNumber]?.allocated?.nationalNumber;
    if (!num) return;
    const ok = await copyToClipboard(num);
    updatePane(paneNumber, (prev) => ({ ...prev, copied: ok }));
  };

  const handleClearScreen = (paneNumber: number) => {
    updatePane(paneNumber, (prev) => ({
      ...prev,
      resetting: true,
      allocated: null,
      otp: null,
      copied: false,
      error: null,
    }));
    setTimeout(() => {
      updatePane(paneNumber, (prev) => ({
        ...prev,
        resetting: false,
        version: prev.version + 1,
      }));
    }, 80);
  };

  const buildPaneSrc = (paneNumber: number, version: number) => {
    if (browserUrl === '/demo-form') {
      return `/demo-form?screen=${paneNumber}&v=${version}`;
    }
    const separator = browserUrl.includes('?') ? '&' : '?';
    return `${browserUrl}${separator}_pane=${paneNumber}&_v=${version}`;
  };

  const visiblePaneNumbers = Array.from({ length: screenCount }, (_, idx) => idx + 1);

  return (
    <div className="flex flex-col">
      <section
        aria-label="Flex range control"
        className="border-b border-slate-200 bg-white px-3 py-2 sm:px-6 sm:py-2.5"
      >
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label
              htmlFor="flex-range-input"
              className="text-xs font-semibold text-slate-700 whitespace-nowrap"
            >
              Flex / Range ID
            </label>
            <input
              id="flex-range-input"
              type="text"
              list="flex-range-suggestions"
              inputMode="numeric"
              value={ridInput}
              onChange={(e) => setRidInput(e.target.value.replace(/\D/g, ''))}
              placeholder="26134"
              className="w-28 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 font-mono text-xs font-semibold text-slate-900 tabular-nums focus-visible:border-teal-600 focus-visible:bg-white focus-visible:outline-none sm:w-40 sm:px-3 sm:py-1.5"
            />
            <datalist id="flex-range-suggestions">
              <option value="26134" />
              <option value="88017" />
              <option value="1415" />
              <option value="9198" />
              {liveRanges.map((item) => (
                <option key={item.range} value={item.range} />
              ))}
            </datalist>
            <span className="hidden text-xs text-slate-500 sm:inline">
              Enter your Flex ID and click Get Number above any screen.
            </span>
          </div>

          <span className="text-xs font-medium text-slate-500">
            {demoMode ? 'Demo Mode' : 'Live API'}
          </span>
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1600px] p-2 sm:p-4">
        <div className={`grid gap-2.5 sm:gap-3.5 ${getGridClassForCount(screenCount)}`}>
          {visiblePaneNumbers.map((paneNumber) => {
            const pane = panes[paneNumber] || createInitialPaneState();
            const heightClass =
              screenCount === 1
                ? 'h-[calc(100vh-145px)] min-h-[420px]'
                : screenCount === 2
                  ? 'h-[260px] sm:h-[300px] lg:h-[calc(100vh-140px)] lg:min-h-[440px]'
                  : screenCount === 3
                    ? 'h-[210px] lg:h-[calc(100vh-140px)] lg:min-h-[440px]'
                    : 'h-[250px] sm:h-[calc((100vh-148px)/2)] sm:min-h-[300px]';

            return (
              <div
                key={`${paneNumber}-${configUpdatedAt}`}
                data-testid={`mobile-screen-${paneNumber}`}
                className={`flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs sm:rounded-2xl ${heightClass}`}
              >
                <div className="flex items-center justify-between gap-1.5 border-b border-slate-200 bg-slate-900 px-2 py-1.5 text-white sm:gap-2 sm:px-3 sm:py-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto sm:gap-2">
                    <button
                      type="button"
                      onClick={() => handleGetNumberForPane(paneNumber)}
                      disabled={pane.fetching}
                      aria-label={`Get Number for Screen ${paneNumber}`}
                      className="inline-flex items-center gap-1 rounded-md bg-teal-500 px-2 py-1 text-[11px] font-semibold text-slate-950 transition-colors hover:bg-teal-400 disabled:opacity-60 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 sm:gap-1.5 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
                    >
                      <PhoneCall className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                      <span>{pane.fetching ? 'Wait...' : 'Get Number'}</span>
                    </button>

                    {pane.allocated && (
                      <>
                        <span className="font-mono text-[11px] font-semibold text-teal-200 tabular-nums shrink-0 sm:text-xs">
                          {pane.allocated.nationalNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyPaneNumber(paneNumber)}
                          aria-label={`Copy number for Screen ${paneNumber}`}
                          className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0 sm:px-2 sm:text-xs"
                        >
                          {pane.copied ? (
                            <Check className="h-3 w-3 text-teal-400" aria-hidden="true" />
                          ) : (
                            <Copy className="h-3 w-3" aria-hidden="true" />
                          )}
                          <span className="hidden sm:inline">{pane.copied ? 'Copied' : 'Copy'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCheckOtpForPane(paneNumber)}
                          disabled={pane.checkingOtp}
                          aria-label={`Get OTP for Screen ${paneNumber}`}
                          className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-60 whitespace-nowrap shrink-0 sm:px-2 sm:text-xs"
                        >
                          <KeyRound className="h-3 w-3" aria-hidden="true" />
                          <span>{pane.checkingOtp ? '...' : 'OTP'}</span>
                        </button>
                      </>
                    )}

                    {pane.otp && (
                      <span className="font-mono text-[11px] font-bold text-amber-300 tabular-nums shrink-0 sm:text-xs">
                        {pane.otp.otp ? `OTP: ${pane.otp.otp}` : 'Waiting'}
                      </span>
                    )}

                    {pane.error && (
                      <span role="alert" className="truncate text-[11px] font-medium text-rose-300 sm:text-xs">
                        {pane.error}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleClearScreen(paneNumber)}
                    aria-label={`Clear Screen ${paneNumber} data`}
                    title={`Clear Screen ${paneNumber}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 transition-colors hover:border-rose-500/50 hover:bg-rose-950/70 hover:text-rose-300 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                <iframe
                  ref={(el) => {
                    iframeRefs.current[paneNumber] = el;
                  }}
                  key={`${paneNumber}-${pane.version}-${browserUrl}`}
                  title={`Mobile Screen ${paneNumber}`}
                  src={pane.resetting ? 'about:blank' : buildPaneSrc(paneNumber, pane.version)}
                  referrerPolicy="no-referrer"
                  className="h-full w-full flex-1 border-0 bg-white"
                />
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

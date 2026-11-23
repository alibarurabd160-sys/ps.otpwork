import { useEffect, useState } from 'react';
import { QuadScreenWorkspace } from './components/QuadScreenWorkspace';
import { AdminPanel } from './components/AdminPanel';
import type { WorkspaceConfig } from '../server/store';

type ActiveTab = 'workspace' | 'admin';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('workspace');
  const [screenCount, setScreenCount] = useState<number>(4);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [config, setConfig] = useState<WorkspaceConfig & { hasApiKey: boolean }>({
    browserUrl: 'https://example.com',
    baseUrl: 'https://min-bot-emf8.onrender.com/api/v1',
    defaultRid: '26134',
    demoMode: true,
    updatedAt: new Date().toISOString(),
    hasApiKey: false,
  });

  useEffect(() => {
    const events = new EventSource('/api/config/stream');
    events.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as {
          type?: string;
          config?: WorkspaceConfig & { hasApiKey: boolean };
        };
        if (parsed.config) {
          setConfig(parsed.config);
        }
      } catch {
        // Ignore malformed SSE ping
      }
    };
    return () => {
      events.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-2 px-3 py-2.5 sm:gap-6 sm:px-6 sm:py-3">
          <span className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0 sm:text-lg">
            PS Number
          </span>

          <div className="flex items-center gap-2 sm:gap-3">
            <label
              htmlFor="screen-count-select"
              className="hidden text-xs font-medium text-slate-300 whitespace-nowrap sm:inline"
            >
              Screens
            </label>
            <select
              id="screen-count-select"
              aria-label="Screens"
              value={screenCount}
              onChange={(e) => {
                setScreenCount(Number(e.target.value));
                setActiveTab('workspace');
              }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 pr-6 text-xs font-semibold text-white focus-visible:border-teal-400 focus-visible:outline-none sm:px-3 sm:pr-7"
            >
              <option value={1}>1 Screen</option>
              <option value={2}>2 Screens</option>
              <option value={3}>3 Screens</option>
              <option value={4}>4 Screens</option>
            </select>
          </div>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'workspace' ? 'admin' : 'workspace')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 sm:px-4 sm:py-2 ${
                activeTab === 'admin'
                  ? 'bg-teal-500 text-slate-950 hover:bg-teal-400'
                  : 'border border-slate-700 bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {activeTab === 'workspace' ? 'Admin Panel' : 'Back to Screens'}
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'workspace' ? (
        <QuadScreenWorkspace
          screenCount={screenCount}
          browserUrl={config.browserUrl}
          defaultRid={config.defaultRid}
          demoMode={config.demoMode}
          configUpdatedAt={config.updatedAt}
        />
      ) : (
        <AdminPanel
          adminToken={adminToken}
          onAdminTokenChange={setAdminToken}
          config={config}
          onConfigSaved={(updated) => setConfig(updated)}
        />
      )}
    </div>
  );
}

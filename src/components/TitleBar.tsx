import { useStore } from '../store';
import { getApi } from '../api';
import { TabShell } from './tabs/TabShell';

export function TitleBar() {
  const selectedRoot = useStore((s) => s.selectedRoot);

  return (
    <div className="titlebar">
      <span className="titlebar-logo">roam</span>
      {!selectedRoot && <TabShell />}
      <div className="window-controls">
        <button
          className="win-btn"
          onClick={() => getApi().win.minimize()}
          aria-label="Minimizar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          className="win-btn"
          onClick={() => getApi().win.toggleMaximize()}
          aria-label="Maximizar"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="5" width="14" height="14" rx="2" />
          </svg>
        </button>
        <button
          className="win-btn close"
          onClick={() => getApi().win.close()}
          aria-label="Fechar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

import { Cloud, CloudOff, LogOut, Plus, RefreshCw } from 'lucide-react';
import { navigate, useRoute } from './lib/router';
import { signOut, syncEnabled, syncNow, useSync } from './lib/sync';
import LoginPage from './pages/LoginPage';
import InvoicesPage from './pages/InvoicesPage';
import EditorPage from './pages/EditorPage';
import SettingsPage from './pages/SettingsPage';

const BASE = import.meta.env.BASE_URL;

function NavLink({ to, active, children }) {
  return (
    <a
      href={`#${to}`}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => { e.preventDefault(); navigate(to); }}
    >
      {children}
    </a>
  );
}

const SYNC_LABEL = {
  idle: 'Not synced',
  syncing: 'Syncing…',
  synced: 'Saved to cloud',
  offline: 'Offline · saved on this device',
  error: 'Sync problem',
};

function SyncStatus({ sync }) {
  const Icon = sync.status === 'syncing' ? RefreshCw : sync.status === 'synced' ? Cloud : CloudOff;
  return (
    <button
      type="button"
      className={`sync sync-${sync.status}`}
      onClick={() => syncNow()}
      title={sync.error || 'Sync now'}
      aria-label={`${SYNC_LABEL[sync.status]}. Sync now`}
    >
      <Icon aria-hidden />
      <span className="btn-label">{SYNC_LABEL[sync.status]}</span>
    </button>
  );
}

export default function App() {
  const route = useRoute();
  const sync = useSync();

  if (syncEnabled) {
    if (!sync.ready) return null;
    if (!sync.session) return <LoginPage />;
    if (!sync.loaded) return <div className="login"><p className="muted">Loading your invoices…</p></div>;
  }

  const onInvoices = route.name === 'invoices' || route.name === 'invoice' || route.name === 'new';

  return (
    <>
      <div className="app-shell">
        <header className="topbar">
          <a className="topbar-brand" href="#/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
            <img src={`${BASE}brand/cybervex-logo-black.png`} alt="Cybervex Digital" />
          </a>
          <nav aria-label="Main">
            <NavLink to="/" active={onInvoices}>Invoices</NavLink>
            <NavLink to="/settings" active={route.name === 'settings'}>Settings</NavLink>
          </nav>
          <span className="spacer" />
          {syncEnabled && (
            <>
              <SyncStatus sync={sync} />
              <button type="button" className="icon-btn" onClick={signOut} title={`Sign out (${sync.session.user.email})`} aria-label="Sign out">
                <LogOut />
              </button>
            </>
          )}
          {route.name !== 'new' && (
            <button type="button" className="btn btn-primary" onClick={() => navigate('/new')} aria-label="New invoice">
              <Plus aria-hidden />
              <span className="btn-label">New invoice</span>
            </button>
          )}
        </header>
        {syncEnabled && sync.status === 'error' && (
          <div className="sync-banner" role="alert">
            {sync.error} <button type="button" className="btn btn-sm" onClick={() => syncNow()}>Try again</button>
          </div>
        )}
        <main>
          {route.name === 'invoices' && <InvoicesPage />}
          {route.name === 'new' && <EditorPage key="new" />}
          {route.name === 'invoice' && <EditorPage key={route.id} id={route.id} />}
          {route.name === 'settings' && <SettingsPage />}
        </main>
      </div>
    </>
  );
}

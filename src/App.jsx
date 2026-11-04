import { Plus } from 'lucide-react';
import { navigate, useRoute } from './lib/router';
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

export default function App() {
  const route = useRoute();
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
          {route.name !== 'new' && (
            <button type="button" className="btn btn-primary" onClick={() => navigate('/new')} aria-label="New invoice">
              <Plus aria-hidden />
              <span className="btn-label">New invoice</span>
            </button>
          )}
        </header>
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

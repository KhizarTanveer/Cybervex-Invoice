import { useEffect, useState } from 'react';

// Minimal hash router: #/  ·  #/new  ·  #/invoice/:id  ·  #/settings
// A page with unsaved changes can register a guard that confirms navigation.

let guard = null;
export const setNavigationGuard = (fn) => { guard = fn; };

export function parseRoute(hash) {
  const path = hash.replace(/^#/, '') || '/';
  const m = /^\/invoice\/([\w-]+)$/.exec(path);
  if (m) return { name: 'invoice', id: m[1] };
  if (path === '/new') return { name: 'new' };
  if (path === '/settings') return { name: 'settings' };
  return { name: 'invoices' };
}

export function navigate(path, { force = false } = {}) {
  if (!force && guard && !guard()) return false;
  guard = null; // confirmed (or forced): don't ask again on the hashchange

  window.location.hash = path;
  return true;
}

export function useRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    let last = window.location.hash;
    const onChange = () => {
      const next = window.location.hash;
      if (next === last) return;
      // Back/forward buttons: honour the unsaved-changes guard.
      if (guard && !guard()) {
        window.history.replaceState(null, '', last);
        return;
      }
      last = next;
      setHash(next);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return parseRoute(hash);
}

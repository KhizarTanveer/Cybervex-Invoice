import { useSyncExternalStore } from 'react';
import { bumpCounters } from './numbering';
import { supabase } from './supabase';
import { KEYS, exportBackup, getState, replaceAll, setChangeHook } from './storage';

// Cloud sync. The browser copy stays the working copy, so the app is instant and
// keeps working offline. Every change is queued, uploaded right away when
// possible, and retried later if not. On sign-in and when the tab regains focus,
// the database copy is downloaded; queued local changes win over it.

const QUEUE_KEY = 'cybervex-invoice:v1:sync-queue';
const USER_KEY = 'cybervex-invoice:v1:sync-user';
// A full backup taken just before the first upload from this browser. Never removed automatically.
export const PRE_SYNC_KEY = 'cybervex-invoice:v1:pre-sync-backup';
const FOCUS_REFRESH_MS = 30_000;

export const syncEnabled = !!supabase;

// ---- auth + status store ---------------------------------------------------
let auth = { ready: !syncEnabled, session: null, status: 'idle', error: '', loaded: false };
const listeners = new Set();
const setAuth = (patch) => { auth = { ...auth, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const useSync = () => useSyncExternalStore(subscribe, () => auth);

// ---- queue -----------------------------------------------------------------
const emptyQueue = () => ({ invoices: [], deleted: [], settings: false });
function readQueue() {
  try { return { ...emptyQueue(), ...JSON.parse(localStorage.getItem(QUEUE_KEY)) }; } catch { return emptyQueue(); }
}
function writeQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* storage full: retried on next change */ }
}
export const pendingCount = () => {
  const q = readQueue();
  return q.invoices.length + q.deleted.length + (q.settings ? 1 : 0);
};

function enqueue({ invoices = [], deleted = [], settings = false }) {
  const q = readQueue();
  const del = new Set(deleted);
  q.invoices = [...new Set([...q.invoices.filter((id) => !del.has(id)), ...invoices])];
  q.deleted = [...new Set([...q.deleted, ...deleted])];
  q.settings = q.settings || settings;
  writeQueue(q);
}

// ---- upload / download -----------------------------------------------------
let running = null;

async function flush() {
  const q = readQueue();
  const { invoices, settings } = getState();
  const byId = new Map(invoices.map((i) => [i.id, i]));

  const rows = q.invoices
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((inv) => ({ id: inv.id, number: inv.number, data: inv, updated_at: inv.updatedAt || new Date().toISOString() }));
  if (rows.length) {
    const { error } = await supabase.from('cybervex_invoices').upsert(rows);
    if (error) throw error;
  }
  if (q.deleted.length) {
    const { error } = await supabase.from('cybervex_invoices').delete().in('id', q.deleted);
    if (error) throw error;
  }
  if (q.settings) {
    const { error } = await supabase.from('cybervex_settings')
      .upsert({ user_id: auth.session.user.id, data: settings, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  // Clear only what was sent. An invoice or settings edited again while
  // uploading has a different version now, so it stays queued.
  const now = readQueue();
  const after = getState();
  const current = new Map(after.invoices.map((i) => [i.id, i.updatedAt]));
  const sent = new Map(rows.map((r) => [r.id, r.data.updatedAt]));
  const gone = new Set(q.deleted);
  writeQueue({
    invoices: now.invoices.filter((id) => !(q.invoices.includes(id) && (!sent.has(id) || sent.get(id) === current.get(id)))),
    deleted: now.deleted.filter((id) => !gone.has(id)),
    settings: now.settings && (!q.settings || after.settings !== settings),
  });
}

async function pull() {
  const [inv, set] = await Promise.all([
    supabase.from('cybervex_invoices').select('data').order('updated_at', { ascending: false }),
    supabase.from('cybervex_settings').select('data').maybeSingle(),
  ]);
  if (inv.error) throw inv.error;
  if (set.error) throw set.error;

  // Changes made while this download ran are still queued: keep the local versions.
  const q = readQueue();
  const local = getState();
  const keep = new Set(q.invoices);
  const deleted = new Set(q.deleted);
  const remote = inv.data.map((r) => r.data).filter((i) => !keep.has(i.id) && !deleted.has(i.id));
  const invoices = [...local.invoices.filter((i) => keep.has(i.id)), ...remote];

  const base = q.settings || !set.data ? local.settings : set.data.data;
  let counters = { ...local.settings.counters, ...base.counters };
  for (const i of invoices) counters = bumpCounters(counters, i.number);
  replaceAll({ invoices, settings: { ...base, counters } });
}

/** Upload queued changes, then download the latest. Safe to call often. */
export function syncNow() {
  if (!syncEnabled || !auth.session) return Promise.resolve();
  if (running) return running;
  setAuth({ status: 'syncing', error: '' });
  running = (async () => {
    try {
      await flush();
      await pull();
      setAuth({ status: 'synced', loaded: true, lastSync: Date.now() });
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setAuth({ status: offline ? 'offline' : 'error', error: friendly(e), loaded: true });
    } finally {
      running = null;
    }
  })();
  return running;
}

function friendly(e) {
  const msg = e?.message ?? String(e);
  if (/cybervex_invoices_user_number_key|duplicate key/i.test(msg)) {
    return 'An invoice number is already used by another invoice in your account. Change it and save again.';
  }
  if (/fetch|network/i.test(msg)) return 'Could not reach the server. Changes are kept on this device.';
  return msg;
}

// ---- session handling --------------------------------------------------------
function onSignedIn(session) {
  const uid = session.user.id;
  const last = localStorage.getItem(USER_KEY);
  if (!last) {
    // First sign-in on this browser: keep a copy of what is here, then upload it all.
    const { invoices } = getState();
    try {
      if (!localStorage.getItem(PRE_SYNC_KEY) && invoices.length) {
        localStorage.setItem(PRE_SYNC_KEY, exportBackup());
      }
    } catch { /* storage full: the upload below still keeps the data */ }
    enqueue({ invoices: invoices.map((i) => i.id), settings: true });
  } else if (last !== uid) {
    // A different account: never mix its data with the previous one.
    writeQueue(emptyQueue());
    replaceAll({ invoices: [], settings: {} });
  }
  localStorage.setItem(USER_KEY, uid);
  setAuth({ session, ready: true });
  syncNow();
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
}

/** Signs out and removes this account's data from the browser. */
export async function signOut() {
  if (pendingCount() > 0) {
    await syncNow();
    if (pendingCount() > 0 && !window.confirm('Some changes have not reached the server yet and will be lost. Sign out anyway?')) return;
  }
  await supabase.auth.signOut();
  setAuth({ session: null, status: 'idle', loaded: false });
  writeQueue(emptyQueue());
  localStorage.removeItem(USER_KEY);
  replaceAll({ invoices: [], settings: {} });
  try { localStorage.removeItem(KEYS.invoices); localStorage.removeItem(KEYS.settings); } catch { /* ignore */ }
}

if (syncEnabled) {
  setChangeHook((change) => {
    enqueue(change);
    syncNow();
  });

  supabase.auth.getSession().then(({ data }) => {
    if (data.session) onSignedIn(data.session);
    else setAuth({ ready: true });
  });
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session && auth.session?.user.id !== session.user.id) onSignedIn(session);
    else if (event === 'SIGNED_OUT') setAuth({ session: null, status: 'idle', loaded: false });
    else if (session) setAuth({ session });
  });

  window.addEventListener('focus', () => {
    if (auth.session && Date.now() - (auth.lastSync ?? 0) > FOCUS_REFRESH_MS) syncNow();
  });
  window.addEventListener('online', () => syncNow());
}

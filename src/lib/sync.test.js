import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fake Supabase holding one account's data, recording every write.
const cloud = { invoices: [], settings: null, writes: [] };
const session = { user: { id: 'user-1' } };

function table(name) {
  const rows = () => (name === 'cybervex_invoices' ? cloud.invoices : cloud.settings ? [cloud.settings] : []);
  return {
    select: () => ({
      order: async () => ({ data: rows(), error: null }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    }),
    upsert: async (value) => {
      cloud.writes.push({ table: name, value });
      if (name === 'cybervex_settings') cloud.settings = { user_id: value.user_id, data: value.data };
      else for (const r of value) cloud.invoices = [...cloud.invoices.filter((i) => i.data.id !== r.id), { data: r.data }];
      return { error: null };
    },
    delete: () => ({ in: async () => ({ error: null }) }),
  };
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (name) => table(name),
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => {},
    },
  },
}));

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

async function signInOnFreshBrowser() {
  vi.resetModules();
  globalThis.localStorage = memoryStorage();
  globalThis.window = { addEventListener: () => {} };
  const sync = await import('./sync');
  const storage = await import('./storage');
  await new Promise((r) => setTimeout(r, 0)); // getSession → onSignedIn → syncNow
  await sync.syncNow();
  await new Promise((r) => setTimeout(r, 0));
  return { sync, storage };
}

describe('signing in on another laptop', () => {
  beforeEach(() => {
    cloud.invoices = [];
    cloud.settings = null;
    cloud.writes = [];
  });

  it('keeps the settings saved in the account and never overwrites them', async () => {
    cloud.settings = {
      user_id: 'user-1',
      data: { business: { brandName: 'Cybervex Digital', legalName: 'Cybervex Digital LLC', email: 'info@example.test' }, invoicePrefix: 'CVD', counters: {} },
    };
    cloud.invoices = [{ data: { id: 'inv-1', number: 'CVD-2026-0007', currency: 'USD', services: [], payments: [] } }];

    const { storage } = await signInOnFreshBrowser();

    expect(cloud.writes.filter((w) => w.table === 'cybervex_settings')).toEqual([]);
    expect(cloud.settings.data.business.legalName).toBe('Cybervex Digital LLC');
    const local = storage.getState();
    expect(local.settings.business.legalName).toBe('Cybervex Digital LLC');
    expect(local.settings.business.email).toBe('info@example.test');
    expect(local.invoices.map((i) => i.id)).toEqual(['inv-1']);
  });

  it('saving an invoice never puts back older settings; only the number counter moves on', async () => {
    cloud.settings = { user_id: 'user-1', data: { business: { legalName: 'Old Name' }, counters: { 'CVD-2026': 7 } } };
    const { sync, storage } = await signInOnFreshBrowser();

    // Meanwhile the settings are changed and saved on another laptop.
    cloud.settings = { user_id: 'user-1', data: { business: { legalName: 'New Name' }, counters: { 'CVD-2026': 7 } } };

    // This laptop, still showing the old settings, saves an invoice.
    storage.saveInvoice({ id: 'inv-2', number: 'CVD-2026-0008', currency: 'USD', services: [], payments: [], to: {}, from: {} });
    await sync.syncNow();
    await new Promise((r) => setTimeout(r, 0));

    expect(cloud.settings.data.business.legalName).toBe('New Name');
    expect(cloud.settings.data.counters['CVD-2026']).toBe(8);
    expect(storage.getState().settings.business.legalName).toBe('New Name');
  });

  it('uploads settings when they are changed and saved', async () => {
    cloud.settings = { user_id: 'user-1', data: { business: { legalName: 'Old Name' }, counters: { 'CVD-2026': 3 } } };
    const { sync, storage } = await signInOnFreshBrowser();

    const current = storage.getState().settings;
    storage.saveSettings({ ...current, business: { ...current.business, legalName: 'Saved On Purpose' } });
    await sync.syncNow();

    expect(cloud.settings.data.business.legalName).toBe('Saved On Purpose');
    expect(cloud.settings.data.counters['CVD-2026']).toBe(3);
  });

  it('uploads this browser’s settings when the account has none yet', async () => {
    await signInOnFreshBrowser();
    expect(cloud.writes.filter((w) => w.table === 'cybervex_settings')).toHaveLength(1);
    expect(cloud.settings).not.toBeNull();
  });
});

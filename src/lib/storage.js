import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, normalizeInvoice } from './defaults';
import { bumpCounters, isDuplicateNumber, normalizeNumber } from './numbering';

// Local-first persistence. Data stays in this browser's localStorage under keys
// that are separate from any other app on the same origin. Nothing is sent anywhere.
const KEYS = {
  invoices: 'cybervex-invoice:v1:invoices',
  settings: 'cybervex-invoice:v1:settings',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    throw new Error(
      e?.name === 'QuotaExceededError'
        ? 'Browser storage is full. Export a backup and remove old invoices.'
        : 'Could not save to browser storage.',
    );
  }
}

function loadSettings() {
  const stored = read(KEYS.settings, {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    business: { ...DEFAULT_SETTINGS.business, ...stored.business },
    counters: { ...stored.counters },
  };
}

const loadInvoices = () => read(KEYS.invoices, []).map(normalizeInvoice);

let state = { invoices: loadInvoices(), settings: loadSettings() };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

function setState(next) {
  state = next;
  emit();
}

// Keep several open tabs in sync.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEYS.invoices || e.key === KEYS.settings) {
      setState({ invoices: loadInvoices(), settings: loadSettings() });
    }
  });
}

function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const getState = () => state;
export const useStore = () => useSyncExternalStore(subscribe, getState);

export function saveInvoice(invoice) {
  const { invoices, settings } = state;
  if (!normalizeNumber(invoice.number)) throw new Error('Invoice number is required.');
  if (isDuplicateNumber(invoice.number, invoices, invoice.id)) {
    throw new Error(`Invoice number ${invoice.number} is already used by another invoice.`);
  }
  const saved = { ...invoice, number: invoice.number.trim(), updatedAt: new Date().toISOString() };
  const exists = invoices.some((i) => i.id === saved.id);
  const nextInvoices = exists ? invoices.map((i) => (i.id === saved.id ? saved : i)) : [saved, ...invoices];
  const nextSettings = { ...settings, counters: bumpCounters(settings.counters, saved.number) };
  write(KEYS.invoices, nextInvoices);
  write(KEYS.settings, nextSettings);
  setState({ invoices: nextInvoices, settings: nextSettings });
  return saved;
}

export function deleteInvoice(id) {
  const nextInvoices = state.invoices.filter((i) => i.id !== id);
  write(KEYS.invoices, nextInvoices);
  setState({ ...state, invoices: nextInvoices });
}

export function saveSettings(settings) {
  write(KEYS.settings, settings);
  setState({ ...state, settings });
}

export function exportBackup() {
  return JSON.stringify(
    { app: 'cybervex-invoice', version: 1, exportedAt: new Date().toISOString(), ...state },
    null,
    2,
  );
}

/** Merge a backup: invoices are added or replaced by id; numbers stay unique. */
export function importBackup(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (data?.app !== 'cybervex-invoice' || !Array.isArray(data.invoices)) {
    throw new Error('That file is not a Cybervex invoice backup.');
  }
  const byId = new Map(state.invoices.map((i) => [i.id, i]));
  let skipped = 0;
  for (const inv of data.invoices) {
    if (!inv?.id || !inv.number || !(Array.isArray(inv.items) || typeof inv.budget === 'string')) { skipped += 1; continue; }
    const others = [...byId.values()].filter((i) => i.id !== inv.id);
    if (isDuplicateNumber(inv.number, others)) { skipped += 1; continue; }
    byId.set(inv.id, normalizeInvoice(inv));
  }
  const invoices = [...byId.values()];
  let counters = { ...state.settings.counters, ...data.settings?.counters };
  for (const inv of invoices) counters = bumpCounters(counters, inv.number);
  const settings = data.settings
    ? { ...loadSettings(), ...data.settings, business: { ...DEFAULT_SETTINGS.business, ...data.settings.business }, counters }
    : { ...state.settings, counters };
  write(KEYS.invoices, invoices);
  write(KEYS.settings, settings);
  setState({ invoices, settings });
  return { imported: data.invoices.length - skipped, skipped };
}

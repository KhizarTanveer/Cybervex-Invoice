import { DEFAULT_QUOTE_VALIDITY, addDays, daysBetween, dueDateForTerms, formatDate, isValidISO, todayISO } from './dates';
import { currencyDigits, divRound, minorToInput, parseScaled } from './money';

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

// Only details that are publicly part of the brand are pre-filled. Legal name,
// address, contact, tax and bank details are left blank on purpose and render as
// clearly marked [placeholders] until the business owner enters verified values.
export const DEFAULT_SETTINGS = {
  business: {
    brandName: 'Cybervex Digital',
    legalName: '',
    address: '',
    email: '',
    phone: '',
    website: 'cybervexdigital.com',
    taxLabel: 'Tax ID',
    taxId: '',
  },
  tagline: 'Driven by Passion. United by Growth.',
  invoicePrefix: 'CVD',
  defaultCurrency: 'USD',
  defaultTerms: 'net15',
  defaultNotes: '',
  paymentDetails: '',
  paymentInstructions: '',
  defaultTaxes: [],
  defaultAdvance: '',
  logoVariant: 'black',
  counters: {},
};

export const emptyService = () => ({ id: uid(), name: '' });

/** How a service is billed; shown beside its name on the document. Unset shows nothing. */
export const BILLING = { once: 'One-time', monthly: 'Monthly' };

/**
 * Upgrade invoices saved by earlier versions:
 * - "Project" became a list of services;
 * - line items became one overall budget (their exact total, so saved totals don't change).
 */
export function normalizeInvoice(inv) {
  if (!inv || (Array.isArray(inv.services) && typeof inv.budget === 'string')) return inv;
  let out = { ...inv };
  if (!Array.isArray(out.services)) {
    const { project, ...rest } = out;
    out = {
      ...rest,
      services: project?.name?.trim() ? [{ id: uid(), name: project.name.trim() }] : [],
      reference: project?.reference ?? '',
    };
  }
  if (typeof out.budget !== 'string') {
    const { items = [], ...rest } = out;
    const digits = currencyDigits(out.currency || 'USD');
    let sum = 0n;
    for (const it of items) {
      const qty = parseScaled(it.quantity || '1', 4);
      const price = parseScaled(it.unitPrice, digits);
      if (qty !== null && price !== null) sum += divRound(qty * price, 10000n);
    }
    const services = rest.services.some((sv) => sv.name?.trim())
      ? rest.services
      : items.filter((it) => it.description?.trim()).map((it) => ({ id: uid(), name: it.description.trim() }));
    const units = divRound(sum, 10n ** BigInt(digits));
    out = { ...rest, services, budget: units > 0n ? minorToInput(units) : '' };
  }
  return out;
}

// When the advance is expected. Kept as keys so the wording can change later.
export const ADVANCE_WHEN = [
  { value: 'receipt', label: 'Due on receipt' },
  { value: 'start', label: 'Due before work begins' },
  { value: 'signing', label: 'Due on contract signing' },
  { value: 'date', label: 'On a specific date' },
];
/** The advance's own due date, when one was picked. */
export const advanceDate = (adv) => (adv?.when === 'date' && isValidISO(adv.date) ? adv.date : '');
export function advanceWhenLabel(adv) {
  const date = advanceDate(adv);
  if (date) return `Due by ${formatDate(date)}`;
  const w = ADVANCE_WHEN.find((x) => x.value === adv?.when && x.value !== 'date') ?? ADVANCE_WHEN[0];
  return w.label;
}

export const newAdvance = (percent = '') => ({ enabled: !!String(percent ?? '').trim(), percent: String(percent ?? ''), when: 'receipt', date: '' });

export const emptyClient = () => ({
  company: '',
  contact: '',
  address: '',
  email: '',
  taxLabel: 'Tax ID',
  taxId: '',
});

export function newInvoice(settings, number) {
  const issueDate = todayISO();
  const terms = settings.defaultTerms || 'net15';
  return {
    id: uid(),
    number,
    state: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: null,
    issuedAt: null,
    issueDate,
    terms,
    customTerms: '',
    dueDate: dueDateForTerms(issueDate, terms) ?? addDays(issueDate, 15),
    currency: settings.defaultCurrency || 'USD',
    from: { ...settings.business },
    to: emptyClient(),
    services: [emptyService()],
    reference: '',
    budget: '',
    discount: { type: 'percent', value: '' },
    taxes: (settings.defaultTaxes ?? []).map((t) => ({ ...t, id: uid() })),
    charges: [],
    advance: newAdvance(settings.defaultAdvance),
    payments: [],
    notes: settings.defaultNotes ?? '',
    paymentDetails: settings.paymentDetails ?? '',
    paymentInstructions: settings.paymentInstructions ?? '',
  };
}

/** A fresh draft copied from an existing invoice: new id, number and dates, no payments. */
export function duplicateInvoice(original, number) {
  const source = normalizeInvoice(original);
  const issueDate = todayISO();
  // A copied quotation keeps its validity period; an invoice re-derives from its terms.
  const span = daysBetween(source.issueDate, source.dueDate);
  const due = source.kind === 'quotation'
    ? addDays(issueDate, span !== null && span >= 0 ? span : DEFAULT_QUOTE_VALIDITY)
    : dueDateForTerms(issueDate, source.terms);
  return {
    ...structuredClone(source),
    id: uid(),
    number,
    state: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: null,
    issuedAt: null,
    voidedAt: null,
    issueDate,
    dueDate: due ?? issueDate,
    services: (source.services ?? []).map((sv) => ({ ...sv, id: uid() })),
    taxes: (source.taxes ?? []).map((t) => ({ ...t, id: uid() })),
    charges: (source.charges ?? []).map((c) => ({ ...c, id: uid() })),
    payments: [],
  };
}

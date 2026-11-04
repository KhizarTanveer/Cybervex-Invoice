import { computeTotals } from './calc';
import { formatDate, termsLabel } from './dates';
import { formatDecimal, formatMoney } from './money';
import { STATUS, deriveStatus } from './status';

// One presentation model shared by the on-screen preview, print output and the
// vector PDF, so all three always show identical content.

const val = (text) => ({ text });
const ph = (value, label) =>
  value?.trim() ? { text: value.trim() } : { text: `[${label}]`, placeholder: true };
const lines = (value, label) =>
  value?.trim() ? value.trim().split(/\r?\n/).filter(Boolean).map(val) : [ph('', label)];
const optional = (value) => (value?.trim() ? [val(value.trim())] : []);

export function buildView(invoice, settings, today) {
  const totals = computeTotals(invoice);
  const status = deriveStatus(invoice, totals, today);
  const money = (m) => formatMoney(m, invoice.currency);
  const { from = {}, to = {} } = invoice;

  const fromLines = [
    { ...ph(from.legalName, 'Legal business name'), strong: true },
    ...lines(from.address, 'Business address'),
    ph(from.email, 'Business email'),
    ...optional(from.phone),
    ...optional(from.website),
    ...(from.taxId?.trim() ? [val(`${from.taxLabel?.trim() || 'Tax ID'}: ${from.taxId.trim()}`)] : []),
  ];

  const toLines = [
    { ...ph(to.company, 'Client or company name'), strong: true },
    ...optional(to.contact && `Attn: ${to.contact.trim()}`),
    ...lines(to.address, 'Billing address'),
    ...optional(to.email),
    ...(to.taxId?.trim() ? [val(`${to.taxLabel?.trim() || 'Tax ID'}: ${to.taxId.trim()}`)] : []),
  ];

  const meta = [
    { label: 'Issue date', ...ph(formatDate(invoice.issueDate), 'Date') },
    { label: 'Due date', ...ph(formatDate(invoice.dueDate), 'Date') },
    { label: 'Payment terms', ...ph(termsLabel(invoice), 'Terms') },
    { label: 'Currency', text: invoice.currency },
  ];

  const named = (invoice.services ?? []).filter((sv) => sv.name?.trim());
  const services = named.length
    ? named.map((sv) => ({ id: sv.id, text: sv.name.trim() }))
    : [{ id: 'ph', ...ph('', 'Service') }];
  const reference = invoice.reference?.trim()
    ? [{ label: 'Reference / PO number', text: invoice.reference.trim() }]
    : [];

  const summary = [{ label: 'Budget', value: money(totals.subtotal) }];
  if (totals.discount > 0) {
    const pct = invoice.discount.type === 'percent' ? ` (${formatDecimal(invoice.discount.value)}%)` : '';
    summary.push({ label: `Discount${pct}`, value: `−${money(totals.discount)}` });
  }
  for (const t of invoice.taxes ?? []) {
    if (!String(t.rate ?? '').trim()) continue;
    summary.push({ label: `${t.label?.trim() || 'Tax'} (${formatDecimal(t.rate)}%)`, value: money(totals.taxes[t.id] ?? 0) });
  }
  for (const c of invoice.charges ?? []) {
    if (!(totals.charges[c.id] > 0)) continue;
    summary.push({ label: c.label?.trim() || 'Additional charge', value: money(totals.charges[c.id]) });
  }
  const after = [];
  if (totals.paid > 0) after.push({ label: 'Amount paid', value: `−${money(totals.paid)}` });

  const terms = termsLabel(invoice);
  const dueText = formatDate(invoice.dueDate);
  const termsLine = terms && dueText
    ? `${terms}. Payment due by ${dueText}.`
    : terms || '';

  return {
    number: invoice.number,
    status,
    statusLabel: STATUS[status].label,
    // Drafts and unpaid invoices carry no label on the document itself.
    showStatus: status !== 'unpaid' && status !== 'draft',
    brandName: from.brandName || 'Cybervex Digital',
    logoVariant: settings.logoVariant === 'silver' ? 'silver' : 'black',
    fromLines,
    toLines,
    meta,
    services,
    reference,
    summary,
    total: { label: 'Total', value: money(totals.total) },
    after,
    due: { label: totals.paid > 0 ? 'Balance due' : 'Total due', value: money(Math.max(totals.balance, 0)) },
    paymentDetails: lines(invoice.paymentDetails, 'Add verified bank or payment details'),
    paymentInstructions: invoice.paymentInstructions?.trim() ?? '',
    notes: invoice.notes?.trim() ?? '',
    termsLine,
    tagline: settings.tagline || '',
    website: from.website?.trim() || 'cybervexdigital.com',
    totals,
  };
}


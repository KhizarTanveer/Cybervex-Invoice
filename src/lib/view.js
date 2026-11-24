import { computeTotals } from './calc';
import { BILLING, advanceWhenLabel } from './defaults';
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

const pctText = (n) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n)}%`;

function partyLines(from = {}, to = {}) {
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
  return { fromLines, toLines };
}

/**
 * `balance: true` builds the balance invoice: the same document, with what has
 * been received deducted and only the pending amount due.
 */
export function buildView(invoice, settings, today, { balance = false } = {}) {
  const totals = computeTotals(invoice);
  const status = deriveStatus(invoice, totals, today);
  const money = (m) => formatMoney(m, invoice.currency);
  const { from = {}, to = {} } = invoice;
  const { fromLines, toLines } = partyLines(from, to);

  // On a quotation the "due date" is how long the offer stands, not a payment deadline.
  const quote = invoice.kind === 'quotation' && !balance;

  const meta = [
    { label: 'Issue date', ...ph(formatDate(invoice.issueDate), 'Date') },
    { label: quote ? 'Valid until' : 'Due date', ...ph(formatDate(invoice.dueDate), 'Date') },
    { label: 'Payment terms', ...ph(termsLabel(invoice, quote), 'Terms') },
    { label: 'Currency', text: invoice.currency },
  ];

  const named = (invoice.services ?? []).filter((sv) => sv.name?.trim());
  const services = named.length
    ? named.map((sv) => ({
      id: sv.id,
      text: sv.name.trim(),
      items: (sv.items ?? []).map((it) => it.text?.trim()).filter(Boolean),
      ...(BILLING[sv.billing] ? { billing: { kind: sv.billing, label: BILLING[sv.billing] } } : {}),
      ...(totals.services[sv.id] > 0
        ? { price: money(totals.services[sv.id]), ...(sv.billing === 'monthly' ? { per: '/ month' } : {}) }
        : {}),
    }))
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
  if (balance && totals.advancePaid > 0) {
    after.push({ label: `Advance received (${pctText(totals.advancePercent)})`, value: `−${money(totals.advancePaid)}` });
    if (totals.finalPaid > 0) after.push({ label: 'Further payments received', value: `−${money(totals.finalPaid)}` });
  } else if (totals.paid > 0) {
    after.push({ label: balance ? 'Payments received' : 'Amount paid', value: `−${money(totals.paid)}` });
  }

  // Advance + final payment, each with how much of it has been settled.
  const stage = (amount, paidPart, when) => {
    const state = paidPart >= amount ? 'paid' : paidPart > 0 ? 'part' : 'open';
    return {
      amount: money(amount),
      when,
      progress: amount > 0 ? Math.min(paidPart / amount, 1) : 0,
      state,
      stateLabel: state === 'paid' ? 'Received' : state === 'part' ? `${money(paidPart)} received` : '',
    };
  };
  const schedule = totals.advance > 0
    ? [
      {
        key: 'advance',
        step: '01',
        title: 'Advance payment',
        share: totals.advancePercent,
        percent: pctText(totals.advancePercent),
        ...stage(totals.advance, totals.advancePaid, advanceWhenLabel(invoice.advance)),
      },
      {
        key: 'final',
        step: '02',
        title: 'Final payment',
        share: totals.finalPercent,
        percent: pctText(totals.finalPercent),
        ...stage(totals.finalPayment, totals.finalPaid, !quote && formatDate(invoice.dueDate) ? `Due by ${formatDate(invoice.dueDate)}` : 'Due on completion'),
      },
    ]
    : null;
  const advanceOpen = !balance && totals.advanceOutstanding > 0 && status !== 'void';

  const terms = termsLabel(invoice, quote);
  const dueText = formatDate(invoice.dueDate);
  const termsLine = quote
    ? [terms && `${terms}.`, dueText && `This quotation is valid until ${dueText}.`].filter(Boolean).join(' ')
    : terms && dueText
      ? `${terms}. Payment due by ${dueText}.`
      : terms || '';

  return {
    // Same document either way; only the heading changes. A balance invoice is always an invoice.
    title: quote ? 'Quotation' : 'Invoice',
    number: invoice.number,
    status,
    statusLabel: STATUS[status].label,
    // Drafts and unpaid invoices carry no label on the document itself.
    showStatus: !balance && !['unpaid', 'draft', 'quoted', 'expired'].includes(status),
    docType: balance ? 'Balance invoice' : '',
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
    schedule,
    // A quotation asks for nothing yet: it shows what accepting it would take.
    due: quote && totals.paid <= 0
      ? advanceOpen
        ? { label: `Advance to confirm · ${pctText(totals.advancePercent)}`, value: money(totals.advanceOutstanding) }
        : { label: 'Quoted total', value: money(Math.max(totals.balance, 0)) }
      : advanceOpen
        ? { label: `Advance due now · ${pctText(totals.advancePercent)}`, value: money(totals.advanceOutstanding) }
        : { label: balance || totals.paid > 0 ? 'Balance due' : 'Total due', value: money(Math.max(totals.balance, 0)) },
    paymentDetails: lines(invoice.paymentDetails, 'Add verified bank or payment details'),
    paymentInstructions: invoice.paymentInstructions?.trim() ?? '',
    notes: invoice.notes?.trim() ?? '',
    termsLine,
    tagline: settings.tagline || '',
    website: from.website?.trim() || 'cybervexdigital.com',
    totals,
  };
}

/** A receipt for one recorded payment, with what was paid before and after it. */
export function buildReceipt(invoice, settings, paymentId) {
  const totals = computeTotals(invoice);
  const money = (m) => formatMoney(m, invoice.currency);
  const index = totals.paymentList.findIndex((p) => p.id === paymentId);
  const payment = (invoice.payments ?? [])[index];
  const amount = totals.paymentList[index].amount;
  const before = totals.paymentList.slice(0, index).reduce((sum, p) => sum + p.amount, 0);
  const toDate = before + amount;
  const remaining = Math.max(totals.total - toDate, 0);
  const purpose = totals.advance > 0 && before < totals.advance
    ? `Advance payment (${pctText(totals.advancePercent)})`
    : remaining <= 0 ? 'Final payment' : 'Part payment';
  const { fromLines, toLines } = partyLines(invoice.from, invoice.to);

  return {
    number: `${invoice.number}-R${index + 1}`,
    brandName: invoice.from?.brandName || 'Cybervex Digital',
    logoVariant: settings.logoVariant === 'silver' ? 'silver' : 'black',
    fromLines,
    toLines,
    meta: [
      { label: 'Date received', text: formatDate(payment.date) },
      { label: 'Payment method', text: payment.method || '—' },
      { label: 'Reference', text: payment.reference || '—' },
      { label: 'For invoice', text: invoice.number },
    ],
    purpose,
    amount: money(amount),
    summary: [
      { label: 'Invoice total', value: money(totals.total) },
      ...(before > 0 ? [{ label: 'Received earlier', value: money(before) }] : []),
      { label: 'This payment', value: money(amount) },
      { label: 'Total received to date', value: money(toDate) },
    ],
    remaining: { label: remaining > 0 ? 'Balance remaining' : 'Paid in full', value: money(remaining) },
    tagline: settings.tagline || '',
    website: invoice.from?.website?.trim() || 'cybervexdigital.com',
  };
}

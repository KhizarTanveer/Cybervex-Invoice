import { describe, expect, it } from 'vitest';
import { computeTotals } from './calc';
import { divRound, formatMoney, minorToInput, parseScaled, toMinor } from './money';
import { bumpCounters, isDuplicateNumber, nextInvoiceNumber } from './numbering';
import { deriveStatus } from './status';
import { addDays, isValidISO } from './dates';
import { duplicateInvoice, normalizeInvoice } from './defaults';

const inv = (over = {}) => ({
  currency: 'USD',
  budget: '',
  discount: { type: 'percent', value: '' },
  taxes: [],
  charges: [],
  payments: [],
  ...over,
});

describe('money', () => {
  it('parses decimals exactly and strictly', () => {
    expect(parseScaled('1.05', 2)).toBe(105n);
    expect(parseScaled('1,250.5', 2)).toBe(125050n);
    expect(parseScaled('', 2)).toBe(0n);
    expect(parseScaled('1.005', 2)).toBeNull();
    expect(parseScaled('-1', 2)).toBeNull();
    expect(parseScaled('abc', 2)).toBeNull();
    expect(parseScaled('.', 2)).toBeNull();
  });
  it('accepts whole-number amounts only', () => {
    expect(toMinor('7,262')).toBe(7262n);
    expect(toMinor('7262.50')).toBeNull();
  });
  it('rounds half away from zero', () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(4n, 3n)).toBe(1n);
    expect(divRound(-5n, 2n)).toBe(-3n);
  });
  it('formats simple prices without decimals', () => {
    expect(formatMoney(1234, 'USD')).toBe('$1,234');
    expect(formatMoney(7262, 'EUR')).toBe('€7,262');
    expect(formatMoney(1234, 'JPY')).toBe('¥1,234');
    expect(minorToInput(5838)).toBe('5838');
  });
});

describe('computeTotals', () => {
  it('uses the overall budget as the subtotal', () => {
    const t = computeTotals(inv({ budget: '7262' }));
    expect(t.subtotal).toBe(7262);
    expect(t.total).toBe(7262);
    expect(computeTotals(inv({ budget: '' })).total).toBe(0);
  });

  it('applies discount, then tax on the discounted base, then untaxed charges and payments', () => {
    const t = computeTotals(inv({
      budget: '1700',
      discount: { type: 'percent', value: '10' }, // 170
      taxes: [{ id: 't', label: 'VAT', rate: '20' }], // 20% of 1530 = 306
      charges: [{ id: 'c', label: 'Hosting', amount: '50' }],
      payments: [{ id: 'p', amount: '500' }],
    }));
    expect(t.subtotal).toBe(1700);
    expect(t.discount).toBe(170);
    expect(t.taxes.t).toBe(306);
    expect(t.total).toBe(1530 + 306 + 50);
    expect(t.paid).toBe(500);
    expect(t.balance).toBe(t.total - 500);
    expect(t.errors).toEqual({});
  });

  it('rounds percentages to whole units, half up', () => {
    // 10% of 7262 = 726.2 → 726 ; 19% of 6536 = 1241.84 → 1242 ; 15% of 7 = 1.05 → 1 ; 50% of 5 = 2.5 → 3
    const t = computeTotals(inv({ budget: '7262', discount: { type: 'percent', value: '10' }, taxes: [{ id: 't', rate: '19' }] }));
    expect(t.discount).toBe(726);
    expect(t.taxes.t).toBe(1242);
    expect(t.total).toBe(6536 + 1242);
    expect(computeTotals(inv({ budget: '5', discount: { type: 'percent', value: '50' } })).discount).toBe(3);
  });

  it('supports a fixed discount and rejects one larger than the budget', () => {
    expect(computeTotals(inv({ budget: '100', discount: { type: 'amount', value: '25' } })).total).toBe(75);
    const bad = computeTotals(inv({ budget: '100', discount: { type: 'amount', value: '200' } }));
    expect(bad.errors.discount).toBeTruthy();
    expect(bad.total).toBe(100);
  });

  it('rejects decimals in amounts instead of rounding them silently', () => {
    expect(computeTotals(inv({ budget: '7262.47' })).errors.budget).toMatch(/whole number/);
    expect(computeTotals(inv({ budget: '100', charges: [{ id: 'c', amount: '9.99' }] })).errors['charge.c']).toBeTruthy();
  });

  it('uses the sum of service prices as the budget when services are priced', () => {
    const t = computeTotals(inv({
      budget: '1000',
      services: [{ id: 'a', name: 'SEO', price: '750' }, { id: 'b', name: 'Logo', price: '250' }, { id: 'c', name: 'Ads' }],
      discount: { type: 'percent', value: '10' },
    }));
    expect(t.servicesTotal).toBe(1000);
    expect(t.subtotal).toBe(1000);
    expect(t.discount).toBe(100);
    expect(t.services.a).toBe(750);
    expect(computeTotals(inv({ services: [{ id: 'b', price: '9.5' }] })).errors['service.b']).toBeTruthy();
    expect(computeTotals(inv({ budget: 'x', services: [{ id: 'b', price: '10' }] })).errors.budget).toBeUndefined();
  });

  it('flags an invalid budget instead of guessing', () => {
    const t = computeTotals(inv({ budget: 'two thousand' }));
    expect(t.errors.budget).toBeTruthy();
    expect(t.subtotal).toBe(0);
  });
});

describe('advance payment', () => {
  const adv = (percent, extra = {}) => inv({ budget: '1000', advance: { enabled: true, percent, when: 'receipt' }, ...extra });

  it('splits the total into an advance and a final payment', () => {
    const t = computeTotals(adv('40', { taxes: [{ id: 't', rate: '10' }] })); // total 1100
    expect(t.advance).toBe(440);
    expect(t.finalPayment).toBe(660);
    expect(t.advancePercent).toBe(40);
    expect(t.finalPercent).toBe(60);
    expect(t.advanceOutstanding).toBe(440);
  });

  it('counts payments toward the advance first', () => {
    const t = computeTotals(adv('50', { payments: [{ id: 'p', amount: '700' }] }));
    expect(t.advancePaid).toBe(500);
    expect(t.advanceOutstanding).toBe(0);
    expect(t.finalPaid).toBe(200);
    expect(t.balance).toBe(300);
  });

  it('ignores a disabled advance and rejects out-of-range percentages', () => {
    expect(computeTotals(inv({ budget: '1000', advance: { enabled: false, percent: '50' } })).advance).toBe(0);
    expect(computeTotals(adv('100')).errors.advance).toBeTruthy();
    expect(computeTotals(adv('0')).errors.advance).toBeTruthy();
    expect(computeTotals(adv('abc')).advance).toBe(0);
  });

  it('marks an issued invoice as advance received once the advance is covered', () => {
    const t = computeTotals(adv('30', { payments: [{ id: 'p', amount: '300' }] }));
    expect(deriveStatus({ state: 'issued', dueDate: '2999-01-01' }, t, '2026-11-02')).toBe('advance');
    expect(deriveStatus({ state: 'issued', dueDate: '2026-11-01' }, t, '2026-11-02')).toBe('overdue');
  });

  it('uses a picked advance date on the document and for overdue status', async () => {
    const { buildView } = await import('./view');
    const base = { currency: 'USD', budget: '1000', services: [], taxes: [], charges: [], payments: [], from: {}, to: {}, discount: { type: 'percent', value: '' }, dueDate: '2026-12-31', advance: { enabled: true, percent: '50', when: 'date', date: '2026-11-10' } };
    const v = buildView(base, {});
    expect(v.schedule[0].when).toBe('Due by 10 Nov 2026');
    expect(v.schedule[1].when).toBe('Due by 31 Dec 2026');
    const t = computeTotals(base);
    expect(deriveStatus({ ...base, state: 'issued' }, t, '2026-11-09')).toBe('unpaid');
    expect(deriveStatus({ ...base, state: 'issued' }, t, '2026-11-11')).toBe('overdue');
  });

  it('asks for the advance first on the document', async () => {
    const { buildView } = await import('./view');
    const base = { currency: 'USD', budget: '1000', services: [], taxes: [], charges: [], from: {}, to: {}, discount: { type: 'percent', value: '' }, advance: { enabled: true, percent: '25', when: 'start' } };
    const open = buildView({ ...base, payments: [] }, {});
    expect(open.due.value).toBe('$250');
    expect(open.schedule.map((s) => s.amount)).toEqual(['$250', '$750']);
    expect(open.schedule[0].when).toBe('Due before work begins');
    const paid = buildView({ ...base, payments: [{ id: 'p', amount: '250' }] }, {});
    expect(paid.due.value).toBe('$750');
    expect(paid.schedule[0].state).toBe('paid');
  });
});

describe('pending payments', () => {
  it('asks for the unpaid advance first, then the balance', async () => {
    const { pendingPayment } = await import('./status');
    const base = inv({ budget: '1000', issueDate: '2026-11-01', dueDate: '2026-12-01', advance: { enabled: true, percent: '40', when: 'receipt' } });
    expect(pendingPayment(base, computeTotals(base))).toMatchObject({ kind: 'advance', amount: 400, date: '2026-11-01' });
    const paid = { ...base, payments: [{ id: 'p', amount: '400' }] };
    expect(pendingPayment(paid, computeTotals(paid))).toMatchObject({ kind: 'balance', label: 'Balance', amount: 600, date: '2026-12-01' });
  });

  it('titles the document as an invoice or a quotation', async () => {
    const { buildView } = await import('./view');
    const base = { currency: 'USD', budget: '1000', services: [], taxes: [], charges: [], from: {}, to: {}, state: 'draft', discount: { type: 'percent', value: '' }, payments: [] };
    expect(buildView(base, {}).title).toBe('Invoice');
    expect(buildView({ ...base, kind: 'quotation' }, {}).title).toBe('Quotation');
    expect(buildView({ ...base, kind: 'quotation' }, {}, undefined, { balance: true }).title).toBe('Invoice');
  });

  it('lists what a service includes under it, skipping blank points', async () => {
    const { buildView } = await import('./view');
    const base = { currency: 'USD', budget: '1000', taxes: [], charges: [], from: {}, to: {}, state: 'draft', discount: { type: 'percent', value: '' }, payments: [] };
    const v = buildView({ ...base, services: [{ id: 's', name: 'Website', custom: true, items: [{ id: 'a', text: ' 5 pages ' }, { id: 'b', text: '' }, { id: 'c', text: 'SEO setup' }] }] }, {});
    expect(v.services[0].items).toEqual(['5 pages', 'SEO setup']);
    expect(v.services[0].billing).toBeUndefined();
  });

  it('labels a service one-time, monthly or yearly, with a recurring price per period', async () => {
    const { buildView } = await import('./view');
    const base = { currency: 'USD', budget: '', taxes: [], charges: [], from: {}, to: {}, state: 'draft', discount: { type: 'percent', value: '' }, payments: [] };
    const v = buildView({ ...base, services: [
      { id: 'a', name: 'Website', billing: 'once', price: '800' },
      { id: 'b', name: 'SEO', billing: 'monthly', price: '200' },
      { id: 'c', name: 'Hosting', billing: 'yearly', price: '120' },
    ] }, {});
    expect(v.services[0]).toMatchObject({ billing: { kind: 'once', label: 'One-time' }, price: '$800' });
    expect(v.services[1]).toMatchObject({ billing: { kind: 'monthly', label: 'Monthly' }, price: '$200', per: '/ month' });
    expect(v.services[2]).toMatchObject({ billing: { kind: 'yearly', label: 'Yearly' }, price: '$120', per: '/ year' });
  });

  it('shows a custom billing label as typed, and nothing while it is blank', async () => {
    const { buildView } = await import('./view');
    const base = { currency: 'USD', budget: '', taxes: [], charges: [], from: {}, to: {}, state: 'draft', discount: { type: 'percent', value: '' }, payments: [] };
    const v = buildView({ ...base, services: [
      { id: 'a', name: 'Support', billing: 'custom', billingLabel: ' Quarterly ', price: '300' },
      { id: 'b', name: 'Audit', billing: 'custom', billingLabel: '' },
    ] }, {});
    expect(v.services[0]).toMatchObject({ billing: { kind: 'custom', label: 'Quarterly' }, price: '$300' });
    expect(v.services[0].per).toBeUndefined();
    expect(v.services[1].billing).toBeUndefined();
  });

  it('treats a quotation date as validity, not a payment deadline', async () => {
    const { buildView } = await import('./view');
    const q = { currency: 'USD', budget: '1000', services: [], taxes: [], charges: [], from: {}, to: {}, state: 'issued', kind: 'quotation', terms: 'net15', issueDate: '2026-11-01', dueDate: '2026-11-16', discount: { type: 'percent', value: '' }, payments: [] };
    const v = buildView(q, {}, '2026-11-10');
    expect(v.meta.find((m) => m.label === 'Valid until').text).toBe('16 Nov 2026');
    expect(v.meta.find((m) => m.label === 'Payment terms').text).toBe('Net 15 from invoice date');
    expect(v.termsLine).toBe('Net 15 from invoice date. This quotation is valid until 16 Nov 2026.');
    expect(v.due.label).toBe('Quoted total');
    expect(v.status).toBe('quoted');
    expect(v.showStatus).toBe(false);
    expect(deriveStatus(q, computeTotals(q), '2026-11-20')).toBe('expired');
    const accepted = { ...q, payments: [{ id: 'p', amount: '400' }] };
    expect(deriveStatus(accepted, computeTotals(accepted), '2026-11-20')).toBe('partial');
  });

  it('builds a balance invoice that deducts the advance', async () => {
    const { buildView } = await import('./view');
    const base = { currency: 'USD', budget: '1000', services: [], taxes: [], charges: [], from: {}, to: {}, state: 'issued', dueDate: '2999-01-01', discount: { type: 'percent', value: '' }, advance: { enabled: true, percent: '50', when: 'receipt' }, payments: [{ id: 'p', amount: '500' }] };
    const v = buildView(base, {}, undefined, { balance: true });
    expect(v.docType).toBe('Balance invoice');
    expect(v.after).toEqual([{ label: 'Advance received (50%)', value: '−$500' }]);
    expect(v.due).toEqual({ label: 'Balance due', value: '$500' });
  });

  it('builds a receipt per payment with running totals', async () => {
    const { buildReceipt } = await import('./view');
    const base = { number: 'CVD-1', currency: 'USD', budget: '1000', services: [], taxes: [], charges: [], from: {}, to: {}, discount: { type: 'percent', value: '' }, advance: { enabled: true, percent: '30', when: 'receipt' },
      payments: [{ id: 'a', amount: '300', date: '2026-11-01', method: 'Bank transfer' }, { id: 'b', amount: '700', date: '2026-11-20', method: 'Cash' }] };
    const first = buildReceipt(base, {}, 'a');
    expect(first.number).toBe('CVD-1-R1');
    expect(first.purpose).toBe('Advance payment (30%)');
    expect(first.remaining.value).toBe('$700');
    const second = buildReceipt(base, {}, 'b');
    expect(second.purpose).toBe('Final payment');
    expect(second.remaining.label).toBe('Paid in full');
  });
});

describe('numbering', () => {
  const list = [{ id: '1', number: 'CVD-2026-0001' }, { id: '2', number: 'CVD-2026-0007' }, { id: '3', number: 'CVD-2025-0042' }];
  it('continues the series for the year', () => {
    expect(nextInvoiceNumber(list, {}, 'CVD', 2026)).toBe('CVD-2026-0008');
    expect(nextInvoiceNumber(list, {}, 'cvd', 2027)).toBe('CVD-2027-0001');
  });
  it('never reuses a number from a deleted invoice', () => {
    expect(nextInvoiceNumber(list, { 'CVD-2026': 12 }, 'CVD', 2026)).toBe('CVD-2026-0013');
    expect(bumpCounters({}, 'CVD-2026-0009')).toEqual({ 'CVD-2026': 9 });
  });
  it('detects duplicates case-insensitively', () => {
    expect(isDuplicateNumber(' cvd-2026-0001 ', list)).toBe(true);
    expect(isDuplicateNumber('CVD-2026-0001', list, '1')).toBe(false);
  });
});

describe('status', () => {
  const totals = (total, paid) => ({ total, paid, balance: total - paid });
  const today = '2026-11-02';
  it('derives status only from state, dates and recorded payments', () => {
    expect(deriveStatus({ state: 'draft' }, totals(100, 100), today)).toBe('draft');
    expect(deriveStatus({ state: 'issued', dueDate: '2026-12-01' }, totals(100, 0), today)).toBe('unpaid');
    expect(deriveStatus({ state: 'issued', dueDate: '2026-12-01' }, totals(100, 40), today)).toBe('partial');
    expect(deriveStatus({ state: 'issued', dueDate: '2026-11-01' }, totals(100, 40), today)).toBe('overdue');
    expect(deriveStatus({ state: 'issued', dueDate: '2026-11-01' }, totals(100, 100), today)).toBe('paid');
    expect(deriveStatus({ state: 'issued', dueDate: '2026-12-01' }, totals(0, 0), today)).toBe('unpaid');
    expect(deriveStatus({ state: 'void' }, totals(100, 0), today)).toBe('void');
  });
});

describe('services', () => {
  it('converts an old project name into a service', () => {
    const inv = normalizeInvoice({ id: 'a', project: { name: 'Website rebuild', reference: 'PO-1' } });
    expect(inv.services.map((s) => s.name)).toEqual(['Website rebuild']);
    expect(inv.reference).toBe('PO-1');
    expect(inv.project).toBeUndefined();
    expect(normalizeInvoice({ project: { name: '' } }).services).toEqual([]);
  });
  it('turns old line items into services and an exact budget', () => {
    const inv2 = normalizeInvoice({
      id: 'a', currency: 'USD', services: [],
      items: [
        { id: '1', description: 'Design', quantity: '2', unitPrice: '100' },
        { id: '2', description: 'Hosting', quantity: '1', unitPrice: '50.50' },
      ],
    });
    expect(inv2.budget).toBe('251'); // 250.50 in the old cents format → whole units, half up
    expect(inv2.services.map((s) => s.name)).toEqual(['Design', 'Hosting']);
    expect(inv2.items).toBeUndefined();
  });
  it('copies services into a duplicate with fresh ids', () => {
    const src = { id: 'a', terms: 'net15', items: [], services: [{ id: 's1', name: 'SEO' }], reference: '' };
    const copy = duplicateInvoice(src, 'CVD-2026-0002');
    expect(copy.services[0].name).toBe('SEO');
    expect(copy.services[0].id).not.toBe('s1');
  });
});

describe('dates', () => {
  it('adds days across month ends and validates', () => {
    expect(addDays('2026-01-31', 30)).toBe('2026-03-02');
    expect(isValidISO('2026-02-30')).toBe(false);
  });
});

describe('invoice document', () => {
  it('shows no status label on drafts', async () => {
    const { buildView } = await import('./view');
    const base = { currency: 'USD', budget: '100', services: [], taxes: [], charges: [], payments: [], from: {}, to: {}, discount: { type: 'percent', value: '' } };
    expect(buildView({ ...base, state: 'draft' }, {}).showStatus).toBe(false);
    expect(buildView({ ...base, state: 'issued', dueDate: '2999-01-01', payments: [{ id: 'p', amount: '40' }] }, {}).showStatus).toBe(true);
  });
});

describe('monthly revenue', () => {
  it('lists the last months across a year boundary', async () => {
    const { lastMonths } = await import('./revenue');
    expect(lastMonths('2026-02-14', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('counts every payment in the month it was received, advance first', async () => {
    const { receivedByMonth } = await import('./revenue');
    const issued = { state: 'issued', dueDate: '2999-01-01' };
    const advance = { enabled: true, percent: '40', when: 'receipt' };
    const list = [
      // 40% advance in October, the rest in November
      inv({ ...issued, budget: '1000', advance, payments: [{ id: 'a', date: '2026-10-20', amount: '400' }, { id: 'b', date: '2026-11-03', amount: '600' }] }),
      // advance only, still open
      inv({ ...issued, budget: '500', advance, payments: [{ id: 'c', date: '2026-11-10', amount: '200' }] }),
      // part payment without an advance
      inv({ ...issued, budget: '800', payments: [{ id: 'd', date: '2026-11-12', amount: '300' }] }),
      inv({ ...issued, budget: '200', currency: 'EUR', payments: [{ id: 'e', date: '2026-09-01', amount: '200' }] }),
      inv({ state: 'void', budget: '900', payments: [{ id: 'f', date: '2026-11-01', amount: '900' }] }),
      inv({ state: 'draft', budget: '900', payments: [{ id: 'g', date: '2026-11-01', amount: '900' }] }),
    ];
    const r = receivedByMonth(list, '2026-11-28');
    expect(r.get('USD').get('2026-10')).toEqual({ amount: 400, advance: 400, count: 1 });
    expect(r.get('USD').get('2026-11')).toEqual({ amount: 1100, advance: 200, count: 3 });
    expect(r.get('EUR').get('2026-09')).toEqual({ amount: 200, advance: 0, count: 1 });
  });
  it('builds the report: payments, clients and monthly totals for one currency', async () => {
    const { revenueReport } = await import('./revenue');
    const issued = { state: 'issued', dueDate: '2999-01-01' };
    const advance = { enabled: true, percent: '40', when: 'receipt' };
    const list = [
      inv({ ...issued, number: 'A-1', to: { company: 'Acme', email: 'a@acme.test' }, budget: '1000', advance,
        payments: [{ id: 'a', date: '2026-10-20', amount: '400', method: 'Wise' }, { id: 'b', date: '2026-11-03', amount: '600' }] }),
      inv({ ...issued, number: 'A-2', to: { company: 'acme' }, budget: '500', payments: [] }),
      inv({ ...issued, number: 'B-1', to: { company: 'Beta' }, budget: '300', payments: [{ id: 'c', date: '2025-01-05', amount: '300' }] }),
      inv({ ...issued, number: 'E-1', currency: 'EUR', to: { company: 'Euro' }, budget: '200', payments: [{ id: 'd', date: '2026-11-01', amount: '200' }] }),
    ];
    const r = revenueReport(list, '2026-11-28', 'USD', ['2026-10', '2026-11']);
    expect(r.total).toBe(1000);
    expect(r.advances).toBe(400);
    expect(r.payments.map((p) => [p.number, p.type, p.amount])).toEqual([['A-1', 'Balance', 600], ['A-1', 'Advance', 400]]);
    expect(r.payments[1].method).toBe('Wise');
    expect(r.clients).toEqual([{ company: 'Acme', contact: '', email: 'a@acme.test', documents: 2, payments: 2, received: 1000, outstanding: 500 }]);
    expect(r.monthly).toEqual([
      { key: '2026-10', amount: 400, advance: 400, payments: 1 },
      { key: '2026-11', amount: 600, advance: 0, payments: 1 },
    ]);
  });
  it('rounds the axis up to a readable maximum', async () => {
    const { niceMax } = await import('./revenue');
    expect(niceMax(0)).toBe(1);
    expect(niceMax(1800)).toBe(2000);
    expect(niceMax(2100)).toBe(2500);
    expect(niceMax(7300)).toBe(10000);
  });
});

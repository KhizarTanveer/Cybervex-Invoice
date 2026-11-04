import { AMOUNT_DIGITS, divRound, parseScaled } from './money';

// Percentages and tax rates accept up to 4 decimal places.
export const PCT_SCALE = 4;
const PCT_UNIT = 10n ** BigInt(PCT_SCALE);

/**
 * Compute every figure on an invoice from its raw (string) inputs.
 * Each step rounds once, to a whole currency unit, in the order shown on the
 * invoice, so the printed lines always add up to the printed totals.
 *
 * Returns Numbers in whole currency units plus a map of field errors.
 */
export function computeTotals(invoice) {
  const digits = AMOUNT_DIGITS;
  const whole = 'Enter a whole number (no decimals)';
  const errors = {};

  // The budget is either the sum of per-service prices or, when no service is
  // priced, one overall figure covering all of them.
  const servicePrices = (invoice.services ?? []).map((sv) => {
    const amt = parseScaled(sv.price ?? '', digits);
    if (amt === null) errors[`service.${sv.id}`] = whole;
    return { id: sv.id, amount: amt ?? 0n };
  });
  const servicesTotal = servicePrices.reduce((s, sv) => s + sv.amount, 0n);
  const budget = parseScaled(invoice.budget, digits);
  if (budget === null && servicesTotal === 0n) {
    errors['budget'] = whole;
  }
  const subtotal = servicesTotal > 0n ? servicesTotal : (budget ?? 0n);

  let discount = 0n;
  const d = invoice.discount ?? { type: 'percent', value: '' };
  if (d.type === 'percent') {
    const pct = parseScaled(d.value, PCT_SCALE);
    if (pct === null || pct > 100n * PCT_UNIT) errors['discount'] = 'Enter a percentage between 0 and 100';
    else discount = divRound(subtotal * pct, 100n * PCT_UNIT);
  } else {
    const amt = parseScaled(d.value, digits);
    if (amt === null) errors['discount'] = whole;
    else if (amt > subtotal) errors['discount'] = 'Discount cannot exceed the subtotal';
    else discount = amt;
  }

  const taxableBase = subtotal - discount;

  const taxes = (invoice.taxes ?? []).map((t) => {
    const rate = parseScaled(t.rate, PCT_SCALE);
    if (rate === null || rate > 100n * PCT_UNIT) {
      errors[`tax.${t.id}`] = 'Enter a rate between 0 and 100';
      return { id: t.id, amount: 0n };
    }
    return { id: t.id, amount: divRound(taxableBase * rate, 100n * PCT_UNIT) };
  });
  const taxTotal = taxes.reduce((s, t) => s + t.amount, 0n);

  const charges = (invoice.charges ?? []).map((c) => {
    const amt = parseScaled(c.amount, digits);
    if (amt === null) errors[`charge.${c.id}`] = whole;
    return { id: c.id, amount: amt ?? 0n };
  });
  const chargeTotal = charges.reduce((s, c) => s + c.amount, 0n);

  const total = taxableBase + taxTotal + chargeTotal;

  const payments = (invoice.payments ?? []).map((p) => ({ id: p.id, amount: parseScaled(p.amount, digits) ?? 0n }));
  const paid = payments.reduce((s, p) => s + p.amount, 0n);

  // Advance: a share of the total requested up front. Payments count toward it first.
  let advancePct = 0n;
  let advance = 0n;
  if (invoice.advance?.enabled) {
    const pct = parseScaled(invoice.advance.percent, PCT_SCALE);
    if (pct === null || pct <= 0n || pct >= 100n * PCT_UNIT) errors['advance'] = 'Enter a percentage between 1 and 99';
    else {
      advancePct = pct;
      advance = divRound(total * pct, 100n * PCT_UNIT);
    }
  }
  const advancePaid = paid < advance ? paid : advance;
  const finalPayment = total - advance;
  const finalPaid = paid - advancePaid;

  const num = (v) => Number(v);
  return {
    services: Object.fromEntries(servicePrices.map((sv) => [sv.id, num(sv.amount)])),
    servicesTotal: num(servicesTotal),
    subtotal: num(subtotal),
    discount: num(discount),
    taxableBase: num(taxableBase),
    taxes: Object.fromEntries(taxes.map((t) => [t.id, num(t.amount)])),
    taxTotal: num(taxTotal),
    charges: Object.fromEntries(charges.map((c) => [c.id, num(c.amount)])),
    chargeTotal: num(chargeTotal),
    total: num(total),
    paid: num(paid),
    balance: num(total - paid),
    advancePercent: advance > 0n ? Number(advancePct) / Number(PCT_UNIT) : 0,
    finalPercent: advance > 0n ? Number(100n * PCT_UNIT - advancePct) / Number(PCT_UNIT) : 100,
    advance: num(advance),
    advancePaid: num(advancePaid),
    advanceOutstanding: num(advance - advancePaid),
    finalPayment: num(finalPayment),
    finalPaid: num(finalPaid),
    errors,
  };
}

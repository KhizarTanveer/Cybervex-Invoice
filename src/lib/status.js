import { todayISO } from './dates';
import { advanceDate } from './defaults';

// Status is derived, never typed in. "Paid" can only come from recorded payments
// that cover the total; it cannot be set by hand.
export const STATUS = {
  draft: { label: 'Draft' },
  unpaid: { label: 'Awaiting payment' },
  partial: { label: 'Partially paid' },
  advance: { label: 'Advance received' },
  overdue: { label: 'Overdue' },
  quoted: { label: 'Quotation sent' },
  expired: { label: 'Quotation expired' },
  paid: { label: 'Paid' },
  void: { label: 'Void' },
};

/**
 * What the client owes next on an open invoice: the unpaid advance first,
 * then the remaining balance. Advances without a picked date are due on issue.
 */
export function pendingPayment(invoice, totals) {
  if (totals.advanceOutstanding > 0) {
    return {
      kind: 'advance',
      label: 'Advance',
      amount: totals.advanceOutstanding,
      date: advanceDate(invoice.advance) || invoice.issueDate,
    };
  }
  return {
    kind: 'balance',
    label: totals.paid > 0 ? 'Balance' : 'Full amount',
    amount: Math.max(totals.balance, 0),
    // A quotation's date is its validity, not when the balance falls due.
    date: invoice.kind === 'quotation' ? '' : invoice.dueDate,
  };
}

export function deriveStatus(invoice, totals, today = todayISO()) {
  if (invoice.state === 'void') return 'void';
  if (invoice.state !== 'issued') return 'draft';
  if (totals.total > 0 && totals.balance <= 0) return 'paid';
  if (invoice.kind === 'quotation') {
    // A quotation is an offer: nothing is owed until the client pays something
    // against it, and its date is when the offer lapses, not a payment deadline.
    if (totals.paid <= 0) return invoice.dueDate && invoice.dueDate < today ? 'expired' : 'quoted';
    if (totals.advance > 0 && totals.advanceOutstanding <= 0) return 'advance';
    return 'partial';
  }
  if (invoice.dueDate && invoice.dueDate < today && totals.balance > 0) return 'overdue';
  // An advance with its own date is overdue once that date passes unpaid.
  const advDue = advanceDate(invoice.advance);
  if (advDue && advDue < today && totals.advanceOutstanding > 0) return 'overdue';
  if (totals.advance > 0 && totals.advanceOutstanding <= 0) return 'advance';
  if (totals.paid > 0) return 'partial';
  return 'unpaid';
}

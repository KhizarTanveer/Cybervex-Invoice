import { todayISO } from './dates';

// Status is derived, never typed in. "Paid" can only come from recorded payments
// that cover the total; it cannot be set by hand.
export const STATUS = {
  draft: { label: 'Draft' },
  unpaid: { label: 'Awaiting payment' },
  partial: { label: 'Partially paid' },
  overdue: { label: 'Overdue' },
  paid: { label: 'Paid' },
  void: { label: 'Void' },
};

export function deriveStatus(invoice, totals, today = todayISO()) {
  if (invoice.state === 'void') return 'void';
  if (invoice.state !== 'issued') return 'draft';
  if (totals.total > 0 && totals.balance <= 0) return 'paid';
  if (invoice.dueDate && invoice.dueDate < today && totals.balance > 0) return 'overdue';
  if (totals.paid > 0) return 'partial';
  return 'unpaid';
}

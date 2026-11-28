import { useMemo, useState } from 'react';
import { ChevronRight, Mail, Plus, Search } from 'lucide-react';
import { computeTotals } from '../lib/calc';
import { daysBetween, formatDate, todayISO } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { navigate } from '../lib/router';
import { STATUS, deriveStatus, pendingPayment } from '../lib/status';
import { useStore } from '../lib/storage';
import { sendInvoiceEmail } from '../lib/email';
import { Field, Modal, StatusBadge, useToast } from '../components/ui';

/** Asks for the recipient and subject, then emails the invoice or quotation PDF. */
function SendMailDialog({ inv, onClose, onSend }) {
  const kind = inv.kind === 'quotation' ? 'Quotation' : 'Invoice';
  const [email, setEmail] = useState(inv.to?.email?.trim() || '');
  const [subject, setSubject] = useState(`${kind} ${inv.number || ''} from Cybervex Digital`.replace(/\s+/g, ' '));
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const close = () => { if (!sending) onClose(); };

  const submit = async (e) => {
    e.preventDefault();
    const to = email.trim();
    const next = {};
    if (!to) next.email = 'Enter the client’s email address';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) next.email = 'This email address doesn’t look right';
    if (!subject.trim()) next.subject = 'Enter a subject for the email';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSending(true);
    try {
      await onSend({ to, subject: subject.trim() });
    } catch (err) {
      setErrors({ send: err.message || 'Could not send the email. Please try again.' });
      setSending(false);
    }
  };

  return (
    <Modal title={`Send ${kind.toLowerCase()} ${inv.number || ''}`} onClose={close}>
      <form onSubmit={submit} noValidate>
        <Field
          label="To"
          type="email"
          placeholder="client@gmail.com"
          value={email}
          error={errors.email}
          autoFocus={!email}
          onChange={(e) => { setEmail(e.target.value); setErrors((er) => ({ ...er, email: undefined })); }}
        />
        <Field
          label="Subject"
          className="modal-field"
          value={subject}
          error={errors.subject}
          autoFocus={!!email}
          onChange={(e) => { setSubject(e.target.value); setErrors((er) => ({ ...er, subject: undefined })); }}
        />
        <p className="muted small modal-note">The {kind.toLowerCase()} PDF is attached automatically.</p>
        {errors.send && <p className="modal-error" role="alert">{errors.send}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={close} disabled={sending}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={sending}>
            <Mail aria-hidden /> {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const FILTERS = ['all', 'draft', 'unpaid', 'partial', 'advance', 'overdue', 'quoted', 'expired', 'paid', 'void'];
const FILTER_LABEL = { all: 'All', ...Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.label])) };

/** Sum per currency: invoices in different currencies are never added together. */
function byCurrency(rows, pick) {
  const m = new Map();
  for (const r of rows) {
    const v = pick(r);
    if (v > 0) m.set(r.inv.currency, (m.get(r.inv.currency) ?? 0) + v);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function dueText(days) {
  if (days === null) return 'No due date';
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  return `Due in ${days} day${days === 1 ? '' : 's'}`;
}

/** Every open invoice with what is owed next, most urgent first. */
function PendingPayments({ rows }) {
  const today = todayISO();
  const items = rows
    .map((r) => {
      const next = pendingPayment(r.inv, r.totals);
      return { ...r, next, days: daysBetween(today, next.date) };
    })
    .filter((r) => r.next.amount > 0)
    .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));
  if (!items.length) return null;

  return (
    <section className="pending" aria-label="Pending payments">
      <div className="pending-head">
        <h2>Pending payments</h2>
        <span className="muted small">{items.length} invoice{items.length === 1 ? '' : 's'} awaiting payment</span>
      </div>
      <ul>
        {items.map(({ inv, totals, next, days }) => (
          <li key={inv.id}>
            <a
              href={`#/invoice/${inv.id}`}
              className={days !== null && days < 0 ? 'is-late' : days !== null && days <= 3 ? 'is-soon' : ''}
              onClick={(e) => { e.preventDefault(); navigate(`/invoice/${inv.id}`); }}
            >
              <span className="pending-client">
                <strong>{inv.to?.company || 'Untitled client'}</strong>
                <span className="muted small">{inv.number} · {next.label} pending</span>
              </span>
              <span className="pending-bar" aria-hidden>
                <i style={{ width: `${totals.total > 0 ? Math.min(totals.paid / totals.total, 1) * 100 : 0}%` }} />
              </span>
              <span className="pending-when">{dueText(days)}</span>
              <span className="pending-amt">{formatMoney(next.amount, inv.currency)}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MoneyList({ entries }) {
  if (!entries.length) return <>—</>;
  const [first, ...rest] = entries;
  return (
    <>
      {formatMoney(first[1], first[0])}
      {rest.map(([c, v]) => <small key={c}>{formatMoney(v, c)}</small>)}
    </>
  );
}

export default function InvoicesPage() {
  const { invoices, settings } = useStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [mailing, setMailing] = useState(null);
  const [toast, showToast] = useToast();

  const rows = useMemo(() => {
    const today = todayISO();
    return invoices
      .map((inv) => {
        const totals = computeTotals(inv);
        return { inv, totals, status: deriveStatus(inv, totals, today) };
      })
      .sort((a, b) => (b.inv.issueDate || '').localeCompare(a.inv.issueDate || '')
        || (b.inv.number || '').localeCompare(a.inv.number || ''));
  }, [invoices]);

  const counts = useMemo(() => {
    const c = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      const { inv } = r;
      return [inv.number, inv.to?.company, inv.to?.contact, inv.to?.email, inv.reference,
        ...(inv.services ?? []).map((sv) => sv.name)]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [rows, query, filter]);

  const open = rows.filter((r) => ['unpaid', 'partial', 'advance', 'overdue'].includes(r.status));
  const outstanding = byCurrency(open, (r) => r.totals.balance);
  const overdue = byCurrency(rows.filter((r) => r.status === 'overdue'), (r) => r.totals.balance);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Cybervex Digital</p>
          <h1>Invoices</h1>
        </div>
      </div>

      <section className="stats" aria-label="Summary">
        <div className="stat">
          <p className="eyebrow">Outstanding</p>
          <p className="stat-value"><MoneyList entries={outstanding} /></p>
        </div>
        <div className="stat">
          <p className="eyebrow">Overdue · {counts.overdue ?? 0}</p>
          <p className="stat-value"><MoneyList entries={overdue} /></p>
        </div>
        <div className="stat">
          <p className="eyebrow">Drafts</p>
          <p className="stat-value">{counts.draft ?? 0}</p>
        </div>
      </section>

      <PendingPayments rows={open} />

      <div className="toolbar">
        <label className="search">
          <Search aria-hidden />
          <span className="visually-hidden">Search invoices</span>
          <input
            type="search"
            placeholder="Search number, client, project…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="chips" role="group" aria-label="Filter by status">
          {FILTERS.filter((f) => f === 'all' || counts[f]).map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {FILTER_LABEL[f]}<span className="count">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="list" role="table" aria-label="Invoice history">
        <div className="list-row list-head" role="row">
          <span role="columnheader">Number</span>
          <span role="columnheader">Client</span>
          <span role="columnheader">Issued</span>
          <span role="columnheader">Due</span>
          <span role="columnheader" className="num">Total</span>
          <span role="columnheader" className="num">Balance</span>
          <span role="columnheader">Status</span>
          <span />
          <span />
        </div>

        {visible.map(({ inv, totals, status }) => (
          <a
            key={inv.id}
            role="row"
            className="list-row"
            href={`#/invoice/${inv.id}`}
            onClick={(e) => { e.preventDefault(); navigate(`/invoice/${inv.id}`); }}
          >
            <span role="cell" className="strong">{inv.number}</span>
            <span role="cell" className="clip">
              <span className="strong">{inv.to?.company || 'Untitled client'}</span>
              {inv.services?.some((sv) => sv.name?.trim()) && (
                <span className="sub"> · {inv.services.map((sv) => sv.name?.trim()).filter(Boolean).join(', ')}</span>
              )}
            </span>
            <span role="cell" className="muted small">
              <span className="mobile-label">Issued</span>{formatDate(inv.issueDate)}
            </span>
            <span role="cell" className="muted small">{formatDate(inv.dueDate)}</span>
            <span role="cell" className="num strong">{formatMoney(totals.total, inv.currency)}</span>
            <span role="cell" className="num muted">
              <span className="mobile-label">Balance</span>{formatMoney(Math.max(totals.balance, 0), inv.currency)}
            </span>
            <span role="cell"><StatusBadge status={status} /></span>
            <span role="cell" className="mail-cell">
              <button
                type="button"
                className="btn btn-sm"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMailing(inv); }}
              >
                <Mail aria-hidden /> Send mail
              </button>
            </span>
            <span role="cell" className="muted"><ChevronRight size={16} aria-hidden /></span>
          </a>
        ))}

        {rows.length === 0 && (
          <div className="empty">
            <h2>No invoices yet</h2>
            <p>Create your first Cybervex Digital invoice. Drafts are saved in this browser.</p>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/new')}>
              <Plus aria-hidden /> New invoice
            </button>
          </div>
        )}
        {rows.length > 0 && visible.length === 0 && (
          <div className="empty"><p>No invoices match your search.</p></div>
        )}
      </div>

      {mailing && (
        <SendMailDialog
          inv={mailing}
          onClose={() => setMailing(null)}
          onSend={async (msg) => {
            await sendInvoiceEmail(mailing, settings, msg);
            setMailing(null);
            showToast(`Sent to ${msg.to}`);
          }}
        />
      )}
      {toast}
    </div>
  );
}

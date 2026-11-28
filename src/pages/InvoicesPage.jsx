import { useId, useMemo, useState } from 'react';
import {
  TriangleAlert, CircleCheck, Clock, FileText, LoaderCircle, Mail, Paperclip, Plus, Receipt, Search, Send,
} from 'lucide-react';
import { computeTotals } from '../lib/calc';
import { daysBetween, formatDate, todayISO } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { navigate } from '../lib/router';
import { STATUS, deriveStatus, pendingPayment } from '../lib/status';
import { useStore } from '../lib/storage';
import { pdfFilename, sendInvoiceEmail } from '../lib/email';
import { Modal, StatusBadge, useToast } from '../components/ui';
import RevenueChart from '../components/RevenueChart';

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

  const toId = useId();
  const subjectId = useId();
  const totals = computeTotals(inv);

  return (
    <Modal
      className="send-dialog"
      title={`Send ${kind.toLowerCase()}`}
      subtitle={<>
        <span className="mono">{inv.number || 'No number'}</span>
        {inv.to?.company && <> · {inv.to.company}</>}
        {' · '}{formatMoney(totals.total, inv.currency)}
      </>}
      onClose={close}
    >
      <form onSubmit={submit} noValidate>
        <div className="send-body">
          <div className="compose">
            <div className={`compose-row ${errors.email ? 'invalid' : ''}`}>
              <label htmlFor={toId}>To</label>
              <input
                id={toId}
                type="email"
                placeholder="client@gmail.com"
                value={email}
                autoFocus={!email}
                aria-invalid={!!errors.email || undefined}
                onChange={(e) => { setEmail(e.target.value); setErrors((er) => ({ ...er, email: undefined })); }}
              />
            </div>
            <div className={`compose-row ${errors.subject ? 'invalid' : ''}`}>
              <label htmlFor={subjectId}>Subject</label>
              <input
                id={subjectId}
                value={subject}
                autoFocus={!!email}
                aria-invalid={!!errors.subject || undefined}
                onChange={(e) => { setSubject(e.target.value); setErrors((er) => ({ ...er, subject: undefined })); }}
              />
            </div>
          </div>
          {(errors.email || errors.subject) && (
            <p className="compose-err" role="alert">{errors.email || errors.subject}</p>
          )}

          <div className="attachment">
            <span className="attachment-icon"><FileText aria-hidden /><b>PDF</b></span>
            <span className="attachment-text">
              <span className="attachment-name">{pdfFilename(inv)}</span>
              <span className="attachment-meta">Created from the latest version when you send</span>
            </span>
            <Paperclip className="attachment-clip" aria-hidden />
          </div>

          {errors.send && <p className="modal-error" role="alert">{errors.send}</p>}
        </div>

        <div className="send-foot">
          <span className="send-from">From Cybervex Digital</span>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={close} disabled={sending}>Cancel</button>
            <button type="submit" className="btn btn-primary send-submit" disabled={sending}>
              {sending ? <LoaderCircle className="spin" aria-hidden /> : <Send aria-hidden />}
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
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

function MoneyList({ entries, empty = '—' }) {
  if (!entries.length) return <span className="stat-empty">{empty}</span>;
  const [first, ...rest] = entries;
  return (
    <>
      {formatMoney(first[1], first[0])}
      {rest.map(([c, v]) => <small key={c}>{formatMoney(v, c)}</small>)}
    </>
  );
}

/** What the due column says under the date: how long is left, or how late it is. */
function dueNote(inv, status, today) {
  const days = daysBetween(today, inv.dueDate);
  if (status === 'paid') return { text: 'Settled' };
  if (status === 'void' || status === 'draft' || days === null) return null;
  if (status === 'expired') return { text: 'Offer expired', tone: 'faint' };
  if (inv.kind === 'quotation') return { text: days === 0 ? 'Valid today' : `Valid ${days} more day${days === 1 ? '' : 's'}` };
  if (days < 0) return { text: `${-days} day${days === -1 ? '' : 's'} late`, tone: 'late' };
  if (days === 0) return { text: 'Due today', tone: 'soon' };
  return { text: `In ${days} day${days === 1 ? '' : 's'}`, tone: days <= 3 ? 'soon' : '' };
}

/** One invoice or quotation in the history ledger. The whole row opens it. */
function HistoryRow({ inv, totals, status, today, onMail }) {
  const href = `#/invoice/${inv.id}`;
  const services = (inv.services ?? []).map((sv) => sv.name?.trim()).filter(Boolean).join(', ');
  const note = dueNote(inv, status, today);
  const paidShare = totals.total > 0 ? Math.min(Math.max(totals.paid / totals.total, 0), 1) : 0;
  const balance = Math.max(totals.balance, 0);
  return (
    <div role="row" className={`ledger-row status-${status}`}>
      <span role="cell" className="cell-doc">
        <a href={href} className="row-link" onClick={(e) => { e.preventDefault(); navigate(`/invoice/${inv.id}`); }}>
          {inv.number || 'No number'}
        </a>
        <span className="cell-kind">{inv.kind === 'quotation' ? 'Quotation' : 'Invoice'}</span>
      </span>
      <span role="cell" className="cell-client">
        <span className="client-name">{inv.to?.company || 'Untitled client'}</span>
        {services && <span className="client-sub">{services}</span>}
      </span>
      <span role="cell" className="cell-date cell-issued">
        <span className="mobile-label">Issued</span>{formatDate(inv.issueDate)}
      </span>
      <span role="cell" className="cell-due">
        <span className="cell-date">{formatDate(inv.dueDate)}</span>
        {note && <span className={`due-note ${note.tone ? `is-${note.tone}` : ''}`}>{note.text}</span>}
      </span>
      <span role="cell" className="cell-total num">
        <span className="figure">{formatMoney(totals.total, inv.currency)}</span>
        {status !== 'draft' && status !== 'void' && totals.total > 0 && (
          <span className="paid-track" title={`${Math.round(paidShare * 100)}% paid`} aria-hidden>
            <i style={{ width: `${paidShare * 100}%` }} />
          </span>
        )}
      </span>
      <span role="cell" className="cell-balance num">
        <span className="mobile-label">Balance</span>
        {balance > 0 && status !== 'void'
          ? <span className="figure">{formatMoney(balance, inv.currency)}</span>
          : <span className="figure is-nil">—</span>}
      </span>
      <span role="cell" className="cell-status"><StatusBadge status={status} /></span>
      <span role="cell" className="cell-actions">
        <button type="button" className="send-btn" onClick={onMail} aria-label={`Email ${inv.number || 'document'}`}>
          <Mail aria-hidden /><span>Send</span>
        </button>
      </span>
    </div>
  );
}

/** One summary card on the dashboard. */
function StatCard({ icon, label, count, value, caption, foot, progress = null, tone = '' }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-top">
        <span className="stat-icon">{icon}</span>
        <span className="stat-label">{label}</span>
        <span className="stat-count">{count}</span>
      </div>
      <p className="stat-value">{value}</p>
      <p className="stat-caption">{caption}</p>
      {progress !== null && (
        <span className="stat-bar" aria-hidden><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>
      )}
      <div className="stat-foot">{foot}</div>
    </div>
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

  // A filter whose chip is gone (nothing left with that status) falls back to All.
  const active = counts[filter] ? filter : 'all';

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (active !== 'all' && r.status !== active) return false;
      if (!q) return true;
      const { inv } = r;
      return [inv.number, inv.to?.company, inv.to?.contact, inv.to?.email, inv.reference,
        ...(inv.services ?? []).map((sv) => sv.name)]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [rows, query, active]);

  const open = rows.filter((r) => ['unpaid', 'partial', 'advance', 'overdue'].includes(r.status));
  const outstanding = byCurrency(open, (r) => r.totals.balance);
  const overdueRows = rows.filter((r) => r.status === 'overdue');
  const overdue = byCurrency(overdueRows, (r) => r.totals.balance);

  const today = todayISO();
  const quotes = rows.filter((r) => r.inv.kind === 'quotation');
  const quoteOpen = quotes.filter((r) => r.status === 'quoted');
  const quoteOpenValue = byCurrency(quoteOpen, (r) => r.totals.total);
  const quoteWon = quotes.filter((r) => ['partial', 'advance', 'paid'].includes(r.status)).length;
  const quoteExpired = quotes.filter((r) => r.status === 'expired').length;

  const invoiceRows = rows.filter((r) => r.inv.kind !== 'quotation');
  const issuedInvoices = invoiceRows.filter((r) => !['draft', 'void'].includes(r.status));
  const invoiced = byCurrency(issuedInvoices, (r) => r.totals.total);
  const paidInvoices = issuedInvoices.filter((r) => r.status === 'paid').length;

  const nextDue = open
    .map((r) => ({ ...r, days: daysBetween(today, pendingPayment(r.inv, r.totals).date) }))
    .filter((r) => r.days !== null)
    .sort((a, b) => a.days - b.days)[0];
  const oldestLate = Math.max(0, ...overdueRows.map((r) => -(daysBetween(today, r.inv.dueDate) ?? 0)));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Cybervex Digital</p>
          <h1>Invoices</h1>
        </div>
      </div>

      <section className="stats" aria-label="Summary">
        <StatCard
          icon={<FileText aria-hidden />}
          label="Quotations"
          count={quotes.length}
          value={<MoneyList entries={quoteOpenValue} empty="No open quotes" />}
          caption="Open quotation value"
          foot={<>
            <span><b>{quoteOpen.length}</b> open</span>
            <span><b>{quoteWon}</b> accepted</span>
            <span><b>{quoteExpired}</b> expired</span>
          </>}
        />
        <StatCard
          icon={<Receipt aria-hidden />}
          label="Invoices"
          count={invoiceRows.length}
          value={<MoneyList entries={invoiced} empty="Nothing issued" />}
          caption="Total invoiced"
          progress={issuedInvoices.length ? paidInvoices / issuedInvoices.length : null}
          foot={<>
            <span><b>{paidInvoices}</b> of {issuedInvoices.length} paid</span>
            <span><b>{counts.draft ?? 0}</b> draft{counts.draft === 1 ? '' : 's'}</span>
          </>}
        />
        <StatCard
          tone="dark"
          icon={<Clock aria-hidden />}
          label="Pending payments"
          count={open.length}
          value={<MoneyList entries={outstanding} empty="All settled" />}
          caption="Outstanding balance"
          foot={nextDue
            ? <span>Next: <b>{nextDue.inv.to?.company || nextDue.inv.number}</b> · {dueText(nextDue.days)}</span>
            : <span>No payments waiting</span>}
        />
        <StatCard
          tone={overdueRows.length ? 'danger' : 'ok'}
          icon={overdueRows.length ? <TriangleAlert aria-hidden /> : <CircleCheck aria-hidden />}
          label="Overdue"
          count={overdueRows.length}
          value={<MoneyList entries={overdue} empty="Nothing overdue" />}
          caption={overdueRows.length ? 'Past the due date' : 'Every invoice is on time'}
          foot={overdueRows.length
            ? <span>Oldest <b>{oldestLate} day{oldestLate === 1 ? '' : 's'}</b> late</span>
            : <span>Keep it up</span>}
        />
      </section>

      <RevenueChart invoices={invoices} today={today} defaultCurrency={settings.defaultCurrency} settings={settings} onError={(m) => showToast(m, 'error')} />

      <PendingPayments rows={open} />

      <section className="history" aria-labelledby="history-title">
        <div className="history-head">
          <div>
            <h2 id="history-title" className="history-title">History</h2>
            <p className="history-sub">
              {rows.length} document{rows.length === 1 ? '' : 's'} · {quotes.length} quotation{quotes.length === 1 ? '' : 's'}
            </p>
          </div>
          <label className="search">
            <Search aria-hidden />
            <span className="visually-hidden">Search invoices and quotations</span>
            <input type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>

        <div className="tabs-filter" role="group" aria-label="Filter by status">
          {FILTERS.filter((f) => f === 'all' || counts[f]).map((f) => (
            <button key={f} type="button" aria-pressed={active === f} onClick={() => setFilter(f)}>
              {FILTER_LABEL[f]}<span className="tab-count">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="ledger" role="table" aria-label="Invoice and quotation history">
          <div className="ledger-row ledger-head" role="row">
            <span role="columnheader">Document</span>
            <span role="columnheader">Client</span>
            <span role="columnheader">Issued</span>
            <span role="columnheader">Due</span>
            <span role="columnheader" className="num">Total</span>
            <span role="columnheader" className="num">Balance</span>
            <span role="columnheader">Status</span>
            <span role="columnheader"><span className="visually-hidden">Actions</span></span>
          </div>

          {visible.map(({ inv, totals, status }) => (
            <HistoryRow key={inv.id} inv={inv} totals={totals} status={status} today={today} onMail={() => setMailing(inv)} />
          ))}

          {rows.length === 0 && (
            <div className="empty">
              <h2>No invoices yet</h2>
              <p>Create your first Cybervex Digital invoice. Drafts are saved in this browser</p>
              <button type="button" className="btn btn-primary" onClick={() => navigate('/new')}>
                <Plus aria-hidden /> New invoice
              </button>
            </div>
          )}
          {rows.length > 0 && visible.length === 0 && (
            <div className="empty"><p>Nothing matches “{query.trim() || FILTER_LABEL[active]}”</p></div>
          )}
        </div>
      </section>

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

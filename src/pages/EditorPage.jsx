import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Ban, Check, Copy, Download, Ellipsis, FileText, Plus, Printer, Receipt, RotateCcw, Save, Trash2, X,
} from 'lucide-react';
import InvoiceDocument from '../components/InvoiceDocument';
import { Field, Menu, ScaledPreview, StatusBadge, TextArea, flash, useToast } from '../components/ui';
import { PAYMENT_TERMS, addDays, dueDateForTerms, formatDate, isValidISO, todayISO } from '../lib/dates';
import { ADVANCE_WHEN, advanceWhenLabel, duplicateInvoice, emptyService, newAdvance, newInvoice, normalizeInvoice, uid } from '../lib/defaults';
import { currencyOptions, formatDecimal, formatMoney, minorToInput, toMinor } from '../lib/money';
import { isDuplicateNumber, nextInvoiceNumber } from '../lib/numbering';
import { navigate, setNavigationGuard } from '../lib/router';
import { CATEGORY_NAMES, SERVICE_CATALOG, SERVICE_NAMES } from '../lib/services';
import { deleteInvoice, getState, saveInvoice, useStore } from '../lib/storage';
import { buildReceipt, buildView } from '../lib/view';

const CURRENCIES = currencyOptions();
const ADVANCE_PRESETS = ['25', '30', '40', '50', '60', '75'];
const METHODS = ['Bank transfer', 'Card', 'PayPal', 'Wise', 'Payoneer', 'Cash', 'Cheque', 'Other'];

function nextNumber() {
  const { invoices, settings } = getState();
  return nextInvoiceNumber(invoices, settings.counters, settings.invoicePrefix, new Date().getFullYear());
}

/** What still blocks issuing. Drafts may be incomplete; issued invoices may not. */
function issueProblems(inv, totals, invoices) {
  const p = [];
  const blank = (v) => !v?.trim();
  if (blank(inv.number)) p.push('Invoice number');
  else if (isDuplicateNumber(inv.number, invoices, inv.id)) p.push('A unique invoice number (this one is already used)');
  if (blank(inv.from.legalName)) p.push('Your legal business name');
  if (blank(inv.from.address)) p.push('Your business address');
  if (blank(inv.from.email)) p.push('Your business email');
  if (blank(inv.to.company)) p.push('Client or company name');
  if (blank(inv.to.address)) p.push('Client billing address');
  if (!isValidISO(inv.issueDate)) p.push('A valid issue date');
  if (!isValidISO(inv.dueDate) || inv.dueDate < inv.issueDate) p.push('A due date on or after the issue date');
  if (!inv.services.some((sv) => !blank(sv.name))) p.push('At least one service');
  if (Object.keys(totals.errors).length) p.push('Fix the highlighted amounts');
  else if (totals.subtotal <= 0) p.push('An overall budget (or service prices) greater than zero');
  if (totals.errors.advance) p.push('A valid advance percentage (or turn the advance off)');
  const adv = inv.advance;
  if (adv?.enabled && adv.when === 'date'
    && (!isValidISO(adv.date) || adv.date < inv.issueDate || (isValidISO(inv.dueDate) && adv.date > inv.dueDate))) {
    p.push('An advance due date between the issue date and the final payment date');
  }
  if (blank(inv.paymentDetails) && blank(inv.paymentInstructions)) p.push('Payment details or payment instructions');
  return p;
}

const isCustom = (sv) => sv.custom || (sv.name.trim() && !SERVICE_NAMES.has(sv.name));

function safeFilename(s) {
  return s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilename(name) || 'document'}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export default function EditorPage({ id }) {
  const { invoices, settings } = useStore();
  const stored = id ? invoices.find((i) => i.id === id) : null;

  const [draft, setDraft] = useState(() => (stored ? normalizeInvoice(structuredClone(stored)) : newInvoice(settings, nextNumber())));
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const [tab, setTab] = useState('edit');
  const [problems, setProblems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toastNode, toast] = useToast();

  const isNew = !stored;
  const dirty = JSON.stringify(draft) !== baseline;
  const view = useMemo(() => buildView(draft, settings), [draft, settings]);
  const { totals, status } = view;

  useEffect(() => {
    if (!dirty) return undefined;
    setNavigationGuard(() => window.confirm('You have unsaved changes. Leave without saving?'));
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      setNavigationGuard(null);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [dirty]);

  // ---- client reuse --------------------------------------------------------
  const pastClients = useMemo(() => {
    const seen = new Map();
    for (const inv of invoices) {
      const key = inv.to?.company?.trim().toLowerCase();
      if (key && inv.id !== draft.id && !seen.has(key)) seen.set(key, inv.to);
    }
    return [...seen.values()];
  }, [invoices, draft.id]);

  if (id && !stored) {
    return (
      <div className="page">
        <div className="empty">
          <h2>Invoice not found</h2>
          <p>It may have been deleted in another tab.</p>
          <button type="button" className="btn" onClick={() => navigate('/', { force: true })}>Back to invoices</button>
        </div>
      </div>
    );
  }

  // ---- state helpers -------------------------------------------------------
  const update = (fn) => setDraft((d) => fn(structuredClone(d)));
  const setField = (key, value) => update((d) => { d[key] = value; return d; });
  const setIn = (group, key, value) => update((d) => { d[group][key] = value; return d; });
  const setListItem = (list, itemId, key, value) =>
    update((d) => { d[list] = d[list].map((x) => (x.id === itemId ? { ...x, [key]: value } : x)); return d; });
  const removeListItem = (list, itemId) => update((d) => { d[list] = d[list].filter((x) => x.id !== itemId); return d; });

  const setIssueDate = (v) => update((d) => {
    d.issueDate = v;
    const due = dueDateForTerms(v, d.terms);
    if (due) d.dueDate = due;
    return d;
  });
  const setTerms = (v) => update((d) => {
    d.terms = v;
    const due = dueDateForTerms(d.issueDate, v);
    if (due) d.dueDate = due;
    if (v === 'custom' && !d.customTerms) d.customTerms = '';
    return d;
  });
  const setDueDate = (v) => update((d) => {
    d.dueDate = v;
    // Keep the printed terms honest when the due date is edited by hand.
    const preset = PAYMENT_TERMS.find((t) => t.days !== null && addDays(d.issueDate, t.days) === v);
    if (preset) d.terms = preset.value;
    else if (d.terms !== 'custom') {
      d.terms = 'custom';
      d.customTerms = 'Due by date shown';
    }
    return d;
  });

  // Complete services (the 23 categories) are toggled with checkboxes.
  const chosenCategories = new Set(draft.services.map((sv) => sv.name).filter((n) => CATEGORY_NAMES.has(n)));
  const allCategories = chosenCategories.size === CATEGORY_NAMES.size;
  const toggleCategory = (name) => update((d) => {
    d.services = d.services.some((sv) => sv.name === name)
      ? d.services.filter((sv) => sv.name !== name)
      : [...d.services, { id: uid(), name }];
    return d;
  });
  const toggleAllCategories = () => update((d) => {
    if (allCategories) d.services = d.services.filter((sv) => !CATEGORY_NAMES.has(sv.name));
    else {
      const have = new Set(d.services.map((sv) => sv.name));
      for (const g of SERVICE_CATALOG) if (!have.has(g.category)) d.services.push({ id: uid(), name: g.category });
    }
    return d;
  });

  // ---- persistence ---------------------------------------------------------
  const persist = (inv, message) => {
    try {
      const saved = saveInvoice(inv);
      setDraft(saved);
      setBaseline(JSON.stringify(saved));
      setProblems(null);
      if (isNew) {
        flash(message);
        navigate(`/invoice/${saved.id}`, { force: true });
      } else toast(message);
      return saved;
    } catch (e) {
      toast(e.message, 'error');
      return null;
    }
  };

  const save = () => persist(draft, draft.state === 'draft' ? 'Draft saved' : 'Invoice saved');

  const issue = () => {
    const p = issueProblems(draft, totals, invoices);
    if (p.length) {
      setProblems(p);
      setTab('edit');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    persist({ ...draft, state: 'issued', issuedAt: new Date().toISOString() }, `Invoice ${draft.number} issued`);
  };

  const revertToDraft = () => {
    if (totals.paid > 0) return;
    persist({ ...draft, state: 'draft', issuedAt: null }, 'Returned to draft');
  };

  const voidInvoice = () => {
    if (!window.confirm(`Void invoice ${draft.number}? It stays in your history, marked void, and its number is not reused.`)) return;
    persist({ ...draft, state: 'void', voidedAt: new Date().toISOString() }, 'Invoice voided');
  };

  const remove = () => {
    if (!window.confirm(`Delete draft ${draft.number}? This cannot be undone.`)) return;
    deleteInvoice(draft.id);
    navigate('/', { force: true });
  };

  const duplicate = () => {
    if (!stored) return;
    if (dirty && !window.confirm('Duplicate the last saved version? Unsaved changes on this invoice are not included.')) return;
    try {
      const copy = saveInvoice(duplicateInvoice(stored, nextNumber()));
      flash(`Duplicated as ${copy.number} (draft)`);
      navigate(`/invoice/${copy.id}`, { force: true });
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // Something received and something still pending: a balance invoice makes sense.
  const canBalance = draft.state === 'issued' && totals.paid > 0 && totals.balance > 0;

  const downloadPdf = async ({ balance = false } = {}) => {
    setBusy(true);
    try {
      const { renderInvoicePdf } = await import('../components/InvoicePdf');
      const blob = await renderInvoicePdf(balance ? buildView(draft, settings, undefined, { balance: true }) : view);
      saveBlob(blob, [draft.number, balance && 'Balance', draft.to.company].filter(Boolean).join(' - '));
    } catch (e) {
      console.error(e);
      toast('Could not create the PDF. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const print = () => {
    const title = document.title;
    document.title = safeFilename([draft.number, draft.to.company].filter(Boolean).join(' - '));
    window.addEventListener('afterprint', () => { document.title = title; }, { once: true });
    window.print();
  };

  const err = totals.errors;

  return (
    <>
      <div className="editor-bar">
        <div className="title">
          <button type="button" className="icon-btn" aria-label="Back to invoices" onClick={() => navigate('/')}>
            <ArrowLeft />
          </button>
          <h1>{isNew ? 'New invoice' : draft.number}</h1>
          <StatusBadge status={status} />
          {dirty && !isNew && <span className="dirty">Unsaved changes</span>}
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={save} aria-label={draft.state === 'draft' ? 'Save draft' : 'Save'}>
            <Save aria-hidden /><span className="btn-label">{draft.state === 'draft' ? 'Save draft' : 'Save'}</span>
          </button>
          {draft.state === 'draft' && (
            <button type="button" className="btn btn-primary" onClick={issue} aria-label="Issue invoice">
              <Check aria-hidden /><span className="btn-label">Issue invoice</span>
            </button>
          )}
          <button type="button" className="btn" onClick={() => downloadPdf()} disabled={busy} aria-label="Download PDF">
            <Download aria-hidden /><span className="btn-label">{busy ? 'Preparing…' : 'Download PDF'}</span>
          </button>
          <button type="button" className="btn" onClick={print} aria-label="Print invoice">
            <Printer aria-hidden /><span className="btn-label">Print</span>
          </button>
          <Menu label="More" icon={<Ellipsis aria-hidden />}>
            <button type="button" role="menuitem" onClick={duplicate} disabled={!stored}>
              <Copy aria-hidden /> Duplicate invoice
            </button>
            <button type="button" role="menuitem" onClick={() => downloadPdf({ balance: true })} disabled={!canBalance || busy}
              title={canBalance ? undefined : 'Available once a payment is recorded and a balance is still pending'}>
              <FileText aria-hidden /> Download balance invoice
            </button>
            {draft.state === 'issued' && (
              <button type="button" role="menuitem" onClick={revertToDraft} disabled={totals.paid > 0 || isNew}>
                <RotateCcw aria-hidden /> Return to draft
              </button>
            )}
            {draft.state === 'issued' && (
              <button type="button" role="menuitem" className="danger" onClick={voidInvoice}>
                <Ban aria-hidden /> Void invoice
              </button>
            )}
            {draft.state === 'draft' && !isNew && (
              <>
                <hr />
                <button type="button" role="menuitem" className="danger" onClick={remove}>
                  <Trash2 aria-hidden /> Delete draft
                </button>
              </>
            )}
          </Menu>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Editor view">
        <button type="button" role="tab" className="chip" aria-selected={tab === 'edit'} aria-pressed={tab === 'edit'} onClick={() => setTab('edit')}>Edit</button>
        <button type="button" role="tab" className="chip" aria-selected={tab === 'preview'} aria-pressed={tab === 'preview'} onClick={() => setTab('preview')}>Preview</button>
      </div>

      <div className="editor" data-tab={tab}>
        <form className="editor-form" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          {problems && (
            <div className="callout danger" role="alert">
              <strong>Complete these before issuing:</strong>
              <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          {draft.state === 'void' && (
            <div className="callout">This invoice is void. It is kept for your records and cannot be issued again; duplicate it to start a new one.</div>
          )}

          <section className="section">
            <div className="section-head"><h2>Invoice</h2></div>
            <div className="grid grid-2">
              <Field
                label="Invoice number"
                value={draft.number}
                onChange={(e) => setField('number', e.target.value)}
                error={isDuplicateNumber(draft.number, invoices, draft.id) ? 'Already used by another invoice' : !draft.number.trim() ? 'Required' : null}
                hint="Generated automatically; must be unique"
              />
              <Field label="Currency">
                <select value={draft.currency} onChange={(e) => setField('currency', e.target.value)}>
                  <optgroup label="Common">
                    {CURRENCIES.common.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}
                  </optgroup>
                  <optgroup label="All currencies">
                    {CURRENCIES.rest.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}
                  </optgroup>
                </select>
              </Field>
              <Field label="Issue date" type="date" value={draft.issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              <Field label="Payment terms">
                <select value={draft.terms} onChange={(e) => setTerms(e.target.value)}>
                  {PAYMENT_TERMS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field
                label="Due date"
                type="date"
                value={draft.dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                error={isValidISO(draft.dueDate) && draft.dueDate < draft.issueDate ? 'Due date is before the issue date' : null}
              />
              {draft.terms === 'custom' && (
                <Field label="Custom terms text" value={draft.customTerms} onChange={(e) => setField('customTerms', e.target.value)} placeholder="e.g. 50% upfront, 50% on delivery" />
              )}
            </div>
          </section>

          <section className="section">
            <div className="section-head"><h2>Billed to</h2>
              {pastClients.length > 0 && (
                <select
                  className="btn"
                  aria-label="Fill from a previous client"
                  value=""
                  onChange={(e) => {
                    const c = pastClients[Number(e.target.value)];
                    if (c) update((d) => { d.to = { ...structuredClone(c) }; return d; });
                  }}
                >
                  <option value="">Previous clients…</option>
                  {pastClients.map((c, i) => <option key={i} value={i}>{c.company}</option>)}
                </select>
              )}
            </div>
            <div className="grid grid-2">
              <Field label="Client / company name" value={draft.to.company} onChange={(e) => setIn('to', 'company', e.target.value)} />
              <Field label="Contact person (optional)" value={draft.to.contact} onChange={(e) => setIn('to', 'contact', e.target.value)} />
              <TextArea className="span-2" label="Billing address" rows={3} value={draft.to.address} onChange={(e) => setIn('to', 'address', e.target.value)} placeholder={'Street\nCity, postcode\nCountry'} />
              <Field className="span-2" label="Email" type="email" value={draft.to.email} onChange={(e) => setIn('to', 'email', e.target.value)} />
              <Field label="Client tax label" value={draft.to.taxLabel} onChange={(e) => setIn('to', 'taxLabel', e.target.value)} hint="e.g. VAT, GST, EIN, NTN" />
              <Field label="Client tax ID (if applicable)" value={draft.to.taxId} onChange={(e) => setIn('to', 'taxId', e.target.value)} />
            </div>
          </section>

          <section className="section">
            <div className="section-head"><h2>Services</h2></div>
            <p className="section-note">Tick complete services, add specific ones from the list, or type a new one. Each appears as its own line on the invoice.</p>

            <div className="subhead">
              <span>Complete services</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={toggleAllCategories}>
                {allCategories ? 'Clear all' : `Select all ${CATEGORY_NAMES.size}`}
              </button>
            </div>
            <div className="svc-cats">
              {SERVICE_CATALOG.map((g, n) => (
                <label key={g.category} className="check">
                  <input type="checkbox" checked={chosenCategories.has(g.category)} onChange={() => toggleCategory(g.category)} />
                  <span><span className="muted">{String(n + 1).padStart(2, '0')}.</span> {g.category}</span>
                </label>
              ))}
            </div>

            <div className="subhead"><span>Specific &amp; custom services</span></div>
            {draft.services.filter((sv) => !CATEGORY_NAMES.has(sv.name)).map((sv, i) => (
              <div className="sub-row service-row" key={sv.id}>
                {isCustom(sv) ? (
                  <Field label={`Custom service ${i + 1}`} value={sv.name} placeholder="Type the service name" autoFocus={!sv.name}
                    onChange={(e) => setListItem('services', sv.id, 'name', e.target.value)} />
                ) : (
                  <Field label={`Service ${i + 1}`}>
                    <select value={sv.name} onChange={(e) => setListItem('services', sv.id, 'name', e.target.value)}>
                      <option value="">Select a service…</option>
                      {SERVICE_CATALOG.map((g, n) => (
                        <optgroup key={g.category} label={`${String(n + 1).padStart(2, '0')}. ${g.category}`}>
                          {g.services.map((s) => <option key={s} value={s}>{s}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </Field>
                )}
                <button type="button" className="icon-btn" aria-label={`Remove service ${i + 1}`} onClick={() => removeListItem('services', sv.id)}><X /></button>
              </div>
            ))}
            <div className="toolbar">
              <button type="button" className="btn" onClick={() => update((d) => { d.services.push(emptyService()); return d; })}>
                <Plus aria-hidden /> Add service
              </button>
              <button type="button" className="btn" onClick={() => update((d) => { d.services.push(emptyService(true)); return d; })}>
                <Plus aria-hidden /> Add custom service
              </button>
            </div>
            {draft.services.some((sv) => sv.name.trim()) && (
              <>
                <div className="subhead"><span>Prices (optional)</span></div>
                <p className="section-note" style={{ marginTop: 0 }}>
                  Price each service to show it on its line. The budget then becomes their total.
                </p>
                <div className="price-list">
                  {draft.services.filter((sv) => sv.name.trim()).map((sv) => (
                    <label key={sv.id} className={`price-row ${err[`service.${sv.id}`] ? 'invalid' : ''}`}>
                      <span>{sv.name}</span>
                      <input inputMode="numeric" value={sv.price ?? ''} placeholder="—" aria-label={`Price for ${sv.name}`}
                        onChange={(e) => setListItem('services', sv.id, 'price', e.target.value)} />
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className="grid grid-2">
              {totals.servicesTotal > 0 ? (
                <Field label={`Overall budget (${draft.currency})`} readOnly value={formatMoney(totals.subtotal, draft.currency)}
                  error={Object.keys(err).some((k) => k.startsWith('service.')) ? 'Prices must be whole numbers' : null}
                  hint="Total of the service prices above" />
              ) : (
                <Field label={`Overall budget (${draft.currency})`} inputMode="numeric" value={draft.budget} placeholder="0"
                  onChange={(e) => setField('budget', e.target.value)} error={err.budget}
                  hint="Total price for all services, before discount and tax" />
              )}
              <Field label="Reference / PO number (optional)" value={draft.reference} onChange={(e) => setField('reference', e.target.value)} />
            </div>
          </section>

          <section className="section">
            <div className="section-head"><h2>Discount, tax &amp; charges</h2></div>
            <p className="section-note">Tax is never assumed. Add only the taxes that apply to this client and service.</p>

            <div className="sub-row" style={{ gridTemplateColumns: 'auto 1fr' }}>
              <div className="seg" role="group" aria-label="Discount type">
                <button type="button" aria-pressed={draft.discount.type === 'percent'} onClick={() => setIn('discount', 'type', 'percent')}>%</button>
                <button type="button" aria-pressed={draft.discount.type === 'amount'} onClick={() => setIn('discount', 'type', 'amount')}>{draft.currency}</button>
              </div>
              <Field label={draft.discount.type === 'percent' ? 'Discount (%)' : `Discount (${draft.currency})`} inputMode="decimal"
                value={draft.discount.value} placeholder="0" onChange={(e) => setIn('discount', 'value', e.target.value)} error={err.discount} />
            </div>

            {draft.taxes.map((t) => (
              <div className="sub-row" key={t.id}>
                <Field label="Tax name" value={t.label} placeholder="e.g. VAT, GST, Sales tax" onChange={(e) => setListItem('taxes', t.id, 'label', e.target.value)} />
                <Field label="Rate (%)" inputMode="decimal" value={t.rate} onChange={(e) => setListItem('taxes', t.id, 'rate', e.target.value)} error={err[`tax.${t.id}`] && 'Invalid'} />
                <button type="button" className="icon-btn" aria-label="Remove tax" onClick={() => removeListItem('taxes', t.id)}><X /></button>
              </div>
            ))}
            {draft.charges.map((c) => (
              <div className="sub-row" key={c.id}>
                <Field label="Additional charge" value={c.label} placeholder="e.g. Hosting, expenses" onChange={(e) => setListItem('charges', c.id, 'label', e.target.value)} />
                <Field label={`Amount (${draft.currency})`} inputMode="decimal" value={c.amount} onChange={(e) => setListItem('charges', c.id, 'amount', e.target.value)} error={err[`charge.${c.id}`] && 'Invalid'} />
                <button type="button" className="icon-btn" aria-label="Remove charge" onClick={() => removeListItem('charges', c.id)}><X /></button>
              </div>
            ))}
            <div className="toolbar">
              <button type="button" className="btn" onClick={() => update((d) => { d.taxes.push({ id: uid(), label: '', rate: '' }); return d; })}>
                <Plus aria-hidden /> Add tax
              </button>
              <button type="button" className="btn" onClick={() => update((d) => { d.charges.push({ id: uid(), label: '', amount: '' }); return d; })}>
                <Plus aria-hidden /> Add charge
              </button>
            </div>

            <div className="calc" aria-label="Calculation breakdown">
              <div><span>Budget</span><span>{formatMoney(totals.subtotal, draft.currency)}</span></div>
              {totals.discount > 0 && <div><span>Discount</span><span>−{formatMoney(totals.discount, draft.currency)}</span></div>}
              {draft.taxes.length > 0 && <div><span>Taxable amount</span><span>{formatMoney(totals.taxableBase, draft.currency)}</span></div>}
              {draft.taxes.map((t) => (
                <div key={t.id}><span>{t.label || 'Tax'} ({t.rate || 0}%)</span><span>{formatMoney(totals.taxes[t.id] ?? 0, draft.currency)}</span></div>
              ))}
              {totals.chargeTotal > 0 && <div><span>Additional charges (not taxed)</span><span>{formatMoney(totals.chargeTotal, draft.currency)}</span></div>}
              <div className="total"><span>Total</span><span>{formatMoney(totals.total, draft.currency)}</span></div>
              {totals.paid > 0 && <div><span>Amount paid</span><span>−{formatMoney(totals.paid, draft.currency)}</span></div>}
              <div className="total"><span>Balance due</span><span>{formatMoney(totals.balance, draft.currency)}</span></div>
            </div>
          </section>

          <Advance draft={draft} totals={totals} update={update} setDueDate={setDueDate} />

          <Payments draft={draft} totals={totals} onSave={persist} settings={settings} toast={toast} />

          <section className="section">
            <div className="section-head"><h2>Payment details &amp; notes</h2></div>
            <div className="grid">
              <TextArea label="Payment details (bank / account)" rows={4} value={draft.paymentDetails}
                onChange={(e) => setField('paymentDetails', e.target.value)}
                hint="Enter verified details only. Defaults come from Settings." />
              <TextArea label="Payment instructions (optional)" rows={2} value={draft.paymentInstructions}
                onChange={(e) => setField('paymentInstructions', e.target.value)} placeholder="e.g. Please include the invoice number as the payment reference." />
              <TextArea label="Notes (optional)" rows={3} value={draft.notes} onChange={(e) => setField('notes', e.target.value)} />
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>Billed from</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setField('from', { ...settings.business })}>
                <RotateCcw aria-hidden /> Reset from Settings
              </button>
            </div>
            <p className="section-note">Copied from Settings when the invoice is created. Changes here apply to this invoice only.</p>
            <div className="grid grid-2">
              <Field label="Legal business name" value={draft.from.legalName} onChange={(e) => setIn('from', 'legalName', e.target.value)} />
              <Field label="Email" type="email" value={draft.from.email} onChange={(e) => setIn('from', 'email', e.target.value)} />
              <TextArea className="span-2" label="Business address" rows={3} value={draft.from.address} onChange={(e) => setIn('from', 'address', e.target.value)} />
              <Field label="Phone" value={draft.from.phone} onChange={(e) => setIn('from', 'phone', e.target.value)} />
              <Field label="Website" value={draft.from.website} onChange={(e) => setIn('from', 'website', e.target.value)} />
              <Field label="Tax label" value={draft.from.taxLabel} onChange={(e) => setIn('from', 'taxLabel', e.target.value)} />
              <Field label="Tax ID (if applicable)" value={draft.from.taxId} onChange={(e) => setIn('from', 'taxId', e.target.value)} />
            </div>
          </section>
        </form>

        <aside className="editor-preview" aria-label="Invoice preview">
          <div className="sticky">
            <ScaledPreview>
              <InvoiceDocument view={view} />
            </ScaledPreview>
          </div>
        </aside>
      </div>

      {createPortal(<div className="print-only"><InvoiceDocument view={view} /></div>, document.body)}
      {toastNode}
    </>
  );
}

function Advance({ draft, totals, update, setDueDate }) {
  const adv = draft.advance ?? newAdvance();
  const set = (key, value) => update((d) => { d.advance = { ...newAdvance(), ...d.advance, [key]: value }; return d; });
  const error = totals.errors.advance;
  const money = (v) => formatMoney(v, draft.currency);
  const shown = totals.advance > 0;

  return (
    <section className="section">
      <div className="section-head">
        <h2>Advance payment</h2>
        <label className="switch">
          <input type="checkbox" role="switch" checked={!!adv.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          <span aria-hidden />
          <span className="visually-hidden">Request an advance payment</span>
        </label>
      </div>
      {!adv.enabled ? (
        <p className="section-note" style={{ marginBottom: 0 }}>
          Ask for part of the total up front. The invoice then shows a two-step payment schedule and the amount due now.
        </p>
      ) : (
        <>
          <div className="chips adv-presets" role="group" aria-label="Advance percentage">
            {ADVANCE_PRESETS.map((p) => (
              <button key={p} type="button" className="chip" aria-pressed={adv.percent.trim() === p} onClick={() => set('percent', p)}>{p}%</button>
            ))}
          </div>
          <div className="grid grid-2">
            <Field label="Advance (%)" inputMode="decimal" value={adv.percent} placeholder="e.g. 50"
              onChange={(e) => set('percent', e.target.value)} error={error} />
            <Field label="When is it due?">
              <select value={adv.when} onChange={(e) => set('when', e.target.value)}>
                {ADVANCE_WHEN.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </Field>
            {adv.when === 'date' && (
              <Field label="Advance due date" type="date" value={adv.date ?? ''} min={draft.issueDate}
                onChange={(e) => set('date', e.target.value)}
                error={!isValidISO(adv.date) ? 'Pick a date'
                  : adv.date < draft.issueDate ? 'Before the issue date'
                    : isValidISO(draft.dueDate) && adv.date > draft.dueDate ? 'After the final payment date' : null} />
            )}
            <Field label="Final payment due date" type="date" value={draft.dueDate} min={adv.when === 'date' ? adv.date || draft.issueDate : draft.issueDate}
              onChange={(e) => setDueDate(e.target.value)} hint="Same as the invoice due date" />
          </div>

          {shown && (
            <div className="adv-card" aria-label="Payment split">
              <div className="adv-bar" aria-hidden>
                <span className="adv-bar-advance" style={{ flexGrow: totals.advancePercent }}>
                  <i style={{ width: `${(totals.advancePaid / totals.advance) * 100}%` }} />
                </span>
                <span style={{ flexGrow: totals.finalPercent }}>
                  <i style={{ width: `${totals.finalPayment > 0 ? (totals.finalPaid / totals.finalPayment) * 100 : 0}%` }} />
                </span>
              </div>
              <div className="adv-parts">
                <div>
                  <span className="adv-tag">01 · Advance {formatDecimal(adv.percent)}%</span>
                  <strong>{money(totals.advance)}</strong>
                  <small>
                    {totals.advanceOutstanding <= 0 ? 'Received ✓'
                      : totals.advancePaid > 0 ? `${money(totals.advancePaid)} received`
                        : advanceWhenLabel(adv)}
                  </small>
                </div>
                <div>
                  <span className="adv-tag">02 · Final {formatDecimal(String(totals.finalPercent))}%</span>
                  <strong>{money(totals.finalPayment)}</strong>
                  <small>{totals.finalPaid >= totals.finalPayment && totals.finalPayment > 0 ? 'Received ✓'
                    : draft.dueDate ? `Due by ${formatDate(draft.dueDate)}` : 'Due on completion'}</small>
                </div>
              </div>
            </div>
          )}
          {!shown && !error && <p className="muted small" style={{ marginTop: 12 }}>Enter a budget to see the split.</p>}
        </>
      )}
    </section>
  );
}

function Payments({ draft, totals, onSave, settings, toast }) {
  const [form, setForm] = useState(null);
  const [printing, setPrinting] = useState(null);

  const downloadReceipt = async (p) => {
    setPrinting(p.id);
    try {
      const { renderReceiptPdf } = await import('../components/InvoicePdf');
      const receipt = buildReceipt(draft, settings, p.id);
      saveBlob(await renderReceiptPdf(receipt), [receipt.number, 'Receipt', draft.to.company].filter(Boolean).join(' - '));
    } catch (e) {
      console.error(e);
      toast('Could not create the receipt. Please try again.', 'error');
    } finally {
      setPrinting(null);
    }
  };
  const canRecord = draft.state === 'issued' && totals.balance > 0;

  const start = () => setForm({
    date: todayISO(),
    // Suggest the outstanding advance first, then the remaining balance.
    amount: minorToInput(Math.max(totals.advanceOutstanding > 0 ? totals.advanceOutstanding : totals.balance, 0)),
    method: 'Bank transfer',
    reference: '',
    confirmed: false,
  });

  const amountMinor = form ? toMinor(form.amount, draft.currency) : null;
  const amountError = form && (amountMinor === null || amountMinor <= 0n
    ? 'Enter an amount greater than zero'
    : Number(amountMinor) > totals.balance ? 'More than the balance due' : null);
  const dateError = form && (!isValidISO(form.date) ? 'Enter a valid date' : form.date > todayISO() ? 'Cannot be in the future' : null);

  const record = () => {
    if (amountError || dateError || !form.confirmed) return;
    const payment = { id: uid(), date: form.date, amount: form.amount.trim(), method: form.method, reference: form.reference.trim() };
    const saved = onSave({ ...draft, payments: [...draft.payments, payment] }, 'Payment recorded');
    if (saved) setForm(null);
  };

  const removePayment = (p) => {
    if (!window.confirm(`Remove the ${formatMoney(Number(toMinor(p.amount, draft.currency) ?? 0n), draft.currency)} payment from ${formatDate(p.date)}?`)) return;
    onSave({ ...draft, payments: draft.payments.filter((x) => x.id !== p.id) }, 'Payment removed');
  };

  return (
    <section className="section">
      <div className="section-head"><h2>Payments received</h2></div>
      <p className="section-note">
        This app records payments; it does not process them. Record a payment only after you have confirmed the funds were received.
      </p>
      {draft.payments.length > 0 && (
        <table className="payments-table">
          <tbody>
            {draft.payments.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.date)}</td>
                <td>{p.method}{p.reference && <div className="muted small">{p.reference}</div>}</td>
                <td className="num">{formatMoney(Number(toMinor(p.amount, draft.currency) ?? 0n), draft.currency)}</td>
                <td className="num">
                  <button type="button" className="icon-btn" aria-label="Download receipt" title="Download receipt"
                    disabled={printing === p.id} onClick={() => downloadReceipt(p)}><Receipt /></button>
                  <button type="button" className="icon-btn" aria-label="Remove payment" onClick={() => removePayment(p)}><X /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {draft.state === 'draft' && <p className="muted small">Issue the invoice before recording payments.</p>}
      {draft.state === 'void' && <p className="muted small">Payments cannot be recorded on a void invoice.</p>}
      {draft.state === 'issued' && totals.balance <= 0 && totals.total > 0 && <p className="muted small">Paid in full.</p>}

      {canRecord && !form && (
        <button type="button" className="btn" onClick={start}><Plus aria-hidden /> Record payment</button>
      )}
      {form && (
        <div className="item">
          <div className="grid grid-2">
            <Field label="Date received" type="date" value={form.date} max={todayISO()} onChange={(e) => setForm({ ...form, date: e.target.value })} error={dateError} />
            <Field label={`Amount (${draft.currency})`} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} error={amountError} />
            <Field label="Method">
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Reference (optional)" value={form.reference} placeholder="Transaction ID" onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '14px 0' }}>
            <input type="checkbox" checked={form.confirmed} onChange={(e) => setForm({ ...form, confirmed: e.target.checked })} />
            <span>I confirm this payment has been received.</span>
          </label>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <button type="button" className="btn btn-primary" onClick={record} disabled={!!amountError || !!dateError || !form.confirmed}>
              <Check aria-hidden /> Save payment
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

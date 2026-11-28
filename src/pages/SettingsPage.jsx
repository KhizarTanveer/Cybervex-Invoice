import { useEffect, useRef, useState } from 'react';
import { Download, Plus, Save, Upload, X } from 'lucide-react';
import { Field, TextArea, useToast } from '../components/ui';
import { PAYMENT_TERMS } from '../lib/dates';
import { uid } from '../lib/defaults';
import { currencyOptions } from '../lib/money';
import { nextInvoiceNumber, sanitizePrefix } from '../lib/numbering';
import { setNavigationGuard } from '../lib/router';
import { exportBackup, importBackup, saveSettings, useStore } from '../lib/storage';
import { PRE_SYNC_KEY, syncEnabled } from '../lib/sync';

const CURRENCIES = currencyOptions();

export default function SettingsPage() {
  const { settings, invoices } = useStore();
  const [form, setForm] = useState(() => structuredClone(settings));
  const [baseline, setBaseline] = useState(() => JSON.stringify(settings));
  const [toastNode, toast] = useToast();
  const fileRef = useRef();
  const dirty = JSON.stringify(form) !== baseline;

  useEffect(() => {
    if (dirty) return;
    const latest = JSON.stringify(settings);
    if (latest !== baseline) {
      setForm(structuredClone(settings));
      setBaseline(latest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  useEffect(() => {
    if (!dirty) return undefined;
    setNavigationGuard(() => window.confirm('You have unsaved settings. Leave without saving?'));
    return () => setNavigationGuard(null);
  }, [dirty]);

  const setBiz = (k, v) => setForm((f) => ({ ...f, business: { ...f.business, [k]: v } }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = (e) => {
    e?.preventDefault();
    // Counters are owned by the invoice store; never overwrite them from this form.
    const next = { ...form, invoicePrefix: sanitizePrefix(form.invoicePrefix), counters: settings.counters };
    try {
      saveSettings(next);
      setForm(structuredClone(next));
      setBaseline(JSON.stringify(next));
      toast('Settings saved. New invoices will use these details.');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const saveJson = (json, name) => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  const download = () => saveJson(exportBackup(), `cybervex-invoices-backup-${new Date().toISOString().slice(0, 10)}.json`);

  // The copy taken on this browser just before its first upload to the cloud.
  const preSync = (() => { try { return localStorage.getItem(PRE_SYNC_KEY); } catch { return null; } })();

  const restore = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm('Import this backup? Invoices with the same ID will be replaced; others are kept.')) return;
    try {
      const { imported, skipped } = importBackup(await file.text());
      const fresh = structuredClone(JSON.parse(exportBackup()).settings);
      setForm(fresh);
      setBaseline(JSON.stringify(fresh));
      toast(`Imported ${imported} invoice${imported === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} (duplicate number or invalid)` : ''}.`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const preview = nextInvoiceNumber(invoices, settings.counters, form.invoicePrefix, new Date().getFullYear());
  const b = form.business;

  return (
    <div className="page settings">
      <form onSubmit={save} noValidate>
        <div className="page-head">
          <div>
            <p className="eyebrow">Settings</p>
            <h1>Business profile</h1>
            <p>Defaults for new invoices. Existing invoices keep the details they were created with.</p>
          </div>
          <button type="submit" className="btn btn-primary" disabled={!dirty}><Save aria-hidden /> Save settings</button>
        </div>

        <div className="callout">
          Only enter verified legal, tax and banking information. Empty fields print as clearly marked
          <em> [placeholders]</em> on drafts, and an invoice cannot be issued until the required ones are filled in.
        </div>

        <section className="section">
          <div className="section-head"><h2>Billed from</h2></div>
          <div className="grid grid-2">
            <Field label="Legal business name" value={b.legalName} onChange={(e) => setBiz('legalName', e.target.value)} hint="As registered, e.g. on your business registration" />
            <Field label="Brand name" value={b.brandName} onChange={(e) => setBiz('brandName', e.target.value)} />
            <TextArea className="span-2" label="Business address" rows={3} value={b.address} onChange={(e) => setBiz('address', e.target.value)} />
            <Field label="Email" type="email" value={b.email} onChange={(e) => setBiz('email', e.target.value)} />
            <Field label="Phone" value={b.phone} onChange={(e) => setBiz('phone', e.target.value)} />
            <Field label="Website" value={b.website} onChange={(e) => setBiz('website', e.target.value)} />
            <span />
            <Field label="Tax label" value={b.taxLabel} onChange={(e) => setBiz('taxLabel', e.target.value)} hint="e.g. VAT No., GSTIN, EIN, NTN" />
            <Field label="Tax / registration ID (if applicable)" value={b.taxId} onChange={(e) => setBiz('taxId', e.target.value)} />
          </div>
        </section>

        <section className="section">
          <div className="section-head"><h2>Payment details</h2></div>
          <div className="grid">
            <TextArea label="Bank / payment details" rows={5} value={form.paymentDetails} onChange={(e) => set('paymentDetails', e.target.value)}
              placeholder={'Bank name\nAccount title\nAccount number / IBAN\nSWIFT / BIC'} hint="Printed on every new invoice. Enter verified details only." />
            <TextArea label="Default payment instructions" rows={2} value={form.paymentInstructions} onChange={(e) => set('paymentInstructions', e.target.value)} />
            <TextArea label="Default notes" rows={2} value={form.defaultNotes} onChange={(e) => set('defaultNotes', e.target.value)} placeholder="e.g. Thank you for your business." />
          </div>
        </section>

        <section className="section">
          <div className="section-head"><h2>Invoice defaults</h2></div>
          <div className="grid grid-3">
            <Field label="Number prefix" value={form.invoicePrefix} onChange={(e) => set('invoicePrefix', e.target.value.toUpperCase())} hint={`Next: ${preview}`} />
            <Field label="Currency">
              <select value={form.defaultCurrency} onChange={(e) => set('defaultCurrency', e.target.value)}>
                <optgroup label="Common">{CURRENCIES.common.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}</optgroup>
                <optgroup label="All currencies">{CURRENCIES.rest.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}</optgroup>
              </select>
            </Field>
            <Field label="Payment terms">
              <select value={form.defaultTerms} onChange={(e) => set('defaultTerms', e.target.value)}>
                {PAYMENT_TERMS.filter((t) => t.value !== 'custom').map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-3" style={{ marginTop: 12 }}>
            <Field label="Default advance (%)" inputMode="decimal" value={form.defaultAdvance ?? ''} placeholder="None"
              onChange={(e) => set('defaultAdvance', e.target.value)} hint="Pre-fills new invoices; leave empty for none" />
          </div>

          <p className="section-note" style={{ marginTop: 18 }}>
            Default taxes are added to new invoices and can be removed per invoice. Leave empty if tax does not normally apply.
          </p>
          {form.defaultTaxes.map((t) => (
            <div className="sub-row" key={t.id}>
              <Field label="Tax name" value={t.label} onChange={(e) => set('defaultTaxes', form.defaultTaxes.map((x) => (x.id === t.id ? { ...x, label: e.target.value } : x)))} />
              <Field label="Rate (%)" inputMode="decimal" value={t.rate} onChange={(e) => set('defaultTaxes', form.defaultTaxes.map((x) => (x.id === t.id ? { ...x, rate: e.target.value } : x)))} />
              <button type="button" className="icon-btn" aria-label="Remove default tax" onClick={() => set('defaultTaxes', form.defaultTaxes.filter((x) => x.id !== t.id))}><X /></button>
            </div>
          ))}
          <button type="button" className="btn" onClick={() => set('defaultTaxes', [...form.defaultTaxes, { id: uid(), label: '', rate: '' }])}>
            <Plus aria-hidden /> Add default tax
          </button>
        </section>

        <section className="section">
          <div className="section-head"><h2>Branding</h2></div>
          <div className="grid grid-2">
            <Field label="Logo on invoice">
              <select value={form.logoVariant} onChange={(e) => set('logoVariant', e.target.value)}>
                <option value="black">Monochrome (black)</option>
                <option value="silver">Original (silver)</option>
              </select>
            </Field>
            <Field label="Footer tagline" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
          </div>
        </section>

        <section className="section">
          <div className="section-head"><h2>Data &amp; backup</h2></div>
          <p className="section-note">
            {syncEnabled
              ? 'Invoices are saved to your account and synced to every device you sign in on. A backup file is still useful as an extra copy.'
              : 'Invoices are stored only in this browser on this device. Nothing is uploaded.'}
            {' '}Export a backup regularly, and keep it somewhere safe because it contains client and financial details.
          </p>
          <div className="toolbar">
            <button type="button" className="btn" onClick={download}><Download aria-hidden /> Export backup</button>
            {preSync && (
              <button type="button" className="btn" onClick={() => saveJson(preSync, 'cybervex-invoices-before-cloud-sync.json')}
                title="The invoices that were in this browser before the first cloud sync">
                <Download aria-hidden /> Pre-sync copy
              </button>
            )}
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Upload aria-hidden /> Import backup</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={restore} />
          </div>
        </section>
      </form>
      {toastNode}
    </div>
  );
}

import { supabase } from './supabase';
import { buildView } from './view';

export const emailAvailable = !!supabase;

function safeFilename(s) {
  return s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'document';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Renders the invoice or quotation as a PDF and emails it through the send-email function. */
export async function sendInvoiceEmail(inv, settings, { to, subject }) {
  if (!supabase) throw new Error('Email needs cloud sync (Supabase) to be set up.');

  const { renderInvoicePdf } = await import('../components/InvoicePdf');
  const blob = await renderInvoicePdf(buildView(inv, settings));
  const isQuote = inv.kind === 'quotation';
  const doc = isQuote ? 'quotation' : 'invoice';
  const name = inv.to?.contact?.trim() || inv.to?.company?.trim();

  const text = [
    name ? `Dear ${name},` : 'Hello,',
    '',
    `Please find attached ${doc} ${inv.number || ''} from Cybervex Digital.`.replace(/\s+/g, ' '),
    '',
    'If you have any questions, just reply to this email.',
    '',
    'Kind regards,',
    'Cybervex Digital',
  ].join('\n');

  const { data, error } = await supabase.functions.invoke('send-email', {
    body: {
      to,
      subject,
      text,
      filename: `${safeFilename([inv.number, isQuote && 'Quotation', inv.to?.company].filter(Boolean).join(' - '))}.pdf`,
      pdfBase64: await blobToBase64(blob),
    },
  });
  if (error) {
    let message = 'Could not send the email. Please try again.';
    try { message = (await error.context.json()).error || message; } catch { /* not a JSON reply */ }
    throw new Error(message);
  }
  return data;
}

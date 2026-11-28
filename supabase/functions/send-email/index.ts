// Sends an invoice or quotation PDF to a client through the Titan mailbox.
// The SMTP login lives only in this function's secrets (SMTP_USER, SMTP_PASS),
// never in the browser. Only signed-in users of this app may call it.
import nodemailer from 'npm:nodemailer@6.9.16';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PDF_BYTES = 8 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // The anon key is also a valid JWT, so check for a real signed-in user.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Please sign in again to send email.' }, 401);

  const user_ = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  if (!user_ || !pass) return json({ error: 'Email is not configured on the server (SMTP_USER / SMTP_PASS).' }, 500);

  let body: { to?: string; subject?: string; text?: string; filename?: string; pdfBase64?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  const to = body.to?.trim() ?? '';
  const subject = body.subject?.trim() ?? '';
  if (!EMAIL.test(to)) return json({ error: 'Enter a valid recipient email address.' }, 400);
  if (!subject || /[\r\n]/.test(subject)) return json({ error: 'Enter a valid subject.' }, 400);
  if (!body.pdfBase64) return json({ error: 'The PDF is missing.' }, 400);
  if (body.pdfBase64.length * 0.75 > MAX_PDF_BYTES) return json({ error: 'The PDF is too large to email.' }, 413);

  const filename = (body.filename || 'document.pdf').replace(/[\\/:*?"<>|\r\n]+/g, ' ').slice(0, 140);

  const transport = nodemailer.createTransport({
    host: Deno.env.get('SMTP_HOST') ?? 'smtp.titan.email',
    port: Number(Deno.env.get('SMTP_PORT') ?? 465),
    secure: true,
    auth: { user: user_, pass },
  });

  try {
    await transport.sendMail({
      from: { name: Deno.env.get('SMTP_FROM_NAME') ?? 'Cybervex Digital', address: user_ },
      to,
      subject,
      text: body.text ?? '',
      attachments: [{ filename, content: body.pdfBase64, encoding: 'base64', contentType: 'application/pdf' }],
    });
  } catch (e) {
    console.error('SMTP send failed', e);
    return json({ error: 'The mail server rejected the message. Check the SMTP login and try again.' }, 502);
  }
  return json({ ok: true });
});

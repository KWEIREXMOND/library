import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Transactional email transport.
 *
 * Configure `SMTP_URL` (e.g. `smtps://user:pass@smtp.example.com:465`) to enable
 * outbound email. When it is not set the application stays fully functional: every
 * notification is still stored in-app and the delivery attempt is logged as failed
 * so librarians and administrators can see why nothing left the building.
 */
let cached: Transporter | null | undefined;

function transporter(): Transporter | null {
  if (cached !== undefined) return cached;
  const url = process.env.SMTP_URL;
  if (!url) {
    cached = null;
    return cached;
  }
  try {
    cached = nodemailer.createTransport(url);
  } catch (err) {
    console.warn('[mail] Could not create SMTP transport:', (err as Error)?.message);
    cached = null;
  }
  return cached;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_URL);
}

export function mailFrom(): string {
  return process.env.MAIL_FROM || '"Tema Secondary Library" <library@tema.edu.gh>';
}

export type MailResult = { ok: boolean; detail: string };

export async function sendMail(opts: { to: string; subject: string; text: string; html?: string }): Promise<MailResult> {
  const tx = transporter();
  if (!tx) return { ok: false, detail: 'Email transport is not configured (set SMTP_URL).' };
  try {
    const info = await tx.sendMail({
      from: mailFrom(),
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html ?? `<div style="font-family:system-ui,sans-serif;line-height:1.55;color:#17251F">${opts.text
        .split('\n')
        .map((line) => `<p style="margin:0 0 10px">${escapeHtml(line)}</p>`)
        .join('')}</div>`,
    });
    const accepted = Array.isArray(info.accepted) ? info.accepted.length : 0;
    return { ok: true, detail: `Accepted by SMTP server${accepted ? ` (${accepted} recipient)` : ''}${info.messageId ? ` · ${info.messageId}` : ''}` };
  } catch (err) {
    return { ok: false, detail: String((err as Error)?.message ?? err).slice(0, 400) };
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
}

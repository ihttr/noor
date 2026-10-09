import 'server-only';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Resend } from 'resend';

// Account emails (password reset, verification) through Resend (D-006). Without RESEND_API_KEY
// — local development and the e2e tests — mails are written to .cache/mail-outbox.jsonl instead.

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const { error } = await new Resend(key).emails.send({
      from: process.env.EMAIL_FROM ?? 'Noor <no-reply@example.com>',
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
    if (error) throw new Error(`Email not sent: ${error.message}`);
    return;
  }
  if (process.env.NODE_ENV === 'production' && !process.env.NOOR_DEV_MAIL_OUTBOX) {
    throw new Error('RESEND_API_KEY is not set: account emails cannot be sent');
  }
  const dir = path.join(process.cwd(), '.cache');
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, 'mail-outbox.jsonl'), `${JSON.stringify({ ...mail, at: new Date().toISOString() })}\n`, 'utf8');
  console.info(`[mail outbox] ${mail.subject} → ${mail.to}`);
}

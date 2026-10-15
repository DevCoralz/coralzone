// SMTP mailer for verification codes. Configure via env:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE ("true"/"false"), SMTP_USER, SMTP_PASS,
//   SMTP_FROM (defaults to SMTP_USER)
import nodemailer from "nodemailer";

const globalForMailer = globalThis;

function getTransporter() {
  if (!globalForMailer.__coralzoneTransporter) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    globalForMailer.__coralzoneTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return globalForMailer.__coralzoneTransporter;
}

export async function sendVerificationEmail({ to, name, code }) {
  if (!process.env.SMTP_HOST) {
    // Fail loudly in logs but don't leak server config to the client —
    // the caller still responds with a generic success-shaped message.
    console.error("[mailer] SMTP_HOST is not set — cannot send verification email");
    throw new Error("Email delivery is not configured");
  }

  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = "Your CoralzOne verification code";
  const text = `Hi ${name || "there"},\n\nYour CoralzOne verification code is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can ignore this email.`;
  const html = `
    <div style="font-family:Manrope,Arial,sans-serif;background:#0b1326;padding:32px;color:#eef2ff">
      <h1 style="font-size:20px;margin:0 0 16px">CoralzOne</h1>
      <p style="margin:0 0 12px">Hi ${escapeHtml(name || "there")},</p>
      <p style="margin:0 0 20px">Your verification code is:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 20px">${escapeHtml(code)}</p>
      <p style="margin:0;color:#9aa5c7;font-size:13px">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
    </div>`;

  await transporter.sendMail({ from, to, subject, text, html });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch] ?? ch);
}

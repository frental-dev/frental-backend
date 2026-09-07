/**
 * Thin wrapper around Brevo's transactional email API. Uses Node's built-in
 * fetch (Node 18+), no extra dependency needed.
 * Docs: https://developers.brevo.com/reference/sendtransacemail
 */
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

async function sendEmail({ to, toName, subject, html }) {
  if (!process.env.BREVO_API_KEY) {
    // Don't crash the request that triggered this — email delivery failing
    // should never block signup/login. Log loudly so it's caught in review.
    console.error('[email] BREVO_API_KEY is not set — email not sent:', subject, 'to', to);
    return { sent: false };
  }

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME || 'Frental',
        email: process.env.BREVO_SENDER_EMAIL,
      },
      to: [{ email: to, name: toName }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[email] Brevo send failed (${res.status}) to ${to}:`, body);
    return { sent: false };
  }

  return { sent: true };
}

function verificationEmailHtml(agent, verifyUrl) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #186339;">Verify your Frental email</h2>
      <p>Hi ${agent.name},</p>
      <p>Confirm this is your email address to finish setting up your Frental agent account.</p>
      <p style="margin: 32px 0;">
        <a href="${verifyUrl}" style="background: #186339; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Verify email
        </a>
      </p>
      <p style="color: #666; font-size: 13px;">This link expires in 24 hours. If you didn't create a Frental account, you can ignore this email.</p>
    </div>
  `;
}

async function sendVerificationEmail(agent, token) {
  const verifyUrl = `${process.env.API_BASE_URL}/api/agents/verify-email?token=${token}`;
  return sendEmail({
    to: agent.email,
    toName: agent.name,
    subject: 'Verify your Frental email',
    html: verificationEmailHtml(agent, verifyUrl),
  });
}

function passwordResetEmailHtml(agent, resetUrl) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #186339;">Reset your Frental password</h2>
      <p>Hi ${agent.name},</p>
      <p>We received a request to reset your Frental password. Click below to choose a new one.</p>
      <p style="margin: 32px 0;">
        <a href="${resetUrl}" style="background: #186339; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Reset password
        </a>
      </p>
      <p style="color: #666; font-size: 13px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.</p>
    </div>
  `;
}

async function sendPasswordResetEmail(agent, token) {
  const resetUrl = `${process.env.API_BASE_URL}/api/agents/reset-password?token=${token}`;
  return sendEmail({
    to: agent.email,
    toName: agent.name,
    subject: 'Reset your Frental password',
    html: passwordResetEmailHtml(agent, resetUrl),
  });
}

function changeEmailConfirmationHtml(agent, confirmUrl, newEmail) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #186339;">Confirm your new Frental email</h2>
      <p>Hi ${agent.name},</p>
      <p>Confirm that <strong>${newEmail}</strong> is your new email address for Frental.</p>
      <p style="margin: 32px 0;">
        <a href="${confirmUrl}" style="background: #186339; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Confirm new email
        </a>
      </p>
      <p style="color: #666; font-size: 13px;">This link expires in 24 hours. Your old email stays active until you confirm this change.</p>
    </div>
  `;
}

async function sendChangeEmailConfirmation(agent, token, newEmail) {
  const confirmUrl = `${process.env.API_BASE_URL}/api/agents/confirm-email-change?token=${token}`;
  return sendEmail({
    to: newEmail,
    toName: agent.name,
    subject: 'Confirm your new Frental email',
    html: changeEmailConfirmationHtml(agent, confirmUrl, newEmail),
  });
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendChangeEmailConfirmation,
};

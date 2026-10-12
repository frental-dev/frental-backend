const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

async function sendEmail({ to, toName, subject, html }) {
  if (!process.env.BREVO_API_KEY) {
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

// --- Email verification: now a 6-digit code, entered in-app, not a link ---
function verificationEmailHtml(agent, code) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #186339;">Verify your Frental email</h2>
      <p>Hi ${agent.name},</p>
      <p>Enter this code in the app to confirm your email address:</p>
      <p style="margin: 32px 0; text-align: center;">
        <span style="display: inline-block; background: #f0f9f2; color: #186339; font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 16px 24px; border-radius: 12px;">
          ${code}
        </span>
      </p>
      <p style="color: #666; font-size: 13px;">This code expires in 15 minutes. If you didn't create a Frental account, you can ignore this email.</p>
    </div>
  `;
}

async function sendVerificationEmail(agent, code) {
  return sendEmail({
    to: agent.email,
    toName: agent.name,
    subject: 'Your Frental verification code',
    html: verificationEmailHtml(agent, code),
  });
}

// --- Password reset: still a clicked link (opens a full form) ---
function passwordResetEmailHtml(agent, code) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #186339;">Reset your Frental password</h2>
      <p>Hi ${agent.name},</p>
      <p>Enter this code in the app to reset your password:</p>
      <p style="margin: 32px 0; text-align: center;">
        <span style="display: inline-block; background: #f0f9f2; color: #186339; font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 16px 24px; border-radius: 12px;">
          ${code}
        </span>
      </p>
      <p style="color: #666; font-size: 13px;">This code expires in 15 minutes. If you didn't request this, you can safely ignore this email — your password won't change.</p>
    </div>
  `;
}

async function sendPasswordResetEmail(agent, code) {
  return sendEmail({
    to: agent.email,
    toName: agent.name,
    subject: 'Your Frental password reset code',
    html: passwordResetEmailHtml(agent, code),
  });
}

// --- Change email: still a clicked link ---
function changeEmailConfirmationHtml(agent, code, newEmail) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #186339;">Confirm your new Frental email</h2>
      <p>Hi ${agent.name},</p>
      <p>Enter this code in the app to confirm <strong>${newEmail}</strong> as your new email address:</p>
      <p style="margin: 32px 0; text-align: center;">
        <span style="display: inline-block; background: #f0f9f2; color: #186339; font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 16px 24px; border-radius: 12px;">
          ${code}
        </span>
      </p>
      <p style="color: #666; font-size: 13px;">This code expires in 15 minutes. Your old email stays active until you confirm this change.</p>
    </div>
  `;
}

async function sendChangeEmailConfirmation(agent, code, newEmail) {
  return sendEmail({
    to: newEmail,
    toName: agent.name,
    subject: 'Your Frental email change code',
    html: changeEmailConfirmationHtml(agent, code, newEmail),
  });
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendChangeEmailConfirmation,
};

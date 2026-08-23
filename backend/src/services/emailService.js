// Email service - Send transactional emails

/**
 * Send an email. Logs to console by default; uses Resend API if RESEND_API_KEY is set.
 * @param {{ to: string, subject: string, html: string }} options
 * @param {object} [env] - Cloudflare Worker env bindings (optional, for RESEND_API_KEY)
 * @returns {Promise<boolean>}
 */
export async function sendEmail({ to, subject, html }, env) {
  if (env?.ENVIRONMENT !== 'production') {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
  }

  // If RESEND_API_KEY env var is set, send via Resend
  const apiKey = env?.RESEND_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: 'noreply@sinaicamps.com', to, subject, html }),
      });
      if (!res.ok) {
        console.error(`[EMAIL] Resend API returned ${res.status}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[EMAIL] Failed to send via Resend:', err.message);
      return false;
    }
  }
  return true;
}

/**
 * Send a password reset email.
 * @param {string} email - Recipient email
 * @param {string} token - Reset token
 * @param {string} [baseUrl='https://sinaicamps.com'] - Base URL for the reset link
 * @param {object} [env] - Cloudflare Worker env bindings
 * @returns {Promise<boolean>}
 */
export async function sendPasswordResetEmail(email, token, baseUrl = 'https://sinaicamps.com', env) {
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #4a7c4f;">Password Reset Request</h2>
      <p>You requested a password reset for your SinaiCamps account.</p>
      <p>Click the button below to reset your password. This link expires in 1 hour.</p>
      <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #4a7c4f; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 16px 0;">
        Reset Password
      </a>
      <p style="color: #666; font-size: 0.9em;">If you did not request this, you can safely ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 0.8em;">SinaiCamps.com — Camp Management Platform</p>
    </div>
  `;
  return sendEmail({ to: email, subject: 'Reset Your SinaiCamps Password', html }, env);
}
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendEmail, sendPasswordResetEmail } from '../src/services/emailService.js';

describe('emailService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendEmail', () => {
    it('logs to console in non-production and returns true', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await sendEmail(
        { to: 'test@example.com', subject: 'Test', html: '<p>Hi</p>' },
        { ENVIRONMENT: 'test' }
      );
      expect(result).toBe(true);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[EMAIL]'));
    });

    it('does not log in production when no API key', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await sendEmail(
        { to: 'test@example.com', subject: 'Test', html: '<p>Hi</p>' },
        { ENVIRONMENT: 'production' }
      );
      expect(result).toBe(true);
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('returns true when no RESEND_API_KEY is set', async () => {
      const result = await sendEmail(
        { to: 'test@example.com', subject: 'Test', html: '<p>Hi</p>' },
        {}
      );
      expect(result).toBe(true);
    });

    it('sends via Resend API when RESEND_API_KEY is set', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchSpy);
      const result = await sendEmail(
        { to: 'user@example.com', subject: 'Hello', html: '<p>Hello</p>' },
        { RESEND_API_KEY: 're_test_key_123', ENVIRONMENT: 'production' }
      );
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer re_test_key_123',
          }),
        })
      );
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.to).toBe('user@example.com');
      expect(body.subject).toBe('Hello');
      expect(body.from).toBe('noreply@sinaicamps.com');
    });

    it('returns false when Resend API returns non-ok', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 422 });
      vi.stubGlobal('fetch', fetchSpy);
      const result = await sendEmail(
        { to: 'user@example.com', subject: 'Hello', html: '<p>Hi</p>' },
        { RESEND_API_KEY: 're_test_key' }
      );
      expect(result).toBe(false);
    });

    it('returns false when fetch throws (network error)', async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error('Network failure'));
      vi.stubGlobal('fetch', fetchSpy);
      const result = await sendEmail(
        { to: 'user@example.com', subject: 'Hello', html: '<p>Hi</p>' },
        { RESEND_API_KEY: 're_test_key' }
      );
      expect(result).toBe(false);
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sends reset email with correct reset URL', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchSpy);
      const result = await sendPasswordResetEmail(
        'user@example.com', 'tok_abc123', 'https://example.com', { RESEND_API_KEY: 'key' }
      );
      expect(result).toBe(true);
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.html).toContain('tok_abc123');
      expect(body.html).toContain('https://example.com/reset-password?token=tok_abc123');
      expect(body.subject).toContain('Reset Your SinaiCamps Password');
    });

    it('uses default base URL when not provided', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchSpy);
      await sendPasswordResetEmail('user@example.com', 'token_xyz', undefined, { RESEND_API_KEY: 'key' });
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.html).toContain('https://sinaicamps.com/reset-password?token=token_xyz');
    });

    it('sends without RESEND_API_KEY (log-only mode)', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await sendPasswordResetEmail('user@example.com', 'tok123');
      expect(result).toBe(true);
      expect(logSpy).toHaveBeenCalled();
    });
  });
});

import { sendEmail, sendPasswordResetEmail } from '../../backend/src/services/emailService.js'

describe('emailService', () => {
  const originalFetch = global.fetch
  const originalConsoleLog = console.log
  const originalConsoleError = console.error

  beforeEach(() => {
    global.fetch = vi.fn()
    console.log = vi.fn()
    console.error = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    console.log = originalConsoleLog
    console.error = originalConsoleError
    vi.unstubAllGlobals()
  })

  const mockEnvWithKey = { RESEND_API_KEY: 're_test_key', ENVIRONMENT: 'production' }
  const mockEnvNoKey = { ENVIRONMENT: 'development' }

  describe('sendEmail', () => {
    it('sends email with correct to, subject, html via Resend API when key is set', async () => {
      global.fetch.mockResolvedValue({ ok: true })

      const result = await sendEmail({ to: 'user@test.com', subject: 'Hello', html: '<p>Hi</p>' }, mockEnvWithKey)

      expect(result).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer re_test_key',
            'Content-Type': 'application/json',
          }),
        })
      )
      const body = JSON.parse(global.fetch.mock.calls[0][1].body)
      expect(body.to).toBe('user@test.com')
      expect(body.subject).toBe('Hello')
      expect(body.html).toBe('<p>Hi</p>')
      expect(body.from).toBe('noreply@sinaicamps.com')
    })

    it('returns true when no RESEND_API_KEY is set (console-only mode)', async () => {
      const result = await sendEmail({ to: 'user@test.com', subject: 'Test', html: '<p>Hi</p>' }, mockEnvNoKey)

      expect(result).toBe(true)
      expect(global.fetch).not.toHaveBeenCalled()
      expect(console.log).toHaveBeenCalledWith('[EMAIL] To: user@test.com | Subject: Test')
    })

    it('returns false when Resend API returns non-OK status', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 422 })

      const result = await sendEmail({ to: 'bad@addr', subject: 'Hi', html: 'x' }, mockEnvWithKey)

      expect(result).toBe(false)
      expect(console.error).toHaveBeenCalledWith('[EMAIL] Resend API returned 422')
    })

    it('returns false when fetch throws a network error', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'))

      const result = await sendEmail({ to: 'user@test.com', subject: 'Hi', html: 'x' }, mockEnvWithKey)

      expect(result).toBe(false)
      expect(console.error).toHaveBeenCalledWith('[EMAIL] Failed to send via Resend:', 'Network error')
    })
  })

  describe('sendPasswordResetEmail', () => {
    it('sends email with reset link in the body', async () => {
      global.fetch.mockResolvedValue({ ok: true })

      await sendPasswordResetEmail('user@test.com', 'abc123token', undefined, mockEnvWithKey)

      const body = JSON.parse(global.fetch.mock.calls[0][1].body)
      expect(body.html).toContain('abc123token')
    })

    it('uses custom baseUrl when provided', async () => {
      global.fetch.mockResolvedValue({ ok: true })

      await sendPasswordResetEmail('user@test.com', 'tok123', 'https://custom.com', mockEnvWithKey)

      const body = JSON.parse(global.fetch.mock.calls[0][1].body)
      expect(body.html).toContain('https://custom.com/reset-password?token=tok123')
    })

    it('uses default baseUrl when not provided', async () => {
      global.fetch.mockResolvedValue({ ok: true })

      await sendPasswordResetEmail('user@test.com', 'tok456', undefined, mockEnvWithKey)

      const body = JSON.parse(global.fetch.mock.calls[0][1].body)
      expect(body.html).toContain('https://sinaicamps.com/reset-password?token=tok456')
    })

    it('uses correct email subject', async () => {
      global.fetch.mockResolvedValue({ ok: true })

      await sendPasswordResetEmail('user@test.com', 'tok', undefined, mockEnvWithKey)

      const body = JSON.parse(global.fetch.mock.calls[0][1].body)
      expect(body.subject).toBe('Reset Your SinaiCamps Password')
    })
  })
})

import { jsonResponse, errorResponse } from '../../backend/src/utils/response.js'

describe('response utils', () => {
  describe('jsonResponse', () => {
    it('returns Response with default status 200', () => {
      const res = jsonResponse({ ok: true })
      expect(res.status).toBe(200)
    })

    it('returns Response with custom status', () => {
      const res = jsonResponse({ created: true }, 201)
      expect(res.status).toBe(201)
    })

    it('sets Content-Type to application/json', () => {
      const res = jsonResponse({})
      expect(res.headers.get('Content-Type')).toBe('application/json')
    })

    it('sets security headers', () => {
      const res = jsonResponse({})
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(res.headers.get('X-Frame-Options')).toBe('DENY')
      expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'")
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains')
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
      expect(res.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()')
    })

    it('body contains serialized data', async () => {
      const data = { name: 'test', count: 42 }
      const res = jsonResponse(data)
      const body = await res.json()
      expect(body).toEqual(data)
    })

    it('handles nested objects', async () => {
      const data = { user: { id: 1, roles: ['admin'] } }
      const res = jsonResponse(data)
      const body = await res.json()
      expect(body.user.id).toBe(1)
      expect(body.user.roles).toEqual(['admin'])
    })
  })

  describe('errorResponse', () => {
    it('returns Response with status 400 by default', () => {
      const res = errorResponse('Bad input')
      expect(res.status).toBe(400)
    })

    it('returns Response with custom status', () => {
      const res = errorResponse('Not found', 404)
      expect(res.status).toBe(404)
    })

    it('body contains { success: false, error: message }', async () => {
      const res = errorResponse('Something went wrong')
      const body = await res.json()
      expect(body).toEqual({ success: false, error: 'Something went wrong' })
    })

    it('sets Content-Type to application/json', () => {
      const res = errorResponse('fail')
      expect(res.headers.get('Content-Type')).toBe('application/json')
    })

    it('defaults to status 500 when explicitly passed', () => {
      const res = errorResponse('Server error', 500)
      expect(res.status).toBe(500)
    })
  })
})

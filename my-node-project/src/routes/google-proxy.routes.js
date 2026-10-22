const express = require('express')
const router = express.Router()

// Chrome domain được phép proxy (bảo mật: chỉ cho phép script.google.com)
const ALLOWED_DOMAINS = new Set([
  'script.google.com',
  'google.com',
])

function isAllowedUrl(url) {
  try {
    const u = new URL(url)
    return ALLOWED_DOMAINS.has(u.hostname) && u.protocol === 'https:'
  } catch {
    return false
  }
}

// Fetch 1 URL với retry
async function fetchOne(url, { timeoutMs = 30000, maxRetries = 2 } = {}) {
  let lastErr
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'appa-cmc-proxy/1.0' },
      })
      const text = await response.text()
      const trimmed = text.trim()
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        throw new Error(`Không phải JSON: ${trimmed.substring(0, 40)}...`)
      }
      return { ok: true, status: response.status, body: text }
    } catch (err) {
      lastErr = err
      console.warn(`⚠️ [${url.substring(0, 40)}...] attempt ${attempt} failed: ${err.message}`)
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 2000 * attempt))
    } finally {
      clearTimeout(timeout)
    }
  }
  return { ok: false, url, error: lastErr?.message || 'Unknown error' }
}

// Fetch nhiều URLs với concurrency limit
async function fetchBatch(urls, { concurrency = 5, timeoutMs = 30000, maxRetries = 2 } = {}) {
  const results = {}
  let index = 0

  async function worker() {
    while (index < urls.length) {
      const i = index++
      const url = urls[i]
      const res = await fetchOne(url, { timeoutMs, maxRetries })
      results[url] = res
    }
  }

  // Khởi động concurrency workers
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker())
  await Promise.all(workers)
  return results
}

// Batch endpoint: frontend POST { urls: [...] } → backend fetch có giới hạn concurrency
router.post('/api/proxy/google-sheets/batch', async (req, res) => {
  const { urls, concurrency = 5, timeoutMs = 30000, maxRetries = 2 } = req.body || {}

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ message: 'Thiếu mảng urls' })
  }

// Validate URLs trong whitelist
  const invalid = urls.filter(u => !isAllowedUrl(u))
  if (invalid.length > 0) {
    return res.status(403).json({ message: 'URL không được phép proxy', invalid })
  }

  try {
    const results = await fetchBatch(urls, { concurrency, timeoutMs, maxRetries })
    res.set('Content-Type', 'application/json')
    return res.json(results)
  } catch (err) {
    console.error('Batch proxy error:', err.message)
    return res.status(500).json({ message: 'Lỗi proxy batch', error: err.message })
  }
})

// Single URL endpoint (GET) — giữ lại cho backward compatibility
router.get('/api/proxy/google-sheets', async (req, res) => {
  const targetUrl = req.query.url
  if (!targetUrl) {
    return res.status(400).json({ message: 'Thiếu tham số url' })
  }
  if (!isAllowedUrl(targetUrl)) {
    return res.status(403).json({ message: 'URL không được phép proxy' })
  }
  try {
    const result = await fetchOne(targetUrl, { timeoutMs: 30000, maxRetries: 2 })
    if (!result.ok) {
      return res.status(502).json({ message: 'Không thể fetch', error: result.error })
    }
    res.status(result.status).set('Content-Type', 'application/json')
    return res.send(result.body)
  } catch (err) {
    return res.status(502).json({ message: 'Lỗi proxy', error: err.message })
  }
})

module.exports = router
const express = require('express')
const store = require('../data/store')

const router = express.Router()

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[character]
  })
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
}

router.get('/verify/:token', (req, res) => {
  const state = store.findApplicationByVerificationToken(req.params.token)
  if (!state || !state.certificate?.issued || !state.certificate?.sent) {
    return res.status(404).type('html').send(
      '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Không tìm thấy giấy phép</title><h1>Không tìm thấy giấy phép</h1><p>Mã xác minh không hợp lệ hoặc giấy phép chưa được phát hành.</p></html>',
    )
  }

  const details = state.certificate.details
  const contentSecurityPolicy = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  res.set('Content-Security-Policy', contentSecurityPolicy)
  res.set('Cache-Control', 'no-store')
  res.type('html').send(`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Xác minh giấy phép ${escapeHtml(state.id)}</title>
  <style>
    body { font: 16px Arial, sans-serif; color: #172033; background: #f4f5f9; margin: 0; padding: 24px; }
    main { max-width: 680px; margin: 40px auto; padding: 32px; background: white; border-radius: 16px; box-shadow: 0 8px 28px #15234a1a; }
    h1 { color: #237a3b; font-size: 24px; }
    .status { display: inline-block; padding: 8px 12px; border-radius: 999px; color: #237a3b; background: #e8f5e9; font-weight: bold; }
    dl { display: grid; grid-template-columns: 190px 1fr; gap: 14px; }
    dt { color: #667085; } dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
    @media (max-width: 520px) { main { margin: 0 auto; padding: 22px; } dl { grid-template-columns: 1fr; gap: 6px; } dd { margin-bottom: 10px; } }
  </style>
</head>
<body>
  <main>
    <p class="status">ĐÃ CẤP PHÉP</p>
    <h1>Giấy phép hợp lệ trên hệ thống APPA CMC</h1>
    <dl>
      <dt>Mã đơn</dt><dd>${escapeHtml(state.id)}</dd>
      <dt>Đơn vị sử dụng</dt><dd>${escapeHtml(details.unit)}</dd>
      <dt>Mã số thuế</dt><dd>${escapeHtml(details.taxCode || '—')}</dd>
      <dt>Cơ sở kinh doanh</dt><dd>${escapeHtml(details.facility)}</dd>
      <dt>Loại hình kinh doanh</dt><dd>${escapeHtml(details.businessType)}</dd>
      <dt>Thời hạn cấp phép</dt><dd>${escapeHtml(details.duration)}</dd>
      <dt>Ngày cấp</dt><dd>${escapeHtml(formatDate(state.certificate.issuedAt))}</dd>
    </dl>
    <p>Thông tin này được tra cứu trực tiếp từ hệ thống xác minh của APPA CMC.</p>
  </main>
</body>
</html>`)
})

module.exports = router

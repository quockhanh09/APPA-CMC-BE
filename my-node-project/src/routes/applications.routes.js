const express = require('express')
const store = require('../data/store')
const { verifyToken } = require('../middleware/auth')

const router = express.Router()

function getPublicBaseUrl() {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '')
  }
  if (process.env.NODE_ENV === 'production') {
    return null
  }
  return `http://localhost:${process.env.PORT || 4000}`
}

router.use(verifyToken)

router.get('/:id', (req, res) => {
  const state = store.getApplicationState(req.params.id)
  res.json({ application: state })
})

router.patch('/:id/review', (req, res) => {
  const { action } = req.body || {}
  if (!['approve', 'request_edit', 'reject'].includes(action)) {
    return res.status(400).json({ message: 'Hành động không hợp lệ' })
  }
  const state = store.reviewApplication(req.params.id, action)
  if (!state) {
    return res.status(409).json({ message: 'Hồ sơ đã được xử lý trước đó' })
  }
  res.json({ application: state })
})

router.patch('/:id/confirm-payment', (req, res) => {
  const state = store.confirmApplicationPayment(req.params.id)
  res.json({ application: state })
})

router.post('/:id/payment-proof', (req, res) => {
  const { fileName } = req.body || {}
  if (!fileName) {
    return res.status(400).json({ message: 'Thiếu tên tệp chứng từ' })
  }
  const state = store.uploadApplicationPaymentProof(req.params.id, fileName)
  if (!state) {
    return res.status(400).json({ message: 'Khách hàng chưa xác nhận thanh toán' })
  }
  res.json({ application: state })
})

router.patch('/:id/accept-payment', (req, res) => {
  const state = store.acceptApplicationPayment(req.params.id)
  if (!state) {
    return res.status(400).json({ message: 'Chưa có chứng từ thanh toán để chấp nhận' })
  }
  res.json({ application: state })
})

router.patch('/:id/quick-review', (req, res) => {
  const { outcome } = req.body || {}
  if (!['licensed', 'expired'].includes(outcome)) {
    return res.status(400).json({ message: 'Kết quả không hợp lệ' })
  }
  const state = store.quickReviewApplication(req.params.id, outcome)
  if (!state) {
    return res.status(409).json({ message: 'Hồ sơ đã được xử lý trước đó' })
  }
  res.json({ application: state })
})

router.patch('/:id/send-certificate', (req, res) => {
  const baseUrl = getPublicBaseUrl()
  if (!baseUrl) {
    return res.status(503).json({ message: 'Máy chủ chưa cấu hình PUBLIC_BASE_URL để xác minh giấy phép' })
  }
  const state = store.sendApplicationCertificate(req.params.id)
  if (!state) {
    return res.status(400).json({ message: 'Hồ sơ chưa được chuẩn bị hoặc chưa được cấp phép' })
  }
  const verificationUrl = `${baseUrl}/verify/${state.certificate.verificationToken}`
  res.json({ application: state, verificationUrl })
})

router.post('/:id/certificate/prepare', (req, res) => {
  const baseUrl = getPublicBaseUrl()
  if (!baseUrl) {
    return res.status(503).json({ message: 'Máy chủ chưa cấu hình PUBLIC_BASE_URL để xác minh giấy phép' })
  }
  const { details } = req.body || {}
  const requiredFields = ['unit', 'facility', 'businessType', 'duration']
  if (
    !details ||
    typeof details !== 'object' ||
    requiredFields.some((field) => typeof details[field] !== 'string' || !details[field].trim())
  ) {
    return res.status(400).json({ message: 'Thiếu thông tin cần thiết để tạo giấy phép' })
  }

  const certificateDetails = Object.fromEntries(
    ['unit', 'taxCode', 'facility', 'businessType', 'duration'].map((field) => [
      field,
      typeof details[field] === 'string' ? details[field].trim().slice(0, 200) : '',
    ]),
  )
  const state = store.prepareApplicationCertificate(req.params.id, certificateDetails)
  if (!state) {
    return res.status(400).json({ message: 'Hồ sơ chưa được cấp phép' })
  }
  const verificationUrl = `${baseUrl}/verify/${state.certificate.verificationToken}`
  res.json({ application: state, verificationUrl })
})

module.exports = router

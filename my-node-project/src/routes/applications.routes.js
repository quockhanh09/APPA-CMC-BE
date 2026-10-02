const express = require('express')
const store = require('../data/store')
const { verifyToken } = require('../middleware/auth')

const router = express.Router()

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

module.exports = router

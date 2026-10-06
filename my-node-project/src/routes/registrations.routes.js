const express = require('express')
const store = require('../data/store')

const router = express.Router()

const TYPE_MAP = {
  cafe: 'coffee',
  restaurant: 'restaurant',
  shop: 'store',
  spa: 'gym',
  bar: 'bar',
  playground: 'entertainment',
  mall: 'mall',
  supermarket: 'supermarket',
  hotel: 'hotel',
}

function readText(body, key, maxLength = 500) {
  const value = body[key]
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

router.post('/', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const id = readText(body, 'registrationCode', 80).toUpperCase()
  const businessType = readText(body, 'businessType', 30)
  const karaokeSubType = readText(body, 'karaokeSubType', 10)
  const companyName = readText(body, 'companyName')
  const storeName = readText(body, 'storeName')

  if (!/^[A-Z0-9-]{5,80}$/i.test(id)) {
    return res.status(400).json({ message: 'Mã đăng ký không hợp lệ' })
  }
  if (!companyName || !storeName) {
    return res.status(400).json({ message: 'Thiếu tên đơn vị hoặc cơ sở kinh doanh' })
  }
  if (
    !TYPE_MAP[businessType] &&
    !(businessType === 'karaoke' && ['room', 'box'].includes(karaokeSubType))
  ) {
    return res.status(400).json({ message: 'Loại hình kinh doanh không hợp lệ' })
  }

  const email = readText(body, 'email', 254)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Email không hợp lệ' })
  }

  const feeAmount = body.feeAmount
  if (
    feeAmount !== undefined &&
    feeAmount !== null &&
    (!Number.isFinite(feeAmount) || feeAmount < 0)
  ) {
    return res.status(400).json({ message: 'Phí sử dụng không hợp lệ' })
  }

  const mappedType =
    businessType === 'karaoke'
      ? karaokeSubType === 'box' ? 'karaokeBox' : 'karaokeRoom'
      : TYPE_MAP[businessType]
  const registration = {
    id,
    unit: companyName,
    taxCode: readText(body, 'taxCode', 30),
    facility: storeName,
    type: mappedType,
    fee:
      typeof feeAmount === 'number'
        ? `${new Intl.NumberFormat('vi-VN').format(feeAmount)} VNĐ`
        : '—',
    duration: readText(body, 'paymentCycle', 40) || '—',
    issueDate: null,
    paid: false,
    registration: {
      businessTypeLabel: readText(body, 'businessTypeLabel', 100),
      legalRepresentative: readText(body, 'legalRepresentative', 200),
      phone: readText(body, 'phone', 40),
      email,
      companyAddress: readText(body, 'companyAddress'),
      storeAddress: readText(body, 'storeAddress'),
      scaleDetails: readText(body, 'scaleDetails'),
      karaokeSubType,
      fileName: readText(body, 'fileName', 255),
      fileMimeType: readText(body, 'fileMimeType', 100),
    },
  }

  const created = store.createRegistration(registration)
  if (!created) {
    return res.status(409).json({ message: 'Mã đăng ký đã tồn tại' })
  }
  return res.status(201).json({ registration: created })
})

module.exports = router

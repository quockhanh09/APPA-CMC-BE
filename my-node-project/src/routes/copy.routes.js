const express = require('express')
const store = require('../data/store')
const { verifyToken, requireEditPermission } = require('../middleware/auth')

const router = express.Router()

const COPY_TYPES = ['movie', 'tvc', 'album', 'arcade', 'mv_audiovisual']
const STATUSES = ['new', 'processing', 'licensed', 'rejected']
const MAX_RECORDS = 5000

function readText(body, key, maxLength = 500) {
  const value = body[key]
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function readNumber(body, key, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = body[key]
  if (value === undefined || value === null || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num) || num < min || num > max) return undefined
  return num
}

function readRecords(body) {
  if (!Array.isArray(body.records)) return []
  return body.records.slice(0, MAX_RECORDS).map((record) => ({
    songTitle: typeof record?.songTitle === 'string' ? record.songTitle.trim().slice(0, 300) : '',
    albumTitle: typeof record?.albumTitle === 'string' ? record.albumTitle.trim().slice(0, 300) : '',
    performer: typeof record?.performer === 'string' ? record.performer.trim().slice(0, 300) : '',
    recordLink: typeof record?.recordLink === 'string' ? record.recordLink.trim().slice(0, 1000) : '',
  })).filter((record) => record.songTitle || record.albumTitle || record.performer || record.recordLink)
}

// Form công khai bên NDCP — khách gửi đơn không cần đăng nhập
router.post('/', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const id = readText(body, 'registrationCode', 80).toUpperCase()
  const copyType = readText(body, 'copyType', 30)
  const orgNameVN = readText(body, 'orgNameVN')

  if (!/^[A-Z0-9-]{5,80}$/i.test(id)) {
    return res.status(400).json({ message: 'Mã đăng ký không hợp lệ' })
  }
  if (!COPY_TYPES.includes(copyType)) {
    return res.status(400).json({ message: 'Loại hình sao chép không hợp lệ' })
  }
  if (!orgNameVN) {
    return res.status(400).json({ message: 'Thiếu tên đơn vị đăng ký' })
  }

  for (const key of ['email', 'invoiceEmail']) {
    const value = readText(body, key, 254)
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return res.status(400).json({ message: 'Email không hợp lệ' })
    }
  }

  const numericFields = {}
  for (const [key, max] of [
    ['feeAmount', Number.MAX_SAFE_INTEGER],
    ['factoryPrice', Number.MAX_SAFE_INTEGER],
    ['quantity', 1000000000],
    ['recordsCount', MAX_RECORDS],
  ]) {
    const value = readNumber(body, key, { max })
    if (value === undefined) {
      return res.status(400).json({ message: `Trường ${key} không hợp lệ` })
    }
    numericFields[key] = value
  }

  const records = readRecords(body)
  const registration = {
    id,
    copyType,
    copyTypeLabel: readText(body, 'copyTypeLabel', 200),
    orgNameVN,
    orgNameEN: readText(body, 'orgNameEN'),
    taxCode: readText(body, 'taxCode', 30),
    orgAddress: readText(body, 'orgAddress'),
    legalRepresentative: readText(body, 'legalRepresentative', 200),
    inChargePerson: readText(body, 'inChargePerson', 200),
    phone: readText(body, 'phone', 40),
    email: readText(body, 'email', 254),
    invoiceEmail: readText(body, 'invoiceEmail', 254),
    contentTitle: readText(body, 'contentTitle', 300),
    contentDetail: readText(body, 'contentDetail', 1000),
    usageModel: readText(body, 'usageModel', 300),
    productionFormat: readText(body, 'productionFormat', 100),
    factoryPrice: numericFields.factoryPrice,
    quantity: numericFields.quantity,
    recordsCount: numericFields.recordsCount ?? records.length,
    records,
    feeAmount: numericFields.feeAmount ?? 0,
    fileName: readText(body, 'fileName', 255),
    fileMimeType: readText(body, 'fileMimeType', 100),
  }

  const created = await store.createCopyRegistration(registration)
  if (!created) {
    return res.status(409).json({ message: 'Mã đăng ký đã tồn tại' })
  }
  return res.status(201).json({ registration: created })
})

// Các API dưới đây dành cho CMS (nhân sự đã đăng nhập)
router.use(verifyToken)

router.get('/', async (req, res) => {
  res.json({ registrations: await store.getCopyRegistrations() })
})

router.patch('/:id/status', requireEditPermission, async (req, res) => {
  const { status } = req.body || {}
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ' })
  }
  const updated = await store.updateCopyRegistrationStatus(req.params.id, status)
  if (!updated) {
    return res.status(404).json({ message: 'Không tìm thấy hồ sơ' })
  }
  res.json({ registration: updated })
})

module.exports = router

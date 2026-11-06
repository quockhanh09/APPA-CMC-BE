const express = require('express')
const store = require('../data/store')
const { verifyToken, requireEditPermission } = require('../middleware/auth')

const router = express.Router()

const PERFORMANCE_TYPES = ['hotel_4plus', 'hotel_3minus', 'tea_room', 'concert']
const TICKET_MODES = ['paid', 'free']
const STATUSES = ['new', 'processing', 'licensed', 'rejected']
const MAX_SONGS = 5000

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

function readSongs(body) {
  if (!Array.isArray(body.songs)) return []
  return body.songs.slice(0, MAX_SONGS).map((song) => ({
    title: typeof song?.title === 'string' ? song.title.trim().slice(0, 300) : '',
    author: typeof song?.author === 'string' ? song.author.trim().slice(0, 300) : '',
    performer: typeof song?.performer === 'string' ? song.performer.trim().slice(0, 300) : '',
    link: typeof song?.link === 'string' ? song.link.trim().slice(0, 1000) : '',
  })).filter((song) => song.title || song.author || song.performer || song.link)
}

// Form công khai bên NDCP — khách gửi đơn không cần đăng nhập
router.post('/', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const id = readText(body, 'registrationCode', 80).toUpperCase()
  const performanceType = readText(body, 'performanceType', 30)
  const ticketMode = readText(body, 'ticketMode', 10) || 'free'
  const orgName = readText(body, 'orgName')

  if (!/^[A-Z0-9-]{5,80}$/i.test(id)) {
    return res.status(400).json({ message: 'Mã đăng ký không hợp lệ' })
  }
  if (!PERFORMANCE_TYPES.includes(performanceType)) {
    return res.status(400).json({ message: 'Loại hình biểu diễn không hợp lệ' })
  }
  if (!TICKET_MODES.includes(ticketMode)) {
    return res.status(400).json({ message: 'Hình thức bán vé không hợp lệ' })
  }
  if (!orgName) {
    return res.status(400).json({ message: 'Thiếu tên đơn vị tổ chức' })
  }

  const email = readText(body, 'email', 254)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Email không hợp lệ' })
  }
  const contactEmail = readText(body, 'contactEmail', 254)
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return res.status(400).json({ message: 'Email liên hệ không hợp lệ' })
  }

  const numericFields = {}
  for (const [key, max] of [
    ['feeAmount', Number.MAX_SAFE_INTEGER],
    ['venueCapacity', 10000000],
    ['avgTicketPrice', Number.MAX_SAFE_INTEGER],
    ['songsCount', MAX_SONGS],
  ]) {
    const value = readNumber(body, key, { max })
    if (value === undefined) {
      return res.status(400).json({ message: `Trường ${key} không hợp lệ` })
    }
    numericFields[key] = value
  }

  const songs = readSongs(body)
  const registration = {
    id,
    performanceType,
    performanceTypeLabel: readText(body, 'performanceTypeLabel', 200),
    ticketMode,
    orgName,
    taxCode: readText(body, 'taxCode', 30),
    orgAddress: readText(body, 'orgAddress'),
    representative: readText(body, 'representative', 200),
    legalRepresentative: readText(body, 'legalRepresentative', 200),
    phone: readText(body, 'phone', 40),
    email,
    programName: readText(body, 'programName', 300),
    programTime: readText(body, 'programTime', 200),
    programAddress: readText(body, 'programAddress'),
    venueCapacity: numericFields.venueCapacity,
    avgTicketPrice: numericFields.avgTicketPrice,
    contactName: readText(body, 'contactName', 200),
    contactPosition: readText(body, 'contactPosition', 200),
    contactPhone: readText(body, 'contactPhone', 40),
    contactEmail,
    contactAddress: readText(body, 'contactAddress'),
    songsCount: numericFields.songsCount ?? songs.length,
    songs,
    feeAmount: numericFields.feeAmount ?? 0,
    fileName: readText(body, 'fileName', 255),
    fileMimeType: readText(body, 'fileMimeType', 100),
  }

  const created = await store.createPerformanceRegistration(registration)
  if (!created) {
    return res.status(409).json({ message: 'Mã đăng ký đã tồn tại' })
  }
  return res.status(201).json({ registration: created })
})

// Các API dưới đây dành cho CMS (nhân sự đã đăng nhập)
router.use(verifyToken)

router.get('/', async (req, res) => {
  res.json({ registrations: await store.getPerformanceRegistrations() })
})

router.patch('/:id/status', requireEditPermission, async (req, res) => {
  const { status } = req.body || {}
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ' })
  }
  const updated = await store.updatePerformanceRegistrationStatus(req.params.id, status)
  if (!updated) {
    return res.status(404).json({ message: 'Không tìm thấy hồ sơ' })
  }
  res.json({ registration: updated })
})

module.exports = router

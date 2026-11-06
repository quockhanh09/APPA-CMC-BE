const express = require('express')
const store = require('../data/store')
const { verifyToken, requireEditPermission } = require('../middleware/auth')

const router = express.Router()

// Khớp businessTypes.js phía frontend CMS + 'other'
const CATEGORIES = [
  'coffee',
  'restaurant',
  'store',
  'gym',
  'karaokeRoom',
  'karaokeBox',
  'bar',
  'hotel',
  'entertainment',
  'mall',
  'supermarket',
  'other',
]
const STATUSES = ['pending', 'approved']
const MAX_AREA_M2 = 1000000

function readText(body, key, maxLength = 500) {
  const value = body[key]
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

// Ngày hiển thị dd/mm/yyyy (store tự đổi sang ISO cho cột date)
function readDisplayDate(body, key) {
  const value = readText(body, key, 10)
  if (!value) return ''
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return null
  const [d, m, y] = value.split('/').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null
  }
  return value
}

function readArea(body) {
  const value = body.areaM2
  if (value === undefined || value === null || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0 || num > MAX_AREA_M2) return undefined
  return num
}

// Đọc + kiểm tra payload chung cho tạo mới / cập nhật. Trả về { error } hoặc { unit }
function readUnitPayload(body, { partial = false } = {}) {
  const unit = {}

  const companyName = readText(body, 'companyName', 300)
  if (!partial || body.companyName !== undefined) {
    if (!companyName) return { error: 'Thiếu tên công ty / doanh nghiệp' }
    unit.companyName = companyName
  }

  for (const [key, max] of [
    ['taxCode', 30],
    ['facilityName', 300],
    ['city', 120],
    ['ward', 120],
    ['address', 500],
  ]) {
    if (partial && body[key] === undefined) continue
    unit[key] = readText(body, key, max)
  }

  if (!partial || body.category !== undefined) {
    const category = readText(body, 'category', 30) || 'other'
    if (!CATEGORIES.includes(category)) return { error: 'Loại hình kinh doanh không hợp lệ' }
    unit.category = category
  }

  if (!partial || body.status !== undefined) {
    const status = readText(body, 'status', 20) || 'pending'
    if (!STATUSES.includes(status)) return { error: 'Trạng thái không hợp lệ' }
    unit.status = status
  }

  for (const key of ['licenseStart', 'licenseEnd']) {
    if (partial && body[key] === undefined) continue
    const value = readDisplayDate(body, key)
    if (value === null) return { error: 'Thời hạn cấp phép không hợp lệ (định dạng dd/mm/yyyy)' }
    unit[key] = value
  }

  if (
    unit.licenseStart !== undefined &&
    unit.licenseEnd !== undefined &&
    unit.licenseStart &&
    unit.licenseEnd
  ) {
    const [sd, sm, sy] = unit.licenseStart.split('/').map(Number)
    const [ed, em, ey] = unit.licenseEnd.split('/').map(Number)
    if (Date.UTC(sy, sm - 1, sd) > Date.UTC(ey, em - 1, ed)) {
      return { error: 'Ngày hết hạn cấp phép phải sau ngày bắt đầu' }
    }
  }

  if (!partial || body.areaM2 !== undefined) {
    const area = readArea(body)
    if (area === undefined) return { error: 'Diện tích không hợp lệ' }
    unit.areaM2 = area
  }

  return { unit }
}

// Toàn bộ API đơn vị sử dụng dành cho CMS (nhân sự đã đăng nhập)
router.use(verifyToken)

router.get('/', async (req, res) => {
  res.json({ units: await store.getUsageUnits() })
})

router.post('/', requireEditPermission, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const { unit, error } = readUnitPayload(body)
  if (error) {
    return res.status(400).json({ message: error })
  }

  // MST là duy nhất trong phạm vi danh sách đơn vị (nếu có nhập)
  if (unit.taxCode) {
    const units = await store.getUsageUnits()
    if (units.some((u) => u.taxCode && u.taxCode === unit.taxCode)) {
      return res.status(409).json({ message: 'Mã số thuế đã tồn tại trong danh sách' })
    }
  }

  const created = await store.createUsageUnit({ ...unit, id: await store.nextUsageUnitId() })
  res.status(201).json({ unit: created })
})

router.patch('/:id', requireEditPermission, async (req, res) => {
  const existing = await store.findUsageUnitById(req.params.id)
  if (!existing) {
    return res.status(404).json({ message: 'Không tìm thấy đơn vị sử dụng' })
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const { unit, error } = readUnitPayload(body, { partial: true })
  if (error) {
    return res.status(400).json({ message: error })
  }

  if (unit.taxCode) {
    const units = await store.getUsageUnits()
    if (units.some((u) => u.id !== existing.id && u.taxCode && u.taxCode === unit.taxCode)) {
      return res.status(409).json({ message: 'Mã số thuế đã tồn tại trong danh sách' })
    }
  }

  // Kiểm tra chéo thời hạn cấp phép với giá trị gộp (cũ + mới)
  const mergedStart = unit.licenseStart !== undefined ? unit.licenseStart : existing.licenseStart
  const mergedEnd = unit.licenseEnd !== undefined ? unit.licenseEnd : existing.licenseEnd
  if (mergedStart && mergedEnd) {
    const [sd, sm, sy] = mergedStart.split('/').map(Number)
    const [ed, em, ey] = mergedEnd.split('/').map(Number)
    if (Date.UTC(sy, sm - 1, sd) > Date.UTC(ey, em - 1, ed)) {
      return res.status(400).json({ message: 'Ngày hết hạn cấp phép phải sau ngày bắt đầu' })
    }
  }

  const updated = await store.updateUsageUnit(existing.id, unit)
  res.json({ unit: updated })
})

router.delete('/:id', requireEditPermission, async (req, res) => {
  const deleted = await store.deleteUsageUnit(req.params.id)
  if (!deleted) {
    return res.status(404).json({ message: 'Không tìm thấy đơn vị sử dụng' })
  }
  res.json({ ok: true })
})

module.exports = router

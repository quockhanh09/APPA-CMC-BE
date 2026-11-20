const express = require('express')
const store = require('../data/store')
const { verifyToken, requireEditPermission } = require('../middleware/auth')

const router = express.Router()

// Kênh liên hệ hợp lệ
const CHANNELS = ['Zalo', 'Messenger', 'Email', 'Số điện thoại']

function readText(body, key, maxLength = 500) {
  const value = body[key]
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

// Đọc + kiểm tra payload chung cho tạo mới / cập nhật
function readNotePayload(body, { partial = false } = {}) {
  const note = {}

  const artistName = readText(body, 'artistName', 200)
  if (!partial || body.artistName !== undefined) {
    if (!artistName) return { error: 'Thiếu tên nghệ sĩ' }
    note.artistName = artistName
  }

  const contactPerson = readText(body, 'contactPerson', 200)
  if (!partial || body.contactPerson !== undefined) {
    if (!contactPerson) return { error: 'Thiếu người liên hệ' }
    note.contactPerson = contactPerson
  }

  if (!partial || body.channel !== undefined) {
    const channel = readText(body, 'channel', 50)
    if (!CHANNELS.includes(channel)) return { error: 'Kênh liên hệ không hợp lệ' }
    note.channel = channel
  }

  const channelValue = readText(body, 'channelValue', 300)
  if (!partial || body.channelValue !== undefined) {
    if (!channelValue) return { error: 'Thiếu thông tin kênh liên hệ' }
    note.channelValue = channelValue
  }

  const noteContent = readText(body, 'noteContent', 2000)
  if (!partial || body.noteContent !== undefined) {
    note.noteContent = noteContent
  }

  if (!partial || body.isContacted !== undefined) {
    note.isContacted = Boolean(body.isContacted)
  }

  return { note }
}

// Toàn bộ API ghi chú nghệ sĩ dành cho CMS (nhân sự đã đăng nhập)
router.use(verifyToken)

router.get('/', async (req, res) => {
  res.json({ notes: await store.getArtistNotes() })
})

router.post('/', requireEditPermission, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const { note, error } = readNotePayload(body)
  if (error) {
    return res.status(400).json({ message: error })
  }

  const created = await store.createArtistNote({ ...note, id: await store.nextArtistNoteId() })
  res.status(201).json({ note: created })
})

router.patch('/:id', requireEditPermission, async (req, res) => {
  const existing = await store.findArtistNoteById(req.params.id)
  if (!existing) {
    return res.status(404).json({ message: 'Không tìm thấy ghi chú' })
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const { note, error } = readNotePayload(body, { partial: true })
  if (error) {
    return res.status(400).json({ message: error })
  }

  const updated = await store.updateArtistNote(existing.id, note)
  res.json({ note: updated })
})

router.delete('/:id', requireEditPermission, async (req, res) => {
  const deleted = await store.deleteArtistNote(req.params.id)
  if (!deleted) {
    return res.status(404).json({ message: 'Không tìm thấy ghi chú' })
  }
  res.json({ ok: true })
})

module.exports = router
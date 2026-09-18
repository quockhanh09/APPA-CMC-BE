const express = require('express')
const bcrypt = require('bcryptjs')
const store = require('../data/store')
const { verifyToken, requireAdmin } = require('../middleware/auth')

const router = express.Router()

function toPublicUser(member) {
  const { passwordHash, ...publicUser } = member
  return publicUser
}

function formatToday() {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

router.use(verifyToken)

router.get('/', (req, res) => {
  res.json({ staff: store.getStaff().map(toPublicUser) })
})

router.post('/', requireAdmin, (req, res) => {
  const { name, username, email, phone, role, department, password, permissions } = req.body || {}
  if (!name || !username || !email || !phone || !role || !department || !password) {
    return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin nhân sự' })
  }
  if (store.findStaffByUsername(username)) {
    return res.status(409).json({ message: 'Tài khoản đã được sử dụng' })
  }
  if (store.findStaffByEmail(email)) {
    return res.status(409).json({ message: 'Email đã được sử dụng' })
  }

  const member = {
    id: store.nextStaffId(),
    name,
    username,
    email,
    phone,
    role,
    department,
    status: 'active',
    joinedAt: formatToday(),
    isMainAdmin: false,
    permissions: {
      view: Boolean(permissions?.view),
      edit: Boolean(permissions?.edit),
    },
    passwordHash: bcrypt.hashSync(password, 10),
  }
  store.addStaff(member)
  res.status(201).json({ staff: toPublicUser(member) })
})

router.patch('/:id/lock', requireAdmin, (req, res) => {
  const member = store.findStaffById(req.params.id)
  if (!member) {
    return res.status(404).json({ message: 'Không tìm thấy nhân sự' })
  }
  if (member.isMainAdmin) {
    return res.status(400).json({ message: 'Không thể khóa tài khoản quản trị chính' })
  }
  const updated = store.updateStaff(member.id, {
    status: member.status === 'locked' ? 'active' : 'locked',
  })
  res.json({ staff: toPublicUser(updated) })
})

module.exports = router

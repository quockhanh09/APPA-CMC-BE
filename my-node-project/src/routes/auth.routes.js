const express = require('express')
const bcrypt = require('bcryptjs')
const store = require('../data/store')
const { signToken, verifyToken } = require('../middleware/auth')

const router = express.Router()

function toPublicUser(member) {
  const { passwordHash, ...publicUser } = member
  return publicUser
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập tài khoản và mật khẩu' })
  }

  const member = store.findStaffByUsername(username)
  if (!member) {
    return res.status(401).json({ message: 'Tài khoản hoặc mật khẩu không đúng' })
  }
  if (member.status === 'locked') {
    return res.status(403).json({ message: 'Tài khoản đã bị tạm khóa' })
  }

  const valid = bcrypt.compareSync(password, member.passwordHash)
  if (!valid) {
    return res.status(401).json({ message: 'Tài khoản hoặc mật khẩu không đúng' })
  }

  const token = signToken(member)
  res.json({ token, user: toPublicUser(member) })
})

router.get('/me', verifyToken, (req, res) => {
  const member = store.findStaffById(req.user.id)
  if (!member) {
    return res.status(404).json({ message: 'Không tìm thấy tài khoản' })
  }
  res.json({ user: toPublicUser(member) })
})

router.patch('/me', verifyToken, (req, res) => {
  const { name, phone, email, department } = req.body || {}
  const member = store.findStaffById(req.user.id)
  if (!member) {
    return res.status(404).json({ message: 'Không tìm thấy tài khoản' })
  }
  const updates = {}
  if (name) updates.name = name
  if (phone) updates.phone = phone
  if (email) updates.email = email
  if (department) updates.department = department
  const updated = store.updateStaff(member.id, updates)
  res.json({ user: toPublicUser(updated) })
})

router.patch('/change-password', verifyToken, (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới' })
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự' })
  }
  const member = store.findStaffById(req.user.id)
  if (!member) {
    return res.status(404).json({ message: 'Không tìm thấy tài khoản' })
  }
  if (!bcrypt.compareSync(currentPassword, member.passwordHash)) {
    return res.status(401).json({ message: 'Mật khẩu hiện tại không đúng' })
  }
  store.updateStaff(member.id, { passwordHash: bcrypt.hashSync(newPassword, 10) })
  res.json({ message: 'Đổi mật khẩu thành công' })
})

module.exports = router


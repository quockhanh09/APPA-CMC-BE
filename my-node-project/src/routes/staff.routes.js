const express = require('express')
const bcrypt = require('bcryptjs')
const store = require('../data/store')
const { verifyToken, requireAdmin, requireEditPermission } = require('../middleware/auth')

const router = express.Router()

const TEXT_FIELDS = ['name', 'username', 'email', 'phone', 'role', 'department']
const VALID_ROLES = ['admin', 'manager', 'accountant', 'sales', 'support']
const VALID_STATUSES = ['active', 'locked']

function toPublicUser(member) {
  const { passwordHash, temporaryPassword, ...publicUser } = member
  return publicUser
}

function toAdminUser(member) {
  const { passwordHash, ...rest } = member
  return rest
}

function formatToday() {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

router.use(verifyToken)

router.get('/', requireAdmin, (req, res) => {
  const canSeePassword = Boolean(req.user?.permissions?.edit)
  res.json({
    staff: store
      .getStaff()
      .map((member) => (canSeePassword ? toAdminUser(member) : toPublicUser(member))),
  })
})

router.post('/', requireAdmin, requireEditPermission, (req, res) => {
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
    temporaryPassword: password,
    passwordHash: bcrypt.hashSync(password, 10),
  }
  store.addStaff(member)
  res.status(201).json({ staff: toPublicUser(member) })
})

// Sua thong tin + phan quyen nhan su (bao gom ca dat lai mat khau tạm)
router.patch('/:id', requireAdmin, requireEditPermission, (req, res) => {
  const member = store.findStaffById(req.params.id)
  if (!member) {
    return res.status(404).json({ message: 'Không tìm thấy nhân sự' })
  }
  if (member.isMainAdmin) {
    return res.status(400).json({ message: 'Không thể sửa tài khoản quản trị chính' })
  }

  const body = req.body || {}
  const updates = {}

  for (const field of TEXT_FIELDS) {
    const value = body[field]
    if (value === undefined) continue
    if (typeof value !== 'string' || !value.trim()) {
      return res.status(400).json({ message: 'Thông tin nhập không hợp lệ' })
    }
    updates[field] = value.trim()
  }

  if (updates.username) {
    const existed = store.findStaffByUsername(updates.username)
    if (existed && existed.id !== member.id) {
      return res.status(409).json({ message: 'Tài khoản đã được sử dụng' })
    }
  }
  if (updates.email) {
    const existed = store.findStaffByEmail(updates.email)
    if (existed && existed.id !== member.id) {
      return res.status(409).json({ message: 'Email đã được sử dụng' })
    }
  }
  if (updates.role && !VALID_ROLES.includes(updates.role)) {
    return res.status(400).json({ message: 'Vai trò không hợp lệ' })
  }

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' })
    }
    updates.status = body.status
  }

  if (body.permissions !== undefined) {
    const { view, edit } = body.permissions || {}
    if (typeof view !== 'boolean' || typeof edit !== 'boolean') {
      return res.status(400).json({ message: 'Phân quyền không hợp lệ' })
    }
    updates.permissions = { view, edit }
  }

  if (body.password !== undefined && body.password !== null && body.password !== '') {
    if (typeof body.password !== 'string' || body.password.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự' })
    }
    updates.temporaryPassword = body.password
    updates.passwordHash = bcrypt.hashSync(body.password, 10)
  }

  // khong cho phep tu ha quyen cua chinh minh xuong chi-xem
  if (updates.permissions?.edit === false && member.id === req.user.id) {
    return res.status(400).json({ message: 'Không thể tự bỏ quyền sửa của chính tài khoản đang đăng nhập' })
  }
  // khong cho phep tu khoa tai khoan cua chinh minh
  if (updates.status === 'locked' && member.id === req.user.id) {
    return res.status(400).json({ message: 'Không thể tự khóa tài khoản đang đăng nhập' })
  }

  const updated = store.updateStaff(member.id, updates)
  res.json({ staff: toAdminUser(updated) })
})

router.patch('/:id/lock', requireAdmin, requireEditPermission, (req, res) => {
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

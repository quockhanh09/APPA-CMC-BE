require('dotenv').config()
const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      isMainAdmin: Boolean(user.isMainAdmin),
      permissions: {
        view: Boolean(user.permissions?.view ?? true),
        edit: Boolean(user.permissions?.edit),
      },
    },
    JWT_SECRET,
    { expiresIn: '8h' },
  )
}

function verifyToken(req, res, next) {
  const header = req.headers.authorization || ''
  const [, token] = header.split(' ')
  if (!token) {
    return res.status(401).json({ message: 'Thiếu token xác thực' })
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch (err) {
    return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' })
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' })
  }
  next()
}

// Tai khoan chi co quyen "Xem" bi chan moi thao tac thay doi du lieu
function requireEditPermission(req, res, next) {
  if (!req.user?.permissions?.edit) {
    return res.status(403).json({ message: 'Tài khoản chỉ có quyền xem, không thể thực hiện thao tác này' })
  }
  next()
}

module.exports = { signToken, verifyToken, requireAdmin, requireEditPermission, JWT_SECRET }

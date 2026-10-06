require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')

const authRoutes = require('./src/routes/auth.routes')
const staffRoutes = require('./src/routes/staff.routes')
const applicationsRoutes = require('./src/routes/applications.routes')
const registrationsRoutes = require('./src/routes/registrations.routes')
const verificationRoutes = require('./src/routes/verification.routes')

const app = express()
const PORT = process.env.PORT || 4000

const allowedOrigins = new Set([
  'https://dangkysudung.appa.org.vn',
  'https://appa-cmc.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  ...(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
])

app.use(helmet())
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
}))
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use(verificationRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/staff', staffRoutes)
app.use('/api/registrations', registrationsRoutes)
app.use('/api/applications', applicationsRoutes)

app.use((req, res) => {
  res.status(404).json({ message: 'Không tìm thấy đường dẫn' })
})

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ message: 'Lỗi máy chủ nội bộ' })
})

app.listen(PORT, () => {
  console.log(`APPA CMC backend đang chạy tại http://localhost:${PORT}`)
})
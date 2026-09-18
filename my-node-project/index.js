require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')

const authRoutes = require('./src/routes/auth.routes')
const staffRoutes = require('./src/routes/staff.routes')

const app = express()
const PORT = process.env.PORT || 4000

app.use(helmet())
app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/auth', authRoutes)
app.use('/api/staff', staffRoutes)

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
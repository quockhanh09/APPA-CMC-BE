const fs = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')

const DB_FILE = path.join(__dirname, 'db.json')

function seedData() {
  const defaultPasswordHash = bcrypt.hashSync('appa123', 10)
  return {
    staff: [
      {
        id: 'NV0001',
        name: 'Admin',
        username: 'Adminappa',
        email: 'admin@appacmc.vn',
        phone: '0909 111 222',
        role: 'admin',
        department: 'Phòng CNTT',
        status: 'active',
        joinedAt: '01/01/2022',
        isMainAdmin: true,
        permissions: { view: true, edit: true },
        passwordHash: defaultPasswordHash,
      },
    ],
  }
}

function load() {
  if (!fs.existsSync(DB_FILE)) {
    const data = seedData()
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8')
    return data
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

let db = load()

function getStaff() {
  return db.staff
}

function findStaffByEmail(email) {
  return db.staff.find((s) => s.email.toLowerCase() === email.toLowerCase())
}

function findStaffByUsername(username) {
  return db.staff.find((s) => s.username.toLowerCase() === username.toLowerCase())
}

function findStaffById(id) {
  return db.staff.find((s) => s.id === id)
}

function nextStaffId() {
  const maxNum = db.staff.reduce((max, s) => {
    const num = parseInt(s.id.replace('NV', ''), 10)
    return Number.isNaN(num) ? max : Math.max(max, num)
  }, 0)
  return `NV${String(maxNum + 1).padStart(4, '0')}`
}

function addStaff(member) {
  db.staff.push(member)
  save(db)
  return member
}

function updateStaff(id, updates) {
  const member = findStaffById(id)
  if (!member) return null
  Object.assign(member, updates)
  save(db)
  return member
}

module.exports = {
  getStaff,
  findStaffByEmail,
  findStaffByUsername,
  findStaffById,
  nextStaffId,
  addStaff,
  updateStaff,
}

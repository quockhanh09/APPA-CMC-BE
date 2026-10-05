const fs = require('fs')
const path = require('path')
const { randomBytes } = require('crypto')
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
    applications: {},
  }
}

function load() {
  if (!fs.existsSync(DB_FILE)) {
    const data = seedData()
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8')
    return data
  }
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))
  if (!data.applications) {
    data.applications = {}
  }
  return data
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

function addHistory(state, text) {
  state.history.push({ at: new Date().toISOString(), text })
}

function createApplicationState(id) {
  const now = new Date().toISOString()
  const state = {
    id,
    createdAt: now,
    review: { status: 'pending', at: null, forcedTone: null },
    payment: { confirmed: false, confirmedAt: null, proof: null, verified: false, verifiedAt: null },
    certificate: { issued: false, issuedAt: null, sent: false, sentAt: null },
    history: [],
  }
  addHistory(state, 'Khách hàng tạo đơn thành công')
  addHistory(state, 'Khách hàng đồng ý Điều khoản dịch vụ và Cam kết sử dụng v2')
  addHistory(state, 'Hệ thống gửi email xác nhận hồ sơ')
  return state
}

function getApplicationState(id) {
  if (!db.applications[id]) {
    db.applications[id] = createApplicationState(id)
    save(db)
  }
  return db.applications[id]
}

function reviewApplication(id, action) {
  const state = getApplicationState(id)
  const statusByAction = {
    approve: 'approved',
    request_edit: 'edit_requested',
    reject: 'rejected',
  }
  const nextStatus = statusByAction[action]
  if (!nextStatus) return null

  // duyệt đang chờ: cho phép duyệt/yêu cầu sửa/từ chối; đã duyệt: chỉ còn được từ chối, và chỉ khi khách chưa gửi chứng từ thanh toán
  const canTransition =
    state.review.status === 'pending' ||
    (state.review.status === 'approved' && action === 'reject' && !state.payment.proof)
  if (!canTransition) {
    return null
  }

  state.review.status = nextStatus
  state.review.at = new Date().toISOString()
  const textByAction = {
    approve: 'Nhân viên duyệt hồ sơ và gửi đề nghị thanh toán',
    request_edit: 'Nhân viên yêu cầu khách hàng sửa hồ sơ',
    reject: 'Nhân viên từ chối hồ sơ',
  }
  addHistory(state, textByAction[action])
  save(db)
  return state
}

function acceptApplicationPayment(id) {
  const state = getApplicationState(id)
  if (state.review.status !== 'approved' || !state.payment.proof) {
    return null
  }
  state.payment.verified = true
  state.payment.verifiedAt = new Date().toISOString()
  state.certificate.issued = true
  state.certificate.issuedAt = state.payment.verifiedAt
  addHistory(state, 'Nhân viên chấp nhận thanh toán và cấp giấy chứng nhận')
  save(db)
  return state
}

// nut "Duyet" / "De nghi thanh toan" tach rieng: moi nut chot ngay ket qua hien thi (licensed/expired)
function quickReviewApplication(id, outcome) {
  const state = getApplicationState(id)
  if (state.review.status !== 'pending') {
    return null
  }
  const now = new Date().toISOString()
  state.review.status = 'approved'
  state.review.at = now
  state.review.forcedTone = outcome

  if (outcome === 'licensed') {
    state.payment.confirmed = true
    state.payment.confirmedAt = now
    state.payment.verified = true
    state.payment.verifiedAt = now
    state.certificate.issued = true
    state.certificate.issuedAt = now
    addHistory(state, 'Nhân viên duyệt hồ sơ và cấp phép')
  } else if (outcome === 'expired') {
    addHistory(state, 'Nhân viên gửi đề nghị thanh toán - hồ sơ quá hạn')
  } else {
    return null
  }

  save(db)
  return state
}

function prepareApplicationCertificate(id, details) {
  const state = getApplicationState(id)
  if (state.review.forcedTone !== 'licensed' && !state.certificate.issued) {
    return null
  }

  if (
    state.certificate.sent &&
    state.certificate.verificationToken &&
    state.certificate.details
  ) {
    return state
  }

  if (!state.certificate.verificationToken) {
    state.certificate.verificationToken = randomBytes(24).toString('hex')
  }
  state.certificate.details = details
  save(db)
  return state
}

function sendApplicationCertificate(id) {
  const state = getApplicationState(id)
  if (
    (state.review.forcedTone !== 'licensed' && !state.certificate.issued) ||
    !state.certificate.verificationToken ||
    !state.certificate.details
  ) {
    return null
  }
  if (state.certificate.sent) return state

  state.certificate.sent = true
  state.certificate.sentAt = new Date().toISOString()
  addHistory(state, 'Nhân viên gửi giấy chứng nhận cấp phép cho khách hàng')
  save(db)
  return state
}

function findApplicationByVerificationToken(token) {
  return Object.values(db.applications).find(
    (state) => state.certificate?.verificationToken === token,
  ) || null
}

function confirmApplicationPayment(id) {
  const state = getApplicationState(id)
  if (state.payment.confirmed) return state
  state.payment.confirmed = true
  state.payment.confirmedAt = new Date().toISOString()
  addHistory(state, 'Khách hàng xác nhận đã thanh toán')
  save(db)
  return state
}

function uploadApplicationPaymentProof(id, fileName) {
  const state = getApplicationState(id)
  if (!state.payment.confirmed) {
    return null
  }
  state.payment.proof = { fileName, uploadedAt: new Date().toISOString() }
  addHistory(state, `Khách hàng tải lên chứng từ thanh toán: ${fileName}`)
  save(db)
  return state
}

module.exports = {
  getStaff,
  findStaffByEmail,
  findStaffByUsername,
  findStaffById,
  nextStaffId,
  addStaff,
  updateStaff,
  getApplicationState,
  reviewApplication,
  confirmApplicationPayment,
  uploadApplicationPaymentProof,
  acceptApplicationPayment,
  quickReviewApplication,
  prepareApplicationCertificate,
  sendApplicationCertificate,
  findApplicationByVerificationToken,
}

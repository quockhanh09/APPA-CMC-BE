// Migrate dữ liệu thật từ src/data/db.json (staff, applications, registrationData)
// sang Supabase (bảng public.staff, public.applications, public.application_history).
//
// Cách chạy (từ thư mục my-node-project, sau khi `npm install` và điền
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong .env):
//   node scripts/migrate-dbjson-to-supabase.js
//
// Script dùng upsert (onConflict: 'id') nên chạy lại nhiều lần an toàn.

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'src', 'data', 'db.json')

if (!fs.existsSync(DB_FILE)) {
  console.error(`Không tìm thấy file dữ liệu: ${DB_FILE}`)
  process.exit(1)
}

const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))

function fromDisplayDate(value) {
  if (!value) return null
  const [d, m, y] = String(value).split('/')
  if (!d || !m || !y) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseFeeAmount(feeText) {
  return Number(String(feeText).replace(/\D/g, '')) || 0
}

const VALID_BUSINESS_TYPES = new Set([
  'coffee', 'restaurant', 'store', 'gym', 'karaokeRoom', 'karaokeBox',
  'bar', 'hotel', 'entertainment', 'mall', 'supermarket',
])

async function migrateStaff() {
  const rows = (db.staff || []).map((s) => ({
    id: s.id,
    name: s.name,
    username: s.username,
    email: s.email,
    phone: s.phone,
    role: s.role,
    department: s.department,
    status: s.status,
    joined_at: fromDisplayDate(s.joinedAt) || new Date().toISOString().slice(0, 10),
    is_main_admin: Boolean(s.isMainAdmin),
    can_view: Boolean(s.permissions?.view ?? true),
    can_edit: Boolean(s.permissions?.edit),
    password_hash: s.passwordHash,
    temporary_password: s.temporaryPassword || '',
  }))
  if (!rows.length) {
    console.log('- Không có staff để migrate.')
    return
  }
  const { error } = await supabase.from('staff').upsert(rows, { onConflict: 'id' })
  if (error) throw error
  console.log(`✓ Migrated ${rows.length} staff`)
}

async function migrateApplications() {
  const registrationData = db.registrationData || {}
  const applications = db.applications || {}
  const ids = Array.from(new Set([...Object.keys(registrationData), ...Object.keys(applications)]))

  const rows = []
  const skippedWithoutRegistration = []

  for (const id of ids) {
    const reg = registrationData[id]
    const app = applications[id] || {}

    if (!reg) {
      // Hồ sơ cũ chỉ có workflow, không còn dữ liệu đăng ký gốc (dữ liệu test cũ) —
      // vẫn migrate để không mất lịch sử xử lý, nhưng dùng id làm placeholder.
      skippedWithoutRegistration.push(id)
    }

    const businessType = VALID_BUSINESS_TYPES.has(reg?.type) ? reg.type : 'coffee'

    rows.push({
      id,
      unit: reg?.unit || id,
      tax_code: reg?.taxCode || null,
      facility: reg?.facility || reg?.unit || id,
      business_type: businessType,
      fee_amount: parseFeeAmount(reg?.fee),
      fee_text: reg?.fee || '—',
      duration: reg?.duration || '12 tháng',
      issue_date: reg?.issueDate || null,
      paid: Boolean(reg?.paid),
      business_type_label: reg?.registration?.businessTypeLabel || null,
      legal_representative: reg?.registration?.legalRepresentative || null,
      phone: reg?.registration?.phone || null,
      email: reg?.registration?.email || null,
      company_address: reg?.registration?.companyAddress || null,
      store_address: reg?.registration?.storeAddress || null,
      scale_details: reg?.registration?.scaleDetails || null,
      karaoke_sub_type: reg?.registration?.karaokeSubType || null,
      file_name: reg?.registration?.fileName || null,
      file_mime_type: reg?.registration?.fileMimeType || null,
      review_status: app.review?.status || 'pending',
      reviewed_at: app.review?.at || null,
      review_forced_tone: app.review?.forcedTone || null,
      payment_confirmed: Boolean(app.payment?.confirmed),
      payment_confirmed_at: app.payment?.confirmedAt || null,
      payment_proof_file_name: app.payment?.proof?.fileName || null,
      payment_proof_uploaded_at: app.payment?.proof?.uploadedAt || null,
      payment_verified: Boolean(app.payment?.verified),
      payment_verified_at: app.payment?.verifiedAt || null,
      certificate_issued: Boolean(app.certificate?.issued),
      certificate_issued_at: app.certificate?.issuedAt || null,
      certificate_sent: Boolean(app.certificate?.sent),
      certificate_sent_at: app.certificate?.sentAt || null,
      certificate_verification_token: app.certificate?.verificationToken || null,
      certificate_details: app.certificate?.details || null,
      created_at: app.createdAt || reg?.createdAt || new Date().toISOString(),
    })
  }

  if (!rows.length) {
    console.log('- Không có hồ sơ đăng ký để migrate.')
    return
  }

  const { error } = await supabase.from('applications').upsert(rows, { onConflict: 'id' })
  if (error) throw error
  console.log(`✓ Migrated ${rows.length} applications`)
  if (skippedWithoutRegistration.length) {
    console.log(
      `  ⚠ ${skippedWithoutRegistration.length} hồ sơ không có dữ liệu đăng ký gốc (migrate với thông tin placeholder): ${skippedWithoutRegistration.join(', ')}`,
    )
  }

  let historyCount = 0
  for (const id of ids) {
    const history = applications[id]?.history || []
    if (!history.length) continue
    const { error: delError } = await supabase.from('application_history').delete().eq('application_id', id)
    if (delError) throw delError
    const historyRows = history.map((h) => ({ application_id: id, at: h.at, text: h.text }))
    const { error: insError } = await supabase.from('application_history').insert(historyRows)
    if (insError) throw insError
    historyCount += historyRows.length
  }
  console.log(`✓ Migrated ${historyCount} history entries`)
}

async function main() {
  console.log(`Đọc dữ liệu từ: ${DB_FILE}`)
  await migrateStaff()
  await migrateApplications()
  console.log('Hoàn tất migrate dữ liệu từ db.json sang Supabase.')
}

main().catch((err) => {
  console.error('Migrate thất bại:', err)
  process.exit(1)
})

const { randomBytes } = require('crypto')
const supabase = require('./supabaseClient')

// ----------------------------------------------------------------------------
// Helpers: chuyển đổi định dạng ngày hiển thị (dd/mm/yyyy) <-> ISO (yyyy-mm-dd)
// dùng cho cột staff.joined_at (kiểu date trong Postgres)
// ----------------------------------------------------------------------------

function toDisplayDate(isoDate) {
  if (!isoDate) return ''
  const [y, m, d] = String(isoDate).slice(0, 10).split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

function fromDisplayDate(value) {
  if (!value) return null
  const [d, m, y] = String(value).split('/')
  if (!d || !m || !y) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseFeeAmount(feeText) {
  return Number(String(feeText).replace(/\D/g, '')) || 0
}

function throwIfError(error) {
  if (error) throw error
}

// ----------------------------------------------------------------------------
// STAFF (trang Quản trị hệ thống) — bảng public.staff
// ----------------------------------------------------------------------------

function mapStaffRow(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    phone: row.phone,
    role: row.role,
    department: row.department,
    status: row.status,
    joinedAt: toDisplayDate(row.joined_at),
    isMainAdmin: row.is_main_admin,
    permissions: { view: row.can_view, edit: row.can_edit },
    passwordHash: row.password_hash,
    temporaryPassword: row.temporary_password || '',
  }
}

async function getStaff() {
  const { data, error } = await supabase.from('staff').select('*').order('id', { ascending: true })
  throwIfError(error)
  return (data || []).map(mapStaffRow)
}

async function findStaffByEmail(email) {
  const { data, error } = await supabase.from('staff').select('*').ilike('email', email).maybeSingle()
  throwIfError(error)
  return mapStaffRow(data)
}

async function findStaffByUsername(username) {
  const { data, error } = await supabase.from('staff').select('*').ilike('username', username).maybeSingle()
  throwIfError(error)
  return mapStaffRow(data)
}

async function findStaffById(id) {
  const { data, error } = await supabase.from('staff').select('*').eq('id', id).maybeSingle()
  throwIfError(error)
  return mapStaffRow(data)
}

async function nextStaffId() {
  const { data, error } = await supabase.from('staff').select('id')
  throwIfError(error)
  const maxNum = (data || []).reduce((max, s) => {
    const num = parseInt(String(s.id).replace('NV', ''), 10)
    return Number.isNaN(num) ? max : Math.max(max, num)
  }, 0)
  return `NV${String(maxNum + 1).padStart(4, '0')}`
}

async function addStaff(member) {
  const insertRow = {
    id: member.id,
    name: member.name,
    username: member.username,
    email: member.email,
    phone: member.phone,
    role: member.role,
    department: member.department,
    status: member.status || 'active',
    joined_at: fromDisplayDate(member.joinedAt) || new Date().toISOString().slice(0, 10),
    is_main_admin: Boolean(member.isMainAdmin),
    can_view: Boolean(member.permissions?.view ?? true),
    can_edit: Boolean(member.permissions?.edit),
    password_hash: member.passwordHash,
    temporary_password: member.temporaryPassword || '',
  }
  const { data, error } = await supabase.from('staff').insert(insertRow).select().single()
  throwIfError(error)
  return mapStaffRow(data)
}

async function updateStaff(id, updates = {}) {
  const row = {}
  const DIRECT_FIELDS = ['name', 'username', 'email', 'phone', 'role', 'department', 'status']
  for (const field of DIRECT_FIELDS) {
    if (updates[field] !== undefined) row[field] = updates[field]
  }
  if (updates.permissions) {
    if (updates.permissions.view !== undefined) row.can_view = Boolean(updates.permissions.view)
    if (updates.permissions.edit !== undefined) row.can_edit = Boolean(updates.permissions.edit)
  }
  if (updates.passwordHash !== undefined) row.password_hash = updates.passwordHash
  if (updates.temporaryPassword !== undefined) row.temporary_password = updates.temporaryPassword
  if (updates.joinedAt !== undefined) row.joined_at = fromDisplayDate(updates.joinedAt)

  if (Object.keys(row).length === 0) {
    return findStaffById(id)
  }

  const { data, error } = await supabase.from('staff').update(row).eq('id', id).select().maybeSingle()
  throwIfError(error)
  return mapStaffRow(data)
}

// ----------------------------------------------------------------------------
// APPLICATIONS (trang Tổng quan / Doanh thu thu phí) — bảng public.applications
// + public.application_history
// ----------------------------------------------------------------------------

async function fetchApplicationRow(id) {
  const { data, error } = await supabase.from('applications').select('*').eq('id', id).maybeSingle()
  throwIfError(error)
  return data
}

async function fetchHistory(id) {
  const { data, error } = await supabase
    .from('application_history')
    .select('at, text')
    .eq('application_id', id)
    .order('at', { ascending: true })
  throwIfError(error)
  return data || []
}

async function addHistory(applicationId, text, at = new Date().toISOString()) {
  const { error } = await supabase
    .from('application_history')
    .insert({ application_id: applicationId, text, at })
  throwIfError(error)
}

// Khớp hình dạng state cũ (review/payment/certificate/history) để frontend không cần đổi
function mapWorkflow(row, historyRows = []) {
  return {
    id: row.id,
    createdAt: row.created_at,
    review: {
      status: row.review_status,
      at: row.reviewed_at,
      forcedTone: row.review_forced_tone,
    },
    payment: {
      confirmed: row.payment_confirmed,
      confirmedAt: row.payment_confirmed_at,
      proof: row.payment_proof_file_name
        ? { fileName: row.payment_proof_file_name, uploadedAt: row.payment_proof_uploaded_at }
        : null,
      verified: row.payment_verified,
      verifiedAt: row.payment_verified_at,
    },
    certificate: {
      issued: row.certificate_issued,
      issuedAt: row.certificate_issued_at,
      sent: row.certificate_sent,
      sentAt: row.certificate_sent_at,
      verificationToken: row.certificate_verification_token || undefined,
      details: row.certificate_details || undefined,
    },
    history: historyRows.map((h) => ({ at: h.at, text: h.text })),
  }
}

// Khớp hình dạng hồ sơ đăng ký cũ (registrationData[id]) để DataTable/revenue.js dùng nguyên vẹn
function mapRegistration(row, workflow) {
  return {
    id: row.id,
    unit: row.unit,
    taxCode: row.tax_code || '',
    facility: row.facility,
    type: row.business_type,
    fee: row.fee_text || '—',
    duration: row.duration,
    issueDate: row.issue_date,
    paid: row.paid,
    registration: {
      businessTypeLabel: row.business_type_label || '',
      legalRepresentative: row.legal_representative || '',
      phone: row.phone || '',
      email: row.email || '',
      companyAddress: row.company_address || '',
      storeAddress: row.store_address || '',
      scaleDetails: row.scale_details || '',
      karaokeSubType: row.karaoke_sub_type || '',
      fileName: row.file_name || '',
      fileMimeType: row.file_mime_type || '',
    },
    createdAt: row.created_at,
    workflow,
  }
}

async function getApplicationState(id) {
  const row = await fetchApplicationRow(id)
  if (!row) return null
  return mapWorkflow(row, await fetchHistory(id))
}

async function getRegisteredApplications() {
  const { data: rows, error } = await supabase
    .from('applications')
    .select('*')
    .order('created_at', { ascending: false })
  throwIfError(error)

  const ids = (rows || []).map((r) => r.id)
  const { data: historyRows, error: historyError } = await supabase
    .from('application_history')
    .select('*')
    .in('application_id', ids.length ? ids : ['__none__'])
    .order('at', { ascending: true })
  throwIfError(historyError)

  const historyByApp = {}
  for (const h of historyRows || []) {
    ;(historyByApp[h.application_id] ||= []).push(h)
  }

  return (rows || []).map((row) => mapRegistration(row, mapWorkflow(row, historyByApp[row.id] || [])))
}

async function createRegistration(registration) {
  const existing = await fetchApplicationRow(registration.id)
  if (existing) return null

  const nowIso = new Date().toISOString()
  const reg = registration.registration || {}
  const insertRow = {
    id: registration.id,
    unit: registration.unit,
    tax_code: registration.taxCode || null,
    facility: registration.facility,
    business_type: registration.type,
    fee_amount: Number.isFinite(registration.feeAmount) ? Math.round(registration.feeAmount) : parseFeeAmount(registration.fee),
    fee_text: registration.fee || '—',
    duration: registration.duration,
    issue_date: registration.issueDate || null,
    paid: Boolean(registration.paid),
    business_type_label: reg.businessTypeLabel || null,
    legal_representative: reg.legalRepresentative || null,
    phone: reg.phone || null,
    email: reg.email || null,
    company_address: reg.companyAddress || null,
    store_address: reg.storeAddress || null,
    scale_details: reg.scaleDetails || null,
    karaoke_sub_type: reg.karaokeSubType || null,
    file_name: reg.fileName || null,
    file_mime_type: reg.fileMimeType || null,
    created_at: nowIso,
  }

  const { data: inserted, error } = await supabase
    .from('applications')
    .insert(insertRow)
    .select()
    .single()
  throwIfError(error)

  await addHistory(registration.id, 'Khách hàng tạo đơn thành công', nowIso)
  await addHistory(registration.id, 'Khách hàng đồng ý Điều khoản dịch vụ và Cam kết sử dụng v2', nowIso)
  await addHistory(registration.id, 'Hệ thống gửi email xác nhận hồ sơ', nowIso)

  const historyRows = await fetchHistory(registration.id)
  return mapRegistration(inserted, mapWorkflow(inserted, historyRows))
}

async function reviewApplication(id, action) {
  const statusByAction = {
    approve: 'approved',
    request_edit: 'edit_requested',
    reject: 'rejected',
  }
  const nextStatus = statusByAction[action]
  if (!nextStatus) return null

  const row = await fetchApplicationRow(id)
  if (!row) return null

  // duyệt đang chờ: cho phép duyệt/yêu cầu sửa/từ chối; đã duyệt: chỉ còn được từ chối, và chỉ khi khách chưa gửi chứng từ thanh toán
  const canTransition =
    row.review_status === 'pending' ||
    (row.review_status === 'approved' && action === 'reject' && !row.payment_proof_file_name)
  if (!canTransition) {
    return null
  }

  const nowIso = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('applications')
    .update({ review_status: nextStatus, reviewed_at: nowIso })
    .eq('id', id)
    .select()
    .single()
  throwIfError(error)

  const textByAction = {
    approve: 'Nhân viên duyệt hồ sơ và gửi đề nghị thanh toán',
    request_edit: 'Nhân viên yêu cầu khách hàng sửa hồ sơ',
    reject: 'Nhân viên từ chối hồ sơ',
  }
  await addHistory(id, textByAction[action], nowIso)
  return mapWorkflow(updated, await fetchHistory(id))
}

async function acceptApplicationPayment(id) {
  const row = await fetchApplicationRow(id)
  if (!row || row.review_status !== 'approved' || !row.payment_proof_file_name) {
    return null
  }
  const nowIso = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('applications')
    .update({
      payment_verified: true,
      payment_verified_at: nowIso,
      certificate_issued: true,
      certificate_issued_at: nowIso,
    })
    .eq('id', id)
    .select()
    .single()
  throwIfError(error)
  await addHistory(id, 'Nhân viên chấp nhận thanh toán và cấp giấy chứng nhận', nowIso)
  return mapWorkflow(updated, await fetchHistory(id))
}

// nut "Duyet" / "De nghi thanh toan" tach rieng: moi nut chot ngay ket qua hien thi (licensed/expired)
async function quickReviewApplication(id, outcome) {
  const row = await fetchApplicationRow(id)
  if (!row || row.review_status !== 'pending') {
    return null
  }
  const nowIso = new Date().toISOString()
  const updates = {
    review_status: 'approved',
    reviewed_at: nowIso,
    review_forced_tone: outcome,
  }
  let historyText

  if (outcome === 'licensed') {
    Object.assign(updates, {
      payment_confirmed: true,
      payment_confirmed_at: nowIso,
      payment_verified: true,
      payment_verified_at: nowIso,
      certificate_issued: true,
      certificate_issued_at: nowIso,
    })
    historyText = 'Nhân viên duyệt hồ sơ và cấp phép'
  } else if (outcome === 'expired') {
    historyText = 'Nhân viên gửi đề nghị thanh toán - hồ sơ quá hạn'
  } else {
    return null
  }

  const { data: updated, error } = await supabase
    .from('applications')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  throwIfError(error)
  await addHistory(id, historyText, nowIso)
  return mapWorkflow(updated, await fetchHistory(id))
}

async function prepareApplicationCertificate(id, details) {
  const row = await fetchApplicationRow(id)
  if (!row) return null
  if (row.review_forced_tone !== 'licensed' && !row.certificate_issued) {
    return null
  }

  if (row.certificate_sent && row.certificate_verification_token && row.certificate_details) {
    return mapWorkflow(row, await fetchHistory(id))
  }

  const updates = { certificate_details: details }
  if (!row.certificate_verification_token) {
    updates.certificate_verification_token = randomBytes(24).toString('hex')
  }

  const { data: updated, error } = await supabase
    .from('applications')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  throwIfError(error)
  return mapWorkflow(updated, await fetchHistory(id))
}

async function sendApplicationCertificate(id) {
  const row = await fetchApplicationRow(id)
  if (!row) return null
  if (
    (row.review_forced_tone !== 'licensed' && !row.certificate_issued) ||
    !row.certificate_verification_token ||
    !row.certificate_details
  ) {
    return null
  }
  if (row.certificate_sent) {
    return mapWorkflow(row, await fetchHistory(id))
  }

  const nowIso = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('applications')
    .update({ certificate_sent: true, certificate_sent_at: nowIso })
    .eq('id', id)
    .select()
    .single()
  throwIfError(error)
  await addHistory(id, 'Nhân viên gửi giấy chứng nhận cấp phép cho khách hàng', nowIso)
  return mapWorkflow(updated, await fetchHistory(id))
}

async function findApplicationByVerificationToken(token) {
  const { data: row, error } = await supabase
    .from('applications')
    .select('*')
    .eq('certificate_verification_token', token)
    .maybeSingle()
  throwIfError(error)
  if (!row) return null
  return mapWorkflow(row, await fetchHistory(row.id))
}

async function confirmApplicationPayment(id) {
  const row = await fetchApplicationRow(id)
  if (!row) return null
  if (row.payment_confirmed) {
    return mapWorkflow(row, await fetchHistory(id))
  }
  const nowIso = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('applications')
    .update({ payment_confirmed: true, payment_confirmed_at: nowIso })
    .eq('id', id)
    .select()
    .single()
  throwIfError(error)
  await addHistory(id, 'Khách hàng xác nhận đã thanh toán', nowIso)
  return mapWorkflow(updated, await fetchHistory(id))
}

async function uploadApplicationPaymentProof(id, fileName) {
  const row = await fetchApplicationRow(id)
  if (!row || !row.payment_confirmed) {
    return null
  }
  const nowIso = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('applications')
    .update({ payment_proof_file_name: fileName, payment_proof_uploaded_at: nowIso })
    .eq('id', id)
    .select()
    .single()
  throwIfError(error)
  await addHistory(id, `Khách hàng tải lên chứng từ thanh toán: ${fileName}`, nowIso)
  return mapWorkflow(updated, await fetchHistory(id))
}

// ----------------------------------------------------------------------------
// PERFORMANCE REGISTRATIONS (trang Tổ chức biểu diễn) — bảng
// public.performance_registrations. Form bên NDCP (PerformancePage.jsx) gửi về.
// ----------------------------------------------------------------------------

function mapPerformanceRegistration(row) {
  if (!row) return null
  return {
    id: row.id,
    performanceType: row.performance_type,
    performanceTypeLabel: row.performance_type_label || '',
    ticketMode: row.ticket_mode,
    orgName: row.org_name,
    taxCode: row.tax_code || '',
    orgAddress: row.org_address || '',
    representative: row.representative || '',
    legalRepresentative: row.legal_representative || '',
    phone: row.phone || '',
    email: row.email || '',
    programName: row.program_name || '',
    programTime: row.program_time || '',
    programAddress: row.program_address || '',
    venueCapacity: row.venue_capacity,
    avgTicketPrice: row.avg_ticket_price,
    contactName: row.contact_name || '',
    contactPosition: row.contact_position || '',
    contactPhone: row.contact_phone || '',
    contactEmail: row.contact_email || '',
    contactAddress: row.contact_address || '',
    songsCount: row.songs_count ?? 0,
    songs: Array.isArray(row.songs) ? row.songs : [],
    feeAmount: row.fee_amount ?? 0,
    fileName: row.file_name || '',
    fileMimeType: row.file_mime_type || '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getPerformanceRegistrations() {
  const { data, error } = await supabase
    .from('performance_registrations')
    .select('*')
    .order('created_at', { ascending: false })
  throwIfError(error)
  return (data || []).map(mapPerformanceRegistration)
}

async function createPerformanceRegistration(registration) {
  const { data: existing, error: findError } = await supabase
    .from('performance_registrations')
    .select('id')
    .eq('id', registration.id)
    .maybeSingle()
  throwIfError(findError)
  if (existing) return null

  const insertRow = {
    id: registration.id,
    performance_type: registration.performanceType,
    performance_type_label: registration.performanceTypeLabel || null,
    ticket_mode: registration.ticketMode || 'free',
    org_name: registration.orgName,
    tax_code: registration.taxCode || null,
    org_address: registration.orgAddress || null,
    representative: registration.representative || null,
    legal_representative: registration.legalRepresentative || null,
    phone: registration.phone || null,
    email: registration.email || null,
    program_name: registration.programName || null,
    program_time: registration.programTime || null,
    program_address: registration.programAddress || null,
    venue_capacity: Number.isFinite(registration.venueCapacity) ? registration.venueCapacity : null,
    avg_ticket_price: Number.isFinite(registration.avgTicketPrice) ? Math.round(registration.avgTicketPrice) : null,
    contact_name: registration.contactName || null,
    contact_position: registration.contactPosition || null,
    contact_phone: registration.contactPhone || null,
    contact_email: registration.contactEmail || null,
    contact_address: registration.contactAddress || null,
    songs_count: Number.isFinite(registration.songsCount) ? registration.songsCount : 0,
    songs: Array.isArray(registration.songs) ? registration.songs : [],
    fee_amount: Number.isFinite(registration.feeAmount) ? Math.round(registration.feeAmount) : 0,
    file_name: registration.fileName || null,
    file_mime_type: registration.fileMimeType || null,
  }

  const { data, error } = await supabase
    .from('performance_registrations')
    .insert(insertRow)
    .select()
    .single()
  throwIfError(error)
  return mapPerformanceRegistration(data)
}

async function updatePerformanceRegistrationStatus(id, status) {
  const { data, error } = await supabase
    .from('performance_registrations')
    .update({ status })
    .eq('id', id)
    .select()
    .maybeSingle()
  throwIfError(error)
  return mapPerformanceRegistration(data)
}

// ----------------------------------------------------------------------------
// COPY REGISTRATIONS (trang Đăng ký sao chép) — bảng public.copy_registrations.
// Form bên NDCP (CopyPage.jsx) gửi về.
// ----------------------------------------------------------------------------

function mapCopyRegistration(row) {
  if (!row) return null
  return {
    id: row.id,
    copyType: row.copy_type,
    copyTypeLabel: row.copy_type_label || '',
    orgNameVN: row.org_name_vn,
    orgNameEN: row.org_name_en || '',
    taxCode: row.tax_code || '',
    orgAddress: row.org_address || '',
    legalRepresentative: row.legal_representative || '',
    inChargePerson: row.in_charge_person || '',
    phone: row.phone || '',
    email: row.email || '',
    invoiceEmail: row.invoice_email || '',
    contentTitle: row.content_title || '',
    contentDetail: row.content_detail || '',
    usageModel: row.usage_model || '',
    productionFormat: row.production_format || '',
    factoryPrice: row.factory_price,
    quantity: row.quantity,
    recordsCount: row.records_count ?? 0,
    records: Array.isArray(row.records) ? row.records : [],
    feeAmount: row.fee_amount ?? 0,
    fileName: row.file_name || '',
    fileMimeType: row.file_mime_type || '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getCopyRegistrations() {
  const { data, error } = await supabase
    .from('copy_registrations')
    .select('*')
    .order('created_at', { ascending: false })
  throwIfError(error)
  return (data || []).map(mapCopyRegistration)
}

async function createCopyRegistration(registration) {
  const { data: existing, error: findError } = await supabase
    .from('copy_registrations')
    .select('id')
    .eq('id', registration.id)
    .maybeSingle()
  throwIfError(findError)
  if (existing) return null

  const insertRow = {
    id: registration.id,
    copy_type: registration.copyType,
    copy_type_label: registration.copyTypeLabel || null,
    org_name_vn: registration.orgNameVN,
    org_name_en: registration.orgNameEN || null,
    tax_code: registration.taxCode || null,
    org_address: registration.orgAddress || null,
    legal_representative: registration.legalRepresentative || null,
    in_charge_person: registration.inChargePerson || null,
    phone: registration.phone || null,
    email: registration.email || null,
    invoice_email: registration.invoiceEmail || null,
    content_title: registration.contentTitle || null,
    content_detail: registration.contentDetail || null,
    usage_model: registration.usageModel || null,
    production_format: registration.productionFormat || null,
    factory_price: Number.isFinite(registration.factoryPrice) ? Math.round(registration.factoryPrice) : null,
    quantity: Number.isFinite(registration.quantity) ? registration.quantity : null,
    records_count: Number.isFinite(registration.recordsCount) ? registration.recordsCount : 0,
    records: Array.isArray(registration.records) ? registration.records : [],
    fee_amount: Number.isFinite(registration.feeAmount) ? Math.round(registration.feeAmount) : 0,
    file_name: registration.fileName || null,
    file_mime_type: registration.fileMimeType || null,
  }

  const { data, error } = await supabase
    .from('copy_registrations')
    .insert(insertRow)
    .select()
    .single()
  throwIfError(error)
  return mapCopyRegistration(data)
}

async function updateCopyRegistrationStatus(id, status) {
  const { data, error } = await supabase
    .from('copy_registrations')
    .update({ status })
    .eq('id', id)
    .select()
    .maybeSingle()
  throwIfError(error)
  return mapCopyRegistration(data)
}

// ----------------------------------------------------------------------------
// USAGE UNITS (trang Đơn vị sử dụng) — bảng public.usage_units.
// Khác các bảng *_registrations: bảng này do nhân sự CMS tự quản lý
// (thêm / sửa / xóa), không phải đơn gửi về từ form công khai.
// ----------------------------------------------------------------------------

function mapUsageUnit(row) {
  if (!row) return null
  return {
    id: row.id,
    companyName: row.company_name,
    taxCode: row.tax_code || '',
    facilityName: row.facility_name || '',
    city: row.city || '',
    ward: row.ward || '',
    address: row.address || '',
    category: row.category || 'other',
    licenseStart: toDisplayDate(row.license_start),
    licenseEnd: toDisplayDate(row.license_end),
    areaM2: row.area_m2 === null || row.area_m2 === undefined ? null : Number(row.area_m2),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getUsageUnits() {
  const { data, error } = await supabase
    .from('usage_units')
    .select('*')
    .order('created_at', { ascending: false })
  throwIfError(error)
  return (data || []).map(mapUsageUnit)
}

async function findUsageUnitById(id) {
  const { data, error } = await supabase.from('usage_units').select('*').eq('id', id).maybeSingle()
  throwIfError(error)
  return mapUsageUnit(data)
}

async function nextUsageUnitId() {
  const { data, error } = await supabase.from('usage_units').select('id')
  throwIfError(error)
  const maxNum = (data || []).reduce((max, u) => {
    const num = parseInt(String(u.id).replace('DV', ''), 10)
    return Number.isNaN(num) ? max : Math.max(max, num)
  }, 0)
  return `DV${String(maxNum + 1).padStart(4, '0')}`
}

async function createUsageUnit(unit) {
  const insertRow = {
    id: unit.id,
    company_name: unit.companyName,
    tax_code: unit.taxCode || null,
    facility_name: unit.facilityName || null,
    city: unit.city || null,
    ward: unit.ward || null,
    address: unit.address || null,
    category: unit.category || 'other',
    license_start: fromDisplayDate(unit.licenseStart),
    license_end: fromDisplayDate(unit.licenseEnd),
    area_m2: Number.isFinite(unit.areaM2) ? unit.areaM2 : null,
    status: unit.status || 'pending',
  }
  const { data, error } = await supabase.from('usage_units').insert(insertRow).select().single()
  throwIfError(error)
  return mapUsageUnit(data)
}

async function updateUsageUnit(id, updates = {}) {
  const row = {}
  if (updates.companyName !== undefined) row.company_name = updates.companyName
  if (updates.taxCode !== undefined) row.tax_code = updates.taxCode || null
  if (updates.facilityName !== undefined) row.facility_name = updates.facilityName || null
  if (updates.city !== undefined) row.city = updates.city || null
  if (updates.ward !== undefined) row.ward = updates.ward || null
  if (updates.address !== undefined) row.address = updates.address || null
  if (updates.category !== undefined) row.category = updates.category
  if (updates.licenseStart !== undefined) row.license_start = fromDisplayDate(updates.licenseStart)
  if (updates.licenseEnd !== undefined) row.license_end = fromDisplayDate(updates.licenseEnd)
  if (updates.areaM2 !== undefined) row.area_m2 = Number.isFinite(updates.areaM2) ? updates.areaM2 : null
  if (updates.status !== undefined) row.status = updates.status

  if (Object.keys(row).length === 0) {
    return findUsageUnitById(id)
  }

  const { data, error } = await supabase
    .from('usage_units')
    .update(row)
    .eq('id', id)
    .select()
    .maybeSingle()
  throwIfError(error)
  return mapUsageUnit(data)
}

async function deleteUsageUnit(id) {
  const { data, error } = await supabase
    .from('usage_units')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()
  throwIfError(error)
  return Boolean(data)
}

module.exports = {
  getStaff,
  findStaffByEmail,
  findStaffByUsername,
  findStaffById,
  nextStaffId,
  addStaff,
  updateStaff,
  getRegisteredApplications,
  createRegistration,
  getApplicationState,
  reviewApplication,
  confirmApplicationPayment,
  uploadApplicationPaymentProof,
  acceptApplicationPayment,
  quickReviewApplication,
  prepareApplicationCertificate,
  sendApplicationCertificate,
  findApplicationByVerificationToken,
  getPerformanceRegistrations,
  createPerformanceRegistration,
  updatePerformanceRegistrationStatus,
  getCopyRegistrations,
  createCopyRegistration,
  updateCopyRegistrationStatus,
  getUsageUnits,
  findUsageUnitById,
  nextUsageUnitId,
  createUsageUnit,
  updateUsageUnit,
  deleteUsageUnit,
}

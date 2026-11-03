const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
// Dùng service role key: backend là môi trường tin cậy, cần đọc/ghi mọi bảng
// bất kể RLS (RLS trên các bảng chỉ áp dụng cho truy cập trực tiếp từ phía
// client bằng anon/authenticated key, không ảnh hưởng tới service role key).
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Thiếu biến môi trường SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY. Xem .env.example để cấu hình.',
  )
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

module.exports = supabase

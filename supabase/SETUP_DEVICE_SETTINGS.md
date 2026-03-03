# Setup Device Settings Table

## Bước 1: Chạy Migration SQL

Bạn cần chạy SQL migration để tạo bảng `device_settings` trong Supabase.

### Cách 1: Qua Supabase Dashboard (Recommended)

1. Mở [Supabase Dashboard](https://app.supabase.com)
2. Chọn project của bạn
3. Vào **SQL Editor** (icon database bên trái)
4. Tạo query mới
5. Copy toàn bộ nội dung từ file `supabase/migrations/001_device_settings.sql`
6. Paste vào editor và click **Run**

### Cách 2: Qua Supabase CLI (Nếu đã cài)

```bash
cd c:\AM
supabase db push
```

## Bước 2: Kiểm Tra

Sau khi chạy migration, kiểm tra bảng đã được tạo:

1. Vào **Table Editor** trong Supabase Dashboard
2. Tìm bảng `device_settings`
3. Xem cấu trúc bảng có các columns:
   - `id` (bigint, primary key)
   - `device_id` (text, unique)
   - `display_name` (text, nullable)
   - `location` (text, nullable)
   - `note` (text, nullable)
   - `created_at` (timestamptz)
   - `updated_at` (timestamptz)

## Bước 3: Test Trên Dashboard

1. Chạy dashboard local: `npm run dev` (trong folder dashboard)
2. Mở browser: http://localhost:3000
3. Click nút **Settings** (icon gear) ở header
4. Thử thêm display name, location, note cho devices
5. Save và kiểm tra:
   - Device selector sẽ hiển thị display name
   - Hover vào device để xem tooltip với note

## Cấu Trúc Files Mới

```
c:\AM\
├── supabase/
│   └── migrations/
│       └── 001_device_settings.sql       # Migration tạo bảng
├── dashboard/
│   ├── hooks/
│   │   └── useDeviceSettings.js          # Hook quản lý device settings
│   ├── components/
│   │   └── SettingsModal.js              # Modal UI cho settings
│   └── app/
│       └── page.js                       # Updated với Settings integration
```

## Features

✅ **Display Name Mapping**: Đặt tên hiển thị thân thiện cho mỗi device
✅ **Location**: Ghi nhận vị trí đặt device
✅ **Notes**: Thêm ghi chú chi tiết (hiển thị khi hover)
✅ **Realtime Updates**: Lưu trực tiếp vào Supabase
✅ **Beautiful UI**: Modal settings với dark theme matching dashboard

## Troubleshooting

### Lỗi: "relation device_settings does not exist"
→ Chưa chạy migration. Quay lại Bước 1.

### Lỗi: Permission denied
→ Kiểm tra RLS policies đã được tạo đúng trong migration.

### Settings không lưu
→ Check browser console xem có lỗi API không.
→ Verify Supabase URL và anon key trong `.env.local`

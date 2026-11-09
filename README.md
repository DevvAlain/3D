# 🎟️ Church Lucky Draw (Quay Số May Mắn Giáo Xứ)

Hệ thống quay số may mắn 3D cao cấp dành cho đại hội / lễ hội giáo xứ với màn hình trình chiếu máy chiếu lộng lẫy và khu vực hậu trường độc lập.

## 🌟 Tổng Quan Kiến Trúc

- **Monorepo**: Turborepo + pnpm workspaces (`apps/web`, `packages/shared`, `supabase/migrations`).
- **Core Framework**: Next.js 15 (App Router), TypeScript Strict, Tailwind CSS.
- **Backend & Database**: Supabase (PostgreSQL, Row Level Security, RPC Functions, Storage, Realtime).
- **Thuật Toán Quay Số (Fairness & Security)**:
  - Chọn số **hoàn toàn phía server** trong hàm PostgreSQL RPC `draw_next`.
  - Sử dụng `pgcrypto gen_random_bytes(4)` kết hợp **Rejection Sampling** (chuẩn 64-bit BIGINT, $2^{32} = 4,294,967,296$) loại bỏ hoàn toàn hiện tượng lệch modulo (modulo bias).
  - Khóa dòng sự kiện (`FOR UPDATE`) đồng bộ hóa trên mọi thao tác `draw_next`, `confirm_won`, `mark_absent`, `void_last`, triệt tiêu hoàn toàn race condition và double-draw.
  - Partial Unique Index: Chỉ duy nhất 1 sự kiện được `is_active = true`.
  - Trigger ngăn chặn thay đổi `test_mode` khi sự kiện đã có lượt quay chính thức (`is_test = false`).
  - Phân quyền nghiêm ngặt: `REVOKE EXECUTE FROM PUBLIC, anon, authenticated; GRANT ONLY TO service_role`.
- **Màn hình sân khấu 3D**: Three.js qua React Three Fiber, Rapier Physics, Bloom effect, GSAP.

---

## 📁 Cấu Trúc Dự Án

```
church-lucky-draw/
├─ apps/web/                  # Next.js App (Admin backstage + Display stage)
│  ├─ app/admin/              # Cấu hình sự kiện, giải thưởng, vé loại trừ, CSV
│  ├─ app/display/            # Sân khấu 3D lộng lẫy dành cho máy chiếu & Presenter
│  ├─ app/api/draw/...        # Server Route Handlers gọi RPC bảo mật
│  └─ components/three/       # Stage, Cage, Balls, Chute, Chùm sáng, Effects
├─ packages/shared/           # Zod schemas, Draw state machine, CSPRNG helpers & Vitest
├─ supabase/
│  ├─ migrations/             # 20261109000001 (Schema, RLS), 20261109000002 (CSPRNG RPCs)
│  ├─ seed.sql                # Dữ liệu mẫu (chỉ dùng cục bộ, không bao giờ push vào remote migration)
│  └─ tests/                  # Integration test suite kiểm thử DB độc lập
├─ turbo.json                 # Cấu hình Turborepo pipeline
└─ README.md                  # Hướng dẫn thiết lập, phân quyền & diễn tập
```

---

## 🔐 Thiết Lập Xác Thực & Tài Khoản Admin Duy Nhất

### 1. Vô hiệu hóa đăng ký công khai (Disable Public Sign-ups)
Để đảm bảo an toàn tuyệt đối cho sự kiện:
1. Truy cập **Supabase Dashboard** -> **Authentication** -> **Providers** -> **Email**.
2. **Bỏ chọn (Disable)** mục **"Allow new users to sign up"** (hoặc "Enable Email Signup").
3. Nhấn **Save**. Lúc này chỉ có người quản trị được mời hoặc tạo trực tiếp mới có tài khoản.

### 2. Tạo tài khoản Admin duy nhất & gán quyền `app_metadata.role = 'admin'`
Bạn có thể tạo tài khoản qua Supabase Dashboard -> **Authentication** -> **Users** -> **Add user**.

Sau đó, mở **SQL Editor** trên Supabase Dashboard và chạy lệnh sau để gán quyền Admin:

```sql
-- Gán quyền admin vào app_metadata (được kiểm tra an toàn trong RLS is_admin())
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'admin@your-parish.org';
```

Hoặc tạo trực tiếp qua Node.js Supabase Admin API với Service Role Key:

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

await supabaseAdmin.auth.admin.createUser({
  email: 'admin@your-parish.org',
  password: 'SecurePassword2026!',
  email_confirm: true,
  app_metadata: { role: 'admin' },
});
```

---

## 🚀 Cài Đặt & Chạy Môi Trường Phát Triển

### 1. Cài đặt Dependencies

```bash
pnpm install
```

### 2. Thiết lập Biến Môi Trường

Tạo file `.env` tại thư mục root (tham khảo file `.env.example`):

```bash
# Public credentials (truyền an toàn cho browser bundle)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_your_key_here

# Server-only credentials (TUYỆT ĐỐI KHÔNG để lộ ra client)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_your_service_role_key_here
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.your-project-id.supabase.co:5432/postgres
```

### 3. Áp dụng Database Migrations với Supabase CLI

Thư mục `supabase/migrations/` chỉ chứa 2 file schema & RPCs chính thức:
- `20261109000001_initial_schema.sql`: Bảng, Partial Unique Indexes, RLS policies, Realtime publication, Storage bucket.
- `20261109000002_draw_rpcs.sql`: Hàm `draw_next`, `confirm_won`, `mark_absent`, `void_last`, `clear_test_draws`, CSPRNG rejection sampling.

File dữ liệu mẫu `supabase/seed.sql` được tách riêng, không nằm trong migrations.

Để đẩy migration lên Supabase:
```bash
supabase link --project-ref your-project-id
supabase db push
```

Hoặc nạp seed data cho môi trường phát triển:
```bash
psql "$DATABASE_URL" -f supabase/seed.sql
```

### 4. Chạy Unit Tests

```bash
pnpm test
```

### 5. Chạy Integration Test Suite (7 Kịch bản chuyên sâu)

Chạy kịch bản kiểm thử toàn diện độc lập (Partial Unique Index, Concurrency Row Lock, Idempotency, Quyền hạn phân quyền anon/authenticated bị từ chối, State transitions, 350+ draws liên tiếp không trùng lặp):

```bash
pnpm test:integration
```

### 6. Khởi động Web Server Phát Triển

```bash
pnpm dev
```

Truy cập:
- Trang chủ: [http://localhost:3000](http://localhost:3000)
- Màn hình sân khấu: [http://localhost:3000/display](http://localhost:3000/display)
- Bảng quản trị: [http://localhost:3000/admin](http://localhost:3000/admin)

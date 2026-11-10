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

## 🔐 Thiết Lập Xác Thực & Phân Quyền (`admin` và `presenter`)

Hệ thống tách biệt chặt chẽ hai vai trò người dùng qua `app_metadata.role`:
- **`admin`**: Toàn quyền cấu hình sự kiện, giải thưởng, vé loại trừ, xem lịch sử trúng thưởng theo thời gian thực. **Không có nút quay số**.
- **`presenter`**: Người điều khiển màn hình trình chiếu `/display`. Chỉ được phép gọi các API quay số (`/api/draw/*` qua Next.js server). Không có quyền truy cập cấu hình hoặc ghi trực tiếp vào DB.

### 1. Vô hiệu hóa đăng ký công khai (Disable Public Sign-ups)
Để đảm bảo an toàn tuyệt đối cho sự kiện:
1. Truy cập **Supabase Dashboard** -> **Authentication** -> **Providers** -> **Email**.
2. **Bỏ chọn (Disable)** mục **"Allow new users to sign up"** (hoặc "Enable Email Signup").
3. Nhấn **Save**. Lúc này chỉ có tài khoản do ban tổ chức tạo mới đăng nhập được.

### 2. Tạo tài khoản `admin` và `presenter` & gán `app_metadata.role`
Tạo 2 tài khoản qua **Supabase Dashboard** -> **Authentication** -> **Users** -> **Add user** (ví dụ `admin@parish.org` và `presenter@parish.org`).

Sau đó, mở **SQL Editor** trên Supabase Dashboard và chạy lệnh sau để gán role vào `app_metadata`:

```sql
-- Gán quyền admin (được kiểm tra bởi RLS is_admin())
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
WHERE email = 'admin@parish.org';

-- Gán quyền presenter (được kiểm tra ở Next.js API Route Handlers)
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "presenter"}'::jsonb
WHERE email = 'presenter@parish.org';
```

Hoặc tạo trực tiếp qua Node.js Supabase Admin API với `SUPABASE_SERVICE_ROLE_KEY`:

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// 1. Tạo tài khoản Admin
await supabaseAdmin.auth.admin.createUser({
  email: 'admin@parish.org',
  password: 'SecureAdminPassword2026!',
  email_confirm: true,
  app_metadata: { role: 'admin' },
});

// 2. Tạo tài khoản Presenter (Màn hình sân khấu)
await supabaseAdmin.auth.admin.createUser({
  email: 'presenter@parish.org',
  password: 'SecurePresenterPassword2026!',
  email_confirm: true,
  app_metadata: { role: 'presenter' },
});
```

---

## 🚀 Cài Đặt & Chạy Môi Trường Phát Triển

### 1. Cài đặt Dependencies

```bash
pnpm install
```

### 2. Thiết lập Biến Môi Trường

Sao chép `.env.example` thành `.env` tại thư mục root và điền giá trị thực từ Supabase Dashboard:

```bash
cp .env.example .env
```

> ⚠️ **Cảnh báo bảo mật**: Tuyệt đối không đặt tiền tố `NEXT_PUBLIC_` cho `SUPABASE_SERVICE_ROLE_KEY` hoặc `DATABASE_URL`. Các key này chỉ dùng ở phía server.

### 3. Áp dụng Database Migrations với Supabase CLI

Thư mục `supabase/migrations/` chỉ chứa 2 file schema & RPCs chính thức:
- `20261109000001_initial_schema.sql`: Bảng, `ON DELETE RESTRICT`, `UNIQUE (event_id, is_test, seq)`, Partial Unique Indexes, RLS (`draws` chỉ SELECT cho admin), Realtime publication, Storage bucket (chỉ PNG/JPEG/WEBP/Audio, bỏ SVG).
- `20261109000002_draw_rpcs.sql`: Hàm `draw_next`, `confirm_won`, `mark_absent`, `void_last`, `clear_test_draws`, `reset_event`, CSPRNG rejection sampling.

File dữ liệu mẫu `supabase/seed.sql` được tách riêng, không nằm trong migrations.

Để đẩy migration lên Supabase:
```bash
supabase link --project-ref <your-project-ref>
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

### 5. Chạy Integration Test Suite (8 Kịch bản Multi-Connection chuyên sâu)

Kịch bản tự động chạy trên `supabase start` (nếu đang chạy ở cổng 54321/54322) hoặc tự khởi tạo Embedded PostgreSQL cục bộ với 25 kết nối song song (`pg.Pool`):

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

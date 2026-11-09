# 🎟️ Church Lucky Draw (Quay Số May Mắn Giáo Xứ)

Hệ thống quay số may mắn 3D cao cấp dành cho đại hội / lễ hội giáo xứ với màn hình trình chiếu máy chiếu lộng lẫy và khu vực hậu trường độc lập.

## 🌟 Tổng Quan Kiến Trúc

- **Monorepo**: Turborepo + pnpm workspaces (`apps/web`, `packages/shared`, `supabase/migrations`).
- **Core Framework**: Next.js 15 (App Router), TypeScript Strict, Tailwind CSS.
- **Backend & Database**: Supabase (PostgreSQL, Row Level Security, RPC Functions, Storage, Realtime).
- **Thuật Toán Quay Số (Fairness & Security)**:
  - Chọn số **hoàn toàn phía server** trong hàm PostgreSQL RPC `draw_next`.
  - Sử dụng `pgcrypto gen_random_bytes(4)` kết hợp **Rejection Sampling** loại bỏ hoàn toàn hiện tượng lệch modulo (modulo bias).
  - Khóa dòng sự kiện (`FOR UPDATE`) triệt tiêu hoàn toàn race condition và double-draw.
  - Quản lý trạng thái bằng State Machine nghiêm ngặt: `idle` → `revealing` → `won` | `absent` | `void`.
  - Hỗ trợ `idempotency_key` chống double-click khi mạng chập chờn.
  - Phân quyền: `REVOKE EXECUTE FROM PUBLIC, anon, authenticated; GRANT ONLY TO service_role`.
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
│  ├─ migrations/             # 00001 (Schema, RLS), 00002 (CSPRNG RPCs), 00003 (Seed)
│  └─ tests/                  # Integration test suite kiểm thử DB trực tiếp
├─ turbo.json                 # Cấu hình Turborepo pipeline
└─ README.md                  # Hướng dẫn thiết lập & diễn tập
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
# Public credentials (truyền cho trình duyệt)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_your_key_here

# Server-only credentials (TUYỆT ĐỐI KHÔNG để lộ ra client)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_your_service_role_key_here
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.your-project-id.supabase.co:5432/postgres
```

### 3. Áp dụng Database Migrations với Supabase CLI

Theo yêu cầu kiểm duyệt an toàn, các file migration được lưu tại `supabase/migrations/`:
- `20261109000001_initial_schema.sql`: Bảng, RLS policies, Realtime publication, Storage bucket.
- `20261109000002_draw_rpcs.sql`: Hàm `draw_next`, `confirm_won`, `mark_absent`, `void_last`, `clear_test_draws`, CSPRNG rejection sampling.
- `20261109000003_seed.sql`: Dữ liệu mẫu (Vé 5 số 1–3000; 10 Ba, 5 Nhì, 3 Nhất, 1 Đặc biệt).

Bạn có thể review và đẩy migration lên Supabase bằng Supabase CLI:

```bash
# Đăng nhập Supabase CLI nếu chưa
supabase login

# Liên kết với project
supabase link --project-ref your-project-id

# Đẩy các migration lên cơ sở dữ liệu
supabase db push
```

Hoặc thực thi trực tiếp các file SQL qua psql / Supabase SQL Editor:
```bash
psql "$DATABASE_URL" -f supabase/migrations/20261109000001_initial_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/20261109000002_draw_rpcs.sql
psql "$DATABASE_URL" -f supabase/migrations/20261109000003_seed.sql
```

### 4. Chạy Unit Tests

```bash
pnpm test
```

### 5. Chạy Integration Test (Sau khi push migration vào DB)

Chạy kịch bản kiểm thử toàn diện (Concurrency lock, Idempotency, 40+ draws không trùng lặp, State transitions):

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

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
- **Màn hình sân khấu 3D ("Gala of Stained Glass")**: Three.js qua React Three Fiber (`dynamic(..., { ssr: false })` chỉ tách chunk trên `/display`), Rapier Physics (40–50 bóng 0–9 via `CanvasTexture`), Bloom/Vignette (Cao), và chế độ dự phòng 2D tự động khi WebGL không khả dụng / `webglcontextlost`.

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
│  ├─ migrations/             # 000001 (Schema, RLS), 000002 (CSPRNG RPCs), 000003 (activate_event RPC)
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

Sao chép `.env.example` thành `.env` tại thư mục root (hoặc `apps/web/.env.local`) và điền giá trị thực từ Supabase Dashboard:

```bash
cp .env.example .env
```

Hỗ trợ cả 2 bộ tên khóa phổ biến của Supabase:
- Public client: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (hoặc `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Server-only: `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (hoặc `SUPABASE_SERVICE_ROLE_KEY`).

> ⚠️ **Cảnh báo bảo mật**: Tuyệt đối không đặt tiền tố `NEXT_PUBLIC_` cho `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` hoặc `DATABASE_URL`. Các key này chỉ dùng ở phía server.

### 3. Áp dụng Database Migrations với Supabase CLI

Thư mục `supabase/migrations/` gồm 3 file schema & RPCs chính thức:
- `20261109000001_initial_schema.sql`: Bảng (`events`, `prizes`, `excluded_tickets`, `draws`, `audit_logs`), `ON DELETE RESTRICT`, `UNIQUE (event_id, is_test, seq)`, Partial Unique Indexes, trigger khóa dải số / vé loại trừ / số lượng giải khi đã có quay chính thức, RLS (`draws` & `audit_logs` chỉ SELECT cho admin), Realtime publication, Storage bucket (chỉ PNG/JPEG/WEBP/Audio, bỏ SVG).
- `20261109000002_draw_rpcs.sql`: Hàm `draw_next`, `confirm_won`, `mark_absent`, `undo_absent`, `void_last`, `clear_test_draws`, `reset_event` (ghi `audit_logs` với `actor_id` / `actor_email`), CSPRNG rejection sampling (mọi hàm `SECURITY DEFINER` đều gắn `pg_temp` trong `search_path`).
- `20261110000003_activate_event_rpc.sql`: Hàm `activate_event` (`service_role` only, khóa advisory transaction) chuyển `is_active = true` sang sự kiện đích một cách nguyên tử (atomic).

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

### 5. Chạy Integration Test Suite (9 Kịch bản Multi-Connection chuyên sâu)

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
- Màn hình sân khấu (Presenter): [http://localhost:3000/display](http://localhost:3000/display)
- Xem trước chỉ đọc (Admin Preview): [http://localhost:3000/display?preview=1](http://localhost:3000/display?preview=1)
- Bảng quản trị (Admin): [http://localhost:3000/admin](http://localhost:3000/admin)

---

## 🎭 Phím Tắt & Chế Độ Trình Chiếu (`/display`)

- **`Space` / `→`**: Quay số tiếp theo (tự động khóa trong lúc đang mở số & có cooldown 900ms chống bấm đúp bút trình chiếu).
- **`Enter`**: Xác nhận vé trúng thưởng (`won`).
- **`V`**: Đánh dấu vé vắng mặt (`absent`).
- **`U`**: Hoàn tác vắng mặt lượt cuối (`undo_absent`).
- **`Backspace`**: Hủy lượt quay cuối & trả số về rổ (`void_last`).
- **`Q`**: Chuyển nhanh chất lượng đồ họa: **Trung bình (3D, mặc định + 40 bóng)** → **Thấp (2D an toàn)** → **Cao (3D + Bloom + Phản chiếu + 50 bóng)**.
- **`D`**: Bật / tắt bảng đo **FPS** trực tiếp.
- **`M`**: Bật / tắt âm thanh sân khấu (`Howler.js`).
- **`F`**: Bật / tắt toàn màn hình.
- *(Ghi chú: bấm `Space` khi hiệu ứng mở từng chữ số đang chạy sẽ tua nhanh tới kết quả cuối cùng).*

---

## 📦 Bản Quyền Tài Nguyên Tự Lưu Trữ (Fonts & Audio Assets)

Toàn bộ font chữ và tệp âm thanh được lưu trữ cục bộ (không phụ thuộc CDN bên thứ ba khi trình chiếu ngoại tuyến):

- **Typography (Self-hosted via `@fontsource`, chuẩn SIL Open Font License 1.1)**:
  - `@fontsource/playfair-display` — Tiêu đề trang trọng (OFL-1.1).
  - `@fontsource/be-vietnam-pro` — Nội dung UI tiếng Việt đầy đủ dấu (OFL-1.1).
  - `@fontsource/jetbrains-mono` — Số vé & mặt số bóng 3D sắc nét (OFL-1.1).
- **Audio Effects (`apps/web/public/sounds/`, CC0 1.0 Public Domain / tổng hợp nội bộ bằng script PCM)**:
  - `unlock-chime.wav` — Hợp âm chuông thánh đường khi bấm *Bấm để bắt đầu* (CC0).
  - `draw-spin-start.wav` — Hiệu ứng pha lê khởi động lượt quay (CC0).
  - `ambient-shimmer.wav` — Nhạc nền ambient lặp êm khi chưa tải file nhạc nền riêng của sự kiện (CC0).
  - `drum-roll.wav` — Nhịp trống hồi hộp lặp mượt trong lúc lồng quay và trước chữ số cuối (CC0).
  - `tick.wav` — Nhịp đếm hồi hộp cho khoảnh khắc chờ số cuối (CC0).
  - `ting.wav` — Tiếng chuông pha lê trong trẻo mỗi khi từng quả bóng rơi vào ô số (CC0).
  - `fanfare.wav` — Hợp âm kèn đồng & chuông mừng chiến thắng khi công bố trọn vẹn dãy số trúng (CC0).

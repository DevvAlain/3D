# 🎟️ Church Lucky Draw (Quay Số May Mắn Giáo Xứ)

Hệ thống quay số may mắn 3D cao cấp dành cho đại hội / lễ hội giáo xứ với màn hình trình chiếu máy chiếu **"Gala of Stained Glass"** và khu vực hậu trường quản trị độc lập.

---

## 🌟 Tổng Quan Kiến Trúc

- **Monorepo**: Turborepo + pnpm workspaces (`apps/web`, `packages/shared`, `supabase/migrations`).
- **Core Framework**: Next.js 15 (`15.5.29`, App Router), TypeScript Strict, Tailwind CSS.
- **Backend & Database**: Supabase (PostgreSQL, Row Level Security, RPC Functions, Storage, Realtime cho Admin).
- **Thuật Toán Quay Số (Fairness & Security)**:
  - Chọn số **hoàn toàn phía server** trong hàm PostgreSQL RPC `draw_next`.
  - Sử dụng `pgcrypto gen_random_bytes(4)` kết hợp **Rejection Sampling** (chuẩn 64-bit BIGINT, $2^{32} = 4,294,967,296$) loại bỏ hoàn toàn lệch modulo (modulo bias).
  - Khóa dòng sự kiện (`FOR UPDATE`) và ràng buộc duy nhất theo `idempotency_key` đồng bộ hóa trên mọi thao tác `draw_next`, `confirm_won`, `mark_absent`, `undo_absent`, `void_last`, triệt tiêu hoàn toàn race condition và double-draw.
  - Partial Unique Index: Chỉ duy nhất 1 sự kiện được `is_active = true`, chỉ duy nhất 1 lượt ở trạng thái `revealing`.
  - Trigger ngăn chặn thay đổi cấu hình số / `test_mode` khi sự kiện đã có lượt quay chính thức (`is_test = false`).
  - Phân quyền nghiêm ngặt: `REVOKE EXECUTE FROM PUBLIC, anon, authenticated; GRANT ONLY TO service_role`.
- **Màn hình sân khấu 3D ("Gala of Stained Glass")**:
  - Three.js qua React Three Fiber (`dynamic(..., { ssr: false })` tách bundle riêng cho `/display`), Rapier Physics (`@dimforge/rapier3d-compat`), `CanvasTexture` số 0–9, Post-processing Bloom/Vignette (Cao), và chế độ dự phòng 2D tự động khi WebGL không khả dụng / `webglcontextlost`.
  - **4 mức chất lượng & tự bảo vệ FPS**: **Cao (3D)** → **Trung bình (3D, mặc định)** → **Nhẹ (3D)** → **Thấp (2D)**. Hệ thống tự động hạ 1 bậc kèm thông báo nhỏ (non-blocking) nếu FPS giữ dưới ~40 FPS trong vài giây.
  - **Chế độ tốc độ theo từng giải**: `Nhanh (~8s)` hoặc `Đầy đủ (~17s)` cấu hình trong Admin (mặc định: Đầy đủ cho các giải cao/Đặc Biệt, Nhanh cho các giải nhỏ; luôn hỗ trợ nhấn `Space` mở nhanh).
  - **3 Chủ đề lễ hội**: `classic` (Gala Kính Màu - bụi vàng bay lên), `christmas` (Giáng Sinh - tuyết rơi), `easter` (Phục Sinh - cánh hoa pastel bay).
  - **Tải trước tài nguyên & Service Worker Offline-resilient (`/sw.js`)**: Nạp sẵn font chữ, âm thanh WAV, CanvasTexture, Rapier WASM ngay tại màn hình *"Bấm để bắt đầu"*. Service Worker chỉ cache vỏ trang `/display` (Network-First) và static/font/audio/WASM; **TUYỆT ĐỐI KHÔNG BAO GIỜ cache `/api/*`**.

---

## 📁 Cấu Trúc Dự Án

```
church-lucky-draw/
├─ apps/web/
│  ├─ app/admin/              # Bảng quản trị & /admin/checklist kiểm tra trước giờ G
│  ├─ app/display/            # Sân khấu 3D/2D cho máy chiếu & Presenter
│  ├─ app/api/                # Route Handlers bảo mật (Admin RBAC, Draw RPC, Checklist)
│  ├─ components/three/       # Sân khấu, lồng cầu Rapier, ô chữ số, pháo sáng, tuyết/hoa
│  ├─ hooks/                  # Controller quay số tách biệt (polling, idempotency, offline retry)
│  ├─ lib/                    # Preloader, SW policy, quality-monitor, checklist evaluator
│  └─ public/
│     ├─ sw.js                # Service Worker (KHÔNG bao giờ cache /api/*)
│     └─ sounds/*.wav         # 7 hiệu ứng âm thanh nội bộ (CC0)
├─ packages/shared/           # Zod schemas, state machine, CSPRNG helpers & Vitest
├─ supabase/
│  ├─ migrations/             # 000001..000004 (Schema, RLS, RPCs, activate_event, speed_mode)
│  ├─ seed.sql                # Dữ liệu mẫu CHỈ dùng cục bộ (KHÔNG push lên production)
│  └─ tests/                  # Integration test suite kiểm thử DB & song song 25 kết nối
└─ README.md                  # Tài liệu kỹ thuật, deploy & sổ tay xử lý sự cố
```

---

## 🚀 Hướng Dẫn Triển Khai Production (Vercel + Supabase)

### Bước 1: Tạo & Cấu hình Dự Án Supabase Production

1. Tạo một Supabase project mới dành riêng cho môi trường **Production** (tách biệt với Dev/Staging).
2. **Tắt đăng ký công khai (Disable Public Sign-ups)**:
   - Vào **Supabase Dashboard** → **Authentication** → **Providers** → **Email**.
   - **Tắt (Uncheck)** mục **"Allow new users to sign up"** / **"Enable Email Signup"** → **Save**.
   - Điều này ngăn tuyệt đối người lạ tự tạo tài khoản vào hệ thống.
3. **Tạo tài khoản `admin` và `presenter`**:
   - Vào **Supabase Dashboard** → **Authentication** → **Users** → **Add user** (hoặc tạo qua script Admin API).
   - Tạo tối thiểu 1 tài khoản Admin (ví dụ `admin@giaoxu.vn`) và 1 tài khoản Presenter sân khấu (ví dụ `sankhau@giaoxu.vn`).
   - Mở **SQL Editor** và chạy lệnh gán `app_metadata.role` (chú ý: dùng `raw_app_meta_data`, **không** dùng `user_metadata` vì user có thể tự sửa `user_metadata`):

```sql
-- Gán quyền Quản trị (Admin - cấu hình sự kiện, giải thưởng, xem kết quả trực tiếp)
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
WHERE email = 'admin@giaoxu.vn';

-- Gán quyền Sân khấu (Presenter - điều khiển quay số trên /display)
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "presenter"}'::jsonb
WHERE email = 'sankhau@giaoxu.vn';
```

   Hoặc tạo nhanh bằng Node.js Supabase Admin API với `SUPABASE_SECRET_KEY` (hoặc `SUPABASE_SERVICE_ROLE_KEY`):

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

await supabaseAdmin.auth.admin.createUser({
  email: 'admin@giaoxu.vn',
  password: 'MatKhauAdminManh!2026',
  email_confirm: true,
  app_metadata: { role: 'admin' },
});

await supabaseAdmin.auth.admin.createUser({
  email: 'sankhau@giaoxu.vn',
  password: 'MatKhauSanKhauManh!2026',
  email_confirm: true,
  app_metadata: { role: 'presenter' },
});
```

### Bước 2: Đẩy Schema Migration lên Supabase (**KHÔNG chạy `seed.sql`**)

Thư mục `supabase/migrations/` gồm 4 migration chính thức:
- `20261109000001_initial_schema.sql` — Bảng dữ liệu, RLS, Realtime, Storage bucket.
- `20261109000002_draw_rpcs.sql` — Các RPC `draw_next` (CSPRNG + rejection sampling), `confirm_won`, `mark_absent`, `undo_absent`, `void_last`, `clear_test_draws`, `reset_event`.
- `20261110000003_activate_event_rpc.sql` — Hàm `activate_event` kích hoạt sự kiện nguyên tử (atomic).
- `20261110000004_prize_speed_mode.sql` — Cột `prizes.speed_mode` (`NULL` = tự động theo hạng giải, `'fast'` = ~8s, `'full'` = ~17s).

Liên kết với project Supabase Production và đẩy migrations:

```bash
supabase link --project-ref <production-project-ref>
supabase db push
```

> ⚠️ **Lưu ý quan trọng**: KHÔNG chạy `psql -f supabase/seed.sql` trên database Production, để tránh tạo sự kiện mẫu / vé thử không mong muốn.

### Bước 3: Deploy Web App lên Vercel

1. Kết nối repository lên **Vercel** → Import Project.
2. Cấu hình **Build & Development Settings**:
   - **Root Directory**: `apps/web`
   - **Framework Preset**: `Next.js`
   - **Install Command** (từ root monorepo, hoặc mặc định của Vercel hỗ trợ pnpm workspace): `pnpm install --frozen-lockfile`
   - **Build Command**: `pnpm build` (chạy `next build` trong `apps/web`, đã cấu hình `transpilePackages: ['@church/shared']`).
3. Khai báo **Environment Variables** trên Vercel (cho cả `Production` và `Preview` nếu cần):

| Tên biến | Phạm vi | Mô tả |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Project URL (`https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client + Server | Publishable / Anon Key (an toàn phía trình duyệt) |
| `SUPABASE_URL` | **Server Only** | Project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_SECRET_KEY` | **Server Only** | Secret / Service Role Key (**tuyệt đối KHÔNG đặt tiền tố `NEXT_PUBLIC_`**) |

*(Ghi chú: Ứng dụng cũng tương thích tên cũ `NEXT_PUBLIC_SUPABASE_ANON_KEY` và `SUPABASE_SERVICE_ROLE_KEY`. Biến `DATABASE_URL` chỉ dùng cục bộ cho CLI / integration test, không cần thiết trên runtime Vercel.)*

4. Kiểm tra trong Supabase Dashboard → **Authentication** → **URL Configuration**: thêm domain Vercel chính thức (`https://<your-domain>.vercel.app`) vào **Site URL** và **Redirect URLs**.

---

## 💻 Chạy Môi Trường Phát Triển Cục Bộ

```bash
# 1. Cài dependencies
pnpm install

# 2. Cấu hình biến môi trường theo .env.example
cp .env.example apps/web/.env.local

# 3. Nạp seed mẫu (chỉ dùng cho môi trường dev/local)
psql "$DATABASE_URL" -f supabase/seed.sql

# 4. Chạy toàn bộ Unit Test + Integration Test (multi-connection + concurrency)
pnpm test
pnpm test:integration

# 5. Typecheck, Lint & Production Build kiểm chứng
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build

# 6. Chạy server dev
pnpm dev
```

Các đường dẫn chính:
- Admin hậu trường: `http://localhost:3000/admin`
- Danh sách kiểm tra trước sự kiện: `http://localhost:3000/admin/checklist`
- Màn hình trình chiếu sân khấu (Presenter): `http://localhost:3000/display`
- Xem trước chỉ đọc (Admin Preview): `http://localhost:3000/display?preview=1`

---

## ✅ Quy Trình Diễn Tập & Kiểm Tra Trước Sự Kiện

Để đảm bảo an toàn tuyệt đối trong ngày hội giáo xứ, Ban Tổ Chức **BẮT BUỘC** thực hiện đúng thứ tự 4 bước sau:

> **1. Diễn tập thử (Test Mode) → 2. Xóa dữ liệu quay thử → 3. Tắt Test Mode → 4. Lượt quay thật đầu tiên**

### Danh Sách Kiểm Tra Trước Giờ G (`/admin/checklist`)

Mở **`/admin/checklist`** (hoặc tab **"Kiểm tra trước sự kiện"** trong `/admin`) để rà soát đủ **6/6 hạng mục ĐẠT** trước khi mở máy chiếu cho cộng đoàn:

1. **Sự kiện chính thức đang kích hoạt (`real_event_active`)**: Đúng sự kiện của chương trình hôm nay đã bấm **"Kích hoạt ngay"** (`is_active = true`).
2. **Dữ liệu quay thử đã xóa & Test Mode đã tắt (`test_mode_cleared`)**: Số lượt `is_test = true` còn `0` và cờ `test_mode = false` (banner đỏ *"CHẾ ĐỘ THỬ"* đã biến mất khỏi `/display`).
3. **Cơ cấu giải thưởng & rổ vé hợp lệ (`prizes_set`)**: Đầy đủ các giải theo đúng thứ tự quay (từ giải nhỏ đến Giải Đặc Biệt), tốc độ quay (`Nhanh ~8s` / `Đầy đủ ~17s`) đúng ý đồ, và tổng số lượng giải nhỏ hơn hoặc bằng số vé hợp lệ.
4. **Âm thanh hội trường đã kiểm tra & mở khóa (`audio_unlocked`)**: Cắm dây loa/mixer xong, bấm kiểm tra chuông trong checklist, đồng thời trên máy chiếu `/display` bấm **"Bấm để bắt đầu"** để trình duyệt mở khóa Web Audio (`Howler.js`) và nạp 100% tài nguyên (font, WAV, CanvasTexture, Rapier WASM).
5. **Tài khoản Sân khấu (Presenter) đã đăng nhập (`presenter_logged_in`)**: Máy điều khiển chính thức đang đăng nhập bằng tài khoản `role = 'presenter'`, không dùng chung tài khoản Admin lên màn hình chiếu.
6. **Laptop dự phòng & bản sao lưu cấu hình (`backup_laptop`)**: Chuẩn bị 1 laptop phụ cắm sẵn sạc, mở sẵn `/display` với tài khoản Presenter và tải sẵn file JSON cấu hình dự phòng từ Admin.

---

## 🚨 Sổ Tay Xử Lý Sự Cố (Failure Playbook)

### Tình huống 1: Mất kết nối mạng / Wi-Fi rớt giữa chừng khi quay số

- **Nguyên tắc vàng**: **KHÔNG** tắt trình duyệt, **KHÔNG** tự ý tải lại nhiều lần hoặc bấm quay lại bừa bãi khi mất mạng.
- **Cơ chế bảo vệ sẵn có**:
  - Thanh trạng thái góc trên phải chuyển đỏ **"Mất kết nối"** và hiện banner cảnh báo rõ ràng.
  - Mọi lượt quay đã lưu trên Supabase đều **an toàn 100%** (server đã commit trước khi trả số về màn hình).
  - Nếu rớt mạng đúng lúc bấm **"Quay số"**: ứng dụng tự lưu `idempotency_key` của cú bấm đó trong `sessionStorage` và tự động thử lại 2 lần; nếu vẫn rớt, nút **"Thử quay lại (giữ nguyên mã phiên)"** sẽ xuất hiện ngay trên banner. Khi có mạng trở lại (Wi-Fi ổn định hoặc chuyển sang 4G/Hotspot), chỉ cần nhấn nút thử lại — nếu server đã nhận lượt đó trước đó, RPC trả về đúng con số cũ mà **không bao giờ tạo 2 lượt quay trùng**.
  - Nếu đang giữ **vé trúng đã hiện trên màn hình** mà mất mạng khi bấm **Xác nhận trúng (`Enter`)** hoặc **Vắng mặt (`V`)**: bấm nút thử lại trên banner ngay khi có mạng.
- **Dự phòng**: Nếu hội trường mất Wi-Fi kéo dài, bật nhanh điểm phát sóng **4G/5G từ điện thoại** cho máy chiếu; hệ thống tự nhận sự kiện online và đồng bộ trạng thái ngay lập tức.

### Tình huống 2: Laptop sân khấu treo máy, sập nguồn, hoặc lỡ nhấn `F5` giữa lúc mở thưởng

- **Nếu lỡ nhấn `F5` trên máy đang chiếu**:
  - Service Worker (`/sw.js`) giúp tải lại vỏ giao diện `/display` và âm thanh/font cực nhanh mà không gọi cache API cũ.
  - Ngay sau khi reload, màn hình che kín (**opaque gate** *"Sân Khấu Quay Số Sẵn Sàng"*) sẽ chặn không làm lộ số vé vừa quay trên máy chiếu.
  - Sau khi kiểm tra mọi thứ ổn, bấm **"Bấm để bắt đầu"**: nếu server đang có lượt `revealing`, màn hình khôi phục thẳng kết quả vé đó mà không chạy lại animation từ đầu.
- **Nếu laptop chính sập nguồn hoặc hỏng cổng HDMI**:
  1. Rút cáp HDMI từ máy chính cắm sang **laptop dự phòng** (đã đăng nhập sẵn `/display`).
  2. Trên laptop dự phòng, nhấn **`F5`** (hoặc chờ tối đa 4 giây để bộ đếm poll đồng bộ với máy chủ) rồi bấm **"Bấm để bắt đầu"**.
  3. Toàn bộ danh sách giải đã quay, giải đang quay và số vé còn lại nằm hoàn toàn trên Supabase nên chương trình tiếp tục liền mạch 100%, không sai lệch 1 vé nào.

### Tình huống 3: Đọc nhầm số, người trúng không lên / vắng mặt, hoặc cần hủy lượt quay

- **Người trúng vắng mặt sau khi gọi tên nhiều lần**:
  - Nhấn **`V`** (hoặc bấm **"Vắng mặt (V)"**) để đánh dấu `absent`. Vé đó **không tính vào chỉ tiêu số lượng giải**, và suất giải vẫn còn để quay tiếp cho người khác.
- **Người trúng vừa lên tới sân khấu sau khi lỡ bấm Vắng mặt**:
  - Ngay trước khi bấm quay số mới, nhấn **`U`** (hoặc bấm **"Hoàn tác [U]"**) để đưa chính lá vé đó trở lại trạng thái `revealing`, rồi nhấn **`Enter`** xác nhận trúng (`won`).
- **Hủy lượt quay nhầm / đọc sai ở lượt gần nhất (`void_last`)**:
  - Nhấn **`Backspace`** (hoặc bấm **"Hủy lượt"**) để chuyển lượt quay cuối thành `void` — **số vé đó tự động được trả về rổ vé hợp lệ** để có thể quay lại công bằng. (Nếu lượt đã bấm `Enter` xác nhận `won`, hệ thống hỏi hộp thoại xác nhận tránh bấm nhầm.)
- **Kiểm tra đối soát minh bạch**:
  - Kỹ thuật viên ở bàn thư ký mở sẵn `/admin` → tab **"Kết quả trực tiếp"** (cập nhật Realtime tức thì qua Supabase) để đọc đối chiếu chính xác từng số vé, thời gian quay và trạng thái (`won` / `absent` / `void`) trước khi trao giải.

---

## 🎭 Phím Tắt Sân Khấu (`/display`)

- **`Space` / `→`**: Quay số tiếp theo (khi đang mở số, bấm **`Space`** sẽ **mở ngay lập tức** toàn bộ dãy số; các phím khác bị khóa chống bấm nhầm và có cooldown 900ms chống bấm đúp bút trình chiếu).
- **`Enter`**: Xác nhận vé trúng thưởng (`won`).
- **`V`**: Đánh dấu vé vắng mặt (`absent`).
- **`U`**: Hoàn tác vắng mặt lượt cuối (`undo_absent`).
- **`Backspace`**: Hủy lượt quay cuối & trả số về rổ (`void_last`).
- **`Q`**: Chuyển mức đồ họa: **Cao (3D)** → **Trung bình (3D, mặc định)** → **Nhẹ (3D)** → **Thấp (2D)** → **Cao (3D)**.
- **`D`**: Bật / tắt bảng đo **FPS** trực tiếp.
- **`M`**: Bật / tắt âm thanh sân khấu (`Howler.js`).
- **`F`**: Bật / tắt toàn màn hình.

---

## 📦 Bản Quyền Tài Nguyên Tự Lưu Trữ (Fonts & Audio Assets)

Toàn bộ font chữ và tệp âm thanh được lưu trữ cục bộ (không phụ thuộc CDN bên thứ ba khi trình chiếu):

- **Typography (Self-hosted via `@fontsource`, SIL Open Font License 1.1)**:
  - `@fontsource/playfair-display` — Tiêu đề trang trọng (OFL-1.1).
  - `@fontsource/be-vietnam-pro` — Nội dung UI tiếng Việt đầy đủ dấu (OFL-1.1).
  - `@fontsource/jetbrains-mono` — Số vé & mặt số bóng 3D sắc nét (OFL-1.1).
- **Audio Effects (`apps/web/public/sounds/`, CC0 1.0 Public Domain)**:
  - `unlock-chime.wav`, `draw-spin-start.wav`, `ambient-shimmer.wav`, `drum-roll.wav`, `tick.wav`, `ting.wav`, `fanfare.wav`.

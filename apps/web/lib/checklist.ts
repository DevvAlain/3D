import type { Event, Prize } from '@church/shared';

export type ChecklistItemStatus = 'pass' | 'warn' | 'fail';

export interface ChecklistPresenterAccount {
  id: string;
  email: string;
  last_sign_in_at: string | null;
}

export interface ChecklistServerData {
  generatedAt: string;
  activeEvent: Event | null;
  targetEvent: Event | null;
  prizes: Prize[];
  totalPoolSize: number;
  excludedInRangeCount: number;
  validInitialPool: number;
  totalPrizeQuantity: number;
  quotaExceedsPool: boolean;
  testDrawsCount: number;
  realDrawsCount: number;
  presenterUsers: ChecklistPresenterAccount[];
}

export interface ChecklistClientSignals {
  audioUnlockedAt: string | null;
  backupJsonExportedAt: string | null;
  backupLaptopReady: boolean;
}

export interface RehearsalChecklistItem {
  key:
    | 'real_event_active'
    | 'test_mode_cleared'
    | 'prizes_set'
    | 'audio_unlocked'
    | 'presenter_logged_in'
    | 'backup_laptop';
  title: string;
  status: ChecklistItemStatus;
  summary: string;
  detail: string;
}

export function evaluateRehearsalChecklist(
  server: ChecklistServerData,
  client: ChecklistClientSignals
): RehearsalChecklistItem[] {
  const ev = server.targetEvent ?? server.activeEvent;
  const activeEv = server.activeEvent;

  // 1. Real event active
  let realEventStatus: ChecklistItemStatus = 'fail';
  let realEventSummary = 'Chưa có sự kiện nào được kích hoạt trên /display';
  let realEventDetail =
    'Vào tab Sự kiện -> nhấn "Kích hoạt ngay" cho sự kiện chính thức để màn hình trình chiếu hiển thị đúng chương trình.';

  if (activeEv) {
    if (!activeEv.test_mode) {
      realEventStatus = 'pass';
      realEventSummary = `Đang kích hoạt sự kiện chính thức "${activeEv.title}"`;
      realEventDetail = `Dải vé ${activeEv.range_from.toLocaleString('vi-VN')}–${activeEv.range_to.toLocaleString('vi-VN')} (${activeEv.digits} chữ số), chủ đề: ${activeEv.theme}.`;
    } else {
      realEventStatus = 'warn';
      realEventSummary = `Sự kiện "${activeEv.title}" đang kích hoạt nhưng Test Mode vẫn BẬT`;
      realEventDetail =
        'Đúng sự kiện đã kích hoạt trên /display, nhưng hãy nhớ tắt Test Mode sau khi hoàn tất diễn tập.';
    }
  }

  // 2. Test mode cleared (both flag off AND 0 leftover test draws)
  let testModeStatus: ChecklistItemStatus = 'fail';
  let testModeSummary = 'Chưa có sự kiện để kiểm tra Test Mode';
  let testModeDetail = 'Tạo hoặc chọn một sự kiện trước khi kiểm tra.';

  if (ev) {
    if (!ev.test_mode && server.testDrawsCount === 0) {
      testModeStatus = 'pass';
      testModeSummary = 'Đã xóa sạch lượt quay thử & tắt Chế độ Thử (LIVE sẵn sàng)';
      testModeDetail =
        'Không còn lượt quay thử (is_test=true) tồn đọng; lượt quay đầu tiên sẽ ghi nhận chính thức.';
    } else if (server.testDrawsCount > 0 && !ev.test_mode) {
      testModeStatus = 'warn';
      testModeSummary = `Đã tắt Test Mode nhưng vẫn còn ${server.testDrawsCount} lượt quay thử cũ`;
      testModeDetail =
        'Nên bấm "Xóa tất cả lượt quay thử" để giữ lịch sử sự kiện gọn gàng trước giờ G.';
    } else {
      testModeStatus = 'fail';
      testModeSummary = `Test Mode đang BẬT (còn ${server.testDrawsCount} lượt quay thử)`;
      testModeDetail =
        'Đúng quy trình: Diễn tập xong -> Xóa tất cả lượt quay thử -> Tắt Test Mode -> Bắt đầu quay thật.';
    }
  }

  // 3. Prizes set & pool capacity valid
  let prizesStatus: ChecklistItemStatus = 'fail';
  let prizesSummary = 'Chưa thiết lập danh sách giải thưởng';
  let prizesDetail =
    'Thêm ít nhất 1 hạng mục giải trong tab Giải thưởng và đảm bảo tổng số lượng <= rổ vé hợp lệ.';

  if (server.prizes.length > 0 && !server.quotaExceedsPool && server.validInitialPool > 0) {
    prizesStatus = 'pass';
    prizesSummary = `Đã cấu hình ${server.prizes.length} hạng mục giải (${server.totalPrizeQuantity} giải / ${server.validInitialPool.toLocaleString('vi-VN')} vé hợp lệ)`;
    prizesDetail = server.prizes
      .map(
        (p, idx) =>
          `#${idx + 1} ${p.name} (x${p.quantity}, ${p.speed_mode === 'fast' ? 'Nhanh ~8s' : p.speed_mode === 'full' ? 'Đầy đủ ~17s' : 'Tự động'})`
      )
      .join(' • ');
  } else if (server.prizes.length > 0) {
    prizesStatus = 'fail';
    prizesSummary = `Cảnh báo: Tổng giải (${server.totalPrizeQuantity}) vượt quá rổ vé (${server.validInitialPool})`;
    prizesDetail =
      'Giảm số lượng giải hoặc mở rộng dải vé / bỏ bớt vé loại trừ để tránh hết vé giữa chừng.';
  }

  // 4. Audio unlocked & checked
  const audioStatus: ChecklistItemStatus = client.audioUnlockedAt ? 'pass' : 'warn';
  const audioSummary = client.audioUnlockedAt
    ? 'Âm thanh trình chiếu đã được kiểm tra & mở khóa'
    : 'Chưa xác nhận kiểm tra loa / mở khóa âm thanh trên trình duyệt này';
  const audioDetail = client.audioUnlockedAt
    ? `Lần xác nhận gần nhất: ${new Date(client.audioUnlockedAt).toLocaleString('vi-VN')}. Lưu ý trên máy chiếu chính vẫn cần bấm "Bấm để bắt đầu" 1 lần sau khi mở /display.`
    : 'Nhấn nút "Kiểm tra & mở khóa âm thanh" bên dưới để phát thử tiếng chuông/ting và kiểm tra kết nối âm thanh hội trường.';

  // 5. Presenter logged in
  const loggedInPresenters = server.presenterUsers.filter((u) => Boolean(u.last_sign_in_at));
  let presenterStatus: ChecklistItemStatus = 'fail';
  let presenterSummary = 'Chưa có tài khoản Presenter nào trong Supabase Auth';
  let presenterDetail =
    'Tạo tài khoản với app_metadata.role = "presenter" trong Supabase Authentication trước khi bắt đầu.';

  if (loggedInPresenters.length > 0) {
    const latest = [...loggedInPresenters].sort((a, b) =>
      String(b.last_sign_in_at ?? '').localeCompare(String(a.last_sign_in_at ?? ''))
    )[0];
    presenterStatus = 'pass';
    presenterSummary = `Presenter đã đăng nhập (${latest.email})`;
    presenterDetail = `Đăng nhập gần nhất: ${new Date(latest.last_sign_in_at as string).toLocaleString('vi-VN')} • Tổng cộng ${server.presenterUsers.length} tài khoản presenter hợp lệ.`;
  } else if (server.presenterUsers.length > 0) {
    presenterStatus = 'warn';
    presenterSummary = `Đã có ${server.presenterUsers.length} tài khoản Presenter nhưng chưa thấy lượt đăng nhập gần đây`;
    presenterDetail = `Danh sách: ${server.presenterUsers.map((u) => u.email).join(', ')}. Hãy đăng nhập sẵn trên máy chiếu /display trước giờ G 15 phút.`;
  }

  // 6. Backup laptop & JSON config backup
  let backupStatus: ChecklistItemStatus = 'warn';
  let backupSummary = 'Chưa hoàn tất kiểm tra máy tính dự phòng';
  if (client.backupLaptopReady && client.backupJsonExportedAt) {
    backupStatus = 'pass';
    backupSummary = 'Máy tính dự phòng & bản sao lưu JSON đã sẵn sàng';
  } else if (client.backupLaptopReady) {
    backupStatus = 'pass';
    backupSummary = 'Đã xác nhận máy tính dự phòng sẵn sàng (khuyến nghị tải thêm JSON)';
  }
  const backupDetail =
    'Mở sẵn /display bằng tài khoản Presenter trên laptop dự phòng (cùng nguồn điện/PIN đầy), sẵn sàng cắm HDMI thay thế nếu máy chính gặp sự cố; kết quả nằm hoàn toàn trên Supabase nên đổi máy chỉ cần F5 là tiếp tục ngay.';

  return [
    {
      key: 'real_event_active',
      title: '1. Sự kiện chính thức đang kích hoạt',
      status: realEventStatus,
      summary: realEventSummary,
      detail: realEventDetail,
    },
    {
      key: 'test_mode_cleared',
      title: '2. Dữ liệu quay thử đã xóa & Test Mode đã tắt',
      status: testModeStatus,
      summary: testModeSummary,
      detail: testModeDetail,
    },
    {
      key: 'prizes_set',
      title: '3. Cơ cấu giải thưởng & rổ vé hợp lệ',
      status: prizesStatus,
      summary: prizesSummary,
      detail: prizesDetail,
    },
    {
      key: 'audio_unlocked',
      title: '4. Âm thanh hội trường đã kiểm tra & mở khóa',
      status: audioStatus,
      summary: audioSummary,
      detail: audioDetail,
    },
    {
      key: 'presenter_logged_in',
      title: '5. Tài khoản Sân khấu (Presenter) đã đăng nhập',
      status: presenterStatus,
      summary: presenterSummary,
      detail: presenterDetail,
    },
    {
      key: 'backup_laptop',
      title: '6. Laptop dự phòng & bản sao lưu cấu hình',
      status: backupStatus,
      summary: backupSummary,
      detail: backupDetail,
    },
  ];
}

import { formatTicket, type Draw, type DrawStatus, type Prize } from '@church/shared';

const STATUS_LABELS_VI: Record<DrawStatus, string> = {
  revealing: 'Đang quay',
  won: 'Đã trúng thưởng',
  absent: 'Vắng mặt (Loại)',
  void: 'Đã hủy (Trả rổ)',
};

/**
 * Neutralizes spreadsheet formula injection (CWE-1236) and escapes CSV quotes.
 */
export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export interface CsvDrawRow extends Draw {
  prize?: Prize;
}

/**
 * Generates a UTF-8 BOM CSV string so Microsoft Excel opens Vietnamese diacritics cleanly.
 */
export function buildDrawsCsv(draws: readonly CsvDrawRow[], digits: number): string {
  const headers = [
    'Lượt số',
    'Mã vé trúng',
    'Giải thưởng',
    'Phần thưởng',
    'Trạng thái',
    'Chế độ',
    'Thời gian tạo',
    'Cập nhật cuối',
  ];

  const rows = draws.map((d) => [
    d.seq,
    formatTicket(d.ticket, digits),
    d.prize?.name ?? d.prize_id,
    d.prize?.reward ?? '',
    STATUS_LABELS_VI[d.status] ?? d.status,
    d.is_test ? 'Chế độ thử' : 'Chính thức',
    d.created_at,
    d.updated_at,
  ]);

  const lines = [headers, ...rows].map((cols) => cols.map(escapeCsvCell).join(','));
  // Prepend UTF-8 BOM for proper Vietnamese Excel decoding
  return `\uFEFF${lines.join('\r\n')}`;
}

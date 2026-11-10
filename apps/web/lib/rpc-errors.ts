import { NextResponse } from 'next/server';

export interface MappedRpcError {
  status: number;
  code: string;
  message: string;
}

const RPC_ERROR_RULES: ReadonlyArray<{ match: string; status: number; code: string; defaultMessage: string }> = [
  {
    match: 'EVENT_NOT_FOUND',
    status: 404,
    code: 'EVENT_NOT_FOUND',
    defaultMessage: 'Không tìm thấy sự kiện.',
  },
  {
    match: 'DRAW_NOT_FOUND',
    status: 404,
    code: 'DRAW_NOT_FOUND',
    defaultMessage: 'Không tìm thấy lượt quay.',
  },
  {
    match: 'EVENT_NOT_ACTIVE',
    status: 409,
    code: 'EVENT_NOT_ACTIVE',
    defaultMessage: 'Sự kiện chưa được kích hoạt.',
  },
  {
    match: 'DRAW_IN_PROGRESS',
    status: 409,
    code: 'DRAW_IN_PROGRESS',
    defaultMessage: 'Đang có lượt quay chưa hoàn tất xác nhận.',
  },
  {
    match: 'ALL_PRIZES_EXHAUSTED',
    status: 409,
    code: 'ALL_PRIZES_EXHAUSTED',
    defaultMessage: 'Đã quay hết tất cả các giải thưởng.',
  },
  {
    match: 'NO_VALID_TICKETS',
    status: 409,
    code: 'NO_VALID_TICKETS',
    defaultMessage: 'Không còn vé hợp lệ nào trong dải số.',
  },
  {
    match: 'INVALID_STATE_TRANSITION',
    status: 409,
    code: 'INVALID_STATE_TRANSITION',
    defaultMessage: 'Trạng thái lượt quay không hợp lệ cho thao tác này.',
  },
  {
    match: 'NO_DRAWS_TO_UNDO',
    status: 409,
    code: 'NO_DRAWS_TO_UNDO',
    defaultMessage: 'Chưa có lượt quay nào để hoàn tác.',
  },
  {
    match: 'NO_DRAWS_TO_VOID',
    status: 409,
    code: 'NO_DRAWS_TO_VOID',
    defaultMessage: 'Chưa có lượt quay nào để hủy.',
  },
  {
    match: 'CANNOT_CHANGE_TEST_MODE',
    status: 409,
    code: 'CANNOT_CHANGE_TEST_MODE',
    defaultMessage: 'Không thể thay đổi chế độ thử khi sự kiện đã có lượt quay chính thức.',
  },
  {
    match: 'EVENT_CONFIG_LOCKED',
    status: 409,
    code: 'EVENT_CONFIG_LOCKED',
    defaultMessage: 'Không thể thay đổi số chữ số hoặc dải số vé khi sự kiện đã có lượt quay chính thức.',
  },
  {
    match: 'EXCLUDED_TICKET_LOCKED',
    status: 409,
    code: 'EXCLUDED_TICKET_LOCKED',
    defaultMessage: 'Không thể xóa vé loại trừ khi sự kiện đã có lượt quay chính thức.',
  },
  {
    match: 'PRIZE_QUANTITY_BELOW_DRAWS',
    status: 409,
    code: 'PRIZE_QUANTITY_BELOW_DRAWS',
    defaultMessage: 'Không thể giảm số lượng giải thưởng thấp hơn số lượt đã quay không hủy.',
  },
  {
    match: 'idx_events_single_active',
    status: 409,
    code: 'ACTIVE_EVENT_CONFLICT',
    defaultMessage: 'Chỉ có thể kích hoạt duy nhất 1 sự kiện tại một thời điểm.',
  },
  {
    match: 'violates RESTRICT setting of foreign key constraint',
    status: 409,
    code: 'HAS_EXISTING_DRAWS',
    defaultMessage: 'Không thể xóa mục đã phát sinh lịch sử quay số.',
  },
];

export function mapRpcError(error: unknown): MappedRpcError {
  const rawMessage =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');

  for (const rule of RPC_ERROR_RULES) {
    if (rawMessage.includes(rule.match)) {
      const colonIndex = rawMessage.indexOf(`${rule.match}:`);
      const friendly =
        colonIndex !== -1 ? rawMessage.slice(colonIndex + rule.match.length + 1).trim() : rule.defaultMessage;
      return {
        status: rule.status,
        code: rule.code,
        message: friendly || rule.defaultMessage,
      };
    }
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: rawMessage || 'Lỗi hệ thống không xác định.',
  };
}

export function rpcErrorResponse(error: unknown): NextResponse {
  const mapped = mapRpcError(error);
  return NextResponse.json(
    { error: mapped.message, code: mapped.code },
    { status: mapped.status }
  );
}

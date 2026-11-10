import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Draw, DrawNextResult, Event, Prize } from '@church/shared';

const mockGetUser = vi.fn();
const mockAdminRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    rpc: mockAdminRpc,
    from: mockFrom,
  })),
}));

import { resetRateLimiter } from '@/lib/rate-limit';
import { POST as resetEventPost } from '@/app/api/admin/reset-event/route';
import { POST as clearTestDrawsPost } from '@/app/api/admin/clear-test-draws/route';
import {
  computeDisplayStatePayload,
  resolveDrawNextClientTransition,
} from '@/lib/display-state';
import { buildDrawsCsv, escapeCsvCell } from '@/lib/csv';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const PRIZE_1 = '22222222-2222-4222-8222-222222222222';
const PRIZE_2 = '33333333-3333-4333-8333-333333333333';

const BASE_EVENT: Event = {
  id: EVENT_ID,
  title: 'Đêm Hội Hồng Ân 2026',
  parish_name: 'Giáo Xứ Thánh Tâm',
  digits: 4,
  range_from: 1,
  range_to: 100,
  theme: 'classic',
  primary_color: '#F5C451',
  test_mode: false,
  status: 'active',
  is_active: true,
};

const PRIZES: Prize[] = [
  {
    id: PRIZE_1,
    event_id: EVENT_ID,
    name: 'Giải Nhì',
    reward: 'Xe đạp điện',
    quantity: 1,
    sort_order: 0,
  },
  {
    id: PRIZE_2,
    event_id: EVENT_ID,
    name: 'Giải Đặc Biệt',
    reward: 'Xe máy',
    quantity: 1,
    sort_order: 1,
  },
];

function makeDraw(overrides: Partial<Draw>): Draw {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    event_id: EVENT_ID,
    prize_id: PRIZE_1,
    ticket: 25,
    status: 'revealing',
    seq: 1,
    is_test: false,
    created_at: '2026-11-10T10:00:00.000Z',
    updated_at: '2026-11-10T10:00:00.000Z',
    ...overrides,
  };
}

describe('Admin Critical Endpoints & Display State Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimiter();
  });

  it('reset-event requires exact event title confirmation and forwards actor metadata to audit log RPC', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'admin-uuid-1',
          email: 'truongban@parish.org',
          app_metadata: { role: 'admin' },
        },
      },
      error: null,
    });

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: EVENT_ID, title: 'Đêm Hội Hồng Ân 2026' },
            error: null,
          }),
        }),
      }),
    });

    const wrongTitleRes = await resetEventPost(
      new Request('http://localhost/api/admin/reset-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: EVENT_ID, confirm_title: 'Sai Tên' }),
      })
    );
    expect(wrongTitleRes.status).toBe(400);
    const wrongJson = await wrongTitleRes.json();
    expect(wrongJson.code).toBe('CONFIRM_TITLE_MISMATCH');
    expect(mockAdminRpc).not.toHaveBeenCalled();

    mockAdminRpc.mockResolvedValueOnce({
      data: { success: true, deleted_draws: 12, audit_log_id: 'log-1' },
      error: null,
    });

    const okRes = await resetEventPost(
      new Request('http://localhost/api/admin/reset-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: EVENT_ID, confirm_title: 'Đêm Hội Hồng Ân 2026' }),
      })
    );
    expect(okRes.status).toBe(200);
    expect(mockAdminRpc).toHaveBeenCalledWith('reset_event', {
      p_event_id: EVENT_ID,
      p_actor_id: 'admin-uuid-1',
      p_actor_email: 'truongban@parish.org',
    });
  });

  it('clear-test-draws calls RPC with p_event_id cleanly', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-uuid-1', app_metadata: { role: 'admin' } } },
      error: null,
    });
    mockAdminRpc.mockResolvedValueOnce({ data: { success: true, deleted_count: 5 }, error: null });

    const res = await clearTestDrawsPost(
      new Request('http://localhost/api/admin/clear-test-draws', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: EVENT_ID }),
      })
    );
    expect(res.status).toBe(200);
    expect(mockAdminRpc).toHaveBeenCalledWith('clear_test_draws', { p_event_id: EVENT_ID });
  });

  it('resolveDrawNextClientTransition NEVER replays animation for idempotent hits already won, void, or absent', () => {
    const baseResult: DrawNextResult = {
      draw: makeDraw({ status: 'revealing' }),
      prize: PRIZES[0],
      is_idempotent: false,
    };

    expect(resolveDrawNextClientTransition(baseResult)).toEqual({
      shouldAnimateReveal: true,
      shouldRestoreOnly: false,
      noticeMessage: null,
    });

    // Idempotent hit while still revealing -> can reveal/show active ballot
    expect(
      resolveDrawNextClientTransition({
        ...baseResult,
        is_idempotent: true,
        draw: makeDraw({ status: 'revealing' }),
      }).shouldRestoreOnly
    ).toBe(false);

    // Idempotent hit when finalized ('won', 'void', 'absent') -> MUST restore only, NO replay!
    for (const terminalStatus of ['won', 'void', 'absent'] as const) {
      const transition = resolveDrawNextClientTransition({
        ...baseResult,
        is_idempotent: true,
        draw: makeDraw({ status: terminalStatus }),
      });
      expect(transition.shouldAnimateReveal).toBe(false);
      expect(transition.shouldRestoreOnly).toBe(true);
      expect(transition.noticeMessage).toBeTruthy();
    }
  });

  it('computeDisplayStatePayload restores state properly across F5, absent/void rules, and test_mode isolation', () => {
    // 1. Live mode with 1 absent, 1 void, 1 revealing on prize 1; plus a stray test draw that must be ignored
    const payload = computeDisplayStatePayload({
      event: BASE_EVENT,
      prizes: PRIZES,
      excludedTickets: [99, 100], // 2 excluded -> 98 left
      draws: [
        makeDraw({ seq: 1, ticket: 10, status: 'absent', is_test: false }),
        makeDraw({ seq: 2, ticket: 11, status: 'void', is_test: false }),
        makeDraw({ seq: 3, ticket: 12, status: 'revealing', is_test: false }),
        makeDraw({ seq: 1, ticket: 15, status: 'won', is_test: true, prize_id: PRIZE_2 }),
      ],
    });

    expect(payload.currentDraw?.ticket).toBe(12);
    expect(payload.currentDraw?.prize?.id).toBe(PRIZE_1);
    expect(payload.prizes[0].revealing_count).toBe(1);
    expect(payload.prizes[0].won_count).toBe(0);
    // Remaining quota on PRIZE_1 is 0 while ticket #12 is revealing, so next queued prize is PRIZE_2
    expect(payload.prizes[0].remaining_count).toBe(0);
    expect(payload.activePrize?.id).toBe(PRIZE_2);
    // Ticket 10 (absent) + Ticket 12 (revealing) stay claimed; Ticket 11 (void) returned; Tickets 99, 100 excluded -> 100 - 4 = 96
    expect(payload.validTicketsRemaining).toBe(96);
    expect(payload.isAllPrizesCompleted).toBe(false);

    // 2. When all prizes are won and nothing is revealing -> final summary ready
    const completed = computeDisplayStatePayload({
      event: BASE_EVENT,
      prizes: PRIZES,
      excludedTickets: [],
      draws: [
        makeDraw({ seq: 1, ticket: 10, status: 'won', prize_id: PRIZE_1 }),
        makeDraw({ seq: 2, ticket: 20, status: 'won', prize_id: PRIZE_2 }),
      ],
    });
    expect(completed.isAllPrizesCompleted).toBe(true);
    expect(completed.currentDraw).toBeNull();
    expect(completed.wonDraws).toHaveLength(2);
  });

  it('buildDrawsCsv outputs UTF-8 BOM, padded ticket numbers, Vietnamese labels, and neutralizes Excel formula injection', () => {
    expect(escapeCsvCell('=cmd()')).toBe("'=cmd()");
    expect(escapeCsvCell('+1+1')).toBe("'+1+1");

    const csv = buildDrawsCsv(
      [
        {
          ...makeDraw({ ticket: 7, status: 'won', seq: 1, is_test: false }),
          prize: {
            ...PRIZES[0],
            name: '=HYPERLINK("evil")',
          },
        },
      ],
      5
    );

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('00007');
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain('Đã trúng thưởng');
    expect(csv).toContain('Chính thức');
  });
});

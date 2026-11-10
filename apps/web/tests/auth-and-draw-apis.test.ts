import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetUser = vi.fn();
const mockGetSession = vi.fn();
const mockAdminRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    rpc: mockAdminRpc,
    from: mockFrom,
  })),
}));

import { extractRoleFromAppMetadata } from '@/lib/supabase/auth';
import { resetRateLimiter } from '@/lib/rate-limit';
import { POST as drawNextPost } from '@/app/api/draw/next/route';
import { POST as confirmPost } from '@/app/api/draw/confirm/route';
import { POST as absentPost } from '@/app/api/draw/absent/route';
import { POST as undoAbsentPost } from '@/app/api/draw/undo-absent/route';
import { POST as voidLastPost } from '@/app/api/draw/void-last/route';
import { GET as displayStateGet } from '@/app/api/display/state/route';
import { GET as adminStateGet } from '@/app/api/admin/state/route';
import { POST as adminResetPost } from '@/app/api/admin/reset-event/route';
import { POST as adminClearTestPost } from '@/app/api/admin/clear-test-draws/route';
import { POST as adminEventsPost } from '@/app/api/admin/events/route';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const DRAW_ID = '22222222-2222-4222-8222-222222222222';
const PRIZE_ID = '33333333-3333-4333-8333-333333333333';

function mockUser(role: 'admin' | 'presenter' | null, userMetadataRole?: string) {
  if (!role && !userMetadataRole) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    return;
  }
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: 'user-123',
        email: role ? `${role}@parish.org` : 'intruder@parish.org',
        app_metadata: role ? { role } : {},
        user_metadata: userMetadataRole ? { role: userMetadataRole } : {},
      },
    },
    error: null,
  });
}

function makeJsonReq(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
}

describe('Auth & Role Separation Security Guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimiter();
  });

  it('extractRoleFromAppMetadata rejects forged user_metadata and missing app_metadata.role', () => {
    expect(
      extractRoleFromAppMetadata({
        app_metadata: {},
      })
    ).toBeNull();

    // Even if user spoofs user_metadata.role='admin', helper only reads app_metadata
    mockUser(null, 'admin');
    expect(extractRoleFromAppMetadata({ app_metadata: { role: 'superadmin' } })).toBeNull();
    expect(extractRoleFromAppMetadata({ app_metadata: { role: 'admin' } })).toBe('admin');
    expect(extractRoleFromAppMetadata({ app_metadata: { role: 'presenter' } })).toBe('presenter');
  });

  it('always uses getUser() and NEVER calls getSession()', async () => {
    mockUser(null);
    const res = await drawNextPost(makeJsonReq('http://localhost/api/draw/next', { event_id: EVENT_ID }));
    expect(res.status).toBe(401);
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('rejects spoofed user_metadata.role=presenter with 403', async () => {
    mockUser(null, 'presenter');
    const res = await drawNextPost(makeJsonReq('http://localhost/api/draw/next', { event_id: EVENT_ID }));
    expect(res.status).toBe(403);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it('blocks admin from calling ANY /api/draw/* endpoints (403 Forbidden)', async () => {
    mockUser('admin');

    const responses = await Promise.all([
      drawNextPost(makeJsonReq('http://localhost/api/draw/next', { event_id: EVENT_ID })),
      confirmPost(makeJsonReq('http://localhost/api/draw/confirm', { draw_id: DRAW_ID })),
      absentPost(makeJsonReq('http://localhost/api/draw/absent', { draw_id: DRAW_ID })),
      undoAbsentPost(makeJsonReq('http://localhost/api/draw/undo-absent', { event_id: EVENT_ID })),
      voidLastPost(makeJsonReq('http://localhost/api/draw/void-last', { event_id: EVENT_ID })),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(403);
    }
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it('blocks presenter from calling ANY /api/admin/* endpoints (403 Forbidden)', async () => {
    mockUser('presenter');

    const responses = await Promise.all([
      adminStateGet(new Request('http://localhost/api/admin/state')),
      adminEventsPost(makeJsonReq('http://localhost/api/admin/events', { title: 'Test' })),
      adminClearTestPost(
        makeJsonReq('http://localhost/api/admin/clear-test-draws', { event_id: EVENT_ID })
      ),
      adminResetPost(
        makeJsonReq('http://localhost/api/admin/reset-event', {
          event_id: EVENT_ID,
          confirm_title: 'Test',
        })
      ),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(403);
    }
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it('allows admin to call GET /api/display/state ONLY with ?preview=1', async () => {
    mockUser('admin');

    const denied = await displayStateGet(new Request('http://localhost/api/display/state'));
    expect(denied.status).toBe(403);

    // Mock empty active event query for ?preview=1
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    });

    const previewOk = await displayStateGet(
      new Request('http://localhost/api/display/state?preview=1')
    );
    expect(previewOk.status).toBe(200);
    const body = await previewOk.json();
    expect(body.isPreview).toBe(true);
    expect(body.event).toBeNull();
  });

  it('allows presenter on /api/draw/next, forwards idempotency_key, and maps RPC errors cleanly', async () => {
    mockUser('presenter');

    const drawPayload = {
      draw: {
        id: DRAW_ID,
        event_id: EVENT_ID,
        prize_id: PRIZE_ID,
        ticket: 42,
        status: 'revealing',
        seq: 1,
        idempotency_key: 'click-key-1',
        is_test: true,
        created_at: '2026-11-10T00:00:00.000Z',
        updated_at: '2026-11-10T00:00:00.000Z',
      },
      prize: {
        id: PRIZE_ID,
        event_id: EVENT_ID,
        name: 'Giải Nhất',
        reward: '1 chỉ vàng',
        quantity: 1,
        sort_order: 0,
      },
      is_idempotent: false,
    };

    mockAdminRpc.mockResolvedValueOnce({ data: drawPayload, error: null });

    const okRes = await drawNextPost(
      makeJsonReq('http://localhost/api/draw/next', {
        event_id: EVENT_ID,
        idempotency_key: 'click-key-1',
      })
    );
    expect(okRes.status).toBe(200);
    expect(mockAdminRpc).toHaveBeenCalledWith('draw_next', {
      p_event_id: EVENT_ID,
      p_idempotency_key: 'click-key-1',
    });

    const json = await okRes.json();
    expect(json.draw.ticket).toBe(42);
    expect(json.is_idempotent).toBe(false);

    // RPC error mapping -> 409 Conflict
    mockAdminRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'DRAW_IN_PROGRESS: Đang có lượt quay chưa xác nhận' },
    });
    const conflictRes = await drawNextPost(
      makeJsonReq('http://localhost/api/draw/next', { event_id: EVENT_ID })
    );
    expect(conflictRes.status).toBe(409);
    const conflictBody = await conflictRes.json();
    expect(conflictBody.code).toBe('DRAW_IN_PROGRESS');
  });

  it('enforces per-user sliding-window rate limit on /api/draw/next (429 Too Many Requests)', async () => {
    mockUser('presenter');
    mockAdminRpc.mockResolvedValue({
      data: null,
      error: { message: 'EVENT_NOT_ACTIVE: Chưa kích hoạt' },
    });

    let saw429 = false;
    for (let i = 0; i < 30; i++) {
      const res = await drawNextPost(
        makeJsonReq('http://localhost/api/draw/next', { event_id: EVENT_ID })
      );
      if (res.status === 429) {
        saw429 = true;
        break;
      }
    }
    expect(saw429).toBe(true);
  });
});

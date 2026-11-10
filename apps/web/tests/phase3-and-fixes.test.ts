import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { POST as activateEventPost } from '@/app/api/admin/activate-event/route';
import { POST as importConfigPost } from '@/app/api/admin/import-config/route';
import { validateUploadMetadataAndBytes } from '@/lib/upload-validation';
import { fetchActiveDisplayState } from '@/lib/display-state';
import {
  fetchPostWithIdempotentRetry,
  nextQualityPreset,
  shouldIgnoreStageKeyboardAction,
} from '@/hooks/useDisplayController';
import { computeStageCameraFit } from '@/components/three/StageCameraRig';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const PRIZE_ID = '22222222-2222-4222-8222-222222222222';

function mockRole(role: 'admin' | 'presenter') {
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: `${role}-id`,
        email: `${role}@parish.org`,
        app_metadata: { role },
      },
    },
    error: null,
  });
}

describe('Phase 2 Hardening Fixes & Phase 3 Display Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimiter();
  });

  it('POST /api/admin/activate-event enforces admin RBAC and invokes atomic activate_event RPC', async () => {
    mockRole('presenter');
    const forbidden = await activateEventPost(
      new Request('http://localhost/api/admin/activate-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: EVENT_ID }),
      })
    );
    expect(forbidden.status).toBe(403);
    expect(mockAdminRpc).not.toHaveBeenCalled();

    mockRole('admin');
    mockAdminRpc.mockResolvedValueOnce({
      data: { id: EVENT_ID, is_active: true, status: 'active' },
      error: null,
    });
    const ok = await activateEventPost(
      new Request('http://localhost/api/admin/activate-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: EVENT_ID }),
      })
    );
    expect(ok.status).toBe(200);
    expect(mockAdminRpc).toHaveBeenCalledWith('activate_event', {
      p_event_id: EVENT_ID,
    });
  });

  it('POST /api/admin/import-config validates digits/range bounds via Zod and blocks overwrite when real draws exist', async () => {
    mockRole('admin');

    // Range exceeding 10^digits must fail Zod validation
    const invalidRange = await importConfigPost(
      new Request('http://localhost/api/admin/import-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          event: {
            title: 'Hội Xuân Giáo Xứ',
            parish_name: 'Giáo Xứ Thánh Tâm',
            digits: 3,
            range_from: 1,
            range_to: 1000, // invalid for 3 digits (max 999)
          },
          prizes: [],
          excluded_tickets: [],
        }),
      })
    );
    expect(invalidRange.status).toBe(400);

    // Targeting an event that already has real draws (is_test=false) must fail 409 REAL_DRAWS_EXIST
    mockFrom.mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: EVENT_ID, is_active: true },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'draws') {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ count: 3, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected mutation on table ${table}`);
    });

    const lockedOverwrite = await importConfigPost(
      new Request('http://localhost/api/admin/import-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          target_event_id: EVENT_ID,
          event: {
            title: 'Hội Xuân Giáo Xứ',
            parish_name: 'Giáo Xứ Thánh Tâm',
            digits: 4,
            range_from: 1,
            range_to: 500,
          },
          prizes: [{ name: 'Giải Nhất', reward: 'Quà', quantity: 1, sort_order: 0 }],
          excluded_tickets: [],
        }),
      })
    );

    expect(lockedOverwrite.status).toBe(409);
    const body = await lockedOverwrite.json();
    expect(body.code).toBe('REAL_DRAWS_EXIST');
  });

  it('validateUploadMetadataAndBytes validates BOTH extension, MIME type, AND magic bytes', () => {
    const pngMagic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jpgMagic = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const svgText = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const wavMagic = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);

    expect(
      validateUploadMetadataAndBytes({
        fileName: 'parish-logo.png',
        mimeType: 'image/png',
        kind: 'logo',
        headerBytes: pngMagic,
      })
    ).toEqual({ ok: true, ext: 'png', contentType: 'image/png' });

    expect(
      validateUploadMetadataAndBytes({
        fileName: 'parish-chime.wav',
        mimeType: 'audio/wav',
        kind: 'music',
        headerBytes: wavMagic,
      })
    ).toEqual({ ok: true, ext: 'wav', contentType: 'audio/wav' });

    // SVG rejected
    expect(
      validateUploadMetadataAndBytes({
        fileName: 'icon.svg',
        mimeType: 'image/svg+xml',
        kind: 'logo',
        headerBytes: svgText,
      }).ok
    ).toBe(false);

    // Spoofed extension (.png extension carrying JPEG bytes) rejected
    expect(
      validateUploadMetadataAndBytes({
        fileName: 'spoof.png',
        mimeType: 'image/png',
        kind: 'logo',
        headerBytes: jpgMagic,
      }).ok
    ).toBe(false);

    // Mismatched extension (.jpg with image/png) rejected
    expect(
      validateUploadMetadataAndBytes({
        fileName: 'wrong.jpg',
        mimeType: 'image/png',
        kind: 'logo',
        headerBytes: pngMagic,
      }).ok
    ).toBe(false);
  });

  it('fetchActiveDisplayState computes remaining pool via COUNT(*) head queries without scanning excluded rows', async () => {
    const activeEvent = {
      id: EVENT_ID,
      title: 'Đêm Hội Giáo Xứ',
      parish_name: 'Giáo Xứ Thánh Tâm',
      digits: 5,
      range_from: 1,
      range_to: 10000,
      theme: 'classic',
      primary_color: '#F5C451',
      test_mode: false,
      status: 'active',
      is_active: true,
    };

    const headCountSelectCalls: unknown[] = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: activeEvent, error: null }),
            }),
          }),
        };
      }
      if (table === 'prizes') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    id: PRIZE_ID,
                    event_id: EVENT_ID,
                    name: 'Giải Đặc Biệt',
                    reward: 'Xe máy',
                    quantity: 2,
                    sort_order: 0,
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'draws') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: async () => ({
                  data: [
                    {
                      id: 'd-1',
                      event_id: EVENT_ID,
                      prize_id: PRIZE_ID,
                      ticket: 15,
                      status: 'won',
                      seq: 1,
                      is_test: false,
                      created_at: '2026-11-10T00:00:00Z',
                      updated_at: '2026-11-10T00:00:00Z',
                    },
                    {
                      id: 'd-2',
                      event_id: EVENT_ID,
                      prize_id: PRIZE_ID,
                      ticket: 22,
                      status: 'void',
                      seq: 2,
                      is_test: false,
                      created_at: '2026-11-10T00:00:00Z',
                      updated_at: '2026-11-10T00:00:00Z',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'excluded_tickets') {
        return {
          select: (_cols: string, opts: { count?: string; head?: boolean }) => {
            headCountSelectCalls.push(opts);
            return {
              eq: () => ({
                gte: () => ({
                  lte: async () => ({ count: 250, error: null }),
                }),
                in: async () => ({ count: 0, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const state = await fetchActiveDisplayState(false);

    // Total 10,000 - 250 excluded - 1 claimed (void returned) = 9,749
    expect(state.totalPoolSize).toBe(10000);
    expect(state.validTicketsRemaining).toBe(9749);
    // Every excluded_tickets query used head count without transferring ticket payloads
    expect(headCountSelectCalls.length).toBe(2);
    expect(headCountSelectCalls.every((o) => (o as { head?: boolean }).head === true)).toBe(true);
  });

  it('fetchPostWithIdempotentRetry preserves the exact same idempotency_key across retries', async () => {
    const sentKeys: string[] = [];
    let attempt = 0;

    const fakeFetch: typeof fetch = vi.fn(async (_input, init) => {
      attempt += 1;
      const parsed = JSON.parse(String(init?.body ?? '{}')) as { idempotency_key?: string };
      sentKeys.push(parsed.idempotency_key ?? '');

      if (attempt === 1) {
        throw new Error('ECONNRESET');
      }
      if (attempt === 2) {
        return new Response(JSON.stringify({ error: 'Temporary 503' }), { status: 503 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const result = await fetchPostWithIdempotentRetry(
      '/api/draw/next',
      { event_id: EVENT_ID, idempotency_key: 'fixed-click-uuid-999' },
      2,
      1,
      fakeFetch
    );

    expect(result.networkFailed).toBe(false);
    expect(result.response?.status).toBe(200);
    expect(sentKeys).toEqual([
      'fixed-click-uuid-999',
      'fixed-click-uuid-999',
      'fixed-click-uuid-999',
    ]);
  });

  it('shouldIgnoreStageKeyboardAction blocks Space / ArrowRight / Enter during animation and cooldown', () => {
    // Blocked while reveal animation runs
    expect(
      shouldIgnoreStageKeyboardAction({
        key: ' ',
        code: 'Space',
        isAnimating: true,
        isSubmitting: false,
        inCooldown: false,
        repeat: false,
      })
    ).toBe(true);

    expect(
      shouldIgnoreStageKeyboardAction({
        key: 'ArrowRight',
        code: 'ArrowRight',
        isAnimating: true,
        isSubmitting: false,
        inCooldown: false,
        repeat: false,
      })
    ).toBe(true);

    expect(
      shouldIgnoreStageKeyboardAction({
        key: 'Enter',
        code: 'Enter',
        isAnimating: true,
        isSubmitting: false,
        inCooldown: false,
        repeat: false,
      })
    ).toBe(true);

    // Blocked during double-press clicker cooldown
    expect(
      shouldIgnoreStageKeyboardAction({
        key: ' ',
        code: 'Space',
        isAnimating: false,
        isSubmitting: false,
        inCooldown: true,
        repeat: false,
      })
    ).toBe(true);

    // Blocked when holding key down (repeat)
    expect(
      shouldIgnoreStageKeyboardAction({
        key: ' ',
        code: 'Space',
        isAnimating: false,
        isSubmitting: false,
        inCooldown: false,
        repeat: true,
      })
    ).toBe(true);

    // Allowed when idle and ready
    expect(
      shouldIgnoreStageKeyboardAction({
        key: ' ',
        code: 'Space',
        isAnimating: false,
        isSubmitting: false,
        inCooldown: false,
        repeat: false,
      })
    ).toBe(false);
  });

  it('nextQualityPreset cycles smoothly and computeStageCameraFit adapts cleanly for N=3..7 digits', () => {
    expect(nextQualityPreset('high')).toBe('medium');
    expect(nextQualityPreset('medium')).toBe('low');
    expect(nextQualityPreset('low')).toBe('high');

    const fit3 = computeStageCameraFit({ digits: 3, aspect: 16 / 9 });
    const fit5 = computeStageCameraFit({ digits: 5, aspect: 16 / 9 });
    const fit7 = computeStageCameraFit({ digits: 7, aspect: 16 / 9 });
    const fit5Narrow = computeStageCameraFit({ digits: 5, aspect: 4 / 3 });

    expect(fit5.z).toBeGreaterThan(fit3.z);
    expect(fit7.z).toBeGreaterThan(fit5.z);
    expect(fit5Narrow.z).toBeGreaterThan(fit5.z);
  });
});

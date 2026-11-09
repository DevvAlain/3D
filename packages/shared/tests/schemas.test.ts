import { describe, it, expect } from 'vitest';
import {
  EventSchema,
  EventCreateSchema,
  PrizeSchema,
  PrizeCreateSchema,
  DrawNextRequestSchema,
} from '../src/schemas';

describe('Event Schemas', () => {
  const validEvent = {
    title: 'Đại Hội Giáo Xứ 2026',
    parish_name: 'Giáo Xứ Thánh Tâm',
    digits: 5,
    range_from: 1,
    range_to: 3000,
    theme: 'classic' as const,
    primary_color: '#F5C451',
    test_mode: false,
    status: 'ready' as const,
    is_active: true,
  };

  it('validates a correct event payload', () => {
    const result = EventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it('rejects when range_from > range_to', () => {
    const result = EventSchema.safeParse({
      ...validEvent,
      range_from: 5000,
      range_to: 1000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('không được lớn hơn số kết thúc');
    }
  });

  it('rejects when range_to >= 10^digits', () => {
    const result = EventSchema.safeParse({
      ...validEvent,
      digits: 4,
      range_to: 10000, // 4 digits can only hold 0 - 9999
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('số kết thúc tối đa là 9999');
    }
  });

  it('rejects digits outside 3 to 7', () => {
    const low = EventSchema.safeParse({ ...validEvent, digits: 2 });
    expect(low.success).toBe(false);

    const high = EventSchema.safeParse({ ...validEvent, digits: 8 });
    expect(high.success).toBe(false);
  });

  it('rejects invalid hex primary colors', () => {
    const invalidColor = EventSchema.safeParse({ ...validEvent, primary_color: 'yellow' });
    expect(invalidColor.success).toBe(false);

    const validColor = EventSchema.safeParse({ ...validEvent, primary_color: '#1B0F3A' });
    expect(validColor.success).toBe(true);
  });
});

describe('Prize Schemas', () => {
  const validPrize = {
    event_id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Giải Nhất',
    reward: 'Xe máy Honda Vision',
    quantity: 3,
    sort_order: 1,
  };

  it('validates a correct prize payload', () => {
    const result = PrizeSchema.safeParse(validPrize);
    expect(result.success).toBe(true);
  });

  it('rejects quantity <= 0', () => {
    const result = PrizeSchema.safeParse({
      ...validPrize,
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative sort_order', () => {
    const result = PrizeSchema.safeParse({
      ...validPrize,
      sort_order: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty name or reward', () => {
    const noName = PrizeSchema.safeParse({ ...validPrize, name: '   ' });
    expect(noName.success).toBe(false);

    const noReward = PrizeSchema.safeParse({ ...validPrize, reward: '' });
    expect(noReward.success).toBe(false);
  });
});

describe('Draw Request Schemas', () => {
  it('validates draw next request with idempotency key', () => {
    const result = DrawNextRequestSchema.safeParse({
      event_id: 'a0000000-0000-0000-0000-000000000001',
      idempotency_key: 'req_12345_abc',
      is_test: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid event UUID', () => {
    const result = DrawNextRequestSchema.safeParse({
      event_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

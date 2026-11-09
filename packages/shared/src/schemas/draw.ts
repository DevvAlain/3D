import { z } from 'zod';
import { PrizeSchema } from './prize';

export const DrawStatusSchema = z.enum(['revealing', 'won', 'absent', 'void']);
export type DrawStatus = z.infer<typeof DrawStatusSchema>;

export const DrawSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  prize_id: z.string().uuid(),
  ticket: z.number().int().min(0, 'Số vé phải lớn hơn hoặc bằng 0'),
  status: DrawStatusSchema.default('revealing'),
  seq: z.number().int().min(1, 'Thứ tự lượt quay phải bắt đầu từ 1'),
  idempotency_key: z.string().nullable().optional(),
  is_test: z.boolean().default(false),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  prize: PrizeSchema.optional(),
});
export type Draw = z.infer<typeof DrawSchema>;

export const DrawNextRequestSchema = z.object({
  event_id: z.string().uuid('ID sự kiện không hợp lệ'),
  idempotency_key: z.string().min(1, 'Idempotency key không được để trống').optional(),
  is_test: z.boolean().optional(),
});
export type DrawNextRequest = z.infer<typeof DrawNextRequestSchema>;

export const ConfirmWonRequestSchema = z.object({
  draw_id: z.string().uuid('ID lượt quay không hợp lệ'),
});
export type ConfirmWonRequest = z.infer<typeof ConfirmWonRequestSchema>;

export const MarkAbsentRequestSchema = z.object({
  draw_id: z.string().uuid('ID lượt quay không hợp lệ'),
});
export type MarkAbsentRequest = z.infer<typeof MarkAbsentRequestSchema>;

export const VoidLastRequestSchema = z.object({
  event_id: z.string().uuid('ID sự kiện không hợp lệ'),
  is_test: z.boolean().default(false),
});
export type VoidLastRequest = z.infer<typeof VoidLastRequestSchema>;

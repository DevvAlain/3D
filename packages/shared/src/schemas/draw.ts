import { z } from 'zod';
import { PrizeSchema } from './prize';
import { EventSchema } from './event';

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
});
export type DrawNextRequest = z.infer<typeof DrawNextRequestSchema>;

export const DrawNextResultSchema = z.object({
  draw: DrawSchema,
  prize: PrizeSchema,
  is_idempotent: z.boolean(),
});
export type DrawNextResult = z.infer<typeof DrawNextResultSchema>;

export const ConfirmWonRequestSchema = z.object({
  draw_id: z.string().uuid('ID lượt quay không hợp lệ'),
});
export type ConfirmWonRequest = z.infer<typeof ConfirmWonRequestSchema>;

export const MarkAbsentRequestSchema = z.object({
  draw_id: z.string().uuid('ID lượt quay không hợp lệ'),
});
export type MarkAbsentRequest = z.infer<typeof MarkAbsentRequestSchema>;

export const UndoAbsentRequestSchema = z.object({
  event_id: z.string().uuid('ID sự kiện không hợp lệ'),
});
export type UndoAbsentRequest = z.infer<typeof UndoAbsentRequestSchema>;

export const VoidLastRequestSchema = z.object({
  event_id: z.string().uuid('ID sự kiện không hợp lệ'),
});
export type VoidLastRequest = z.infer<typeof VoidLastRequestSchema>;

export const ClearTestDrawsRequestSchema = z.object({
  event_id: z.string().uuid('ID sự kiện không hợp lệ'),
});
export type ClearTestDrawsRequest = z.infer<typeof ClearTestDrawsRequestSchema>;

export const ResetEventRequestSchema = z.object({
  event_id: z.string().uuid('ID sự kiện không hợp lệ'),
  confirm_title: z.string().trim().min(1, 'Vui lòng nhập chính xác tên sự kiện để xác nhận reset'),
});
export type ResetEventRequest = z.infer<typeof ResetEventRequestSchema>;

export const ActivateEventRequestSchema = z.object({
  event_id: z.string().uuid('ID sự kiện không hợp lệ'),
});
export type ActivateEventRequest = z.infer<typeof ActivateEventRequestSchema>;

export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid().nullable(),
  actor_id: z.string().uuid().nullable(),
  actor_email: z.string().nullable(),
  action: z.string(),
  details: z.record(z.unknown()),
  created_at: z.string().datetime(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

export interface PrizeProgress extends z.infer<typeof PrizeSchema> {
  won_count: number;
  revealing_count: number;
  remaining_count: number;
}

export interface DisplayStatePayload {
  event: z.infer<typeof EventSchema> | null;
  prizes: PrizeProgress[];
  activePrize: PrizeProgress | null;
  currentDraw: (Draw & { prize?: z.infer<typeof PrizeSchema> }) | null;
  latestDraw: (Draw & { prize?: z.infer<typeof PrizeSchema> }) | null;
  wonDraws: Array<Draw & { prize_name?: string; prize_reward?: string }>;
  allDrawsCount: number;
  validTicketsRemaining: number;
  totalPoolSize: number;
  isAllPrizesCompleted: boolean;
  isPreview?: boolean;
  serverTime: string;
}

export const EventConfigImportSchema = z
  .object({
    version: z.literal(1).default(1),
    target_event_id: z.string().uuid('ID sự kiện đích không hợp lệ').optional(),
    event: z.object({
      title: z.string().trim().min(3, 'Tên sự kiện tối thiểu 3 ký tự').max(150),
      parish_name: z.string().trim().min(3, 'Tên giáo xứ tối thiểu 3 ký tự').max(150),
      digits: z.number().int().min(3, 'Số chữ số tối thiểu 3').max(7, 'Số chữ số tối đa 7'),
      range_from: z.number().int().min(0, 'Số bắt đầu không được âm'),
      range_to: z.number().int(),
      theme: z.enum(['classic', 'christmas', 'easter']).default('classic'),
      primary_color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).default('#F5C451'),
      test_mode: z.boolean().default(true),
    }),
    prizes: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(100),
          reward: z.string().trim().min(1).max(200),
          quantity: z.number().int().min(1),
          sort_order: z.number().int().min(0),
        })
      )
      .default([]),
    excluded_tickets: z
      .array(
        z.object({
          ticket: z.number().int().min(0),
          reason: z.string().max(250).nullable().optional(),
        })
      )
      .default([]),
  })
  .superRefine((data, ctx) => {
    const { digits, range_from, range_to } = data.event;
    if (range_from > range_to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Số bắt đầu (range_from) không được lớn hơn số kết thúc (range_to)',
        path: ['event', 'range_to'],
      });
    }
    const maxAllowed = Math.pow(10, digits);
    if (range_to >= maxAllowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Với ${digits} chữ số, số kết thúc tối đa là ${maxAllowed - 1}`,
        path: ['event', 'range_to'],
      });
    }
  });
export type EventConfigImport = z.infer<typeof EventConfigImportSchema>;

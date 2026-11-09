import { z } from 'zod';

export const ExcludedTicketSchema = z.object({
  id: z.string().uuid().optional(),
  event_id: z.string().uuid('ID sự kiện không hợp lệ'),
  ticket: z.number().int('Số vé phải là số nguyên').min(0, 'Số vé không được âm'),
  reason: z.string().trim().max(250, 'Lý do tối đa 250 ký tự').nullable().optional(),
  created_at: z.string().datetime().optional(),
});
export type ExcludedTicket = z.infer<typeof ExcludedTicketSchema>;

export const BatchExcludedTicketsSchema = z.object({
  event_id: z.string().uuid('ID sự kiện không hợp lệ'),
  raw_input: z.string().min(1, 'Dữ liệu vé loại trừ không được để trống'),
  reason: z.string().trim().max(250).optional(),
});
export type BatchExcludedTicketsInput = z.infer<typeof BatchExcludedTicketsSchema>;

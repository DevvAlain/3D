import { z } from 'zod';

export const PrizeBaseSchema = z.object({
  id: z.string().uuid().optional(),
  event_id: z.string().uuid('ID sự kiện không hợp lệ'),
  name: z.string().trim().min(1, 'Tên giải thưởng không được để trống').max(100, 'Tên giải thưởng tối đa 100 ký tự'),
  reward: z.string().trim().min(1, 'Hiện vật thưởng không được để trống').max(200, 'Hiện vật thưởng tối đa 200 ký tự'),
  quantity: z.number().int('Số lượng giải phải là số nguyên').min(1, 'Số lượng giải phải lớn hơn 0'),
  sort_order: z.number().int('Thứ tự sắp xếp phải là số nguyên').min(0, 'Thứ tự sắp xếp không được âm').default(0),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export const PrizeSchema = PrizeBaseSchema;
export type Prize = z.infer<typeof PrizeSchema>;

export const PrizeCreateSchema = PrizeBaseSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type PrizeCreateInput = z.infer<typeof PrizeCreateSchema>;

export const PrizeUpdateSchema = PrizeBaseSchema.partial().omit({
  id: true,
  event_id: true,
  created_at: true,
  updated_at: true,
});
export type PrizeUpdateInput = z.infer<typeof PrizeUpdateSchema>;

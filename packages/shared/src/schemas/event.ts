import { z } from 'zod';

export const EventThemeSchema = z.enum(['classic', 'christmas', 'easter']);
export type EventTheme = z.infer<typeof EventThemeSchema>;

export const EventStatusSchema = z.enum(['draft', 'ready', 'active', 'completed', 'paused']);
export type EventStatus = z.infer<typeof EventStatusSchema>;

const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

export const EventBaseSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3, 'Tên sự kiện phải có ít nhất 3 ký tự').max(150, 'Tên sự kiện tối đa 150 ký tự'),
  parish_name: z.string().trim().min(3, 'Tên giáo xứ phải có ít nhất 3 ký tự').max(150, 'Tên giáo xứ tối đa 150 ký tự'),
  logo_url: z.string().url('Đường dẫn logo không hợp lệ').nullable().optional(),
  digits: z.number().int('Số chữ số phải là số nguyên').min(3, 'Tối thiểu 3 chữ số').max(7, 'Tối đa 7 chữ số'),
  range_from: z.number().int('Số bắt đầu phải là số nguyên').min(0, 'Số bắt đầu không được âm'),
  range_to: z.number().int('Số kết thúc phải là số nguyên'),
  theme: EventThemeSchema.default('classic'),
  primary_color: z.string().regex(hexColorRegex, 'Mã màu phải là định dạng Hex (ví dụ: #F5C451)').default('#F5C451'),
  bg_music_url: z.string().url('Đường dẫn nhạc nền không hợp lệ').nullable().optional(),
  test_mode: z.boolean().default(false),
  status: EventStatusSchema.default('draft'),
  is_active: z.boolean().default(false),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export const EventSchema = EventBaseSchema.superRefine((data, ctx) => {
  if (data.range_from > data.range_to) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Số bắt đầu (range_from) không được lớn hơn số kết thúc (range_to)',
      path: ['range_to'],
    });
  }

  const maxAllowed = Math.pow(10, data.digits);
  if (data.range_to >= maxAllowed) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Với ${data.digits} chữ số, số kết thúc tối đa là ${maxAllowed - 1}`,
      path: ['range_to'],
    });
  }
});

export type Event = z.infer<typeof EventSchema>;

export const EventCreateSchema = EventBaseSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).superRefine((data, ctx) => {
  if (data.range_from > data.range_to) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Số bắt đầu không được lớn hơn số kết thúc',
      path: ['range_to'],
    });
  }
  const maxAllowed = Math.pow(10, data.digits);
  if (data.range_to >= maxAllowed) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Với ${data.digits} chữ số, số kết thúc tối đa là ${maxAllowed - 1}`,
      path: ['range_to'],
    });
  }
});

export type EventCreateInput = z.infer<typeof EventCreateSchema>;

export const EventUpdateSchema = EventBaseSchema.partial().superRefine((data, ctx) => {
  if (data.digits !== undefined && data.range_to !== undefined) {
    const maxAllowed = Math.pow(10, data.digits);
    if (data.range_to >= maxAllowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Với ${data.digits} chữ số, số kết thúc tối đa là ${maxAllowed - 1}`,
        path: ['range_to'],
      });
    }
  }
  if (data.range_from !== undefined && data.range_to !== undefined) {
    if (data.range_from > data.range_to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Số bắt đầu không được lớn hơn số kết thúc',
        path: ['range_to'],
      });
    }
  }
});

export type EventUpdateInput = z.infer<typeof EventUpdateSchema>;

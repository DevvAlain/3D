import { z } from 'zod';

export const PrizeSpeedModeSchema = z.enum(['fast', 'full']);
export type PrizeSpeedMode = z.infer<typeof PrizeSpeedModeSchema>;

export const PrizeBaseSchema = z.object({
  id: z.string().uuid().optional(),
  event_id: z.string().uuid('ID sự kiện không hợp lệ'),
  name: z
    .string()
    .trim()
    .min(1, 'Tên giải thưởng không được để trống')
    .max(100, 'Tên giải thưởng tối đa 100 ký tự'),
  reward: z
    .string()
    .trim()
    .min(1, 'Hiện vật thưởng không được để trống')
    .max(200, 'Hiện vật thưởng tối đa 200 ký tự'),
  quantity: z
    .number()
    .int('Số lượng giải phải là số nguyên')
    .min(1, 'Số lượng giải phải lớn hơn 0'),
  sort_order: z
    .number()
    .int('Thứ tự sắp xếp phải là số nguyên')
    .min(0, 'Thứ tự sắp xếp không được âm')
    .default(0),
  speed_mode: PrizeSpeedModeSchema.nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
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

const TOP_PRIZE_NAME_PATTERN = /(đặc\s*biệt|dac\s*biet|giải\s*nhất|giai\s*nhat|\bnhất\b|grand|special)/i;

/**
 * Suggests a sensible default draw speed mode when creating a new prize in Admin:
 * top/grand prizes default to 'full' (~17s), while smaller/frequent prizes default to 'fast' (~8s).
 */
export function suggestDefaultSpeedModeForNewPrize(params: {
  name: string;
  quantity: number;
  sortOrder: number;
  existingPrizes: ReadonlyArray<Pick<Prize, 'sort_order'>>;
}): PrizeSpeedMode {
  const { name, quantity, sortOrder, existingPrizes } = params;
  if (TOP_PRIZE_NAME_PATTERN.test(name.trim())) {
    return 'full';
  }
  if (existingPrizes.length === 0) {
    return 'full';
  }
  const maxExistingSort = Math.max(...existingPrizes.map((p) => p.sort_order));
  if (sortOrder >= maxExistingSort && quantity <= 3) {
    return 'full';
  }
  return 'fast';
}

/**
 * Resolves the effective draw speed mode for a prize.
 * Explicit `speed_mode` ('fast' | 'full') always wins; if unset (null/undefined),
 * automatically treats highest tier prize(s) as 'full' and earlier smaller tiers as 'fast'.
 */
export function resolvePrizeSpeedMode(
  prize:
    | Pick<Prize, 'id' | 'name' | 'quantity' | 'sort_order' | 'speed_mode'>
    | null
    | undefined,
  allPrizes: ReadonlyArray<
    Pick<Prize, 'id' | 'name' | 'quantity' | 'sort_order' | 'speed_mode'>
  > = []
): PrizeSpeedMode {
  if (!prize) return 'full';
  if (prize.speed_mode === 'fast' || prize.speed_mode === 'full') {
    return prize.speed_mode;
  }
  if (TOP_PRIZE_NAME_PATTERN.test(prize.name.trim())) {
    return 'full';
  }
  if (allPrizes.length <= 1) {
    return 'full';
  }

  const ordered = [...allPrizes].sort((a, b) => a.sort_order - b.sort_order);
  const fullTierCount = ordered.length >= 4 ? 2 : 1;
  const idx = prize.id
    ? ordered.findIndex((p) => p.id === prize.id)
    : ordered.findIndex(
        (p) => p.sort_order === prize.sort_order && p.name === prize.name
      );

  if (idx >= ordered.length - fullTierCount && idx !== -1) {
    return 'full';
  }
  return 'fast';
}

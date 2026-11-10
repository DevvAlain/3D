export const DIGIT_SLOTS_ANCHOR: [number, number, number] = [0, -0.96, 2.52];

export const CHUTE_SPLINE_COORDS: ReadonlyArray<[number, number, number]> = [
  [0.24, -0.14, 0.54],
  [0.18, -0.26, 1.02],
  [0.08, -0.35, 1.46],
  [0, -0.36, 1.88],
];

export interface DigitSlotLayout {
  safeDigits: number;
  spacing: number;
  plaqueW: number;
  plaqueH: number;
  totalSpan: number;
  lecternWidth: number;
}

export function computeDigitSlotLayout(digits: number): DigitSlotLayout {
  const safeDigits = Math.max(1, Math.min(8, digits));
  const spacing = safeDigits <= 4 ? 0.96 : safeDigits === 5 ? 0.88 : 0.74;
  const plaqueW = safeDigits <= 5 ? 0.7 : 0.58;
  const plaqueH = safeDigits <= 5 ? 0.88 : 0.76;
  const totalSpan = (safeDigits - 1) * spacing;
  const lecternWidth = totalSpan + plaqueW + 0.55;

  return {
    safeDigits,
    spacing,
    plaqueW,
    plaqueH,
    totalSpan,
    lecternWidth,
  };
}

/**
 * Exact 3D world-space front face target for digit slot `index`,
 * used by the kinematic chute reveal ball to land dead-center on its plaque.
 */
export function computeDigitSlotWorldPosition(
  index: number,
  digits: number
): [number, number, number] {
  const { safeDigits, spacing, totalSpan } = computeDigitSlotLayout(digits);
  const clampedIdx = Math.max(0, Math.min(safeDigits - 1, index));
  const localX = -totalSpan / 2 + clampedIdx * spacing;

  return [
    DIGIT_SLOTS_ANCHOR[0] + localX,
    DIGIT_SLOTS_ANCHOR[1] + 0.04,
    DIGIT_SLOTS_ANCHOR[2] + 0.14,
  ];
}

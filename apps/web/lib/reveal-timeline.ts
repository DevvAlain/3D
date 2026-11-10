import type { PrizeSpeedMode } from '@church/shared';

export type RevealPhase =
  | 'idle'
  | 'intro'
  | 'digit-prep'
  | 'digit-chute'
  | 'digit-landed'
  | 'final-suspense'
  | 'final-chute'
  | 'finale'
  | 'complete';

export interface ActiveExtractionBall {
  digitIndex: number;
  /** Progress 0..1 inside the curved brass chute tube, or null when arcing to slot */
  chuteT: number | null;
  /** Progress 0..1 along parabolic hop from chute mouth into slot, or null when inside tube */
  arcT: number | null;
}

export interface RevealSchedule {
  digits: number;
  speedMode: PrizeSpeedMode;
  introSec: number;
  leadingCount: number;
  perLeadingDigitSec: number;
  finalSuspenseStartSec: number;
  finalSuspenseSec: number;
  finalChuteStartSec: number;
  finalChuteSec: number;
  finalRevealAtSec: number;
  finaleHoldSec: number;
  totalDurationSec: number;
}

export interface RevealTimelineSnapshot {
  digits: number;
  elapsedSec: number;
  totalDurationSec: number;
  finalRevealAtSec: number;
  phase: RevealPhase;
  revealedDigits: number;
  justLandedDigitIndex: number | null;
  activeBall: ActiveExtractionBall | null;
  /** Rotation multiplier relative to base idle speed (0.28x suspense -> 2.8x spin-up) */
  cageSpeedMultiplier: number;
  /** 0 = normal bright sanctuary stage, ~0.82 = tense final-digit spotlight dim */
  stageDimFactor: number;
  /** Target slot currently anticipating or receiving a ball */
  slotHighlightIndex: number | null;
  /** Discrete tick counter during final-suspense for synced clockwork audio cues */
  suspenseTickStep: number;
  /** 0..1 radiant light burst intensity peaking at finalRevealAtSec */
  finalBurstStrength: number;
  /** True only after final digit has landed or user fast-forwarded */
  isFinalRevealVisible: boolean;
  isComplete: boolean;
}

/**
 * Computes a deterministic, GPU-independent stage reveal schedule:
 * - 'full': ~16–18s dramatic buildup reserved for top/grand prizes
 * - 'fast': ~8.0s brisk ceremonial cadence for small/high-count prizes
 */
export function computeRevealSchedule(
  digits: number,
  speedMode: PrizeSpeedMode = 'full'
): RevealSchedule {
  const safeDigits = Math.max(1, Math.min(8, Math.round(digits)));
  const isFast = speedMode === 'fast';

  const introSec = isFast ? 1.0 : 2.4;
  const leadingCount = Math.max(0, safeDigits - 1);
  const finalSuspenseSec = isFast ? 1.85 : 3.6;
  const finalChuteSec = isFast ? 0.72 : 1.1;
  const finaleHoldSec = isFast ? 1.25 : 2.2;

  let perLeadingDigitSec = 0;
  let leadingBudget = 0;
  if (leadingCount > 0) {
    if (isFast) {
      leadingBudget = safeDigits <= 4 ? 3.0 : safeDigits === 5 ? 3.2 : 3.4;
    } else {
      leadingBudget =
        safeDigits <= 4
          ? 8.0
          : safeDigits === 5
            ? 8.8
            : 9.2;
    }
    perLeadingDigitSec = leadingBudget / leadingCount;
  }

  const finalSuspenseStartSec = introSec + leadingBudget;
  const finalChuteStartSec = finalSuspenseStartSec + finalSuspenseSec;
  const finalRevealAtSec = finalChuteStartSec + finalChuteSec;
  const totalDurationSec = finalRevealAtSec + finaleHoldSec;

  return {
    digits: safeDigits,
    speedMode,
    introSec,
    leadingCount,
    perLeadingDigitSec,
    finalSuspenseStartSec,
    finalSuspenseSec,
    finalChuteStartSec,
    finalChuteSec,
    finalRevealAtSec,
    finaleHoldSec,
    totalDurationSec,
  };
}

function clamp01(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

/**
 * Evaluates exact reveal stage state at `elapsedSec` since draw start.
 */
export function evaluateRevealTimeline(
  digits: number,
  elapsedSec: number,
  speedMode: PrizeSpeedMode = 'full'
): RevealTimelineSnapshot {
  const schedule = computeRevealSchedule(digits, speedMode);
  const t = Math.max(0, elapsedSec);

  if (t >= schedule.totalDurationSec) {
    return {
      digits: schedule.digits,
      elapsedSec: t,
      totalDurationSec: schedule.totalDurationSec,
      finalRevealAtSec: schedule.finalRevealAtSec,
      phase: 'complete',
      revealedDigits: schedule.digits,
      justLandedDigitIndex: null,
      activeBall: null,
      cageSpeedMultiplier: 1.0,
      stageDimFactor: 0,
      slotHighlightIndex: null,
      suspenseTickStep: 0,
      finalBurstStrength: 0,
      isFinalRevealVisible: true,
      isComplete: true,
    };
  }

  // Intro high-energy agitation spin before first ball exits
  if (t < schedule.introSec) {
    const p = t / schedule.introSec;
    return {
      digits: schedule.digits,
      elapsedSec: t,
      totalDurationSec: schedule.totalDurationSec,
      finalRevealAtSec: schedule.finalRevealAtSec,
      phase: 'intro',
      revealedDigits: 0,
      justLandedDigitIndex: null,
      activeBall: null,
      cageSpeedMultiplier: 2.8 - p * 0.5,
      stageDimFactor: 0,
      slotHighlightIndex: null,
      suspenseTickStep: 0,
      finalBurstStrength: 0,
      isFinalRevealVisible: false,
      isComplete: false,
    };
  }

  // Leading digits 0 .. N-2
  if (t < schedule.finalSuspenseStartSec && schedule.leadingCount > 0) {
    const localT = t - schedule.introSec;
    const digitIndex = Math.min(
      schedule.leadingCount - 1,
      Math.floor(localT / schedule.perLeadingDigitSec)
    );
    const digitOffset = localT - digitIndex * schedule.perLeadingDigitSec;
    const u = clamp01(digitOffset / schedule.perLeadingDigitSec);

    if (u < 0.28) {
      // Cage eases slower to funnel next ball
      const prepProgress = u / 0.28;
      return {
        digits: schedule.digits,
        elapsedSec: t,
        totalDurationSec: schedule.totalDurationSec,
        finalRevealAtSec: schedule.finalRevealAtSec,
        phase: 'digit-prep',
        revealedDigits: digitIndex,
        justLandedDigitIndex: null,
        activeBall: null,
        cageSpeedMultiplier: 2.1 - prepProgress * 1.15,
        stageDimFactor: 0,
        slotHighlightIndex: digitIndex,
        suspenseTickStep: 0,
        finalBurstStrength: 0,
        isFinalRevealVisible: false,
        isComplete: false,
      };
    }

    if (u < 0.72) {
      // Ball slides cleanly down brass chute tube
      const chuteT = (u - 0.28) / (0.72 - 0.28);
      return {
        digits: schedule.digits,
        elapsedSec: t,
        totalDurationSec: schedule.totalDurationSec,
        finalRevealAtSec: schedule.finalRevealAtSec,
        phase: 'digit-chute',
        revealedDigits: digitIndex,
        justLandedDigitIndex: null,
        activeBall: { digitIndex, chuteT: clamp01(chuteT), arcT: null },
        cageSpeedMultiplier: 0.85,
        stageDimFactor: 0,
        slotHighlightIndex: digitIndex,
        suspenseTickStep: 0,
        finalBurstStrength: 0,
        isFinalRevealVisible: false,
        isComplete: false,
      };
    }

    if (u < 0.90) {
      // Ball hops off tray smoothly onto digit slot plaque
      const arcT = (u - 0.72) / (0.90 - 0.72);
      return {
        digits: schedule.digits,
        elapsedSec: t,
        totalDurationSec: schedule.totalDurationSec,
        finalRevealAtSec: schedule.finalRevealAtSec,
        phase: 'digit-chute',
        revealedDigits: digitIndex,
        justLandedDigitIndex: null,
        activeBall: { digitIndex, chuteT: null, arcT: clamp01(arcT) },
        cageSpeedMultiplier: 1.05,
        stageDimFactor: 0,
        slotHighlightIndex: digitIndex,
        suspenseTickStep: 0,
        finalBurstStrength: 0,
        isFinalRevealVisible: false,
        isComplete: false,
      };
    }

    // Ball landed -> reveal digit `digitIndex` and trigger "ting!"
    return {
      digits: schedule.digits,
      elapsedSec: t,
      totalDurationSec: schedule.totalDurationSec,
      finalRevealAtSec: schedule.finalRevealAtSec,
      phase: 'digit-landed',
      revealedDigits: digitIndex + 1,
      justLandedDigitIndex: digitIndex,
      activeBall: null,
      cageSpeedMultiplier: 1.85,
      stageDimFactor: 0,
      slotHighlightIndex: digitIndex,
      suspenseTickStep: 0,
      finalBurstStrength: 0,
      isFinalRevealVisible: false,
      isComplete: false,
    };
  }

  // Last-digit suspense window (dim lights, heartbeat ticks, slow cage crawl)
  if (t < schedule.finalChuteStartSec) {
    const suspenseElapsed = t - schedule.finalSuspenseStartSec;
    const p = clamp01(suspenseElapsed / schedule.finalSuspenseSec);
    const rampDuration = speedMode === 'fast' ? 0.35 : 0.75;
    const rampIn = clamp01(suspenseElapsed / rampDuration);
    const dim = rampIn * (0.72 + p * 0.14);
    const tickInterval = speedMode === 'fast' ? 0.45 : 0.62;
    const suspenseTickStep = Math.floor(suspenseElapsed / tickInterval) + 1;

    return {
      digits: schedule.digits,
      elapsedSec: t,
      totalDurationSec: schedule.totalDurationSec,
      finalRevealAtSec: schedule.finalRevealAtSec,
      phase: 'final-suspense',
      revealedDigits: schedule.leadingCount,
      justLandedDigitIndex: null,
      activeBall: null,
      cageSpeedMultiplier: 0.7 - p * 0.42, // eases down to 0.28x slow suspense crawl
      stageDimFactor: dim,
      slotHighlightIndex: schedule.digits - 1,
      suspenseTickStep,
      finalBurstStrength: 0,
      isFinalRevealVisible: false,
      isComplete: false,
    };
  }

  // Final ball sliding down chute and leaping into last digit slot
  if (t < schedule.finalRevealAtSec) {
    const chuteElapsed = t - schedule.finalChuteStartSec;
    const u = clamp01(chuteElapsed / schedule.finalChuteSec);
    const inTube = u < 0.6;
    const chuteT = inTube ? clamp01(u / 0.6) : null;
    const arcT = inTube ? null : clamp01((u - 0.6) / 0.4);

    return {
      digits: schedule.digits,
      elapsedSec: t,
      totalDurationSec: schedule.totalDurationSec,
      finalRevealAtSec: schedule.finalRevealAtSec,
      phase: 'final-chute',
      revealedDigits: schedule.leadingCount,
      justLandedDigitIndex: null,
      activeBall: {
        digitIndex: schedule.digits - 1,
        chuteT,
        arcT,
      },
      cageSpeedMultiplier: 0.38,
      stageDimFactor: 0.84,
      slotHighlightIndex: schedule.digits - 1,
      suspenseTickStep: 0,
      finalBurstStrength: 0,
      isFinalRevealVisible: false,
      isComplete: false,
    };
  }

  // Grand Finale: full number revealed + scales up + light burst + confetti + fanfare!
  const finaleElapsed = t - schedule.finalRevealAtSec;
  const finaleProgress = clamp01(finaleElapsed / schedule.finaleHoldSec);
  const burst = Math.pow(1 - finaleProgress, 1.75);

  return {
    digits: schedule.digits,
    elapsedSec: t,
    totalDurationSec: schedule.totalDurationSec,
    finalRevealAtSec: schedule.finalRevealAtSec,
    phase: 'finale',
    revealedDigits: schedule.digits,
    justLandedDigitIndex: schedule.digits - 1,
    activeBall: null,
    cageSpeedMultiplier: 1.0 + burst * 0.9,
    stageDimFactor: 0,
    slotHighlightIndex: null,
    suspenseTickStep: 0,
    finalBurstStrength: burst,
    isFinalRevealVisible: true,
    isComplete: false,
  };
}

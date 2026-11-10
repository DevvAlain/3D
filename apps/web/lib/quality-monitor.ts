export type DisplayQualityPreset = 'high' | 'medium' | 'light' | 'low';

export const QUALITY_LABELS: Record<DisplayQualityPreset, string> = {
  high: 'Cao (3D)',
  medium: 'Trung bình (3D)',
  light: 'Nhẹ (3D)',
  low: 'Thấp (2D)',
};

export const AUTO_DOWNGRADE_FPS_THRESHOLD = 40;
export const AUTO_DOWNGRADE_SUSTAIN_SEC = 4.0;
export const AUTO_DOWNGRADE_WARMUP_SEC = 3.5;
export const AUTO_DOWNGRADE_COOLDOWN_SEC = 8.0;

/**
 * Cycles user-selectable stage quality tiers on Q hotkey:
 * Cao (3D) → Trung bình (3D) → Nhẹ (3D) → Thấp (2D) → Cao (3D)
 */
export function nextQualityPreset(current: DisplayQualityPreset): DisplayQualityPreset {
  if (current === 'high') return 'medium';
  if (current === 'medium') return 'light';
  if (current === 'light') return 'low';
  return 'high';
}

/**
 * Returns the next lighter preset for automatic hardware protection,
 * or null once the stage is already running at 2D fallback ('low').
 */
export function downgradeQualityPreset(
  current: DisplayQualityPreset
): DisplayQualityPreset | null {
  if (current === 'high') return 'medium';
  if (current === 'medium') return 'light';
  if (current === 'light') return 'low';
  return null;
}

export interface FpsDowngradeState {
  warmupRemainingSec: number;
  lowFpsAccumSec: number;
  cooldownRemainingSec: number;
}

export interface FpsDowngradeStepResult {
  nextState: FpsDowngradeState;
  shouldDowngrade: boolean;
  measuredFps: number;
}

export function createInitialFpsDowngradeState(
  warmupSec: number = AUTO_DOWNGRADE_WARMUP_SEC
): FpsDowngradeState {
  return {
    warmupRemainingSec: Math.max(0, warmupSec),
    lowFpsAccumSec: 0,
    cooldownRemainingSec: 0,
  };
}

/**
 * Pure hysteresis state machine for auto-downgrading 3D quality when sustained FPS
 * drops below ~40 FPS for >= 4 seconds, ignoring short warmup spikes and background tabs.
 */
export function stepFpsDowngradeState(
  state: FpsDowngradeState,
  params: {
    fps: number;
    windowSec: number;
    isHidden?: boolean;
    fpsThreshold?: number;
    sustainSec?: number;
    cooldownSec?: number;
  }
): FpsDowngradeStepResult {
  const {
    fps,
    windowSec,
    isHidden = false,
    fpsThreshold = AUTO_DOWNGRADE_FPS_THRESHOLD,
    sustainSec = AUTO_DOWNGRADE_SUSTAIN_SEC,
    cooldownSec = AUTO_DOWNGRADE_COOLDOWN_SEC,
  } = params;

  const dt = Math.max(0, Math.min(2.0, windowSec));
  if (isHidden || !Number.isFinite(fps) || fps <= 0 || dt <= 0) {
    return {
      nextState: state,
      shouldDowngrade: false,
      measuredFps: fps,
    };
  }

  const warmupRemainingSec = Math.max(0, state.warmupRemainingSec - dt);
  const cooldownRemainingSec = Math.max(0, state.cooldownRemainingSec - dt);

  if (warmupRemainingSec > 0 || cooldownRemainingSec > 0) {
    return {
      nextState: {
        warmupRemainingSec,
        lowFpsAccumSec: 0,
        cooldownRemainingSec,
      },
      shouldDowngrade: false,
      measuredFps: fps,
    };
  }

  const lowFpsAccumSec =
    fps < fpsThreshold
      ? state.lowFpsAccumSec + dt
      : Math.max(0, state.lowFpsAccumSec - dt * 1.5);

  if (lowFpsAccumSec >= sustainSec) {
    return {
      nextState: {
        warmupRemainingSec: 0,
        lowFpsAccumSec: 0,
        cooldownRemainingSec: cooldownSec,
      },
      shouldDowngrade: true,
      measuredFps: Math.round(fps),
    };
  }

  return {
    nextState: {
      warmupRemainingSec,
      lowFpsAccumSec,
      cooldownRemainingSec,
    },
    shouldDowngrade: false,
    measuredFps: Math.round(fps),
  };
}

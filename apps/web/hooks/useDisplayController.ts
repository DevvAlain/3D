'use client';

import * as React from 'react';
import {
  formatTicket,
  type DisplayStatePayload,
  type Draw,
  type DrawNextResult,
  type Prize,
  type PrizeProgress,
} from '@church/shared';
import { resolveDrawNextClientTransition } from '@/lib/display-state';
import { DisplaySoundEngine } from '@/lib/sound-engine';
import {
  computeRevealSchedule,
  evaluateRevealTimeline,
  type RevealTimelineSnapshot,
} from '@/lib/reveal-timeline';

export type DisplayQualityPreset = 'high' | 'medium' | 'low';

export const ACTION_COOLDOWN_MS = 900;

export function nextQualityPreset(current: DisplayQualityPreset): DisplayQualityPreset {
  if (current === 'high') return 'medium';
  if (current === 'medium') return 'low';
  return 'high';
}

export function shouldIgnoreStageKeyboardAction(params: {
  key: string;
  code: string;
  isAnimating: boolean;
  isSubmitting: boolean;
  inCooldown: boolean;
  repeat: boolean;
}): boolean {
  const { code, key, isAnimating, isSubmitting, inCooldown, repeat } = params;
  if (repeat || isSubmitting || inCooldown) return true;

  // During an active reveal animation, ONLY Space (fast-forward) is permitted;
  // ArrowRight, Enter, V, U, and Backspace stay strictly locked.
  if (isAnimating) {
    if (code === 'Space') {
      return false;
    }
    if (
      code === 'ArrowRight' ||
      code === 'Enter' ||
      key === 'v' ||
      key === 'V' ||
      key === 'u' ||
      key === 'U' ||
      code === 'Backspace'
    ) {
      return true;
    }
  }

  return false;
}

export interface RetryFetchResult {
  response: Response | null;
  json: Record<string, unknown> | null;
  networkFailed: boolean;
}

/**
 * Retries transient network errors or 5xx responses using the exact same payload
 * (preserving the single per-click idempotency_key across all retries).
 */
export async function fetchPostWithIdempotentRetry(
  url: string,
  payload: Record<string, unknown>,
  maxRetries: number = 2,
  delayMs: number = 650,
  fetchImpl: typeof fetch = fetch
): Promise<RetryFetchResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let json: Record<string, unknown> | null = null;
      try {
        json = (await response.json()) as Record<string, unknown>;
      } catch {
        json = null;
      }

      if (response.status >= 500 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }

      return {
        response,
        json,
        networkFailed: false,
      };
    } catch {
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }
      return {
        response: null,
        json: null,
        networkFailed: true,
      };
    }
  }

  return { response: null, json: null, networkFailed: true };
}

export function detectWebGLAvailability(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    if (gl2) return true;
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return Boolean(gl);
  } catch {
    return false;
  }
}

export interface DisplayNotice {
  type: 'info' | 'error' | 'success';
  text: string;
}

export interface BetweenPrizesTransition {
  completedPrize: PrizeProgress;
  nextPrize: PrizeProgress;
  winners: DisplayStatePayload['wonDraws'];
}

function buildIdleSnapshot(digits: number, restoredReveal: boolean): RevealTimelineSnapshot {
  if (restoredReveal) {
    const schedule = computeRevealSchedule(digits);
    return {
      digits: schedule.digits,
      elapsedSec: schedule.totalDurationSec,
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
  return {
    digits,
    elapsedSec: 0,
    totalDurationSec: computeRevealSchedule(digits).totalDurationSec,
    finalRevealAtSec: computeRevealSchedule(digits).finalRevealAtSec,
    phase: 'idle',
    revealedDigits: 0,
    justLandedDigitIndex: null,
    activeBall: null,
    cageSpeedMultiplier: 1.0,
    stageDimFactor: 0,
    slotHighlightIndex: null,
    suspenseTickStep: 0,
    finalBurstStrength: 0,
    isFinalRevealVisible: false,
    isComplete: false,
  };
}

export interface DisplayController {
  state: DisplayStatePayload;
  isPreview: boolean;
  actorEmail: string;
  stageUnlocked: boolean;
  unlockStage: () => void;
  revealedDigits: number;
  isAnimating: boolean;
  isFinalRevealVisible: boolean;
  activeRevealTicketDigits: number[];
  revealTimelineRef: React.MutableRefObject<RevealTimelineSnapshot>;
  confettiBurstKey: number;
  betweenPrizes: BetweenPrizesTransition | null;
  dismissBetweenPrizes: () => void;
  submittingAction: string | null;
  isInCooldown: boolean;
  connectionStatus: 'online' | 'syncing' | 'offline';
  notice: DisplayNotice | null;
  clearNotice: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => Promise<void>;
  quality: DisplayQualityPreset;
  setQuality: (q: DisplayQualityPreset) => void;
  cycleQuality: () => void;
  webglSupported: boolean;
  webglContextLost: boolean;
  handleWebGLContextLost: () => void;
  shouldRender3D: boolean;
  showFps: boolean;
  toggleShowFps: () => void;
  muted: boolean;
  toggleMuted: () => void;
  refreshState: () => Promise<DisplayStatePayload | null>;
  skipRevealAnimation: () => void;
  handleDrawNext: () => Promise<void>;
  handleConfirmWon: () => Promise<void>;
  handleMarkAbsent: () => Promise<void>;
  handleUndoAbsent: () => Promise<void>;
  handleVoidLast: () => Promise<void>;
  wonGroupedByPrize: Array<{
    prize: DisplayStatePayload['prizes'][number];
    winners: DisplayStatePayload['wonDraws'];
  }>;
}

export function useDisplayController(params: {
  initialState: DisplayStatePayload;
  isPreview: boolean;
  actorEmail: string;
}): DisplayController {
  const { initialState, isPreview, actorEmail } = params;

  const initialDigits = initialState.event?.digits ?? 5;
  const hasRestoredReveal = Boolean(initialState.currentDraw && initialState.event);

  const [state, setState] = React.useState<DisplayStatePayload>(initialState);
  const [stageUnlocked, setStageUnlocked] = React.useState<boolean>(isPreview);
  const [revealedDigits, setRevealedDigits] = React.useState<number>(() =>
    hasRestoredReveal ? initialDigits : 0
  );
  const [isAnimating, setIsAnimating] = React.useState<boolean>(false);
  const [confettiBurstKey, setConfettiBurstKey] = React.useState<number>(0);
  const [betweenPrizes, setBetweenPrizes] = React.useState<BetweenPrizesTransition | null>(null);
  const [submittingAction, setSubmittingAction] = React.useState<string | null>(null);
  const [isInCooldown, setIsInCooldown] = React.useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = React.useState<'online' | 'syncing' | 'offline'>(
    'online'
  );
  const [notice, setNotice] = React.useState<DisplayNotice | null>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  // Default to "Trung bình (3D)" until automated FPS benchmarking is added
  const [quality, setQualityState] = React.useState<DisplayQualityPreset>('medium');
  const [webglSupported, setWebglSupported] = React.useState<boolean>(true);
  const [webglContextLost, setWebglContextLost] = React.useState<boolean>(false);
  const [showFps, setShowFps] = React.useState<boolean>(false);
  const [muted, setMuted] = React.useState<boolean>(false);

  const pendingDrawKeyRef = React.useRef<string | null>(null);
  const activeDrawIdRef = React.useRef<string | null>(initialState.currentDraw?.id ?? null);
  const rafIdRef = React.useRef<number | null>(null);
  const burstTailRafRef = React.useRef<number | null>(null);
  const revealStartMsRef = React.useRef<number>(0);
  const lastReportedDigitsRef = React.useRef<number>(hasRestoredReveal ? initialDigits : 0);
  const lastSuspenseTickRef = React.useRef<number>(0);
  const finaleTriggeredRef = React.useRef<boolean>(hasRestoredReveal);
  const revealTimelineRef = React.useRef<RevealTimelineSnapshot>(
    buildIdleSnapshot(initialDigits, hasRestoredReveal)
  );
  const isAnimatingRef = React.useRef<boolean>(false);
  const submittingRef = React.useRef<string | null>(null);
  const cooldownUntilRef = React.useRef<number>(0);
  const cooldownTimerRef = React.useRef<number | null>(null);
  const soundEngineRef = React.useRef<DisplaySoundEngine | null>(null);

  const event = state.event;
  const digits = event?.digits ?? 5;
  const currentDraw = state.currentDraw;
  const latestDraw = state.latestDraw;
  const activePrize = state.activePrize;

  const cancelAllAnimationLoops = React.useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (burstTailRafRef.current !== null) {
      window.cancelAnimationFrame(burstTailRafRef.current);
      burstTailRafRef.current = null;
    }
  }, []);

  // Detect WebGL & load preferred quality preset on mount
  React.useEffect(() => {
    const supported = detectWebGLAvailability();
    setWebglSupported(supported);

    try {
      const saved = window.localStorage.getItem('church_display_quality');
      if (saved === 'high' || saved === 'medium' || saved === 'low') {
        setQualityState(saved);
      }
    } catch {
      // Ignore storage failures
    }

    const engine = new DisplaySoundEngine();
    soundEngineRef.current = engine;

    return () => {
      cancelAllAnimationLoops();
      engine.dispose();
      soundEngineRef.current = null;
      if (cooldownTimerRef.current !== null) window.clearTimeout(cooldownTimerRef.current);
    };
  }, [cancelAllAnimationLoops]);

  React.useEffect(() => {
    if (stageUnlocked) {
      soundEngineRef.current?.syncBgMusic(event?.bg_music_url ?? null);
    }
  }, [stageUnlocked, event?.bg_music_url]);

  const beginCooldown = React.useCallback(() => {
    cooldownUntilRef.current = Date.now() + ACTION_COOLDOWN_MS;
    setIsInCooldown(true);
    if (cooldownTimerRef.current !== null) {
      window.clearTimeout(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = window.setTimeout(() => {
      cooldownUntilRef.current = 0;
      setIsInCooldown(false);
    }, ACTION_COOLDOWN_MS);
  }, []);

  const setQuality = React.useCallback((nextQ: DisplayQualityPreset) => {
    setQualityState(nextQ);
    try {
      window.localStorage.setItem('church_display_quality', nextQ);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const cycleQuality = React.useCallback(() => {
    setQualityState((prev) => {
      const next = nextQualityPreset(prev);
      try {
        window.localStorage.setItem('church_display_quality', next);
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const handleWebGLContextLost = React.useCallback(() => {
    setWebglContextLost(true);
    setNotice({
      type: 'error',
      text: 'Kết xuất 3D WebGL tạm ngưng — đã tự động chuyển sang giao diện 2D an toàn.',
    });
  }, []);

  const toggleShowFps = React.useCallback(() => {
    setShowFps((prev) => !prev);
  }, []);

  const toggleMuted = React.useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const unlockStage = React.useCallback(() => {
    setStageUnlocked(true);
    soundEngineRef.current?.unlock(event?.bg_music_url ?? null);
  }, [event?.bg_music_url]);

  const dismissBetweenPrizes = React.useCallback(() => {
    setBetweenPrizes(null);
  }, []);

  const startBurstTail = React.useCallback((totalDigits: number, startOffsetSec: number) => {
    const startMs = performance.now();
    const runTailFrame = () => {
      const elapsedTail = (performance.now() - startMs) / 1000;
      const snap = evaluateRevealTimeline(totalDigits, startOffsetSec + elapsedTail);
      revealTimelineRef.current = snap;
      if (!snap.isComplete) {
        burstTailRafRef.current = window.requestAnimationFrame(runTailFrame);
      } else {
        burstTailRafRef.current = null;
      }
    };
    revealTimelineRef.current = evaluateRevealTimeline(totalDigits, startOffsetSec);
    burstTailRafRef.current = window.requestAnimationFrame(runTailFrame);
  }, []);

  const stopRevealAnimation = React.useCallback(
    (totalDigits: number, restoredReveal: boolean) => {
      cancelAllAnimationLoops();
      soundEngineRef.current?.stopDrumRoll();
      isAnimatingRef.current = false;
      lastReportedDigitsRef.current = restoredReveal ? totalDigits : 0;
      lastSuspenseTickRef.current = 0;
      finaleTriggeredRef.current = restoredReveal;
      revealTimelineRef.current = buildIdleSnapshot(totalDigits, restoredReveal);
      setRevealedDigits(restoredReveal ? totalDigits : 0);
      setIsAnimating(false);
    },
    [cancelAllAnimationLoops]
  );

  // One-key (Space) fast-forward straight to finished reveal + celebratory burst & fanfare
  const skipRevealAnimation = React.useCallback(() => {
    if (!isAnimatingRef.current) return;
    cancelAllAnimationLoops();

    const schedule = computeRevealSchedule(digits);
    isAnimatingRef.current = false;
    lastReportedDigitsRef.current = digits;
    setRevealedDigits(digits);
    setIsAnimating(false);

    if (!finaleTriggeredRef.current) {
      finaleTriggeredRef.current = true;
      soundEngineRef.current?.playTing();
      soundEngineRef.current?.playFanfare();
      setConfettiBurstKey((k) => k + 1);
    } else {
      soundEngineRef.current?.stopDrumRoll();
    }

    startBurstTail(digits, schedule.finalRevealAtSec);
    beginCooldown();
  }, [digits, cancelAllAnimationLoops, startBurstTail, beginCooldown]);

  const startRevealAnimation = React.useCallback(
    (totalDigits: number) => {
      cancelAllAnimationLoops();
      isAnimatingRef.current = true;
      lastReportedDigitsRef.current = 0;
      lastSuspenseTickRef.current = 0;
      finaleTriggeredRef.current = false;
      revealStartMsRef.current = performance.now();
      revealTimelineRef.current = evaluateRevealTimeline(totalDigits, 0);

      setRevealedDigits(0);
      setIsAnimating(true);
      soundEngineRef.current?.startDrumRoll(0.3);

      const stepFrame = () => {
        const elapsedSec = (performance.now() - revealStartMsRef.current) / 1000;
        const snap = evaluateRevealTimeline(totalDigits, elapsedSec);
        revealTimelineRef.current = snap;

        if (snap.phase === 'final-suspense') {
          soundEngineRef.current?.setDrumRollVolume(0.42);
          if (snap.suspenseTickStep > lastSuspenseTickRef.current) {
            lastSuspenseTickRef.current = snap.suspenseTickStep;
            soundEngineRef.current?.playTick();
          }
        }

        if (snap.isFinalRevealVisible) {
          rafIdRef.current = null;
          isAnimatingRef.current = false;
          lastReportedDigitsRef.current = totalDigits;
          finaleTriggeredRef.current = true;
          setRevealedDigits(totalDigits);
          setIsAnimating(false);
          soundEngineRef.current?.playTing();
          soundEngineRef.current?.playFanfare();
          setConfettiBurstKey((k) => k + 1);
          startBurstTail(totalDigits, snap.elapsedSec);
          return;
        }

        if (snap.revealedDigits > lastReportedDigitsRef.current) {
          lastReportedDigitsRef.current = snap.revealedDigits;
          setRevealedDigits(snap.revealedDigits);
          soundEngineRef.current?.playTing();
        }

        rafIdRef.current = window.requestAnimationFrame(stepFrame);
      };

      rafIdRef.current = window.requestAnimationFrame(stepFrame);
    },
    [cancelAllAnimationLoops, startBurstTail]
  );

  // Poll /api/display/state every 4s (ZERO Supabase Realtime on /display)
  const refreshState = React.useCallback(async (): Promise<DisplayStatePayload | null> => {
    try {
      setConnectionStatus((prev) => (prev === 'offline' ? 'offline' : 'syncing'));
      const url = isPreview ? '/api/display/state?preview=1' : '/api/display/state';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        setConnectionStatus('offline');
        return null;
      }
      const nextState = (await res.json()) as DisplayStatePayload;
      setConnectionStatus('online');

      // Guard against mid-flight `/api/draw/next` or active animation so numbers NEVER flash
      if (submittingRef.current === 'next' || isAnimatingRef.current) {
        return nextState;
      }

      setState(nextState);

      if (nextState.currentDraw && nextState.event) {
        if (nextState.currentDraw.id !== activeDrawIdRef.current) {
          activeDrawIdRef.current = nextState.currentDraw.id;
          stopRevealAnimation(nextState.event.digits, true);
        }
      } else if (activeDrawIdRef.current !== null || burstTailRafRef.current === null) {
        activeDrawIdRef.current = null;
        stopRevealAnimation(nextState.event?.digits ?? digits, false);
      }

      return nextState;
    } catch {
      setConnectionStatus('offline');
      return null;
    }
  }, [isPreview, digits, stopRevealAnimation]);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      void refreshState();
    }, 4000);
    return () => window.clearInterval(id);
  }, [refreshState]);

  React.useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = React.useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Browser policy fallback
    }
  }, []);

  const handleDrawNext = React.useCallback(async () => {
    if (
      isPreview ||
      !event?.id ||
      submittingRef.current ||
      Date.now() < cooldownUntilRef.current ||
      currentDraw ||
      state.isAllPrizesCompleted
    ) {
      return;
    }

    setBetweenPrizes(null);

    if (!pendingDrawKeyRef.current) {
      pendingDrawKeyRef.current = crypto.randomUUID();
    }
    const idempotencyKey = pendingDrawKeyRef.current;

    submittingRef.current = 'next';
    setSubmittingAction('next');
    setNotice(null);

    try {
      const { response, json, networkFailed } = await fetchPostWithIdempotentRetry(
        '/api/draw/next',
        { event_id: event.id, idempotency_key: idempotencyKey },
        2,
        650
      );

      if (networkFailed || !response) {
        setConnectionStatus('offline');
        setNotice({
          type: 'error',
          text: 'Mất kết nối máy chủ sau nhiều lần thử lại — đã giữ nguyên mã lượt quay để bạn bấm lại an toàn.',
        });
        return;
      }

      if (!response.ok) {
        if (response.status < 500) {
          pendingDrawKeyRef.current = null;
        }
        const errMsg =
          json && typeof json.error === 'string' ? json.error : 'Không thể quay lượt tiếp theo.';
        setNotice({ type: 'error', text: errMsg });
        await refreshState();
        return;
      }

      const result = json as unknown as DrawNextResult;
      const transition = resolveDrawNextClientTransition(result);
      pendingDrawKeyRef.current = null;

      if (transition.shouldRestoreOnly) {
        if (transition.noticeMessage) {
          setNotice({ type: 'info', text: transition.noticeMessage });
        }
        await refreshState();
        return;
      }

      // Start masked animation timeline synchronously BEFORE placing draw ticket in state
      activeDrawIdRef.current = result.draw.id;
      startRevealAnimation(digits);
      soundEngineRef.current?.playSpinStart();

      const revealingWithPrize: Draw & { prize?: Prize } = {
        ...result.draw,
        prize: result.prize,
      };
      setState((prev) => ({
        ...prev,
        currentDraw: revealingWithPrize,
        latestDraw: revealingWithPrize,
      }));
      if (transition.noticeMessage) {
        setNotice({ type: 'info', text: transition.noticeMessage });
      }
    } finally {
      submittingRef.current = null;
      setSubmittingAction(null);
      beginCooldown();
    }
  }, [
    isPreview,
    event?.id,
    currentDraw,
    state.isAllPrizesCompleted,
    digits,
    startRevealAnimation,
    refreshState,
    beginCooldown,
  ]);

  const handleConfirmWon = React.useCallback(async () => {
    if (
      isPreview ||
      !currentDraw?.id ||
      submittingRef.current ||
      isAnimatingRef.current ||
      Date.now() < cooldownUntilRef.current
    ) {
      return;
    }

    const previousPrize = state.prizes.find((p) => p.id === currentDraw.prize_id) ?? activePrize;

    submittingRef.current = 'confirm';
    setSubmittingAction('confirm');
    setNotice(null);
    try {
      const res = await fetch('/api/draw/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draw_id: currentDraw.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ type: 'error', text: json.error || 'Không thể xác nhận trúng thưởng.' });
        await refreshState();
        return;
      }

      const nextState = await refreshState();
      if (
        previousPrize &&
        nextState &&
        !nextState.isAllPrizesCompleted &&
        nextState.activePrize &&
        nextState.activePrize.id !== previousPrize.id
      ) {
        const updatedCompleted =
          nextState.prizes.find((p) => p.id === previousPrize.id) ?? {
            ...previousPrize,
            won_count: previousPrize.quantity,
            remaining_count: 0,
          };
        setBetweenPrizes({
          completedPrize: updatedCompleted,
          nextPrize: nextState.activePrize,
          winners: nextState.wonDraws.filter((w) => w.prize_id === previousPrize.id),
        });
      } else {
        setNotice({
          type: 'success',
          text: `Đã xác nhận vé ${formatTicket(currentDraw.ticket, digits)} trúng ${currentDraw.prize?.name ?? 'giải thưởng'}!`,
        });
      }
    } catch {
      setNotice({ type: 'error', text: 'Lỗi kết nối khi xác nhận trúng thưởng.' });
    } finally {
      submittingRef.current = null;
      setSubmittingAction(null);
      beginCooldown();
    }
  }, [
    isPreview,
    currentDraw,
    state.prizes,
    activePrize,
    digits,
    refreshState,
    beginCooldown,
  ]);

  const handleMarkAbsent = React.useCallback(async () => {
    if (
      isPreview ||
      !currentDraw?.id ||
      submittingRef.current ||
      isAnimatingRef.current ||
      Date.now() < cooldownUntilRef.current
    ) {
      return;
    }

    submittingRef.current = 'absent';
    setSubmittingAction('absent');
    setNotice(null);
    try {
      const res = await fetch('/api/draw/absent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draw_id: currentDraw.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ type: 'error', text: json.error || 'Không thể đánh dấu vắng mặt.' });
        await refreshState();
        return;
      }
      setNotice({
        type: 'info',
        text: `Vé ${formatTicket(currentDraw.ticket, digits)} được đánh dấu Vắng mặt (không tính vào số lượng giải).`,
      });
      await refreshState();
    } catch {
      setNotice({ type: 'error', text: 'Lỗi kết nối khi đánh dấu vắng mặt.' });
    } finally {
      submittingRef.current = null;
      setSubmittingAction(null);
      beginCooldown();
    }
  }, [isPreview, currentDraw, digits, refreshState, beginCooldown]);

  const handleUndoAbsent = React.useCallback(async () => {
    if (
      isPreview ||
      !event?.id ||
      submittingRef.current ||
      Date.now() < cooldownUntilRef.current ||
      currentDraw ||
      latestDraw?.status !== 'absent'
    ) {
      return;
    }

    submittingRef.current = 'undo-absent';
    setSubmittingAction('undo-absent');
    setNotice(null);
    try {
      const res = await fetch('/api/draw/undo-absent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ type: 'error', text: json.error || 'Không thể hoàn tác vắng mặt.' });
        await refreshState();
        return;
      }
      setNotice({
        type: 'info',
        text: `Đã hoàn tác vé ${formatTicket(latestDraw.ticket, digits)} về trạng thái chờ xác nhận.`,
      });
      await refreshState();
    } catch {
      setNotice({ type: 'error', text: 'Lỗi kết nối khi hoàn tác vắng mặt.' });
    } finally {
      submittingRef.current = null;
      setSubmittingAction(null);
      beginCooldown();
    }
  }, [isPreview, event?.id, currentDraw, latestDraw, digits, refreshState, beginCooldown]);

  const handleVoidLast = React.useCallback(async () => {
    if (
      isPreview ||
      !event?.id ||
      submittingRef.current ||
      isAnimatingRef.current ||
      Date.now() < cooldownUntilRef.current ||
      !latestDraw ||
      (latestDraw.status !== 'revealing' && latestDraw.status !== 'won')
    ) {
      return;
    }

    if (
      latestDraw.status === 'won' &&
      !window.confirm(
        `Xác nhận HỦY kết quả vé ${formatTicket(latestDraw.ticket, digits)} vừa trúng và trả số vé lại rổ?`
      )
    ) {
      return;
    }

    setBetweenPrizes(null);
    submittingRef.current = 'void-last';
    setSubmittingAction('void-last');
    setNotice(null);
    try {
      const res = await fetch('/api/draw/void-last', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ type: 'error', text: json.error || 'Không thể hủy lượt vừa quay.' });
        await refreshState();
        return;
      }
      setNotice({
        type: 'info',
        text: `Đã hủy lượt quay vé ${formatTicket(latestDraw.ticket, digits)} và trả số vé lại rổ quay.`,
      });
      await refreshState();
    } catch {
      setNotice({ type: 'error', text: 'Lỗi kết nối khi hủy lượt vừa quay.' });
    } finally {
      submittingRef.current = null;
      setSubmittingAction(null);
      beginCooldown();
    }
  }, [isPreview, event?.id, latestDraw, digits, refreshState, beginCooldown]);

  // Keyboard shortcuts (Space fast-forwards during animation, arrows/Enter stay locked during animation)
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.repeat) return;

      // Utility hotkeys work regardless of preview/unlock
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        cycleQuality();
        return;
      }
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        toggleShowFps();
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMuted();
        return;
      }

      if (isPreview || !stageUnlocked) return;

      // Pressing Space / Enter / ArrowRight on between-prizes screen advances smoothly to idle stage
      if (betweenPrizes && (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight')) {
        e.preventDefault();
        setBetweenPrizes(null);
        beginCooldown();
        return;
      }

      const blocked = shouldIgnoreStageKeyboardAction({
        key: e.key,
        code: e.code,
        isAnimating: isAnimatingRef.current,
        isSubmitting: submittingRef.current !== null,
        inCooldown: Date.now() < cooldownUntilRef.current,
        repeat: e.repeat,
      });

      if (blocked) {
        if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'Enter') {
          e.preventDefault();
        }
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (isAnimatingRef.current) {
          skipRevealAnimation();
          return;
        }
        if (!currentDraw && !state.isAllPrizesCompleted && activePrize) {
          void handleDrawNext();
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (!currentDraw && !state.isAllPrizesCompleted && activePrize) {
          void handleDrawNext();
        }
      } else if (e.code === 'Enter') {
        if (currentDraw && !isAnimatingRef.current) {
          e.preventDefault();
          void handleConfirmWon();
        }
      } else if (e.key === 'v' || e.key === 'V') {
        if (currentDraw && !isAnimatingRef.current) {
          e.preventDefault();
          void handleMarkAbsent();
        }
      } else if (e.key === 'u' || e.key === 'U') {
        if (!currentDraw && latestDraw?.status === 'absent') {
          e.preventDefault();
          void handleUndoAbsent();
        }
      } else if (e.code === 'Backspace') {
        if (
          !isAnimatingRef.current &&
          latestDraw &&
          (latestDraw.status === 'revealing' || latestDraw.status === 'won')
        ) {
          e.preventDefault();
          void handleVoidLast();
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isPreview,
    stageUnlocked,
    betweenPrizes,
    currentDraw,
    latestDraw,
    activePrize,
    state.isAllPrizesCompleted,
    cycleQuality,
    toggleShowFps,
    toggleFullscreen,
    toggleMuted,
    beginCooldown,
    skipRevealAnimation,
    handleDrawNext,
    handleConfirmWon,
    handleMarkAbsent,
    handleUndoAbsent,
    handleVoidLast,
  ]);

  const wonGroupedByPrize = React.useMemo(() => {
    return state.prizes.map((p) => ({
      prize: p,
      winners: state.wonDraws.filter((d) => d.prize_id === p.id),
    }));
  }, [state.prizes, state.wonDraws]);

  const activeRevealTicketDigits = React.useMemo(() => {
    if (!currentDraw || !event) return [];
    return formatTicket(currentDraw.ticket, event.digits)
      .split('')
      .map((ch) => Number(ch));
  }, [currentDraw, event]);

  const isFinalRevealVisible = Boolean(currentDraw && !isAnimating && revealedDigits >= digits);
  const shouldRender3D = webglSupported && !webglContextLost && quality !== 'low';

  return {
    state,
    isPreview,
    actorEmail,
    stageUnlocked,
    unlockStage,
    revealedDigits,
    isAnimating,
    isFinalRevealVisible,
    activeRevealTicketDigits,
    revealTimelineRef,
    confettiBurstKey,
    betweenPrizes,
    dismissBetweenPrizes,
    submittingAction,
    isInCooldown,
    connectionStatus,
    notice,
    clearNotice: () => setNotice(null),
    isFullscreen,
    toggleFullscreen,
    quality,
    setQuality,
    cycleQuality,
    webglSupported,
    webglContextLost,
    handleWebGLContextLost,
    shouldRender3D,
    showFps,
    toggleShowFps,
    muted,
    toggleMuted,
    refreshState,
    skipRevealAnimation,
    handleDrawNext,
    handleConfirmWon,
    handleMarkAbsent,
    handleUndoAbsent,
    handleVoidLast,
    wonGroupedByPrize,
  };
}

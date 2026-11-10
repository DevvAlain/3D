'use client';

import * as React from 'react';
import {
  formatTicket,
  type DisplayStatePayload,
  type Draw,
  type DrawNextResult,
  type Prize,
} from '@church/shared';
import { resolveDrawNextClientTransition } from '@/lib/display-state';
import { DisplaySoundEngine } from '@/lib/sound-engine';

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

  // Never allow Space / ArrowRight / Enter (or V / U / Backspace) to trigger actions while animation runs
  const isDrawOrConfirmKey =
    code === 'Space' ||
    code === 'ArrowRight' ||
    code === 'Enter' ||
    key === 'v' ||
    key === 'V' ||
    key === 'u' ||
    key === 'U' ||
    code === 'Backspace';

  if (isDrawOrConfirmKey && isAnimating) {
    return true;
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

export interface DisplayController {
  state: DisplayStatePayload;
  isPreview: boolean;
  actorEmail: string;
  stageUnlocked: boolean;
  unlockStage: () => void;
  revealedDigits: number;
  isAnimating: boolean;
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
  refreshState: () => Promise<void>;
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

  const [state, setState] = React.useState<DisplayStatePayload>(initialState);
  const [stageUnlocked, setStageUnlocked] = React.useState<boolean>(isPreview);
  const [revealedDigits, setRevealedDigits] = React.useState<number>(() =>
    initialState.currentDraw && initialState.event ? initialState.event.digits : 0
  );
  const [isAnimating, setIsAnimating] = React.useState<boolean>(false);
  const [submittingAction, setSubmittingAction] = React.useState<string | null>(null);
  const [isInCooldown, setIsInCooldown] = React.useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = React.useState<'online' | 'syncing' | 'offline'>(
    'online'
  );
  const [notice, setNotice] = React.useState<DisplayNotice | null>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const [quality, setQualityState] = React.useState<DisplayQualityPreset>('high');
  const [webglSupported, setWebglSupported] = React.useState<boolean>(true);
  const [webglContextLost, setWebglContextLost] = React.useState<boolean>(false);
  const [showFps, setShowFps] = React.useState<boolean>(false);
  const [muted, setMuted] = React.useState<boolean>(false);

  const pendingDrawKeyRef = React.useRef<string | null>(null);
  const animationTimerRef = React.useRef<number | null>(null);
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
      engine.dispose();
      soundEngineRef.current = null;
      if (animationTimerRef.current !== null) window.clearInterval(animationTimerRef.current);
      if (cooldownTimerRef.current !== null) window.clearTimeout(cooldownTimerRef.current);
    };
  }, []);

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

  const stopRevealAnimation = React.useCallback((totalDigits: number) => {
    if (animationTimerRef.current !== null) {
      window.clearInterval(animationTimerRef.current);
      animationTimerRef.current = null;
    }
    isAnimatingRef.current = false;
    setRevealedDigits(totalDigits);
    setIsAnimating(false);
  }, []);

  const skipRevealAnimation = React.useCallback(() => {
    stopRevealAnimation(digits);
  }, [stopRevealAnimation, digits]);

  const startRevealAnimation = React.useCallback((totalDigits: number) => {
    if (animationTimerRef.current !== null) {
      window.clearInterval(animationTimerRef.current);
      animationTimerRef.current = null;
    }
    isAnimatingRef.current = true;
    setRevealedDigits(0);
    setIsAnimating(true);

    let step = 0;
    animationTimerRef.current = window.setInterval(() => {
      step += 1;
      setRevealedDigits(step);
      if (step >= totalDigits) {
        if (animationTimerRef.current !== null) {
          window.clearInterval(animationTimerRef.current);
          animationTimerRef.current = null;
        }
        isAnimatingRef.current = false;
        setIsAnimating(false);
      }
    }, 450);
  }, []);

  // Poll /api/display/state every 4s (ZERO Supabase Realtime on /display)
  const refreshState = React.useCallback(async () => {
    try {
      setConnectionStatus((prev) => (prev === 'offline' ? 'offline' : 'syncing'));
      const url = isPreview ? '/api/display/state?preview=1' : '/api/display/state';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        setConnectionStatus('offline');
        return;
      }
      const nextState = (await res.json()) as DisplayStatePayload;
      setState(nextState);
      setConnectionStatus('online');

      if (nextState.currentDraw && nextState.event && !isAnimatingRef.current) {
        setRevealedDigits(nextState.event.digits);
      } else if (!nextState.currentDraw) {
        if (animationTimerRef.current !== null) {
          window.clearInterval(animationTimerRef.current);
          animationTimerRef.current = null;
        }
        isAnimatingRef.current = false;
        setIsAnimating(false);
        setRevealedDigits(0);
      }
    } catch {
      setConnectionStatus('offline');
    }
  }, [isPreview]);

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

    // Allocate ONE idempotency key per logical click and reuse across retries
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

      // Server confirmed — discard click key so next round generates a fresh key
      pendingDrawKeyRef.current = null;

      if (transition.shouldRestoreOnly) {
        if (transition.noticeMessage) {
          setNotice({ type: 'info', text: transition.noticeMessage });
        }
        await refreshState();
        return;
      }

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
      soundEngineRef.current?.playSpinStart();
      startRevealAnimation(digits);
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
      setNotice({
        type: 'success',
        text: `Chúc mừng vé ${formatTicket(currentDraw.ticket, digits)} đã trúng ${currentDraw.prize?.name ?? 'giải thưởng'}!`,
      });
      await refreshState();
    } catch {
      setNotice({ type: 'error', text: 'Lỗi kết nối khi xác nhận trúng thưởng.' });
    } finally {
      submittingRef.current = null;
      setSubmittingAction(null);
      beginCooldown();
    }
  }, [isPreview, currentDraw, digits, refreshState, beginCooldown]);

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

  // Keyboard shortcuts (ignore Space / ArrowRight / Enter during animation + cooldown guard)
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

      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault();
        if (!currentDraw && !state.isAllPrizesCompleted && activePrize) {
          void handleDrawNext();
        }
      } else if (e.code === 'Enter') {
        if (currentDraw) {
          e.preventDefault();
          void handleConfirmWon();
        }
      } else if (e.key === 'v' || e.key === 'V') {
        if (currentDraw) {
          e.preventDefault();
          void handleMarkAbsent();
        }
      } else if (e.key === 'u' || e.key === 'U') {
        if (!currentDraw && latestDraw?.status === 'absent') {
          e.preventDefault();
          void handleUndoAbsent();
        }
      } else if (e.code === 'Backspace') {
        if (latestDraw && (latestDraw.status === 'revealing' || latestDraw.status === 'won')) {
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
    currentDraw,
    latestDraw,
    activePrize,
    state.isAllPrizesCompleted,
    cycleQuality,
    toggleShowFps,
    toggleFullscreen,
    toggleMuted,
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

  const shouldRender3D = webglSupported && !webglContextLost && quality !== 'low';

  return {
    state,
    isPreview,
    actorEmail,
    stageUnlocked,
    unlockStage,
    revealedDigits,
    isAnimating,
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

'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FastForward,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Undo2,
  UserX,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import {
  formatTicket,
  type DisplayStatePayload,
  type Draw,
  type DrawNextResult,
  type Prize,
} from '@church/shared';
import { resolveDrawNextClientTransition } from '@/lib/display-state';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface DisplayStage2DProps {
  initialState: DisplayStatePayload;
  isPreview: boolean;
  actorEmail: string;
}

export function DisplayStage2D({ initialState, isPreview, actorEmail }: DisplayStage2DProps) {
  const [state, setState] = React.useState<DisplayStatePayload>(initialState);
  const [stageUnlocked, setStageUnlocked] = React.useState<boolean>(isPreview);
  const [revealedDigits, setRevealedDigits] = React.useState<number>(() =>
    initialState.currentDraw && initialState.event ? initialState.event.digits : 0
  );
  const [isAnimating, setIsAnimating] = React.useState<boolean>(false);
  const [submittingAction, setSubmittingAction] = React.useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = React.useState<'online' | 'syncing' | 'offline'>(
    'online'
  );
  const [notice, setNotice] = React.useState<{ type: 'info' | 'error' | 'success'; text: string } | null>(
    null
  );
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const pendingDrawKeyRef = React.useRef<string | null>(null);
  const animationTimerRef = React.useRef<number | null>(null);
  const isAnimatingRef = React.useRef<boolean>(false);

  const event = state.event;
  const digits = event?.digits ?? 5;
  const currentDraw = state.currentDraw;
  const latestDraw = state.latestDraw;
  const activePrize = state.activePrize;

  const stopRevealAnimation = React.useCallback((totalDigits: number) => {
    if (animationTimerRef.current !== null) {
      window.clearInterval(animationTimerRef.current);
      animationTimerRef.current = null;
    }
    isAnimatingRef.current = false;
    setRevealedDigits(totalDigits);
    setIsAnimating(false);
  }, []);

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

  React.useEffect(() => {
    return () => {
      if (animationTimerRef.current !== null) {
        window.clearInterval(animationTimerRef.current);
      }
    };
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

      // Sync revealed digit count if server has a revealing draw and we're not actively rolling it
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
      // Fullscreen may be blocked by browser policy
    }
  }, []);

  const handleDrawNext = React.useCallback(async () => {
    if (isPreview || !event?.id || submittingAction || currentDraw || state.isAllPrizesCompleted) {
      return;
    }

    if (!pendingDrawKeyRef.current) {
      pendingDrawKeyRef.current = crypto.randomUUID();
    }
    const idempotencyKey = pendingDrawKeyRef.current;

    setSubmittingAction('next');
    setNotice(null);

    try {
      const res = await fetch('/api/draw/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: event.id,
          idempotency_key: idempotencyKey,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (res.status < 500) {
          pendingDrawKeyRef.current = null;
        }
        setNotice({ type: 'error', text: json.error || 'Không thể quay lượt tiếp theo.' });
        await refreshState();
        return;
      }

      const result = json as DrawNextResult;
      const transition = resolveDrawNextClientTransition(result);

      // Key succeeded on server — generate a fresh key on the next click
      pendingDrawKeyRef.current = null;

      if (transition.shouldRestoreOnly) {
        if (transition.noticeMessage) {
          setNotice({ type: 'info', text: transition.noticeMessage });
        }
        await refreshState();
        return;
      }

      // Immediately update local snapshot to show revealing draw + run sequential 2D reveal
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
      startRevealAnimation(digits);
    } catch {
      setConnectionStatus('offline');
      setNotice({
        type: 'error',
        text: 'Mất kết nối máy chủ khi quay số. Bấm Quay lại để đồng bộ an toàn cùng mã lượt vừa gửi.',
      });
    } finally {
      setSubmittingAction(null);
    }
  }, [
    isPreview,
    event?.id,
    submittingAction,
    currentDraw,
    state.isAllPrizesCompleted,
    digits,
    startRevealAnimation,
    refreshState,
  ]);

  const handleConfirmWon = React.useCallback(async () => {
    if (isPreview || !currentDraw?.id || submittingAction || isAnimating) return;
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
      setSubmittingAction(null);
    }
  }, [isPreview, currentDraw, submittingAction, isAnimating, digits, refreshState]);

  const handleMarkAbsent = React.useCallback(async () => {
    if (isPreview || !currentDraw?.id || submittingAction || isAnimating) return;
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
      setSubmittingAction(null);
    }
  }, [isPreview, currentDraw, submittingAction, isAnimating, digits, refreshState]);

  const handleUndoAbsent = React.useCallback(async () => {
    if (
      isPreview ||
      !event?.id ||
      submittingAction ||
      currentDraw ||
      latestDraw?.status !== 'absent'
    ) {
      return;
    }
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
      setSubmittingAction(null);
    }
  }, [isPreview, event?.id, submittingAction, currentDraw, latestDraw, digits, refreshState]);

  const handleVoidLast = React.useCallback(async () => {
    if (
      isPreview ||
      !event?.id ||
      submittingAction ||
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
      setSubmittingAction(null);
    }
  }, [isPreview, event?.id, submittingAction, latestDraw, digits, refreshState]);

  // Keyboard shortcuts on stage (disabled in preview or before unlock)
  React.useEffect(() => {
    if (isPreview || !stageUnlocked) return;

    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault();
        if (currentDraw && isAnimating) {
          stopRevealAnimation(digits);
        } else if (!currentDraw && !state.isAllPrizesCompleted) {
          void handleDrawNext();
        }
      } else if (e.code === 'Enter') {
        if (currentDraw && !isAnimating) {
          e.preventDefault();
          void handleConfirmWon();
        }
      } else if (e.key === 'v' || e.key === 'V') {
        if (currentDraw && !isAnimating) {
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
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        void toggleFullscreen();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isPreview,
    stageUnlocked,
    currentDraw,
    latestDraw,
    isAnimating,
    digits,
    state.isAllPrizesCompleted,
    stopRevealAnimation,
    handleDrawNext,
    handleConfirmWon,
    handleMarkAbsent,
    handleUndoAbsent,
    handleVoidLast,
    toggleFullscreen,
  ]);

  // Group won draws by prize for Final Summary / History panel
  const wonGroupedByPrize = React.useMemo(() => {
    return state.prizes.map((p) => ({
      prize: p,
      winners: state.wonDraws.filter((d) => d.prize_id === p.id),
    }));
  }, [state.prizes, state.wonDraws]);

  // Ticket display characters
  const formattedTicket = currentDraw ? formatTicket(currentDraw.ticket, digits) : ''.padStart(digits, '•');
  const digitChars = formattedTicket.split('');

  const themeAccent = event?.primary_color || '#F5C451';

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden bg-parish-navy text-parish-cream"
      style={{
        backgroundImage: `radial-gradient(circle at 50% 15%, ${themeAccent}22, transparent 58%), radial-gradient(circle at 85% 85%, rgba(142,27,46,0.22), transparent 55%)`,
      }}
    >
      {/* Fixed Prominent TEST MODE Banner */}
      {event?.test_mode ? (
        <div
          data-testid="test-mode-banner"
          className="z-40 flex items-center justify-center gap-3 border-b-2 border-red-300 bg-red-600 px-4 py-2 text-center text-sm font-extrabold tracking-widest text-white shadow-lg sm:text-base"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 animate-pulse" />
          <span>CHẾ ĐỘ THỬ (TEST MODE) — KẾT QUẢ KHÔNG LƯU CHÍNH THỨC</span>
          <AlertTriangle className="h-5 w-5 shrink-0 animate-pulse" />
        </div>
      ) : null}

      {/* Read-only Admin Preview Banner */}
      {isPreview ? (
        <div className="z-30 flex items-center justify-center gap-2 border-b border-amber-300/40 bg-amber-500/20 px-4 py-1.5 text-xs font-semibold text-amber-100">
          <Eye className="h-4 w-4" />
          <span>CHẾ ĐỘ XEM TRƯỚC CHỈ ĐỌC (ADMIN PREVIEW) — KHÔNG THỂ BẤM QUAY SỐ</span>
        </div>
      ) : null}

      {/* Header bar */}
      <header className="z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/25 px-4 py-3 backdrop-blur-md sm:px-8">
        <div className="flex items-center gap-3">
          {event?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.logo_url}
              alt="Logo giáo xứ"
              className="h-11 w-11 rounded-xl border border-parish-gold/40 bg-parish-navy/80 object-contain p-1"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-parish-gold/40 bg-parish-gold/10 text-parish-gold">
              <Sparkles className="h-5 w-5" />
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-parish-gold">
              {event?.parish_name ?? 'Chưa có sự kiện kích hoạt'}
            </p>
            <h1 className="font-title text-xl font-bold text-parish-goldLight sm:text-2xl">
              {event?.title ?? 'Màn Hình Quay Số Sân Khấu'}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Connection status badge */}
          <div
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs"
            title={`Tài khoản: ${actorEmail}`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                connectionStatus === 'online'
                  ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                  : connectionStatus === 'syncing'
                    ? 'bg-amber-400'
                    : 'bg-red-500 animate-ping'
              }`}
            />
            {connectionStatus === 'offline' ? (
              <span className="flex items-center gap-1 text-red-300">
                <WifiOff className="h-3.5 w-3.5" /> Mất kết nối
              </span>
            ) : (
              <span className="flex items-center gap-1 text-parish-cream/80">
                <Wifi className="h-3.5 w-3.5 text-emerald-400" /> Sẵn sàng
              </span>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            title="Chế độ toàn màn hình (Phím F)"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          <SignOutButton label="Thoát" />
        </div>
      </header>

      {/* Non-blocking error/offline alert */}
      {connectionStatus === 'offline' || notice ? (
        <div className="z-20 mx-auto mt-3 w-full max-w-4xl px-4">
          <div
            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-lg ${
              connectionStatus === 'offline' || notice?.type === 'error'
                ? 'border-red-400/50 bg-red-950/75 text-red-100'
                : notice?.type === 'success'
                  ? 'border-emerald-400/50 bg-emerald-950/70 text-emerald-100'
                  : 'border-parish-gold/40 bg-parish-night/90 text-parish-goldLight'
            }`}
          >
            <span>
              {connectionStatus === 'offline'
                ? 'Đang mất kết nối tạm thời với máy chủ — hệ thống giữ nguyên trạng thái và đang thử đồng bộ lại...'
                : notice?.text}
            </span>
            {notice ? (
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="text-xs underline opacity-80 hover:opacity-100"
              >
                Đóng
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Main 16:9 Stage Area */}
      {!event ? (
        <main className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="max-w-xl rounded-3xl border border-parish-gold/30 bg-parish-night/75 p-10 shadow-2xl">
            <h2 className="font-title text-3xl font-bold text-parish-goldLight">
              Chưa có sự kiện nào đang kích hoạt
            </h2>
            <p className="mt-3 text-base text-parish-cream/75">
              Vui lòng nhờ Quản trị viên (Admin) vào bảng điều khiển để bật &ldquo;Kích hoạt hiển thị trên Display&rdquo; cho sự kiện hôm nay.
            </p>
            <Button className="mt-6" variant="secondary" onClick={() => void refreshState()}>
              <RotateCcw className="h-4 w-4" /> Kiểm tra lại ngay
            </Button>
          </div>
        </main>
      ) : (
        <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 p-4 sm:p-8 lg:grid-cols-12">
          {/* Center Stage (Digits & Active Prize) */}
          <section className="flex flex-col justify-between rounded-3xl border border-parish-gold/30 bg-parish-night/70 p-6 shadow-2xl backdrop-blur-md lg:col-span-8 sm:p-8">
            {state.isAllPrizesCompleted && !currentDraw ? (
              <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 border-parish-gold bg-parish-gold/15 text-parish-gold shadow-[0_0_40px_rgba(245,196,81,0.3)]">
                  <Trophy className="h-10 w-10" />
                </div>
                <h2 className="font-title text-3xl font-bold text-parish-goldLight sm:text-4xl">
                  Chương Trình Quay Số Đã Hoàn Tất!
                </h2>
                <p className="mt-2 max-w-xl text-base text-parish-cream/80">
                  Xin chúc mừng toàn thể quý vị có vé trúng thưởng trong ngày hội hôm nay. Tổng cộng{' '}
                  <strong>{state.wonDraws.length}</strong> giải thưởng đã được trao.
                </p>

                <div className="mt-8 grid w-full gap-4 text-left sm:grid-cols-2">
                  {wonGroupedByPrize.map(({ prize, winners }) => (
                    <div
                      key={prize.id}
                      className="rounded-2xl border border-parish-gold/25 bg-parish-navy/70 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-bold text-parish-gold">{prize.name}</h3>
                        <Badge variant="success">
                          {winners.length}/{prize.quantity}
                        </Badge>
                      </div>
                      <p className="text-xs text-parish-cream/70">{prize.reward}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {winners.map((w) => (
                          <span
                            key={w.id}
                            className="rounded-lg border border-parish-gold/40 bg-parish-gold/15 px-3 py-1 font-mono text-base font-bold text-parish-goldLight"
                          >
                            {formatTicket(w.ticket, digits)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Current Prize Header */}
                <div className="text-center">
                  <Badge variant="default" className="px-4 py-1 text-sm">
                    {currentDraw
                      ? `Lượt quay #${currentDraw.seq} • Đang mở thưởng`
                      : activePrize
                        ? `Giải kế tiếp (${activePrize.won_count}/${activePrize.quantity} đã trao)`
                        : 'Sẵn sàng'}
                  </Badge>

                  <h2 className="mt-3 font-title text-3xl font-extrabold tracking-tight text-parish-goldLight sm:text-5xl">
                    {currentDraw?.prize?.name ?? activePrize?.name ?? 'Đang chuẩn bị giải thưởng'}
                  </h2>
                  <p className="mt-2 text-lg text-parish-cream/85 sm:text-xl">
                    {currentDraw?.prize?.reward ?? activePrize?.reward ?? ''}
                  </p>
                </div>

                {/* 2D Ballot Slots (Phase 3 will replace with 3D R3F Glass Cage Canvas) */}
                <div className="my-8 flex flex-col items-center justify-center">
                  <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5">
                    {digitChars.map((ch, idx) => {
                      const isShown = currentDraw ? idx < revealedDigits : false;
                      return (
                        <div
                          key={idx}
                          className={`flex h-24 w-16 items-center justify-center rounded-2xl border-2 font-mono text-5xl font-black shadow-2xl transition-all duration-300 sm:h-32 sm:w-24 sm:text-6xl ${
                            isShown
                              ? 'scale-105 border-parish-gold bg-gradient-to-b from-parish-goldLight via-parish-gold to-amber-500 text-parish-navy shadow-[0_0_35px_rgba(245,196,81,0.55)]'
                              : currentDraw
                                ? 'animate-pulse border-parish-gold/50 bg-parish-navy/90 text-parish-gold/40'
                                : 'border-parish-gold/25 bg-parish-navy/70 text-parish-cream/25'
                          }`}
                        >
                          {isShown ? ch : currentDraw ? '?' : '•'}
                        </div>
                      );
                    })}
                  </div>

                  <p className="mt-5 text-sm text-parish-cream/70">
                    {currentDraw
                      ? isAnimating
                        ? 'Đang lần lượt mở từng lồng cầu chữ số...'
                        : 'Số vé trúng thưởng đã hiển thị đầy đủ — mời Presenter xác nhận kết quả'
                      : `Còn ${state.validTicketsRemaining.toLocaleString('vi-VN')} / ${state.totalPoolSize.toLocaleString('vi-VN')} vé hợp lệ trong rổ quay`}
                  </p>
                </div>

                {/* Presenter Action Bar */}
                {!isPreview ? (
                  <div className="space-y-3 border-t border-white/10 pt-5">
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {!currentDraw ? (
                        <>
                          <Button
                            size="lg"
                            disabled={
                              Boolean(submittingAction) ||
                              !activePrize ||
                              state.validTicketsRemaining === 0
                            }
                            onClick={() => void handleDrawNext()}
                            className="min-w-[230px] text-base shadow-[0_0_25px_rgba(245,196,81,0.35)]"
                          >
                            <Play className="h-5 w-5" />
                            {submittingAction === 'next' ? 'Đang bốc số...' : 'Quay số (Space)'}
                          </Button>

                          {latestDraw?.status === 'absent' ? (
                            <Button
                              variant="outline"
                              size="lg"
                              disabled={Boolean(submittingAction)}
                              onClick={() => void handleUndoAbsent()}
                            >
                              <Undo2 className="h-4 w-4" />
                              Hoàn tác vắng mặt ({formatTicket(latestDraw.ticket, digits)}) [U]
                            </Button>
                          ) : null}

                          {latestDraw?.status === 'won' ? (
                            <Button
                              variant="destructive"
                              size="lg"
                              disabled={Boolean(submittingAction)}
                              onClick={() => void handleVoidLast()}
                            >
                              <XCircle className="h-4 w-4" />
                              Hủy lượt vừa trúng ({formatTicket(latestDraw.ticket, digits)})
                            </Button>
                          ) : null}
                        </>
                      ) : isAnimating ? (
                        <Button
                          size="lg"
                          variant="secondary"
                          onClick={() => stopRevealAnimation(digits)}
                        >
                          <FastForward className="h-5 w-5" />
                          Hiển thị ngay toàn bộ số (Space)
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="success"
                            size="lg"
                            disabled={Boolean(submittingAction)}
                            onClick={() => void handleConfirmWon()}
                          >
                            <CheckCircle2 className="h-5 w-5" />
                            {submittingAction === 'confirm'
                              ? 'Đang xác nhận...'
                              : 'Xác nhận trúng thưởng (Enter)'}
                          </Button>

                          <Button
                            variant="secondary"
                            size="lg"
                            disabled={Boolean(submittingAction)}
                            onClick={() => void handleMarkAbsent()}
                          >
                            <UserX className="h-5 w-5" />
                            Vắng mặt (V)
                          </Button>

                          <Button
                            variant="destructive"
                            size="lg"
                            disabled={Boolean(submittingAction)}
                            onClick={() => void handleVoidLast()}
                          >
                            <XCircle className="h-5 w-5" />
                            Hủy lượt quay (Backspace)
                          </Button>
                        </>
                      )}
                    </div>

                    <p className="text-center text-[11px] text-parish-cream/55">
                      Phím tắt: <strong>Space / →</strong> Quay hoặc Mở nhanh •{' '}
                      <strong>Enter</strong> Xác nhận trúng • <strong>V</strong> Vắng mặt •{' '}
                      <strong>U</strong> Hoàn tác vắng • <strong>Backspace</strong> Hủy lượt cuối •{' '}
                      <strong>F</strong> Toàn màn hình
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </section>

          {/* Right Sidebar: Prize Ladder + Recent Winners */}
          <aside className="flex flex-col gap-5 lg:col-span-4">
            <div className="rounded-3xl border border-parish-gold/25 bg-parish-night/70 p-5 shadow-xl backdrop-blur-md">
              <h3 className="font-title text-lg font-bold text-parish-goldLight">
                Tiến Độ Cơ Cấu Giải
              </h3>
              <div className="mt-3 space-y-2.5">
                {state.prizes.length === 0 ? (
                  <p className="text-xs text-parish-cream/60">Chưa thiết lập giải thưởng.</p>
                ) : (
                  state.prizes.map((p) => {
                    const isActive = (currentDraw?.prize_id ?? activePrize?.id) === p.id;
                    const done = p.won_count >= p.quantity;
                    return (
                      <div
                        key={p.id}
                        className={`rounded-xl border px-3.5 py-2.5 transition-colors ${
                          isActive
                            ? 'border-parish-gold bg-parish-gold/15'
                            : 'border-white/10 bg-parish-navy/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-parish-cream">{p.name}</span>
                          <Badge variant={done ? 'success' : isActive ? 'default' : 'muted'}>
                            {p.won_count}/{p.quantity}
                          </Badge>
                        </div>
                        <p className="text-xs text-parish-cream/65">{p.reward}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex-1 rounded-3xl border border-parish-gold/25 bg-parish-night/70 p-5 shadow-xl backdrop-blur-md">
              <h3 className="font-title text-lg font-bold text-parish-goldLight">
                Vé Trúng Gần Đây ({state.wonDraws.length})
              </h3>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {state.wonDraws.length === 0 ? (
                  <p className="text-xs text-parish-cream/60">Chưa có vé nào được xác nhận trúng.</p>
                ) : (
                  state.wonDraws.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-parish-navy/60 px-3.5 py-2"
                    >
                      <div>
                        <p className="text-xs font-semibold text-parish-cream">
                          {w.prize_name ?? 'Giải thưởng'}
                        </p>
                        <p className="text-[11px] text-parish-cream/60">Lượt #{w.seq}</p>
                      </div>
                      <span className="rounded-lg bg-parish-gold/15 px-3 py-1 font-mono text-lg font-bold text-parish-goldLight">
                        {formatTicket(w.ticket, digits)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </main>
      )}

      {/* Presenter Audio/Stage Unlock Gate */}
      {!stageUnlocked && !isPreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-parish-navy/95 p-6 backdrop-blur-lg">
          <div className="max-w-md rounded-3xl border border-parish-gold/40 bg-parish-night p-8 text-center shadow-2xl">
            {event?.test_mode ? (
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-red-400 bg-red-600/30 px-4 py-1 text-xs font-bold text-red-100">
                <AlertTriangle className="h-4 w-4" /> ĐANG Ở CHẾ ĐỘ THỬ (TEST MODE)
              </div>
            ) : null}
            <h2 className="font-title text-3xl font-bold text-parish-goldLight">
              Sân Khấu Quay Số Sẵn Sàng
            </h2>
            <p className="mt-3 text-sm text-parish-cream/80">
              Nhấn nút bên dưới để kích hoạt bàn điều khiển trình chiếu (và mở khóa âm thanh trình duyệt cho các hiệu ứng sân khấu).
            </p>
            <Button
              size="lg"
              className="mt-6 w-full text-base"
              onClick={() => setStageUnlocked(true)}
            >
              <Play className="h-5 w-5" />
              Bấm để bắt đầu
            </Button>
            <div className="mt-4">
              <SignOutButton variant="ghost" label="Đổi tài khoản khác" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

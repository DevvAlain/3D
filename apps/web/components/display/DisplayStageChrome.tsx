'use client';

import * as React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  FastForward,
  Maximize2,
  Minimize2,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Undo2,
  UserX,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { formatTicket } from '@church/shared';
import type {
  DisplayController,
  DisplayQualityPreset,
} from '@/hooks/useDisplayController';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const QUALITY_LABELS: Record<DisplayQualityPreset, string> = {
  high: 'Cao (3D)',
  medium: 'Trung bình (3D)',
  low: 'Thấp (2D)',
};

interface DisplayStageChromeProps {
  controller: DisplayController;
  variant: '2d' | '3d';
  fpsValue?: number | null;
  /** Optional stage-specific visual body (2D cards rendered inside Chrome; 3D canvas fills backdrop). */
  children?: React.ReactNode;
}

export function DisplayStageChrome({
  controller,
  variant,
  fpsValue,
  children,
}: DisplayStageChromeProps) {
  const {
    state,
    isPreview,
    actorEmail,
    stageUnlocked,
    unlockStage,
    revealedDigits,
    isAnimating,
    isFinalRevealVisible,
    betweenPrizes,
    dismissBetweenPrizes,
    submittingAction,
    isInCooldown,
    connectionStatus,
    notice,
    clearNotice,
    isFullscreen,
    toggleFullscreen,
    quality,
    cycleQuality,
    webglSupported,
    webglContextLost,
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
  } = controller;

  const event = state.event;
  const digits = event?.digits ?? 5;
  const currentDraw = state.currentDraw;
  const latestDraw = state.latestDraw;
  const activePrize = state.activePrize;
  const themeAccent = event?.primary_color || '#F5C451';
  const controlsBusy = Boolean(submittingAction) || isInCooldown;
  const canShowCelebrationCallout = Boolean(
    isFinalRevealVisible && !isAnimating && currentDraw && revealedDigits >= digits
  );

  // Auto-hide compact bottom control bar on mouse idle (keyboard shortcuts stay active 100% of the time)
  const [dockVisible, setDockVisible] = React.useState(true);
  const [dockHovered, setDockHovered] = React.useState(false);
  const [creditsPaused, setCreditsPaused] = React.useState(false);
  const hideDockTimerRef = React.useRef<number | null>(null);

  const scheduleDockHide = React.useCallback(() => {
    if (hideDockTimerRef.current !== null) {
      window.clearTimeout(hideDockTimerRef.current);
    }
    hideDockTimerRef.current = window.setTimeout(() => {
      setDockVisible(false);
    }, 2800);
  }, []);

  React.useEffect(() => {
    if (variant !== '3d' || isPreview || !stageUnlocked) return;

    const wakeDock = () => {
      setDockVisible(true);
      if (!dockHovered && !submittingAction) {
        scheduleDockHide();
      }
    };

    wakeDock();
    window.addEventListener('mousemove', wakeDock, { passive: true });
    window.addEventListener('pointerdown', wakeDock, { passive: true });
    window.addEventListener('touchstart', wakeDock, { passive: true });

    return () => {
      window.removeEventListener('mousemove', wakeDock);
      window.removeEventListener('pointerdown', wakeDock);
      window.removeEventListener('touchstart', wakeDock);
      if (hideDockTimerRef.current !== null) {
        window.clearTimeout(hideDockTimerRef.current);
      }
    };
  }, [variant, isPreview, stageUnlocked, dockHovered, submittingAction, scheduleDockHide]);

  const effectiveDockVisible = dockVisible || dockHovered || Boolean(submittingAction);
  const creditsDurationSec = Math.max(20, wonGroupedByPrize.length * 7);

  const fallbackReason = !webglSupported
    ? 'Thiết bị không hỗ trợ WebGL — đang chạy chế độ 2D an toàn'
    : webglContextLost
      ? 'WebGL mất ngữ cảnh — đang chạy chế độ 2D an toàn'
      : null;

  return (
    <div
      className={
        variant === '3d'
          ? 'pointer-events-none fixed inset-0 z-10 flex flex-col justify-between text-parish-cream'
          : 'relative flex min-h-screen flex-col overflow-hidden bg-parish-navy text-parish-cream'
      }
      style={
        variant === '2d'
          ? {
              backgroundImage: `radial-gradient(circle at 50% 15%, ${themeAccent}22, transparent 58%), radial-gradient(circle at 85% 85%, rgba(142,27,46,0.22), transparent 55%)`,
            }
          : undefined
      }
    >
      {/* Fixed Prominent TEST MODE Banner + Preview Banner + Header Bar */}
      <div className="pointer-events-auto">
        {event?.test_mode ? (
          <div
            data-testid="test-mode-banner"
            className="z-40 flex items-center justify-center gap-3 border-b-2 border-red-300 bg-red-600/95 px-4 py-1 text-center text-xs font-extrabold tracking-widest text-white shadow-lg backdrop-blur-sm sm:text-sm"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse" />
            <span>CHẾ ĐỘ THỬ (TEST MODE) — KẾT QUẢ KHÔNG LƯU CHÍNH THỨC</span>
            <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse" />
          </div>
        ) : null}

        {isPreview ? (
          <div className="z-30 flex items-center justify-center gap-2 border-b border-amber-300/40 bg-amber-500/20 px-4 py-1 text-xs font-semibold text-amber-100 backdrop-blur-sm">
            <Eye className="h-3.5 w-3.5" />
            <span>CHẾ ĐỘ XEM TRƯỚC CHỈ ĐỌC (ADMIN PREVIEW) — KHÔNG THỂ BẤM QUAY SỐ</span>
          </div>
        ) : null}

        <header className="z-20 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-parish-navy/60 px-3 py-1.5 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2.5">
            {event?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.logo_url}
                alt="Logo giáo xứ"
                className="h-8 w-8 rounded-lg border border-parish-gold/40 bg-parish-navy/85 object-contain p-0.5 sm:h-9 sm:w-9"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-parish-gold/40 bg-parish-gold/10 text-parish-gold sm:h-9 sm:w-9">
                <Sparkles className="h-4 w-4" />
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-parish-gold">
                {event?.parish_name ?? 'Chưa có sự kiện kích hoạt'}
              </p>
              <h1 className="font-title text-base font-bold leading-tight text-parish-goldLight sm:text-lg">
                {event?.title ?? 'Màn Hình Quay Số Sân Khấu'}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Live FPS Debug Pill (Toggle via D key) */}
            {showFps ? (
              <div
                data-testid="fps-badge"
                className="inline-flex items-center gap-1.5 rounded-full border border-parish-gold/40 bg-black/55 px-2.5 py-0.5 font-mono text-xs text-parish-goldLight"
              >
                <Activity className="h-3.5 w-3.5 text-parish-gold" />
                {variant === '3d' ? `${fpsValue ?? '--'} FPS` : '2D Mode'}
              </div>
            ) : null}

            {/* Quality Preset Toggle (Q key) */}
            <button
              type="button"
              onClick={cycleQuality}
              title={
                fallbackReason
                  ? fallbackReason
                  : 'Đổi chất lượng đồ họa sân khấu (Phím Q): Cao → Trung bình → Thấp (2D)'
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-xs font-medium text-parish-cream/90 transition-colors hover:border-parish-gold/50 hover:text-parish-goldLight"
            >
              <Monitor className="h-3.5 w-3.5 text-parish-gold" />
              <span>{fallbackReason ? '2D Dự phòng' : QUALITY_LABELS[quality]}</span>
            </button>

            {/* Connection Status Dot */}
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-xs"
              title={`Tài khoản: ${actorEmail}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionStatus === 'online'
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : connectionStatus === 'syncing'
                      ? 'bg-amber-400'
                      : 'animate-ping bg-red-500'
                }`}
              />
              {connectionStatus === 'offline' ? (
                <span className="flex items-center gap-1 text-red-300">
                  <WifiOff className="h-3.5 w-3.5" /> Mất kết nối
                </span>
              ) : (
                <span className="hidden items-center gap-1 text-parish-cream/85 sm:flex">
                  <Wifi className="h-3.5 w-3.5 text-emerald-400" /> Sẵn sàng
                </span>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleShowFps}
              title="Bật/tắt chỉ số FPS (Phím D)"
              aria-label="Bật tắt FPS"
            >
              <Activity className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMuted}
              title={muted ? 'Bật âm thanh sân khấu (Phím M)' : 'Tắt âm thanh (Phím M)'}
              aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
            >
              {muted ? <VolumeX className="h-4 w-4 text-red-300" /> : <Volume2 className="h-4 w-4" />}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => void toggleFullscreen()}
              title="Toàn màn hình (Phím F)"
              aria-label="Toàn màn hình"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>

            <SignOutButton label="Thoát" />
          </div>
        </header>

        {/* Alert banner for offline / errors / notices */}
        {connectionStatus === 'offline' || notice || (variant === '2d' && fallbackReason) ? (
          <div className="mx-auto mt-2 w-full max-w-4xl px-4">
            <div
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-1.5 text-xs shadow-lg backdrop-blur-md sm:text-sm ${
                connectionStatus === 'offline' || notice?.type === 'error'
                  ? 'border-red-400/50 bg-red-950/85 text-red-100'
                  : notice?.type === 'success'
                    ? 'border-emerald-400/50 bg-emerald-950/80 text-emerald-100'
                    : 'border-parish-gold/40 bg-parish-night/90 text-parish-goldLight'
              }`}
            >
              <span>
                {connectionStatus === 'offline'
                  ? 'Đang mất kết nối tạm thời với máy chủ — giữ nguyên trạng thái và đang thử đồng bộ lại...'
                  : notice?.text ?? fallbackReason}
              </span>
              {notice ? (
                <button
                  type="button"
                  onClick={clearNotice}
                  className="shrink-0 text-xs underline opacity-80 hover:opacity-100"
                >
                  Đóng
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Main Content Area: Empty State / Completed Credits / Between Prizes / Variant Stage */}
      {!event ? (
        <main className="pointer-events-auto flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="max-w-xl rounded-3xl border border-parish-gold/35 bg-parish-night/85 p-8 shadow-2xl backdrop-blur-md sm:p-10">
            <h2 className="font-title text-3xl font-bold text-parish-goldLight">
              Chưa có sự kiện nào đang kích hoạt
            </h2>
            <p className="mt-3 text-base text-parish-cream/80">
              Vui lòng nhờ Quản trị viên (Admin) vào bảng điều khiển để nhấn &ldquo;Kích hoạt hiển thị trên Display&rdquo; cho sự kiện hôm nay.
            </p>
            <Button className="mt-6" variant="secondary" onClick={() => void refreshState()}>
              <RotateCcw className="h-4 w-4" /> Kiểm tra lại ngay
            </Button>
          </div>
        </main>
      ) : state.isAllPrizesCompleted && !currentDraw ? (
        <main
          data-testid="summary-credits-screen"
          className="pointer-events-auto flex flex-1 flex-col items-center justify-center overflow-hidden p-4 sm:p-6"
        >
          <div className="flex h-full max-h-[84vh] w-full max-w-5xl flex-col rounded-3xl border border-parish-gold/45 bg-parish-night/90 p-5 shadow-2xl backdrop-blur-xl sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-parish-gold/20 pb-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-parish-gold bg-parish-gold/15 text-parish-gold shadow-[0_0_30px_rgba(245,196,81,0.35)]">
                  <Trophy className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-title text-2xl font-bold text-parish-goldLight sm:text-3xl">
                    Chương Trình Quay Số Đã Hoàn Tất!
                  </h2>
                  <p className="text-xs text-parish-cream/80 sm:text-sm">
                    Chúc mừng <strong>{state.wonDraws.length}</strong> vé trúng thưởng — {event.title}.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCreditsPaused((p) => !p)}
                >
                  {creditsPaused ? (
                    <>
                      <Play className="h-3.5 w-3.5" /> Tiếp tục cuộn
                    </>
                  ) : (
                    <>
                      <Pause className="h-3.5 w-3.5" /> Tạm dừng cuộn
                    </>
                  )}
                </Button>

                {!isPreview && latestDraw?.status === 'won' ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={controlsBusy}
                    onClick={() => void handleVoidLast()}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Hủy lượt cuối ({formatTicket(latestDraw.ticket, digits)})
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Credits-Style Slow Vertical Scroll */}
            <div
              className="parish-credits-viewport relative mt-4 flex-1 overflow-hidden"
              style={{
                maskImage:
                  'linear-gradient(to bottom, transparent 0%, black 2%, black 93%, transparent 100%)',
                WebkitMaskImage:
                  'linear-gradient(to bottom, transparent 0%, black 2%, black 93%, transparent 100%)',
              }}
            >
              <div
                className={`parish-credits-track pt-2 ${
                  creditsPaused ? 'parish-credits-paused' : ''
                }`}
                style={
                  {
                    '--credits-duration': `${creditsDurationSec}s`,
                  } as React.CSSProperties
                }
              >
                {[0, 1].map((passIdx) => (
                  <div
                    key={passIdx}
                    aria-hidden={passIdx === 1}
                    className="flex min-h-[60vh] flex-col justify-between pb-12"
                  >
                    <div className="grid gap-4 text-left sm:grid-cols-2">
                      {wonGroupedByPrize.map(({ prize, winners }) => (
                        <div
                          key={`${passIdx}-${prize.id}`}
                          className="rounded-2xl border border-parish-gold/30 bg-parish-navy/80 p-4 shadow-lg"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-title text-lg font-bold text-parish-goldLight">
                              {prize.name}
                            </h3>
                            <Badge variant="success">
                              {winners.length}/{prize.quantity}
                            </Badge>
                          </div>
                          <p className="text-xs text-parish-cream/75">{prize.reward}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {winners.map((w) => (
                              <span
                                key={w.id}
                                className="rounded-lg border border-parish-gold/45 bg-parish-gold/15 px-3 py-1 font-mono text-base font-extrabold tracking-wider text-parish-goldLight shadow-sm"
                              >
                                {formatTicket(w.ticket, digits)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="mt-10 border-t border-parish-gold/20 pt-5 text-center text-xs uppercase tracking-[0.22em] text-parish-goldLight/75">
                      ✦ Xin chân thành cảm ơn Quý Cha, Hội Đồng Mục Vụ &amp; toàn thể Cộng đoàn ✦
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      ) : betweenPrizes && !currentDraw ? (
        <main
          data-testid="between-prizes-screen"
          className="pointer-events-auto flex flex-1 flex-col items-center justify-center p-4 sm:p-6"
        >
          <div className="w-full max-w-3xl rounded-3xl border-2 border-parish-gold/55 bg-parish-night/95 p-6 text-center shadow-[0_0_70px_rgba(245,196,81,0.28)] backdrop-blur-xl sm:p-8">
            <Badge variant="success" className="px-4 py-1 text-xs uppercase tracking-widest">
              Hoàn Thành Hạng Mục Giải
            </Badge>

            <h2 className="mt-3 font-title text-2xl font-extrabold text-parish-goldLight sm:text-4xl">
              Chúc Mừng Các Vé Trúng {betweenPrizes.completedPrize.name}
            </h2>
            <p className="mt-1 text-sm text-parish-cream/80 sm:text-base">
              {betweenPrizes.completedPrize.reward}
            </p>

            {betweenPrizes.winners.length > 0 ? (
              <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                {betweenPrizes.winners.map((w) => (
                  <span
                    key={w.id}
                    className="rounded-xl border border-parish-gold/55 bg-parish-gold/15 px-4 py-2 font-mono text-xl font-black tracking-widest text-parish-goldLight shadow-md"
                  >
                    {formatTicket(w.ticket, digits)}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-6 rounded-2xl border border-parish-gold/30 bg-parish-navy/75 p-4 sm:p-5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-parish-gold">
                Hạng mục giải tiếp theo
              </p>
              <h3 className="mt-1 font-title text-xl font-bold text-white sm:text-2xl">
                {betweenPrizes.nextPrize.name}
              </h3>
              <p className="text-sm text-parish-cream/85">
                {betweenPrizes.nextPrize.reward} • {betweenPrizes.nextPrize.quantity} giải thưởng
              </p>
            </div>

            {!isPreview ? (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button
                  size="lg"
                  onClick={dismissBetweenPrizes}
                  className="min-w-[260px] shadow-[0_0_30px_rgba(245,196,81,0.4)]"
                >
                  Tiếp tục sang {betweenPrizes.nextPrize.name} (Space)
                  <ArrowRight className="h-4 w-4" />
                </Button>

                {latestDraw?.status === 'won' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={controlsBusy}
                    onClick={() => void handleVoidLast()}
                  >
                    <XCircle className="h-4 w-4" />
                    Hủy lượt cuối ({formatTicket(latestDraw.ticket, digits)})
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </main>
      ) : variant === '2d' ? (
        children
      ) : (
        /* 3D Overlay HUD: keeps the stage center and bottom digit slots unobstructed at all times */
        <div className="flex flex-1 flex-col justify-between p-3 sm:px-5 sm:pt-3 sm:pb-0">
          {/* Top HUD Row: Left Active Prize • Center Winner Callout (Final Reveal only) • Right Progress */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            {/* Compact Prize & Pool Card */}
            <div className="pointer-events-auto rounded-2xl border border-parish-gold/30 bg-parish-navy/65 px-4 py-2 shadow-xl backdrop-blur-md">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">
                  {currentDraw
                    ? `Lượt #${currentDraw.seq} • Đang mở thưởng`
                    : activePrize
                      ? `Giải tiếp theo (${activePrize.won_count}/${activePrize.quantity})`
                      : 'Sẵn sàng'}
                </Badge>
                <span className="text-xs text-parish-cream/75">
                  Còn {state.validTicketsRemaining.toLocaleString('vi-VN')} /{' '}
                  {state.totalPoolSize.toLocaleString('vi-VN')} vé
                </span>
              </div>
              <h2 className="mt-1 font-title text-xl font-extrabold text-parish-goldLight sm:text-2xl">
                {currentDraw?.prize?.name ?? activePrize?.name ?? 'Đang chuẩn bị giải thưởng'}
              </h2>
              <p className="text-xs text-parish-cream/85 sm:text-sm">
                {currentDraw?.prize?.reward ?? activePrize?.reward ?? ''}
              </p>
            </div>

            {/* Celebratory Invitation Banner (STRICTLY shown only AFTER last digit lands!) */}
            {canShowCelebrationCallout && currentDraw ? (
              <div
                data-testid="winner-invitation-banner"
                className="pointer-events-auto mx-auto flex items-center gap-2.5 rounded-2xl border-2 border-parish-gold bg-parish-night/90 px-4 py-2 text-center shadow-[0_0_38px_rgba(245,196,81,0.45)] backdrop-blur-md"
              >
                <Sparkles className="h-5 w-5 shrink-0 text-parish-gold animate-pulse" />
                <p className="font-title text-base font-extrabold tracking-wide text-parish-goldLight sm:text-lg">
                  Mời người giữ vé số{' '}
                  <span className="mx-1 rounded-md bg-parish-gold/20 px-2 py-0.5 font-mono text-lg text-white sm:text-xl">
                    {formatTicket(currentDraw.ticket, digits)}
                  </span>{' '}
                  lên nhận thưởng
                </p>
                <Sparkles className="h-5 w-5 shrink-0 text-parish-gold animate-pulse" />
              </div>
            ) : null}

            {/* Compact Right Floating Winners & Ladder Card (1280px+ screens only so 4:3 stays spacious) */}
            <aside className="pointer-events-auto hidden w-64 flex-col gap-2.5 xl:flex">
              <div className="rounded-2xl border border-parish-gold/25 bg-parish-navy/60 p-3 shadow-xl backdrop-blur-md">
                <h3 className="font-title text-xs font-bold uppercase tracking-wider text-parish-goldLight">
                  Tiến Độ Cơ Cấu Giải
                </h3>
                <div className="mt-1.5 max-h-36 space-y-1 overflow-y-auto pr-1">
                  {state.prizes.map((p) => {
                    const isActive = (currentDraw?.prize_id ?? activePrize?.id) === p.id;
                    const done = p.won_count >= p.quantity;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between rounded-lg border px-2 py-1 text-xs ${
                          isActive
                            ? 'border-parish-gold bg-parish-gold/15'
                            : 'border-white/10 bg-black/25'
                        }`}
                      >
                        <span className="truncate font-medium text-parish-cream">{p.name}</span>
                        <Badge variant={done ? 'success' : isActive ? 'default' : 'muted'}>
                          {p.won_count}/{p.quantity}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>

              {state.wonDraws.length > 0 ? (
                <div className="rounded-2xl border border-parish-gold/25 bg-parish-navy/60 p-3 shadow-xl backdrop-blur-md">
                  <h3 className="font-title text-xs font-bold uppercase tracking-wider text-parish-goldLight">
                    Vé Trúng Gần Đây ({state.wonDraws.length})
                  </h3>
                  <div className="mt-1.5 max-h-32 space-y-1 overflow-y-auto pr-1">
                    {state.wonDraws.slice(0, 6).map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-2 py-1"
                      >
                        <span className="truncate text-[11px] text-parish-cream/80">
                          {w.prize_name ?? 'Giải thưởng'}
                        </span>
                        <span className="font-mono text-xs font-bold text-parish-goldLight">
                          {formatTicket(w.ticket, digits)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>

          {/* Flush Compact Auto-Hiding Presenter Control Dock */}
          {!isPreview ? (
            <>
              {/* Invisible bottom hover zone to summon dock cleanly when hidden */}
              <div
                onMouseEnter={() => {
                  setDockVisible(true);
                  scheduleDockHide();
                }}
                className="pointer-events-auto fixed inset-x-0 bottom-0 z-20 h-4"
              />

              {/* Subtle gold indicator tab when hidden */}
              <div
                className={`pointer-events-none fixed bottom-1 left-1/2 z-20 -translate-x-1/2 transition-opacity duration-300 ${
                  effectiveDockVisible ? 'opacity-0' : 'opacity-70'
                }`}
              >
                <div className="h-1 w-14 rounded-full bg-parish-gold/55 shadow-[0_0_8px_rgba(245,196,81,0.5)]" />
              </div>

              <div
                data-testid="presenter-bottom-dock"
                data-visible={effectiveDockVisible ? 'true' : 'false'}
                onMouseEnter={() => setDockHovered(true)}
                onMouseLeave={() => {
                  setDockHovered(false);
                  scheduleDockHide();
                }}
                className={`fixed inset-x-0 bottom-0 z-30 flex justify-center transition-all duration-300 ${
                  effectiveDockVisible
                    ? 'pointer-events-none translate-y-0 opacity-100'
                    : 'pointer-events-none translate-y-full opacity-0'
                }`}
              >
                <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-t-xl border border-b-0 border-parish-gold/35 bg-parish-navy/85 px-3 py-1.5 shadow-[0_-8px_28px_rgba(0,0,0,0.55)] backdrop-blur-md">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {!currentDraw ? (
                      <>
                        <Button
                          size="sm"
                          disabled={
                            controlsBusy || !activePrize || state.validTicketsRemaining === 0
                          }
                          onClick={() => void handleDrawNext()}
                          className="h-8 min-w-[170px] px-3.5 text-xs font-bold shadow-[0_0_20px_rgba(245,196,81,0.3)]"
                        >
                          <Play className="h-3.5 w-3.5" />
                          {submittingAction === 'next' ? 'Đang bốc số...' : 'Quay số (Space)'}
                        </Button>

                        {latestDraw?.status === 'absent' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={controlsBusy}
                            onClick={() => void handleUndoAbsent()}
                            className="h-8 px-2.5 text-xs"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            Hoàn tác ({formatTicket(latestDraw.ticket, digits)}) [U]
                          </Button>
                        ) : null}

                        {latestDraw?.status === 'won' ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={controlsBusy}
                            onClick={() => void handleVoidLast()}
                            className="h-8 px-2.5 text-xs"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Hủy vừa trúng ({formatTicket(latestDraw.ticket, digits)})
                          </Button>
                        ) : null}
                      </>
                    ) : isAnimating ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={skipRevealAnimation}
                        className="h-8 px-4 text-xs font-bold"
                      >
                        <FastForward className="h-3.5 w-3.5" />
                        Mở ngay tất cả số (Space)
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="success"
                          size="sm"
                          disabled={controlsBusy}
                          onClick={() => void handleConfirmWon()}
                          className="h-8 px-3.5 text-xs font-bold"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {submittingAction === 'confirm'
                            ? 'Đang xác nhận...'
                            : 'Xác nhận trúng (Enter)'}
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={controlsBusy}
                          onClick={() => void handleMarkAbsent()}
                          className="h-8 px-3 text-xs font-semibold"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          Vắng mặt (V)
                        </Button>

                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={controlsBusy}
                          onClick={() => void handleVoidLast()}
                          className="h-8 px-3 text-xs font-semibold"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Hủy lượt (Backspace)
                        </Button>
                      </>
                    )}
                  </div>

                  <p className="hidden text-center text-[10px] leading-tight text-parish-cream/60 sm:block">
                    <strong>Space/→</strong> Quay (<strong>Space</strong> mở nhanh) •{' '}
                    <strong>Enter</strong> Trúng • <strong>V</strong> Vắng •{' '}
                    <strong>U</strong> Hoàn tác • <strong>Backspace</strong> Hủy •{' '}
                    <strong>Q</strong> Đồ họa • <strong>D</strong> FPS • <strong>M</strong> Tiếng •{' '}
                    <strong>F</strong> Toàn màn
                  </p>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Opaque Presenter Audio/Stage Unlock Gate (zero reveal flash on F5) */}
      {!stageUnlocked && !isPreview ? (
        <div
          data-testid="stage-unlock-gate"
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-parish-navy p-6"
        >
          <div className="max-w-md rounded-3xl border border-parish-gold/45 bg-parish-night p-8 text-center shadow-2xl">
            {event?.test_mode ? (
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-red-400 bg-red-600/30 px-4 py-1 text-xs font-bold text-red-100">
                <AlertTriangle className="h-4 w-4" /> ĐANG Ở CHẾ ĐỘ THỬ (TEST MODE)
              </div>
            ) : null}
            <h2 className="font-title text-3xl font-bold text-parish-goldLight">
              Sân Khấu Quay Số Sẵn Sàng
            </h2>
            <p className="mt-3 text-sm text-parish-cream/80">
              Nhấn nút bên dưới để kích hoạt bàn điều khiển trình chiếu và mở khóa âm thanh sân khấu.
            </p>
            <Button size="lg" className="mt-6 w-full text-base" onClick={unlockStage}>
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

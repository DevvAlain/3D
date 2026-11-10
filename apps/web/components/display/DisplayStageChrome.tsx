'use client';

import * as React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Eye,
  FastForward,
  Maximize2,
  Minimize2,
  Monitor,
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
    isAnimating,
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
            className="z-40 flex items-center justify-center gap-3 border-b-2 border-red-300 bg-red-600/95 px-4 py-1.5 text-center text-xs font-extrabold tracking-widest text-white shadow-lg backdrop-blur-sm sm:text-sm"
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

        <header className="z-20 flex flex-wrap items-center justify-between gap-2.5 border-b border-white/10 bg-parish-navy/55 px-4 py-2.5 backdrop-blur-md sm:px-7">
          <div className="flex items-center gap-3">
            {event?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.logo_url}
                alt="Logo giáo xứ"
                className="h-10 w-10 rounded-xl border border-parish-gold/40 bg-parish-navy/85 object-contain p-1"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-parish-gold/40 bg-parish-gold/10 text-parish-gold">
                <Sparkles className="h-5 w-5" />
              </div>
            )}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-parish-gold">
                {event?.parish_name ?? 'Chưa có sự kiện kích hoạt'}
              </p>
              <h1 className="font-title text-lg font-bold text-parish-goldLight sm:text-xl">
                {event?.title ?? 'Màn Hình Quay Số Sân Khấu'}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Live FPS Debug Pill (Toggle via D key) */}
            {showFps ? (
              <div
                data-testid="fps-badge"
                className="inline-flex items-center gap-1.5 rounded-full border border-parish-gold/40 bg-black/55 px-2.5 py-1 font-mono text-xs text-parish-goldLight"
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
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs font-medium text-parish-cream/90 transition-colors hover:border-parish-gold/50 hover:text-parish-goldLight"
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
                className={`h-2.5 w-2.5 rounded-full ${
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
          <div className="mx-auto mt-2.5 w-full max-w-4xl px-4">
            <div
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2 text-xs shadow-lg backdrop-blur-md sm:text-sm ${
                connectionStatus === 'offline' || notice?.type === 'error'
                  ? 'border-red-400/50 bg-red-950/80 text-red-100'
                  : notice?.type === 'success'
                    ? 'border-emerald-400/50 bg-emerald-950/75 text-emerald-100'
                    : 'border-parish-gold/40 bg-parish-night/85 text-parish-goldLight'
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

      {/* Main Content Area: Empty State / Completed State / Variant Stage */}
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
        <main className="pointer-events-auto flex flex-1 flex-col items-center justify-center overflow-y-auto p-6 text-center">
          <div className="w-full max-w-4xl rounded-3xl border border-parish-gold/40 bg-parish-night/85 p-6 shadow-2xl backdrop-blur-lg sm:p-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-parish-gold bg-parish-gold/15 text-parish-gold shadow-[0_0_40px_rgba(245,196,81,0.3)]">
              <Trophy className="h-8 w-8" />
            </div>
            <h2 className="font-title text-3xl font-bold text-parish-goldLight sm:text-4xl">
              Chương Trình Quay Số Đã Hoàn Tất!
            </h2>
            <p className="mt-2 text-base text-parish-cream/80">
              Xin chúc mừng toàn thể quý vị có vé trúng thưởng. Tổng cộng{' '}
              <strong>{state.wonDraws.length}</strong> giải thưởng đã được trao.
            </p>

            <div className="mt-6 grid gap-3.5 text-left sm:grid-cols-2">
              {wonGroupedByPrize.map(({ prize, winners }) => (
                <div
                  key={prize.id}
                  className="rounded-2xl border border-parish-gold/25 bg-parish-navy/75 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-parish-gold">{prize.name}</h3>
                    <Badge variant="success">
                      {winners.length}/{prize.quantity}
                    </Badge>
                  </div>
                  <p className="text-xs text-parish-cream/70">{prize.reward}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {winners.map((w) => (
                      <span
                        key={w.id}
                        className="rounded-lg border border-parish-gold/40 bg-parish-gold/15 px-3 py-1 font-mono text-sm font-bold text-parish-goldLight"
                      >
                        {formatTicket(w.ticket, digits)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      ) : variant === '2d' ? (
        children
      ) : (
        /* 3D Overlay HUD: keeps the center/stage crystal clear for the Glass Cage, Rose Window & N Digit Slots */
        <div className="flex flex-1 flex-col justify-between p-4 sm:p-6">
          {/* Top-Center Active Prize Header + Side Progress Cards */}
          <div className="flex flex-col items-start justify-between gap-4 lg:flex-row">
            {/* Compact Prize & Pool Card */}
            <div className="pointer-events-auto rounded-2xl border border-parish-gold/30 bg-parish-navy/65 px-5 py-3 shadow-xl backdrop-blur-md">
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
              <h2 className="mt-1.5 font-title text-2xl font-extrabold text-parish-goldLight sm:text-3xl">
                {currentDraw?.prize?.name ?? activePrize?.name ?? 'Đang chuẩn bị giải thưởng'}
              </h2>
              <p className="text-sm text-parish-cream/85">
                {currentDraw?.prize?.reward ?? activePrize?.reward ?? ''}
              </p>
            </div>

            {/* Compact Right Floating Winners & Ladder Card (desktop) */}
            <aside className="pointer-events-auto hidden w-72 flex-col gap-3 xl:flex">
              <div className="rounded-2xl border border-parish-gold/25 bg-parish-navy/60 p-3.5 shadow-xl backdrop-blur-md">
                <h3 className="font-title text-sm font-bold text-parish-goldLight">
                  Tiến Độ Cơ Cấu Giải
                </h3>
                <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {state.prizes.map((p) => {
                    const isActive = (currentDraw?.prize_id ?? activePrize?.id) === p.id;
                    const done = p.won_count >= p.quantity;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs ${
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
                <div className="rounded-2xl border border-parish-gold/25 bg-parish-navy/60 p-3.5 shadow-xl backdrop-blur-md">
                  <h3 className="font-title text-sm font-bold text-parish-goldLight">
                    Vé Trúng Gần Đây ({state.wonDraws.length})
                  </h3>
                  <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto pr-1">
                    {state.wonDraws.slice(0, 6).map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-2.5 py-1"
                      >
                        <span className="truncate text-[11px] text-parish-cream/80">
                          {w.prize_name ?? 'Giải thưởng'}
                        </span>
                        <span className="font-mono text-sm font-bold text-parish-goldLight">
                          {formatTicket(w.ticket, digits)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>

          {/* Bottom Presenter Control Dock */}
          {!isPreview ? (
            <div className="pointer-events-auto mx-auto w-full max-w-4xl rounded-2xl border border-parish-gold/30 bg-parish-navy/70 px-4 py-3 shadow-2xl backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                {!currentDraw ? (
                  <>
                    <Button
                      size="lg"
                      disabled={
                        controlsBusy || !activePrize || state.validTicketsRemaining === 0
                      }
                      onClick={() => void handleDrawNext()}
                      className="min-w-[220px] shadow-[0_0_25px_rgba(245,196,81,0.35)]"
                    >
                      <Play className="h-5 w-5" />
                      {submittingAction === 'next' ? 'Đang bốc số...' : 'Quay số (Space)'}
                    </Button>

                    {latestDraw?.status === 'absent' ? (
                      <Button
                        variant="outline"
                        size="default"
                        disabled={controlsBusy}
                        onClick={() => void handleUndoAbsent()}
                      >
                        <Undo2 className="h-4 w-4" />
                        Hoàn tác vắng ({formatTicket(latestDraw.ticket, digits)}) [U]
                      </Button>
                    ) : null}

                    {latestDraw?.status === 'won' ? (
                      <Button
                        variant="destructive"
                        size="default"
                        disabled={controlsBusy}
                        onClick={() => void handleVoidLast()}
                      >
                        <XCircle className="h-4 w-4" />
                        Hủy lượt vừa trúng ({formatTicket(latestDraw.ticket, digits)})
                      </Button>
                    ) : null}
                  </>
                ) : isAnimating ? (
                  <Button size="lg" variant="secondary" onClick={skipRevealAnimation}>
                    <FastForward className="h-5 w-5" />
                    Hiển thị ngay toàn bộ số
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="success"
                      size="lg"
                      disabled={controlsBusy}
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
                      disabled={controlsBusy}
                      onClick={() => void handleMarkAbsent()}
                    >
                      <UserX className="h-5 w-5" />
                      Vắng mặt (V)
                    </Button>

                    <Button
                      variant="destructive"
                      size="lg"
                      disabled={controlsBusy}
                      onClick={() => void handleVoidLast()}
                    >
                      <XCircle className="h-5 w-5" />
                      Hủy lượt quay (Backspace)
                    </Button>
                  </>
                )}
              </div>

              <p className="mt-2 text-center text-[11px] text-parish-cream/60">
                Phím tắt: <strong>Space / →</strong> Quay số • <strong>Enter</strong> Xác nhận trúng •{' '}
                <strong>V</strong> Vắng mặt • <strong>U</strong> Hoàn tác vắng •{' '}
                <strong>Backspace</strong> Hủy • <strong>Q</strong> Chất lượng • <strong>D</strong> FPS •{' '}
                <strong>M</strong> Âm thanh • <strong>F</strong> Toàn màn hình
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Presenter Audio/Stage Unlock Gate */}
      {!stageUnlocked && !isPreview ? (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-parish-navy/90 p-6 backdrop-blur-lg">
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

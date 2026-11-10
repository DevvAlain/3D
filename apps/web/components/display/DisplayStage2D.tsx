'use client';

import * as React from 'react';
import {
  CheckCircle2,
  FastForward,
  Gauge,
  Play,
  Undo2,
  UserX,
  XCircle,
} from 'lucide-react';
import { formatTicket } from '@church/shared';
import type { DisplayController } from '@/hooks/useDisplayController';
import { DisplayStageChrome } from '@/components/display/DisplayStageChrome';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface DisplayStage2DProps {
  controller: DisplayController;
}

/**
 * Safe 2D projector stage used when quality preset is "Thấp (2D)",
 * WebGL is unsupported, or a `webglcontextlost` fallback occurs.
 */
export function DisplayStage2D({ controller }: DisplayStage2DProps) {
  const {
    state,
    isPreview,
    revealedDigits,
    isAnimating,
    activeDrawSpeedMode,
    currentPrizeSpeedMode,
    submittingAction,
    isInCooldown,
    skipRevealAnimation,
    handleDrawNext,
    handleConfirmWon,
    handleMarkAbsent,
    handleUndoAbsent,
    handleVoidLast,
  } = controller;

  const event = state.event;
  const digits = event?.digits ?? 5;
  const currentDraw = state.currentDraw;
  const latestDraw = state.latestDraw;
  const activePrize = state.activePrize;
  const controlsBusy = Boolean(submittingAction) || isInCooldown;
  const displayedSpeedMode = currentDraw ? activeDrawSpeedMode : currentPrizeSpeedMode;

  const formattedTicket = currentDraw
    ? formatTicket(currentDraw.ticket, digits)
    : ''.padStart(digits, '•');
  const digitChars = formattedTicket.split('');
  const showWinnerCallout = Boolean(currentDraw && !isAnimating && revealedDigits >= digits);

  return (
    <DisplayStageChrome controller={controller} variant="2d">
      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 p-4 sm:p-8 lg:grid-cols-12">
        {/* Center Stage (2D Digits & Active Prize) */}
        <section className="flex flex-col justify-between rounded-3xl border border-parish-gold/30 bg-parish-night/70 p-6 shadow-2xl backdrop-blur-md lg:col-span-8 sm:p-8">
          {/* Current Prize Header */}
          <div className="text-center">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant="default" className="px-4 py-1 text-sm">
                {currentDraw
                  ? `Lượt quay #${currentDraw.seq} • Đang mở thưởng`
                  : activePrize
                    ? `Giải kế tiếp (${activePrize.won_count}/${activePrize.quantity} đã trao)`
                    : 'Sẵn sàng'}
              </Badge>
              <span className="inline-flex items-center gap-1 rounded-full border border-parish-gold/40 bg-parish-gold/10 px-3 py-1 text-xs font-semibold text-parish-goldLight">
                <Gauge className="h-3.5 w-3.5" />
                {displayedSpeedMode === 'fast' ? 'Nhanh (~8s)' : 'Đầy đủ (~17s)'}
              </span>
            </div>

            <h2 className="mt-3 font-title text-3xl font-extrabold tracking-tight text-parish-goldLight sm:text-5xl">
              {currentDraw?.prize?.name ?? activePrize?.name ?? 'Đang chuẩn bị giải thưởng'}
            </h2>
            <p className="mt-2 text-lg text-parish-cream/85 sm:text-xl">
              {currentDraw?.prize?.reward ?? activePrize?.reward ?? ''}
            </p>
          </div>

          {/* 2D Ballot Slots */}
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

            {showWinnerCallout && currentDraw ? (
              <div
                data-testid="winner-invitation-banner-2d"
                className="mt-5 rounded-2xl border-2 border-parish-gold bg-parish-gold/15 px-5 py-2.5 text-center shadow-[0_0_30px_rgba(245,196,81,0.35)]"
              >
                <p className="font-title text-lg font-extrabold text-parish-goldLight sm:text-xl">
                  Mời người giữ vé số{' '}
                  <span className="mx-1 font-mono text-white">{formattedTicket}</span>{' '}
                  lên nhận thưởng
                </p>
              </div>
            ) : (
              <p className="mt-5 text-sm text-parish-cream/70">
                {currentDraw
                  ? isAnimating
                    ? 'Đang lần lượt mở từng chữ số (nhấn Space để mở ngay toàn bộ số)...'
                    : 'Số vé trúng thưởng đã hiển thị đầy đủ'
                  : `Còn ${state.validTicketsRemaining.toLocaleString('vi-VN')} / ${state.totalPoolSize.toLocaleString('vi-VN')} vé hợp lệ trong rổ quay`}
              </p>
            )}
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
                        controlsBusy || !activePrize || state.validTicketsRemaining === 0
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
                        disabled={controlsBusy}
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
                    Mở ngay tất cả số (Space)
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

              <p className="text-center text-[11px] text-parish-cream/55">
                Phím tắt: <strong>Space / →</strong> Quay số • <strong>Enter</strong> Xác nhận trúng •{' '}
                <strong>V</strong> Vắng mặt • <strong>U</strong> Hoàn tác vắng •{' '}
                <strong>Backspace</strong> Hủy • <strong>Q</strong> Đổi đồ họa 3D/2D •{' '}
                <strong>D</strong> FPS • <strong>M</strong> Âm thanh • <strong>F</strong> Toàn màn hình
              </p>
            </div>
          ) : null}
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
    </DisplayStageChrome>
  );
}

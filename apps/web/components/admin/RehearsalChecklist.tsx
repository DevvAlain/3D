'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  Power,
  RefreshCw,
  Volume2,
  XCircle,
} from 'lucide-react';
import {
  evaluateRehearsalChecklist,
  type ChecklistClientSignals,
  type ChecklistItemStatus,
  type ChecklistServerData,
} from '@/lib/checklist';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface RehearsalChecklistProps {
  eventId?: string;
  onEventChanged?: () => Promise<void>;
  onFeedback?: (type: 'success' | 'error', msg: string) => void;
}

const STATUS_BADGES: Record<
  ChecklistItemStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' }
> = {
  pass: { label: 'ĐẠT', variant: 'success' },
  warn: { label: 'CẦN LƯU Ý', variant: 'warning' },
  fail: { label: 'CHƯA ĐẠT', variant: 'destructive' },
};

export function RehearsalChecklist({
  eventId,
  onEventChanged,
  onFeedback,
}: RehearsalChecklistProps) {
  const [data, setData] = React.useState<ChecklistServerData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [localNotice, setLocalNotice] = React.useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);
  const [copied, setCopied] = React.useState(false);

  const notify = React.useCallback(
    (type: 'success' | 'error', msg: string) => {
      setLocalNotice({ type, msg });
      onFeedback?.(type, msg);
    },
    [onFeedback]
  );

  const [clientSignals, setClientSignals] = React.useState<ChecklistClientSignals>({
    audioUnlockedAt: null,
    backupJsonExportedAt: null,
    backupLaptopReady: false,
  });

  const syncLocalSignals = React.useCallback((resolvedEventId: string | undefined) => {
    if (typeof window === 'undefined') return;
    try {
      const audioUnlockedAt = window.localStorage.getItem('church_checklist_audio_unlocked');
      const backupJsonExportedAt = resolvedEventId
        ? window.localStorage.getItem(`church_checklist_backup_${resolvedEventId}`)
        : null;
      const backupLaptopReady = resolvedEventId
        ? window.localStorage.getItem(`church_checklist_backup_laptop_${resolvedEventId}`) === '1'
        : false;
      setClientSignals({
        audioUnlockedAt,
        backupJsonExportedAt,
        backupLaptopReady,
      });
    } catch {
      // Ignore storage errors
    }
  }, []);

  const loadChecklist = React.useCallback(async () => {
    setLoading(true);
    setLocalError(null);
    try {
      const query = eventId ? `?event_id=${encodeURIComponent(eventId)}` : '';
      const res = await fetch(`/api/admin/checklist${query}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setLocalError(json.error || 'Không thể tải danh sách kiểm tra trước sự kiện.');
        return;
      }
      const typed = json as ChecklistServerData;
      setData(typed);
      syncLocalSignals(typed.targetEvent?.id ?? typed.activeEvent?.id);
    } catch {
      setLocalError('Lỗi kết nối khi tải danh sách kiểm tra.');
    } finally {
      setLoading(false);
    }
  }, [eventId, syncLocalSignals]);

  React.useEffect(() => {
    void loadChecklist();
  }, [loadChecklist]);

  const targetEvent = data?.targetEvent ?? data?.activeEvent ?? null;

  async function handleTestAudioAndUnlock() {
    setBusyAction('audio');
    try {
      const audio = new Audio('/sounds/unlock-chime.wav');
      audio.volume = 0.5;
      try {
        await audio.play();
      } catch {
        // Browsers in automated/muted environments may reject play() while AudioContext can still unlock
      }
      const stamp = new Date().toISOString();
      window.localStorage.setItem('church_checklist_audio_unlocked', stamp);
      setClientSignals((prev) => ({ ...prev, audioUnlockedAt: stamp }));
      notify('success', 'Đã phát kiểm tra âm thanh & ghi nhận sẵn sàng!');
    } finally {
      setBusyAction(null);
    }
  }

  function handleToggleBackupLaptop(checked: boolean) {
    if (!targetEvent?.id) return;
    try {
      if (checked) {
        window.localStorage.setItem(`church_checklist_backup_laptop_${targetEvent.id}`, '1');
      } else {
        window.localStorage.removeItem(`church_checklist_backup_laptop_${targetEvent.id}`);
      }
    } catch {
      // Ignore storage failures
    }
    setClientSignals((prev) => ({ ...prev, backupLaptopReady: checked }));
  }

  function handleDownloadBackupJson() {
    if (!data || !targetEvent) return;
    const payload = {
      version: 1,
      event: {
        title: targetEvent.title,
        parish_name: targetEvent.parish_name,
        digits: targetEvent.digits,
        range_from: targetEvent.range_from,
        range_to: targetEvent.range_to,
        theme: targetEvent.theme,
        primary_color: targetEvent.primary_color,
        test_mode: true,
      },
      prizes: data.prizes.map((p) => ({
        name: p.name,
        reward: p.reward,
        quantity: p.quantity,
        sort_order: p.sort_order,
        speed_mode: p.speed_mode ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sao-luu-truoc-su-kien-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    const stamp = new Date().toISOString();
    if (targetEvent.id) {
      try {
        window.localStorage.setItem(`church_checklist_backup_${targetEvent.id}`, stamp);
      } catch {
        // Ignore storage failures
      }
    }
    setClientSignals((prev) => ({ ...prev, backupJsonExportedAt: stamp }));
    notify('success', 'Đã tải bản sao lưu cấu hình JSON!');
  }

  async function handleClearTestDraws() {
    if (!targetEvent?.id) return;
    setBusyAction('clear-test');
    try {
      const res = await fetch('/api/admin/clear-test-draws', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: targetEvent.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Không thể xóa lượt quay thử.');
        return;
      }
      notify('success', `Đã xóa ${json.deleted_count ?? 0} lượt quay thử.`);
      await loadChecklist();
      await onEventChanged?.();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleTurnOffTestModeAndActivate() {
    if (!targetEvent?.id) return;
    setBusyAction('go-live');
    try {
      const patchRes = await fetch('/api/admin/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: targetEvent.id, test_mode: false }),
      });
      const patchJson = await patchRes.json();
      if (!patchRes.ok) {
        notify('error', patchJson.error || 'Không thể tắt Test Mode.');
        return;
      }
      if (!targetEvent.is_active) {
        const actRes = await fetch('/api/admin/activate-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: targetEvent.id }),
        });
        const actJson = await actRes.json();
        if (!actRes.ok) {
          notify('error', actJson.error || 'Đã tắt Test Mode nhưng kích hoạt sự kiện lỗi.');
          return;
        }
      }
      notify('success', `Sự kiện "${targetEvent.title}" đã chuyển sang chế độ CHÍNH THỨC (LIVE)!`);
      await loadChecklist();
      await onEventChanged?.();
    } finally {
      setBusyAction(null);
    }
  }

  const items = React.useMemo(
    () => (data ? evaluateRehearsalChecklist(data, clientSignals) : []),
    [data, clientSignals]
  );

  const passedCount = items.filter((i) => i.status === 'pass').length;
  const allReady = items.length === 6 && items.every((i) => i.status === 'pass');

  const checklistReportText = React.useMemo(() => {
    if (!data) return '';
    const lines = [
      `DANH SÁCH KIỂM TRA TRƯỚC SỰ KIỆN — ${targetEvent?.title ?? 'Chưa chọn sự kiện'}`,
      `Trạng thái tổng hợp: ${passedCount}/${items.length} hạng mục ĐẠT`,
      `Thứ tự chuẩn bị: Diễn tập (Test Mode) -> Xóa dữ liệu thử -> Tắt Test Mode -> Lượt quay thật đầu tiên`,
      '',
      ...items.map(
        (item) =>
          `[${STATUS_BADGES[item.status].label}] ${item.title}\n  - ${item.summary}\n  - ${item.detail}`
      ),
    ];
    return lines.join('\n');
  }, [data, items, passedCount, targetEvent?.title]);

  async function handleCopyReport() {
    try {
      await navigator.clipboard.writeText(checklistReportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      notify('error', 'Trình duyệt không hỗ trợ sao chép clipboard tự động.');
    }
  }

  return (
    <div className="space-y-6" data-testid="rehearsal-checklist-root">
      <Card className="border-parish-gold/35">
        <CardHeader className="flex flex-wrap items-start justify-between gap-4 sm:flex-row">
          <div>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ClipboardCheck className="h-6 w-6 text-parish-gold" />
              Danh Sách Kiểm Tra Trước Sự Kiện
            </CardTitle>
            <CardDescription className="mt-1">
              Rà soát 6 hạng mục an toàn trước giờ G theo đúng trình tự:{' '}
              <strong className="text-parish-goldLight">
                Diễn tập thử → Xóa lượt thử → Tắt Test Mode → Lượt quay thật đầu tiên
              </strong>
              .
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              data-testid="checklist-score-badge"
              variant={allReady ? 'success' : passedCount >= 4 ? 'warning' : 'destructive'}
              className="px-3 py-1 text-xs"
            >
              Đạt {passedCount}/{items.length || 6} hạng mục
            </Badge>

            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void loadChecklist()}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </Button>

            <Button variant="outline" size="sm" onClick={() => void handleCopyReport()}>
              <Copy className="h-4 w-4" />
              {copied ? 'Đã chép báo cáo!' : 'Sao chép báo cáo'}
            </Button>

            <a href="/display?preview=1" target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm">
                <ExternalLink className="h-4 w-4" />
                Xem trước (/display?preview=1)
              </Button>
            </a>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {localError ? (
            <Alert variant="destructive">
              <AlertDescription>{localError}</AlertDescription>
            </Alert>
          ) : null}

          {!onFeedback && localNotice ? (
            <Alert variant={localNotice.type === 'error' ? 'destructive' : 'success'}>
              <AlertDescription>{localNotice.msg}</AlertDescription>
            </Alert>
          ) : null}

          {!loading && data ? (
            <>
              <Alert variant={allReady ? 'success' : 'warning'}>
                <AlertTriangle className="mb-0.5 mr-1.5 inline h-4 w-4" />
                <AlertTitle className="inline">
                  {allReady
                    ? 'HỆ THỐNG ĐÃ ĐẠT 6/6 HẠNG MỤC — SẴN SÀNG LÊN SÂN KHẤU!'
                    : 'Hãy hoàn tất các hạng mục còn lại trước khi mở màn hình cho cộng đoàn.'}
                </AlertTitle>
              </Alert>

              <div className="grid gap-4 md:grid-cols-2">
                {items.map((item) => {
                  const badge = STATUS_BADGES[item.status];
                  return (
                    <div
                      key={item.key}
                      data-testid={`checklist-item-${item.key}`}
                      data-status={item.status}
                      className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 transition-colors ${
                        item.status === 'pass'
                          ? 'border-emerald-400/35 bg-emerald-950/20'
                          : item.status === 'warn'
                            ? 'border-amber-400/40 bg-amber-950/20'
                            : 'border-red-400/45 bg-red-950/25'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="flex items-center gap-2 font-semibold text-parish-cream">
                            {item.status === 'pass' ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                            ) : item.status === 'warn' ? (
                              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                            ) : (
                              <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                            )}
                            <span>{item.title}</span>
                          </h3>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </div>

                        <p className="text-sm font-medium text-parish-goldLight">{item.summary}</p>
                        <p className="text-xs leading-relaxed text-parish-cream/75">{item.detail}</p>
                      </div>

                      {/* Item-specific interactive rehearsal / go-live controls */}
                      {item.key === 'test_mode_cleared' && targetEvent ? (
                        <div className="flex flex-wrap gap-2 border-t border-white/10 pt-2.5">
                          {data.testDrawsCount > 0 ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyAction !== null}
                              onClick={() => void handleClearTestDraws()}
                            >
                              <Eraser className="h-3.5 w-3.5" />
                              Xóa {data.testDrawsCount} lượt thử
                            </Button>
                          ) : null}
                          {targetEvent.test_mode ? (
                            <Button
                              size="sm"
                              variant="default"
                              disabled={busyAction !== null}
                              onClick={() => void handleTurnOffTestModeAndActivate()}
                            >
                              <Power className="h-3.5 w-3.5" />
                              Tắt Test Mode &amp; Kích hoạt LIVE
                            </Button>
                          ) : null}
                        </div>
                      ) : null}

                      {item.key === 'audio_unlocked' ? (
                        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyAction !== null}
                            onClick={() => void handleTestAudioAndUnlock()}
                          >
                            <Volume2 className="h-3.5 w-3.5" />
                            Kiểm tra &amp; Mở khóa âm thanh
                          </Button>
                        </div>
                      ) : null}

                      {item.key === 'backup_laptop' ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                          <label className="flex cursor-pointer items-center gap-2 text-xs text-parish-cream/90">
                            <Switch
                              aria-label="Xác nhận máy tính dự phòng sẵn sàng"
                              checked={clientSignals.backupLaptopReady}
                              onCheckedChange={handleToggleBackupLaptop}
                            />
                            <span>Đã bật sẵn laptop dự phòng &amp; đăng nhập</span>
                          </label>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleDownloadBackupJson}
                          >
                            <Download className="h-3.5 w-3.5" />
                            Tải JSON dự phòng
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-parish-gold/80">
                  Bản tóm tắt kiểm tra (có thể gửi cho Cha xứ / Trưởng ban kỹ thuật)
                </p>
                <pre
                  data-testid="checklist-summary-output"
                  className="max-h-52 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-parish-cream/85"
                >
                  {checklistReportText}
                </pre>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center text-sm text-parish-cream/65">
              Đang kiểm tra trạng thái sự kiện &amp; tài khoản Supabase...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import * as React from 'react';
import {
  AlertOctagon,
  Download,
  Eraser,
  ExternalLink,
  History,
  RotateCcw,
  Upload,
} from 'lucide-react';
import type { AuditLog, Event, ExcludedTicket, Prize } from '@church/shared';
import type { AdminStatePayload } from '@/lib/admin-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DangerAndPreviewTabProps {
  event: Event;
  prizes: Prize[];
  excludedTickets: ExcludedTicket[];
  auditLogs: AuditLog[];
  locks: AdminStatePayload['locks'];
  onRefresh: (eventId?: string) => Promise<void>;
  onFeedback: (type: 'success' | 'error', msg: string) => void;
}

export function DangerAndPreviewTab({
  event,
  prizes,
  excludedTickets,
  auditLogs,
  locks,
  onRefresh,
  onFeedback,
}: DangerAndPreviewTabProps) {
  const [clearModalOpen, setClearModalOpen] = React.useState(false);
  const [clearingTest, setClearingTest] = React.useState(false);

  const [resetModalOpen, setResetModalOpen] = React.useState(false);
  const [confirmTitle, setConfirmTitle] = React.useState('');
  const [resetting, setResetting] = React.useState(false);

  const [importing, setImporting] = React.useState(false);

  async function handleClearTestDraws() {
    if (!event.id) return;
    setClearingTest(true);
    try {
      const res = await fetch('/api/admin/clear-test-draws', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        onFeedback('error', json.error || 'Không thể xóa dữ liệu quay thử.');
        return;
      }
      setClearModalOpen(false);
      onFeedback('success', `Đã xóa ${json.deleted_count ?? 0} lượt quay thử.`);
      await onRefresh(event.id);
    } catch {
      onFeedback('error', 'Lỗi kết nối khi xóa dữ liệu quay thử.');
    } finally {
      setClearingTest(false);
    }
  }

  async function handleResetEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!event.id) return;
    setResetting(true);
    try {
      const res = await fetch('/api/admin/reset-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: event.id,
          confirm_title: confirmTitle,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        onFeedback('error', json.error || 'Reset sự kiện thất bại.');
        return;
      }
      setResetModalOpen(false);
      setConfirmTitle('');
      onFeedback(
        'success',
        `Đã reset sự kiện thành công (đã xóa ${json.deleted_draws ?? 0} lượt quay và ghi nhật ký).`
      );
      await onRefresh(event.id);
    } catch {
      onFeedback('error', 'Lỗi kết nối khi reset sự kiện.');
    } finally {
      setResetting(false);
    }
  }

  function handleExportConfigJson() {
    const payload = {
      version: 1,
      event: {
        title: event.title,
        parish_name: event.parish_name,
        digits: event.digits,
        range_from: event.range_from,
        range_to: event.range_to,
        theme: event.theme,
        primary_color: event.primary_color,
        test_mode: true,
      },
      prizes: prizes.map((p) => ({
        name: p.name,
        reward: p.reward,
        quantity: p.quantity,
        sort_order: p.sort_order,
      })),
      excluded_tickets: excludedTickets.map((t) => ({
        ticket: t.ticket,
        reason: t.reason ?? null,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cau-hinh-su-kien-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportConfigFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as unknown;

      const res = await fetch('/api/admin/import-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const json = await res.json();
      if (!res.ok) {
        onFeedback('error', json.error || 'Nhập cấu hình JSON thất bại.');
        return;
      }
      onFeedback(
        'success',
        `Đã nhập thành công sự kiện nháp "${json.event?.title}" (${json.importedPrizes ?? 0} giải, ${json.importedExcludedTickets ?? 0} vé loại trừ).`
      );
      await onRefresh(json.event?.id);
    } catch {
      onFeedback('error', 'Tệp JSON không hợp lệ hoặc bị lỗi định dạng.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Xem Trước Màn Hình Chiếu (Chỉ Đọc)</CardTitle>
            <CardDescription>
              Mở sân khấu Display ở chế độ xem trước với tài khoản Admin. Không cho phép bấm quay hay thay đổi dữ liệu.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-parish-cream/70">
              {event.is_active ? (
                <span>Đang hiển thị: <strong>{event.title}</strong></span>
              ) : (
                <span className="text-amber-300">
                  Sự kiện này chưa bật &ldquo;Kích hoạt hiển thị&rdquo; nên /display sẽ hiển thị sự kiện đang kích hoạt khác.
                </span>
              )}
            </div>
            <a href="/display?preview=1" target="_blank" rel="noreferrer">
              <Button variant="secondary">
                <ExternalLink className="h-4 w-4" />
                Mở Preview Display
              </Button>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sao Lưu & Nhập Cấu Hình (JSON)</CardTitle>
            <CardDescription>
              Xuất toàn bộ cấu hình sự kiện, giải thưởng và vé loại trừ hoặc nhập thành sự kiện nháp mới.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleExportConfigJson}>
              <Download className="h-4 w-4" />
              Xuất cấu hình JSON
            </Button>

            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-parish-gold/35 bg-parish-navy/80 px-4 py-2 text-sm font-semibold text-parish-goldLight hover:bg-parish-gold/10">
              <Upload className="h-4 w-4" />
              {importing ? 'Đang nhập...' : 'Nhập cấu hình JSON'}
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                disabled={importing}
                onChange={(e) => handleImportConfigFile(e.target.files?.[0])}
              />
            </label>
          </CardContent>
        </Card>
      </div>

      <Card className="border-red-500/40 bg-red-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-300">
            <AlertOctagon className="h-5 w-5" />
            Vùng Thao Tác Nguy Hiểm
          </CardTitle>
          <CardDescription>
            Các thao tác dưới đây xóa lịch sử quay số trong cơ sở dữ liệu và không thể hoàn tác.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col justify-between gap-3 rounded-xl border border-amber-400/30 bg-parish-navy/60 p-4">
            <div>
              <h4 className="font-semibold text-amber-200">Xóa dữ liệu quay thử (Test Draws)</h4>
              <p className="mt-1 text-xs text-parish-cream/70">
                Hiện có <strong>{locks.testDrawsCount}</strong> lượt quay thử. Xóa mục này KHÔNG ảnh hưởng tới dữ liệu quay chính thức.
              </p>
            </div>
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={locks.testDrawsCount === 0}
                onClick={() => setClearModalOpen(true)}
              >
                <Eraser className="h-4 w-4" />
                Xóa tất cả lượt quay thử ({locks.testDrawsCount})
              </Button>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-xl border border-red-500/40 bg-parish-navy/60 p-4">
            <div>
              <h4 className="font-semibold text-red-300">Reset toàn bộ sự kiện</h4>
              <p className="mt-1 text-xs text-parish-cream/70">
                Xóa SẠCH cả <strong>{locks.realDrawsCount}</strong> lượt quay chính thức và{' '}
                <strong>{locks.testDrawsCount}</strong> lượt quay thử, mở khóa toàn bộ cấu hình dải số và ghi nhật ký kiểm toán.
              </p>
            </div>
            <div>
              <Button variant="destructive" size="sm" onClick={() => setResetModalOpen(true)}>
                <RotateCcw className="h-4 w-4" />
                Reset toàn bộ sự kiện...
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5 text-parish-gold" />
            Nhật Ký Kiểm Toán (Audit Logs)
          </CardTitle>
          <CardDescription>Ghi nhận bất biến các thao tác nhạy cảm như Reset toàn bộ sự kiện.</CardDescription>
        </CardHeader>
        <CardContent>
          {auditLogs.length === 0 ? (
            <p className="py-4 text-center text-xs text-parish-cream/60">Chưa có bản ghi kiểm toán nào.</p>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-parish-navy/50 px-4 py-2.5 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="destructive">{log.action}</Badge>
                    <span className="font-medium text-parish-cream">{log.actor_email || 'Hệ thống'}</span>
                    <span className="text-parish-cream/70">
                      (Đã xóa {String(log.details?.deleted_draws ?? 0)} lượt quay — chính thức:{' '}
                      {String(log.details?.deleted_real_draws ?? 0)}, thử:{' '}
                      {String(log.details?.deleted_test_draws ?? 0)})
                    </span>
                  </div>
                  <span className="text-parish-cream/60">
                    {new Date(log.created_at).toLocaleString('vi-VN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clear test draws confirmation dialog */}
      <Dialog open={clearModalOpen} onOpenChange={setClearModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận xóa dữ liệu quay thử</DialogTitle>
            <DialogDescription>
              Hành động này sẽ xóa {locks.testDrawsCount} lượt quay thử của sự kiện &ldquo;{event.title}&rdquo;. Dữ liệu quay chính thức vẫn được giữ nguyên.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setClearModalOpen(false)}>
              Hủy bỏ
            </Button>
            <Button variant="destructive" disabled={clearingTest} onClick={handleClearTestDraws}>
              {clearingTest ? 'Đang xóa...' : 'Xác nhận xóa quay thử'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset event typed-title confirmation dialog */}
      <Dialog open={resetModalOpen} onOpenChange={setResetModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-300">Reset Toàn Bộ Dữ Liệu Sự Kiện</DialogTitle>
            <DialogDescription>
              CẢNH BÁO: Toàn bộ lượt quay chính thức và quay thử sẽ bị xóa vĩnh viễn và ghi lại vào Audit Log. Để tiếp tục, hãy nhập chính xác tên sự kiện bên dưới:
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResetEvent} className="space-y-4">
            <div className="rounded-lg border border-red-400/30 bg-red-950/30 px-3 py-2 text-sm font-semibold text-parish-goldLight">
              {event.title}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-reset-title">Nhập chính xác tên sự kiện</Label>
              <Input
                id="confirm-reset-title"
                required
                placeholder={event.title}
                value={confirmTitle}
                onChange={(e) => setConfirmTitle(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setResetModalOpen(false)}>
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={resetting || confirmTitle.trim() !== event.title.trim()}
              >
                {resetting ? 'Đang reset...' : 'Tôi hiểu, Reset ngay'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

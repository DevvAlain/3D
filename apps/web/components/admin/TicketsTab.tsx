'use client';

import * as React from 'react';
import { AlertTriangle, Lock, Plus, Save, Trash2 } from 'lucide-react';
import { formatTicket, type Event, type ExcludedTicket } from '@church/shared';
import type { AdminStatePayload } from '@/lib/admin-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface TicketsTabProps {
  event: Event;
  excludedTickets: ExcludedTicket[];
  locks: AdminStatePayload['locks'];
  poolStats: AdminStatePayload['poolStats'];
  onRefresh: (eventId?: string) => Promise<void>;
  onFeedback: (type: 'success' | 'error', msg: string) => void;
}

export function TicketsTab({
  event,
  excludedTickets,
  locks,
  poolStats,
  onRefresh,
  onFeedback,
}: TicketsTabProps) {
  const [digits, setDigits] = React.useState(event.digits);
  const [rangeFrom, setRangeFrom] = React.useState(event.range_from);
  const [rangeTo, setRangeTo] = React.useState(event.range_to);
  const [savingRange, setSavingRange] = React.useState(false);

  const [rawPaste, setRawPaste] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [addingExcluded, setAddingExcluded] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDigits(event.digits);
    setRangeFrom(event.range_from);
    setRangeTo(event.range_to);
  }, [event]);

  const maxAllowedForDigits = Math.pow(10, digits) - 1;

  async function handleSaveRange(e: React.FormEvent) {
    e.preventDefault();
    if (!event.id || locks.hasRealDraws) return;
    setSavingRange(true);
    try {
      const res = await fetch('/api/admin/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: event.id,
          digits: Number(digits),
          range_from: Number(rangeFrom),
          range_to: Number(rangeTo),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        onFeedback('error', json.error || 'Không thể lưu cấu hình dải số vé.');
        return;
      }
      onFeedback('success', 'Đã cập nhật dải số phát hành vé.');
      await onRefresh(event.id);
    } catch {
      onFeedback('error', 'Lỗi kết nối khi lưu dải số vé.');
    } finally {
      setSavingRange(false);
    }
  }

  async function handleAddExcluded(e: React.FormEvent) {
    e.preventDefault();
    if (!event.id || !rawPaste.trim()) return;
    setAddingExcluded(true);
    try {
      const res = await fetch('/api/admin/excluded-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: event.id,
          raw_input: rawPaste,
          reason: reason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        onFeedback('error', json.error || 'Không thể thêm vé loại trừ.');
        return;
      }
      const extraWarn =
        Array.isArray(json.outOfRangeTickets) && json.outOfRangeTickets.length > 0
          ? ` (Bỏ qua ${json.outOfRangeTickets.length} số ngoài dải)`
          : '';
      onFeedback(
        'success',
        `Đã thêm ${json.addedCount} vé loại trừ${json.skippedDuplicates > 0 ? `, trùng lặp: ${json.skippedDuplicates}` : ''}${extraWarn}.`
      );
      setRawPaste('');
      setReason('');
      await onRefresh(event.id);
    } catch {
      onFeedback('error', 'Lỗi kết nối khi thêm vé loại trừ.');
    } finally {
      setAddingExcluded(false);
    }
  }

  async function handleDeleteExcluded(id: string) {
    if (locks.hasRealDraws) return;
    setDeletingId(id);
    try {
      const res = await fetch('/api/admin/excluded-tickets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) {
        onFeedback('error', json.error || 'Không thể xóa vé loại trừ.');
        return;
      }
      onFeedback('success', 'Đã xóa vé khỏi danh sách loại trừ.');
      await onRefresh(event.id);
    } catch {
      onFeedback('error', 'Lỗi kết nối khi xóa vé loại trừ.');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClearAllExcluded() {
    if (!event.id || locks.hasRealDraws || excludedTickets.length === 0) return;
    setDeletingId('ALL');
    try {
      const res = await fetch('/api/admin/excluded-tickets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, clear_all: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        onFeedback('error', json.error || 'Không thể xóa toàn bộ vé loại trừ.');
        return;
      }
      onFeedback('success', 'Đã xóa toàn bộ danh sách vé loại trừ.');
      await onRefresh(event.id);
    } catch {
      onFeedback('error', 'Lỗi kết nối khi xóa danh sách loại trừ.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {poolStats.quotaExceedsPool ? (
        <Alert variant="destructive">
          <AlertTriangle className="mb-1 inline h-4 w-4 mr-1.5" />
          <AlertTitle className="inline">Tổng số lượng giải thưởng vượt quá số vé hợp lệ!</AlertTitle>
          <AlertDescription className="mt-1">
            Tổng số giải là <strong>{poolStats.totalPrizeQuantity}</strong> trong khi rổ vé hợp lệ chỉ có{' '}
            <strong>{poolStats.totalPoolSize - poolStats.excludedInRangeCount}</strong> vé. Vui lòng mở rộng dải số hoặc giảm số lượng giải.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Cấu Hình Số Chữ Số & Dải Số Vé</CardTitle>
              {locks.hasRealDraws ? (
                <Badge variant="warning">
                  <Lock className="h-3 w-3" /> Khóa vì đã có quay chính thức
                </Badge>
              ) : null}
            </div>
            <CardDescription>
              Quy định số lồng cầu chữ số (3–7) và khoảng số vé đã in phát hành.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveRange} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="tk-digits">Số chữ số (3 - 7)</Label>
                  <Input
                    id="tk-digits"
                    type="number"
                    min={3}
                    max={7}
                    value={digits}
                    disabled={locks.hasRealDraws}
                    onChange={(e) => setDigits(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tk-from">Từ số</Label>
                  <Input
                    id="tk-from"
                    type="number"
                    min={0}
                    max={maxAllowedForDigits}
                    value={rangeFrom}
                    disabled={locks.hasRealDraws}
                    onChange={(e) => setRangeFrom(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tk-to">Đến số (tối đa {maxAllowedForDigits})</Label>
                  <Input
                    id="tk-to"
                    type="number"
                    min={0}
                    max={maxAllowedForDigits}
                    value={rangeTo}
                    disabled={locks.hasRealDraws}
                    onChange={(e) => setRangeTo(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-xl border border-parish-gold/20 bg-parish-navy/60 p-3 text-center">
                <div>
                  <p className="text-xs text-parish-cream/65">Tổng vé phát hành</p>
                  <p className="mt-1 text-lg font-bold text-parish-cream">
                    {poolStats.totalPoolSize.toLocaleString('vi-VN')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-parish-cream/65">Vé loại trừ</p>
                  <p className="mt-1 text-lg font-bold text-amber-300">
                    {poolStats.excludedInRangeCount.toLocaleString('vi-VN')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-parish-cream/65">Còn có thể trúng</p>
                  <p className="mt-1 text-lg font-bold text-emerald-300">
                    {poolStats.validTicketsRemaining.toLocaleString('vi-VN')}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-parish-cream/70">
                <span>
                  Mẫu hiển thị:{' '}
                  <strong className="font-mono text-parish-goldLight">
                    {formatTicket(Math.max(0, rangeFrom), digits)} — {formatTicket(Math.max(0, rangeTo), digits)}
                  </strong>
                </span>
                <Button type="submit" disabled={savingRange || locks.hasRealDraws}>
                  <Save className="h-4 w-4" />
                  {savingRange ? 'Đang lưu...' : 'Lưu dải số'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thêm Vé Loại Trừ (Chưa Bán / Vé Hủy)</CardTitle>
            <CardDescription>
              Dán nhiều số vé cách nhau bởi dấu phẩy, khoảng trắng hoặc xuống dòng. Bạn vẫn có thể thêm vé chưa bán trước/giữa giờ quay.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddExcluded} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="exc-paste">Danh sách số vé cần loại</Label>
                <textarea
                  id="exc-paste"
                  rows={4}
                  placeholder="Ví dụ: 00012, 00015&#10;00199 00205"
                  value={rawPaste}
                  onChange={(e) => setRawPaste(e.target.value)}
                  className="w-full rounded-lg border border-parish-gold/25 bg-parish-navy/80 px-3 py-2 text-sm text-parish-cream placeholder:text-parish-cream/40 focus:outline-none focus:ring-2 focus:ring-parish-gold/60"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exc-reason">Ghi chú lý do (tuỳ chọn)</Label>
                <Input
                  id="exc-reason"
                  placeholder="Vé tồn chưa phát hành / vé rách..."
                  maxLength={250}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={addingExcluded || !rawPaste.trim()}>
                  <Plus className="h-4 w-4" />
                  {addingExcluded ? 'Đang thêm...' : 'Thêm vào danh sách loại trừ'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Danh Sách Vé Đang Loại Trừ ({excludedTickets.length})</CardTitle>
            <CardDescription>
              {locks.hasRealDraws
                ? 'Không thể xóa vé loại trừ sau khi sự kiện đã có lượt quay chính thức.'
                : 'Các vé dưới đây sẽ không bao giờ được bốc trúng.'}
            </CardDescription>
          </div>
          {excludedTickets.length > 0 ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={locks.hasRealDraws || deletingId === 'ALL'}
              onClick={handleClearAllExcluded}
            >
              <Trash2 className="h-4 w-4" />
              Xóa toàn bộ ({excludedTickets.length})
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {excludedTickets.length === 0 ? (
            <p className="py-6 text-center text-sm text-parish-cream/60">Chưa có vé loại trừ nào.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-parish-navy text-xs uppercase text-parish-goldLight">
                  <tr>
                    <th className="px-4 py-2.5">Số vé</th>
                    <th className="px-4 py-2.5">Ghi chú</th>
                    <th className="px-4 py-2.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {excludedTickets.map((item) => (
                    <tr key={item.id ?? item.ticket} className="hover:bg-white/5">
                      <td className="px-4 py-2 font-mono font-bold text-parish-gold">
                        {formatTicket(item.ticket, event.digits)}
                      </td>
                      <td className="px-4 py-2 text-parish-cream/75">{item.reason || '—'}</td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={locks.hasRealDraws || deletingId === item.id}
                          onClick={() => item.id && handleDeleteExcluded(item.id)}
                          aria-label={`Xóa vé ${formatTicket(item.ticket, event.digits)}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

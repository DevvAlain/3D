'use client';

import * as React from 'react';
import { Download, Radio } from 'lucide-react';
import { formatTicket, type Draw, type DrawStatus, type Event, type Prize } from '@church/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface LiveResultsTabProps {
  event: Event;
  prizes: Prize[];
  draws: Array<Draw & { prize?: Prize }>;
  realtimeConnected: boolean;
}

const STATUS_META: Record<
  DrawStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' | 'default' }
> = {
  won: { label: 'Đã trúng thưởng', variant: 'success' },
  revealing: { label: 'Đang mở số', variant: 'default' },
  absent: { label: 'Vắng mặt', variant: 'warning' },
  void: { label: 'Đã hủy', variant: 'destructive' },
};

export function LiveResultsTab({
  event,
  prizes,
  draws,
  realtimeConnected,
}: LiveResultsTabProps) {
  const [modeFilter, setModeFilter] = React.useState<'all' | 'real' | 'test'>(
    event.test_mode ? 'test' : 'real'
  );
  const [prizeFilter, setPrizeFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');

  React.useEffect(() => {
    setModeFilter(event.test_mode ? 'test' : 'real');
  }, [event.id, event.test_mode]);

  const filteredDraws = React.useMemo(() => {
    return draws.filter((d) => {
      if (modeFilter === 'real' && d.is_test) return false;
      if (modeFilter === 'test' && !d.is_test) return false;
      if (prizeFilter !== 'all' && d.prize_id !== prizeFilter) return false;
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      return true;
    });
  }, [draws, modeFilter, prizeFilter, statusFilter]);

  const counts = React.useMemo(() => {
    let won = 0;
    let absent = 0;
    let voided = 0;
    for (const d of filteredDraws) {
      if (d.status === 'won') won += 1;
      else if (d.status === 'absent') absent += 1;
      else if (d.status === 'void') voided += 1;
    }
    return { total: filteredDraws.length, won, absent, voided };
  }, [filteredDraws]);

  const exportUrl = React.useMemo(() => {
    const params = new URLSearchParams();
    if (event.id) params.set('event_id', event.id);
    params.set('mode', modeFilter);
    if (prizeFilter !== 'all') params.set('prize_id', prizeFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    return `/api/admin/export-csv?${params.toString()}`;
  }, [event.id, modeFilter, prizeFilter, statusFilter]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Kết Quả Quay Số Trực Tiếp</CardTitle>
            <Badge variant={realtimeConnected ? 'success' : 'warning'}>
              <Radio className="h-3 w-3" />
              {realtimeConnected ? 'Đang đồng bộ Realtime' : 'Đang kết nối Realtime...'}
            </Badge>
          </div>
          <CardDescription className="mt-1">
            Chế độ chỉ đọc hậu trường (Realtime). Quản trị viên theo dõi tại đây; Presenter thao tác quay trên màn hình sân khấu.
          </CardDescription>
        </div>

        <a href={exportUrl} download>
          <Button variant="default" size="sm" disabled={!event.id}>
            <Download className="h-4 w-4" />
            Xuất CSV (Excel)
          </Button>
        </a>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-parish-cream/65">Chế độ</label>
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value as 'all' | 'real' | 'test')}
              className="h-9 w-full rounded-lg border border-parish-gold/25 bg-parish-navy/90 px-3 text-sm text-parish-cream"
            >
              <option value="all">Tất cả (Chính thức & Thử)</option>
              <option value="real">Chỉ lượt quay Chính thức</option>
              <option value="test">Chỉ lượt quay Thử nghiệm</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-parish-cream/65">Giải thưởng</label>
            <select
              value={prizeFilter}
              onChange={(e) => setPrizeFilter(e.target.value)}
              className="h-9 w-full rounded-lg border border-parish-gold/25 bg-parish-navy/90 px-3 text-sm text-parish-cream"
            >
              <option value="all">Tất cả giải thưởng</option>
              {prizes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-parish-cream/65">Trạng thái</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 w-full rounded-lg border border-parish-gold/25 bg-parish-navy/90 px-3 text-sm text-parish-cream"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="won">Đã trúng thưởng</option>
              <option value="revealing">Đang mở số</option>
              <option value="absent">Vắng mặt</option>
              <option value="void">Đã hủy</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="muted">Tổng hiển thị: {counts.total}</Badge>
          <Badge variant="success">Trúng thưởng: {counts.won}</Badge>
          <Badge variant="warning">Vắng mặt: {counts.absent}</Badge>
          <Badge variant="destructive">Đã hủy: {counts.voided}</Badge>
        </div>

        {filteredDraws.length === 0 ? (
          <div className="rounded-xl border border-dashed border-parish-gold/20 py-10 text-center text-sm text-parish-cream/60">
            Chưa có lượt quay nào khớp bộ lọc hiện tại.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-parish-navy text-xs uppercase text-parish-goldLight">
                <tr>
                  <th className="px-4 py-3">Lượt</th>
                  <th className="px-4 py-3">Số vé</th>
                  <th className="px-4 py-3">Giải thưởng</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Loại</th>
                  <th className="px-4 py-3">Thời gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredDraws.map((draw) => {
                  const meta = STATUS_META[draw.status];
                  return (
                    <tr key={draw.id} className="hover:bg-white/5">
                      <td className="px-4 py-2.5 font-mono text-parish-cream/70">#{draw.seq}</td>
                      <td className="px-4 py-2.5 font-mono text-lg font-bold tracking-wider text-parish-goldLight">
                        {formatTicket(draw.ticket, event.digits)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-parish-cream">{draw.prize?.name || '—'}</div>
                        <div className="text-xs text-parish-cream/60">{draw.prize?.reward || ''}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={draw.is_test ? 'destructive' : 'muted'}>
                          {draw.is_test ? 'Thử' : 'Thật'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-parish-cream/70">
                        {new Date(draw.created_at).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

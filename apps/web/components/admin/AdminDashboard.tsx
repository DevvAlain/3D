'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  ClipboardCheck,
  ExternalLink,
  Gift,
  Lock,
  Plus,
  ShieldAlert,
  Ticket,
} from 'lucide-react';
import type { AdminStatePayload } from '@/lib/admin-types';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EventTab } from './EventTab';
import { TicketsTab } from './TicketsTab';
import { PrizesTab } from './PrizesTab';
import { LiveResultsTab } from './LiveResultsTab';
import { DangerAndPreviewTab } from './DangerAndPreviewTab';
import { RehearsalChecklist } from './RehearsalChecklist';

interface AdminDashboardProps {
  userEmail: string;
}

export function AdminDashboard({ userEmail }: AdminDashboardProps) {
  const [state, setState] = React.useState<AdminStatePayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; msg: string } | null>(
    null
  );
  const [realtimeConnected, setRealtimeConnected] = React.useState(false);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState('');
  const [newParish, setNewParish] = React.useState('');
  const [newDigits, setNewDigits] = React.useState(5);
  const [newFrom, setNewFrom] = React.useState(1);
  const [newTo, setNewTo] = React.useState(2000);
  const [creatingEvent, setCreatingEvent] = React.useState(false);

  const showFeedback = React.useCallback((type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
  }, []);

  const loadState = React.useCallback(
    async (eventId?: string) => {
      try {
        const query = eventId ? `?event_id=${encodeURIComponent(eventId)}` : '';
        const res = await fetch(`/api/admin/state${query}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) {
          showFeedback('error', json.error || 'Không thể tải dữ liệu quản trị.');
          return;
        }
        setState(json as AdminStatePayload);
      } catch {
        showFeedback('error', 'Không thể kết nối máy chủ.');
      } finally {
        setLoading(false);
      }
    },
    [showFeedback]
  );

  React.useEffect(() => {
    void loadState();
  }, [loadState]);

  const selectedEventId = state?.selectedEvent?.id;

  // Admin live results Realtime subscription (protected by admin SELECT RLS)
  React.useEffect(() => {
    if (!selectedEventId) return;

    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`admin-draws-${selectedEventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'draws',
          filter: `event_id=eq.${selectedEventId}`,
        },
        () => {
          void loadState(selectedEventId);
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      setRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [selectedEventId, loadState]);

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    setCreatingEvent(true);
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          parish_name: newParish.trim(),
          digits: Number(newDigits),
          range_from: Number(newFrom),
          range_to: Number(newTo),
          theme: 'classic',
          primary_color: '#F5C451',
          test_mode: true,
          is_active: (state?.events.length ?? 0) === 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showFeedback('error', json.error || 'Không thể tạo sự kiện mới.');
        return;
      }
      setCreateOpen(false);
      setNewTitle('');
      setNewParish('');
      showFeedback('success', `Đã tạo sự kiện "${json.event.title}" (đang bật chế độ quay thử).`);
      await loadState(json.event.id);
    } catch {
      showFeedback('error', 'Lỗi kết nối khi tạo sự kiện mới.');
    } finally {
      setCreatingEvent(false);
    }
  }

  const selectedEvent = state?.selectedEvent ?? null;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(245,196,81,0.1),_transparent_55%)] pb-14">
      <header className="sticky top-0 z-30 border-b border-parish-gold/25 bg-parish-navy/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-title text-lg font-bold text-parish-goldLight sm:text-xl">
                Quản Trị Hậu Trường (Admin)
              </span>
              <Badge variant="default">Chỉ cấu hình & theo dõi</Badge>
            </div>
            <p className="text-xs text-parish-cream/65">Đăng nhập: {userEmail}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {state && state.events.length > 0 ? (
              <select
                aria-label="Chọn sự kiện đang quản lý"
                value={selectedEvent?.id ?? ''}
                onChange={(e) => void loadState(e.target.value)}
                className="h-9 max-w-[260px] rounded-lg border border-parish-gold/30 bg-parish-night px-3 text-sm text-parish-cream"
              >
                {state.events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.is_active ? '★ ' : ''}
                    {ev.title}
                  </option>
                ))}
              </select>
            ) : null}

            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Sự kiện mới
            </Button>

            <Link
              href={
                selectedEvent?.id
                  ? `/admin/checklist?event_id=${encodeURIComponent(selectedEvent.id)}`
                  : '/admin/checklist'
              }
            >
              <Button variant="outline" size="sm" data-testid="nav-checklist-link">
                <ClipboardCheck className="h-4 w-4 text-parish-gold" />
                Kiểm tra trước sự kiện
              </Button>
            </Link>

            <a href="/display?preview=1" target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4" /> Preview
              </Button>
            </a>

            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 pt-6 sm:px-6">
        {feedback ? (
          <Alert variant={feedback.type === 'error' ? 'destructive' : 'success'}>
            <div className="flex items-center justify-between gap-4">
              <AlertDescription>{feedback.msg}</AlertDescription>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-xs underline opacity-80 hover:opacity-100"
              >
                Đóng
              </button>
            </div>
          </Alert>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-parish-gold/20 bg-parish-night/60 p-12 text-center text-parish-cream/70">
            Đang tải dữ liệu sự kiện...
          </div>
        ) : !selectedEvent ? (
          <div className="rounded-2xl border border-parish-gold/25 bg-parish-night/70 p-10 text-center">
            <h2 className="font-title text-2xl font-bold text-parish-goldLight">
              Chưa có sự kiện nào trong hệ thống
            </h2>
            <p className="mt-2 text-sm text-parish-cream/70">
              Hãy tạo sự kiện đầu tiên để thiết lập dải số vé, cơ cấu giải thưởng và trình chiếu sân khấu.
            </p>
            <Button className="mt-6" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Tạo sự kiện đầu tiên
            </Button>
          </div>
        ) : (
          <>
            {/* Status summary strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-parish-gold/25 bg-parish-night/70 px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-semibold text-parish-cream">{selectedEvent.title}</span>
                <Badge variant={selectedEvent.is_active ? 'success' : 'muted'}>
                  {selectedEvent.is_active ? 'Đang kích hoạt Display' : 'Chưa kích hoạt'}
                </Badge>
                <Badge variant={selectedEvent.test_mode ? 'destructive' : 'success'}>
                  {selectedEvent.test_mode ? 'CHẾ ĐỘ THỬ (TEST MODE)' : 'CHÍNH THỨC (LIVE)'}
                </Badge>
                {state?.locks.hasRealDraws ? (
                  <Badge variant="warning">
                    <Lock className="h-3 w-3" /> Đã khóa cấu hình số ({state.locks.realDrawsCount} lượt thật)
                  </Badge>
                ) : null}
              </div>

              <div className="text-xs text-parish-cream/75">
                Vé khả dụng: <strong className="text-parish-goldLight">{state?.poolStats.validTicketsRemaining}</strong> /{' '}
                {state?.poolStats.totalPoolSize} • Tổng giải: <strong>{state?.poolStats.totalPrizeQuantity}</strong>
              </div>
            </div>

            {selectedEvent.test_mode ? (
              <Alert variant="destructive">
                <AlertTriangle className="mb-0.5 mr-1.5 inline h-4 w-4" />
                <AlertTitle className="inline">
                  CHẾ ĐỘ QUAY THỬ ĐANG BẬT — CÁC LƯỢT QUAY SẼ KHÔNG TÍNH VÀO KẾT QUẢ CHÍNH THỨC
                </AlertTitle>
              </Alert>
            ) : null}

            <Tabs defaultValue="event">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="event">
                  <Calendar className="h-4 w-4" /> Sự kiện
                </TabsTrigger>
                <TabsTrigger value="tickets">
                  <Ticket className="h-4 w-4" /> Vé & Loại trừ
                </TabsTrigger>
                <TabsTrigger value="prizes">
                  <Gift className="h-4 w-4" /> Giải thưởng ({state?.prizes.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="results">
                  <BarChart3 className="h-4 w-4" /> Kết quả trực tiếp ({state?.draws.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="checklist" data-testid="tab-checklist">
                  <ClipboardCheck className="h-4 w-4" /> Kiểm tra trước sự kiện
                </TabsTrigger>
                <TabsTrigger value="danger">
                  <ShieldAlert className="h-4 w-4" /> Xem trước & Vùng nguy hiểm
                </TabsTrigger>
              </TabsList>

              <TabsContent value="event">
                <EventTab
                  event={selectedEvent}
                  hasRealDraws={state?.locks.hasRealDraws ?? false}
                  onRefresh={loadState}
                  onFeedback={showFeedback}
                />
              </TabsContent>

              <TabsContent value="tickets">
                <TicketsTab
                  event={selectedEvent}
                  excludedTickets={state?.excludedTickets ?? []}
                  locks={state!.locks}
                  poolStats={state!.poolStats}
                  onRefresh={loadState}
                  onFeedback={showFeedback}
                />
              </TabsContent>

              <TabsContent value="prizes">
                <PrizesTab
                  eventId={selectedEvent.id!}
                  prizes={state?.prizes ?? []}
                  onRefresh={loadState}
                  onFeedback={showFeedback}
                />
              </TabsContent>

              <TabsContent value="results">
                <LiveResultsTab
                  event={selectedEvent}
                  prizes={state?.prizes ?? []}
                  draws={state?.draws ?? []}
                  realtimeConnected={realtimeConnected}
                />
              </TabsContent>

              <TabsContent value="checklist">
                <RehearsalChecklist
                  eventId={selectedEvent.id}
                  onEventChanged={() => loadState(selectedEvent.id)}
                  onFeedback={showFeedback}
                />
              </TabsContent>

              <TabsContent value="danger">
                <DangerAndPreviewTab
                  event={selectedEvent}
                  prizes={state?.prizes ?? []}
                  excludedTickets={state?.excludedTickets ?? []}
                  auditLogs={state?.auditLogs ?? []}
                  locks={state!.locks}
                  onRefresh={loadState}
                  onFeedback={showFeedback}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      {/* Create Event Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo Sự Kiện Quay Số Mới</DialogTitle>
            <DialogDescription>
              Sự kiện mới mặc định bật Chế độ Thử để bạn kiểm tra thử nghiệm trước khi chạy chính thức.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateEvent} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-ev-title">Tên sự kiện</Label>
              <Input
                id="new-ev-title"
                required
                minLength={3}
                placeholder="Đêm Hội Hồng Ân 2026"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-ev-parish">Tên giáo xứ</Label>
              <Input
                id="new-ev-parish"
                required
                minLength={3}
                placeholder="Giáo Xứ Thánh Tâm"
                value={newParish}
                onChange={(e) => setNewParish(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-ev-digits">Số chữ số</Label>
                <Input
                  id="new-ev-digits"
                  type="number"
                  min={3}
                  max={7}
                  value={newDigits}
                  onChange={(e) => setNewDigits(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-ev-from">Từ số</Label>
                <Input
                  id="new-ev-from"
                  type="number"
                  min={0}
                  value={newFrom}
                  onChange={(e) => setNewFrom(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-ev-to">Đến số</Label>
                <Input
                  id="new-ev-to"
                  type="number"
                  min={0}
                  value={newTo}
                  onChange={(e) => setNewTo(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={creatingEvent}>
                {creatingEvent ? 'Đang tạo...' : 'Tạo sự kiện'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

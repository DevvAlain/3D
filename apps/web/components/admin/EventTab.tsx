'use client';

import * as React from 'react';
import { AlertTriangle, Lock, Music, Save, Upload } from 'lucide-react';
import type { Event, EventTheme } from '@church/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface EventTabProps {
  event: Event;
  hasRealDraws: boolean;
  onRefresh: (eventId?: string) => Promise<void>;
  onFeedback: (type: 'success' | 'error', msg: string) => void;
}

export function EventTab({ event, hasRealDraws, onRefresh, onFeedback }: EventTabProps) {
  const [title, setTitle] = React.useState(event.title);
  const [parishName, setParishName] = React.useState(event.parish_name);
  const [theme, setTheme] = React.useState<EventTheme>(event.theme);
  const [primaryColor, setPrimaryColor] = React.useState(event.primary_color);
  const [isActive, setIsActive] = React.useState(event.is_active);
  const [testMode, setTestMode] = React.useState(event.test_mode);
  const [saving, setSaving] = React.useState(false);
  const [activating, setActivating] = React.useState(false);
  const [uploadingKind, setUploadingKind] = React.useState<'logo' | 'music' | null>(null);

  React.useEffect(() => {
    setTitle(event.title);
    setParishName(event.parish_name);
    setTheme(event.theme);
    setPrimaryColor(event.primary_color);
    setIsActive(event.is_active);
    setTestMode(event.test_mode);
  }, [event]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!event.id) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        id: event.id,
        title: title.trim(),
        parish_name: parishName.trim(),
        theme,
        primary_color: primaryColor,
        is_active: isActive,
      };
      if (!hasRealDraws) {
        payload.test_mode = testMode;
      }

      const res = await fetch('/api/admin/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        onFeedback('error', json.error || 'Không thể lưu cấu hình sự kiện.');
        return;
      }
      onFeedback('success', 'Đã lưu thông tin sự kiện.');
      await onRefresh(event.id);
    } catch {
      onFeedback('error', 'Lỗi kết nối khi lưu thông tin sự kiện.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAtomicActivate() {
    if (!event.id || event.is_active) return;
    setActivating(true);
    try {
      const res = await fetch('/api/admin/activate-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        onFeedback('error', json.error || 'Không thể kích hoạt sự kiện.');
        return;
      }
      onFeedback('success', `Đã kích hoạt sự kiện "${event.title}" cho màn hình Display.`);
      await onRefresh(event.id);
    } catch {
      onFeedback('error', 'Lỗi kết nối khi kích hoạt sự kiện.');
    } finally {
      setActivating(false);
    }
  }

  async function handleFileUpload(kind: 'logo' | 'music', file: File | undefined) {
    if (!file || !event.id) return;
    setUploadingKind(kind);
    try {
      const formData = new FormData();
      formData.append('event_id', event.id);
      formData.append('kind', kind);
      formData.append('file', file);

      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        onFeedback('error', json.error || 'Tải tệp lên thất bại.');
        return;
      }
      onFeedback(
        'success',
        kind === 'logo' ? 'Đã cập nhật logo giáo xứ.' : 'Đã cập nhật nhạc nền sự kiện.'
      );
      await onRefresh(event.id);
    } catch {
      onFeedback('error', 'Lỗi kết nối khi tải tệp lên.');
    } finally {
      setUploadingKind(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Thông Tin Sự Kiện & Giao Diện</CardTitle>
          <CardDescription>
            Thiết lập tên chương trình, giáo xứ, chủ đề sân khấu và chế độ trình chiếu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ev-title">Tên sự kiện</Label>
                <Input
                  id="ev-title"
                  required
                  minLength={3}
                  maxLength={150}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ev-parish">Tên giáo xứ / đơn vị</Label>
                <Input
                  id="ev-parish"
                  required
                  minLength={3}
                  maxLength={150}
                  value={parishName}
                  onChange={(e) => setParishName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ev-theme">Chủ đề (Theme)</Label>
                <select
                  id="ev-theme"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as EventTheme)}
                  className="flex h-10 w-full rounded-lg border border-parish-gold/25 bg-parish-navy/90 px-3 py-2 text-sm text-parish-cream focus:outline-none focus:ring-2 focus:ring-parish-gold/60"
                >
                  <option value="classic">Cổ Điển (Kính màu Vàng - Xanh Đêm)</option>
                  <option value="christmas">Giáng Sinh (Đỏ Rượu - Ánh Vàng)</option>
                  <option value="easter">Phục Sinh (Trắng Kem - Ánh Sáng)</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ev-color">Màu nhấn chính (Hex)</Label>
                <div className="flex items-center gap-2">
                  <input
                    aria-label="Chọn màu chính"
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded-lg border border-parish-gold/30 bg-transparent p-1"
                  />
                  <Input
                    id="ev-color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-parish-gold/20 bg-parish-navy/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-parish-cream">Kích hoạt hiển thị trên Display</p>
                  <p className="text-xs text-parish-cream/65">
                    Chỉ 1 sự kiện được kích hoạt tại một thời điểm (thực thi nguyên tử trong 1 transaction).
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {!event.is_active ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={activating}
                      onClick={() => void handleAtomicActivate()}
                    >
                      {activating ? 'Đang kích hoạt...' : 'Kích hoạt ngay'}
                    </Button>
                  ) : null}
                  <Switch
                    aria-label="Kích hoạt hiển thị trên Display"
                    checked={isActive}
                    onCheckedChange={setIsActive}
                  />
                </div>
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-parish-cream">Chế độ quay thử (Test Mode)</p>
                      {hasRealDraws ? (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                          <Lock className="h-3 w-3" /> Đã khóa
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-parish-cream/65">
                      Kết quả quay thử tách biệt hoàn toàn với kết quả chính thức và có thể xóa sạch bất kỳ lúc nào.
                    </p>
                  </div>
                  <Switch
                    aria-label="Chế độ quay thử"
                    checked={testMode}
                    disabled={hasRealDraws}
                    onCheckedChange={setTestMode}
                  />
                </div>

                <Alert variant={testMode ? 'destructive' : 'warning'} className="mt-3">
                  <AlertTriangle className="mb-1 inline h-4 w-4 mr-1.5" />
                  <AlertTitle className="inline">
                    {testMode
                      ? 'CẢNH BÁO: SỰ KIỆN ĐANG Ở CHẾ ĐỘ THỬ (TEST MODE)'
                      : 'Lưu ý trước khi chuyển chế độ'}
                  </AlertTitle>
                  <AlertDescription className="mt-1">
                    {testMode
                      ? 'Màn hình Display sẽ hiển thị băng rôn đỏ "CHẾ ĐỘ THỬ" rất lớn. Đừng quên tắt chế độ này trước khi bắt đầu giờ quay chính thức!'
                      : hasRealDraws
                        ? 'Sự kiện đã có lượt quay chính thức nên không thể chuyển về Chế độ Thử nữa (trừ khi thực hiện Reset toàn bộ sự kiện).'
                        : 'Đảm bảo đã tắt Chế độ Thử khi bước vào chương trình chính thức trước cộng đoàn.'}
                  </AlertDescription>
                </Alert>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? 'Đang lưu...' : 'Lưu thay đổi sự kiện'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tài Nguyên Sân Khấu</CardTitle>
          <CardDescription>Logo giáo xứ (PNG/JPG/WEBP) và nhạc nền sự kiện.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Logo Giáo Xứ / Sự Kiện</Label>
            {event.logo_url ? (
              <div className="flex items-center justify-center rounded-xl border border-parish-gold/25 bg-parish-navy/80 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={event.logo_url}
                  alt="Logo sự kiện"
                  className="max-h-32 w-auto rounded-lg object-contain"
                />
              </div>
            ) : (
              <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-parish-gold/25 text-xs text-parish-cream/50">
                Chưa tải lên logo
              </div>
            )}
            <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-parish-gold/30 bg-parish-navy/70 px-3 py-2 text-xs font-semibold text-parish-goldLight hover:bg-parish-gold/10">
              <Upload className="h-4 w-4" />
              {uploadingKind === 'logo' ? 'Đang tải logo...' : 'Tải lên Logo (PNG, JPG, WEBP)'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={uploadingKind !== null}
                onChange={(e) => handleFileUpload('logo', e.target.files?.[0])}
              />
            </label>
          </div>

          <div className="space-y-3 border-t border-white/10 pt-5">
            <Label>Nhạc Nền Không Lời / Hiệu Ứng</Label>
            {event.bg_music_url ? (
              <div className="rounded-xl border border-parish-gold/25 bg-parish-navy/80 p-3">
                <audio controls src={event.bg_music_url} className="w-full" />
              </div>
            ) : (
              <div className="flex h-16 items-center justify-center gap-2 rounded-xl border border-dashed border-parish-gold/25 text-xs text-parish-cream/50">
                <Music className="h-4 w-4" /> Chưa có nhạc nền
              </div>
            )}
            <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-parish-gold/30 bg-parish-navy/70 px-3 py-2 text-xs font-semibold text-parish-goldLight hover:bg-parish-gold/10">
              <Upload className="h-4 w-4" />
              {uploadingKind === 'music' ? 'Đang tải nhạc...' : 'Tải lên Nhạc nền (MP3, WAV, OGG)'}
              <input
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/aac"
                className="sr-only"
                disabled={uploadingKind !== null}
                onChange={(e) => handleFileUpload('music', e.target.files?.[0])}
              />
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

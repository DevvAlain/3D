'use client';

import * as React from 'react';
import {
  ArrowDown,
  ArrowUp,
  Gauge,
  GripVertical,
  Lock,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  resolvePrizeSpeedMode,
  suggestDefaultSpeedModeForNewPrize,
  type PrizeSpeedMode,
} from '@church/shared';
import type { AdminPrizeWithStats } from '@/lib/admin-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PrizesTabProps {
  eventId: string;
  prizes: AdminPrizeWithStats[];
  onRefresh: (eventId?: string) => Promise<void>;
  onFeedback: (type: 'success' | 'error', msg: string) => void;
}

const SPEED_LABELS: Record<PrizeSpeedMode, string> = {
  fast: 'Nhanh (~8s)',
  full: 'Đầy đủ (~17s)',
};

export function PrizesTab({ eventId, prizes, onRefresh, onFeedback }: PrizesTabProps) {
  const [orderedPrizes, setOrderedPrizes] = React.useState<AdminPrizeWithStats[]>(prizes);
  const [name, setName] = React.useState('');
  const [reward, setReward] = React.useState('');
  const [quantity, setQuantity] = React.useState(1);
  const [speedMode, setSpeedMode] = React.useState<PrizeSpeedMode>('fast');
  const [speedTouched, setSpeedTouched] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editReward, setEditReward] = React.useState('');
  const [editQty, setEditQty] = React.useState(1);
  const [editSpeedMode, setEditSpeedMode] = React.useState<PrizeSpeedMode>('fast');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    setOrderedPrizes(prizes);
  }, [prizes]);

  // Smart default for new prizes unless operator manually overrides:
  // top prizes (Đặc Biệt / Nhất / single highest tier) default to 'full', small ones default to 'fast'
  React.useEffect(() => {
    if (speedTouched) return;
    const nextSort =
      orderedPrizes.length > 0 ? Math.max(...orderedPrizes.map((p) => p.sort_order)) + 1 : 0;
    const suggested = suggestDefaultSpeedModeForNewPrize({
      name,
      quantity: Number(quantity) || 1,
      sortOrder: nextSort,
      existingPrizes: orderedPrizes,
    });
    setSpeedMode(suggested);
  }, [name, quantity, orderedPrizes, speedTouched]);

  async function handleCreatePrize(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const nextSortOrder =
        orderedPrizes.length > 0 ? Math.max(...orderedPrizes.map((p) => p.sort_order)) + 1 : 0;

      const res = await fetch('/api/admin/prizes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          name: name.trim(),
          reward: reward.trim(),
          quantity: Number(quantity),
          sort_order: nextSortOrder,
          speed_mode: speedMode,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        onFeedback('error', json.error || 'Không thể thêm giải thưởng.');
        return;
      }
      setName('');
      setReward('');
      setQuantity(1);
      setSpeedTouched(false);
      onFeedback('success', `Đã thêm giải thưởng mới (${SPEED_LABELS[speedMode]}).`);
      await onRefresh(eventId);
    } catch {
      onFeedback('error', 'Lỗi kết nối khi thêm giải thưởng.');
    } finally {
      setCreating(false);
    }
  }

  function startEditing(prize: AdminPrizeWithStats) {
    setEditingId(prize.id ?? null);
    setEditName(prize.name);
    setEditReward(prize.reward);
    setEditQty(prize.quantity);
    setEditSpeedMode(resolvePrizeSpeedMode(prize, orderedPrizes));
  }

  async function handleSaveEdit(prize: AdminPrizeWithStats) {
    if (!prize.id) return;
    setBusyId(prize.id);
    try {
      const res = await fetch('/api/admin/prizes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: prize.id,
          name: editName.trim(),
          reward: editReward.trim(),
          quantity: Number(editQty),
          speed_mode: editSpeedMode,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        onFeedback('error', json.error || 'Không thể cập nhật giải thưởng.');
        return;
      }
      setEditingId(null);
      onFeedback('success', 'Đã cập nhật thông tin & tốc độ giải thưởng.');
      await onRefresh(eventId);
    } catch {
      onFeedback('error', 'Lỗi kết nối khi cập nhật giải thưởng.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleSpeedMode(prize: AdminPrizeWithStats) {
    if (!prize.id) return;
    const current = resolvePrizeSpeedMode(prize, orderedPrizes);
    const nextSpeed: PrizeSpeedMode = current === 'full' ? 'fast' : 'full';
    setBusyId(prize.id);
    try {
      const res = await fetch('/api/admin/prizes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: prize.id,
          speed_mode: nextSpeed,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        onFeedback('error', json.error || 'Không thể đổi tốc độ quay của giải thưởng.');
        return;
      }
      onFeedback(
        'success',
        `Đã chuyển "${prize.name}" sang chế độ quay ${SPEED_LABELS[nextSpeed]}.`
      );
      await onRefresh(eventId);
    } catch {
      onFeedback('error', 'Lỗi kết nối khi cập nhật tốc độ quay.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeletePrize(prize: AdminPrizeWithStats) {
    if (!prize.id || prize.total_draws_count > 0) return;
    setBusyId(prize.id);
    try {
      const res = await fetch(`/api/admin/prizes?id=${encodeURIComponent(prize.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        onFeedback('error', json.error || 'Không thể xóa giải thưởng.');
        return;
      }
      onFeedback('success', `Đã xóa "${prize.name}".`);
      await onRefresh(eventId);
    } catch {
      onFeedback('error', 'Lỗi kết nối khi xóa giải thưởng.');
    } finally {
      setBusyId(null);
    }
  }

  async function persistNewOrder(nextList: AdminPrizeWithStats[]) {
    setOrderedPrizes(nextList);
    const orders = nextList
      .filter((p) => Boolean(p.id))
      .map((p, idx) => ({ id: p.id as string, sort_order: idx }));

    try {
      const res = await fetch('/api/admin/prizes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, orders }),
      });
      const json = await res.json();
      if (!res.ok) {
        onFeedback('error', json.error || 'Không thể cập nhật thứ tự giải.');
        await onRefresh(eventId);
        return;
      }
      onFeedback('success', 'Đã cập nhật thứ tự quay thưởng.');
      await onRefresh(eventId);
    } catch {
      onFeedback('error', 'Lỗi kết nối khi sắp xếp giải thưởng.');
      await onRefresh(eventId);
    }
  }

  function moveItem(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx || toIdx < 0 || toIdx >= orderedPrizes.length) return;
    const copy = [...orderedPrizes];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    void persistNewOrder(copy);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Thêm Giải Thưởng Mới</CardTitle>
          <CardDescription>
            Thứ tự từ trên xuống dưới là thứ tự sân khấu sẽ tự động quay lần lượt. Thường xếp giải nhỏ trước (Nhanh ~8s), giải Đặc Biệt / Nhất sau cùng (Đầy đủ ~17s).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreatePrize} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pz-name">Tên giải thưởng</Label>
              <Input
                id="pz-name"
                required
                placeholder="Ví dụ: Giải Khuyến Khích"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pz-reward">Hiện vật / Giá trị</Label>
              <Input
                id="pz-reward"
                required
                placeholder="Ví dụ: Quạt máy cao cấp / 500.000đ"
                value={reward}
                onChange={(e) => setReward(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pz-qty">Số lượng giải</Label>
                <Input
                  id="pz-qty"
                  type="number"
                  required
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pz-speed">Tốc độ quay số</Label>
                <select
                  id="pz-speed"
                  value={speedMode}
                  onChange={(e) => {
                    setSpeedMode(e.target.value as PrizeSpeedMode);
                    setSpeedTouched(true);
                  }}
                  className="flex h-10 w-full rounded-lg border border-parish-gold/25 bg-parish-navy/90 px-3 py-2 text-sm text-parish-cream focus:outline-none focus:ring-2 focus:ring-parish-gold/60"
                >
                  <option value="fast">Nhanh (~8s)</option>
                  <option value="full">Đầy đủ (~17s)</option>
                </select>
              </div>
            </div>
            <p className="text-[11px] text-parish-cream/60">
              Mặc định gợi ý: giải lớn (Đặc Biệt, Nhất) chạy <strong>Đầy đủ (~17s)</strong> hồi hộp; giải nhỏ nhiều lượt chạy <strong>Nhanh (~8s)</strong>. Trên sân khấu vẫn luôn bấm <kbd className="rounded bg-white/10 px-1">Space</kbd> để mở ngay.
            </p>
            <Button type="submit" className="w-full" disabled={creating}>
              <Plus className="h-4 w-4" />
              {creating ? 'Đang thêm...' : 'Thêm giải thưởng'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Cơ Cấu Giải Thưởng ({orderedPrizes.length} hạng mục)</CardTitle>
          <CardDescription>
            Kéo thả hoặc nhấn nút mũi tên để thay đổi thứ tự quay. Bấm vào nhãn tốc độ để chuyển đổi nhanh giữa &ldquo;Nhanh (~8s)&rdquo; và &ldquo;Đầy đủ (~17s)&rdquo;.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orderedPrizes.length === 0 ? (
            <p className="py-8 text-center text-sm text-parish-cream/60">
              Chưa có giải thưởng nào. Hãy thêm giải đầu tiên ở cột bên trái.
            </p>
          ) : (
            <div className="space-y-3">
              {orderedPrizes.map((prize, idx) => {
                const isEditing = editingId === prize.id;
                const lockedDelete = prize.total_draws_count > 0;
                const effectiveSpeed = resolvePrizeSpeedMode(prize, orderedPrizes);
                return (
                  <div
                    key={prize.id ?? idx}
                    draggable={!isEditing}
                    onDragStart={() => setDragIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null) {
                        moveItem(dragIndex, idx);
                        setDragIndex(null);
                      }
                    }}
                    className="rounded-xl border border-parish-gold/25 bg-parish-navy/60 p-4 transition-colors hover:border-parish-gold/50"
                  >
                    {isEditing ? (
                      <div className="grid gap-3 sm:grid-cols-5">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Tên giải"
                        />
                        <Input
                          value={editReward}
                          onChange={(e) => setEditReward(e.target.value)}
                          placeholder="Hiện vật"
                        />
                        <div>
                          <Input
                            type="number"
                            min={prize.min_allowed_quantity}
                            value={editQty}
                            onChange={(e) => setEditQty(Number(e.target.value))}
                          />
                          {prize.min_allowed_quantity > 1 ? (
                            <p className="mt-1 text-[11px] text-amber-300">
                              Tối thiểu: {prize.min_allowed_quantity}
                            </p>
                          ) : null}
                        </div>
                        <select
                          aria-label="Tốc độ quay giải thưởng"
                          value={editSpeedMode}
                          onChange={(e) => setEditSpeedMode(e.target.value as PrizeSpeedMode)}
                          className="h-10 w-full rounded-lg border border-parish-gold/25 bg-parish-navy/90 px-2.5 text-xs text-parish-cream"
                        >
                          <option value="fast">Nhanh (~8s)</option>
                          <option value="full">Đầy đủ (~17s)</option>
                        </select>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            disabled={busyId === prize.id}
                            onClick={() => handleSaveEdit(prize)}
                          >
                            <Save className="h-3.5 w-3.5" /> Lưu
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                            Hủy
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <GripVertical className="h-5 w-5 cursor-grab text-parish-gold/60" />
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-parish-gold">#{idx + 1}</span>
                              <span className="font-semibold text-parish-cream">{prize.name}</span>
                              <Badge variant="default">
                                {prize.won_mode_count}/{prize.quantity} đã trao
                              </Badge>
                              <button
                                type="button"
                                disabled={busyId === prize.id}
                                onClick={() => void handleToggleSpeedMode(prize)}
                                title="Bấm để chuyển giữa Nhanh (~8s) và Đầy đủ (~17s)"
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                                  effectiveSpeed === 'full'
                                    ? 'border-parish-gold/55 bg-parish-gold/15 text-parish-goldLight hover:bg-parish-gold/25'
                                    : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                                }`}
                              >
                                {effectiveSpeed === 'full' ? (
                                  <Sparkles className="h-3 w-3" />
                                ) : (
                                  <Gauge className="h-3 w-3" />
                                )}
                                {SPEED_LABELS[effectiveSpeed]}
                              </button>
                              {lockedDelete ? (
                                <Badge variant="muted">
                                  <Lock className="h-3 w-3" /> Đã phát sinh quay ({prize.total_draws_count})
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-sm text-parish-cream/75">{prize.reward}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={idx === 0}
                            onClick={() => moveItem(idx, idx - 1)}
                            aria-label="Đưa giải lên trên"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={idx === orderedPrizes.length - 1}
                            onClick={() => moveItem(idx, idx + 1)}
                            aria-label="Đưa giải xuống dưới"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => startEditing(prize)}>
                            Sửa
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={lockedDelete || busyId === prize.id}
                            onClick={() => handleDeletePrize(prize)}
                            title={
                              lockedDelete
                                ? 'Không thể xóa giải đã có lịch sử quay số'
                                : 'Xóa giải thưởng'
                            }
                            aria-label={`Xóa giải ${prize.name}`}
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

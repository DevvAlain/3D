'use client';

import { SW_PRECACHE_SOUNDS } from '@/lib/sw-policy';

export const STAGE_SOUND_ASSETS = SW_PRECACHE_SOUNDS;

export interface AssetPreloadProgress {
  loaded: number;
  total: number;
  percent: number;
  currentLabel: string;
  done: boolean;
  warnings: string[];
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallbackValue), ms);
    }),
  ]);
}

async function warmFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await Promise.allSettled([
      document.fonts.load('700 48px "Playfair Display"'),
      document.fonts.load('600 18px "Be Vietnam Pro"'),
      document.fonts.load('800 48px "JetBrains Mono"'),
    ]);
    await document.fonts.ready;
  } catch {
    // Non-fatal fallback to bundled system font metrics
  }
}

function warmDigitCanvasGlyphs(): void {
  if (typeof document === 'undefined') return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = '800 32px "JetBrains Mono", "Be Vietnam Pro", monospace';
    for (let d = 0; d <= 9; d++) {
      ctx.fillText(String(d), 16, 40);
    }
    ctx.font = '700 32px "Playfair Display", serif';
    ctx.fillText('✦', 16, 40);
  } catch {
    // Non-fatal
  }
}

async function warmStageCanvasesAndTextures(): Promise<boolean> {
  warmDigitCanvasGlyphs();
  try {
    const texMod = await import('@/components/three/textures');
    texMod.warmStageTextureCanvases();
    return true;
  } catch {
    return false;
  }
}

async function preloadSoundUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return false;
    await res.arrayBuffer();
    return true;
  } catch {
    return false;
  }
}

async function preloadRapierWasm(): Promise<boolean> {
  try {
    const rapierMod = (await import('@dimforge/rapier3d-compat')) as {
      init?: () => Promise<void>;
      default?: { init?: () => Promise<void> };
    };
    const initFn = rapierMod.init ?? rapierMod.default?.init;
    if (typeof initFn === 'function') {
      await initFn();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Preloads self-hosted fonts, local WAV audio effects, Canvas2D glyph atlas, and Rapier WASM
 * before stage entry so live prize draws run smoothly without asset stalls.
 */
export async function preloadStageAssets(options: {
  bgMusicUrl?: string | null;
  includeWasm?: boolean;
  timeoutMs?: number;
  onProgress?: (progress: AssetPreloadProgress) => void;
}): Promise<AssetPreloadProgress> {
  const { bgMusicUrl, includeWasm = true, timeoutMs = 6000, onProgress } = options;

  const warnings: string[] = [];
  const tasks: Array<{ label: string; run: () => Promise<boolean> }> = [
    {
      label: 'Đang nạp font chữ & kết xuất đồ họa vé 3D...',
      run: async () => {
        await warmFonts();
        return warmStageCanvasesAndTextures();
      },
    },
    ...STAGE_SOUND_ASSETS.map((url) => ({
      label: `Đang nạp âm thanh (${url.split('/').pop() ?? url})...`,
      run: () => preloadSoundUrl(url),
    })),
  ];

  if (bgMusicUrl) {
    tasks.push({
      label: 'Đang kiểm tra nhạc nền sự kiện...',
      run: () => preloadSoundUrl(bgMusicUrl),
    });
  }

  if (includeWasm) {
    tasks.push({
      label: 'Đang khởi tạo bộ vật lý 3D (Rapier WASM)...',
      run: () => preloadRapierWasm(),
    });
  }

  const total = tasks.length;
  let loaded = 0;

  const emit = (currentLabel: string, done: boolean): AssetPreloadProgress => {
    const snapshot: AssetPreloadProgress = {
      loaded,
      total,
      percent: total === 0 ? 100 : Math.min(100, Math.round((loaded / total) * 100)),
      currentLabel,
      done,
      warnings: [...warnings],
    };
    onProgress?.(snapshot);
    return snapshot;
  };

  emit(tasks[0]?.label ?? 'Đang chuẩn bị sân khấu...', false);

  const runAll = Promise.all(
    tasks.map(async (task) => {
      const ok = await task.run();
      loaded += 1;
      if (!ok) {
        warnings.push(task.label);
      }
      emit(loaded >= total ? 'Sẵn sàng trình chiếu!' : task.label, loaded >= total);
    })
  );

  await withTimeout(runAll, timeoutMs, undefined);

  loaded = total;
  return emit('Tất cả tài nguyên sân khấu đã sẵn sàng!', true);
}

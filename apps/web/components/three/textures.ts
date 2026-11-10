'use client';

import * as THREE from 'three';

export const BALL_DIGIT_PALETTE: ReadonlyArray<{
  base: string;
  highlight: string;
  shadow: string;
}> = [
  { base: '#D98A00', highlight: '#FFCC33', shadow: '#6B3D00' }, // 0: Imperial Gold
  { base: '#C4082F', highlight: '#F43F5E', shadow: '#4C0313' }, // 1: Ruby Stained Glass
  { base: '#0D47E5', highlight: '#3B82F6', shadow: '#061B66' }, // 2: Cathedral Sapphire
  { base: '#058C5B', highlight: '#10B981', shadow: '#023B26' }, // 3: Liturgical Emerald
  { base: '#701CC2', highlight: '#A855F7', shadow: '#2B0752' }, // 4: Deep Amethyst
  { base: '#CC5500', highlight: '#F59E0B', shadow: '#541D00' }, // 5: Venetian Amber
  { base: '#027A8F', highlight: '#06B6D4', shadow: '#013440' }, // 6: Aegean Teal
  { base: '#B80B5C', highlight: '#EC4899', shadow: '#4A0325' }, // 7: Carmine Rose
  { base: '#312E9E', highlight: '#6366F1', shadow: '#13114D' }, // 8: Cobalt Indigo
  { base: '#B91C1C', highlight: '#EF4444', shadow: '#4F0808' }, // 9: Warm Vermilion
];

const ballCanvasCache = new Map<number, HTMLCanvasElement>();
const slotCanvasCache = new Map<string, HTMLCanvasElement>();
let goldDustCanvasCache: HTMLCanvasElement | null = null;
let snowflakeCanvasCache: HTMLCanvasElement | null = null;
let petalCanvasCache: HTMLCanvasElement | null = null;

export function clearWarmTextureCaches(): void {
  ballCanvasCache.clear();
  slotCanvasCache.clear();
  goldDustCanvasCache = null;
  snowflakeCanvasCache = null;
  petalCanvasCache = null;
}

function buildBallDigitCanvas(digit: number): HTMLCanvasElement {
  const safeDigit = ((digit % 10) + 10) % 10;
  const cached = ballCanvasCache.get(safeDigit);
  if (cached) return cached;

  const palette = BALL_DIGIT_PALETTE[safeDigit];

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Rich saturated jewel glass body (deep tones prevent milky pastel wash under bright light)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, size);
    bgGrad.addColorStop(0, palette.highlight);
    bgGrad.addColorStop(0.28, palette.base);
    bgGrad.addColorStop(0.75, palette.base);
    bgGrad.addColorStop(1, palette.shadow);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, size, size);

    // Subtle dark jewel depth vignetting along seam band without milky white opacity
    ctx.fillStyle = 'rgba(10, 12, 28, 0.14)';
    ctx.fillRect(0, size * 0.44, size, size * 0.12);

    // Sleek fine metallic gold pinstripe border lines
    ctx.strokeStyle = 'rgba(248, 206, 98, 0.78)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.44);
    ctx.lineTo(size, size * 0.44);
    ctx.moveTo(0, size * 0.56);
    ctx.lineTo(size, size * 0.56);
    ctx.stroke();

    // Compact dual opposite number medallions (u=0.25 and u=0.75) so >85% stays vivid jewel color
    const centers = [size * 0.25, size * 0.75];
    for (const cx of centers) {
      const cy = size * 0.5;
      const radius = size * 0.132;

      // Outer luminous gold ring
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#F5C451';
      ctx.fill();

      // Warm ivory glass medallion core
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#FFF6DC';
      ctx.fill();

      // Inner jewel accent hairline
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 3.2, 0, Math.PI * 2);
      ctx.strokeStyle = palette.shadow;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // High-contrast digit numeral (horizontally squashed to counter equirectangular UV stretch)
      ctx.save();
      ctx.translate(cx, cy + 1.5);
      ctx.scale(0.66, 1);
      ctx.font = '800 46px "JetBrains Mono", "Be Vietnam Pro", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#080D23';
      ctx.fillText(String(safeDigit), 0, 0);
      ctx.restore();
    }
  }

  ballCanvasCache.set(safeDigit, canvas);
  return canvas;
}

/**
 * Generates an equirectangular stained-glass jewel ball CanvasTexture with rich
 * saturated colors, dual gold-trimmed medallions, and high-contrast digit glyphs.
 */
export function createBallDigitTexture(digit: number): THREE.CanvasTexture {
  const canvas = buildBallDigitCanvas(digit);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export type SlotVisualState = 'idle' | 'hidden' | 'revealed';

function buildSlotDigitCanvas(
  label: string,
  state: SlotVisualState
): HTMLCanvasElement {
  const cacheKey = `${state}:${label}`;
  const cached = slotCanvasCache.get(cacheKey);
  if (cached) return cached;

  const width = 256;
  const height = 320;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    if (state === 'revealed') {
      bg.addColorStop(0, '#FFF8DF');
      bg.addColorStop(0.55, '#F9D66B');
      bg.addColorStop(1, '#D8961E');
    } else if (state === 'hidden') {
      bg.addColorStop(0, '#22174D');
      bg.addColorStop(1, '#0F1536');
    } else {
      bg.addColorStop(0, '#131D46');
      bg.addColorStop(1, '#080D23');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Ornate inset brass hairline border
    ctx.strokeStyle =
      state === 'revealed'
        ? 'rgba(130, 82, 10, 0.55)'
        : state === 'hidden'
          ? 'rgba(245, 196, 81, 0.7)'
          : 'rgba(245, 196, 81, 0.35)';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, width - 28, height - 28);

    // Top specular glass sheen
    const sheen = ctx.createLinearGradient(0, 0, 0, height * 0.45);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.24)');
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(14, 14, width - 28, height * 0.42);

    // Center symbol / digit
    ctx.font =
      state === 'revealed'
        ? '900 176px "JetBrains Mono", "Be Vietnam Pro", monospace'
        : '700 120px "Playfair Display", "Be Vietnam Pro", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle =
      state === 'revealed'
        ? '#0B1230'
        : state === 'hidden'
          ? 'rgba(255, 233, 168, 0.75)'
          : 'rgba(245, 196, 81, 0.42)';
    ctx.fillText(label, width / 2, height / 2 + 4);
  }

  slotCanvasCache.set(cacheKey, canvas);
  return canvas;
}

/**
 * Generates a pre-baked backlit plaque CanvasTexture for one digit slot on stage.
 */
export function createSlotDigitTexture(
  label: string,
  state: SlotVisualState
): THREE.CanvasTexture {
  const canvas = buildSlotDigitCanvas(label, state);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function buildGoldDustCanvas(): HTMLCanvasElement {
  if (goldDustCanvasCache) return goldDustCanvasCache;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    grad.addColorStop(0, 'rgba(255, 250, 220, 1)');
    grad.addColorStop(0.35, 'rgba(245, 196, 81, 0.75)');
    grad.addColorStop(1, 'rgba(245, 196, 81, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  goldDustCanvasCache = canvas;
  return canvas;
}

/**
 * Generates a soft warm radial glow sprite for floating atmospheric gold dust and bursts.
 */
export function createGoldDustTexture(): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(buildGoldDustCanvas());
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function buildSnowflakeCanvas(): HTMLCanvasElement {
  if (snowflakeCanvasCache) return snowflakeCanvasCache;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const half = size / 2;
    const glow = ctx.createRadialGradient(half, half, 0, half, half, half);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    glow.addColorStop(0.45, 'rgba(224, 244, 255, 0.55)');
    glow.addColorStop(1, 'rgba(224, 244, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.2;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(half, half);
      ctx.lineTo(half + cos * (half - 7), half + sin * (half - 7));
      ctx.stroke();

      // Tiny crystalline branchlets
      const bx = half + cos * (half * 0.55);
      const by = half + sin * (half * 0.55);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(a + 0.6) * 7, by + Math.sin(a + 0.6) * 7);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(a - 0.6) * 7, by + Math.sin(a - 0.6) * 7);
      ctx.stroke();
    }
  }
  snowflakeCanvasCache = canvas;
  return canvas;
}

/**
 * Generates a delicate 6-pointed frosted snow crystal sprite for the Christmas theme.
 */
export function createSnowflakeTexture(): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(buildSnowflakeCanvas());
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function buildPetalCanvas(): HTMLCanvasElement {
  if (petalCanvasCache) return petalCanvasCache;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.moveTo(size * 0.5, size * 0.08);
    ctx.bezierCurveTo(size * 0.92, size * 0.25, size * 0.85, size * 0.85, size * 0.5, size * 0.94);
    ctx.bezierCurveTo(size * 0.15, size * 0.85, size * 0.08, size * 0.25, size * 0.5, size * 0.08);
    ctx.closePath();

    const grad = ctx.createRadialGradient(size * 0.5, size * 0.45, 2, size * 0.5, size * 0.5, size * 0.45);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.92)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.65)');
    ctx.fillStyle = grad;
    ctx.fill();
  }
  petalCanvasCache = canvas;
  return canvas;
}

/**
 * Generates a soft curved blossom petal alpha mask for Easter flower petals.
 */
export function createPetalTexture(): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(buildPetalCanvas());
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Synchronously pre-renders stage offscreen canvases after webfont readiness
 * so cold-start CanvasTexture creation causes zero draw-frame hitching.
 */
export function warmStageTextureCanvases(): void {
  if (typeof document === 'undefined') return;
  for (let d = 0; d <= 9; d++) {
    buildBallDigitCanvas(d);
    buildSlotDigitCanvas(String(d), 'revealed');
  }
  buildSlotDigitCanvas('✦', 'idle');
  buildSlotDigitCanvas('?', 'hidden');
  buildGoldDustCanvas();
  buildSnowflakeCanvas();
  buildPetalCanvas();
}

/**
 * Disposes a list of textures safely.
 */
export function disposeTextureList(textures: Iterable<THREE.Texture>): void {
  for (const tex of textures) {
    tex.dispose();
  }
}

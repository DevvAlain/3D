'use client';

import * as THREE from 'three';

export const BALL_DIGIT_PALETTE: ReadonlyArray<{
  base: string;
  highlight: string;
  shadow: string;
}> = [
  { base: '#D4941C', highlight: '#FCE28A', shadow: '#7A4E06' }, // 0: Royal Gold
  { base: '#9E1B32', highlight: '#E55A73', shadow: '#4B0815' }, // 1: Sacred Burgundy
  { base: '#1D4ED8', highlight: '#7CA4FF', shadow: '#0E246E' }, // 2: Cathedral Sapphire
  { base: '#0F766E', highlight: '#52D1C2', shadow: '#063C38' }, // 3: Liturgical Emerald
  { base: '#6D28D9', highlight: '#B589FA', shadow: '#33106D' }, // 4: Advent Amethyst
  { base: '#B45309', highlight: '#F6B15C', shadow: '#5B2603' }, // 5: Candlelight Amber
  { base: '#0369A1', highlight: '#65C2F5', shadow: '#023250' }, // 6: Cerulean
  { base: '#BE123C', highlight: '#FB7185', shadow: '#5B061D' }, // 7: Crimson Rose
  { base: '#3730A3', highlight: '#8F88F7', shadow: '#1B1659' }, // 8: Vesper Indigo
  { base: '#A67C1E', highlight: '#F7DF8E', shadow: '#523C08' }, // 9: Antique Brass
];

/**
 * Generates an equirectangular ball CanvasTexture with dual opposite medallions
 * displaying the digit clearly from multiple camera angles as balls tumble.
 */
export function createBallDigitTexture(digit: number): THREE.CanvasTexture {
  const safeDigit = ((digit % 10) + 10) % 10;
  const palette = BALL_DIGIT_PALETTE[safeDigit];

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Rich spherical-friendly gradient body
    const bgGrad = ctx.createLinearGradient(0, 0, 0, size);
    bgGrad.addColorStop(0, palette.highlight);
    bgGrad.addColorStop(0.5, palette.base);
    bgGrad.addColorStop(1, palette.shadow);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, size, size);

    // Subtle metallic equatorial band
    ctx.fillStyle = 'rgba(255, 240, 195, 0.22)';
    ctx.fillRect(0, size * 0.43, size, size * 0.14);
    ctx.strokeStyle = 'rgba(255, 232, 165, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.43);
    ctx.lineTo(size, size * 0.43);
    ctx.moveTo(0, size * 0.57);
    ctx.lineTo(size, size * 0.57);
    ctx.stroke();

    // Draw two clean opposite medallions at u=0.25 and u=0.75 (x=64, x=192)
    const centers = [size * 0.25, size * 0.75];
    for (const cx of centers) {
      const cy = size * 0.5;
      const radius = size * 0.17;

      // Outer gold trim ring
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#F5C451';
      ctx.fill();

      // Cream ivory medallion center
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#FFF9E8';
      ctx.fill();

      // Subtle inner ring
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(180, 125, 30, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // High-contrast digit numeral (squashed horizontally ~0.62x to counter equirectangular stretch)
      ctx.save();
      ctx.translate(cx, cy + 2);
      ctx.scale(0.68, 1);
      ctx.font = '800 56px "JetBrains Mono", "Be Vietnam Pro", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0B1230';
      ctx.fillText(String(safeDigit), 0, 0);
      ctx.restore();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export type SlotVisualState = 'idle' | 'hidden' | 'revealed';

/**
 * Generates a pre-baked backlit plaque CanvasTexture for one digit slot on stage.
 */
export function createSlotDigitTexture(
  label: string,
  state: SlotVisualState
): THREE.CanvasTexture {
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

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates a soft warm radial glow sprite for floating atmospheric gold dust.
 */
export function createGoldDustTexture(): THREE.CanvasTexture {
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

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Disposes a list of textures safely.
 */
export function disposeTextureList(textures: Iterable<THREE.Texture>): void {
  for (const tex of textures) {
    tex.dispose();
  }
}

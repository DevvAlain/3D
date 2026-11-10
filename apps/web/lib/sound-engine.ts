'use client';

import { Howl, Howler } from 'howler';

export type SoundCue =
  | 'unlock'
  | 'spinStart'
  | 'ambient'
  | 'drumRoll'
  | 'tick'
  | 'ting'
  | 'fanfare';

/**
 * Local audio manager backed by Howler.js and self-hosted WAV assets in `/sounds/`.
 * Handles browser autoplay unlock safely on user interaction and cleanly unloads on unmount.
 */
export class DisplaySoundEngine {
  private unlockSfx: Howl | null = null;
  private spinStartSfx: Howl | null = null;
  private ambientPad: Howl | null = null;
  private drumRollSfx: Howl | null = null;
  private tickSfx: Howl | null = null;
  private tingSfx: Howl | null = null;
  private fanfareSfx: Howl | null = null;
  private bgMusic: Howl | null = null;
  private bgMusicUrl: string | null = null;
  private muted: boolean = false;
  private unlocked: boolean = false;

  constructor() {
    if (typeof window === 'undefined') return;

    this.unlockSfx = new Howl({
      src: ['/sounds/unlock-chime.wav'],
      volume: 0.45,
      preload: true,
    });

    this.spinStartSfx = new Howl({
      src: ['/sounds/draw-spin-start.wav'],
      volume: 0.5,
      preload: true,
    });

    this.ambientPad = new Howl({
      src: ['/sounds/ambient-shimmer.wav'],
      loop: true,
      volume: 0.14,
      preload: true,
    });

    this.drumRollSfx = new Howl({
      src: ['/sounds/drum-roll.wav'],
      loop: true,
      volume: 0.34,
      preload: true,
    });

    this.tickSfx = new Howl({
      src: ['/sounds/tick.wav'],
      volume: 0.42,
      preload: true,
    });

    this.tingSfx = new Howl({
      src: ['/sounds/ting.wav'],
      volume: 0.58,
      preload: true,
    });

    this.fanfareSfx = new Howl({
      src: ['/sounds/fanfare.wav'],
      volume: 0.64,
      preload: true,
    });
  }

  unlock(customBgMusicUrl?: string | null): void {
    this.unlocked = true;
    try {
      if (Howler.ctx && Howler.ctx.state === 'suspended') {
        void Howler.ctx.resume();
      }
      if (!this.muted) {
        this.unlockSfx?.play();
        this.syncBgMusic(customBgMusicUrl ?? null);
      }
    } catch {
      // Non-fatal if browser blocks audio context
    }
  }

  syncBgMusic(url: string | null): void {
    if (!this.unlocked) return;

    if (url && url !== this.bgMusicUrl) {
      this.ambientPad?.stop();
      this.bgMusic?.unload();
      this.bgMusicUrl = url;
      this.bgMusic = new Howl({
        src: [url],
        loop: true,
        volume: 0.25,
        html5: true,
      });
      if (!this.muted) {
        this.bgMusic.play();
      }
      return;
    }

    if (!url && this.bgMusic) {
      this.bgMusic.unload();
      this.bgMusic = null;
      this.bgMusicUrl = null;
    }

    if (!url && this.ambientPad && !this.ambientPad.playing() && !this.muted) {
      this.ambientPad.play();
    }
  }

  playSpinStart(): void {
    if (!this.unlocked || this.muted) return;
    try {
      this.spinStartSfx?.play();
    } catch {
      // Non-fatal audio playback fallback
    }
  }

  startDrumRoll(volume: number = 0.34): void {
    if (!this.unlocked || this.muted || !this.drumRollSfx) return;
    try {
      this.drumRollSfx.volume(volume);
      if (!this.drumRollSfx.playing()) {
        this.drumRollSfx.play();
      }
    } catch {
      // Non-fatal audio playback fallback
    }
  }

  setDrumRollVolume(volume: number): void {
    try {
      this.drumRollSfx?.volume(Math.max(0, Math.min(1, volume)));
    } catch {
      // Ignore
    }
  }

  stopDrumRoll(): void {
    try {
      this.drumRollSfx?.stop();
    } catch {
      // Ignore
    }
  }

  playTick(): void {
    if (!this.unlocked || this.muted) return;
    try {
      this.tickSfx?.play();
    } catch {
      // Non-fatal audio playback fallback
    }
  }

  playTing(): void {
    if (!this.unlocked || this.muted) return;
    try {
      this.tingSfx?.play();
    } catch {
      // Non-fatal audio playback fallback
    }
  }

  playFanfare(): void {
    this.stopDrumRoll();
    if (!this.unlocked || this.muted) return;
    try {
      this.fanfareSfx?.play();
    } catch {
      // Non-fatal audio playback fallback
    }
  }

  setMuted(nextMuted: boolean): void {
    this.muted = nextMuted;
    Howler.mute(nextMuted);
    if (nextMuted) {
      this.stopDrumRoll();
    } else if (this.unlocked) {
      if (this.bgMusic && !this.bgMusic.playing()) {
        this.bgMusic.play();
      } else if (!this.bgMusic && this.ambientPad && !this.ambientPad.playing()) {
        this.ambientPad.play();
      }
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  dispose(): void {
    this.stopDrumRoll();
    this.unlockSfx?.unload();
    this.spinStartSfx?.unload();
    this.ambientPad?.unload();
    this.drumRollSfx?.unload();
    this.tickSfx?.unload();
    this.tingSfx?.unload();
    this.fanfareSfx?.unload();
    this.bgMusic?.unload();
    this.unlockSfx = null;
    this.spinStartSfx = null;
    this.ambientPad = null;
    this.drumRollSfx = null;
    this.tickSfx = null;
    this.tingSfx = null;
    this.fanfareSfx = null;
    this.bgMusic = null;
  }
}

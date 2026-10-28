class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted = false;
  private lastPlayMs = 0;

  private getContext(): AudioContext | null {
    if (this.isMuted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
          return null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    delaySec: number,
    durationSec: number,
    peakGain: number,
    type: OscillatorType = 'sine'
  ) {
    const ctx = this.getContext();
    if (!ctx) return;

    const startTime = ctx.currentTime + delaySec;
    const stopTime = startTime + durationSec;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, startTime);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, freqEnd),
        stopTime
      );
    }

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, stopTime);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Ignore
      }
    };

    osc.start(startTime);
    osc.stop(stopTime + 0.01);
  }

  /**
   * Gentle wooden marimba pop when picking up a puzzle piece.
   */
  public playPickup() {
    const nowMs = performance.now();
    if (nowMs - this.lastPlayMs < 50) return;
    this.lastPlayMs = nowMs;

    const pitchJitter = 0.95 + Math.random() * 0.1;
    this.playTone(
      310 * pitchJitter,
      470 * pitchJitter,
      0,
      0.075,
      0.16,
      'sine'
    );
  }

  /**
   * Tactile wooden knock + cheerful rising xylophone chime when two pieces or a board slot connect!
   */
  public playSnapConnect(comboIndex = 0, isBoardLock = false) {
    const nowMs = performance.now();
    if (nowMs - this.lastPlayMs < 55) return;
    this.lastPlayMs = nowMs;

    const pentatonic = [
      523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51,
    ];
    const baseNote = pentatonic[comboIndex % pentatonic.length];
    const harmonyNote = pentatonic[(comboIndex + 2) % pentatonic.length];

    // 1. Tactile wooden snap click
    this.playTone(190, 95, 0, 0.045, 0.24, 'triangle');

    // 2. Cheerful xylophone chime
    const notes = isBoardLock
      ? [baseNote, harmonyNote, baseNote * 1.5]
      : [baseNote, harmonyNote];
    notes.forEach((freq, idx) => {
      this.playTone(freq, freq, idx * 0.06, 0.22, 0.2, 'sine');
    });
  }

  /**
   * Magical harp sparkle when using the child-friendly magnet helper.
   */
  public playMagicHint() {
    const nowMs = performance.now();
    if (nowMs - this.lastPlayMs < 60) return;
    this.lastPlayMs = nowMs;

    const sparkleFreqs = [587.33, 739.99, 880, 1174.66];
    sparkleFreqs.forEach((freq, i) => {
      this.playTone(freq, freq, i * 0.04, 0.18, 0.14, 'triangle');
    });
  }

  /**
   * Joyful triumphant children's fanfare when the whole picture is assembled!
   */
  public playVictoryFanfare() {
    this.lastPlayMs = performance.now();
    const melody = [
      { freq: 523.25, delay: 0.0, dur: 0.14 },
      { freq: 659.25, delay: 0.12, dur: 0.14 },
      { freq: 783.99, delay: 0.24, dur: 0.14 },
      { freq: 1046.5, delay: 0.36, dur: 0.24 },
      { freq: 783.99, delay: 0.58, dur: 0.14 },
      { freq: 1046.5, delay: 0.72, dur: 0.45 },
    ];

    melody.forEach(({ freq, delay, dur }) => {
      this.playTone(freq, freq, delay, dur, 0.22, 'triangle');
    });
  }
}

export const soundManager = new SoundManager();

class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted = false;

  private getContext(): AudioContext | null {
    if (this.isMuted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
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

  /**
   * Gentle wooden marimba pop when picking up a puzzle piece.
   */
  public playPickup() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const pitchJitter = 0.94 + Math.random() * 0.12;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(310 * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(480 * pitchJitter, now + 0.065);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * Tactile wooden knock + cheerful rising xylophone chime when two pieces or a board slot connect!
   */
  public playSnapConnect(comboIndex = 0, isBoardLock = false) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Pentatonic scale frequencies (C5, D5, E5, G5, A5, C6, D6, E6)
    const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];
    const baseNote = pentatonic[comboIndex % pentatonic.length];
    const harmonyNote = pentatonic[(comboIndex + 2) % pentatonic.length];

    // 1. Tactile wooden snap click
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(190, now);
    clickOsc.frequency.exponentialRampToValueAtTime(95, now + 0.045);

    clickGain.gain.setValueAtTime(0.28, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.055);

    // 2. Cheerful two-note xylophone chime
    const notes = isBoardLock ? [baseNote, harmonyNote, baseNote * 1.5] : [baseNote, harmonyNote];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.065;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.22, startTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    });
  }

  /**
   * Magical harp sparkle when using the child-friendly magnet helper.
   */
  public playMagicHint() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const sparkleFreqs = [587.33, 739.99, 880, 1174.66];
    sparkleFreqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.045;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.15, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  /**
   * Joyful triumphant children's fanfare when the whole picture is assembled!
   */
  public playVictoryFanfare() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // C5 -> E5 -> G5 -> C6 -> G5 -> C6!
    const melody = [
      { freq: 523.25, delay: 0.0, dur: 0.16 },
      { freq: 659.25, delay: 0.14, dur: 0.16 },
      { freq: 783.99, delay: 0.28, dur: 0.16 },
      { freq: 1046.5, delay: 0.42, dur: 0.28 },
      { freq: 783.99, delay: 0.68, dur: 0.15 },
      { freq: 1046.5, delay: 0.84, dur: 0.65 },
    ];

    melody.forEach(({ freq, delay, dur }) => {
      const t = now + delay;
      const osc = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(freq * 0.5, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.24, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.connect(gain);
      subOsc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      subOsc.start(t);
      osc.stop(t + dur + 0.02);
      subOsc.stop(t + dur + 0.02);
    });
  }
}

export const soundManager = new SoundManager();

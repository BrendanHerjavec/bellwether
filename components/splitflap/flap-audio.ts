/**
 * The sound of a flap landing.
 *
 * Synthesised rather than sampled. A board can fire hundreds of flips a second
 * during a big cascade, and a single sample file played that many times phases
 * into an ugly buzz. Generating each click lets every one differ slightly in
 * pitch, brightness and level, which is what turns a machine-gun rattle into a
 * texture you can leave running under a whole meeting.
 *
 * Anatomy of one click:
 *   - a short filtered noise burst: the plastic card slapping the stop
 *   - a low pitched thud under it: the drum body resonating
 * Both decay in well under 60ms.
 */

export interface FlapAudioOptions {
  /** Master level, 0..1. Deliberately quiet: this runs continuously. */
  volume: number;
  /** Minimum gap between clicks. Anything closer is dropped. */
  minGapMs: number;
  /** Hard ceiling on clicks per second across the whole board. */
  maxPerSecond: number;
}

const DEFAULTS: FlapAudioOptions = {
  volume: 0.35,
  minGapMs: 9,
  maxPerSecond: 70,
};

class FlapAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastClickAt = 0;
  private windowStart = 0;
  private windowCount = 0;
  private options: FlapAudioOptions = { ...DEFAULTS };
  private enabled = false;

  /**
   * Must be called from a user gesture. Browsers refuse to start an
   * AudioContext otherwise, and a silently dead context is worse than no sound.
   */
  async enable(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return false;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.options.volume;
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.enabled = this.ctx.state === "running";
      return this.enabled;
    } catch {
      return false;
    }
  }

  disable(): void {
    this.enabled = false;
    void this.ctx?.suspend();
  }

  isEnabled(): boolean {
    return this.enabled && this.ctx?.state === "running";
  }

  setVolume(volume: number): void {
    this.options.volume = Math.min(1, Math.max(0, volume));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.options.volume, this.ctx.currentTime, 0.02);
    }
  }

  getVolume(): number {
    return this.options.volume;
  }

  configure(options: Partial<FlapAudioOptions>): void {
    this.options = { ...this.options, ...options };
    if (options.volume !== undefined) this.setVolume(options.volume);
  }

  /** 250ms of white noise, reused by every click as the source material. */
  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /**
   * Rate limiting. During a full board cascade the honest number of flips is in
   * the hundreds per second; playing them all is noise, and a browser will drop
   * audio nodes anyway. Thinning to a ceiling keeps the clatter legible.
   */
  private shouldPlay(now: number): boolean {
    if (now - this.lastClickAt < this.options.minGapMs) return false;
    if (now - this.windowStart > 1000) {
      this.windowStart = now;
      this.windowCount = 0;
    }
    if (this.windowCount >= this.options.maxPerSecond) return false;
    return true;
  }

  /**
   * Play one flap click.
   *
   * `intensity` scales level and brightness: the final flip of a run lands
   * harder than the ones it passed through, which is what makes a cascade sound
   * like it is arriving somewhere.
   */
  click(intensity = 0.6): void {
    if (!this.isEnabled() || !this.ctx || !this.master || !this.noiseBuffer) return;

    const now = performance.now();
    if (!this.shouldPlay(now)) return;
    this.lastClickAt = now;
    this.windowCount += 1;

    const ctx = this.ctx;
    const t = ctx.currentTime;
    const strength = Math.min(1, Math.max(0.15, intensity));
    // Per-click variation. Without this the board sounds like a printer.
    const variance = 0.85 + Math.random() * 0.3;

    // --- the card slap: filtered noise, very short -------------------------
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.playbackRate.value = variance;
    // Random start offset so consecutive clicks never use identical samples.
    const offset = Math.random() * 0.2;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = (1500 + Math.random() * 900) * (0.8 + strength * 0.4);
    bandpass.Q.value = 0.9;

    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 600;

    const noiseGain = ctx.createGain();
    const noisePeak = 0.5 * strength * variance;
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.exponentialRampToValueAtTime(noisePeak, t + 0.0012);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.016 + strength * 0.022);

    noise.connect(bandpass);
    bandpass.connect(highpass);
    highpass.connect(noiseGain);
    noiseGain.connect(this.master);

    // --- the drum body: a low pitched thud under the slap ------------------
    const body = ctx.createOscillator();
    body.type = "triangle";
    body.frequency.setValueAtTime((190 + Math.random() * 70) * variance, t);
    body.frequency.exponentialRampToValueAtTime(88, t + 0.05);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.16 * strength * variance, t + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);

    body.connect(bodyGain);
    bodyGain.connect(this.master);

    noise.start(t, offset, 0.06);
    noise.stop(t + 0.06);
    body.start(t);
    body.stop(t + 0.07);

    // Nodes are one-shot; let them fall off the graph when they finish.
    noise.onended = () => {
      noise.disconnect();
      bandpass.disconnect();
      highpass.disconnect();
      noiseGain.disconnect();
    };
    body.onended = () => {
      body.disconnect();
      bodyGain.disconnect();
    };
  }

  /** A heavier, lower hit for the settlement stamp. */
  stamp(): void {
    if (!this.isEnabled() || !this.ctx || !this.master || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const thud = ctx.createOscillator();
    thud.type = "sine";
    thud.frequency.setValueAtTime(140, t);
    thud.frequency.exponentialRampToValueAtTime(42, t + 0.16);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.0001, t);
    thudGain.gain.exponentialRampToValueAtTime(0.55, t + 0.004);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const crack = ctx.createBiquadFilter();
    crack.type = "bandpass";
    crack.frequency.value = 2400;
    crack.Q.value = 0.7;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.0001, t);
    crackGain.gain.exponentialRampToValueAtTime(0.4, t + 0.002);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);

    thud.connect(thudGain);
    thudGain.connect(this.master);
    noise.connect(crack);
    crack.connect(crackGain);
    crackGain.connect(this.master);

    thud.start(t);
    thud.stop(t + 0.3);
    noise.start(t, Math.random() * 0.2, 0.08);
    noise.stop(t + 0.08);

    thud.onended = () => {
      thud.disconnect();
      thudGain.disconnect();
    };
    noise.onended = () => {
      noise.disconnect();
      crack.disconnect();
      crackGain.disconnect();
    };
  }
}

/** Single shared instance: one AudioContext for the whole page. */
export const flapAudio = new FlapAudio();

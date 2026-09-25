class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private comboCount: number = 0;
  private lastClearTime: number = 0;
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    // AudioContext skapas vid första användarinteraktion
  }

  public initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // ==========================================
  // PILSVITSCH & COMBO (Melodisk Pentatonisk Skala)
  // ==========================================
  public playArrowSuccess(currentComboStreak?: number) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = performance.now();
    if (typeof currentComboStreak === 'number') {
      this.comboCount = Math.max(0, currentComboStreak);
    } else {
      if (now - this.lastClearTime < 1800) {
        this.comboCount = Math.min(this.comboCount + 1, 14);
      } else {
        this.comboCount = 0;
      }
    }
    this.lastClearTime = now;

    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Harmonisk pentatonisk skala (C-D-E-G-A) över 3 oktaver
    const pentatonic = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33];
    const semitones = pentatonic[this.comboCount % pentatonic.length];
    const baseFreq = 392.0 * Math.pow(2, semitones / 12); // Börjar på G4 och klättrar

    // 1. Marimba / kristall-klocka med överton
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.02, t + 0.15);

    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.33);

    // Musikaliskt rymd-arpeggio vid combos: kaskadnoter som spelar glittrande ackord
    if (this.comboCount >= 2) {
      // Arpeggionoter beroende på combo-nivå
      // Combo 2: 2 toner (grundton + kvint)
      // Combo 3-5: 3 toner (grundton + ters + kvint)
      // Combo 6+: 4 toner (grundton + ters + kvint + oktav)
      const arpeggioIntervals = this.comboCount >= 6 
        ? [4, 7, 12] 
        : (this.comboCount >= 3 ? [4, 7] : [7]);
      
      const stepDuration = 0.055; // 55ms mellan tonerna
      arpeggioIntervals.forEach((interval, idx) => {
        const noteTime = t + (idx + 1) * stepDuration;
        const noteFreq = baseFreq * Math.pow(2, interval / 12);

        const arpOsc = ctx.createOscillator();
        const arpGain = ctx.createGain();
        arpOsc.type = 'sine';
        arpOsc.frequency.setValueAtTime(noteFreq, noteTime);
        arpOsc.frequency.exponentialRampToValueAtTime(noteFreq * 1.01, noteTime + 0.12);

        const volume = Math.min(0.20, 0.08 + this.comboCount * 0.012) / (idx + 1);
        arpGain.gain.setValueAtTime(volume, noteTime);
        arpGain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.28);

        arpOsc.connect(arpGain);
        arpGain.connect(ctx.destination);
        arpOsc.start(noteTime);
        arpOsc.stop(noteTime + 0.29);
      });

      // Kristall-överton vid höga combos
      const harmOsc = ctx.createOscillator();
      const harmGain = ctx.createGain();
      harmOsc.type = 'triangle';
      harmOsc.frequency.setValueAtTime(baseFreq * 2, t);

      harmGain.gain.setValueAtTime(0.08 + Math.min(0.12, this.comboCount * 0.015), t);
      harmGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      harmOsc.connect(harmGain);
      harmGain.connect(ctx.destination);
      harmOsc.start(t);
      harmOsc.stop(t + 0.26);
    }

    // 2. Återanvänd Whoosh / svisch-brus
    if (!this.noiseBuffer) {
      const bufferSize = Math.floor(ctx.sampleRate * 0.16);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1000 + Math.min(1800, this.comboCount * 120), t);
    filter.frequency.exponentialRampToValueAtTime(3600, t + 0.14);
    filter.Q.setValueAtTime(3.5, t);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.14, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(t);
  }

  // Blockerad pil
  public playArrowBlocked() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(65, t + 0.13);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  // ==========================================
  // SPECIALPILAR & NYA LJUDEFFEKTER
  // ==========================================

  /**
   * Krispigt is-ljud när en fryst pil krossar sitt ishölje
   */
  public playIceBreak() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const t = ctx.currentTime;

    [2400, 3800, 5200].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t + i * 0.02;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.4, start + 0.08);

      gain.gain.setValueAtTime(0.18, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + 0.1);
    });
  }

  /**
   * Länkade pilar som flyger samtidigt
   */
  public playLinkWhoosh() {
    if (this.isMuted) return;
    this.playArrowSuccess(this.comboCount);
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.04;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.2);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /**
   * Stjärn-pling när stjärnor delas ut i vinstfönstret (stjärna 1, 2, 3)
   */
  public playStarPop(starIndex: number) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    const freq = notes[Math.min(starIndex, notes.length - 1)];

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.22);

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.42);
  }

  /**
   * Filmisk segerfanfar vid "Victory Zoom"
   */
  public playVictoryFanfare() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const t = ctx.currentTime;

    const freqs = [261.63, 329.63, 392.0, 493.88, 587.33, 783.99, 1046.5];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t + idx * 0.07;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.18, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.7);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + 0.75);
    });
  }

  public playLevelWin() {
    this.playVictoryFanfare();
  }

  public playHighScore() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const t = ctx.currentTime;
    const notes = [
      { f: 523.25, time: 0, dur: 0.18 },
      { f: 659.25, time: 0.12, dur: 0.18 },
      { f: 783.99, time: 0.24, dur: 0.22 },
      { f: 1046.50, time: 0.38, dur: 0.6 },
      { f: 1318.51, time: 0.44, dur: 0.7 },
      { f: 1567.98, time: 0.50, dur: 0.9 },
    ];

    notes.forEach(({ f, time: offset, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = t + offset;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, startTime);

      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + dur + 0.05);
    });
  }
}

export const sound = new SoundManager();

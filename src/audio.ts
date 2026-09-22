class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private comboCount: number = 0;
  private lastClearTime: number = 0;
  private noiseBuffer: AudioBuffer | null = null;

  // Kosmisk Atmosfärisk Ambient-Slinga (64s Cello-Nocturne)
  private ambientBuffer: AudioBuffer | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private ambientGain: GainNode | null = null;
  private isAmbientPlaying: boolean = false;
  private isMusicMuted: boolean = false;

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
    if (!this.isAmbientPlaying) {
      this.startAmbientSoundscape();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    this.updateAmbientGain();
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMusicMuted(muted: boolean): boolean {
    this.isMusicMuted = muted;
    this.updateAmbientGain();
    return this.isMusicMuted;
  }

  public toggleMusic(): boolean {
    return this.setMusicMuted(!this.isMusicMuted);
  }

  public getMusicMuted(): boolean {
    return this.isMusicMuted;
  }

  private updateAmbientGain() {
    if (this.ambientGain && this.ctx) {
      try {
        const t = this.ctx.currentTime;
        this.ambientGain.gain.cancelScheduledValues(t);
        this.ambientGain.gain.setValueAtTime(Math.max(0.00001, this.ambientGain.gain.value), t);
        const target = (this.isMuted || this.isMusicMuted) ? 0.00001 : 0.09;
        this.ambientGain.gain.exponentialRampToValueAtTime(target, t + 0.8);
      } catch {}
    } else if (!this.isMuted && !this.isMusicMuted) {
      this.initCtx();
    }
  }

  // =========================================================================
  // KOSMISK CELLO-NOCTURNE I REN D-DUR (Varm, lugn, hoppfull & harmonisk)
  // 64 sekunders sömlös akustisk cellosvit i DUR – helt utan moll-ackord
  // Helt fri från skarpa diskantljud och theremin-svaj
  // =========================================================================
  private generateAmbientBuffer(ctx: AudioContext): AudioBuffer {
    const duration = 64.0; // 8 meditativa 8-sekundersackord i 60 BPM
    const sampleRate = ctx.sampleRate || 44100;
    const totalSamples = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(2, totalSamples, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    // 8 lugna, ljusa och varma ackord i ren D-DUR (uteslutande dur-harmonier)
    const chords = [
      {
        bass: 73.42, // D2
        celloSection: [110.00, 146.83, 185.00, 220.00], // A2, D3, F#3, A3 (D-dur)
        counterCello: [146.83, 185.00, 220.00, 185.00], // D3 -> F#3 -> A3 -> F#3
      },
      {
        bass: 49.00, // G1
        celloSection: [98.00, 123.47, 146.83, 185.00], // G2, B2, D3, F#3 (Gmaj7)
        counterCello: [185.00, 146.83, 123.47, 146.83], // F#3 -> D3 -> B2 -> D3
      },
      {
        bass: 46.25, // F#1
        celloSection: [110.00, 146.83, 185.00, 220.00], // A2, D3, F#3, A3 (D/F#)
        counterCello: [146.83, 185.00, 220.00, 146.83], // D3 -> F#3 -> A3 -> D3
      },
      {
        bass: 49.00, // G1
        celloSection: [98.00, 123.47, 146.83, 196.00], // G2, B2, D3, G3 (G-dur)
        counterCello: [196.00, 146.83, 123.47, 146.83], // G3 -> D3 -> B2 -> D3
      },
      {
        bass: 55.00, // A1
        celloSection: [110.00, 138.59, 164.81, 220.00], // A2, C#3, E3, A3 (A-dur)
        counterCello: [164.81, 220.00, 164.81, 138.59], // E3 -> A3 -> E3 -> C#3
      },
      {
        bass: 73.42, // D2
        celloSection: [110.00, 146.83, 185.00, 220.00], // A2, D3, F#3, A3 (D-dur)
        counterCello: [146.83, 185.00, 220.00, 185.00], // D3 -> F#3 -> A3 -> F#3
      },
      {
        bass: 61.74, // B1
        celloSection: [98.00, 146.83, 185.00, 196.00], // G2, D3, F#3, G3 (G/B)
        counterCello: [196.00, 185.00, 146.83, 185.00], // G3 -> F#3 -> D3 -> F#3
      },
      {
        bass: 55.00, // A1
        celloSection: [110.00, 146.83, 164.81, 220.00], // A2, D3, E3, A3 (Asus4 -> A-dur)
        counterCello: [164.81, 146.83, 138.59, 146.83], // E3 -> D3 -> C#3 -> D3
      },
    ];

    // Ljust, varmt och rogivande cellotema i ren D-DUR (helt utan moll eller vibratosvaj)
    const celloTheme = [
      { t: 1.5, dur: 6.0, f: 185.00 }, // F#3 - Varm, solig dur-ters
      { t: 8.5, dur: 6.5, f: 220.00 }, // A3 - Ljus, sjungande kvint
      { t: 16.5, dur: 6.0, f: 246.94 }, // B3 - Hoppfull, strålande ren sext
      { t: 23.0, dur: 6.0, f: 220.00 }, // A3 - Mjukt steg nedåt
      { t: 31.0, dur: 4.5, f: 196.00 }, // G3 - Lugn ton
      { t: 36.0, dur: 4.5, f: 185.00 }, // F#3 - Åter till dur-tersen
      { t: 41.0, dur: 6.0, f: 164.81 }, // E3 - Mjuk viloton
      { t: 47.5, dur: 4.5, f: 185.00 }, // F#3 - Värmande lyft
      { t: 52.5, dur: 4.5, f: 196.00 }, // G3 - Leder mot upplösning
      { t: 57.5, dur: 6.5, f: 146.83 }, // D3 - Fullkomlig ro, värme och hemkomst i ren D-dur
    ];

    // Panoreringspositioner för cellostämmorna i stereofältet
    const stereoPans = [-0.35, -0.12, 0.12, 0.35];

    // Syntetisera spåren
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;

      // Ackordprogression (8 ackord över 64 sekunder = 8.0 sekunder per ackord)
      const chordIndex = Math.floor(t / 8.0) % 8;
      const nextChordIndex = (chordIndex + 1) % 8;
      const tInChord = t % 8.0;

      // Mycket mjuk och långsam övergång mellan ackorden (1.4s cosinus-fade)
      let wCurr = 1.0;
      let wNext = 0.0;
      if (tInChord >= 6.6) {
        const u = (tInChord - 6.6) / 1.4;
        wCurr = 0.5 * (1 + Math.cos(Math.PI * u));
        wNext = 0.5 * (1 - Math.cos(Math.PI * u));
      }

      let sL = 0;
      let sR = 0;

      // 1. Kontrabas & Djup Sub-cello (100% stabil frekvens, noll svaj)
      const curChord = chords[chordIndex];
      const bassPhase = 2 * Math.PI * curChord.bass * t;
      const bassSig = (Math.sin(bassPhase) + 0.30 * Math.sin(bassPhase * 2)) * wCurr * 0.15;
      sL += bassSig;
      sR += bassSig;

      if (wNext > 0) {
        const nextChord = chords[nextChordIndex];
        const nextBassPhase = 2 * Math.PI * nextChord.bass * t;
        const nextBassSig = (Math.sin(nextBassPhase) + 0.30 * Math.sin(nextBassPhase * 2)) * wNext * 0.15;
        sL += nextBassSig;
        sR += nextBassSig;
      }

      // 2. Cellokvartett (Fylliga, varma, orörliga rena stämmor - noll svaj)
      const sectionVoices = curChord.celloSection;
      for (let v = 0; v < sectionVoices.length; v++) {
        const f = sectionVoices[v];
        const phase = 2 * Math.PI * f * t;
        // Träliknande celloövertoner (grundton + varm 2:a och 3:e överton)
        const celliSig = (Math.sin(phase) * 0.70 + Math.sin(phase * 2) * 0.22 + Math.sin(phase * 3) * 0.08) * wCurr * 0.055;
        const pan = stereoPans[v % 4];
        sL += celliSig * (0.5 - pan * 0.5);
        sR += celliSig * (0.5 + pan * 0.5);
      }

      if (wNext > 0) {
        const nextVoices = chords[nextChordIndex].celloSection;
        for (let v = 0; v < nextVoices.length; v++) {
          const f = nextVoices[v];
          const phase = 2 * Math.PI * f * t;
          const celliSig = (Math.sin(phase) * 0.70 + Math.sin(phase * 2) * 0.22 + Math.sin(phase * 3) * 0.08) * wNext * 0.055;
          const pan = stereoPans[v % 4];
          sL += celliSig * (0.5 - pan * 0.5);
          sR += celliSig * (0.5 + pan * 0.5);
        }
      }

      // 3. Mjuk Kontracello (Lugna 2-sekunders halvnoter, 100% stabil tonhöjd)
      const stepDur = 2.0;
      const counterStep = Math.floor(tInChord / stepDur) % 4;
      const counterRel = tInChord % stepDur;
      const counterAtt = Math.min(1, counterRel / 0.6);
      const counterDec = counterRel > 1.4 ? Math.max(0, (stepDur - counterRel) / 0.6) : 1;
      const counterEnv = counterAtt * counterDec;
      const counterF = curChord.counterCello[counterStep];
      const counterPhase = 2 * Math.PI * counterF * t;
      const counterSig = (Math.sin(counterPhase) * 0.72 + Math.sin(counterPhase * 2) * 0.22 + Math.sin(counterPhase * 3) * 0.06) * counterEnv * 0.035;
      sL += counterSig * 0.65;
      sR += counterSig * 0.35;

      // 4. Varmt och Tryggt Cellotema (Exakt och ren tonhöjd - NOLL vibrato, NOLL theremin-svaj)
      for (let m = 0; m < celloTheme.length; m++) {
        const note = celloTheme[m];
        if (t >= note.t && t < note.t + note.dur) {
          const rel = t - note.t;

          // Mjuk volym-ansats (1.0s) och mjuk utklingning (1.2s)
          const att = Math.min(1, rel / 1.0);
          const dec = rel > note.dur - 1.2 ? Math.max(0, (note.dur - rel) / 1.2) : 1;
          const env = 0.5 * (1 - Math.cos(Math.PI * att)) * (0.5 * (1 + Math.cos(Math.PI * (1 - dec))));

          // Ren, ren, stabil tonhöjd (ingen LFO, inget svaj)
          const phase = 2 * Math.PI * note.f * rel;
          const celloSig = (Math.sin(phase) * 0.72 + Math.sin(phase * 2) * 0.22 + Math.sin(phase * 3) * 0.06) * env * 0.085;

          sL += celloSig;
          sR += celloSig;
          break;
        }
      }

      left[i] = sL;
      right[i] = sR;
    }

    // 5. Akustisk Rymdklang med Diskantdämpning (Mjuk katedral/konsertsal utan vasshet)
    const delaySamples = Math.floor(sampleRate * 0.48); // 480ms långsamt tempo-eko
    const feedback = 0.26;
    let prevL = 0;
    let prevR = 0;
    for (let i = delaySamples; i < totalSamples; i++) {
      // 1-poligt lågpassfilter i feedback-loopen: absorberar diskant precis som trä och luft
      prevL = 0.60 * (right[i - delaySamples] * feedback) + 0.40 * prevL;
      prevR = 0.60 * (left[i - delaySamples] * feedback) + 0.40 * prevR;
      left[i] += prevL;
      right[i] += prevR;
    }

    // 6. Sömlös loop-avrundning: Crossfada svansen (sista 1.8s) in i början för en helt skarvfri evighetsloop
    const fadeSamples = Math.floor(sampleRate * 1.8);
    for (let i = 0; i < fadeSamples; i++) {
      const u = i / fadeSamples;
      const tailIndex = totalSamples - fadeSamples + i;
      left[i] = left[i] * u + left[tailIndex] * (1 - u);
      right[i] = right[i] * u + right[tailIndex] * (1 - u);
    }

    return buffer;
  }

  private startAmbientSoundscape() {
    if (!this.ctx || this.isAmbientPlaying) return;
    try {
      if (!this.ambientBuffer) {
        this.ambientBuffer = this.generateAmbientBuffer(this.ctx);
      }
      const ctx = this.ctx;
      const t = ctx.currentTime;

      this.ambientSource = ctx.createBufferSource();
      this.ambientSource.buffer = this.ambientBuffer;
      this.ambientSource.loop = true;

      // Hårdvaru-lågpassfilter i Web Audio med 650 Hz cutoff för maximal trävärme och noll skärpa
      this.ambientFilter = ctx.createBiquadFilter();
      this.ambientFilter.type = 'lowpass';
      this.ambientFilter.frequency.setValueAtTime(650, t);
      this.ambientFilter.Q.setValueAtTime(0.707, t);

      this.ambientGain = ctx.createGain();
      const targetGain = (this.isMuted || this.isMusicMuted) ? 0.00001 : 0.09;
      this.ambientGain.gain.setValueAtTime(0.0001, t);
      this.ambientGain.gain.exponentialRampToValueAtTime(targetGain, t + 2.5);

      this.ambientSource.connect(this.ambientFilter);
      this.ambientFilter.connect(this.ambientGain);
      this.ambientGain.connect(ctx.destination);

      this.ambientSource.start(t);
      this.isAmbientPlaying = true;
    } catch {
      // Ignorera fel vid tidig autoplay
    }
  }

  // Bakåtkompatibla alias
  private startAmbientDrone() {
    this.startAmbientSoundscape();
  }
  private pauseAmbientDrone() {
    this.updateAmbientGain();
  }
  private resumeAmbientDrone() {
    this.updateAmbientGain();
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

    // Klock-överton vid högre combos
    if (this.comboCount >= 2) {
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

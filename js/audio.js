// Syntbaserad ljudmotor för både mobilhögtalare och dator – inga externa ljudfiler behövs.

const SILENT_WAV =
  "data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA==";

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.unlocked = false;
    this.htmlAudioUnlocked = false;
    this.lastSoftDropAt = 0;

    let savedMuted = false;
    try {
      savedMuted = localStorage.getItem("tetris2d.muted") === "1";
    } catch {
      savedMuted = false;
    }
    this.muted = savedMuted;
  }

  _setPlaybackSession() {
    if (typeof navigator === "undefined") return;
    try {
      if (navigator.audioSession && navigator.audioSession.type !== "playback") {
        navigator.audioSession.type = "playback";
      }
    } catch {
      /* stöds ej i alla webbläsare */
    }
  }

  _createNoiseBuffer(ctx) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * 0.18));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  ensure() {
    if (typeof window === "undefined") return;
    this._setPlaybackSession();

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return;
      }

      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
      compressor.knee.setValueAtTime(18, this.ctx.currentTime);
      compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      compressor.release.setValueAtTime(0.14, this.ctx.currentTime);

      this.master = this.ctx.createGain();
      this.master.gain.setValueAtTime(0.82, this.ctx.currentTime);
      this.master.connect(compressor);
      compressor.connect(this.ctx.destination);

      this.noiseBuffer = this._createNoiseBuffer(this.ctx);
    }

    if (this.ctx.state !== "running") {
      this.ctx.resume().catch(() => {});
    }
  }

  // Låser upp ljud på iOS Safari (inkl. tyst-knapp) & Android vid användarinteraktion.
  unlock() {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx) return;

    if (!this.unlocked) {
      try {
        const silent = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = silent;
        src.connect(this.ctx.destination);
        src.start(0);
        if (this.ctx.state === "running") this.unlocked = true;
      } catch {
        /* ignorera */
      }
    } else if (this.ctx.state !== "running") {
      this.ctx.resume().catch(() => {});
    }

    if (!this.htmlAudioUnlocked && typeof Audio !== "undefined") {
      this.htmlAudioUnlocked = true;
      try {
        const el = new Audio(SILENT_WAV);
        el.volume = 0.01;
        el.setAttribute("playsinline", "");
        const p = el.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {
        /* ignorera */
      }
    }
  }

  get context() {
    return this.ctx;
  }

  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem("tetris2d.muted", this.muted ? "1" : "0");
    } catch {
      /* storage kan vara blockerat */
    }
    if (!this.muted) {
      this.unlock();
      this.tone({ freq: 523.25, dur: 0.08, type: "triangle", gain: 0.22 });
      this.tone({ freq: 659.25, dur: 0.11, type: "triangle", gain: 0.24, delay: 0.065 });
    }
    return this.muted;
  }

  _scheduleTone({
    freq = 440,
    dur = 0.1,
    type = "triangle",
    gain = 0.2,
    slide = 0,
    delay = 0,
    filterFreq = 0,
  }) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;

    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();

    osc.type = type;
    const startFreq = Math.max(40, freq);
    osc.frequency.setValueAtTime(startFreq, start);
    if (slide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), start + dur);
    }

    const attack = Math.min(0.008, dur * 0.25);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.linearRampToValueAtTime(gain, start + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    if (filterFreq > 0) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(filterFreq, start);
      osc.connect(filter);
      filter.connect(amp);
    } else {
      osc.connect(amp);
    }

    amp.connect(this.master);
    osc.start(start);
    osc.stop(start + dur + 0.025);
  }

  tone(opts) {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx || !this.master) return;

    if (this.ctx.state !== "running") {
      const requestedAt = typeof performance !== "undefined" ? performance.now() : 0;
      this.ctx
        .resume()
        .then(() => {
          const elapsed =
            typeof performance !== "undefined" ? performance.now() - requestedAt : 0;
          if (!this.muted && elapsed < 450) {
            this._scheduleTone(opts);
          }
        })
        .catch(() => {});
      return;
    }

    this._scheduleTone(opts);
  }

  _scheduleBurst({ dur = 0.05, gain = 0.12, freq = 900, q = 1.2, delay = 0 }) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer) return;

    const start = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(freq, start);
    filter.Q.setValueAtTime(q, start);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    src.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    src.start(start);
    src.stop(start + dur + 0.01);
  }

  burst(opts) {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx || !this.master) return;

    if (this.ctx.state !== "running") {
      const requestedAt = typeof performance !== "undefined" ? performance.now() : 0;
      this.ctx
        .resume()
        .then(() => {
          const elapsed =
            typeof performance !== "undefined" ? performance.now() - requestedAt : 0;
          if (!this.muted && elapsed < 450) {
            this._scheduleBurst(opts);
          }
        })
        .catch(() => {});
      return;
    }

    this._scheduleBurst(opts);
  }

  // Låter varje steg i en combo stiga i tonalitet (halvtoner per combo)
  pitch(perStep = 1) {
    return Math.pow(2, Math.min(perStep, 9) / 12);
  }

  move() {
    this.tone({ freq: 290, dur: 0.042, type: "triangle", gain: 0.16, slide: 55 });
  }

  softDrop() {
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (now - this.lastSoftDropAt < 40) return;
    this.lastSoftDropAt = now;
    this.tone({ freq: 220, dur: 0.032, type: "triangle", gain: 0.11, slide: -35 });
  }

  rotate() {
    this.tone({ freq: 390, dur: 0.07, type: "triangle", gain: 0.24, slide: 210 });
    this.tone({ freq: 780, dur: 0.055, type: "sine", gain: 0.1, slide: 140, delay: 0.012 });
  }

  hold() {
    this.tone({ freq: 520, dur: 0.065, type: "triangle", gain: 0.22, slide: -130 });
    this.tone({ freq: 660, dur: 0.075, type: "triangle", gain: 0.2, delay: 0.05 });
  }

  hardDrop(distance = 0) {
    const impact = Math.min(0.34, 0.22 + distance * 0.005);
    this.tone({ freq: 480, dur: 0.095, type: "triangle", gain: impact * 0.85, slide: -340 });
    this.tone({
      freq: 210,
      dur: 0.13,
      type: "sawtooth",
      gain: impact * 0.7,
      slide: -115,
      filterFreq: 850,
      delay: 0.01,
    });
    this.burst({ dur: 0.05, gain: impact * 0.55, freq: 950, q: 1.1 });
  }

  lock() {
    this.tone({ freq: 240, dur: 0.06, type: "triangle", gain: 0.16, slide: -95 });
  }

  clear(count, combo = 0, b2b = false) {
    const lift = this.pitch(combo);
    const notes =
      count >= 4
        ? [523.25, 659.25, 783.99, 1046.5]
        : count === 3
          ? [523.25, 659.25, 783.99]
          : count === 2
            ? [493.88, 659.25]
            : [440, 554.37];

    notes.forEach((freq, i) => {
      this.tone({
        freq: freq * lift,
        dur: 0.19,
        type: "triangle",
        gain: 0.28,
        delay: i * 0.055,
      });
      this.tone({
        freq: freq * lift * 2,
        dur: 0.13,
        type: "sine",
        gain: 0.09,
        delay: i * 0.055,
      });
    });

    if (count >= 4) {
      this.burst({ dur: 0.08, gain: 0.16, freq: 1400, q: 0.9 });
    }
    if (count >= 3) {
      this.tone({ freq: 1567.98 * lift, dur: 0.26, type: "sine", gain: 0.18, delay: 0.2 });
    }
    if (b2b) {
      [1318.5, 1760].forEach((freq, i) => {
        this.tone({ freq, dur: 0.13, type: "triangle", gain: 0.18, delay: 0.26 + i * 0.065 });
      });
    }
  }

  tspin() {
    [587.33, 880].forEach((freq, i) => {
      this.tone({ freq, dur: 0.09, type: "triangle", gain: 0.24, slide: 160, delay: i * 0.06 });
    });
  }

  perfect() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
      this.tone({ freq, dur: 0.24, type: "triangle", gain: 0.3, delay: i * 0.075 });
    });
    this.tone({ freq: 2093, dur: 0.5, type: "sine", gain: 0.2, delay: 0.42 });
  }

  danger() {
    this.tone({ freq: 220, dur: 0.16, type: "triangle", gain: 0.22, slide: -45 });
    this.tone({ freq: 196, dur: 0.16, type: "triangle", gain: 0.2, slide: -40, delay: 0.2 });
  }

  levelUp() {
    [392, 523.25, 659.25, 783.99].forEach((freq, i) => {
      this.tone({ freq, dur: 0.17, type: "triangle", gain: 0.26, delay: i * 0.075 });
    });
  }

  best() {
    [659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
      this.tone({ freq, dur: 0.22, type: "triangle", gain: 0.28, delay: i * 0.085 });
    });
    this.tone({ freq: 1567.98, dur: 0.45, type: "sine", gain: 0.22, delay: 0.36 });
  }

  start() {
    [329.63, 440, 659.25].forEach((freq, i) => {
      this.tone({ freq, dur: 0.14, type: "triangle", gain: 0.25, delay: i * 0.07 });
    });
  }

  gameOver() {
    [392, 329.63, 261.63, 196].forEach((freq, i) => {
      this.tone({ freq, dur: 0.28, type: "triangle", gain: 0.26, delay: i * 0.12, slide: -18 });
    });
  }
}

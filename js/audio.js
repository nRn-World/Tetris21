// Liten syntbaserad ljudmotor – inga externa ljudfiler behövs.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem("tetris2d.muted") === "1";
  }

  ensure() {
    if (typeof window === "undefined") return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!this.ctx) this.ctx = new AudioCtx();
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
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
      this.ensure();
      this.tone({ freq: 520, dur: 0.09, type: "triangle", gain: 0.025 });
    }
    return this.muted;
  }

  tone({ freq = 440, dur = 0.1, type = "sine", gain = 0.03, slide = 0, delay = 0, detached = false }) {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, freq), start);
    if (slide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), start + dur);
    }

    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(amp).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.03);
  }

  // Låter varje steg i en combo stiga i tonalitet (halvtoner per combo)
  pitch(perStep = 1) {
    return Math.pow(2, Math.min(perStep, 9) / 12);
  }

  move() {
    this.tone({ freq: 185, dur: 0.035, type: "square", gain: 0.007 });
  }

  rotate() {
    this.tone({ freq: 340, dur: 0.055, type: "triangle", gain: 0.018, slide: 70 });
  }

  hold() {
    this.tone({ freq: 500, dur: 0.06, type: "triangle", gain: 0.02, slide: -140 });
  }

  hardDrop(distance = 0) {
    const dropGain = Math.min(0.07, 0.04 + distance * 0.002);
    this.tone({ freq: 120, dur: 0.11, type: "sine", gain: dropGain, slide: -60 });
    this.tone({ freq: 60, dur: 0.16, type: "sine", gain: dropGain * 0.9, slide: -20, delay: 0.01 });
  }

  lock() {
    this.tone({ freq: 95, dur: 0.06, type: "sine", gain: 0.025, slide: -20 });
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
            : [440];

    notes.forEach((freq, i) => {
      this.tone({
        freq: freq * lift,
        dur: 0.16,
        type: "triangle",
        gain: 0.032,
        delay: i * 0.055,
      });
    });
    if (count >= 3) {
      this.tone({ freq: 1568 * lift, dur: 0.22, type: "sine", gain: 0.018, delay: 0.2 });
    }
    if (b2b) {
      // Glittrande topp över back-to-back
      [2093, 2637].forEach((freq, i) => {
        this.tone({ freq, dur: 0.1, type: "sine", gain: 0.012, delay: 0.28 + i * 0.07 });
      });
    }
  }

  tspin() {
    // Vridning utan rensad rad – snabb "twirl"
    [660, 880].forEach((freq, i) => {
      this.tone({ freq, dur: 0.07, type: "triangle", gain: 0.02, slide: 120, delay: i * 0.06 });
    });
  }

  perfect() {
    // Golden fanfar för Perfect Clear
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
      this.tone({ freq, dur: 0.22, type: "triangle", gain: 0.035, delay: i * 0.075 });
    });
    this.tone({ freq: 2093, dur: 0.5, type: "sine", gain: 0.02, delay: 0.42 });
  }

  danger() {
    this.tone({ freq: 66, dur: 0.2, type: "sine", gain: 0.05, slide: -14 });
    this.tone({ freq: 66, dur: 0.14, type: "sine", gain: 0.03, slide: -14, delay: 0.22 });
  }

  levelUp() {
    [392, 523.25, 659.25].forEach((freq, i) => {
      this.tone({ freq, dur: 0.15, type: "sine", gain: 0.028, delay: i * 0.08 });
    });
  }

  best() {
    [659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
      this.tone({ freq, dur: 0.2, type: "triangle", gain: 0.03, delay: i * 0.09 });
    });
    this.tone({ freq: 1568, dur: 0.45, type: "sine", gain: 0.02, delay: 0.38 });
  }

  start() {
    [329.63, 415.3, 523.25].forEach((freq, i) => {
      this.tone({ freq, dur: 0.12, type: "triangle", gain: 0.024, delay: i * 0.07 });
    });
  }

  gameOver() {
    [329.63, 261.63, 196, 130.81].forEach((freq, i) => {
      this.tone({ freq, dur: 0.3, type: "sine", gain: 0.03, delay: i * 0.12, slide: -12 });
    });
  }
}

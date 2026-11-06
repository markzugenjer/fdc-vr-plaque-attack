/**
 * Every sound is synthesized live: no audio files to download.
 *   sfx.play('pop')
 */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.noise = null;
    this.loops = new Map();
    this.last = {};
  }

  /** Browsers only allow sound after the user clicks or presses something. */
  unlock() {
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.85;
        // a gentle compressor keeps busy moments from clipping
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        this.master.connect(comp).connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      /* audio unavailable */
    }
  }

  tone(f1, f2, dur, type = 'sine', vol = 0.08, delay = 0) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, t);
    if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  burst(dur, freq, q, vol, delay = 0, type = 'bandpass') {
    const c = this.ctx;
    if (!c || !this.noise) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** Play a sound; very frequent sounds are rate-limited so they don't pile up. */
  play(name) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const gap = { shoot: 0.06, pop: 0.03, chomp: 0.12, scrub: 0.09, swoosh: 0.12, hit: 0.04, crack: 0.25 }[name] || 0;
    if (gap && this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    const r = 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'shoot': this.tone(900 * r, 1600 * r, 0.09, 'sine', 0.05); this.burst(0.06, 4000, 1, 0.03); break;
      case 'pop': this.tone(500 * r, 1300 * r, 0.08, 'triangle', 0.09); this.burst(0.08, 1800, 2, 0.06); this.tone(1800 * r, null, 0.05, 'sine', 0.03, 0.04); break;
      case 'splat': this.burst(0.25, 600, 1.5, 0.14); this.tone(220, 80, 0.2, 'sine', 0.08); break;
      case 'candy': [1320, 1760].forEach((f, i) => this.tone(f * r, null, 0.1, 'square', 0.035, i * 0.05)); this.burst(0.05, 5000, 2, 0.04); break;
      case 'land': this.burst(0.3, 400, 1, 0.12); this.tone(300, 120, 0.25, 'triangle', 0.06); break;
      case 'chomp': this.burst(0.05, 900 * r, 4, 0.05); this.tone(160 * r, 120, 0.05, 'square', 0.025); break;
      case 'crack': this.burst(0.18, 2600, 3, 0.1); this.tone(180, 90, 0.25, 'sawtooth', 0.05); break;
      case 'scrub': this.burst(0.08, 6000 * r, 1.5, 0.05, 0, 'highpass'); break;
      case 'swoosh': this.burst(0.18, 1200 * r, 0.8, 0.07); break;
      case 'hit': this.tone(700, 300, 0.08, 'square', 0.05); this.burst(0.06, 2500, 2, 0.05); break;
      case 'break': this.burst(0.4, 1500, 1, 0.15); [523, 659, 784, 1047].forEach((f, i) => this.tone(f, null, 0.18, 'square', 0.05, i * 0.05)); break;
      case 'roar': this.tone(90, 55, 1.2, 'sawtooth', 0.12); this.tone(135, 70, 1.1, 'square', 0.05); this.burst(1.1, 300, 0.7, 0.12); break;
      case 'throw': this.tone(300, 900, 0.3, 'triangle', 0.05); break;
      case 'whistle': this.tone(1800, 700, 0.6, 'sine', 0.03); break;
      case 'wave': [392, 523, 659, 784].forEach((f, i) => this.tone(f, null, 0.22, 'square', 0.05, i * 0.09)); this.tone(1047, null, 0.4, 'triangle', 0.06, 0.36); break;
      case 'combo': [880, 1109, 1319].forEach((f, i) => this.tone(f, null, 0.12, 'square', 0.04, i * 0.05)); break;
      case 'heal': this.tone(1200, 2400, 0.25, 'sine', 0.04); this.tone(1800, 3000, 0.25, 'sine', 0.025, 0.06); break;
      case 'ouch': this.tone(500, 200, 0.3, 'square', 0.06); this.burst(0.2, 900, 2, 0.06); break;
      case 'win': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, null, 0.3, 'triangle', 0.07, i * 0.1)); this.burst(0.6, 6000, 0.6, 0.05, 0.5); break;
      case 'boom': this.tone(120, 40, 1.0, 'sine', 0.2); this.burst(0.9, 500, 0.6, 0.2); break;
      case 'tick': this.tone(1500, null, 0.04, 'square', 0.03); break;
      case 'click': this.tone(900, 1300, 0.05, 'triangle', 0.05); break;
      case 'blip': this.tone(660, 990, 0.12, 'sine', 0.05); break;
      case 'talk': for (let i = 0; i < 4; i++) this.tone((420 + Math.random() * 200) * r, null, 0.07, 'triangle', 0.035, i * 0.09); break;
      default: break;
    }
  }

  stopAll() { /* no loops in this game */ }
}

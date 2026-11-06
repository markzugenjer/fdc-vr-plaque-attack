/**
 * Upbeat arcade music for the battle, synthesized live (no audio file to download).
 *
 * A driving 4-bar loop in C major (C - G - Am - F) at 138 BPM: punchy plucks, a bouncing bass,
 * four-on-the-floor kick with claps, and a chiptune-style lead that changes every 8 bars.
 * setIntensity(1) adds the boss layer (busier hats, a lower, heavier bass).
 *
 *   const music = new Music(sfx);   // uses the game's audio context once sound is unlocked
 *   music.start();  music.setOn(false);  music.duck(true)
 *
 * The on / off choice is remembered on the headset.
 */
const KEY = 'fdc.plaque.music';
const BPM = 138;
const BEAT = 60 / BPM;
const STEP = BEAT / 2; // eighth notes
const LOOKAHEAD = 0.25; // seconds of notes scheduled ahead
const VOLUME = 0.45;

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
// chord tones (MIDI) for F, C, Dm, Bb
const CHORDS = [
  { root: 36, tones: [64, 67, 72] }, // C
  { root: 43, tones: [62, 67, 71] }, // G
  { root: 45, tones: [64, 69, 72] }, // Am
  { root: 41, tones: [65, 69, 72] }, // F
];
const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81]; // C major pentatonic

// Two melodies of 32 eighths (4 bars) each; null = rest. Written to sit on the chords above.
const MELODIES = [
  [76, null, 79, 76, 72, null, 74, 76, 74, null, 71, null, 67, null, 71, 74,
    72, null, 76, 72, 69, null, 72, 76, 77, null, 76, 74, 72, null, 69, null],
  [84, 83, 79, null, 76, 79, 84, null, 83, null, 79, 74, 79, null, 83, 86,
    84, null, 81, 76, 81, null, 84, 88, 89, 88, 84, null, 81, null, 77, null],
];

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.on = true;
    try { this.on = localStorage.getItem(KEY) !== 'off'; } catch { /* storage blocked */ }
    this.started = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.bus = null;
  }

  /** Call every frame; starts the music as soon as the browser allows sound. */
  tryStart() { if (!this.started && this.sfx.ctx && this.sfx.ctx.state === 'running') this.start(); }

  start() {
    const c = this.sfx.ctx;
    if (!c || this.started) return;
    this.started = true;
    this.bus = c.createGain();
    this.bus.gain.value = this.on ? VOLUME : 0;
    // a touch of filtering keeps it soft behind the sound effects
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    this.bus.connect(lp).connect(c.destination);
    this.nextTime = c.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 60);
  }

  setOn(on) {
    this.on = on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ }
    this.fadeTo(on ? (this.ducked ? VOLUME * 0.4 : VOLUME) : 0);
  }

  toggle() { this.setOn(!this.on); return this.on; }

  /** Quieter while paused (or during a big moment), back up afterwards. */
  duck(v) {
    this.ducked = v;
    if (this.on) this.fadeTo(v ? VOLUME * 0.4 : VOLUME);
  }

  fadeTo(v) {
    const c = this.sfx.ctx;
    if (!c || !this.bus) return;
    const g = this.bus.gain;
    g.cancelScheduledValues(c.currentTime);
    g.setValueAtTime(g.value, c.currentTime);
    g.linearRampToValueAtTime(v, c.currentTime + 0.4);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.bus?.disconnect();
    this.started = false;
  }

  schedule() {
    const c = this.sfx.ctx;
    if (!c) return;
    if (c.state !== 'running') { this.nextTime = c.currentTime + 0.1; return; }
    if (this.nextTime < c.currentTime - 0.5) this.nextTime = c.currentTime + 0.05; // tab was asleep
    while (this.nextTime < c.currentTime + LOOKAHEAD) {
      if (this.on) this.playStep(this.step, this.nextTime);
      this.step++;
      this.nextTime += STEP;
    }
  }

  /** 0 = normal, 1 = boss fight (heavier). */
  setIntensity(v) { this.intensity = v; }

  playStep(n, t) {
    const boss = this.intensity > 0;
    const inBar = n % 8; // eighth within the bar
    const bar = Math.floor(n / 8);
    const chord = CHORDS[bar % 4];
    const section = Math.floor(bar / 8) % 2; // the melody changes every 8 bars
    const intro = bar < 2; // first two bars: just chords and shaker

    // drums: kick on 1 and 3, clap on 2 and 4, shaker on every eighth
    if (!intro && (inBar === 0 || inBar === 4)) this.kick(t);
    if (!intro && (inBar === 2 || inBar === 6)) this.clap(t);
    this.shaker(t, inBar % 2 ? 0.018 : 0.03);
    if (!intro && inBar % 2 === 0 && inBar !== 0 && inBar !== 4) this.kick(t); // four on the floor
    if (boss && !intro) this.shaker(t + STEP / 2, 0.02);
    if (boss && inBar % 4 === 0) this.bass(midi(chord.root - 12), t, BEAT * 1.6);

    // bass: root on 1, fifth-ish bounce on the "and" of 2, root again on 3
    if (!intro) {
      if (inBar === 0) this.bass(midi(chord.root), t, BEAT * 0.9);
      if (inBar === 3) this.bass(midi(chord.root + 7), t, BEAT * 0.45);
      if (inBar === 4) this.bass(midi(chord.root), t, BEAT * 0.9);
      if (inBar === 7) this.bass(midi(chord.root + 12), t, BEAT * 0.4);
    }

    // ukulele strum: down on 1, up-down-up through the bar
    if ([0, 2, 3, 5, 6].includes(inBar)) {
      const up = inBar % 2 === 1;
      chord.tones.forEach((note, i) => this.pluck(midi(note), t + (up ? (2 - i) : i) * 0.012, inBar === 0 ? 0.05 : 0.035));
    }

    // melody (skipped in the intro, and on every 4th pass for a breather)
    if (!intro && bar % 16 < 14) {
      const m = MELODIES[section][(bar % 4) * 8 + inBar];
      if (m) this.whistle(midi(m), t, STEP * 1.6);
    }

    // glockenspiel twinkle at the end of every 4 bars
    if (bar % 4 === 3 && inBar >= 4) {
      const note = SCALE[5 + ((n * 3) % 5)] + 12;
      this.bell(midi(note), t);
    }
  }

  // ---------------------------------------------------------------- instruments
  env(t, attack, peak, decay) {
    const g = this.sfx.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.bus);
    return g;
  }

  osc(type, f, t, dur, gain) {
    const o = this.sfx.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.connect(gain);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  pluck(f, t, vol) {
    const g = this.env(t, 0.004, vol, 0.2);
    this.osc('sawtooth', f, t, 0.24, g);
    const g2 = this.env(t, 0.002, vol * 0.35, 0.08); // bright attack
    this.osc('square', f * 2, t, 0.1, g2);
  }

  bass(f, t, dur) {
    const g = this.env(t, 0.01, 0.13, dur);
    this.osc('sine', f, t, dur, g);
    const g2 = this.env(t, 0.005, 0.03, dur * 0.5);
    this.osc('triangle', f * 2, t, dur * 0.5, g2);
  }

  whistle(f, t, dur) {
    const c = this.sfx.ctx;
    const g = this.env(t, 0.01, 0.03, dur);
    const o = this.osc('square', f, t, dur, g);
    // gentle vibrato
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.value = f * 0.008;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    const g2 = this.env(t, 0.02, 0.012, dur * 0.8);
    this.osc('triangle', f * 2, t, dur, g2);
  }

  bell(f, t) {
    const g = this.env(t, 0.002, 0.03, 0.9);
    this.osc('sine', f, t, 0.9, g);
    const g2 = this.env(t, 0.002, 0.012, 0.4);
    this.osc('sine', f * 2.76, t, 0.4, g2);
  }

  kick(t) {
    const c = this.sfx.ctx;
    const g = this.env(t, 0.003, 0.16, 0.18);
    const o = c.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.15);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.22);
  }

  noise(t, dur, type, freq, vol) {
    const c = this.sfx.ctx;
    if (!this.sfx.noise) return;
    const src = c.createBufferSource();
    src.buffer = this.sfx.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.env(t, 0.002, vol, dur);
    src.connect(f).connect(g);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  clap(t) { this.noise(t, 0.12, 'bandpass', 1600, 0.06); this.noise(t + 0.012, 0.1, 'bandpass', 1200, 0.04); }
  shaker(t, vol) { this.noise(t, 0.05, 'highpass', 7000, vol); }
}

import * as THREE from 'three';
import { P } from './palette.js';
import { CONFIG } from './config.js';
import { buildWorld } from './world.js';
import { Particles } from './particles.js';
import { Germs, GERM_TYPES } from './germs.js';
import { Weapons } from './weapons.js';
import { Sugar } from './sugar.js';
import { Boss } from './boss.js';
import { Guide } from './guide.js';
import { Music } from './music.js';
import { drawQR } from './qr.js';
import { makePanel, makeButton, tickButtons, text, wrap, roundRect } from '../core/ui.js';
import { store } from '../core/util.js';

/**
 * FDC Plaque Attack: shrink down inside a giant mouth and protect the teeth.
 *
 *   title → intro (how to play) → wave 1 "plaque" → wave 2 "sugar rain" → boss "Raja Gula" → result
 *
 * The result screen teaches the takeaway (brush twice a day, less sugar, check-up every 6 months)
 * and shows the FDC offer with a QR code. In booth mode it goes back to the title by itself.
 */
const BOARD_KEY = 'fdc.plaque.board';
const COMBO_WINDOW = 1.6;

// The "Lobby FDC" buttons only appear when the game was opened from the FDC VR lobby. In the
// stand-alone Plaque Attack app there is no lobby to go back to.
const FROM_LOBBY = (() => {
  const q = new URLSearchParams(location.search).get('from') === 'lobby';
  try { if (q) sessionStorage.setItem('fdc.plaque.from', 'lobby'); return sessionStorage.getItem('fdc.plaque.from') === 'lobby'; } catch { return q; }
})();
const LOBBY_URL = location.port === '5176'
  ? `${location.protocol}//${location.hostname}:5173/?from=plaque`
  : '/?from=plaque';

const LINES = {
  welcome: 'Halo! Aku Gigi. Kita sedang ada di DALAM MULUT! Tekan MULAI untuk melindungi gigi.',
  intro1: 'Bakteri plak datang mau memakan gigi! Kamu yang harus melindungi mereka!',
  intro2: 'Tangan KANAN: sikat gigi raksasa. Ayunkan untuk memukul bakteri!',
  intro3: 'Tangan KIRI: tahan TRIGGER untuk menyemprot fluoride!',
  wave1: 'Plak adalah kumpulan bakteri yang memakan sisa makanan di gigimu.',
  scrub: 'Gigi jadi kuning? GOSOK dengan sikat untuk membersihkannya!',
  wave2: 'Hujan gula! Gula membuat bakteri berkembang biak dan menghasilkan ASAM. Tembak permennya!',
  acid: 'Asam dari bakteri bisa melubangi lapisan email gigi!',
  cavity: 'Aduh, gigi berlubang! Lubang tidak bisa sembuh sendiri, harus ditambal dokter gigi.',
  leap: 'Awas bakteri melompat! Pukul pakai sikat!',
  boss: 'RAJA GULA datang! Tembak 3 titik bercahaya di tubuhnya!',
  bossHalf: 'Sedikit lagi! Terus tembak titik bercahayanya!',
  win: 'HEBAT! Raja Gula kalah! Gigi-gigi selamat!',
  timeUp: 'Waktu habis! Raja Gula kabur... tapi gigimu masih kuat!',
};
const TIPS = [
  'Sikat gigi 2x sehari: pagi setelah sarapan dan malam sebelum tidur.',
  'Kurangi makanan dan minuman manis, terutama di antara jam makan.',
  'Periksa gigi ke dokter gigi setiap 6 bulan untuk scaling dan cek lubang.',
];

export function createGame(app) {
  const group = new THREE.Group();
  const world = buildWorld();
  group.add(world.group);
  const sparks = new Particles(group, { max: 1400, additive: true });
  const goo = new Particles(group, { max: 900, additive: false });
  const germs = new Germs(group, world, sparks, goo);
  const sugar = new Sugar(group, goo, sparks);
  const boss = new Boss(group, sparks, goo);
  const sfx = app.sfx;
  const guide = new Guide(group, sfx);
  const weapons = new Weapons(app, group, sparks);
  const music = new Music(sfx);
  const head = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  // ------------------------------------------------------------------ state
  let state = 'title'; // title | intro | play | end
  let waveIdx = -1;
  let waveT = 0;
  let spawnT = 0;
  let sugarT = 0;
  let leapT = 6;
  let roundT = 0;
  let score = 0;
  let combo = 0;
  let comboT = 0;
  let paused = false;
  let endT = 0;
  let hudTime = 0;
  let hudKey = '';
  const said = new Set();
  const stats = { germs: 0, candies: 0, spots: 0, splats: 0, scrub: 0, bossBeaten: false };
  const timers = [];
  const later = (s, fn) => timers.push({ t: s, fn });
  const mult = () => Math.min(3, 1 + Math.floor(combo / 5) * 0.5);
  const sayOnce = (key, secs = 4.5, mood) => { if (said.has(key)) return; said.add(key); guide.say(LINES[key], secs, mood); };

  // ------------------------------------------------------------------ panels
  const FRONT = new THREE.Vector3(0, 1.62, -1.55);
  // title
  const title = makePanel(1.5, 0.92, (c, W, H) => drawTitle(c, W, H));
  title.mesh.position.copy(FRONT);
  group.add(title.mesh);
  const bStart = makeButton(app, { label: 'MULAI!', sub: 'Lindungi gigi dari bakteri', tone: 'pink', w: 0.62, h: 0.17, onSelect: () => start() });
  bStart.position.set(0, FRONT.y - 0.6, FRONT.z + 0.02);
  group.add(bStart);
  const bLobby = makeButton(app, { label: 'Lobby FDC', tone: 'light', w: 0.36, h: 0.1, onSelect: () => toLobby() });
  bLobby.position.set(0, FRONT.y - 0.79, FRONT.z + 0.02);
  group.add(bLobby);
  // result
  let result = null;
  const resultPanel = makePanel(1.7, 1.0, (c, W, H) => drawResult(c, W, H));
  resultPanel.mesh.position.set(0, 1.66, -1.6);
  resultPanel.mesh.visible = false;
  group.add(resultPanel.mesh);
  const bAgain = makeButton(app, { label: 'Main lagi', tone: 'pink', w: 0.5, h: 0.13, onSelect: () => start() });
  bAgain.position.set(-0.3, 1.0, -1.58);
  bAgain.visible = false;
  group.add(bAgain);
  const bHome = makeButton(app, { label: 'Ke awal', tone: 'light', w: 0.4, h: 0.13, onSelect: () => toTitle() });
  bHome.position.set(0.25, 1.0, -1.58);
  bHome.visible = false;
  group.add(bHome);
  // HUD: score, combo, time, teeth (high in front, fixed in the world)
  const hud = makePanel(1.9, 0.3, (c, W, H) => drawHud(c, W, H));
  hud.mesh.position.set(0, 3.0, -2.9);
  hud.mesh.visible = false;
  group.add(hud.mesh);
  // wave banner
  let bannerText = null;
  let bannerT = 0;
  const banner = makePanel(2.2, 0.5, (c, W, H) => {
    if (!bannerText) return;
    roundRect(c, 8, 8, W - 16, H - 16, H * 0.3);
    const gr = c.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, P.hot); gr.addColorStop(1, '#9b5cff');
    c.fillStyle = gr; c.fill();
    c.lineWidth = 10; c.strokeStyle = '#ffffff'; c.stroke();
    text(c, bannerText.small, W / 2, H * 0.36, { size: H * 0.16, weight: 800, color: '#ffe7f0', align: 'center' });
    text(c, bannerText.big, W / 2, H * 0.75, { size: H * 0.32, weight: 900, color: '#ffffff', align: 'center' });
  });
  banner.mesh.position.set(0, 2.25, -2.4);
  banner.mesh.visible = false;
  group.add(banner.mesh);
  function showBanner(small, big) { bannerText = { small, big }; banner.redraw(); bannerT = 2.6; banner.mesh.visible = true; sfx.play('wave'); }
  // pause
  const pausePanel = makePanel(0.9, 0.25, (c, W, H) => {
    roundRect(c, 6, 6, W - 12, H - 12, H * 0.3); c.fillStyle = '#ffffff'; c.fill();
    text(c, 'Jeda', W / 2, H * 0.45, { size: H * 0.25, weight: 900, color: P.hot, align: 'center' });
    text(c, 'B / Y (atau M) untuk lanjut', W / 2, H * 0.75, { size: H * 0.13, color: P.muted, align: 'center' });
  });
  pausePanel.mesh.position.set(0, 1.65, -1.2);
  pausePanel.mesh.visible = false;
  group.add(pausePanel.mesh);
  const bResume = makeButton(app, { label: 'Lanjut', tone: 'pink', w: 0.34, h: 0.11, onSelect: () => setPaused(false) });
  bResume.position.set(-0.2, 1.42, -1.19);
  const bQuit = makeButton(app, { label: 'Keluar', tone: 'light', w: 0.34, h: 0.11, onSelect: () => { setPaused(false); toTitle(); } });
  bQuit.position.set(0.2, 1.42, -1.19);
  const bLobby2 = makeButton(app, { label: 'Lobby FDC', tone: 'light', w: 0.34, h: 0.1, onSelect: () => { setPaused(false); toLobby(); } });
  bLobby2.position.set(0, 1.29, -1.19);
  group.add(bResume, bQuit, bLobby2);
  bResume.visible = bQuit.visible = bLobby2.visible = false;
  function toLobby() { app.openPage(LOBBY_URL); }

  // floating "+10" score pop-ups (a small pool of sprites)
  const pops = [];
  for (let i = 0; i < 10; i++) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 96;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    sp.scale.set(0.42, 0.16, 1);
    sp.renderOrder = 40;
    sp.visible = false;
    group.add(sp);
    pops.push({ sp, cv, tex, t: 0 });
  }
  let popI = 0;
  function popText(at, str, color = '#ffffff') {
    const p = pops[popI++ % pops.length];
    const g = p.cv.getContext('2d');
    g.clearRect(0, 0, 256, 96);
    g.font = '900 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 12;
    g.strokeStyle = 'rgba(40,10,30,0.85)';
    g.strokeText(str, 128, 70);
    g.fillStyle = color;
    g.fillText(str, 128, 70);
    p.tex.needsUpdate = true;
    p.sp.position.copy(at);
    p.sp.visible = true;
    p.t = 0.9;
  }

  // goo on your face when a jumping germ gets you
  const splatCanvas = document.createElement('canvas');
  splatCanvas.width = splatCanvas.height = 256;
  {
    const g = splatCanvas.getContext('2d');
    g.fillStyle = 'rgba(139,224,78,0.9)';
    for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(128 + (Math.random() - 0.5) * 160, 128 + (Math.random() - 0.5) * 160, 20 + Math.random() * 40, 0, Math.PI * 2); g.fill(); }
  }
  const splatTex = new THREE.CanvasTexture(splatCanvas);
  const splat = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: splatTex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
  splat.position.set(0.03, 0, -0.22);
  splat.renderOrder = 9000;
  app.camera.add(splat);
  let splatT = 0;

  // ------------------------------------------------------------------ drawing
  function drawTitle(c, W, H) {
    roundRect(c, 8, 8, W - 16, H - 16, H * 0.07);
    c.fillStyle = 'rgba(255,255,255,0.96)'; c.fill();
    c.lineWidth = 12; c.strokeStyle = P.hot; c.stroke();
    text(c, 'FDC', W / 2, H * 0.14, { size: H * 0.07, weight: 900, color: P.mintDark, align: 'center' });
    const gr = c.createLinearGradient(W * 0.2, 0, W * 0.8, 0);
    gr.addColorStop(0, P.hot); gr.addColorStop(1, '#9b5cff');
    text(c, 'PLAQUE ATTACK', W / 2, H * 0.29, { size: H * 0.14, weight: 900, color: gr, align: 'center' });
    text(c, 'Lindungi gigi dari bakteri plak dan Raja Gula!', W / 2, H * 0.38, { size: H * 0.05, weight: 700, color: P.ink, align: 'center' });
    // how to play
    const rows = [['Tangan kanan', 'Sikat gigi: ayunkan untuk memukul bakteri, gosok gigi yang kuning'], ['Tangan kiri', 'Tahan trigger: semprot fluoride ke bakteri dan permen'], ['Bos', 'Tembak 3 titik bercahaya di tubuh Raja Gula']];
    rows.forEach(([a, b], i) => {
      const y = H * (0.5 + i * 0.075);
      text(c, a, W * 0.08, y, { size: H * 0.042, weight: 900, color: P.hot });
      text(c, b, W * 0.3, y, { size: H * 0.04, weight: 600, color: P.ink, maxWidth: W * 0.64 });
    });
    // today's best
    const top = topToday(3);
    text(c, 'Skor terbaik hari ini', W * 0.08, H * 0.78, { size: H * 0.04, weight: 900, color: P.mintDark });
    if (!top.length) text(c, 'Belum ada. Jadilah yang pertama!', W * 0.08, H * 0.85, { size: H * 0.038, color: P.muted });
    top.forEach((e, i) => text(c, `${i + 1}. ${e.score}`, W * 0.08 + i * W * 0.25, H * 0.85, { size: H * 0.045, weight: 900, color: i === 0 ? '#d9a32c' : P.ink }));
  }

  function drawHud(c, W, H) {
    roundRect(c, 6, 6, W - 12, H - 12, H * 0.45);
    c.fillStyle = 'rgba(40,10,30,0.72)'; c.fill();
    const lower = world.teeth.all;
    const healthy = lower.filter((t) => t.hp > 0.35).length;
    const left = Math.max(0, Math.ceil(hudTime));
    text(c, `${score}`, W * 0.06, H * 0.68, { size: H * 0.5, weight: 900, color: '#ffffff' });
    text(c, 'SKOR', W * 0.06, H * 0.26, { size: H * 0.16, weight: 800, color: '#ffb3c9' });
    if (mult() > 1) text(c, `COMBO ×${mult()}`, W * 0.4, H * 0.64, { size: H * 0.34, weight: 900, color: P.gold, align: 'center' });
    text(c, `${healthy}/${lower.length}`, W * 0.68, H * 0.68, { size: H * 0.4, weight: 900, color: healthy > lower.length * 0.6 ? '#9dffcf' : '#ffb13f', align: 'center' });
    text(c, 'GIGI SEHAT', W * 0.68, H * 0.26, { size: H * 0.16, weight: 800, color: '#ffb3c9', align: 'center' });
    text(c, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, W * 0.94, H * 0.68, { size: H * 0.4, weight: 900, color: left <= 10 ? '#ff8a8a' : '#ffffff', align: 'right' });
  }
  function drawResult(c, W, H) {
    if (!result) return;
    roundRect(c, 8, 8, W - 16, H - 16, H * 0.06);
    c.fillStyle = 'rgba(255,255,255,0.97)'; c.fill();
    c.lineWidth = 12; c.strokeStyle = P.hot; c.stroke();
    const L = W * 0.05;
    // left: score and stats
    text(c, result.win ? 'GIGI SELAMAT!' : 'WAKTU HABIS!', L, H * 0.12, { size: H * 0.075, weight: 900, color: P.hot });
    text(c, result.rank, L, H * 0.19, { size: H * 0.045, weight: 800, color: '#9b5cff' });
    text(c, `${result.score}`, L, H * 0.34, { size: H * 0.13, weight: 900, color: P.ink });
    if (result.best) text(c, 'SKOR TERBAIK HARI INI!', L, H * 0.395, { size: H * 0.034, weight: 900, color: '#d9a32c' });
    const rows = [
      ['Bakteri dibasmi', result.germs],
      ['Permen ditembak', result.candies],
      ['Gigi sehat', `${result.healthy} / ${result.teeth}`],
      ['Bonus gigi sehat', `+${result.bonus}`],
    ];
    rows.forEach(([a, b], i) => {
      const y = H * (0.46 + i * 0.055);
      text(c, a, L, y, { size: H * 0.04, color: P.muted });
      text(c, `${b}`, W * 0.45, y, { size: H * 0.04, weight: 800, align: 'right' });
    });
    // the lesson
    text(c, 'Ingat ya!', L, H * 0.7, { size: H * 0.042, weight: 900, color: P.mintDark });
    c.font = `600 ${Math.round(H * 0.031)}px system-ui`;
    let y = H * 0.75;
    for (const tip of TIPS) {
      for (const l of wrap(c, `• ${tip}`, W * 0.43).slice(0, 2)) { text(c, l, L, y, { size: H * 0.031, weight: 600, color: P.ink }); y += H * 0.038; }
    }
    // right: FDC offer + QR
    const R = W * 0.52;
    roundRect(c, R, H * 0.06, W * 0.43, H * 0.88, H * 0.05);
    c.fillStyle = P.mintSoft; c.fill();
    text(c, 'FDC Dental Clinic', R + W * 0.215, H * 0.13, { size: H * 0.05, weight: 900, color: P.mintDark, align: 'center' });
    c.font = `900 ${Math.round(H * 0.042)}px system-ui`;
    wrap(c, CONFIG.promoTitle, W * 0.39).slice(0, 2).forEach((l, i) => text(c, l, R + W * 0.215, H * (0.2 + i * 0.05), { size: H * 0.042, weight: 900, color: P.hot, align: 'center' }));
    const qs = H * 0.42;
    drawQR(c, CONFIG.promoUrl, R + W * 0.215 - qs / 2, H * 0.3, qs);
    text(c, `Kode: ${CONFIG.promoCode}`, R + W * 0.215, H * 0.79, { size: H * 0.045, weight: 900, color: P.ink, align: 'center' });
    c.font = `600 ${Math.round(H * 0.03)}px system-ui`;
    wrap(c, CONFIG.promoText, W * 0.39).slice(0, 2).forEach((l, i) => text(c, l, R + W * 0.215, H * (0.84 + i * 0.037), { size: H * 0.03, weight: 600, color: P.muted, align: 'center' }));
    if (CONFIG.boothMode && endT > 0) text(c, `Kembali ke awal dalam ${Math.ceil(endT)} detik`, R + W * 0.215, H * 0.925, { size: H * 0.026, color: P.muted, align: 'center' });
  }

  // ------------------------------------------------------------------ leaderboard (saved on the headset)
  function today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
  function topToday(n) { return store.get(BOARD_KEY, []).filter((e) => e.day === today()).sort((a, b) => b.score - a.score).slice(0, n); }
  function saveScore(s) {
    const list = store.get(BOARD_KEY, []);
    const best = !list.some((e) => e.day === today() && e.score >= s);
    list.push({ score: s, at: Date.now(), day: today() });
    store.set(BOARD_KEY, list.sort((a, b) => b.score - a.score).slice(0, 100));
    return best;
  }

  // ------------------------------------------------------------------ flow
  function layout() {
    const t = state === 'title';
    const e = state === 'end';
    title.mesh.visible = t;
    bStart.visible = t;
    bLobby.visible = t && FROM_LOBBY;
    resultPanel.mesh.visible = e;
    bAgain.visible = bHome.visible = e;
    hud.mesh.visible = state === 'intro' || state === 'play';
    pausePanel.mesh.visible = bResume.visible = bQuit.visible = paused;
    bLobby2.visible = paused && FROM_LOBBY;
    app.pointers.lasers = t || e || paused;
    weapons.arm((state === 'intro' || state === 'play') && !paused);
  }

  function setPaused(v) {
    if (state !== 'intro' && state !== 'play') v = false;
    paused = v;
    music.duck(v);
    layout();
  }
  app.on((type) => {
    if (type === 'menu') setPaused(!paused);
    if (type === 'xr') layout(); // move the brush and blaster between the camera and the hands
  });

  function resetRound() {
    germs.clear();
    sugar.clear();
    boss.hide();
    weapons.clearShots();
    world.teeth.reset();
    sparks.clear();
    goo.clear();
    timers.length = 0;
    said.clear();
    score = 0; combo = 0; comboT = 0; roundT = 0;
    Object.assign(stats, { germs: 0, candies: 0, spots: 0, splats: 0, scrub: 0, bossBeaten: false });
    music.setIntensity(0);
  }

  function start() {
    resetRound();
    state = 'intro';
    waveIdx = -1;
    waveT = 0;
    layout();
    sfx.play('blip');
    if (!CONFIG.showTutorial) { nextWave(); return; }
    guide.say(LINES.intro1, 3.4);
    later(3.6, () => guide.say(LINES.intro2, 3.6));
    later(7.4, () => guide.say(LINES.intro3, 3.6));
    // a few slow practice germs, close by
    later(4.0, () => { for (let i = 0; i < 3; i++) germs.spawn('plak', new THREE.Vector3(-0.8 + i * 0.8, 0, -2.4), { speed: 0.5 }); });
    later(11.2, () => nextWave());
  }

  function nextWave() {
    waveIdx++;
    const w = CONFIG.waves[waveIdx];
    if (!w) { endRound(false); return; }
    state = 'play';
    waveT = 0;
    spawnT = 0.5;
    sugarT = 2;
    layout();
    if (w.id === 'plaque') { showBanner('GELOMBANG 1', 'SERANGAN PLAK!'); later(1.2, () => guide.say(LINES.wave1, 5)); }
    if (w.id === 'sugar') { showBanner('GELOMBANG 2', 'HUJAN GULA!'); later(1.0, () => guide.say(LINES.wave2, 5.5, 'warn')); }
    if (w.id === 'boss') {
      showBanner('BOS TERAKHIR', 'RAJA GULA!');
      boss.start();
      sfx.play('roar');
      music.setIntensity(1);
      later(1.0, () => guide.say(LINES.boss, 5, 'warn'));
    }
  }

  function endRound(win) {
    if (state === 'end') return;
    state = 'end';
    germs.clear();
    sugar.clear();
    weapons.clearShots();
    if (boss.active) boss.hide();
    music.setIntensity(0);
    const teeth = world.teeth.all;
    const healthy = teeth.filter((t) => t.hp > 0.35).length;
    const bonus = healthy * 20;
    score += bonus;
    const best = saveScore(score);
    const rank = score >= 3500 ? 'Pahlawan Gigi Legendaris!' : score >= 2200 ? 'Pahlawan Gigi Hebat!' : score >= 1200 ? 'Penjaga Gigi Pemberani' : 'Pejuang Gigi Pemula';
    result = { win, score, best, rank, germs: stats.germs, candies: stats.candies, healthy, teeth: teeth.length, bonus };
    endT = CONFIG.boothMode ? CONFIG.resetAfterSeconds : 0;
    resultPanel.redraw();
    layout();
    sfx.play('win');
    guide.say(win ? LINES.win : LINES.timeUp, 5);
    guide.cheer();
    for (let i = 0; i < 4; i++) later(i * 0.35, () => sparks.burst(new THREE.Vector3((Math.random() - 0.5) * 3, 2.6, -2.2), { count: 60, colors: ['#ffffff', ...P.candy], speed: 4, size: 0.12, life: 1.6 }));
    for (const t of teeth) if (t.hp > 0.35) t.shine = 1;
  }

  function toTitle() {
    resetRound();
    state = 'title';
    paused = false;
    title.redraw();
    layout();
    guide.say(LINES.welcome, 6);
  }

  // ------------------------------------------------------------------ scoring
  function addScore(points, at, color) {
    if (comboT > 0) combo++; else combo = 1;
    comboT = COMBO_WINDOW;
    const m = mult();
    const pts = Math.round(points * m);
    score += pts;
    popText(at.clone().add(new THREE.Vector3(0, 0.25, 0)), m > 1 ? `+${pts} ×${m}` : `+${pts}`, color);
    if (combo > 0 && combo % 5 === 0) sfx.play('combo');
  }
  function onKill(g, how) {
    stats.germs++;
    addScore(GERM_TYPES[g.type].points + (how === 'brush' ? 5 : 0), g.pos, how === 'brush' ? '#9dffcf' : '#ffffff');
    sfx.play('pop');
    weapons.haptic(how === 'brush' ? 'right' : 'left', how === 'brush' ? 0.7 : 0.3, 50);
  }

  // ------------------------------------------------------------------ per frame
  const wave = () => CONFIG.waves[waveIdx];
  let scrubSound = 0;

  function update(dt) {
    app.camera.getWorldPosition(head);
    tickButtons(group, dt);
    world.update(dt);
    guide.update(dt, head);
    music.tryStart();
    sparks.setScale(app.renderer.xr.isPresenting ? 900 : app.renderer.domElement.height * 0.9);
    goo.setScale(app.renderer.xr.isPresenting ? 900 : app.renderer.domElement.height * 0.9);
    for (const p of pops) { if (p.t > 0) { p.t -= dt; p.sp.position.y += dt * 0.5; p.sp.material.opacity = Math.min(1, p.t * 2.5); if (p.t <= 0) p.sp.visible = false; } }
    if (splatT > 0) { splatT -= dt; splat.material.opacity = Math.min(0.6, splatT * 0.6); }
    if (bannerT > 0) {
      bannerT -= dt;
      const k = Math.min(1, (2.6 - bannerT) * 5);
      banner.mesh.scale.setScalar(0.6 + k * 0.4 + Math.sin(k * Math.PI) * 0.1);
      if (bannerT <= 0) banner.mesh.visible = false;
    }
    if (paused) { sparks.update(0); return; }

    for (const t of [...timers]) { t.t -= dt; if (t.t <= 0) { timers.splice(timers.indexOf(t), 1); t.fn(); } }

    if (state === 'title') {
      // a couple of germs wandering about for the attract screen
      if (germs.count < 3 && Math.random() < dt * 0.5) germs.spawn('plak', null, { speed: 0.6 });
    }

    if (state === 'play') {
      roundT += dt;
      waveT += dt;
      const w = wave();
      const diff = CONFIG.difficulty;
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = w.spawnEvery / diff * (0.8 + Math.random() * 0.4);
        const type = w.id === 'plaque' ? (Math.random() < 0.85 ? 'plak' : 'asam') : Math.random() < 0.55 ? 'plak' : 'asam';
        germs.spawn(type);
      }
      if (w.sugarEvery) {
        sugarT -= dt;
        if (sugarT <= 0) {
          sugarT = w.sugarEvery / diff * (0.7 + Math.random() * 0.6);
          const t = world.teeth.lower.list[Math.floor(Math.random() * 14)];
          // drop between you and the teeth so it's easy to see and shoot
          sugar.drop(t.base.x * 0.7 + (Math.random() - 0.5) * 0.4, t.base.z * 0.7 - 0.3);
          sfx.play('whistle');
        }
      }
      // some germs jump at you from wave 2 on
      if (waveIdx >= 1) {
        leapT -= dt;
        if (leapT <= 0) {
          leapT = 6 + Math.random() * 4;
          const cand = germs.alive.filter((g) => g.state === 'walk' && g.pos.distanceTo(head) < 4.5);
          if (cand.length) { germs.leapAt(cand[0], head.clone().add(new THREE.Vector3(0, -0.05, 0))); sayOnce('leap', 3, 'warn'); }
        }
      }
      if (w.id !== 'boss' && waveT >= w.seconds) nextWave();
      else if (w.id === 'boss' && waveT >= w.seconds && boss.active) { boss.hide(); endRound(false); }
      hudTime = w.seconds - waveT;
    } else if (state === 'intro') hudTime = 0;

    // combo timer
    if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }

    // germs move and chew
    germs.update(dt, {
      head,
      difficulty: CONFIG.difficulty,
      onBite(t, amount, g) {
        if (state !== 'play' && state !== 'intro') return;
        const before = t.hp;
        t.hp = Math.max(0, t.hp - amount);
        t.dirty = Math.min(1, t.dirty + amount * 2.5);
        t.hit = Math.max(t.hit, 0.3);
        if (Math.random() < 0.08) sfx.play('chomp');
        if (t.dirty > 0.4) sayOnce('scrub', 4.5);
        if (before > 0.35 && t.hp <= 0.35) {
          sfx.play('crack');
          goo.burst(t.attach, { count: 10, color: '#7b4a23', speed: 1, size: 0.06, life: 0.6, gravity: 3 });
          sayOnce(waveIdx >= 1 ? 'acid' : 'cavity', 5, 'warn');
          if (said.has('acid')) later(5.5, () => sayOnce('cavity', 5, 'warn'));
        }
        void g;
      },
      onSplat() {
        stats.splats++;
        splatT = 1.4;
        score = Math.max(0, score - 20);
        combo = 0;
        sfx.play('splat');
        weapons.haptic('right', 1, 120);
        weapons.haptic('left', 1, 120);
      },
    });

    // brush: swing through germs and candy, scrub teeth clean
    if (weapons.armed) {
      const tip = weapons.tipPos;
      const fast = weapons.tipSpeed > 1.2 || weapons.swing > 0.2;
      if (fast) {
        const reach = app.renderer.xr.isPresenting ? 0.24 : 0;
        if (reach) {
          germs.hitSphere(tip, reach, 99, (g) => onKill(g, 'brush'));
          sugar.hitSphere(tip, reach, (s) => { stats.candies++; addScore(15, s.pos, P.gold); sfx.play('candy'); });
        } else {
          // desktop swing: hit what's in front of you, within 2.4 m
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(app.camera.getWorldQuaternion(new THREE.Quaternion()));
          for (const g of germs.alive) {
            tmp.copy(g.pos).sub(head);
            if (tmp.length() < 2.6 && tmp.normalize().dot(fwd) > 0.82) germs.hitSphere(g.pos, 0.01, 99, (gg) => onKill(gg, 'brush'));
          }
        }
        if (Math.random() < dt * 8) sfx.play('swoosh');
      }
      // scrubbing
      scrubSound -= dt;
      for (const t of world.teeth.all) {
        const d = t.attach.distanceTo(tip);
        if (d < 0.42 && weapons.tipSpeed > 0.35) {
          const was = t.dirty;
          t.dirty = Math.max(0, t.dirty - dt * 1.3);
          if (t.hp > 0.05) t.hp = Math.min(1, t.hp + dt * 0.12);
          t.shine = Math.min(1, t.shine + dt * 3);
          if (Math.random() < dt * 25) sparks.burst(t.attach, { count: 2, colors: ['#ffffff', P.cyan], speed: 0.8, size: 0.06, life: 0.4 });
          if (scrubSound <= 0) { sfx.play('scrub'); scrubSound = 0.09; weapons.haptic('right', 0.15, 30); }
          if (was > 0.05 && t.dirty === 0) { addScore(25, t.attach, '#9dffcf'); sfx.play('heal'); }
          stats.scrub += dt;
        }
      }
    }

    // shots
    weapons.update(dt, {
      onFire: () => sfx.play('shoot'),
      onShot: (s) => {
        if (germs.hitSphere(s.pos, 0.08, 1, (g) => onKill(g, 'shot')).length) return true;
        if (sugar.hitSphere(s.pos, 0.1, (c) => { stats.candies++; addScore(15, c.pos, P.gold); sfx.play('candy'); })) return true;
        if (boss.hitSpot(s.pos, (spot) => { addScore(20, spot.world, '#7ff3ff'); sfx.play('hit'); }, (spot, left) => {
          stats.spots++;
          addScore(150, spot.world, P.gold);
          sfx.play('break');
          if (left === 1) guide.say(LINES.bossHalf, 3.5);
        })) return true;
        return false;
      },
    });

    // sugar falls; where it lands, sugar germs are born
    sugar.update(dt, (pos, s) => {
      sfx.play('land');
      if (state !== 'play') return;
      const n = s.kind === 'throw' ? 1 : 2;
      for (let i = 0; i < n; i++) germs.spawn('gula', pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4)));
    });

    boss.update(dt, head, {
      difficulty: CONFIG.difficulty,
      onArrive: () => sfx.play('roar'),
      onThrow: (from) => {
        const t = world.teeth.lower.list.filter((x) => x.hp > 0.2);
        const target = (t.length ? t : world.teeth.lower.list)[Math.floor(Math.random() * (t.length || 14))];
        sugar.throw(from, target.attach.clone(), 2.2);
        sfx.play('throw');
      },
      onSummon: (at) => { for (let i = 0; i < 2; i++) germs.spawn(Math.random() < 0.5 ? 'plak' : 'asam', at.clone().add(new THREE.Vector3((i - 0.5) * 0.8, 0, 0))); },
      onDefeated: () => {
        stats.bossBeaten = true;
        addScore(1000, new THREE.Vector3(0, 2.2, -4.5), P.gold);
        sfx.play('boom');
        later(2.2, () => endRound(true));
      },
    });

    sparks.update(dt);
    goo.update(dt);

    // HUD
    if (hud.mesh.visible) {
      const key = `${score}|${mult()}|${Math.ceil(hudTime)}|${world.teeth.all.filter((t) => t.hp > 0.35).length}`;
      if (key !== hudKey) { hudKey = key; hud.redraw(); }
    }
    // result countdown (booth mode)
    if (state === 'end' && CONFIG.boothMode) {
      const before = Math.ceil(endT);
      endT -= dt;
      if (Math.ceil(endT) !== before) resultPanel.redraw();
      if (endT <= 0) toTitle();
    }
  }

  // first screen
  layout();
  guide.say(LINES.welcome, 6);

  // test hooks (browser console)
  window.plaque = {
    get state() { return state; },
    get score() { return score; },
    get wave() { return waveIdx; },
    get germs() { return germs; },
    get boss() { return boss; },
    get result() { return result; },
    world, weapons, sugar, start, toTitle, nextWave, endRound,
    shootAt(p) { const s = { pos: p.clone() }; return [germs.hitSphere(s.pos, 0.3, 1, (g) => onKill(g, 'shot')).length, boss.hitSpot(s.pos)]; },
  };

  return {
    group,
    fog: world.fog,
    spawn: { x: 0, z: 0, yaw: 0 },
    bounds: 1.3,
    center: { x: 0, z: -0.4 },
    pitch: -0.1,
    update,
    dispose() {
      weapons.dispose();
      music.stop();
      app.camera.remove(splat);
    },
  };
}

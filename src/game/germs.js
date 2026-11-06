import * as THREE from 'three';
import { P } from './palette.js';
import { THROAT, tongueY, ARCH } from './world.js';

/**
 * Plaque germs: cute, spiky, googly-eyed blobs that hop across the tongue and chew on teeth.
 * All of them together are 5 instanced meshes (body, spikes, eye whites, pupils, mouths), so
 * 40+ germs on screen cost the same as one.
 *
 * Types
 *   plak  lime, normal
 *   asam  purple, small and fast, can float up to the upper teeth (acid!)
 *   gula  orange, big, 3 hits: born where sugar lands
 */
const MAX = 48;
export const GERM_TYPES = {
  plak: { color: P.lime, radius: 0.17, speed: 0.75, hp: 1, bite: 0.03, points: 10 },
  asam: { color: P.purple, radius: 0.13, speed: 1.15, hp: 1, bite: 0.04, points: 15 },
  gula: { color: P.orange, radius: 0.25, speed: 0.55, hp: 3, bite: 0.05, points: 30 },
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function blobGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 5.1) * Math.sin(v.y * 4.3) * Math.sin(v.z * 4.7) * 0.07;
    v.multiplyScalar(1 + n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export class Germs {
  constructor(parent, world, fx, goo) {
    this.world = world;
    this.fx = fx;
    this.goo = goo;
    this.list = [];
    for (let i = 0; i < MAX; i++) this.list.push({ alive: false, i, pos: new THREE.Vector3(), from: new THREE.Vector3(), vel: new THREE.Vector3() });

    const body = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.0, emissive: '#1a0a20', emissiveIntensity: 0.4 });
    const make = (geo, mat, count) => {
      const m = new THREE.InstancedMesh(geo, mat, count);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      for (let i = 0; i < count; i++) m.setMatrixAt(i, ZERO);
      parent.add(m);
      return m;
    };
    this.bodies = make(blobGeometry(), body, MAX);
    this.spikes = make(new THREE.ConeGeometry(0.28, 0.6, 8), body, MAX * 5);
    this.whites = make(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2 }), MAX * 2);
    this.pupils = make(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: '#1b0f22' }), MAX * 2);
    this.mouths = make(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: '#3a0a22' }), MAX);
    for (let i = 0; i < MAX; i++) this.bodies.setColorAt(i, _c.set(P.lime));
    for (let i = 0; i < MAX * 5; i++) this.spikes.setColorAt(i, _c.set(P.lime));
    this.spikeDirs = [[0, 1, 0], [0.8, 0.5, 0.2], [-0.8, 0.5, 0.2], [0.4, 0.3, -0.85], [-0.4, 0.3, -0.85]].map((d) => new THREE.Vector3(...d).normalize());
    this.t = 0;
  }

  get alive() { return this.list.filter((g) => g.alive); }
  get count() { let n = 0; for (const g of this.list) if (g.alive) n++; return n; }

  /** Pick a tooth that still has some life (prefer the less-eaten ones, lower row mostly). */
  pickTooth(upperOk) {
    const teeth = this.world.teeth;
    const pool = (upperOk && Math.random() < 0.35 ? teeth.upper.list : teeth.lower.list).filter((t) => t.hp > 0.05);
    if (!pool.length) return teeth.lower.list[Math.floor(Math.random() * teeth.lower.list.length)];
    pool.sort((a, b) => a.eaters - b.eaters + (Math.random() - 0.5) * 2);
    return pool[0];
  }

  spawn(type = 'plak', from = null, opts = {}) {
    const g = this.list.find((x) => !x.alive);
    if (!g) return null;
    const T = GERM_TYPES[type];
    g.alive = true;
    g.type = type;
    g.hp = T.hp;
    g.r = T.radius * (0.9 + Math.random() * 0.2);
    g.speed = T.speed * (0.85 + Math.random() * 0.3) * (opts.speed || 1);
    g.state = 'spawn';
    g.t = 0;
    g.phase = Math.random() * 10;
    g.flash = 0;
    g.squash = 0;
    g.tooth = opts.tooth || this.pickTooth(type === 'asam');
    g.tooth.eaters++;
    g.leap = false;
    if (from) g.pos.copy(from);
    else g.pos.set((Math.random() - 0.5) * 2.2, 0, THROAT.z + 1.2 + Math.random() * 0.8);
    g.pos.y = Math.max(g.pos.y, tongueY(g.pos.x, g.pos.z) + g.r);
    g.from.copy(g.pos);
    this.bodies.setColorAt(g.i, _c.set(T.color));
    for (let k = 0; k < 5; k++) this.spikes.setColorAt(g.i * 5 + k, _c.set(T.color).offsetHSL(0, 0, -0.08));
    this.bodies.instanceColor.needsUpdate = true;
    this.spikes.instanceColor.needsUpdate = true;
    return g;
  }

  /** Send a germ flying at the player's face (swat it!). */
  leapAt(g, head) {
    if (!g || !g.alive) return;
    if (g.tooth) { g.tooth.eaters = Math.max(0, g.tooth.eaters - 1); g.tooth = null; }
    g.state = 'leap';
    g.t = 0;
    g.from.copy(g.pos);
    g.leapTo = head.clone();
    g.leapDur = 1.5;
  }

  /** Damage germs inside a sphere. Returns the germs that died. */
  hitSphere(center, radius, dmg, onKill) {
    const killed = [];
    for (const g of this.list) {
      if (!g.alive || g.state === 'spawn' && g.t < 0.15) continue;
      if (g.pos.distanceTo(center) < radius + g.r) {
        g.hp -= dmg;
        g.flash = 1;
        g.squash = 1;
        if (g.hp <= 0) { this.kill(g); killed.push(g); onKill?.(g); }
      }
    }
    return killed;
  }

  kill(g) {
    const T = GERM_TYPES[g.type];
    g.alive = false;
    if (g.tooth) { g.tooth.eaters = Math.max(0, g.tooth.eaters - 1); g.tooth = null; }
    this.goo.burst(g.pos, { count: 18, color: T.color, speed: 2.2, size: g.r * 0.7, life: 0.7, gravity: 4, up: 1.0 });
    this.fx.burst(g.pos, { count: 14, colors: ['#ffffff', P.cyan, '#fff6a8'], speed: 2.4, size: 0.07, life: 0.5 });
  }

  clear() { for (const g of this.list) { if (g.alive && g.tooth) g.tooth.eaters = 0; g.alive = false; } }

  /**
   * Move, chew and draw every germ.
   * ctx: { head, dt, onBite(tooth, amount), onSplat(germ) }
   */
  update(dt, ctx) {
    this.t += dt;
    const head = ctx.head;
    for (const g of this.list) {
      if (!g.alive) continue;
      g.t += dt;
      if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 5);
      if (g.squash > 0) g.squash = Math.max(0, g.squash - dt * 4);
      const tooth = g.tooth;
      if (g.state === 'spawn') {
        if (g.t > 0.45) { g.state = 'walk'; g.t = 0; }
      } else if (g.state === 'walk') {
        if (!tooth || tooth.hp <= 0.02) { if (tooth) tooth.eaters--; g.tooth = this.pickTooth(g.type === 'asam'); g.tooth.eaters++; }
        const target = g.tooth.attach;
        _v.copy(target).sub(g.pos);
        const flying = g.tooth.which === 'upper';
        if (!flying) _v.y = 0;
        const d = _v.length();
        if (d < 0.08 + g.r * 0.3) { g.state = 'eat'; g.t = 0; }
        else {
          _v.multiplyScalar(Math.min(d, g.speed * dt) / d);
          g.pos.add(_v);
          if (flying) {
            // float up in a wobbly arc
            g.pos.x += Math.sin(g.t * 6 + g.phase) * 0.004;
          } else {
            const hop = Math.abs(Math.sin(g.t * 7 + g.phase)) * 0.14;
            const ground = Math.max(tongueY(g.pos.x, g.pos.z), 0);
            g.pos.y = ground + g.r + hop;
            // climbing the tooth at the end
            if (d < 0.6) g.pos.y = THREE.MathUtils.lerp(g.pos.y, target.y, 1 - d / 0.6);
          }
        }
      } else if (g.state === 'eat') {
        const t = g.tooth;
        if (!t || t.hp <= 0) { g.state = 'walk'; continue; }
        g.pos.copy(t.attach).addScaledVector(t.normal, g.r * 0.85);
        g.pos.x += Math.sin(g.t * 18 + g.phase) * 0.01;
        const bite = GERM_TYPES[g.type].bite * ctx.difficulty * dt;
        ctx.onBite?.(t, bite, g);
      } else if (g.state === 'leap') {
        const k = Math.min(1, g.t / g.leapDur);
        g.pos.lerpVectors(g.from, g.leapTo, k);
        g.pos.y += Math.sin(k * Math.PI) * 1.0;
        if (k >= 1) { ctx.onSplat?.(g); g.alive = false; }
      }
    }
    this.draw(head);
  }

  draw(head) {
    const time = this.t;
    for (const g of this.list) {
      const i = g.i;
      if (!g.alive) {
        this.bodies.setMatrixAt(i, ZERO);
        this.mouths.setMatrixAt(i, ZERO);
        for (let k = 0; k < 5; k++) this.spikes.setMatrixAt(i * 5 + k, ZERO);
        for (let k = 0; k < 2; k++) { this.whites.setMatrixAt(i * 2 + k, ZERO); this.pupils.setMatrixAt(i * 2 + k, ZERO); }
        continue;
      }
      // pop-in, squash when hit, breathing
      const grow = g.state === 'spawn' ? easeOutBack(Math.min(1, g.t / 0.45)) : 1;
      const breathe = 1 + Math.sin(time * 5 + g.phase) * 0.05;
      const chew = g.state === 'eat' ? Math.sin(g.t * 16) * 0.12 : 0;
      const r = g.r * grow;
      const sx = r * (breathe + g.squash * 0.35 + chew);
      const sy = r * (breathe - g.squash * 0.3 - chew * 0.5);
      // face the player
      _v.copy(head).sub(g.pos);
      const yaw = Math.atan2(_v.x, _v.z);
      const pitch = Math.atan2(-_v.y, Math.hypot(_v.x, _v.z)) * 0.4;
      _q.setFromEuler(_e.set(pitch, yaw, Math.sin(time * 3 + g.phase) * 0.15));
      _s.set(sx, sy, sx);
      _m.compose(g.pos, _q, _s);
      this.bodies.setMatrixAt(i, _m);
      if (g.flash > 0) this.bodies.setColorAt(i, _c.set(GERM_TYPES[g.type].color).lerp(WHITE, g.flash));
      else if (g._lastFlash) this.bodies.setColorAt(i, _c.set(GERM_TYPES[g.type].color));
      g._lastFlash = g.flash > 0;
      // spikes
      for (let k = 0; k < 5; k++) {
        const d = this.spikeDirs[k];
        _p.copy(d).multiply(_s).applyQuaternion(_q).add(g.pos);
        const sq = _q2.setFromUnitVectors(UP, _v.copy(d).applyQuaternion(_q));
        const ss = r * (0.55 + Math.sin(time * 6 + k + g.phase) * 0.08);
        _m.compose(_p, sq, _s.set(ss, ss, ss));
        this.spikes.setMatrixAt(i * 5 + k, _m);
        _s.set(sx, sy, sx);
      }
      // eyes: big googly whites, pupils that look at you, an angry chomping mouth
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1;
        _p.set(side * 0.38, 0.28, 0.82).multiply(_s).applyQuaternion(_q).add(g.pos);
        const ew = r * (g.type === 'gula' ? 0.3 : 0.36);
        _m.compose(_p, _q, _v.set(ew, ew * (g.state === 'eat' ? 0.8 : 1.05), ew * 0.6));
        this.whites.setMatrixAt(i * 2 + k, _m);
        _p.set(side * 0.38, 0.26, 1.02).multiply(_s).applyQuaternion(_q).add(g.pos);
        const pw = ew * 0.5;
        _m.compose(_p, _q, _v.set(pw, pw, pw * 0.5));
        this.pupils.setMatrixAt(i * 2 + k, _m);
      }
      _p.set(0, -0.3, 0.86).multiply(_s).applyQuaternion(_q).add(g.pos);
      const open = g.state === 'eat' ? 0.18 + Math.abs(Math.sin(g.t * 16)) * 0.22 : g.state === 'leap' ? 0.4 : 0.12;
      _m.compose(_p, _q, _v.set(r * 0.42, r * open, r * 0.2));
      this.mouths.setMatrixAt(i, _m);
    }
    for (const m of [this.bodies, this.spikes, this.whites, this.pupils, this.mouths]) m.instanceMatrix.needsUpdate = true;
    this.bodies.instanceColor.needsUpdate = true;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color('#ffffff');
function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
void ARCH;

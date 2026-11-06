import * as THREE from 'three';
import { P } from './palette.js';
import { tongueY } from './world.js';

/**
 * Sugar: wrapped candies that rain down from the roof of the mouth (or that the Sugar King
 * throws). Shoot them before they land: where sugar lands, big orange sugar-germs are born.
 * Three instanced meshes (candy + two wrapper ends) for all of them.
 */
const MAX = 24;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class Sugar {
  constructor(parent, goo, sparks) {
    this.goo = goo;
    this.sparks = sparks;
    this.list = [];
    for (let i = 0; i < MAX; i++) this.list.push({ alive: false, i, pos: new THREE.Vector3(), vel: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3() });
    const m = new THREE.MeshStandardMaterial({ roughness: 0.15, metalness: 0.1, emissive: '#331020', emissiveIntensity: 0.3 });
    const make = (geo, count) => {
      const im = new THREE.InstancedMesh(geo, m, count);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      for (let i = 0; i < count; i++) { im.setMatrixAt(i, ZERO); im.setColorAt(i, _c.set('#ffffff')); }
      parent.add(im);
      return im;
    };
    const candy = new THREE.SphereGeometry(1, 16, 12);
    this.candies = make(candy, MAX);
    const wrap = new THREE.ConeGeometry(0.75, 1, 10);
    wrap.translate(0, -0.5, 0);
    this.wraps = make(wrap, MAX * 2);
    this.t = 0;
  }

  /** Candy falling from the palate onto (x, z). */
  drop(x, z) {
    const s = this.list.find((c) => !c.alive);
    if (!s) return null;
    s.alive = true;
    s.kind = 'drop';
    s.pos.set(x, 5.6, z);
    s.vel.set(0, -0.4, 0);
    s.t = 0;
    s.spin = (Math.random() - 0.5) * 6;
    s.color = P.candy[Math.floor(Math.random() * P.candy.length)];
    s.size = 0.16;
    this.paint(s);
    return s;
  }

  /** Candy thrown in an arc from `from` to `to` (the Sugar King). */
  throw(from, to, dur = 1.8) {
    const s = this.list.find((c) => !c.alive);
    if (!s) return null;
    s.alive = true;
    s.kind = 'throw';
    s.from.copy(from);
    s.to.copy(to);
    s.pos.copy(from);
    s.t = 0;
    s.dur = dur;
    s.spin = 8;
    s.color = P.candy[Math.floor(Math.random() * P.candy.length)];
    s.size = 0.2;
    this.paint(s);
    return s;
  }

  paint(s) {
    this.candies.setColorAt(s.i, _c.set(s.color));
    this.wraps.setColorAt(s.i * 2, _c.set(s.color).offsetHSL(0.05, 0, 0.12));
    this.wraps.setColorAt(s.i * 2 + 1, _c);
    this.candies.instanceColor.needsUpdate = true;
    this.wraps.instanceColor.needsUpdate = true;
  }

  /** Pop candies inside a sphere (shots). Returns how many popped. */
  hitSphere(center, r, onPop) {
    let n = 0;
    for (const s of this.list) {
      if (!s.alive) continue;
      if (s.pos.distanceTo(center) < r + s.size * 1.2) {
        s.alive = false;
        n++;
        this.sparks.burst(s.pos, { count: 16, colors: ['#ffffff', s.color, '#fff6a8'], speed: 2.5, size: 0.07, life: 0.5 });
        onPop?.(s);
      }
    }
    return n;
  }

  clear() { for (const s of this.list) s.alive = false; }

  update(dt, onLand) {
    this.t += dt;
    for (const s of this.list) {
      if (!s.alive) { continue; }
      s.t += dt;
      if (s.kind === 'drop') {
        s.vel.y -= 1.6 * dt; // slow fall: about 2.5 s from the roof
        s.pos.addScaledVector(s.vel, dt);
        if (s.pos.y <= Math.max(tongueY(s.pos.x, s.pos.z), 0.15) + s.size) this.land(s, onLand);
      } else {
        const k = Math.min(1, s.t / s.dur);
        s.pos.lerpVectors(s.from, s.to, k);
        s.pos.y += Math.sin(k * Math.PI) * 1.8;
        if (k >= 1) this.land(s, onLand);
      }
    }
    for (const s of this.list) {
      if (!s.alive) {
        this.candies.setMatrixAt(s.i, ZERO);
        this.wraps.setMatrixAt(s.i * 2, ZERO);
        this.wraps.setMatrixAt(s.i * 2 + 1, ZERO);
        continue;
      }
      _q.setFromEuler(_e.set(s.t * 1.3, s.t * s.spin, s.t * 0.7));
      _m.compose(s.pos, _q, _s.set(s.size, s.size * 0.8, s.size * 0.8));
      this.candies.setMatrixAt(s.i, _m);
      // twisted wrapper ends on both sides
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1;
        _p.set(side * s.size * 0.9, 0, 0).applyQuaternion(_q).add(s.pos);
        const wq = _q.clone().multiply(new THREE.Quaternion().setFromEuler(_e.set(0, 0, side * Math.PI / 2)));
        const w = s.size * (0.8 + Math.sin(this.t * 12 + k) * 0.08);
        _m.compose(_p, wq, _s.set(w * 0.8, w, w * 0.8));
        this.wraps.setMatrixAt(s.i * 2 + k, _m);
      }
    }
    this.candies.instanceMatrix.needsUpdate = true;
    this.wraps.instanceMatrix.needsUpdate = true;
  }

  land(s, onLand) {
    s.alive = false;
    this.goo.burst(s.pos, { count: 20, colors: [s.color, '#ffffff'], speed: 1.6, size: 0.1, life: 0.9, gravity: 3, up: 1.2 });
    onLand?.(s.pos.clone(), s);
  }
}

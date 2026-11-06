import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { P } from './palette.js';

/**
 * Your two tools:
 *   right hand  a giant FDC toothbrush: swing it through germs, scrub teeth to clean them
 *   left hand   the Fluoride Blaster: hold the trigger to spray sparkling fluoride bubbles
 * On a computer: click to shoot, Space to swing the brush.
 */
const SHOT_SPEED = 13;
const SHOT_LIFE = 1.1;
const FIRE_EVERY = 0.13;
const MAX_SHOTS = 48;

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, ...o });

function lathe(profile, m, seg = 20) {
  const g = new THREE.LatheGeometry(profile.map(([r, d]) => new THREE.Vector2(Math.max(r, 0.0001), d)), seg);
  g.rotateX(-Math.PI / 2); // along -Z
  return new THREE.Mesh(g, m);
}

export function buildBrush() {
  const g = new THREE.Group();
  // handle: mint body with a pink rubber grip, curving into the neck
  g.add(lathe([[0, 0.02], [0.022, 0.03], [0.026, 0.1], [0.024, 0.26], [0.016, 0.34], [0.011, 0.52], [0.014, 0.6], [0, 0.62]], mat(P.mintDeep, { roughness: 0.25 })));
  g.add(lathe([[0.028, 0.05], [0.031, 0.08], [0.031, 0.2], [0.028, 0.23]], mat(P.hot, { roughness: 0.6 })));
  // FDC band
  const band = lathe([[0.0265, 0.24], [0.0265, 0.27]], mat('#ffffff'));
  g.add(band);
  // head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.022, 0.14), mat('#ffffff', { roughness: 0.3 }));
  head.position.set(0, 0.006, -0.64);
  g.add(head);
  // bristles: one merged mesh, white with cyan tips
  const tufts = [];
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 7; k++) {
      const t = new THREE.CylinderGeometry(0.0075, 0.0065, 0.05, 6);
      const top = row === 1 ? 0.056 : 0.048;
      t.translate((row - 1) * 0.016, 0.016 + top / 2, -0.585 - k * 0.018);
      const cols = [];
      const pos = t.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const tip = pos.getY(i) > 0.03;
        const c = new THREE.Color(tip ? (row === 1 ? P.cyan : '#ffffff') : '#ffffff');
        cols.push(c.r, c.g, c.b);
      }
      t.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      tufts.push(t);
    }
  }
  const bristles = new THREE.Mesh(mergeGeometries(tufts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  g.add(bristles);
  // a swirl of toothpaste on top
  const paste = new THREE.Mesh(new THREE.TorusKnotGeometry(0.018, 0.009, 48, 8, 2, 3), mat('#ffffff', { roughness: 0.25, emissive: '#bff3ff', emissiveIntensity: 0.2 }));
  paste.scale.set(1, 0.6, 2.4);
  paste.position.set(0, 0.075, -0.64);
  g.add(paste);
  const stripe = new THREE.Mesh(new THREE.TorusKnotGeometry(0.019, 0.004, 48, 6, 2, 3), mat(P.mintDeep));
  stripe.scale.copy(paste.scale);
  stripe.position.copy(paste.position);
  g.add(stripe);
  // hit point: the middle of the bristles
  const tip = new THREE.Object3D();
  tip.position.set(0, 0.05, -0.64);
  g.add(tip);
  g.userData.tip = tip;
  return g;
}

export function buildBlaster() {
  const g = new THREE.Group();
  const white = mat('#ffffff', { roughness: 0.25 });
  const cyan = mat(P.cyan, { roughness: 0.3, emissive: '#0a6f8f', emissiveIntensity: 0.3 });
  // grip pointing down from the body
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.07, 6, 12), mat(P.hot, { roughness: 0.6 }));
  grip.position.set(0, -0.055, 0.03);
  grip.rotation.x = 0.35;
  g.add(grip);
  // body
  g.add(lathe([[0, -0.03], [0.034, -0.02], [0.04, 0.03], [0.038, 0.12], [0.026, 0.16], [0.016, 0.2], [0.016, 0.24], [0.022, 0.25], [0, 0.26]], white));
  g.add(lathe([[0.041, 0.04], [0.041, 0.06]], cyan));
  g.add(lathe([[0.039, 0.1], [0.039, 0.115]], cyan));
  // fluoride tank on top with a sloshing liquid
  const tank = new THREE.Mesh(new THREE.SphereGeometry(0.038, 18, 14), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, roughness: 0.05 }));
  tank.position.set(0, 0.05, 0.0);
  g.add(tank);
  const liquid = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), new THREE.MeshStandardMaterial({ color: P.cyan, emissive: P.cyan, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }));
  liquid.position.copy(tank.position);
  liquid.scale.y = 0.8;
  g.add(liquid);
  g.userData.liquid = liquid;
  // muzzle
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.27);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  return g;
}

export class Weapons {
  constructor(app, parent, sparks) {
    this.app = app;
    this.sparks = sparks;
    this.brush = buildBrush();
    this.blaster = buildBlaster();
    this.brush.visible = this.blaster.visible = false;
    this.brushTip = this.brush.userData.tip;
    this.muzzle = this.blaster.userData.muzzle;
    this.tipPos = new THREE.Vector3();
    this.tipPrev = new THREE.Vector3();
    this.tipSpeed = 0;
    this.cool = 0;
    this.swing = 0; // desktop brush swing (0..1)
    this.firing = false;
    this.mouseDown = false;
    this.mouseRay = new THREE.Raycaster();
    this.shots = [];
    this.shotMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 12, 8), new THREE.MeshBasicMaterial({ color: '#bff6ff' }), MAX_SHOTS);
    this.shotMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shotMesh.frustumCulled = false;
    this.shotMesh.count = 0;
    parent.add(this.shotMesh);
    this.armed = false;

    // desktop controls
    const el = app.renderer.domElement;
    el.addEventListener('pointerdown', (e) => { if (e.button === 0) { this.mouseDown = true; this.mouseNdc(e); } });
    el.addEventListener('pointermove', (e) => this.mouseNdc(e));
    window.addEventListener('pointerup', () => { this.mouseDown = false; });
    this.onKey = (e) => { if (e.code === 'Space' && this.armed) { this.swing = 1; e.preventDefault(); } };
    window.addEventListener('keydown', this.onKey);
    this.ndc = new THREE.Vector2();
  }

  mouseNdc(e) {
    const rc = this.app.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
  }

  /** Put the brush and blaster in the hands (VR) or in front of the camera (desktop). */
  arm(on) {
    this.armed = on;
    const app = this.app;
    const xr = app.renderer.xr.isPresenting;
    this.brush.removeFromParent();
    this.blaster.removeFromParent();
    this.brush.visible = this.blaster.visible = on;
    if (!on) return;
    if (xr) {
      const [a, b] = app.pointers.controllers;
      const right = a.handedness === 'left' ? b : a;
      const left = right === a ? b : a;
      right.object.add(this.brush);
      left.object.add(this.blaster);
      this.brush.position.set(0, -0.01, 0.06);
      this.brush.rotation.set(-0.25, 0, 0);
      this.blaster.position.set(0, -0.02, 0.05);
      this.blaster.rotation.set(0, 0, 0);
      this.rightPtr = right;
      this.leftPtr = left;
    } else {
      app.camera.add(this.brush);
      app.camera.add(this.blaster);
      this.brush.position.set(0.24, -0.26, -0.2);
      this.brush.rotation.set(0.35, 0.25, 0.1);
      this.blaster.position.set(-0.2, -0.2, -0.32);
      this.blaster.rotation.set(0.05, -0.08, 0);
      this.rightPtr = this.leftPtr = null;
    }
  }

  /** Called every frame. hooks: { onShot(shot) -> true if it hit something } */
  update(dt, hooks) {
    const app = this.app;
    const xr = app.renderer.xr.isPresenting;
    // brush tip speed (for hitting germs and scrubbing)
    this.tipPrev.copy(this.tipPos);
    this.brushTip.getWorldPosition(this.tipPos);
    const sp = this.tipPos.distanceTo(this.tipPrev) / Math.max(dt, 1e-3);
    this.tipSpeed = this.tipSpeed * 0.5 + sp * 0.5;
    if (!xr && this.swing > 0) {
      // desktop: a quick sweep from right to left
      this.swing = Math.max(0, this.swing - dt * 4);
      const k = 1 - this.swing;
      this.brush.rotation.set(0.35 + Math.sin(k * Math.PI) * -0.6, 0.25 + k * 1.4, 0.1 - Math.sin(k * Math.PI) * 0.5);
      this.brush.position.set(0.24 - k * 0.3, -0.26 + Math.sin(k * Math.PI) * 0.12, -0.25);
    } else if (!xr) {
      this.brush.rotation.set(0.35, 0.25, 0.1);
      this.brush.position.set(0.24, -0.26, -0.2);
    }
    if (this.armed && this.tipSpeed > 1.4 && Math.random() < dt * 30) this.sparks.burst(this.tipPos, { count: 1, color: '#ffffff', speed: 0.2, size: 0.04, life: 0.3 });

    // fire
    this.cool -= dt;
    const trigger = xr ? this.leftPtr?.pressed : this.mouseDown;
    this.firing = this.armed && !!trigger;
    if (this.firing && this.cool <= 0) {
      this.cool = FIRE_EVERY;
      this.fire(xr);
      hooks.onFire?.();
    }
    const liquid = this.blaster.userData.liquid;
    liquid.scale.y = 0.8 + Math.sin(performance.now() / 120) * (this.firing ? 0.08 : 0.02);

    // move shots
    const dummy = _m;
    let n = 0;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      s.prev.copy(s.pos);
      s.pos.addScaledVector(s.vel, dt);
      s.vel.y -= 1.2 * dt; // a slight arc
      if (s.life <= 0 || hooks.onShot?.(s)) {
        if (s.life > 0) this.sparks.burst(s.pos, { count: 8, colors: ['#ffffff', P.cyan], speed: 1.2, size: 0.05, life: 0.35 });
        this.shots.splice(i, 1);
        continue;
      }
      if (Math.random() < 0.6) this.sparks.burst(s.pos, { count: 1, colors: [P.cyan, '#ffffff'], speed: 0.1, size: 0.05, life: 0.3 });
    }
    for (const s of this.shots) {
      const wob = 1 + Math.sin(s.life * 30) * 0.12;
      dummy.compose(s.pos, _q0, _s0.set(wob, wob, wob));
      this.shotMesh.setMatrixAt(n++, dummy);
    }
    this.shotMesh.count = n;
    this.shotMesh.instanceMatrix.needsUpdate = true;
  }

  fire(xr) {
    if (this.shots.length >= MAX_SHOTS) this.shots.shift();
    const pos = new THREE.Vector3();
    const dir = new THREE.Vector3();
    if (xr) {
      this.muzzle.getWorldPosition(pos);
      dir.set(0, 0, -1).applyQuaternion(this.muzzle.getWorldQuaternion(_qw));
    } else {
      this.muzzle.getWorldPosition(pos);
      this.mouseRay.setFromCamera(this.ndc, this.app.camera);
      // aim where the mouse points, about 6 m away
      dir.copy(this.mouseRay.ray.origin).addScaledVector(this.mouseRay.ray.direction, 6).sub(pos).normalize();
    }
    this.shots.push({ pos, prev: pos.clone(), vel: dir.multiplyScalar(SHOT_SPEED), life: SHOT_LIFE });
    this.sparks.burst(pos, { count: 4, colors: [P.cyan, '#ffffff'], speed: 0.8, size: 0.05, life: 0.25 });
    try { this.leftPtr?.gamepad?.hapticActuators?.[0]?.pulse?.(0.25, 25); } catch { /* no haptics */ }
  }

  haptic(hand, v, ms) {
    const p = hand === 'right' ? this.rightPtr : this.leftPtr;
    try { p?.gamepad?.hapticActuators?.[0]?.pulse?.(v, ms); } catch { /* no haptics */ }
  }

  clearShots() { this.shots.length = 0; this.shotMesh.count = 0; }

  dispose() { window.removeEventListener('keydown', this.onKey); }
}

const _m = new THREE.Matrix4();
const _q0 = new THREE.Quaternion();
const _s0 = new THREE.Vector3();
const _qw = new THREE.Quaternion();

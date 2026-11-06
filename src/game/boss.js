import * as THREE from 'three';
import { P } from './palette.js';
import { THROAT } from './world.js';
import { makePanel, text, roundRect } from '../core/ui.js';

/**
 * Raja Gula, the Sugar King: a giant striped candy blob with a crown and lollipop arms. He rises
 * out of the throat, throws candy at the teeth and calls more germs. Shoot his three glowing
 * weak spots to beat him.
 */
const SPOT_HP = 7;

export class Boss {
  constructor(parent, sparks, goo) {
    this.sparks = sparks;
    this.goo = goo;
    this.group = new THREE.Group();
    this.group.visible = false;
    parent.add(this.group);
    this.root = new THREE.Group();
    this.group.add(this.root);
    this.group.position.copy(THROAT).setY(-4);

    const stripes = stripeTexture();
    const bodyMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.18, metalness: 0.05, emissive: '#3a0b22', emissiveIntensity: 0.35 });
    this.bodyMat = bodyMat;
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), bodyMat);
    body.scale.set(1.35, 1.6, 1.15);
    body.position.y = 1.6;
    this.root.add(body);
    this.body = body;

    // crown
    const gold = new THREE.MeshStandardMaterial({ color: '#ffcf3f', metalness: 0.6, roughness: 0.25, emissive: '#6b4a00', emissiveIntensity: 0.4 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.3, 24, 1, true), gold);
    band.position.y = 3.25;
    this.root.add(band);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const pt = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.38, 8), gold);
      pt.position.set(Math.cos(a) * 0.55, 3.55, Math.sin(a) * 0.55);
      this.root.add(pt);
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: P.candy[i % 5], emissive: P.candy[i % 5], emissiveIntensity: 0.6 }));
      gem.position.set(Math.cos(a) * 0.6, 3.22, Math.sin(a) * 0.6);
      this.root.add(gem);
    }

    // face
    const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2 });
    const dark = new THREE.MeshBasicMaterial({ color: '#1b0a14' });
    this.pupils = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), white);
      eye.position.set(s * 0.42, 2.25, 1.0);
      eye.scale.z = 0.6;
      this.root.add(eye);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), dark);
      pu.position.set(s * 0.42, 2.22, 1.15);
      this.root.add(pu);
      this.pupils.push(pu);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.08), dark);
      brow.position.set(s * 0.42, 2.58, 1.05);
      brow.rotation.z = s * -0.38;
      this.root.add(brow);
    }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3a0618', side: THREE.DoubleSide }));
    mouth.rotation.x = Math.PI;
    mouth.scale.set(1.1, 0.55, 0.5);
    mouth.position.set(0, 1.75, 1.0);
    this.root.add(mouth);
    this.mouth = mouth;
    const toothMat = new THREE.MeshStandardMaterial({ color: '#fff6dc', roughness: 0.3 });
    for (let i = 0; i < 5; i++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 6), toothMat);
      t.rotation.x = Math.PI;
      t.position.set(-0.36 + i * 0.18, 1.72, 1.12);
      this.root.add(t);
    }

    // lollipop arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(s * 1.25, 1.7, 0.2);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }));
      stick.position.y = 0.6;
      arm.add(stick);
      const pop = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 32), new THREE.MeshStandardMaterial({ map: swirlTexture(), roughness: 0.2 }));
      pop.rotation.x = Math.PI / 2;
      pop.position.y = 1.45;
      arm.add(pop);
      arm.rotation.z = s * 0.5;
      this.root.add(arm);
      this.arms.push(arm);
    }

    // weak spots
    const spotMat = () => new THREE.MeshBasicMaterial({ color: '#7ff3ff', transparent: true, opacity: 0.95 });
    this.spots = [[-0.75, 1.2, 0.85], [0.0, 0.85, 1.12], [0.78, 1.55, 0.8]].map((p) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), spotMat());
      m.position.set(...p);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 8, 28), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      ring.position.copy(m.position);
      ring.lookAt(m.position.clone().multiplyScalar(2));
      this.root.add(m, ring);
      return { mesh: m, ring, hp: SPOT_HP, alive: true, flash: 0, world: new THREE.Vector3() };
    });

    // health bar above the crown
    this.bar = makePanel(1.6, 0.22, (c, W, H) => {
      roundRect(c, 4, 4, W - 8, H - 8, H * 0.4);
      c.fillStyle = 'rgba(30,8,24,0.85)';
      c.fill();
      const k = this.health;
      roundRect(c, 14, 14, Math.max(1, (W - 28) * k), H - 28, H * 0.3);
      c.fillStyle = k > 0.5 ? '#ff5d8f' : k > 0.2 ? '#ffb13f' : '#ff3f3f';
      c.fill();
      text(c, 'RAJA GULA', W / 2, H * 0.68, { size: H * 0.42, weight: 900, color: '#ffffff', align: 'center' });
    });
    this.bar.mesh.position.set(0, 4.25, 0);
    this.root.add(this.bar.mesh);

    this.state = 'hidden';
    this.t = 0;
    this.throwT = 0;
    this.summonT = 0;
  }

  get health() { return this.spots.reduce((a, s) => a + Math.max(0, s.hp), 0) / (SPOT_HP * this.spots.length); }
  get active() { return this.state === 'rise' || this.state === 'fight'; }

  start() {
    this.state = 'rise';
    this.t = 0;
    this.group.visible = true;
    this.group.position.copy(THROAT).setY(-4);
    this.root.scale.setScalar(1);
    this.root.rotation.set(0, 0, 0);
    for (const s of this.spots) { s.hp = SPOT_HP; s.alive = true; s.mesh.visible = s.ring.visible = true; }
    this.throwT = 2.5;
    this.summonT = 4;
    this.bar.redraw();
  }

  hide() { this.state = 'hidden'; this.group.visible = false; }

  /** A shot at position p: did it hit a weak spot? */
  hitSpot(p, onSpotHit, onSpotBroken) {
    if (this.state !== 'fight') return false;
    for (const s of this.spots) {
      if (!s.alive) continue;
      if (s.world.distanceTo(p) < 0.32) {
        s.hp--;
        s.flash = 1;
        this.sparks.burst(s.world, { count: 10, colors: ['#ffffff', P.cyan], speed: 2, size: 0.08, life: 0.4 });
        onSpotHit?.(s);
        if (s.hp <= 0) {
          s.alive = false;
          s.mesh.visible = s.ring.visible = false;
          this.goo.burst(s.world, { count: 30, colors: P.candy, speed: 3, size: 0.12, life: 1, gravity: 4, up: 1 });
          onSpotBroken?.(s, this.spots.filter((x) => x.alive).length);
          if (this.spots.every((x) => !x.alive)) { this.state = 'defeated'; this.t = 0; }
        }
        this.bar.redraw();
        return true;
      }
    }
    // the body blocks shots too (no damage)
    const c = this.body.getWorldPosition(_v);
    if (p.distanceTo(c) < 1.4) { this.sparks.burst(p, { count: 4, color: '#ffffff', speed: 1, size: 0.05, life: 0.25 }); return true; }
    return false;
  }

  update(dt, head, hooks) {
    if (this.state === 'hidden') return;
    this.t += dt;
    const g = this.group;
    if (this.state === 'rise') {
      const k = Math.min(1, this.t / 3);
      g.position.y = -4 + easeOut(k) * 4 - 0.6;
      this.root.rotation.z = Math.sin(this.t * 8) * 0.05 * (1 - k);
      if (k >= 1) { this.state = 'fight'; this.t = 0; hooks.onArrive?.(); }
    } else if (this.state === 'fight') {
      g.position.y = -0.6 + Math.sin(this.t * 1.6) * 0.12;
      g.position.x = Math.sin(this.t * 0.5) * 0.9;
      this.root.rotation.z = Math.sin(this.t * 1.3) * 0.08;
      this.arms[0].rotation.z = -0.5 + Math.sin(this.t * 2.4) * 0.35;
      this.arms[1].rotation.z = 0.5 - Math.sin(this.t * 2.4 + 1) * 0.35;
      this.mouth.scale.y = 0.55 + Math.abs(Math.sin(this.t * 3)) * 0.25;
      this.throwT -= dt;
      this.summonT -= dt;
      if (this.throwT <= 0) {
        this.throwT = 3.2 / hooks.difficulty;
        const from = this.arms[Math.random() < 0.5 ? 0 : 1].children[1].getWorldPosition(new THREE.Vector3());
        hooks.onThrow?.(from);
        this.arms.forEach((a) => { a.rotation.x = -0.8; });
      }
      this.arms.forEach((a) => { a.rotation.x *= 1 - Math.min(1, dt * 4); });
      if (this.summonT <= 0) { this.summonT = 5 / hooks.difficulty; hooks.onSummon?.(g.position.clone().add(new THREE.Vector3(0, 0.3, 1.4))); }
    } else if (this.state === 'defeated') {
      // wobble, swell and burst into sparkles and confetti
      const k = Math.min(1, this.t / 1.6);
      this.root.rotation.z = Math.sin(this.t * 30) * 0.15 * (1 - k * 0.5);
      this.root.scale.setScalar(1 + k * 0.35);
      if (Math.random() < dt * 20) this.sparks.burst(this.body.getWorldPosition(_v).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, 0.8)), { count: 6, colors: ['#ffffff', ...P.candy], speed: 2, size: 0.1, life: 0.5 });
      if (k >= 1) {
        const c = this.body.getWorldPosition(_v);
        this.sparks.burst(c, { count: 140, colors: ['#ffffff', '#fff6a8', ...P.candy], speed: 6, size: 0.14, life: 1.6, spread: 1.5 });
        this.goo.burst(c, { count: 90, colors: P.candy, speed: 5, size: 0.12, life: 2.2, gravity: 3, up: 2, spread: 1.2 });
        this.state = 'hidden';
        g.visible = false;
        hooks.onDefeated?.();
      }
    }
    // eyes follow the player, weak spots pulse
    for (const pu of this.pupils) { pu.position.x = Math.sign(pu.position.x) * 0.42 + THREE.MathUtils.clamp((head.x - g.position.x) * 0.03, -0.06, 0.06); }
    for (const s of this.spots) {
      if (!s.alive) continue;
      s.flash = Math.max(0, s.flash - dt * 5);
      const pulse = 1 + Math.sin(this.t * 6 + s.mesh.position.x * 3) * 0.15 + s.flash * 0.4;
      s.mesh.scale.setScalar(pulse);
      s.mesh.material.color.set(s.flash > 0 ? '#ffffff' : '#7ff3ff');
      s.ring.rotation.z += dt * 2;
      s.mesh.getWorldPosition(s.world);
    }
    this.bar.mesh.lookAt(head);
  }
}

const _v = new THREE.Vector3();
function easeOut(x) { return 1 - Math.pow(1 - x, 3); }

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ff5d8f';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#ffffff';
  for (let i = -4; i < 8; i++) {
    g.beginPath();
    g.moveTo(i * 48, 0); g.lineTo(i * 48 + 24, 0); g.lineTo(i * 48 + 24 + 256, 256); g.lineTo(i * 48 + 256, 256);
    g.fill();
  }
  g.fillStyle = 'rgba(255,210,63,0.9)';
  for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 4, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

function swirlTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const cols = ['#ff5d8f', '#ffffff', '#3fd2ff', '#ffffff', '#ffd23f', '#ffffff'];
  for (let i = 0; i < 36; i++) {
    g.fillStyle = cols[i % cols.length];
    g.beginPath();
    g.moveTo(128, 128);
    g.arc(128, 128, 128, (i / 36) * Math.PI * 2 + i * 0.05, ((i + 1) / 36) * Math.PI * 2 + i * 0.05);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

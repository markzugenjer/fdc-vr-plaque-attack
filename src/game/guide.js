import * as THREE from 'three';
import { P } from './palette.js';
import { makePanel, text, wrap, roundRect } from '../core/ui.js';

/**
 * Gigi, a friendly tooth in a little FDC cape, floats next to you, explains what's happening
 * (the dental facts) and cheers you on.
 */
export class Guide {
  constructor(parent, sfx) {
    this.sfx = sfx;
    this.group = new THREE.Group();
    this.group.position.set(-1.3, 1.45, -1.15); // to the left, clear of the big panels
    parent.add(this.group);

    const body = new THREE.Group();
    this.body = body;
    this.group.add(body);
    const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.15, emissive: '#ffe9f0', emissiveIntensity: 0.25 });
    // crown + two roots
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.16, 28, 20), white);
    crown.scale.set(1.05, 0.95, 0.85);
    body.add(crown);
    for (const s of [-1, 1]) {
      const root = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.1, 6, 12), white);
      root.position.set(s * 0.07, -0.15, 0);
      root.rotation.z = s * 0.15;
      body.add(root);
      this[s < 0 ? 'legL' : 'legR'] = root;
    }
    // face
    const dark = new THREE.MeshBasicMaterial({ color: '#2e2340' });
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), dark);
      eye.position.set(s * 0.055, 0.03, 0.13);
      eye.scale.set(1, 1.3, 0.5);
      body.add(eye);
      this.eyes.push(eye);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      shine.position.set(s * 0.055 + 0.008, 0.042, 0.142);
      body.add(shine);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffb0c4' }));
      cheek.position.set(s * 0.1, -0.015, 0.115);
      cheek.scale.z = 0.3;
      body.add(cheek);
    }
    this.smile = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 16, Math.PI), new THREE.MeshBasicMaterial({ color: P.hot }));
    this.smile.rotation.z = Math.PI;
    this.smile.position.set(0, -0.02, 0.135);
    body.add(this.smile);
    // a little mint cape with the FDC dot
    const cape = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.22, 20, 1, true, Math.PI * 0.15, Math.PI * 1.7), new THREE.MeshStandardMaterial({ color: P.mintDeep, side: THREE.DoubleSide, roughness: 0.5 }));
    cape.position.set(0, -0.06, -0.03);
    cape.rotation.y = Math.PI;
    body.add(cape);
    this.cape = cape;
    // sparkle halo
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 6, 32), new THREE.MeshBasicMaterial({ color: '#fff3a0' }));
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.2;
    body.add(halo);
    this.halo = halo;

    // speech bubble
    this.line = '';
    this.mood = 'normal';
    this.bubble = makePanel(0.95, 0.34, (c, W, H) => {
      if (!this.line) return;
      roundRect(c, 6, 6, W - 12, H - 12, H * 0.22);
      c.fillStyle = this.mood === 'warn' ? '#fff1e6' : '#ffffff';
      c.fill();
      c.lineWidth = 8;
      c.strokeStyle = this.mood === 'warn' ? P.orange : P.hot;
      c.stroke();
      text(c, 'Gigi', W * 0.05, H * 0.24, { size: H * 0.13, weight: 900, color: this.mood === 'warn' ? P.orange : P.hot });
      c.font = `700 ${Math.round(H * 0.13)}px system-ui`;
      const lines = wrap(c, this.line, W * 0.9).slice(0, 3);
      lines.forEach((l, i) => text(c, l, W * 0.05, H * (0.47 + i * 0.18), { size: H * 0.13, weight: 700, color: P.ink }));
    });
    this.bubble.mesh.position.set(0, 0.45, 0); // above Gigi's head
    this.bubble.mesh.visible = false;
    this.group.add(this.bubble.mesh);
    this.time = 0;
    this.left = 0;
    this.jump = 0;
    this.queue = [];
  }

  /** Say a line now (replaces the current one). */
  say(line, secs = 4, mood = 'normal') {
    this.line = line;
    this.mood = mood;
    this.left = secs;
    this.bubble.redraw();
    this.bubble.mesh.visible = true;
    this.jump = 1;
    this.sfx.play('talk');
  }

  cheer() { this.jump = 1.4; }

  update(dt, head) {
    this.time += dt;
    const t = this.time;
    this.jump = Math.max(0, this.jump - dt * 2.5);
    this.body.position.y = Math.sin(t * 2.2) * 0.04 + Math.sin(this.jump * Math.PI) * 0.12;
    this.body.rotation.z = Math.sin(t * 1.7) * 0.12;
    this.legL.rotation.x = Math.sin(t * 6) * 0.3;
    this.legR.rotation.x = -Math.sin(t * 6) * 0.3;
    this.cape.rotation.x = -0.15 + Math.sin(t * 4) * 0.1;
    this.halo.rotation.z += dt;
    // blink
    const blink = (t % 3.4) < 0.12 ? 0.15 : 1;
    for (const e of this.eyes) e.scale.y = 1.3 * blink;
    this.smile.scale.set(1 + this.jump * 0.3, 1 + this.jump * 0.5, 1);
    this.group.lookAt(head.x, this.group.position.y, head.z);
    if (this.left > 0) {
      this.left -= dt;
      if (this.left <= 0) { this.bubble.mesh.visible = false; this.line = ''; }
    }
  }
}

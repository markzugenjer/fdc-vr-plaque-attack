import * as THREE from 'three';

/**
 * Thousands of particles in one draw call (GPU points with per-particle colour, size and fade).
 *   fx.burst(pos, { count, color, speed, size, life, gravity, up, spread })
 * Two systems are used: glowing sparkles (additive) and goo / confetti (normal blending).
 */
const VERT = /* glsl */ `
  uniform float uScale;
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  uniform float uSoft;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float a = uSoft > 0.5 ? pow(1.0 - d, 1.6) : smoothstep(1.0, 0.75, d);
    // a little highlight on goo blobs
    vec3 col = vColor + (uSoft > 0.5 ? vec3(0.0) : vec3(0.35) * smoothstep(0.5, 0.0, length(c + vec2(0.15, 0.15))));
    gl_FragColor = vec4(col, a * vAlpha);
  }
`;

export class Particles {
  constructor(parent, { max = 1200, additive = true } = {}) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    const m = new THREE.ShaderMaterial({
      uniforms: { uSoft: { value: additive ? 1 : 0 }, uScale: { value: 600 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 10;
    parent.add(this.points);
    this._c = new THREE.Color();
  }

  burst(at, { count = 12, color = '#ffffff', colors = null, speed = 1.5, size = 0.08, life = 0.8, gravity = 0, up = 0, spread = 0, dir = null, grow = 0 } = {}) {
    for (let k = 0; k < count; k++) {
      if (this.n >= this.max) return;
      const i = this.n++;
      const r = Math.random;
      this.pos[i * 3] = at.x + (r() - 0.5) * spread;
      this.pos[i * 3 + 1] = at.y + (r() - 0.5) * spread;
      this.pos[i * 3 + 2] = at.z + (r() - 0.5) * spread;
      // random direction on a sphere (or around `dir`)
      let vx = r() * 2 - 1;
      let vy = r() * 2 - 1;
      let vz = r() * 2 - 1;
      const l = Math.hypot(vx, vy, vz) || 1;
      const s = speed * (0.4 + r() * 0.6);
      vx = (vx / l) * s; vy = (vy / l) * s + up; vz = (vz / l) * s;
      if (dir) { vx += dir.x * speed; vy += dir.y * speed; vz += dir.z * speed; }
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      this._c.set(colors ? colors[Math.floor(r() * colors.length)] : color);
      this.col[i * 3] = this._c.r; this.col[i * 3 + 1] = this._c.g; this.col[i * 3 + 2] = this._c.b;
      this.size0[i] = size * (0.6 + r() * 0.8);
      this.size[i] = this.size0[i];
      this.alpha[i] = 1;
      this.life[i] = life * (0.7 + r() * 0.6);
      this.age[i] = 0;
      this.grav[i] = gravity;
      this.grow[i] = grow;
    }
  }

  update(dt) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        // swap the last live particle into this slot
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const k = this.age[i] / this.life[i];
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const drag = 1 - Math.min(0.9, dt * 1.8);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 1] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      this.size[i] = this.size0[i] * (1 + this.grow[i] * k);
    }
    this.n = n;
    const g = this.geo;
    g.setDrawRange(0, n);
    for (const a of ['position', 'aColor', 'aSize', 'aAlpha']) g.attributes[a].needsUpdate = true;
  }

  copy(from, to) {
    for (const arr of [this.pos, this.vel, this.col]) { arr[to * 3] = arr[from * 3]; arr[to * 3 + 1] = arr[from * 3 + 1]; arr[to * 3 + 2] = arr[from * 3 + 2]; }
    for (const arr of [this.size, this.alpha, this.life, this.age, this.grav, this.size0, this.grow]) arr[to] = arr[from];
  }

  /** Pixels per metre at 1 m: set from the screen height so sizes look the same on desktop and in VR. */
  setScale(v) { this.points.material.uniforms.uScale.value = v; }

  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

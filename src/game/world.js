import * as THREE from 'three';
import { P } from './palette.js';

/**
 * The inside of a giant mouth: you stand on the tongue, a U of teeth around you, the lips (and
 * daylight) behind you, and the dark throat in front where the germs and the Sugar King come from.
 *
 * Built for speed on Quest: the 28 teeth are 2 instanced meshes (one draw call per arch), no
 * shadows, a handful of materials, fog for depth.
 */
export const ARCH = { A: 2.35, B: 3.15, cz: -1.1, thetaMax: 2.2 }; // ellipse of the tooth rows
export const THROAT = new THREE.Vector3(0, 0.4, -5.6);
export const LOWER_Y = 0.18; // gum line of the lower teeth
export const UPPER_Y = 4.7; // gum line of the upper teeth
const TEETH_PER_ARCH = 14;

export function archPoint(theta, y = 0, inset = 0, out = new THREE.Vector3()) {
  return out.set((ARCH.A - inset) * Math.sin(theta), y, ARCH.cz + (ARCH.B - inset) * Math.cos(theta));
}

/** Height of the tongue surface at (x, z): a gentle dome, highest in the middle. */
export function tongueY(x, z) {
  const nx = x / 2.6;
  const nz = (z + 1.3) / 3.6;
  return Math.max(-0.25, 0.06 - (nx * nx + nz * nz) * 0.3);
}

export function buildWorld() {
  const group = new THREE.Group();

  // ------------------------------------------------------------------ lights
  const hemi = new THREE.HemisphereLight('#ffe0ea', '#8a2446', 1.15);
  const sun = new THREE.DirectionalLight('#fff3e6', 1.6); // daylight through the lips, behind you
  sun.position.set(0, 3.5, 6);
  const glow = new THREE.PointLight('#ff4f9a', 18, 9, 1.6); // the throat glows
  glow.position.set(0, 1.4, -5.2);
  const rim = new THREE.DirectionalLight('#9fdcff', 0.5); // a cool rim so the germs pop
  rim.position.set(-4, 2, -3);
  group.add(hemi, sun, glow, rim);

  // ------------------------------------------------------------------ the mouth cavity (cheeks, palate, floor)
  const cavityMat = new THREE.MeshStandardMaterial({ color: '#e0577d', roughness: 0.55, side: THREE.BackSide, map: fleshTexture('#e0577d', '#f07a99', 7) });
  const cavity = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), cavityMat);
  cavity.scale.set(4.6, 5.6, 7.6);
  cavity.position.set(0, 1.8, -1.2);
  group.add(cavity);

  // palate ridges (rugae) on the roof
  const ridgeMat = new THREE.MeshStandardMaterial({ color: P.palate, roughness: 0.45 });
  for (let i = 0; i < 6; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.0 + i * 0.28, 0.07, 8, 32, Math.PI), ridgeMat);
    r.rotation.x = Math.PI / 2;
    r.position.set(0, 6.9 - i * 0.05, 0.6 - i * 0.55);
    r.scale.set(1, 0.6, 1);
    group.add(r);
  }

  // ------------------------------------------------------------------ tongue
  const tongueGeo = new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  {
    // a soft groove down the middle and a few bumps
    const p = tongueGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const groove = Math.exp(-(v.x * v.x) / 0.02) * 0.05;
      const bumps = Math.sin(v.x * 23) * Math.sin(v.z * 19) * 0.006;
      v.y = v.y - groove + bumps;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    tongueGeo.computeVertexNormals();
  }
  const tongueMat = new THREE.MeshStandardMaterial({ color: P.tongue, roughness: 0.32, metalness: 0.05, map: papillaeTexture() });
  const tongue = new THREE.Mesh(tongueGeo, tongueMat);
  tongue.scale.set(2.7, 0.32, 3.9);
  tongue.position.set(0, -0.26, -1.3);
  group.add(tongue);
  // the floor of the mouth under the tongue edges
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: P.tongueDeep, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.scale.set(4.4, 7, 1);
  floor.position.set(0, -0.2, -1.2);
  group.add(floor);

  // ------------------------------------------------------------------ gums (a tube along each arch)
  const gumMat = new THREE.MeshStandardMaterial({ color: P.gum, roughness: 0.4 });
  for (const y of [LOWER_Y, UPPER_Y]) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const th = -ARCH.thetaMax - 0.15 + (i / 40) * (ARCH.thetaMax + 0.15) * 2;
      pts.push(archPoint(th, y));
    }
    const gum = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.36, 12, false), gumMat);
    gum.scale.y = 0.75;
    gum.position.y = y * 0.25;
    group.add(gum);
  }

  // ------------------------------------------------------------------ teeth (instanced, two arches)
  const teeth = buildTeeth();
  group.add(teeth.lower.mesh, teeth.upper.mesh, teeth.holes);

  // ------------------------------------------------------------------ the throat: dark, glowing, with the uvula
  const throatMat = new THREE.MeshBasicMaterial({ map: radialTexture(['#ff6aa8', '#7a1340', '#2a0614', '#120208']), fog: false });
  const throat = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), throatMat);
  throat.position.set(0, 1.6, -7.2);
  group.add(throat);
  const uvula = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), new THREE.MeshStandardMaterial({ color: '#ff7aa0', roughness: 0.35 }));
  uvula.scale.set(1, 1.7, 1);
  uvula.position.set(0, 4.3, -6.0);
  group.add(uvula);
  const uvStem = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, 1.4, 16), uvula.material);
  uvStem.position.set(0, 5.2, -6.0);
  group.add(uvStem);

  // ------------------------------------------------------------------ the lips and daylight behind you
  const lipMat = new THREE.MeshStandardMaterial({ color: '#ff5c8a', roughness: 0.28 });
  const lips = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.55, 16, 64), lipMat);
  lips.scale.set(1.15, 0.55, 1);
  lips.position.set(0, 2.4, 3.6);
  group.add(lips);
  const day = new THREE.Mesh(new THREE.CircleGeometry(3.5, 48), new THREE.MeshBasicMaterial({ map: radialTexture(['#ffffff', '#fff3d6', '#ffd2df', '#ff9fbd']), fog: false }));
  day.scale.set(1.15, 0.55, 1);
  day.position.set(0, 2.4, 3.75);
  day.rotation.y = Math.PI;
  group.add(day);

  // ------------------------------------------------------------------ drifting saliva bubbles
  const bubbles = buildBubbles(90);
  group.add(bubbles.points);

  let t = 0;
  return {
    group,
    teeth,
    uvula,
    glow,
    fog: new THREE.FogExp2('#5a1834', 0.045),
    update(dt) {
      t += dt;
      uvula.position.y = 4.3 + Math.sin(t * 1.3) * 0.06;
      uvula.rotation.z = Math.sin(t * 0.9) * 0.08;
      glow.intensity = 16 + Math.sin(t * 2) * 3;
      bubbles.update(dt);
      teeth.update(dt);
    },
  };
}

// ------------------------------------------------------------------ teeth
function toothGeometry(kind) {
  // a crown turned on a lathe: wide body, rounded top (pointy for canines), narrow neck into the gum
  const pts = kind === 'canine'
    ? [[0.0, 1.18], [0.12, 1.12], [0.3, 0.9], [0.42, 0.6], [0.44, 0.35], [0.38, 0.12], [0.32, 0]]
    : [[0.0, 1.0], [0.22, 1.0], [0.36, 0.97], [0.45, 0.88], [0.5, 0.65], [0.48, 0.35], [0.4, 0.12], [0.33, 0]];
  const geo = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 20);
  geo.scale(1, 1, 0.78); // a bit flatter front to back
  geo.computeVertexNormals();
  return geo;
}

function buildTeeth() {
  const toothMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.18, metalness: 0.02, emissive: '#2a1a10', emissiveIntensity: 0.15 });
  const geo = toothGeometry('molar');
  const holeMat = new THREE.MeshStandardMaterial({ color: '#2a1208', roughness: 0.9 });
  const holes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 12, 8), holeMat, TEETH_PER_ARCH * 2);
  holes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const WHITE = new THREE.Color(P.tooth);
  const YELLOW = new THREE.Color('#e9c766');
  const BROWN = new THREE.Color('#7b4a23');
  const SHINE = new THREE.Color('#ffffff');
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const _c = new THREE.Color();
  const _up = new THREE.Vector3(0, 1, 0);
  const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI); // upper teeth hang down

  const arches = {};
  for (const which of ['lower', 'upper']) {
    const mesh = new THREE.InstancedMesh(geo, toothMat, TEETH_PER_ARCH);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const list = [];
    for (let i = 0; i < TEETH_PER_ARCH; i++) {
      const u = (i + 0.5) / TEETH_PER_ARCH;
      const theta = -ARCH.thetaMax + u * ARCH.thetaMax * 2;
      const a = Math.abs(theta);
      // incisors at the front (behind you), canines, premolars, then big molars toward the throat
      const kind = a < 0.45 ? 'incisor' : a < 0.85 ? 'canine' : a < 1.45 ? 'premolar' : 'molar';
      const size = { incisor: [0.48, 1.25, 0.32], canine: [0.5, 1.35, 0.5], premolar: [0.62, 1.05, 0.62], molar: [0.82, 0.95, 0.82] }[kind];
      const base = archPoint(theta, which === 'lower' ? LOWER_Y : UPPER_Y);
      // face the middle of the mouth
      const yaw = Math.atan2(-base.x, ARCH.cz - base.z) + Math.PI;
      const tooth = {
        i, which, kind, theta, base, yaw,
        size: new THREE.Vector3(...size),
        hp: 1, // 1 = healthy, 0 = cavity
        shine: 0,
        dirty: 0, // plaque stain (0..1), cleaned by brushing
        eaters: 0, // germs chewing on it right now
        hit: 0,
        normal: new THREE.Vector3(-base.x, 0, ARCH.cz - base.z).normalize(),
      };
      // where germs hold on / the brush should scrub: the inner face, halfway up
      tooth.attach = base.clone().addScaledVector(tooth.normal, size[2] * 0.42);
      tooth.attach.y += which === 'lower' ? size[1] * 0.55 : -size[1] * 0.55;
      list.push(tooth);
    }
    arches[which] = { mesh, list };
  }

  function write() {
    let hi = 0;
    for (const which of ['lower', 'upper']) {
      const { mesh, list } = arches[which];
      for (const t of list) {
        const wob = t.hit > 0 ? Math.sin(t.hit * 40) * 0.04 * t.hit : 0;
        _q.setFromAxisAngle(_up, t.yaw + wob);
        if (which === 'upper') _q.multiply(FLIP);
        const shrink = 0.55 + 0.45 * Math.max(0.25, t.hp); // eaten teeth get smaller
        _s.set(t.size.x, t.size.y * shrink, t.size.z);
        _p.copy(t.base);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(t.i, _m);
        // white → yellow (plaque) → brown (decay); a flash of white when scrubbed
        const decay = 1 - t.hp;
        _c.copy(WHITE).lerp(YELLOW, Math.min(1, t.dirty * 0.8 + decay * 0.6));
        if (decay > 0.45) _c.lerp(BROWN, (decay - 0.45) * 1.6);
        if (t.shine > 0) _c.lerp(SHINE, t.shine);
        mesh.setColorAt(t.i, _c);
        // the cavity hole on the inner face
        const hole = decay > 0.35 ? (decay - 0.35) * 1.4 : 0;
        _p.copy(t.attach);
        _q.setFromAxisAngle(_up, t.yaw);
        _s.set(hole * t.size.x * 0.9 + 0.0001, hole * 0.9 + 0.0001, hole * 0.25 + 0.0001);
        _m.compose(_p, _q, _s);
        holes.setMatrixAt(hi++, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
    holes.instanceMatrix.needsUpdate = true;
  }
  for (const which of ['lower', 'upper']) arches[which].mesh.setColorAt(0, WHITE);
  write();

  return {
    lower: arches.lower,
    upper: arches.upper,
    holes,
    all: [...arches.lower.list, ...arches.upper.list],
    reset() {
      for (const t of [...arches.lower.list, ...arches.upper.list]) { t.hp = 1; t.dirty = 0; t.shine = 0; t.eaters = 0; t.hit = 0; }
      write();
    },
    update(dt) {
      for (const t of [...arches.lower.list, ...arches.upper.list]) {
        if (t.shine > 0) t.shine = Math.max(0, t.shine - dt * 1.5);
        if (t.hit > 0) t.hit = Math.max(0, t.hit - dt * 2);
      }
      write();
    },
  };
}

// ------------------------------------------------------------------ saliva bubbles (one draw call)
function buildBubbles(n) {
  const pos = new Float32Array(n * 3);
  const speed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 7;
    pos[i * 3 + 1] = Math.random() * 6;
    pos[i * 3 + 2] = -6 + Math.random() * 9;
    speed[i] = 0.05 + Math.random() * 0.12;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size: 0.09, map: bubbleTexture(), transparent: true, depthWrite: false, opacity: 0.75, color: '#ffe8f0' });
  const points = new THREE.Points(geo, mat);
  let t = 0;
  return {
    points,
    update(dt) {
      t += dt;
      for (let i = 0; i < n; i++) {
        pos[i * 3 + 1] += speed[i] * dt;
        pos[i * 3] += Math.sin(t + i) * 0.002;
        if (pos[i * 3 + 1] > 6.2) pos[i * 3 + 1] = 0;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ canvas textures
function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 4;
  return t;
}
function papillaeTexture() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 1.5 + Math.random() * 3.5;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,190,205,0.9)' : 'rgba(230,120,150,0.55)';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }, 6);
}
function fleshTexture(base, light, repeat) {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 10 + Math.random() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,200,215,0.6)');
      gr.addColorStop(1, 'rgba(255,200,215,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.strokeStyle = 'rgba(200,60,100,0.18)';
    g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      let x = Math.random() * s;
      let y = Math.random() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    void base; void light;
  }, repeat);
}
function radialTexture(stops) {
  return canvasTex(256, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
}
export function bubbleTexture() {
  return canvasTex(64, (g, s) => {
    const gr = g.createRadialGradient(s * 0.4, s * 0.38, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.5)');
    gr.addColorStop(0.75, 'rgba(255,255,255,0.15)');
    gr.addColorStop(0.92, 'rgba(255,255,255,0.7)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
}

// ペットの3Dモデルを犬種・猫種パラメータから手続き的に生成し、ポーズ・アニメーションを制御する
import * as THREE from 'three';

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.0, ...opts }));
  }
  return matCache.get(key);
}

function rand(seed) {
  // 決定的な乱数（模様が毎回同じになるように）
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ===== 毛並みテクスチャ（Canvasで生成） =====
function makeFurTexture(breed, part, seed) {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const col = breed.colors;
  const base = part === 'head' ? col.head : col.body;
  const pat = (breed.patterns || {})[part];
  const r = rand(seed + (part === 'head' ? 77 : 0));

  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  // 細かい毛のノイズ
  for (let i = 0; i < 2200; i++) {
    const x = r() * W, y = r() * H;
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    g.fillRect(x, y, 2, 5);
  }

  const bellyGrad = (from, to, color) => {
    const grad = g.createLinearGradient(0, from * H, 0, to * H);
    grad.addColorStop(0, hexA(color, 0));
    grad.addColorStop(1, hexA(color, 1));
    g.fillStyle = grad;
    g.fillRect(0, from * H, W, (to - from) * H);
    g.fillStyle = color;
    g.fillRect(0, to * H, W, H);
  };

  const blob = (x, y, rx, ry, color) => {
    g.fillStyle = color;
    g.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 0.75 + r() * 0.4;
      const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
    // 左右の継ぎ目対策で横にずらしたコピーも描画
    if (x - rx < 0 || x + rx > W) {
      g.save(); g.translate(x - rx < 0 ? W : -W, 0);
      g.beginPath(); g.ellipse(x, y, rx * 0.9, ry * 0.9, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  };

  const front = W * 0.25; // 球のUVで+Z(正面)にあたるX座標

  switch (pat) {
    case 'belly':
      bellyGrad(part === 'head' ? 0.52 : 0.58, part === 'head' ? 0.62 : 0.7, col.belly);
      break;
    case 'blaze': {
      bellyGrad(0.58, 0.68, breed.blazeColor || col.belly);
      g.fillStyle = breed.blazeColor || col.belly;
      g.beginPath();
      g.moveTo(front - 10, 0.12 * H); g.lineTo(front + 10, 0.12 * H);
      g.lineTo(front + 34, 0.62 * H); g.lineTo(front - 34, 0.62 * H);
      g.closePath(); g.fill();
      break;
    }
    case 'huskymask': {
      bellyGrad(0.5, 0.58, col.belly);
      g.fillStyle = col.belly;
      g.beginPath(); g.ellipse(front - 26, 0.47 * H, 26, 18, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(front + 26, 0.47 * H, 26, 18, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = base;
      g.beginPath();
      g.moveTo(front - 8, 0.1 * H); g.lineTo(front + 8, 0.1 * H); g.lineTo(front + 4, 0.5 * H); g.lineTo(front - 4, 0.5 * H);
      g.closePath(); g.fill();
      break;
    }
    case 'mask': {
      g.fillStyle = breed.maskColor || '#333';
      g.beginPath(); g.ellipse(front, 0.6 * H, 70, 52, 0, 0, Math.PI * 2); g.fill();
      blur(g, W, H);
      break;
    }
    case 'ragdoll': {
      g.fillStyle = breed.maskColor || '#7a6656';
      g.beginPath(); g.ellipse(front, 0.45 * H, 80, 46, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = col.belly;
      g.beginPath();
      g.moveTo(front, 0.36 * H); g.lineTo(front + 34, 0.75 * H); g.lineTo(front - 34, 0.75 * H);
      g.closePath(); g.fill();
      bellyGrad(0.64, 0.72, col.belly);
      blur(g, W, H);
      break;
    }
    case 'spots': {
      const sc = breed.spotColor || '#222';
      const n = part === 'head' ? 28 : 75;
      for (let i = 0; i < n; i++) {
        const x = r() * W, y = (0.08 + r() * 0.82) * H;
        const rad = 4 + r() * (part === 'head' ? 6 : 9);
        blob(x, y, rad * 1.6, rad, sc);
      }
      break;
    }
    case 'leopard': {
      bellyGrad(0.62, 0.74, col.belly);
      const sc = breed.spotColor || '#3a2614';
      for (let i = 0; i < 70; i++) {
        const x = r() * W, y = (0.06 + r() * 0.62) * H;
        const rad = 7 + r() * 7;
        blob(x, y, rad * 1.5, rad, sc);
        blob(x, y, rad * 0.9, rad * 0.55, shade(col.body, -0.12));
      }
      break;
    }
    case 'tabby': {
      bellyGrad(0.6, 0.72, col.belly);
      const sc = breed.stripeColor || '#333';
      g.strokeStyle = sc;
      g.lineCap = 'round';
      const n = part === 'head' ? 18 : 16;
      for (let i = 0; i < n; i++) {
        const x0 = (i / n) * W + (r() - 0.5) * 10;
        g.lineWidth = part === 'head' ? 5 + r() * 3 : 9 + r() * 6;
        g.beginPath();
        const yEnd = part === 'head' ? (0.25 + r() * 0.12) * H : (0.5 + r() * 0.15) * H;
        for (let y = 0; y <= yEnd; y += 6) {
          const x = x0 + Math.sin(y * 0.06 + i) * 7;
          if (y === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
      g.fillStyle = sc;
      g.fillRect(0, 0, W, 0.06 * H);
      if (part === 'head') bellyGrad(0.56, 0.64, col.belly);
      break;
    }
    case 'calico': {
      const colors = ['#e2913f', '#2a2522', '#e2913f'];
      const n = part === 'head' ? 4 : 7;
      for (let i = 0; i < n; i++) {
        const x = r() * W, y = (0.05 + r() * 0.45) * H;
        blob(x, y, 40 + r() * 50, 25 + r() * 30, colors[i % colors.length]);
      }
      if (part === 'head') {
        // 顔の正面は白く残す
        g.fillStyle = col.head;
        g.beginPath(); g.ellipse(front, 0.62 * H, 44, 60, 0, 0, Math.PI * 2); g.fill();
      }
      bellyGrad(0.62, 0.7, col.belly);
      break;
    }
    case 'saddle': {
      const edge = breed.saddleEdge || col.head;
      g.fillStyle = edge;
      wavyBand(g, W, H, 0.42, r);
      g.fillStyle = breed.saddleColor || '#222';
      wavyBand(g, W, H, 0.33, r);
      bellyGrad(0.62, 0.7, col.belly);
      break;
    }
    default:
      break;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
function wavyBand(g, W, H, depth, r) {
  g.beginPath();
  g.moveTo(0, 0);
  for (let x = 0; x <= W; x += 16) {
    g.lineTo(x, depth * H + Math.sin(x * 0.05) * 8 + (r() - 0.5) * 6);
  }
  g.lineTo(W, 0);
  g.closePath();
  g.fill();
}
function blur(g, W, H) {
  // 簡易ぼかし（縮小→拡大）
  const t = document.createElement('canvas');
  t.width = W / 4; t.height = H / 4;
  const tg = t.getContext('2d');
  tg.drawImage(g.canvas, 0, 0, t.width, t.height);
  g.imageSmoothingEnabled = true;
  g.globalAlpha = 0.6;
  g.drawImage(t, 0, 0, W, H);
  g.globalAlpha = 1;
}
function hexA(hex, a) {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}
function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return '#' + c.getHexString();
}

// ===== アクセサリー =====
export const ACCESSORIES = {
  collar_red: { slot: 'neck', name: '赤い首輪', price: 0 },
  collar_blue: { slot: 'neck', name: '青い首輪', price: 40 },
  collar_pink: { slot: 'neck', name: 'ピンクの首輪', price: 40 },
  bell_collar: { slot: 'neck', name: '鈴つき首輪', price: 80 },
  bandana_red: { slot: 'neck', name: '赤いバンダナ', price: 60 },
  bandana_blue: { slot: 'neck', name: 'デニムバンダナ', price: 60 },
  ribbon_pink: { slot: 'head', name: 'ピンクのリボン', price: 50 },
  ribbon_blue: { slot: 'head', name: '水色のリボン', price: 50 },
  party_hat: { slot: 'head', name: 'パーティー帽子', price: 90 },
  straw_hat: { slot: 'head', name: 'むぎわら帽子', price: 120 },
  flower_crown: { slot: 'head', name: '花かんむり', price: 150 },
  crown: { slot: 'head', name: '王冠', price: 300 },
  glasses: { slot: 'face', name: 'まるメガネ', price: 100 },
  sunglasses: { slot: 'face', name: 'サングラス', price: 140 },
};

function buildAccessory(id, d) {
  const g = new THREE.Group();
  const R = d.headR;
  const neckR = Math.max(d.headR * 0.62, Math.min(d.W, d.H) * 0.42);
  switch (id) {
    case 'collar_red': case 'collar_blue': case 'collar_pink': case 'bell_collar': {
      const color = { collar_red: '#d93a3a', collar_blue: '#3a6ed9', collar_pink: '#ef7fb0', bell_collar: '#c0392b' }[id];
      const t = new THREE.Mesh(new THREE.TorusGeometry(neckR, 0.022, 8, 28), mat(color));
      g.add(t);
      if (id === 'bell_collar') {
        const bell = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), mat('#f2c230', { metalness: 0.7, roughness: 0.3 }));
        bell.position.set(0, -neckR - 0.025, 0);
        g.add(bell);
      } else {
        const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.008, 16), mat('#f2c230', { metalness: 0.7, roughness: 0.3 }));
        tag.rotation.x = Math.PI / 2;
        tag.position.set(0, -neckR - 0.02, 0.01);
        g.add(tag);
      }
      g.userData.place = 'neck';
      break;
    }
    case 'bandana_red': case 'bandana_blue': {
      const color = id === 'bandana_red' ? '#d0342c' : '#4a6fa5';
      const t = new THREE.Mesh(new THREE.TorusGeometry(neckR, 0.02, 8, 28), mat(color));
      g.add(t);
      const tri = new THREE.Mesh(new THREE.ConeGeometry(neckR * 0.8, neckR * 1.2, 3), mat(color));
      tri.scale.z = 0.2;
      tri.rotation.z = Math.PI;
      tri.position.set(0, -neckR - neckR * 0.35, 0.02);
      g.add(tri);
      g.userData.place = 'neck';
      break;
    }
    case 'ribbon_pink': case 'ribbon_blue': {
      const color = id === 'ribbon_pink' ? '#ff7eb6' : '#6cc6ff';
      const m = mat(color);
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 12), m);
        w.rotation.z = s * Math.PI / 2;
        w.position.x = s * 0.05;
        w.scale.z = 0.4;
        g.add(w);
      }
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), m));
      g.position.set(R * 0.45, R * 0.82, R * 0.1);
      g.rotation.z = -0.4;
      g.userData.place = 'head';
      break;
    }
    case 'party_hat': {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(R * 0.38, R * 0.95, 20), mat('#7a5cff'));
      cone.position.y = R * 0.47;
      g.add(cone);
      const pom = new THREE.Mesh(new THREE.SphereGeometry(R * 0.11, 10, 8), mat('#ffd84d'));
      pom.position.y = R * 0.97;
      g.add(pom);
      for (let i = 0; i < 3; i++) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(R * 0.05, 8, 6), mat('#ffd84d'));
        const yy = R * (0.15 + i * 0.25);
        const rr = R * 0.38 * (1 - (yy / (R * 0.95))) + 0.004;
        dot.position.set(Math.sin(i * 2.1) * rr, yy, Math.cos(i * 2.1) * rr);
        g.add(dot);
      }
      g.position.set(-R * 0.15, R * 0.82, 0);
      g.rotation.z = 0.25;
      g.userData.place = 'head';
      break;
    }
    case 'straw_hat': {
      const m = mat('#e8c76a');
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.05, R * 1.05, 0.015, 28), m);
      g.add(brim);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.5, R * 0.55, R * 0.4, 24), m);
      top.position.y = R * 0.2;
      g.add(top);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.56, R * 0.56, R * 0.1, 24), mat('#d9443a'));
      band.position.y = R * 0.06;
      g.add(band);
      g.position.set(0, R * 0.78, -R * 0.05);
      g.rotation.x = -0.12;
      g.userData.place = 'head';
      break;
    }
    case 'flower_crown': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.6, 0.014, 6, 24), mat('#5aa84a'));
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      const cols = ['#ff8fb1', '#ffd84d', '#ffffff', '#9fd0ff', '#ff6f6f'];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(cols[i % cols.length]));
        f.position.set(Math.cos(a) * R * 0.6, 0.01, Math.sin(a) * R * 0.6);
        g.add(f);
      }
      g.position.set(0, R * 0.8, 0);
      g.userData.place = 'head';
      break;
    }
    case 'crown': {
      const gold = mat('#f2c230', { metalness: 0.8, roughness: 0.25 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.38, R * 0.4, R * 0.2, 20, 1, true), gold);
      band.material.side = THREE.DoubleSide;
      g.add(band);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(R * 0.08, R * 0.2, 6), gold);
        sp.position.set(Math.cos(a) * R * 0.38, R * 0.18, Math.sin(a) * R * 0.38);
        g.add(sp);
        const gem = new THREE.Mesh(new THREE.SphereGeometry(R * 0.04, 8, 6), mat(i % 2 ? '#e8304a' : '#3a7ae8'));
        gem.position.set(Math.cos(a) * R * 0.4, 0, Math.sin(a) * R * 0.4);
        g.add(gem);
      }
      g.position.set(0, R * 0.9, 0);
      g.userData.place = 'head';
      break;
    }
    case 'glasses': case 'sunglasses': {
      const frame = mat(id === 'glasses' ? '#4a3020' : '#111111');
      for (const s of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.17, 0.008, 6, 20), frame);
        ring.position.set(s * R * 0.36, 0, 0);
        g.add(ring);
        if (id === 'sunglasses') {
          const lens = new THREE.Mesh(new THREE.CircleGeometry(R * 0.17, 20), mat('#1a1a2a', { transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
          lens.position.set(s * R * 0.36, 0, 0.002);
          g.add(lens);
        }
      }
      const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, R * 0.36, 6), frame);
      bridge.rotation.z = Math.PI / 2;
      g.add(bridge);
      g.userData.place = 'face';
      break;
    }
    default: break;
  }
  return g;
}

// ===== ポーズ定義 =====
function poseTable(d) {
  const legL = d.legL;
  const baseY = d.baseY;
  const lieY = d.H * 0.5 + 0.005 - baseY; // 伏せたときの体の高さ
  return {
    stand: {},
    sit: { bodyY: -legL * 0.38, pitch: -0.55, legs: [0.55, 0.55, -0.95, -0.95], headPitch: 0.4, tailBase: 1.0 },
    paw: { bodyY: -legL * 0.38, pitch: -0.55, legs: [0.55, -1.55, -0.95, -0.95], headPitch: 0.3, tailBase: 1.0 },
    paw2: { bodyY: -legL * 0.38, pitch: -0.55, legs: [-1.55, 0.55, -0.95, -0.95], headPitch: 0.3, tailBase: 1.0 },
    highfive: { bodyY: -legL * 0.38, pitch: -0.6, legs: [0.55, -2.6, -0.95, -0.95], headPitch: 0.1, tailBase: 1.0 },
    beg: { bodyY: -legL * 0.3, pitch: -1.15, legs: [-0.6, -0.6, -0.35, -0.35], headPitch: 0.95, tailBase: 1.4 },
    down: { bodyY: lieY, pitch: 0, legs: [-1.45, -1.45, -1.25, -1.25], headPitch: -0.15, tailBase: 0.4 },
    sleep: { bodyY: lieY, pitch: 0, roll: 0.22, legs: [-1.45, -1.45, -1.25, -1.25], headPitch: 0.45, headYaw: 0.5, eyeOpen: 0.08, tailBase: 0.6, earPerk: -0.4 },
    playdead: { bodyY: d.W * 0.5 + 0.01 - baseY, roll: 1.45, legs: [-0.2, -0.3, 0.2, 0.3], headPitch: 0.2, eyeOpen: 0.08, tailBase: 0.8 },
    bow: { bodyY: -legL * 0.18, pitch: 0.32, legs: [-1.1, -1.1, 0.32, 0.32], headPitch: -0.45, tailBase: -0.3 },
    eat: { bodyY: -legL * 0.08, pitch: 0.18, legs: [-0.18, -0.18, -0.18, -0.18], headPitch: 0.95 },
    crouch: { bodyY: -legL * 0.45, pitch: 0.05, legs: [-0.9, -0.9, -1.0, -1.0], headPitch: -0.1, tailBase: 0.3, earPerk: 0.4 },
    tilt: { headRoll: 0.42, headPitch: 0.05 },
    happy: { headPitch: -0.15, eyeOpen: 0.35, earPerk: 0.3 },
    sad: { headPitch: 0.35, earPerk: -0.6, tailBase: 1.2 },
    angry: { bodyY: -legL * 0.1, pitch: 0.05, headPitch: -0.05, earPerk: -0.9, tailBase: -0.6 },
  };
}
const DEFAULT_CH = { bodyY: 0, pitch: 0, roll: 0, headPitch: 0, headYaw: 0, headRoll: 0, legs: [0, 0, 0, 0], tailBase: 0, earPerk: 0, eyeOpen: 1 };

// ===== ペット本体 =====
export class PetModel {
  constructor(breed, opts = {}) {
    this.breed = breed;
    this.isCat = breed.species === 'cat';
    this.equip = opts.equip || {};
    this.seed = hashStr(opts.seedKey || breed.id);
    this.root = new THREE.Group();
    this.root.name = 'pet';
    this.spinner = new THREE.Group();
    this.root.add(this.spinner);
    this.cur = structuredClone(DEFAULT_CH);
    this.target = structuredClone(DEFAULT_CH);
    this.poseName = 'stand';
    this.walkSpeed = 0;
    this.walkPhase = 0;
    this.wagAmp = 0.3;
    this.time = Math.random() * 10;
    this.blinkT = 2 + Math.random() * 3;
    this.lookTarget = null;
    this.anims = [];
    this.tongueOut = false;
    this.build();
    this.setGrowth(opts.growth ?? 1);
  }

  setGrowth(g) {
    this.growth = g;
    const s = this.breed.size * g;
    this.root.scale.setScalar(s);
    // 子どもの間は頭を少し大きく
    const hs = 1 + (1 - Math.min(1, g)) * 0.6;
    this.headGroup.scale.setScalar(hs);
  }

  build() {
    const b = this.breed;
    const d = {
      L: b.body.L, H: b.body.H, W: b.body.W, legL: b.legL, legR: b.legR, headR: b.headR,
    };
    d.pawR = d.legR * 1.3;
    d.baseY = d.legL + d.pawR * 0.6 + d.H * 0.2;
    this.d = d;
    this.poses = poseTable(d);
    const col = b.colors;

    // 体
    this.bodyPivot = new THREE.Group();
    this.bodyPivot.position.y = d.baseY;
    this.spinner.add(this.bodyPivot);

    const bodyGeo = new THREE.SphereGeometry(1, 36, 22);
    const pos = bodyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      pos.setZ(i, Math.sign(z) * Math.pow(Math.abs(z), 0.72));
    }
    bodyGeo.computeVertexNormals();
    // 球の正面(+Z)が体の前になるよう、UVの向きをそろえる
    const bodyTex = makeFurTexture(b, 'body', this.seed);
    const bodyMat = new THREE.MeshStandardMaterial({ map: bodyTex, roughness: 0.85 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(d.W / 2, d.H / 2, d.L / 2);
    body.castShadow = true;
    this.bodyPivot.add(body);
    this.bodyMesh = body;

    // ふわふわ（プードル・ポメ・ペルシャ）
    const r = rand(this.seed + 5);
    if (b.fluff) {
      const fm = mat(col.body);
      for (let i = 0; i < b.fluff; i++) {
        const th = r() * Math.PI * 2, ph = Math.acos(1 - 2 * (0.05 + r() * 0.8));
        const v = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
        if (v.y < -0.6) continue;
        const s = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), fm);
        const rad = Math.min(d.W, d.H) * (0.18 + r() * 0.08);
        s.scale.setScalar(rad);
        s.position.set(v.x * d.W / 2 * 0.88, v.y * d.H / 2 * 0.88, v.z * d.L / 2 * 0.88);
        s.castShadow = true;
        this.bodyPivot.add(s);
      }
    }

    // 首まわりのふさふさ
    this.neck = new THREE.Group();
    this.neck.position.set(0, d.H * 0.28, d.L * 0.4);
    this.bodyPivot.add(this.neck);
    if (b.ruff) {
      const rm = mat(b.patterns?.body === 'tabby' ? col.belly : col.belly);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.SphereGeometry(d.headR * 0.32, 10, 8), rm);
        s.position.set(Math.cos(a) * d.headR * 0.6, Math.sin(a) * d.headR * 0.5 + d.headR * 0.1, d.headR * 0.15 + Math.sin(a) * -0.02);
        s.castShadow = true;
        this.neck.add(s);
      }
    }

    // 頭
    this.headPivot = new THREE.Group();
    this.headPivot.position.copy(this.neck.position);
    this.bodyPivot.add(this.headPivot);
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, d.headR * 0.78, d.headR * 0.55);
    this.headPivot.add(this.headGroup);

    // 首（体と頭をつなぐ）
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(d.headR * 0.55, Math.min(d.W, d.H) * 0.42, d.headR * 1.1, 14), mat(col.head));
    neckMesh.position.set(0, d.headR * 0.3, d.headR * 0.12);
    neckMesh.rotation.x = 0.5;
    neckMesh.castShadow = true;
    this.headPivot.add(neckMesh);

    const hs = this.isCat ? new THREE.Vector3(1.12, 0.95, 0.95) : new THREE.Vector3(1, 1, 1);
    this.headScale = hs;
    const headTex = makeFurTexture(b, 'head', this.seed);
    const head = new THREE.Mesh(new THREE.SphereGeometry(d.headR, 32, 22), new THREE.MeshStandardMaterial({ map: headTex, roughness: 0.85 }));
    head.scale.copy(hs);
    head.castShadow = true;
    this.headGroup.add(head);
    this.headMesh = head;

    if (b.headFluff) {
      const fm = mat(col.head);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.SphereGeometry(d.headR * 0.32, 10, 8), fm);
        s.position.set(Math.cos(a) * d.headR * 0.4, d.headR * 0.78, Math.sin(a) * d.headR * 0.35 - d.headR * 0.05);
        this.headGroup.add(s);
      }
    }

    // マズル・鼻
    const R = d.headR;
    if (!this.isCat) {
      const sL = b.snout.L, sR = b.snout.R;
      const sz = sL * 0.6 + sR * 0.45;
      const snout = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat(col.muzzle));
      snout.scale.set(sR * 1.05, sR * 0.82, sz);
      snout.position.set(0, -R * 0.28, R * 0.72 + sz * 0.55);
      snout.castShadow = true;
      this.headGroup.add(snout);
      const nose = new THREE.Mesh(new THREE.SphereGeometry(sR * 0.38, 14, 10), mat(col.nose, { roughness: 0.3 }));
      nose.scale.set(1.2, 0.85, 0.9);
      nose.position.set(0, -R * 0.28 + sR * 0.45, R * 0.72 + sz * 1.45);
      this.headGroup.add(nose);
      // 舌
      const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat('#ef6f86'));
      tongue.scale.set(sR * 0.45, sR * 0.12, sR * 0.6);
      tongue.position.set(0, -R * 0.28 - sR * 0.75, R * 0.72 + sz * 1.0);
      tongue.rotation.x = 0.5;
      tongue.visible = false;
      this.headGroup.add(tongue);
      this.tongue = tongue;
    } else {
      const mm = mat(col.muzzle);
      for (const s of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(b.snout.R * 0.62, 14, 10), mm);
        m.position.set(s * b.snout.R * 0.48, -R * 0.3, R * 0.8 + b.snout.L * 0.4);
        m.scale.set(1, 0.85, 0.8);
        this.headGroup.add(m);
      }
      const chin = new THREE.Mesh(new THREE.SphereGeometry(b.snout.R * 0.45, 12, 8), mm);
      chin.position.set(0, -R * 0.44, R * 0.76 + b.snout.L * 0.3);
      this.headGroup.add(chin);
      const nose = new THREE.Mesh(new THREE.SphereGeometry(R * 0.07, 10, 8), mat(col.nose, { roughness: 0.4 }));
      nose.scale.set(1.3, 0.8, 0.8);
      nose.position.set(0, -R * 0.17, R * 0.92 + b.snout.L * 0.45);
      this.headGroup.add(nose);
      // ひげ
      const wm = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const pts = [
            new THREE.Vector3(s * b.snout.R * 0.7, -R * 0.3, R * 0.85 + b.snout.L * 0.4),
            new THREE.Vector3(s * R * 1.25, -R * 0.22 - i * R * 0.08 + 0.02, R * 0.7),
          ];
          this.headGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wm));
        }
      }
      const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat('#ef6f86'));
      tongue.scale.set(R * 0.07, R * 0.03, R * 0.09);
      tongue.position.set(0, -R * 0.45, R * 0.9 + b.snout.L * 0.4);
      tongue.visible = false;
      this.headGroup.add(tongue);
      this.tongue = tongue;
    }

    // 目
    this.eyes = [];
    const eyeR = R * (b.bigEyes ? 0.17 : 0.135) * (this.isCat ? 1.1 : 1);
    for (const s of [-1, 1]) {
      const eg = new THREE.Group();
      const ex = 0.4 * (this.isCat ? 1.05 : 1), ey = this.isCat ? 0.1 : 0.17;
      const ez = Math.sqrt(Math.max(0.05, 1 - ex * ex - ey * ey));
      eg.position.set(s * ex * R * hs.x, ey * R * hs.y, ez * R * hs.z * 0.97);
      eg.lookAt(eg.position.clone().multiply(new THREE.Vector3(1.6, 0.6, 1)).add(new THREE.Vector3(0, 0, R * 2)));
      if (b.coloredIris) {
        const iris = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 16, 12), mat(col.eye, { roughness: 0.25 }));
        iris.scale.z = 0.55;
        eg.add(iris);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 14, 10), mat('#0b0b0f', { roughness: 0.2 }));
        pupil.scale.set(this.isCat ? 0.42 : 0.55, this.isCat ? 0.88 : 0.55, 0.3);
        pupil.position.z = eyeR * 0.38;
        eg.add(pupil);
        this.pupils = this.pupils || [];
        this.pupils.push(pupil);
      } else {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 16, 12), mat('#120c08', { roughness: 0.2 }));
        ball.scale.z = 0.6;
        eg.add(ball);
      }
      const hl = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(eyeR * 0.3, eyeR * 0.35, eyeR * 0.5);
      eg.add(hl);
      this.headGroup.add(eg);
      this.eyes.push(eg);
    }

    // 耳
    this.ears = [];
    const es = (R / 0.25) * b.ear.size;
    const earMat = mat(col.ears);
    const innerMat = mat(this.isCat || b.ear.type === 'pointy' || b.ear.type === 'big' ? '#f3b8b8' : col.ears);
    for (const s of [-1, 1]) {
      const eg = new THREE.Group();
      const t = b.ear.type;
      if (t === 'floppy') {
        eg.position.set(s * R * 0.78, R * 0.5, -R * 0.02);
        eg.rotation.z = s * 0.28;
        const parts = b.ear.fluffy ? 3 : 1;
        for (let i = 0; i < parts; i++) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), earMat);
          if (b.ear.fluffy) {
            e.scale.setScalar(0.07 * es);
            e.position.set(s * 0.015, -0.06 * es - i * 0.075 * es, 0);
          } else {
            e.scale.set(0.035 * es, 0.13 * es, 0.08 * es);
            e.position.set(s * 0.012, -0.11 * es, 0);
          }
          e.castShadow = true;
          eg.add(e);
        }
      } else if (t === 'folded' || t === 'small') {
        eg.position.set(s * R * 0.52, R * 0.72, R * 0.05);
        eg.rotation.z = -s * 0.5;
        const e = new THREE.Mesh(new THREE.ConeGeometry(0.06 * es, 0.08 * es, 12), earMat);
        e.scale.z = 0.5;
        e.rotation.x = t === 'folded' ? 1.25 : 0.7;
        e.position.set(0, 0.02 * es, 0.02 * es);
        eg.add(e);
      } else {
        // pointy / big / cat / tufted
        const isCatEar = t === 'cat' || t === 'tufted';
        const spread = isCatEar ? 0.58 : (t === 'big' ? 0.55 : 0.5);
        eg.position.set(s * R * spread * hs.x, R * 0.68 * hs.y, -R * 0.02);
        eg.rotation.z = -s * (isCatEar ? 0.32 : t === 'big' ? 0.45 : 0.28);
        const rad = (isCatEar ? 0.085 : 0.072) * es, h = (isCatEar ? 0.15 : 0.17) * es;
        const e = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 14), earMat);
        e.scale.z = 0.42;
        e.position.y = h / 2 - 0.01;
        e.castShadow = true;
        eg.add(e);
        const inner = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.62, h * 0.72, 12), innerMat);
        inner.scale.z = 0.3;
        inner.position.set(0, h * 0.4 - 0.01, rad * 0.12);
        eg.add(inner);
        if (t === 'tufted') {
          const tuft = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.25, h * 0.4, 6), mat('#2a1d12'));
          tuft.position.y = h + h * 0.12;
          eg.add(tuft);
        }
      }
      eg.userData.baseRot = eg.rotation.clone();
      eg.userData.side = s;
      eg.userData.type = t;
      this.headGroup.add(eg);
      this.ears.push(eg);
    }

    // 脚 FL, FR, BL, BR
    this.legs = [];
    const legMat = mat(col.legs), pawMat = mat(col.paws);
    const legPos = [
      [-1, 1], [1, 1], [-1, -1], [1, -1],
    ];
    for (const [sx, sz] of legPos) {
      const lg = new THREE.Group();
      lg.position.set(sx * d.W * 0.28, -d.H * 0.2, sz * d.L * 0.33);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(d.legR * 1.15, d.legR, d.legL, 12), legMat);
      leg.position.y = -d.legL / 2;
      leg.castShadow = true;
      lg.add(leg);
      if (sz < 0 || b.fluff) {
        const thigh = new THREE.Mesh(new THREE.SphereGeometry(d.legR * (sz < 0 ? 2.0 : 1.6), 12, 10), sz < 0 ? mat(col.body) : legMat);
        thigh.position.y = -d.legL * 0.05;
        thigh.scale.set(0.9, 1.3, 1.1);
        thigh.castShadow = true;
        lg.add(thigh);
      }
      if (b.fluff) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(d.legR * 1.7, 10, 8), legMat);
        f.position.y = -d.legL * 0.7;
        lg.add(f);
      }
      const paw = new THREE.Mesh(new THREE.SphereGeometry(d.pawR, 12, 10), pawMat);
      paw.scale.set(1, 0.62, 1.3);
      paw.position.set(0, -d.legL, d.pawR * 0.3);
      paw.castShadow = true;
      lg.add(paw);
      this.bodyPivot.add(lg);
      this.legs.push(lg);
    }

    // しっぽ
    this.buildTail();

    // アクセサリー
    this.accessoryGroup = [];
    for (const slot of ['neck', 'head', 'face']) {
      const id = this.equip[slot];
      if (!id) continue;
      const acc = buildAccessory(id, d);
      const place = acc.userData.place;
      if (place === 'neck') {
        acc.position.set(0, d.headR * 0.32, d.headR * 0.18);
        acc.rotation.x = -Math.PI / 2 + 0.95;
        this.headPivot.add(acc);
      } else if (place === 'face') {
        const eye = this.eyes[1].position;
        acc.position.set(0, eye.y, eye.z + d.headR * 0.2);
        this.headGroup.add(acc);
      } else {
        this.headGroup.add(acc);
      }
      acc.traverse(o => { if (o.isMesh) o.castShadow = true; });
      this.accessoryGroup.push(acc);
    }
  }

  buildTail() {
    const b = this.breed, d = this.d, col = b.colors;
    const t = b.tail;
    this.tailRoot = new THREE.Group();
    this.tailRoot.position.set(0, d.H * 0.18, -d.L * 0.46);
    this.bodyPivot.add(this.tailRoot);
    this.tailSegs = [];
    const cfg = {
      short: { n: 1, base: -0.6, curl: 0 },
      pom: { n: 1, base: -0.5, curl: 0 },
      curl: { n: 5, base: -0.3, curl: 0.78 },
      long: { n: 5, base: t.up ? -0.55 : -1.0, curl: 0.1 },
      fluffy: { n: 5, base: t.down ? -2.2 : -1.0, curl: 0.14 },
      bushy: { n: 5, base: t.curlOver ? -0.2 : -0.75, curl: t.curlOver ? 0.55 : 0.18 },
      cat: { n: 6, base: -0.5, curls: [-0.2, -0.05, 0.08, 0.2, 0.3, 0.38] },
      catbushy: { n: 6, base: -0.6, curls: [-0.2, -0.05, 0.08, 0.18, 0.25, 0.3] },
    }[t.type] || { n: 4, base: -0.8, curl: 0.1 };
    this.tailCfg = cfg;
    const segL = t.L / cfg.n;
    let parent = this.tailRoot;
    for (let i = 0; i < cfg.n; i++) {
      const seg = new THREE.Group();
      if (i > 0) seg.position.y = segL;
      const k = i / cfg.n;
      let rad;
      if (t.type === 'bushy' || t.type === 'catbushy' || t.type === 'fluffy') rad = t.R * (0.65 + 0.55 * Math.sin(Math.PI * (k + 0.5 / cfg.n)));
      else rad = t.R * (1 - k * 0.45);
      let color = col.tail;
      if (t.rings && i % 2 === 1) color = b.stripeColor || '#333';
      if (t.tipColor && i === cfg.n - 1) color = t.tipColor;
      let mesh;
      if (t.type === 'short') {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(rad * 1.3, 12, 10), mat(color));
        mesh.position.y = rad * 0.5;
      } else {
        mesh = new THREE.Mesh(new THREE.CapsuleGeometry(rad, Math.max(0.001, segL - rad * 0.5), 4, 10), mat(color));
        mesh.position.y = segL / 2;
      }
      mesh.castShadow = true;
      seg.add(mesh);
      if (t.type === 'pom') {
        const pom = new THREE.Mesh(new THREE.SphereGeometry(t.R * 2.2, 12, 10), mat(color));
        pom.position.y = segL;
        pom.castShadow = true;
        seg.add(pom);
      }
      seg.userData.curl = cfg.curls ? cfg.curls[i] : (i === 0 ? 0 : cfg.curl);
      parent.add(seg);
      this.tailSegs.push(seg);
      parent = seg;
    }
  }

  setPose(name) {
    this.poseName = name;
    const p = this.poses[name] || {};
    const t = structuredClone(DEFAULT_CH);
    Object.assign(t, structuredClone(p));
    this.target = t;
  }

  // 特殊アニメーション: spin / jump / roll / shake / hop / nod / pounce
  play(type, dur) {
    this.anims.push({ type, t: 0, dur });
  }

  update(dt) {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 7);
    const c = this.cur, tg = this.target;
    for (const key of Object.keys(c)) {
      if (key === 'legs') {
        for (let i = 0; i < 4; i++) c.legs[i] += (tg.legs[i] - c.legs[i]) * k;
      } else {
        c[key] += ((tg[key] ?? DEFAULT_CH[key]) - c[key]) * k;
      }
    }

    // 歩行サイクル
    const sp = this.walkSpeed;
    this.walkPhase += dt * (6 + sp * 6) * Math.min(1, sp * 3);
    const swingAmp = Math.min(1, sp * 2.5) * (0.55 + Math.min(0.35, sp * 0.15));
    const ph = this.walkPhase;
    const swing = [Math.sin(ph), Math.sin(ph + Math.PI), Math.sin(ph + Math.PI), Math.sin(ph)];
    const bob = Math.abs(Math.sin(ph)) * 0.025 * Math.min(1, sp * 2.5);

    // 特殊アニメ
    let jumpY = 0, spin = 0, rollA = 0, shakeA = 0, nod = 0, tuck = 0;
    this.anims = this.anims.filter(a => {
      a.t += dt;
      const u = Math.min(1, a.t / a.dur);
      switch (a.type) {
        case 'jump': jumpY += Math.sin(Math.PI * u) * this.d.legL * 1.4; tuck = Math.sin(Math.PI * u); break;
        case 'hop': jumpY += Math.abs(Math.sin(Math.PI * u * 3)) * this.d.legL * 0.35; break;
        case 'spin': spin += easeInOut(u) * Math.PI * 2; break;
        case 'roll': rollA += easeInOut(u) * Math.PI * 2; break;
        case 'shake': shakeA += Math.sin(a.t * 45) * 0.28 * (1 - u); break;
        case 'nod': nod += Math.sin(u * Math.PI * 4) * 0.25 * (1 - u); break;
        case 'pounce': jumpY += Math.sin(Math.PI * u) * this.d.legL * 0.8; tuck = Math.sin(Math.PI * u) * 0.8; break;
        default: break;
      }
      return a.t < a.dur;
    });

    // 呼吸
    const breath = Math.sin(this.time * 2.2) * 0.012;
    this.bodyMesh.scale.y = (this.d.H / 2) * (1 + breath);

    this.bodyPivot.position.y = this.d.baseY + c.bodyY + bob + jumpY;
    this.bodyPivot.rotation.x = c.pitch - tuck * 0.15;
    this.bodyPivot.rotation.z = c.roll + rollA + shakeA;
    this.spinner.rotation.y = spin;

    // 頭の向き（カメラを見る）
    let lookYaw = 0, lookPitch = 0;
    if (this.lookTarget && this.poseName !== 'sleep' && this.poseName !== 'playdead') {
      const local = this.root.worldToLocal(this.lookTarget.clone());
      const hp = this.headPivot.position;
      lookYaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z - hp.z), -0.75, 0.75);
      const dy = local.y - (this.d.baseY + hp.y);
      const dist = Math.hypot(local.x, local.z);
      lookPitch = THREE.MathUtils.clamp(-Math.atan2(dy, dist) * 0.5, -0.4, 0.3);
    }
    this._lookYaw = (this._lookYaw || 0) + (lookYaw - (this._lookYaw || 0)) * k * 0.6;
    this._lookPitch = (this._lookPitch || 0) + (lookPitch - (this._lookPitch || 0)) * k * 0.6;
    this.headPivot.rotation.set(c.headPitch + nod + this._lookPitch + Math.sin(ph * 2) * 0.04 * Math.min(1, sp * 2), c.headYaw + this._lookYaw, c.headRoll);

    for (let i = 0; i < 4; i++) {
      const tuckLeg = tuck * (i < 2 ? -0.9 : 0.9);
      this.legs[i].rotation.x = c.legs[i] + swing[i] * swingAmp + tuckLeg;
    }

    // しっぽ
    const cfg = this.tailCfg;
    const wagFreq = this.isCat ? 2.2 : 11;
    const wag = Math.sin(this.time * wagFreq) * this.wagAmp;
    this.tailSegs.forEach((s, i) => {
      if (i === 0) {
        s.rotation.x = cfg.base + c.tailBase * (this.isCat ? 0.4 : 0.6);
        s.rotation.z = wag * (this.isCat ? 0.5 : 1);
      } else {
        s.rotation.x = s.userData.curl;
        s.rotation.z = this.isCat ? Math.sin(this.time * wagFreq - i * 0.6) * this.wagAmp * 0.45 : wag * 0.15;
      }
    });

    // 耳
    for (const e of this.ears) {
      const br = e.userData.baseRot;
      const s = e.userData.side;
      if (e.userData.type === 'floppy') {
        e.rotation.z = br.z + s * c.earPerk * 0.35 + Math.sin(ph * 2) * 0.08 * Math.min(1, sp * 2);
        e.rotation.x = br.x - c.earPerk * 0.2;
      } else {
        e.rotation.z = br.z - s * c.earPerk * 0.45;
        e.rotation.x = br.x - Math.min(0, c.earPerk) * 0.6;
      }
    }

    // まばたき
    this.blinkT -= dt;
    let eyeS = c.eyeOpen;
    if (this.blinkT < 0) {
      eyeS = Math.min(eyeS, 0.1);
      if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 4;
    }
    for (const e of this.eyes) e.scale.y = Math.max(0.06, eyeS);

    if (this.tongue) this.tongue.visible = this.tongueOut;
  }

  headWorldPos(out = new THREE.Vector3()) {
    this.headGroup.updateWorldMatrix(true, false);
    return this.headGroup.getWorldPosition(out);
  }

  dispose() {
    this.root.traverse(o => {
      if (o.isMesh || o.isLine) {
        o.geometry.dispose();
        if (o.material && o.material.map) { o.material.map.dispose(); o.material.dispose(); }
      }
    });
  }
}
function easeInOut(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }

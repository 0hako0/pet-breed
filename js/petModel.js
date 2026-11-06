// ペットの3Dモデルを犬種・猫種パラメータから手続き的に生成し、ポーズ・アニメーションを制御する
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

// ===== 毛並み（ファーシェル） =====
// 同じ形を少しずつ大きくした「毛の層」を重ね、上の層ほど毛先だけが残るようにして
// ふわふわの毛並みに見せる（alphaTest で切り抜くので並べ替え不要・軽め）
let strandBase = null;
function strandTexture(rx, ry) {
  if (!strandBase) {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    const r = rand(12345);
    for (let i = 0; i < 3800; i++) {
      const v = Math.floor((0.35 + r() * 0.65) * 255);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath();
      g.arc(r() * S, r() * S, 1.1 + r() * 1.1, 0, Math.PI * 2);
      g.fill();
    }
    strandBase = new THREE.CanvasTexture(c);
    strandBase.wrapS = strandBase.wrapT = THREE.RepeatWrapping;
  }
  const key = rx + 'x' + ry;
  strandBase.userData.clones = strandBase.userData.clones || {};
  if (!strandBase.userData.clones[key]) {
    const t = strandBase.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    strandBase.userData.clones[key] = t;
  }
  return strandBase.userData.clones[key];
}
const shellCache = new Map();
// base: { map } か { color }。i 番目（1..n）の層の材質
function shellMat(base, i, n, rep) {
  const h = i / n;
  const k = 0.66 + 0.46 * h; // 根元は暗く、毛先は明るく → 奥行きが出る
  const opts = { alphaMap: strandTexture(rep[0], rep[1]), alphaTest: 0.2 + h * 0.66, roughness: 0.95 };
  if (base.map) return new THREE.MeshStandardMaterial({ ...opts, map: base.map, color: new THREE.Color(k, k, k) });
  const key = base.color + '|' + i + '|' + n + '|' + rep.join(',');
  if (!shellCache.has(key)) shellCache.set(key, new THREE.MeshStandardMaterial({ ...opts, color: new THREE.Color(base.color).multiplyScalar(k) }));
  return shellCache.get(key);
}
// 毛の長さ（ローカル座標。頭の半径が0.25前後）
const FUR_LEN = {
  shiba: 0.024, poodle: 0.03, golden: 0.034, dachshund: 0.016, chihuahua: 0.016, corgi: 0.022, husky: 0.03, dalmatian: 0.01,
  pug: 0.012, beagle: 0.015, pomeranian: 0.045, frenchie: 0.012,
  mike: 0.022, amesho: 0.02, scottish: 0.026, russian: 0.018, siamese: 0.014, munchkin: 0.022, mainecoon: 0.04, kuro: 0.02,
  persian: 0.05, bengal: 0.014, chatora: 0.022, ragdoll: 0.042,
};

// ===== 表情 =====
// eyes: open(ひらいた目) / happy(にっこり ∩) / relax(とじた目 ∪)
const EXPRESSIONS = {
  normal: { eyes: 'open', mouth: 'closed', blush: 0 },
  happy: { eyes: 'open', mouth: 'open', blush: 0.45, eyeScale: 1.06, pupil: 1.15 },
  joy: { eyes: 'happy', mouth: 'open', blush: 0.75 },
  purr: { eyes: 'relax', mouth: 'closed', blush: 0.6 },
  sleep: { eyes: 'relax', mouth: 'closed', blush: 0 },
  sad: { eyes: 'open', mouth: 'closed', blush: 0, brow: 'sad', eyeScale: 0.85, droop: -1 },
  angry: { eyes: 'open', mouth: 'open', blush: 0, brow: 'angry', eyeScale: 0.62, pupil: 0.6, droop: 1 },
  focus: { eyes: 'open', mouth: 'closed', blush: 0, eyeScale: 1.1, pupil: 1.8 },
  curious: { eyes: 'open', mouth: 'closed', blush: 0.2, eyeScale: 1.1, pupil: 1.25 },
};
const POSE_EXP = { happy: 'happy', sleep: 'sleep', playdead: 'sleep', sad: 'sad', angry: 'angry', crouch: 'focus', tilt: 'curious', beg: 'happy', highfive: 'happy', bow: 'happy' };

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
    happy: { headPitch: -0.15, earPerk: 0.3 },
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
    // 毛の層の数（いまの子は多め、ほかの子・公園の子は少なめで軽く）
    this.furN = { high: 8, mid: 5, low: 4, off: 0 }[opts.fur || 'high'] ?? 8;
    this.furHalf = this.furN >= 8 ? 4 : this.furN ? 2 : 0; // 脚・しっぽなど小さい部分の層の数
    this.furLen = (FUR_LEN[breed.id] ?? (this.isCat ? 0.022 : 0.02)) * 1.45;
    this.expTemp = null; this.expTimer = 0; this.purrT = 0; this.tailUp = 0; this.blushA = 0;
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
    // かわいく見えるよう、頭は大きめ・体はまるめ・脚は太め
    const d = {
      L: b.body.L * 0.96, H: b.body.H * 1.05, W: b.body.W * 1.1, legL: b.legL, legR: b.legR * 1.15, headR: b.headR * 1.12,
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
    this.addFur(body, this.furLen, { map: bodyTex }, [10, 5]);

    // ふわふわ（プードル・ポメ・ペルシャ）
    const r = rand(this.seed + 5);
    if (b.fluff) {
      const blobs = [];
      for (let i = 0; i < b.fluff; i++) {
        const th = r() * Math.PI * 2, ph = Math.acos(1 - 2 * (0.05 + r() * 0.8));
        const v = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
        if (v.y < -0.6) continue;
        const rad = Math.min(d.W, d.H) * (0.24 + r() * 0.08);
        blobs.push({ r: rad, pos: new THREE.Vector3(v.x * d.W / 2 * 0.8, v.y * d.H / 2 * 0.8, v.z * d.L / 2 * 0.8) });
      }
      const fl = this.mergeBlobs(blobs, mat(col.body));
      this.bodyPivot.add(fl);
      this.addFur(fl, this.furLen * 1.1, { color: col.body }, [12, 6]);
    }

    // 首まわりのふさふさ
    this.neck = new THREE.Group();
    this.neck.position.set(0, d.H * 0.28, d.L * 0.4);
    this.bodyPivot.add(this.neck);
    if (b.ruff) {
      const blobs = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        blobs.push({ r: d.headR * 0.32, pos: new THREE.Vector3(Math.cos(a) * d.headR * 0.6, Math.sin(a) * d.headR * 0.5 + d.headR * 0.1, d.headR * 0.15 + Math.sin(a) * -0.02) });
      }
      const ruff = this.mergeBlobs(blobs, mat(col.belly));
      this.neck.add(ruff);
      this.addFur(ruff, this.furLen * 1.3, { color: col.belly }, [10, 5]);
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
    this.addFur(neckMesh, this.furLen * 0.9, { color: col.head }, [5, 3], this.furHalf);

    const hs = this.isCat ? new THREE.Vector3(1.12, 0.95, 0.95) : new THREE.Vector3(1, 1, 1);
    this.headScale = hs;
    const headTex = makeFurTexture(b, 'head', this.seed);
    const head = new THREE.Mesh(new THREE.SphereGeometry(d.headR, 32, 22), new THREE.MeshStandardMaterial({ map: headTex, roughness: 0.85 }));
    head.scale.copy(hs);
    head.castShadow = true;
    this.headGroup.add(head);
    this.headMesh = head;
    const headFur = this.furLen * 0.8;
    this.addFur(head, headFur, { map: headTex }, [9, 5]);

    if (b.headFluff) {
      const blobs = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        blobs.push({ r: d.headR * 0.32, pos: new THREE.Vector3(Math.cos(a) * d.headR * 0.4, d.headR * 0.78, Math.sin(a) * d.headR * 0.35 - d.headR * 0.05) });
      }
      const hf = this.mergeBlobs(blobs, mat(col.head));
      this.headGroup.add(hf);
      this.addFur(hf, this.furLen, { color: col.head }, [8, 4]);
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
      const mf = this.furLen * 0.35;
      this.addFur(snout, mf, { color: col.muzzle }, [5, 3], this.furHalf);
      const nose = new THREE.Mesh(new THREE.SphereGeometry(sR * 0.42, 16, 12), mat(col.nose, { roughness: 0.25 }));
      nose.scale.set(1.25, 0.85, 0.9);
      nose.position.set(0, -R * 0.28 + sR * 0.45, R * 0.72 + sz * 1.45 + mf);
      this.headGroup.add(nose);
      const nhl = new THREE.Mesh(new THREE.SphereGeometry(sR * 0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
      nhl.position.set(sR * 0.12, sR * 0.14, sR * 0.33);
      nose.add(nhl);
      // 口（ω）とひらいた口
      const front = R * 0.72 + sz * 1.42 + mf;
      const mouthY = -R * 0.28 - sR * 0.32;
      this.mouthClosed = this.buildOmega(sR * 0.26, sR * 0.06, new THREE.Vector3(0, mouthY, front));
      this.headGroup.add(this.mouthClosed);
      const open = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), mat('#5a2430', { side: THREE.DoubleSide }));
      open.scale.set(sR * 0.62, sR * 0.55, sR * 0.5);
      open.position.set(0, mouthY + sR * 0.08, front - sR * 0.42);
      open.visible = false;
      this.headGroup.add(open);
      this.mouthOpen = open;
      // 舌
      const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat('#ef6f86'));
      tongue.scale.set(sR * 0.4, sR * 0.11, sR * 0.55);
      tongue.position.set(0, mouthY - sR * 0.32, front - sR * 0.32);
      tongue.rotation.x = 0.6;
      tongue.visible = false;
      this.headGroup.add(tongue);
      this.tongue = tongue;
    } else {
      const mm = mat(col.muzzle);
      const hfz = headFur * 0.7;
      for (const s of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(b.snout.R * 0.62, 14, 10), mm);
        m.position.set(s * b.snout.R * 0.48, -R * 0.3, R * 0.8 + b.snout.L * 0.4 + hfz);
        m.scale.set(1, 0.85, 0.8);
        this.headGroup.add(m);
        this.addFur(m, this.furLen * 0.3, { color: col.muzzle }, [4, 3], this.furHalf);
      }
      const chin = new THREE.Mesh(new THREE.SphereGeometry(b.snout.R * 0.45, 12, 8), mm);
      chin.position.set(0, -R * 0.44, R * 0.76 + b.snout.L * 0.3 + hfz);
      this.headGroup.add(chin);
      const nose = new THREE.Mesh(new THREE.SphereGeometry(R * 0.075, 12, 10), mat(col.nose, { roughness: 0.35 }));
      nose.scale.set(1.35, 0.8, 0.8);
      nose.position.set(0, -R * 0.17, R * 0.92 + b.snout.L * 0.45 + hfz + this.furLen * 0.3);
      this.headGroup.add(nose);
      // 口（ω）とひらいた口
      const mz = R * 0.9 + b.snout.L * 0.55 + hfz + this.furLen * 0.3;
      const my = -R * 0.3;
      this.mouthClosed = this.buildOmega(R * 0.06, R * 0.012, new THREE.Vector3(0, my, mz));
      const phil = new THREE.Mesh(new THREE.CapsuleGeometry(R * 0.01, R * 0.06, 3, 6), mat('#5a3a3a'));
      phil.position.set(0, R * 0.075, -R * 0.005);
      this.mouthClosed.add(phil);
      this.headGroup.add(this.mouthClosed);
      const open = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat('#7a2e3a'));
      open.scale.set(R * 0.075, R * 0.06, R * 0.03);
      open.position.set(0, my - R * 0.06, mz - R * 0.02);
      open.visible = false;
      this.headGroup.add(open);
      this.mouthOpen = open;
      // ひげ
      const wm = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const pts = [
            new THREE.Vector3(s * b.snout.R * 0.7, -R * 0.3, R * 0.85 + b.snout.L * 0.4 + hfz),
            new THREE.Vector3(s * R * 1.25, -R * 0.22 - i * R * 0.08 + 0.02, R * 0.7),
          ];
          this.headGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wm));
        }
      }
      const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat('#ef6f86'));
      tongue.scale.set(R * 0.05, R * 0.02, R * 0.06);
      tongue.position.set(0, my - R * 0.085, mz - R * 0.01);
      tongue.visible = false;
      this.headGroup.add(tongue);
      this.tongue = tongue;
    }

    // 目（漫画風: 黒い輪郭・アーモンド形・色つきの瞳・大きな黒目と白い光）
    // Canvas に描いた目を顔の表面に貼る。表情が変わったときだけ描き直す
    this.eyes = []; this.eyePlanes = [];
    const big = b.bigEyes ? 1.12 : 1;
    const eyeR = R * (this.isCat ? 0.2 : 0.18) * big;
    this.eyeR = eyeR;
    this.irisCol = b.coloredIris ? col.eye : '#6b4426';
    for (const s of [-1, 1]) {
      const eg = new THREE.Group();
      const ex = this.isCat ? 0.42 : 0.4, ey = this.isCat ? 0.02 : 0.08;
      const ez = Math.sqrt(Math.max(0.05, 1 - ex * ex - ey * ey));
      // 頭の表面すぐ上に貼る（毛の外に出すと横から見て浮くので、かわりに目のまわりの毛を短くする）
      const rr = R * 1.02;
      eg.position.set(s * ex * rr * hs.x, ey * rr * hs.y, ez * rr * hs.z * 0.97);
      eg.lookAt(eg.position.clone().multiply(new THREE.Vector3(1.25, 0.6, 1)).add(new THREE.Vector3(0, 0, R * 2)));
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const pm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, roughness: 0.35, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.22, depthWrite: true });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(eyeR * 2.6, eyeR * 2.6, 12, 12), pm);
      plane.position.z = eyeR * 0.05;
      // 平らな板のままだと横から見たとき頭の輪郭からはみ出すので、頭の丸み（楕円体）に沿わせて曲げる
      {
        eg.updateMatrix(); plane.updateMatrix();
        const M = eg.matrix.clone().multiply(plane.matrix), Mi = M.clone().invert();
        const gp = plane.geometry.attributes.position, v = new THREE.Vector3();
        for (let i = 0; i < gp.count; i++) {
          v.fromBufferAttribute(gp, i).applyMatrix4(M);
          v.divide(hs).setLength(rr).multiply(hs);
          v.applyMatrix4(Mi);
          gp.setXYZ(i, v.x, v.y, v.z);
        }
        gp.needsUpdate = true;
        plane.geometry.computeVertexNormals();
        plane.geometry.computeBoundingSphere();
      }
      plane.userData = { cv, tex, side: s };
      eg.add(plane);
      eg.userData.side = s;
      this.headGroup.add(eg);
      this.eyes.push(eg);
      this.eyePlanes.push(plane);
    }
    // 目のまわりは毛を短く（毛の層を目の位置で切り抜く）
    this.trimFurAroundEyes(head, this.eyes.map(e => e.position.clone().divide(hs).normalize()), eyeR / R);
    this._eyeKey = '';
    this.drawEyes(EXPRESSIONS.normal);

    // ほっぺ（うれしい時にぽっ）
    this.blushMat = new THREE.MeshBasicMaterial({ color: '#ff8fa3', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const s of [-1, 1]) {
      const bx = 0.6, by = this.isCat ? -0.18 : -0.12;
      const bz = Math.sqrt(Math.max(0.05, 1 - bx * bx - by * by));
      const rr = R + headFur * 0.6;
      const bl = new THREE.Mesh(new THREE.CircleGeometry(R * 0.12, 20), this.blushMat);
      bl.position.set(s * bx * rr * hs.x, by * rr * hs.y, bz * rr * hs.z);
      bl.lookAt(bl.position.clone().multiplyScalar(2));
      bl.scale.y = 0.7;
      this.headGroup.add(bl);
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
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(d.legR * 1.08, Math.max(0.01, d.legL - d.legR * 1.6), 4, 12), legMat);
      leg.position.y = -d.legL / 2;
      leg.castShadow = true;
      lg.add(leg);
      this.addFur(leg, this.furLen * 0.6, { color: col.legs }, [3, 4], this.furHalf);
      if (sz < 0 || b.fluff) {
        const thigh = new THREE.Mesh(new THREE.SphereGeometry(d.legR * (sz < 0 ? 2.0 : 1.6), 12, 10), sz < 0 ? mat(col.body) : legMat);
        thigh.position.y = -d.legL * 0.05;
        thigh.scale.set(0.9, 1.3, 1.1);
        thigh.castShadow = true;
        lg.add(thigh);
        this.addFur(thigh, this.furLen * 0.8, { color: sz < 0 ? col.body : col.legs }, [4, 3], this.furHalf);
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

  // 頭の毛の層を目のまわりだけ切り抜く。目の中心では全部の層、ふちでは外側の層だけ消す（毛が短くなる）
  // dirs: 頭メッシュのローカルで見た目の中心の向き / ang: 目の大きさ（角度、ラジアン）
  trimFurAroundEyes(head, dirs, ang) {
    const cosIn = Math.cos(ang * 1.05), cosOut = Math.cos(ang * 1.9);
    const shells = head.children.filter(o => o.userData.fur);
    shells.forEach((sh, idx) => {
      const h = (idx + 1) / shells.length;
      const m = sh.material;
      m.onBeforeCompile = shader => {
        shader.uniforms.eyeA = { value: dirs[0] };
        shader.uniforms.eyeB = { value: dirs[1] };
        shader.uniforms.eyeCos = { value: new THREE.Vector2(cosOut, cosIn) };
        shader.uniforms.shellH = { value: h };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vLP;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vLP;\nuniform vec3 eyeA;\nuniform vec3 eyeB;\nuniform vec2 eyeCos;\nuniform float shellH;')
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
            vec3 dn = normalize(vLP);
            float near = max(smoothstep(eyeCos.x, eyeCos.y, dot(dn, eyeA)), smoothstep(eyeCos.x, eyeCos.y, dot(dn, eyeB)));
            if (shellH > 1.0 - near * 1.02) discard;`);
      };
      m.customProgramCacheKey = () => 'eyetrim';
      m.needsUpdate = true;
    });
  }

  // mesh に毛の層を重ねる（len: 毛の長さ / base: 色 or テクスチャ / rep: 毛の細かさ / n: 層の数）
  addFur(mesh, len, base, rep = [4, 2], n = this.furN) {
    if (!n || len <= 0) return;
    const g = mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    const hs = g.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const sc = mesh.scale;
    const f = (half, s) => { const e = Math.max(1e-4, half * Math.abs(s)); return off => (e + off) / e; };
    const fx = f(hs.x, sc.x), fy = f(hs.y, sc.y), fz = f(hs.z, sc.z);
    for (let i = 1; i <= n; i++) {
      const off = len * i / n;
      const sh = new THREE.Mesh(g, shellMat(base, i, n, rep));
      const kx = fx(off), ky = fy(off), kz = fz(off);
      sh.scale.set(kx, ky, kz);
      sh.position.set(c.x * (1 - kx), c.y * (1 - ky), c.z * (1 - kz));
      sh.userData.fur = true;
      mesh.add(sh);
    }
  }
  // いくつかの球を1つにまとめる（ふわふわの毛玉を軽く描くため）
  mergeBlobs(list, material) {
    const geos = list.map(({ r, pos, scale }) => {
      const g = new THREE.SphereGeometry(1, 10, 8);
      g.scale(scale ? scale.x * r : r, scale ? scale.y * r : r, scale ? scale.z * r : r);
      g.translate(pos.x, pos.y, pos.z);
      return g;
    });
    const merged = mergeGeometries(geos);
    geos.forEach(g => g.dispose());
    const m = new THREE.Mesh(merged, material);
    m.castShadow = true;
    return m;
  }
  // 漫画風の目を Canvas に描く（右目の形で描き、左目は左右反転）
  drawEyes(E) {
    const pk = E.pupil || 1;
    const key = [E.eyes, E.droop || 0, pk, E.mouth === 'open' && E.eyes === 'open' && (E.blush || 0) > 0.3 ? 'smile' : ''].join('|');
    if (key === this._eyeKey) return;
    this._eyeKey = key;
    const cat = this.isCat;
    const iris = new THREE.Color(this.irisCol);
    if (cat) iris.offsetHSL(0, 0.2, 0.06); // あざやかに
    const irisLight = '#' + iris.clone().lerp(new THREE.Color('#ffffff'), cat ? 0.12 : 0.1).getHexString();
    const irisDark = '#' + iris.clone().multiplyScalar(0.62).getHexString();
    const W = cat ? 52 : 47, H = cat ? 40 : 44;
    for (const pl of this.eyePlanes) {
      const { cv, tex, side } = pl.userData;
      const g = cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, 128, 128);
      g.translate(64, 64);
      if (side < 0) g.scale(-1, 1); // 左目は反転（目じりが外側）
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = '#141010';
      if (E.eyes === 'happy' || E.eyes === 'relax') {
        // にっこり（∩）/ とじた目（∪）
        g.lineWidth = 10;
        g.beginPath();
        if (E.eyes === 'happy') { g.moveTo(-W * 0.8, 12); g.quadraticCurveTo(0, -H * 0.9, W * 0.8, 8); }
        else { g.moveTo(-W * 0.8, -4); g.quadraticCurveTo(0, H * 0.7, W * 0.8, -8); }
        g.stroke();
        tex.needsUpdate = true;
        continue;
      }
      // アーモンド形（目じり=+x を少し上げる）
      const shape = () => {
        g.beginPath();
        g.moveTo(-W, 6);
        g.bezierCurveTo(-W * 0.75, -H * 1.25, W * 0.7, -H * 1.3, W, -8);
        g.bezierCurveTo(W * 0.85, H * 1.15, -W * 0.7, H * 1.2, -W, 6);
        g.closePath();
      };
      g.save();
      shape();
      g.clip();
      // まぶたで切る（ぷんぷん: 目がしらが下がる / しょんぼり: 目じりが下がる / にこにこ: 下からほおが押し上げる）
      const droop = E.droop || 0;
      let lid = null;
      if (droop > 0) lid = [[-W - 4, -H * 0.15], [W + 4, -H * 0.95]];
      else if (droop < 0) lid = [[-W - 4, -H * 0.95], [W + 4, -H * 0.2]];
      if (lid) {
        g.beginPath();
        g.moveTo(lid[0][0], lid[0][1]); g.lineTo(lid[1][0], lid[1][1]);
        g.lineTo(W + 10, H + 10); g.lineTo(-W - 10, H + 10); g.closePath();
        g.clip();
      }
      if (key.endsWith('smile')) {
        g.beginPath();
        g.moveTo(-W - 10, -H - 10); g.lineTo(W + 10, -H - 10); g.lineTo(W + 10, H * 0.55);
        g.quadraticCurveTo(0, H * 0.05, -W - 10, H * 0.6); g.closePath();
        g.clip();
      }
      // 瞳（上が少し濃いグラデーション）
      const gr = g.createLinearGradient(0, -H, 0, H);
      gr.addColorStop(0, irisDark); gr.addColorStop(0.45, irisLight); gr.addColorStop(1, irisLight);
      g.fillStyle = gr;
      g.fillRect(-W - 5, -H - 5, W * 2 + 10, H * 2 + 10);
      // 黒目
      const pr = H * (cat ? 0.72 : 0.82) * Math.min(1.25, pk);
      const pxc = -4, pyc = 4;
      g.fillStyle = '#0d0a0a';
      g.beginPath();
      if (cat && pk < 0.8) g.ellipse(pxc, pyc, pr * 0.45, pr * 1.05, 0, 0, Math.PI * 2);
      else g.ellipse(pxc, pyc, pr * (cat ? 0.92 : 1), pr, 0, 0, Math.PI * 2);
      g.fill();
      // 白い光（大・小）
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(pxc + pr * 0.32, pyc - pr * 0.38, pr * 0.36, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(pxc - pr * 0.38, pyc + pr * 0.36, pr * 0.15, 0, Math.PI * 2); g.fill();
      g.restore();
      // 輪郭（上まぶたは太く）
      g.lineWidth = 6;
      shape();
      g.stroke();
      g.lineWidth = 11;
      g.beginPath();
      if (lid) { g.moveTo(lid[0][0] * 0.95, lid[0][1]); g.lineTo(lid[1][0] * 0.95, lid[1][1]); }
      else { g.moveTo(-W, 6); g.bezierCurveTo(-W * 0.75, -H * 1.25, W * 0.7, -H * 1.3, W, -8); }
      g.stroke();
      tex.needsUpdate = true;
    }
  }
  // ω の口
  buildOmega(r, tube, pos) {
    const g = new THREE.Group();
    const lm = mat('#4a2c2c', { roughness: 0.6 });
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 5, 14, Math.PI), lm);
      a.rotation.z = Math.PI;
      a.position.set(s * r, 0, 0);
      g.add(a);
    }
    g.position.copy(pos);
    return g;
  }
  // 一時的な表情（sec 秒）
  setExpression(name, sec = 1.5) { this.expTemp = name; this.expTimer = sec; }
  // ゴロゴロ（ねこ）
  purr(sec = 2.5) { this.purrT = Math.max(this.purrT, sec); this.setExpression('purr', sec); }

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
      const fluffyTail = ['bushy', 'catbushy', 'fluffy', 'pom'].includes(t.type);
      this.addFur(mesh, this.furLen * (fluffyTail ? 1.8 : 0.9), { color }, [3, 4], this.furHalf);
      if (t.type === 'pom') {
        const pom = new THREE.Mesh(new THREE.SphereGeometry(t.R * 2.2, 12, 10), mat(color));
        pom.position.y = segL;
        pom.castShadow = true;
        seg.add(pom);
        this.addFur(pom, this.furLen * 1.6, { color }, [4, 3], this.furHalf);
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

    // いまの表情
    if (this.expTimer > 0) { this.expTimer -= dt; if (this.expTimer <= 0) this.expTemp = null; }
    const exName = this.expTemp || POSE_EXP[this.poseName] || 'normal';
    const E = EXPRESSIONS[exName] || EXPRESSIONS.normal;

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
    // ゴロゴロ中は体が小さくふるえる
    if (this.purrT > 0) {
      this.purrT -= dt;
      this.bodyPivot.position.x = Math.sin(this.time * 90) * 0.0028;
      this.bodyMesh.scale.y *= 1 + Math.sin(this.time * 26) * 0.012;
    } else this.bodyPivot.position.x = 0;
    // うれしい犬はおしりもふりふり
    const wig = this.isCat ? 0 : Math.min(1, Math.max(0, this.wagAmp - 0.7) / 0.4);
    this.bodyPivot.rotation.y = Math.sin(this.time * 11 + 1.6) * 0.08 * wig;
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
    const wagFreq = this.isCat ? 2.2 : 9 + Math.min(1.2, this.wagAmp) * 5;
    this._wagPh = (this._wagPh || 0) + dt * wagFreq;
    const wag = Math.sin(this._wagPh) * Math.min(1.2, this.wagAmp);
    // ねこはうれしいとしっぽをピンと立てて、先をくるっと
    const tailHappy = this.isCat && ['happy', 'joy', 'purr', 'curious'].includes(exName) && !['sleep', 'down', 'playdead', 'crouch'].includes(this.poseName);
    this.tailUp += ((tailHappy ? 1 : 0) - this.tailUp) * Math.min(1, dt * 3);
    const n = this.tailSegs.length;
    this.tailSegs.forEach((s, i) => {
      if (i === 0) {
        const bx = cfg.base + c.tailBase * (this.isCat ? 0.4 : 0.6);
        s.rotation.x = THREE.MathUtils.lerp(bx, -0.08, this.tailUp);
        s.rotation.z = wag * (this.isCat ? 0.5 * (1 - this.tailUp * 0.7) : 1);
      } else {
        s.rotation.x = THREE.MathUtils.lerp(s.userData.curl, i >= n - 2 ? 0.6 : 0.02, this.tailUp);
        s.rotation.z = this.isCat ? Math.sin(this._wagPh - i * 0.6) * this.wagAmp * 0.45 * (1 - this.tailUp * 0.6) : wag * 0.15;
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

    // 目（まばたき・表情）
    this.blinkT -= dt;
    let blink = 1;
    if (this.blinkT < 0) {
      blink = 0.08;
      if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 4;
    }
    const es = E.eyeScale || 1;
    this.drawEyes(E);
    const opened = E.eyes === 'open';
    const openS = opened ? Math.max(0.06, Math.min(c.eyeOpen, blink) * es) : 1;
    const ek = 1 - Math.exp(-dt * 12);
    for (const pl of this.eyePlanes) {
      pl.scale.y = blink < 1 && opened ? openS : pl.scale.y + (openS - pl.scale.y) * ek;
      pl.scale.x += ((opened ? 1 + (es - 1) * 0.5 : 1) - pl.scale.x) * ek;
    }

    // 口・舌・ほっぺ
    const mouthOpen = E.mouth === 'open' || this.tongueOut;
    if (this.mouthOpen) this.mouthOpen.visible = mouthOpen;
    if (this.mouthClosed) this.mouthClosed.visible = !mouthOpen;
    if (this.tongue) this.tongue.visible = this.tongueOut || (!this.isCat && mouthOpen && exName !== 'angry');
    this.blushA += ((E.blush || 0) - this.blushA) * Math.min(1, dt * 4);
    this.blushMat.opacity = this.blushA * 0.55;
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

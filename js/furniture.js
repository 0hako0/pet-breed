// 家具（お部屋の模様替え）: カタログ・置き場所・3Dモデル・ペットが使う場所
import * as THREE from 'three';

function m(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }); }
function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? m(color) : color);
  b.position.set(x, y, z);
  return b;
}
function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 20) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'string' ? m(color) : color);
  c.position.set(x, y, z);
  return c;
}

// r: ペットが通れない範囲（0 = 上に乗れる）
// spots: ペットが乗る/そばに行く場所（家具の正面が +z のローカル座標）
//   face: 'out' = 家具の正面を向く / 'in' = 家具の方を向く / 'side' = 中心から外向き
// approach: 飛び乗る前に立つ場所
export const FURNITURE = {
  cushion: { name: 'ふかふかクッション', icon: '🛏️', price: 120, desc: 'どの子もごろんと寝ころぶよ', r: 0,
    spots: [{ p: [0, 0.14, 0], face: 'out' }] },
  sofa: { name: 'ソファ', icon: '🛋️', price: 250, desc: 'ぴょんと飛び乗ってくつろぐ', r: 1.0,
    approach: [0, 0, 1.05], spots: [{ p: [-0.42, 0.5, 0.06], face: 'out' }, { p: [0.42, 0.5, 0.06], face: 'out' }] },
  cattower: { name: 'キャットタワー', icon: '🐈', price: 300, desc: 'ねこはてっぺんまで登るのが大好き', r: 0.6,
    approach: [0.3, 0, 0.95], spots: [{ p: [0.25, 0.84, 0.2], face: 'out' }, { p: [-0.12, 1.52, -0.12], face: 'out' }] },
  doghouse: { name: 'いぬごや', icon: '🏠', price: 280, desc: '犬は自分のおうちでおやすみ。ねこは屋根の上', r: 0.75,
    approach: [0, 0, 1.15], spots: [{ p: [0, 0.04, 0], face: 'out' }, { p: [0, 1.28, 0], face: 'out' }] },
  fishbowl: { name: '金魚ばち', icon: '🐠', price: 200, desc: 'ねこが夢中で見つめる', r: 0.45,
    spots: [{ p: [0, 0, 0.82], face: 'in' }] },
  kotatsu: { name: 'こたつ', icon: '🍊', price: 350, desc: '冬はみんなでぬくぬく', r: 0.85,
    spots: [{ p: [0, 0, 0.86], face: 'side' }, { p: [0.86, 0, 0], face: 'side' }, { p: [-0.86, 0, 0], face: 'side' }, { p: [0, 0, -0.86], face: 'side' }] },
  floorlamp: { name: 'フロアライト', icon: '💡', price: 150, desc: '夜になるとやさしく光る', r: 0.3, spots: [] },
};

// 置き場所（ry: 家具の正面を部屋の中央に向ける回転）
export const FURN_SLOTS = [
  { name: 'まどの下', x: -1.5, z: -4.2, ry: 0 },
  { name: 'おくの右', x: 0.5, z: -4.2, ry: 0 },
  { name: '左のかべ', x: -4.25, z: -0.8, ry: Math.PI / 2 },
  { name: '右のかべ', x: 4.15, z: 0.3, ry: -Math.PI / 2 },
  { name: '左のてまえ', x: -3.9, z: 3.2, ry: Math.PI / 2 },
];

function shadowy(obj) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

export function makeFurniture(id) {
  const g = new THREE.Group();
  g.userData.id = id;
  switch (id) {
    case 'cushion': {
      const c = cyl(0.55, 0.58, 0.16, '#c9a0dc', 0, 0.08, 0, 28);
      c.scale.set(1, 1, 0.9);
      g.add(c);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.07, 10, 28), m('#b386cc'));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.14;
      rim.scale.set(1, 0.9, 1);
      g.add(rim);
      g.add(cyl(0.05, 0.05, 0.02, '#f4e1ff', 0, 0.165, 0, 10));
      break;
    }
    case 'sofa': {
      const base = '#e07a5f', cush = '#f2a07b';
      g.add(box(1.8, 0.3, 0.85, base, 0, 0.2, 0));
      g.add(box(0.86, 0.14, 0.7, cush, -0.44, 0.42, 0.06));
      g.add(box(0.86, 0.14, 0.7, cush, 0.44, 0.42, 0.06));
      g.add(box(1.8, 0.55, 0.22, base, 0, 0.6, -0.33));
      g.add(box(0.18, 0.5, 0.85, base, -0.9, 0.35, 0));
      g.add(box(0.18, 0.5, 0.85, base, 0.9, 0.35, 0));
      for (const [x, z] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]]) g.add(cyl(0.04, 0.03, 0.06, '#6b4f3a', x, 0.03, z, 8));
      break;
    }
    case 'cattower': {
      const carpet = '#b8a6d9', sisal = '#d9b98a';
      g.add(box(0.9, 0.08, 0.9, carpet, 0, 0.04, 0));
      g.add(cyl(0.09, 0.09, 1.45, sisal, -0.12, 0.76, -0.12, 14));
      g.add(cyl(0.08, 0.08, 0.8, sisal, 0.25, 0.42, 0.2, 14));
      g.add(cyl(0.32, 0.32, 0.06, carpet, 0.25, 0.81, 0.2, 24));
      g.add(box(0.62, 0.07, 0.62, carpet, -0.12, 1.48, -0.12));
      // ぶらさがるおもちゃ
      const str = cyl(0.006, 0.006, 0.35, '#ffffff', 0.12, 1.28, 0.12, 4);
      g.add(str);
      const toy = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), m('#ff6f91'));
      toy.position.set(0.12, 1.08, 0.12);
      g.add(toy);
      g.userData.update = (dt, ctx) => { toy.position.x = 0.12 + Math.sin(ctx.t * 2) * 0.03; };
      break;
    }
    case 'doghouse': {
      const wall = m('#f0c987'), roofM = m('#d65a4a');
      g.add(box(1.15, 0.05, 1.15, '#c9a06a', 0, 0.025, 0));
      g.add(box(1.1, 0.8, 0.06, wall, 0, 0.4, -0.52));
      g.add(box(0.06, 0.8, 1.1, wall, -0.52, 0.4, 0));
      g.add(box(0.06, 0.8, 1.1, wall, 0.52, 0.4, 0));
      g.add(box(0.3, 0.8, 0.06, wall, -0.4, 0.4, 0.52));
      g.add(box(0.3, 0.8, 0.06, wall, 0.4, 0.4, 0.52));
      g.add(box(0.5, 0.22, 0.06, wall, 0, 0.69, 0.52));
      const sh = new THREE.Shape();
      sh.moveTo(-0.72, 0); sh.lineTo(0.72, 0); sh.lineTo(0, 0.48); sh.lineTo(-0.72, 0);
      const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 1.3, bevelEnabled: false }), roofM);
      roof.position.set(0, 0.8, -0.65);
      g.add(roof);
      // 名札
      const plate = box(0.3, 0.1, 0.02, '#ffffff', 0, 0.9, 0.66);
      g.add(plate);
      break;
    }
    case 'fishbowl': {
      g.add(cyl(0.22, 0.24, 0.03, '#8a5a32', 0, 0.015, 0));
      g.add(cyl(0.04, 0.05, 0.6, '#8a5a32', 0, 0.32, 0, 10));
      g.add(cyl(0.33, 0.33, 0.05, '#b07a4a', 0, 0.63, 0, 24));
      const glass = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 18), m('#dff4ff', { transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false }));
      glass.position.y = 0.9;
      g.add(glass);
      const water = new THREE.Mesh(new THREE.SphereGeometry(0.235, 24, 14, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7), m('#7fc8f8', { transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false }));
      water.position.y = 0.9;
      g.add(water);
      const fish = new THREE.Group();
      const fb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), m('#ff8a3d'));
      fb.scale.set(1, 0.8, 1.6);
      fish.add(fb);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.06, 8), m('#ff6a2a'));
      tail.rotation.x = -Math.PI / 2;
      tail.position.z = -0.08;
      fish.add(tail);
      g.add(fish);
      g.userData.update = (dt, ctx) => {
        const a = ctx.t * 0.9;
        fish.position.set(Math.cos(a) * 0.1, 0.86 + Math.sin(ctx.t * 1.7) * 0.02, Math.sin(a) * 0.1);
        fish.rotation.y = -a;
        tail.rotation.y = Math.sin(ctx.t * 12) * 0.4;
      };
      break;
    }
    case 'kotatsu': {
      const futonTex = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const x = c.getContext('2d');
        x.fillStyle = '#e66d4f'; x.fillRect(0, 0, 128, 128);
        x.fillStyle = '#ffd6a5';
        for (let i = 0; i < 18; i++) { x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 5, 0, Math.PI * 2); x.fill(); }
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })();
      const futon = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.3, 1.62), new THREE.MeshStandardMaterial({ map: futonTex, roughness: 1 }));
      futon.position.y = 0.15;
      g.add(futon);
      g.add(box(1.25, 0.05, 1.25, '#c98f5e', 0, 0.33, 0));
      // みかん
      g.add(cyl(0.16, 0.12, 0.06, '#b8865b', 0.15, 0.38, 0.1, 16));
      for (const [x, z] of [[0.1, 0.06], [0.2, 0.12], [0.14, 0.17]]) {
        const o = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), m('#ff9f1c'));
        o.position.set(x, 0.45, z);
        g.add(o);
      }
      break;
    }
    case 'floorlamp': {
      g.add(cyl(0.22, 0.24, 0.04, '#7a6a5a', 0, 0.02, 0));
      g.add(cyl(0.025, 0.025, 1.5, '#7a6a5a', 0, 0.77, 0, 8));
      const shadeM = m('#fff2d9', { side: THREE.DoubleSide, emissive: '#ffcf80', emissiveIntensity: 0.1 });
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 0.32, 20, 1, true), shadeM);
      shade.position.y = 1.6;
      g.add(shade);
      const light = new THREE.PointLight('#ffcf8a', 0, 6, 1.4);
      light.position.y = 1.5;
      g.add(light);
      g.userData.update = (dt, ctx) => {
        const goal = ctx.night ? 4 : 0;
        light.intensity += (goal - light.intensity) * Math.min(1, dt * 3);
        shadeM.emissiveIntensity = 0.1 + light.intensity * 0.2;
      };
      break;
    }
  }
  shadowy(g);
  return g;
}

// 部屋と公園のシーン
import * as THREE from 'three';

function m(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o }); }

function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

function shadowy(obj) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

// ================= 雨・雪・花びら・落ち葉 =================
const PRECIP = {
  rain: { n: 1600, size: 0.42, fall: [9, 12], sway: 0, h: 14, cols: ['#cfe3ff'] },
  snow: { n: 1100, size: 0.16, fall: [0.8, 1.5], sway: 0.6, h: 12, cols: ['#ffffff'] },
  petal: { n: 160, size: 0.15, fall: [0.5, 0.9], sway: 0.9, h: 7, cols: ['#ffc4d6', '#ffb0c8', '#fff0f4'] },
  leaf: { n: 140, size: 0.2, fall: [0.6, 1.1], sway: 1.0, h: 8, cols: ['#e8833a', '#d9542c', '#f2b134', '#b5651d'] },
};
function precipTex(kind) {
  return canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    if (kind === 'rain') {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.9)');
      g.fillStyle = gr; g.fillRect(w / 2 - 2, 0, 4, h);
    } else if (kind === 'snow') {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    } else if (kind === 'petal') {
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.42, h * 0.26, 0.6, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(w / 2, 4); g.quadraticCurveTo(w - 4, h / 2, w / 2, h - 4); g.quadraticCurveTo(4, h / 2, w / 2, 4); g.fill();
    }
  });
}
// 注視点のまわりに降らせるパーティクル（Points 1つなので軽い）
function makePrecip(kind, radius) {
  const c = PRECIP[kind];
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(c.n * 3), col = new Float32Array(c.n * 3);
  const spd = new Float32Array(c.n), ph = new Float32Array(c.n);
  const tmp = new THREE.Color();
  for (let i = 0; i < c.n; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * c.h; pos[i * 3 + 2] = Math.sin(a) * r;
    tmp.set(c.cols[i % c.cols.length]);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    spd[i] = c.fall[0] + Math.random() * (c.fall[1] - c.fall[0]);
    ph[i] = Math.random() * 10;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: c.size, map: precipTex(kind), vertexColors: true, transparent: true, depthWrite: false,
    opacity: kind === 'rain' ? 0.8 : 0.95, sizeAttenuation: true,
  }));
  pts.frustumCulled = false;
  pts.userData = { kind, c, spd, ph, radius, t: 0 };
  return pts;
}
function updatePrecip(pts, dt, center) {
  if (!pts) return;
  const u = pts.userData, c = u.c;
  const a = pts.geometry.attributes.position.array;
  u.t += dt;
  pts.position.set(center.x, 0, center.z);
  for (let i = 0; i < c.n; i++) {
    a[i * 3 + 1] -= u.spd[i] * dt;
    if (c.sway) {
      a[i * 3] += Math.sin(u.t * 1.3 + u.ph[i]) * c.sway * dt;
      a[i * 3 + 2] += Math.cos(u.t * 1.1 + u.ph[i]) * c.sway * dt * 0.6;
    }
    if (a[i * 3 + 1] < 0) {
      const an = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * u.radius;
      a[i * 3] = Math.cos(an) * r; a[i * 3 + 1] = c.h * (0.85 + Math.random() * 0.15); a[i * 3 + 2] = Math.sin(an) * r;
    }
  }
  pts.geometry.attributes.position.needsUpdate = true;
}
// 地面にかぶせる「雪の積もり・落ち葉・花びら」のテクスチャ
function groundCoverTex(kind) {
  return canvasTex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    if (kind === 'snow') {
      g.fillStyle = 'rgba(250,252,255,0.93)'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(215,228,245,0.6)' : 'rgba(255,255,255,0.9)';
        g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 7, 0, Math.PI * 2); g.fill();
      }
    } else {
      const cols = kind === 'leaf' ? ['#e8833a', '#d9542c', '#f2b134', '#b5651d'] : ['#ffc4d6', '#ffb0c8', '#fff0f4'];
      for (let i = 0; i < (kind === 'leaf' ? 700 : 900); i++) {
        g.fillStyle = cols[i % cols.length];
        g.save(); g.translate(Math.random() * w, Math.random() * h); g.rotate(Math.random() * 6);
        g.beginPath(); g.ellipse(0, 0, kind === 'leaf' ? 7 : 4, kind === 'leaf' ? 4 : 2.6, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
  }, [10, 10]);
}

// ================= 部屋 =================
export function buildRoom() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f6e9da');
  const S = 5.5; // 部屋の半径

  const floorTex = canvasTex(512, 512, (g, w, h) => {
    const rows = 8;
    for (let i = 0; i < rows; i++) {
      const y = (i / rows) * h;
      let x = (i % 2) * -120;
      while (x < w) {
        const len = 180 + Math.random() * 140;
        const l = 58 + Math.random() * 10;
        g.fillStyle = `hsl(30, 45%, ${l}%)`;
        g.fillRect(x, y, len, h / rows);
        g.strokeStyle = 'rgba(80,50,20,0.35)';
        g.lineWidth = 2;
        g.strokeRect(x, y, len, h / rows);
        for (let k = 0; k < 6; k++) {
          g.strokeStyle = 'rgba(90,55,25,0.08)';
          g.beginPath();
          const yy = y + Math.random() * (h / rows);
          g.moveTo(x, yy); g.lineTo(x + len, yy + (Math.random() - 0.5) * 6);
          g.stroke();
        }
        x += len;
      }
    }
  }, [3, 3]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, S * 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  scene.add(floor);

  // ラグ
  const rugTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f2b8a2'; g.fillRect(0, 0, w, h);
    for (let r = 120; r > 0; r -= 22) {
      g.strokeStyle = r % 44 === 0 ? '#ffffff' : '#e8917a';
      g.lineWidth = 8;
      g.beginPath(); g.arc(w / 2, h / 2, r, 0, Math.PI * 2); g.stroke();
    }
  });
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.9, 48), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.3, 0.005, 0.6);
  rug.receiveShadow = true;
  scene.add(rug);

  // 壁
  const wallTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#fff7ec'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = 'rgba(240,190,160,0.25)';
      g.fillRect(x, 0, 14, h);
    }
  }, [6, 2]);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
  const wallH = 3.6;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, wallH), wallMat);
  back.position.set(0, wallH / 2, -S);
  back.receiveShadow = true;
  scene.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, wallH), wallMat);
  left.position.set(-S, wallH / 2, 0);
  left.rotation.y = Math.PI / 2;
  left.receiveShadow = true;
  scene.add(left);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, wallH), wallMat);
  right.position.set(S, wallH / 2, 0);
  right.rotation.y = -Math.PI / 2;
  right.receiveShadow = true;
  scene.add(right);
  // 幅木
  const skirtMat = m('#c98f5e');
  for (const [w, x, z, ry] of [[S * 2, 0, -S + 0.03, 0], [S * 2, -S + 0.03, 0, Math.PI / 2], [S * 2, S - 0.03, 0, -Math.PI / 2]]) {
    const sk = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, 0.05), skirtMat);
    sk.position.set(x, 0.125, z);
    sk.rotation.y = ry;
    scene.add(sk);
  }

  // 窓
  const windowGroup = new THREE.Group();
  const skyMat = new THREE.MeshBasicMaterial({ color: '#9fd6ff' });
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.5), skyMat);
  windowGroup.add(pane);
  const frameMat = m('#ffffff');
  for (const [w, h, x, y] of [[2.4, 0.1, 0, 0.8], [2.4, 0.1, 0, -0.8], [0.1, 1.7, -1.15, 0], [0.1, 1.7, 1.15, 0], [0.06, 1.6, 0, 0], [2.3, 0.06, 0, 0]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frameMat);
    f.position.set(x, y, 0.03);
    windowGroup.add(f);
  }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.3), frameMat);
  sill.position.set(0, -0.88, 0.12);
  windowGroup.add(sill);
  // カーテン
  for (const s of [-1, 1]) {
    const cur = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 2.0, 12, 1, true, 0, Math.PI), m('#ffb3c1', { side: THREE.DoubleSide }));
    cur.position.set(s * 1.4, -0.05, 0.15);
    cur.rotation.y = Math.PI;
    windowGroup.add(cur);
  }
  // 窓の外の太陽/月
  const sun = new THREE.Mesh(new THREE.CircleGeometry(0.18, 24), new THREE.MeshBasicMaterial({ color: '#fff3a0' }));
  sun.position.set(0.55, 0.35, 0.005);
  windowGroup.add(sun);
  // 窓の外の天気（雨・雪・花びら・落ち葉）をテクスチャのスクロールで表現
  const winFxTex = {};
  for (const k of ['rain', 'snow', 'petal', 'leaf']) {
    winFxTex[k] = canvasTex(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const n = k === 'rain' ? 70 : k === 'snow' ? 60 : 16;
      for (let i = 0; i < n; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        if (k === 'rain') { g.strokeStyle = 'rgba(230,240,255,0.75)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 18); g.stroke(); }
        else if (k === 'snow') { g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(x, y, 2 + Math.random() * 3, 0, Math.PI * 2); g.fill(); }
        else { g.fillStyle = k === 'petal' ? '#ffb7cc' : ['#e8833a', '#d9542c', '#f2b134'][i % 3]; g.beginPath(); g.ellipse(x, y, 6, 3.5, Math.random() * 3, 0, Math.PI * 2); g.fill(); }
      }
    }, [1.5, 1]);
  }
  const winFx = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.5), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
  winFx.position.z = 0.008;
  winFx.visible = false;
  windowGroup.add(winFx);
  // 雪の日は窓の外に積もった雪
  const winSnow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.3), new THREE.MeshBasicMaterial({ color: '#f4f8ff' }));
  winSnow.position.set(0, -0.6, 0.006);
  winSnow.visible = false;
  windowGroup.add(winSnow);
  windowGroup.position.set(-1.2, 2.0, -S + 0.02);
  scene.add(windowGroup);

  // ペットベッド（1つのベッドに1匹。2つ目は奥の右すみ）
  function makeBed(c1, c2, x, z, k = 1) {
    const g = new THREE.Group();
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.14, 32), m(c1));
    cushion.position.y = 0.07;
    g.add(cushion);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.2, 14, 36), m(c2));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.18;
    g.add(rim);
    g.position.set(x, 0, z);
    g.scale.set(k, 1, k);
    shadowy(g);
    scene.add(g);
    return g;
  }
  const bed = makeBed('#9fc6e8', '#6f9fcf', -3.6, -3.4);
  const bed2 = makeBed('#f4c6d4', '#e39ab2', 4.35, -4.3, 0.85);

  // ごはん皿・水皿
  const bowl = makeBowl('#ff8a65');
  bowl.position.set(3.0, 0, -2.4);
  scene.add(bowl);
  const food = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), m('#a0662e'));
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.17;
    k.position.set(Math.cos(a) * r, 0.1 + Math.random() * 0.04, Math.sin(a) * r);
    food.add(k);
  }
  food.visible = false;
  bowl.add(food);
  bowl.userData.food = food;
  const water = makeBowl('#64b5f6');
  water.position.set(3.7, 0, -2.0);
  const wat = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), m('#8fd3ff', { roughness: 0.1, transparent: true, opacity: 0.8 }));
  wat.rotation.x = -Math.PI / 2;
  wat.position.y = 0.11;
  water.add(wat);
  scene.add(water);

  // おもちゃ箱
  const toybox = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.7), m('#ffd166'));
  box.position.y = 0.3;
  toybox.add(box);
  const toyCols = ['#ef476f', '#06d6a0', '#118ab2'];
  toyCols.forEach((c, i) => {
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), m(c));
    t.position.set(-0.28 + i * 0.28, 0.65, (i - 1) * 0.08);
    toybox.add(t);
  });
  toybox.position.set(3.8, 0, 2.2);
  toybox.rotation.y = -0.4;
  shadowy(toybox);
  scene.add(toybox);

  // 観葉植物
  const plant = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.25, 0.55, 18), m('#d9824a'));
  pot.position.y = 0.27;
  plant.add(pot);
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), m(i % 2 ? '#5bab5d' : '#4a9a4e'));
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.22, 0.85 + Math.sin(i * 1.7) * 0.18, Math.sin(a) * 0.22);
    leaf.scale.set(0.8, 1.4, 0.8);
    plant.add(leaf);
  }
  plant.position.set(-4.6, 0, 1.5);
  shadowy(plant);
  scene.add(plant);

  // 本棚
  const shelf = new THREE.Group();
  const sb = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 0.45), m('#b07a4a'));
  sb.position.y = 0.9;
  shelf.add(sb);
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 6; i++) {
      const bk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38 + Math.random() * 0.1, 0.32), m(['#e76f51', '#2a9d8f', '#e9c46a', '#264653', '#f4a261'][(i + r) % 5]));
      bk.position.set(-0.6 + i * 0.22, 0.32 + r * 0.56, 0.08);
      shelf.add(bk);
    }
  }
  shelf.position.set(2.2, 0, -S + 0.25);
  shadowy(shelf);
  scene.add(shelf);

  // 写真フレーム
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.04), m('#7a4f2a'));
  frame.position.set(-S + 0.03, 2.1, -1.5);
  frame.rotation.y = Math.PI / 2;
  scene.add(frame);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.46), new THREE.MeshBasicMaterial({ map: canvasTex(128, 96, (g, w, h) => {
    g.fillStyle = '#bfe3ff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7cc46b'; g.fillRect(0, h * 0.65, w, h);
    g.fillStyle = '#ffde59'; g.beginPath(); g.arc(w * 0.75, h * 0.3, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText('🐾', 20, 70);
  }) }));
  pic.position.set(-S + 0.06, 2.1, -1.5);
  pic.rotation.y = Math.PI / 2;
  scene.add(pic);

  // 照明
  const hemi = new THREE.HemisphereLight('#ffffff', '#d9b38c', 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight('#fff4e0', 1.6);
  dir.position.set(-3, 7, 4);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.left = -7; dir.shadow.camera.right = 7;
  dir.shadow.camera.top = 7; dir.shadow.camera.bottom = -7;
  dir.shadow.bias = -0.0005;
  dir.shadow.radius = 4;
  scene.add(dir);
  const lamp = new THREE.PointLight('#ffb760', 0, 14, 1);
  lamp.position.set(0, 3.2, 0);
  scene.add(lamp);
  // 天井ランプの見た目
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.35, 20, 1, true), m('#fff2d9', { side: THREE.DoubleSide, emissive: '#ffcf80', emissiveIntensity: 0.2 }));
  shade.position.set(0, 3.4, 0);
  scene.add(shade);

  return {
    scene, floor, bowl, water, bed, bed2, toybox,
    occluders: [toybox, plant, shelf], // カメラとペットの間に入ったら半透明にする物
    bounds: { minX: -S + 0.6, maxX: S - 0.6, minZ: -S + 0.6, maxZ: S - 0.4 },
    spots: {
      bowl: new THREE.Vector3(3.0, 0, -1.75),
      water: new THREE.Vector3(3.7, 0, -1.4),
      bed: new THREE.Vector3(-3.6, 0.12, -3.4),
      bed2: new THREE.Vector3(4.35, 0.12, -4.3),
      center: new THREE.Vector3(0.3, 0, 0.6),
    },
    lights: { hemi, dir, lamp, sky: skyMat, sun, shade },
    weather: 'sunny', season: 'spring', hour: 12, sleeping: false,
    windowSpot: new THREE.Vector3(-1.2, 0, -S + 1.1),
    setWeather(weather, season) {
      this.weather = weather; this.season = season;
      const fx = weather === 'rain' ? 'rain' : weather === 'snow' ? 'snow' : season === 'spring' ? 'petal' : season === 'autumn' ? 'leaf' : null;
      winFx.visible = !!fx;
      if (fx) { winFx.material.map = winFxTex[fx]; winFx.material.needsUpdate = true; winFx.userData.speed = { rain: 1.6, snow: 0.18, petal: 0.12, leaf: 0.14 }[fx]; }
      winSnow.visible = weather === 'snow';
      sun.visible = weather === 'sunny';
      this.setTimeOfDay(this.hour, this.sleeping);
    },
    update(dt) {
      if (winFx.visible) {
        const m = winFx.material.map;
        m.offset.y += dt * winFx.userData.speed;
        m.offset.x += dt * (winFx.userData.speed < 1 ? 0.05 : 0.15);
      }
    },
    setTimeOfDay(hour, sleeping) {
      this.hour = hour; this.sleeping = sleeping;
      // 現実の時刻にあわせて窓の外と照明を変える
      let sky, sunCol, dirI, hemiI, lampI, bg;
      if (hour >= 6 && hour < 16) { sky = '#9fd6ff'; sunCol = '#fff3a0'; dirI = 1.6; hemiI = 0.9; lampI = 0; bg = '#f6e9da'; }
      else if (hour >= 16 && hour < 19) { sky = '#ffb27a'; sunCol = '#ff8a3d'; dirI = 1.0; hemiI = 0.75; lampI = 3; bg = '#f3dcc6'; }
      else { sky = '#1c2a54'; sunCol = '#f4f1c9'; dirI = 0.35; hemiI = 0.45; lampI = 7; bg = '#3a3350'; }
      // 天気: くもり・雨・雪の日は窓の外が灰色っぽく、部屋も少し暗い
      const day = hour >= 6 && hour < 19;
      const wSky = { cloudy: '#c5ccd6', rain: '#8d98a6', snow: '#dde4ee' }[this.weather];
      if (wSky) {
        sky = new THREE.Color(sky).lerp(new THREE.Color(wSky), day ? 0.85 : 0.3).getStyle();
        const k = { cloudy: 0.75, rain: 0.55, snow: 0.8 }[this.weather];
        dirI *= k;
        if (day && this.weather === 'rain') lampI = Math.max(lampI, 2.5);
      }
      if (sleeping) { dirI *= 0.25; hemiI *= 0.35; lampI = 1.5; bg = '#2a2540'; }
      skyMat.color.set(sky);
      sun.material.color.set(sunCol);
      dir.intensity = dirI;
      hemi.intensity = hemiI;
      lamp.intensity = lampI;
      scene.background.set(bg);
    },
  };
}

function makeBowl(color) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(0.2 + t * 0.1, t * 0.12));
  }
  const outer = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), m(color, { side: THREE.DoubleSide, roughness: 0.4 }));
  g.add(outer);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), m('#ffffff'));
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.01;
  g.add(bottom);
  shadowy(g);
  return g;
}

// ================= 公園 =================
export function buildPark() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bfe6ff');
  scene.fog = new THREE.Fog('#bfe6ff', 18, 45);
  const R = 16;

  const grassTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#7cc46b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `hsl(${95 + Math.random() * 25}, ${45 + Math.random() * 20}%, ${38 + Math.random() * 22}%)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 4 + Math.random() * 4);
    }
  }, [14, 14]);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  // 散歩道（リング）
  const path = new THREE.Mesh(new THREE.RingGeometry(8.2, 9.6, 80), m('#e6cf9e', { roughness: 1 }));
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.01;
  path.receiveShadow = true;
  scene.add(path);
  const path2 = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 17), m('#e6cf9e', { roughness: 1 }));
  path2.rotation.x = -Math.PI / 2;
  path2.position.y = 0.012;
  path2.receiveShadow = true;
  scene.add(path2);
  const coverTex = {};
  const groundCover = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ transparent: true, roughness: 1, depthWrite: false }));
  groundCover.rotation.x = -Math.PI / 2;
  groundCover.position.y = 0.016;
  groundCover.receiveShadow = true;
  groundCover.visible = false;
  scene.add(groundCover);

  // 池
  const pond = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40), m('#5ab4e6', { roughness: 0.15, metalness: 0.1 }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(4.2, 0.02, -3.2);
  pond.scale.set(1.3, 1, 1);
  scene.add(pond);
  const pondRim = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.9, 40), m('#9a9a8f'));
  pondRim.rotation.x = -Math.PI / 2;
  pondRim.position.set(4.2, 0.025, -3.2);
  pondRim.scale.set(1.3, 1, 1);
  scene.add(pondRim);

  // 木
  const trees = [];
  const treeSpots = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
    const r = 12 + Math.random() * 5;
    treeSpots.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  treeSpots.push([-4, 4], [-5.5, -2], [2, 5.5], [-2, -5.5]);
  for (const [x, z] of treeSpots) {
    const t = makeTree();
    t.position.set(x, 0, z);
    t.rotation.y = Math.random() * 6;
    t.scale.setScalar(0.8 + Math.random() * 0.6);
    scene.add(t);
    // カメラとの重なり判定用の外接球（scale 反映後に計算）
    t.updateMatrixWorld(true);
    t.userData.sphere = new THREE.Box3().setFromObject(t).getBoundingSphere(new THREE.Sphere());
    t.userData.fade = 1;
    trees.push(t);
  }

  // 花
  const flowerCols = ['#ff6f91', '#ffd84d', '#ffffff', '#b28dff', '#ff9671'];
  for (let i = 0; i < 160; i++) {
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 13;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (r > 7.8 && r < 10) continue;
    if (Math.hypot(x - 4.2, z + 3.2) < 3.5) continue;
    const f = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4), m('#4a8a3a'));
    stem.position.y = 0.1;
    f.add(stem);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), m(flowerCols[i % flowerCols.length]));
    head.position.y = 0.22;
    f.add(head);
    f.position.set(x, 0, z);
    scene.add(f);
  }

  // ベンチ
  for (const [x, z, ry] of [[-6, 6.2, 0.7], [6.5, 5.5, -0.8]]) {
    const b = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.6), m('#b5793f'));
    seat.position.y = 0.5;
    b.add(seat);
    const backr = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.08), m('#b5793f'));
    backr.position.set(0, 0.85, -0.28);
    b.add(backr);
    for (const sx of [-0.85, 0.85]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.55), m('#555'));
      leg.position.set(sx, 0.25, 0);
      b.add(leg);
    }
    b.position.set(x, 0, z);
    b.rotation.y = ry;
    shadowy(b);
    scene.add(b);
  }

  // 雲
  const cloudMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1 + Math.random(), 10, 8), cloudMat);
      s.position.set(k * 1.3, Math.random() * 0.5, Math.random());
      c.add(s);
    }
    const a = Math.random() * Math.PI * 2;
    c.position.set(Math.cos(a) * 30, 12 + Math.random() * 5, Math.sin(a) * 30);
    scene.add(c);
  }

  const hemi = new THREE.HemisphereLight('#ffffff', '#7cc46b', 1.0);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight('#fff6e0', 1.8);
  dir.position.set(6, 12, 5);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.left = -14; dir.shadow.camera.right = 14;
  dir.shadow.camera.top = 14; dir.shadow.camera.bottom = -14;
  dir.shadow.bias = -0.0005;
  scene.add(dir);
  scene.add(dir.target);

  return {
    scene, ground, dir, trees,
    bounds: { radius: R - 1 },
    weather: 'sunny', season: 'spring', hour: 12, precip: null,
    setWeather(weather, season) {
      this.weather = weather; this.season = season;
      // 木の葉の色（季節）
      const pal = {
        spring: [['#f7b6c8', '#f39ab5', '#ffd1dc'], ['#4f9d4a', '#5bb055', '#3f8a3e']],
        summer: [['#3f8f3a', '#4ea845', '#2f7a30']],
        autumn: [['#e8833a', '#d9542c', '#f2b134'], ['#c9672a', '#e0a33a', '#a8451f']],
        winter: weather === 'snow' ? [['#eef3f8', '#dfe8f0', '#f8fbff']] : [['#6f8f6a', '#7b9a72', '#5f7f5c']],
      }[season];
      trees.forEach((t, ti) => {
        const set = pal[ti % pal.length];
        t.traverse(o => { if (o.isMesh && o.userData.leaf !== undefined) o.material.color.set(set[o.userData.leaf]); });
      });
      // 地面のおおい
      const cover = weather === 'snow' ? 'snow' : season === 'autumn' ? 'leaf' : season === 'spring' ? 'petal' : null;
      groundCover.visible = !!cover;
      if (cover) {
        if (!coverTex[cover]) coverTex[cover] = groundCoverTex(cover);
        groundCover.material.map = coverTex[cover];
        groundCover.material.opacity = cover === 'snow' ? 1 : 0.9;
        groundCover.material.needsUpdate = true;
      }
      path.material.color.set(weather === 'snow' ? '#eef2f7' : '#e6cf9e');
      path2.material.color.set(weather === 'snow' ? '#eef2f7' : '#e6cf9e');
      // 降るもの
      if (this.precip) { scene.remove(this.precip); this.precip.geometry.dispose(); this.precip.material.dispose(); this.precip = null; }
      const fx = weather === 'rain' ? 'rain' : weather === 'snow' ? 'snow' : season === 'spring' ? 'petal' : season === 'autumn' ? 'leaf' : null;
      if (fx) { this.precip = makePrecip(fx, fx === 'rain' || fx === 'snow' ? 14 : 11); scene.add(this.precip); }
      cloudMat.color.set(weather === 'rain' ? '#9aa3ad' : weather === 'cloudy' || weather === 'snow' ? '#e2e6ea' : '#ffffff');
      this.setTimeOfDay(this.hour);
    },
    update(dt, center) { updatePrecip(this.precip, dt, center); },
    obstacles: [[4.2, -3.2, 3.4], ...treeSpots.map(([x, z]) => [x, z, 0.7])],
    setTimeOfDay(hour) {
      this.hour = hour;
      let bg, i;
      if (hour >= 6 && hour < 16) { bg = '#bfe6ff'; i = 1.8; }
      else if (hour >= 16 && hour < 19) { bg = '#ffc79a'; i = 1.2; }
      else { bg = '#34407a'; i = 0.6; }
      const day = hour >= 6 && hour < 19;
      const wSky = { cloudy: '#c9d1da', rain: '#8f9aa6', snow: '#dfe6ee' }[this.weather];
      if (wSky) {
        bg = new THREE.Color(bg).lerp(new THREE.Color(wSky), day ? 0.8 : 0.3).getStyle();
        i *= { cloudy: 0.7, rain: 0.5, snow: 0.8 }[this.weather];
      }
      scene.background.set(bg);
      scene.fog.color.set(bg);
      scene.fog.near = this.weather === 'rain' || this.weather === 'snow' ? 10 : 18;
      scene.fog.far = this.weather === 'rain' || this.weather === 'snow' ? 34 : 45;
      dir.intensity = i;
      hemi.intensity = hour >= 19 || hour < 6 ? 0.55 : 1.0;
    },
  };
}

function makeTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.6, 10), m('#8a5a32'));
  trunk.position.y = 0.8;
  g.add(trunk);
  const greens = ['#4f9d4a', '#5bb055', '#3f8a3e'];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + Math.random() * 0.3, 1), m(greens[i % 3], { flatShading: true }));
    s.userData.leaf = i % 3;
    s.position.set((Math.random() - 0.5) * 0.9, 1.9 + Math.random() * 0.7, (Math.random() - 0.5) * 0.9);
    g.add(s);
  }
  shadowy(g);
  return g;
}

// ================= 小物 =================
export function makeBall(color = '#ef476f') {
  const tex = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(0, h * 0.42, w, h * 0.16);
  });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
  b.castShadow = true;
  return b;
}

export function makeFrisbee() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.03, 28), m('#ff4d6d', { roughness: 0.4 }));
  g.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.018, 8, 28), m('#ffd23f', { roughness: 0.4 }));
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const star = new THREE.Mesh(new THREE.CircleGeometry(0.06, 5), m('#ffffff'));
  star.rotation.x = -Math.PI / 2;
  star.position.y = 0.016;
  g.add(star);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeTeaser() {
  // 猫じゃらし
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 6), m('#c9a06a'));
  stick.position.y = 0.6;
  stick.rotation.z = 0.5;
  stick.position.x = -0.28;
  g.add(stick);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 4), m('#ffffff'));
  string.position.set(-0.55, 0.85, 0);
  g.add(string);
  const fluff = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 6), m(['#ff7eb6', '#ffd84d', '#7ad3ff'][i % 3]));
    f.rotation.z = (i / 6) * Math.PI * 2;
    f.position.set(Math.cos(i) * 0.03, Math.sin(i) * 0.03, 0);
    fluff.add(f);
  }
  g.add(fluff);
  g.userData.fluff = fluff;
  shadowy(g);
  return g;
}

export function makePoop() {
  const g = new THREE.Group();
  const mt = m('#7a4b26', { roughness: 0.6 });
  [[0.13, 0.06], [0.1, 0.14], [0.065, 0.21]].forEach(([r, y]) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mt);
    s.scale.y = 0.7;
    s.position.y = y;
    g.add(s);
  });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 8), mt);
  tip.position.y = 0.27;
  g.add(tip);
  shadowy(g);
  g.name = 'poop';
  return g;
}

export function makeCoin() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 24), m('#f2c230', { metalness: 0.8, roughness: 0.25, emissive: '#7a5a00', emissiveIntensity: 0.3 }));
  c.rotation.x = Math.PI / 2;
  g.add(c);
  g.position.y = 0.4;
  shadowy(g);
  return g;
}

export function makeBone() {
  const g = new THREE.Group();
  const mt = m('#fff3df');
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 10), mt);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const sx of [-0.16, 0.16]) for (const sy of [-0.035, 0.035]) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mt);
    k.position.set(sx, sy, 0);
    g.add(k);
  }
  g.position.y = 0.35;
  shadowy(g);
  return g;
}

export function makeFish() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), m('#7fb3d5', { roughness: 0.4 }));
  body.scale.set(1.4, 0.7, 0.4);
  g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 3), m('#5d93b8'));
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -0.24;
  tail.scale.z = 0.3;
  g.add(tail);
  g.position.y = 0.35;
  shadowy(g);
  return g;
}

export function makeButterfly() {
  const g = new THREE.Group();
  const col = ['#ffd84d', '#ff9ad5', '#9ad7ff', '#ffffff'][Math.floor(Math.random() * 4)];
  const wm = new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide });
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), wm);
    w.geometry.translate(s * 0.1, 0, 0);
    w.rotation.x = -Math.PI / 2;
    const p = new THREE.Group();
    p.add(w);
    g.add(p);
    wings.push(p);
  }
  g.userData.wings = wings;
  return g;
}

export function makeBathtub() {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector2(0.75 + t * 0.12, t * 0.55));
  }
  const tub = new THREE.Mesh(new THREE.LatheGeometry(pts, 36), m('#ffffff', { side: THREE.DoubleSide, roughness: 0.3 }));
  g.add(tub);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.84, 32), m('#a9e4ff', { transparent: true, opacity: 0.75, roughness: 0.1 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.42;
  g.add(water);
  shadowy(g);
  return g;
}

export function makeBrush() {
  const g = new THREE.Group();
  // 持ち手はななめ上に（ブラシの頭を毛に平らに当てたまま持てるように）
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.45), m('#ff8fab'));
  handle.position.set(0, 0.11, 0.33);
  handle.rotation.x = -0.6;
  g.add(handle);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.28), m('#ff8fab'));
  g.add(head);
  for (let i = 0; i < 20; i++) {
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 3), m('#ffffff'));
    br.position.set(-0.09 + (i % 5) * 0.045, -0.06, -0.1 + Math.floor(i / 5) * 0.065);
    g.add(br);
  }
  return g;
}

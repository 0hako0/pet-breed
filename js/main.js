import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DOG_BREEDS, CAT_BREEDS, ALL_BREEDS, getBreed } from './breeds.js';
import { PetModel, ACCESSORIES } from './petModel.js';
import { buildRoom, buildPark, makeBall, makeTeaser, makePoop, makeCoin, makeBone, makeFish, makeButterfly, makeBathtub, makeBrush } from './world.js';
import * as G from './game.js';
import { sfx, voice, setMuted, isMuted } from './audio.js';

const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ================= レンダラー・カメラ =================
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 2.9, 5.9);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 2.2;
controls.maxDistance = 11;
controls.maxPolarAngle = 1.42;
controls.target.set(0, 0.6, 0);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const room = buildRoom();
const park = buildPark();
let mode = 'room';
let scene = room.scene;
const ROOM_OBST = [[3.8, 2.2, 0.85], [-4.6, 1.5, 0.55], [2.2, -5.2, 1.1]];

// ================= セーブデータ =================
let S = G.load();
setMuted(!!S.muted);
const curPet = () => S.pets.find(p => p.id === S.active);

// ================= パーティクル（絵文字スプライト） =================
const emojiTexCache = {};
function emojiTex(ch) {
  if (!emojiTexCache[ch]) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = '96px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    emojiTexCache[ch] = t;
  }
  return emojiTexCache[ch];
}
const particles = [];
function emit(ch, pos, n = 5, o = {}) {
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(ch), transparent: true, depthWrite: false }));
    const size = (o.size || 0.3) * rnd(0.7, 1.2);
    sp.scale.setScalar(size);
    sp.position.copy(pos).add(new THREE.Vector3(rnd(-1, 1) * (o.spread ?? 0.3), rnd(0, 0.2), rnd(-1, 1) * (o.spread ?? 0.3)));
    scene.add(sp);
    particles.push({
      sp, life: o.life || rnd(1.0, 1.6), max: o.life || 1.4,
      vel: new THREE.Vector3(rnd(-0.3, 0.3), (o.up ?? 1.0) * rnd(0.6, 1.1), rnd(-0.3, 0.3)),
      grav: o.grav || 0, sceneRef: scene,
    });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.vel.y -= p.grav * dt;
    p.sp.position.addScaledVector(p.vel, dt);
    p.sp.material.opacity = Math.min(1, p.life / 0.5);
    if (p.life <= 0) {
      p.sceneRef.remove(p.sp);
      p.sp.material.dispose();
      particles.splice(i, 1);
    }
  }
}
function clearParticles() {
  for (const p of particles) { p.sceneRef.remove(p.sp); p.sp.material.dispose(); }
  particles.length = 0;
}

// ================= UI 小物 =================
function toast(msg, cls = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3100);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}
let bubbleT = 0;
function bubble(text, sec = 2.2, isText = false) {
  const b = $('bubble');
  b.textContent = text;
  b.classList.toggle('text', isText);
  b.classList.remove('hidden');
  bubbleT = sec;
}
function fade(on) {
  $('fade').classList.toggle('on', on);
  return new Promise(r => setTimeout(r, 480));
}

// タッチ操作の端末では「クリック」ではなく「タップ」と案内する
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches;
const TAP = IS_TOUCH ? 'タップ' : 'クリック';

// ステータスバー（スマホではタップで くわしく/かんたん 表示を切り替え）
$('status').addEventListener('click', () => {
  const ex = $('status').classList.toggle('expanded');
  $('status-toggle').textContent = ex ? '▲ とじる' : '▼ くわしく';
});
const barsEl = $('bars');
const barRefs = {};
for (const s of G.STAT_INFO) {
  const row = document.createElement('div');
  row.className = 'bar-row';
  row.innerHTML = `<span class="ic">${s.icon}</span><span class="lb">${s.label}</span><div class="bar"><div style="background:${s.color}"></div></div><span class="v"></span>`;
  barsEl.appendChild(row);
  barRefs[s.key] = { row, fill: row.querySelector('.bar > div'), v: row.querySelector('.v') };
}
function refreshUI() {
  const p = curPet();
  $('coins').textContent = S.coins;
  $('btn-sound').textContent = isMuted() ? '🔇' : '🔊';
  if (!p) return;
  const b = getBreed(p.breedId);
  $('pet-name').textContent = p.name;
  $('pet-sub').textContent = `${b.name}・${G.stageName(p)}・${G.ageDays(p)}日目`;
  $('pet-lv').textContent = p.level;
  $('exp-fill').style.width = (p.exp / G.expToNext(p.level) * 100) + '%';
  for (const s of G.STAT_INFO) {
    const v = p.stats[s.key];
    barRefs[s.key].fill.style.width = v + '%';
    barRefs[s.key].v.textContent = Math.round(v);
    barRefs[s.key].row.classList.toggle('low', v < 25 && s.key !== 'bond');
  }
  $('btn-vet').classList.toggle('hidden', p.stats.health >= 50);
  const sleepBtn = document.querySelector('[data-act="sleep"]');
  sleepBtn.innerHTML = p.sleeping ? '<span>☀️</span>おこす' : '<span>💤</span>ねる';
  sleepBtn.classList.toggle('on', p.sleeping);
}

// ================= ペットの動きを制御するコントローラー =================
class Cancelled extends Error {}
class Ctrl {
  constructor() {
    this.model = null; this.gen = 0; this.timers = []; this.move = null; this.busy = false;
    this.idleT = 2; this.heading = 0; this.targetHeading = 0;
  }
  get pos() { return this.model.root.position; }
  get scale() { return this.model.root.scale.x; }
  attach(model) { this.model = model; model.root.rotation.y = this.heading; }
  cancel() {
    this.gen++;
    for (const t of this.timers) t.rej(new Cancelled());
    this.timers = [];
    if (this.move && this.move.rej) this.move.rej(new Cancelled());
    this.move = null;
    if (this.model) this.model.walkSpeed = 0;
    this.busy = false;
  }
  async run(fn, opt = {}) {
    this.cancel();
    const g = this.gen;
    this.busy = true;
    try { await fn(g); }
    catch (e) { if (!(e instanceof Cancelled)) console.error(e); }
    finally {
      if (g === this.gen) {
        this.busy = false;
        this.move = null;
        if (this.model) {
          this.model.walkSpeed = 0;
          this.model.tongueOut = false;
          if (!opt.keepPose && !curPet()?.sleeping) this.model.setPose('stand');
        }
        this.idleT = rnd(2, 5);
      }
    }
  }
  wait(sec) {
    const p = new Promise((res, rej) => this.timers.push({ t: sec, res, rej, g: this.gen }));
    p.catch(() => {});
    return p;
  }
  walkTo(target, run = false) {
    if (this.move && this.move.res) this.move.res(false);
    const p = new Promise((res, rej) => {
      this.move = { target: this.clampTarget(target.clone()), run, res, rej };
    });
    p.catch(() => {});
    return p;
  }
  setTarget(target, run = false) {
    if (this.move && this.move.res) this.move.res(false);
    this.move = { target: this.clampTarget(target.clone()), run };
  }
  stop() {
    if (this.move && this.move.res) this.move.res(false);
    this.move = null;
    this.model.walkSpeed = 0;
  }
  faceTo(p) { this.targetHeading = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }
  clampTarget(t) {
    t.y = 0;
    if (mode === 'room') {
      const b = room.bounds;
      t.x = THREE.MathUtils.clamp(t.x, b.minX, b.maxX);
      t.z = THREE.MathUtils.clamp(t.z, b.minZ, b.maxZ);
      pushOut(t, ROOM_OBST);
    } else {
      const r = Math.hypot(t.x, t.z);
      if (r > park.bounds.radius) t.multiplyScalar(park.bounds.radius / r);
      pushOut(t, park.obstacles);
    }
    return t;
  }
  update(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.res(true); }
    }
    const m = this.model;
    if (!m) return;
    if (this.move) {
      const tg = this.move.target;
      const dx = tg.x - this.pos.x, dz = tg.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.06) {
        m.walkSpeed = 0;
        const res = this.move.res;
        this.move = null;
        if (res) res(true);
      } else {
        const base = 0.75 + 0.85 * this.scale;
        const speed = base * (this.move.run ? 2.3 : 1);
        const step = Math.min(dist, speed * dt);
        this.pos.x += dx / dist * step;
        this.pos.z += dz / dist * step;
        this.pos.y = 0;
        this.targetHeading = Math.atan2(dx, dz);
        m.walkSpeed = this.move.run ? 1.7 : 0.75;
        if (mode === 'park') pushOut(this.pos, park.obstacles);
        else pushOut(this.pos, ROOM_OBST);
      }
    }
    this.heading = angleLerp(this.heading, this.targetHeading, 1 - Math.exp(-dt * 9));
    m.root.rotation.y = this.heading;
  }
}
function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}
function pushOut(p, obst) {
  for (const [x, z, r] of obst) {
    const dx = p.x - x, dz = p.z - z;
    const d = Math.hypot(dx, dz);
    if (d < r) {
      if (d < 1e-4) { p.x = x + r; continue; }
      p.x = x + dx / d * r;
      p.z = z + dz / d * r;
    }
  }
}

const ctrl = new Ctrl();
let model = null;

function spawnModel() {
  const p = curPet();
  const old = model;
  const pos = old ? old.root.position.clone() : room.spots.center.clone();
  if (old) {
    old.root.parent?.remove(old.root);
    old.dispose();
  }
  ctrl.cancel();
  if (!p) { model = null; return; }
  model = new PetModel(getBreed(p.breedId), { equip: p.equip, growth: G.growthFor(p.level), seedKey: p.id });
  model.root.position.copy(pos);
  scene.add(model.root);
  ctrl.attach(model);
  if (p.sleeping) {
    model.root.position.copy(room.spots.bed);
    model.setPose('sleep');
    model.cur = structuredClone(model.target);
  }
  rebuildPoops();
}

// ================= うんち =================
const poopGroup = new THREE.Group();
room.scene.add(poopGroup);
function rebuildPoops() {
  while (poopGroup.children.length) poopGroup.remove(poopGroup.children[0]);
  const p = curPet();
  if (!p) return;
  for (const pp of p.poops) {
    const m = makePoop();
    m.position.set(pp.x, 0, pp.z);
    m.userData.ref = pp;
    poopGroup.add(m);
  }
}

// ================= 補助 =================
function frontSpot(dist = 1.4) {
  const t = controls.target.clone().setY(0);
  const d = camera.position.clone().setY(0).sub(t).normalize();
  return ctrl.clampTarget(t.addScaledVector(d, dist));
}
function faceCam() { ctrl.faceTo(camera.position); }
function petTop() {
  const v = model.headWorldPos();
  v.y += 0.35 * ctrl.scale + 0.15;
  return v;
}
function isSmallDog() { const b = getBreed(curPet().breedId); return b.species === 'dog' && b.size < 0.8; }
function speak() { voice(curPet().species === 'cat', isSmallDog()); }
function likeFactor(item) {
  const p = curPet();
  if (!item.like) return 1;
  return item.like === p.species ? 1.5 : 0.7;
}
function gainExp(n) {
  const p = curPet();
  const prevStage = G.stageName(p);
  if (G.addExp(p, n)) {
    sfx.levelup();
    S.coins += 30;
    toast(`⭐ レベルアップ！ Lv${p.level}（ごほうび 🪙30）`, 'good');
    model.setGrowth(G.growthFor(p.level));
    emit('⭐', petTop(), 6);
    const st = G.stageName(p);
    if (st !== prevStage) setTimeout(() => toast(`🎉 ${p.name}は「${st}」に成長した！`, 'good'), 900);
  }
  refreshUI();
}

// 寝ていたら起こす・散歩中は不可など、行動前のチェック
function ready(allowSleep = false) {
  const p = curPet();
  if (!p || !model) return false;
  if (mode !== 'room' || playState) { toast('いまはできないよ'); return false; }
  if (p.sleeping && !allowSleep) wakeUp(true);
  return true;
}
function wakeUp(byUser) {
  const p = curPet();
  p.sleeping = false;
  model.root.position.y = 0;
  model.setPose('stand');
  room.setTimeOfDay(new Date().getHours(), false);
  if (byUser) {
    toast(p.stats.energy < 60 ? `${p.name}はまだねむそう…` : `${p.name}がおきたよ！`);
    if (p.stats.energy < 60) G.applyStats(p, { mood: -5 });
  } else {
    toast(`☀️ ${p.name}はすっきり目がさめた！`, 'good');
  }
  refreshUI();
}

// ================= パネル =================
function openPanel(title, html, bind) {
  $('panel-title').textContent = title;
  $('panel-body').innerHTML = html;
  $('panel').classList.remove('hidden');
  if (bind) bind($('panel-body'));
}
function closePanel() { $('panel').classList.add('hidden'); }
$('panel-close').onclick = () => { sfx.click(); closePanel(); };
$('panel').addEventListener('pointerdown', e => { if (e.target.id === 'panel') closePanel(); });

// ================= アクション: ごはん =================
function openFood() {
  const p = curPet();
  const items = Object.entries(G.FOODS).map(([id, f]) => {
    const n = S.inventory[id] || 0;
    const like = f.like === p.species;
    return `<div class="item ${like ? 'like' : ''}"><div class="big">${f.icon}</div><div class="nm">${f.name}</div>
      <div class="ds">おなか+${f.hunger} ${like ? '<span class="tag">大好物</span>' : ''}</div>
      <div>のこり ${n}こ</div>
      <button class="btn small primary" data-food="${id}" ${n ? '' : 'disabled'}>あげる</button></div>`;
  }).join('');
  openPanel('🥣 ごはんをあげる', `<div class="hint">ごはんはショップで買えます。おなかがいっぱいの時は食べません。</div><div class="grid">${items}</div>`, el => {
    el.querySelectorAll('[data-food]').forEach(b => b.onclick = () => feed(b.dataset.food));
  });
}
function feed(id) {
  if (!ready()) return;
  const p = curPet();
  const f = G.FOODS[id];
  closePanel();
  if (p.stats.hunger > 92) { toast(`${p.name}はおなかいっぱいみたい`); bubble('🙅'); return; }
  if ((S.inventory[id] || 0) <= 0) return;
  S.inventory[id]--;
  const food = room.bowl.userData.food;
  food.children.forEach(k => k.material.color.set(id === 'fishmeal' ? '#d9a07a' : id === 'premium' ? '#c0603a' : '#a0662e'));
  food.visible = true;
  sfx.pop();
  ctrl.run(async () => {
    await ctrl.walkTo(room.spots.bowl, true);
    ctrl.faceTo(room.bowl.position);
    await ctrl.wait(0.35);
    const like = likeFactor(f);
    G.applyStats(p, { hunger: f.hunger, mood: f.mood * like, health: f.health || 0 });
    model.setPose('eat');
    for (let i = 0; i < 3; i++) { sfx.eat(); emit('✨', room.bowl.position.clone().setY(0.4), 1, { size: 0.2 }); await ctrl.wait(1.0); }
    food.visible = false;
    p.poopTimer = rnd(45, 100);
    gainExp(5);
    model.setPose('happy');
    model.wagAmp = 0.8;
    emit('💖', petTop(), 4);
    speak();
    toast(like > 1 ? `😋 ${f.name}は大好物！` : `😋 ${p.name}「おいしかった！」`, 'good');
    await ctrl.wait(1.3);
  });
}

// ================= アクション: おやつ =================
function openTreat() {
  const p = curPet();
  const items = Object.entries(G.TREATS).map(([id, f]) => {
    const n = S.inventory[id] || 0;
    const like = f.like === p.species;
    return `<div class="item ${like ? 'like' : ''}"><div class="big">${f.icon}</div><div class="nm">${f.name}</div>
      <div class="ds">きげん+${f.mood} なかよし+${f.bond} ${like ? '<span class="tag">大好き</span>' : ''}</div>
      <div>のこり ${n}こ</div>
      <button class="btn small primary" data-treat="${id}" ${n ? '' : 'disabled'}>あげる</button></div>`;
  }).join('');
  openPanel('🍪 おやつをあげる', `<div class="hint">おやつはごきげん・なかよし度がアップ！でも、あげすぎると健康に悪いので注意してね。</div><div class="grid">${items}</div>`, el => {
    el.querySelectorAll('[data-treat]').forEach(b => b.onclick = () => giveTreat(b.dataset.treat));
  });
}
function giveTreat(id) {
  if (!ready()) return;
  const p = curPet();
  const f = G.TREATS[id];
  closePanel();
  if ((S.inventory[id] || 0) <= 0) return;
  S.inventory[id]--;
  ctrl.run(async () => {
    await ctrl.walkTo(frontSpot(1.3), true);
    faceCam();
    await ctrl.wait(0.3);
    model.setPose(p.species === 'cat' ? 'sit' : 'beg');
    model.wagAmp = 0.9;
    const tp = petTop();
    emit(f.icon, tp, 1, { up: 0.05, life: 1.0, size: 0.4, spread: 0 });
    await ctrl.wait(1.0);
    sfx.eat();
    const like = likeFactor(f);
    G.applyStats(p, { hunger: f.hunger, mood: f.mood * like, bond: f.bond * like, health: f.health || 0 });
    const now = Date.now();
    p.treatLog = p.treatLog.filter(t => now - t < 10 * 60000);
    p.treatLog.push(now);
    model.setPose('happy');
    model.play('hop', 0.9);
    emit('💖', petTop(), 5);
    speak();
    gainExp(3);
    if (p.treatLog.length > 5) {
      G.applyStats(p, { health: -6 });
      toast('⚠️ おやつのあげすぎに注意！けんこうが下がったよ', 'bad');
    } else {
      toast(like > 1 ? `💕 ${f.name}が大好きみたい！` : `💕 ${p.name}はよろこんでいる！`, 'good');
    }
    await ctrl.wait(1.2);
  });
}

// ================= アクション: あそぶ =================
let playState = null; // { kind:'teaser', ... }
let ballAnim = null;
let ball = null;
function openPlay() {
  const p = curPet();
  const dog = p.species === 'dog';
  openPanel('🎾 いっしょにあそぶ', `<div class="grid">
    <div class="item ${dog ? 'like' : ''}"><div class="big">🎾</div><div class="nm">ボールなげ</div><div class="ds">投げたボールを取ってくるよ ${dog ? '<span class="tag">大好き</span>' : ''}</div><button class="btn small primary" data-play="ball">あそぶ</button></div>
    <div class="item ${!dog ? 'like' : ''}"><div class="big">🪶</div><div class="nm">猫じゃらし</div><div class="ds">${IS_TOUCH ? '指でなぞって' : 'マウスで動かして'}追いかけっこ ${!dog ? '<span class="tag">大好き</span>' : ''}</div><button class="btn small primary" data-play="teaser">あそぶ</button></div>
  </div>`, el => {
    el.querySelectorAll('[data-play]').forEach(b => b.onclick = () => { closePanel(); b.dataset.play === 'ball' ? playBall() : playTeaser(); });
  });
}
function tiredCheck(need = 10) {
  const p = curPet();
  if (p.stats.energy < need) { toast(`${p.name}はつかれているみたい…休ませてあげよう`); bubble('💤'); return false; }
  if (p.stats.hunger < 8) { toast(`${p.name}はおなかがペコペコみたい`); bubble('🍖'); return false; }
  return true;
}
function playBall() {
  if (!ready() || !tiredCheck(10)) return;
  const p = curPet();
  const dogLike = p.species === 'dog';
  ctrl.run(async () => {
    await ctrl.walkTo(frontSpot(1.0), true);
    faceCam();
    model.setPose(dogLike ? 'bow' : 'crouch');
    model.wagAmp = 0.9;
    await ctrl.wait(0.7);
    if (!ball) ball = makeBall();
    scene.add(ball);
    const from = camera.position.clone().lerp(controls.target, 0.55);
    from.y = 1.2;
    const land = ctrl.clampTarget(ctrl.pos.clone().add(new THREE.Vector3(rnd(-3, 3), 0, rnd(-3.5, -1.5))));
    ballAnim = { from, to: land, t: 0, dur: 1.1, h: 1.6 };
    sfx.throw();
    model.setPose('stand');
    await ctrl.wait(0.35);
    await ctrl.walkTo(land, true);
    model.setPose('eat');
    await ctrl.wait(0.35);
    ballAnim = null;
    // 口にくわえる
    model.headGroup.add(ball);
    const d = model.d;
    const b = getBreed(p.breedId);
    ball.position.set(0, -d.headR * 0.4, d.headR * 0.95 + (b.snout?.L || 0.05) * 0.9);
    const ws = model.root.scale.x * model.headGroup.scale.x;
    ball.scale.setScalar(0.9 / ws * Math.min(1, ws * 1.4));
    model.setPose('stand');
    await ctrl.walkTo(frontSpot(1.1), true);
    faceCam();
    await ctrl.wait(0.2);
    model.headGroup.remove(ball);
    scene.remove(ball);
    ball.scale.setScalar(1);
    model.setPose(dogLike ? 'sit' : 'happy');
    const k = dogLike ? 1.3 : 0.8;
    G.applyStats(p, { mood: 12 * k, energy: -8, hunger: -4, bond: 2 * k, clean: -2 });
    gainExp(8);
    emit('💖', petTop(), 5);
    speak();
    toast(dogLike ? `🎾 ${p.name}「もういっかい！」` : `🎾 ${p.name}はボールを持ってきてくれた！`, 'good');
    await ctrl.wait(1.2);
  });
}

let teaser = null;
const teaserGoal = new THREE.Vector3();
function playTeaser() {
  if (!ready() || !tiredCheck(10)) return;
  const p = curPet();
  const catLike = p.species === 'cat';
  if (!teaser) teaser = makeTeaser();
  scene.add(teaser);
  const start = frontSpot(1.6);
  teaser.position.copy(start);
  teaserGoal.copy(start);
  playState = { kind: 'teaser', time: 12, pounces: 0 };
  controls.enabled = false;
  $('play-hud').classList.remove('hidden');
  $('actions').classList.add('hidden');
  ctrl.run(async () => {
    while (playState && playState.time > 0) {
      const tp = teaser.position;
      const dist = Math.hypot(tp.x - ctrl.pos.x, tp.z - ctrl.pos.z);
      const reach = 0.55 + ctrl.scale * 0.45;
      if (dist > reach) {
        ctrl.setTarget(tp, dist > 1.8);
        model.setPose(dist < 2.2 ? 'crouch' : 'stand');
        await ctrl.wait(0.1);
      } else {
        ctrl.stop();
        ctrl.faceTo(tp);
        model.setPose('crouch');
        await ctrl.wait(rnd(0.25, 0.6));
        model.play('pounce', 0.5);
        model.setPose('stand');
        ctrl.setTarget(tp.clone(), true);
        await ctrl.wait(0.45);
        playState.pounces++;
        sfx.pop();
        emit('✨', tp.clone().setY(0.4), 3, { size: 0.22 });
        if (playState.pounces % 3 === 0 && catLike) sfx.meow();
        await ctrl.wait(0.4);
      }
    }
  });
}
function endTeaser() {
  const p = curPet();
  const n = playState.pounces;
  playState = null;
  controls.enabled = true;
  scene.remove(teaser);
  $('play-hud').classList.add('hidden');
  $('actions').classList.remove('hidden');
  const k = p.species === 'cat' ? 1.3 : 0.8;
  G.applyStats(p, { mood: (6 + n * 1.5) * k, energy: -6 - n * 0.6, hunger: -3, bond: (1 + n * 0.3) * k });
  gainExp(5 + n);
  ctrl.run(async () => {
    faceCam();
    model.setPose('happy');
    emit('💖', petTop(), 5);
    speak();
    toast(`🪶 ${n}回もジャンプした！ ${p.name}は満足そう`, 'good');
    await ctrl.wait(1.5);
  });
}

// ================= アクション: おふろ・ブラッシング =================
let bathtub = null;
function doBath() {
  if (!ready()) return;
  const p = curPet();
  const cat = p.species === 'cat';
  ctrl.run(async () => {
    await ctrl.walkTo(room.spots.center);
    faceCam();
    await ctrl.wait(0.3);
    const b = getBreed(p.breedId);
    bathtub = makeBathtub();
    const s = Math.max(0.55, ctrl.scale * (b.body.L + b.headR) * 0.8);
    bathtub.scale.set(s, Math.max(0.5, ctrl.scale * (b.legL + b.body.H * 0.4) * 1.25), s);
    bathtub.position.copy(ctrl.pos);
    scene.add(bathtub);
    model.setPose(cat ? 'sad' : 'sit');
    if (cat) { bubble('😾'); sfx.meow(); }
    for (let i = 0; i < 8; i++) {
      if (i % 3 === 0) sfx.splash();
      emit('🫧', ctrl.pos.clone().setY(0.6 * ctrl.scale + 0.3), 3, { spread: 0.5, size: 0.28, up: 0.6 });
      await ctrl.wait(0.45);
    }
    scene.remove(bathtub);
    bathtub = null;
    model.setPose('stand');
    model.play('shake', 1.1);
    sfx.splash();
    emit('💧', petTop(), 8, { spread: 0.6, size: 0.18, up: 1.6, grav: 4 });
    await ctrl.wait(1.2);
    G.applyStats(p, { clean: 100, mood: cat ? -12 : 4, bond: 2, health: 2 });
    gainExp(6);
    model.setPose(cat ? 'angry' : 'happy');
    emit('✨', petTop(), 5);
    toast(cat ? `🛁 ピカピカ！でも${p.name}はちょっとご不満…` : `🛁 ${p.name}はピカピカになった！`, 'good');
    await ctrl.wait(1.2);
  });
}
let brush = null, brushAnim = null;
function doBrush() {
  if (!ready()) return;
  const p = curPet();
  ctrl.run(async () => {
    await ctrl.walkTo(frontSpot(1.2));
    faceCam();
    await ctrl.wait(0.3);
    ctrl.targetHeading = ctrl.heading + Math.PI / 2;
    model.setPose(p.species === 'cat' ? 'down' : 'sit');
    await ctrl.wait(0.5);
    if (!brush) brush = makeBrush();
    scene.add(brush);
    brushAnim = { t: 0 };
    for (let i = 0; i < 5; i++) {
      sfx.brush();
      if (p.species === 'cat' && i % 2 === 0) sfx.purr();
      emit(i % 2 ? '✨' : '💗', petTop(), 2, { size: 0.22 });
      await ctrl.wait(0.8);
    }
    scene.remove(brush);
    brushAnim = null;
    G.applyStats(p, { clean: 22, mood: 10, bond: 3 });
    gainExp(5);
    model.setPose('happy');
    emit('💖', petTop(), 4);
    toast(`🪮 ${p.name}の毛並みがつやつやになった！`, 'good');
    await ctrl.wait(1.2);
  });
}

// ================= アクション: ねる =================
function toggleSleep() {
  const p = curPet();
  if (!p || mode !== 'room' || playState) return;
  if (p.sleeping) { ctrl.cancel(); wakeUp(true); return; }
  if (p.stats.energy > 85) { toast(`${p.name}はまだ眠くないみたい`); bubble('🎵'); return; }
  goToSleep();
}
function goToSleep() {
  const p = curPet();
  ctrl.run(async () => {
    await ctrl.walkTo(room.spots.bed);
    model.root.position.y = 0.12;
    model.setPose('sleep');
    p.sleeping = true;
    room.setTimeOfDay(new Date().getHours(), true);
    toast(`💤 ${p.name}はおやすみ中…（げんきが回復するよ）`);
    refreshUI();
  }, { keepPose: true });
}

// ================= アクション: 芸 =================
const trickCooldown = {};
function openTricks() {
  const p = curPet();
  const list = G.tricksFor(p.species);
  const rows = list.map(t => {
    const prog = Math.min(100, p.tricks[t.id] || 0);
    const learned = prog >= 100;
    const reqOk = !t.req || (p.tricks[t.req] || 0) >= 100;
    const lvOk = p.level >= t.lv;
    let right;
    if (!lvOk) right = `<span class="lock">🔒 Lv${t.lv}で解放</span>`;
    else if (!reqOk) right = `<span class="lock">🔒「${G.trickName(G.TRICKS.find(x => x.id === t.req), p.species)}」を先に</span>`;
    else if (learned) right = `<button class="btn small primary" data-show="${t.id}">見せて！</button>`;
    else right = `<button class="btn small" data-train="${t.id}">れんしゅう</button>`;
    return `<div class="trick-row ${learned ? 'learned' : ''}"><span class="nm">${learned ? '🏅' : '📘'} ${G.trickName(t, p.species)}</span>
      <div class="prog"><div style="width:${prog}%"></div></div>${right}</div>`;
  }).join('');
  openPanel('🎓 芸をおぼえよう', `<div class="hint">れんしゅうを重ねると芸を覚えます。なかよし度・ごきげんが高いほど成功しやすいよ。<br>覚えた芸は「見せて！」で披露するとコインがもらえます。${p.species === 'cat' ? '<br>🐱 ねこはマイペースなので、犬より覚えるのに時間がかかります。' : ''}</div>${rows}`, el => {
    el.querySelectorAll('[data-train]').forEach(b => b.onclick = () => trainTrick(b.dataset.train, false));
    el.querySelectorAll('[data-show]').forEach(b => b.onclick = () => trainTrick(b.dataset.show, true));
  });
}
async function performTrick(t) {
  if (t.pose) {
    model.setPose(t.pose);
    if (t.pose === 'playdead') { model.play('shake', 0.3); }
    await ctrl.wait(1.8);
  } else if (t.anim === 'spin') {
    model.play('spin', 1.1);
    model.walkSpeed = 0.9;
    await ctrl.wait(1.15);
    model.walkSpeed = 0;
    model.setPose('happy');
    await ctrl.wait(0.6);
  } else if (t.anim === 'jump') {
    model.setPose('crouch');
    await ctrl.wait(0.35);
    model.setPose('stand');
    model.play('jump', 0.75);
    await ctrl.wait(0.9);
  } else if (t.anim === 'roll') {
    model.setPose('down');
    await ctrl.wait(0.6);
    model.play('roll', 1.3);
    await ctrl.wait(1.4);
    await ctrl.wait(0.4);
  }
}
function trainTrick(id, show) {
  if (!ready()) return;
  const p = curPet();
  const t = G.TRICKS.find(x => x.id === id);
  closePanel();
  if (!tiredCheck(6)) return;
  const name = G.trickName(t, p.species);
  ctrl.run(async () => {
    await ctrl.walkTo(frontSpot(1.3), true);
    faceCam();
    await ctrl.wait(0.4);
    model.setPose('stand');
    bubble(`「${name}！」`, 1.3, true);
    await ctrl.wait(0.9);
    const prog = p.tricks[id] || 0;
    const learned = prog >= 100;
    const s = p.stats;
    let chance = learned ? 0.95
      : 0.22 + s.bond / 220 + s.mood / 450 + prog / 260 - (t.diff - 1) * 0.1;
    if (s.hunger < 25 || s.energy < 20) chance -= 0.15;
    if (p.species === 'cat' && !learned) chance *= 0.8;
    chance = THREE.MathUtils.clamp(chance, 0.08, 0.95);
    G.applyStats(p, { energy: -3, hunger: -1 });
    if (Math.random() < chance) {
      await performTrick(t);
      sfx.success();
      emit('⭐', petTop(), 4);
      if (!learned) {
        const gain = Math.round(rnd(14, 24) / Math.sqrt(t.diff) * (1 + s.bond / 150) * (p.species === 'cat' ? 0.8 : 1));
        p.tricks[id] = Math.min(100, prog + gain);
        G.applyStats(p, { mood: 3, bond: 2 });
        gainExp(6);
        if (p.tricks[id] >= 100) {
          sfx.levelup();
          S.coins += 20;
          toast(`🏅 「${name}」を覚えた！（ごほうび 🪙20）`, 'good');
        } else {
          toast(`👏 できた！えらい！（習得度 ${p.tricks[id]}%）`, 'good');
        }
      } else {
        const now = Date.now();
        let msg = `👏 じょうずな「${name}」！`;
        if (!trickCooldown[id] || now - trickCooldown[id] > 20000) {
          trickCooldown[id] = now;
          S.coins += 5;
          sfx.coin();
          msg += '（🪙5）';
        }
        G.applyStats(p, { mood: 4, bond: 1 });
        gainExp(3);
        toast(msg, 'good');
      }
      model.setPose('happy');
      model.wagAmp = 1;
      speak();
      emit('💖', petTop(), 3);
      await ctrl.wait(1.0);
    } else {
      sfx.fail();
      const r = Math.random();
      if (r < 0.5) { model.setPose('tilt'); bubble('❓'); }
      else if (r < 0.8 && t.id !== 'sit') { model.setPose('sit'); bubble('❔'); }
      else { model.setPose('down'); bubble('💭'); }
      if (p.species === 'cat' && Math.random() < 0.4) toast(`😼 ${p.name}は知らんぷり…`);
      else toast('まだよくわからないみたい… もういちど！');
      gainExp(2);
      await ctrl.wait(1.6);
    }
    refreshUI();
  });
}

// ================= ショップ =================
let shopTab = 'food';
function openShop() {
  const p = curPet();
  const tabs = [['food', '🥣 ごはん'], ['treat', '🍪 おやつ'], ['acc', '🎀 アクセサリー']];
  let items = '';
  if (shopTab === 'food' || shopTab === 'treat') {
    const src = shopTab === 'food' ? G.FOODS : G.TREATS;
    items = Object.entries(src).map(([id, f]) => `<div class="item ${f.like === p.species ? 'like' : ''}"><div class="big">${f.icon}</div><div class="nm">${f.name}</div>
      <div class="ds">${shopTab === 'food' ? `おなか+${f.hunger}` : `きげん+${f.mood}`} ${f.like ? `<span class="tag">${f.like === 'dog' ? '犬' : '猫'}が大好き</span>` : ''}</div>
      <div>もっている: ${S.inventory[id] || 0}</div>
      <button class="btn small primary" data-buy="${id}" ${S.coins >= f.price ? '' : 'disabled'}>🪙${f.price} で買う</button></div>`).join('');
  } else {
    items = Object.entries(ACCESSORIES).filter(([, a]) => a.price > 0).map(([id, a]) => {
      const owned = S.owned.includes(id);
      return `<div class="item"><div class="big">${accIcon(id)}</div><div class="nm">${a.name}</div>
      <div class="ds">${{ neck: 'くび', head: 'あたま', face: 'かお' }[a.slot]}</div>
      ${owned ? '<button class="btn small" disabled>もっている</button>' : `<button class="btn small primary" data-buyacc="${id}" ${S.coins >= a.price ? '' : 'disabled'}>🪙${a.price} で買う</button>`}</div>`;
    }).join('');
  }
  openPanel('🛒 ショップ', `<div class="sub-tabs">${tabs.map(([k, l]) => `<button class="btn small ${k === shopTab ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}<span style="margin-left:auto;font-weight:800">🪙 ${S.coins}</span></div>
    <div class="hint">コインはおさんぽで拾ったり、芸を見せたり、レベルアップでもらえます。毎日ログインボーナスもあるよ！</div><div class="grid">${items}</div>`, el => {
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { shopTab = b.dataset.tab; sfx.click(); openShop(); });
    el.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
      const id = b.dataset.buy;
      const f = G.FOODS[id] || G.TREATS[id];
      if (S.coins < f.price) return;
      S.coins -= f.price;
      S.inventory[id] = (S.inventory[id] || 0) + 1;
      sfx.coin();
      refreshUI();
      openShop();
    });
    el.querySelectorAll('[data-buyacc]').forEach(b => b.onclick = () => {
      const id = b.dataset.buyacc;
      const a = ACCESSORIES[id];
      if (S.coins < a.price) return;
      S.coins -= a.price;
      S.owned.push(id);
      sfx.success();
      toast(`🎀 ${a.name}を買った！「きせかえ」でつけてみよう`, 'good');
      refreshUI();
      openShop();
    });
  });
}
function accIcon(id) {
  if (id.startsWith('collar') || id === 'bell_collar') return id === 'bell_collar' ? '🔔' : '⭕';
  if (id.startsWith('bandana')) return '🧣';
  if (id.startsWith('ribbon')) return '🎀';
  return { party_hat: '🥳', straw_hat: '👒', flower_crown: '🌸', crown: '👑', glasses: '👓', sunglasses: '🕶️' }[id] || '✨';
}

// ================= きせかえ =================
function openDress() {
  const p = curPet();
  const slots = [['neck', 'くび'], ['head', 'あたま'], ['face', 'かお']];
  const html = slots.map(([slot, label]) => {
    const owned = S.owned.filter(id => ACCESSORIES[id].slot === slot);
    const btns = owned.map(id => `<button class="btn small ${p.equip[slot] === id ? 'active primary' : ''}" data-eq="${slot}:${id}">${accIcon(id)} ${ACCESSORIES[id].name}</button>`).join(' ');
    return `<h3 style="margin:10px 0 6px">${label}</h3><div class="sub-tabs">${btns || '<span class="hint">まだ持っていません（ショップで買えるよ）</span>'} ${p.equip[slot] ? `<button class="btn small" data-uneq="${slot}">はずす</button>` : ''}</div>`;
  }).join('');
  openPanel('🎀 きせかえ', html, el => {
    el.querySelectorAll('[data-eq]').forEach(b => b.onclick = () => {
      const [slot, id] = b.dataset.eq.split(':');
      p.equip[slot] = id;
      sfx.pop();
      spawnModel();
      emit('✨', petTop(), 5);
      openDress();
    });
    el.querySelectorAll('[data-uneq]').forEach(b => b.onclick = () => {
      delete p.equip[b.dataset.uneq];
      sfx.pop();
      spawnModel();
      openDress();
    });
  });
}

// ================= しゃしん =================
function takePhoto() {
  sfx.camera();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  $('fade').classList.add('on');
  setTimeout(() => $('fade').classList.remove('on'), 120);
  const p = curPet();
  const b = getBreed(p.breedId);
  openPanel('📷 しゃしん', `<img class="photo-img" src="${url}" />
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <a class="btn primary" href="${url}" download="${p.name}_${b.name}.png" style="text-decoration:none">💾 画像を保存</a>
    </div><div class="hint" style="margin-top:8px">カメラはドラッグで回転・ホイール/ピンチでズームできます。好きなアングルで撮ってね。</div>`);
}

// ================= びょういん =================
function openVet() {
  const p = curPet();
  const cost = 60;
  const free = S.coins < cost;
  openPanel('🏥 どうぶつびょういん', `<div class="hint">${p.name}のけんこう: <b>${Math.round(p.stats.health)}</b><br>
    ごはん不足や不潔な状態が続くと、けんこうが下がります。お医者さんに診てもらいましょう。<br>
    ${free ? '💡 コインが足りないので、今回はやさしい先生が無料で診てくれるそうです。' : ''}</div>
    <button class="btn primary" id="vet-go">${free ? '無料で' : `🪙${cost}で`}診てもらう</button>`, el => {
    el.querySelector('#vet-go').onclick = async () => {
      closePanel();
      if (!free) S.coins -= cost;
      ctrl.cancel();
      await fade(true);
      G.applyStats(p, { health: 100, mood: -5 });
      refreshUI();
      await fade(false);
      sfx.success();
      toast(`🏥 ${p.name}はすっかり元気になった！`, 'good');
      emit('✨', petTop(), 6);
    };
  });
}

// ================= ペット一覧 =================
function openPets() {
  const rows = S.pets.map(p => {
    const b = getBreed(p.breedId);
    return `<div class="pet-row ${p.id === S.active ? 'active' : ''}"><span class="emo">${p.species === 'cat' ? '🐱' : '🐶'}</span>
      <div class="info"><b>${escapeHtml(p.name)}</b> <span class="tag">Lv${p.level}</span><div>${b.name}・${G.stageName(p)}・覚えた芸 ${Object.values(p.tricks).filter(v => v >= 100).length}こ</div></div>
      ${p.id === S.active ? '<span class="tag">いっしょにいる</span>' : `<button class="btn small primary" data-sw="${p.id}">よぶ</button>`}</div>`;
  }).join('');
  openPanel('🐾 うちの子たち', `${rows}<div style="display:flex;gap:8px;justify-content:space-between;margin-top:10px">
    <button class="btn" id="btn-new-pet" ${S.pets.length >= 6 ? 'disabled' : ''}>➕ 新しい子をむかえる（${S.pets.length}/6）</button>
    <button class="btn small" id="btn-reset">データを消す</button></div>`, el => {
    el.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => {
      if (mode !== 'room' || playState) { toast('おうちにいるときに切り替えられます'); return; }
      S.active = b.dataset.sw;
      closePanel();
      spawnModel();
      refreshUI();
      speak();
      emit('💖', petTop(), 4);
      toast(`${curPet().name}がきたよ！`);
    });
    el.querySelector('#btn-new-pet').onclick = () => {
      if (mode !== 'room' || playState) { toast('おうちにいるときにむかえられます'); return; }
      closePanel(); openAdopt(false);
    };
    el.querySelector('#btn-reset').onclick = () => {
      if (confirm('すべてのデータを消して最初からはじめますか？（元に戻せません）')) {
        G.resetSave();
        S = null;
        location.reload();
      }
    };
  });
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ================= おむかえ =================
const NAMES = {
  dog: ['ポチ', 'ハチ', 'ココ', 'モカ', 'マロン', 'チョコ', 'レオ', 'ソラ', 'コタロウ', 'ムギ', 'きなこ', 'あずき', 'ハナ', 'リク'],
  cat: ['タマ', 'ミケ', 'モモ', 'ルナ', 'ノア', 'ミルク', 'こむぎ', 'クロ', 'シロ', 'トラ', 'レオ', 'すず', 'ふく', 'ミント'],
};
let adoptState = null;
function openAdopt(first) {
  ctrl.cancel();
  adoptState = { species: 'dog', breed: DOG_BREEDS[0].id, preview: null, first };
  $('btn-adopt-cancel').classList.toggle('hidden', first);
  $('adopt').classList.remove('hidden');
  $('actions').classList.add('hidden');
  if (model) model.root.visible = false;
  poopGroup.visible = false;
  renderBreedList();
  selectBreed(adoptState.breed);
  $('adopt-name').value = pick(NAMES.dog);
  // 見本のペットにカメラを寄せる（パネルに隠れないよう少し右にずらす）
  const narrow = window.innerWidth < 720;
  controls.target.set(narrow ? -0.6 : 0.2, narrow ? 0.0 : 0.45, 0.8);
  camera.position.set(narrow ? -0.6 : 0.2, 1.4, 3.9);
}
function renderBreedList() {
  const list = adoptState.species === 'dog' ? DOG_BREEDS : CAT_BREEDS;
  document.querySelectorAll('#adopt .tab').forEach(t => t.classList.toggle('active', t.dataset.sp === adoptState.species));
  $('breed-list').innerHTML = list.map(b => `<button class="breed ${b.id === adoptState.breed ? 'sel' : ''}" data-b="${b.id}"><span class="sw" style="background:${b.colors.body};box-shadow:0 0 0 1px #ddd, inset -6px -6px 0 ${b.colors.head === b.colors.body ? b.colors.belly : b.colors.head}"></span>${b.name}</button>`).join('');
  $('breed-list').querySelectorAll('[data-b]').forEach(el => el.onclick = () => { sfx.click(); selectBreed(el.dataset.b); });
}
function selectBreed(id) {
  adoptState.breed = id;
  const b = getBreed(id);
  document.querySelectorAll('#breed-list .breed').forEach(el => el.classList.toggle('sel', el.dataset.b === id));
  $('breed-desc').innerHTML = `<b>${b.name}</b><br>${b.desc}`;
  if (adoptState.preview) { room.scene.remove(adoptState.preview.root); adoptState.preview.dispose(); }
  const pm = new PetModel(b, { growth: 0.8, equip: { neck: 'collar_red' }, seedKey: id });
  pm.root.position.set(-0.6, 0, 0.8);
  pm.setPose('stand');
  room.scene.add(pm.root);
  adoptState.preview = pm;
  adoptState.spinT = 0;
  voice(b.species === 'cat', b.species === 'dog' && b.size < 0.8);
}
document.querySelectorAll('#adopt .tab').forEach(t => t.onclick = () => {
  sfx.click();
  adoptState.species = t.dataset.sp;
  const list = adoptState.species === 'dog' ? DOG_BREEDS : CAT_BREEDS;
  adoptState.breed = list[0].id;
  $('adopt-name').value = pick(NAMES[adoptState.species]);
  renderBreedList();
  selectBreed(adoptState.breed);
});
$('btn-random-name').onclick = () => { sfx.click(); $('adopt-name').value = pick(NAMES[adoptState.species]); };
$('btn-adopt-cancel').onclick = () => closeAdopt();
$('btn-adopt').onclick = () => {
  const name = $('adopt-name').value.trim() || pick(NAMES[adoptState.species]);
  const p = G.newPet(adoptState.breed, name);
  S.pets.push(p);
  S.active = p.id;
  closeAdopt();
  model?.root && (model.root.position.copy(room.spots.center));
  spawnModel();
  model.root.position.copy(room.spots.center);
  ctrl.heading = 0;
  showGameUI();
  refreshUI();
  G.save(S);
  sfx.happy();
  setTimeout(() => speak(), 300);
  emit('💖', petTop(), 8);
  toast(`🎉 ${name}（${getBreed(p.breedId).name}）が家族になりました！`, 'good');
  setTimeout(() => toast(`ペットを${TAP}するとなでられるよ`), 1800);
};
function closeAdopt() {
  if (adoptState?.preview) { room.scene.remove(adoptState.preview.root); adoptState.preview.dispose(); }
  adoptState = null;
  controls.target.set(0, 0.6, 0);
  camera.position.set(0, 2.9, 5.9);
  $('adopt').classList.add('hidden');
  if (model) model.root.visible = true;
  poopGroup.visible = true;
  if (S.pets.length) $('actions').classList.remove('hidden');
}
function showGameUI() {
  $('status').classList.remove('hidden');
  $('topright').classList.remove('hidden');
  $('actions').classList.remove('hidden');
}

// ================= おさんぽ =================
let walk = null;
const NPC_NAMES = ['ポチ', 'モモ', 'ココ', 'ソラ', 'チョコ', 'ミルク', 'レオ', 'ハナ', 'タロウ', 'ルナ', 'きなこ', 'クッキー'];
function randomParkPoint(rMax = 13) {
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * rMax;
  const v = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  pushOut(v, park.obstacles);
  return v;
}
async function startWalk() {
  if (!ready()) return;
  const p = curPet();
  if (p.stats.energy < 15) { toast(`${p.name}はつかれていてお散歩できないみたい`); bubble('💤'); return; }
  ctrl.cancel();
  sfx.happy();
  speak();
  await fade(true);
  clearParticles();
  room.scene.remove(model.root);
  park.scene.add(model.root);
  mode = 'park';
  scene = park.scene;
  park.setTimeOfDay(new Date().getHours());
  model.root.position.set(0, 0, 8.9);
  ctrl.heading = ctrl.targetHeading = Math.PI;
  model.setPose('stand');
  controls.target.set(0, 0.6, 8.9);
  camera.position.set(0, 4.2, 15.5);
  controls.maxDistance = 14;

  walk = { time: 75, coins: 0, items: [], npcs: [], butterflies: [], lastInput: performance.now(), poop: null, poopAt: rnd(25, 50), pooped: false, met: 0, found: 0 };
  for (let i = 0; i < 14; i++) addWalkItem('coin');
  for (let i = 0; i < 4; i++) addWalkItem(p.species === 'cat' ? 'fish' : 'bone');
  const nNpc = 3;
  for (let i = 0; i < nNpc; i++) {
    const b = pick(ALL_BREEDS.filter(x => x.id !== p.breedId));
    const m = new PetModel(b, { growth: rnd(0.75, 1), equip: Math.random() < 0.6 ? { neck: pick(['collar_blue', 'collar_pink', 'bandana_red', 'bandana_blue']) } : {}, seedKey: b.id + i });
    m.root.position.copy(randomParkPoint(12));
    park.scene.add(m.root);
    walk.npcs.push({ model: m, breed: b, name: pick(NPC_NAMES), target: randomParkPoint(), wait: rnd(0, 2), heading: 0, met: false, metT: 0 });
  }
  for (let i = 0; i < 6; i++) {
    const bf = makeButterfly();
    bf.userData.c = randomParkPoint(12);
    bf.userData.ph = Math.random() * 10;
    park.scene.add(bf);
    walk.butterflies.push(bf);
  }
  $('actions').classList.add('hidden');
  $('walk-hud').classList.remove('hidden');
  $('walk-coins').textContent = 0;
  await fade(false);
  toast(`🌳 ${p.name}と公園にやってきた！`, 'good');
}
function addWalkItem(kind) {
  const m = kind === 'coin' ? makeCoin() : kind === 'bone' ? makeBone() : makeFish();
  const pos = randomParkPoint(13);
  m.position.x = pos.x; m.position.z = pos.z;
  m.userData.kind = kind;
  m.userData.ph = Math.random() * 6;
  park.scene.add(m);
  walk.items.push(m);
}
async function endWalk() {
  if (!walk) return;
  const p = curPet();
  const w = walk;
  walk = null;
  ctrl.cancel();
  await fade(true);
  clearParticles();
  for (const it of w.items) park.scene.remove(it);
  for (const n of w.npcs) { park.scene.remove(n.model.root); n.model.dispose(); }
  for (const bf of w.butterflies) park.scene.remove(bf);
  if (w.poop) park.scene.remove(w.poop);
  park.scene.remove(model.root);
  room.scene.add(model.root);
  mode = 'room';
  scene = room.scene;
  model.root.position.set(0.3, 0, 1.6);
  ctrl.heading = ctrl.targetHeading = 0;
  controls.target.set(0, 0.6, 0);
  camera.position.set(0, 2.9, 5.9);
  controls.maxDistance = 11;
  const spent = 75 - Math.max(0, w.time);
  const k = Math.min(1, spent / 60);
  G.applyStats(p, { energy: -20 * k, hunger: -12 * k, clean: -12 * k, mood: 10 + 15 * k, health: 6 * k, bond: 2 + 4 * k });
  p.walks = (p.walks || 0) + 1;
  S.coins += w.coins;
  $('walk-hud').classList.add('hidden');
  $('actions').classList.remove('hidden');
  room.setTimeOfDay(new Date().getHours(), false);
  gainExp(Math.round(8 + 20 * k));
  refreshUI();
  await fade(false);
  toast(`🏠 ただいま！ コイン🪙${w.coins}枚 / おともだち${w.met}匹`, 'good');
  if (p.stats.clean < 40) setTimeout(() => toast('🛁 足がよごれちゃった。おふろに入れてあげよう'), 1500);
  speak();
  emit('💖', petTop(), 4);
}
function updateWalk(dt) {
  const w = walk;
  const p = curPet();
  w.time -= dt;
  $('walk-time').textContent = Math.max(0, Math.ceil(w.time));
  if (w.time <= 0) { endWalk(); return; }

  // キーボード操作
  const kx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const kz = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  if (kx || kz) {
    if (ctrl.busy) ctrl.cancel();
    const fwd = controls.target.clone().sub(camera.position).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const dir = fwd.multiplyScalar(-kz).add(right.multiplyScalar(kx)).normalize();
    ctrl.setTarget(ctrl.pos.clone().addScaledVector(dir, 1.2), keys.has('shift'));
    w.lastInput = performance.now();
  } else if (!ctrl.busy && ctrl.move && !ctrl.move.res) {
    // キーを離したら止まる
    if (performance.now() - w.lastInput > 120) ctrl.stop();
  }

  // アイテム
  const reach = 0.45 + ctrl.scale * 0.4;
  for (let i = w.items.length - 1; i >= 0; i--) {
    const it = w.items[i];
    it.userData.ph += dt * 3;
    it.rotation.y += dt * 2.5;
    it.position.y = 0.4 + Math.sin(it.userData.ph) * 0.08;
    if (Math.hypot(it.position.x - ctrl.pos.x, it.position.z - ctrl.pos.z) < reach) {
      park.scene.remove(it);
      w.items.splice(i, 1);
      const kind = it.userData.kind;
      if (kind === 'coin') {
        w.coins += 5;
        sfx.coin();
        emit('🪙', it.position.clone(), 2, { size: 0.25 });
        $('walk-coins').textContent = w.coins;
      } else {
        const id = kind === 'bone' ? 'cookie' : 'paste';
        S.inventory[id] = (S.inventory[id] || 0) + 1;
        sfx.success();
        emit('✨', it.position.clone(), 4);
        toast(`🎁 ${G.TREATS[id].name}を見つけた！`, 'good');
      }
      if (w.items.length < 6) addWalkItem('coin');
    }
  }

  // ほっておくと自分で探検する
  if (!ctrl.busy && !ctrl.move && performance.now() - w.lastInput > 3500 && w.items.length) {
    let best = null, bd = 1e9;
    for (const it of w.items) {
      const d = Math.hypot(it.position.x - ctrl.pos.x, it.position.z - ctrl.pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    if (best) {
      const target = best.position.clone().setY(0);
      ctrl.run(async () => {
        if (Math.random() < 0.4) { model.setPose('eat'); bubble('👃'); await ctrl.wait(1.0); model.setPose('stand'); }
        await ctrl.walkTo(target);
        await ctrl.wait(0.4);
      });
    }
  }

  // おともだち
  for (const n of w.npcs) {
    const m = n.model;
    const pos = m.root.position;
    const dPet = Math.hypot(pos.x - ctrl.pos.x, pos.z - ctrl.pos.z);
    if (!n.met && dPet < 1.3 + ctrl.scale * 0.5) {
      n.met = true;
      n.metT = 3;
      w.met++;
      m.setPose('happy');
      m.play('hop', 0.9);
      voice(n.breed.species === 'cat', n.breed.species === 'dog' && n.breed.size < 0.8);
      G.applyStats(p, { mood: 8, bond: 1 });
      w.coins += 3;
      $('walk-coins').textContent = w.coins;
      emit('💖', m.headWorldPos().add(new THREE.Vector3(0, 0.4, 0)), 4);
      emit('💖', petTop(), 3);
      toast(`🐾 ${n.breed.name}の${n.name}ちゃんとなかよくなった！`, 'good');
      if (!ctrl.busy) {
        ctrl.run(async () => {
          ctrl.faceTo(pos);
          model.setPose('happy');
          model.wagAmp = 1;
          await ctrl.wait(0.4);
          speak();
          await ctrl.wait(1.6);
        });
      }
    }
    if (n.metT > 0) {
      n.metT -= dt;
      n.heading = angleLerp(n.heading, Math.atan2(ctrl.pos.x - pos.x, ctrl.pos.z - pos.z), 1 - Math.exp(-dt * 6));
      m.walkSpeed = 0;
      m.wagAmp = 1;
      if (n.metT <= 0) m.setPose('stand');
    } else if (n.wait > 0) {
      n.wait -= dt;
      m.walkSpeed = 0;
    } else {
      const dx = n.target.x - pos.x, dz = n.target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.1) {
        n.wait = rnd(1, 4);
        n.target = randomParkPoint();
        m.setPose(Math.random() < 0.4 ? 'sit' : 'stand');
      } else {
        m.setPose('stand');
        const sp = (0.7 + 0.8 * m.root.scale.x) * dt;
        pos.x += dx / dist * Math.min(dist, sp);
        pos.z += dz / dist * Math.min(dist, sp);
        pushOut(pos, park.obstacles);
        n.heading = angleLerp(n.heading, Math.atan2(dx, dz), 1 - Math.exp(-dt * 6));
        m.walkSpeed = 0.75;
      }
    }
    m.root.rotation.y = n.heading;
    m.lookTarget = m.walkSpeed < 0.05 ? (n.metT > 0 ? model.headWorldPos() : camera.position) : null;
    m.update(dt);
  }

  // ちょうちょ
  for (const bf of w.butterflies) {
    const u = bf.userData;
    u.ph += dt;
    bf.position.set(u.c.x + Math.sin(u.ph * 0.6) * 2.5, 0.9 + Math.sin(u.ph * 1.7) * 0.4, u.c.z + Math.cos(u.ph * 0.45) * 2.5);
    bf.rotation.y = -u.ph * 0.6;
    const flap = Math.sin(u.ph * 22) * 0.9;
    u.wings[0].rotation.z = flap;
    u.wings[1].rotation.z = -flap;
  }

  // うんちタイム
  if (!w.pooped && 75 - w.time > w.poopAt && !ctrl.busy) {
    w.pooped = true;
    if (Math.random() < 0.7) {
      ctrl.run(async () => {
        ctrl.stop();
        model.setPose('crouch');
        bubble('💦');
        await ctrl.wait(1.4);
        const pp = makePoop();
        const back = new THREE.Vector3(-Math.sin(ctrl.heading), 0, -Math.cos(ctrl.heading)).multiplyScalar(0.45 * ctrl.scale + 0.15);
        pp.position.copy(ctrl.pos).add(back).setY(0);
        park.scene.add(pp);
        w.poop = pp;
        model.setPose('happy');
        toast(`💩 うんちをしたよ！${TAP}して拾ってあげよう（マナー）`);
        await ctrl.wait(0.8);
      });
    }
  }

  // カメラ追従
  followCamera(ctrl.pos, 1, dt);
}
function followCamera(pos, k, dt) {
  const desired = new THREE.Vector3(pos.x * k, 0.6, pos.z * k);
  const delta = desired.sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 3));
  controls.target.add(delta);
  camera.position.add(delta);
}

// ================= 部屋での自由行動 =================
function randomRoomPoint() {
  const b = room.bounds;
  const v = new THREE.Vector3(rnd(b.minX + 0.5, b.maxX - 0.5), 0, rnd(b.minZ + 0.8, 2.6));
  pushOut(v, ROOM_OBST);
  return v;
}
function idleAI(dt) {
  const p = curPet();
  if (!p || ctrl.busy || p.sleeping || adoptState || playState) return;
  ctrl.idleT -= dt;
  if (ctrl.idleT > 0) return;
  // 自動でうんち
  if (p.poopTimer >= 0 && p.poopTimer < 0.01) {
    p.poopTimer = -1;
    ctrl.run(async () => {
      await ctrl.walkTo(randomRoomPoint());
      model.setPose('crouch');
      bubble('💦');
      await ctrl.wait(1.5);
      const back = new THREE.Vector3(-Math.sin(ctrl.heading), 0, -Math.cos(ctrl.heading)).multiplyScalar(0.45 * ctrl.scale + 0.15);
      const pos = ctrl.pos.clone().add(back);
      const b = room.bounds;
      pos.x = THREE.MathUtils.clamp(pos.x, b.minX, b.maxX);
      pos.z = THREE.MathUtils.clamp(pos.z, b.minZ, b.maxZ);
      p.poops.push({ x: pos.x, z: pos.z });
      rebuildPoops();
      toast(`💩 うんちをしたみたい！${TAP}でおそうじしよう`);
      model.setPose('happy');
      await ctrl.wait(1);
    });
    return;
  }
  // 眠くなったら自分で寝る
  if (p.stats.energy < 18) {
    bubble('💤');
    goToSleep();
    return;
  }
  const r = Math.random();
  const sad = p.stats.mood < 25 || p.stats.health < 40;
  ctrl.run(async () => {
    if (sad) {
      model.setPose('sad');
      await ctrl.wait(rnd(3, 5));
    } else if (r < 0.4) {
      await ctrl.walkTo(randomRoomPoint());
      if (Math.random() < 0.4) { model.setPose('eat'); await ctrl.wait(rnd(1, 2)); }
    } else if (r < 0.6) {
      faceCam();
      model.setPose('sit');
      await ctrl.wait(rnd(3, 6));
    } else if (r < 0.72) {
      model.setPose('down');
      await ctrl.wait(rnd(4, 7));
    } else if (r < 0.82) {
      await ctrl.walkTo(room.spots.water);
      ctrl.faceTo(room.water.position);
      model.setPose('eat');
      await ctrl.wait(2);
    } else if (r < 0.9) {
      await ctrl.walkTo(frontSpot(1.5));
      faceCam();
      model.setPose('happy');
      model.wagAmp = 0.9;
      if (Math.random() < 0.5) speak();
      await ctrl.wait(2);
    } else {
      model.setPose('tilt');
      await ctrl.wait(1.5);
    }
  });
}

// ================= なでる =================
const petLog = [];
let lastPetT = 0;
function petPet() {
  const p = curPet();
  const now = performance.now();
  if (now - lastPetT < 350) return;
  lastPetT = now;
  if (p.sleeping) { emit('💗', petTop(), 1, { size: 0.2 }); bubble('💤 すやすや…', 1.5, true); return; }
  petLog.push(now);
  while (petLog.length && now - petLog[0] > 8000) petLog.shift();
  if (p.species === 'cat' && petLog.length > 7) {
    petLog.length = 0;
    G.applyStats(p, { mood: -5 });
    sfx.hiss();
    toast(`😾 さわりすぎて${p.name}はごきげんななめ…`, 'bad');
    ctrl.run(async () => { model.setPose('angry'); bubble('💢'); await ctrl.wait(1.6); });
    refreshUI();
    return;
  }
  G.applyStats(p, { mood: 3, bond: 0.8 });
  if (petLog.length % 3 === 0) gainExp(1);
  emit('💖', petTop(), 2, { size: 0.25 });
  model.wagAmp = 1;
  if (p.species === 'cat') sfx.purr();
  if (!ctrl.busy || !walk) {
    if (!ctrl.busy) {
      ctrl.run(async () => {
        faceCam();
        model.setPose('happy');
        if (Math.random() < 0.3) speak();
        await ctrl.wait(1.4);
      });
    }
  }
  refreshUI();
}

// ================= 入力 =================
const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0.005; // ひげ(Line)が当たり判定を奪わないように
const ndc = new THREE.Vector2();
let downPos = null;
const keys = new Set();
window.addEventListener('keydown', e => { if (e.target.tagName !== 'INPUT') keys.add(e.key.toLowerCase()); });
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

function setNdc(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
canvas.addEventListener('pointerdown', e => { downPos = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointermove', e => {
  if (playState?.kind === 'teaser') {
    setNdc(e);
    const hit = raycaster.intersectObject(room.floor)[0];
    if (hit) teaserGoal.copy(ctrl.clampTarget(hit.point.clone()));
  }
});
canvas.addEventListener('pointerup', e => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  const dt = performance.now() - downPos.t;
  downPos = null;
  if (moved > 8 || dt > 600) return;
  handleClick(e);
});
function handleClick(e) {
  if (!model || adoptState || !curPet()) return;
  setNdc(e);
  if (playState) return;
  // ペット
  if (raycaster.intersectObject(model.root, true).length) { petPet(); return; }
  if (mode === 'room') {
    const ph = raycaster.intersectObject(poopGroup, true)[0];
    if (ph) {
      let o = ph.object;
      while (o.parent && o.parent !== poopGroup) o = o.parent;
      const p = curPet();
      p.poops = p.poops.filter(x => x !== o.userData.ref);
      emit('✨', o.position.clone().setY(0.3), 4);
      sfx.pop();
      S.coins += 1;
      G.applyStats(p, { clean: 5, mood: 2 });
      rebuildPoops();
      toast('🧹 おそうじ完了！（🪙1）');
      refreshUI();
      return;
    }
    const hit = raycaster.intersectObject(room.floor)[0];
    if (hit && !curPet().sleeping) {
      // 「おいで」
      const target = hit.point.clone();
      emit('🐾', target.clone().setY(0.15), 1, { up: 0.2, size: 0.25, spread: 0 });
      ctrl.run(async () => {
        await ctrl.walkTo(target, ctrl.pos.distanceTo(target) > 3);
        faceCam();
        model.setPose('sit');
        await ctrl.wait(rnd(1.5, 3));
      });
    }
  } else if (mode === 'park' && walk) {
    if (walk.poop && raycaster.intersectObject(walk.poop, true).length) {
      park.scene.remove(walk.poop);
      emit('✨', walk.poop.position.clone().setY(0.3), 4);
      walk.poop = null;
      sfx.pop();
      G.applyStats(curPet(), { bond: 3 });
      toast('👍 マナーばっちり！なかよし度アップ', 'good');
      return;
    }
    const hit = raycaster.intersectObject(park.ground)[0];
    if (hit) {
      walk.lastInput = performance.now();
      const target = hit.point.clone();
      emit('🐾', target.clone().setY(0.15), 1, { up: 0.2, size: 0.3, spread: 0 });
      ctrl.run(async () => { await ctrl.walkTo(target, ctrl.pos.distanceTo(target) > 4); });
    }
  }
}

// アクションボタン
$('actions').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  sfx.click();
  const act = b.dataset.act;
  const p = curPet();
  if (!p) return;
  if (p.sleeping && !['sleep', 'shop', 'dress', 'photo'].includes(act)) {
    // 寝ている時はそのまま起こして行動
  }
  switch (act) {
    case 'food': openFood(); break;
    case 'treat': openTreat(); break;
    case 'play': if (ready()) openPlay(); break;
    case 'walk': startWalk(); break;
    case 'trick': openTricks(); break;
    case 'bath': doBath(); break;
    case 'brush': doBrush(); break;
    case 'sleep': toggleSleep(); break;
    case 'dress': openDress(); break;
    case 'shop': openShop(); break;
    case 'photo': takePhoto(); break;
    case 'vet': openVet(); break;
  }
});
$('btn-gohome').onclick = () => { sfx.click(); endWalk(); };
$('btn-pets').onclick = () => { sfx.click(); openPets(); };
$('btn-sound').onclick = () => { setMuted(!isMuted()); S.muted = isMuted(); refreshUI(); sfx.click(); };
$('btn-help').onclick = () => {
  sfx.click();
  openPanel('❓ あそびかた', `<div class="help">
    <h3>基本</h3><p>ペットのステータス（おなか・きげん・せいけつ・げんき・けんこう・なかよし）は時間とともに変化します。下のボタンでお世話をしてあげましょう。</p>
    <h3>操作</h3><p>${IS_TOUCH ? '👆 1本指でなぞってカメラ回転、2本指でピンチしてズーム。' : '🖱 ドラッグでカメラ回転、ホイール/ピンチでズーム。'}<br>🐾 ペットを${TAP} → なでる（ねこはさわりすぎると怒るかも）<br>🏠 床を${TAP} → 「おいで」でその場所に来ます<br>💩 うんちを${TAP} → おそうじ${IS_TOUCH ? '<br>📊 左上のステータスを' + TAP + 'すると、くわしい数値が見られます' : ''}</p>
    <h3>できること</h3><p>🥣ごはん / 🍪おやつ / 🎾ボールなげ・🪶猫じゃらし / 🌳おさんぽ（コインやおやつ拾い・おともだちとの出会い） / 🎓芸のトレーニング（11種類） / 🛁おふろ / 🪮ブラッシング / 💤おやすみ / 🎀きせかえ / 🛒ショップ / 📷しゃしん / 🏥びょういん / 🐾多頭飼い（最大6匹）</p>
    <h3>成長</h3><p>お世話で経験値がたまりレベルアップ。子犬・子猫 → わかもの → おとな と体が大きくなり、新しい芸も覚えられるようになります。</p>
    <h3>セーブ</h3><p>データはこのブラウザに自動保存されます。ゲームを閉じている間も少しずつお腹がすくので、ときどき会いに来てね。</p>
  </div>`);
};

// ================= メインループ =================
const clock = new THREE.Clock();
let tickAcc = 0, saveAcc = 0, needAcc = 0, zzzAcc = 0;
let lastHour = -1;
const tmpV = new THREE.Vector3();

function tick() {
  // 1秒ごとのステータス更新
  const minutes = 1 / 60;
  const active = curPet();
  for (const p of S.pets) {
    const wasSleeping = p.sleeping;
    G.decay(p, minutes);
    if (p === active && wasSleeping && !p.sleeping) wakeUp(false);
  }
  if (active && active.poopTimer > 0 && mode === 'room') {
    active.poopTimer = Math.max(0, active.poopTimer - 1);
    if (active.poopTimer === 0) active.poopTimer = 0.001;
  }
  const h = new Date().getHours();
  if (h !== lastHour) {
    lastHour = h;
    room.setTimeOfDay(h, !!active?.sleeping);
    park.setTimeOfDay(h);
  }
  refreshUI();
}

function needBubble() {
  const p = curPet();
  if (!p || ctrl.busy || walk || playState || adoptState) return;
  const s = p.stats;
  const needs = [];
  if (p.sleeping) return;
  if (s.health < 40) needs.push('🤒');
  if (s.hunger < 30) needs.push('🍖');
  if (s.energy < 25) needs.push('💤');
  if (s.clean < 30) needs.push('🛁');
  if (p.poops.length) needs.push('💩');
  if (s.mood < 30) needs.push('😢');
  if (needs.length) bubble(pick(needs), 2.5);
  else if (Math.random() < 0.25) bubble(pick(['🎵', '💕', '✨', '😊']), 1.8);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  if (S && S.pets.length) {
    tickAcc += dt;
    if (tickAcc >= 1) { tickAcc -= 1; tick(); }
    saveAcc += dt;
    if (saveAcc >= 10) { saveAcc = 0; G.save(S); }
    needAcc += dt;
    if (needAcc >= 9) { needAcc = 0; needBubble(); }
  }

  if (adoptState?.preview) {
    const pm = adoptState.preview;
    adoptState.spinT += dt;
    pm.root.rotation.y = Math.sin(adoptState.spinT * 0.6) * 0.9;
    pm.wagAmp = 0.6;
    pm.lookTarget = camera.position;
    if (Math.floor(adoptState.spinT / 4) !== Math.floor((adoptState.spinT - dt) / 4)) pm.setPose(pick(['sit', 'stand', 'happy', 'tilt', 'stand']));
    pm.update(dt);
  }

  if (model) {
    const p = curPet();
    ctrl.update(dt);
    // しっぽの振り方はきげん次第
    const baseWag = p.species === 'cat' ? 0.25 : 0.12 + (p.stats.mood / 100) * 0.45;
    model.wagAmp += (baseWag - model.wagAmp) * Math.min(1, dt * 0.8);
    model.lookTarget = model.walkSpeed < 0.05 && !p.sleeping ? camera.position : null;
    model.tongueOut = p.species === 'dog' && (model.walkSpeed > 1 || (model.poseName === 'happy') || (mode === 'park' && model.walkSpeed > 0.5));
    model.update(dt);

    if (mode === 'room' && !adoptState) {
      idleAI(dt);
      followCamera(new THREE.Vector3(ctrl.pos.x * 0.45, 0, ctrl.pos.z * 0.45), 1, dt * 0.5);
      if (p.sleeping) {
        zzzAcc += dt;
        if (zzzAcc > 1.6) {
          zzzAcc = 0;
          emit('💤', petTop(), 1, { up: 0.35, size: 0.3, spread: 0.05, life: 2 });
          if (Math.random() < 0.3) sfx.snore();
        }
      }
    }
    if (walk) updateWalk(dt);
    if (playState?.kind === 'teaser') {
      playState.time -= dt;
      $('play-time').textContent = Math.max(0, Math.ceil(playState.time));
      teaser.position.lerp(tmpV.copy(teaserGoal), 1 - Math.exp(-dt * 10));
      const fl = teaser.userData.fluff;
      fl.position.set(-0.55 + Math.sin(performance.now() / 120) * 0.04, 0.55 + Math.sin(performance.now() / 90) * 0.05, 0);
      if (playState.time <= 0) endTeaser();
    }
    if (ballAnim) {
      const a = ballAnim;
      a.t += dt;
      const u = Math.min(1, a.t / a.dur);
      ball.position.lerpVectors(a.from, a.to, u);
      ball.position.y = THREE.MathUtils.lerp(a.from.y, 0.13, u) + a.h * 4 * u * (1 - u);
      if (u >= 1) {
        const bt = a.t - a.dur;
        ball.position.y = 0.13 + Math.abs(Math.sin(bt * 8)) * 0.3 * Math.exp(-bt * 3);
      }
      ball.rotation.x += dt * 8;
    }
    if (brushAnim) {
      brushAnim.t += dt;
      const bp = model.bodyPivot.getWorldPosition(tmpV);
      const s = ctrl.scale;
      const d = model.d;
      const fwd = new THREE.Vector3(Math.sin(ctrl.heading), 0, Math.cos(ctrl.heading));
      brush.position.copy(bp).addScaledVector(fwd, Math.sin(brushAnim.t * 5) * d.L * 0.3 * s);
      brush.position.y = bp.y + (d.H * 0.5 + 0.08) * s + Math.abs(Math.cos(brushAnim.t * 5)) * 0.05;
      brush.rotation.y = ctrl.heading;
    }
  }

  updateParticles(dt);

  // ふきだしの位置
  if (bubbleT > 0 && model) {
    bubbleT -= dt;
    const v = petTop().project(camera);
    const b = $('bubble');
    b.style.left = ((v.x + 1) / 2 * window.innerWidth) + 'px';
    b.style.top = ((1 - v.y) / 2 * window.innerHeight - 6) + 'px';
    if (bubbleT <= 0) b.classList.add('hidden');
  } else if (bubbleT <= 0) {
    $('bubble').classList.add('hidden');
  }

  controls.update();
  renderer.render(scene, camera);
}

// ================= 起動 =================
function startup() {
  // オフライン中の経過
  const mins = (Date.now() - (S.lastTime || Date.now())) / 60000;
  if (S.pets.length && mins > 1) {
    for (const p of S.pets) G.decay(p, Math.min(mins, 600), true);
  }
  if (!S.active && S.pets.length) S.active = S.pets[0].id;
  room.setTimeOfDay(new Date().getHours(), !!curPet()?.sleeping);
  park.setTimeOfDay(new Date().getHours());
  if (S.pets.length) {
    spawnModel();
    refreshUI();
  }
  $('loading').classList.add('hidden');
  animate();
  return mins;
}
const offlineMins = startup();

$('btn-start').onclick = () => {
  sfx.happy();
  $('title').classList.add('hidden');
  if (!S.pets.length) {
    $('topright').classList.remove('hidden');
    openAdopt(true);
    refreshUI();
    return;
  }
  showGameUI();
  refreshUI();
  const p = curPet();
  if (S.lastDaily !== G.todayStr()) {
    S.lastDaily = G.todayStr();
    S.coins += 50;
    setTimeout(() => { sfx.coin(); toast('🎁 ログインボーナス！ 🪙50', 'good'); refreshUI(); }, 800);
  }
  if (offlineMins > 1) toast(`おかえりなさい！${p.name}が待っていたよ`);
  speak();
  emit('💖', petTop(), 4);
};
window.addEventListener('beforeunload', () => { if (S) G.save(S); });
document.addEventListener('visibilitychange', () => { if (document.hidden && S) G.save(S); });

// デバッグ用（ブラウザのコンソールから確認できるように）
window.__petbreed = {
  get S() { return S; }, get model() { return model; }, get adopt() { return adoptState; },
  camera, controls, ctrl, selectBreed: id => selectBreed(id), startWalk, endWalk, G, rebuildPoops,
};

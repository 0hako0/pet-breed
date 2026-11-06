import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DOG_BREEDS, CAT_BREEDS, ALL_BREEDS, getBreed } from './breeds.js';
import { PetModel, ACCESSORIES } from './petModel.js';
import { buildRoom, buildPark, makeBall, makeTeaser, makePoop, makeCoin, makeBone, makeFish, makeButterfly, makeBathtub, makeBrush, makeFrisbee } from './world.js';
import { FURNITURE, FURN_SLOTS, makeFurniture } from './furniture.js';
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
camera.position.set(0, 2.2, 4.9);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 2.2;
controls.maxDistance = 11;
controls.maxPolarAngle = 1.42;
controls.target.set(0, 0.5, 0);
controls.minDistance = 1.6;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const room = buildRoom();
const park = buildPark();
let mode = 'room';
let scene = room.scene;
const ROOM_OBST_BASE = [[3.8, 2.2, 0.85], [-4.6, 1.5, 0.55], [2.2, -5.2, 1.1]];
const ROOM_OBST = [...ROOM_OBST_BASE]; // 家具を置くと増える

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
// 歩くときには解除するポーズ（crouch=しのび足、happy/tilt は歩いても自然なので残す）
const STILL_POSES = new Set(['sit', 'paw', 'paw2', 'highfive', 'beg', 'down', 'sleep', 'playdead', 'bow', 'eat', 'angry']);
class Ctrl {
  constructor(pet = null) {
    this.model = null; this.gen = 0; this.timers = []; this.move = null; this.busy = false;
    this.idleT = 2; this.heading = 0; this.targetHeading = 0;
    this.pet = pet;      // null = いま選んでいる子（curPet）
    this.tween = null;   // 飛び乗り・飛び降りなどの決まった時間の移動
    this.perch = null;   // 家具の上にいる時の降り先
  }
  get petData() { return this.pet || curPet(); }
  get pos() { return this.model.root.position; }
  get scale() { return this.model.root.scale.x; }
  attach(model) { this.model = model; model.root.rotation.y = this.heading; }
  cancel() {
    this.gen++;
    for (const t of this.timers) t.rej(new Cancelled());
    this.timers = [];
    if (this.move && this.move.rej) this.move.rej(new Cancelled());
    this.move = null;
    if (this.tween && this.tween.rej) this.tween.rej(new Cancelled());
    this.tween = null;
    if (this.model) this.model.walkSpeed = 0;
    // 家具の上で中断されたら床に降ろす
    if (this.perch && this.model) { this.pos.copy(this.perch); this.pos.y = 0; }
    this.perch = null;
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
          if (!opt.keepPose && !this.petData?.sleeping) this.model.setPose('stand');
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
  // 決まった時間で target（y込み）へ移動。arc > 0 ならジャンプの弧を描く
  tweenTo(target, dur, arc = 0, walk = 0) {
    const p = new Promise((res, rej) => {
      this.tween = { from: this.pos.clone(), to: target.clone(), t: 0, dur, arc, walk, res, rej };
    });
    p.catch(() => {});
    return p;
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
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const u = Math.min(1, tw.t / tw.dur);
      const dx = tw.to.x - tw.from.x, dz = tw.to.z - tw.from.z;
      this.pos.x = tw.from.x + dx * u;
      this.pos.z = tw.from.z + dz * u;
      this.pos.y = THREE.MathUtils.lerp(tw.from.y, tw.to.y, u) + tw.arc * 4 * u * (1 - u);
      if (Math.hypot(dx, dz) > 0.05) this.targetHeading = Math.atan2(dx, dz);
      m.walkSpeed = tw.walk;
      if (u >= 1) { this.tween = null; m.walkSpeed = 0; tw.res(true); }
    } else if (this.move) {
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
        // おすわり・ふせなど止まったままのポーズなら立ち上がってから歩く
        if (STILL_POSES.has(m.poseName)) m.setPose('stand');
        if (mode === 'park') pushOut(this.pos, park.obstacles);
        else pushOut(this.pos, ROOM_OBST);
      }
    }
    this.heading = angleLerp(this.heading, this.targetHeading, 1 - Math.exp(-dt * 9));
    m.root.rotation.y = this.heading;
  }
  // 家具などへ飛び乗る（from: 立つ場所 → to: 乗る場所）
  async hopUp(from, to) {
    this.faceTo(to);
    this.model.setPose('crouch');
    await this.wait(0.3);
    this.model.setPose('stand');
    this.perch = from.clone();
    await this.tweenTo(to, 0.45, 0.35);
  }
  async hopDown(to) {
    this.model.setPose('stand');
    const tgt = to.clone(); tgt.y = 0;
    await this.tweenTo(tgt, 0.45, 0.3);
    this.perch = null;
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
  model.root.position.y = 0;
  if (p.sleeping) placeSleeping(ctrl);
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
  leaveBed(ctrl);
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
let panelOnClose = null; // パネルを閉じたときに一度だけ呼ぶ
function openPanel(title, html, bind) {
  panelOnClose = null;
  $('panel-title').textContent = title;
  $('panel-body').innerHTML = html;
  $('panel').classList.remove('hidden');
  if (bind) bind($('panel-body'));
}
function closePanel() {
  $('panel').classList.add('hidden');
  const f = panelOnClose;
  panelOnClose = null;
  if (f) f();
}
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
    <div class="item ${dog ? 'like' : ''}"><div class="big">🥏</div><div class="nm">フリスビー大会</div><div class="ds">公園で10投！キャッチ回数を競おう${p.frisbeeBest ? `<br>ベスト ${p.frisbeeBest}回` : ''}</div><button class="btn small primary" data-play="frisbee">公園へ</button></div>
  </div>`, el => {
    el.querySelectorAll('[data-play]').forEach(b => b.onclick = () => {
      closePanel();
      const k = b.dataset.play;
      if (k === 'ball') playBall(); else if (k === 'teaser') playTeaser(); else startFrisbee();
    });
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
// ブラシを背中の毛の上に置く: 首→しっぽへ毛並みにそってなで、持ち上げて戻す
// 体は bodyPivot 上の楕円体（半径 W/2, H/2, L/2、前後は z' = |z|^0.72 で引きのばし）
const _bp = { a: new THREE.Vector3(), b: new THREE.Vector3(), up: new THREE.Vector3(), q: new THREE.Quaternion(), sc: new THREE.Vector3(), m: new THREE.Matrix4(), x: new THREE.Vector3() };
function backPoint(u, out) {
  const d = model.d;
  const z0 = Math.pow(Math.abs(u), 1 / 0.72);
  const y = Math.sqrt(Math.max(0, 1 - z0 * z0)) * d.H / 2; // 体の表面（毛先はまばらなので、毛の根元までブラシの毛を入れる）
  return out.set(0, y, u * d.L / 2);
}
function placeBrushOnBack(t) {
  const piv = model.bodyPivot;
  piv.updateWorldMatrix(true, false);
  piv.getWorldQuaternion(_bp.q);
  piv.getWorldScale(_bp.sc);
  const ws = _bp.sc.x;
  const sitting = model.poseName === 'sit';
  const u0 = 0.38, u1 = sitting ? -0.32 : -0.5; // おすわり中はおしりの手前まで
  const T = 0.8, ph = (t % T) / T, down = 0.8;
  let u, lift;
  if (ph < down) { const k = ph / down; u = u0 + (u1 - u0) * (0.5 - Math.cos(k * Math.PI) / 2); lift = 0; }
  else { const k = (ph - down) / (1 - down); u = u1 + (u0 - u1) * k; lift = Math.sin(k * Math.PI); }
  // 表面の点と、毛並みの向き（前→後ろ）
  backPoint(u, _bp.a); piv.localToWorld(_bp.a);
  backPoint(u - 0.06, _bp.b); piv.localToWorld(_bp.b);
  const fwd = _bp.b.sub(_bp.a).normalize();           // しっぽ向き
  const up = _bp.up.set(0, 1, 0).applyQuaternion(_bp.q);
  up.addScaledVector(fwd, -up.dot(fwd)).normalize();   // 表面の法線（だいたい）
  const side = _bp.x.crossVectors(up, fwd).normalize();
  // ブラシの大きさは体の幅に合わせる（ブラシの頭は幅0.22）
  const k = THREE.MathUtils.clamp(model.d.W * ws * 0.5 / 0.22, 0.25, 0.9);
  brush.scale.setScalar(k);
  // ブラシのローカル: 毛は -y（先端 -0.095）、持ち手は +z（ななめ上に曲がっている）。
  // 頭は背中に平ら（y = 法線）、持ち手はしっぽ側へ（どこから見ても頭や体にささらない）
  const hz = fwd, hy = up;
  const hx = new THREE.Vector3().crossVectors(hy, hz);
  _bp.m.makeBasis(hx, hy, hz);
  brush.quaternion.setFromRotationMatrix(_bp.m);
  // 毛先が毛に少し沈むくらい（0.08）。戻るときは持ち上げる
  brush.position.copy(_bp.a).addScaledVector(up, (0.068 + lift * 0.035) * k); // 毛先は毛の中にうずめる
  // 少し傾けてなでる感じ
  brush.rotateX(ph < down ? 0.1 : -0.06);
}
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
    await sleepScript(ctrl);
    room.setTimeOfDay(new Date().getHours(), true);
    const where = { doghouse: '自分のおうちで', kotatsu: 'こたつで', cattower: 'タワーのてっぺんで' }[p.sleepAt?.id] || '';
    const snug = buddies.some(b => b.pet.sleeping) ? '（みんなでいっしょに）' : '';
    toast(`💤 ${p.name}は${where}おやすみ中…${snug}（げんきが回復するよ）`);
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
  const tabs = [['food', '🥣 ごはん'], ['treat', '🍪 おやつ'], ['acc', '🎀 アクセサリー'], ['furn', '🛋️ 家具']];
  let items = '';
  if (shopTab === 'food' || shopTab === 'treat') {
    const src = shopTab === 'food' ? G.FOODS : G.TREATS;
    items = Object.entries(src).map(([id, f]) => `<div class="item ${f.like === p.species ? 'like' : ''}"><div class="big">${f.icon}</div><div class="nm">${f.name}</div>
      <div class="ds">${shopTab === 'food' ? `おなか+${f.hunger}` : `きげん+${f.mood}`} ${f.like ? `<span class="tag">${f.like === 'dog' ? '犬' : '猫'}が大好き</span>` : ''}</div>
      <div>もっている: ${S.inventory[id] || 0}</div>
      <button class="btn small primary" data-buy="${id}" ${S.coins >= f.price ? '' : 'disabled'}>🪙${f.price} で買う</button></div>`).join('');
  } else if (shopTab === 'furn') {
    items = Object.entries(FURNITURE).map(([id, f]) => {
      const owned = S.furniture.owned.includes(id);
      return `<div class="item"><div class="big">${f.icon}</div><div class="nm">${f.name}</div><div class="ds">${f.desc}</div>
      ${owned ? '<button class="btn small" disabled>もっている</button>' : `<button class="btn small primary" data-buyfurn="${id}" ${S.coins >= f.price ? '' : 'disabled'}>🪙${f.price} で買う</button>`}</div>`;
    }).join('');
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
    el.querySelectorAll('[data-buyfurn]').forEach(b => b.onclick = () => {
      const id = b.dataset.buyfurn;
      const f = FURNITURE[id];
      if (S.coins < f.price || S.furniture.owned.includes(id)) return;
      S.coins -= f.price;
      S.furniture.owned.push(id);
      sfx.success();
      const used = Object.values(S.furniture.placed);
      const free = FURN_SLOTS.findIndex((_, i) => !used.includes(i));
      if (free >= 0 && mode === 'room') {
        S.furniture.placed[id] = free;
        applyFurnitureChange();
        toast(`${f.icon} ${f.name}を「${FURN_SLOTS[free].name}」に置いたよ！（🛋️ボタンで模様替え）`, 'good');
      } else toast(`${f.icon} ${f.name}を買った！🛋️ボタンの模様替えで置いてね`, 'good');
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
      // いまの位置のまま、お世話する子だけ入れかえる
      const posMap = {};
      if (model) posMap[S.active] = model.root.position.clone();
      for (const x of buddies) posMap[x.pet.id] = x.model.root.position.clone();
      const next = b.dataset.sw;
      const nextPos = posMap[next];
      for (const x of buddies) { x.ctrl.cancel(); }
      ctrl.cancel();
      spotUse.clear();
      S.active = next;
      closePanel();
      if (model && nextPos) model.root.position.copy(nextPos);
      spawnModel();
      spawnBuddies(posMap);
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
  setBuddiesVisible(false);
  renderBreedList();
  selectBreed(adoptState.breed);
  $('adopt-name').value = pick(NAMES.dog);
  // 見本のペットにカメラを寄せる（selectBreed の中で大きさに合わせて調整）
}
function renderBreedList() {
  const list = adoptState.species === 'dog' ? DOG_BREEDS : CAT_BREEDS;
  document.querySelectorAll('#adopt .tab').forEach(t => t.classList.toggle('active', t.dataset.sp === adoptState.species));
  $('breed-list').innerHTML = list.map(b => `<button class="breed ${b.id === adoptState.breed ? 'sel' : ''}" data-b="${b.id}"><span class="sw" style="background:${b.colors.body};box-shadow:0 0 0 1px #ddd, inset -6px -6px 0 ${b.colors.head === b.colors.body ? b.colors.belly : b.colors.head}"></span>${b.name}</button>`).join('');
  $('breed-list').querySelectorAll('[data-b]').forEach(el => el.onclick = () => { sfx.click(); selectBreed(el.dataset.b); });
}
// おむかえ画面: 犬種・猫種の大きさに合わせて、見本の子が「パネルに隠れていない所」のまん中に収まるようカメラを置く
function frameAdoptPreview(pm) {
  pm.root.updateMatrixWorld(true);
  const sc = pm.root.scale.x;
  const px = pm.root.position.x, pz = pm.root.position.z;
  const Hp = pm.headWorldPos().y + 0.45 * sc;          // 耳の先までのだいたいの高さ
  const len = (pm.breed.body.L + 0.55) * sc;           // 頭からおしりまでの長さ
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanH = tanV * camera.aspect;
  const narrow = window.innerWidth < 720;
  let D, tx, ty;
  if (narrow) {
    // 下 60% はパネル。上 40% の帯（画面中央から上へ 0.6 の位置が帯の中心）に入れる
    D = Math.max(Hp * 1.75 / (0.8 * tanV), len * 1.25 / (2 * tanH));
    tx = px;
    ty = Hp * 0.45 - 0.58 * tanV * D;
  } else {
    // 右側はパネル。左側の空いている所のまん中に
    const pf = Math.min(0.6, (Math.min(430, window.innerWidth * 0.96) + 28) / window.innerWidth);
    D = Math.max(Hp * 1.5 / (2 * tanV), len * 1.2 / (2 * tanH * (1 - pf)));
    tx = px + pf * tanH * D;
    ty = Hp / 2;
  }
  controls.target.set(tx, ty, pz);
  camera.position.set(tx, ty + D * 0.12, pz + D);
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
  frameAdoptPreview(pm);
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
  spawnBuddies();
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
  controls.target.set(model ? model.root.position.x : 0, 0.5, model ? model.root.position.z : 0);
  camera.position.copy(controls.target).add(new THREE.Vector3(0, 1.7, 4.4));
  $('adopt').classList.add('hidden');
  if (model) model.root.visible = true;
  poopGroup.visible = true;
  setBuddiesVisible(true);
  if (S.pets.length) $('actions').classList.remove('hidden');
}
function showGameUI() {
  $('status').classList.remove('hidden');
  $('topright').classList.remove('hidden');
  $('actions').classList.remove('hidden');
}

// ================= 季節と天気 =================
// ?season=winter&weather=snow のように URL で指定すると、その季節・天気を試せる
const urlQ = new URLSearchParams(location.search);
let season = 'spring', weather = 'sunny', weatherDay = '';
const SEASON_MSG = { spring: '公園の桜が満開！', summer: '緑がまぶしい季節', autumn: '公園は落ち葉でいっぱい', winter: '空気がつめたい季節' };
const WEATHER_MSG = {
  sunny: 'おさんぽ日和！', cloudy: 'すずしくてすごしやすいね',
  rain: '雨の日はおうちでゴロゴロ。おさんぽするとどろんこに…', snow: '雪がつもったよ！犬は大はしゃぎ、ねこはぬくぬくしたい',
};
function updateWeather(force = false) {
  const day = G.todayStr();
  if (!force && day === weatherDay) return false;
  weatherDay = day;
  season = G.SEASONS[urlQ.get('season')] ? urlQ.get('season') : G.seasonOf();
  weather = G.WEATHERS[urlQ.get('weather')] ? urlQ.get('weather') : G.weatherOf(new Date(), season);
  room.setWeather(weather, season);
  park.setWeather(weather, season);
  $('weather').textContent = G.SEASONS[season].icon + G.WEATHERS[weather].icon;
  $('weather').title = `${G.SEASONS[season].name}・${G.WEATHERS[weather].name}`;
  return true;
}
function weatherToast() {
  toast(`${G.SEASONS[season].icon}${G.SEASONS[season].name}・${G.WEATHERS[weather].icon}${G.WEATHERS[weather].name}：${weather === 'sunny' || weather === 'cloudy' ? SEASON_MSG[season] + ' ' : ''}${WEATHER_MSG[weather]}`);
}
const seasonIcon = () => ({ spring: '🌸', summer: '🌻', autumn: '🍂', winter: '⛄' })[season];

// 部屋での天気・季節ごとのしぐさ（なければ null）
function weatherIdle(c) {
  const p = c.petData, cat = p.species === 'cat', m = c.model;
  const atWindow = async (pose, ch, sec) => {
    await c.walkTo(room.windowSpot);
    c.faceTo(new THREE.Vector3(room.windowSpot.x, 0, -9));
    m.setPose(pose);
    say(c, ch);
    await c.wait(sec);
  };
  if (weather === 'rain' && Math.random() < 0.45) {
    if (Math.random() < 0.5) return async () => {
      m.setPose('down'); say(c, '☔');
      await c.wait(rnd(3, 5));
      m.play('roll', 1.3); say(c, '💤');
      await c.wait(rnd(3, 5));
    };
    return () => atWindow('sit', '🌧️', rnd(3, 5));
  }
  if (weather === 'snow' && Math.random() < 0.45) {
    if (!cat) return async () => { await atWindow('happy', '❄️', 1); m.play('hop', 0.9); m.wagAmp = 1; await c.wait(2); };
    const k = furn('kotatsu');
    if (k) return () => useFurniture(c, k);
    return async () => { m.setPose('sleep'); say(c, '🥶'); await c.wait(rnd(5, 8)); };
  }
  if (weather !== 'rain' && weather !== 'snow' && Math.random() < 0.15) {
    if (season === 'summer') return async () => { m.setPose('down'); say(c, '💦'); await c.wait(rnd(4, 6)); };
    return () => atWindow('sit', seasonIcon(), rnd(3, 5));
  }
  return null;
}
// ペットのふきだし（いまの子はふきだし、ほかの子は絵文字を出す）
function say(c, ch) {
  if (c !== ctrl && ch.length > 2) ch = '🎵';
  if (c === ctrl) bubble(ch);
  else if (c.model) emit(ch, c.model.headWorldPos().add(new THREE.Vector3(0, 0.35, 0)), 1, { up: 0.3, size: 0.32, spread: 0, life: 1.6 });
}

// ================= 家具（模様替え） =================
const furnGroup = new THREE.Group();
room.scene.add(furnGroup);
let placedFurn = [];        // { id, def, obj, slot, spots: [{ pos, heading, i }], approach, center }
const spotUse = new Map();  // 'sofa:0' などの使用中の場所 → Ctrl
const furn = id => placedFurn.find(f => f.id === id);
function rebuildFurniture() {
  for (const f of placedFurn) furnGroup.remove(f.obj);
  placedFurn = [];
  ROOM_OBST.length = 0;
  ROOM_OBST.push(...ROOM_OBST_BASE);
  for (const [id, si] of Object.entries(S.furniture.placed)) {
    const def = FURNITURE[id], slot = FURN_SLOTS[si];
    if (!def || !slot) continue;
    const obj = makeFurniture(id);
    obj.position.set(slot.x, 0, slot.z);
    obj.rotation.y = slot.ry;
    obj.updateMatrixWorld(true);
    furnGroup.add(obj);
    const center = obj.position.clone();
    const spots = def.spots.map((sp, i) => {
      const pos = obj.localToWorld(new THREE.Vector3(...sp.p));
      let heading = slot.ry;
      if (sp.face === 'in') heading = slot.ry + Math.PI;
      if (sp.face === 'side') heading = Math.atan2(pos.x - center.x, pos.z - center.z);
      return { pos, heading, i };
    });
    const approach = def.approach ? obj.localToWorld(new THREE.Vector3(...def.approach)) : null;
    placedFurn.push({ id, def, obj, slot: si, spots, approach, center });
    if (def.r > 0) ROOM_OBST.push([slot.x, slot.z, def.r]);
  }
}
const spotKey = (id, i) => id + ':' + i;
function takeSpot(id, i, c) {
  const k = spotKey(id, i);
  if (spotUse.has(k) && spotUse.get(k) !== c) return false;
  spotUse.set(k, c);
  return true;
}
function freeSpot(id, i, c) { const k = spotKey(id, i); if (spotUse.get(k) === c) spotUse.delete(k); }
function freeSpots(f, c, list = f.spots.map(s => s.i)) { return list.filter(i => !spotUse.has(spotKey(f.id, i)) || spotUse.get(spotKey(f.id, i)) === c); }

// 家具を使うしぐさ。使えたら true
async function useFurniture(c, f) {
  const p = c.petData, cat = p.species === 'cat', m = c.model;
  const winter = season === 'winter';
  const held = [];
  const hold = i => { if (takeSpot(f.id, i, c)) { held.push(i); return true; } return false; };
  const relax = async (sec, ch) => {
    if (ch) say(c, ch);
    await c.wait(sec);
    G.applyStats(p, { mood: 3, energy: 2 });
  };
  try {
    switch (f.id) {
      case 'cushion': {
        if (!hold(0)) return false;
        const sp = f.spots[0];
        await c.walkTo(sp.pos);
        c.targetHeading = sp.heading + rnd(-0.8, 0.8);
        await c.tweenTo(sp.pos, 0.2, 0.05);
        m.setPose(cat && Math.random() < 0.5 ? 'sleep' : 'down');
        if (cat) m.purr(4);
        await relax(rnd(5, 9), '😌');
        await c.tweenTo(sp.pos.clone().setY(0), 0.2);
        break;
      }
      case 'sofa': {
        const free = freeSpots(f, c);
        if (!free.length) return false;
        const sp = f.spots[pick(free)];
        hold(sp.i);
        await c.walkTo(f.approach);
        await c.hopUp(f.approach, sp.pos);
        c.targetHeading = sp.heading;
        m.setPose(cat && Math.random() < 0.5 ? 'sleep' : 'down');
        await relax(rnd(5, 9), '😌');
        await c.hopDown(f.approach);
        break;
      }
      case 'cattower': {
        await c.walkTo(f.approach);
        if (!cat) {
          c.faceTo(f.spots[1].pos);
          m.setPose(Math.random() < 0.5 ? 'tilt' : 'beg');
          say(c, '❓');
          await c.wait(2);
          break;
        }
        const top = hold(1);
        if (!top && !hold(0)) return false;
        await c.hopUp(f.approach, f.spots[0].pos);
        if (top) { await c.wait(0.4); await c.tweenTo(f.spots[1].pos, 0.45, 0.3); }
        c.targetHeading = f.spots[top ? 1 : 0].heading;
        m.setPose(Math.random() < 0.5 ? 'sit' : 'down');
        await relax(rnd(6, 10), top ? '😼' : '🎵');
        if (top) await c.tweenTo(f.spots[0].pos, 0.4, 0.2);
        await c.hopDown(f.approach);
        break;
      }
      case 'doghouse': {
        if (cat) {
          if (!hold(1)) return false;
          await c.walkTo(f.approach);
          await c.hopUp(f.approach, f.spots[1].pos);
          c.targetHeading = f.spots[1].heading;
          m.setPose('sit');
          await relax(rnd(5, 8), '😺');
          await c.hopDown(f.approach);
        } else {
          if (!hold(0)) return false;
          await c.walkTo(f.approach);
          c.perch = f.approach.clone();
          await c.tweenTo(f.spots[0].pos, 0.8, 0, 0.75);
          c.targetHeading = f.spots[0].heading;
          m.setPose('down');
          await relax(rnd(6, 10), '🏠');
          await c.tweenTo(f.approach.clone().setY(0), 0.8, 0, 0.75);
          c.perch = null;
        }
        break;
      }
      case 'fishbowl': {
        if (!hold(0)) return false;
        await c.walkTo(f.spots[0].pos);
        c.faceTo(f.center);
        if (cat) {
          m.setPose('sit'); await c.wait(1.5);
          m.setPose('paw'); say(c, '🐟'); await c.wait(0.8);
          m.setPose('crouch'); await c.wait(1.2);
          m.setPose('paw'); await c.wait(0.6);
          m.setPose('sit');
          await relax(1.5);
        } else {
          m.setPose('tilt'); say(c, '❓');
          await relax(2);
        }
        break;
      }
      case 'kotatsu': {
        const free = freeSpots(f, c);
        if (!free.length) return false;
        const sp = f.spots[pick(free)];
        hold(sp.i);
        await c.walkTo(sp.pos);
        c.targetHeading = sp.heading;
        m.setPose(cat || Math.random() < 0.3 ? 'sleep' : 'down');
        say(c, winter ? '♨️' : '😌');
        await c.wait(winter ? rnd(8, 14) : rnd(4, 7));
        G.applyStats(p, { mood: winter ? 6 : 3, energy: 4 });
        break;
      }
      default: return false;
    }
  } finally {
    for (const i of held) freeSpot(f.id, i, c);
  }
  return true;
}
// その子が好きな家具を選ぶ
function pickFurnitureFor(p) {
  const cat = p.species === 'cat', winter = season === 'winter';
  const w = cat
    ? { cattower: 3, kotatsu: winter ? 5 : 2, cushion: 2, sofa: 2, fishbowl: 3, doghouse: 1 }
    : { doghouse: 3, sofa: 2, cushion: 2, kotatsu: winter ? 3 : 1, fishbowl: 1, cattower: 1 };
  const list = placedFurn.filter(f => w[f.id]);
  if (!list.length) return null;
  let r = Math.random() * list.reduce((a, f) => a + w[f.id], 0);
  for (const f of list) { r -= w[f.id]; if (r <= 0) return f; }
  return list[0];
}

// ----- ねる場所（ベッド2か所・いぬごや・こたつ・キャットタワー） -----
// ベッドは1つに1匹（2匹を同じベッドに入れると体が重なるため）
const BED_SPOTS = [
  { pos: room.spots.bed.clone(), heading: 0.9 },
  { pos: room.spots.bed2.clone(), heading: -0.6 },
];
// ベッドがいっぱいのときの床の寝場所: ほかの寝ている子・ベッドと重ならない場所をさがす
function floorSleepSpot(c) {
  const taken = [...BED_SPOTS.map(b => b.pos)];
  for (const o of [ctrl, ...buddies.map(b => b.ctrl)]) {
    if (o !== c && o.model && o.petData?.sleeping) taken.push(o.pos);
  }
  let best = null, bestD = -1;
  for (let t = 0; t < 24; t++) {
    const a = Math.random() * Math.PI * 2, r = rnd(1.3, 2.4);
    const x = -3.6 + Math.cos(a) * r, z = -3.4 + Math.abs(Math.sin(a)) * r;
    const pt = new THREE.Vector3(x, 0, z);
    pushOut(pt, ROOM_OBST);
    pt.x = THREE.MathUtils.clamp(pt.x, room.bounds.minX, room.bounds.maxX);
    pt.z = THREE.MathUtils.clamp(pt.z, room.bounds.minZ, room.bounds.maxZ);
    const d = Math.min(...taken.map(q => Math.hypot(q.x - pt.x, q.z - pt.z)));
    if (d > bestD) { bestD = d; best = pt; }
    if (d > 1.4) break;
  }
  return { id: 'floor', i: 0, x: best.x, z: best.z };
}
function chooseSleepAt(c) {
  const p = c.petData, cat = p.species === 'cat';
  const ok = (id, i) => !spotUse.has(spotKey(id, i)) || spotUse.get(spotKey(id, i)) === c;
  const dh = furn('doghouse'), kt = furn('kotatsu'), ct = furn('cattower');
  if (!cat && dh && ok('doghouse', 0)) return { id: 'doghouse', i: 0 };
  if (cat && kt && (season === 'winter' || Math.random() < 0.4)) {
    const free = freeSpots(kt, c);
    if (free.length) return { id: 'kotatsu', i: pick(free) };
  }
  if (cat && ct && Math.random() < 0.5 && ok('cattower', 1)) return { id: 'cattower', i: 1 };
  for (let i = 0; i < BED_SPOTS.length; i++) if (ok('bed', i)) return { id: 'bed', i };
  // ベッドがいっぱいなら、ほかの子と重ならない床で寝る
  return floorSleepSpot(c);
}
// 寝る場所の位置・向き・起きたときの降り先
function placeOf(at) {
  if (at?.id === 'bed') return { ...BED_SPOTS[at.i], exit: null };
  if (at?.id === 'floor') return { pos: new THREE.Vector3(at.x, 0, at.z), heading: rnd(-1, 1), exit: null };
  const f = at && furn(at.id);
  if (f && f.spots[at.i]) return { pos: f.spots[at.i].pos, heading: f.spots[at.i].heading, exit: f.approach };
  return { ...BED_SPOTS[0], exit: null };
}
async function sleepScript(c) {
  const p = c.petData, m = c.model;
  const at = chooseSleepAt(c);
  if (at.id !== 'floor') takeSpot(at.id, at.i, c);
  const pl = placeOf(at);
  const f = furn(at.id);
  if (at.id === 'doghouse') {
    await c.walkTo(f.approach);
    await c.tweenTo(pl.pos, 0.8, 0, 0.75);
  } else if (at.id === 'cattower') {
    await c.walkTo(f.approach);
    await c.hopUp(f.approach, f.spots[0].pos);
    await c.tweenTo(pl.pos, 0.45, 0.3);
    c.perch = null;
  } else {
    await c.walkTo(pl.pos.clone().setY(0));
    c.pos.y = pl.pos.y;
  }
  c.targetHeading = pl.heading;
  m.setPose('sleep');
  p.sleeping = true;
  p.sleepAt = at;
}
// 寝ている子をその場所に置く（読み込み時・模様替えのあと）
function placeSleeping(c) {
  const p = c.petData;
  let at = p.sleepAt;
  const valid = at && (at.id === 'bed' || at.id === 'floor' || (furn(at.id) && furn(at.id).spots[at.i])) && (at.id === 'floor' || !spotUse.has(spotKey(at.id, at.i)) || spotUse.get(spotKey(at.id, at.i)) === c);
  if (!valid) {
    at = null;
    for (let i = 0; i < BED_SPOTS.length; i++) if (!spotUse.has(spotKey('bed', i))) { at = { id: 'bed', i }; break; }
    if (!at) at = floorSleepSpot(c);
  }
  if (at.id !== 'floor') takeSpot(at.id, at.i, c);
  p.sleepAt = at;
  const pl = placeOf(at);
  c.pos.copy(pl.pos);
  c.heading = c.targetHeading = pl.heading;
  c.model.root.rotation.y = pl.heading;
  c.model.setPose('sleep');
  c.model.cur = structuredClone(c.model.target);
}
// 起こす（いぬごや・タワーからは外に出す）
function leaveBed(c) {
  const p = c.petData;
  const at = p.sleepAt;
  if (at) {
    const pl = placeOf(at);
    if (pl.exit) c.pos.copy(pl.exit);
    if (at.id !== 'floor') freeSpot(at.id, at.i, c);
  }
  c.pos.y = 0;
  p.sleepAt = null;
}

// ----- 模様替えパネル -----
function openRoomEdit() {
  if (mode !== 'room' || playState || adoptState) { toast('おうちにいるときに模様替えできます'); return; }
  const owned = S.furniture.owned;
  const slotOf = id => S.furniture.placed[id];
  const rows = owned.map(id => {
    const d = FURNITURE[id];
    const cur = slotOf(id);
    const btns = FURN_SLOTS.map((sl, i) => `<button class="btn small ${cur === i ? 'active primary' : ''}" data-place="${id}:${i}">${sl.name}</button>`).join('');
    return `<div class="furn-row"><div class="furn-head"><span class="big">${d.icon}</span><div><b>${d.name}</b><div class="ds">${d.desc}</div></div>
      <span class="tag">${cur === undefined ? 'しまってある' : FURN_SLOTS[cur].name}</span></div>
      <div class="sub-tabs">${btns}${cur === undefined ? '' : `<button class="btn small" data-store="${id}">しまう</button>`}</div></div>`;
  }).join('');
  openPanel('🛋️ お部屋の模様替え', `<div class="hint">家具はショップの「家具」で買えます。置き場所をえらぶと、そこに置きます（ほかの家具があれば入れかえ）。ペットは家具ごとにちがう反応をするよ。</div>
    ${rows || '<div class="hint">まだ家具を持っていません。</div>'}
    <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn primary" id="btn-furn-shop">🛒 家具を買いに行く</button></div>`, el => {
    el.querySelectorAll('[data-place]').forEach(b => b.onclick = () => {
      const [id, si] = b.dataset.place.split(':');
      const slot = +si;
      const other = Object.keys(S.furniture.placed).find(k => S.furniture.placed[k] === slot && k !== id);
      const prev = S.furniture.placed[id];
      if (other) { if (prev === undefined) delete S.furniture.placed[other]; else S.furniture.placed[other] = prev; }
      S.furniture.placed[id] = slot;
      sfx.pop();
      applyFurnitureChange();
      openRoomEdit();
    });
    el.querySelectorAll('[data-store]').forEach(b => b.onclick = () => {
      delete S.furniture.placed[b.dataset.store];
      sfx.click();
      applyFurnitureChange();
      openRoomEdit();
    });
    el.querySelector('#btn-furn-shop').onclick = () => { shopTab = 'furn'; sfx.click(); openShop(); };
  });
}
function applyFurnitureChange() {
  const all = [ctrl, ...buddies.map(b => b.ctrl)];
  for (const c of all) c.cancel();
  rebuildFurniture();
  spotUse.clear();
  for (const c of all) {
    if (!c.model) continue;
    if (c.petData?.sleeping) placeSleeping(c);
    else { c.pos.y = 0; pushOut(c.pos, ROOM_OBST); c.model.setPose('stand'); }
  }
  G.save(S);
}

// ================= 多頭飼い: いっしょに暮らす子たち =================
const buddies = []; // { pet, model, ctrl, lookAt, zzz }
function spawnBuddies(posMap = {}) {
  for (const b of buddies) {
    b.ctrl.cancel();
    for (const [k, v] of spotUse) if (v === b.ctrl) spotUse.delete(k);
    room.scene.remove(b.model.root);
    b.model.dispose();
  }
  buddies.length = 0;
  for (const p of S.pets) {
    if (p.id === S.active) continue;
    const m = new PetModel(getBreed(p.breedId), { equip: p.equip, growth: G.growthFor(p.level), seedKey: p.id, fur: 'mid' });
    const c = new Ctrl(p);
    c.attach(m);
    m.root.position.copy(posMap[p.id] || randomRoomPoint());
    m.root.position.y = 0;
    c.heading = c.targetHeading = rnd(-Math.PI, Math.PI);
    room.scene.add(m.root);
    c.idleT = rnd(1, 4);
    if (p.sleeping) placeSleeping(c);
    m.root.visible = !adoptState;
    buddies.push({ pet: p, model: m, ctrl: c, lookAt: null, zzz: rnd(0, 1.6) });
  }
}
function voiceOf(p) { const b = getBreed(p.breedId); voice(p.species === 'cat', p.species === 'dog' && b.size < 0.8); }
function updateBuddies(dt) {
  for (const b of buddies) {
    const c = b.ctrl, m = b.model, p = b.pet;
    c.update(dt);
    const baseWag = p.species === 'cat' ? 0.25 : 0.12 + (p.stats.mood / 100) * 0.45;
    m.wagAmp += (baseWag - m.wagAmp) * Math.min(1, dt * 0.8);
    m.lookTarget = m.walkSpeed < 0.05 && !p.sleeping ? (b.lookAt || camera.position) : null;
    m.tongueOut = p.species === 'dog' && (m.walkSpeed > 1 || m.poseName === 'happy');
    m.update(dt);
    if (p.sleeping) {
      b.zzz += dt;
      if (b.zzz > 2.2) { b.zzz = 0; emit('💤', m.headWorldPos().add(new THREE.Vector3(0, 0.3, 0)), 1, { up: 0.35, size: 0.26, spread: 0.05, life: 2 }); }
    } else buddyAI(b, dt);
  }
}
let interactCD = 8; // 交流のクールダウン（秒）
function buddyAI(b, dt) {
  const c = b.ctrl, p = b.pet;
  if (c.busy) return;
  c.idleT -= dt;
  if (c.idleT > 0) return;
  if (p.stats.energy < 20) { c.run(() => sleepScript(c), { keepPose: true }); return; }
  const act = curPet();
  // いまの子が寝ていたら、となりでいっしょに寝ることも
  if (act?.sleeping && p.stats.energy < 92 && Math.random() < 0.3) { c.run(() => sleepScript(c), { keepPose: true }); return; }
  if (canInteract(b) && Math.random() < 0.35) { startInteraction(b); return; }
  const wfx = weatherIdle(c);
  if (wfx) { c.run(wfx); return; }
  if (placedFurn.length && Math.random() < 0.35) {
    const f = pickFurnitureFor(p);
    if (f) { c.run(async () => { if (!(await useFurniture(c, f))) await c.wait(1); }); return; }
  }
  const r = Math.random();
  c.run(async () => {
    if (r < 0.45) {
      await c.walkTo(randomRoomPoint());
      if (Math.random() < 0.4) { c.model.setPose('eat'); await c.wait(rnd(1, 2)); }
    } else if (r < 0.65) {
      c.faceTo(camera.position); c.model.setPose('sit'); await c.wait(rnd(3, 6));
    } else if (r < 0.8) {
      c.model.setPose('down'); await c.wait(rnd(4, 8));
    } else if (model) {
      c.faceTo(ctrl.pos); c.model.setPose('sit');
      b.lookAt = model.headWorldPos();
      await c.wait(rnd(2, 4));
      b.lookAt = null;
    }
  });
}
function canInteract(b) {
  const act = curPet();
  return interactCD <= 0 && model && act && mode === 'room' && !playState && !adoptState && !act.sleeping && !ctrl.busy
    && act.stats.energy > 15 && b && !b.pet.sleeping && !b.ctrl.busy && b.pet.stats.energy > 15;
}
// 2匹がそろうまで待つ（どちらかが別の行動で中断されたら false）
async function meetUp(cA, cB, gA, gB, ready) {
  for (let t = 0; t < 6; t += 0.1) {
    if (cA.gen !== gA || cB.gen !== gB) return false;
    if (ready()) return true;
    await cA.wait(0.1);
  }
  return false;
}
function startInteraction(b) {
  interactCD = rnd(18, 30);
  const A = curPet(), B = b.pet;
  const cA = ctrl, cB = b.ctrl;
  const catDog = A.species !== B.species;
  const r = Math.random();
  let kind = r < 0.35 ? 'play' : r < 0.6 ? 'chase' : r < 0.82 ? 'greet' : 'nap';
  if (catDog && kind === 'play' && Math.random() < 0.4) kind = 'hiss';
  // 待ち合わせ場所
  const mid = cA.pos.clone().add(cB.pos).multiplyScalar(0.5);
  const toB = cB.pos.clone().sub(cA.pos).setY(0);
  if (toB.lengthSq() < 1e-4) toB.set(1, 0, 0);
  toB.normalize();
  const gap = 0.35 + (cA.scale + cB.scale) * 0.32;
  const pA = cA.clampTarget(mid.clone().addScaledVector(toB, -gap / 2));
  const pB = cB.clampTarget(mid.clone().addScaledVector(toB, gap / 2));
  const st = { a: false, b: false };
  const names = `${A.name}と${B.name}`;
  if (kind === 'greet') {
    const part = (c, me, other, key, gMe, gOther, pet) => async g => {
      await c.walkTo(me);
      st[key] = true;
      if (!(await meetUp(c, other, c.gen, gOther(), () => st.a && st.b))) return;
      c.faceTo(other.pos);
      c.model.setPose('eat');
      await c.wait(1.2);
      c.model.setPose('happy');
      if (key === 'a') { emit('💕', mid.clone().setY(0.7), 3); toast(`🐾 ${names}がごあいさつ`); voiceOf(pet); }
      G.applyStats(pet, { mood: 4 });
      await c.wait(1.2);
    };
    let gA0, gB0;
    cA.run(part(cA, pA, cB, 'a', null, () => gB0, A)); gA0 = cA.gen;
    cB.run(part(cB, pB, cA, 'b', null, () => gA0, B)); gB0 = cB.gen;
    return;
  }
  if (kind === 'play' || kind === 'hiss') {
    const dogC = A.species === 'dog' ? cA : cB, catC = dogC === cA ? cB : cA;
    let gA0, gB0;
    const part = (c, me, other, key, gOther, pet) => async () => {
      await c.walkTo(me, true);
      st[key] = true;
      if (!(await meetUp(c, other, c.gen, gOther(), () => st.a && st.b))) return;
      c.faceTo(other.pos);
      if (kind === 'hiss') {
        if (c === catC) {
          c.model.setPose('angry'); say(c, '💢');
          if (key === 'a' || c === cB) sfx.hiss();
          toast(`😾 ${catC.petData.name}は${dogC.petData.name}にちょっとツンツン`);
          await c.wait(1.8);
        } else {
          c.model.setPose('happy'); c.model.wagAmp = 1;
          await c.wait(1.2);
          c.model.setPose('sad');
          await c.wait(1);
          await c.walkTo(c.clampTarget(c.pos.clone().addScaledVector(c.pos.clone().sub(other.pos).setY(0).normalize(), 1.6)));
        }
        return;
      }
      // じゃれあい: プレイバウ → とびつく、を交代で
      for (let k = 0; k < 3; k++) {
        const lead = (k % 2 === 0) === (key === 'a');
        c.faceTo(other.pos);
        if (lead) { c.model.setPose('bow'); c.model.wagAmp = 1; await c.wait(0.6); c.model.setPose('stand'); c.model.play('hop', 0.6); }
        else { c.model.setPose('crouch'); await c.wait(0.5); c.model.play('pounce', 0.5); c.model.setPose('stand'); }
        if (key === 'a') { emit('✨', mid.clone().setY(0.5), 2, { size: 0.22 }); sfx.pop(); }
        await c.wait(0.6);
      }
      // くるくる追いかけあう
      for (let k = 1; k <= 3; k++) {
        const ang = Math.atan2(me.x - mid.x, me.z - mid.z) + k * Math.PI / 2;
        const tgt = c.clampTarget(new THREE.Vector3(mid.x + Math.sin(ang) * gap * 0.8, 0, mid.z + Math.cos(ang) * gap * 0.8));
        await c.tweenTo(tgt, 0.45, 0, 1.7);
      }
      c.faceTo(other.pos);
      c.model.setPose('happy');
      G.applyStats(pet, { mood: 6, energy: -4, bond: key === 'a' ? 0.5 : 0 });
      if (key === 'a') { emit('💕', mid.clone().setY(0.7), 4); voiceOf(pet); toast(`🐾 ${names}がじゃれあってる！`, 'good'); }
      await c.wait(1.2);
    };
    cA.run(part(cA, pA, cB, 'a', () => gB0, A)); gA0 = cA.gen;
    cB.run(part(cB, pB, cA, 'b', () => gA0, B)); gB0 = cB.gen;
    return;
  }
  if (kind === 'chase') {
    // B がにげて A が追いかける → 交代
    const g0 = { a: 0, b: 0 };
    const runner = async (c, chaser, gKey, pet, lead) => {
      await c.wait(0.05);
      for (let leg = 0; leg < 4; leg++) {
        const iRun = (leg < 2) === lead;
        if (iRun) {
          st[gKey] = 'run';
          const tgt = randomRoomPoint();
          await c.walkTo(tgt, true);
        } else {
          for (let t = 0; t < 4; t += 0.15) {
            if (chaser.gen !== g0[gKey === 'a' ? 'b' : 'a']) return;
            const behind = chaser.pos.clone().add(c.pos.clone().sub(chaser.pos).setY(0).normalize().multiplyScalar(0.5 + c.scale * 0.3));
            c.setTarget(behind, true);
            await c.wait(0.15);
            if (!chaser.move && t > 0.6) break;
          }
          c.stop();
        }
        await c.wait(0.25);
      }
      c.faceTo(chaser.pos);
      c.model.setPose('happy');
      G.applyStats(pet, { mood: 5, energy: -5 });
      await c.wait(1);
    };
    toast(`🏃 ${names}が追いかけっこ！`);
    cA.run(() => runner(cA, cB, 'a', A, false)); g0.a = cA.gen;
    cB.run(() => runner(cB, cA, 'b', B, true)); g0.b = cB.gen;
    return;
  }
  // nap: よりそってごろん（クッションがあればその近く、なければラグの上）
  const cu = furn('cushion');
  const base = cu ? cu.center.clone() : new THREE.Vector3(0.3 + rnd(-0.6, 0.6), 0, 0.6 + rnd(-0.6, 0.6));
  const side = new THREE.Vector3(1, 0, 0).multiplyScalar(0.18 + (cA.scale + cB.scale) * 0.18);
  const head = rnd(-0.5, 0.5);
  let gA0, gB0;
  const part = (c, pos, other, key, gOther, pet) => async () => {
    await c.walkTo(c.clampTarget(pos));
    st[key] = true;
    if (!(await meetUp(c, other, c.gen, gOther(), () => st.a && st.b))) return;
    c.targetHeading = head;
    c.model.setPose(Math.random() < 0.5 ? 'sleep' : 'down');
    if (key === 'a') toast(`💞 ${names}がよりそってごろん`, 'good');
    for (let k = 0; k < 4; k++) {
      await c.wait(rnd(1.8, 2.4));
      if (key === 'a') emit('💕', c.pos.clone().add(other.pos).multiplyScalar(0.5).setY(0.6), 1, { size: 0.25 });
    }
    G.applyStats(pet, { mood: 6, energy: 5 });
  };
  cA.run(part(cA, base.clone().sub(side), cB, 'a', () => gB0, A)); gA0 = cA.gen;
  cB.run(part(cB, base.clone().add(side), cA, 'b', () => gA0, B)); gB0 = cB.gen;
}
// なでられたときの反応（犬: しっぽぶんぶん＋にっこり / 猫: ゴロゴロ＋目を細める）
let purrSoundT = 0;
function reactToPetting(c, p) {
  const m = c.model;
  if (p.species === 'cat') {
    m.purr(2.6);
    m.wagAmp = 0.5;
    const now = performance.now();
    if (now - purrSoundT > 2000) { purrSoundT = now; sfx.purr(2.4); }
    if (c === ctrl) bubble('ゴロゴロ♪', 1.6, true); else say(c, '🎵');
  } else {
    m.setExpression('joy', 1.8);
    m.wagAmp = 1.25;
    if (c === ctrl) bubble(pick(['💕', '♪', '😊']), 1.4);
  }
  if (!c.busy) {
    c.run(async () => {
      c.faceTo(camera.position);
      // 猫はなでられると目を細めて座る、犬はうれしくてぴょん
      if (p.species === 'cat') { m.setPose('sit'); m.purr(2.6); }
      else { m.setPose('happy'); if (Math.random() < 0.4) m.play('hop', 0.7); }
      if (Math.random() < 0.3) voiceOf(p);
      await c.wait(1.6);
    }, { keepPose: p.species === 'cat' });
  }
}
function petBuddy(b) {
  const p = b.pet;
  const top = b.model.headWorldPos().add(new THREE.Vector3(0, 0.35, 0));
  if (p.sleeping) { emit('💗', top, 1, { size: 0.2 }); toast(`💤 ${p.name}はすやすや…`); return; }
  G.applyStats(p, { mood: 3, bond: 0.8 });
  emit('💗', top, 3);
  reactToPetting(b.ctrl, p);
  toast(`🐾 ${p.name}をなでた（🐾ボタンの「よぶ」でお世話する子を切りかえ）`);
}
function setBuddiesVisible(v) { for (const b of buddies) b.model.root.visible = v; }

// ================= フリスビー大会 =================
let fris = null; // { round, total, catches, jumps, phase, g, dir, flight, disc, npcs }
const FRIS_START = new THREE.Vector3(0.9, 0, 10.0);
function attachToMouth(obj, flat = false) {
  const d = model.d;
  const b = getBreed(curPet().breedId);
  model.headGroup.add(obj);
  obj.position.set(0, -d.headR * 0.4, d.headR * 0.95 + (b.snout?.L || 0.05) * 0.9);
  obj.rotation.set(flat ? 0 : Math.PI / 2, 0, 0);
  const ws = model.root.scale.x * model.headGroup.scale.x;
  obj.scale.setScalar(0.9 / ws * Math.min(1, ws * 1.4));
}
function detachFromMouth(obj) {
  model.headGroup.remove(obj);
  obj.scale.setScalar(1);
  obj.rotation.set(0, 0, 0);
}
async function startFrisbee() {
  if (!ready() || !tiredCheck(20)) return;
  const p = curPet();
  if (p.species === 'cat' && weather === 'rain') { toast(`☔ ${p.name}は雨の日にお外であそぶのはいやみたい…`); bubble('🙅'); return; }
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
  resetTreeFade();
  model.root.position.copy(FRIS_START);
  ctrl.heading = ctrl.targetHeading = Math.PI;
  model.setPose('sit');
  controls.target.set(0, 0.8, 5.0);
  camera.position.set(0, 2.7, 13.8);
  controls.enabled = false;
  const disc = makeFrisbee();
  fris = { round: 0, total: 10, catches: 0, jumps: 0, phase: 'aim', g: 0, dir: 1, flight: null, disc, npcs: [] };
  // 観客
  for (const [x, z, h] of [[-2.6, 7.0, 1.4], [2.7, 7.8, -1.5], [-2.9, 4.2, 1.6]]) {
    const b = pick(ALL_BREEDS.filter(x => x.id !== p.breedId));
    const m = new PetModel(b, { growth: rnd(0.75, 1), seedKey: b.id + x, fur: 'low' });
    m.root.position.set(x, 0, z);
    m.root.rotation.y = h;
    m.setPose('sit');
    park.scene.add(m.root);
    fris.npcs.push(m);
  }
  playState = { kind: 'frisbee' };
  $('actions').classList.add('hidden');
  $('fris-hud').classList.remove('hidden');
  updateFrisHud();
  await fade(false);
  toast(`🥏 フリスビー大会スタート！ゲージが金色のときに${IS_TOUCH ? 'タップ' : 'なげる'}！`, 'good');
  if (weather === 'rain') setTimeout(() => toast('☔ 雨で地面がすべりやすい…キャッチがむずかしいかも'), 1500);
  if (weather === 'snow') setTimeout(() => toast(p.species === 'dog' ? `⛄ 雪の公園で${p.name}は大はしゃぎ！` : `🥶 ${p.name}はちょっとさむそう…`), 1500);
}
function updateFrisHud() {
  const p = curPet();
  $('fris-round').textContent = Math.min(fris.total, fris.round + 1);
  $('fris-total').textContent = fris.total;
  $('fris-catch').textContent = fris.catches;
  $('fris-best').textContent = p.frisbeeBest || 0;
  $('btn-throw').disabled = fris.phase !== 'aim';
}
function throwFrisbee() {
  if (!fris || fris.phase !== 'aim') return;
  const p = curPet();
  const v = fris.g;
  const dev = Math.abs(v - 0.8);
  const q = dev < 0.06 ? 'perfect' : dev < 0.17 ? 'good' : 'bad';
  const dist = 4 + v * 9.5;
  const lat = q === 'perfect' ? rnd(-0.4, 0.4) : q === 'good' ? rnd(-1.4, 1.4) : rnd(-3, 3);
  const land = new THREE.Vector3(lat, 0, 10.6 - dist);
  pushOut(land, park.obstacles);
  const dur = 1.0 + dist * 0.07;
  // キャッチできるか: 投げのよさ × 種類 × なかよし度 × げんき × 天気
  let prob = { perfect: 0.95, good: 0.8, bad: 0.4 }[q];
  if (p.species === 'cat') prob *= 0.75;
  prob += p.stats.bond / 1000;
  if (p.stats.energy < 30) prob -= 0.15;
  if (weather === 'rain') prob -= 0.1;
  if (weather === 'snow') prob += p.species === 'dog' ? 0.05 : -0.1;
  prob = THREE.MathUtils.clamp(prob, 0.05, 0.98);
  const caught = Math.random() < prob;
  const jump = caught && (q === 'perfect' || Math.random() < 0.25);
  fris.phase = 'fly';
  updateFrisHud();
  const from = new THREE.Vector3(0, 1.3, 11.2);
  fris.flight = { from, to: land.clone().setY(0.04), t: 0, dur, h: 1.1 + dist * 0.04, side: rnd(-1, 1) * (q === 'bad' ? 1.2 : 0.4), done: false };
  scene.add(fris.disc);
  fris.disc.position.copy(from);
  sfx.throw();
  $('fris-msg').textContent = { perfect: '✨ パーフェクト！', good: '👍 いいかんじ！', bad: '😅 あらら…' }[q];
  ctrl.run(async () => {
    model.setPose('stand');
    await ctrl.wait(0.15);
    const tRun = caught ? dur * 0.9 : dur * 1.15;
    const ground = land.clone();
    // キャッチ位置は少し手前（フリスビーの高さが頭くらいになるところ）
    const runP = ctrl.tweenTo(ground, tRun, 0, 1.7);
    if (jump) { await ctrl.wait(Math.max(0, tRun - 0.35)); model.play('jump', 0.6); }
    await runP;
    fris.flight.done = true;
    if (caught) {
      attachToMouth(fris.disc);
      fris.catches++;
      if (jump) fris.jumps++;
      sfx.success();
      model.setExpression('joy', 1.6);
      model.wagAmp = 1.25;
      emit(jump ? '⭐' : '✨', petTop(), jump ? 6 : 3);
      if (weather === 'snow' && p.species === 'dog') emit('❄️', ctrl.pos.clone().setY(0.3), 5, { size: 0.22 });
      $('fris-msg').textContent = jump ? '🌟 ジャンプキャッチ！' : '🥏 ナイスキャッチ！';
      for (const n of fris.npcs) { n.play('hop', 0.8); }
      emit('👏', new THREE.Vector3(0, 1.2, 6.5), 3, { spread: 2.5, size: 0.35 });
    } else {
      await ctrl.wait(0.2);
      ctrl.faceTo(fris.disc.position);
      model.setPose('eat');
      await ctrl.wait(0.5);
      attachToMouth(fris.disc);
      model.setPose('sad');
      say(ctrl, '💦');
      $('fris-msg').textContent = 'おしい！';
      await ctrl.wait(0.7);
    }
    updateFrisHud();
    model.setPose('stand');
    const back = FRIS_START.clone();
    await ctrl.tweenTo(back, Math.max(0.6, ctrl.pos.distanceTo(back) / 6), 0, 1.7);
    ctrl.targetHeading = Math.PI;
    detachFromMouth(fris.disc);
    scene.remove(fris.disc);
    model.setPose('sit');
    fris.round++;
    fris.flight = null;
    if (fris.round >= fris.total) { finishFrisbee(); return; }
    fris.phase = 'aim';
    fris.g = 0; fris.dir = 1;
    $('fris-msg').textContent = '';
    updateFrisHud();
  }, { keepPose: true });
}
function updateFrisbee(dt) {
  if (!fris) return;
  if (fris.phase === 'aim') {
    const speed = 0.75 + fris.round * 0.1;
    fris.g += fris.dir * speed * dt;
    if (fris.g >= 1) { fris.g = 1; fris.dir = -1; }
    if (fris.g <= 0) { fris.g = 0; fris.dir = 1; }
    $('fris-needle').style.left = (fris.g * 100) + '%';
  }
  const f = fris.flight;
  if (f && !f.done) {
    f.t += dt;
    const u = Math.min(1, f.t / f.dur);
    const d = fris.disc;
    d.position.lerpVectors(f.from, f.to, u);
    d.position.x += Math.sin(Math.PI * u) * f.side;
    d.position.y = THREE.MathUtils.lerp(f.from.y, f.to.y, u) + f.h * 4 * u * (1 - u) * (1 - u * 0.3);
    d.rotation.y += dt * 18;
    d.rotation.z = u < 1 ? Math.sin(Math.PI * u) * 0.25 * Math.sign(f.side) : 0;
  }
  for (const n of fris.npcs) { n.lookTarget = model ? model.headWorldPos() : null; n.update(dt); }
  // カメラはペットを少し追いかける
  const tgt = new THREE.Vector3(ctrl.pos.x * 0.5, 0.8, Math.min(6, ctrl.pos.z * 0.5 + 1.5));
  const delta = tgt.sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 2));
  controls.target.add(delta);
  camera.position.add(delta);
}
function finishFrisbee() {
  const p = curPet();
  const n = fris.catches, j = fris.jumps;
  const best = p.frisbeeBest || 0;
  const newBest = n > best;
  if (newBest) p.frisbeeBest = n;
  const coins = n * 3 + j * 2 + (newBest ? 20 : 0);
  S.coins += coins;
  G.applyStats(p, { mood: 4 + n * 1.5, energy: -12, hunger: -6, bond: n * 0.4, clean: weather === 'rain' ? -15 : -4 });
  gainExp(10 + n * 2);
  fris.phase = 'done';
  updateFrisHud();
  const rank = n >= 9 ? '🏆 チャンピオン！' : n >= 7 ? '🥇 すばらしい！' : n >= 5 ? '🥈 なかなか！' : n >= 3 ? '🥉 がんばった！' : '🐾 つぎはもっと！';
  sfx.levelup();
  model.setPose('happy');
  speak();
  emit('🎉', petTop(), 6);
  openPanel('🥏 フリスビー大会 けっか', `<div class="fris-result">
    <div class="rank">${rank}</div>
    <div class="score"><b>${n}</b> / ${fris.total} キャッチ</div>
    <div>🌟 ジャンプキャッチ ${j}回</div>
    <div>${newBest ? `🎊 自己ベスト更新！（これまで ${best}）` : `自己ベスト: ${best}`}</div>
    <div class="reward">ごほうび 🪙${coins}</div>
  </div>
  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
    <button class="btn" id="fris-home">🏠 おうちに帰る</button>
    <button class="btn primary" id="fris-again">🔁 もういちど</button>
  </div>`, el => {
    el.querySelector('#fris-again').onclick = () => {
      panelOnClose = null;
      closePanel();
      if (!tiredCheck(20)) { endFrisbee(); return; }
      fris.round = 0; fris.catches = 0; fris.jumps = 0; fris.phase = 'aim'; fris.g = 0; fris.dir = 1;
      $('fris-msg').textContent = '';
      updateFrisHud();
      refreshUI();
    };
    el.querySelector('#fris-home').onclick = () => { closePanel(); };
  });
  panelOnClose = () => endFrisbee();
  refreshUI();
}
async function endFrisbee() {
  if (!fris) return;
  const f = fris;
  fris = null;
  ctrl.cancel();
  await fade(true);
  if (f.disc.parent) f.disc.parent.remove(f.disc);
  for (const n of f.npcs) { park.scene.remove(n.root); n.dispose(); }
  playState = null;
  controls.enabled = true;
  $('fris-hud').classList.add('hidden');
  returnHome();
  refreshUI();
  await fade(false);
  toast('🏠 ただいま！', 'good');
  speak();
}
// 公園からおうちにもどす（おさんぽ・フリスビー共通）
function returnHome() {
  clearParticles();
  park.scene.remove(model.root);
  room.scene.add(model.root);
  mode = 'room';
  scene = room.scene;
  model.root.position.set(0.3, 0, 1.6);
  pushOut(model.root.position, ROOM_OBST);
  ctrl.heading = ctrl.targetHeading = 0;
  controls.target.set(model ? model.root.position.x : 0, 0.5, model ? model.root.position.z : 0);
  camera.position.copy(controls.target).add(new THREE.Vector3(0, 1.7, 4.4));
  controls.maxDistance = 11;
  $('actions').classList.remove('hidden');
  room.setTimeOfDay(new Date().getHours(), false);
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
  if (p.species === 'cat' && weather === 'rain') { toast(`☔ ${p.name}は雨の日のおさんぽはいやみたい…おうちでゴロゴロしよう`); bubble('🙅'); return; }
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
  resetTreeFade();
  controls.maxDistance = 14;

  walk = { time: 75, coins: 0, items: [], npcs: [], butterflies: [], lastInput: performance.now(), poop: null, poopAt: rnd(25, 50), pooped: false, met: 0, found: 0, fxT: rnd(5, 9) };
  for (let i = 0; i < 14; i++) addWalkItem('coin');
  for (let i = 0; i < 4; i++) addWalkItem(p.species === 'cat' ? 'fish' : 'bone');
  const nNpc = 3;
  for (let i = 0; i < nNpc; i++) {
    const b = pick(ALL_BREEDS.filter(x => x.id !== p.breedId));
    const m = new PetModel(b, { growth: rnd(0.75, 1), equip: Math.random() < 0.6 ? { neck: pick(['collar_blue', 'collar_pink', 'bandana_red', 'bandana_blue']) } : {}, seedKey: b.id + i, fur: 'low' });
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
  const wmsg = {
    rain: `☔ 雨の中のおさんぽ。どろんこになりやすいよ`,
    snow: p.species === 'dog' ? `⛄ 雪だ！${p.name}は大はしゃぎ！` : `🥶 雪…${p.name}はちょっとさむそう`,
  }[weather] || { spring: '🌸 桜がひらひら舞ってるよ', autumn: '🍂 落ち葉がいっぱい！' }[season];
  if (wmsg) setTimeout(() => toast(wmsg), 1400);
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
  returnHome();
  const spent = 75 - Math.max(0, w.time);
  const k = Math.min(1, spent / 60);
  G.applyStats(p, { energy: -20 * k, hunger: -12 * k, clean: -12 * k, mood: 10 + 15 * k, health: 6 * k, bond: 2 + 4 * k });
  // 天気のえいきょう
  if (weather === 'rain') G.applyStats(p, { clean: -15 * k, mood: -6 * k });
  if (weather === 'snow') G.applyStats(p, p.species === 'dog' ? { mood: 8 * k } : { mood: -6 * k });
  p.walks = (p.walks || 0) + 1;
  S.coins += w.coins;
  $('walk-hud').classList.add('hidden');
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

  // 天気・季節のしぐさ（雪ではしゃぐ・舞う花びらや落ち葉にじゃれる）
  w.fxT -= dt;
  if (w.fxT <= 0 && !ctrl.busy && performance.now() - w.lastInput > 1500) {
    w.fxT = rnd(6, 11);
    const fx = weather === 'snow' ? 'snow' : (season === 'spring' || season === 'autumn') && weather !== 'rain' ? 'leaf' : null;
    if (fx === 'snow' && p.species === 'dog') {
      ctrl.run(async () => {
        ctrl.stop();
        model.setPose('happy'); model.wagAmp = 1;
        model.play('hop', 1.0);
        emit('❄️', ctrl.pos.clone().setY(0.3), 5, { size: 0.22 });
        bubble('❄️');
        await ctrl.wait(1.1);
        model.play('roll', 1.2);
        await ctrl.wait(1.3);
      });
    } else if (fx === 'snow') {
      ctrl.run(async () => { ctrl.stop(); model.setPose('crouch'); model.play('shake', 0.6); bubble('🥶'); await ctrl.wait(1.2); });
    } else if (fx === 'leaf') {
      const ch = season === 'spring' ? '🌸' : '🍂';
      ctrl.run(async () => {
        ctrl.stop();
        model.setPose('crouch'); bubble(ch);
        await ctrl.wait(0.5);
        model.play('pounce', 0.5); model.setPose('stand');
        await ctrl.wait(0.5);
        emit(ch, ctrl.pos.clone().add(new THREE.Vector3(Math.sin(ctrl.heading) * 0.4, 0.4, Math.cos(ctrl.heading) * 0.4)), 3, { size: 0.22 });
        await ctrl.wait(0.6);
      });
    }
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
  followCamera(ctrl.pos, 1, dt * 1.5, petFocusY());
}
// ペットとカメラの間にある木・カメラがめり込んだ木を半透明にする
const _seg = new THREE.Line3(), _cp = new THREE.Vector3(), _ext = new THREE.Vector3();
function setTreeOpacity(t, a) {
  t.userData.fade = a;
  const see = a < 0.999;
  t.traverse(o => {
    if (!o.isMesh) return;
    const mt = o.material;
    // もともと半透明の物（金魚ばちのガラスなど）はその設定を保つ
    if (mt.userData.baseO === undefined) { mt.userData.baseO = mt.opacity; mt.userData.baseT = mt.transparent; mt.userData.baseDW = mt.depthWrite; }
    const tr = mt.userData.baseT || see;
    if (mt.transparent !== tr) { mt.transparent = tr; mt.needsUpdate = true; }
    mt.depthWrite = mt.userData.baseDW && !see;
    mt.opacity = mt.userData.baseO * a;
  });
}
function resetTreeFade() { for (const t of park.trees) if (t.userData.fade !== 1) setTreeOpacity(t, 1); }
// list の中で、注視点（ペット）→カメラの線をさえぎる物を半透明にする
function fadeBlocking(list, dt, minA) {
  // カメラの少し後ろまで延ばしてニアクリップ付近もカバー
  _ext.copy(camera.position).sub(controls.target).normalize().multiplyScalar(0.6).add(camera.position);
  _seg.set(controls.target, _ext);
  const k = 1 - Math.exp(-dt * 10);
  for (const t of list) {
    if (!t.userData.sphere) {
      t.updateMatrixWorld(true);
      t.userData.sphere = new THREE.Box3().setFromObject(t).getBoundingSphere(new THREE.Sphere());
    }
    if (t.userData.fade === undefined) t.userData.fade = 1;
    const sp = t.userData.sphere;
    const block = _seg.closestPointToPoint(sp.center, true, _cp).distanceTo(sp.center) < sp.radius * 0.95;
    const goal = block ? minA : 1;
    const cur = t.userData.fade;
    if (Math.abs(goal - cur) < 0.005) { if (cur !== goal) setTreeOpacity(t, goal); continue; }
    setTreeOpacity(t, cur + (goal - cur) * k);
  }
}
function updateTreeFade(dt) { fadeBlocking(park.trees, dt, 0.1); }
function updateRoomFade(dt) {
  // ペットが上に乗っている家具（ソファ・タワーなど）は透かさない
  const list = [...room.occluders];
  for (const f of placedFurn) {
    const onTop = ctrl.pos.y > 0.2 && Math.hypot(ctrl.pos.x - f.center.x, ctrl.pos.z - f.center.z) < f.def.r + 0.4;
    if (onTop) { if (f.obj.userData.fade !== undefined && f.obj.userData.fade !== 1) setTreeOpacity(f.obj, 1); }
    else list.push(f.obj);
  }
  fadeBlocking(list, dt, 0.25);
}
// ペットの頭の高さ（カメラの注視点に使う）
function petFocusY() {
  if (!model) return 0.5;
  return THREE.MathUtils.clamp(model.headWorldPos(tmpFocus).y * 0.72, 0.3, 2.2);
}
const tmpFocus = new THREE.Vector3();
function followCamera(pos, k, dt, y = 0.6) {
  const desired = new THREE.Vector3(pos.x * k, y, pos.z * k);
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
  const sad = p.stats.mood < 25 || p.stats.health < 40;
  if (!sad) {
    // ほかの子との交流・天気のしぐさ・家具
    const awake = buddies.filter(b => canInteract(b));
    if (awake.length && Math.random() < 0.3) { startInteraction(pick(awake)); return; }
    const wfx = weatherIdle(ctrl);
    if (wfx) { ctrl.run(wfx); return; }
    if (placedFurn.length && Math.random() < 0.35) {
      const f = pickFurnitureFor(p);
      if (f) { ctrl.run(async () => { if (!(await useFurniture(ctrl, f))) await ctrl.wait(1); }); return; }
    }
  }
  const r = Math.random();
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
  reactToPetting(ctrl, p);
  refreshUI();
}

// ================= 入力 =================
const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0.005; // ひげ(Line)が当たり判定を奪わないように
const ndc = new THREE.Vector2();
let downPos = null;
const keys = new Set();
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.key.toLowerCase());
  if (e.key === ' ' && playState?.kind === 'frisbee' && $('panel').classList.contains('hidden')) { e.preventDefault(); throwFrisbee(); }
});
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
  if (playState?.kind === 'frisbee') { throwFrisbee(); return; }
  setNdc(e);
  if (playState) return;
  // ペット
  if (raycaster.intersectObject(model.root, true).length) { petPet(); return; }
  if (mode === 'room') {
    for (const b of buddies) {
      if (raycaster.intersectObject(b.model.root, true).length) { petBuddy(b); return; }
    }
  }
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
$('btn-room').onclick = () => { sfx.click(); openRoomEdit(); };
$('weather').onclick = () => { sfx.click(); weatherToast(); };
$('btn-throw').onclick = () => throwFrisbee();
$('btn-sound').onclick = () => { setMuted(!isMuted()); S.muted = isMuted(); refreshUI(); sfx.click(); };
$('btn-help').onclick = () => {
  sfx.click();
  openPanel('❓ あそびかた', `<div class="help">
    <h3>基本</h3><p>ペットのステータス（おなか・きげん・せいけつ・げんき・けんこう・なかよし）は時間とともに変化します。下のボタンでお世話をしてあげましょう。</p>
    <h3>操作</h3><p>${IS_TOUCH ? '👆 1本指でなぞってカメラ回転、2本指でピンチしてズーム。' : '🖱 ドラッグでカメラ回転、ホイール/ピンチでズーム。'}<br>🐾 ペットを${TAP} → なでる（ねこはさわりすぎると怒るかも）<br>🏠 床を${TAP} → 「おいで」でその場所に来ます<br>💩 うんちを${TAP} → おそうじ${IS_TOUCH ? '<br>📊 左上のステータスを' + TAP + 'すると、くわしい数値が見られます' : ''}</p>
    <h3>できること</h3><p>🥣ごはん / 🍪おやつ / 🎾ボールなげ・🪶猫じゃらし / 🌳おさんぽ（コインやおやつ拾い・おともだちとの出会い） / 🎓芸のトレーニング（11種類） / 🛁おふろ / 🪮ブラッシング / 💤おやすみ / 🎀きせかえ / 🛒ショップ / 📷しゃしん / 🏥びょういん / 🐾多頭飼い（最大6匹）</p>
    <h3>多頭飼い</h3><p>2匹目からは、みんないっしょにお部屋で暮らします。じゃれあったり、追いかけっこしたり、よりそって寝たりするよ。お世話する子は🐾ボタンの「よぶ」で切りかえます。</p>
    <h3>模様替え</h3><p>ショップで家具を買うと、🛋️ボタンで置き場所を変えられます。ねこはキャットタワーに登り、犬はいぬごやで寝るなど、家具ごとに反応がちがいます。</p>
    <h3>天気と季節</h3><p>季節は現実の月、天気は日ごとに変わります（右上の${G.SEASONS[season].icon}${G.WEATHERS[weather].icon}を${TAP}すると今日の天気）。雨の日はおうちでゴロゴロ、雪の日は犬が大はしゃぎ。春は桜、秋は落ち葉が舞います。</p>
    <h3>フリスビー大会</h3><p>「あそぶ」→「フリスビー大会」。ゲージが金色のときに投げるとパーフェクト！10投でキャッチ回数を競います。</p>
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
    if (wasSleeping && !p.sleeping) {
      if (p === active) wakeUp(false);
      else {
        const b = buddies.find(x => x.pet === p);
        if (b) { b.ctrl.cancel(); leaveBed(b.ctrl); b.model.setPose('stand'); b.ctrl.idleT = rnd(1, 3); }
      }
    }
  }
  if (updateWeather()) weatherToast();
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
      updateBuddies(dt);
      interactCD -= dt;
      // ペットがいつも画面のまん中にくるように追いかける
      followCamera(ctrl.pos, 1, dt * 1.6, petFocusY());
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
    if (fris) updateFrisbee(dt);
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
      placeBrushOnBack(brushAnim.t);
    }
  }

  updateParticles(dt);
  // 天気・家具のアニメーション
  if (mode === 'room') {
    room.update(dt);
    const h = new Date().getHours();
    const fctx = { t: clock.elapsedTime, night: h < 6 || h >= 18 || !!curPet()?.sleeping };
    for (const f of placedFurn) f.obj.userData.update?.(dt, fctx);
  } else park.update(dt, controls.target);

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
  if (mode === 'park') updateTreeFade(dt);
  else if (!adoptState) updateRoomFade(dt);
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
  updateWeather(true);
  rebuildFurniture();
  if (S.pets.length) {
    spawnModel();
    spawnBuddies();
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
  setTimeout(weatherToast, offlineMins > 1 ? 2600 : 1600);
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

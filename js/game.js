// ゲームの状態・アイテム・芸・セーブデータ
import { getBreed } from './breeds.js';

export const FOODS = {
  kibble: { name: 'ふつうのごはん', icon: '🥣', hunger: 35, mood: 3, health: 1, price: 10 },
  meatmeal: { name: 'おにくごはん', icon: '🍖', hunger: 45, mood: 8, health: 3, price: 25, like: 'dog' },
  fishmeal: { name: 'おさかなごはん', icon: '🐟', hunger: 45, mood: 8, health: 3, price: 25, like: 'cat' },
  premium: { name: 'ごちそうごはん', icon: '🍱', hunger: 60, mood: 12, health: 6, price: 40 },
};

export const TREATS = {
  cookie: { name: 'ほねクッキー', icon: '🍪', hunger: 5, mood: 10, bond: 2, price: 8, like: 'dog' },
  jerky: { name: 'ささみジャーキー', icon: '🥓', hunger: 8, mood: 15, bond: 3, price: 15, like: 'dog' },
  paste: { name: 'まぐろペースト', icon: '🍥', hunger: 6, mood: 18, bond: 4, price: 20, like: 'cat' },
  catgrass: { name: 'ねこ草', icon: '🌿', hunger: 2, mood: 8, health: 4, bond: 1, price: 12, like: 'cat' },
  apple: { name: 'カットりんご', icon: '🍎', hunger: 5, mood: 8, health: 2, bond: 2, price: 10 },
};

// 芸（diff: 難しさ / req: 先に覚える必要のある芸 / lv: 必要レベル）
export const TRICKS = [
  { id: 'sit', name: 'おすわり', pose: 'sit', diff: 1.0, lv: 1 },
  { id: 'paw', name: 'お手', pose: 'paw', diff: 1.3, lv: 1, req: 'sit' },
  { id: 'paw2', name: 'おかわり', pose: 'paw2', diff: 1.4, lv: 2, req: 'paw' },
  { id: 'down', name: 'ふせ', pose: 'down', diff: 1.5, lv: 2, req: 'sit' },
  { id: 'spin', name: 'まわって', anim: 'spin', diff: 1.6, lv: 2 },
  { id: 'jump', name: 'ジャンプ', anim: 'jump', diff: 1.8, lv: 3 },
  { id: 'bow', name: 'おじぎ', pose: 'bow', diff: 2.0, lv: 3, species: 'dog' },
  { id: 'roll', name: 'ごろん', anim: 'roll', diff: 2.2, lv: 4, req: 'down' },
  { id: 'beg', name: 'ちんちん', nameCat: 'たっち', pose: 'beg', diff: 2.2, lv: 4, req: 'sit' },
  { id: 'highfive', name: 'ハイタッチ', pose: 'highfive', diff: 2.5, lv: 5, req: 'paw' },
  { id: 'bang', name: 'バーン！（死んだふり）', pose: 'playdead', diff: 3.0, lv: 6, req: 'roll', species: 'dog' },
];
export function trickName(t, species) { return species === 'cat' && t.nameCat ? t.nameCat : t.name; }
export function tricksFor(species) { return TRICKS.filter(t => !t.species || t.species === species); }

export const STAT_INFO = [
  { key: 'hunger', label: 'おなか', icon: '🍖', color: '#ff9f43' },
  { key: 'mood', label: 'きげん', icon: '💖', color: '#ff6b9a' },
  { key: 'clean', label: 'せいけつ', icon: '🫧', color: '#4fc3f7' },
  { key: 'energy', label: 'げんき', icon: '⚡', color: '#ffd23f' },
  { key: 'health', label: 'けんこう', icon: '🩺', color: '#5ad17a' },
  { key: 'bond', label: 'なかよし', icon: '🤝', color: '#b388ff' },
];

const SAVE_KEY = 'petbreed-save-v1';

export function newPet(breedId, name) {
  const b = getBreed(breedId);
  return {
    id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name, breedId, species: b.species,
    adoptedAt: Date.now(),
    stats: { hunger: 70, mood: 70, clean: 80, energy: 80, health: 90, bond: 10 },
    exp: 0, level: 1,
    tricks: {},
    equip: { neck: 'collar_red' },
    treatLog: [],
    poops: [],
    sleeping: false,
    walks: 0,
    poopTimer: -1,
  };
}

export function defaultSave() {
  return {
    version: 1,
    coins: 150,
    inventory: { kibble: 5, meatmeal: 1, fishmeal: 1, cookie: 3, paste: 2, apple: 1 },
    owned: ['collar_red'],
    pets: [],
    active: null,
    lastTime: Date.now(),
    lastDaily: '',
    muted: false,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const s = Object.assign(defaultSave(), JSON.parse(raw));
    for (const p of s.pets) {
      p.poops = p.poops || [];
      p.treatLog = p.treatLog || [];
      p.tricks = p.tricks || {};
      p.equip = p.equip || {};
    }
    return s;
  } catch (e) {
    console.warn('セーブデータの読み込みに失敗', e);
    return defaultSave();
  }
}
export function save(s) {
  s.lastTime = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(s));
}
export function resetSave() { localStorage.removeItem(SAVE_KEY); }

const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));

// minutes: 経過分。offline: ゲームを閉じていた間（やさしめ）
export function decay(p, minutes, offline = false) {
  const s = p.stats;
  const sleeping = p.sleeping;
  const poopN = p.poops.length;
  s.hunger -= minutes * (sleeping ? 0.5 : 1.0);
  s.energy += minutes * (sleeping ? 45 : -0.7);
  s.clean -= minutes * (0.3 + poopN * 0.4);
  let moodLoss = 0.45;
  if (s.hunger < 25) moodLoss += 0.6;
  if (s.clean < 25) moodLoss += 0.3;
  if (s.energy < 15) moodLoss += 0.3;
  moodLoss += poopN * 0.3;
  if (sleeping) moodLoss *= 0.3;
  s.mood -= minutes * moodLoss;
  if (s.hunger < 15 || s.clean < 15) s.health -= minutes * 0.6;
  else if (s.hunger > 45 && s.clean > 45 && s.mood > 40) s.health += minutes * 0.15;
  if (s.mood < 15) s.bond -= minutes * 0.08;
  if (offline) {
    s.hunger = Math.max(s.hunger, 15);
    s.mood = Math.max(s.mood, 20);
    s.health = Math.max(s.health, 40);
    s.clean = Math.max(s.clean, 15);
  }
  for (const k of Object.keys(s)) s[k] = clamp(s[k]);
  if (sleeping && s.energy >= 100) p.sleeping = false;
}

export function applyStats(p, delta) {
  for (const [k, v] of Object.entries(delta)) {
    if (k in p.stats) p.stats[k] = clamp(p.stats[k] + v);
  }
}

export function expToNext(level) { return 40 + level * 30; }
export function addExp(p, n) {
  p.exp += n;
  let up = false;
  while (p.exp >= expToNext(p.level)) {
    p.exp -= expToNext(p.level);
    p.level++;
    up = true;
  }
  return up;
}
export function growthFor(level) { return Math.min(1, 0.62 + (level - 1) * 0.05); }
export function stageName(p) {
  const kid = p.species === 'cat' ? '子猫' : '子犬';
  if (p.level < 4) return kid;
  if (p.level < 9) return 'わかもの';
  return 'おとな';
}
export function ageDays(p) { return Math.floor((Date.now() - p.adoptedAt) / 86400000); }

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 犬種・猫種の定義（3Dモデルはこのパラメータから手続き的に生成）
// patterns: body / head にかける模様
//   spots(斑点) leopard(ヒョウ柄) tabby(しま) calico(三毛) saddle(背中の鞍模様) mask(顔のマスク) points(シャム系ポイント)

export const DOG_BREEDS = [
  {
    id: 'shiba', species: 'dog', name: '柴犬', desc: '日本を代表するがんばり屋。くるんと巻いたしっぽがチャームポイント。',
    size: 0.95, body: { L: 0.85, H: 0.46, W: 0.42 }, legL: 0.42, legR: 0.065, headR: 0.25,
    snout: { L: 0.17, R: 0.095 }, ear: { type: 'pointy', size: 1.0 }, tail: { type: 'curl', L: 0.36, R: 0.06 },
    colors: { body: '#d98a3d', belly: '#f7e9d2', head: '#d98a3d', muzzle: '#f7e9d2', ears: '#c97a30', legs: '#e6a560', paws: '#f7e9d2', tail: '#d98a3d', nose: '#222222', eye: '#1a1209' },
    patterns: { body: 'belly', head: 'belly' },
  },
  {
    id: 'poodle', species: 'dog', name: 'トイプードル', desc: 'もこもこの巻き毛がかわいい、とても賢い人気者。',
    size: 0.62, body: { L: 0.72, H: 0.46, W: 0.4 }, legL: 0.5, legR: 0.07, headR: 0.25,
    snout: { L: 0.15, R: 0.09 }, ear: { type: 'floppy', size: 1.15, fluffy: true }, tail: { type: 'pom', L: 0.18, R: 0.05 },
    colors: { body: '#b8733f', belly: '#c4824e', head: '#b8733f', muzzle: '#c98e5c', ears: '#a8652f', legs: '#b8733f', paws: '#b8733f', tail: '#b8733f', nose: '#3a2418', eye: '#140c06' },
    patterns: {}, fluff: 46, headFluff: true,
  },
  {
    id: 'golden', species: 'dog', name: 'ゴールデンレトリバー', desc: 'やさしく穏やかな大型犬。人が大好きで遊ぶのも大好き。',
    size: 1.3, body: { L: 0.95, H: 0.5, W: 0.45 }, legL: 0.46, legR: 0.075, headR: 0.25,
    snout: { L: 0.2, R: 0.1 }, ear: { type: 'floppy', size: 1.05 }, tail: { type: 'fluffy', L: 0.5, R: 0.07, down: true },
    colors: { body: '#e0ac5c', belly: '#ecc584', head: '#e3b264', muzzle: '#ecc584', ears: '#cf9a4a', legs: '#e3b264', paws: '#ecc584', tail: '#dba658', nose: '#2b1d14', eye: '#1c1209' },
    patterns: { body: 'belly' },
  },
  {
    id: 'dachshund', species: 'dog', name: 'ミニチュアダックスフンド', desc: '胴長短足のキュートな体型。好奇心旺盛でいたずら好き。',
    size: 0.78, body: { L: 1.15, H: 0.4, W: 0.36 }, legL: 0.2, legR: 0.06, headR: 0.22,
    snout: { L: 0.22, R: 0.085 }, ear: { type: 'floppy', size: 1.35 }, tail: { type: 'long', L: 0.42, R: 0.045 },
    colors: { body: '#8a4a22', belly: '#a35f31', head: '#8a4a22', muzzle: '#a35f31', ears: '#6e3a19', legs: '#8a4a22', paws: '#a35f31', tail: '#8a4a22', nose: '#1d1410', eye: '#130b06' },
    patterns: { body: 'belly' },
  },
  {
    id: 'chihuahua', species: 'dog', name: 'チワワ', desc: '世界最小クラスの犬種。大きな瞳と耳でみんなを虜に。',
    size: 0.5, body: { L: 0.66, H: 0.42, W: 0.36 }, legL: 0.4, legR: 0.05, headR: 0.3,
    snout: { L: 0.1, R: 0.08 }, ear: { type: 'big', size: 1.6 }, tail: { type: 'long', L: 0.32, R: 0.035, up: true },
    colors: { body: '#e9c38e', belly: '#f6e2c4', head: '#e9c38e', muzzle: '#f6e2c4', ears: '#ddb07a', legs: '#efcfa2', paws: '#f6e2c4', tail: '#e9c38e', nose: '#2a1a12', eye: '#0f0904' },
    patterns: { body: 'belly' }, bigEyes: true,
  },
  {
    id: 'corgi', species: 'dog', name: 'ウェルシュ・コーギー', desc: 'まんまるのおしりと短い足。元気いっぱいの牧羊犬。',
    size: 0.92, body: { L: 1.0, H: 0.46, W: 0.46 }, legL: 0.22, legR: 0.07, headR: 0.25,
    snout: { L: 0.17, R: 0.095 }, ear: { type: 'big', size: 1.3 }, tail: { type: 'short', L: 0.1, R: 0.06 },
    colors: { body: '#df8a3a', belly: '#fbf3e6', head: '#df8a3a', muzzle: '#fbf3e6', ears: '#d27c2f', legs: '#fbf3e6', paws: '#ffffff', tail: '#df8a3a', nose: '#1f1a17', eye: '#160d06' },
    patterns: { body: 'belly', head: 'blaze' },
  },
  {
    id: 'husky', species: 'dog', name: 'シベリアンハスキー', desc: '青い瞳とオオカミのような風貌。体力は無尽蔵！',
    size: 1.25, body: { L: 0.95, H: 0.5, W: 0.45 }, legL: 0.48, legR: 0.075, headR: 0.25,
    snout: { L: 0.2, R: 0.1 }, ear: { type: 'pointy', size: 1.15 }, tail: { type: 'bushy', L: 0.45, R: 0.08 },
    colors: { body: '#5f6670', belly: '#f4f4f4', head: '#5f6670', muzzle: '#f4f4f4', ears: '#4b525b', legs: '#eeeeee', paws: '#ffffff', tail: '#5f6670', nose: '#1a1a1a', eye: '#5fb6ef' },
    patterns: { body: 'belly', head: 'huskymask' }, coloredIris: true,
  },
  {
    id: 'dalmatian', species: 'dog', name: 'ダルメシアン', desc: '白地に黒い水玉もようが特徴。スタミナ抜群のおしゃれさん。',
    size: 1.2, body: { L: 0.95, H: 0.48, W: 0.42 }, legL: 0.52, legR: 0.07, headR: 0.24,
    snout: { L: 0.21, R: 0.095 }, ear: { type: 'floppy', size: 0.95 }, tail: { type: 'long', L: 0.48, R: 0.05 },
    colors: { body: '#fafafa', belly: '#fafafa', head: '#fafafa', muzzle: '#fafafa', ears: '#2a2a2a', legs: '#fafafa', paws: '#fafafa', tail: '#fafafa', nose: '#1a1a1a', eye: '#1a120a' },
    patterns: { body: 'spots', head: 'spots' }, spotColor: '#1e1e1e',
  },
  {
    id: 'pug', species: 'dog', name: 'パグ', desc: 'しわしわの黒い顔がチャーミング。のんびりマイペース。',
    size: 0.72, body: { L: 0.75, H: 0.5, W: 0.48 }, legL: 0.3, legR: 0.07, headR: 0.28,
    snout: { L: 0.06, R: 0.12 }, ear: { type: 'small', size: 0.9 }, tail: { type: 'curl', L: 0.25, R: 0.055 },
    colors: { body: '#d9bc8c', belly: '#e3cba3', head: '#d9bc8c', muzzle: '#2b2522', ears: '#2b2522', legs: '#d9bc8c', paws: '#d9bc8c', tail: '#d9bc8c', nose: '#111111', eye: '#0f0a07' },
    patterns: { head: 'mask' }, maskColor: '#2b2522', bigEyes: true,
  },
  {
    id: 'beagle', species: 'dog', name: 'ビーグル', desc: '鼻がとっても利く陽気なハンター。三色の毛並みが自慢。',
    size: 0.9, body: { L: 0.88, H: 0.46, W: 0.42 }, legL: 0.38, legR: 0.068, headR: 0.24,
    snout: { L: 0.19, R: 0.095 }, ear: { type: 'floppy', size: 1.3 }, tail: { type: 'long', L: 0.38, R: 0.05, up: true, tipColor: '#ffffff' },
    colors: { body: '#fbf6ee', belly: '#ffffff', head: '#b06a2c', muzzle: '#ffffff', ears: '#9c5a22', legs: '#ffffff', paws: '#ffffff', tail: '#2a2420', nose: '#1a1a1a', eye: '#1a0f06' },
    patterns: { body: 'saddle', head: 'blaze' }, saddleColor: '#2a2420', saddleEdge: '#b06a2c', blazeColor: '#ffffff',
  },
  {
    id: 'pomeranian', species: 'dog', name: 'ポメラニアン', desc: 'ふわふわの毛玉のようなかわいさ。小さくても勇敢！',
    size: 0.5, body: { L: 0.66, H: 0.5, W: 0.46 }, legL: 0.3, legR: 0.06, headR: 0.27,
    snout: { L: 0.09, R: 0.08 }, ear: { type: 'pointy', size: 0.75 }, tail: { type: 'bushy', L: 0.32, R: 0.11, curlOver: true },
    colors: { body: '#f0a24a', belly: '#f6c07a', head: '#f0a24a', muzzle: '#f6c07a', ears: '#e08f38', legs: '#f2b064', paws: '#f6c07a', tail: '#f3b05e', nose: '#1e1712', eye: '#100a05' },
    patterns: { body: 'belly' }, fluff: 34, ruff: true,
  },
  {
    id: 'frenchie', species: 'dog', name: 'フレンチ・ブルドッグ', desc: 'コウモリのような立ち耳とぺちゃんこ鼻。がっしり体型の甘えんぼう。',
    size: 0.8, body: { L: 0.78, H: 0.5, W: 0.5 }, legL: 0.28, legR: 0.075, headR: 0.29,
    snout: { L: 0.05, R: 0.125 }, ear: { type: 'big', size: 1.25 }, tail: { type: 'short', L: 0.08, R: 0.05 },
    colors: { body: '#d9b58a', belly: '#efdcc2', head: '#d9b58a', muzzle: '#3a302a', ears: '#c9a074', legs: '#d9b58a', paws: '#efdcc2', tail: '#d9b58a', nose: '#111111', eye: '#100a06' },
    patterns: { body: 'belly', head: 'mask' }, maskColor: '#3a302a', bigEyes: true,
  },
];

export const CAT_BREEDS = [
  {
    id: 'mike', species: 'cat', name: '三毛猫', desc: '白・茶・黒の三色が美しい日本の招き猫。ほとんどが女の子。',
    size: 0.8, body: { L: 0.8, H: 0.4, W: 0.36 }, legL: 0.36, legR: 0.05, headR: 0.24,
    snout: { L: 0.05, R: 0.08 }, ear: { type: 'cat', size: 1.0 }, tail: { type: 'cat', L: 0.6, R: 0.04 },
    colors: { body: '#fbf8f2', belly: '#ffffff', head: '#fbf8f2', muzzle: '#ffffff', ears: '#e2913f', legs: '#ffffff', paws: '#ffffff', tail: '#e2913f', nose: '#f09aa7', eye: '#c8a23a' },
    patterns: { body: 'calico', head: 'calico' }, coloredIris: true,
  },
  {
    id: 'amesho', species: 'cat', name: 'アメリカンショートヘア', desc: 'シルバーにくっきりしたしま模様。陽気でフレンドリー。',
    size: 0.85, body: { L: 0.82, H: 0.42, W: 0.38 }, legL: 0.36, legR: 0.055, headR: 0.25,
    snout: { L: 0.05, R: 0.085 }, ear: { type: 'cat', size: 0.95 }, tail: { type: 'cat', L: 0.58, R: 0.045, rings: true },
    colors: { body: '#c4c8cc', belly: '#e6e8ea', head: '#c4c8cc', muzzle: '#e6e8ea', ears: '#9aa0a6', legs: '#c4c8cc', paws: '#d5d8db', tail: '#c4c8cc', nose: '#c97f86', eye: '#8db13e' },
    patterns: { body: 'tabby', head: 'tabby' }, stripeColor: '#2e3135', coloredIris: true,
  },
  {
    id: 'scottish', species: 'cat', name: 'スコティッシュフォールド', desc: '折れた耳とまんまるの顔。おっとりした甘えんぼう。',
    size: 0.82, body: { L: 0.78, H: 0.44, W: 0.4 }, legL: 0.32, legR: 0.055, headR: 0.27,
    snout: { L: 0.05, R: 0.09 }, ear: { type: 'folded', size: 1.0 }, tail: { type: 'cat', L: 0.5, R: 0.05 },
    colors: { body: '#d8c3a5', belly: '#f2e8d8', head: '#d8c3a5', muzzle: '#f2e8d8', ears: '#c4ac8a', legs: '#e3d2b8', paws: '#f2e8d8', tail: '#d8c3a5', nose: '#d58f8f', eye: '#d9a238' },
    patterns: { body: 'belly' }, coloredIris: true, bigEyes: true,
  },
  {
    id: 'russian', species: 'cat', name: 'ロシアンブルー', desc: 'ブルーグレーの上品な毛並みとエメラルドの瞳。ひかえめで忠実。',
    size: 0.85, body: { L: 0.84, H: 0.4, W: 0.34 }, legL: 0.4, legR: 0.05, headR: 0.23,
    snout: { L: 0.06, R: 0.08 }, ear: { type: 'cat', size: 1.15 }, tail: { type: 'cat', L: 0.62, R: 0.04 },
    colors: { body: '#7f8c9a', belly: '#8d99a6', head: '#7f8c9a', muzzle: '#8d99a6', ears: '#6e7a87', legs: '#7f8c9a', paws: '#8592a0', tail: '#7f8c9a', nose: '#5f6a76', eye: '#38b56a' },
    patterns: {}, coloredIris: true,
  },
  {
    id: 'siamese', species: 'cat', name: 'シャム', desc: 'クリーム色の体に濃い色のポイント。青い瞳のおしゃべりさん。',
    size: 0.82, body: { L: 0.86, H: 0.38, W: 0.32 }, legL: 0.42, legR: 0.045, headR: 0.22,
    snout: { L: 0.08, R: 0.075 }, ear: { type: 'cat', size: 1.3 }, tail: { type: 'cat', L: 0.66, R: 0.035 },
    colors: { body: '#efe2cc', belly: '#f6eedf', head: '#efe2cc', muzzle: '#4a3226', ears: '#4a3226', legs: '#5c4031', paws: '#4a3226', tail: '#4a3226', nose: '#3a2820', eye: '#58a8e8' },
    patterns: { body: 'belly', head: 'mask' }, maskColor: '#4a3226', coloredIris: true,
  },
  {
    id: 'munchkin', species: 'cat', name: 'マンチカン', desc: '短い足でちょこちょこ歩く姿がたまらない。好奇心のかたまり。',
    size: 0.78, body: { L: 0.84, H: 0.4, W: 0.37 }, legL: 0.18, legR: 0.055, headR: 0.25,
    snout: { L: 0.05, R: 0.085 }, ear: { type: 'cat', size: 1.0 }, tail: { type: 'cat', L: 0.55, R: 0.045, rings: true },
    colors: { body: '#c9a57a', belly: '#efe0c8', head: '#c9a57a', muzzle: '#efe0c8', ears: '#a8855a', legs: '#c9a57a', paws: '#efe0c8', tail: '#c9a57a', nose: '#d68a8a', eye: '#d9a02c' },
    patterns: { body: 'tabby', head: 'tabby' }, stripeColor: '#6b4a2c', coloredIris: true,
  },
  {
    id: 'mainecoon', species: 'cat', name: 'メインクーン', desc: '「やさしい巨人」と呼ばれる大型猫。ふさふさの尾と耳の房毛が特徴。',
    size: 1.15, body: { L: 0.9, H: 0.44, W: 0.4 }, legL: 0.4, legR: 0.06, headR: 0.25,
    snout: { L: 0.08, R: 0.09 }, ear: { type: 'tufted', size: 1.25 }, tail: { type: 'catbushy', L: 0.62, R: 0.085 },
    colors: { body: '#8c6440', belly: '#e2cfb2', head: '#8c6440', muzzle: '#e2cfb2', ears: '#6e4c2e', legs: '#9a7048', paws: '#e2cfb2', tail: '#8c6440', nose: '#a0645a', eye: '#c9a032' },
    patterns: { body: 'tabby', head: 'tabby' }, stripeColor: '#3e2a1a', coloredIris: true, ruff: true,
  },
  {
    id: 'kuro', species: 'cat', name: '黒猫', desc: 'つやつやの黒い毛並みに金色の瞳。幸運を運ぶといわれています。',
    size: 0.8, body: { L: 0.82, H: 0.4, W: 0.35 }, legL: 0.38, legR: 0.05, headR: 0.24,
    snout: { L: 0.05, R: 0.08 }, ear: { type: 'cat', size: 1.1 }, tail: { type: 'cat', L: 0.62, R: 0.04 },
    colors: { body: '#2a2a30', belly: '#303038', head: '#2a2a30', muzzle: '#33333b', ears: '#26262b', legs: '#2a2a30', paws: '#2e2e35', tail: '#2a2a30', nose: '#3a3036', eye: '#f2c230' },
    patterns: {}, coloredIris: true,
  },
  {
    id: 'persian', species: 'cat', name: 'ペルシャ', desc: '長くてゴージャスな被毛と平たいお顔。猫界の女王様。',
    size: 0.85, body: { L: 0.78, H: 0.46, W: 0.42 }, legL: 0.28, legR: 0.06, headR: 0.27,
    snout: { L: 0.02, R: 0.09 }, ear: { type: 'small', size: 0.75 }, tail: { type: 'catbushy', L: 0.48, R: 0.09 },
    colors: { body: '#f7f5f2', belly: '#ffffff', head: '#f7f5f2', muzzle: '#ffffff', ears: '#ece6df', legs: '#f7f5f2', paws: '#ffffff', tail: '#f7f5f2', nose: '#f19aa7', eye: '#e08a2a' },
    patterns: {}, coloredIris: true, fluff: 36, ruff: true, bigEyes: true,
  },
  {
    id: 'bengal', species: 'cat', name: 'ベンガル', desc: 'ヒョウのようなロゼット模様。運動神経ばつぐんの野性派。',
    size: 0.95, body: { L: 0.9, H: 0.42, W: 0.36 }, legL: 0.42, legR: 0.055, headR: 0.23,
    snout: { L: 0.07, R: 0.085 }, ear: { type: 'cat', size: 0.95 }, tail: { type: 'cat', L: 0.6, R: 0.05, rings: true },
    colors: { body: '#d9a253', belly: '#f2dfba', head: '#d9a253', muzzle: '#f2dfba', ears: '#b07c38', legs: '#d9a253', paws: '#f2dfba', tail: '#d9a253', nose: '#b0605a', eye: '#7fb03a' },
    patterns: { body: 'leopard', head: 'spots' }, spotColor: '#3a2614', coloredIris: true,
  },
  {
    id: 'chatora', species: 'cat', name: '茶トラ', desc: 'オレンジのしま模様。人なつっこくて食いしん坊な性格が多いとか。',
    size: 0.85, body: { L: 0.82, H: 0.42, W: 0.38 }, legL: 0.36, legR: 0.055, headR: 0.25,
    snout: { L: 0.05, R: 0.085 }, ear: { type: 'cat', size: 1.0 }, tail: { type: 'cat', L: 0.58, R: 0.045, rings: true },
    colors: { body: '#e8964a', belly: '#f8dcb4', head: '#e8964a', muzzle: '#f8dcb4', ears: '#d07a32', legs: '#eca262', paws: '#f8dcb4', tail: '#e8964a', nose: '#e88a8a', eye: '#c9a52a' },
    patterns: { body: 'tabby', head: 'tabby' }, stripeColor: '#b45f20', coloredIris: true,
  },
  {
    id: 'ragdoll', species: 'cat', name: 'ラグドール', desc: '抱っこされるとぬいぐるみのように脱力。青い瞳の大型猫。',
    size: 1.1, body: { L: 0.88, H: 0.46, W: 0.42 }, legL: 0.36, legR: 0.06, headR: 0.26,
    snout: { L: 0.06, R: 0.09 }, ear: { type: 'cat', size: 0.95 }, tail: { type: 'catbushy', L: 0.58, R: 0.085 },
    colors: { body: '#f4ede2', belly: '#ffffff', head: '#f4ede2', muzzle: '#ffffff', ears: '#7a6656', legs: '#ffffff', paws: '#ffffff', tail: '#8a7564', nose: '#e899a2', eye: '#4f8fe0' },
    patterns: { head: 'ragdoll' }, maskColor: '#8a7564', coloredIris: true, ruff: true,
  },
];

export const ALL_BREEDS = [...DOG_BREEDS, ...CAT_BREEDS];
export function getBreed(id) { return ALL_BREEDS.find(b => b.id === id) || DOG_BREEDS[0]; }

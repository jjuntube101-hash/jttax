'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   브레이크포인트 게이트 — 허용 3구간 밖의 미디어 조건을 «등재 후 감소 추적»한다 (260906 C1 신설)

   ▣ 왜
     styles.css 는 760·960·720·1100px 에서, redesign.css 는 920·860·820·600·560px 에서 접힌다 —
     같은 화면이 파일마다 다른 폭에서 바뀐다. 홈 장부화(계획 v2.5 A-1·A-2)는 이것을 세 구간
     (모바일 ≤640 / 태블릿 641~1024 / 데스크톱 ≥1025)과 «높이 규칙»으로 정리한다.
     이 게이트는 그 정리가 ①새 비표준 폭을 «만들지 않는지» ②기존 것을 «줄이는지»를 숫자로 본다.

   ▣ 무엇을 세나
     @media 블록 «안의 규칙 하나하나»를 «파일 | 조건 절»로 센다(블록 수가 아니다 — 블록을 쪼개거나
     합쳐도 흔들리지 않고, 감소가 실제 정리량을 반영한다). 콤마(OR)로 나뉜 절은 따로 센다.
     허용 = and 로 묶인 조각 전부가 {screen·all·print·prefers-*·hover·pointer·orientation·resolution·
     forced-colors·color-gamut·display-mode / 높이 규칙(max-·min-height)} 이거나, 폭 규칙이 세 구간 중
     하나와 정확히 일치. 그 밖(범위 문법 등 «해석 못 한» 조각 포함)은 비허용.

   ▣ 판정
     비허용 절은 KNOWN 에 (key, n) 으로 등재돼 있어야 통과한다.
       · 등재 없음            → CSS-BP-NEW   (새 비표준 브레이크포인트 — 만들지 마라)
       · n 이 등재보다 큼      → CSS-BP-GROW  (기존 비표준 폭에 규칙을 더 얹었다)
       · n 이 등재보다 작음    → CSS-BP-STALE (줄었다 — KNOWN 의 n 을 내려 «감소»를 기록하라)
     ⛔ KNOWN 은 «묻어 두는 곳»이 아니다. 숫자가 줄면 게이트가 갱신을 요구한다(tests_css_cascade.js 의 STALE 과 같은 원칙).

   ▣ 이 게이트가 «못» 잡는 것
     구간 «안»에서 값이 맞는지(그건 tests_css_cascade.js ③④·브라우저 실측) / @container·range 문법(비허용으로 센다).
   ══════════════════════════════════════════════════════════════════════════ */

const path = require('path');
const lib = require('./css_cascade_lib.js');

const ROOT = path.join(__dirname, '..');
const overrides = lib.envOverrides(process.env);
const { sheets } = lib.loadSheets({ root: ROOT, overrides });
const rules = lib.parseSheets(sheets);

/* ── 허용 구간 ─────────────────────────────────────────────────────────────── */
const BANDS = [
  { 이름: '모바일', test: (w) => w.max !== null && w.max <= 640 && w.min === null },
  { 이름: '태블릿', test: (w) => w.min === 641 && w.max === 1024 },
  { 이름: '데스크톱', test: (w) => w.min !== null && w.min >= 1025 && w.max === null },
];

/* ── 알려진 비표준 절 (260906 C1 등재 — «파일 | 조건» → 규칙 수) ─────────────────
   등재 시점의 실측이다. 장부화(C3+C4)가 styles.css 구 블록을 지우면 STALE 이 뜨고, 그때 n 을 내린다.
   ⚠️ 새 항목을 «추가»하는 것은 이 게이트의 목적에 반한다 — 새 폭이 필요하면 세 구간 중 하나로 맞춰라. */
const KNOWN = [   // 260906 C1 실측: 13종 · 규칙 147개 (키 = 루트 상대경로 | and-조각을 정렬한 절)
  { key: 'project/src/redesign.css | (max-height: 720px) and (min-width: 641px)', n: 3 },
  { key: 'project/src/redesign.css | (max-height: 900px) and (min-width: 641px)', n: 5 },
  { key: 'project/src/redesign.css | (max-width: 1024px)', n: 7 },
  { key: 'project/src/redesign.css | (max-width: 760px)', n: 32 },
  { key: 'project/src/redesign.css | (max-width: 820px)', n: 1 },
  { key: 'project/src/redesign.css | (max-width: 860px)', n: 1 },
  { key: 'project/src/redesign.css | (max-width: 920px)', n: 1 },
  { key: 'project/src/redesign.css | (max-width: 960px)', n: 6 },
  { key: 'project/src/styles.css | (max-width: 1024px) and (min-width: 761px)', n: 4 },
  { key: 'project/src/styles.css | (max-width: 1100px)', n: 16 },
  { key: 'project/src/styles.css | (max-width: 720px)', n: 18 },
  { key: 'project/src/styles.css | (max-width: 760px)', n: 37 },
  { key: 'project/src/styles.css | (max-width: 960px)', n: 16 },
];
const knownMap = new Map(KNOWN.map((k) => [k.key, k.n]));

/* 조건 절 표기를 정규화한다 — `@media(max-width:640px)` 와 `(max-width: 640px)` 는 같은 절이다.
   TASK-020 R1-F3: and-조각의 «순서»와 `760.0px` 같은 «수 표기»도 같은 절로 본다 — 조각을 정규화한 뒤 정렬해 잇는다.
   그렇지 않으면 같은 조건이 표기에 따라 예외 장부에서 둘로 갈린다. */
function norm(cond) {
  const parts = cond.toLowerCase().replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s*:\s*/g, ': ').trim()
    .split(/\band\b/).map((x) => x.trim()).filter(Boolean)
    .map((x) => x.replace(/:\s*(\d+(?:\.\d+)?)px/g, (_m, n) => ': ' + parseFloat(n) + 'px'));
  return parts.sort().join(' and ');
}

/* 한 절(and 로 묶인 조각들)이 허용 구간인지. null = 해석 못 함(비허용으로 센다).
   폭 규칙이 여러 개면 min 은 «최댓값», max 는 «최솟값»으로 합친다(전부 만족해야 하므로). */
function classify(alt) {
  const s = alt.trim();
  if (!s) return { ok: true, 이름: '무조건' };
  if (/^(not|only)\b/i.test(s)) return { ok: false, 이름: 'not/only(해석 보류)' };
  const w = { min: null, max: null };
  let heightOnly = true;
  for (const part of s.split(/\band\b/i).map((x) => x.trim()).filter(Boolean)) {
    const t = part.toLowerCase();
    if (t === 'screen' || t === 'all' || t === 'print' || t === 'speech') continue;
    if (/^\(\s*(prefers-|hover|any-hover|pointer|any-pointer|orientation|resolution|forced-colors|color-gamut|display-mode)/.test(t)) continue;
    const m = t.match(/^\(\s*(max|min)-(width|height)\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/);
    if (!m) return { ok: false, 이름: '해석 못 함' };
    if (m[2] === 'height') continue;
    heightOnly = false;
    const n = parseFloat(m[3]);
    if (m[1] === 'min') w.min = w.min === null ? n : Math.max(w.min, n);
    else w.max = w.max === null ? n : Math.min(w.max, n);
  }
  if (heightOnly && w.min === null && w.max === null) return { ok: true, 이름: '높이·기능 질의' };
  const band = BANDS.find((b) => b.test(w));
  return band ? { ok: true, 이름: band.이름 } : { ok: false, 이름: '비표준 폭 ' + (w.min === null ? '' : '≥' + w.min) + (w.max === null ? '' : '≤' + w.max) };
}

const counts = new Map();   // key → n
const bandCounts = new Map();
for (const r of rules) {
  if (!r.media) continue;
  /* 중첩 @media 는 «AND»(parseRules 가 배열로 쌓는다). 층마다 콤마(OR) 대안이 있을 수 있으니 카테시안 곱으로
     «유효 절»을 만든 뒤 분류한다 — 층마다 따로 분류하면 (min 641)+(max 1024) 가 각각 비표준으로 잡힌다(R1-F3). */
  let combos = [[]];
  for (const part of r.media) {
    if (part.kind !== 'media') continue;
    const alts = lib.splitTop(part.cond, lib.maskOut(part.cond), 0, part.cond.length, ',').map((x) => x.text.trim());
    combos = combos.flatMap((c) => alts.map((a) => c.concat([a])));
  }
  for (const combo of combos) {
    if (!combo.length) continue;                 // @supports 만 있는 규칙
    const clause = combo.join(' and ');
    const c = classify(clause);
    bandCounts.set(c.이름, (bandCounts.get(c.이름) || 0) + 1);
    if (c.ok) continue;
    const key = r.file + ' | ' + norm(clause);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
}

const fails = [];
for (const [key, n] of [...counts].sort()) {
  if (!knownMap.has(key)) fails.push(`CSS-BP-NEW   「${key}」 규칙 ${n}개 — 허용 3구간(≤640 / 641~1024 / ≥1025) 밖의 새 브레이크포인트다. 세 구간 중 하나로 맞춰라.`);
  else if (n > knownMap.get(key)) fails.push(`CSS-BP-GROW  「${key}」 규칙 ${knownMap.get(key)} → ${n}개 — 비표준 폭에 규칙을 더 얹었다. 새 규칙은 허용 구간에 둬라.`);
  else if (n < knownMap.get(key)) fails.push(`CSS-BP-STALE 「${key}」 규칙 ${knownMap.get(key)} → ${n}개 — 줄었다. tests_css_breakpoints.js 의 KNOWN n 을 ${n} 으로 내려 감소를 기록하라(0 이면 항목 삭제).`);
}
for (const k of KNOWN) if (!counts.has(k.key)) fails.push(`CSS-BP-STALE 「${k.key}」 가 더는 검출되지 않는다 — KNOWN 에서 지워라.`);

const total = [...counts.values()].reduce((a, b) => a + b, 0);
console.log('[css-breakpoints] @media 규칙 절 분류 — ' + [...bandCounts].map(([k, v]) => k + ' ' + v).join(' · '));
console.log('  ▸ 비표준 절 ' + counts.size + '종 · 규칙 ' + total + '개 (등재 ' + KNOWN.length + '종) — 장부화에서 순감소시킬 숫자');
if (fails.length) {
  console.error('\n[css-breakpoints] FAIL ' + fails.length + '건');
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('[css-breakpoints] PASS — 새 비표준 브레이크포인트 0 · 등재분 증가 0');

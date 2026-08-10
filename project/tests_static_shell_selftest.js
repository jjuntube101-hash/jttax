'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   부팅 폴백 게이트의 «음성 대조군» — tests_static_shell.js 가 진짜로 잡는지 시험한다

   ▣ 왜 필요한가
     부팅 폴백은 «JS 가 한 줄도 안 도는 상황»의 최후 수단이다. 그래서 이 화면의 결함은
     평소에 절대 드러나지 않는다 — 정작 필요할 때가 되어서야 드러나고, 그때는 이미
     방문자가 백지나 무한 대기를 보고 있다. 게이트가 「0건」을 내는 이유가
       ⓐ 정말 멀쩡하다   ⓑ 게이트가 아무것도 못 본다
     중 어느 쪽인지 화면만 봐서는 구별되지 않는다.
     → 일부러 망가뜨려 «잡히는지» 본다.

   ▣ 방법
     index.html 을 개조한 사본으로 «잠시» 덮고 게이트를 돌린 뒤 즉시 원복한다.
     ⛔ 원복 확인까지 한다 — 원본을 망가뜨린 채 끝나면 그게 더 큰 사고다.
   ══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const IDX = path.join(ROOT, 'index.html');
const GATE = path.join(__dirname, 'tests_static_shell.js');
const original = fs.readFileSync(IDX, 'utf8');

function run() {
  const r = spawnSync(process.execPath, [GATE], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const results = [];
function 시험(이름, 개조, 기대어구) {
  const 사본 = 개조(original);
  if (사본 === original) {
    console.log('  ✗ ' + 이름 + ' → 준비 실패(개조가 적용되지 않음 — 소스와 패턴이 어긋났다)');
    results.push(false);
    return;
  }
  fs.writeFileSync(IDX, 사본);
  let r;
  try { r = run(); } finally { fs.writeFileSync(IDX, original); }   // 무슨 일이 있어도 원복
  const 잡힘 = r.code !== 0 && r.out.indexOf(기대어구) >= 0;
  results.push(잡힘);
  console.log((잡힘 ? '  ✓ ' : '  ✗ ') + 이름 + ' → ' + (잡힘 ? '잡음' : 'FAIL: 놓쳤다 exit=' + r.code));
  if (!잡힘) {
    console.log(r.out.split('\n').filter((l) => /✗|실패 [0-9]/.test(l)).slice(0, 4)
      .map((l) => '        ' + l).join('\n'));
  }
}

console.log('[부팅 폴백 게이트 자기시험] 결함 주입 → 잡히는지 확인');

/* 양성 대조군 — 손대지 않은 원본은 통과해야 한다.
   이게 없으면 「무조건 FAIL 하는 게이트」가 아래 시험을 전부 통과해 버린다. */
{
  const { code, out } = run();
  results.push(code === 0);
  console.log((code === 0 ? '  ✓ ' : '  ✗ ') + '양성 대조군(원본 무개조) → ' + (code === 0 ? 'PASS' : '위양성! exit=' + code));
  if (code !== 0) console.log(out.split('\n').filter((l) => l.indexOf('✗') >= 0).slice(0, 4).map((l) => '        ' + l).join('\n'));
}

/* ⚠️ .jt-boot__late 규칙은 «세 곳»에 있다 — 무조건부(기본 보임) / @supports(애니메이션)
   / @media(동작 최소화). 하나만 지우면 다른 검사가 «다른 이유로» 잡아 시험이 의도를
   잃는다. 그래서 전부 지운다(260810 자기시험 초판이 실제로 이걸 놓쳤다). */
시험('NC-1 .jt-boot__late 규칙을 전부 제거',
  (s) => s.replace(/\.jt-boot__late\s*\{[^}]*\}/g, '/* removed */'),
  '지연 노출 규칙');

/* ★ NC-2 가 이 설계의 «핵심» 시험이다.
   초판 설계는 「숨김이 기본값, 애니메이션으로 보이게」였고, 그러면 애니메이션이
   한 번이라도 안 도는 환경에서 오류 안내가 «영영» 안 나온다(Codex R2 P1).
   설계를 뒤집어 기본값을 «보임»으로 뒀다 — 이 시험이 그 되돌림을 막는다. */
시험('NC-2 ★ 기본값을 «숨김»으로 되돌림 (애니 미실행 환경에서 영영 안 보임)',
  (s) => s.replace('.jt-boot__late{ visibility:visible; opacity:1; }',
                   '.jt-boot__late{ visibility:hidden; opacity:0; }'),
  '기본값이 «보임»이 아닙니다');

시험('NC-3 animation 제거 (오류 안내가 처음부터 보임)',
  (s) => s.replace(/animation: jt-boot-late [^;]*;/, ''),
  '유효한 animation 이 없습니다');

시험('NC-4 fill-mode:forwards 제거 (6초 뒤 떴다가 다시 사라짐)',
  (s) => s.replace('jt-boot-late 6s linear forwards', 'jt-boot-late 6s linear'),
  'forwards');

시험('NC-5 duration 0s (0초 애니메이션을 실행 안 하는 구현이 있다)',
  (s) => s.replace('jt-boot-late 6s linear forwards', 'jt-boot-late 0s linear forwards'),
  'animation-duration 이 0');

/* opacity 로만 가리면 접근성 트리에 남아 스크린리더가 6초 전에 낭독한다(Codex R1) */
시험('NC-6 keyframes 시작을 opacity 로만 가림 (스크린리더가 미리 읽음)',
  (s) => s.replace('0%, 96% { visibility:hidden; opacity:0; }', '0%, 96% { opacity:0; }'),
  '시작 구간이 visibility:hidden');

시험('NC-7 keyframes 끝이 visible 이 아님 (6초 뒤에도 안 보임)',
  (s) => s.replace('100%    { visibility:visible; opacity:1; }', '100%    { opacity:1; }'),
  '끝 구간이 visibility:visible');

/* !important 로 숨김을 고정하면 keyframe 이 못 이긴다 — 애니메이션이 돌아도 영영 안 보인다 */
시험('NC-8 !important 로 숨김 고정 (keyframe 이 못 이김)',
  (s) => s.replace('.jt-boot__late{ visibility:visible; opacity:1; }',
                   '.jt-boot__late{ visibility:hidden !important; opacity:1; }'),
  '!important 로 숨기고');

시험('NC-9 동작 최소화(prefers-reduced-motion) 규칙 제거',
  (s) => s.replace(/@media \(prefers-reduced-motion: reduce\)\{[\s\S]*?\n\s*\}/, ''),
  '동작 최소화');

시험('NC-10 동작 최소화 규칙이 오히려 숨김',
  (s) => s.replace('.jt-boot__late{ animation:none; }',
                   '.jt-boot__late{ animation:none; visibility:hidden; }'),
  '동작 최소화 규칙이');

시험('NC-11 <style> 을 body 로 되돌림 (HTML 표준 위치 아님)',
  (s) => {
    const m = s.match(/ {2}<style>[\s\S]*?<\/style>\r?\n/);
    if (!m) return s;
    return s.replace(m[0], '').replace('  <div id="root">', m[0] + '  <div id="root">');
  },
  'body 안에 있습니다');

시험('NC-12 전화 링크를 지연 블록 «안»으로 (6초간 전화번호가 안 보임)',
  (s) => s.replace(/(<p class="jt-boot__late"[^>]*>)([\s\S]*?)(<\/p>)/,
    '$1$2 <a href="tel:02-554-6405">전화</a>$3'),
  '지연 노출 블록 안에');

시험('NC-13 즉시 표시부에 「문제가 생겼」 복귀 (대표가 지적한 원래 상태)',
  (s) => s.replace('화면을 불러오고 있습니다.', '화면을 준비하는 중 문제가 생겼습니다.'),
  '고장으로 읽힙니다');

/* ── 결과 ───────────────────────────────────────────────────────────────── */
const 실패 = results.filter((r) => !r).length;
const 원복OK = fs.readFileSync(IDX, 'utf8') === original;
console.log('  ▸ 원본 원복: ' + (원복OK ? 'OK' : '⛔ 어긋남 — index.html 을 git 으로 되돌려라!'));

if (실패 || !원복OK) {
  console.error('[부팅 폴백 자기시험] FAIL — ' + 실패 + '건 실패' + (원복OK ? '' : ' + 원복 실패'));
  process.exit(1);
}
console.log('[부팅 폴백 자기시험] PASS — 주입한 결함 ' + (results.length - 1) + '종 전건 검출 + 원본 위양성 0');

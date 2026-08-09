'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   tests_css_cascade.js 의 «음성 대조군» — 게이트가 진짜로 잡는지 시험한다

   ▣ 왜 필요한가
     게이트가 「0건」을 내는 데는 두 가지 이유가 있고, 화면은 «똑같다».
       ⓐ 정말 위반이 없다        ⓑ 게이트가 아무것도 못 본다
     ⓑ 를 배제하는 유일한 방법은 «일부러 틀린 것을 넣어 잡히는지» 보는 것이다.
     260809 히어로 사고 자체가 「압축 규칙이 있다」를 「압축이 된다」로 착각한 일이었다.

   ▣ 방법
     원본 CSS 를 사본으로 뜨고, 사본에 결함을 하나씩 주입한 뒤
     CSS_CASCADE_TARGET 으로 게이트에 그 사본을 검사시킨다. 원본은 건드리지 않는다.
   ══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GATE = path.join(__dirname, 'tests_css_cascade.js');
const SRC = path.join(ROOT, 'project', 'src', 'redesign.css');

const original = fs.readFileSync(SRC, 'utf8');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csscascade-'));

function runGate(css) {
  const p = path.join(tmpDir, 'probe.css');
  fs.writeFileSync(p, css);
  const r = spawnSync(process.execPath, [GATE], {
    env: { ...process.env, CSS_CASCADE_TARGET: p },
    encoding: 'utf8',
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const results = [];
function check(이름, css, 기대코드) {
  const { code, out } = runGate(css);
  const 잡음 = code !== 0 && out.indexOf(기대코드) >= 0;
  results.push({ 이름, 기대코드, 잡음, exit: code });
  console.log((잡음 ? '  ✓' : '  ✗') + ' ' + 이름 + '  → ' + (잡음 ? '잡음(' + 기대코드 + ')' : 'FAIL: 놓쳤다 exit=' + code));
  if (!잡음) console.log(out.split('\n').slice(0, 6).map((l) => '      ' + l).join('\n'));
}

console.log('[css-cascade 자기시험] 결함 주입 → 잡히는지 확인');

/* ── 양성 대조군: 손대지 않은 원본은 통과해야 한다 ─────────────────────────
   이게 없으면 「무조건 FAIL 하는 게이트」도 음성 시험을 전부 통과해 버린다. */
{
  const { code, out } = runGate(original);
  const ok = code === 0;
  results.push({ 이름: '양성 대조군(원본 무개조)', 기대코드: 'PASS', 잡음: ok, exit: code });
  console.log((ok ? '  ✓' : '  ✗') + ' 양성 대조군(원본 무개조) → ' + (ok ? 'PASS' : '위양성! exit=' + code));
  if (!ok) console.log(out.split('\n').slice(-8).map((l) => '      ' + l).join('\n'));
}

/* ── NC-1 ① 미디어쿼리가 무조건 규칙에 덮이는 결함 ────────────────────────
   파일 «끝»에 무조건 규칙을 하나 붙이면, 앞의 모바일 압축 블록이 통째로 죽는다.
   이번 실사고와 정확히 같은 모양이다. */
check('NC-1 ① 미디어쿼리를 덮는 무조건 규칙을 파일 끝에 주입',
  original + '\n.jt-bm-primary{ height: 300px !important; }\n',
  'CSS-DEAD-MQ');

/* ── NC-2 ② 대상이 사라진 압축 규칙 ───────────────────────────────────────
   DOM 에 없는 클래스를 겨냥한 크기 지정을 미디어쿼리 안에 넣는다. */
check('NC-2 ② 존재하지 않는 클래스를 겨냥한 압축 규칙 주입',
  original + '\n@media (max-width: 640px){ .jt-이런클래스는없다{ height: 10px !important; } }\n',
  'CSS-DEAD-SEL');

/* ── NC-3 ③ 뷰포트 구멍 ───────────────────────────────────────────────────
   태블릿 구간 블록을 통째로 지우면 768×1024 가 다시 기본값을 쓰게 된다 —
   배포 전 실제로 있었던 구멍(-93px)의 재현이다. */
{
  const cut = original.replace(
    /@media \(min-width: 641px\) and \(max-width: 1024px\) and \(max-height: 1100px\)\{[\s\S]*?\n\}/,
    '/* (자기시험) 태블릿 블록 제거 */');
  if (cut === original) {
    console.log('  ✗ NC-3 준비 실패 — 태블릿 블록을 못 찾았다(정규식이 소스와 어긋났다)');
    results.push({ 이름: 'NC-3 ③ 태블릿 구간 블록 제거', 잡음: false, exit: -1 });
  } else {
    check('NC-3 ③ 태블릿 구간 블록 제거 → 뷰포트 구멍', cut, 'CSS-HERO-HOLE');
  }
}

/* ── NC-4 예외 목록이 낡으면 알리는가 ─────────────────────────────────────
   KNOWN 에 등재된 위반 하나를 «고쳐» 놓으면 STALE 이 떠야 한다.
   이게 안 되면 예외 목록은 시간이 지나 「조용한 통과」 장치가 된다. */
{
  // ⚠️ .jt-report-feature 는 파일에 11군데 있다. 지워야 하는 것은 «미디어쿼리 안의
  //    압축 규칙» 하나뿐이다 — 첫 매치를 지우면 엉뚱한 308행이 지워지고 시험이
  //    조용히 실패한다(초판이 실제로 그랬다). grid-template-columns 로 특정한다.
  const noFeature = original.replace(
    /\n\s*\.jt-report-feature \{ grid-template-columns[^}]*\}/,
    '\n  /* (자기시험) 압축 규칙 제거 */');
  if (noFeature === original) {
    console.log('  ✗ NC-4 준비 실패 — 미디어쿼리 안의 .jt-report-feature 압축 규칙을 못 찾았다');
    results.push({ 이름: 'NC-4 예외 해소 감지', 잡음: false, exit: -1 });
  } else {
    check('NC-4 KNOWN 항목을 고쳐 두면 「예외가 낡았다」고 알리는가', noFeature, 'CSS-STALE-KNOWN');
  }
}

/* ── NC-5 ④ 슬로건이 하한 밑으로 떨어지는 결함 ────────────────────────────
   모바일 슬로건 규칙을 지우면 730행 clamp(24px,3.6vw,52px) 가 다시 이겨
   375px 폭에서 3.6vw=13.5px → 하한 24px 가 된다. 배포본이 실제로 그랬다.
   ⚠️ 이 계산이 맞다는 근거: 같은 CSS 로 브라우저에서 잰 값이 375×812 에서 30px,
      375×640 에서 26px 이었고 evalLen 의 계산과 일치했다(260809 실측). */
{
  const noMobileSlogan = original.replace(
    /\n\s*\.jt-brandmoment__slogan\{ font-size: clamp\(28px, 8vw, 40px\) !important; \}/,
    '\n  /* (자기시험) 모바일 슬로건 규칙 제거 */');
  if (noMobileSlogan === original) {
    console.log('  ✗ NC-5 준비 실패 — 모바일 슬로건 규칙을 못 찾았다');
    results.push({ 이름: 'NC-5 슬로건 하한', 잡음: false, exit: -1 });
  } else {
    check('NC-5 ④ 모바일 슬로건 규칙 제거 → 24px 로 떨어지는가', noMobileSlogan, 'CSS-SLOGAN-SMALL');
  }
}

/* ══ 260809 Codex R1 지적으로 추가한 케이스 ═══════════════════════════════
   초판 자기시험은 «단순 선택자·단순 미디어쿼리·파일 끝 추가»만 주입했다.
   파서가 문자열·중첩 괄호·선언 순서에서 깨지는 경로는 아예 건드리지 않았고,
   실제로 `:where(h1,h2,…)` 4건이 쉼표에서 잘려 «없는 선택자»가 되고 있었다. */

/* 「결함이 아닌 것을 넣어도 조용한가」 — 위양성 시험. FAIL 을 기대하지 않는다.
   ⚠️ 260809 Codex R2 P2 지적: PASS 만 확인하면 «주입한 CSS 부터 파서가 망가져도»
      원본 규칙만으로 통과해 시험이 초록이 된다. 그래서 파싱된 규칙 수까지 대조한다 —
      주입분이 실제로 파싱됐고, 기존 규칙도 그대로 남아 있어야 한다. */
const BASE = (() => {
  const { out } = runGate(original);
  const m = out.match(/규칙 (\d+)개 · 선언 (\d+)개/);
  return m ? { rules: +m[1], decls: +m[2] } : null;
})();

function checkPass(이름, css, 기대증가) {
  const { code, out } = runGate(css);
  const m = out.match(/규칙 (\d+)개 · 선언 (\d+)개/);
  const got = m ? +m[1] : -1;
  const want = BASE ? BASE.rules + (기대증가 === undefined ? 0 : 기대증가) : got;
  const 파싱OK = 기대증가 === undefined || got === want;
  const ok = code === 0 && 파싱OK;
  results.push({ 이름, 잡음: ok, exit: code });
  console.log((ok ? '  ✓' : '  ✗') + ' ' + 이름 + ' → ' +
    (code !== 0 ? 'FAIL: 위양성! exit=' + code
     : 파싱OK ? '위양성 없음 (규칙 ' + got + '개)'
     : 'FAIL: 파싱 어긋남 — 규칙 ' + got + '개, 기대 ' + want + '개'));
  if (code !== 0) console.log(out.split('\n').filter((l) => l.indexOf('✗') >= 0).slice(0, 3).map((l) => '      ' + l).join('\n'));
}

/* NC-6 문자열 리터럴이 파서를 깨뜨리지 않는가 (P1-1)
   content 값 안의 중괄호·세미콜론·주석 시작을 구조 문자로 오인하면
   그 뒤 파싱이 통째로 어긋나 «아무것도 못 보는» 게이트가 된다. */
checkPass('NC-6 문자열 안의 중괄호·세미콜론·주석기호에 안 속는가',
  original + '\n.jt-probe-str::after{ content: "} ; /* not a comment */"; color: #fff; }\n', 1);

/* NC-7 :is()/:where() 안의 쉼표에서 선택자를 자르지 않는가 (P1-2)
   자르면 «다른 요소»끼리 비교해 CSS-DEAD-MQ 위양성이 난다. */
checkPass('NC-7 :is() 안의 쉼표로 선택자를 자르지 않는가',
  original +
  '\n@media (max-width: 640px){ .jt-brandmoment:is(.a,.b){ padding-top: 1px !important; } }' +
  '\n.jt-brandmoment:is(.a,.c){ padding-top: 99px !important; }\n', 2);

/* NC-8 같은 규칙 «안»의 뒤 선언이 앞 선언을 이기는가 (P1-4)
   규칙 단위로만 순서를 매기면 뒤 선언이 무시돼 하한 검사를 조용히 통과한다. */
check('NC-8 같은 규칙 안에서 뒤 선언이 이기는가 (30px 뒤에 20px)',
  original + '\n@media (max-width: 640px){ .jt-brandmoment__slogan{ font-size: 30px !important; font-size: 20px !important; } }\n',
  'CSS-SLOGAN-SMALL');

/* NC-9 중첩 길이 함수를 계산하는가 (P1-5)
   정규식으로 쉼표를 나누면 min(8vw,20px) 의 쉼표에서 깨져 «판정 보류»가 되고,
   보류는 곧 못 본 것이다.
   ⚠️ Codex R1 은 `clamp(28px, min(8vw,20px), 40px)` 가 20px 이 된다고 했으나
      브라우저 실측은 **28px** 이다 — clamp 의 첫 인자는 «하한»이라 그 밑으로 못 간다.
      에이전트 말을 그대로 기대값으로 박으면 게이트가 틀린 것을 지킨다. 실제로
      하한 밑으로 떨어지는 식(min 단독, 375px 에서 20px)으로 시험한다. */
check('NC-9 중첩 길이 함수 min(8vw,20px) 계산 (375px 에서 20px)',
  original + '\n@media (max-width: 640px){ .jt-brandmoment__slogan{ font-size: min(8vw, 20px) !important; } }\n',
  'CSS-SLOGAN-SMALL');

/* NC-10 콤마(OR) 미디어쿼리를 첫 조각만 보고 판정하지 않는가 (P1-3)
   태블릿 압축 블록의 조건 앞에 «절대 안 맞는» 조각을 OR 로 붙인다.
   첫 조각만 보는 파서는 이 블록을 없는 것으로 보고 768×1024 에 구멍이 있다고 한다. */
{
  const orCond = original.replace(
    '@media (min-width: 641px) and (max-width: 1024px) and (max-height: 1100px){',
    '@media (min-width: 3000px), (min-width: 641px) and (max-width: 1024px) and (max-height: 1100px){');
  if (orCond === original) {
    console.log('  ✗ NC-10 준비 실패 — 태블릿 블록 조건을 못 찾았다');
    results.push({ 이름: 'NC-10 콤마 OR', 잡음: false, exit: -1 });
  } else {
    checkPass('NC-10 콤마(OR) 미디어쿼리의 둘째 조각도 평가하는가', orCond, 0);
  }
}

/* ══ 260809 Codex R2 지적으로 추가 ═══════════════════════════════════════ */

/* NC-11 «해석 못 한 조건»을 조용히 넘기지 않는가 (R2 P1-4 — 가장 중요)
   범위 문법 (width <= 640px) 은 이 게이트가 못 읽는다. 그런 규칙이 검사 대상에
   닿는데도 「구멍 0건」으로 성공 종료하면, 못 본 것을 본 것처럼 보고하는 것이다. */
check('NC-11 해석 못 한 미디어 조건이 검사 대상에 닿으면 판정 보류를 FAIL 로 올리는가',
  original + '\n@media (width <= 640px){ .jt-brandmoment{ padding-top: 4px !important; } }\n',
  'CSS-UNDECIDED');

/* NC-12 계산 못 하는 길이식도 마찬가지 (R2 P2) */
check('NC-12 계산 못 하는 슬로건 길이식(calc)을 보류가 아니라 FAIL 로 올리는가',
  original + '\n@media (max-width: 640px){ .jt-brandmoment__slogan{ font-size: calc(2rem + 1vw) !important; } }\n',
  'CSS-UNDECIDED');

/* NC-13 clamp 경계 역전 (R2 P1-6)
   브라우저 실측: clamp(40px,20px,28px) = 40px, clamp(60px,10vw,30px) = 60px.
   스펙은 max(MIN, min(VAL,MAX)) 다. 초판의 min(max(...)) 식은 28px 을 내 «작다»고
   오판했다 — 즉 위양성이었다. 지금은 40px 로 계산해 조용해야 한다. */
checkPass('NC-13 clamp 경계가 역전돼도 브라우저와 같게 계산하는가 (하한이 이김)',
  original + '\n@media (max-width: 640px){ .jt-brandmoment__slogan{ font-size: clamp(40px, 20px, 28px) !important; } }\n', 1);

/* NC-14 중첩 @media 의 부모가 콤마(OR)일 때 (R2 P1-1)
   ⚠️ 260809 Codex R3 이 «구별력 있는» 배치를 제시해 그대로 채택했다.
      초판 배치는 두 결합 방식이 같은 답을 내 «직접 증거»가 아니었다.
      부모 (max-width:400px), (min-width:3000px)  /  자식 (min-height:900px)  /  20px 슬로건
        · 올바른 (A OR B) AND C → 375×640 에서 C 가 거짓이라 «비적용» → 조용해야 한다
        · 잘못된 A OR (B AND C) → 첫 절 A 가 375 에서 참이라 «적용» → 20px → SLOGAN-SMALL
      즉 이 시험은 통과(위양성 없음)로 «결합이 올바름»을 직접 보인다. */
checkPass('NC-14 중첩 @media 를 (A OR B) AND C 로 결합하는가 (잘못 이으면 20px 로 잡힌다)',
  original +
  '\n@media (max-width: 400px), (min-width: 3000px){' +
  '\n  @media (min-height: 900px){ .jt-brandmoment__slogan{ font-size: 20px !important; } }' +
  '\n}\n', 1);

/* NC-15 CSS 식별자 이스케이프 (R2 P1-2)
   `.a\,b` 의 `\,` 는 이름의 일부다. 구조 쉼표로 잘리면 «없는 선택자»가 생겨
   ② 가 위양성을 낸다. */
checkPass('NC-15 선택자의 이스케이프된 쉼표·괄호에 안 속는가',
  original + '\n@media (max-width: 640px){ .jt-herocalc\\,probe{ height: 5px !important; } }\n', 1);

/* NC-16 이스케이프가 «선택자의 뜻»을 바꾸지 않는가 (R3 P1)
   구조용 마스크로 선택자까지 잘라 버리면 정상 CSS 인 `.jt-brand\6d oment`(= .jt-brandmoment)
   가 `.jt-brand   oment` 로 저장돼 검사 대상과 매칭되지 않는다. 규칙 수만 세면 못 잡는다.
   그래서 «이겨야 하는 규칙»을 그 표기로 써서, 실제로 승자로 인식되는지 본다:
   유니코드 이스케이프로 쓴 .jt-brandmoment__slogan 에 20px 을 넣으면 잡혀야 한다. */
check('NC-16 유니코드 이스케이프 선택자의 «뜻»을 보존하는가',
  original + '\n@media (max-width: 640px){ .jt-brandmoment__slog\\61 n{ font-size: 20px !important; } }\n',
  'CSS-SLOGAN-SMALL');

/* NC-17 «어차피 지는» 보류 규칙까지 배포를 막지는 않는가 (R3 P1 — 위양성 방지)
   범위 문법 (width <= 640px) 은 정상 CSS 인데 이 게이트가 못 읽는다. 그렇다고
   해석 못 하는 규칙이 «있기만 하면» FAIL 하면, 확정 승자에게 어차피 지는 규칙
   때문에도 배포가 막힌다 — 그러면 사람이 게이트를 꺼 버린다.
   여기서는 !important 없이(= 파일 끝 78px !important 를 못 이김) 넣어, 조용해야 한다.
   ⛔ 반대로 «이길 수 있는» 보류는 NC-11 이 FAIL 로 잡는다. 두 시험이 한 쌍이다. */
checkPass('NC-17 확정 승자에게 지는 보류 규칙은 조용히 넘어가는가',
  original + '\n@media (width <= 640px){ .jt-bm-primary{ height: 999px; } }\n', 1);

/* NC-18 이스케이프 뒤 CRLF 를 «개행 하나»로 소비하는가 (R4 P2)
   CSS 전처리에서 CRLF 는 개행 한 개다. \r 만 소비하고 \n 을 남기면 선택자에
   개행이 섞여 대상과 불일치한다 — 파일이 CRLF 라 실제로 만날 수 있는 형태다. */
check('NC-18 16진 이스케이프 뒤 CRLF 를 개행 하나로 소비하는가',
  original + '\n@media (max-width: 640px){ .jt-brandmoment__slog\\61\r\nn{ font-size: 20px !important; } }\n',
  'CSS-SLOGAN-SMALL');

/* ── 정리 ────────────────────────────────────────────────────────────────── */
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) {}

const 놓친것 = results.filter((r) => !r.잡음);
if (놓친것.length) {
  console.error('\n[css-cascade 자기시험] FAIL — ' + 놓친것.length + '건을 놓쳤다: ' +
                놓친것.map((r) => r.이름).join(', '));
  process.exit(1);
}
console.log('[css-cascade 자기시험] PASS — 주입한 결함 ' + (results.length - 1) + '종 전건 검출 + 원본 위양성 0');

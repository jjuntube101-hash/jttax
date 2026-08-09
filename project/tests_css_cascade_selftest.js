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

/* ── 정리 ────────────────────────────────────────────────────────────────── */
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) {}

const 놓친것 = results.filter((r) => !r.잡음);
if (놓친것.length) {
  console.error('\n[css-cascade 자기시험] FAIL — ' + 놓친것.length + '건을 놓쳤다: ' +
                놓친것.map((r) => r.이름).join(', '));
  process.exit(1);
}
console.log('[css-cascade 자기시험] PASS — 주입한 결함 ' + (results.length - 1) + '종 전건 검출 + 원본 위양성 0');

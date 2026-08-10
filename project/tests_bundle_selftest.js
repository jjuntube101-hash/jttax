'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   번들 게이트의 «음성 대조군» — tests_bundle.js 가 진짜로 잡는지 시험한다

   ▣ 왜 필요한가
     번들 구조의 결함은 «앱 전체가 죽는» 형태로 나타난다(SyntaxError 하나면 끝이다).
     그런데 게이트가 0건을 내는 이유가 ⓐ 멀쩡하다 ⓑ 아무것도 못 본다 중 어느 쪽인지
     화면만 봐서는 구별되지 않는다. 일부러 망가뜨려 잡히는지 본다.

   ▣ 방법
     소스·설정을 개조한 사본으로 «잠시» 덮고 게이트를 돌린 뒤 즉시 원복한다.
     ⛔ 원복 확인까지 한다 — 원본을 망가뜨린 채 끝나면 그게 더 큰 사고다.
   ══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GATE = path.join(__dirname, 'tests_bundle.js');
const 파일 = {
  builder: path.join(__dirname, 'scripts', 'build_bundle.mjs'),
  index: path.join(ROOT, 'index.html'),
  chrome: path.join(ROOT, 'project', 'src', 'Chrome.jsx'),
  bundle: path.join(ROOT, 'project', 'dist', 'app.js'),
};
/* ⛔ 이 시험은 «실제 파일»을 잠시 덮는다. finally 는 일반 예외만 복구하므로 강제 종료·
   전원 장애·동시 실행에서는 개조된 파일이 남을 수 있다(260810 Codex R1 P2).
   → 시작 전에 디스크에 백업을 남기고, 다음 실행이 그 백업을 발견하면 «먼저 복구»한다.
   그래도 남는 위험: 이 시험이 도는 동안 다른 프로세스가 그 파일을 읽으면 개조본을 본다.
   그래서 npm test 안에서만 돌리고, 로컬 서버로 확인 중일 때는 결과를 믿지 말 것. */
const BACKUP_DIR = path.join(__dirname, '..', '.selftest-backup');

if (fs.existsSync(BACKUP_DIR)) {
  console.log('⚠ 이전 실행이 비정상 종료된 흔적이 있습니다 — 백업에서 복구합니다.');
  for (const [k, p] of Object.entries(파일)) {
    const b = path.join(BACKUP_DIR, k);
    if (fs.existsSync(b)) { fs.copyFileSync(b, p); console.log('  복구: ' + path.relative(path.join(__dirname, '..'), p)); }
  }
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
}

const 원본 = Object.fromEntries(Object.entries(파일).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));

fs.mkdirSync(BACKUP_DIR, { recursive: true });
for (const [k, p] of Object.entries(파일)) fs.copyFileSync(p, path.join(BACKUP_DIR, k));
const 백업정리 = () => { try { fs.rmSync(BACKUP_DIR, { recursive: true, force: true }); } catch (_e) {} };

function run() {
  const r = spawnSync(process.execPath, [GATE], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const results = [];
function 시험(이름, 대상, 개조, 기대어구) {
  const 사본 = 개조(원본[대상]);
  if (사본 === 원본[대상]) {
    console.log('  ✗ ' + 이름 + ' → 준비 실패(개조가 적용되지 않음 — 소스와 패턴이 어긋났다)');
    results.push(false);
    return;
  }
  fs.writeFileSync(파일[대상], 사본);
  let r;
  try { r = run(); } finally { fs.writeFileSync(파일[대상], 원본[대상]); }   // 무슨 일이 있어도 원복
  const 잡힘 = r.code !== 0 && r.out.indexOf(기대어구) >= 0;
  results.push(잡힘);
  console.log((잡힘 ? '  ✓ ' : '  ✗ ') + 이름 + ' → ' + (잡힘 ? '잡음' : 'FAIL: 놓쳤다 exit=' + r.code));
  if (!잡힘) console.log(r.out.split('\n').filter((l) => /^FAIL/.test(l)).slice(0, 3).map((l) => '        ' + l).join('\n'));
}

console.log('[번들 게이트 자기시험] 결함 주입 → 잡히는지 확인');

/* 양성 대조군 — 손대지 않은 원본은 통과해야 한다.
   이게 없으면 「무조건 FAIL 하는 게이트」가 아래 시험을 전부 통과해 버린다. */
{
  const { code, out } = run();
  results.push(code === 0);
  console.log((code === 0 ? '  ✓ ' : '  ✗ ') + '양성 대조군(원본 무개조) → ' + (code === 0 ? 'PASS' : '위양성! exit=' + code));
  if (code !== 0) console.log(out.split('\n').filter((l) => /^FAIL/.test(l)).slice(0, 4).map((l) => '        ' + l).join('\n'));
}

/* ★ NC-1 이 가장 중요하다 — 첫 빌드가 «실제로» 이걸로 터졌다.
   별도 <script> 였을 땐 서로 격리돼 안 터졌으므로, 번들에서 처음 생기는 위험이다. */
/* ⚠️ 시험 대상 이름을 «실제로 다른 파일의 최상위 선언»에서 골라야 한다.
   초판은 JT_DATA 를 썼는데 그건 window.JT_DATA 로만 있고 최상위 const 가 아니라
   중복이 아니었다 — 게이트가 아니라 시험이 틀렸다(260810 자기수정).
   useHC 는 HeroCalc.jsx 가 `const { useState: useHC } = React` 로 최상위에 선언한다. */
시험('NC-1 ★ 중복 최상위 선언 (이어붙이면 SyntaxError 로 앱 전체가 죽는다)',
  'chrome',
  (s) => s.replace(/^const \{ useEffect, useState \} = React;/m,
                   'const { useEffect, useState } = React;\nconst useHC = 1;'),
  '중복 최상위 선언');

시험('NC-2 ORDER 에서 소스 하나 누락 (그 컴포넌트가 통째로 사라진다)',
  'builder',
  (s) => s.replace("  'ReportCGT.jsx',\n", ''),
  'ORDER 에 빠진 소스 없음');

시험('NC-3 ORDER 에 없는 파일을 넣음 (빌드가 깨진다)',
  'builder',
  (s) => s.replace("  'Data.jsx',", "  'Data.jsx',\n  'NotExist.jsx',"),
  'ORDER 에 없는 파일 없음');

시험('NC-4 App.jsx 를 맨 마지막이 아닌 곳으로 (정의 전에 render 한다)',
  'builder',
  (s) => s.replace("  'Data.jsx',", "  'App.jsx',\n  'Data.jsx',"),
  'App.jsx 가 «맨 마지막»');

시험('NC-5 HeroCalc 을 Home 뒤로 (Home 이 참조하는데 아직 없다)',
  'builder',
  (s) => s.replace("  'HeroCalc.jsx',\n  'Home.jsx',", "  'Home.jsx',\n  'HeroCalc.jsx',"),
  'HeroCalc 이 Home 보다 먼저');

시험('NC-6 @babel/standalone 을 되살림 (3.0MB 를 다시 받는다)',
  'index',
  (s) => s.replace('<script src="project/dist/app.js',
    '<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>\n  <script src="project/dist/app.js'),
  '@babel/standalone 을 안 받는다');

시험('NC-7 text/babel 스크립트 부활 (Babel 이 다시 필요해진다)',
  'index',
  (s) => s.replace('<script src="project/dist/app.js',
    '<script type="text/babel">const x = 1;</script>\n  <script src="project/dist/app.js'),
  'text/babel 스크립트가 없다');

시험('NC-8 번들에 ?v= 를 빼먹음 (재방문자가 옛 코드를 받는다)',
  'index',
  (s) => s.replace(/src="project\/dist\/app\.js\?v=\d+"/, 'src="project/dist/app.js"'),
  '번들을 버전과 함께 로드한다');

시험('NC-9 번들에서 소스 하나가 빠짐 (빌드를 안 돌리고 커밋한 상태)',
  'bundle',
  (s) => s.replace(/\/\* ────────── ReportCGT\.jsx ────────── \*\//, '/* (제거됨) */'),
  '모든 소스가 번들에 들어갔다');

/* ── 결과 ───────────────────────────────────────────────────────────────── */
const 실패 = results.filter((r) => !r).length;
const 원복OK = Object.entries(파일).every(([k, p]) => fs.readFileSync(p, 'utf8') === 원본[k]);
console.log('  ▸ 원본 원복: ' + (원복OK ? 'OK' : '⛔ 어긋남 — .selftest-backup/ 에서 복구하거나 git 으로 되돌려라!'));
if (원복OK) 백업정리();   // 정상 종료일 때만 백업을 지운다 — 어긋났으면 남겨 둔다

if (실패 || !원복OK) {
  console.error('[번들 자기시험] FAIL — ' + 실패 + '건 실패' + (원복OK ? '' : ' + 원복 실패'));
  process.exit(1);
}
console.log('[번들 자기시험] PASS — 주입한 결함 ' + (results.length - 1) + '종 전건 검출 + 원본 위양성 0');

'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   번들 게이트 — 「합치면서 조용히 깨지는 것」을 막는다 (260810 신설)

   ▣ 배경
     방문자가 @babel/standalone 3.0MB 를 받아 JSX 27개(1,020KB)를 «매 방문마다»
     브라우저에서 변환하고 있었다. 빌드 때 한 번 변환해 파일 하나로 합쳤다.

   ▣ 이 구조가 «조용히» 깨지는 지점 — 전부 실제로 겪었거나 겪을 뻔한 것들
     ① 중복 최상위 선언 → 이어붙이는 순간 SyntaxError 로 «앱 전체»가 죽는다.
        첫 빌드가 실제로 이걸로 터졌다(App.jsx 와 Chrome.jsx 가 useState/useEffect 중복).
        별도 <script> 였을 땐 서로 격리돼 안 터졌으므로, 번들에서 «처음» 생기는 위험이다.
     ② ORDER 누락·잉여 → 컴포넌트가 통째로 사라지거나 빌드가 깨진다.
     ③ 순서 계약 파괴 → Data 가 늦게 오면 나머지가 window.JT_DATA 를 못 읽고,
        App 이 먼저 오면 아직 정의되지 않은 컴포넌트를 render 한다.
     ④ index.html 에 text/babel 이 되살아남 → @babel/standalone 이 다시 필요해진다
        (지우려고 이 작업을 한 것이다).
     ⑤ 번들이 소스와 어긋남 → 라이브가 옛 코드로 돈다. (tests_build_fresh 와 한 쌍)

   ▣ 못 잡는 것
     - 런타임 동작. 합쳐서 문법이 맞아도 실행 순서 의존이 깨질 수 있다 —
       그건 브라우저에서 라우트를 실제로 돌려 봐야 안다.
     - esbuild 변환 결과의 «의미» 차이. Babel 과 다른 산출을 낼 여지는 남는다.
   ══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'project', 'src');
const BUNDLE = path.join(ROOT, 'project', 'dist', 'app.js');
const BUILDER = path.join(__dirname, 'scripts', 'build_bundle.mjs');

const fails = [];
const eq = (label, got, want) => {
  const ok = got === want;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : `\n      got=${JSON.stringify(got)}  want=${JSON.stringify(want)}`));
  if (!ok) fails.push(label);
};

console.log('════ ① ORDER 와 소스가 일치하는가 ════\n');

const builderSrc = fs.readFileSync(BUILDER, 'utf8');
const ORDER = [...(builderSrc.match(/export const ORDER = \[([\s\S]*?)\];/) || ['', ''])[1]
  .matchAll(/'([^']+\.jsx)'/g)].map((m) => m[1]);
const onDisk = fs.readdirSync(SRC).filter((f) => f.endsWith('.jsx')).sort();

eq('ORDER 를 읽어냄', ORDER.length > 0, true);
const 누락 = onDisk.filter((f) => !ORDER.includes(f));
const 잉여 = ORDER.filter((f) => !onDisk.includes(f));
eq('ORDER 에 빠진 소스 없음 (빠지면 그 컴포넌트가 통째로 사라진다)', 누락.join(',') || '-', '-');
eq('ORDER 에 없는 파일 없음 (없는 파일을 가리키면 빌드가 깨진다)', 잉여.join(',') || '-', '-');

console.log('\n════ ② 순서 계약 ════\n');
const at = (n) => ORDER.indexOf(n);
eq('Data.jsx 가 맨 앞 (나머지가 window.JT_DATA 를 읽는다)', at('Data.jsx'), 0);
eq('HeroCalc 이 Home 보다 먼저 (Home 이 window.JTHeroCalc 를 참조)', at('HeroCalc.jsx') < at('Home.jsx'), true);
eq('Chrome 이 App 보다 먼저 (App 이 JTNav·JTFooter 를 쓴다)', at('Chrome.jsx') < at('App.jsx'), true);
eq('App.jsx 가 «맨 마지막» (모든 컴포넌트 정의 뒤에 render)', at('App.jsx'), ORDER.length - 1);

console.log('\n════ ③ 중복 최상위 선언 — 이어붙이면 SyntaxError ════\n');
{
  /* 별도 <script> 였을 땐 서로 격리돼 안 터졌다. 번들에서 «처음» 생기는 위험이라
     사람이 알아채기 어렵다 — 첫 빌드가 실제로 이걸로 터졌다. */
  const declared = new Map();
  for (const f of ORDER) {
    const code = fs.readFileSync(path.join(SRC, f), 'utf8');
    let ast;
    try { ast = parse(code, { sourceType: 'script', plugins: ['jsx'] }); }
    catch (e) { fails.push(`파싱 실패 ${f}: ${e.message}`); continue; }
    const add = (name) => {
      if (!name) return;
      if (!declared.has(name)) declared.set(name, []);
      if (!declared.get(name).includes(f)) declared.get(name).push(f);
    };
    for (const n of ast.program.body) {
      if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) add(n.id.name);
      if (n.type === 'VariableDeclaration') {
        for (const d of n.declarations) {
          if (d.id.type === 'Identifier') add(d.id.name);
          else if (d.id.type === 'ObjectPattern') {
            for (const p of d.id.properties) {
              if (p.type === 'ObjectProperty') add(p.value.type === 'Identifier' ? p.value.name : p.key && p.key.name);
              else if (p.type === 'RestElement' && p.argument.type === 'Identifier') add(p.argument.name);
            }
          } else if (d.id.type === 'ArrayPattern') {
            for (const el of d.id.elements) if (el && el.type === 'Identifier') add(el.name);
          }
        }
      }
    }
  }
  const dup = [...declared].filter(([, files]) => files.length > 1);
  for (const [name, files] of dup) {
    console.log(`FAIL  «${name}» 을 ${files.length}개 파일이 최상위에 선언합니다 — ${files.join(', ')}`);
    console.log('      번들은 이걸 한 스코프에 이어붙이므로 SyntaxError 로 앱 전체가 죽습니다.');
    console.log('      별칭을 쓰세요 (예: const { useState: useXxxState } = React).');
    fails.push(`중복 최상위 선언: ${name}`);
  }
  eq('중복 최상위 선언 0건', dup.length, 0);
}

console.log('\n════ ④ index.html 이 번들만 쓰는가 ════\n');
{
  const raw = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  /* ⚠️ 주석을 걷어내고 본다 — 「종전엔 @babel/standalone 을 받았다」고 «설명하는 주석»을
     실제 로드로 오판해 첫 실행이 거짓 실패를 냈다(260810 자기수정).
     게이트가 위양성을 내면 사람이 게이트를 끈다. */
  const idx = raw.replace(/<!--[\s\S]*?-->/g, '');
  eq('@babel/standalone 을 안 받는다 (3.0MB)', /@babel\/standalone/.test(idx), false);
  eq('text/babel 스크립트가 없다 (있으면 Babel 이 다시 필요해진다)', /type="text\/babel"/.test(idx), false);
  eq('project/src/*.jsx 를 직접 로드하지 않는다', /src="project\/src\/[^"]*\.jsx/.test(idx), false);
  eq('번들을 버전과 함께 로드한다', /src="project\/dist\/app\.js\?v=\d+"/.test(idx), true);
  eq('React·ReactDOM 은 그대로 (번들에 넣지 않았다)', /react(-dom)?\.production\.min\.js/.test(idx), true);
}

console.log('\n════ ⑤ 번들이 소스와 일치하는가 ════\n');
{
  eq('번들 파일이 존재', fs.existsSync(BUNDLE), true);
  if (fs.existsSync(BUNDLE)) {
    const bundle = fs.readFileSync(BUNDLE, 'utf8');
    eq('자동 생성 표식이 있다 (손으로 고치지 말라는 경고)', /자동 생성 파일/.test(bundle), true);
    /* 각 소스가 실제로 들어갔는지 — 구분 주석으로 확인 */
    const 빠진것 = ORDER.filter((f) => bundle.indexOf('────── ' + f + ' ──────') < 0);
    eq('모든 소스가 번들에 들어갔다', 빠진것.join(',') || '-', '-');
    /* JSX 가 남아 있으면 변환이 안 된 것이다 — 브라우저가 그대로 못 읽는다 */
    eq('번들에 변환 안 된 JSX 가 없다', /React\.createElement/.test(bundle), true);
  }
}

console.log('\n════════════════════');
if (fails.length) {
  console.error(`번들 게이트 실패 ${fails.length}건`);
  process.exit(1);
}
console.log('번들 게이트 실패 0건');

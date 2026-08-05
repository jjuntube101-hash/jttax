/* ──────────────────────────────────────────────────────────────────────────
   JSX 스모크 테스트 — «브라우저에서 안 깨지는가»를 배포 전에 잡는다

   ★ 왜 만들었나 (260805 Codex R14)
   접근성 자동 치환이 이미 `role="button"` 을 갖고 있던 앵커에 `role="link"` 를
   덧붙여 **중복 attribute** 를 만들었다. Babel 은 이걸 오류로 처리해
   `Home.jsx` 전체가 로드되지 않았고, **라이브 홈이 헤더만 남고 백지**가 됐다.
   Node 테스트(계산 검산)는 계산부만 잘라 쓰므로 이 사고를 못 잡았다.
   → JSX 파일 «전체»를 실제로 파싱해 본다. 파싱만 통과하면 되므로 빠르다.

   실행:  node project/tests_jsx_smoke.js
   ────────────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.jsx'));
let fails = 0;

/* ── ① 중복 attribute 검출 ─────────────────────────────────────────────
   정규식 `<a\s[^>]*>` 로는 못 잡는다 — onClick={() => …} 의 `>` 에서 잘린다.
   중괄호 깊이를 세어 «진짜» 태그 끝을 찾는다. */
/* 주석 안의 <a> 같은 «예시 코드»를 태그로 오인하지 않도록 먼저 지운다.
   (자리는 공백으로 채워 줄 번호를 보존한다) */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/./g, ' '));
}
function tags(srcRaw, name) {
  const src = stripComments(srcRaw);
  const out = [];
  const re = new RegExp('<' + name + '[\\s>]', 'g');
  let m;
  while ((m = re.exec(src))) {
    let i = m.index, j = m.index + m[0].length - 1, depth = 0;
    while (j < src.length) {
      const c = src[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
      j++;
    }
    out.push({ start: i, text: srcRaw.slice(i, j + 1) });
  }
  return out;
}

const ATTRS = ['role=', 'tabIndex=', 'onKeyDown=', 'className=', 'onClick=', 'style=', 'href='];
for (const f of files) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  for (const el of ['a', 'button', 'div', 'span', 'input']) {
    for (const t of tags(src, el)) {
      for (const a of ATTRS) {
        if (t.text.split(a).length - 1 > 1) {
          const line = src.slice(0, t.start).split('\n').length;
          console.log(`FAIL  중복 속성  ${f}:${line}  <${el}> 에 ${a} 가 2회 이상`);
          fails++;
        }
      }
    }
  }
}

/* ── ② 실제 Babel 파싱 (설치돼 있을 때만) ───────────────────────────── */
let babel = null;
try { babel = require('@babel/standalone'); } catch (e) { /* 미설치 — ①만 수행 */ }
if (babel) {
  for (const f of files) {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    try {
      babel.transform(src, { presets: ['react'], filename: f });
    } catch (e) {
      console.log(`FAIL  Babel 파싱 실패  ${f}  — ${String(e.message).split('\n')[0]}`);
      fails++;
    }
  }
  console.log(`(Babel 파싱 ${files.length}개 파일 수행)`);
} else {
  console.log('(@babel/standalone 미설치 — 중복 속성 검사만 수행. 설치하면 실제 파싱까지 확인)');
}

/* ── ③ 키보드 접근 가능성: href 없는 <a> 는 tabIndex 가 있어야 한다 ── */
for (const f of files) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  for (const t of tags(src, 'a')) {
    if (!t.text.includes('href') && !t.text.includes('tabIndex')) {
      const line = src.slice(0, t.start).split('\n').length;
      console.log(`FAIL  키보드 접근 불가  ${f}:${line}  href 없는 <a> 에 tabIndex 없음`);
      fails++;
    }
  }
}

console.log(`\n════════════════════\nJSX 스모크 실패 ${fails}건`);
process.exit(fails ? 1 : 0);

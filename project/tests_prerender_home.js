/* 홈 첫 화면 선렌더 게이트 (261101 SEO 2-7)

   막으려는 것
   1) JSX(헤더·히어로)를 고쳤는데 index.html 의 선렌더가 옛 마크업으로 남는 것
      → 지금 번들로 다시 그려 index.html 과 글자 단위로 대조. 고치는 법: npm run build
   2) 선렌더용 React 판과 브라우저가 unpkg 에서 받는 판이 어긋나는 것
   3) 스크립트가 다시 동기(defer 없음)로 돌아가 첫 화면이 app.js 를 기다리는 것
   4) 선렌더 때문에 #root 에 h1·main 이 둘이 되거나, 선렌더 안에 스크립트·이벤트 속성이 섞이는 것
*/
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const bad = [];
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

(async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, 'scripts', 'prerender_home.mjs')).href);

  /* 1) 최신성 */
  let parts = null;
  try { parts = mod.renderFirstScreen(); } catch (e) { bad.push('선렌더 실패 — ' + e.message); }
  if (parts && mod.applyToIndex(html, parts) !== html) bad.push('index.html 의 홈 선렌더가 지금 번들과 다릅니다 — npm run build (prerender_home.mjs) 를 다시 돌리세요');

  /* 2) 판 일치: package.json 고정 판 = unpkg 판 */
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const name of ['react', 'react-dom']) {
    const m = html.match(new RegExp(`https://unpkg\\.com/${name}@([0-9.]+)/umd/`));
    const want = m && m[1], got = (pkg.devDependencies || {})[name];
    if (!want || got !== want) bad.push(`package.json devDependencies.${name}(${got}) 가 index.html 의 unpkg 판(${want})과 정확히 같아야 합니다`);
  }

  /* 3) body 끝 스크립트 4개 = defer, 순서 그대로 */
  const bodyAt = html.indexOf('<body');
  const srcs = [...html.slice(bodyAt).matchAll(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)>/g)].map((m) => ({ src: m[2], attrs: m[1] + m[3] }));
  const order = ['unpkg.com/react@', 'unpkg.com/react-dom@', 'project/dist/insight-meta.js', 'project/dist/app.js'];
  if (srcs.length !== order.length || !order.every((o, i) => srcs[i].src.includes(o))) bad.push('index.html — body 의 외부 스크립트가 react → react-dom → insight-meta → app 네 개가 아닙니다');
  for (const s of srcs) if (!/\bdefer\b/.test(s.attrs) || /\basync\b/.test(s.attrs)) bad.push(`index.html — ${s.src} 에 defer 가 없거나 async 가 붙었습니다 (순서 보장·첫 화면 차단 해제)`);

  /* 4) #root 구조 */
  const a = html.indexOf('<div id="root">'), b = html.indexOf('<script', a);
  const rootBlock = html.slice(a, b);
  const count = (re) => (rootBlock.match(re) || []).length;
  if (count(/<h1[\s>]/g) !== 1) bad.push(`#root 의 h1 이 ${count(/<h1[\s>]/g)}개입니다 (1개여야 함)`);
  if (count(/<main[\s>]/g) !== 1) bad.push(`#root 의 main 이 ${count(/<main[\s>]/g)}개입니다 (1개여야 함)`);
  for (const key of ['header', 'hero']) {
    const [open, close] = mod.MARKS[key];
    if (count(new RegExp(open.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'g')) !== 1) { bad.push(`#root 에 ${key} 선렌더 표지가 하나가 아닙니다`); continue; }
    const seg = rootBlock.slice(rootBlock.indexOf(open) + open.length, rootBlock.indexOf(close));
    if (seg.length < 200) bad.push(`${key} 선렌더가 비어 있습니다`);
    if (/<script|\son[a-z]+=/i.test(seg)) bad.push(`${key} 선렌더에 스크립트나 이벤트 속성이 있습니다`);
  }
  const heroSeg = rootBlock.slice(rootBlock.indexOf(mod.MARKS.hero[0]), rootBlock.indexOf(mod.MARKS.hero[1]));
  if (!/<p class="rn-lead">[^<]{20,}<\/p>/.test(heroSeg)) bad.push('히어로 선렌더에 LCP 문단(p.rn-lead)이 없습니다');

  bad.forEach((x) => console.log('FAIL  ' + x));
  console.log(`${bad.length ? '' : 'PASS  '}홈 선렌더 — 실패 ${bad.length}건`);
  process.exit(bad.length ? 1 : 0);
})();

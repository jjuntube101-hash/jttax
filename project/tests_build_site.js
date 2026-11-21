/* build_site.mjs 회귀 시험 — 가짜 저장소에서 «참조된 것만 나가고, 내부 파일은 안 나가며,
   막아야 할 참조는 실패한다»를 확인한다 (261121, Codex TASK-261121-046 R1).
   실제 저장소의 _site 는 건드리지 않는다(임시 폴더에서만 쓴다). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { pathToFileURL } = require('url');

function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'jt-site-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  return root;
}

const BASE = {
  'CNAME': 'www.jttax.co.kr\n',
  'robots.txt': 'Sitemap: https://www.jttax.co.kr/sitemap.xml\n',
  'favicon.ico': 'x',
  'manifest.json': '{"icons":[{"src":"/project/assets/icon192.png"}]}',
  'sitemap.xml': '<urlset><url><loc>https://www.jttax.co.kr/</loc></url><url><loc>https://www.jttax.co.kr/insights/a.html</loc></url><url><loc>https://www.jttax.co.kr/desk/</loc></url></urlset>',
  'google1cc6fd7b3b9fe710.html': 'google-site-verification',
  '3598565b6b534c8fbc4d06ee3adfe9ad.txt': 'x',
  'index.html': '<link href="/project/src/a.css"><script data-src="project/dist/app.js?v=1" data-report-src="project/dist/report-entry.js?v=1"></script>',
  'insights/a.html': '<img src="../project/assets/insights/a-hero.webp"><script src="/project/src/renewal-static.js"></script>',
  'desk/index.html': '<script src="partner-form.js"></script>',
  'desk/partner-form.js': 'location.href = "/desk/thanks.html";',
  'desk/thanks.html': 'ok',
  'project/src/a.css': '@font-face{src:url(../assets/fonts/core.woff2)}',
  'project/src/renewal-static.js': '/* no refs */',
  'project/dist/app.js': 'P={"김":"kim-gahwan"}; img.src="project/assets/logo.png"; icon="./project/assets/dot.svg"; photo="/project/assets/people/renewal/" + P[n] + "-studio.jpg";',
  'project/dist/report-entry.js': 'load("/project/dist/report-other.js?v=2")',
  'project/dist/report-other.js': '',
  'project/assets/icon192.png': 'x',
  'project/assets/logo.png': 'x',
  'project/assets/insights/a-hero.webp': 'x',
  'project/assets/fonts/core.woff2': 'x',
  'project/assets/dot.svg': 'x',
  'project/assets/people/renewal/kim-gahwan-studio.jpg': 'x',
  'project/assets/people/renewal/team-x.jpg': 'x', // 같은 폴더지만 이름이 어디에도 없다
  'project/assets/people/renewal/notes.txt': 'x',
  'project/assets/people/renewal/deep/raw.jpg': 'x',
  // 아무도 참조하지 않는 내부 파일 — 나가면 안 된다
  'internal.html': 'secret',
  'insights/internal.html': 'secret',
  'insights/Dev/internal.js': 'secret',
  'project/assets/unused.png': 'x',
  'project/src/App.jsx': 'secret',
  'project/dev/release.json': '{}',
  'project/tests_x.js': '',
  'HANDOFF_261121.md': 'secret',
  'package.json': '{}',
};

(async () => {
  const { buildSite, denyReason } = await import(pathToFileURL(path.join(__dirname, 'scripts', 'build_site.mjs')).href);
  let n = 0;
  const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

  // ① 정상 저장소: 참조된 것만 나간다
  {
    const root = makeRepo(BASE);
    const out = path.join(root, '_site');
    const r = buildSite({ root, out });
    assert.deepEqual(r.errors, [], '정상 저장소는 오류 0');
    const shipped = new Set(r.picked);
    for (const must of ['index.html', 'insights/a.html', 'desk/index.html', 'desk/partner-form.js', 'desk/thanks.html',
      'project/src/a.css', 'project/assets/fonts/core.woff2', 'project/dist/app.js', 'project/dist/report-entry.js',
      'project/dist/report-other.js', 'project/assets/logo.png', 'project/assets/insights/a-hero.webp',
      'project/assets/people/renewal/kim-gahwan-studio.jpg', 'project/assets/dot.svg', 'project/assets/icon192.png', 'google1cc6fd7b3b9fe710.html',
      '3598565b6b534c8fbc4d06ee3adfe9ad.txt', 'CNAME', 'robots.txt', 'sitemap.xml', 'manifest.json', 'favicon.ico']) {
      ok(shipped.has(must), `포함되어야 함: ${must}`);
      ok(fs.existsSync(path.join(out, must)), `_site 에 복사되어야 함: ${must}`);
    }
    for (const no of ['internal.html', 'insights/internal.html', 'insights/Dev/internal.js', 'project/assets/unused.png',
      'project/src/App.jsx', 'project/dev/release.json', 'project/tests_x.js', 'HANDOFF_261121.md', 'package.json',
      'project/assets/people/renewal/notes.txt', 'project/assets/people/renewal/deep/raw.jpg',
      'project/assets/people/renewal/team-x.jpg']) {
      ok(!shipped.has(no), `제외되어야 함: ${no}`);
      ok(!fs.existsSync(path.join(out, no)), `_site 에 없어야 함: ${no}`);
    }
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ② 공개 페이지가 원본·개발 파일을 참조하면 실패 (대소문자 무시)
  for (const [bad, label] of [
    ['<script src="/project/src/App.jsx"></script>', 'jsx 참조'],
    ['<img src="/project/assets/Dev/shot.png">', '대문자 Dev 폴더'],
    ['<a href="/project/tests_x.js">', '시험 파일'],
    ['<a href="/HANDOFF_261121.md">', '내부 기록'],
    ['<a href="/project/dev/release.json">', 'dev JSON'],
  ]) {
    const files = { ...BASE, 'insights/a.html': BASE['insights/a.html'] + bad, 'project/assets/Dev/shot.png': 'x' };
    const root = makeRepo(files);
    const r = buildSite({ root, out: path.join(root, '_site') });
    ok(r.errors.length > 0, `실패해야 함: ${label}`);
    ok(!fs.existsSync(path.join(root, '_site')), `실패하면 _site 를 만들지 않음: ${label}`);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ③ JS 안의 상대 경로는 «불러온 문서» 기준으로 해석한다 (R1-F3)
  {
    const files = { ...BASE, 'project/dist/app.js': 'img.src="project/src/App.jsx";' };
    const root = makeRepo(files);
    const r = buildSite({ root, out: path.join(root, '_site') });
    ok(r.errors.some((e) => e.includes('project/src/App.jsx')), 'JS 상대 경로를 문서 기준으로 풀어 금지 참조를 잡는다');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ③-b project/ 안을 가리키는데 저장소에 없는 참조, assets 밖 폴더의 동적 참조는 실패 (R2-F2)
  for (const [js, label, needle] of [
    ['img.src="./project/assets/gone.png";', '없는 파일(./ 상대)', 'project/assets/gone.png'],
    ['s="/project/src/" + name;', 'assets 밖 동적 폴더', 'project/src/'],
    ['p="/project/assets/people/other/" + x + ".jpg";', '명시 목록에 없는 동적 폴더', 'people/other/'],
    // R3-F1: 무관한 문자열 "secret" 이 있어 secret-studio.jpg 가 «불릴 수 있는» 후보가 되면 — 넣지 않고 실패
    ['P={"a":"kim-gahwan"}; t="secret"; p="/project/assets/people/renewal/" + P[n] + "-studio.jpg";', '명시 목록 밖 후보', 'secret-studio.jpg'],
  ]) {
    const root = makeRepo({ ...BASE, 'project/dist/app.js': js, 'project/assets/people/other/a.jpg': 'x', 'project/assets/people/renewal/secret-studio.jpg': 'x' });
    const r = buildSite({ root, out: path.join(root, '_site') });
    ok(r.errors.some((e) => e.includes(needle)), `실패해야 함: ${label}`);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ③-c sitemap 주소가 없는 페이지를 가리키면 실패 (R3-F2)
  {
    const root = makeRepo({ ...BASE, 'sitemap.xml': BASE['sitemap.xml'].replace('</urlset>', '<url><loc>https://www.jttax.co.kr/insights/missing.html</loc></url></urlset>') });
    const r = buildSite({ root, out: path.join(root, '_site') });
    ok(r.errors.some((e) => e.includes('insights/missing.html')), 'sitemap 의 없는 페이지 주소는 실패');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ③-d 주석 속 참조·이름만 적힌 문자열은 따라가지 않는다 (R4-F1)
  {
    const files = {
      ...BASE,
      'index.html': BASE['index.html'] + '<!-- retired <script src="/desk/preview.js"></script> -->',
      'desk/preview.js': 'var client="/desk/internal.html";',
      'desk/internal.html': 'secret',
      'project/dist/app.js': BASE['project/dist/app.js'] + ' var label="internal.html"; // 옛 화면 /desk/old.html\n/* "/project/assets/old.png" */',
      'desk/old.html': 'secret',
      'project/assets/old.png': 'x',
      'project/src/a.css': BASE['project/src/a.css'] + '/* url(../assets/old2.png) */',
      'project/assets/old2.png': 'x',
    };
    const root = makeRepo(files);
    const r = buildSite({ root, out: path.join(root, '_site') });
    assert.deepEqual(r.errors, [], '주석 처리한 참조는 오류도 내지 않는다');
    for (const no of ['desk/preview.js', 'desk/internal.html', 'internal.html', 'desk/old.html', 'project/assets/old.png', 'project/assets/old2.png']) {
      ok(!r.picked.includes(no), `주석·이름 문자열로 끌려오면 안 됨: ${no}`);
    }
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ③-e 템플릿 문자열로 조합한 경로 (R4-F2): 명시 목록 폴더면 포함, 아니면 실패
  {
    const root = makeRepo({ ...BASE, 'project/dist/app.js': 'P={"a":"kim-gahwan"}; img.src=`/project/assets/people/renewal/${P[n]}-studio.jpg`;' });
    const r = buildSite({ root, out: path.join(root, '_site') });
    assert.deepEqual(r.errors, [], '명시 목록 폴더의 템플릿 경로는 통과');
    ok(r.picked.includes('project/assets/people/renewal/kim-gahwan-studio.jpg'), '템플릿 경로 파일 포함');
    fs.rmSync(root, { recursive: true, force: true });
  }
  for (const [js, label] of [
    ['img.src=`/project/assets/insights/${slug}-hero.webp`;', '명시 목록에 없는 폴더의 템플릿 경로'],
    ['img.src=`/project/assets/x-${n}.png`;', '폴더가 아닌 템플릿 조각'],
  ]) {
    const root = makeRepo({ ...BASE, 'project/dist/app.js': js });
    const r = buildSite({ root, out: path.join(root, '_site') });
    ok(r.errors.length > 0, `실패해야 함: ${label}`);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ④ 필수 파일이 없으면 실패
  {
    const files = { ...BASE };
    delete files['CNAME'];
    const root = makeRepo(files);
    const r = buildSite({ root, out: path.join(root, '_site') });
    ok(r.errors.some((e) => e.includes('CNAME')), 'CNAME 없으면 실패');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ⑤ 금지 규칙 단위 확인
  for (const p of ['project/src/App.JSX', 'insights/DEV/x.png', 'a/.env', 'project/Fixtures/a.png', 'x/Tests_a.js', 'project/asset_versions.json', 'desk/notes.md']) {
    ok(denyReason(p), `금지되어야 함: ${p}`);
  }
  for (const p of ['index.html', 'manifest.json', 'project/dist/app.js', 'project/assets/people/renewal/kim.jpg']) {
    ok(!denyReason(p), `허용되어야 함: ${p}`);
  }

  console.log(`OK build_site: ${n} checks`);
})().catch((e) => { console.error(e); process.exit(1); });

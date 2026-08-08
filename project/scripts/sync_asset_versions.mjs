/* index.html 의 `?v=` 와 각 jsx 의 sha256 을 기록해 둔다.
   .jsx 를 고치고 index.html 의 버전을 올린 «뒤»에 실행한다 — 그러면
   tests_asset_versions.js 가 「고쳤는데 버전을 안 올린」 다음 번을 잡아 준다. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const OUT = path.join(HERE, '..', 'asset_versions.json');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* 해시 전에 줄끝을 정규화한다.
   git 의 core.autocrlf=true 환경에서 체크아웃하면 텍스트 파일이 CRLF 로 변환되어,
   내용이 한 글자도 안 바뀌었는데 해시가 달라진다. 그대로 두면 clone 한 사람이나
   CI 에서 이 게이트가 «전 파일 FAIL» 로 거짓 경보를 낸다(260808 실측 11건).
   바이너리(og-image.png 등)는 손대지 않는다 — 정규화하면 파일이 깨진다.
   ⚠️ 버전 관리 대상에 «새 바이너리 형식»을 넣을 때는 이 목록과 tests_asset_versions.js
      의 같은 목록을 함께 고칠 것. 빠뜨리면 그 파일은 텍스트로 취급돼 조용히 손상된다. */
const BINARY = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|otf|pdf|zip)$/i;
const sha = (rel) => {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  const data = BINARY.test(rel) ? buf : Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  return crypto.createHash('sha256').update(data).digest('hex');
};

const rec = {};

/* .jsx — <script type="text/babel" src="..."> */
const reJsx = /src="(project\/src\/([A-Za-z0-9_.-]+\.jsx))\?v=(\d+)"/g;
let m;
while ((m = reJsx.exec(html)) !== null) rec[m[1]] = { v: m[3], sha256: sha(m[1]) };
const nJsx = Object.keys(rec).length;
if (nJsx < 10) throw new Error(`index.html 에서 jsx 를 ${nJsx}개만 찾았습니다 — 구조를 확인하세요.`);

/* .css — <link rel="stylesheet" href="..."> (260808 추가)
   CSS 를 고쳐도 `?v=` 를 안 올리면 재방문자에겐 옛 스타일이 간다. jsx 만 보던
   종전 게이트는 이걸 못 잡았고, 정적 45 장은 `?v=` 자체가 없었다. */
const reCss = /href="(project\/src\/([A-Za-z0-9_.-]+\.css))\?v=(\d+)"/g;
while ((m = reCss.exec(html)) !== null) rec[m[1]] = { v: m[3], sha256: sha(m[1]) };

/* @import 로만 들어오는 CSS — styles.css 안의 `@import url("./colors_and_type.css?v=2")`.
   엔트리만 보면 이 파일을 고쳐도 캐시가 안 깨진다. */
const stylesRel = 'project/src/styles.css';
if (fs.existsSync(path.join(ROOT, stylesRel))) {
  const css = fs.readFileSync(path.join(ROOT, stylesRel), 'utf8');
  const reImp = /@import\s+url\(\s*["']\.\/([A-Za-z0-9_.-]+\.css)\?v=(\d+)["']\s*\)/g;
  while ((m = reImp.exec(css)) !== null) {
    const rel = `project/src/${m[1]}`;
    rec[rel] = { v: m[2], sha256: sha(rel) };
  }
}

const nCss = Object.keys(rec).length - nJsx;
if (nCss < 2) throw new Error(`css 를 ${nCss}개만 찾았습니다 — index.html/styles.css 구조를 확인하세요.`);

/* og-image.png — 「PNG 를 갈아 끼웠는데 ?v= 는 그대로」를 막는다 (260808).
   코드가 아니라 «그림»이라 아무 테스트도 안 보고 있었는데, 카카오·페이스북은
   URL 단위로 캐시하므로 버전이 그대로면 새 이미지가 영영 안 나간다. */
const OG_REL = 'project/assets/og-image.png';
{
  /* `og:image:width` 같은 보조 태그에 걸리지 않도록 property 값을 «정확히» 대조 */
  const tag = (html.match(/<meta[^>]*>/gi) || []).find((t) => /(property|name)=["']og:image["']/i.test(t));
  const ogUrl = tag && (/content=["']([^"']+)["']/i.exec(tag) || [])[1];
  const m = ogUrl && /og-image\.png\?v=(\d+)/.exec(ogUrl);
  if (!m) throw new Error('index.html 의 og:image 를 못 찾았거나 ?v= 가 없습니다 — 버전을 붙이세요.');
  rec[OG_REL] = { v: m[1], sha256: sha(OG_REL) };
}

/* 버전 하락 거부 — 되돌린 번호로 sync 하면 게이트가 무력화된다 */
if (fs.existsSync(OUT)) {
  const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const down = Object.keys(rec)
    .filter((k) => prev[k] && Number(rec[k].v) < Number(prev[k].v))
    .map((k) => `${k} (기록 v${prev[k].v} → 현재 v${rec[k].v})`);
  if (down.length) {
    throw new Error('버전이 «내려간» 자산이 있어 기록을 갱신하지 않았습니다:\n  - ' + down.join('\n  - '));
  }
}

fs.writeFileSync(OUT, JSON.stringify(rec, null, 2) + '\n', 'utf8');
console.log(`✓ asset_versions.json 갱신 — jsx ${nJsx}개 + css ${nCss}개`);

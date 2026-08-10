/* 캐시 무효화 버전 게이트 — 「고쳤는데 사용자에겐 옛 파일이 가는」 사고를 막는다.

   index.html 은 `project/src/X.jsx?v=NN` 형태로 캐시를 무효화한다. .jsx 를 고치고도
   `?v=` 를 안 올리면 **재방문자는 옛 코드를 계속 받는다** — 고친 것이 배포되지 않는다.
   260806 실사고: 계산기 3종 수정을 푸시하면서 index.html 을 빼먹었다. 직전 8개 커밋은
   전부 함께 올렸는데(= 이게 이 저장소의 규약인데) 나만 빠뜨렸고, 브라우저가 옛 파일을
   쓰는 것을 실측하고서야 알았다.

   판정: 파일 내용(sha256)이 기록과 다른데 `?v=` 가 그대로면 FAIL.
   버전을 올린 뒤에는 `node project/scripts/sync_asset_versions.mjs` 로 기록을 갱신한다. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(__dirname, 'asset_versions.json');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const live = {};
let m;

/* ⚠️ 260810 번들 전환: index.html 은 이제 JSX 27개가 아니라 «번들 하나»를 로드한다
   (@babel/standalone 3.0MB 를 방문자에게서 걷어내려고). 추적 대상도 그 하나다.
   「소스를 고쳤는데 번들을 안 만들었다」는 tests_build_fresh.js 가,
   「번들이 바뀌었는데 ?v= 를 안 올렸다」는 여기가 막는다 — 둘이 한 쌍이다. */
const reBundle = /src="(project\/dist\/app\.js)\?v=(\d+)"/g;
while ((m = reBundle.exec(html)) !== null) live[m[1]] = { v: m[2] };
const jsxCount = Object.keys(live).length;
if (jsxCount !== 1) throw new Error(`index.html 에서 버전 붙은 번들을 ${jsxCount}개 찾았습니다(1개여야 정상) — 구조가 바뀌었는지 확인하세요.`);

/* CSS 도 같은 사고를 낸다 (260808 추가) — index.html 이 로드하는 전수 +
   styles.css 가 @import 로 끌어오는 것까지. 엔트리만 보면 colors_and_type.css 를
   고쳐도 캐시가 안 깨진다. */
const reCss = /href="(project\/src\/([A-Za-z0-9_.-]+\.css))\?v=(\d+)"/g;
while ((m = reCss.exec(html)) !== null) live[m[1]] = { v: m[3] };
const stylesRel = 'project/src/styles.css';
if (fs.existsSync(path.join(ROOT, stylesRel))) {
  const css = fs.readFileSync(path.join(ROOT, stylesRel), 'utf8');
  const reImp = /@import\s+url\(\s*["']\.\/([A-Za-z0-9_.-]+\.css)\?v=(\d+)["']\s*\)/g;
  while ((m = reImp.exec(css)) !== null) live[`project/src/${m[1]}`] = { v: m[2] };
}
const cssCount = Object.keys(live).length - jsxCount;
if (cssCount < 2) throw new Error(`버전 붙은 css 를 ${cssCount}개만 찾았습니다 — index.html/styles.css 구조를 확인하세요.`);

/* og-image.png — 코드가 아니라 «그림»이라 아무 테스트도 안 보고 있던 자산(260808).
   재생성해 놓고 ?v= 를 안 올리면 SNS 공유 미리보기가 옛 이미지로 굳는다. */
{
  /* `og:image:width` 같은 보조 태그에 걸리지 않도록 property 값을 «정확히» 대조 */
  const tag = (html.match(/<meta[^>]*>/gi) || []).find((t) => /(property|name)=["']og:image["']/i.test(t));
  const url = tag && (/content=["']([^"']+)["']/i.exec(tag) || [])[1];
  const m = url && /og-image\.png\?v=(\d+)/.exec(url);
  if (!m) throw new Error('index.html 의 og:image 를 못 찾았거나 ?v= 가 없습니다 — 버전을 붙이세요.');
  live['project/assets/og-image.png'] = { v: m[1] };
}
const liveCount = Object.keys(live).length;

/* 해시 전에 줄끝을 정규화한다 — sync_asset_versions.mjs 와 같은 규칙이어야 한다.
   core.autocrlf=true 로 체크아웃하면 텍스트가 CRLF 가 되어 내용이 같은데도
   해시가 달라진다. 그대로 두면 clone 한 환경에서 이 게이트가 전 파일 거짓 FAIL
   을 낸다(260808 실측 11건 — 별도 워크트리로 커밋 트리를 검증하다 드러났다).
   바이너리는 손대지 않는다 — 정규화하면 파일이 깨진다.
   ⚠️ 새 바이너리 형식을 버전 관리에 넣을 때는 sync_asset_versions.mjs 의 같은 목록도
      함께 고칠 것 — 두 곳이 어긋나면 기준선과 판정이 갈린다. */
const BINARY = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|otf|pdf|zip)$/i;
const sha = (rel) => {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  const data = BINARY.test(rel) ? buf : Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  return crypto.createHash('sha256').update(data).digest('hex');
};

let fails = 0;
const bad = [];
if (!fs.existsSync(MANIFEST)) {
  console.log(`[SKIP] ${path.basename(MANIFEST)} 없음 — sync 스크립트로 최초 생성하세요.`);
  fails++;
} else {
  const rec = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  for (const rel of Object.keys(live)) {
    const cur = sha(rel), r = rec[rel];
    if (!r) { bad.push(`${rel} — 기록에 없음 (sync 필요)`); continue; }
    const nowV = Number(live[rel].v), recV = Number(r.v);
    if (cur !== r.sha256) {
      /* 내용이 바뀌었으면 «올라가야» 한다. 같은 번호만 잡으면 v40 → v3 처럼
         내리거나 옛 번호를 재사용해도 통과한다(260808 보강). */
      if (nowV <= recV) {
        bad.push(`${rel} — 내용이 바뀌었는데 ?v=${live[rel].v} 입니다 (기록 v${r.v}). 기록보다 «큰» 번호로 올리세요.`);
      }
    } else if (nowV < recV) {
      bad.push(`${rel} — 내용은 그대로인데 ?v= 가 v${r.v} → v${live[rel].v} 로 내려갔습니다.`);
    }
  }
  /* 기록에만 있고 index.html 에 없는 항목도 알린다(파일 제거·이름변경 누락) */
  for (const rel of Object.keys(rec)) if (!live[rel]) bad.push(`${rel} — index.html 에서 사라졌습니다 (sync 필요)`);
}
bad.forEach((b) => { fails++; console.log('FAIL  ' + b); });
console.log(`${fails ? '' : 'PASS  '}캐시 버전 정합 — jsx ${jsxCount}개 + css ${cssCount}개 + og-image 점검`);
console.log(`\n════════════════════\n버전 게이트 실패 ${fails}건`);
process.exit(fails ? 1 : 0);

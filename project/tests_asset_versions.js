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
const re = /src="(project\/src\/([A-Za-z0-9_.-]+\.jsx))\?v=(\d+)"/g;
let m;
while ((m = re.exec(html)) !== null) live[m[1]] = { v: m[3] };
const liveCount = Object.keys(live).length;
if (liveCount < 10) throw new Error(`index.html 에서 버전 붙은 jsx 를 ${liveCount}개만 찾았습니다 — 구조가 바뀌었는지 확인하세요.`);

const sha = (rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');

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
    if (cur !== r.sha256 && live[rel].v === r.v) {
      bad.push(`${rel} — 내용이 바뀌었는데 ?v=${live[rel].v} 그대로입니다. index.html 의 버전을 올리세요.`);
    }
  }
  /* 기록에만 있고 index.html 에 없는 항목도 알린다(파일 제거·이름변경 누락) */
  for (const rel of Object.keys(rec)) if (!live[rel]) bad.push(`${rel} — index.html 에서 사라졌습니다 (sync 필요)`);
}
bad.forEach((b) => { fails++; console.log('FAIL  ' + b); });
console.log(`${fails ? '' : 'PASS  '}캐시 버전 정합 — jsx ${liveCount}개 점검`);
console.log(`\n════════════════════\n버전 게이트 실패 ${fails}건`);
process.exit(fails ? 1 : 0);

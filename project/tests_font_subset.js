/* 폰트 서브셋 게이트 (261101 SEO 2-6)

   막으려는 것
   1) 사이트 원문에 새 글자가 들어왔는데 서브셋에 없어서 그 글자만 시스템 폰트로 보이는 것
      → 원문 글자 중 «원본에는 있으나 서브셋에서 뺀 글자»가 하나라도 있으면 실패. 고치는 법: python project/scripts/build-font-subset.py
   2) 목록 파일(pretendard-subset.json)이 실제 폰트 파일과 어긋나는 것 → sha256 대조
   3) 원본 2MB 폰트나 외부 웹폰트 @import 가 다시 들어오는 것
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FONT_DIR = path.join(ROOT, 'project', 'assets', 'fonts');
const bad = [];
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const man = JSON.parse(fs.readFileSync(path.join(FONT_DIR, 'pretendard-subset.json'), 'utf8'));
if (sha(path.join(FONT_DIR, man.subset)) !== man.subset_sha256) bad.push(`${man.subset} 가 목록 파일의 sha256 과 다릅니다 — build-font-subset.py 를 다시 돌리세요`);
if (sha(path.join(FONT_DIR, man.source)) !== man.source_sha256) bad.push(`${man.source}(원본)이 바뀌었습니다 — build-font-subset.py 를 다시 돌리세요`);
if (man.subset_bytes > 800 * 1024) bad.push(`서브셋이 ${man.subset_bytes} 바이트입니다 (800KB 이하여야 함)`);

/* 원문 글자 — build-font-subset.py 의 SOURCE_GLOBS·SKIP_PREFIX 와 같다 */
const SOURCE_GLOBS = ['*.html', '*.jsx', '*.mjs', '*.md', '*.css'];
const SKIP_PREFIX = ['node_modules/', 'project/dist/', 'project/dev/'];
const files = execFileSync('git', ['-C', ROOT, 'ls-files', ...SOURCE_GLOBS], { encoding: 'utf8' }).split('\n')
  .filter((f) => f && !SKIP_PREFIX.some((p) => f.startsWith(p)));
const inRanges = (cp, ranges) => {   // ranges 는 정렬된 [시작, 끝] — 이분 탐색
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid][0]) hi = mid - 1; else if (cp > ranges[mid][1]) lo = mid + 1; else return true;
  }
  return false;
};
const missing = new Map();
for (const rel of files) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  for (const ch of fs.readFileSync(p, 'utf8')) {
    const cp = ch.codePointAt(0);
    if (inRanges(cp, man.dropped) && !missing.has(ch)) missing.set(ch, rel);
  }
}
for (const [ch, rel] of missing) bad.push(`원문 글자 «${ch}»(U+${ch.codePointAt(0).toString(16).toUpperCase()}, ${rel})가 서브셋에 없습니다 — build-font-subset.py 를 다시 돌리세요`);

/* 3) CSS 가 서브셋을 쓰는지, 원본·외부 웹폰트가 돌아오지 않았는지 */
const srcDir = path.join(ROOT, 'project', 'src');
for (const f of fs.readdirSync(srcDir).filter((n) => n.endsWith('.css'))) {
  const css = fs.readFileSync(path.join(srcDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/@import\s+url\(\s*["']?https?:/i.test(css)) bad.push(`project/src/${f} — 외부 웹폰트 @import 가 있습니다 (자체 호스팅 서브셋을 쓰세요)`);
  if (/PretendardVariable\.woff2/.test(css)) bad.push(`project/src/${f} — 원본 PretendardVariable.woff2(약 2MB)를 직접 씁니다`);
}
const renewal = fs.readFileSync(path.join(srcDir, 'renewal.css'), 'utf8');
const faces = [...renewal.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map((m) => m[1]);
for (const fam of ['JT Pretendard', 'Pretendard', 'Pretendard Variable']) {
  const face = faces.find((b) => new RegExp(`font-family:\\s*"${fam}"`).test(b));
  if (!face) { bad.push(`renewal.css — «${fam}» @font-face 가 없습니다`); continue; }
  if (!face.includes(`../assets/fonts/${man.subset}`)) bad.push(`renewal.css — «${fam}» 가 서브셋 파일을 쓰지 않습니다`);
  if (!/font-display:\s*swap/.test(face)) bad.push(`renewal.css — «${fam}» 에 font-display: swap 이 없습니다`);
}

bad.forEach((b) => console.log('FAIL  ' + b));
console.log(`${bad.length ? '' : 'PASS  '}폰트 서브셋 — 원문 ${files.length}개 파일, 서브셋 ${man.subset_bytes} 바이트, 뺀 글자 구간 ${man.dropped.length}개`);
process.exit(bad.length ? 1 : 0);

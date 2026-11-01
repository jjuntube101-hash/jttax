/* 이미지 무게 게이트 (261101 SEO 이미지 압축)

   막으려는 것
   1) 글 hero 를 WebP 로 줄여 놓았는데 화면·공유 경로가 어긋나는 것
      — 화면(글 첫 화면 figure)은 hero(WebP), 공유(og·twitter·JSON-LD)는 heroShare(원본 PNG)여야 한다
   2) 줄인 WebP 가 다시 무거워지는 것(장당 300KB 넘으면 FAIL)
   3) 대표 사진(Data.jsx team.partners photo)이 다시 무거운 원본으로 돌아가는 것(장당 400KB 넘으면 FAIL)
   경고만: 새 글이 무거운 PNG hero 로 올라온 것 — 고치는 법: python project/scripts/build-insight-webp.py
   (매일 글을 올리는 자동화의 배포를 막지 않으려고 FAIL 이 아니라 경고로 둔다)
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const bad = [];
const warn = [];
const kb = (rel) => Math.round(fs.statSync(path.join(ROOT, rel.replace(/^\//, ''))).size / 1024);
const exists = (rel) => fs.existsSync(path.join(ROOT, rel.replace(/^\//, '')));
// 화소 크기(머리 바이트만 읽는다) — PNG IHDR, WebP VP8/VP8L/VP8X. 그 밖의 형식은 null(검사 건너뜀)
function dims(rel) {
  const b = fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')));
  if (b.toString('latin1', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('latin1', 12, 16);
  if (chunk === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') return [1 + (b[21] | ((b[22] & 0x3f) << 8)), 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10))];
  if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  return null;
}

const SRC = path.join(__dirname, 'insights');
let webpCount = 0;
for (const name of fs.readdirSync(SRC).filter((n) => n.endsWith('.md')).sort()) {
  const raw = fs.readFileSync(path.join(SRC, name), 'utf8').replace(/\r\n/g, '\n');
  const block = (raw.match(/^---\n([\s\S]*?)\n---/) || [])[1];
  if (!block) continue;
  const field = (k) => ((block.match(new RegExp('^' + k + ':[ \\t]*(.*)$', 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
  const hero = field('hero');
  if (!hero) continue;
  const share = field('heroShare');
  const slug = field('slug') || name.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
  if (!exists(hero)) { bad.push(`${name}: hero 파일이 없습니다 — ${hero}`); continue; }
  if (/\.webp$/.test(hero)) {
    webpCount++;
    if (kb(hero) > 300) bad.push(`${name}: hero WebP 가 ${kb(hero)}KB 입니다(300KB 이하)`);
    if (!share) { bad.push(`${name}: hero 가 WebP 인데 공유용 heroShare(원본 PNG/JPG)가 없습니다`); continue; }
    if (share.replace(/\.[a-z]+$/, '') !== hero.replace(/\.[a-z]+$/, '')) bad.push(`${name}: heroShare(${share})가 hero(${hero})와 같은 이름의 원본이 아닙니다`);
    if (!exists(share)) bad.push(`${name}: heroShare 파일이 없습니다 — ${share}`);
    else {
      // 원본을 갈아 끼우고 WebP 를 다시 만들지 않으면 화면과 공유가 다른 그림이 된다 — 화소 크기로 잡는다 (Codex R1-F1)
      const a = dims(hero), b = dims(share);
      if (a && b && (a[0] !== b[0] || a[1] !== b[1])) bad.push(`${name}: hero WebP(${a.join('x')})와 원본(${b.join('x')})의 크기가 다릅니다 — python project/scripts/build-insight-webp.py --refresh`);
      if (!a) bad.push(`${name}: hero WebP 크기를 읽지 못했습니다 — 손상된 파일인지 확인하세요`);
    }
    const page = path.join(ROOT, 'insights', slug + '.html');
    if (!fs.existsSync(page)) { bad.push(`${name}: 글 페이지 insights/${slug}.html 이 없습니다 — npm run build`); continue; }
    const html = fs.readFileSync(page, 'utf8');
    if (!html.includes(`<figure class="jt-ed-hero"><img src="${hero}"`)) bad.push(`insights/${slug}.html: 첫 화면 그림이 hero(WebP)가 아닙니다`);
    for (const [label, re] of [['og:image', /<meta property="og:image" content="([^"]+)"/], ['twitter:image', /<meta name="twitter:image" content="([^"]+)"/]]) {
      const v = (html.match(re) || [])[1] || '';
      if (!v.endsWith(share)) bad.push(`insights/${slug}.html: ${label} 가 heroShare(${share})가 아닙니다 — «${v}»`);
    }
  } else if (kb(hero) > 600) {
    warn.push(`${name}: hero ${hero} 가 ${kb(hero)}KB 입니다 — python project/scripts/build-insight-webp.py`);
  }
}
if (!webpCount) bad.push('WebP hero 글이 하나도 없습니다 — 검사가 아무것도 보지 않았습니다');

// 대표 사진 — Data.jsx 의 team.partners photo
const data = fs.readFileSync(path.join(__dirname, 'src', 'Data.jsx'), 'utf8');
const photos = [...data.matchAll(/photo:\s*'(\/project\/assets\/people\/[^']+)'/g)].map((m) => m[1]);
if (photos.length < 3) bad.push(`Data.jsx 대표 사진을 ${photos.length}개만 찾았습니다(3개 이상이어야 합니다)`);
for (const p of photos) {
  if (!exists(p)) bad.push(`Data.jsx 사진 파일이 없습니다 — ${p}`);
  else if (kb(p) > 400) bad.push(`Data.jsx 사진 ${p} 가 ${kb(p)}KB 입니다(400KB 이하)`);
}

for (const w of warn) console.log('WARN  ' + w);
if (bad.length) {
  for (const b of bad) console.log('FAIL  ' + b);
  console.log(`\n이미지 무게 — 실패 ${bad.length}건`);
  process.exit(1);
}
console.log(`PASS  이미지 무게 — WebP hero ${webpCount}개·대표 사진 ${photos.length}개 실패 0건${warn.length ? ` (경고 ${warn.length}건)` : ''}`);

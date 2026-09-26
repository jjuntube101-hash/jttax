/* 광고 문구 게이트 — 한국세무사회 「세무사광고에관한규정」(2026-01-06 개정) 대조 (260926 오너 결재 R-1)
   §8① 무료·염가 조세상담 광고 금지 / §4 10호 「무료」 표기 금지 / §4 6호 평균 환급금액·환급율·절세율 금지.
   범위: 사이트에 실제로 서빙되는 HTML 전체(빌드 산출물 포함)의 «보이는 텍스트 + title/meta/og 속성값».
   스크립트·주석·코드는 보지 않는다 — 규정이 겨누는 것은 소비자가 보는 표시다.
   dist/·node_modules/ 는 제외. 위반이 있으면 파일과 문맥을 찍고 exit 1. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.github']);
const BANNED = ['무료', '환급율', '환급률', '평균 환급', '절세율'];

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name)) walk(path.join(dir, ent.name), out); }
    else if (ent.name.endsWith('.html')) out.push(path.join(dir, ent.name));
  }
  return out;
}

/* 보이는 텍스트 + 검색엔진·미리보기가 읽는 속성값만 남긴다 */
function visible(html) {
  let t = html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
              .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
              .replace(/<!--[\s\S]*?-->/g, ' ');
  const attrs = [];
  /* <title> 안의 글은 태그를 벗기면 본문 텍스트로 남으므로 따로 더하지 않는다(더하면 같은 자리를 두 번 센다) */
  for (const m of t.matchAll(/<meta\b[^>]*?\bcontent\s*=\s*"([^"]*)"/gi)) attrs.push(m[1]);
  t = t.replace(/<[^>]+>/g, ' ');
  return (t + ' ' + attrs.join(' ')).replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

function scan(files) {
  const hits = [];
  for (const f of files) {
    const v = visible(fs.readFileSync(f, 'utf8'));
    for (const w of BANNED) {
      let i = v.indexOf(w);
      while (i >= 0) {
        hits.push({ file: path.relative(ROOT, f), word: w, ctx: v.slice(Math.max(0, i - 25), i + 25) });
        i = v.indexOf(w, i + 1);
      }
    }
  }
  return hits;
}

let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`      got=${JSON.stringify(got).slice(0, 600)}  want=${JSON.stringify(want)}`);
};

console.log('\n════ 광고 문구 게이트 자기시험 (검사기가 잡는가) ════\n');
eq('본문 텍스트의 「무료」를 잡는다', scan([writeTmp('<p>첫 상담은 무료입니다</p>')]).length, 1);
eq('meta description 의 「무료」를 잡는다', scan([writeTmp('<meta name="description" content="무료 세금 계산기">')]).length, 1);
eq('title 의 「무료」를 잡는다', scan([writeTmp('<title>무료 계산기</title>')]).length, 1);
eq('script 안의 「무료」는 표시가 아니므로 잡지 않는다', scan([writeTmp('<script>var a="무료";</script>')]).length, 0);
eq('HTML 주석 안의 「무료」는 잡지 않는다', scan([writeTmp('<!-- 무료 -->')]).length, 0);
eq('「환급률」을 잡는다', scan([writeTmp('<p>환급률 1위</p>')]).length, 1);
cleanupTmp();

console.log('\n════ 사이트 전체 HTML ════\n');
const files = walk(ROOT, []);
eq('검사 대상 HTML 이 50개 이상이다 (전수 검사 전제)', files.length >= 50, true);
const hits = scan(files);
eq(`금지 표시 0건 (검사 ${files.length}개 파일)`, hits, []);

if (fail) { console.log(`\n${fail} FAIL`); process.exit(1); }
console.log('\nALL PASS');

/* ── 자기시험용 임시 파일 ── */
function writeTmp(html) {
  const dir = path.join(ROOT, 'project', '.tmp_ad_wording');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `t${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(f, html, 'utf8');
  return f;
}
function cleanupTmp() { fs.rmSync(path.join(ROOT, 'project', '.tmp_ad_wording'), { recursive: true, force: true }); }

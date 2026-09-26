/* 광고 문구 게이트 — 한국세무사회 「세무사광고에관한규정」(2026-01-06 개정) 대조 (260926 오너 결재 R-1)
   §8① 무료·염가 조세상담 광고 금지 / §4 10호 「무료」 표기 금지 / §4 6호 평균 환급금액·환급율·절세율 금지.

   보는 곳(세 경로 — Codex TASK-260926-026 R1 이 정적 HTML 만 보던 구멍을 지적):
     ① 서빙되는 HTML 전체: 보이는 텍스트 + meta content + <script type="application/ld+json"> 안의 문자열 값
     ② React 소스(project/src/*.jsx): 주석을 뺀 본문 — 런타임에 그려지는 글은 정적 HTML 에 없다
     ③ 빌드 번들(project/dist/app.js): \\uXXXX 이스케이프를 풀어서 — 소스 검사가 새는 경우의 최종 방어
   보지 않는 것: 실행 스크립트·주석·코드 식별자. 규정이 겨누는 것은 소비자가 보는 표시다.
   위반이 있으면 파일과 문맥을 찍고 exit 1. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.github', '.tmp_ad_wording']);
/* 「무료」의 대체 표현도 같이 본다(Codex R2-F4). 「무상」은 무상취득·무상 증여 같은 세법 용어라 «상담» 문맥만 잡는다. */
const BANNED = ['무료', '비용 없음', '비용 없이', '비용이 들지 않', '비용을 받지 않', '공짜', '0원 상담', '0원에 상담', '무보수', '무상 상담', '무상으로 상담',
                '환급율', '환급률', '평균 환급', '절세율'];
/* 「부대비용은 없다고 가정」처럼 계산 예시의 비용 가정은 상담 비용이 아니다 — 아래 자기시험이 그 경계를 고정한다 */

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name)) walk(path.join(dir, ent.name), out); }
    else if (ent.name.endsWith('.html')) out.push(path.join(dir, ent.name));
  }
  return out;
}

/* JSON 값 트리에서 문자열만 모은다 */
function jsonStrings(v, out) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach(x => jsonStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach(x => jsonStrings(x, out));
  return out;
}

/* ① HTML: 보이는 텍스트 + meta content + JSON-LD 문자열 값 */
function visibleHtml(html) {
  const ld = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { jsonStrings(JSON.parse(m[1]), ld); } catch (e) { ld.push('[JSON-LD 파싱 실패] ' + m[1].slice(0, 200)); }
  }
  let t = html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
              .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
              .replace(/<!--[\s\S]*?-->/g, ' ');
  /* 소비자·검색엔진이 읽는 속성값: meta content(작은/큰따옴표 모두), 그리고 모든 태그의 alt·title (Codex R3-F2) */
  const attrs = [];
  for (const m of t.matchAll(/<meta\b[^>]*?\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) attrs.push(m[1] != null ? m[1] : m[2]);
  for (const m of t.matchAll(/<[a-z][^>]*?\s(?:alt|title)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) attrs.push(m[1] != null ? m[1] : m[2]);
  t = t.replace(/<[^>]+>/g, ' ');
  return (t + ' ' + attrs.join(' ') + ' ' + ld.join(' ')).replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

/* ② JSX: 주석만 걷어낸 본문. 정규식이 아니라 한 글자씩 걸으며 «문자열 안인가»를 추적한다 —
   정규식은 `'상담 // 무료'` 처럼 문자열 안의 // 를 주석으로 오인해 그 뒤를 지웠다(Codex R2-F3).
   추적하는 상태: 작은따옴표·큰따옴표·백틱(템플릿) 문자열, 슬래시 두 개의 줄 주석, 슬래시-별표 블록 주석. 정규식 리터럴은 추적하지 않는다
   (이 저장소의 JSX 에서 정규식 안에 금지어가 올 일은 없고, 오탐이면 사람이 본다 — 누락보다 낫다). */
function visibleJsx(src) {
  let out = '', i = 0, n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {                       // 줄 주석
      while (i < n && src[i] !== '\n') i++;
      out += ' '; continue;
    }
    if (c === '/' && d === '*') {                       // 블록 주석 ({/* */} 포함)
      const j = src.indexOf('*/', i + 2);
      i = j < 0 ? n : j + 2; out += ' '; continue;
    }
    if (c === "'" || c === '"' || c === '`') {          // 문자열·템플릿: 닫힐 때까지 그대로 (이스케이프 존중)
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out.replace(/\s+/g, ' ');
}

/* ③ 번들: \uXXXX 이스케이프를 풀고, 번들에 남는 소스 주석은 뺀다(주석은 화면에 그려지지 않는다) */
function visibleBundle(src) {
  return visibleJsx(src.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
}

function scanText(label, text, hits) {
  for (const w of BANNED) {
    let i = text.indexOf(w);
    while (i >= 0) {
      hits.push({ file: label, word: w, ctx: text.slice(Math.max(0, i - 25), i + 25) });
      i = text.indexOf(w, i + 1);
    }
  }
  return hits;
}
function scanHtml(files) { const h = []; for (const f of files) scanText(path.relative(ROOT, f), visibleHtml(fs.readFileSync(f, 'utf8')), h); return h; }
function scanJsx(files)  { const h = []; for (const f of files) scanText(path.relative(ROOT, f), visibleJsx(fs.readFileSync(f, 'utf8')), h); return h; }
function scanBundle(f)   { return scanText(path.relative(ROOT, f), visibleBundle(fs.readFileSync(f, 'utf8')), []); }

let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`      got=${JSON.stringify(got).slice(0, 700)}  want=${JSON.stringify(want)}`);
};

console.log('\n════ 광고 문구 게이트 자기시험 (검사기가 잡는가 / 안 잡아야 할 것을 안 잡는가) ════\n');
eq('① 본문 텍스트의 「무료」를 잡는다', scanHtml([tmp('a.html', '<p>첫 상담은 무료입니다</p>')]).length, 1);
eq('① meta description 의 「무료」를 잡는다', scanHtml([tmp('b.html', '<meta name="description" content="무료 세금 계산기">')]).length, 1);
eq('① title 의 「무료」를 잡는다 (한 번만 센다)', scanHtml([tmp('c.html', '<title>무료 계산기</title>')]).length, 1);
eq("① 작은따옴표 meta content 의 「무료」를 잡는다 (R3-F2)", scanHtml([tmp('c2.html', "<meta name='description' content='무료 상담'>")]).length, 1);
eq('① img alt 의 「무료」를 잡는다 (R3-F2)', scanHtml([tmp('c3.html', '<img src="x.png" alt="무료 상담 배너">')]).length, 1);
eq('① 태그 title 속성의 「무료」를 잡는다', scanHtml([tmp('c4.html', '<a href="/" title="무료 상담">문의</a>')]).length, 1);
eq('① JSON-LD 문자열 값의 「무료」를 잡는다 (R1-F2)', scanHtml([tmp('d.html', '<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"acceptedAnswer":{"text":"첫 상담은 무료입니다"}}]}</script>')]).length, 1);
eq('① 깨진 JSON-LD 는 파싱 실패로 표면화한다', scanHtml([tmp('e.html', '<script type="application/ld+json">{무료</script>')]).length, 1);
eq('① 실행 script 안의 「무료」는 표시가 아니므로 잡지 않는다', scanHtml([tmp('f.html', '<script>var a="무료";</script>')]).length, 0);
eq('① HTML 주석 안의 「무료」는 잡지 않는다', scanHtml([tmp('g.html', '<!-- 무료 -->')]).length, 0);
eq('① 「환급률」을 잡는다', scanHtml([tmp('h.html', '<p>환급률 1위</p>')]).length, 1);
eq('② JSX 본문의 「무료」를 잡는다 (R1-F1)', scanJsx([tmp('i.jsx', "<p>첫 상담 무료</p>")]).length, 1);
eq('② JSX 문자열 리터럴의 「무료」를 잡는다', scanJsx([tmp('j.jsx', "const a = cond ? '15분 무료로 검토' : '';")]).length, 1);
eq('② JSX 주석(//·/* */·{/* */})의 「무료」는 잡지 않는다', scanJsx([tmp('k.jsx', "// 무료 티저\n/* 무료 */\n{/* 무료 섹션 */}\nconst x = 1;")]).length, 0);
eq('② URL 안의 // 는 주석이 아니다', scanJsx([tmp('l.jsx', "const u = 'https://x.y/무료';")]).length, 1);
eq('② 문자열 안의 // 뒤 금지어를 놓치지 않는다 (R2-F3)', scanJsx([tmp('l2.jsx', "const a = '상담 // 무료';")]).length, 1);
eq('② 템플릿 문자열 안의 금지어를 잡는다', scanJsx([tmp('l3.jsx', "const a = `첫 상담 ${x} 무료`;")]).length, 1);
eq('② 이스케이프된 따옴표 뒤 주석은 주석이다', scanJsx([tmp('l4.jsx', "const a = 'it\\'s'; // 무료")]).length, 0);
eq('① 「비용 없음」·「공짜」·「0원 상담」을 잡는다 (R2-F4)', scanHtml([tmp('o.html', '<p>비용 없음</p><p>공짜</p><p>0원 상담</p>')]).length, 3);
eq('① 「무상취득」·「세액 0원」은 잡지 않는다 (다른 뜻)', scanHtml([tmp('p.html', '<p>무상취득 시 취득세, 산출 세액 0원</p>')]).length, 0);
eq('① 계산 예시의 「부대비용은 없다고 가정」은 잡지 않는다', scanHtml([tmp('q.html', '<p>4,000만 원에 매도(부대비용은 없다고 가정)</p>')]).length, 0);
eq('① 「비용 없이 상담」·「비용이 들지 않습니다」는 잡는다', scanHtml([tmp('r.html', '<p>비용 없이 상담</p><p>첫 상담은 비용이 들지 않습니다</p>')]).length, 2);
eq('③ 번들의 \\uXXXX 이스케이프를 풀어 「무료」를 잡는다 (R1-F3)', scanBundle(tmp('m.js', 'var t="\\uCCAB \\uC0C1\\uB2F4 \\uBB34\\uB8CC";')).length, 1);
eq('③ 번들에 남은 소스 주석의 「무료」는 잡지 않는다', scanBundle(tmp('n.js', 'var t=1; // \\uBB34\\uB8CC\n/* 무료 */')).length, 0);
cleanupTmp();

console.log('\n════ ① 사이트 전체 HTML ════\n');
const files = walk(ROOT, []);
eq('검사 대상 HTML 이 50개 이상이다 (전수 검사 전제)', files.length >= 50, true);
eq(`HTML 금지 표시 0건 (검사 ${files.length}개 파일, JSON-LD 포함)`, scanHtml(files), []);

console.log('\n════ ② React 소스 (project/src/*.jsx) ════\n');
const jsx = fs.readdirSync(path.join(ROOT, 'project', 'src')).filter(f => f.endsWith('.jsx')).map(f => path.join(ROOT, 'project', 'src', f));
eq('JSX 파일이 10개 이상이다', jsx.length >= 10, true);
eq(`JSX 금지 표시 0건 (검사 ${jsx.length}개 파일, 주석 제외)`, scanJsx(jsx), []);

console.log('\n════ ③ 빌드 번들 (project/dist/app.js) ════\n');
const bundle = path.join(ROOT, 'project', 'dist', 'app.js');
eq('번들이 존재한다', fs.existsSync(bundle), true);
eq('번들 금지 표시 0건 (이스케이프 해제 후)', fs.existsSync(bundle) ? scanBundle(bundle) : [], []);

if (fail) { console.log(`\n${fail} FAIL`); process.exit(1); }
console.log('\nALL PASS');

/* ── 자기시험용 임시 파일 ── */
function tmp(name, body) {
  const dir = path.join(ROOT, 'project', '.tmp_ad_wording');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name);
  fs.writeFileSync(f, body, 'utf8');
  return f;
}
function cleanupTmp() { fs.rmSync(path.join(ROOT, 'project', '.tmp_ad_wording'), { recursive: true, force: true }); }

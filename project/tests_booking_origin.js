'use strict';
/* tests_booking_origin.js — 260906 C0 계측 게이트
   무엇을 지키나: ① Chrome.jsx `jtBookingOrigin.ALLOWED` 폐집합 == 소스 전체의 jtTrackCta('booking', '<literal>') 리터럴 집합
                 (한쪽에만 있는 값이 생기면 FAIL — 새 예약 CTA 를 달면 ALLOWED 도 같이 갱신해야 한다)
                 ② jtTrackCta 안에서 booking 채널이 jtBookingOrigin.record 를 부른다
                 ③ Pages2.jsx booking_submit 이 jtBookingOrigin.params() 를 동봉한다
   보지 않는 것: 브라우저 실행(세션 최초 1회 고정·sessionStorage 실패 폴백)은 정적으로 못 본다 — 배포 후 GA4 DebugView 로. */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'src');
let fails = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
  if (!ok) fails++;
}
const chrome = fs.readFileSync(path.join(SRC, 'Chrome.jsx'), 'utf8');
const pages2 = fs.readFileSync(path.join(SRC, 'Pages2.jsx'), 'utf8');

// ① ALLOWED 추출 (배열 리터럴 한 덩어리)
const m = chrome.match(/var ALLOWED = \[([\s\S]*?)\];/);
const allowed = m ? Array.from(m[1].matchAll(/'([a-z_]+)'/g)).map(x => x[1]).sort() : [];
eq('Chrome.jsx: ALLOWED 배열 존재', allowed.length > 0, true);

// 소스 전수의 booking location — @babel/parser AST 로 «두 번째 인자가 문자열 리터럴»을 강제한다
//   (변수·템플릿 리터럴 location 은 폐집합 검사를 우회하므로 그 자체를 FAIL — Codex R1-F3)
const { parse } = require('@babel/parser');
const lits = new Set();
const nonLiteral = [];
function walk(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => walk(n, fn)); return; }
  if (node.type) fn(node);
  for (const k of Object.keys(node)) { if (k === 'loc' || k === 'start' || k === 'end') continue; walk(node[k], fn); }
}
for (const f of fs.readdirSync(SRC).filter(n => n.endsWith('.jsx'))) {
  const code = fs.readFileSync(path.join(SRC, f), 'utf8');
  let ast;
  try { ast = parse(code, { sourceType: 'script', plugins: ['jsx'], errorRecovery: true }); }
  catch (e) { console.log('FAIL 파싱 실패 ' + f + ': ' + e.message); fails++; continue; }
  walk(ast.program, (n) => {
    if (n.type !== 'CallExpression') return;
    const c = n.callee;
    const isTrack = (c.type === 'Identifier' && c.name === 'jtTrackCta')
      || (c.type === 'MemberExpression' && c.property && c.property.name === 'jtTrackCta');
    if (!isTrack) return;
    const [a0, a1] = n.arguments;
    if (!a0 || a0.type !== 'StringLiteral' || a0.value !== 'booking') return;
    if (a1 && a1.type === 'StringLiteral') lits.add(a1.value);
    else nonLiteral.push(f + ':' + (n.loc ? n.loc.start.line : '?'));
  });
}
const found = Array.from(lits).sort();
eq('소스 booking location 리터럴 ⊆ ALLOWED (누락 0)', found.filter(v => !allowed.includes(v)), []);
eq('ALLOWED ⊆ 소스 리터럴 (죽은 값 0)', allowed.filter(v => !found.includes(v)), []);
eq('booking 채널의 location 은 전부 문자열 리터럴 (변수·템플릿 0)', nonLiteral, []);

// ROUTES 폐집합 == App.jsx JT_KNOWN_ROUTES
const app = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8');
const rA = (app.match(/const JT_KNOWN_ROUTES = \[([^\]]*)\]/) || [])[1] || '';
const rC = (chrome.match(/var ROUTES = \[([^\]]*)\]/) || [])[1] || '';
const norm = (x) => Array.from(x.matchAll(/'([a-z]+)'/g)).map(m => m[1]).sort();
eq('Chrome.jsx ROUTES == App.jsx JT_KNOWN_ROUTES', norm(rC), norm(rA));
eq('route() 가 폐집합 밖을 unknown 으로 내림', /ROUTES\.indexOf\(r\) >= 0 \? r : 'unknown'/.test(chrome), true);
eq('저장값 복원 시 sanitize 재검증', /var p = sanitize\(JSON\.parse\(raw\)\)/.test(chrome), true);

// ② 래퍼 안 record 호출
const wrap = chrome.match(/window\.jtTrackCta = function[\s\S]*?\n};/);
eq('jtTrackCta 가 booking 채널에서 jtBookingOrigin.record 호출', !!(wrap && /channel === 'booking'[\s\S]*jtBookingOrigin\.record\(location\)/.test(wrap[0])), true);
eq('jtBookingOrigin 정의 1회', (chrome.match(/window\.jtBookingOrigin\s*=/g) || []).length, 1);
eq('record 는 최초 1회 고정 (read() 있으면 return)', /record: function \(location\) \{\s*if \(read\(\)\) return;/.test(chrome), true);

// ③ booking_submit 동봉
const bs = pages2.match(/jtEvent\('booking_submit'[\s\S]*?\);/);
eq('Pages2.jsx booking_submit 에 jtBookingOrigin.params() 동봉', !!(bs && /jtBookingOrigin\.params\(\)/.test(bs[0])), true);
eq('booking_submit 에 금액·연락처 필드 없음', !!(bs && !/phone|name|email|msg|금액|amount/.test(bs[0])), true);

console.log(fails ? `\ntests_booking_origin: FAIL ${fails}` : '\ntests_booking_origin: PASS');
process.exit(fails ? 1 : 0);

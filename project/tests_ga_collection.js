/* GA4: 모든 게시 HTML의 운영 도메인 게이트와 단일 설치를 검사한다.
   사이트 코드를 실행하지 않고 제한된 AST만 읽는다. 실제 전송은 라이브에서 별도 확인. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const parser = require('@babel/parser');
const ROOT = path.join(__dirname, '..');
const ID = 'G-ETRXTFKLFE';
const cases = [
  ['www.jttax.co.kr', false], ['jttax.co.kr', false],
  ['localhost', true], ['127.0.0.1', true], ['::1', true],
  ['preview.vercel.app', true], ['www.jttax.co.kr.evil.com', true], ['', true],
];
function condition(n, host) {
  if (n.type === 'LogicalExpression' && n.operator === '&&') return condition(n.left, host) && condition(n.right, host);
  if (n.type === 'BinaryExpression' && n.operator === '!==') return condition(n.left, host) !== condition(n.right, host);
  if (n.type === 'StringLiteral') return n.value;
  if (n.type === 'MemberExpression' && !n.computed && n.property.name === 'hostname'
    && n.object.type === 'MemberExpression' && !n.object.computed && n.object.property.name === 'location'
    && n.object.object.type === 'Identifier' && n.object.object.name === 'window') return host;
  throw Error('GA 호스트 게이트에 허용되지 않은 표현식: ' + n.type);
}
function files(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => {
    if (['.git','node_modules','project'].includes(e.name)) return [];
    const p = path.join(dir,e.name);
    return e.isDirectory() ? files(p) : e.name.endsWith('.html') ? [p] : [];
  });
}
let count = 0;
for (const file of files(ROOT)) {
  const html = fs.readFileSync(file,'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const loaders = scripts.filter(s => /googletagmanager\.com\/gtag\/js/.test(s[1]));
  if (!loaders.length) continue;
  const label = path.relative(ROOT,file);
  assert.equal(loaders.length, 1, label + ': 중복 로더');
  assert(loaders[0][1].includes('id='+ID), label + ': 잘못된 측정 ID');
  const guards = scripts.filter(s => s[2].includes('ga-disable-'+ID));
  assert.equal(guards.length, 1, label + ': 수집 차단 게이트 누락/중복');
  assert(guards[0].index < loaders[0].index, label + ': 차단 플래그는 비동기 로더보다 먼저');
  const body = parser.parse(guards[0][2]).program.body;
  assert.equal(body.length, 1, label + ': 게이트 외 코드');
  const gate = body[0];
  assert.equal(gate.type,'IfStatement');
  assert.equal(gate.alternate,null, label + ': 운영 환경에서 방문자의 기존 opt-out을 덮어쓰지 않는다');
  const assign = gate.consequent.body;
  assert.equal(assign.length,1);
  const expr = assign[0].expression;
  assert.equal(expr.type,'AssignmentExpression');
  assert.equal(expr.operator,'=');
  assert.equal(expr.left.type,'MemberExpression');
  assert.equal(expr.left.object.name,'window');
  assert.equal(expr.left.computed,true);
  assert.equal(expr.left.property.value,'ga-disable-'+ID);
  assert.equal(expr.right.type,'BooleanLiteral');
  assert.equal(expr.right.value,true);
  for (const [host,disabled] of cases) assert.equal(condition(gate.test,host),disabled,label+': '+host);
  const configs = scripts.flatMap(s => [...s[2].matchAll(/gtag\(['"]config['"]\s*,\s*['"]([^'"]+)['"]/g)]);
  assert.deepEqual(configs.map(c=>c[1]),[ID],label+': 동일 속성의 보조 ID 직접 설치 금지');
  if (label === 'index.html') assert(/send_page_view:\s*false/.test(html),'SPA 자동 page_view 차단 유지');
  else assert(!/send_page_view:\s*false/.test(html),label+': 정적 진입 page_view 유지');
  count++;
}
assert(count >= 60, '검사 대상 페이지 수가 급감: ' + count);
const youth = fs.readFileSync(path.join(ROOT,'insights/youth-startup-tax-reduction-2026.html'),'utf8');
assert(/href="\/#\/report\/youthstartup"/.test(youth),'청년창업 진단 연결');
assert(/onclick="jtTrackCta\('booking','insight_youth'\)"/.test(youth),'청년창업 상담 CTA 계측');
assert(!/href="[^"#]*utm_[^"]*#\//.test(youth),'내부 링크 UTM 금지');
console.log(`PASS GA4 collection: ${count} HTML pages × ${cases.length} host cases; single ID, opt-out, page_view, youth CTA`);

/* 처분 비교 — 화면 답 → 엔진 요청 변환·엔진 응답 상태 판정을 «실행»으로 고정한다 (261011 워크플로 계약 정합).

   소스(ReportCompare.jsx)에서 순수 함수 본문을 AST 범위로 꺼내 vm 에서 그대로 돌린다(tests_comprehensive_request.js 와 같은 방식 —
   테스트가 흉내 낸 규칙과 앱이 쓰는 규칙이 갈라지지 않게). 선언이 사라지거나 이름이 바뀌면 조용히 통과하지 않고 여기서 죽는다.

   고정하는 것
   · 「모름」·빈칸을 사실로 바꿔 보내지 않는다 — 세대 주택 수(1·2·3채 이상, `|| 1` 없음)·현재 조정대상지역·받는 분 세대 주택 수의 「모름」과
     취득가액 빈칸·0 은 엔진을 부르지 않고 «차단»(blocked + 사유)으로 간다
   · 취득 당시 조정대상지역: 기준일(2017-08-03) 이후 취득에만 묻고, 「예/아니오」만 보내며 «모름»은 키가 없다(엔진이 대조 계산)
   · cmpEngineVerdict — ok · needs_input · unsupported · refused(상태 키 없음·알 수 없는 상태·오류 필드) · down(상태 error·불완전한 응답) 의 분류
   · cmpCalcFromEngine — ok 만 금액을 옮기고, 그 밖에는 금액 필드가 없다. 엔진 안내 문구(오류)는 차단 안내로 전달된다
   · cmpCalcFromEngineError — HTTP 4xx(408·429 제외)는 거부, 그 밖은 연결 실패
   · 화면 배선 — 막는 답이면 엔진을 부르지 않고, 응답은 cmpCalcFromEngine 으로만 판정하며, 「비조정대상지역으로 가정」 고정 문구가 없다 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const parser = require('@babel/parser');

const code = fs.readFileSync(path.join(__dirname, 'src', 'ReportCompare.jsx'), 'utf8');
const commonSrc = fs.readFileSync(path.join(__dirname, 'src', 'Report.jsx'), 'utf8');

let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const ok = (v, label) => { assert.ok(v, label); checks++; };
const plain = (v) => JSON.parse(JSON.stringify(v));

function loadDecls(src, names) {
  const ast = parser.parse(src, { sourceType: 'script', plugins: ['jsx'] });
  const want = new Set(names), found = new Set(), chunks = [];
  for (const n of ast.program.body) {
    if (n.type === 'FunctionDeclaration' && n.id && want.has(n.id.name)) { found.add(n.id.name); chunks.push(src.slice(n.start, n.end)); }
    else if (n.type === 'VariableDeclaration') {
      const ids = n.declarations.map((d) => (d.id && d.id.name) || '');
      if (ids.some((x) => want.has(x))) { ids.forEach((x) => want.has(x) && found.add(x)); chunks.push(src.slice(n.start, n.end)); }
    }
  }
  const missing = names.filter((n) => !found.has(n));
  if (missing.length) throw new Error('ReportCompare.jsx 에서 최상위 선언을 찾지 못했습니다: ' + missing.join(', '));
  return chunks.join('\n');
}
const validCalcSrc = commonSrc.match(/window\.jtValidCalc = function[\s\S]*?\n  };/)[0];
const DECLS = ['CMP_QS', 'cmpValidISODate', 'cmpIsoDate', 'cmpApplyAnswer', 'cmpBuildBody', 'cmpEngineVerdict', 'cmpCalcFromEngine', 'cmpCalcFromEngineError'];
const declSrc = loadDecls(code, DECLS);
const EXPORTS = '\nglobalThis.__e = { CMP_QS, cmpApplyAnswer, cmpBuildBody, cmpEngineVerdict, cmpCalcFromEngine, cmpCalcFromEngineError };';
const ctx = vm.createContext({ window: {}, Date, Number, Object, Math, JSON, String, Array, acqKoreanAmount: undefined });
vm.runInContext(validCalcSrc, ctx);
vm.runInContext(declSrc + EXPORTS, ctx);
const F = ctx.__e;

const TODAY = '2026-10-11';
const A = {
  propertyValue: '1200000000', acquisitionPrice: '300000000', housingCount: '2', acquisitionDate: '2011-07-12',
  adjustedZone: 'yes', areaClass: 'over', recipient: 'child_adult', recipientHouseCount: '0', hasSpouse: 'yes', numChildren: '2', otherEstate: '500000000',
};
const build = (over) => F.cmpBuildBody({ ...A, ...over }, TODAY);
const bodyOf = (over) => plain(build(over).body);

// ───────────────────────── 세대 주택 수 ─────────────────────────
console.log('════ 세대 주택 수 — 1·2·3채 이상, 모름은 차단, 기본값 1 없음 ════');
{
  const q = F.CMP_QS.find((x) => x.id === 'housingCount');
  ok(q && Array.isArray(q.opts) && !q.numeric, '주택 수는 선택지 문항이다(숫자 입력란이 아니다)');
  eq(plain(q.opts.map((o) => o[0])), ['1', '2', '3', 'unknown'], '선택지 = 1 · 2 · 3채 이상 · 모름');
  ok(q.opts.find((o) => o[0] === 'unknown'), '「모름」 선택지가 있다');
  for (const [v, n] of [['1', 1], ['2', 2], ['3', 3]]) eq(bodyOf({ housingCount: v }).owner_housing_count, n, '주택 수 ' + v + ' → ' + n);
  for (const bad of [undefined, '', '0', '4', 'many', null]) {
    const r = build({ housingCount: bad });
    ok(r.error && !r.body && !r.blocked, '주택 수 ' + JSON.stringify(bad) + ' → 요청 거부(1 로 바꿔 보내지 않는다)');
  }
  const u = build({ housingCount: 'unknown' });
  ok(u.blocked === true && !u.body && !u.error, '주택 수 「모름」 → 엔진을 부르지 않고 차단');
  ok(u.blockReasons.length === 1 && /주택 수/.test(u.blockReasons[0]) && /양도세 비과세/.test(u.blockReasons[0]), '차단 사유: 세대 주택 수에 따라 양도세 비과세·취득세 중과가 갈린다');
}

// ───────────────────────── 취득가액 ─────────────────────────
console.log('════ 취득가액 — 빈칸·0 은 환산취득가액 확인 안내(차단) ════');
{
  const q = F.CMP_QS.find((x) => x.id === 'acquisitionPrice');
  ok(q.blockOnBlank === true, '취득가액 문항은 비워도 다음으로 갈 수 있다(요청 단계에서 막는다)');
  eq(bodyOf({ acquisitionPrice: '300000000' }).acquisition_price, 300000000, '입력한 취득가액은 그대로 간다');
  for (const bad of ['', '0', undefined, null, '-5']) {
    const r = build({ acquisitionPrice: bad });
    ok(r.blocked === true && !r.body && !r.error, '취득가액 ' + JSON.stringify(bad) + ' → 차단(시세의 절반 같은 값으로 메우지 않는다)');
    ok(/취득가액을 모르면 환산취득가액 등 확인이 필요하므로 상담/.test(r.blockReasons[0]), '차단 사유 문구');
  }
}

// ───────────────────────── 조정대상지역(현재) ─────────────────────────
console.log('════ 조정대상지역 — 예/아니오만 보내고 모름은 차단 ════');
eq(bodyOf({ adjustedZone: 'yes' }).is_regulated_area, true, '예 → true');
eq(bodyOf({ adjustedZone: 'no' }).is_regulated_area, false, '아니오 → false');
{
  const r = build({ adjustedZone: 'unknown' });
  ok(r.blocked === true && !r.body && /조정대상지역/.test(r.blockReasons[0]), '모름 → 엔진을 부르지 않고 차단(false 로 바꿔 보내지 않는다)');
  for (const bad of [undefined, '', 'maybe']) ok(build({ adjustedZone: bad }).error, '답이 없거나 목록 밖(' + JSON.stringify(bad) + ') → 요청 거부');
}

// ───────────────────────── 취득 당시 조정대상지역 ─────────────────────────
console.log('════ 취득 당시 조정대상지역 — 기준일 이후에만 묻고, 모름은 키를 보내지 않는다 ════');
{
  const q = F.CMP_QS.find((x) => x.id === 'regulatedAtAcq');
  const shows = (d) => q.showIf({ acquisitionDate: d });
  eq([shows('2017-08-02'), shows('2017-08-03'), shows('2020-01-01'), shows(''), shows(undefined)], [false, true, true, false, false], '문항 표시: 취득일 ≥ 2017-08-03');
  const late = { acquisitionDate: '2020-01-01' };
  eq(bodyOf({ ...late, regulatedAtAcq: 'yes' }).regulated_at_acquisition, true, '예 → true');
  eq(bodyOf({ ...late, regulatedAtAcq: 'no' }).regulated_at_acquisition, false, '아니오 → false');
  ok(!('regulated_at_acquisition' in bodyOf({ ...late, regulatedAtAcq: 'unknown' })), '모름 → 키가 없다(엔진이 두 값으로 대조 계산)');
  ok(build({ ...late, regulatedAtAcq: 'unknown' }).body, '모름은 차단하지 않는다(엔진이 갈리는지 판정)');
  ok(build({ ...late }).error, '기준일 이후 취득인데 답이 없으면 요청 거부');
  ok(build({ acquisitionDate: '2017-08-03' }).error, '경계일(2017-08-03)도 묻는다');
  // 기준일 전 취득: 묻지도 보내지도 않는다 — 낡은 답이 남아 있어도
  for (const stale of [undefined, 'yes', 'no', 'unknown']) {
    ok(!('regulated_at_acquisition' in bodyOf({ acquisitionDate: '2017-08-02', regulatedAtAcq: stale })), '2017-08-02 취득 + 낡은 답 ' + stale + ' → 키 없음');
  }
  // 전입일은 취득일부터 센다 — 입력했을 때만, 취득일~오늘 사이
  eq(bodyOf({ ...late, regulatedAtAcq: 'yes', moveInDate: '2020-03-01' }).owner_move_in_date, '2020-03-01', '전입일 입력 → 그대로');
  ok(!('owner_move_in_date' in bodyOf({ ...late, regulatedAtAcq: 'yes' })), '전입일을 비우면 보내지 않는다');
  ok(build({ ...late, regulatedAtAcq: 'yes', moveInDate: '2019-01-01' }).error, '전입일이 취득일보다 앞서면 거부');
  // 취득일이 바뀌면 딸린 답을 지운다(낡은 답이 새 취득일의 요청에 실리지 않게)
  const b0 = { acquisitionDate: '2011-07-12', regulatedAtAcq: 'no', moveInDate: '2012-03-01', housingCount: '1' };
  const b1 = plain(F.cmpApplyAnswer(b0, 'acquisitionDate', '2020-01-01'));
  ok(!('regulatedAtAcq' in b1) && !('moveInDate' in b1) && b1.housingCount === '1', '취득일 변경 → 취득 당시 지역·전입일 답 삭제, 나머지 보존');
  ok(build({ ...b1, ...{ propertyValue: A.propertyValue, acquisitionPrice: A.acquisitionPrice, adjustedZone: 'no', areaClass: 'under', recipient: 'spouse', numChildren: '0' } }).error, '삭제된 뒤에는 다시 답해야 요청된다');
}

// ───────────────────────── 받는 분 세대 주택 수 ─────────────────────────
console.log('════ 받는 분 세대 주택 수 — 성년 자녀에게만 묻고, 모름은 차단 ════');
{
  const q = F.CMP_QS.find((x) => x.id === 'recipientHouseCount');
  eq([q.showIf({ recipient: 'child_adult' }), q.showIf({ recipient: 'child_minor' }), q.showIf({ recipient: 'spouse' })], [true, false, false], '문항 표시: 성년 자녀만');
  for (const v of ['0', '1', '2', '3']) eq(bodyOf({ recipientHouseCount: v }).recipient_other_house_count, Number(v), '받는 분 세대 주택 ' + v);
  const u = build({ recipientHouseCount: 'unknown' });
  ok(u.blocked === true && !u.body && /받는 분 세대의 주택 수/.test(u.blockReasons[0]), '모름 → 차단(1주택 기준으로 계산하지 않는다)');
  ok(build({ recipientHouseCount: undefined }).error, '성년 자녀인데 답이 없으면 요청 거부');
  for (const rc of ['child_minor', 'spouse']) {
    const r = build({ recipient: rc, recipientHouseCount: 'unknown', numChildren: '1' });
    ok(r.body && !('recipient_other_house_count' in r.body), rc + ' 은 같은 세대 — 묻지도 보내지도 않고, 낡은 «모름»도 막지 않는다');
  }
}

// ───────────────────────── 여러 사유가 겹칠 때 ─────────────────────────
console.log('════ 막는 답이 겹치면 사유를 모두 보여 준다 ════');
{
  const r = build({ acquisitionPrice: '', housingCount: 'unknown', adjustedZone: 'unknown', recipientHouseCount: 'unknown' });
  ok(r.blocked && r.blockReasons.length === 4 && !r.body, '취득가액·주택 수·조정대상지역·받는 분 주택 수 → 사유 4개');
  // 형식 오류는 차단보다 먼저다(입력 자체가 틀렸다)
  ok(build({ propertyValue: '0', housingCount: 'unknown' }).error, '시세가 없으면 차단 전에 오류');
}

// ───────────────────────── 응답 상태 판정 ─────────────────────────
console.log('════ cmpEngineVerdict · cmpCalcFromEngine ════');
const sc = (g, t, i, a) => ({ 총세부담: g + t + i + a, 증여세: g, 양도세: t, 상속세: i, 취득세: a, 계산실패: false });
const GOOD = { 상태: 'ok', 시나리오별: { 증여: sc(60, 0, 0, 40), 매매: sc(0, 70, 0, 30), 상속: sc(0, 0, 50, 20) }, 실패시나리오: [], 경고사항: ['[확인 필요] 가정 A', '고지 B'] };
const v = (c) => F.cmpEngineVerdict(plain(c));
eq(v(GOOD), 'ok', '상태 ok + 세 시나리오 유효 → ok');
{
  const { 상태, ...noStatus } = GOOD;
  eq(v(noStatus), 'refused', '상태 키가 없으면 금액이 있어도 거부(refused)');
  eq(v({}), 'refused', '빈 객체(상태 없음) → refused');
}
eq(v({ ...GOOD, 상태: 'needs_input', 오류: '세대 주택 수 필요' }), 'needs_input', 'needs_input');
eq(v({ ...GOOD, 상태: 'unsupported', 오류: '지원하지 않음' }), 'unsupported', 'unsupported');
eq(v({ ...GOOD, 상태: 'error', 오류: '시나리오 계산 실패' }), 'down', '상태 error → down(다시 시도)');
for (const st of ['OK', '', null, true, 'done', undefined]) eq(v({ ...GOOD, 상태: st }), 'refused', '알 수 없는 상태 ' + JSON.stringify(st) + ' → refused');
eq(v({ ...GOOD, 오류: '일부 실패' }), 'refused', 'ok 인데 오류 필드 → refused');
eq(v({ ...GOOD, success: false }), 'refused', 'ok 인데 success:false → refused');
eq(v({ ...GOOD, 실패시나리오: ['매매'] }), 'down', 'ok 인데 실패시나리오가 있으면 정밀 결과가 아니다(down)');
eq(v({ ...GOOD, 시나리오별: { ...GOOD['시나리오별'], 매매: { ...sc(0, 70, 0, 30), 계산실패: true } } }), 'down', '계산실패 표시 → down');
eq(v({ ...GOOD, 시나리오별: { ...GOOD['시나리오별'], 증여: sc(0, 0, 0, 0) } }), 'down', '총세부담 0(취득세가 늘 있으므로 계산 실패 신호) → down');
eq(v({ ...GOOD, 시나리오별: { ...GOOD['시나리오별'], 상속: { ...sc(0, 0, 50, 20), 총세부담: 999 } } }), 'down', '세목 합계와 총세부담이 다르면 down');
eq(v({ ...GOOD, 시나리오별: { 증여: GOOD['시나리오별']['증여'], 매매: GOOD['시나리오별']['매매'] } }), 'down', '시나리오가 빠지면 down');
eq(v({ ...GOOD, 시나리오별: undefined }), 'down', '시나리오별 없음 → down');
for (const bad of [null, undefined, [], 'x', 3]) eq(F.cmpEngineVerdict(bad), 'down', '객체가 아닌 calc ' + JSON.stringify(bad) + ' → down');

{
  const r = plain(F.cmpCalcFromEngine({ version: { engine: '9.9.9' }, calc: GOOD }));
  eq([r.precise, r.engineVer, r.engineWarnings], [true, '9.9.9', ['[확인 필요] 가정 A', '고지 B']], 'ok → 정밀 + 엔진 경고 그대로');
  eq(r.scenarios, GOOD['시나리오별'], 'ok → 엔진 시나리오 값을 그대로 옮긴다');
  ok(!('blocked' in r) && !('engineErr' in r), 'ok 에는 차단·연결 실패 표지가 없다');
}
for (const [st, msg] of [['needs_input', '취득 당시 조정대상지역 여부와 거주 여부 확인 필요'], ['unsupported', '이 조합은 지원하지 않습니다']]) {
  const r = plain(F.cmpCalcFromEngine({ calc: { ...GOOD, 상태: st, 오류: '  ' + msg + ' ' } }));
  eq([r.precise, r.blocked, r.engineState, r.engineMessage], [false, true, st, msg], st + ' → 차단 + 엔진 안내 문구(공백 정리)');
  ok(!('scenarios' in r) && !('engineErr' in r), st + ' → 금액 필드가 없다(응답에 금액이 있어도 옮기지 않는다)');
}
{
  const r = plain(F.cmpCalcFromEngine({ calc: { 시나리오별: GOOD['시나리오별'] } }));
  eq([r.precise, r.blocked, r.engineState], [false, true, 'refused'], '상태 키 없는 응답 → 거부(차단)');
  ok(/상태 없음/.test(r.engineMessage) && !('scenarios' in r), '거부 사유 문구 + 금액 필드 없음');
  const e = plain(F.cmpCalcFromEngine({ calc: { ...GOOD, 상태: 'error', 오류: '내부 오류' } }));
  eq([e.precise, e.engineErr, e.engineState, 'blocked' in e, 'scenarios' in e], [false, true, 'down', false, false], '상태 error → 연결 실패 안내(다시 시도), 차단 아님');
  for (const bad of [null, undefined, {}, { calc: null }, { calc: [] }]) {
    const x = plain(F.cmpCalcFromEngine(bad));
    ok(x.precise === false && !('scenarios' in x), '깨진 응답 ' + JSON.stringify(bad) + ' → 금액 없음');
  }
}

// ───────────────────────── 호출 예외 분류 ─────────────────────────
console.log('════ cmpCalcFromEngineError ════');
{
  const st = (s) => Object.assign(new Error('engine ' + s), { status: s });
  for (const s of [400, 404, 409, 422, 499]) { const r = plain(F.cmpCalcFromEngineError(st(s))); eq([r.blocked, r.engineState, r.precise], [true, 'refused', false], 'HTTP ' + s + ' → 거부'); }
  for (const s of [408, 429, 500, 502, 503, 504]) { const r = plain(F.cmpCalcFromEngineError(st(s))); eq([r.engineErr, r.engineState, 'blocked' in r], [true, 'down', false], 'HTTP ' + s + ' → 연결 실패'); }
  for (const e of [new TypeError('Failed to fetch'), Object.assign(new Error('aborted'), { name: 'AbortError' }), undefined, null]) {
    const r = plain(F.cmpCalcFromEngineError(e));
    eq([r.engineErr, r.engineState], [true, 'down'], '네트워크·시간 초과 → 연결 실패');
  }
}

// ───────────────────────── 화면 배선 ─────────────────────────
console.log('════ 화면 배선 ════');
assert.match(code, /if \(built\.blocked\) \{ setReport\(\{ calc: \{ precise: false, blocked: true, blockReasons: built\.blockReasons/); checks++;
assert.match(code, /calc = cmpCalcFromEngine\(await callCompareEng\(body\)\);/); checks++;
assert.match(code, /calc = cmpCalcFromEngineError\(e\);/); checks++;
assert.match(code, /const setAns = \(id, v\) => setAnswers\(a => cmpApplyAnswer\(a, id, v\)\);/); checks++;
assert.match(code, /calc\.blocked \?/); checks++;
assert.match(code, /calc\.engineMessage/, '엔진 안내 문구를 차단 화면에 보인다'); checks++;
assert.doesNotMatch(code, /비조정대상지역으로 가정/, '「비조정대상지역으로 가정」 고정 문구 삭제'); checks++;
assert.doesNotMatch(code, /zoneUnknown|acqZoneUnknown/, '모름을 가정하던 배너·표지 삭제'); checks++;
assert.doesNotMatch(code, /clamp\(answers\.housingCount\) \|\| 1|houses < 1/, '주택 수 기본값 1 삭제'); checks++;
assert.doesNotMatch(code, /1주택 기준으로 계산|비조정으로 계산/, '모름을 가정으로 계산한다는 선택지 문구 삭제'); checks++;
assert.doesNotMatch(code, /e\.status === 422\) calc\.blocked/, '422 만 거부로 보던 분기 삭제(4xx 전체를 분류 함수가 가른다)'); checks++;
assert.match(code, /c\['최적방법'\]·c\['절세액'\] 은 의도적으로 사용하지 않음/, '판단 라벨(최적방법·절세액) 억제 주석 유지'); checks++;

console.log(`\nOK compare request: ${checks} checks`);

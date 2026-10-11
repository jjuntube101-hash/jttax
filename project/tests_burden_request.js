/* 부담부증여 최적화 — 화면 답 → 엔진 요청 변환·엔진 응답 상태 판독을 «실행»으로 고정한다 (261011 워크플로 계약 정합).

   소스(ReportBurdenedOptimize.jsx)에서 순수 함수 본문을 AST 범위로 꺼내 vm 에서 그대로 돌린다(tests_comprehensive_request.js 와 같은 방식 —
   테스트가 흉내 낸 규칙과 앱이 쓰는 규칙이 갈라지지 않게). 선언이 사라지거나 이름이 바뀌면 조용히 통과하지 않고 여기서 죽는다.

   고정하는 것
   · 조정대상지역 「모름」은 주택에서 엔진을 부르지 않고 차단한다(false 로 바꿔 보내지 않는다). 토지·상가는 이 답이 계산을 가르지 않아 키 없이 진행한다
   · 취득 당시 조정대상지역: 증여자 세대에 다른 주택이 없는(1주택) 주택이고 취득일 ≥ 2017-08-03 일 때만 묻고, 「예/아니오」만 보내며 «모름»은 키가 없다.
     다주택·기준일 전·토지는 묻지도 보내지도 않는다(낡은 답이 남아 있어도)
   · 객관적 채무: 채무가 있을 때 묻고, 「네」만 is_objective_debt:true 로 보낸다. 「아니오」(단순 증여와 같음)·「모름」은 차단. 채무 0 은 묻지도 보내지도 않는다
   · 받는 분 세대 주택 수 「모름」은 차단(1주택으로 바꿔 보내지 않는다)
   · 보유 연수가 아니라 입력한 취득일을 그대로 보낸다(연 단위 반올림 없음)
   · bgReadResponse — ok 만 정밀. needs_input·unsupported·상태 키 없음·알 수 없는 상태·오류 필드·계산제외채무액은 차단(엔진 안내 문구 전달), 상태 error·깨진 응답은 재시도
   · 화면 배선 — 막는 답이면 엔진을 부르지 않고, 응답은 bgReadResponse 로만 판독하며, 모름을 가정하던 배너가 없다 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const parser = require('@babel/parser');

const code = fs.readFileSync(path.join(__dirname, 'src', 'ReportBurdenedOptimize.jsx'), 'utf8');
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
  if (missing.length) throw new Error('ReportBurdenedOptimize.jsx 에서 최상위 선언을 찾지 못했습니다: ' + missing.join(', '));
  return chunks.join('\n');
}
const validCalcSrc = commonSrc.match(/window\.jtValidCalc = function[\s\S]*?\n  };/)[0];
const DECLS = ['BURDEN_QS', 'bgValidISODate', 'bgIsoDate', 'bgIsDwelling', 'bgAsksZoneAtAcq', 'bgNeedsDoneeHouses', 'bgApplyAnswer', 'bgBuildBody', 'bgReadResponse'];
const declSrc = loadDecls(code, DECLS);
const EXPORTS = '\nglobalThis.__e = { BURDEN_QS, bgIsDwelling, bgAsksZoneAtAcq, bgApplyAnswer, bgBuildBody, bgReadResponse };';
const ctx = vm.createContext({ window: {}, Date, Number, Object, Math, JSON, String, Array, acqKoreanAmount: undefined });
vm.runInContext(validCalcSrc, ctx);
vm.runInContext(declSrc + EXPORTS, ctx);
const F = ctx.__e;

const TODAY = '2026-10-11';
const A = {
  propertyValue: '1500000000', assetType: 'house', acquisitionPrice: '400000000', acquisitionDate: '2016-09-03',
  actualDebt: '437000000', debtObjective: 'yes', doneeCanRepay: 'yes', donorHouseCount: '0', recipient: 'child_adult', doneeHouseCount: '0',
  adjustedZone: 'no', areaClass: 'under',
};
const build = (over) => F.bgBuildBody({ ...A, ...over }, TODAY);
const bodyOf = (over) => plain(build(over).body);
const LATE = { acquisitionDate: '2020-01-01' };   // 2017-08-03 이후 취득
const q = (id) => F.BURDEN_QS.find((x) => x.id === id);

// ───────────────────────── 기본 요청 ─────────────────────────
console.log('════ 기본 요청 — 답한 것만 보낸다 ════');
eq(bodyOf({}), {
  property_value: 1500000000, acquisition_price: 400000000, acquisition_date: '2016-09-03', relationship: '직계존속', donee_age: 30,
  property_type: '주택', donor_other_house_count: 0, max_debt: 437000000, is_regulated_area: false, is_objective_debt: true,
  donee_can_repay: true, area_class: '85이하', donee_other_house_count: 0,
}, '답이 그대로 요청이 된다(기준일 전 취득 → 취득 당시 지역 키 없음)');
// 취득일은 입력한 날짜 그대로 — 보유 연수 반올림도, 월 환산 밀림도 없다
for (const d of ['2025-03-31', '2024-02-29', '2025-04-15', '2026-10-11']) eq(bodyOf({ acquisitionDate: d, regulatedAtAcq: 'no' }).acquisition_date, d, '취득일 ' + d + ' 그대로');
assert.doesNotMatch(code, /Math\.round\(hy|setFullYear\(d\.getFullYear\(\) - Math\.round/, '보유 연수를 연 단위로 반올림해 취득일을 만들지 않는다'); checks++;

// ───────────────────────── 조정대상지역(현재) ─────────────────────────
console.log('════ 조정대상지역 — 「아니오」와 「모름」은 다르다 ════');
{
  const o = q('adjustedZone').opts.map((x) => x[0]);
  eq(plain(o), ['yes', 'no', 'unknown'], '선택지: 예 · 아니오 · 모름(「아니오/모름」 합침 없음)');
  eq(bodyOf({ adjustedZone: 'yes' }).is_regulated_area, true, '예 → true');
  eq(bodyOf({ adjustedZone: 'no' }).is_regulated_area, false, '아니오 → false');
  const u = build({ adjustedZone: 'unknown' });
  ok(u.blocked === true && !u.body && !u.error && /조정대상지역/.test(u.blockReasons[0]), '주택 + 모름 → 엔진을 부르지 않고 차단(false 로 바꿔 보내지 않는다)');
  for (const t of ['land', 'commercial']) {
    const r = build({ assetType: t, adjustedZone: 'unknown', areaClass: undefined });
    ok(r.body && !('is_regulated_area' in r.body), t + ' + 모름 → 이 답이 계산을 가르지 않으므로 키 없이 진행');
    eq(plain(build({ assetType: t, adjustedZone: 'yes', areaClass: undefined }).body).is_regulated_area, true, t + ' + 예 → true');
  }
  for (const bad of [undefined, '', 'maybe']) ok(build({ adjustedZone: bad }).error, '답이 없거나 목록 밖(' + JSON.stringify(bad) + ') → 요청 거부');
}

// ───────────────────────── 취득 당시 조정대상지역 ─────────────────────────
console.log('════ 취득 당시 조정대상지역 — 증여자 1주택·기준일 이후 주택에만 ════');
{
  const shows = (a) => q('regulatedAtAcq').showIf(a);
  eq([shows({ assetType: 'house', acquisitionDate: '2017-08-02', donorHouseCount: '0' }), shows({ assetType: 'house', acquisitionDate: '2017-08-03', donorHouseCount: '0' }),
    shows({ assetType: 'house', acquisitionDate: '2020-01-01', donorHouseCount: '0' }), shows({ assetType: 'house', acquisitionDate: '2020-01-01', donorHouseCount: '1' }),
    shows({ assetType: 'house', acquisitionDate: '2020-01-01', donorHouseCount: '3' }), shows({ assetType: 'house', acquisitionDate: '2020-01-01' }),
    shows({ assetType: 'land', acquisitionDate: '2020-01-01', donorHouseCount: '0' }), shows({ assetType: 'commercial', acquisitionDate: '2020-01-01', donorHouseCount: '0' }),
    shows({ assetType: 'officetel', acquisitionDate: '2020-01-01', donorHouseCount: '0' })],
  [false, true, true, false, false, false, false, false, true], '문항 표시: 주택(오피스텔 포함)·취득일 ≥ 2017-08-03·증여자 다른 주택 0채');
  eq(bodyOf({ ...LATE, regulatedAtAcq: 'yes' }).regulated_at_acquisition, true, '예 → true');
  eq(bodyOf({ ...LATE, regulatedAtAcq: 'no' }).regulated_at_acquisition, false, '아니오 → false');
  ok(!('regulated_at_acquisition' in bodyOf({ ...LATE, regulatedAtAcq: 'unknown' })), '모름 → 키가 없다(엔진이 두 값으로 대조 계산)');
  ok(build({ ...LATE, regulatedAtAcq: 'unknown' }).body, '모름은 차단하지 않는다(엔진이 갈리는지 판정)');
  ok(build({ ...LATE }).error, '묻는 경우인데 답이 없으면 요청 거부');
  // 묻지 않는 경우 — 낡은 답이 있어도 보내지 않는다
  for (const [over, label] of [[{ donorHouseCount: '1' }, '증여자 다주택(1채 더)'], [{ donorHouseCount: '3' }, '증여자 다주택(3채 이상 더)'],
    [{ acquisitionDate: '2017-08-02' }, '기준일 전 취득'], [{ assetType: 'land', areaClass: undefined }, '토지'], [{ assetType: 'commercial', areaClass: undefined }, '상가']]) {
    for (const stale of [undefined, 'yes', 'no', 'unknown']) {
      const r = build({ ...LATE, ...over, regulatedAtAcq: stale });
      ok(r.body && !('regulated_at_acquisition' in r.body), label + ' + 낡은 답 ' + stale + ' → 묻지도 보내지도 않는다');
    }
  }
  // 전입일: 입력했을 때만, 취득일~오늘 사이
  ok(!('move_in_date' in bodyOf({})), '전입일을 비우면 보내지 않는다(거주하지 않은 것으로 계산)');
  eq(bodyOf({ moveInDate: '2017-01-10' }).move_in_date, '2017-01-10', '전입일 입력 → 그대로');
  ok(build({ moveInDate: '2016-01-01' }).error, '전입일이 취득일보다 앞서면 거부');
  ok(build({ moveInDate: '2026-12-31' }).error, '미래 전입일 거부');
  // 답 저장: 증여자 주택 수가 바뀌면 취득 당시 지역 답을 지운다
  const w = { ...A, ...LATE, regulatedAtAcq: 'no', moveInDate: '2020-03-01' };
  const w1 = plain(F.bgApplyAnswer(w, 'donorHouseCount', '1'));
  ok(!('regulatedAtAcq' in w1) && w1.moveInDate === '2020-03-01', '증여자 주택 수 변경 → 취득 당시 지역 답만 삭제(전입일은 장기보유특별공제에도 쓰이므로 유지)');
  ok(plain(F.bgApplyAnswer(w, 'donorHouseCount', '0')).regulatedAtAcq === 'no', '같은 값을 다시 고르면 지우지 않는다');
  ok(!('regulatedAtAcq' in plain(F.bgApplyAnswer(w, 'acquisitionDate', '2022-01-01'))), '취득일 변경 → 삭제(기존 규칙 유지)');
  // 문항 순서: 증여자 주택 수를 먼저 물어야 취득 당시 지역을 물을지 안다
  const order = F.BURDEN_QS.map((x) => x.id);
  ok(order.indexOf('donorHouseCount') < order.indexOf('regulatedAtAcq') && order.indexOf('regulatedAtAcq') < order.indexOf('moveInDate'), '문항 순서: 증여자 주택 수 → 취득 당시 지역 → 전입일');
}

// ───────────────────────── 객관적 채무 ─────────────────────────
console.log('════ 객관적 채무 — 네만 보내고, 아니오·모름은 차단, 채무 0 은 묻지 않는다 ════');
{
  const d = q('debtObjective');
  ok(d && Array.isArray(d.opts), '객관적 채무 문항이 있다');
  eq(plain(d.opts.map((x) => x[0])), ['yes', 'no', 'unknown'], '선택지: 네 · 아니오 · 모름');
  eq([d.showIf({ actualDebt: '1' }), d.showIf({ actualDebt: '0' }), d.showIf({ actualDebt: '' }), d.showIf({})], [true, false, false, false], '문항 표시: 채무가 있을 때만');
  const order = F.BURDEN_QS.map((x) => x.id);
  ok(order.indexOf('actualDebt') < order.indexOf('debtObjective'), '문항 순서: 채무액 다음');
  eq(bodyOf({ debtObjective: 'yes' }).is_objective_debt, true, '네 → is_objective_debt: true');
  const no = build({ debtObjective: 'no' });
  ok(no.blocked === true && !no.body && /단순 증여와 같/.test(no.blockReasons[0]) && /증여세 계산기/.test(no.blockReasons[0]), '아니오 → 차단(채무 공제 불인정·단순 증여와 같음 → 증여세 계산기 안내)');
  const un = build({ debtObjective: 'unknown' });
  ok(un.blocked === true && !un.body && /객관적으로 확인되는지 모르면 세무사 확인/.test(un.blockReasons[0]), '모름 → 차단');
  ok(build({ debtObjective: undefined }).error, '채무가 있는데 답이 없으면 요청 거부');
  // 채무 0: 묻지도 보내지도 않는다(낡은 «아니오»도 막지 않는다)
  for (const stale of [undefined, 'yes', 'no', 'unknown']) {
    const r = build({ actualDebt: '0', debtObjective: stale, doneeCanRepay: undefined, doneeHouseCount: undefined });
    ok(r.body && !('is_objective_debt' in r.body) && r.body.max_debt === 0, '채무 0 + 낡은 답 ' + stale + ' → 키 없음·차단 없음');
  }
  // 채무액이 바뀌면 답을 지운다
  const a1 = plain(F.bgApplyAnswer(A, 'actualDebt', '1'));
  ok(!('debtObjective' in a1) && !('doneeCanRepay' in a1), '채무액 변경 → 객관적 채무·변제 능력 답 삭제');
  ok(plain(F.bgApplyAnswer(A, 'actualDebt', A.actualDebt)).debtObjective === 'yes', '같은 채무액이면 유지');
  ok(plain(F.bgApplyAnswer(A, 'adjustedZone', 'yes')).debtObjective === 'yes', '무관한 답 변경은 건드리지 않는다');
}

// ───────────────────────── 받는 분 세대 주택 수 ─────────────────────────
console.log('════ 받는 분 세대 주택 수 — 모름은 차단 ════');
{
  for (const v of ['0', '1', '2', '3']) eq(bodyOf({ doneeHouseCount: v }).donee_other_house_count, Number(v), '받는 분 세대 주택 ' + v);
  const u = build({ doneeHouseCount: 'unknown' });
  ok(u.blocked === true && !u.body && /받는 분 세대의 주택 수/.test(u.blockReasons[0]), '모름 → 차단(1주택 기준으로 계산하지 않는다)');
  ok(build({ doneeHouseCount: undefined }).error, '묻는 경우인데 답이 없으면 요청 거부');
  for (const [over, label] of [[{ recipient: 'spouse' }, '배우자'], [{ recipient: 'child_minor' }, '미성년 자녀'], [{ doneeCanRepay: 'no' }, '변제 능력 없음'],
    [{ doneeCanRepay: 'unknown' }, '변제 능력 모름'], [{ assetType: 'land', areaClass: undefined }, '토지']]) {
    const r = build({ ...over, doneeHouseCount: 'unknown' });
    ok(r.body && !('donee_other_house_count' in r.body), label + ' → 묻지도 보내지도 않고 낡은 «모름»도 막지 않는다');
  }
  // 변제 능력 «모름»은 승인된 가정(증여 취득) — 키를 보내지 않고 진행한다
  const c = build({ doneeCanRepay: 'unknown', doneeHouseCount: undefined });
  ok(c.body && !('donee_can_repay' in c.body), '변제 능력 모름 → 키 없음(엔진이 증여 취득으로 계산하고 고지)');
}

// ───────────────────────── 여러 사유가 겹칠 때 · 오피스텔 ─────────────────────────
console.log('════ 막는 답이 겹치면 사유를 모두 보여 주고, 오피스텔은 사유와 함께 차단 ════');
{
  const r = build({ adjustedZone: 'unknown', debtObjective: 'unknown', doneeHouseCount: 'unknown' });
  ok(r.blocked && r.blockReasons.length === 3 && !r.body, '조정대상지역·객관적 채무·받는 분 주택 수 → 사유 3개');
  ok(build({ propertyValue: '0', adjustedZone: 'unknown' }).error, '시세가 없으면 차단 전에 오류');
  const o = build({ assetType: 'officetel' });
  ok(o.blocked === true && !o.body && !o.error && o.blockReasons.length === 1 && /오피스텔/.test(o.blockReasons[0]), '오피스텔 → 차단 + 사유 문구');
}

// ───────────────────────── 기존 요청 규칙(유지) ─────────────────────────
console.log('════ 기존 요청 규칙 유지 ════');
{
  for (const [over, label] of [[{ propertyValue: '' }, '시세 없음'], [{ acquisitionPrice: '' }, '취득가 없음'], [{ acquisitionDate: '' }, '취득일 없음'],
    [{ acquisitionDate: '2025-02-30' }, '없는 날짜'], [{ actualDebt: '' }, '채무 미입력'], [{ actualDebt: '1500000001' }, '채무 > 시세'],
    [{ donorHouseCount: undefined }, '증여자 주택 수 미선택'], [{ areaClass: undefined }, '면적 구분 미선택']]) {
    const r = build(over);
    ok(r.error && !r.body && !r.blocked, '요청 거부: ' + label);
  }
  eq(bodyOf({ recipient: 'spouse', doneeHouseCount: undefined }).relationship, '배우자', '배우자');
  eq(bodyOf({ recipient: 'child_minor', doneeHouseCount: undefined }).donee_age, 10, '미성년');
  eq(bodyOf({ areaClass: 'unknown' }).area_class, '모름', '면적 모름은 그대로 보낸다(승인된 가정 — 엔진이 고지)');
  eq(bodyOf({ donorHouseCount: '3' }).donor_other_house_count, 3, '증여자 세대 다른 주택 3채 이상');
}

// ───────────────────────── 응답 상태 판독 ─────────────────────────
console.log('════ bgReadResponse — 상태 키 ════');
const row = (debt, total) => ({ 채무비율: debt / 1500000000, 채무액: debt, 증여세: total - 10, 양도세: 0, 취득세: 10, 총세부담: total });
const GOOD = { 상태: 'ok', 채무없는경우세액: 1000, 최적총세부담: 700, 최적채무비율: 0.2, 절세액: 300,
  시뮬레이션결과: [row(0, 1000), row(300000000, 700), row(437000000, 800)], 계산제외채무액: [], 경고사항: ['전제 A', '고지 B'] };
const read = (c) => plain(F.bgReadResponse(plain(c), 437000000));
{
  const r = read(GOOD);
  ok(r.precise === true && r.blocked === false, '상태 ok + 유효한 표 → 정밀');
  eq([r.noDebt, r.fullDebt, r.savings, r.warnings], [1000, 800, 300, ['전제 A', '고지 B']], '엔진 값을 그대로 옮긴다');
  const { 상태, ...noStatus } = GOOD;
  const ns = read(noStatus);
  ok(ns.precise === false && ns.blocked === true && ns.engineState === 'refused' && /상태 없음/.test(ns.engineMessage), '상태 키가 없으면 금액이 있어도 거부(차단)');
  ok(read({}).blocked === true && read({}).precise === false, '빈 객체(상태 없음) → 거부');
  for (const st of ['needs_input', 'unsupported']) {
    const x = read({ ...GOOD, 상태: st, 오류: '  취득 당시 조정대상지역 여부를 확인하세요  ' });
    ok(x.precise === false && x.blocked === true && x.engineState === st && x.engineMessage === '취득 당시 조정대상지역 여부를 확인하세요', st + ' → 차단 + 엔진 안내 문구');
    ok(!('sims' in x) && !('noDebt' in x) && !('savings' in x), st + ' → 금액 필드가 없다(응답에 금액이 있어도 옮기지 않는다)');
  }
  const e = read({ ...GOOD, 상태: 'error', 오류: '내부 오류', 계산제외채무액: [150000000] });
  ok(e.precise === false && e.blocked === false && e.engineState === 'down', '상태 error → 차단이 아니라 다시 시도 안내(계산제외채무액도 엔진 상태로 거른다)');
  for (const st of ['OK', '', null, true, 'done', undefined]) {
    const x = read({ ...GOOD, 상태: st });
    ok(x.precise === false && x.blocked === true && x.engineState === 'refused', '알 수 없는 상태 ' + JSON.stringify(st) + ' → 거부');
  }
  const z = read({ ...GOOD, 오류: '실패' });
  ok(z.precise === false && z.blocked === true, 'ok 인데 오류 필드 → 거부');
  const ex = read({ ...GOOD, 계산제외채무액: [150000000] });
  ok(ex.precise === false && ex.blocked === true, 'ok 인데 계산제외채무액이 남아 있으면(모순) 차단');
  for (const bad of [null, undefined, [], 'x', 3]) {
    const x = plain(F.bgReadResponse(bad, 437000000));
    ok(x.precise === false && x.blocked === false, '객체가 아닌 calc ' + JSON.stringify(bad) + ' → 연결 문제와 같은 안내');
  }
  // 상태 ok 여도 표를 다시 계산해 맞지 않으면 정밀이 아니다(기존 규칙 유지)
  for (const [c, label] of [
    [{ ...GOOD, 시뮬레이션결과: [] }, '빈 표'],
    [{ ...GOOD, 채무없는경우세액: 999 }, '채무 없는 경우 금액이 0원 행과 다름'],
    [{ ...GOOD, 절세액: 250 }, '절세액이 (채무 0 행 − 최솟값)과 다름'],
    [{ ...GOOD, 최적채무비율: 1.2 }, '비율 > 1'],
    [{ ...GOOD, 시뮬레이션결과: [row(0, 1000), { ...row(300000000, 700), 취득세: 11 }, row(437000000, 800)] }, '행의 세목 합계가 총세부담과 다름'],
  ]) {
    const x = read(c);
    ok(x.precise === false && x.blocked === false, 'ok 인데 표가 맞지 않음 → 불채택(' + label + ')');
  }
}

// ───────────────────────── 화면 배선 ─────────────────────────
console.log('════ 화면 배선 ════');
assert.match(code, /if \(built\.blocked\) \{ setReport\(\{ calc: \{ precise: false, blocked: true, maxDebt: 0, blockReasons: built\.blockReasons \} \}\); setLoading\(false\); return; \}/); checks++;
assert.match(code, /calc = bgReadResponse\(j && j\.calc, body\.max_debt\);/); checks++;
assert.match(code, /const setAns = \(id, v\) => setAnswers\(a => bgApplyAnswer\(a, id, v\)\);/); checks++;
assert.match(code, /calc\.blocked \?/); checks++;
assert.match(code, /calc\.engineMessage/, '엔진 안내 문구를 차단 화면에 보인다'); checks++;
assert.doesNotMatch(code, /zoneUnknown|acqZoneUnknown/, '모름을 가정하던 배너·표지 삭제'); checks++;
assert.doesNotMatch(code, /조정대상지역이 아닌 것으로 계산하고|조정대상지역이었던 것으로 보고|1주택 기준으로 계산/, '모름을 가정으로 계산한다는 문구 삭제'); checks++;
assert.doesNotMatch(code, /e\.status === 422\) calc\.blocked/, '422 만 거부로 보던 분기 삭제'); checks++;
assert.doesNotMatch(code, /donor_other_house_count: Number\(answers\.donorHouseCount\) \|\| 0/, '증여자 주택 수를 0 으로 바꿔 보내지 않는다'); checks++;

console.log(`\nOK burden request: ${checks} checks`);

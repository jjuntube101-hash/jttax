/* 양도세 — 화면 답 → 엔진 요청 변환·답 저장·일시적 2주택 기한 연수를 «실행»으로 고정한다 (261004).

   소스(ReportCGT.jsx)에서 순수 함수 본문을 AST 범위로 꺼내 vm 에서 그대로 돌린다(tests_burden_compare_request.js·
   tests_acq_flow.js 와 같은 방식 — 테스트가 흉내 낸 규칙과 앱이 쓰는 규칙이 갈라지지 않게). 선언이 사라지거나
   이름이 바뀌면 조용히 통과하지 않고 여기서 죽는다.

   고정하는 것
   · 유형별 property_type·housing_count 매핑, is_regulated_area·regulated_at_acquisition(모름=true) 매핑
   · 일시적 2주택(exemption_special_type·new_house_acquisition_date)·상속(inherited_house_count·inheritance_start_date) 매핑
   · temp2Zone 문항: 표시 조건, 네 가지 답의 변환, «문항이 안 보일 때는 낡은 답이 있어도 보내지 않음»
   · 답의 생애주기(cgtApplyAnswer): 표시 조건을 이루는 답이 바뀌면 temp2Zone 답 삭제
   · 기한 연수(cgtTemp2Years) 규칙의 경계 — 2026-08-03/04, 2026-09-30/10-01
   · 엔진 호출 → 판정 세 갈래(HTTP 422·503·네트워크 실패·시간 초과), 요청이 /v1/calc/transfer 로 가는지 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const parser = require('@babel/parser');

const SRC = path.join(__dirname, 'src', 'ReportCGT.jsx');
const code = fs.readFileSync(SRC, 'utf8');
const commonSrc = fs.readFileSync(path.join(__dirname, 'src', 'Report.jsx'), 'utf8');

let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const ok = (v, label) => { assert.ok(v, label); checks++; };
/* vm 안에서 만든 객체는 프로토타입이 달라 deepStrictEqual 이 어긋난다 — JSON 으로 옮겨 비교한다 */
const plain = (v) => JSON.parse(JSON.stringify(v));

/* ── 소스에서 «최상위 선언»을 이름으로 꺼낸다 ── */
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
  if (missing.length) throw new Error('ReportCGT.jsx 에서 최상위 선언을 찾지 못했습니다: ' + missing.join(', '));
  return chunks.join('\n');
}
const validCalcSrc = commonSrc.match(/window\.jtValidCalc = function[\s\S]*?\n  };/)[0];

const ctx = vm.createContext({ window: {}, Date, Number, Object, Math, JSON, Promise });
vm.runInContext(validCalcSrc, ctx);
vm.runInContext(loadDecls(code, ['isValidISODate', 'isoDate', 'cgtTemp2Visible', 'cgtApplyAnswer', 'cgtTemp2Years', 'cgtTemp2Phrase', 'mapAnswersToTransfer']), ctx);
vm.runInContext('globalThis.__fns = { mapAnswersToTransfer, cgtApplyAnswer, cgtTemp2Years, cgtTemp2Visible, cgtTemp2Phrase };', ctx);
const { mapAnswersToTransfer: map, cgtApplyAnswer, cgtTemp2Years, cgtTemp2Visible, cgtTemp2Phrase } = ctx.__fns;
const body = (a) => plain(map(a));

/* 기준 답 — 양도일·취득일을 명시해 «오늘»에 기대지 않는다 */
const BASE = { acquiredDate: '2018-03-15', transferDate: '2026-10-05', acquired: '500000000', sold: '900000000' };

// ───────────────────────── 유형별 property_type · housing_count ─────────────────────────
console.log('════ 유형별 property_type · housing_count ════');
for (const [assetType, pt, hc] of [
  ['house_1', '주택', 1], ['house_2', '주택', 2], ['house_3', '주택', 3],
  ['presale', '분양권', 1], ['occupancy_orig', '입주권', 1], ['occupancy_succ', '입주권', 1],
  ['replacement', '주택', 1],
]) {
  const b = body({ ...BASE, assetType });
  eq([b.property_type, b.housing_count], [pt, hc], assetType + ' → ' + pt + '·' + hc);
}
eq(body({ ...BASE, assetType: 'commercial', nonHouseType: 'building' }).property_type, '상가', '비주택(건물) → 상가');
eq(body({ ...BASE, assetType: 'commercial', nonHouseType: 'land', landUse: 'business' }).property_type, '토지', '비주택(토지) → 토지');
eq(body({ ...BASE, assetType: 'commercial' }).property_type, '상가', '비주택·유형 미응답 → 상가(업무용 오피스텔 포함)');
eq(body({ ...BASE, assetType: 'house_2' }).transfer_price, 900000000, '양도가 그대로');
eq(body({ ...BASE, assetType: 'house_2' }).acquisition_price, 500000000, '취득가 그대로');
eq([body({ ...BASE, assetType: 'house_1', expenses: '30000000' }).expenses_total, body({ ...BASE, assetType: 'house_1' }).expenses_total], [30000000, 0], '필요경비(없으면 0)');
// 토지 사용현황 → 비사업용(모름은 보수적으로 비사업용)
eq(body({ ...BASE, assetType: 'commercial', nonHouseType: 'land', landUse: 'non_business' }).is_non_business_land, true, '토지 비사업용');
eq(body({ ...BASE, assetType: 'commercial', nonHouseType: 'land', landUse: 'unsure' }).is_non_business_land, true, '토지 모름 → 비사업용(보수적)');
eq(body({ ...BASE, assetType: 'commercial', nonHouseType: 'land', landUse: 'business' }).is_non_business_land, false, '토지 사업용');
ok(!('is_non_business_land' in body({ ...BASE, assetType: 'commercial', nonHouseType: 'building', landUse: 'non_business' })), '건물에는 낡은 토지 답을 보내지 않는다');
// 승계취득 입주권 → 장특 배제 표지
eq(body({ ...BASE, assetType: 'occupancy_succ' }).acquired_from_member, true, '승계취득 입주권');
eq(body({ ...BASE, assetType: 'occupancy_orig' }).is_original_member, true, '원조합원 입주권');
eq(body({ ...BASE, assetType: 'replacement' }).exemption_special_type, 'replacement_house', '대체주택 특례');

// ───────────────────────── 조정대상지역 ─────────────────────────
console.log('════ is_regulated_area · regulated_at_acquisition ════');
for (const [adj, want] of [['yes', true], ['no', false], [undefined, false]]) {
  eq(body({ ...BASE, assetType: 'house_1', adjustedZone: adj }).is_regulated_area, want, 'is_regulated_area: 주택 · 현재 조정 ' + adj);
}
for (const [acq, want] of [['yes', true], ['no', false], ['unsure', true], [undefined, true]]) {
  eq(body({ ...BASE, assetType: 'house_1', acqAdjustedZone: acq }).regulated_at_acquisition, want, 'regulated_at_acquisition: 취득 당시 ' + acq + '(모름·미응답 → true)');
}
for (const t of ['presale', 'occupancy_orig', 'commercial']) {
  const b = body({ ...BASE, assetType: t, adjustedZone: 'yes', acqAdjustedZone: 'yes' });
  eq([b.is_regulated_area, b.regulated_at_acquisition], [false, false], t + ': 낡은 조정지역 답은 보내지 않는다(주택 한정)');
}

// ───────────────────────── 일시적 2주택 · 상속 ─────────────────────────
console.log('════ 일시적 2주택 · 상속 매핑 ════');
{
  const t = body({ ...BASE, assetType: 'house_2', otherHouseSource: 'bought', newHouseDate: '2024-06-01' });
  eq([t.exemption_special_type, t.new_house_acquisition_date], ['temporary_2house', '2024-06-01'], '일시적 2주택: 특례 종류·새 집 취득일');
  ok(!('temp2_both_regulated' in t), '2026-08-04 이전 새 집 → 조정대상지역 문항 키를 보내지 않는다');
  const noDate = body({ ...BASE, assetType: 'house_2', otherHouseSource: 'bought' });
  ok(!('exemption_special_type' in noDate) && !('new_house_acquisition_date' in noDate), '새 집 취득일이 없으면 특례 요청을 만들지 않는다');
  const inh = body({ ...BASE, assetType: 'house_2', otherHouseSource: 'inherited', inheritanceDate: '2020-03-15' });
  eq([inh.inherited_house_count, inh.inheritance_start_date], [1, '2020-03-15'], '상속주택: 취득일 ≤ 상속개시일 → 특례 요청');
  const inhSame = body({ ...BASE, acquiredDate: '2020-03-15', assetType: 'house_2', otherHouseSource: 'inherited', inheritanceDate: '2020-03-15' });
  eq(inhSame.inherited_house_count, 1, '상속주택: 취득일 = 상속개시일(경계) → 특례 요청');
  const inhLate = body({ ...BASE, acquiredDate: '2021-01-01', assetType: 'house_2', otherHouseSource: 'inherited', inheritanceDate: '2020-03-15' });
  ok(!('inherited_house_count' in inhLate) && !('inheritance_start_date' in inhLate), '상속주택: 파는 집을 상속개시일 이후에 취득 → 특례 요청 없음');
  ok(!('inherited_house_count' in body({ ...BASE, assetType: 'house_2', otherHouseSource: 'inherited' })), '상속개시일 미입력 → 특례 요청 없음');
  // 다른 유형에 낡은 답이 새지 않는다
  const stale = body({ ...BASE, assetType: 'house_1', otherHouseSource: 'bought', newHouseDate: '2024-06-01', inheritanceDate: '2020-03-15' });
  ok(!('exemption_special_type' in stale) && !('new_house_acquisition_date' in stale) && !('inherited_house_count' in stale), '1주택에는 2주택 특례 답(낡은 답)을 보내지 않는다');
}

// ───────────────────────── temp2Zone ─────────────────────────
console.log('════ temp2Zone — 표시 조건과 요청 변환 ════');
const T2 = { ...BASE, assetType: 'house_2', otherHouseSource: 'bought', newHouseDate: '2026-08-04' };
eq(cgtTemp2Visible(T2), true, '표시: 2주택·사서 갈아탐·새 집 취득일 2026-08-04(경계)');
eq(cgtTemp2Visible({ ...T2, newHouseDate: '2026-08-03' }), false, '숨김: 2026-08-03(경계)');
eq(cgtTemp2Visible({ ...T2, newHouseDate: '2027-01-15' }), true, '표시: 그 이후');
eq(cgtTemp2Visible({ ...T2, newHouseDate: '' }), false, '숨김: 새 집 취득일 비어 있음');
eq(cgtTemp2Visible({ ...T2, newHouseDate: undefined }), false, '숨김: 새 집 취득일 미입력');
eq(cgtTemp2Visible({ ...T2, newHouseDate: '2026-1' }), false, '숨김: 타이핑 중인 미완성 날짜');
eq(cgtTemp2Visible({ ...T2, newHouseDate: '2026-13-45' }), false, '숨김: 존재하지 않는 날짜');
eq(cgtTemp2Visible({ ...T2, assetType: 'house_1' }), false, '숨김: 1주택');
eq(cgtTemp2Visible({ ...T2, assetType: 'house_3' }), false, '숨김: 3주택');
eq(cgtTemp2Visible({ ...T2, otherHouseSource: 'inherited' }), false, '숨김: 상속·증여로 받은 다른 집');
eq(cgtTemp2Visible({ ...T2, otherHouseSource: undefined }), false, '숨김: 다른 집 취득 경위 미응답');
for (const [ans, want] of [['yes', true], ['no', false], ['contract', false]]) {
  eq(body({ ...T2, temp2Zone: ans }).temp2_both_regulated, want, 'temp2Zone ' + ans + ' → temp2_both_regulated ' + want);
}
ok(!('temp2_both_regulated' in body({ ...T2, temp2Zone: 'unknown' })), 'temp2Zone unknown(모름) → 키를 보내지 않는다');
ok(!('temp2_both_regulated' in body({ ...T2 })), 'temp2Zone 미응답 → 키를 보내지 않는다');
ok(!('temp2_both_regulated' in body({ ...T2, temp2Zone: 'bogus' })), '목록 밖의 답 → 키를 보내지 않는다');
eq(body({ ...T2, temp2Zone: 'yes' }).exemption_special_type, 'temporary_2house', 'temp2Zone 이 있어도 일시적 2주택 요청은 그대로');
// 문항이 «보이지 않는» 조건에서는 낡은 답이 있어도 보내지 않는다
for (const [label, over] of [
  ['새 집 취득일 2026-08-03 이전', { newHouseDate: '2026-08-03' }],
  ['새 집 취득일 한참 이전', { newHouseDate: '2024-06-01' }],
  ['새 집 취득일 미입력', { newHouseDate: '' }],
  ['1주택으로 바뀜', { assetType: 'house_1' }],
  ['3주택으로 바뀜', { assetType: 'house_3' }],
  ['다른 집이 상속·증여로 바뀜', { otherHouseSource: 'inherited', inheritanceDate: '2020-03-15' }],
]) {
  for (const stale of ['yes', 'no', 'contract']) {
    ok(!('temp2_both_regulated' in body({ ...T2, ...over, temp2Zone: stale })), '낡은 temp2Zone=' + stale + ' 는 보내지 않는다: ' + label);
  }
}

// ───────────────────────── 답의 생애주기 ─────────────────────────
console.log('════ cgtApplyAnswer — 답 삭제 규칙 ════');
{
  const a0 = { assetType: 'house_2', otherHouseSource: 'bought', newHouseDate: '2026-08-04', temp2Zone: 'yes', adjustedZone: 'no' };
  for (const [id, v] of [['assetType', 'house_1'], ['otherHouseSource', 'inherited'], ['newHouseDate', '2026-09-01']]) {
    const n = cgtApplyAnswer(a0, id, v);
    ok(!('temp2Zone' in n), id + ' 가 바뀌면 temp2Zone 답을 지운다');
    eq(n[id], v, id + ' 새 값 저장');
    eq(n.adjustedZone, 'no', id + ' 변경이 무관한 답을 건드리지 않는다');
  }
  for (const [id, v] of [['assetType', 'house_2'], ['otherHouseSource', 'bought'], ['newHouseDate', '2026-08-04']]) {
    eq(cgtApplyAnswer(a0, id, v).temp2Zone, 'yes', id + ' 가 «같은 값»이면 temp2Zone 을 지우지 않는다');
  }
  eq(cgtApplyAnswer(a0, 'adjustedZone', 'yes').temp2Zone, 'yes', '무관한 답 변경은 temp2Zone 을 지우지 않는다');
  eq(cgtApplyAnswer(a0, 'temp2Zone', 'no').temp2Zone, 'no', 'temp2Zone 자체는 저장된다');
  eq(cgtApplyAnswer(a0, 'transferDate', '2026-12-01').temp2Zone, 'yes', '양도일 변경은 temp2Zone 을 지우지 않는다');
  ok(a0.temp2Zone === 'yes' && a0.assetType === 'house_2', '원본 답을 바꾸지 않는다(새 객체)');
  // 날짜를 글자씩 타이핑해도(값이 바뀔 때마다) 지워진 채 유지되고, 다시 같은 값이면 보존된다
  let a = a0; for (const v of ['2026-08-0', '2026-08-04']) a = cgtApplyAnswer(a, 'newHouseDate', v);
  ok(!('temp2Zone' in a), '날짜를 고쳐 쓰면 답이 지워진다(새 날짜에서 다시 답해야 한다)');
}

// ───────────────────────── 기한 연수 ─────────────────────────
console.log('════ cgtTemp2Years — 경계 ════');
const Y = (over) => cgtTemp2Years({ ...T2, ...over });
// 새 집 취득일 경계 (양도일은 2026-10-05 로 2년 규칙 구간)
eq(Y({ newHouseDate: '2026-08-03', temp2Zone: 'yes' }), 3, '새 집 2026-08-03 → 3년(yes 여도)');
eq(Y({ newHouseDate: '2026-08-04', temp2Zone: 'yes' }), 2, '새 집 2026-08-04 + yes → 2년');
eq(Y({ newHouseDate: '2026-08-04', temp2Zone: 'no' }), 3, '새 집 2026-08-04 + no → 3년');
eq(Y({ newHouseDate: '2026-08-04', temp2Zone: 'contract' }), 3, '새 집 2026-08-04 + contract → 3년');
eq(Y({ newHouseDate: '2026-08-04', temp2Zone: 'unknown' }), null, '새 집 2026-08-04 + 모름 → null(두 기한 안내)');
eq(Y({ newHouseDate: '2026-08-04', temp2Zone: undefined }), null, '새 집 2026-08-04 + 미응답 → null');
eq(Y({ newHouseDate: '2025-01-01', temp2Zone: 'yes' }), 3, '새 집이 한참 이전 → 3년');
eq(Y({ newHouseDate: '2025-01-01', temp2Zone: undefined }), 3, '새 집이 이전이면 temp2Zone 이 없어도 3년');
// 양도일 경계 (새 집은 2026-08-04 이후)
eq(Y({ transferDate: '2026-09-30', temp2Zone: 'yes' }), 3, '양도일 2026-09-30 → 3년(yes 여도)');
eq(Y({ transferDate: '2026-10-01', temp2Zone: 'yes' }), 2, '양도일 2026-10-01 + yes → 2년');
eq(Y({ transferDate: '2026-10-01', temp2Zone: 'no' }), 3, '양도일 2026-10-01 + no → 3년');
eq(Y({ transferDate: '2026-10-01', temp2Zone: 'unknown' }), null, '양도일 2026-10-01 + 모름 → null');
eq(Y({ transferDate: '2026-09-30', temp2Zone: 'unknown' }), 3, '양도일 2026-09-30 + 모름 → 3년(2년 규칙 구간 아님)');
eq(Y({ transferDate: '2026-09-30', newHouseDate: '2026-08-03', temp2Zone: 'yes' }), 3, '두 경계 모두 이전 → 3년');
// 양도일이 비어 있으면 todayIso(요청 변환과 같은 기준)
eq(cgtTemp2Years({ ...T2, transferDate: '', temp2Zone: 'yes' }, '2026-10-04'), 2, '양도일 비어 있고 오늘 2026-10-04 → 2년');
eq(cgtTemp2Years({ ...T2, transferDate: '', temp2Zone: 'yes' }, '2026-09-30'), 3, '양도일 비어 있고 오늘 2026-09-30 → 3년');
// 해당하지 않는 경우
eq(cgtTemp2Years({ ...T2, assetType: 'house_1' }), null, '1주택 → null');
eq(cgtTemp2Years({ ...T2, assetType: 'house_3' }), null, '3주택 → null');
eq(cgtTemp2Years({ ...T2, otherHouseSource: 'inherited' }), null, '상속·증여 → null');
eq(cgtTemp2Years({ ...T2, newHouseDate: '' }), null, '새 집 취득일 없음 → null');
eq(cgtTemp2Years({ ...T2, newHouseDate: '2026-13-01' }), null, '새 집 취득일 형식 오류 → null');
// 안내 문구 조각
eq(cgtTemp2Phrase(2), '2년', '문구 2년');
eq(cgtTemp2Phrase(3), '3년', '문구 3년');
eq(cgtTemp2Phrase(null), '두 집이 모두 조정대상지역이었다면 2년, 아니면 3년', '문구: 모름이면 두 기한을 함께');

// ───────────────────────── 문항 정의 ─────────────────────────
console.log('════ CGT_QS — temp2Zone 문항 정의 ════');
{
  const qctx = vm.createContext({ window: {}, Date, Number, Object, Math, JSON });
  vm.runInContext(loadDecls(code, ['isValidISODate', 'cgtTemp2Visible', 'CGT_QS']) + '\nglobalThis.__qs = CGT_QS;', qctx);
  const qs = qctx.__qs;
  const ids = qs.map((q) => q.id);
  const i = ids.indexOf('newHouseDate'), j = ids.indexOf('temp2Zone');
  ok(i >= 0 && j === i + 1, 'temp2Zone 은 newHouseDate 바로 뒤에 있다');
  const q = qs[j];
  eq(q.section, qs[i].section, 'section 은 newHouseDate 와 같다');
  eq(q.q, '새 집을 살 때, 지금 파는 집과 새 집이 「둘 다」 조정대상지역에 있었나요?', '질문 문구');
  ok(q.sub.startsWith('2026년 10월 1일부터, 종전 주택이 조정대상지역에 있는 상태에서') && q.sub.includes('시행령 §155①') && q.sub.includes('부칙 제36737호 §2②')
    && q.sub.endsWith('모르면 「모름」을 고르세요 — 2년이 지난 양도는 과세로 계산하고, 결과 화면에서 그 전제를 알려 드립니다.'), '설명 문구(조문 포함)');
  eq(plain(q.opts), [
    ['yes', '네, 둘 다 조정대상지역', '2년 안에 양도'],
    ['no', '아니오', '3년 안에 양도'],
    ['contract', '2026년 8월 3일 이전 또는 조정대상지역 공고일 이전에 계약하고 계약금을 냈습니다', '종전대로 3년'],
    ['unknown', '모름', '2년 기준으로 계산'],
  ], '선택지');
  ok(!q.optional && !q.date && !q.numeric && !q.freeform, '필수 선택 문항이다(답해야 다음으로 넘어간다)');
  eq(q.showIf({ ...T2 }), true, 'showIf: 보이는 조건');
  eq(q.showIf({ ...T2, newHouseDate: '2026-08-03' }), false, 'showIf: 숨는 조건');
  // 다른 문항의 표시 조건은 그대로다 — newHouseDate 는 08-03 이전에도 묻는다
  eq(qs[i].showIf({ ...T2, newHouseDate: '2024-01-01' }), true, 'newHouseDate 문항은 종전대로');
}

// ───────────────────────── 엔진 호출 → 판정 ─────────────────────────
console.log('════ 엔진 호출 → 판정 세 갈래 (fetch 대역) ════');
(async () => {
  const engineSrc = loadDecls(code, ['ENGINE_BASE', 'isValidISODate', 'isoDate', 'cgtTemp2Visible', 'mapAnswersToTransfer', 'callEngineBody', 'callTransferEngine',
    'CGT_ENGINE_REQUIRED', 'cgtEngineVerdict', 'cgtCalcFromEngine', 'cgtCalcFromEngineError']);
  const OKCALC = { 양도차익: 400000000, 과세표준: 300000000, 세액: 90000000, 지방소득세: 9000000, 총세부담: 99000000, 장기보유특별공제: 80000000, 기본공제: 2500000, 비과세여부: false };
  const timers = [];
  function makeEnv(fetchImpl) {
    const e = vm.createContext({
      window: { JT_ENGINE_BASE: 'https://engine.test' }, Date, Number, Object, Math, JSON, Promise, Error, TypeError, AbortController,
      fetch: fetchImpl,
      setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
      clearTimeout: () => {},
    });
    vm.runInContext(validCalcSrc, e);
    vm.runInContext(engineSrc + '\nglobalThis.__e = { callTransferEngine, cgtCalcFromEngine, cgtCalcFromEngineError };', e);
    return e.__e;
  }
  /* runAnalysis 가 하는 일과 같은 두 줄 — 호출 → 판독, 던지면 분류 */
  async function judge(env, answers) {
    try { return plain(env.cgtCalcFromEngine(await env.callTransferEngine(answers))); }
    catch (e) { return plain(env.cgtCalcFromEngineError(e)); }
  }
  const resp = (status, json) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => json });
  const A = { ...T2, temp2Zone: 'yes' };

  const sent = [];
  const okEnv = makeEnv(async (url, init) => { sent.push({ url, init }); return { ok: true, status: 200, json: async () => ({ calc: { ...OKCALC, 상태: 'ok' }, version: { engine: 'e1' } }) }; });
  const r1 = await judge(okEnv, A);
  eq([r1.precise, r1.totalTax, r1.engineVer], [true, 99000000, 'e1'], '200 + 상태 ok → 금액');
  eq(sent[0].url, 'https://engine.test/v1/calc/transfer', '요청은 POST /v1/calc/transfer');
  eq(sent[0].init.method, 'POST', 'POST');
  eq(JSON.parse(sent[0].init.body).temp2_both_regulated, true, '요청 본문에 temp2_both_regulated');

  eq((await judge(makeEnv(resp(200, { calc: { ...OKCALC } })), A)).precise, true, '200 + 상태 없음(구 엔진) → 금액');
  for (const c of [{ ...OKCALC, 상태: 'unsupported', 오류: '지원하지 않는 유형', 세액: 0 }, { ...OKCALC, 상태: 'needs_input', 오류: '입력 부족' }, { ...OKCALC, 오류: '계산 실패' }, { ...OKCALC, 상태: 'error' }]) {
    const r = await judge(makeEnv(resp(200, { calc: c })), A);
    eq([r.precise, r.engineState, 'totalTax' in r], [false, 'refused', false], '200 인데 거부 응답 → refused, 금액 없음: ' + (c.상태 || '오류'));
  }
  for (const s of [400, 422]) {
    const r = await judge(makeEnv(resp(s, { detail: 'x' })), A);
    eq([r.precise, r.engineState, 'totalTax' in r], [false, 'refused', false], 'HTTP ' + s + ' → refused');
  }
  for (const s of [408, 429, 500, 503]) {
    const r = await judge(makeEnv(resp(s, {})), A);
    eq([r.precise, r.engineState, 'totalTax' in r], [false, 'down', false], 'HTTP ' + s + ' → down');
  }
  const net = await judge(makeEnv(async () => { throw new TypeError('Failed to fetch'); }), A);
  eq([net.precise, net.engineState], [false, 'down'], '네트워크 실패 → down');
  const broken = await judge(makeEnv(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } })), A);
  eq([broken.precise, broken.engineState], [false, 'down'], '깨진 본문 → down');
  const noCalc = await judge(makeEnv(resp(200, { version: {} })), A);
  eq([noCalc.precise, noCalc.engineState], [false, 'down'], 'calc 없는 200 → down');

  // 시간 초과 — 타이머 콜백을 직접 불러 25초 경과를 흉내 낸다. 끊긴 호출은 status 없는 예외 → down
  timers.length = 0;
  const hangEnv = makeEnv((url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));
  const pending = judge(hangEnv, A);
  await Promise.resolve();
  eq(timers.length, 1, '시간 제한 타이머가 걸린다');
  eq(timers[0].ms, 25000, '시간 제한 25초');
  timers[0].fn();
  const to = await pending;
  eq([to.precise, to.engineState], [false, 'down'], '시간 초과 → down');

  console.log(`\nOK cgt request: ${checks} checks`);
})().catch((e) => { console.error(e); process.exit(1); });

/* 재산세 — 화면 답 → 엔진 요청 변환·엔진 응답 판정을 «실행»으로 고정한다 (261010).

   소스(ReportProperty.jsx)에서 순수 함수 본문을 AST 범위로 꺼내 vm 에서 그대로 돌린다(tests_inheritance_request.js 와 같은 방식 —
   테스트가 흉내 낸 규칙과 앱이 쓰는 규칙이 갈라지지 않게). 선언이 사라지거나 이름이 바뀌면 조용히 통과하지 않고 여기서 죽는다.

   고정하는 것
   · mapAnswersToProperty — 주택(작년 공시가격 직접 입력 → prior_year_standard_value / 작년에 없던 주택 → no_prior_year_standard_value /
     모름·미응답·금액 미입력 → 요청을 만들지 않음), 건축물 3종(building_type, 미응답 → 요청을 만들지 않음),
     토지 4종 + 전년도 본세·도시지역분(양수일 때만), 주택에는 전년도 세액 키를 보내지 않음
   · propEngineVerdict 의 갈래(ok · refused: needs_input·unsupported·오류 필드 · down: error·깨진 응답·필수 키 누락) — «소방분» 은 필수 키가 아니다
   · propCalcFromEngine 이 엔진 값을 그대로 옮기는지(과세표준상한·세부담상한·소액징수면제 포함), 거부·연결 실패에는 금액 필드가 없는지, 거부 사유 문구가 전달되는지
   · propCalcFromEngineError(·callPropEngine 경유) 의 HTTP 422·503·네트워크 실패·시간 초과 분류
   · propFallbackGaps 의 ①층(주택 작년 공시가격 불확정·건축물 종류 미응답)과 ②층(엔진 값 없음) — 요청을 못 만드는 입력과 ①층이 같은 규칙인지
   · 문항 구조(작년 공시가격 문항은 빠른 계산 단계·주택 전용, 건축물 종류는 빠른 계산 단계·건축물 전용)
   · 자체 계산식(fallbackPropTax)이 소스에 남아 있지 않은지 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const parser = require('@babel/parser');

const SRC = path.join(__dirname, 'src', 'ReportProperty.jsx');
const code = fs.readFileSync(SRC, 'utf8');
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
  if (missing.length) throw new Error('ReportProperty.jsx 에서 최상위 선언을 찾지 못했습니다: ' + missing.join(', '));
  return chunks.join('\n');
}
const validCalcSrc = commonSrc.match(/window\.jtValidCalc = function[\s\S]*?\n  };/)[0];
const gapsSrc = commonSrc.match(/window\.jtFallbackGaps = function[\s\S]*?\n};/)[0];

const DECLS = ['PROP_QS', 'PROP_BUILDING_TYPES', 'mapAnswersToProperty', 'callPropEngine',
  'PROP_NO_STATUS_MESSAGE', 'propPriorAutoUser', 'propPriorAutoReset', 'propPriorAutoApply', 'propPriorSameUnit',
  'PROP_ENGINE_REQUIRED', 'propEngineVerdict', 'propCalcFromEngine', 'propCalcFromEngineError', 'propFallbackGaps'];
const declSrc = loadDecls(code, DECLS);
const EXPORTS = '\nglobalThis.__e = { PROP_QS, mapAnswersToProperty, propEngineVerdict, propCalcFromEngine, propCalcFromEngineError, propFallbackGaps, callPropEngine, PROP_ENGINE_REQUIRED, PROP_NO_STATUS_MESSAGE, propPriorAutoUser, propPriorAutoReset, propPriorAutoApply, propPriorSameUnit };';

function makeEnv(fetchImpl, timers) {
  const e = vm.createContext({
    window: {
      JT_ENGINE_BASE: 'https://engine.test',
      /* 동·호 표기 비교 대역 — 실제 규칙(Report/ReportProperty 의 jtUnitSame)은 NFKC·꼬리 동/호·앞자리 0 을 지운 뒤 비교한다 */
      jtUnitSame: (x, y) => { const k = (v) => String(v == null ? '' : v).trim().toUpperCase().replace(/(동|호)$/, '').replace(/^0+/, ''); return !!k(x) && k(x) === k(y); },
    }, Date, Number, Object, Math, JSON, Promise, Error, TypeError, String, Array, AbortController,
    fetch: fetchImpl,
    setTimeout: (fn, ms) => { if (ms <= 8000) { fn(); return 0; } if (timers) timers.push({ fn, ms }); return 1; },
    clearTimeout: () => {},
  });
  vm.runInContext(validCalcSrc, e);
  vm.runInContext(gapsSrc, e);
  vm.runInContext(declSrc + EXPORTS, e);
  return e.__e;
}

const F = makeEnv(null);
const body = (a) => plain(F.mapAnswersToProperty(a));
const isNull = (a) => F.mapAnswersToProperty(a) === null;

/* 기준 답 */
const HOUSE = { propertyKind: '주택', standardValue: '500000000', priorYearStandardValue: 'input', priorYearStandardValueAmount: '400000000' };
const BLDG = { propertyKind: '건축물', standardValue: '500000000', buildingType: '일반' };
const LAND = { propertyKind: '토지', standardValue: '300000000', landType: '종합합산' };

// ───────────────────────── 주택 ─────────────────────────
console.log('════ 주택 — 작년 공시가격 ════');
eq(body(HOUSE), { standard_value: 500000000, category: '주택', is_urban_area: true, prior_year_standard_value: 400000000 }, '직접 입력 → prior_year_standard_value:<원>');
eq(body({ ...HOUSE, priorYearStandardValue: 'none', priorYearStandardValueAmount: undefined }), { standard_value: 500000000, category: '주택', is_urban_area: true, no_prior_year_standard_value: true }, '작년에 없던 주택 → no_prior_year_standard_value:true (금액 키 없음)');
eq(body({ ...HOUSE, priorYearStandardValue: 'none' }).prior_year_standard_value, undefined, '없던 주택인데 낡은 금액 답이 남아 있어도 보내지 않는다');
ok(isNull({ ...HOUSE, priorYearStandardValue: 'unknown' }), '모름 → 요청을 만들지 않는다');
ok(isNull({ ...HOUSE, priorYearStandardValue: undefined }), '미응답 → 요청을 만들지 않는다');
ok(isNull({ ...HOUSE, priorYearStandardValue: '' }), '빈 답 → 요청을 만들지 않는다');
ok(isNull({ ...HOUSE, priorYearStandardValue: 'input', priorYearStandardValueAmount: undefined }), '직접 입력인데 금액이 없으면 요청을 만들지 않는다');
ok(isNull({ ...HOUSE, priorYearStandardValueAmount: '0' }), '직접 입력인데 금액 0 → 요청을 만들지 않는다');
ok(isNull({ ...HOUSE, priorYearStandardValue: 'auto' }), '모르는 값은 확정하지 않는다');
ok(isNull({ standardValue: '500000000' }), '종류도 작년 공시가격도 미응답 → 요청을 만들지 않는다(주택으로 확정하지 않는다)');
eq(body({ ...HOUSE, isOneHouse: 'yes' }).is_one_house, true, '1세대1주택 → is_one_house:true');
eq('is_one_house' in body({ ...HOUSE, isOneHouse: 'no' }), false, '다주택 → 키 없음');
eq(body({ ...HOUSE, isUrbanArea: 'no' }).is_urban_area, false, '비도시지역 → is_urban_area:false');
{
  const b = body({ ...HOUSE, priorYearTax: '500000', priorYearUrbanTax: '300000', buildingType: '일반', landType: '별도합산' });
  eq(['prior_year_tax' in b, 'prior_year_urban_tax' in b, 'building_type' in b, 'land_divided_type' in b, 'housing_taxed_before_2024' in b], [false, false, false, false, false],
    '주택: 2023년 과세 여부를 «yes» 로 답하지 않았다면 전년도 세액(낡은 답)·건축물 종류·토지 세부유형 키를 보내지 않는다');
}

console.log('════ 주택 — 2023년에도 재산세를 냈는가 (종전 세부담 상한, 부칙 제15조) ════');
{
  const yes = { ...HOUSE, housingTaxedBefore2024: 'yes', priorYearTax: '300000' };
  eq(body(yes), { standard_value: 500000000, category: '주택', is_urban_area: true, prior_year_standard_value: 400000000, housing_taxed_before_2024: true, prior_year_tax: 300000 }, 'yes → housing_taxed_before_2024:true + prior_year_tax');
  eq(body({ ...yes, priorYearUrbanTax: '200000' }).prior_year_urban_tax, 200000, 'yes + 작년 도시지역분(양수) → prior_year_urban_tax');
  eq('prior_year_urban_tax' in body({ ...yes, priorYearUrbanTax: '0' }), false, 'yes + 도시지역분 0 → 키 없음');
  eq('prior_year_urban_tax' in body({ ...yes, priorYearUrbanTax: '' }), false, 'yes + 도시지역분 빈 값 → 키 없음');
  ok(isNull({ ...yes, priorYearTax: undefined }), 'yes 인데 작년 본세가 없으면 요청을 만들지 않는다(필수)');
  ok(isNull({ ...yes, priorYearTax: '0' }), 'yes 인데 작년 본세 0 → 요청을 만들지 않는다');
  ok(isNull({ ...yes, priorYearTax: '' }), 'yes 인데 작년 본세 빈 값 → 요청을 만들지 않는다');
  const no = body({ ...HOUSE, housingTaxedBefore2024: 'no', priorYearTax: '300000', priorYearUrbanTax: '200000' });
  eq([no.housing_taxed_before_2024, 'prior_year_tax' in no, 'prior_year_urban_tax' in no], [false, false, false], 'no → housing_taxed_before_2024:false, 낡은 전년도 세액은 보내지 않는다');
  for (const v of ['unknown', undefined, '']) {
    const u = body({ ...HOUSE, housingTaxedBefore2024: v, priorYearTax: '300000' });
    eq(['housing_taxed_before_2024' in u, 'prior_year_tax' in u], [false, false], '모름·미응답(' + JSON.stringify(v) + ') → 키를 보내지 않는다(엔진이 상한 없이 계산하고 고지)');
    ok(!isNull({ ...HOUSE, housingTaxedBefore2024: v }), '모름·미응답은 요청을 막지 않는다');
  }
  eq('owner_is_corporation' in body(yes), false, 'owner_is_corporation 은 화면에서 보내지 않는다');
  const nb = body({ ...BLDG, housingTaxedBefore2024: 'yes', priorYearTax: '500000' });
  eq('housing_taxed_before_2024' in nb, false, '건축물에는 주택 전용 키를 보내지 않는다');
  eq(nb.prior_year_tax, 500000, '건축물은 종전대로 전년도 본세를 보낸다');
}

// ───────────────────────── 건축물 ─────────────────────────
console.log('════ 건축물 — building_type ════');
for (const t of ['일반', '공장_주거지역', '골프장_고급오락장']) {
  eq(body({ ...BLDG, buildingType: t }), { standard_value: 500000000, category: '건축물', is_urban_area: true, building_type: t }, '건축물 ' + t + ' → building_type 그대로');
}
ok(isNull({ ...BLDG, buildingType: undefined }), '건축물 종류 미응답 → 요청을 만들지 않는다');
ok(isNull({ ...BLDG, buildingType: '' }), '건축물 종류 빈 답 → 요청을 만들지 않는다');
ok(isNull({ ...BLDG, buildingType: '상가' }), '목록 밖의 값 → 요청을 만들지 않는다');
{
  const b = body({ ...BLDG, priorYearTax: '500000', priorYearUrbanTax: '300000', priorYearStandardValue: 'input', priorYearStandardValueAmount: '1' });
  eq([b.prior_year_tax, b.prior_year_urban_tax, 'prior_year_standard_value' in b, 'no_prior_year_standard_value' in b], [500000, 300000, false, false], '건축물: 전년도 본세·도시지역분은 보내고, 주택용 작년 공시가격 키는 보내지 않는다');
}

// ───────────────────────── 토지 ─────────────────────────
console.log('════ 토지 4종 + 전년도 본세·도시지역분 ════');
eq(body(LAND), { standard_value: 300000000, category: '토지_종합합산', is_urban_area: true }, '종합합산');
eq(body({ ...LAND, landType: '별도합산' }).category, '토지_별도합산', '별도합산');
eq(body({ ...LAND, landType: '분리전답' }), { standard_value: 300000000, category: '토지_분리과세', is_urban_area: true, land_divided_type: '전답과수원' }, '분리전답 → 전답과수원');
eq(body({ ...LAND, landType: '분리기타' }).land_divided_type, '기타분리', '분리기타 → 기타분리');
eq('building_type' in body(LAND), false, '토지에는 건축물 종류 키가 없다');
eq(body({ ...LAND, priorYearTax: '500000', priorYearUrbanTax: '300000' }), { standard_value: 300000000, category: '토지_종합합산', is_urban_area: true, prior_year_tax: 500000, prior_year_urban_tax: 300000 }, '전년도 본세·도시지역분');
{
  const b = body({ ...LAND, priorYearTax: '0', priorYearUrbanTax: '' });
  eq(['prior_year_tax' in b, 'prior_year_urban_tax' in b], [false, false], '0·빈 값이면 보내지 않는다');
  const c = body({ ...LAND, priorYearUrbanTax: '300000' });
  eq([('prior_year_tax' in c), c.prior_year_urban_tax], [false, 300000], '도시지역분만 넣어도 된다');
}
eq(body({ ...LAND, landType: undefined }).category, '토지_종합합산', '토지 종류 미응답은 종전대로 종합합산(이 화면의 기존 규칙 — 이번 변경 범위 밖)');

// ───────────────────────── 엔진 응답 판정 ─────────────────────────
console.log('════ propEngineVerdict — ok · refused · down ════');
const OKCALC = { 세목: '재산세', 상태: 'ok', 세액: 906000, 재산세본세: 457500, 지방교육세: 91500, 도시지역분: 357000, 소방분: null, 과세표준: 255000000,
  과세표준상한: { 적용: true, 상한전과세표준: 300000000, 상한액: 255000000 }, 적용세율: '0.25%', 공정시장가액비율: '60.0%', 세부담상한적용: false,
  세부담상한: { 본세적용: false, 도시지역분적용: false, 상한율: null, 상한전본세: 457500, 상한전도시지역분: 357000 },
  소액징수면제: false, 납부시기: { '7월': 453000, '9월': 453000 }, 단계별계산: [{ 항목: '과세표준', 금액: 255000000 }], 경고사항: ['소방분 미계산'] };
const V = (c) => F.propEngineVerdict(c);
eq(plain(F.PROP_ENGINE_REQUIRED), ['세액', '재산세본세', '지방교육세', '도시지역분', '과세표준'], '필수 키는 다섯 — 소방분은 없다');
eq(V(OKCALC), 'ok', '상태 ok + 소방분 null → ok');
{ const c = { ...OKCALC }; delete c.상태; eq(V(c), 'refused', '상태 키가 없는 응답은 금액으로 받지 않는다 — 연결 장애가 아니라 형식 오류이므로 refused'); }
{ const c = { ...OKCALC, 오류: '계산 실패' }; delete c.상태; eq(V(c), 'refused', '상태 키가 없으면 오류 필드가 있어도 refused'); }
eq(V({}), 'refused', '상태 키 없는 빈 객체 → refused (calc 자체가 없는 것(null·undefined)과 다르다)');
{ const c = { ...OKCALC }; delete c.소방분; eq(V(c), 'ok', '소방분 키가 없어도 ok'); }
eq(V({ ...OKCALC, 세액: 0, 재산세본세: 0, 지방교육세: 0, 도시지역분: 0, 소액징수면제: true }), 'ok', '소액 징수 면제의 0원 → ok');
eq(V({ 세액: 0, 오류: '주택 과세표준상한액(지방세법 §110③) — 확정할 수 없다', 상태: 'needs_input' }), 'refused', '상태 needs_input → refused');
eq(V({ ...OKCALC, 상태: 'unsupported', 오류: '지원하지 않는 조합' }), 'refused', '상태 unsupported → refused');
eq(V({ ...OKCALC, 상태: 'error', 오류: '내부 오류' }), 'down', '상태 error → down');
eq(V({ ...OKCALC, 오류: '계산 실패' }), 'refused', '오류 필드 → refused');
eq(V({ ...OKCALC, 상태: 'ok', 오류: '계산 실패' }), 'refused', '상태가 ok 여도 오류가 있으면 refused');
for (const st of ['', null, 'OK', true]) eq(V({ ...OKCALC, 상태: st }), 'refused', '상태 ' + String(st) + ' → refused(금액이 아니다)');
eq(V({ ...OKCALC, error: 'x' }), 'refused', '영문 error → refused');
eq(V({ ...OKCALC, detail: 'x' }), 'refused', 'detail → refused');
eq(V({ ...OKCALC, success: false }), 'refused', 'success:false → refused');
for (const k of ['세액', '재산세본세', '지방교육세', '도시지역분', '과세표준']) {
  const c = { ...OKCALC }; delete c[k];
  eq(V(c), 'down', '필수 키 누락(' + k + ') → down');
  eq(V({ ...OKCALC, [k]: NaN }), 'down', '필수 키 NaN(' + k + ') → down');
  eq(V({ ...OKCALC, [k]: '0' }), 'down', '필수 키 문자열(' + k + ') → down');
  eq(V({ ...OKCALC, [k]: -1 }), 'down', '필수 키 음수(' + k + ') → down');
  eq(V({ ...OKCALC, [k]: null }), 'down', '필수 키 null(' + k + ') → down');
}
for (const c of [null, undefined, [], 'x', 3]) eq(V(c), 'down', '깨진 calc ' + JSON.stringify(c) + ' → down');

// ───────────────────────── propCalcFromEngine ─────────────────────────
console.log('════ propCalcFromEngine — 엔진 값을 그대로 옮긴다 ════');
{
  const calc = plain(F.propCalcFromEngine({ calc: OKCALC, version: { engine: 'e1' } }));
  eq([calc.precise, calc.engineVer, calc.totalTax, calc.mainTax, calc.eduTax, calc.urbanTax, calc.taxBase, calc.appliedRate, calc.fairRatio],
    [true, 'e1', 906000, 457500, 91500, 357000, 255000000, '0.25%', '60.0%'], '금액·세율·비율을 그대로');
  eq([calc.burdenApplied, calc.smallExempt, calc.firstHalf, calc.secondHalf], [false, false, 453000, 453000], '세부담상한적용·소액징수면제·납부시기');
  eq(calc.baseCap, { 적용: true, 상한전과세표준: 300000000, 상한액: 255000000 }, '과세표준상한 객체를 그대로');
  eq(calc.burden, OKCALC.세부담상한, '세부담상한 객체를 그대로');
  eq([calc.steps, calc.engineWarnings], [[{ 항목: '과세표준', 금액: 255000000 }], ['소방분 미계산']], '단계·경고');
  eq('fireTax' in calc, false, '소방분은 옮기지 않는다');
  const cap = plain(F.propCalcFromEngine({ calc: { ...OKCALC, 세부담상한적용: true, 세부담상한: { 본세적용: true, 도시지역분적용: false, 상한율: '150.0%', 상한전본세: 875000, 상한전도시지역분: 490000 } } }));
  eq([cap.burdenApplied, cap.burden.본세적용, cap.burden.도시지역분적용, cap.burden.상한전본세], [true, true, false, 875000], '세부담 상한 적용 시 본세/도시지역분 구분을 옮긴다');
  eq(plain(F.propCalcFromEngine({ calc: { ...OKCALC, 소액징수면제: true, 세액: 0, 재산세본세: 0, 지방교육세: 0, 도시지역분: 0, 납부시기: { '7월': 0, '9월': 0 } } })).smallExempt, true, '소액 징수 면제를 옮긴다');
  const noStatus = plain(F.propCalcFromEngine({ calc: { 세액: 1, 재산세본세: 1, 지방교육세: 1, 도시지역분: 1, 과세표준: 1 } }));
  eq([noStatus.precise, noStatus.engineState, 'totalTax' in noStatus], [false, 'refused', false], '상태 키가 없는 응답 → refused, 금액 필드 없음');
  eq(noStatus.engineMessage, '엔진 응답 형식이 맞지 않습니다(상태 없음) — 잠시 후 다시 시도하거나 상담을 이용하세요', '상태 없음의 안내 문구(연결 실패로 안내하지 않는다)');
  { const c = { ...OKCALC, 오류: '엔진 문구' }; delete c.상태; eq(plain(F.propCalcFromEngine({ calc: c })).engineMessage, '엔진 응답 형식이 맞지 않습니다(상태 없음) — 잠시 후 다시 시도하거나 상담을 이용하세요', '상태 키가 없으면 오류 문구가 있어도 형식 오류 문구를 쓴다'); }
  const min = plain(F.propCalcFromEngine({ calc: { 상태: 'ok', 세액: 0, 재산세본세: 0, 지방교육세: 0, 도시지역분: 0, 과세표준: 0 } }));
  eq([min.precise, min.totalTax, min.baseCap, min.burden, min.steps, min.engineWarnings, min.firstHalf, min.secondHalf, min.smallExempt, min.burdenApplied], [true, 0, {}, {}, [], [], 0, 0, false, false], '선택 키가 없으면 빈 값');
  for (const c of [{ ...OKCALC, 상태: 'needs_input', 오류: '입력 부족' }, { ...OKCALC, 상태: 'unsupported', 오류: '지원 안 함' }, { ...OKCALC, 오류: 'x' }]) {
    const r = plain(F.propCalcFromEngine({ calc: c }));
    eq([r.precise, r.engineState, 'totalTax' in r, 'taxBase' in r, 'baseCap' in r], [false, 'refused', false, false, false], '거부 응답에는 금액 필드가 없다');
  }
  eq(plain(F.propCalcFromEngine({ calc: { ...OKCALC, 상태: 'needs_input', 오류: '  prior_year_standard_value 가 필요합니다  ' } })).engineMessage, 'prior_year_standard_value 가 필요합니다', '거부 사유는 엔진의 오류 문구를 그대로(앞뒤 공백만 제거) 전달한다');
  eq(plain(F.propCalcFromEngine({ calc: { ...OKCALC, 상태: 'unsupported' } })).engineMessage, '', '오류 문구가 없으면 빈 문자열');
  for (const ej of [null, undefined, {}, { calc: null }, { calc: [] }, { calc: 'x' }, { calc: { ...OKCALC, 세액: NaN } }, { calc: { ...OKCALC, 상태: 'error', 오류: '내부' } }]) {
    const r = plain(F.propCalcFromEngine(ej));
    eq([r.precise, r.engineState, 'totalTax' in r, 'engineMessage' in r], [false, 'down', false, false], '깨진 응답·내부 오류 → down, 금액 필드 없음: ' + JSON.stringify(ej));
  }
}

// ───────────────────────── 차단 판정 ─────────────────────────
console.log('════ propFallbackGaps — ①입력 불확정 · ②엔진 값 없음 ════');
{
  const G = (a, c) => F.propFallbackGaps(a, c);
  const DOWN = { precise: false }, OK = { precise: true };
  const REFUSED = (m) => ({ precise: false, engineState: 'refused', engineMessage: m });
  eq(G(HOUSE, OK).length, 0, '주택 + 작년 공시가격 입력 + 엔진 값 있음 → 통과');
  eq(G(HOUSE, F.propCalcFromEngine({ calc: OKCALC })).length, 0, '엔진 응답에서 만든 calc 로도 통과');
  eq(G({ ...HOUSE, priorYearStandardValue: 'none' }, OK).length, 0, '작년에 없던 주택 → 통과');
  const unk = G({ ...HOUSE, priorYearStandardValue: 'unknown' }, OK);
  eq(unk.length, 1, '작년 공시가격 모름 → precise 여도 차단(엔진을 부르기 전)');
  ok(unk[0].includes('작년 공시가격을 모르면 과세표준상한(§110③)을 판정할 수 없어 세액을 확정할 수 없습니다') && unk[0].includes('부동산공시가격알리미에서 조회해 넣어 주세요'), '… 안내 문구');
  eq(G({ ...HOUSE, priorYearStandardValue: undefined }, OK).length, 1, '작년 공시가격 미응답 → 차단');
  eq(G({ ...HOUSE, priorYearStandardValueAmount: undefined }, OK).length, 1, '직접 입력인데 금액 없음 → 차단');
  eq(G({ ...HOUSE, priorYearStandardValueAmount: '0' }, OK).length, 1, '직접 입력인데 금액 0 → 차단');
  eq(G({ standardValue: '1' }, OK).length, 1, '종류 미응답(주택으로 간주) + 작년 공시가격 없음 → 차단');
  eq(G({ ...HOUSE, housingTaxedBefore2024: 'unknown' }, OK).length, 0, '2023년 과세 «모름» → 차단하지 않는다(고지)');
  eq(G({ ...HOUSE, housingTaxedBefore2024: 'no' }, OK).length, 0, '2023년 과세 «아니오» → 통과');
  eq(G({ ...HOUSE }, OK).length, 0, '2023년 과세 여부 미응답 → ①층에서 막지 않는다(문항이 필수라 화면에서 먼저 막힌다)');
  eq(G({ ...HOUSE, housingTaxedBefore2024: 'yes' }, OK).length, 1, 'yes 인데 작년 본세 없음 → 차단(요청을 만들 수 없는 입력)');
  ok(G({ ...HOUSE, housingTaxedBefore2024: 'yes' }, OK)[0].includes('작년 재산세 본세'), '… 안내 문구');
  eq(G({ ...HOUSE, housingTaxedBefore2024: 'yes', priorYearTax: '300000' }, OK).length, 0, 'yes + 작년 본세 → 통과');
  eq(G(BLDG, OK).length, 0, '건축물 + 종류 → 통과(주택용 작년 공시가격을 요구하지 않는다)');
  eq(G({ ...BLDG, buildingType: undefined }, OK).length, 1, '건축물 종류 미응답 → 차단');
  eq(G({ ...BLDG, buildingType: '아무거나' }, OK).length, 1, '건축물 종류가 목록 밖 → 차단');
  eq(G(LAND, OK).length, 0, '토지 → 통과');
  eq(G({ ...LAND, priorYearStandardValue: 'unknown', buildingType: undefined }, OK).length, 0, '토지에는 낡은 주택·건축물 답이 영향을 주지 않는다');
  eq(G({ ...BLDG, priorYearStandardValue: 'unknown' }, OK).length, 0, '건축물에는 낡은 «작년 공시가격 모름» 답이 영향을 주지 않는다');
  /* ② 엔진 값이 없으면 입력과 무관하게 항상 사유 한 건 */
  for (const ans of [HOUSE, BLDG, LAND, { ...HOUSE, priorYearStandardValue: 'none' }]) {
    eq(G(ans, DOWN).length, 1, '엔진 연결 실패(DOWN) → 어떤 입력이든 사유 1건');
    eq(G(ans, REFUSED('')).length, 1, '엔진 거부(REFUSED) → 어떤 입력이든 사유 1건');
  }
  ok(G(HOUSE, DOWN)[0].startsWith('계산 엔진에 연결하지 못했습니다'), 'DOWN 사유는 연결 실패 문구');
  ok(G(HOUSE, { precise: false, engineState: 'down' })[0].startsWith('계산 엔진에 연결하지 못했습니다'), 'down 도 연결 실패 문구');
  ok(G(HOUSE, REFUSED('prior_year_standard_value 가 필요합니다'))[0] === '입력이 더 필요합니다 — prior_year_standard_value 가 필요합니다', 'REFUSED 사유는 «입력이 더 필요합니다» + 엔진의 오류 문구');
  ok(G(HOUSE, REFUSED(''))[0].startsWith('입력이 더 필요합니다 — '), '오류 문구가 없어도 «입력이 더 필요합니다» 안내');
  { const ns = G(HOUSE, F.propCalcFromEngine({ calc: { 세액: 1, 재산세본세: 1, 지방교육세: 1, 도시지역분: 1, 과세표준: 1 } }));
    ok(ns.length === 1 && ns[0].includes('엔진 응답 형식이 맞지 않습니다(상태 없음)') && !ns[0].includes('연결하지 못했습니다'), '상태 없는 200 응답의 차단 사유는 형식 오류이지 «연결하지 못했습니다» 가 아니다'); }
  eq(G({ ...HOUSE, priorYearStandardValue: 'unknown' }, DOWN).length, 2, '불확정 + 엔진 실패 → ①사유와 ②사유 둘');
  /* 엔진 전 게이트(precise:true)는 ①층만 본다 */
  eq(G({ ...HOUSE, priorYearStandardValue: 'unknown' }, { precise: true }).length, 1, 'precise=true 판정 — 모름은 ①층');
  eq(G(HOUSE, { precise: true }).length, 0, 'precise=true 판정 — 평범한 입력은 통과(②층은 빠진다)');
}

// ───────────────────────── 요청을 못 만드는 입력 = ①층 (규칙이 한 벌인가) ─────────────────────────
console.log('════ mapAnswersToProperty 가 null 인 입력 ⇔ 엔진 전 게이트(①층)가 막는 입력 ════');
{
  let n = 0;
  for (const kind of [undefined, '주택', '건축물', '토지'])
    for (const py of [undefined, '', 'input', 'none', 'unknown', 'auto'])
      for (const amt of [undefined, '', '0', '400000000'])
        for (const bt of [undefined, '', '일반', '공장_주거지역', '골프장_고급오락장', '상가'])
          for (const lt of [undefined, '종합합산', '분리전답'])
            for (const ht of [undefined, 'yes', 'no', 'unknown'])
              for (const pt of [undefined, '0', '300000']) {
            const a = { propertyKind: kind, standardValue: '500000000', priorYearStandardValue: py, priorYearStandardValueAmount: amt, buildingType: bt, landType: lt, housingTaxedBefore2024: ht, priorYearTax: pt };
            const gateBlocks = F.propFallbackGaps(a, { precise: true }).length > 0;
            const reqNull = F.mapAnswersToProperty(a) === null;
            if (gateBlocks !== reqNull) assert.fail('규칙 불일치: ' + JSON.stringify(a) + ' gate=' + gateBlocks + ' null=' + reqNull);
            n++;
          }
  checks += n;
  ok(n > 500, '조합 ' + n + '건에서 두 규칙이 일치한다');
}

// ───────────────────────── 문항 구조 ─────────────────────────
console.log('════ 문항 구조 ════');
{
  const Q = (id) => F.PROP_QS.find((q) => q.id === id);
  const ids = F.PROP_QS.map((q) => q.id);
  const py = Q('priorYearStandardValue'), bt = Q('buildingType');
  ok(py && bt, '작년 공시가격·건축물 종류 문항이 있다');
  eq(py.tier, 'quick', '작년 공시가격 문항은 빠른 계산 단계다');
  eq(bt.tier, 'quick', '건축물 종류 문항은 빠른 계산 단계다');
  eq([py.showIf({ propertyKind: '주택' }), py.showIf({ propertyKind: '건축물' }), py.showIf({ propertyKind: '토지' })], [true, false, false], '작년 공시가격은 주택 전용');
  eq([bt.showIf({ propertyKind: '건축물' }), bt.showIf({ propertyKind: '주택' }), bt.showIf({ propertyKind: '토지' })], [true, false, false], '건축물 종류는 건축물 전용');
  eq(plain(py.opts.map((o) => o[0])), ['input', 'none', 'unknown'], '작년 공시가격 선택지 3개');
  eq(plain(bt.opts.map((o) => o[0])), ['일반', '공장_주거지역', '골프장_고급오락장'], '건축물 종류 선택지 3개');
  eq(bt.opts[2][1], '회원제 골프장·고급오락장용 건축물', '골프장 선택지 라벨은 «회원제»를 밝힌다');
  eq([py.amountId, py.amountWhen], ['priorYearStandardValueAmount', 'input'], '「직접 입력」을 고르면 금액 칸(priorYearStandardValueAmount)이 붙는다');
  eq(ids.indexOf('priorYearStandardValue') > ids.indexOf('standardValue') && ids.indexOf('buildingType') > ids.indexOf('standardValue'), true, '둘 다 공시가격 문항 뒤에 있다');
  ok(py.q.includes('작년') && py.sub.includes('§110③') && py.sub.includes('realtyprice.kr'), '작년 공시가격 문항의 문구');
  ok(Q('propertyKind').opts.find((o) => o[0] === '건축물')[2] === '0.25% (공장·골프장은 다름)', '건축물 선택지 부제');
  const ptax = Q('priorYearTax'), purb = Q('priorYearUrbanTax');
  ok(ptax.q.includes('본세') && ptax.q.includes('도시지역분·지방교육세 제외') && ptax.sub.includes('150%') && ptax.sub.includes('§122') && ptax.sub.includes('본세와 도시지역분에 각각 적용됩니다'), '전년도 본세 문항 문구');
  ok(purb && purb.optional && purb.numeric && purb.money && purb.tier !== 'quick', '작년 도시지역분 문항은 상세·선택·금액');
  eq([purb.showIf({ propertyKind: '건축물' }), purb.showIf({ propertyKind: '토지' }), purb.showIf({ propertyKind: '주택' }), purb.showIf({ propertyKind: '주택', housingTaxedBefore2024: 'no' }), purb.showIf({ propertyKind: '주택', housingTaxedBefore2024: 'yes' })],
    [true, true, false, false, true], '작년 도시지역분은 비주택, 또는 주택 + 2023년에도 냈다(yes)일 때만');
  eq([ptax.showIf({ propertyKind: '건축물' }), ptax.showIf({ propertyKind: '주택' }), ptax.showIf({ propertyKind: '주택', housingTaxedBefore2024: 'unknown' }), ptax.showIf({ propertyKind: '주택', housingTaxedBefore2024: 'yes' })],
    [true, false, false, true], '전년도 본세도 같은 조건');
  {
    const h = Q('housingTaxedBefore2024');
    ok(h && h.tier === 'quick', '2023년 과세 문항은 빠른 계산 단계다');
    eq([h.showIf({ propertyKind: '주택' }), h.showIf({ propertyKind: '건축물' }), h.showIf({ propertyKind: '토지' })], [true, false, false], '주택 전용');
    eq(plain(h.opts.map((o) => o[0])), ['yes', 'no', 'unknown'], '선택지 yes/no/unknown');
    ok(!h.optional, '필수 문항(선택지를 골라야 다음으로 간다)');
    ok(h.q.includes('2023년') && h.sub.includes('부칙 제15조') && h.sub.includes('2028년'), '문구');
    eq(h.q, '이 주택은 2023년(또는 그 전)에도 재산세가 부과되던 주택인가요?', '질문은 소유자가 아니라 «그 주택»의 과세 이력을 묻는다');
    ok(h.sub.includes("2024년 이후에 매수했더라도 그 전부터 있던 주택이면 '네'입니다. 2024년 이후 신축·최초 공시된 주택만 '아니오'입니다."), '보조 설명: 매수 시점이 아니라 주택의 과세 이력');
    eq(plain(h.opts.map((o) => o[1])), ['네, 그 전부터 있던 주택', '아니오, 2024년 이후 신축·최초 과세', '모름'], '선택지 라벨');
    eq(ids.indexOf('housingTaxedBefore2024'), ids.indexOf('priorYearStandardValue') + 1, '작년 공시가격 문항 바로 뒤');
    eq([ptax.quickIf({ propertyKind: '주택' }), ptax.quickIf({ propertyKind: '건축물' }), !!ptax.requiredIf({ propertyKind: '주택' }), !!(ptax.requiredIf && ptax.requiredIf({ propertyKind: '토지' }))],
      [true, false, true, false], '전년도 본세: 주택이면 빠른 계산 단계에 올라오고 필수, 토지·건축물은 상세 단계의 선택');
    eq([!!(purb.quickIf && purb.quickIf({ propertyKind: '주택' })), !!(purb.requiredIf)], [true, false], '전년도 도시지역분: 주택이면 빠른 계산 단계, 필수는 아님');
  }
  eq(ids.indexOf('priorYearUrbanTax'), ids.indexOf('priorYearTax') + 1, '작년 도시지역분은 전년도 본세 바로 뒤');
  eq(ids.includes('fireTax'), false, '소방분 문항은 없다');
}

// ───────────────────────── 호출 → 판정 (fetch 대역) ─────────────────────────
console.log('════ 엔진 호출 → 판정 (fetch 대역) ════');
(async () => {
  async function judge(env, answers) {
    try { return plain(env.propCalcFromEngine(await env.callPropEngine(env.mapAnswersToProperty(answers)))); }
    catch (e) { return plain(env.propCalcFromEngineError(e)); }
  }
  const resp = (status, json) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => json });

  const sent = [];
  const okEnv = makeEnv(async (url, init) => { sent.push({ url, init }); return { ok: true, status: 200, json: async () => ({ calc: OKCALC, version: { engine: 'e1' } }) }; });
  const r1 = await judge(okEnv, HOUSE);
  eq([r1.precise, r1.totalTax, r1.engineVer], [true, 906000, 'e1'], '200 + 상태 ok → 금액');
  eq(sent[0].url, 'https://engine.test/v1/calc/property', '요청은 POST /v1/calc/property');
  eq(sent[0].init.method, 'POST', 'POST');
  eq(JSON.parse(sent[0].init.body), { standard_value: 500000000, category: '주택', is_urban_area: true, prior_year_standard_value: 400000000 }, '요청 본문');

  for (const c of [{ 세액: 0, 상태: 'needs_input', 오류: '입력 부족' }, { ...OKCALC, 상태: 'unsupported', 오류: '지원하지 않는 유형' }, { ...OKCALC, 오류: '계산 실패' }]) {
    const r = await judge(makeEnv(resp(200, { calc: c })), HOUSE);
    eq([r.precise, r.engineState, 'totalTax' in r, r.engineMessage], [false, 'refused', false, c.오류], '200 인데 거부 응답 → refused, 금액 없음, 오류 문구 전달: ' + (c.상태 || '오류'));
  }
  {
    const r = await judge(makeEnv(resp(200, { calc: { ...OKCALC, 상태: 'error', 오류: '내부' } })), HOUSE);
    eq([r.precise, r.engineState, 'totalTax' in r], [false, 'down', false], '200 + 상태 error → down, 금액 없음');
  }
  for (const s of [400, 422]) {
    const r = await judge(makeEnv(resp(s, { detail: 'x' })), HOUSE);
    eq([r.precise, r.engineState, 'totalTax' in r], [false, 'refused', false], 'HTTP ' + s + ' → refused');
  }
  for (const s of [408, 429, 500, 503]) {
    const r = await judge(makeEnv(resp(s, {})), HOUSE);
    eq([r.precise, r.engineState, 'totalTax' in r], [false, 'down', false], 'HTTP ' + s + ' → down');
  }
  const net = await judge(makeEnv(async () => { throw new TypeError('Failed to fetch'); }), HOUSE);
  eq([net.precise, net.engineState], [false, 'down'], '네트워크 실패 → down');
  const broken = await judge(makeEnv(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } })), HOUSE);
  eq([broken.precise, broken.engineState], [false, 'down'], '깨진 본문 → down');
  const noCalc = await judge(makeEnv(resp(200, { version: {} })), HOUSE);
  eq([noCalc.precise, noCalc.engineState], [false, 'down'], 'calc 없는 200 → down');

  const timers = [];
  const hangEnv = makeEnv((url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }), timers);
  const pending = judge(hangEnv, HOUSE);
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setImmediate(r));
    eq(timers[timers.length - 1].ms, 25000, '시도마다 시간 제한 25초 타이머가 걸린다');
    timers[timers.length - 1].fn();
  }
  const to = await pending;
  eq([to.precise, to.engineState], [false, 'down'], '시간 초과 → down');

  // ───────────────────────── 소스에 폴백이 없다 ─────────────────────────
  console.log('════ 소스에 자체 계산식(폴백)이 없다 ════');
  ok(!code.includes('fallbackPropTax'), '소스에 fallbackPropTax 가 남아 있지 않다');
  ok(!/간이 추정|간이 계산|정밀 엔진 연결이 지연되어/.test(code), '「간이 추정」 배너·문구가 소스에 없다');
  ok(!/fireTax/.test(code), '소방분(fireTax) 참조가 소스에 없다');
  ok(!/0\.0025|0\.0014|\* 0\.2\b|\* ratio|tb \* /.test(code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'[^'\n]*'|`[^`\n]*`/g, "''")), '화면이 세율·비율을 곱하는 식이 없다(주석·문자열 제외)');
  const mapSrc = code.slice(code.indexOf('function mapAnswersToProperty('), code.indexOf('function propFallbackGaps('));
  ok(/prior_year_standard_value/.test(mapSrc) && /no_prior_year_standard_value/.test(mapSrc) && /building_type/.test(mapSrc) && /prior_year_urban_tax/.test(mapSrc), '새 키가 모두 요청 변환에 있다');
  ok(/calc\.burden\['근거'\]/.test(code) && /세부담 상한 근거/.test(code), '세부담 상한 박스·상담 요약이 응답의 세부담상한.근거 문구를 보인다');
  {
    const g = plain(F.propCalcFromEngine({ calc: { ...OKCALC, 세부담상한적용: true, 세부담상한: { 본세적용: true, 도시지역분적용: true, 상한율: '110.0%', 근거: '법률 제19230호 부칙 제15조(종전 §122 단서 110%)', 상한전본세: 457500, 상한전도시지역분: 357000 } } }));
    eq(g.burden.근거, '법률 제19230호 부칙 제15조(종전 §122 단서 110%)', 'propCalcFromEngine 이 세부담상한.근거 를 그대로 옮긴다');
  }
  /* 작년 공시가격 자동 채움(주소 조회) — 소스 구조로 고정한다(조회 자체는 네트워크라 vm 에서 돌리지 않는다) */
  {
    const lk = code.slice(code.indexOf('const doAddrLookup'), code.indexOf('const runAnalysis'));
    ok(lk.length > 500, 'doAddrLookup 본문을 찾았다');
    ok(/r2\.year && String\(r2\.year\) === String\(priorYear\)/.test(lk), '응답에 year 가 있고 작년과 같을 때만 채운다(year 없으면 채우지 않는다)');
    ok(!/!r2\.year \|\|/.test(lk), '「year 가 없으면 통과」 분기가 없다');
    ok(/const sameUnit = propPriorSameUnit\(r, r2\);/.test(lk), '같은 세대 판정은 propPriorSameUnit 한 곳이다');
    ok(/propPriorAutoReset\(/.test(lk) && /propPriorAutoApply\(/.test(lk), '조회 시작에 reset, 응답 도착에 apply 를 쓴다');
    ok(lk.indexOf('propPriorAutoReset(') < lk.indexOf('await window.jtLookupHousePrice'), 'reset 이 조회 await 보다 앞선다(새 주소 조회가 시작되면 지운다)');
    ok(/answersRef\.current/.test(lk), '최신 답은 ref 로 본다');
    ok(/recheckPrior/.test(lk) && /작년 공시가격을 다시 확인하세요/.test(lk), '올해 공시가격이 바뀌었는데 작년 값이 사용자 것이면 다시 확인 안내');
    const handlers = code.slice(code.indexOf('{cur.amountId && answers[cur.id] === cur.amountWhen'), code.indexOf("{cur.id === 'standardValue' && answers.propertyKind"));
    ok(/propPriorAutoUser\(priorAutoRef\.current, 'amount'\)/.test(handlers), '사용자가 금액 칸을 고치면 해당 표식을 끈다');
    ok(/if \(cur\.amountId\) priorAutoRef\.current = propPriorAutoUser\(priorAutoRef\.current, 'option'\);/.test(code), '사용자가 선택지를 고르면 선택지 표식을 끈다');
    ok(/answersRef\.current = answers;/.test(code), '렌더마다 최신 답을 ref 에 둔다');
  }
  /* ── 작년 공시가격 자동 채움 상태 전이 (순수 함수를 소스에서 꺼내 vm 에서 그대로 실행) ── */
  {
    const AU = (a, b, c) => plain(F.propPriorAutoApply(a, b, c));
    const RS = (a, b) => plain(F.propPriorAutoReset(a, b));
    const U = (a, w) => plain(F.propPriorAutoUser(a, w));
    const NONE = { opt: false, amt: false };
    // 재현: A 주소 자동 5억 → 「작년 공시가격 없음」 선택 → B 주소 조회 시작 → 「직접 입력」 재선택 시 5억이 되살아나면 안 된다
    let st = AU({ standardValue: '800000000' }, NONE, 500000000);
    eq([st.filled, st.answers.priorYearStandardValue, st.answers.priorYearStandardValueAmount, st.auto], [true, 'input', '500000000', { opt: true, amt: true }], 'A 주소: 자동 채움 → input + 5억, 표식 둘 다 켜짐');
    let auto = U(st.auto, 'option');
    let ans = { ...st.answers, priorYearStandardValue: 'none' };
    eq(auto, { opt: false, amt: true }, '사용자가 선택지를 «없음» 으로 바꾸면 선택지 표식만 꺼지고 금액 표식은 남는다');
    const rs = RS(ans, auto);
    eq([rs.answers.priorYearStandardValue, 'priorYearStandardValueAmount' in rs.answers, rs.auto], ['none', false, NONE], 'B 주소 조회 시작: 자동 금액은 지우고 사용자가 고른 «없음» 은 보존');
    eq({ ...rs.answers, priorYearStandardValue: 'input' }.priorYearStandardValueAmount, undefined, '«직접 입력» 을 다시 골라도 5억이 되살아나지 않는다');
    // 자동 값만 있던 상태에서 새 조회 시작 → 선택지·금액 모두 지운다
    const rs2 = RS(st.answers, st.auto);
    eq([rs2.answers.priorYearStandardValue, rs2.answers.priorYearStandardValueAmount, rs2.answers.standardValue], [undefined, undefined, '800000000'], '자동 채움이 둔 선택지·금액은 지우고 올해 공시가격은 건드리지 않는다');
    // 사용자가 금액을 직접 고치면 표식이 모두 꺼져 새 조회에도 보존된다
    const uAuto = U(st.auto, 'amount');
    const typed = { ...st.answers, priorYearStandardValueAmount: '450000000' };
    eq(uAuto, NONE, '금액을 직접 고치면 표식이 모두 꺼진다');
    eq(RS(typed, uAuto).answers, typed, '직접 넣은 작년 금액은 새 주소 조회에도 보존된다');
    // 응답 도착: 사용자 값이 있으면 덮어쓰지 않는다
    const own = AU(typed, uAuto, 500000000);
    eq([own.filled, own.userOwns, own.answers.priorYearStandardValueAmount], [false, true, '450000000'], '조회 대기 중 사용자가 넣은 값은 응답이 도착해도 덮어쓰지 않는다');
    const ownOpt = AU({ priorYearStandardValue: 'unknown' }, NONE, 500000000);
    eq([ownOpt.filled, ownOpt.userOwns, ownOpt.answers.priorYearStandardValue], [false, true, 'unknown'], '사용자가 «모름» 을 골랐어도 덮어쓰지 않는다');
    const empty = AU({}, NONE, 500000000);
    eq([empty.filled, empty.userOwns], [true, false], '아무것도 없으면 채운다');
    const none0 = AU({}, NONE, 0);
    eq([none0.filled, none0.answers], [false, {}], '작년 값을 못 찾았으면(0) 채우지 않는다');
    // 같은 흐름: 응답 직전 표식은 이미 reset 됐으므로 남은 값은 전부 사용자 값
    const flow = AU(RS(st.answers, st.auto).answers, RS(st.answers, st.auto).auto, 600000000);
    eq([flow.filled, flow.answers.priorYearStandardValueAmount], [true, '600000000'], '자동 값만 있던 상태 → 새 주소 조회 → 새 작년 값으로 다시 채운다');
  }
  /* ── 올해·작년 조회가 같은 세대인가 ── */
  {
    const S = (a, b) => F.propPriorSameUnit(a, b);
    const apt = (m) => ({ kind: '공동주택', status: 'ok', matched: m });
    const M = { complex: '래미안', dong: '101', ho: '1203' };
    ok(S(apt(M), apt({ ...M })), '공동주택: 단지·동·호 같음 → 같은 세대');
    ok(S(apt(M), apt({ complex: '래미안', dong: '101동', ho: '1203호' })), '공동주택: 표기만 다른 동·호는 같은 세대(jtUnitSame)');
    ok(!S(apt({ complex: '래미안', dong: '', ho: '' }), apt({ complex: '래미안', dong: '', ho: '' })), '공동주택: 동·호가 둘 다 비어 있으면 같은 세대로 승인하지 않는다');
    ok(!S(apt({ ...M, dong: '' }), apt({ ...M, dong: '' })), '공동주택: 동이 비면 채우지 않는다');
    ok(!S(apt({ ...M, ho: '' }), apt({ ...M, ho: '' })), '공동주택: 호가 비면 채우지 않는다');
    ok(!S(apt(M), apt({ ...M, ho: '1204' })), '공동주택: 호가 다르면 아니다');
    ok(!S(apt(M), apt({ ...M, dong: '102' })), '공동주택: 동이 다르면 아니다');
    ok(!S(apt(M), apt({ ...M, complex: '자이' })), '공동주택: 단지가 다르면 아니다');
    ok(!S(apt(M), { kind: '공동주택', status: 'ok' }), '공동주택: 작년 응답에 matched 가 없으면 아니다');
    ok(!S({ kind: '공동주택', status: 'ok' }, apt(M)), '공동주택: 올해 응답에 matched 가 없으면 아니다');
    ok(S({ kind: '개별주택', status: 'ok', matched: { complex: '', dong: '', ho: '' } }, { kind: '개별주택', status: 'ok', matched: { complex: '', dong: '', ho: '' } }), '개별주택: 단지·동·호가 비는 것이 정상 — 종류가 같으면 같은 주소 조회로 본다');
    ok(S({ kind: '개별주택' }, { kind: '개별주택' }), '개별주택: matched 가 없어도 종류가 같으면 통과');
    ok(!S({ kind: '개별주택' }, apt(M)), '올해 개별주택 ↔ 작년 공동주택 → 아니다');
    ok(!S(apt(M), { kind: '개별주택' }), '올해 공동주택 ↔ 작년 개별주택 → 아니다');
    ok(!S({ matched: M }, { matched: M }), '종류(kind)가 없으면 아니다');
    ok(!S({ kind: '상가' }, { kind: '상가' }), '알 수 없는 종류는 아니다');
    ok(!S(null, apt(M)) && !S(apt(M), undefined), '응답이 없으면 아니다');
  }
  ok(!/연 20만원 이하면 7월 일괄/.test(code) && /20만원 이하는 지자체 조례에 따라 7월에 한꺼번에 부과될 수 있음/.test(code), '납부시기 정적 문구가 바뀌었다');

  console.log(`\nOK property request: ${checks} checks`);
})().catch((e) => { console.error(e); process.exit(1); });

/* 종합부동산세 — 화면 답 → 엔진 요청 변환·엔진 응답 판정을 «실행»으로 고정한다 (261011).

   소스(ReportComprehensive.jsx)에서 순수 함수 본문을 AST 범위로 꺼내 vm 에서 그대로 돌린다(tests_property_request.js 와 같은 방식 —
   테스트가 흉내 낸 규칙과 앱이 쓰는 규칙이 갈라지지 않게). 선언이 사라지거나 이름이 바뀌면 조용히 통과하지 않고 여기서 죽는다.

   고정하는 것
   · mapAnswersToComprehensive — 주택 수(1·2·3채)·§8④ 의제 4종(일시적 2주택·상속주택·지방 저가주택·부속토지)·나이/보유기간 «모름»(키 없음)·0 허용(보유기간)·
     공동명의 지분·선택 키(property_tax_paid·prior_year_total_tax)의 페이로드(키 집합·값), 요청을 못 만드는 입력은 null
   · 위 변환을 «독립 구현(oracle)» 과 전수·무작위 조합으로 대조하고, 변환이 null 인 입력 ⇔ 엔진 전 게이트(compFallbackGaps ①층)가 막는 입력인지(규칙이 한 벌인가)
   · compEngineVerdict 의 갈래(ok · needs_input · unsupported · refused · down) — 상태 키가 없는 응답·오류 필드·필수 키 무효
   · compCalcFromEngine 이 엔진 값을 그대로 옮기는지(세액공제 제외분·세부담 상한·분납·납부기간 포함), 거부·연결 실패에는 금액 필드가 없는지, 오류 문구가 전달되는지
   · compCalcFromEngineError(·callCompEngine 경유) 의 HTTP 422·503·네트워크 실패·시간 초과 분류
   · compFallbackGaps 의 ①층(공동명의 지분·의제 «모름»·특례 대상 공시가격·합계 모순)과 ②층(엔진 값 없음 — 상태별 문구)
   · 문항 구조(의제 문항은 2채 전용·상세 단계, 특례 대상 공시가격은 의제 유형 전용, 나이·보유기간 «모름» 보조 답, 선택 문항 둘)
   · 자체 계산식(fallbackCompTax·_compGrossTax)·「간이 추정」 문구가 소스에 남아 있지 않은지 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const parser = require('@babel/parser');

const SRC = path.join(__dirname, 'src', 'ReportComprehensive.jsx');
const code = fs.readFileSync(SRC, 'utf8');
const commonSrc = fs.readFileSync(path.join(__dirname, 'src', 'Report.jsx'), 'utf8');
const holdSrc = fs.readFileSync(path.join(__dirname, 'src', 'ReportAcqHolding.jsx'), 'utf8');

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
  if (missing.length) throw new Error('ReportComprehensive.jsx 에서 최상위 선언을 찾지 못했습니다: ' + missing.join(', '));
  return chunks.join('\n');
}
const validCalcSrc = commonSrc.match(/window\.jtValidCalc = function[\s\S]*?\n  };/)[0];
const gapsSrc = commonSrc.match(/window\.jtFallbackGaps = function[\s\S]*?\n};/)[0];
const dispSrc = commonSrc.match(/window\.jtEngineMessageForDisplay = function[\s\S]*?\n};/)[0];   // 표시용 문구 변환기(261011)

const DECLS = ['COMP_CIRCLED', 'compFmtArticle', 'compIsDeemed', 'COMP_QS', 'compFallbackGaps', 'mapAnswersToComprehensive', 'COMP_ENGINE_REQUIRED',
  'compEngineVerdict', 'compCalcFromEngine', 'compCalcFromEngineError', 'callCompEngine'];
const declSrc = loadDecls(code, DECLS);
const EXPORTS = '\nglobalThis.__e = { COMP_QS, compIsDeemed, compFallbackGaps, mapAnswersToComprehensive, COMP_ENGINE_REQUIRED, compEngineVerdict, compCalcFromEngine, compCalcFromEngineError, callCompEngine, compFmtArticle };';

function makeEnv(fetchImpl, timers) {
  const e = vm.createContext({
    window: { JT_ENGINE_BASE: 'https://engine.test' },
    Date, Number, Object, Math, JSON, Promise, Error, TypeError, String, Array, AbortController,
    fetch: fetchImpl,
    setTimeout: (fn, ms) => { if (ms <= 8000) { fn(); return 0; } if (timers) timers.push({ fn, ms }); return 1; },
    clearTimeout: () => {},
  });
  vm.runInContext(validCalcSrc, e);
  vm.runInContext(gapsSrc, e);
  vm.runInContext(dispSrc, e);
  vm.runInContext(declSrc + EXPORTS, e);
  return e.__e;
}

const F = makeEnv(null);
const body = (a) => plain(F.mapAnswersToComprehensive(a));
const isNull = (a) => F.mapAnswersToComprehensive(a) === null;
const gateBlocks = (a) => F.compFallbackGaps(a, { precise: true }).length > 0;

const DEEMED_TYPE = { temp: '일시적2주택_신규', inherit: '상속주택', rural: '지방저가주택', land: '부속토지' };

// ───────────────────────── 주택 수 ─────────────────────────
console.log('════ 주택 수 — 1채 · 2채 · 3채 이상 ════');
eq(body({ housingCount: 'one', totalValue: '1500000000' }), { housing_values: [1500000000], housing_count: 1, is_one_house: true }, '1채 빠른 계산 → 나이·보유기간 키 없음(엔진이 모름으로 보고 경고)');
eq(body({ housingCount: 'two', totalValue: '2000000000' }), { housing_values: [2000000000], housing_count: 2, is_one_house: false }, '2채 빠른 계산(의제 문항 미응답) → 일반 2주택');
eq(body({ housingCount: 'two', totalValue: '2000000000', deemedOneHouse: 'no' }), { housing_values: [2000000000], housing_count: 2, is_one_house: false }, '2채 + 아니요 → 일반 2주택(예외 키 없음)');
eq(body({ housingCount: 'two', totalValue: '2000000000', deemedOneHouse: '' }), { housing_values: [2000000000], housing_count: 2, is_one_house: false }, '2채 + 빈 답 → 일반 2주택');
eq(body({ housingCount: 'three', totalValue: '5000000000' }), { housing_values: [5000000000], housing_count: 3, is_one_house: false }, '3채 이상 → count 3');
eq('one_house_exceptions' in body({ housingCount: 'two', totalValue: '2000000000', deemedOneHouse: 'no' }), false, '일반 2주택에는 one_house_exceptions 를 보내지 않는다');
for (const k of ['tax_year', 'owner_age', 'holding_years', 'ownership_share', 'property_tax_paid', 'prior_year_total_tax', 'is_corporate']) {
  eq(k in body({ housingCount: 'three', totalValue: '5000000000' }), false, '3채 이상 기본 요청에는 ' + k + ' 키가 없다');
}
eq(body({ housingCount: 'three', totalValue: '5000000000', ownerAge: '70', holdingYears: '12', deemedOneHouse: 'temp', secondValue: '1' }),
  { housing_values: [5000000000], housing_count: 3, is_one_house: false }, '3채 이상이면 낡은 나이·보유기간·의제 답이 남아도 보내지 않는다');

// ───────────────────────── §8④ 의제 ─────────────────────────
console.log('════ 2채 + 1세대 1주택 의제(§8④) ════');
for (const [k, t] of Object.entries(DEEMED_TYPE)) {
  eq(body({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: k, secondValue: '600000000' }),
    { housing_values: [1500000000, 600000000], housing_count: k === 'land' ? 2 : 1, is_one_house: true, one_house_exceptions: ['', t] },
    k + ' → [합계 − 특례 대상, 특례 대상] · 예외 ["", ' + t + '] · is_one_house · count ' + (k === 'land' ? 2 : 1));
}
{
  const b = body({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: 'temp', secondValue: '600000000', ownerAge: '65', holdingYears: '7', propertyTaxPaid: '3510000', priorYearTotalTax: '3000000' });
  eq(b, { housing_values: [1500000000, 600000000], housing_count: 1, is_one_house: true, one_house_exceptions: ['', '일시적2주택_신규'], owner_age: 65, holding_years: 7, property_tax_paid: 3510000, prior_year_total_tax: 3000000 },
    '의제 + 나이·보유기간·재산세·직전 연도 세액 → 모두 전달(엔진 실측 응답 시나리오와 같은 입력)');
  eq(b.housing_values.length, b.one_house_exceptions.length, 'housing_values 와 one_house_exceptions 는 같은 길이');
  eq(b.housing_values[0] + b.housing_values[1], 2100000000, '두 금액의 합 = 입력한 합계');
}
for (const bad of ['unknown', 'auto', 'Temp', 'toString', 'constructor', 'hasOwnProperty']) {
  ok(isNull({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: bad, secondValue: '600000000' }), '의제 답 «' + bad + '» → 요청을 만들지 않는다');
}
for (const k of Object.keys(DEEMED_TYPE)) {
  ok(isNull({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: k }), k + ' + 특례 대상 공시가격 없음 → 요청을 만들지 않는다');
  ok(isNull({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: k, secondValue: '' }), k + ' + 빈 공시가격 → 요청을 만들지 않는다');
  ok(isNull({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: k, secondValue: '0' }), k + ' + 0 → 요청을 만들지 않는다');
  ok(isNull({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: k, secondValue: '2100000000' }), k + ' + 합계와 같음(주된 주택 0) → 요청을 만들지 않는다');
  ok(isNull({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: k, secondValue: '3000000000' }), k + ' + 합계보다 큼 → 요청을 만들지 않는다');
}
ok(isNull({ housingCount: 'two', deemedOneHouse: 'temp', secondValue: '600000000' }), '합계가 없으면(0) 요청을 만들지 않는다');
eq(plain(F.mapAnswersToComprehensive({ housingCount: 'one', totalValue: '1', deemedOneHouse: 'unknown' })) !== null, true, '1채면 낡은 의제 «모름» 답이 요청을 막지 않는다');

// ───────────────────────── 나이·보유기간 ─────────────────────────
console.log('════ 나이·보유기간 — 모름이면 키 없음, 0 허용(보유기간) ════');
{
  const one = { housingCount: 'one', totalValue: '1500000000' };
  eq(body({ ...one, ownerAge: '62', holdingYears: '8' }), { housing_values: [1500000000], housing_count: 1, is_one_house: true, owner_age: 62, holding_years: 8 }, '나이·보유기간 입력 → owner_age·holding_years');
  eq(body({ ...one, ownerAge: '62.9', holdingYears: '8.5' }), { housing_values: [1500000000], housing_count: 1, is_one_house: true, owner_age: 62, holding_years: 8.5 }, '나이는 내림, 보유기간은 소수 그대로');
  eq(body({ ...one, ownerAge: '62', ownerAgeUnknown: 'yes', holdingYears: '8', holdingYearsUnknown: 'yes' }), { housing_values: [1500000000], housing_count: 1, is_one_house: true }, '모름 보조 답 → 입력 값이 남아 있어도 키를 보내지 않는다');
  eq(body({ ...one, ownerAge: '62', ownerAgeUnknown: '', holdingYears: '8', holdingYearsUnknown: '' }).owner_age, 62, '모름 보조 답을 껐으면(빈 값) 입력 값을 보낸다');
  eq('holding_years' in body({ ...one, ownerAge: '62', holdingYearsUnknown: 'yes' }), false, '보유기간만 모름 → holding_years 만 빠진다');
  eq('owner_age' in body({ ...one, holdingYears: '8', ownerAgeUnknown: 'yes' }), false, '나이만 모름 → owner_age 만 빠진다');
  eq(body({ ...one, holdingYears: '0' }).holding_years, 0, '보유기간 0(1년 미만)은 허용 — 0 을 보낸다');
  eq('owner_age' in body({ ...one, ownerAge: '0' }), false, '나이 0 은 보내지 않는다(만 나이가 아니다)');
  eq('owner_age' in body({ ...one, ownerAge: '0.5' }), false, '나이 0.5 → 내림 0 → 보내지 않는다');
  eq('holding_years' in body({ ...one, holdingYears: '' }), false, '보유기간 빈 값 → 키 없음');
  eq('holding_years' in body({ ...one, holdingYears: undefined }), false, '보유기간 미응답 → 키 없음');
  eq('holding_years' in body({ ...one, holdingYears: '   ' }), false, '보유기간 공백 → 키 없음');
  eq('owner_age' in body({ ...one, ownerAge: '' }), false, '나이 빈 값 → 키 없음');
  eq('holding_years' in body({ ...one, holdingYears: 'abc' }), false, '숫자가 아닌 보유기간 → 키 없음');
  eq('holding_years' in body({ ...one, holdingYears: '-3' }), false, '음수 보유기간 → 키 없음');
  eq('owner_age' in body({ housingCount: 'two', totalValue: '2000000000', deemedOneHouse: 'no', ownerAge: '70' }), false, '일반 2주택에는 나이를 보내지 않는다(세액공제가 없다)');
  eq('holding_years' in body({ housingCount: 'two', totalValue: '2000000000', holdingYears: '12' }), false, '2채 빠른 계산에도 보유기간을 보내지 않는다');
  ok(!isNull({ ...one, ownerAgeUnknown: 'yes', holdingYearsUnknown: 'yes' }), '모름은 요청을 막지 않는다(차단이 아니다)');
}

// ───────────────────────── 공동명의 ─────────────────────────
console.log('════ 부부 공동명의 — 1채일 때만 ownership_share ════');
{
  const one = { housingCount: 'one', totalValue: '2000000000' };
  eq(body({ ...one, ownership: 'joint', ownShare: '50' }).ownership_share, 0.5, '50 → 0.5');
  eq(body({ ...one, ownership: 'joint', ownShare: '30' }).ownership_share, 0.3, '30 → 0.3');
  eq(body({ ...one, ownership: 'joint', ownShare: '99.5' }).ownership_share, 0.995, '99.5 → 0.995');
  eq('ownership_share' in body({ ...one, ownership: 'single', ownShare: '50' }), false, '단독명의 → 낡은 지분이 남아도 보내지 않는다');
  eq('ownership_share' in body({ ...one }), false, '명의 미응답 → 키 없음');
  for (const sh of [undefined, '', '0', '100', '101', '-5', 'abc']) {
    ok(isNull({ ...one, ownership: 'joint', ownShare: sh }), '공동명의 + 지분 ' + JSON.stringify(sh) + ' → 요청을 만들지 않는다(50% 로 짐작하지 않는다)');
  }
  eq('ownership_share' in body({ housingCount: 'two', totalValue: '2000000000', ownership: 'joint', ownShare: '50' }), false, '2채에는 낡은 공동명의 답이 남아도 지분을 보내지 않는다');
  ok(!isNull({ housingCount: 'two', totalValue: '2000000000', ownership: 'joint' }), '2채 + 낡은 joint 는 요청을 막지 않는다');
  for (const k of Object.keys(DEEMED_TYPE)) {
    ok(isNull({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: k, secondValue: '600000000', ownership: 'joint', ownShare: '50' }), k + ' + 공동명의 → 요청을 만들지 않는다(엔진이 지원하지 않는다 — 단독으로 확정하지 않는다)');
    ok(!isNull({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: k, secondValue: '600000000', ownership: 'single' }), k + ' + 단독명의 → 요청을 만든다');
    eq('ownership_share' in body({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: k, secondValue: '600000000', ownership: 'single', ownShare: '50' }), false, k + ' + 단독명의 → 지분 키 없음');
  }
}

// ───────────────────────── 선택 키 ─────────────────────────
console.log('════ 선택 문항 — property_tax_paid · prior_year_total_tax ════');
{
  const base = { housingCount: 'three', totalValue: '5000000000' };
  eq(body({ ...base, propertyTaxPaid: '2000000', priorYearTotalTax: '3000000' }), { housing_values: [5000000000], housing_count: 3, is_one_house: false, property_tax_paid: 2000000, prior_year_total_tax: 3000000 }, '양수 → 두 키 전달');
  for (const v of [undefined, '', '0', '   ']) {
    const b = body({ ...base, propertyTaxPaid: v, priorYearTotalTax: v });
    eq(['property_tax_paid' in b, 'prior_year_total_tax' in b], [false, false], '비움·0(' + JSON.stringify(v) + ') → 키를 보내지 않는다(엔진이 모름으로 보고 추정·상한 없이 계산하며 경고)');
  }
  eq('prior_year_total_tax' in body({ ...base, propertyTaxPaid: '2000000' }), false, '재산세만 입력 → 직전 연도 세액 키 없음');
  eq('property_tax_paid' in body({ ...base, priorYearTotalTax: '3000000' }), false, '직전 연도 세액만 입력 → 재산세 키 없음');
  const one = body({ housingCount: 'one', totalValue: '1500000000', propertyTaxPaid: '1', priorYearTotalTax: '1' });
  eq([one.property_tax_paid, one.prior_year_total_tax], [1, 1], '1채에도 전달');
}

// ───────────────────────── 전수·무작위 대조 (oracle) ─────────────────────────
console.log('════ 변환 전수·무작위 대조 — 독립 구현(oracle) · 변환이 null ⇔ 엔진 전 게이트가 막는다 ════');
function oracle(a) {
  const tv = Number(a.totalValue) || 0, second = Number(a.secondValue) || 0;
  const blank = (v) => v === undefined || v === null || String(v).trim() === '';
  const dm = a.housingCount === 'two' ? a.deemedOneHouse : undefined;
  let b, credit;
  if (['temp', 'inherit', 'rural', 'land'].includes(dm)) {
    if (!(second > 0 && tv > second)) return null;
    if (a.ownership === 'joint') return null;
    b = { housing_values: [tv - second, second], housing_count: dm === 'land' ? 2 : 1, is_one_house: true, one_house_exceptions: ['', DEEMED_TYPE[dm]] };
    credit = true;
  } else if (dm !== undefined && dm !== null && dm !== '' && dm !== 'no') {
    return null;
  } else {
    b = { housing_values: [tv], housing_count: { one: 1, two: 2, three: 3 }[a.housingCount] || 1, is_one_house: a.housingCount === 'one' };
    credit = a.housingCount === 'one';
  }
  if (credit) {
    if (a.ownerAgeUnknown !== 'yes' && !blank(a.ownerAge) && Math.floor(Number(a.ownerAge)) >= 1) b.owner_age = Math.floor(Number(a.ownerAge));
    if (a.holdingYearsUnknown !== 'yes' && !blank(a.holdingYears) && Number.isFinite(Number(a.holdingYears)) && Number(a.holdingYears) >= 0) b.holding_years = Number(a.holdingYears);
  }
  if (a.housingCount === 'one' && a.ownership === 'joint') {
    const p = Number(a.ownShare);
    if (!(p > 0 && p < 100)) return null;
    b.ownership_share = p / 100;
  }
  if (Number(a.propertyTaxPaid) > 0) b.property_tax_paid = Number(a.propertyTaxPaid);
  if (Number(a.priorYearTotalTax) > 0) b.prior_year_total_tax = Number(a.priorYearTotalTax);
  return b;
}
const ALLOWED = new Set(['housing_values', 'housing_count', 'is_one_house', 'one_house_exceptions', 'owner_age', 'holding_years', 'ownership_share', 'property_tax_paid', 'prior_year_total_tax']);
let compared = 0, nulls = 0;
function compare(a) {
  const got = F.mapAnswersToComprehensive(a);
  const want = oracle(a);
  const g = got === null ? null : plain(got);
  assert.deepEqual(g, want, '변환 불일치: ' + JSON.stringify(a));
  const blocks = gateBlocks(a);
  if (blocks !== (got === null)) assert.fail('규칙 불일치: ' + JSON.stringify(a) + ' gate=' + blocks + ' null=' + (got === null));
  if (g) {
    for (const k of Object.keys(g)) if (!ALLOWED.has(k)) assert.fail('허용되지 않은 키 ' + k + ': ' + JSON.stringify(a));
    if (g.one_house_exceptions && g.one_house_exceptions.length !== g.housing_values.length) assert.fail('길이 불일치: ' + JSON.stringify(a));
    if (g.one_house_exceptions && !g.is_one_house) assert.fail('예외는 1세대 1주택에만: ' + JSON.stringify(a));
    if (g.housing_values.reduce((x, y) => x + y, 0) !== (Number(a.totalValue) || 0)) assert.fail('합계 보존 실패: ' + JSON.stringify(a));
    if (g.housing_values.some((v) => !Number.isInteger(v) || v < 0)) assert.fail('공시가격은 0 이상의 정수: ' + JSON.stringify(a));
  } else nulls++;
  compared++;
}
{
  // (A) 구조 — 주택 수 × 의제 × 합계 × 특례 대상 × 명의 × 지분
  for (const hc of [undefined, 'one', 'two', 'three'])
    for (const dm of [undefined, '', 'no', 'temp', 'inherit', 'rural', 'land', 'unknown', 'auto'])
      for (const tv of ['2000000000', '500000000', '0', ''])
        for (const sv of [undefined, '', '0', '600000000', '500000000', '1500000000'])
          for (const ow of [undefined, 'single', 'joint'])
            for (const sh of [undefined, '', '0', '50', '100', '30.5'])
              compare({ housingCount: hc, deemedOneHouse: dm, totalValue: tv, secondValue: sv, ownership: ow, ownShare: sh });
  // (B) 선택·공제 — 1채 / 2채 의제 / 일반 2채 × 나이 × 모름 × 보유기간 × 모름 × 선택 키
  for (const base of [{ housingCount: 'one', totalValue: '1500000000' }, { housingCount: 'two', totalValue: '2100000000', deemedOneHouse: 'temp', secondValue: '600000000' }, { housingCount: 'two', totalValue: '2100000000', deemedOneHouse: 'no' }])
    for (const age of [undefined, '', '0', '0.5', '1', '62', '70.9', '120', 'abc'])
      for (const au of [undefined, '', 'yes'])
        for (const hy of [undefined, '', '0', '4.5', '8', '100', '-3', 'abc', ' '])
          for (const hu of [undefined, '', 'yes'])
            for (const ptp of [undefined, '', '0', '3510000'])
              for (const pyt of [undefined, '', '0', '3000000'])
                compare({ ...base, ownerAge: age, ownerAgeUnknown: au, holdingYears: hy, holdingYearsUnknown: hu, propertyTaxPaid: ptp, priorYearTotalTax: pyt });
  // (C) 무작위 — 모든 답이 섞이는 조합(고정 시드)
  let seed = 261011;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  for (let i = 0; i < 30000; i++) {
    compare({
      housingCount: pick([undefined, 'one', 'two', 'three', 'four']), deemedOneHouse: pick([undefined, 'no', 'temp', 'inherit', 'rural', 'land', 'unknown']),
      totalValue: pick(['2100000000', '900000000', '0', '', '12345678901']), secondValue: pick([undefined, '', '0', '600000000', '900000000', '2000000000']),
      ownership: pick([undefined, 'single', 'joint']), ownShare: pick([undefined, '', '0', '50', '100', '12.5']),
      ownerAge: pick([undefined, '', '0', '65', '120']), ownerAgeUnknown: pick([undefined, '', 'yes']),
      holdingYears: pick([undefined, '', '0', '3', '15.5']), holdingYearsUnknown: pick([undefined, '', 'yes']),
      propertyTaxPaid: pick([undefined, '', '0', '2000000']), priorYearTotalTax: pick([undefined, '', '0', '3000000']),
    });
  }
  checks += compared;
  ok(compared > 60000, '조합 ' + compared + '건에서 변환이 oracle 과 같고, null ⇔ 게이트 규칙이 일치한다');
  ok(nulls > 1000 && compared - nulls > 1000, '요청을 만든 경우와 만들지 못한 경우가 모두 충분히 섞였다 (null ' + nulls + ' / 요청 ' + (compared - nulls) + ')');
}

// ───────────────────────── 엔진 응답 판정 ─────────────────────────
console.log('════ compEngineVerdict — ok · needs_input · unsupported · refused · down ════');
/* 엔진 실측 응답(2026-10-11, comprehensive_tax: 공시 15억+6억·일시적 2주택·나이 65·보유 7년·직전 연도 300만원) — 세부담 상한이 걸린 경우 */
const OKCALC = {
  세목: '종합부동산세', 상태: 'ok', 세액: 1188000, 종부세합계: 990000, 농어촌특별세: 198000,
  주택분: { 과세표준: 540000000, 세액: 3180000, 재산세공제: 485357, 세액공제: 962372, 세액공제제외분: 769898, 상한전세액: 1732271, 세부담상한: { 적용: true, 상한액: 990000 }, 순세액: 990000 },
  토지_종합합산분: { 과세표준: 0, 재산세공제: 0, 세부담상한: { 적용: false, 상한액: null }, 순세액: 0 },
  세액공제율: { 연령: '30.0%', 보유: '20.0%', 합산: '50.0%' }, 납부기간: '12월 1일~15일', 분납가능: false, 분납가능액: 0,
  단계별계산: [{ 항목: '주택 공시가격 합산', 금액: 2100000000, 조문: '종부§8①', 비고: '' }],
  경고사항: ['[1세대1주택] 거주자 요건 …', '[세부담상한] 해당 연도 주택분 재산세액을 입력하지 않아 …'],
};
const V = (c) => F.compEngineVerdict(c);
eq(plain(F.COMP_ENGINE_REQUIRED), ['세액', '종부세합계', '농어촌특별세'], '필수 키는 셋(+ 주택분.과세표준·세액·순세액)');
eq(V(OKCALC), 'ok', '상태 ok → ok');
{ const c = { ...OKCALC }; delete c.상태; eq(V(c), 'refused', '상태 키가 없는 응답은 금액으로 받지 않는다 — 형식 오류이므로 refused'); }
{ const c = { ...OKCALC, 오류: '계산 실패' }; delete c.상태; eq(V(c), 'refused', '상태 키가 없으면 오류 필드가 있어도 refused'); }
eq(V({}), 'refused', '상태 키 없는 빈 객체 → refused (calc 자체가 없는 것(null·undefined)과 다르다)');
eq(V({ 세액: 0, 상태: 'needs_input', 오류: '1세대 1주택자 여부를 확정할 수 없다' }), 'needs_input', '상태 needs_input → needs_input');
eq(V({ 세액: 0, 상태: 'unsupported', 오류: '지원하지 않는 연도' }), 'unsupported', '상태 unsupported → unsupported');
eq(V({ ...OKCALC, 상태: 'needs_input', 오류: 'x' }), 'needs_input', '금액이 같이 와도 needs_input 은 금액이 아니다');
eq(V({ ...OKCALC, 상태: 'error', 오류: '내부 오류' }), 'down', '상태 error → down');
for (const st of ['', null, undefined, 'OK', 'Ok', true, 1, 'done']) eq(V({ ...OKCALC, 상태: st }), 'refused', '알 수 없는 상태 ' + JSON.stringify(st) + ' → refused');
eq(V({ ...OKCALC, 오류: '계산 실패' }), 'refused', '상태가 ok 여도 오류가 있으면 refused');
eq(V({ ...OKCALC, error: 'x' }), 'refused', 'error → refused');
eq(V({ ...OKCALC, errors: ['x'] }), 'refused', 'errors → refused');
eq(V({ ...OKCALC, detail: 'x' }), 'refused', 'detail → refused');
eq(V({ ...OKCALC, success: false }), 'refused', 'success:false → refused');
eq(V({ ...OKCALC, 세액: 0, 종부세합계: 0, 농어촌특별세: 0, 주택분: { ...OKCALC.주택분, 과세표준: 0, 세액: 0, 순세액: 0 } }), 'ok', '세금 없음(0원)은 정상 응답');
for (const k of COMP_KEYS()) {
  const c = { ...OKCALC }; delete c[k];
  eq(V(c), 'down', '필수 키 누락(' + k + ') → down');
  eq(V({ ...OKCALC, [k]: NaN }), 'down', '필수 키 NaN(' + k + ') → down');
  eq(V({ ...OKCALC, [k]: '0' }), 'down', '필수 키 문자열(' + k + ') → down');
  eq(V({ ...OKCALC, [k]: -1 }), 'down', '필수 키 음수(' + k + ') → down');
  eq(V({ ...OKCALC, [k]: null }), 'down', '필수 키 null(' + k + ') → down');
}
for (const k of ['과세표준', '세액', '순세액']) {
  const h = { ...OKCALC.주택분 }; delete h[k];
  eq(V({ ...OKCALC, 주택분: h }), 'down', '주택분.' + k + ' 누락 → down');
  eq(V({ ...OKCALC, 주택분: { ...OKCALC.주택분, [k]: NaN } }), 'down', '주택분.' + k + ' NaN → down');
}
eq(V({ ...OKCALC, 주택분: undefined }), 'down', '주택분 없음 → down');
eq(V({ ...OKCALC, 주택분: [] }), 'down', '주택분이 배열 → down');
for (const c of [null, undefined, [], 'x', 3]) eq(V(c), 'down', '깨진 calc ' + JSON.stringify(c) + ' → down');
function COMP_KEYS() { return ['세액', '종부세합계', '농어촌특별세']; }

// ───────────────────────── compCalcFromEngine ─────────────────────────
console.log('════ compCalcFromEngine — 엔진 값을 그대로 옮긴다 ════');
{
  const calc = plain(F.compCalcFromEngine({ calc: OKCALC, version: { engine: 'e1' } }));
  eq([calc.precise, calc.engineVer, calc.totalTax, calc.compTotal, calc.ruralTax], [true, 'e1', 1188000, 990000, 198000], '세액·종부세합계·농특세를 그대로');
  eq([calc.taxBase, calc.grossTax, calc.propTaxCredit, calc.taxCredit, calc.creditExcluded, calc.beforeLimit, calc.netTax], [540000000, 3180000, 485357, 962372, 769898, 1732271, 990000], '주택분 값을 그대로');
  eq([calc.limitApplied, calc.limitAmount], [true, 990000], '세부담 상한 적용·상한액');
  eq([calc.ageCreditRate, calc.holdingCreditRate, calc.combinedCreditRate], ['30.0%', '20.0%', '50.0%'], '세액공제율');
  eq([calc.payPeriod, calc.installmentOk, calc.installmentMax], ['12월 1일~15일', false, 0], '납부기간·분납');
  eq([calc.steps, calc.engineWarnings, calc.joint], [OKCALC.단계별계산, OKCALC.경고사항, null], '단계·경고, 공동명의 없음 → null');
  const lim = plain(F.compCalcFromEngine({ calc: { ...OKCALC, 주택분: { ...OKCALC.주택분, 세부담상한: { 적용: false, 상한액: null } } } }));
  eq([lim.limitApplied, lim.limitAmount], [false, 0], '상한 미적용(상한액 null) → 0 으로 둔다(표시하지 않는다)');
  const inst = plain(F.compCalcFromEngine({ calc: { ...OKCALC, 분납가능: true, 분납가능액: 1533800 } }));
  eq([inst.installmentOk, inst.installmentMax], [true, 1533800], '분납 가능·분납가능액');
  const jt = { 적용: true, 본인지분: 0.5, 선택경로: '공동명의특례(§10의2)', 지분별과세_8조1항: 8730000, 공동명의특례_10조의2: 4840560 };
  eq(plain(F.compCalcFromEngine({ calc: { ...OKCALC, 공동명의: jt } })).joint, jt, '공동명의 비교 객체를 그대로');
  eq(plain(F.compCalcFromEngine({ calc: { ...OKCALC, 공동명의: { 적용: false } } })).joint, null, '공동명의 적용 false → null');
  const odd = plain(F.compCalcFromEngine({ calc: { ...OKCALC, 단계별계산: 'x', 경고사항: null, 납부기간: 3, 세액공제율: null } }));
  eq([odd.steps, odd.engineWarnings, odd.payPeriod, odd.ageCreditRate], [[], [], '', undefined], '형식이 어긋난 부가 필드는 빈 값으로(금액은 필수 키 검증이 막는다)');
  eq('totalTax' in plain(F.compCalcFromEngine({ calc: { ...OKCALC, 주택분: { ...OKCALC.주택분, 세부담상한: undefined } } })), true, '세부담상한 객체가 없으면(적용 false 취급) 금액 응답은 유효');
  const LIMV = (lim) => V({ ...OKCALC, 주택분: { ...OKCALC.주택분, 세부담상한: lim } });
  eq(LIMV({ 적용: true, 상한액: 990000 }), 'ok', '상한 적용 + 상한액 → ok');
  eq(LIMV({ 적용: true, 상한액: 0 }), 'ok', '상한 적용 + 상한액 0(정상 0원 상한) → ok');
  for (const bad of [undefined, null, NaN, Infinity, -1, '990000', true]) eq(LIMV({ 적용: true, 상한액: bad }), 'down', '상한 적용 true + 상한액 ' + String(bad) + ' → down(불완전 응답)');
  eq(LIMV({ 적용: true }), 'down', '상한 적용 true + 상한액 키 없음 → down');
  for (const lim of [{ 적용: false, 상한액: null }, { 적용: false }, {}, null, undefined, 'x', []]) eq(LIMV(lim), 'ok', '상한 미적용·객체 없음/형식 어긋남(' + JSON.stringify(lim) + ') → ok');
  eq(plain(F.compCalcFromEngine({ calc: { ...OKCALC, 주택분: { ...OKCALC.주택분, 세부담상한: { 적용: true } } } })).precise, false, '상한 적용 true + 상한액 누락 → 금액 필드 없음(0원으로 보이지 않는다)');
  eq(plain(F.compCalcFromEngine({ calc: { ...OKCALC, 주택분: { ...OKCALC.주택분, 세부담상한: { 적용: true } } } })).engineState, 'down', '… engineState down');
}
for (const [c, st, msg] of [
  [{ 세액: 0, 상태: 'needs_input', 오류: '  1세대 1주택자 여부를 확정할 수 없다  ' }, 'needs_input', '1세대 1주택자 여부를 확정할 수 없다'],
  [{ 세액: 0, 상태: 'unsupported', 오류: '지원하지 않는 연도' }, 'unsupported', '지원하지 않는 연도'],
  [{ ...OKCALC, 오류: '계산 실패' }, 'refused', '계산 실패'],
  [{ ...OKCALC, error: '실패' }, 'refused', '실패'],
  [{ 세액: 0, 상태: 'needs_input' }, 'needs_input', ''],
]) {
  const r = plain(F.compCalcFromEngine({ calc: c }));
  eq([r.precise, r.engineState, r.engineMessage, 'totalTax' in r, 'netTax' in r], [false, st, msg, false, false], '거부·보완 응답 → ' + st + ', 금액 필드 없음, 오류 문구 전달');
}
{
  const r = plain(F.compCalcFromEngine({ calc: { 세액: 1, 종부세합계: 1, 농어촌특별세: 1, 주택분: { 과세표준: 1, 세액: 1, 순세액: 1 } } }));
  eq([r.precise, r.engineState, 'totalTax' in r], [false, 'refused', false], '상태 없는 200 응답 → refused, 금액 없음');
  ok(r.engineMessage.includes('엔진 응답 형식이 맞지 않습니다(상태 없음)'), '… 형식 오류 문구');
}
for (const ej of [{ calc: { ...OKCALC, 상태: 'error', 오류: '내부' } }, { calc: null }, {}, null, undefined, { calc: { ...OKCALC, 세액: NaN } }, { calc: [] }]) {
  const r = plain(F.compCalcFromEngine(ej));
  eq([r.precise, r.engineState, 'totalTax' in r, 'engineMessage' in r], [false, 'down', false, false], '깨진 응답·내부 오류 → down, 금액 필드 없음: ' + JSON.stringify(ej));
}

// ───────────────────────── 차단 판정 ─────────────────────────
console.log('════ compFallbackGaps — ①입력 불확정 · ②엔진 값 없음 ════');
{
  const G = (a, c) => F.compFallbackGaps(a, c);
  const OK = { precise: true }, DOWN = { precise: false };
  const ONE = { housingCount: 'one', totalValue: '1500000000' };
  eq(G(ONE, OK).length, 0, '1채 + 엔진 값 있음 → 통과');
  eq(G(ONE, F.compCalcFromEngine({ calc: OKCALC })).length, 0, '엔진 응답에서 만든 calc 로도 통과');
  eq(G({ ...ONE, ownership: 'joint' }, OK).length, 1, '공동명의 + 지분 없음 → 차단');
  eq(G({ ...ONE, ownership: 'joint', ownShare: '50' }, OK).length, 0, '공동명의 + 지분 50 → 통과');
  eq(G({ housingCount: 'two', totalValue: '2000000000', deemedOneHouse: 'unknown' }, OK).length, 1, '의제 모름 → 차단');
  eq(G({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: 'land', secondValue: '600000000' }, OK).length, 0, '부속토지 + 특례 대상 공시가격 → 통과');
  eq(G({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: 'inherit' }, OK).length, 1, '상속주택 + 특례 대상 공시가격 없음 → 차단');
  for (const k of ['temp', 'inherit', 'rural', 'land']) {
    const jg = G({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: k, secondValue: '600000000', ownership: 'joint' }, OK);
    eq(jg.length, 1, k + ' + 공동명의 → 차단');
    ok(jg[0].includes('2주택 특례(의제) 주택이 부부 공동명의인 경우는 이 계산기가 지원하지 않습니다') && jg[0].includes('세무사 확인'), '… 안내 문구');
    eq(G({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: k, secondValue: '600000000', ownership: 'single' }, OK).length, 0, k + ' + 단독명의 → 통과');
  }
  eq(G({ housingCount: 'two', totalValue: '2100000000', deemedOneHouse: 'no', ownership: 'joint' }, OK).length, 0, '일반 2주택 + 낡은 joint → 통과(계산이 명의를 쓰지 않는다)');
  eq(G({ housingCount: 'two', totalValue: '600000000', deemedOneHouse: 'rural', secondValue: '600000000' }, OK).length, 1, '지방 저가주택 + 합계 = 특례 대상 → 차단');
  /* ② 엔진 값이 없으면 입력과 무관하게 항상 사유 한 건 */
  for (const ans of [ONE, { housingCount: 'two', totalValue: '2000000000' }, { housingCount: 'three', totalValue: '5000000000' }, { housingCount: 'two', totalValue: '2100000000', deemedOneHouse: 'temp', secondValue: '600000000' }]) {
    for (const st of [undefined, 'down', 'needs_input', 'unsupported', 'refused']) {
      eq(G(ans, { precise: false, engineState: st }).length, 1, '엔진 값 없음(' + st + ') → 어떤 입력이든 사유 1건');
    }
    eq(G(ans, DOWN).length, 1, '엔진 상태 미지정 → 사유 1건');
  }
  eq(G(ONE, { precise: false, engineState: 'needs_input', engineMessage: '입력 부족' })[0], '입력이 더 필요합니다 — 입력 부족', 'needs_input → 입력이 더 필요합니다 — 엔진 문구');
  eq(G(ONE, { precise: false, engineState: 'needs_input' })[0].startsWith('입력이 더 필요합니다 — '), true, 'needs_input 문구가 없어도 안내');
  eq(G(ONE, { precise: false, engineState: 'unsupported', engineMessage: '지원하지 않는 연도' })[0], '세무사 확인이 필요한 조건입니다 — 지원하지 않는 연도', 'unsupported → 세무사 확인');
  eq(G(ONE, { precise: false, engineState: 'refused', engineMessage: '' })[0].startsWith('세무사 확인이 필요한 조건입니다 — '), true, 'refused → 세무사 확인');
  eq(G(ONE, { precise: false, engineState: 'down' })[0].startsWith('계산 엔진에 연결하지 못했습니다'), true, 'down → 연결 실패');
  eq(G(ONE, DOWN)[0].startsWith('계산 엔진에 연결하지 못했습니다'), true, '상태 미지정 → 연결 실패');
  { const ns = G(ONE, F.compCalcFromEngine({ calc: { 세액: 1, 종부세합계: 1, 농어촌특별세: 1, 주택분: { 과세표준: 1, 세액: 1, 순세액: 1 } } }));
    ok(ns.length === 1 && ns[0].includes('엔진 응답 형식이 맞지 않습니다(상태 없음)') && !ns[0].includes('연결하지 못했습니다'), '상태 없는 200 응답의 차단 사유는 형식 오류이지 연결 실패가 아니다'); }
  eq(G({ ...ONE, ownership: 'joint' }, DOWN).length, 2, '불확정 + 엔진 실패 → ①사유와 ②사유 둘');
  /* 엔진 전 게이트(precise:true)는 ①층만 본다 */
  eq(G({ ...ONE, ownership: 'joint' }, { precise: true }).length, 1, 'precise=true 판정 — 지분 없음은 ①층');
  eq(G(ONE, { precise: true }).length, 0, 'precise=true 판정 — 평범한 입력은 통과(②층은 빠진다)');
  /* 조문 표기는 화면에서 읽기 좋게 바꾼다 */
  eq(F.compFmtArticle('필요: one_house_exceptions [종부SS8(1)1호·SS8(4), 령SS2의3(1)]'), '필요: one_house_exceptions [종부§8①1호·§8④, 령§2의3①]', '엔진 오류 문구의 조문 표기(SS8(1))를 §8① 로');
}

// ───────────────────────── 문항 구조 ─────────────────────────
console.log('════ 문항 구조 ════');
{
  const Q = (id) => F.COMP_QS.find((q) => q.id === id);
  const ids = F.COMP_QS.map((q) => q.id);
  const dm = Q('deemedOneHouse'), sv = Q('secondValue'), age = Q('ownerAge'), hy = Q('holdingYears'), pyt = Q('priorYearTotalTax'), ptp = Q('propertyTaxPaid');
  ok(dm && sv && age && hy && pyt && ptp, '새 문항 여섯이 모두 있다');
  eq(plain(F.COMP_QS.filter((q) => q.tier === 'quick').map((q) => q.id)), ['ownerType', 'corporateType', 'corporateHouseCount', 'housingCount', 'totalValue'], '빠른 계산 단계에 소유자·법인 유형·법인 주택 수 추가');
  eq([dm.tier, sv.tier, age.tier, hy.tier, pyt.tier, ptp.tier], [undefined, undefined, undefined, undefined, undefined, undefined], '새 문항은 모두 상세 단계');
  eq(plain(dm.opts.map((o) => o[0])), ['no', 'temp', 'inherit', 'rural', 'land', 'unknown'], '의제 문항 선택지 6개');
  eq(dm.q, '두 번째 주택 때문에 2주택이 됐지만 1세대 1주택자로 보는 경우인가요?', '의제 문항 문구');
  eq(plain(dm.opts.map((o) => o[1])), ['아니요 — 일반 2주택', '일시적 2주택', '상속받은 주택', '지방 저가주택', '다른 주택의 부속토지만 소유', '모름'], '의제 선택지 라벨');
  ok(dm.opts[1][2].includes('새 집을 산 뒤 3년 안') && dm.opts[2][2].includes('상속 5년 안') && dm.opts[2][2].includes('지분 40% 이하') && dm.opts[2][2].includes('6억(수도권 밖 3억)') && dm.opts[3][2].includes('4억 이하') && dm.opts[3][2].includes('수도권·광역시 밖'), '의제 선택지 부제(요건 요약)');
  ok(dm.sub.includes('§8④') && dm.sub.includes('모름'), '의제 문항 보조 설명');
  ok(!dm.optional, '의제 문항은 필수(선택지를 골라야 다음으로 간다)');
  eq([dm.showIf({ housingCount: 'two' }), dm.showIf({ housingCount: 'one' }), dm.showIf({ housingCount: 'three' }), dm.showIf({})], [true, false, false, false], '의제 문항은 2채 전용');
  eq([sv.numeric, sv.money, !!sv.optional], [true, true, false], '특례 대상 공시가격은 금액·필수');
  eq(['temp', 'inherit', 'rural', 'land'].map((k) => sv.showIf({ housingCount: 'two', deemedOneHouse: k })), [true, true, true, true], '특례 대상 공시가격은 의제 4유형에 나온다');
  eq(['no', 'unknown', undefined, 'auto'].map((k) => sv.showIf({ housingCount: 'two', deemedOneHouse: k })), [false, false, false, false], '아니요·모름·미응답에는 나오지 않는다(모름은 차단)');
  eq(sv.showIf({ housingCount: 'three', deemedOneHouse: 'temp' }), false, '3채에는 낡은 의제 답이 남아도 나오지 않는다');
  ok(sv.sub.includes('9월 16일~30일') && sv.sub.includes('특례 신청') && sv.sub.includes('묻지 않고'), '특례 신청 안내(신청 여부는 묻지 않고 고지만)');
  eq(ids.indexOf('deemedOneHouse') < ids.indexOf('secondValue') && ids.indexOf('secondValue') < ids.indexOf('ownerAge'), true, '의제 문항 → 특례 대상 공시가격 → 나이 순서');
  /* 나이·보유기간 */
  eq([age.numeric, age.unknownId, age.min, age.max, !!age.optional], [true, 'ownerAgeUnknown', 1, 120, false], '나이: 숫자·모름 보조 답·1~120');
  eq([hy.numeric, hy.unknownId, hy.allowZero, !!hy.optional], [true, 'holdingYearsUnknown', true, false], '보유기간: 숫자·모름 보조 답·0 허용');
  for (const q of [age, hy]) {
    eq([q.showIf({ housingCount: 'one' }), q.showIf({ housingCount: 'two', deemedOneHouse: 'temp' }), q.showIf({ housingCount: 'two', deemedOneHouse: 'no' }), q.showIf({ housingCount: 'two' }), q.showIf({ housingCount: 'three' })],
      [true, true, false, false, false], q.id + ': 1채 또는 의제인 경우에만');
    ok(q.sub.includes('모름'), q.id + ': 모름 안내');
  }
  ok(age.sub.includes('§9⑥') && hy.sub.includes('§9⑧'), '조문 표기(§9⑥·§9⑧)');
  ok(hy.sub.includes('1년 미만이면 0'), '보유기간 0 안내');
  /* 선택 문항 */
  for (const q of [pyt, ptp]) eq([q.numeric, q.money, q.optional, q.showIf], [true, true, true, undefined], q.id + ': 금액·선택·항상 묻는다');
  ok(pyt.q.includes('재산세 본세') && pyt.q.includes('종합부동산세') && pyt.q.includes('농어촌특별세'), '직전 연도 세액 문항 문구');
  ok(pyt.sub.includes('§10') && pyt.sub.includes('150%') && pyt.sub.includes('상한 없이 계산하고 알려 드립니다'), '직전 연도 세액: 세부담 상한 안내');
  ok(ptp.q.includes('7·9월') && ptp.q.includes('재산세 본세') && ptp.sub.includes('도시지역분·지방교육세') && ptp.sub.includes('§9③'), '올해 재산세 문항 문구');
  eq(ids.indexOf('priorYearTotalTax') + 1, ids.indexOf('propertyTaxPaid'), '직전 연도 세액 → 올해 재산세 순서');
  eq(plain(ids.slice(-3)), ['priorYearTotalTax', 'propertyTaxPaid', 'context'], '선택 문항은 자유 입력 앞');
  /* 공동명의 문항은 그대로 */
  eq([Q('ownership').showIf({ housingCount: 'one' }), Q('ownership').showIf({ housingCount: 'two', deemedOneHouse: 'temp' }), Q('ownership').showIf({ housingCount: 'two', deemedOneHouse: 'no' }), Q('ownership').showIf({ housingCount: 'two' }), Q('ownership').showIf({ housingCount: 'three' })], [true, true, false, false, false], '명의 문항은 1채 또는 의제인 경우에 묻는다(의제를 단독으로 확정하지 않는다)');
  eq([Q('ownShare').showIf({ housingCount: 'one', ownership: 'joint' }), Q('ownShare').showIf({ housingCount: 'one', ownership: 'single' }), Q('ownShare').showIf({ housingCount: 'two', deemedOneHouse: 'temp', ownership: 'joint' })], [true, false, false], '지분율 문항은 1채 공동명의일 때만(의제 공동명의는 차단이라 지분을 묻지 않는다)');
  eq(F.compIsDeemed({ housingCount: 'two', deemedOneHouse: 'rural' }), true, 'compIsDeemed: 2채 + 의제');
  eq([F.compIsDeemed({ housingCount: 'one', deemedOneHouse: 'rural' }), F.compIsDeemed({ housingCount: 'two', deemedOneHouse: 'no' }), F.compIsDeemed({ housingCount: 'two', deemedOneHouse: 'unknown' })], [false, false, false], 'compIsDeemed: 1채·아니요·모름은 거짓');
}

// ───────────────────────── 호출 → 판정 (fetch 대역) ─────────────────────────
console.log('════ 엔진 호출 → 판정 (fetch 대역) ════');
(async () => {
  async function judge(env, answers) {
    try { return plain(env.compCalcFromEngine(await env.callCompEngine(env.mapAnswersToComprehensive(answers)))); }
    catch (e) { return plain(env.compCalcFromEngineError(e)); }
  }
  const resp = (status, json) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => json });
  const ANS = { housingCount: 'one', totalValue: '1500000000' };

  const sent = [];
  const okEnv = makeEnv(async (url, init) => { sent.push({ url, init }); return { ok: true, status: 200, json: async () => ({ calc: OKCALC, version: { engine: 'e1' } }) }; });
  const r1 = await judge(okEnv, ANS);
  eq([r1.precise, r1.totalTax, r1.engineVer], [true, 1188000, 'e1'], '200 + 상태 ok → 금액');
  eq(sent[0].url, 'https://engine.test/v1/calc/comprehensive', '요청은 POST /v1/calc/comprehensive');
  eq(sent[0].init.method, 'POST', 'POST');
  eq(JSON.parse(sent[0].init.body), { housing_values: [1500000000], housing_count: 1, is_one_house: true }, '요청 본문');

  for (const c of [{ 세액: 0, 상태: 'needs_input', 오류: '입력 부족' }, { 세액: 0, 상태: 'unsupported', 오류: '지원하지 않는 연도' }, { ...OKCALC, 오류: '계산 실패' }]) {
    const r = await judge(makeEnv(resp(200, { calc: c })), ANS);
    eq([r.precise, 'totalTax' in r, r.engineMessage], [false, false, c.오류], '200 인데 거부·보완 응답 → 금액 없음, 오류 문구 전달: ' + (c.상태 || '오류'));
    eq(r.engineState, (c.상태 === 'needs_input' || c.상태 === 'unsupported') ? c.상태 : 'refused', '… 상태 분류');
  }
  {
    const r = await judge(makeEnv(resp(200, { calc: { ...OKCALC, 상태: 'error', 오류: '내부' } })), ANS);
    eq([r.precise, r.engineState, 'totalTax' in r], [false, 'down', false], '200 + 상태 error → down, 금액 없음');
  }
  for (const s of [400, 422]) {
    const r = await judge(makeEnv(resp(s, { detail: 'x' })), ANS);
    eq([r.precise, r.engineState, 'totalTax' in r], [false, 'refused', false], 'HTTP ' + s + ' → refused');
  }
  for (const s of [408, 429, 500, 503]) {
    const r = await judge(makeEnv(resp(s, {})), ANS);
    eq([r.precise, r.engineState, 'totalTax' in r], [false, 'down', false], 'HTTP ' + s + ' → down');
  }
  const net = await judge(makeEnv(async () => { throw new TypeError('Failed to fetch'); }), ANS);
  eq([net.precise, net.engineState], [false, 'down'], '네트워크 실패 → down');
  const broken = await judge(makeEnv(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } })), ANS);
  eq([broken.precise, broken.engineState], [false, 'down'], '깨진 본문 → down');
  const noCalc = await judge(makeEnv(resp(200, { version: {} })), ANS);
  eq([noCalc.precise, noCalc.engineState], [false, 'down'], 'calc 없는 200 → down');

  const timers = [];
  const hangEnv = makeEnv((url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }), timers);
  const pending = judge(hangEnv, ANS);
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setImmediate(r));
    eq(timers[timers.length - 1].ms, 25000, '시도마다 시간 제한 25초 타이머가 걸린다');
    timers[timers.length - 1].fn();
  }
  const to = await pending;
  eq([to.precise, to.engineState], [false, 'down'], '시간 초과 → down');

  // ───────────────────────── 소스에 폴백이 없다 ─────────────────────────
  console.log('════ 소스에 자체 계산식(폴백)이 없다 ════');
  ok(!/fallbackCompTax|_compGrossTax/.test(code), '소스에 fallbackCompTax·_compGrossTax 가 남아 있지 않다');
  ok(!/간이 추정|간이 계산|정밀 엔진 연결이 지연되어|반영하지 않은 것/.test(code), '「간이 추정」 배너·「반영하지 않은 것」 문구가 소스에 없다');
  ok(!/calc\.precise \?|calc\.precise &&|!calc\.precise/.test(code), '결과 화면에 precise 분기가 없다(엔진 값이 없으면 차단 화면이 먼저 반환된다)');
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'[^'\n]*'|`[^`\n]*`/g, "''").replace(/\/\/[^\n]*/g, '');
  ok(!/0\.60|0\.6\b|1_200_000_000|900_000_000|\* 1\.20|\* 0\.0|\* 0\.[0-9]/.test(stripped), '화면이 공정비율·공제·세율·농특세를 곱하는 식이 없다(주석·문자열 제외)');
  const mapSrc = code.slice(code.indexOf('function mapAnswersToComprehensive('), code.indexOf('const COMP_ENGINE_REQUIRED'));
  ok(/one_house_exceptions/.test(mapSrc) && /property_tax_paid/.test(mapSrc) && /prior_year_total_tax/.test(mapSrc) && /owner_age/.test(mapSrc) && /holding_years/.test(mapSrc), '새 키가 모두 요청 변환에 있다');
  ok(!/tax_year/.test(mapSrc.replace(/\/\*[\s\S]*?\*\//g, '')), '요청 변환이 tax_year 를 보내지 않는다(엔진 기본 2026)');
  /* 결과 화면: 새 행·문구 */
  ok(/calc\.creditExcluded > 0/.test(code) && /세액공제 제외분/.test(code), '결과 화면에 세액공제 제외분 행(값 > 0 일 때)');
  ok(/calc\.limitApplied/.test(code) && /종부세법 §10/.test(code) && /상한액/.test(code), '결과 화면에 세부담 상한 적용 → 상한액 행(근거 종부세법 §10)');
  ok(/calc\.payPeriod/.test(code) && /분납 가능액/.test(code) && /종부세법 §20/.test(code), '결과 화면에 납부기간·분납 행');
  ok(/합산배제 임대주택·토지분은 반영하지 않았습니다\(세부담 상한은 직전 연도 금액을 입력한 경우에만 반영\)/.test(code), '정적 안내 문구가 새 계약대로 바뀌었다');
  ok(!/세부담 상한·합산배제·토지분·부부 공동명의 안분은 반영하지 않았습니다/.test(code), '낡은 정적 안내 문구가 없다');
  ok(/재산세 공제는 엔진이 추정했고, 세부담 상한은 직전 연도 금액을 넣어야 반영돼요/.test(code), '빠른 계산 «최대치 추정» 문구가 새 계약대로 바뀌었다');
  ok(!/최대치 추정/.test(code), '«최대치 추정» 문구가 남아 있지 않다');
  ok(/calc\.joint/.test(code) && /공동명의 비교/.test(code), '공동명의 비교 박스는 유지');
  ok(/calc\.netTax === 0 && !calc\.joint && \(/.test(code) && /calc\.taxBase === 0/.test(code), '0원 안내는 순세액 0 일 때만 나오고, 과세표준 0 일 때만 «공제 이하» 로 단정한다');
  ok(/공제·상한 적용 후 <strong>납부할 종합부동산세가 없습니다<\/strong>/.test(code), '과세표준이 있는데 순세액이 0 이면 «공제·상한 적용 후 납부할 종합부동산세가 없습니다»');
  ok(!/calc\.netTax === 0 && !calc\.joint && !calc\.limitApplied/.test(code), '낡은 0원 단정 조건이 없다');
  /* 차단 화면 배선 */
  ok(/compBlockReason/.test(code) && /'입력 보완 필요'/.test(code) && /'세무사 확인 필요'/.test(code), '차단 화면: 입력 보완 필요 / 세무사 확인 필요 구분');
  ok(/onClick=\{runAnalysis\}>다시 시도 →/.test(code), '차단 화면에 다시 시도 버튼');
  ok(/compGaps\.map\(compFmtArticle\)/.test(code), '엔진 오류 문구의 조문 표기를 화면에서 바꾼다');
  ok(/unknownId/.test(code) && /answers\[cur\.unknownId\] === 'yes'/.test(code), '「모름」 보조 답 UI 배선');
  ok(/cur\.allowZero \? v >= 0/.test(code), '보유기간 0 허용(canNext)');
  /* 취득세 보유 단계(ReportAcqHolding) — 종부세 행도 상태 ok 일 때만 금액 */
  const runBody = holdSrc.slice(holdSrc.indexOf('const runHolding = async () => {'));
  ok(/const compReq = mapAnswersToComprehensive\(compA\);/.test(runBody), 'AcqHolding: 종부세 요청도 매퍼를 거치고');
  ok(/if \(!compReq\) \{\s*yearOut\.comp = \{ status: 'check' \};/.test(runBody), 'AcqHolding: 요청을 못 만들면 엔진 호출 없이 «확인 필요»');
  ok(/if \(c2 && st2 === 'ok' && !c2\['오류'\] && !c2\.error\) yearOut\.comp = !compTaxOk \? \{ status: 'error' \} :/.test(runBody), 'AcqHolding: 종부세 상태 ok 이고 오류 필드가 없을 때만 금액(세액 검사 포함)');
  ok(/st2 === 'needs_input' \|\| st2 === 'unsupported' \|\| \(c2 && st2 === 'ok'\)\) yearOut\.comp = \{ status: 'check' \}/.test(runBody), 'AcqHolding: ok 인데 오류 필드가 함께 온 응답은 «확인 필요»');
  {
    /* 분기식을 소스에서 꺼내 실행한다 — 응답 형태별 결과 */
    const m = runBody.match(/const compTaxOk = ([^;]+);[\s\S]*?\n(\s*if \(c2 && st2 === 'ok'[\s\S]*?else yearOut\.comp = \{ status: 'error' \};)/);
    ok(!!m, 'AcqHolding: 종부세 응답 분기 블록을 찾았다');
    const run = (c2) => { const yearOut = {}; const ej2 = { version: { tax_rates_effective_date: 'd' } }; const st2 = c2 && c2['상태']; new Function('yearOut', 'c2', 'st2', 'ej2', 'isFinite', 'const compTaxOk = ' + m[1] + ';' + m[2])(yearOut, c2, st2, ej2, isFinite); return yearOut.comp; };
    eq(run({ 상태: 'ok', 세액: 906000 }), { status: 'ok', total: 906000, effDate: 'd' }, '상태 ok + 세액 → 금액');
    eq(run({ 상태: 'ok', 세액: 0 }), { status: 'ok', total: 0, effDate: 'd' }, '상태 ok + 세액 0 → 금액(정상 0원)');
    eq(run({ 상태: 'ok', 세액: 906000, 오류: '일부 실패' }), { status: 'check' }, '상태 ok + 오류 필드 → 확인 필요(금액 없음)');
    eq(run({ 상태: 'ok', 세액: 906000, error: 'x' }), { status: 'check' }, '상태 ok + error 필드 → 확인 필요(금액 없음)');
    eq(run({ 상태: 'ok', 세액: NaN }), { status: 'error' }, '상태 ok + 세액 NaN → error');
    eq(run({ 상태: 'needs_input', 세액: 0, 오류: '입력 부족' }), { status: 'check' }, 'needs_input → 확인 필요');
    eq(run({ 상태: 'unsupported', 세액: 0 }), { status: 'check' }, 'unsupported → 확인 필요');
    eq(run({ 상태: 'error', 세액: 0 }), { status: 'error' }, '상태 error → error');
    eq(run({ 세액: 906000 }), { status: 'error' }, '상태 키 없음 → error(금액으로 받지 않는다)');
    eq(run(null), { status: 'error' }, 'calc 없음 → error');
  }
  ok(!/!c2\['오류'\]\) yearOut\.comp/.test(runBody), 'AcqHolding: 종전 «오류만 없으면 ok» 판정이 없다');
  ok(/row\.status === 'check'\) return '확인 필요/.test(holdSrc), 'AcqHolding: «확인 필요» 표시');

  console.log(`\nOK comprehensive request: ${checks} checks`);
})().catch((e) => { console.error(e); process.exit(1); });

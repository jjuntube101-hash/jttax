/* 상속세 — 화면 답 → 엔진 요청 변환·엔진 응답 판정을 «실행»으로 고정한다 (261010).

   소스(ReportInheritance.jsx)에서 순수 함수 본문을 AST 범위로 꺼내 vm 에서 그대로 돌린다(tests_gift_request.js 와 같은 방식 —
   테스트가 흉내 낸 규칙과 앱이 쓰는 규칙이 갈라지지 않게). 선언이 사라지거나 이름이 바뀌면 조용히 통과하지 않고 여기서 죽는다.

   고정하는 것
   · mapAnswersToInheritance — 배우자 실제 상속 4선택지(법정상속분 → spouse_legal_share / 직접 입력 → spouse_inheritance /
     받지 않음 → spouse_no_inheritance / 모름 → 요청을 만들지 않음), 봉안시설·자연장지 비용(burial_facility_expenses: 입력하면 0 포함·비우면 생략),
     사전증여(배우자 → to_spouse / 그 외 친족 → is_heir·5년 이내 여부 / 5년 밖 비상속인 → 보내지 않음),
     모르는 사실은 키 생략(has_spouse·num_children 미응답)
   · inhEngineVerdict 의 갈래(ok · refused: needs_input·unsupported·오류 필드 · down: error·깨진 응답·연결 실패)
   · inhCalcFromEngine 이 엔진 값을 그대로 옮기는지, 거부·연결 실패에는 금액 필드가 없는지, 거부 사유 문구가 전달되는지
   · inhCalcFromEngineError(·callInhEngine 경유) 의 HTTP 422·503·네트워크 실패·시간 초과 분류
   · inhFallbackGaps 의 ①층(비거주자·배우자 모름·자녀 인원·사전증여 상속인 여부)과 ②층(엔진 값 없음) — 요청을 못 만드는 입력과 ①층이 같은 규칙인지
   · 문항 구조(배우자 문항은 빠른 계산 단계, 봉안비 문항은 장례비 바로 뒤)
   · 자체 계산식(폴백)이 소스에 남아 있지 않은지 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const parser = require('@babel/parser');

const SRC = path.join(__dirname, 'src', 'ReportInheritance.jsx');
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
  if (missing.length) throw new Error('ReportInheritance.jsx 에서 최상위 선언을 찾지 못했습니다: ' + missing.join(', '));
  return chunks.join('\n');
}
const validCalcSrc = commonSrc.match(/window\.jtValidCalc = function[\s\S]*?\n  };/)[0];
const gapsSrc = commonSrc.match(/window\.jtFallbackGaps = function[\s\S]*?\n};/)[0];

const DECLS = ['inhChildCount', 'INHERITANCE_QS', 'inhPriorGiftDropped', 'mapAnswersToInheritance', 'callInhEngine',
  'INH_ENGINE_REQUIRED', 'inhEngineVerdict', 'inhCalcFromEngine', 'inhCalcFromEngineError', 'inhFallbackGaps'];
const declSrc = loadDecls(code, DECLS);
const EXPORTS = '\nglobalThis.__e = { INHERITANCE_QS, mapAnswersToInheritance, inhPriorGiftDropped, inhEngineVerdict, inhCalcFromEngine, inhCalcFromEngineError, inhFallbackGaps, callInhEngine };';

function makeEnv(fetchImpl, timers) {
  const e = vm.createContext({
    window: { JT_ENGINE_BASE: 'https://engine.test' }, Date, Number, Object, Math, JSON, Promise, Error, TypeError, String, Array, AbortController,
    fetch: fetchImpl,
    /* 재시도 사이의 대기(≤8초)는 즉시 흘려보내고, 한 시도의 시간 제한(25초) 타이머만 모아 둔다 */
    setTimeout: (fn, ms) => { if (ms <= 8000) { fn(); return 0; } if (timers) timers.push({ fn, ms }); return 1; },
    clearTimeout: () => {},
  });
  vm.runInContext(validCalcSrc, e);
  vm.runInContext(gapsSrc, e);
  vm.runInContext(declSrc + EXPORTS, e);
  return e.__e;
}

const F = makeEnv(null);
const body = (a) => plain(F.mapAnswersToInheritance(a));
const isNull = (a) => F.mapAnswersToInheritance(a) === null;

/* 기준 답 — 총재산 20억, 배우자 있음(법정상속분대로), 자녀 2명 */
const BASE = { estateValue: '2000000000', hasSpouse: 'yes', numChildren: '2', spouseActual: 'legal', isResident: 'yes' };

// ───────────────────────── 기본 키 ─────────────────────────
console.log('════ estate_value · has_spouse · num_children ════');
eq(body(BASE), { estate_value: 2000000000, has_spouse: true, num_children: 2, spouse_legal_share: true }, '기본 요청: 답한 값만 — 다른 키(채무·장례비·봉안비·사전증여…)는 없다');
eq(body({ ...BASE, hasSpouse: 'no', spouseActual: undefined }), { estate_value: 2000000000, has_spouse: false, num_children: 2 }, '배우자 없음 → has_spouse:false, 배우자 키 없음');
eq(body({ ...BASE, hasSpouse: 'no' }), { estate_value: 2000000000, has_spouse: false, num_children: 2 }, '배우자 없음인데 낡은 spouseActual 답이 남아 있어도 배우자 키를 보내지 않는다');
{
  const b = body({ estateValue: '2000000000' });
  ok(!('has_spouse' in b) && !('num_children' in b), '배우자·자녀를 답하지 않았으면 키를 생략한다(엔진이 입력 부족으로 거부 — 2명·배우자 있음으로 확정하지 않는다)');
}
eq(body({ ...BASE, numChildren: '0' }).num_children, 0, '자녀 없음 → 0 을 보낸다(답한 사실)');
eq(body({ ...BASE, numChildren: 'many', numChildrenExact: '9' }).num_children, 9, '7명 이상 + 정확 인원 9 → 9');
ok(isNull({ ...BASE, numChildren: 'many', numChildrenExact: '3' }), '7명 이상을 골랐는데 인원 3 → 요청을 만들지 않는다(max(7, 입력) 으로 올리지 않는다)');
ok(isNull({ ...BASE, numChildren: 'many', numChildrenExact: '6' }), '7명 이상 + 인원 6 → 요청을 만들지 않는다');
eq(body({ ...BASE, numChildren: 'many', numChildrenExact: '7' }).num_children, 7, '7명 이상 + 인원 7 → 7 (경계)');
ok(isNull({ ...BASE, numChildren: 'many' }), '7명 이상인데 정확 인원이 없으면 요청을 만들지 않는다');
ok(isNull({ ...BASE, numChildren: 'many', numChildrenExact: '0' }), '정확 인원 0 도 마찬가지');

// ───────────────────────── 배우자 실제 상속 4선택지 ─────────────────────────
console.log('════ 배우자 실제 상속 — spouse_legal_share · spouse_inheritance · spouse_no_inheritance · 모름 ════');
{
  const legal = body({ ...BASE, spouseActual: 'legal' });
  eq([legal.spouse_legal_share, 'spouse_inheritance' in legal, 'spouse_no_inheritance' in legal], [true, false, false], '법정상속분대로 → spouse_legal_share:true 만');
  const amount = body({ ...BASE, spouseActual: 'amount', spouseInheritanceAmount: '1500000000' });
  eq([amount.spouse_inheritance, 'spouse_legal_share' in amount, 'spouse_no_inheritance' in amount], [1500000000, false, false], '직접 입력 → spouse_inheritance:<원> 만');
  const none = body({ ...BASE, spouseActual: 'none' });
  eq([none.spouse_no_inheritance, 'spouse_legal_share' in none, 'spouse_inheritance' in none], [true, false, false], '받지 않음 → spouse_no_inheritance:true 만');
  ok(isNull({ ...BASE, spouseActual: 'unsure' }), '모름 → 요청을 만들지 않는다(엔진을 부르지 않는다)');
  ok(isNull({ ...BASE, spouseActual: undefined }), '미응답 → 요청을 만들지 않는다');
  ok(isNull({ ...BASE, spouseActual: '' }), '빈 답 → 요청을 만들지 않는다');
  ok(isNull({ ...BASE, spouseActual: 'auto' }), '종전 값 auto(자동 법정상속분)는 더 이상 받지 않는다 — 확정하지 않는다');
  ok(isNull({ ...BASE, spouseActual: 'zero' }), '종전 값 zero 도 마찬가지(새 값 none 으로 대체)');
  ok(isNull({ ...BASE, spouseActual: 'amount' }), '직접 입력인데 금액이 없으면 요청을 만들지 않는다');
  ok(isNull({ ...BASE, spouseActual: 'amount', spouseInheritanceAmount: '0' }), '직접 입력인데 금액 0 도 마찬가지(받지 않음은 별도 선택지)');
  eq(body({ ...BASE, spouseActual: 'legal', spouseInheritanceAmount: '999' }).spouse_inheritance, undefined, '법정상속분을 골랐는데 낡은 직접 입력 금액이 남아 있어도 보내지 않는다');
  eq(body({ ...BASE, spouseActual: 'none', spouseInheritanceAmount: '999' }).spouse_inheritance, undefined, '받지 않음을 골랐을 때도 마찬가지');
  /* 배우자가 없으면 배우자 문항의 답(모름 포함)이 요청을 막지 않는다 */
  ok(!isNull({ ...BASE, hasSpouse: 'no', spouseActual: 'unsure' }), '배우자 없음 + 낡은 모름 → 요청을 만든다(문항이 안 보이는 답이므로)');
}

// ───────────────────────── 장례비·봉안시설 ─────────────────────────
console.log('════ funeral_expenses · burial_facility_expenses ════');
{
  const none = body(BASE);
  ok(!('funeral_expenses' in none) && !('burial_facility_expenses' in none), '둘 다 비어 있으면 키를 하나도 보내지 않는다');
  for (const blank of ['', undefined, null, '   ']) ok(!('burial_facility_expenses' in body({ ...BASE, burialFacilityExpenses: blank })), '봉안비 칸이 비어 있음(' + JSON.stringify(blank) + ') → 키 생략(엔진이 미분리로 본다)');
  eq(body({ ...BASE, burialFacilityExpenses: '0' }).burial_facility_expenses, 0, '0 을 입력하면 0 을 보낸다(분리 계산 — 봉안비 없음)');
  eq(body({ ...BASE, burialFacilityExpenses: '3000000' }).burial_facility_expenses, 3000000, '입력한 봉안비 → burial_facility_expenses');
  eq(body({ ...BASE, burialFacilityExpenses: '9000000' }).burial_facility_expenses, 9000000, '상한(500만) 초과 입력도 그대로 보낸다 — 한도는 엔진이 적용한다');
  const both = body({ ...BASE, funeralExpenses: '8000000', burialFacilityExpenses: '4000000' });
  eq([both.funeral_expenses, both.burial_facility_expenses], [8000000, 4000000], '일반 장례비와 봉안비는 따로 보낸다');
  const onlyBurial = body({ ...BASE, burialFacilityExpenses: '0' });
  ok(!('funeral_expenses' in onlyBurial), '장례비를 비웠으면 봉안비만 보내도 funeral_expenses 는 없다');
  eq(body({ ...BASE, funeralExpenses: '0' }).funeral_expenses, undefined, '장례비 0 은 종전대로 보내지 않는다');
}

// ───────────────────────── 종전대로 보내는 키 ─────────────────────────
console.log('════ 종전 키 — 답한 값만 ════');
{
  const b = body({ ...BASE, debts: '300000000', netFinancialAssets: '500000000', insuranceAmount: '100000000', retirementPay: '50000000',
    hasCohabitationHouse: 'yes', cohabitationHouseValue: '600000000' });
  eq([b.debts, b.net_financial_assets, b.insurance_amount, b.retirement_pay, b.has_cohabitation_house, b.cohabitation_house_value],
    [300000000, 500000000, 100000000, 50000000, true, 600000000], '채무·순금융재산·보험금·퇴직금·동거주택');
  const empty = body({ ...BASE, debts: '', netFinancialAssets: '0', insuranceAmount: undefined, hasCohabitationHouse: 'no', cohabitationHouseValue: '600000000' });
  ok(!('debts' in empty) && !('net_financial_assets' in empty) && !('insurance_amount' in empty) && !('has_cohabitation_house' in empty) && !('cohabitation_house_value' in empty),
    '비었거나 0 이거나 «해당 없음»이면 보내지 않는다(낡은 동거주택 가액 포함)');
  eq(body({ ...BASE, hasCohabitationHouse: 'yes' }).cohabitation_house_value, 0, '동거주택 «예» + 가액 비움 → 0 (종전 동작 — 엔진이 공제하지 않는다)');
}

// ───────────────────────── 사전증여 ─────────────────────────
console.log('════ gift_history — 직계비속 · 배우자(to_spouse) · 그 외 친족(is_heir) ════');
{
  const P = { ...BASE, priorGiftHas: 'yes', priorGiftOneRecipient: 'one', priorGiftValue: '100000000' };
  const child = body({ ...P, priorGiftRelation: '직계비속' }).gift_history;
  eq(child, [{ value: 100000000, deduction_used: 50000000, is_heir: true, is_minor: false }], '직계비속 → 공제 5천만, 상속인, to_spouse 없음');
  eq(body({ ...P, priorGiftRelation: '직계비속', priorGiftMinor: 'yes' }).gift_history[0].deduction_used, 20000000, '미성년 직계비속 → 공제 2천만');
  eq(body({ ...P, priorGiftRelation: '직계비속', priorGiftMinor: 'yes' }).gift_history[0].is_minor, true, '미성년 직계비속 → is_minor:true');
  eq(body({ ...P, priorGiftValue: '30000000', priorGiftRelation: '직계비속' }).gift_history[0].deduction_used, 30000000, '공제는 증여액을 넘지 않는다 (min)');

  const spouse = body({ ...P, priorGiftValue: '900000000', priorGiftRelation: '배우자' }).gift_history;
  eq(spouse, [{ value: 900000000, deduction_used: 600000000, is_heir: true, is_minor: false, to_spouse: true }], '배우자 → to_spouse:true, 공제 6억(증여세 화면과 같은 값), 상속인');
  eq(body({ ...P, priorGiftRelation: '배우자', priorGiftMinor: 'yes' }).gift_history[0].is_minor, false, '배우자는 미성년 답이 남아 있어도 is_minor:false');
  ok(!('to_spouse' in body({ ...P, priorGiftRelation: '직계비속' }).gift_history[0]), '직계비속은 to_spouse 를 보내지 않는다');
  ok(!('to_spouse' in body({ ...P, priorGiftRelation: '기타', priorGiftHeir: 'yes' }).gift_history[0]), '그 외 친족도 to_spouse 를 보내지 않는다');

  const heir = body({ ...P, priorGiftRelation: '기타', priorGiftHeir: 'yes' }).gift_history;
  eq(heir, [{ value: 100000000, deduction_used: 10000000, is_heir: true, is_minor: false }], '그 외 친족 + 상속인 → is_heir:true, 공제 1천만');
  const within = body({ ...P, priorGiftRelation: '기타', priorGiftHeir: 'no', priorGiftWithin5y: 'yes' }).gift_history;
  eq(within, [{ value: 100000000, deduction_used: 10000000, is_heir: false, is_minor: false }], '그 외 친족 + 상속인 아님 + 5년 이내 → is_heir:false 로 보낸다');
  const past = body({ ...P, priorGiftRelation: '기타', priorGiftHeir: 'no', priorGiftWithin5y: 'no' });
  ok(!('gift_history' in past), '그 외 친족 + 상속인 아님 + 5년 밖 → 사전증여를 보내지 않는다');
  ok(F.inhPriorGiftDropped({ ...P, priorGiftRelation: '기타', priorGiftHeir: 'no', priorGiftWithin5y: 'no' }) === true, '… 이 경우 결과 화면이 안내하도록 inhPriorGiftDropped 가 참');
  ok(F.inhPriorGiftDropped({ ...P, priorGiftRelation: '기타', priorGiftHeir: 'no', priorGiftWithin5y: 'yes' }) === false, '5년 이내면 제외 안내 대상이 아니다');
  ok(F.inhPriorGiftDropped({ ...P, priorGiftRelation: '직계비속', priorGiftHeir: 'no', priorGiftWithin5y: 'no' }) === false, '관계가 직계비속이면 낡은 상속인·5년 답으로 제외하지 않는다');
  ok(isNull({ ...P, priorGiftRelation: '기타' }), '그 외 친족인데 상속인 여부를 답하지 않았으면 요청을 만들지 않는다(기간을 짐작하지 않는다)');
  ok(isNull({ ...P, priorGiftRelation: '기타', priorGiftHeir: 'no' }), '상속인이 아닌데 5년 이내 여부를 답하지 않았으면 요청을 만들지 않는다');
  /* 관계를 바꾸기 전의 낡은 답 */
  eq(body({ ...P, priorGiftRelation: '직계비속', priorGiftHeir: 'no', priorGiftWithin5y: 'yes' }).gift_history[0].is_heir, true, '직계비속인데 낡은 «상속인 아님» 답이 남아 있어도 is_heir:true');
  eq(body({ ...P, priorGiftRelation: '배우자', priorGiftHeir: 'no', priorGiftWithin5y: 'no' }).gift_history[0].is_heir, true, '배우자인데 낡은 답이 남아 있어도 is_heir:true, 사전증여는 그대로 보낸다');
  /* 증여받은 사람이 여러 명 — 합계 1건으로 섞지 않는다 */
  ok(isNull({ ...P, priorGiftOneRecipient: 'many', priorGiftRelation: '직계비속' }), '증여받은 사람이 여러 명 → 요청을 만들지 않는다');
  ok(isNull({ ...P, priorGiftOneRecipient: undefined, priorGiftRelation: '직계비속' }), '한 명인지 여러 명인지 미응답 → 요청을 만들지 않는다');
  ok(isNull({ ...BASE, priorGiftHas: 'yes', priorGiftOneRecipient: 'many' }), '여러 명이면 금액을 안 적었어도 요청을 만들지 않는다');
  ok(!isNull({ ...BASE, priorGiftHas: 'no', priorGiftOneRecipient: 'many' }), '사전증여 없음이면 낡은 «여러 명» 답은 막지 않는다');
  /* 기타 · 상속인 아님 · 5년 안 → is_heir:false 로 보낸다 */
  eq(body({ ...P, priorGiftRelation: '기타', priorGiftHeir: 'no', priorGiftWithin5y: 'yes' }).gift_history[0].is_heir, false, '기타 · 상속인 아님 · 5년 안 → is_heir:false 를 보낸다');
  ok(!('gift_history' in body({ ...P, priorGiftRelation: '기타', priorGiftHeir: 'no', priorGiftWithin5y: 'no' })), '기타 · 상속인 아님 · 5년 밖 → 사전증여를 보내지 않는다');
  ok(!('gift_history' in body({ ...BASE, priorGiftHas: 'no', priorGiftValue: '100000000', priorGiftRelation: '배우자' })), '사전증여 없음 → 이력 없음');
  ok(isNull({ ...BASE, priorGiftHas: 'yes', priorGiftOneRecipient: 'one', priorGiftValue: '0', priorGiftRelation: '배우자' }), '사전증여 «있음·한 명» + 금액 0 → 요청을 만들지 않는다');
  ok(isNull({ ...BASE, priorGiftHas: 'yes', priorGiftOneRecipient: 'one', priorGiftRelation: '배우자' }), '사전증여 «있음·한 명» + 금액 미입력 → 요청을 만들지 않는다');
  /* 관계가 비었으면 기본값(상속인·공제 5천만)으로 gift_history 를 만들지 않는다 — 요청 null, 차단 사유는 input(엔진 전 게이트) */
  for (const rel of [undefined, '', '자녀', 'unsure']) {
    const a = { ...P, priorGiftRelation: rel };
    ok(isNull(a), '관계 비움(' + JSON.stringify(rel) + ') → 요청 null');
    ok(F.inhFallbackGaps(a, { precise: true }).length === 1, '… 엔진 전 게이트가 사유 1건(input)으로 막는다');
  }
  ok(isNull({ ...P, priorGiftRelation: '기타', priorGiftHeir: undefined }), '기타인데 상속인 여부 비움 → 요청 null');
  ok(isNull({ ...P, priorGiftRelation: '기타', priorGiftHeir: 'no', priorGiftWithin5y: undefined }), '기타 · 상속인 아님인데 5년 여부 비움 → 요청 null');
  ok(F.inhFallbackGaps({ ...P, priorGiftRelation: '기타' }, { precise: true }).length === 1, '기타인데 상속인 여부 비움 → 게이트 사유 1건');
  ok(F.inhFallbackGaps({ ...P, priorGiftValue: '' }, { precise: true }).length === 1, '금액 비움 → 게이트 사유 1건');
  ok(Object.keys(body({ ...P, priorGiftRelation: '배우자' }).gift_history[0]).every((k) => ['value', 'deduction_used', 'is_heir', 'is_minor', 'to_spouse'].includes(k)),
    '이력 항목의 키는 엔진이 받는 사실만(세액·일자를 지어내지 않는다)');
}

// ───────────────────────── 문항 구조 ─────────────────────────
console.log('════ 문항 구조 ════');
{
  const QS = F.INHERITANCE_QS;
  const byId = (id) => QS.find((q) => q.id === id);
  const visible = (a, phase) => plain(QS.filter((q) => !q.showIf || q.showIf(a)).filter((q) => (phase === 'quick') === (q.tier === 'quick')).map((q) => q.id));
  eq(byId('spouseActual').tier, 'quick', '배우자 실제 상속 문항은 «빠른 계산» 단계다');
  eq(byId('spouseInheritanceAmount').tier, 'quick', '직접 입력 금액 문항도 빠른 계산 단계다');
  eq(plain(byId('spouseActual').opts.map((o) => o[0])), ['legal', 'amount', 'none', 'unsure'], '선택지 값 4개(법정상속분·직접 입력·받지 않음·모름)');
  ok(byId('spouseActual').opts.find((o) => o[0] === 'unsure')[1].includes('모르'), '«모름» 선택지가 있다');
  eq(visible({ hasSpouse: 'yes', numChildren: '2' }, 'quick'), ['estateValue', 'hasSpouse', 'numChildren', 'spouseActual', 'isResident'], '배우자 있음 → 빠른 단계에 배우자 상속 문항이 뜬다');
  eq(visible({ hasSpouse: 'no', numChildren: '2' }, 'quick'), ['estateValue', 'hasSpouse', 'numChildren', 'isResident'], '배우자 없음 → 뜨지 않는다');
  eq(visible({ hasSpouse: 'yes', numChildren: '2', spouseActual: 'amount' }, 'quick'), ['estateValue', 'hasSpouse', 'numChildren', 'spouseActual', 'spouseInheritanceAmount', 'isResident'], '직접 입력 → 금액 문항이 이어서 뜬다');
  eq(visible({ hasSpouse: 'yes', numChildren: '2', spouseActual: 'legal' }, 'quick').includes('spouseInheritanceAmount'), false, '법정상속분이면 금액 문항이 안 뜬다');
  ok(!visible({ hasSpouse: 'yes' }, 'detail').includes('spouseActual'), '상세 단계에는 배우자 문항이 남아 있지 않다(빠른 단계로 올렸다)');
  const ids = plain(QS.map((q) => q.id));
  eq(visible({ priorGiftHas: 'yes' }, 'detail').filter((i) => i.startsWith('priorGift')), ['priorGiftHas', 'priorGiftOneRecipient'], '사전증여 «예» → 바로 다음에 «한 명인가요» 문항, 답하기 전에는 다른 사전증여 문항이 안 뜬다');
  eq(visible({ priorGiftHas: 'yes', priorGiftOneRecipient: 'many' }, 'detail').filter((i) => i.startsWith('priorGift')), ['priorGiftHas', 'priorGiftOneRecipient'], '여러 명 → 금액·관계 문항이 이어지지 않는다');
  eq(plain(byId('priorGiftOneRecipient').opts.map((o) => o[0])), ['one', 'many'], '한 명 / 여러 명 선택지');
  ok(byId('priorGiftHas').q.includes('상속인에게 10년 안에') && byId('priorGiftHas').q.includes('상속인이 아닌 사람에게 5년 안에'), '첫 문항이 상속인 10년·비상속인 5년 증여를 모두 묻는다');
  ok(byId('priorGiftHeir').sub.includes('한 사람 기준') && byId('priorGiftWithin5y').sub.includes('한 사람 기준'), '기타 분기 안내에 «한 사람 기준»을 적는다');
  ok(byId('priorGiftRelation').opts.find((o) => o[0] === '기타')[1].includes('상속인이 아닌'), '기타 선택지 설명이 상속인이 아닌 사람을 받는다');
  eq(byId('numChildrenExact').min, 7, '자녀 정확 인원 문항은 최소 7');
  eq(ids.indexOf('burialFacilityExpenses'), ids.indexOf('funeralExpenses') + 1, '봉안시설·자연장지 문항은 장례비 문항 바로 아래다');
  const bf = byId('burialFacilityExpenses');
  ok(bf.numeric && bf.money && bf.optional, '봉안비 문항은 선택 입력(원)');
  ok(byId('funeralExpenses').sub.includes('1,000만원') && byId('funeralExpenses').sub.includes('500만원'), '장례비 안내에 1,000만원 상한과 봉안비 별도 500만원을 적는다');
  ok(bf.sub.includes('500만원') && bf.sub.includes('1,000만원'), '봉안비 안내에도 한도를 적는다');
  eq(visible({ priorGiftHas: 'yes', priorGiftOneRecipient: 'one', priorGiftRelation: '기타' }, 'detail').filter((i) => i.startsWith('priorGift')), ['priorGiftHas', 'priorGiftOneRecipient', 'priorGiftValue', 'priorGiftRelation', 'priorGiftHeir'], '그 외 친족 → 상속인 여부 문항');
  eq(visible({ priorGiftHas: 'yes', priorGiftOneRecipient: 'one', priorGiftRelation: '기타', priorGiftHeir: 'no' }, 'detail').filter((i) => i.startsWith('priorGift')), ['priorGiftHas', 'priorGiftOneRecipient', 'priorGiftValue', 'priorGiftRelation', 'priorGiftHeir', 'priorGiftWithin5y'], '상속인 아님 → 5년 이내 문항');
  eq(visible({ priorGiftHas: 'yes', priorGiftOneRecipient: 'one', priorGiftRelation: '기타', priorGiftHeir: 'yes' }, 'detail').includes('priorGiftWithin5y'), false, '상속인이면 5년 문항이 안 뜬다');
  eq(visible({ priorGiftHas: 'yes', priorGiftOneRecipient: 'one', priorGiftRelation: '배우자' }, 'detail').filter((i) => i.startsWith('priorGift')), ['priorGiftHas', 'priorGiftOneRecipient', 'priorGiftValue', 'priorGiftRelation'], '배우자 → 추가 문항 없음');
}

// ───────────────────────── 엔진 응답 판정 ─────────────────────────
console.log('════ inhEngineVerdict — ok · refused · down ════');
const OKCALC = { 세목: '상속세', 과세표준: 600000000, 산출세액: 100000000, 세액: 97000000, 세대생략할증: 0,
  주요공제: { 총상속재산: 2000000000, 과세가액: 1990000000, 가산한사전증여: 0, 공제유형: '일괄공제', 선택공제: 500000000, 배우자공제: 857142857, 금융재산공제: 0, 동거주택공제: 0, 공제한도초과: 0, 증여세액공제: 0, 외국납부세액공제: 0, 단기재상속공제: 0, 신고세액공제: 3000000 },
  단계별계산: [{ 항목: '과세표준', 금액: 600000000 }], 경고사항: [] };
const V = (c) => F.inhEngineVerdict(c);
eq(V({ ...OKCALC, 상태: 'ok' }), 'ok', '상태 ok → ok');
eq(V({ ...OKCALC }), 'ok', '상태 키가 없는 구 엔진 응답(오류 없음 + 필수 키 유효) → ok');
eq(V({ ...OKCALC, 과세표준: 0, 산출세액: 0, 세액: 0 }), 'ok', '정상 0원 → ok');
eq(V({ 과세표준: 1, 산출세액: 1, 세액: 1 }), 'ok', '필수 키는 과세표준·산출세액·세액 셋');
eq(V({ 과세표준: 1, 산출세액: 1 }), 'down', '세액 키가 없으면 down');
eq(V({ ...OKCALC, 상태: 'needs_input', 오류: '배우자상속공제 — 배우자가 실제 상속받는 금액에 따라 달라진다' }), 'refused', '상태 needs_input → refused(입력이 더 필요하다)');
eq(V({ ...OKCALC, 상태: 'unsupported', 오류: '지원하지 않는 조합' }), 'refused', '상태 unsupported → refused');
eq(V({ ...OKCALC, 상태: 'needs_input' }), 'refused', '상태 needs_input(오류 문구 없음) → refused');
eq(V({ ...OKCALC, 상태: 'error', 오류: '내부 오류' }), 'down', '상태 error → down(엔진 내부 실패 — 다시 시도)');
eq(V({ ...OKCALC, 상태: 'error' }), 'down', '상태 error(오류 문구 없음) → down');
eq(V({ ...OKCALC, 오류: '계산 실패' }), 'refused', '오류 필드 → refused');
eq(V({ ...OKCALC, 상태: 'ok', 오류: '계산 실패' }), 'refused', '상태가 ok 여도 오류가 있으면 refused');
for (const st of ['', null, 'OK', true]) eq(V({ ...OKCALC, 상태: st }), 'refused', '상태 ' + String(st) + ' → refused(금액이 아니다)');
eq(V({ ...OKCALC, error: 'unsupported' }), 'refused', '영문 error → refused');
eq(V({ ...OKCALC, errors: ['x'] }), 'refused', 'errors → refused');
eq(V({ ...OKCALC, detail: 'x' }), 'refused', 'detail → refused');
eq(V({ ...OKCALC, success: false }), 'refused', 'success:false → refused');
for (const k of INH_REQUIRED_KEYS()) {
  const c = { ...OKCALC }; delete c[k];
  eq(V(c), 'down', '필수 키 누락(' + k + ') → down');
  eq(V({ ...OKCALC, [k]: NaN }), 'down', '필수 키 NaN(' + k + ') → down');
  eq(V({ ...OKCALC, [k]: '0' }), 'down', '필수 키 문자열(' + k + ') → down');
  eq(V({ ...OKCALC, [k]: -1 }), 'down', '필수 키 음수(' + k + ') → down');
}
for (const c of [null, undefined, {}, [], 'x', 3]) eq(V(c), 'down', '깨진 calc ' + JSON.stringify(c) + ' → down');
function INH_REQUIRED_KEYS() { return ['과세표준', '산출세액', '세액']; }

// ───────────────────────── inhCalcFromEngine ─────────────────────────
console.log('════ inhCalcFromEngine — 엔진 값을 그대로 옮긴다 ════');
{
  const calc = plain(F.inhCalcFromEngine({ calc: { ...OKCALC, 상태: 'ok',
    주요공제: { ...OKCALC.주요공제, 증여세액공제: 4850000, 공제한도초과: 12000000 }, 경고사항: ['[확인 필요] 배우자공제 5억 최소 적용 여부'] }, version: { engine: 'e1' } }));
  eq([calc.precise, calc.engineVer, calc.taxBase, calc.calcTax, calc.totalTax, calc.steps, calc.engineWarnings, calc.nonTaxableMsg],
    [true, 'e1', 600000000, 100000000, 97000000, [{ 항목: '과세표준', 금액: 600000000 }], ['[확인 필요] 배우자공제 5억 최소 적용 여부'], null], '유효 응답 → 금액·단계·경고를 그대로');
  eq([calc.deductions['선택공제'], calc.deductions['배우자공제'], calc.deductions['공제한도초과'], calc.deductions['증여세액공제'], calc.deductions['공제유형']],
    [500000000, 857142857, 12000000, 4850000, '일괄공제'], '주요공제의 선택공제·배우자공제·공제한도초과·증여세액공제를 옮긴다');
  const zero = plain(F.inhCalcFromEngine({ calc: { 과세표준: 0, 산출세액: 0, 세액: 0 } }));
  eq([zero.precise, zero.totalTax, zero.deductions, zero.steps, zero.engineWarnings, zero.nonTaxableMsg], [true, 0, {}, [], [], '공제 범위 내로 납부할 상속세가 없습니다.'], '선택 키가 없으면 빈 값, 세액 0 → 안내 문구');
  for (const c of [{ ...OKCALC, 상태: 'needs_input', 오류: '입력 부족' }, { ...OKCALC, 상태: 'unsupported', 오류: '지원 안 함' }, { ...OKCALC, 오류: 'x' }]) {
    const r = plain(F.inhCalcFromEngine({ calc: c }));
    eq([r.precise, r.engineState, 'totalTax' in r, 'taxBase' in r, 'deductions' in r], [false, 'refused', false, false, false], '거부 응답에는 금액 필드가 없다');
  }
  eq(plain(F.inhCalcFromEngine({ calc: { ...OKCALC, 상태: 'needs_input', 오류: '  배우자 실제 상속액을 알려 주세요  ' } })).engineMessage, '배우자 실제 상속액을 알려 주세요', '거부 사유는 엔진의 오류 문구를 그대로(앞뒤 공백만 제거) 전달한다');
  eq(plain(F.inhCalcFromEngine({ calc: { ...OKCALC, 상태: 'unsupported' } })).engineMessage, '', '오류 문구가 없으면 빈 문자열');
  eq(plain(F.inhCalcFromEngine({ calc: { ...OKCALC, error: 'unsupported combination' } })).engineMessage, 'unsupported combination', '영문 error 문구도 전달한다');
  for (const ej of [null, undefined, {}, { calc: {} }, { calc: { ...OKCALC, 세액: NaN } }, { calc: { ...OKCALC, 상태: 'error', 오류: '내부' } }]) {
    const r = plain(F.inhCalcFromEngine(ej));
    eq([r.precise, r.engineState, 'totalTax' in r, 'engineMessage' in r], [false, 'down', false, false], '깨진 응답·내부 오류 → down, 금액 필드 없음: ' + JSON.stringify(ej));
  }
}

// ───────────────────────── 차단 판정 ─────────────────────────
console.log('════ inhFallbackGaps — ①입력 불확정 · ②엔진 값 없음 ════');
{
  const G = (a, c) => F.inhFallbackGaps(a, c);
  const DOWN = { precise: false }, OK = { precise: true };
  const REFUSED = (m) => ({ precise: false, engineState: 'refused', engineMessage: m });
  eq(G(BASE, OK).length, 0, '평범한 입력 + 엔진 값 있음 → 통과');
  eq(G(BASE, F.inhCalcFromEngine({ calc: OKCALC })).length, 0, '엔진 응답에서 만든 calc 로도 통과');
  eq(G({ ...BASE, isResident: 'no' }, OK).length, 1, '비거주자 → precise 여도 차단');
  eq(G({ ...BASE, isResident: undefined }, OK).length, 1, '거주자 미확인 → 차단');
  const unsure = G({ ...BASE, spouseActual: 'unsure' }, OK);
  eq(unsure.length, 1, '배우자 모름 → precise 여도 차단(엔진을 부르기 전)');
  ok(unsure[0].includes('배우자가 실제로 상속받을 금액에 따라 세액이 크게 달라집니다'), '배우자 모름의 안내 문구');
  eq(G({ ...BASE, spouseActual: undefined }, OK).length, 1, '배우자 있음인데 상속 방식 미응답 → 차단');
  eq(G({ ...BASE, spouseActual: 'amount' }, OK).length, 1, '직접 입력인데 금액 없음 → 차단');
  eq(G({ ...BASE, spouseActual: 'amount', spouseInheritanceAmount: '1000000000' }, OK).length, 0, '직접 입력 + 금액 → 통과');
  eq(G({ ...BASE, spouseActual: 'none' }, OK).length, 0, '받지 않음 → 통과');
  eq(G({ ...BASE, hasSpouse: 'no', spouseActual: 'unsure' }, OK).length, 0, '배우자 없음이면 낡은 모름 답은 막지 않는다');
  eq(G({ ...BASE, numChildren: 'many' }, OK).length, 1, '자녀 7명 이상인데 정확 인원 없음 → 차단');
  eq(G({ ...BASE, numChildren: 'many', numChildrenExact: '9' }, OK).length, 0, '자녀 7명 이상 + 정확 인원 → 통과');
  eq(G({ ...BASE, numChildren: 'many', numChildrenExact: '3' }, OK).length, 1, '자녀 7명 이상 + 인원 3 → 차단');
  ok(G({ ...BASE, numChildren: 'many', numChildrenExact: '3' }, OK)[0].includes('7 이상으로 적어 주십시오'), '… 안내 문구');
  const MANY = G({ ...BASE, priorGiftHas: 'yes', priorGiftOneRecipient: 'many' }, OK);
  eq(MANY.length, 1, '사전증여 받은 사람이 여러 명 → 차단');
  ok(MANY[0].includes('사람별 공제와 증여세액공제가 달라져 화면에서 계산하지 않습니다') && MANY[0].includes('상담 문의로 사람별 금액을 적어 주십시오'), '… 안내 문구');
  eq(G({ ...BASE, priorGiftHas: 'yes' }, OK).length, 1, '한 명/여러 명 미응답 → 차단');
  eq(G({ ...BASE, priorGiftHas: 'no', priorGiftOneRecipient: 'many' }, OK).length, 0, '사전증여 없음이면 낡은 «여러 명» 답은 막지 않는다');
  const P = { ...BASE, priorGiftHas: 'yes', priorGiftOneRecipient: 'one', priorGiftValue: '100000000' };
  eq(G({ ...P, priorGiftRelation: '기타' }, OK).length, 1, '그 외 친족 + 상속인 여부 미응답 → 차단');
  eq(G({ ...P, priorGiftRelation: '기타', priorGiftHeir: 'no' }, OK).length, 1, '상속인 아님 + 5년 여부 미응답 → 차단');
  eq(G({ ...P, priorGiftRelation: '기타', priorGiftHeir: 'yes' }, OK).length, 0, '상속인 → 통과');
  eq(G({ ...P, priorGiftRelation: '기타', priorGiftHeir: 'no', priorGiftWithin5y: 'no' }, OK).length, 0, '5년 밖 → 통과(사전증여는 보내지 않는다)');
  eq(G({ ...P, priorGiftRelation: '배우자' }, OK).length, 0, '배우자 사전증여 → 통과');
  /* 종전 ②층(간이 폴백 한계: 배우자 비수령·사전증여·금융재산·동거주택)은 삭제됐다 — 엔진 값이 있으면 이 입력들은 막지 않는다 */
  eq(G({ ...P, priorGiftRelation: '직계비속', netFinancialAssets: '500000000', hasCohabitationHouse: 'yes', spouseActual: 'none' }, OK).length, 0, '사전증여·금융재산·동거주택·배우자 비수령 + 엔진 값 있음 → 통과');
  /* ② 엔진 값이 없으면 입력과 무관하게 항상 사유 한 건 */
  for (const ans of [BASE, { ...BASE, spouseActual: 'none' }, { ...BASE, netFinancialAssets: '500000000' }, { ...P, priorGiftRelation: '직계비속' }]) {
    eq(G(ans, DOWN).length, 1, '엔진 연결 실패(DOWN) → 어떤 입력이든 사유 1건');
    eq(G(ans, REFUSED('')).length, 1, '엔진 거부(REFUSED) → 어떤 입력이든 사유 1건');
  }
  ok(G(BASE, DOWN)[0].startsWith('계산 엔진에 연결하지 못했습니다'), 'DOWN 사유는 연결 실패 문구');
  ok(G(BASE, { precise: false, engineState: 'down' })[0].startsWith('계산 엔진에 연결하지 못했습니다'), 'down 도 연결 실패 문구');
  ok(G(BASE, REFUSED('배우자 실제 상속액이 필요합니다'))[0] === '입력이 더 필요합니다 — 배우자 실제 상속액이 필요합니다', 'REFUSED 사유는 «입력이 더 필요합니다» + 엔진의 오류 문구');
  ok(G(BASE, REFUSED(''))[0].startsWith('입력이 더 필요합니다 — '), '오류 문구가 없어도 «입력이 더 필요합니다» 안내');
  eq(G({ ...BASE, isResident: 'no' }, DOWN).length, 2, '비거주자 + 엔진 실패 → ①사유와 ②사유 둘');
  /* 엔진 전 게이트(precise:true)는 ①층만 본다 */
  eq(G({ ...BASE, spouseActual: 'unsure' }, { precise: true }).length, 1, 'precise=true 판정 — 모름은 ①층');
  eq(G(BASE, { precise: true }).length, 0, 'precise=true 판정 — 평범한 입력은 통과(②층은 빠진다)');
}

// ───────────────────────── 요청을 못 만드는 입력 = ①층 (규칙이 한 벌인가) ─────────────────────────
console.log('════ mapAnswersToInheritance 가 null 인 입력 ⇔ 엔진 전 게이트(①층)가 막는 입력 ════');
{
  /* 거주자는 yes 로 고정한다(비거주자 사유는 요청 변환과 무관한 별개 사유). 두 규칙이 어긋나면 «엔진은 안 부르는데 화면은 통과»
     또는 «게이트는 통과인데 요청이 null» 이 생긴다. */
  const spouse = [{ hasSpouse: 'no' }, ...['legal', 'amount', 'none', 'unsure', undefined, '', 'auto'].flatMap((sp) =>
    [undefined, '0', '1000000000'].map((amt) => ({ hasSpouse: 'yes', spouseActual: sp, spouseInheritanceAmount: amt })))];
  const kids = [{ numChildren: '2' }, { numChildren: 'many' }, { numChildren: 'many', numChildrenExact: '9' }, { numChildren: 'many', numChildrenExact: '0' }, { numChildren: 'many', numChildrenExact: '3' }, { numChildren: 'many', numChildrenExact: '7' }];
  const gift = [{}, { priorGiftHas: 'no' }, { priorGiftHas: 'no', priorGiftOneRecipient: 'many' },
    ...[undefined, 'one', 'many'].flatMap((one) => ['직계비속', '배우자', '기타', undefined, '자녀'].flatMap((rel) => [undefined, 'yes', 'no'].flatMap((heir) => [undefined, 'yes', 'no'].map((w5) =>
      ({ priorGiftHas: 'yes', priorGiftOneRecipient: one, priorGiftValue: ['100000000', undefined][(rel === '배우자' ? 1 : 0)], priorGiftRelation: rel, priorGiftHeir: heir, priorGiftWithin5y: w5 })))))];
  let n = 0;
  for (const s of spouse) for (const k of kids) for (const g of gift) {
    const a = { estateValue: '2000000000', isResident: 'yes', ...s, ...k, ...g };
    const gateBlocks = F.inhFallbackGaps(a, { precise: true }).length > 0;
    const reqNull = F.mapAnswersToInheritance(a) === null;
    if (gateBlocks !== reqNull) assert.fail('규칙 불일치: ' + JSON.stringify(a) + ' gate=' + gateBlocks + ' null=' + reqNull);
    n++;
  }
  checks += n;
  ok(n > 500, '조합 ' + n + '건에서 두 규칙이 일치한다');
}

// ───────────────────────── 호출 → 판정 (fetch 대역) ─────────────────────────
console.log('════ 엔진 호출 → 판정 (fetch 대역) ════');
(async () => {
  /* runAnalysis 가 하는 일과 같은 두 줄 — 호출 → 판독, 던지면 분류 */
  async function judge(env, answers) {
    try { return plain(env.inhCalcFromEngine(await env.callInhEngine(env.mapAnswersToInheritance(answers)))); }
    catch (e) { return plain(env.inhCalcFromEngineError(e)); }
  }
  const resp = (status, json) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => json });
  const A = { ...BASE };

  const sent = [];
  const okEnv = makeEnv(async (url, init) => { sent.push({ url, init }); return { ok: true, status: 200, json: async () => ({ calc: { ...OKCALC, 상태: 'ok' }, version: { engine: 'e1' } }) }; });
  const r1 = await judge(okEnv, A);
  eq([r1.precise, r1.totalTax, r1.engineVer], [true, 97000000, 'e1'], '200 + 상태 ok → 금액');
  eq(sent[0].url, 'https://engine.test/v1/calc/inheritance', '요청은 POST /v1/calc/inheritance');
  eq(sent[0].init.method, 'POST', 'POST');
  eq(JSON.parse(sent[0].init.body), { estate_value: 2000000000, has_spouse: true, num_children: 2, spouse_legal_share: true }, '요청 본문(모르는 사실은 키 없음)');

  eq((await judge(makeEnv(resp(200, { calc: { ...OKCALC } })), A)).precise, true, '200 + 상태 없음(구 엔진) → 금액');
  for (const c of [{ ...OKCALC, 상태: 'unsupported', 오류: '지원하지 않는 유형', 세액: 0 }, { ...OKCALC, 상태: 'needs_input', 오류: '입력 부족' }, { ...OKCALC, 오류: '계산 실패' }]) {
    const r = await judge(makeEnv(resp(200, { calc: c })), A);
    eq([r.precise, r.engineState, 'totalTax' in r, r.engineMessage], [false, 'refused', false, c.오류], '200 인데 거부 응답 → refused, 금액 없음, 오류 문구 전달: ' + (c.상태 || '오류'));
  }
  {
    const r = await judge(makeEnv(resp(200, { calc: { ...OKCALC, 상태: 'error', 오류: '내부' } })), A);
    eq([r.precise, r.engineState, 'totalTax' in r], [false, 'down', false], '200 + 상태 error → down(엔진 내부 실패), 금액 없음');
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

  // 시간 초과 — 한 시도마다 걸린 25초 타이머를 직접 불러 경과를 흉내 낸다. 끊긴 호출은 status 없는 예외 → down
  const timers = [];
  const hangEnv = makeEnv((url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }), timers);
  const pending = judge(hangEnv, A);
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setImmediate(r));
    eq(timers[timers.length - 1].ms, 25000, '시도마다 시간 제한 25초 타이머가 걸린다');
    timers[timers.length - 1].fn();
  }
  const to = await pending;
  eq([to.precise, to.engineState], [false, 'down'], '시간 초과 → down');

  // ───────────────────────── 소스에 폴백이 없다 ─────────────────────────
  console.log('════ 소스에 자체 계산식(폴백)이 없다 ════');
  for (const name of ['calcInhBaseTax', 'INH_BRACKETS', 'lumpSum', 'spouseShare', 'filingCredit', 'taxableBase']) {
    ok(!code.includes(name), '소스에 ' + name + ' 가 남아 있지 않다');
  }
  ok(!/간이 추정|간이 계산|정밀 엔진 연결이 지연되어/.test(code), '「간이 추정」 배너·문구가 소스에 없다');
  ok(!/\* 0\.03|\* 0\.1\b|Math\.round\(baseTax|Math\.round\(taxBase/.test(code), '화면이 세율·신고세액공제율을 곱하는 식이 없다');
  ok(!/500_000_000|200_000_000|1_500_000_000/.test(code.replace(/\/\*[\s\S]*?\*\//g, '')), '일괄공제·기초공제·장례비 한도 같은 공제 상수를 화면이 갖고 있지 않다(주석 제외)');
  const mapSrc = code.slice(code.indexOf('function mapAnswersToInheritance('), code.indexOf('function inhFallbackGaps('));
  ok(!/spouse_inheritance\s*:\s*0|has_spouse\s*:\s*true|num_children\s*:\s*[0-9]/.test(mapSrc), 'mapAnswersToInheritance 에 배우자·자녀 기본값 확정이 없다');
  ok(/spouse_legal_share/.test(mapSrc) && /spouse_no_inheritance/.test(mapSrc) && /burial_facility_expenses/.test(mapSrc) && /to_spouse/.test(mapSrc), '새 키가 모두 요청 변환에 있다');

  console.log(`\nOK inheritance request: ${checks} checks`);
})().catch((e) => { console.error(e); process.exit(1); });

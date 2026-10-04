/* 증여세 — 화면 답 → 엔진 요청 변환·엔진 응답 판정을 «실행»으로 고정한다 (261004).

   소스(ReportGift.jsx)에서 순수 함수 본문을 AST 범위로 꺼내 vm 에서 그대로 돌린다(tests_cgt_request.js 와 같은 방식 —
   테스트가 흉내 낸 규칙과 앱이 쓰는 규칙이 갈라지지 않게). 선언이 사라지거나 이름이 바뀌면 조용히 통과하지 않고 여기서 죽는다.

   고정하는 것
   · mapAnswersToGift — relationship(답한 값 그대로·없으면 생략), donee_age(나이 문항에 답한 경우에만·is_minor 는 안 보냄),
     is_generation_skip(문항에 답한 경우에만 — 빠른 단계에서는 생략)·donor_child_deceased, 혼인·출산공제,
     gift_history(합계 1건 · total_deduction_used 는 입력란을 채운 경우에만 · 세대생략 플래그)
   · giftEngineVerdict 의 세 갈래(ok · refused · down) — 상태 키 없는 구 엔진 응답은 «오류 없음 + 필수 키 유효»이면 ok
   · giftCalcFromEngine 이 엔진 값을 그대로 옮기는지, 거부·연결 실패에는 금액 필드가 없는지
   · giftCalcFromEngineError(·callGiftEngine 경유) 의 HTTP 422·503·네트워크 실패·시간 초과 분류
   · 자체 계산식(폴백)이 소스에 남아 있지 않은지 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const parser = require('@babel/parser');

const SRC = path.join(__dirname, 'src', 'ReportGift.jsx');
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
  if (missing.length) throw new Error('ReportGift.jsx 에서 최상위 선언을 찾지 못했습니다: ' + missing.join(', '));
  return chunks.join('\n');
}
const validCalcSrc = commonSrc.match(/window\.jtValidCalc = function[\s\S]*?\n  };/)[0];
const gapsSrc = commonSrc.match(/window\.jtFallbackGaps = function[\s\S]*?\n};/)[0];

const DECLS = ['giftAmount', 'giftPriorDedGiven', 'mapAnswersToGift', 'callGiftEngine',
  'GIFT_ENGINE_REQUIRED', 'giftEngineVerdict', 'giftCalcFromEngine', 'giftCalcFromEngineError', 'giftFallbackGaps'];
const declSrc = loadDecls(code, DECLS);
const EXPORTS = '\nglobalThis.__e = { mapAnswersToGift, giftEngineVerdict, giftCalcFromEngine, giftCalcFromEngineError, giftFallbackGaps, callGiftEngine };';

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
const body = (a) => plain(F.mapAnswersToGift(a));

/* 기준 답 — 현금 1억, 직계존속에게서 받음 */
const BASE = { assetType: 'cash', giftValueCash: '100000000', relationship: '직계존속' };

// ───────────────────────── 관계·금액 ─────────────────────────
console.log('════ relationship · value ════');
for (const rel of ['배우자', '직계존속', '직계비속', '기타친족', '기타']) {
  eq(body({ ...BASE, relationship: rel }).relationship, rel, '관계 그대로: ' + rel);
}
eq(body({ ...BASE }).value, 100000000, '현금 금액');
eq(body({ assetType: 'realestate', giftValue: '800000000', relationship: '배우자' }).value, 800000000, '부동산 평가액');
{
  const b = body({ assetType: 'cash', giftValueCash: '100000000' });
  ok(!('relationship' in b), '관계 답이 없으면 키를 생략한다(기본값 «직계존속» 을 넣지 않는다)');
  ok(!('donee_age' in b) && !('is_minor' in b) && !('is_generation_skip' in b) && !('donor_child_deceased' in b) && !('gift_history' in b),
    '답이 없는 사실은 하나도 보내지 않는다');
}

// ───────────────────────── 나이 ─────────────────────────
console.log('════ donee_age · is_minor ════');
eq(body({ ...BASE, doneeAge: '30' }).donee_age, 30, '나이 답 → 숫자');
eq(body({ ...BASE, doneeAge: '15' }).donee_age, 15, '미성년 나이 답도 나이만 보낸다');
for (const age of ['', undefined, null, '  ']) ok(!('donee_age' in body({ ...BASE, doneeAge: age })), '나이 미응답(' + JSON.stringify(age) + ') → 키 생략(30 기본값 없음)');
for (const age of ['5', '15', '30']) ok(!('is_minor' in body({ ...BASE, doneeAge: age })), 'is_minor 는 보내지 않는다(엔진이 나이로 판정): ' + age);
ok(!('donee_age' in body({ ...BASE, relationship: '배우자', doneeAge: '30' })), '나이 문항이 안 보이는 관계(배우자)에서는 낡은 나이 답을 보내지 않는다');

// ───────────────────────── 세대생략 ─────────────────────────
console.log('════ is_generation_skip · donor_child_deceased ════');
{
  const quick = body({ ...BASE });
  ok(!('is_generation_skip' in quick) && !('donor_child_deceased' in quick), '빠른 단계(문항 없음) → is_generation_skip 생략');
  const yesAlive = body({ ...BASE, genSkip: 'yes', childDeceased: 'no' });
  eq([yesAlive.is_generation_skip, yesAlive.donor_child_deceased], [true, false], '세대생략 yes · 자녀 생존 → true / false');
  const yesDead = body({ ...BASE, genSkip: 'yes', childDeceased: 'yes' });
  eq([yesDead.is_generation_skip, yesDead.donor_child_deceased], [true, true], '세대생략 yes · 자녀 사망(대습) → true / true');
  const no = body({ ...BASE, genSkip: 'no' });
  eq(no.is_generation_skip, false, '세대생략 no → false');
  ok(!('donor_child_deceased' in no), '세대생략 no → donor_child_deceased 를 보내지 않는다');
  const noStale = body({ ...BASE, genSkip: 'no', childDeceased: 'yes' });
  ok(!('donor_child_deceased' in noStale), '세대생략 no 인데 낡은 childDeceased=yes 가 남아 있어도 보내지 않는다');
  const other = body({ ...BASE, relationship: '직계비속', genSkip: 'yes', childDeceased: 'yes' });
  ok(!('is_generation_skip' in other) && !('donor_child_deceased' in other), '문항이 안 보이는 관계(직계비속)의 낡은 세대생략 답은 보내지 않는다');
}

// ───────────────────────── 혼인·출산공제 ─────────────────────────
console.log('════ marriage_deduction · childbirth_deduction ════');
eq([body({ ...BASE, marriageDed: 'yes' }).marriage_deduction, body({ ...BASE, marriageDed: 'no' }).marriage_deduction, body({ ...BASE }).marriage_deduction], [true, false, false], '혼인공제 yes/no/미응답');
eq([body({ ...BASE, childbirthDed: 'yes' }).childbirth_deduction, body({ ...BASE, childbirthDed: 'no' }).childbirth_deduction, body({ ...BASE }).childbirth_deduction], [true, false, false], '출산공제 yes/no/미응답');
eq([body({ ...BASE, relationship: '배우자', marriageDed: 'yes' }).marriage_deduction, body({ ...BASE, relationship: '직계비속', childbirthDed: 'yes' }).childbirth_deduction], [false, false], '직계존속이 아니면 낡은 혼인·출산공제 답은 false');
/* 문항이 보이지 않는 관계(직계존속이 아님)에서는 낡은 답을 보내지 않는다 */
eq([body({ ...BASE, relationship: '배우자', marriageDed: 'yes' }).marriage_deduction, body({ ...BASE, relationship: '기타친족', childbirthDed: 'yes' }).childbirth_deduction], [false, false], '혼인·출산공제 — 직계존속이 아니면 false');

// ───────────────────────── gift_history ─────────────────────────
console.log('════ gift_history ════');
{
  const P = { ...BASE, priorGiftHas: 'yes', priorGiftValue: '100000000' };
  const noDed = body(P);
  eq(noDed.gift_history, [{ value: 100000000, is_generation_skip: false, donor_child_deceased: false }], '공제액 입력란이 비면 공제 키를 하나도 보내지 않는다(합계 1건)');
  ok(!('deduction_used' in noDed.gift_history[0]) && !('total_deduction_used' in noDed.gift_history[0]) && !('is_minor' in noDed.gift_history[0]), '공제 키·is_minor(나이 미응답) 모두 없다');
  for (const blank of ['', undefined, null, '   ']) ok(!('total_deduction_used' in body({ ...P, priorGiftDed: blank }).gift_history[0]), '공제액 입력란 비어 있음(' + JSON.stringify(blank) + ') → 키 생략');
  const given = body({ ...P, priorGiftDed: '50000000' }).gift_history[0];
  eq(given.total_deduction_used, 50000000, '입력한 공제액 → total_deduction_used');
  ok(!('deduction_used' in given), 'deduction_used 는 함께 보내지 않는다(둘 다 보내면 엔진이 거부)');
  eq(body({ ...P, priorGiftDed: '0' }).gift_history[0].total_deduction_used, 0, '0 을 명시 입력하면 0 을 보낸다(존중)');
  const skip = body({ ...P, genSkip: 'yes', childDeceased: 'no' });
  eq([skip.gift_history[0].is_generation_skip, skip.gift_history[0].donor_child_deceased], [true, false], '세대생략이면 이력 항목도 세대생략(같은 증여자)');
  const skipDead = body({ ...P, genSkip: 'yes', childDeceased: 'yes' });
  eq([skipDead.gift_history[0].is_generation_skip, skipDead.gift_history[0].donor_child_deceased], [true, true], '대습이면 이력 항목도 donor_child_deceased true');
  const skipNo = body({ ...P, genSkip: 'no', childDeceased: 'yes' });
  eq([skipNo.gift_history[0].is_generation_skip, skipNo.gift_history[0].donor_child_deceased], [false, false], '세대생략 no 면 이력 항목 둘 다 false');
  // 지금 19세 미만이면 사전증여 당시에도 미성년 — 항목에 is_minor:true (성년·나이 미응답이면 키 없음)
  const minorSkip = body({ ...P, doneeAge: '18', genSkip: 'yes', childDeceased: 'no' });
  eq(minorSkip.gift_history[0], { value: 100000000, is_generation_skip: true, is_minor: true, donor_child_deceased: false }, '18세 + 세대생략 + 사전증여 → 항목 is_minor:true');
  ok(!('is_minor' in minorSkip), '최상위에는 여전히 is_minor 를 보내지 않는다(엔진이 나이로 판정)');
  eq(body({ ...P, doneeAge: '30', genSkip: 'yes', childDeceased: 'no' }).gift_history[0], { value: 100000000, is_generation_skip: true, donor_child_deceased: false }, '30세 → 항목에 is_minor 키 없음');
  ok(!('is_minor' in body({ ...P, genSkip: 'yes' }).gift_history[0]), '나이 미응답 → 항목에 is_minor 키 없음');
  ok(body({ ...P, doneeAge: '18' }).gift_history[0].is_minor === true, '세대생략 문항에 답하지 않아도 18세면 is_minor:true');
  ok(!('is_minor' in body({ ...P, doneeAge: '19' }).gift_history[0]), '19세(성년 경계) → 키 없음');
  ok(!('is_minor' in body({ ...P, relationship: '배우자', doneeAge: '15' }).gift_history[0]), '나이 문항이 안 보이는 관계 → 낡은 나이 답으로 is_minor 를 만들지 않는다');
  ok(!('gift_history' in body({ ...BASE, priorGiftHas: 'no', priorGiftValue: '100000000' })), '사전증여 없음 → 이력 없음');
  ok(!('gift_history' in body({ ...BASE, priorGiftHas: 'yes', priorGiftValue: '0' })), '사전증여 금액 0 → 이력 없음');
  ok(!('gift_history' in body({ ...BASE, priorGiftHas: 'yes' })), '사전증여 금액 미입력 → 이력 없음');
}

// ───────────────────────── 엔진 응답 판정 ─────────────────────────
console.log('════ giftEngineVerdict — 세 갈래 ════');
const OKCALC = { 과세표준: 450000000, 산출세액: 85000000, 세액: 82450000, 신고세액공제: 2550000, 세대생략할증: 0, 비과세여부: false,
  주요공제: { 증여재산가액: 500000000, 납부세액공제: 0 }, 단계별계산: [{ 항목: '과세표준', 금액: 450000000 }], 경고사항: [] };
const V = (c) => F.giftEngineVerdict(c);
eq(V({ ...OKCALC, 상태: 'ok' }), 'ok', '상태 ok → ok');
eq(V({ ...OKCALC }), 'ok', '상태 키가 없는 구 엔진 응답(오류 없음 + 필수 키 유효) → ok');
eq(V({ ...OKCALC, 과세표준: 0, 산출세액: 0, 세액: 0, 신고세액공제: 0, 세대생략할증: 0 }), 'ok', '정상 0원 → ok');
eq(V({ 과세표준: 1, 산출세액: 1, 세액: 1 }), 'down', '신고세액공제·세대생략할증 키가 없는 응답 → down(없는 값을 0원으로 메우지 않는다)');
for (const st of ['needs_input', 'unsupported', '', null, 'OK', true]) eq(V({ ...OKCALC, 상태: st }), 'refused', '상태 ' + String(st) + ' → refused(금액이 아니다)');
eq(V({ ...OKCALC, 상태: 'needs_input' }), 'refused', '상태 needs_input → refused(입력 부족 — 거부)');
eq(V({ ...OKCALC, 상태: 'error' }), 'down', '상태 error → down(엔진 내부 실패 — 다시 시도)');
eq(V({ ...OKCALC, 상태: 'error', 오류: '내부 오류' }), 'down', '상태 error + 오류 → down(상태 키가 먼저다)');
eq(V({ ...OKCALC, 상태: 'unsupported', 오류: '지원 안 함' }), 'refused', '상태 unsupported + 오류 → refused');
eq(V({ ...OKCALC, 상태: 'needs_input', 오류: '관계를 알 수 없습니다' }), 'refused', 'needs_input + 오류 → refused');
eq(V({ ...OKCALC, 오류: '계산 실패' }), 'refused', '오류 키 → refused');
eq(V({ ...OKCALC, 상태: 'ok', 오류: '계산 실패' }), 'refused', '상태가 ok 여도 오류가 있으면 refused');
eq(V({ ...OKCALC, error: 'unsupported' }), 'refused', '영문 error → refused');
eq(V({ ...OKCALC, errors: ['x'] }), 'refused', 'errors → refused');
eq(V({ ...OKCALC, detail: 'x' }), 'refused', 'detail → refused');
eq(V({ ...OKCALC, success: false }), 'refused', 'success:false → refused');
for (const k of ['과세표준', '산출세액', '세액', '신고세액공제', '세대생략할증']) {
  const c = { ...OKCALC }; delete c[k];
  eq(V(c), 'down', '필수 키 누락(' + k + ') → down');
  eq(V({ ...OKCALC, [k]: NaN }), 'down', '필수 키 NaN(' + k + ') → down');
  eq(V({ ...OKCALC, [k]: '0' }), 'down', '필수 키 문자열(' + k + ') → down');
  eq(V({ ...OKCALC, [k]: -1 }), 'down', '필수 키 음수(' + k + ') → down');
}
for (const c of [null, undefined, {}, [], 'x', 3]) eq(V(c), 'down', '깨진 calc ' + JSON.stringify(c) + ' → down');

// ───────────────────────── giftCalcFromEngine ─────────────────────────
console.log('════ giftCalcFromEngine — 엔진 값을 그대로 옮긴다 ════');
{
  const calc = plain(F.giftCalcFromEngine({ calc: { ...OKCALC, 상태: 'ok', 세대생략할증: 12000000, 비과세여부: false,
    주요공제: { 증여재산가액: 500000000, 납부세액공제: 4850000, 증여재산공제: 50000000, 혼인출산공제: 0, 가산한사전증여: 0, 채무공제: 0 },
    경고사항: ['[확인 필요] 세대생략 여부를 알 수 없어 «아님»으로 가정했습니다.'] }, version: { engine: 'e1' } }, 1));
  eq(calc, {
    precise: true, engineVer: 'e1', taxBase: 450000000, calcTax: 85000000, genSkipSurcharge: 12000000, filingCredit: 2550000, totalTax: 82450000,
    giftValue: 500000000, giftCredit: 4850000, nonTaxableMsg: null, steps: [{ 항목: '과세표준', 금액: 450000000 }],
    engineWarnings: ['[확인 필요] 세대생략 여부를 알 수 없어 «아님»으로 가정했습니다.'],
  }, '유효 응답 → 금액 필드 전체(엔진 값 그대로)');
  const bare = plain(F.giftCalcFromEngine({ calc: { 과세표준: 0, 산출세액: 0, 세액: 0, 신고세액공제: 0, 세대생략할증: 0, 비과세여부: true } }, 30000000));
  eq([bare.precise, bare.totalTax, bare.genSkipSurcharge, bare.filingCredit, bare.giftCredit, bare.giftValue, bare.steps, bare.engineWarnings],
    [true, 0, 0, 0, 0, 30000000, [], []], '선택 키(납부세액공제·단계·경고)가 없으면 0·빈 목록, 증여재산가액은 입력 금액으로 대신한다');
  const noCredit = plain(F.giftCalcFromEngine({ calc: { 과세표준: 1, 산출세액: 1, 세액: 1 } }, 1));
  eq([noCredit.precise, noCredit.engineState, 'filingCredit' in noCredit, 'genSkipSurcharge' in noCredit], [false, 'down', false, false], '신고세액공제·세대생략할증이 없으면 0 으로 메우지 않고 연결 실패(down)');
  eq(bare.nonTaxableMsg, '증여재산공제 범위 내로 납부할 증여세가 없습니다(과세최저한).', '비과세여부 → 안내 문구');
  for (const c of [{ ...OKCALC, 상태: 'needs_input', 오류: '입력 부족' }, { ...OKCALC, 상태: 'unsupported' }, { ...OKCALC, 오류: 'x' }]) {
    const r = plain(F.giftCalcFromEngine({ calc: c }, 1));
    eq([r.precise, r.engineState, 'totalTax' in r, 'taxBase' in r, 'giftValue' in r], [false, 'refused', false, false, false], '거부 응답에는 금액 필드가 없다');
  }
  for (const ej of [null, undefined, {}, { calc: {} }, { calc: { ...OKCALC, 세액: NaN } }]) {
    const r = plain(F.giftCalcFromEngine(ej, 1));
    eq([r.precise, r.engineState, 'totalTax' in r], [false, 'down', false], '깨진 응답 → down, 금액 필드 없음: ' + JSON.stringify(ej));
  }
}

// ───────────────────────── 차단 판정과의 연결 ─────────────────────────
console.log('════ 엔진 값 → 차단 판정 ════');
{
  const RES = { isResident: 'yes' };
  eq(F.giftFallbackGaps(RES, F.giftCalcFromEngine({ calc: OKCALC }, 1)).length, 0, '엔진 값이 있으면 차단하지 않는다');
  eq(F.giftFallbackGaps(RES, F.giftCalcFromEngine({ calc: { ...OKCALC, 상태: 'unsupported' } }, 1)).length, 1, '거부 → 사유 1건');
  eq(F.giftFallbackGaps(RES, F.giftCalcFromEngine(null, 1)).length, 1, '연결 실패 → 사유 1건');
}

// ───────────────────────── 호출 → 판정 (fetch 대역) ─────────────────────────
console.log('════ 엔진 호출 → 판정 세 갈래 (fetch 대역) ════');
(async () => {
  /* runAnalysis 가 하는 일과 같은 두 줄 — 호출 → 판독, 던지면 분류 */
  async function judge(env, answers) {
    try { return plain(env.giftCalcFromEngine(await env.callGiftEngine(env.mapAnswersToGift(answers), '/v1/calc/gift'), 1)); }
    catch (e) { return plain(env.giftCalcFromEngineError(e)); }
  }
  const resp = (status, json) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => json });
  const A = { ...BASE, genSkip: 'no' };

  const sent = [];
  const okEnv = makeEnv(async (url, init) => { sent.push({ url, init }); return { ok: true, status: 200, json: async () => ({ calc: { ...OKCALC, 상태: 'ok' }, version: { engine: 'e1' } }) }; });
  const r1 = await judge(okEnv, A);
  eq([r1.precise, r1.totalTax, r1.engineVer], [true, 82450000, 'e1'], '200 + 상태 ok → 금액');
  eq(sent[0].url, 'https://engine.test/v1/calc/gift', '요청은 POST /v1/calc/gift');
  eq(sent[0].init.method, 'POST', 'POST');
  eq(JSON.parse(sent[0].init.body), { value: 100000000, relationship: '직계존속', is_generation_skip: false, marriage_deduction: false, childbirth_deduction: false }, '요청 본문(모르는 사실은 키 없음)');

  eq((await judge(makeEnv(resp(200, { calc: { ...OKCALC } })), A)).precise, true, '200 + 상태 없음(구 엔진) → 금액');
  for (const c of [{ ...OKCALC, 상태: 'unsupported', 오류: '지원하지 않는 유형', 세액: 0 }, { ...OKCALC, 상태: 'needs_input', 오류: '입력 부족' }, { ...OKCALC, 오류: '계산 실패' }, ]) {
    const r = await judge(makeEnv(resp(200, { calc: c })), A);
    eq([r.precise, r.engineState, 'totalTax' in r], [false, 'refused', false], '200 인데 거부 응답 → refused, 금액 없음: ' + (c.상태 || '오류'));
  }
  {
    const r = await judge(makeEnv(resp(200, { calc: { ...OKCALC, 상태: 'error' } })), A);
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
  for (const name of ['calcGiftBaseTax', 'GIFT_BRACKETS', 'giftDeduction', 'priorGiftDeductionUsed']) {
    ok(!code.includes(name), '소스에 ' + name + ' 가 남아 있지 않다');
  }
  ok(!/간이 추정|정밀 엔진 연결이 지연되어/.test(code), '「간이 추정」 배너·문구가 소스에 없다');
  ok(!/0\.03|\* 0\.1|Math\.round\(baseTax/.test(code), '화면이 세율·신고세액공제율을 곱하는 식이 없다');
  ok(!/is_minor\s*:/.test(code.slice(code.indexOf('function mapAnswersToGift('), code.indexOf('function mapAnswersToBurdenedGift('))), 'mapAnswersToGift 는 is_minor 를 만들지 않는다');
  ok(!/\|\|\s*30\b/.test(code.slice(code.indexOf('function mapAnswersToGift('), code.indexOf('function mapAnswersToBurdenedGift('))), 'mapAnswersToGift 에 나이 30 기본값이 없다');

  console.log(`\nOK gift request: ${checks} checks`);
})().catch((e) => { console.error(e); process.exit(1); });

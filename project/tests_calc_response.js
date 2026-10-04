/* Execute the real response-acceptance expressions: malformed responses must never
   become precise results, while valid zero-tax/refund results remain usable. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const parser = require('@babel/parser');
const assert = require('node:assert/strict');
const read = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const common = read('Report.jsx');
const helper = common.match(/window\.jtValidCalc = function[\s\S]*?\n  };/)[0];
const context = { window: {} };
vm.runInNewContext(helper, context);
const valid = context.window.jtValidCalc;
let checks = 0;
function check(actual, expected, label) { assert.equal(!!actual, expected, label); checks++; }
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(n => walk(n, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
/* 취득세(261004): 응답 검증이 runAnalysis 의 `if (jtValidCalc…) { calc.precise = true }` 가 아니라
   «엔진 결과 → calc 분류 함수» acqCalcFromEngine 안으로 옮겨졌다. 같은 계약(정상 0원 허용·오류/불완전 거부)을
   그 함수의 결과(precise)로 본다. 이 함수는 상태 'ok' 도 요구하므로, 공용 fixture 에는 상태 'ok' 를 덧붙여 부른다
   (상태 자체의 요구는 아래 «취득세 상태 키» 에서 따로 확인한다). */
function engineAccepts(file, fnNames, constName, withStatus) {
  const source = read(file);
  const ast = parser.parse(source, { sourceType: 'script', plugins: ['jsx'] });
  const chunks = [];
  for (const n of ast.program.body) {
    if (n.type === 'FunctionDeclaration' && fnNames.includes(n.id.name)) chunks.push(source.slice(n.start, n.end));
    if (n.type === 'VariableDeclaration' && n.declarations.some(d => d.id.name === constName)) chunks.push(source.slice(n.start, n.end));
  }
  assert.equal(chunks.length, fnNames.length + 1, file + ': ' + fnNames.join('·') + ' 과 ' + constName + ' 를 찾지 못했습니다');
  const run = vm.runInNewContext(chunks.join('\n') + '\n' + fnNames[fnNames.length - 1], { window: { jtValidCalc: valid }, Number, Object });
  const isObj = c => c && typeof c === 'object' && !Array.isArray(c);
  /* withStatus: 공용 fixture 에 상태 'ok' 를 덧붙여 부른다(상태를 요구하는 함수용). 아니면 fixture 그대로(구 엔진 = 상태 키 없음). */
  const accepts = env => run({ calc: (withStatus && isObj(env.c)) ? { 상태: 'ok', ...env.c } : env.c }).precise === true;
  accepts.raw = c => run(c);
  return accepts;
}
const acquisitionAccepts = () => engineAccepts('ReportAcquisition.jsx', ['acqCalcFromEngine'], 'ACQ_ENGINE_REQUIRED', true);
/* 양도세(261004): 응답 검증이 cgtCalcFromEngine(cgtEngineVerdict 포함)으로 옮겨졌다. 구 엔진은 상태 키가 없으므로 fixture 를 그대로 부른다. */
const transferAccepts = () => engineAccepts('ReportCGT.jsx', ['cgtEngineVerdict', 'cgtCalcFromEngine'], 'CGT_ENGINE_REQUIRED', false);
/* 증여세(261004): 일반증여의 응답 검증이 giftCalcFromEngine(giftEngineVerdict 포함)으로 옮겨졌다. 부담부증여는 종전 if 문 검증이 남아 있어 둘 다 본다. */
const giftAccepts = () => engineAccepts('ReportGift.jsx', ['giftEngineVerdict', 'giftCalcFromEngine'], 'GIFT_ENGINE_REQUIRED', false);
function guards(file) {
  if (file === 'ReportAcquisition.jsx') return [acquisitionAccepts()];
  if (file === 'ReportCGT.jsx') return [transferAccepts()];
  const source = read(file), found = [];
  walk(parser.parse(source, { sourceType: 'script', plugins: ['jsx'] }), node => {
    if (node.type !== 'IfStatement') return;
    const test = source.slice(node.test.start, node.test.end);
    const body = source.slice(node.consequent.start, node.consequent.end);
    if (test.includes('jtValidCalc') && /calc\.precise\s*=\s*true/.test(body)) {
      found.push(env => vm.runInNewContext(test, { window: { jtValidCalc: valid }, ...env }));
    }
  });
  assert.ok(found.length, file + ' must validate before setting precise');
  if (file === 'ReportGift.jsx') found.push(giftAccepts());
  return found;
}
const zero = keys => Object.fromEntries(keys.map(k => [k, 0]));
const cases = [
  ['ReportCGT.jsx', zero(['과세표준', '세액', '지방소득세', '총세부담', '장기보유특별공제', '기본공제', '양도차익'])],
  ['ReportAcquisition.jsx', zero(['세액', '취득세', '지방교육세', '농어촌특별세', '과세표준'])],
  ['ReportProperty.jsx', zero(['세액', '재산세본세', '지방교육세', '도시지역분', '소방분', '과세표준'])],
  ['ReportComprehensive.jsx', { ...zero(['세액', '종부세합계', '농어촌특별세']), 주택분: zero(['과세표준', '세액', '순세액']) }],
  ['ReportGift.jsx', zero(['과세표준', '산출세액', '세액', '신고세액공제', '세대생략할증', '총세부담', '증여세', '양도세', '취득세'])],
  ['ReportInheritance.jsx', zero(['과세표준', '산출세액', '세액'])],
  ['ReportIncome.jsx', zero(['과세표준', '산출세액', '결정세액', '지방소득세', '총세부담'])],
  ['ReportInsurance.jsx', zero(['결정세액', '지방소득세'])],
  ['ReportVat.jsx', { 납부세액: 0, 환급세액: 0, 비과세여부: false, 환급여부: false }],
];
for (const [file, fixture] of cases) {
  for (const accepts of guards(file)) {
    check(accepts({ c: fixture }), true, file + ': legitimate zero');
    for (const c of [null, {}, [], { 오류: '계산 실패' }, { ...fixture, 오류: '계산 실패' }, { ...fixture, success: false }]) {
      check(accepts({ c }), false, file + ': error/incomplete');
    }
    // Each predicate may require a subset (gift and burdened gift share a file).
    for (const [key, value] of Object.entries(fixture)) {
      if (typeof value !== 'number') continue;
      const missing = { ...fixture }; delete missing[key];
      if (accepts({ c: missing })) continue;
      for (const bad of [null, undefined, NaN, Infinity, -1, '0', false]) {
        if (key === '양도차익' && bad === -1) continue; // a real sale loss is valid
        check(accepts({ c: { ...fixture, [key]: bad } }), false, file + ': ' + key + ' invalid');
      }
    }
  }
}
/* 취득세 상태 키(261004): 엔진 응답 calc.상태 가 'ok' 가 아니면 금액이 있어도 «금액이 아니다» — 거부로 분류한다.
   (needs_input·unsupported·error 는 오류 사유가 따라오는 «금액 아님» 응답이다.) */
{
  const acq = guards('ReportAcquisition.jsx')[0], fx = cases[1][1];
  const rawCalc = c => acq.raw({ calc: c });
  check(rawCalc({ ...fx, 상태: 'ok' }).precise, true, 'acquisition: 상태 ok 는 유효');
  for (const status of ['needs_input', 'unsupported', 'error', '', null, undefined, 'OK', true]) {
    const r = rawCalc({ ...fx, 상태: status });
    check(r.precise, false, 'acquisition: 상태 ' + String(status) + ' 는 금액이 아니다');
    assert.equal(r.engineState, 'refused', 'acquisition: 상태 ' + String(status) + ' → refused'); checks++;
    assert.equal('totalTax' in r, false, 'acquisition: 거부 응답에는 금액 필드가 없다'); checks++;
  }
  const bad = rawCalc({ 상태: 'ok', 세액: NaN, 취득세: 0, 지방교육세: 0, 농어촌특별세: 0, 과세표준: 0 });
  assert.deepEqual([bad.precise, bad.engineState], [false, 'down']); checks++;
}
/* 양도세 상태 키·세 갈래(261004) — 취득세와 같은 계약이다.
     · 오류 없음 + 상태 'ok' 또는 상태 키 없음(구 엔진) + 필수 숫자 유효 → 금액(precise)
     · 오류가 있거나 상태 키가 있는데 'ok' 가 아님 → 거부(refused), 금액 필드 없음
     · calc 없음·깨진 응답·숫자 무효 → 연결 실패(down)
   호출이 던진 예외: HTTP 4xx(408·429 제외) → refused, 그 밖(네트워크·시간 초과·5xx·408·429) → down */
{
  const tr = guards('ReportCGT.jsx')[0], fx = cases[0][1];
  const rawCalc = c => tr.raw({ calc: c });
  check(rawCalc({ ...fx, 상태: 'ok' }).precise, true, 'transfer: 상태 ok 는 유효');
  check(rawCalc({ ...fx }).precise, true, 'transfer: 상태 키가 없는 구 엔진 응답은 유효');
  check(rawCalc({ ...fx, 양도차익: -100000000 }).precise, true, 'transfer: 양도차손은 유효');
  for (const status of ['needs_input', 'unsupported', 'error', '', null, 'OK', true]) {
    const r = rawCalc({ ...fx, 상태: status });
    check(r.precise, false, 'transfer: 상태 ' + String(status) + ' 는 금액이 아니다');
    assert.equal(r.engineState, 'refused', 'transfer: 상태 ' + String(status) + ' → refused'); checks++;
    assert.equal('totalTax' in r, false, 'transfer: 거부 응답에는 금액 필드가 없다'); checks++;
  }
  for (const c of [{ ...fx, 오류: '계산할 수 없습니다' }, { ...fx, 상태: 'ok', 오류: '계산할 수 없습니다' }, { ...fx, 상태: 'error', 오류: 'x', 세액: 0 }]) {
    const r = rawCalc(c);
    assert.deepEqual([r.precise, r.engineState, 'totalTax' in r], [false, 'refused', false], 'transfer: 오류가 있으면 거부'); checks++;
  }
  for (const c of [null, undefined, {}, [], 'x', { ...fx, 총세부담: NaN }, { ...fx, 양도차익: Infinity }, { ...fx, 세액: '0' }]) {
    const r = rawCalc(c);
    assert.deepEqual([r.precise, r.engineState, 'totalTax' in r], [false, 'down', false], 'transfer: 깨진 응답은 연결 실패 ' + JSON.stringify(c)); checks++;
  }
  assert.deepEqual(JSON.parse(JSON.stringify(tr.raw(null))), { precise: false, engineState: 'down' }); checks++;
  // 유효 응답이 엔진 값을 그대로 담는지(자체 계산 없이)
  const good = rawCalc({ ...fx, 양도차익: 500000000, 과세표준: 400000000, 세액: 150000000, 지방소득세: 15000000, 총세부담: 165000000, 장기보유특별공제: 100000000, 기본공제: 2500000, 비과세여부: false, 장특공제율: { 합계: '20.0%' } });
  assert.deepEqual([good.totalTax, good.baseTax, good.localTax, good.taxBase, good.ltDeduction, good.ltRate, good.capGain], [165000000, 150000000, 15000000, 400000000, 100000000, 0.2, 500000000]); checks++;
  assert.equal(good.nonTaxableMsg, null); checks++;
  const exempt = rawCalc({ ...fx, 비과세여부: true, 비과세사유: '1세대 1주택 비과세' });
  assert.equal(exempt.exempt, true); assert.match(exempt.nonTaxableMsg, /전액 비과세/); checks += 2;
  assert.equal(rawCalc({ ...fx, 장특공제율: undefined }).ltRate, null, 'transfer: 장특공제율 키가 없으면 비율을 말하지 않는다'); checks++;

  // 호출이 던진 예외의 분류
  const errRun = (() => {
    const source = read('ReportCGT.jsx');
    const ast = parser.parse(source, { sourceType: 'script', plugins: ['jsx'] });
    const n = ast.program.body.find(x => x.type === 'FunctionDeclaration' && x.id.name === 'cgtCalcFromEngineError');
    assert.ok(n, 'cgtCalcFromEngineError 를 찾지 못했습니다');
    return vm.runInNewContext(source.slice(n.start, n.end) + '\ncgtCalcFromEngineError', {});
  })();
  const st = status => Object.assign(new Error('engine ' + status), { status });
  for (const s of [400, 404, 409, 422, 499]) assert.equal(errRun(st(s)).engineState, 'refused', 'HTTP ' + s + ' → refused'); checks += 5;
  for (const s of [408, 429, 500, 502, 503, 504]) assert.equal(errRun(st(s)).engineState, 'down', 'HTTP ' + s + ' → down'); checks += 6;
  for (const e of [new TypeError('Failed to fetch'), Object.assign(new Error('aborted'), { name: 'AbortError' }), new SyntaxError('Unexpected token'), undefined, null]) {
    assert.deepEqual(JSON.parse(JSON.stringify(errRun(e))), { precise: false, engineState: 'down' }, '네트워크·시간 초과·깨진 본문 → down'); checks++;
  }
  // 보조 호출(시나리오·처분순서)도 같은 판정만 통과시킨다 — 상태가 'ok' 가 아닌 «세액 0» 이 비과세 시나리오로 둔갑하면 안 된다
  const accepted = (() => {
    const source = read('ReportCGT.jsx');
    const ast = parser.parse(source, { sourceType: 'script', plugins: ['jsx'] });
    const chunks = ast.program.body.filter(x => (x.type === 'FunctionDeclaration' && ['cgtEngineVerdict', 'cgtAcceptedCalc'].includes(x.id.name))
      || (x.type === 'VariableDeclaration' && x.declarations.some(d => d.id.name === 'CGT_ENGINE_REQUIRED'))).map(x => source.slice(x.start, x.end));
    return vm.runInNewContext(chunks.join('\n') + '\ncgtAcceptedCalc', { window: { jtValidCalc: valid }, Number, Object });
  })();
  assert.notEqual(accepted({ calc: { ...fx, 상태: 'ok' } }), null); checks++;
  for (const c of [{ ...fx, 상태: 'needs_input', 오류: '입력 부족' }, { ...fx, 상태: 'unsupported' }, { ...fx, 오류: 'x' }, null, {}]) {
    assert.equal(accepted({ calc: c }), null, '보조 호출: 금액이 아닌 응답은 표시하지 않는다'); checks++;
  }
  assert.equal(accepted(null), null); checks++;

  // 화면 배선 — 차단 화면의 사유가 엔진 상태에서 나오고, 금액 필드가 없는 calc 로는 세 갈래만 있다
  const cgtSrc = read('ReportCGT.jsx');
  assert.match(cgtSrc, /calc\.engineState === 'refused' \? 'refused' : 'down'/); checks++;
  assert.match(cgtSrc, /<JTFallbackBlocked gaps=\{cgtBlockReason === 'input' \? cgtGaps : \[\]\}/); checks++;
  assert.match(cgtSrc, /reason=\{cgtBlockReason\} \/>/); checks++;
  assert.match(cgtSrc, /cgtCalcFromEngine\(await callTransferEngine\(answers\)\)/); checks++;
  assert.match(cgtSrc, /cgtCalcFromEngineError\(engErr\)/); checks++;
}
const corporate = guards('ReportCorporate.jsx')[0];
check(guards('ReportCGT.jsx')[0]({ c: { ...cases[0][1], 양도차익: -100000000 } }), true, 'legitimate capital loss');
const corpEnv = { pc: { 총세부담: 0 }, cc: { 총납부세액: 0 }, sc: { 총세부담: 0 }, salary: 10000000 };
check(corporate(corpEnv), true, 'valid zero salary tax');
for (const sc of [null, {}, { 오류: '실패', 총세부담: 0 }, { 총세부담: '0' }]) {
  check(corporate({ ...corpEnv, sc }), false, 'salary result must be valid');
}
check(corporate({ ...corpEnv, salary: 0, sc: null }), true, 'no salary means no salary request required');
const vat = guards('ReportVat.jsx')[0];
check(vat({ c: { 납부세액: 0, 환급세액: 1000000, 비과세여부: false, 환급여부: true, 세액: -1000000 } }), true, 'legitimate VAT refund');
const comp = guards('ReportComprehensive.jsx')[0];
check(comp({ c: { ...cases[3][1], 주택분: {} } }), false, 'missing housing subtotal');
const optimizer = guards('ReportBurdenedOptimize.jsx')[0];
const opt = { 채무없는경우세액: 1000, 최적총세부담: 800, 최적채무비율: .5, 절세액: 200,
  시뮬레이션결과: [{ 채무비율: .5, 채무액: 5000, 증여세: 400, 양도세: 100, 취득세: 300, 총세부담: 800 }] };
check(optimizer({ c: opt }), true, 'complete optimization');
check(optimizer({ c: { ...opt, 시뮬레이션결과: [{}] } }), false, 'incomplete optimization point');
check(optimizer({ c: { ...opt, 오류: '실패' } }), false, 'optimization error');
// An ordinary domestic fund must not silently acquire the dividend gross-up.
const incomeSrc = read('ReportIncome.jsx');
const grossupExpr = incomeSrc.match(/is_dividend_grossup:\s*([^,\n]+)/)[1];
for (const [dividendType, expected] of [['domestic', true], ['domestic_other', false], ['foreign', false]]) {
  check(vm.runInNewContext(grossupExpr, { dividend: 30000000, answers: { dividendType } }), expected, 'dividend classification ' + dividendType);
}
const gapMatch = incomeSrc.match(/function incFallbackGaps[\s\S]*?\n}\r?\n/)[0];
const gapCtx = { window: { jtFallbackGaps: rows => rows.filter(r => r.when).map(r => r.why) } };
vm.runInNewContext(gapMatch, gapCtx);
check(gapCtx.incFallbackGaps({ dividendIncome: '30000000', dividendType: 'mixed_grossup' }, {}).length, true, 'mixed eligible dividends need allocation');
check(gapCtx.incFallbackGaps({ dividendIncome: '30000000', dividendType: 'domestic_other' }, {}).length, false, 'known ineligible domestic dividends supported');
assert.match(incomeSrc, /tax_year:\s*2026/);
assert.doesNotMatch(incomeSrc, /작년 사업|작년 국민연금|국내 주식·펀드/);
const youthSrc = read('ReportYouthStartup.jsx');
let rejectYouth;
walk(parser.parse(youthSrc, { plugins: ['jsx'] }), node => {
  if (node.type === 'IfStatement' && youthSrc.slice(node.test.start,node.test.end).includes('jtValidCalc(calc')) {
    const expression = youthSrc.slice(node.test.start,node.test.end);
    rejectYouth = calc => vm.runInNewContext(expression, { calc, window: { jtValidCalc: valid } });
  }
});
assert.ok(rejectYouth);
const youth = { status: 'eligible', eligible: true, reduction_rate: 100, gates: [] };
for (const calc of [null, {}, { 오류: '실패' }, { ...youth, reduction_rate: Infinity }, { ...youth, reduction_rate: 101 }, { ...youth, status: 'unknown' }, { ...youth, gates: null }]) {
  check(rejectYouth(calc), true, 'invalid youth response');
}
for (const status of ['eligible', 'conditional', 'ineligible']) {
  check(rejectYouth({ ...youth, status, eligible: status === 'eligible', reduction_rate: 0 }), false, 'valid youth zero ' + status);
}
const compareSrc = read('ReportCompare.jsx');
const compareExpr = compareSrc.match(/const allValid = ([\s\S]*?);\r?\n/)[1];
const compareFixture = { 시나리오별: Object.fromEntries(['증여','매매','상속'].map(k => [k, { 총세부담: 100, 증여세: 40, 양도세: 0, 상속세: 0, 취득세: 60 }])) };
const acceptCompare = c => vm.runInNewContext(compareExpr, { c, scv: c && c['시나리오별'], window: { jtValidCalc: valid } });
check(acceptCompare(compareFixture), true, 'valid three-way comparison');
check(acceptCompare({ ...compareFixture, 오류: '일부 실패' }), false, 'outer comparison failure');
for (const key of ['증여','매매','상속']) {
  check(acceptCompare({ 시나리오별: { ...compareFixture['시나리오별'], [key]: { ...compareFixture['시나리오별'][key], 총세부담: Infinity } } }), false, 'comparison nonfinite ' + key);
}
console.log(`OK calc response: ${checks} checks across 13 calculators (gift includes burdened-gift; transfer·acquisition: 엔진 상태 키·세 갈래)`);

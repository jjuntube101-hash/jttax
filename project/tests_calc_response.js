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
function acquisitionAccepts() {
  const source = read('ReportAcquisition.jsx');
  const ast = parser.parse(source, { sourceType: 'script', plugins: ['jsx'] });
  const chunks = [];
  for (const n of ast.program.body) {
    if (n.type === 'FunctionDeclaration' && n.id.name === 'acqCalcFromEngine') chunks.push(source.slice(n.start, n.end));
    if (n.type === 'VariableDeclaration' && n.declarations.some(d => d.id.name === 'ACQ_ENGINE_REQUIRED')) chunks.push(source.slice(n.start, n.end));
  }
  assert.equal(chunks.length, 2, 'acqCalcFromEngine 과 ACQ_ENGINE_REQUIRED 를 찾지 못했습니다');
  const run = vm.runInNewContext(chunks.join('\n') + '\nacqCalcFromEngine', { window: { jtValidCalc: valid } });
  const isObj = c => c && typeof c === 'object' && !Array.isArray(c);
  const accepts = env => run({ calc: isObj(env.c) ? { 상태: 'ok', ...env.c } : env.c }).precise === true;
  accepts.raw = c => run(c);
  return accepts;
}
function guards(file) {
  if (file === 'ReportAcquisition.jsx') return [acquisitionAccepts()];
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
  return found;
}
const zero = keys => Object.fromEntries(keys.map(k => [k, 0]));
const cases = [
  ['ReportCGT.jsx', zero(['과세표준', '세액', '지방소득세', '총세부담', '장기보유특별공제', '기본공제', '양도차익'])],
  ['ReportAcquisition.jsx', zero(['세액', '취득세', '지방교육세', '농어촌특별세', '과세표준'])],
  ['ReportProperty.jsx', zero(['세액', '재산세본세', '지방교육세', '도시지역분', '소방분', '과세표준'])],
  ['ReportComprehensive.jsx', { ...zero(['세액', '종부세합계', '농어촌특별세']), 주택분: zero(['과세표준', '세액', '순세액']) }],
  ['ReportGift.jsx', zero(['과세표준', '산출세액', '세액', '총세부담', '증여세', '양도세', '취득세'])],
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
console.log(`OK calc response: ${checks} checks across 13 calculators (gift includes burdened-gift)`);

/* Official 4insure calculator observations (2026-09-27), plus NHIS 2026
   monthly premium limits. https://www.4insure.or.kr/pbiz/ntcn/inscSmlCalcView.do
   NHIS notice 2025-222: https://www.nhis.or.kr/lm/lmxsrv/law/lawFullContent.do?SEQ=39
   Upper limit follows the notice, not 4insure's rounded salary-derived limit. */
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const parser = require('@babel/parser');
const src = fs.readFileSync(__dirname + '/src/ReportInsurance.jsx', 'utf8');
const ast = parser.parse(src, { plugins: ['jsx'] });
const names = ['INS_RATES_2026', 'floorWon', 'calcInsurance'];
const nodes = ast.program.body.filter(n => names.includes(n.id?.name || n.declarations?.[0]?.id?.name));
assert.equal(nodes.length, 3);
const ctx = {};
vm.runInNewContext(nodes.map(n => src.slice(n.start, n.end)).join('\n') + '\nthis.calc = calcInsurance;', ctx);
const cases = [
  [0, [0, 0, 0, 0]],
  [100000, [19470, 10080, 1320, 900]],
  [2000000, [95000, 71900, 9440, 18000]],
  [3001000, [142540, 107880, 14170, 27000]],
  [3500000, [166250, 125820, 16530, 31500]],
  [6590000, [313020, 236910, 31130, 59310]],
  // Combined health premium ceiling 9,183,480 / 2 = 4,591,740.
  [200000000, [313020, 4591740, 603370, 1800000]],
];
for (const [salary, expected] of cases) {
  const got = ctx.calc(salary, new Date(2026, 8, 1));
  assert.deepEqual(['pension','health','longTerm','employment'].map(k => got[k]), expected, 'salary ' + salary);
  assert.equal(got.total, expected.reduce((a,b) => a+b, 0));
}
for (const salary of [409999, 410000, 410001, 6589999, 6590000, 6590001, 900000000]) {
  const got = ctx.calc(salary, new Date(2026, 8, 1));
  for (const k of ['pension','health','longTerm','employment']) assert.equal(got[k] % 10, 0);
  assert.ok(got.health >= 10080 && got.health <= 4591740);
  assert.ok(got.pension >= 19470 && got.pension <= 313020);
}
// Amendment applies to the November premium month (not just dates on/after Nov 27).
assert.equal(ctx.calc(3500000, new Date(2026, 9, 31)).longTerm, 16530);
assert.equal(ctx.calc(3500000, new Date(2026, 10, 1)).longTerm, 16530);
assert.equal(ctx.calc(200000000, new Date(2026, 9, 31)).longTerm, 603370);
assert.equal(ctx.calc(200000000, new Date(2026, 10, 1)).longTerm, 603350);
console.log('OK insurance: 7 official/notice cases + 7 rounding/bounds cases + 4 amendment-month cases');

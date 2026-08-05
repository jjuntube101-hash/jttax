/* ReportReform2026.jsx 의 «순수 계산부»만 잘라내 실제 코드 그대로 실행 검산 */
const fs = require('fs');
const SRC = require('path').join(__dirname, 'src', 'ReportReform2026.jsx');
let src = fs.readFileSync(SRC, 'utf8');

// JSX가 시작되는 「공용 UI 조각」 앞까지만 사용 (그 위는 전부 순수 JS)
const cut = src.indexOf('공용 UI 조각');
if (cut < 0) throw new Error('마커 없음');
src = src.slice(0, src.lastIndexOf('/* ═', cut));
// React 구조분해만 제거
src = src.replace(/const \{ useState: useRfState \} = React;/, '');

global.window = {};
/* ★ 금액 정규화 «구현은 Report.jsx 한 곳»에 있다. 이 파일이 그것을 쓰므로 하네스도 같이 싣는다.
   구현을 여기서 흉내 내면(폴백 복사) 두 벌이 되어 반드시 갈라진다 — 260806 실사고. */
(function loadSharedMoneyHelper() {
  const rp = require('path').join(__dirname, 'src', 'Report.jsx');
  const rs = require('fs').readFileSync(rp, 'utf8');
  const a = rs.indexOf('window.jtMoneyDigits = function');
  const b = rs.indexOf('window.jtSetNumericAns = function');
  if (a < 0 || b < 0) throw new Error('Report.jsx 의 공용 금액 헬퍼를 찾지 못했습니다.');
  const e = rs.indexOf(String.fromCharCode(10) + '};', b);
  if (e < 0) throw new Error('jtSetNumericAns 끝을 찾지 못했습니다.');
  eval(rs.slice(a, e + 3));
})();
eval(src);
const R = window.JT_REFORM_2026;
const CGT = window.jtRfCalcCGT, CRE = window.jtRfCalcCRE;
const won = (n) => Math.round(n).toLocaleString('ko-KR');
let fails = 0;
function chk(label, got, want, tol = 1) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      got=${won(got)}  want=${won(want)}`);
}
/* ⚠️ «비율»을 chk 로 재면 안 된다 — 허용오차가 원 단위 1이라, 공제율 0.10 자리에 0.9 가
   들어와도 통과한다. 세율·공제율 검사가 사실상 아무것도 잡지 못하고 있었다 (260805 자체 감사). */
function eqRate(label, got, want) {
  const ok = Math.abs(got - want) < 1e-9; if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      got=${got}  want=${want}`);
}

console.log('════ CASE 1: 1세대1주택 20억 매도 (취득 10억, 경비 0, 보유 12년/거주 12년) ════');
const c1 = { transferPrice: '2000000000', acqPrice: '1000000000', expenses: '0',
             houses: 'one', adjusted: 'no', holdYears: '12', resYears: '12', age: '50', seniorMove: 'no' };
[2026, 2027, 2028, 2029].forEach((y) => {
  const r = CGT(c1, y);
  console.log(`  ${y}: 장특 ${(r.ltdRate * 100).toFixed(0)}%  공제액 ${won(r.ltdAmount)}  과표 ${won(r.base)}  총부담 ${won(r.total)}`);
});
/* 수기 검산 (2026):
   양도차익 10억. 과세대상 = 10억 × (20억−12억)/20억 = 4억
   장특 = 보유 min(12,10)×4%=40% + 거주 min(12,10)×4%=40% → 80%(cap 80%)
   공제액 = 4억 × 80% = 3.2억 → 양도소득금액 8천만
   기본공제 250만 → 과표 77,500,000
   세율 24% 누진 5,760,000 → 77,500,000×0.24−5,760,000 = 12,840,000
   지방세 1,284,000 → 총 14,124,000 */
chk('C1 2026 총부담', CGT(c1, 2026).total, 14124000);
/* 2029: 장특 = 거주 min(12,10)×8% = 80% (현행과 동일) 이지만
   기본공제가 '27부터 2,500만원으로 오르므로 과표 = 8천만−2,500만 = 55,000,000
   세율 24% 누진 5,760,000 → 13,200,000−5,760,000 = 7,440,000 ; 지방 744,000 → 8,184,000 */
chk('C1 2029 총부담(장특 동일·기본공제 2,500만 상향분만 감소)', CGT(c1, 2029).total, 8184000);
chk('C1 2027 총부담(장특 유예·기본공제만 상향)', CGT(c1, 2027).total, 8184000);

console.log('\n════ CASE 2: 같은 집인데 «거주 0년» (보유만 12년) ════');
const c2 = { ...c1, resYears: '0' };
[2026, 2027, 2028, 2029].forEach((y) => {
  const r = CGT(c2, y);
  console.log(`  ${y}: 장특 ${(r.ltdRate * 100).toFixed(0)}%  총부담 ${won(r.total)}`);
});
/* 2026: 장특 = 보유40% + 거주0% = 40%. 공제 4억×40%=1.6억 → 소득 2.4억
   기본공제 250만 → 과표 237,500,000 → 38% 누진 19,940,000 → 70,310,000
   지방세 7,031,000 → 77,341,000 */
chk('C2 2026 총부담', CGT(c2, 2026).total, 77341000);
/* 2029: 거주 0 → 장특 0%. 소득 4억 − 250만 = 397,500,000 → 40% 누진 25,940,000 = 133,060,000
   지방 13,306,000 → 146,366,000 */
chk('C2 2029 총부담(거주 0 → 공제 전무)', CGT(c2, 2029).total, 146366000);

console.log('\n════ CASE 3: 3주택 조정대상지역 15억 매도 (취득 8억, 보유 6년) ════');
const c3 = { transferPrice: '1500000000', acqPrice: '800000000', expenses: '0',
             houses: 'three', adjusted: 'yes', holdYears: '6', resYears: '0', age: '50', seniorMove: 'no' };
[2026, 2027, 2028, 2029].forEach((y) => {
  const r = CGT(c3, y);
  console.log(`  ${y}: 중과 +${(r.surcharge * 100).toFixed(0)}%p  장특 ${(r.ltdRate * 100).toFixed(0)}%  총부담 ${won(r.total)}`);
});
/* 양도차익 7억(비과세 없음). 조정지역 다주택 → 장특 배제 0%
   과표 = 7억 − 250만 = 697,500,000
   2026: 세율 42%+30% = 72% → 697,500,000×0.72 − 35,940,000 = 466,260,000 ; 지방 46,626,000 → 512,886,000
   2027: 42%+10% = 52% → 362,700,000 − 35,940,000 = 326,760,000 ; 지방 32,676,000 → 359,436,000 */
chk('C3 2026 총부담(중과 +30%p)', CGT(c3, 2026).total, 512886000);
chk('C3 2027 총부담(중과 +10%p 완화)', CGT(c3, 2027).total, 359436000);

console.log('\n════ CASE 4: 장특공제 «금액 한도» 작동 (양도차익 100억 · 1주택 아님·비조정 보유 15년) ════');
const c4 = { transferPrice: '12000000000', acqPrice: '2000000000', expenses: '0',
             houses: 'two', adjusted: 'no', holdYears: '15', resYears: '15', age: '50', seniorMove: 'no' };
[2026, 2028, 2029].forEach((y) => {
  const r = CGT(c4, y);
  console.log(`  ${y}: 장특 ${(r.ltdRate * 100).toFixed(0)}%  공제액 ${won(r.ltdAmount)} (한도 ${R.cgt.ltdCap[y] ? won(R.cgt.ltdCap[y]) : '없음'})`);
});
chk('C4 2026 공제액(100억×30% = 30억, 한도 없음)', CGT(c4, 2026).ltdAmount, 3000000000);
chk('C4 2028 공제액(한도 20억 적용)', CGT(c4, 2028).ltdAmount, 2000000000);
chk('C4 2029 공제액(한도 10억 적용)', CGT(c4, 2029).ltdAmount, 1000000000);

console.log('\n════ CASE 5: 장기거주 기본공제 2,500만원 (10년 거주·양도가 25억 1주택) ════');
const c5 = { transferPrice: '2500000000', acqPrice: '1000000000', expenses: '0',
             houses: 'one', adjusted: 'no', holdYears: '11', resYears: '11', age: '50', seniorMove: 'no' };
[2026, 2027, 2028].forEach((y) => console.log(`  ${y}: 기본공제 ${won(CGT(c5, y).basicDeduct)}`));
chk('C5 2026 기본공제(현행 250만)', CGT(c5, 2026).basicDeduct, 2500000);
chk("C5 2027 기본공제(2,500만 — '27부터 유예 없이 시행)", CGT(c5, 2027).basicDeduct, 25000000);
chk('C5 2028 기본공제(2,500만 유지)', CGT(c5, 2028).basicDeduct, 25000000);
const c5b = { ...c5, transferPrice: '3100000000' };   // 31억 → 30억 초과라 배제
chk('C5b 2027 양도가 31억 → 상향 배제', CGT(c5b, 2027).basicDeduct, 2500000);
const c5c = { ...c5, resYears: '9' };                  // 거주 9년 → 10년 미달로 배제
chk('C5c 2027 거주 9년 → 상향 배제', CGT(c5c, 2027).basicDeduct, 2500000);

console.log('\n════ CASE 6: 고령 1주택 비수도권 이주 감면 (67세) ════');
/* ⚠️ 종전 이 케이스는 «거주 0년»(c2)인데도 감면을 정답으로 기대해 결함을 고착시켰다.
   조특법 신설안 요건: ①보유기간 중 5년 이상 거주 ②양도일 현재 2년 이상 계속 거주
   → 거주 0년이면 감면이 «없어야» 정상 (260805 Codex P1 반영). */
const c6no = { ...c2, age: '67', seniorMove: 'yes' };
const c6 = { ...c1, age: '67', seniorMove: 'yes', seniorLive2y: 'yes' };
chk('C6 거주 0년 → 감면 0 (5년 거주 요건 미충족)', CGT(c6no, 2027).relief, 0);
chk('C6 계속거주 2년 «아니오» → 감면 0', CGT({ ...c6, seniorLive2y: 'no' }, 2027).relief, 0);
[2026, 2027, 2028, 2029].forEach((y) => {
  const r = CGT(c6, y);
  console.log(`  ${y}: 감면 ${won(r.relief)}  총부담 ${won(r.total)}`);
});
chk('C6 2027 감면(요건 충족 → 산출세액 × 50%)', CGT(c6, 2027).relief,
    Math.min(CGT({ ...c1, age: '67', seniorMove: 'no' }, 2027).tax * 0.5, 500000000));
chk('C6 2026 감면 없음', CGT(c6, 2026).relief, 0);
chk('C6 2029 감면 없음(일몰)', CGT(c6, 2029).relief, 0);
chk('C6 65세 미만이면 감면 없음', CGT({ ...c6, age: '60' }, 2027).relief, 0);

console.log('\n════ CASE 7: 비과세 — 1주택 11억 매도 ════');
const c7 = { ...c1, transferPrice: '1100000000' };
chk('C7 2026 총부담(12억 이하 비과세)', CGT(c7, 2026).total, 0);

console.log('\n════════════ 종합부동산세 ════════════');
console.log('\n════ CASE 8: 1세대1주택 «거주» 공시 18억 · 66세 · 보유12년/거주12년 ════');
const d1 = { totalValue: '1800000000', houses: 'one', isResident: 'yes', age: '66', holdYears: '12', resYears: '12', adjusted: 'no' };
[2026, 2027, 2028].forEach((y) => {
  const r = CRE(d1, y);
  console.log(`  ${y}: 공제 ${won(r.deduct)}  공정 ${(r.fairRatio * 100).toFixed(0)}%  과표 ${won(r.base)}  산출 ${won(r.gross)}  세액공제 ${won(r.credit)}  총 ${won(r.total)}`);
});
/* 2026: (18억−12억)×60% = 3.6억 → 3억까지 0.5%=150만 + 0.6억×0.7%=42만 = 192만
   세액공제: 연령 65~ 30% + 보유 10년~ 40% = 70% → 1,344,000  → 순 576,000 ; 농특 115,200 */
chk('C8 2026 산출세액', CRE(d1, 2026).gross, 1920000);
chk('C8 2026 세액공제(70%)', CRE(d1, 2026).credit, 1344000);
/* 2027: (18억−14억)×70% = 2.8억 → 2.8억×0.5% = 140만
   세액공제: 연령30% + max(보유1/2 20%, 거주 40%) = 40% → 70% → 980,000 (한도 800만 미달) */
chk('C8 2027 산출세액', CRE(d1, 2027).gross, 1400000);
chk('C8 2027 세액공제(연령30+거주40=70%)', CRE(d1, 2027).credit, 980000);

console.log('\n════ CASE 9: 같은 집인데 «비거주» 1주택 ════');
const d2 = { ...d1, isResident: 'no', resYears: '0' };
[2026, 2027, 2028].forEach((y) => {
  const r = CRE(d2, y);
  console.log(`  ${y}: 공제 ${won(r.deduct)}  과표 ${won(r.base)}  산출 ${won(r.gross)}  총 ${won(r.total)}`);
});
/* 2027 비거주: (18억−9억)×70% = 6.3억 → 3억×0.5%=150만 + 3억×0.7%=210만 + 0.3억×1.3%=39만 = 399만 */
chk('C9 2027 산출세액(공제 9억으로 축소)', CRE(d2, 2027).gross, 3990000);

console.log('\n════ CASE 10: 3주택 합계 25억 · 거주용 8억 · 조정지역 ════');
const d3 = { totalValue: '2500000000', houses: 'three', residentValue: '800000000', age: '55', holdYears: '8', resYears: '8', adjusted: 'yes' };
[2026, 2027, 2028].forEach((y) => {
  const r = CRE(d3, y);
  console.log(`  ${y}: 공제 ${won(r.deduct)}  공정 ${(r.fairRatio * 100).toFixed(0)}%  과표 ${won(r.base)}  산출 ${won(r.gross)}  총 ${won(r.total)}`);
});
/* 2027 공제 = 4억 + 5억×(8/25) = 4억 + 1.6억 = 5.6억
   과표 = (25억−5.6억)×70% = 13.58억
   heavy 세율: 3억×0.5%=150만 + 3억×0.7%=210만 + 6억×1.3%=780만 + 1.58억×2.0%=316만 = 1,456만 */
chk('C10 2027 기본공제(4억+5억×32%)', CRE(d3, 2027).deduct, 560000000);
chk('C10 2027 산출세액', CRE(d3, 2027).gross, 14560000);

console.log('\n════ CASE 11: 세액공제 «금액 한도» 작동 (1주택 공시 60억·70세·거주 20년) ════');
const d4 = { totalValue: '6000000000', houses: 'one', isResident: 'yes', age: '70', holdYears: '20', resYears: '20', adjusted: 'no' };
[2026, 2027, 2028].forEach((y) => {
  const r = CRE(d4, y);
  console.log(`  ${y}: 산출 ${won(r.gross)}  세액공제 ${won(r.credit)} (한도 ${R.cre.creditAmountCap[y] ? won(R.cre.creditAmountCap[y]) : '없음'})`);
});
chk('C11 2027 세액공제 = 한도 800만', CRE(d4, 2027).credit, 8000000);
chk('C11 2028 세액공제 = 한도 600만', CRE(d4, 2028).credit, 6000000);

console.log('\n════ CASE 12: 공제 이하 → 0원 ════');
chk('C12 1주택 공시 10억 2026 총부담', CRE({ ...d1, totalValue: '1000000000' }, 2026).total, 0);
chk('C12 1주택 거주 공시 13억 2027 총부담(공제 14억)', CRE({ ...d1, totalValue: '1300000000' }, 2027).total, 0);

console.log('\n════ CASE 13: 단기보유 세율 (Codex P0) ════');
const s13 = { transferPrice: '1200000000', acqPrice: '100000000', expenses: '0',
              houses: 'one', adjusted: 'no', acqAdjusted: 'no', holdYears: '1.5', resYears: '0', age: '50', seniorMove: 'no' };
const r13 = CGT(s13, 2026);
console.log(`  보유 1.5년 → 과표 ${won(r13.base)} / 총부담 ${won(r13.total)}`);
chk('C13 소수점 보존 — 1.5년이 15년이 되지 않음', r13.base, 1097500000);
chk('C13 단기보유 60% 적용 (소득세법 §104①3호)', r13.total, 724350000);
chk('C13b 보유 0.5년 → 70%', CGT({ ...s13, holdYears: '0.5' }, 2026).tax, Math.round(1097500000 * 0.70));

console.log('\n════ CASE 14: 취득 당시 조정대상지역 → 거주 2년 요건 (Codex P1) ════');
const a14 = { transferPrice: '1200000000', acqPrice: '100000000', expenses: '0',
              houses: 'one', adjusted: 'no', holdYears: '5', resYears: '0', age: '50', seniorMove: 'no' };
chk('C14 취득 당시 비조정 + 거주 0년 → 비과세', CGT({ ...a14, acqAdjusted: 'no' }, 2026).total, 0);
const r14 = CGT({ ...a14, acqAdjusted: 'yes' }, 2026);
console.log(`  취득 당시 조정지역 + 거주 0년 → 총부담 ${won(r14.total)}`);
/* 비과세 배제 → 전액 과세. 단 장특공제는 «표1»(소득세법 §95② 본문, 보유만).
   표2(보유+거주 최대80%)는 §95② 단서상 「대통령령으로 정하는 1세대 1주택」 전용이라
   비과세가 배제되면 못 쓴다 — 1차 소스 확인(260805).
     양도차익 11억 × 표1 보유 5년 10% = 110,000,000 공제
     소득 990,000,000 − 기본공제 250만 = 과표 987,500,000
     987,500,000 × 42% − 누진 35,940,000 = 378,810,000 · 지방 37,881,000
   ※ Codex R1 은 470,728,500 을 제시했으나 장특공제를 0으로 본 값이었다. */
chk('C14 취득 당시 조정지역 + 거주 0년 → 비과세 배제 + 표1 장특공제', r14.total, 416691000);
eqRate('C14 장특공제율 = 표1 보유 5년 10%', r14.ltdRate, 0.10);
chk('C14b 취득 당시 조정지역 + 거주 2년 → 비과세', CGT({ ...a14, acqAdjusted: 'yes', resYears: '2' }, 2026).total, 0);

console.log('\n════ CASE 15: 중과 한시완화는 «보유 2년 이상»만 (Codex R10 P1) ════');
const m15 = { transferPrice: '1200000000', acqPrice: '100000000', expenses: '0',
              houses: 'three', adjusted: 'yes', holdYears: '1.5', resYears: '0', age: '50', seniorMove: 'no' };
const r15 = CGT(m15, 2027);
console.log(`  보유 1.5년 3주택 조정 2027 → 중과 +${(r15.surcharge*100).toFixed(0)}%p / 총 ${won(r15.total)}`);
/* 보유 2년 미만 → 완화 없음, 원래 +30%p. 과표 1,097,500,000
   기본세율분 1,097,500,000×75% − 65,940,000 = 757,185,000  (45%+30%p)
   단기 60% 분    1,097,500,000×60% = 658,500,000 → 큰 쪽 757,185,000
   지방 75,718,500 → 832,903,500 */
eqRate('C15 보유 2년 미만 → 완화 미적용(+30%p)', r15.surcharge, 0.30);
chk('C15 총세액 832,903,500 (완화 적용 시 724,350,000)', r15.total, 832903500);
eqRate('C15b 보유 정확히 2년 → 완화 적용(+10%p)', CGT({ ...m15, holdYears: '2' }, 2027).surcharge, 0.10);
eqRate('C15c 2026년은 보유 무관 +30%p', CGT(m15, 2026).surcharge, 0.30);

/* ══════════════════════════════════════════════════════════════════════════
   260805 R23~R28 반영분 회귀 — 여기부터는 «고친 결함이 되살아나지 않는지» 지킨다
   ══════════════════════════════════════════════════════════════════════════ */
const MD = window.jtMoneyDigits, SHIFT = window.jtRfShiftYears;
function eq(label, got, want) {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      got=${JSON.stringify(got)}  want=${JSON.stringify(want)}`);
}

console.log('\n════ CASE 16: 금액 입력 정규화 — 자릿수를 바꾸면 안 된다 (R27·R28 P1) ════');
/* 「숫자 아닌 문자를 전부 지운다」 방식이 만들던 사고: "50,000,000.00" → 5000000000 (100배) */
eq('C16 소수점 붙여넣기 .00 → 소수부 버림', MD('50,000,000.00'), '50000000');
eq('C16 소수부가 0이 아니어도 원 단위 절사', MD('1,234,567.89'), '1234567');
eq('C16 쉼표만', MD('1,800,000,000'), '1800000000');
eq('C16 「원」·공백·통화기호 제거', MD(' ₩1,234,567원 '), '1234567');
eq('C16 전각 숫자 — 종전엔 통째로 사라졌다', MD('１２３４５６'), '123456');
eq('C16 전각 쉼표 포함', MD('１，８００，０００，０００'), '1800000000');
eq('C16 지수표기는 «받지 않는다» (종전엔 18e8 → 188)', MD('18e8'), null);
eq('C16 음수는 «받지 않는다» (종전엔 부호만 조용히 삭제)', MD('-100000000'), null);
eq('C16 문자 섞인 값 거부', MD('1억2천'), null);
eq('C16 빈 입력', MD(''), '');
eq('C16 0 은 그대로', MD('0'), '0');
eq('C16 앞 0 제거', MD('007'), '7');

console.log('\n════ CASE 17: 공개 함수 방어 — 음수·범위초과 입력 (R23 P3·R26 P3) ════');
/* window.jtRfCalcCGT/CRE 는 UI 밖에서도 불린다. 음수 필요경비가 양도차익을 «키우면» 안 된다 */
const a17 = { transferPrice: '2000000000', acqPrice: '1000000000', expenses: '-100000000',
              houses: 'two', adjusted: 'no', holdYears: '3', resYears: '0', age: '50' };
chk('C17 음수 필요경비는 0으로 — 경비 0과 같은 결과', CGT(a17, 2026).total, CGT({ ...a17, expenses: '0' }, 2026).total);
chk('C17 거주 > 보유 이면 보유로 깎임', CGT({ ...a17, holdYears: '3', resYears: '99' }, 2026).resYears, 3);
const c17 = { totalValue: '2500000000', houses: 'two', residentValue: '-1000000000', adjusted: 'no' };
chk('C17 음수 거주용가액 → 0 (공제 4억)', CRE(c17, 2027).deduct, 400000000);
chk('C17 거주용가액 > 합계 → 합계로 클램프 (공제 9억)',
    CRE({ ...c17, residentValue: '9999999999' }, 2027).deduct, 900000000);
chk('C17 음수 공시가격 → 세액 0', CRE({ ...c17, totalValue: '-1' }, 2026).total, 0);

console.log('\n════ CASE 18: 연도별 비교는 «그 해 기준» 기간으로 계산한다 (R23 P1) ════');
/* 종전엔 2027~2029 카드가 오늘과 같은 보유·거주기간을 그대로 썼다 */
const a18 = { transferPrice: '2000000000', acqPrice: '1000000000', expenses: '0', houses: 'one',
              adjusted: 'no', holdYears: '9', resYears: '9', age: '50', stillLiving: 'yes' };
eq('C18 2026 = 기준 그대로', SHIFT(a18, 2026, 2026).holdYears, '9');
eq('C18 2027 보유 +1', SHIFT(a18, 2027, 2026).holdYears, '10');
eq('C18 2027 거주도 +1 (계속 거주 중)', SHIFT(a18, 2027, 2026).resYears, '10');
eq('C18 2029 나이도 +3', SHIFT(a18, 2029, 2026).age, '53');
eq('C18 이사 나갔으면 거주는 그대로', SHIFT({ ...a18, stillLiving: 'no' }, 2029, 2026).resYears, '9');
eq('C18 보유는 이사와 무관하게 늘어난다', SHIFT({ ...a18, stillLiving: 'no' }, 2029, 2026).holdYears, '12');
/* ★ 거주 0년인데 stillLiving 답이 남아 있으면 «살지도 않는 집»의 거주가 늘어난다 */
eq('C18 거주 0년이면 stillLiving=yes 라도 안 늘어난다',
   SHIFT({ ...a18, resYears: '0', stillLiving: 'yes' }, 2029, 2026).resYears, '0');
/* 보유 9년·거주 9년 → 2027엔 10년이 되어 장특 상한(각 40%)에 도달한다 */
chk('C18 2027년 실제 세액 (보유·거주 10년 기준)', CGT(SHIFT(a18, 2027, 2026), 2027).total, 8184000);
chk('C18 기간을 안 옮기면 세액이 다르다(회귀 감시)', CGT(a18, 2027).total, 25173500);

console.log('\n════ CASE 18b: 「이미 이사」와 「계속 거주 중」은 동시에 참일 수 없다 (R29 P1) ════');
/* stillLiving 문항을 넣으면서 내가 만든 구멍 — 이사했다고 답해도 seniorLive2y='yes' 가
   남아 있으면 고령감면이 붙었다. 화면(showIf+모순 정리)과 계산부 양쪽에서 닫는다. */
const a18b = { transferPrice: '2000000000', acqPrice: '1000000000', expenses: '0', houses: 'one',
               adjusted: 'no', holdYears: '5', resYears: '5', age: '64',
               seniorMove: 'yes', seniorLive2y: 'yes' };
const y27 = SHIFT(a18b, 2027, 2026);                       // 2027년엔 65세가 된다
chk('C18b 계속 거주 중이면 감면 적용 (65세 도달)', CGT({ ...y27, stillLiving: 'yes' }, 2027).relief > 0 ? 1 : 0, 1);
chk('C18b 이미 이사했으면 감면 0', CGT({ ...y27, stillLiving: 'no' }, 2027).relief, 0);
chk('C18b 이사 시 세액이 감면분만큼 크다',
    CGT({ ...y27, stillLiving: 'no' }, 2027).total > CGT({ ...y27, stillLiving: 'yes' }, 2027).total ? 1 : 0, 1);
/* stillLiving 을 아예 안 넘기는 기존 호출부는 영향 없어야 한다(하위호환) */
chk('C18b stillLiving 미지정이면 종전대로 동작', CGT(y27, 2027).relief > 0 ? 1 : 0, 1);

console.log('\n════ CASE 20: 종부세 «과세대상 문턱» — 원문 대조로 찾은 누락 (종부세법 §7① 신설) ════');
/* 1차 소스: 상세본 p60 「(1세대1주택자) 14억원 초과 / (그 외) 9억원 초과」·문답 p39.
   기본공제와 «별개» 단계다. 종전엔 이 단계가 없어 «없는 세금»을 만들어 냈다. */
const t20a = { totalValue: '1300000000', houses: 'one', isResident: 'no', age: '50', holdYears: '3', resYears: '0', adjusted: 'no' };
chk('C20 비거주 1주택 13억 · 2027 → 0원 (14억 이하라 과세대상 아님)', CRE(t20a, 2027).total, 0);
eq('C20 notTaxable 플래그', CRE(t20a, 2027).notTaxable, true);
chk('C20 14억 «정확히» → 0원 (초과여야 과세)', CRE({ ...t20a, totalValue: '1400000000' }, 2027).total, 0);
chk('C20 14억 초과분은 종전대로 과세', CRE({ ...t20a, totalValue: '1600000000' }, 2027).total, 3396000);
const t20b = { totalValue: '800000000', houses: 'two', residentValue: '0', adjusted: 'no' };
chk('C20 2주택 합계 8억 · 2027 → 0원 (9억 이하)', CRE(t20b, 2027).total, 0);
chk('C20 9억 «정확히» → 0원', CRE({ ...t20b, totalValue: '900000000' }, 2027).total, 0);
/* 2026(현행)엔 이 조항이 없다 — 기본공제 12억/9억이 같은 일을 하므로 결과는 0원으로 같아야 한다 */
chk('C20 2026 비거주 1주택 13억 → 기본공제 12억으로 과세(현행)', CRE(t20a, 2026).total > 0 ? 1 : 0, 1);
eq('C20 2026 엔 문턱 자체가 없다', CRE(t20a, 2026).notTaxable, undefined);

/* 조기 반환 객체도 정상 경로와 «같은» heavy/fairRatio 를 실어야 한다 (R33 P3) */
const t20c = CRE({ totalValue: '800000000', houses: 'two', residentValue: '0', adjusted: 'no' }, 2028);
eq('C20 문턱 미달이어도 heavy 판정은 정상 경로와 같다', t20c.heavy, false);
eq('C20 그에 맞는 공정시장가액비율(2028 light 70%)', t20c.fairRatio, 0.70);
const t20d = CRE({ totalValue: '800000000', houses: 'three', residentValue: '0', adjusted: 'no' }, 2028);
eq('C20 3주택이면 heavy=true · 비율 80%', t20d.heavy + '/' + t20d.fairRatio, 'true/0.8');

console.log('\n════ CASE 20b: 결론문은 «세 해 전부»를 봐야 한다 (R34·R35) ════');
/* 2026 과 2028 이 같고 2027 만 다른 조합이 실재한다 — 종전 결론문은 첫 해와 마지막 해만
   비교(diff)해 「달라지지 않습니다」로 단정했다.
   1주택 거주·공시 19.14억·보유 5년·거주 0년: 2027 만 보유공제 1/2(10%)이 걸린다.
   ⚠️ 내가 처음 「그런 조합 0건」이라 판정했던 것은 «보유 4년 고정» 스캔이라 놓친 것이었다.
      Codex R35 가 보유 5년 반례를 제시해 정정 — 「0건」은 스캔 범위의 답이지 사실이 아니었다. */
const t20e = { totalValue: '1914285714', houses: 'one', isResident: 'yes', age: '1', holdYears: '5', resYears: '0', adjusted: 'no' };
const y20 = [2026, 2027, 2028].map((y) => CRE(SHIFT(t20e, y, 2026), y));
chk('C20b 2026 총부담', y20[0].total, 2304000);
chk('C20b 2027 총부담 (보유 6년 → 공제 10%)', y20[1].total, 2073600);
chk('C20b 2028 총부담 (거주 0년 → 공제 0)', y20[2].total, 2304000);
eq('C20b 2026 === 2028 (첫·끝만 보면 «변동 없음»으로 보인다)', y20[0].total === y20[2].total, true);
/* ★ 세액만 고정하면 «결론 로직»이 diff===0 으로 퇴행해도 전부 통과한다 — 고친 그 로직을
   직접 검사해야 한다 (260805 R36 P2, 「게이트를 만든 것 ≠ 작동하는 것」). */
const VD = window.jtRfCreVerdict;
const v20 = VD(y20);
eq('C20b 결론 판정 = changed (변동 없음이 아니다)', v20.kind, 'changed');
eq('C20b 2027 이 다르다는 것을 판정이 안다', v20.midDiffers, true);
chk('C20b diff 는 0 이지만(첫·끝 동일) 그것만으로 판정하지 않는다', v20.diff, 0);
chk('C20b 2027 금액을 결론이 들고 있다', v20.mid, 2073600);
/* 판정 함수의 나머지 갈래도 고정 */
const mk = (arr) => arr.map((t, i) => ({ year: 2026 + i, total: t, notTaxable: t === 0 }));
eq('C20b 전 연도 0원 → none', VD(mk([0, 0, 0])).kind, 'none');
eq('C20b 전 연도 동일 → same', VD(mk([100, 100, 100])).kind, 'same');
eq('C20b 2028만 다름 → changed·mid 동일', VD(mk([100, 100, 200])).kind + '/' + VD(mk([100, 100, 200])).midDiffers, 'changed/false');
eq('C20b 문턱 미달 섞임 감지', VD(mk([100, 0, 100])).anyNotTaxable, true);

console.log('\n════ CASE 21: 다주택 공제 산식 — 문답자료 p40 적용사례 그대로 ════');
/* 「2주택자 공시가격 10억원 주택 2채: 1채 거주 → 4억+(5억×10/20)=6.5억 공제 / 비거주 → 4억」 */
chk('C21 2주택 10억×2 · 1채 거주 → 공제 6.5억',
    CRE({ totalValue: '2000000000', houses: 'two', residentValue: '1000000000', adjusted: 'no' }, 2027).deduct, 650000000);
chk('C21 2주택 10억×2 · 비거주 → 공제 4억',
    CRE({ totalValue: '2000000000', houses: 'two', residentValue: '0', adjusted: 'no' }, 2027).deduct, 400000000);
/* 「3주택자 공시가격 10억원 주택 3채: 1채 거주 → 4억+(5억×10/30) = 약 5.7억」 */
chk('C21 3주택 10억×3 · 1채 거주 → 공제 약 5.67억',
    CRE({ totalValue: '3000000000', houses: 'three', residentValue: '1000000000', adjusted: 'no' }, 2027).deduct,
    400000000 + 500000000 / 3, 1);

console.log('\n════ CASE 19: 단계 표시 합계 = 카드 총액 (R26 P2·P3) ════');
/* 절사가 안 보이는 단계였을 때 화면 숫자를 더하면 총액과 최대 9원 어긋났다 */
const r19 = CRE({ totalValue: '1700000167', houses: 'one', isResident: 'yes', age: '1', holdYears: '1', resYears: '0' }, 2026);
chk('C19 종부세 본세는 10원 단위', r19.net % 10, 0);
chk('C19 net + 농특세 = total', r19.net + r19.rural, r19.total);
const r19b = CGT({ transferPrice: '1000000167', acqPrice: '100000000', expenses: '0', houses: 'two',
                   adjusted: 'no', holdYears: '3', resYears: '0', age: '50' }, 2026);
chk('C19 양도세 본세는 10원 단위', r19b.tax % 10, 0);
chk('C19 tax + 지방세 = total', r19b.tax + r19b.local, r19b.total);

console.log(`\n════════════════════\n실패 ${fails}건`);
process.exit(fails ? 1 : 0);

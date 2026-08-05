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
chk('C14 장특공제율 = 표1 보유 5년 10%', r14.ltdRate, 0.10);
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
chk('C15 보유 2년 미만 → 완화 미적용(+30%p)', r15.surcharge, 0.30);
chk('C15 총세액 832,903,500 (완화 적용 시 724,350,000)', r15.total, 832903500);
chk('C15b 보유 정확히 2년 → 완화 적용(+10%p)', CGT({ ...m15, holdYears: '2' }, 2027).surcharge, 0.10);
chk('C15c 2026년은 보유 무관 +30%p', CGT(m15, 2026).surcharge, 0.30);

console.log(`
════════════════════
실패 ${fails}건`);console.log(`\n════════════════════\n실패 ${fails}건`);
process.exit(fails ? 1 : 0);

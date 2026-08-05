/* ReportCrypto2027.jsx 의 «순수 계산부»만 잘라내 실제 코드 그대로 실행 검산 */
const fs = require('fs'), path = require('path');
let src = fs.readFileSync(path.join(__dirname, 'src', 'ReportCrypto2027.jsx'), 'utf8');
const cut = src.indexOf('문항');
src = src.slice(0, src.lastIndexOf('/* ══════════ 문항', cut + 100) >= 0 ? src.lastIndexOf('/* ══════════ 문항') : cut);
src = src.replace(/const \{ useState: useCrState \} = React;/, '');
global.window = {};
eval(src);
const CR = window.jtCrCalc, C = window.JT_CRYPTO_2027;
const won = (n) => Math.round(n).toLocaleString('ko-KR');
let fails = 0;
function chk(label, got, want) {
  const ok = Math.abs(got - want) <= 1; if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      got=${won(got)}  want=${won(want)}`);
}

console.log('════ SSOT 확인 (조문 원문 대조) ════');
chk('세율 20% (§64의3②)', C.rate, 0.20);
chk('공제 250만원 (§64의3②·§84 3호)', C.basicDeduct, 2500000);

console.log('\n════ CASE 1: 의제취득가액 작동 — 1천만에 사서 2026말 4천만, 5천만에 매도 ════');
const c1 = { heldBefore: 'yes', salePrice: '50000000', acqPrice: '10000000', marketAt2026: '40000000', fee: '250000', otherLoss: '0' };
const r1 = CR(c1);
console.log(`  취득가액 적용 ${won(r1.baseCost)} / 소득금액 ${won(r1.income)} / 세액 ${won(r1.total)}`);
/* 취득가액 = max(1천만, 4천만) = 4천만. 필요경비 4천만+25만 = 40,250,000
   소득금액 = 5천만 − 40,250,000 = 9,750,000
   과표 = 9,750,000 − 250만 = 7,250,000 → 소득세 1,450,000 · 지방 145,000 → 1,595,000 */
chk('C1 취득가액 = 2026말 시가', r1.baseCost, 40000000);
chk('C1 소득금액', r1.income, 9750000);
chk('C1 총세액', r1.total, 1595000);
chk('C1 의제취득으로 빠진 금액(4천만−1천만)', r1.shielded, 30000000);

console.log('\n════ CASE 2: 의제취득가액 «미적용» — 실제 취득가가 더 큰 경우(고점 매수) ════');
const c2 = { ...c1, acqPrice: '45000000' };
const r2 = CR(c2);
/* max(4,500만, 4,000만) = 4,500만 → 필요경비 45,250,000 → 소득 4,750,000
   과표 2,250,000 → 세 450,000 + 45,000 = 495,000 */
chk('C2 취득가액 = 실제 취득가액', r2.baseCost, 45000000);
chk('C2 총세액', r2.total, 495000);
chk('C2 shielded = 0', r2.shielded, 0);

console.log('\n════ CASE 3: 2027년 이후 취득 — 의제취득 미적용 ════');
const c3 = { heldBefore: 'no', salePrice: '50000000', acqPrice: '10000000', marketAt2026: '40000000', fee: '0', otherLoss: '0' };
const r3 = CR(c3);
/* 취득가액 1천만 → 소득 4천만 → 과표 37,500,000 → 세 7,500,000 + 750,000 = 8,250,000 */
chk('C3 취득가액 = 실제(1천만) — 2026말 시가 무시', r3.baseCost, 10000000);
chk('C3 총세액', r3.total, 8250000);

console.log('\n════ CASE 4: 과세최저한 §84 3호 — 연 소득 250만원 «이하» ════');
const c4 = { heldBefore: 'no', salePrice: '12400000', acqPrice: '10000000', marketAt2026: '0', fee: '0', otherLoss: '0' };
const r4 = CR(c4);   // 소득 2,400,000 ≤ 250만 → 0원
chk('C4 소득 240만 → 세액 0', r4.total, 0);
const c4b = { ...c4, salePrice: '12500000' };
chk('C4b 소득 정확히 250만 → 세액 0 (이하 포함)', CR(c4b).total, 0);
const c4c = { ...c4, salePrice: '12500001' };
console.log(`  경계 직후: 소득 ${won(CR(c4c).income)} → 과표 ${won(CR(c4c).taxBase)} → 세액 ${won(CR(c4c).total)}`);
chk('C4c 소득 250만+1원 → 과세 전환', CR(c4c).belowMinimum ? 1 : 0, 0);

console.log('\n════ CASE 5: 같은 해 손실 통산 ════');
const c5 = { ...c1, otherLoss: '5000000' };
const r5 = CR(c5);
/* 소득 9,750,000 − 500만 = 4,750,000 → 과표 2,250,000 → 495,000 */
chk('C5 손실 통산 후 소득금액', r5.income, 4750000);
chk('C5 총세액', r5.total, 495000);

console.log('\n════ CASE 6: 손실이 이익보다 큰 경우 → 0원 ════');
chk('C6 세액 0', CR({ ...c1, otherLoss: '20000000' }).total, 0);

console.log('\n════ CASE 7: 지방소득세 = 소득세의 10% ════');
const r7 = CR({ heldBefore: 'no', salePrice: '100000000', acqPrice: '0', marketAt2026: '0', fee: '0', otherLoss: '0' });
/* 소득 1억 → 과표 97,500,000 → 소득세 19,500,000 · 지방 1,950,000 → 21,450,000 */
chk('C7 소득세', r7.tax, 19500000);
chk('C7 지방소득세', r7.local, 1950000);
chk('C7 합계 (실효 22% 구조)', r7.total, 21450000);

console.log(`\n════════════════════\n실패 ${fails}건`);
process.exit(fails ? 1 : 0);

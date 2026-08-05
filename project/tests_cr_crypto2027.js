/* ReportCrypto2027.jsx 의 «순수 계산부»만 잘라내 실제 코드 그대로 실행 검산 */
const fs = require('fs'), path = require('path');
let src = fs.readFileSync(path.join(__dirname, 'src', 'ReportCrypto2027.jsx'), 'utf8');
/* 계산부만 잘라낸다 — 화면(JSX) 시작 앞까지 */
const _cut = src.indexOf('/* ══════════ 화면 ══════════ */');
if (_cut < 0) throw new Error('절단 마커를 찾지 못했습니다 — ReportCrypto2027.jsx 구조가 바뀌었는지 확인하세요.');
src = src.slice(0, _cut);
src = src.replace(/const \{ useState: useCrState \} = React;/, '');
global.window = {};
eval(src);
let CR = window.jtCrCalc; const C = window.JT_CRYPTO_2027;
/* 구(舊) 평면 입력을 rows 한 줄로 감싸는 헬퍼 — 기존 케이스 재사용용 */
const R1 = (o) => ({ rows: [{ name: '', sale: o.salePrice, acq: o.acqPrice, mkt2026: o.marketAt2026, fee: o.fee, heldBefore: o.heldBefore }] });
const CR0 = CR;
CR = (o) => (o && o.rows ? CR0(o) : CR0(R1(o)));

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
const c1 = { heldBefore: 'yes', salePrice: '50000000', acqPrice: '10000000', marketAt2026: '40000000', fee: '250000' };
const r1 = CR(c1);
console.log(`  취득가액 적용 ${won(r1.lines[0].baseCost)} / 소득금액 ${won(r1.income)} / 세액 ${won(r1.total)}`);
/* 취득가액 = max(1천만, 4천만) = 4천만. 필요경비 4천만+25만 = 40,250,000
   소득금액 = 5천만 − 40,250,000 = 9,750,000
   과표 = 9,750,000 − 250만 = 7,250,000 → 소득세 1,450,000 · 지방 145,000 → 1,595,000 */
chk('C1 취득가액 = 2026말 시가', r1.lines[0].baseCost, 40000000);
chk('C1 소득금액', r1.income, 9750000);
chk('C1 총세액', r1.total, 1595000);
chk('C1 의제취득으로 빠진 금액(4천만−1천만)', r1.shielded, 30000000);

console.log('\n════ CASE 2: 의제취득가액 «미적용» — 실제 취득가가 더 큰 경우(고점 매수) ════');
const c2 = { ...c1, acqPrice: '45000000' };
const r2 = CR(c2);
/* max(4,500만, 4,000만) = 4,500만 → 필요경비 45,250,000 → 소득 4,750,000
   과표 2,250,000 → 세 450,000 + 45,000 = 495,000 */
chk('C2 취득가액 = 실제 취득가액', r2.lines[0].baseCost, 45000000);
chk('C2 총세액', r2.total, 495000);
chk('C2 shielded = 0', r2.shielded, 0);

console.log('\n════ CASE 3: 2027년 이후 취득 — 의제취득 미적용 ════');
const c3 = { heldBefore: 'no', salePrice: '50000000', acqPrice: '10000000', marketAt2026: '40000000', fee: '0' };
const r3 = CR(c3);
/* 취득가액 1천만 → 소득 4천만 → 과표 37,500,000 → 세 7,500,000 + 750,000 = 8,250,000 */
chk('C3 취득가액 = 실제(1천만) — 2026말 시가 무시', r3.lines[0].baseCost, 10000000);
chk('C3 총세액', r3.total, 8250000);

console.log('\n════ CASE 4: 과세최저한 §84 3호 — 연 소득 250만원 «이하» ════');
const c4 = { heldBefore: 'no', salePrice: '12400000', acqPrice: '10000000', marketAt2026: '0', fee: '0' };
const r4 = CR(c4);   // 소득 2,400,000 ≤ 250만 → 0원
chk('C4 소득 240만 → 세액 0', r4.total, 0);
const c4b = { ...c4, salePrice: '12500000' };
chk('C4b 소득 정확히 250만 → 세액 0 (이하 포함)', CR(c4b).total, 0);
const c4c = { ...c4, salePrice: '12500001' };
console.log(`  경계 직후: 소득 ${won(CR(c4c).income)} → 과표 ${won(CR(c4c).taxBase)} → 세액 ${won(CR(c4c).total)}`);
chk('C4c 소득 250만+1원 → 과세 전환', CR(c4c).belowMinimum ? 1 : 0, 0);

console.log('\n════ CASE 5: 손실 거래를 «합계에 포함»해 통산 (Codex R2 P1) ════');
/* 종전엔 otherLoss 를 따로 받아 «이중 차감»했다. 지금은 손실 거래의 매도액·취득가액을
   합계에 넣으면 자동 상계된다.
   Codex 재현: 이익 2,000만/취득 1,000만 + 손실 100만/취득 400만
     → 합계 매도 2,100만 / 취득 1,400만 → 소득 700만
       과표 700만 − 250만 = 450만 → 소득세 90만 + 지방 9만 = 990,000
     ※ 종전 구현은 이 입력에서 330,000 원(66만원 과소)이 나왔다. */
const c5 = { heldBefore: 'no', salePrice: '21000000', acqPrice: '14000000', marketAt2026: '', fee: '0' };
const r5 = CR(c5);
chk('C5 소득금액 = 700만 (이중차감 없음)', r5.income, 7000000);
chk('C5 총세액 990,000', r5.total, 990000);

console.log('\n════ CASE 6: 손실이 이익보다 큰 경우 → 0원 ════');
chk('C6 세액 0', CR({ heldBefore: 'no', salePrice: '5000000', acqPrice: '20000000', marketAt2026: '', fee: '0' }).total, 0);

console.log('\n════ CASE 7: 지방소득세 = 소득세의 10% ════');
const r7 = CR({ heldBefore: 'no', salePrice: '100000000', acqPrice: '0', marketAt2026: '0', fee: '0' });
/* 소득 1억 → 과표 97,500,000 → 소득세 19,500,000 · 지방 1,950,000 → 21,450,000 */
chk('C7 소득세', r7.tax, 19500000);
chk('C7 지방소득세', r7.local, 1950000);
chk('C7 합계 (실효 22% 구조)', r7.total, 21450000);

console.log('\n════ CASE 8: 의제취득가액은 «코인별»로 적용 (Codex R3 P1) ════');
/* A: 매도 1.5억 / 실제취득 100만 / 2026말 1억  → 의제 1억
   B: 매도 1.5억 / 실제취득 1억   / 2026말 100만 → 실제 1억
   자산별 필요경비 2억 · 소득 1억 · 과표 9,750만 · 세 1,950만 + 지방 195만 = 21,450,000
   ※ 종전 «합계 3필드» 방식은 필요경비 1.01억 → 43,230,000 (2,178만원 과다) */
const r8 = CR({ rows: [
  { name: 'A', sale: '150000000', acq: '1000000',   mkt2026: '100000000', fee: '0', heldBefore: 'yes' },
  { name: 'B', sale: '150000000', acq: '100000000', mkt2026: '1000000',   fee: '0', heldBefore: 'yes' },
] });
console.log(`  필요경비 ${won(r8.expense)} / 소득 ${won(r8.income)} / 총 ${won(r8.total)}`);
chk('C8 필요경비 = 코인별 max 합계 2억', r8.expense, 200000000);
chk('C8 총세액 21,450,000 (합계방식이면 43,230,000)', r8.total, 21450000);

console.log('\n════ CASE 9: 2026년 이전 보유분 + 2027년 이후 취득분 혼합 ════');
const r9 = CR({ rows: [
  { name: '구보유', sale: '50000000', acq: '10000000', mkt2026: '40000000', fee: '0', heldBefore: 'yes' },
  { name: '신규',   sale: '30000000', acq: '20000000', mkt2026: '',         fee: '0', heldBefore: 'no'  },
] });
/* 구보유 필요경비 4천만 / 신규 2천만 = 6천만. 매도 8천만 → 소득 2천만
   과표 1,750만 → 세 350만 + 지방 35만 = 3,850,000 */
chk('C9 혼합 보유 총세액', r9.total, 3850000);
chk('C9 신규 취득분엔 의제취득가액 미적용', r9.lines[1].baseCost, 20000000);

console.log(`\n════════════════════\n실패 ${fails}건`);
process.exit(fails ? 1 : 0);

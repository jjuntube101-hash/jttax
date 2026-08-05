/* ReportCrypto2027.jsx 의 «순수 계산부»만 잘라내 실제 코드 그대로 실행 검산 */
const fs = require('fs'), path = require('path');
let src = fs.readFileSync(path.join(__dirname, 'src', 'ReportCrypto2027.jsx'), 'utf8');
/* 계산부만 잘라낸다 — 화면(JSX) 시작 앞까지 */
const _cut = src.indexOf('/* ══════════ 화면 ══════════ */');
if (_cut < 0) throw new Error('절단 마커를 찾지 못했습니다 — ReportCrypto2027.jsx 구조가 바뀌었는지 확인하세요.');
src = src.slice(0, _cut);
src = src.replace(/const \{ useState: useCrState \} = React;/, '');
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

/* ⚠️ 비율은 chk 로 재면 안 된다 — 허용오차가 «1»이라 0.20 자리에 0.9 를 넣어도 통과한다.
   즉 세율 검사가 사실상 아무것도 잡지 못하고 있었다 (260805 자체 감사). 정확히 비교한다. */
function eqNum(label, got, want) {
  const ok = got === want; if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      got=${got}  want=${want}`);
}

console.log('════ SSOT 확인 (조문 원문 대조) ════');
eqNum('세율 20% (§64의3②)', C.rate, 0.20);
eqNum('지방소득세율 10% (지방세법)', C.localRateOfTax, 0.10);
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

/* ══════════════════════════════════════════════════════════════════════════
   260805 R23~R28 반영분 회귀
   ══════════════════════════════════════════════════════════════════════════ */
function eq(label, got, want) {
  const ok = String(got) === String(want); if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      got=${JSON.stringify(got)}  want=${JSON.stringify(want)}`);
}

console.log('\n════ CASE 10: 금액 입력 정규화 (R27 P2·R28 P1 — 4필드 공통) ════');
/* 종전 "50,000,000.00" → 5000000000 (100배). 폴백 경로도 같은 규칙이어야 한다 */
eq('C10 .00 붙여넣기', window.jtCrMoneyDigits('50,000,000.00'), '50000000');
eq('C10 전각', window.jtCrMoneyDigits('１，０００'), '1000');
eq('C10 지수표기 거부', window.jtCrMoneyDigits('18e8'), null);
eq('C10 음수 거부', window.jtCrMoneyDigits('-1'), null);

console.log('\n════ CASE 11: §37⑥ 추계 필요경비 — 시행령 §88⑤ 100분의 50 ════');
/* 시행령 §88④⑤ 는 «이미 제정»돼 있다(2025.2.28 신설, 2026.7.1 시행). 종전엔 화면이
   「시행령 미제정」이라 안내하고 계산 경로도 없어, 증빙 없는 이용자는 계산을 못 했다. */
eqNum('C11 추계율 SSOT = 50% (시행령 §88⑤)', C.estimateRate, 0.50);
const r11 = CR({ rows: [{ name: 'X', sale: '100000000', acq: '', mkt2026: '', fee: '5000000',
                          heldBefore: 'no', estimate: 'yes' }] });
/* 필요경비 = 1억 × 50% = 5,000만 (수수료 500만은 §37⑥ 후단에 따라 «불산입»)
   소득 5,000만 − 250만 = 과표 4,750만 → 세 950만 + 지방 95만 = 10,450,000 */
chk('C11 필요경비 = 양도가액 × 50%', r11.expense, 50000000);
chk('C11 수수료 불산입 (§37⑥ 후단)', r11.lines[0].fee, 0);
chk('C11 총세액', r11.total, 10450000);
/* 2026년 말 이전 보유분은 §37⑤ 가 취득가액을 정하므로 추계 대상이 아니다 */
const r11b = CR({ rows: [{ sale: '100000000', acq: '10000000', mkt2026: '40000000', fee: '0',
                           heldBefore: 'yes', estimate: 'yes' }] });
chk('C11b 구보유분엔 추계가 «적용되지 않는다» (의제취득 4천만 유지)', r11b.lines[0].baseCost, 40000000);
eq('C11b estimateApplies=false', r11b.estimateApplies, false);

console.log('\n════ CASE 12: 2026년 비교는 «구보유분이 있을 때만» 성립 (R25 P2) ════');
/* 2027년 이후에 산 코인을 2026년에 팔 수는 없다 — 「0원·차익 전액 비과세」를 띄우면
   있지도 않은 절세 기회를 보여 주는 셈이다 */
const r12 = CR({ rows: [{ sale: '30000000', acq: '20000000', mkt2026: '', fee: '0', heldBefore: 'no' }] });
eq('C12 전부 2027년 이후 취득 → 2026년 매도 불가', r12.canSellIn2026, false);
chk('C12 그 경우 2026년 차익은 0으로 집계', r12.gainIfSoldIn2026, 0);
const r12b = CR({ rows: [
  { sale: '50000000', acq: '10000000', mkt2026: '40000000', fee: '0', heldBefore: 'yes' },
  { sale: '30000000', acq: '20000000', mkt2026: '',         fee: '0', heldBefore: 'no'  },
] });
eq('C12b 구보유분이 하나라도 있으면 비교 성립', r12b.canSellIn2026, true);
chk('C12b 2026년 차익엔 «구보유분만» 들어간다', r12b.gainIfSoldIn2026, 40000000);

console.log('\n════ CASE 13b: 한 종목당 한 줄 강제 (R29 P1) ════');
/* §37⑥ 는 「같은 종류의 가상자산 «전체»의 총양도가액 × 50%」다. 같은 코인을 두 줄로
   나누면 추계를 고른 줄에만 걸려 필요경비가 어긋난다 — Codex R29 재현:
     BTC① 매도 1억 추계 + BTC② 매도 1억 취득 9천만 → 12,650,000원
     한 줄로 합치면(총양도 2억 × 50% = 1억) 21,450,000원
   자동으로 합치면 무엇이 합쳐졌는지 사용자가 모르므로 «입력 단계»에서 막는다. */
const V = window.jtCrValidateRows;
const hasErr = (re, rows) => re.test(V(rows) || '');
eq('C13b 같은 코인 두 줄 → 거부', hasErr(/두 줄에 있습니다/, [
  { name: '비트코인', sale: '100000000', acq: '', heldBefore: 'no', estimate: 'yes' },
  { name: '비트코인', sale: '100000000', acq: '90000000', heldBefore: 'no' },
]), true);
eq('C13b 대소문자·공백만 다른 이름도 같은 종목', hasErr(/두 줄에 있습니다/, [
  { name: 'BTC', sale: '100000000', acq: '1', heldBefore: 'no' },
  { name: ' btc ', sale: '100000000', acq: '1', heldBefore: 'no' },
]), true);
eq('C13b 2줄 이상인데 이름이 비면 거부', hasErr(/코인 이름을 넣어 주세요/, [
  { name: '', sale: '100000000', acq: '1', heldBefore: 'no' },
  { name: '이더리움', sale: '100000000', acq: '1', heldBefore: 'no' },
]), true);
eq('C13b 서로 다른 종목이면 통과', V([
  { name: '비트코인', sale: '100000000', acq: '1', heldBefore: 'no' },
  { name: '이더리움', sale: '100000000', acq: '1', heldBefore: 'no' },
]), null);
eq('C13b 한 줄이면 이름 없어도 통과', V([{ name: '', sale: '100000000', acq: '1', heldBefore: 'no' }]), null);
eq('C13b 추계 선택 시 취득가액 없어도 통과', V([{ name: '', sale: '100000000', acq: '', heldBefore: 'no', estimate: 'yes' }]), null);
eq('C13b 추계 아닌데 취득가액 없으면 거부', hasErr(/실제 산 금액/, [{ name: '', sale: '100000000', acq: '', heldBefore: 'no' }]), true);
/* ★ 공개 함수 우회 — 화면 검증을 건너뛰고 jtCrCalc 을 직접 부르면 중복 종목도 계산됐다 (R30 P2).
   틀린 세액(12,650,000원)을 내놓느니 «거부»한다. */
const dupRows = [
  { name: '비트코인', sale: '100000000', acq: '', heldBefore: 'no', estimate: 'yes' },
  { name: '비트코인', sale: '100000000', acq: '90000000', heldBefore: 'no' },
];
var rDup = CR0({ rows: dupRows });
eq('C13b jtCrCalc 직접 호출도 중복 종목이면 거부', /두 줄에 있습니다/.test(rDup.error || ''), true);
chk('C13b 거부 시 세액 0 (틀린 12,650,000 을 내놓지 않는다)', rDup.total, 0);
eq('C13b 서로 다른 종목이면 정상 계산', CR0({ rows: [
  { name: '비트코인', sale: '100000000', acq: '50000000', heldBefore: 'no' },
  { name: '이더리움', sale: '100000000', acq: '50000000', heldBefore: 'no' },
] }).error || null, null);

console.log('\n════ CASE 13: 공개 함수 방어 — 음수 (R26) ════');
chk('C13 음수 매도가는 0으로', CR({ rows: [{ sale: '-100000000', acq: '1', heldBefore: 'no' }] }).sale, 0);

console.log(`\n════════════════════\n실패 ${fails}건`);
process.exit(fails ? 1 : 0);

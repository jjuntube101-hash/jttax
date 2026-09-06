'use strict';
/* 취득세 폴백 산식 회귀 — 6억~9억 «슬라이딩» 세율의 반올림 «단위»와 동률 처리 (260906~07, TASK-260906-022)

   ▣ 법정 산식
     지방세법 §11①8호 나목: 세율 = (취득당시가액 × 2/3억원 − 3) × 1/100, «소수점 이하 다섯째 자리에서 반올림하여 넷째 자리까지».
     반올림 대상은 ×1/100 까지 마친 «비율»이다 → 7억 0.016667 → 0.0167(=1.67%) → 본세 11,690,000 + 교육세 1,169,000 = 12,859,000.
     공식 예시(대덕구 취득세 안내·순천시 세율표): 7억 1.67%·11,690,000 / 8억 2.33%·18,640,000.

   ▣ 이력
     260906 Codex sol 라운드가 «백분율 넷째 자리(1.6667% → 12,833,590)»를 주장해 엔진·사이트·인사이트를 그렇게 고쳤다가
     review_high(astra)가 법문·공식 예시로 반증 → 원래 단위로 복귀. 남긴 개선 = 정수 절반올림(동률 699,750,000 → 0.0167)·
     본세와 교육세를 각각 원 단위 반올림(엔진과 1원까지 같게).

   ▣ 방법
     ReportAcquisition.jsx 에서 fallbackAcqTax 함수 본문을 잘라 내 실행한다(외부 참조 없음). 음성 대조군은 «오해석 산식»을
     주입해 12,833,590 이 «나오는지» 보여 이 시험이 그 결함을 구분함을 증명한다. 이 테스트는 «폴백»만 본다 —
     엔진(jt-tax-calc-mcp·fly)은 그쪽 tests/test_acquisition_mid_rate_260906.py 가 같은 값을 고정한다. */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'src', 'ReportAcquisition.jsx'), 'utf8');
const start = src.indexOf('function fallbackAcqTax(a) {');
if (start < 0) { console.error('FAIL  fallbackAcqTax 를 못 찾았다'); process.exit(1); }
let depth = 0, end = -1;
for (let i = src.indexOf('{', start); i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const body = src.slice(start, end);
const fn = new Function(body + '\nreturn fallbackAcqTax;')();
const calc = (f, v) => f({ propertyValue: v, propertyType: '주택', acquisitionType: '매매', housingCount: 1, isRegulatedArea: 'no' });

const CASES = [
  /* [가액, 기대 총액(본세+교육세, 85㎡ 이하 1주택 매매), 설명] */
  [500_000_000, 5_500_000, '5억: 1% + 0.1%'],
  [600_000_000, 6_600_000, '6억(경계): 1% + 0.1%'],
  [700_000_000, 12_859_000, '7억: 0.016667 → 0.0167(1.67%) → 11,690,000 + 1,169,000 (공식 예시)'],
  [800_000_000, 20_504_000, '8억: 0.0233 → 18,640,000 + 1,864,000 (공식 예시)'],
  [750_000_000, 16_500_000, '7.5억: 정확히 2% → 15,000,000 + 1,500,000'],
  [900_000_000, 29_700_000, '9억(경계): 3% + 0.3%'],
  [1_000_000_000, 33_000_000, '10억: 3% + 0.3%'],
  /* 정확한 동률 — 부동소수점 반올림이 갈릴 수 있는 자리. 절반올림(half-up), 엔진과 1원까지 같아야 한다. */
  /* ⚠️ 699,750,000 은 교육세가 정확히 1,168,582.5원 — JS Math.round(half-up)=…583, 엔진 Python round(half-even)=…582 로 1원 갈린다.
     국고금관리법 §47 10원 미만 절사 전 단계라 최종 납부액(12,854,400)은 같다. 폴백 기대값은 JS 규칙(…408)으로 둔다. */
  [699_750_000, 12_854_408, '699,750,000(동률 0.01665 → 0.0167): 11,685,825 + 1,168,582.5→1,168,583 (엔진은 half-even …407, 1원)'],
  [698_250_000, 12_750_045, '698,250,000(동률 0.01655 → 0.0166): 11,590,950 + 1,159,095'],
];

let fails = 0;
for (const [v, want, why] of CASES) {
  const got = calc(fn, v);
  const ok = got === want;
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + why + ' → ' + got.toLocaleString() + (ok ? '' : ' (기대 ' + want.toLocaleString() + ')'));
}

/* 음성 대조군: «백분율 넷째 자리» 오해석 산식(0.016667)을 주입하면 7억이 12,833,590 이 «나와야» 한다 — 위 7억 케이스가 그 결함을 구분한다는 증거 */
{
  const injected = body.replace(/Math\.floor\(\(v - 450_000_000 \+ 750_000\) \/ 1_500_000\) \/ 10_000/, 'Math.floor((v - 450_000_000 + 7_500) / 15_000) / 1_000_000');
  if (injected === body) { fails++; console.log('FAIL  음성 대조군 준비 실패 — 산식 줄을 못 찾았다(소스가 바뀌었으면 이 정규식을 갱신)'); }
  else {
    const wrongFn = new Function(injected + '\nreturn fallbackAcqTax;')();
    const w7 = calc(wrongFn, 700_000_000);
    const caught = w7 === 12_833_590;
    if (!caught) fails++;
    console.log((caught ? 'PASS  ' : 'FAIL  ') + '음성 대조군: 오해석 산식 주입 → 7억 ' + w7.toLocaleString() + (caught ? ' (결함을 구분한다)' : ' (12,833,590 이어야 하는데 다르다)'));
  }
}

if (fails) { console.error('\n[acq-rate] FAIL ' + fails + '건'); process.exit(1); }
console.log('[acq-rate] PASS — 6~9억 세율 = 비율 넷째 자리 절반올림, 7억 12,859,000 (공식 예시)');

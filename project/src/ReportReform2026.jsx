/* @jsx React.createElement */
/* ──────────────────────────────────────────────────────────────────────────
   2026년 세제개편안(2026.8.3 재정경제부 발표) 반영 — 연도별 세액 비교 계산기 2종
     ① JTReportReformCGT  : 양도소득세  (현행 vs '27 vs '28 vs '29~)
     ② JTReportReformCRE  : 종합부동산세 (현행 vs '27 vs '28~)

   ★ 설계 원칙
   1) 이 파일의 계산은 «정부안» 기준이다. 아직 국회를 통과한 법령이 아니므로
      확정법을 다루는 원격 엔진(jt-tax-engine)을 오염시키지 않도록
      **프론트 오버레이(자체 계산)** 로 구현한다. 엔진 호출 없음.
   2) 개편안 수치는 아래 REFORM SSOT 한 곳에만 둔다. 국회 심의로 값이 바뀌면
      여기만 고친다. 모든 값에 «출처 PDF + 페이지» 를 병기한다.
   3) 1차 소스 = 재정경제부 「2026년 세제개편안 개조식」(2026.8.3) p17~25.
      법령이 아니므로 jt-law-mcp 조회 대상이 아니다.

   ⚠️ 이 계산기는 국회 통과 전 정부안 기준의 «비교 시뮬레이션» 이다.
      확정 세액 계산은 현행법 기반의 기존 계산기(#/report/cgt·comprehensive)를 쓴다.
   ────────────────────────────────────────────────────────────────────────── */

const { useState: useRfState } = React;

const RF_EOK = 100000000;              // 1억
const rfNum = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')); return isFinite(n) ? n : 0; };
const rfWon = (n) => (window.formatWon ? window.formatWon(Math.round(n)) : (Math.round(n).toLocaleString('ko-KR') + '원'));
/* 억 단위 요약 표기 — 카드에서 큰 숫자를 한눈에 */
/* 요약 표기 — «절대 올려서 보이지 않게» 내림(floor)한다.
   99,995,000원이 「10,000만원」으로 보이면 1억을 넘긴 것처럼 읽힌다 (260805 Codex R11 P2).
   정확한 금액은 항상 원 단위(rfWon/crWon)로 옆에 병기된다. */
const jtEokFmt = (n, eok) => {
  const v = Math.round(n);
  const a = Math.abs(v), sign = v < 0 ? '-' : '';
  if (a < 10000) return v.toLocaleString('ko-KR') + '원';
  if (a < eok) {
    const man = Math.floor(a / 1000) / 10;                 // 만원, 소수 1자리, 내림
    const i = Math.floor(man), f = Math.round((man - i) * 10);
    return sign + i.toLocaleString('ko-KR') + (f ? '.' + f : '') + '만원';
  }
  const e = Math.floor(a / eok * 100) / 100;               // 억원, 소수 2자리, 내림
  return sign + e.toLocaleString('ko-KR') + '억원';
};
const rfEok = (n) => jtEokFmt(n, RF_EOK);

/* ══════════════════════════════════════════════════════════════════════════
   SSOT — 개편안 수치 (출처: 「2026년 세제개편안 개조식」 2026.8.3)
   ══════════════════════════════════════════════════════════════════════════ */
window.JT_REFORM_2026 = {
  source: '재정경제부 「2026년 세제개편안」(2026.8.3 발표) — 개조식 p17~25',
  notice: '국회 심의·의결 전 «정부안» 입니다. 입법 과정에서 내용이 달라질 수 있습니다.',

  /* ── 소득세 기본세율 (소득세법 §55①, 양도소득 §104① 준용) — 현행, 개편 대상 아님 ── */
  incomeBrackets: [
    { upTo: 14000000, rate: 0.06, deduct: 0 },
    { upTo: 50000000, rate: 0.15, deduct: 1260000 },
    { upTo: 88000000, rate: 0.24, deduct: 5760000 },
    { upTo: 150000000, rate: 0.35, deduct: 15440000 },
    { upTo: 300000000, rate: 0.38, deduct: 19940000 },
    { upTo: 500000000, rate: 0.40, deduct: 25940000 },
    { upTo: 1000000000, rate: 0.42, deduct: 35940000 },
    { upTo: Infinity, rate: 0.45, deduct: 65940000 },
  ],

  /* ── 양도소득세 (개조식 p19~22) ─────────────────────────────────────── */
  cgt: {
    /* 1세대1주택 고가주택 기준 (소득세법 §89①3호·시행령 §156①) — 현행, 개편 대상 아님 */
    highValueThreshold: 1200000000,

    /* 단기보유 세율 (소득세법 §104①2호·3호) — 개편 대상 아님, 현행.
       주택·조합원입주권 기준. 둘 이상 해당 시 큰 세액(§104⑤). */
    shortTermRates: { under1y: 0.70, under2y: 0.60 },

    /* 장기보유특별공제 → 「장기거주소득공제」 개편 (개조식 p19)
       one   : 1세대 1주택자   / multi : 다주택자(비조정대상지역)
       ※ 다주택자가 조정대상지역 주택 양도 시에는 현행과 같이 장특공제 배제(거주공제도 배제) */
    ltd: {
      2026: { one: { holdPer: 0.04, holdMax: 0.40, resPer: 0.04, resMax: 0.40, cap: 0.80 },
              multi: { holdPer: 0.02, holdMax: 0.30, resPer: 0, resMax: 0, cap: 0.30 } },
      2027: { one: { holdPer: 0.04, holdMax: 0.40, resPer: 0.04, resMax: 0.40, cap: 0.80 },
              multi: { holdPer: 0.02, holdMax: 0.30, resPer: 0, resMax: 0, cap: 0.30 } },
      2028: { one: { holdPer: 0.02, holdMax: 0.20, resPer: 0.06, resMax: 0.60, cap: 0.80 },
              /* '28 다주택: 「보유 연1%(최대15%)」 또는 「거주 연2%(최대30%)」 중 유리한 쪽 */
              multi: { altHold: { per: 0.01, max: 0.15 }, altRes: { per: 0.02, max: 0.30 }, cap: 0.30 } },
      2029: { one: { holdPer: 0, holdMax: 0, resPer: 0.08, resMax: 0.80, cap: 0.80 },
              multi: { holdPer: 0, holdMax: 0, resPer: 0.02, resMax: 0.30, cap: 0.30 } },
    },
    /* 장기거주소득공제 «금액» 한도 신설 (개조식 p19) — null = 한도 없음 */
    ltdCap: { 2026: null, 2027: null, 2028: 2000000000, 2029: 1000000000 },
    /* 공제 적용 최대 연수 */
    ltdYears: { one: 10, multi: 15 },

    /* 양도소득 기본공제 (소득세법 §103①) — 현행 연 250만원.
       개편: 10년 이상 «거주» 한 양도가액 30억원 이하 1세대1주택은 연 2,500만원 (개조식 p20) */
    basicDeduct: 2500000,
    basicDeductLongRes: {
      amount: 25000000, minResYears: 10, maxTransferPrice: 3000000000,
      /* ★ '27.1.1. 이후 양도분부터 — 장특공제 이원화(1년 유예, '28 시행)와 달리 이 항목은 유예가 없다.
         (개조식 p22 · 상세본 p81 · 문답 p52~53 — 4개 PDF 교차검증 260804) */
      from: 2027,
    },

    /* 다주택자 조정대상지역 주택 양도세 중과세율 — 한시 완화 (개조식 p20)
       기본세율에 더하는 %p. '26년 중 중과를 적용받은 양도분도 '27년 완화 대상에 포함. */
    surcharge: {
      2026: { two: 0.20, three: 0.30 },
      2027: { two: 0.05, three: 0.10 },
      2028: { two: 0.10, three: 0.15 },
      2029: { two: 0.20, three: 0.30 },
    },

    /* 고령 1주택자 한시 감면 (조특법 신설, 개조식 p20)
       65세 이상 1주택자가 수도권 주택을 처분하고 비수도권 이주 시.
       ※ 양도일부터 5년 내 수도권 이주·수도권 주택 취득 시 감면세액 추징 */
    seniorRelief: {
      minAge: 65,
      minResYears: 5,      // 보유기간 중 총 5년 이상 거주

      2026: null,
      2027: { rate: 0.50, cap: 500000000 },
      2028: { rate: 0.30, cap: 300000000 },
      2029: null,
    },
  },

  /* ── 종합부동산세 (개조식 p18~19) ───────────────────────────────────── */
  cre: {
    /* 기본공제 (개조식 p18)
       1주택: 현행 12억 → 거주용 14억 / 비거주 9억
       그 외: 현행 9억 → 4억 + 5억 × (거주용주택가액 ÷ 주택가액합계액) */
    basicDeduct: {
      2026: { one: 1200000000, oneNonRes: 1200000000, multi: 900000000, multiFormula: false },
      2027: { one: 1400000000, oneNonRes: 900000000, multi: 400000000, multiFormula: true, multiBonus: 500000000 },
      2028: { one: 1400000000, oneNonRes: 900000000, multi: 400000000, multiFormula: true, multiBonus: 500000000 },
    },
    /* 공정시장가액비율 (개조식 p18)
       1세대1주택자·지방 1·2주택자 : 60% → ('27 이후) 70%
       3주택 이상 / 조정대상지역 주택 보유(1세대1주택자 제외) : 60% → ('27) 70% → ('28 이후) 80% */
    fairRatio: {
      2026: { light: 0.60, heavy: 0.60 },
      2027: { light: 0.70, heavy: 0.70 },
      2028: { light: 0.70, heavy: 0.80 },
    },
    /* 주택분 세율 — 「주택 수 기준」에서 「주택 가액 기준」으로 단계적 일원화 (개조식 p18)
       ⚠️ 6~12억 구간 1.0%→1.3% 인상. 병합셀 판독은 REFORM_VERIFY 주석 참조. */
    rates: {
      2026: {
        light: [{ upTo: 300000000, r: 0.005 }, { upTo: 600000000, r: 0.007 }, { upTo: 1200000000, r: 0.010 },
                { upTo: 2500000000, r: 0.013 }, { upTo: 5000000000, r: 0.015 }, { upTo: 9400000000, r: 0.020 },
                { upTo: Infinity, r: 0.027 }],
        heavy: [{ upTo: 300000000, r: 0.005 }, { upTo: 600000000, r: 0.007 }, { upTo: 1200000000, r: 0.010 },
                { upTo: 2500000000, r: 0.020 }, { upTo: 5000000000, r: 0.030 }, { upTo: 9400000000, r: 0.040 },
                { upTo: Infinity, r: 0.050 }],
      },
      2027: {
        light: [{ upTo: 300000000, r: 0.005 }, { upTo: 600000000, r: 0.007 }, { upTo: 1200000000, r: 0.013 },
                { upTo: 2500000000, r: 0.015 }, { upTo: 5000000000, r: 0.020 }, { upTo: 9400000000, r: 0.027 },
                { upTo: Infinity, r: 0.035 }],
        heavy: [{ upTo: 300000000, r: 0.005 }, { upTo: 600000000, r: 0.007 }, { upTo: 1200000000, r: 0.013 },
                { upTo: 2500000000, r: 0.020 }, { upTo: 5000000000, r: 0.030 }, { upTo: 9400000000, r: 0.040 },
                { upTo: Infinity, r: 0.050 }],
      },
      /* '28년~ 주택 수와 무관한 «모든 주택» 단일표 */
      2028: {
        light: [{ upTo: 300000000, r: 0.005 }, { upTo: 600000000, r: 0.007 }, { upTo: 1200000000, r: 0.013 },
                { upTo: 2500000000, r: 0.020 }, { upTo: 5000000000, r: 0.030 }, { upTo: 9400000000, r: 0.040 },
                { upTo: Infinity, r: 0.050 }],
        heavy: [{ upTo: 300000000, r: 0.005 }, { upTo: 600000000, r: 0.007 }, { upTo: 1200000000, r: 0.013 },
                { upTo: 2500000000, r: 0.020 }, { upTo: 5000000000, r: 0.030 }, { upTo: 9400000000, r: 0.040 },
                { upTo: Infinity, r: 0.050 }],
      },
    },
    /* 1세대1주택자 세액공제 (개조식 p19) — 연령별 + 보유/거주별, 합계 한도 80% */
    ageCredit: [{ minAge: 70, r: 0.40 }, { minAge: 65, r: 0.30 }, { minAge: 60, r: 0.20 }],
    holdResCredit: {
      /* 현행: 보유공제만 */
      2026: { hold: [{ y: 15, r: 0.50 }, { y: 10, r: 0.40 }, { y: 5, r: 0.20 }], res: null, pick: 'hold' },
      /* '27: 보유공제의 1/2과 거주공제 중 «높은» 공제율 적용 */
      2027: { hold: [{ y: 15, r: 0.25 }, { y: 10, r: 0.20 }, { y: 5, r: 0.10 }],
              res: [{ y: 15, r: 0.50 }, { y: 10, r: 0.40 }, { y: 5, r: 0.20 }], pick: 'max' },
      /* '28~: 거주공제로 완전 전환 */
      2028: { hold: null, res: [{ y: 15, r: 0.50 }, { y: 10, r: 0.40 }, { y: 5, r: 0.20 }], pick: 'res' },
    },
    creditRateCap: 0.80,
    /* 세액공제 «금액» 한도 신설 — 현행 없음 → '27 800만원 → '28 이후 600만원 */
    creditAmountCap: { 2026: null, 2027: 8000000, 2028: 6000000 },
    /* 세부담 상한 150% → 200% (개조식 p19) — 직전연도 보유세를 모르면 적용 불가 */
    burdenCap: { 2026: 1.50, 2027: 2.00, 2028: 2.00 },
    /* 농어촌특별세 = 종합부동산세액의 20% (농특세법 §5①) — 현행, 개편 대상 아님 */
    ruralSurtaxRate: 0.20,
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   계산 엔진 — 양도소득세
   ══════════════════════════════════════════════════════════════════════════ */
function rfProgressiveTax(base, brackets) {
  if (base <= 0) return { tax: 0, rate: 0, deduct: 0 };
  for (const b of brackets) {
    if (base <= b.upTo) return { tax: Math.max(0, base * b.rate - b.deduct), rate: b.rate, deduct: b.deduct };
  }
  const last = brackets[brackets.length - 1];
  return { tax: Math.max(0, base * last.rate - last.deduct), rate: last.rate, deduct: last.deduct };
}
/* 구간 누진 (종부세 — 누진공제 없이 구간별 적용) */
function rfBracketTax(base, table) {
  if (base <= 0) return 0;
  let tax = 0, prev = 0;
  for (const b of table) {
    if (base <= prev) break;
    const slice = Math.min(base, b.upTo) - prev;
    if (slice > 0) tax += slice * b.r;
    prev = b.upTo;
  }
  return Math.round(tax);        // 부동소수점 누적 오차 제거 (rfCalcCGT 주석 참조)
}

function rfCalcCGT(input, year) {
  const R = window.JT_REFORM_2026, C = R.cgt;
  const price = rfNum(input.transferPrice);
  const acq = rfNum(input.acqPrice);
  const exp = rfNum(input.expenses);
  const hold = rfNum(input.holdYears);
  const res = rfNum(input.resYears);
  const houses = input.houses || 'one';                 // one | two | three
  const adjusted = input.adjusted === 'yes';            // 조정대상지역 소재
  const age = rfNum(input.age);
  const seniorMove = input.seniorMove === 'yes';        // 비수도권 이주 (고령 특례)
  const isOne = houses === 'one';
  const steps = [];

  /* 1. 양도차익 */
  const gain = Math.max(0, price - acq - exp);
  steps.push({ k: '양도차익', v: gain, note: `양도가액 ${rfWon(price)} − 취득가액 ${rfWon(acq)} − 필요경비 ${rfWon(exp)}` });

  /* 2. 1세대1주택 고가주택 — 12억 초과분만 과세
     ⚠️ 종전엔 «보유 2년»만 봤다. 2017.8.3. 이후 «취득 당시» 조정대상지역이었던 주택은
        보유 2년 + «거주 2년»을 모두 채워야 비과세다(소득세법 시행령 §154①).
        이걸 안 보면 거주 0년인 조정지역 취득분이 0원으로 나온다 (260805 Codex P1). */
  const acqAdjusted = input.acqAdjusted === 'yes';   // 취득 당시 조정대상지역이었나
  const needResidence = acqAdjusted;                 // 그렇다면 거주 2년까지 필요
  const exemptOK = isOne && hold >= 2 && (!needResidence || res >= 2);
  let taxableGain = gain, exemptNote = '';
  if (isOne && !exemptOK) {
    steps.push({
      k: '1세대1주택 비과세 배제', v: 0,
      note: hold < 2
        ? `보유 ${hold}년 — 2년 미만이라 비과세 요건 미충족`
        : `취득 당시 조정대상지역 주택은 «거주 2년»도 필요합니다 (거주 ${res}년) — 시행령 §154①`,
    });
  }
  if (exemptOK) {
    if (price <= C.highValueThreshold) {
      taxableGain = 0;
      exemptNote = `1세대1주택 비과세 — 양도가액이 ${rfEok(C.highValueThreshold)} 이하`;
    } else {
      taxableGain = gain * (price - C.highValueThreshold) / price;
      exemptNote = `1세대1주택 고가주택 — ${rfEok(C.highValueThreshold)} 초과분만 과세`;
    }
    steps.push({ k: '과세대상 양도차익', v: taxableGain, note: exemptNote });
  }

  /* 3. 장기보유특별공제(개정 「장기거주소득공제」)
     ⚠️ 소득세법 §95② 단서 — 표2(보유+거주, 최대 80%)는 «대통령령으로 정하는
        1세대 1주택»에만 적용된다. 거주요건 미달 등으로 비과세가 배제되면 1주택이라도
        표1(보유만, 최대 30%)이다. 종전엔 isOne 만 보고 표2를 적용해 공제를 과다
        계상했다 (260805, 1차 소스 §95② 확인).
        ※ 개편안은 「1세대1주택자」와 「다주택자(비조정)」 두 줄만 제시하므로,
          비과세 배제 1주택은 후자(표1 계열)로 본다 — 정부안 해석. */
  const kind = exemptOK ? 'one' : 'multi';
  const cfg = C.ltd[year][kind];
  const maxY = C.ltdYears[kind];
  let ltdRate = 0, ltdNote = '';
  if (!isOne && adjusted) {
    ltdRate = 0;
    ltdNote = '다주택자 조정대상지역 주택 — 장특공제 배제';
  } else if (hold < 3) {
    ltdRate = 0;
    ltdNote = '보유 3년 미만 — 장특공제 대상 아님';
  } else if (cfg.altHold) {                     // '28 다주택: 보유 or 거주 중 유리한 쪽
    const a = Math.min(Math.min(hold, maxY) * cfg.altHold.per, cfg.altHold.max);
    /* 거주공제는 2년 이상 거주한 경우에만 적용 (상세본 p69~72) */
    const b = res < 2 ? 0 : Math.min(Math.min(res, maxY) * cfg.altRes.per, cfg.altRes.max);
    ltdRate = Math.max(a, b);
    ltdNote = `보유 연1%(${(a * 100).toFixed(0)}%) 또는 거주 연2%(${(b * 100).toFixed(0)}%) 중 유리한 쪽`
      + (res > 0 && res < 2 ? ' · 거주 2년 미만이라 거주공제 배제' : '');
  } else {
    const h = Math.min(Math.min(hold, maxY) * cfg.holdPer, cfg.holdMax);
    /* 1세대1주택 거주공제는 2년 이상 거주가 전제 (소득세법 §95② 표2) */
    const r = (isOne && res < 2) ? 0 : Math.min(Math.min(res, maxY) * cfg.resPer, cfg.resMax);
    ltdRate = Math.min(h + r, cfg.cap);
    ltdNote = isOne
      ? `보유 ${(h * 100).toFixed(0)}% + 거주 ${(r * 100).toFixed(0)}%`
      : `보유 ${(h * 100).toFixed(0)}%${r > 0 ? ` + 거주 ${(r * 100).toFixed(0)}%` : ''}`;
    if (isOne && res < 2 && cfg.resPer > 0) ltdNote += ' (거주 2년 미만 → 거주공제 0)';
  }
  let ltdAmount = taxableGain * ltdRate;
  const amtCap = C.ltdCap[year];
  let capped = false;
  if (amtCap != null && ltdAmount > amtCap) { ltdAmount = amtCap; capped = true; }
  steps.push({
    k: `장기보유특별공제 (${(ltdRate * 100).toFixed(0)}%)`, v: -ltdAmount,
    note: ltdNote + (capped ? ` · 공제 한도 ${rfEok(amtCap)} 적용` : ''),
  });

  /* 4. 양도소득금액 → 기본공제 → 과세표준 */
  const incomeAmt = Math.max(0, taxableGain - ltdAmount);
  const bd = C.basicDeductLongRes;
  const useBigBasic = isOne && year >= bd.from && res >= bd.minResYears && price <= bd.maxTransferPrice;
  const basic = useBigBasic ? bd.amount : C.basicDeduct;
  steps.push({
    k: '양도소득 기본공제', v: -Math.min(basic, incomeAmt),
    note: useBigBasic ? `10년 이상 거주·양도가액 ${rfEok(bd.maxTransferPrice)} 이하 1주택 → 연 ${rfWon(bd.amount)}` : '연 250만원',
  });
  const base = Math.max(0, Math.floor((incomeAmt - Math.min(basic, incomeAmt)) / 1000) * 1000);

  /* 5. 세율 — 기본세율 + 다주택 조정지역 중과, 그리고 «단기보유 세율»과 비교과세
     ⚠️ 종전엔 단기보유 세율이 아예 없어, 보유 1년 미만도 기본세율(6~45%)로 계산했다.
        1.5년을 넣으면(위 P0-a 수정 전) 15년으로 읽혀 비과세까지 나왔다 (260805 Codex P0).
     소득세법 §104①2호·3호: 주택·조합원입주권은 1년 미만 70%, 1년 이상 2년 미만 60%.
     같은 조 ⑤: 둘 이상 해당하면 «큰 세액». 중과와 단기 중 큰 쪽을 취한다. */
  const br = rfProgressiveTax(base, R.incomeBrackets);
  let sur = 0, surNote = '';
  if (!isOne && adjusted) {
    /* ⚠️ '27~'28 한시 완화는 «보유기간 2년 이상»인 경우에 한정된다(개조식 p22 각주).
       2년 미만이면 완화 없이 원래 중과율(+20/+30%p)이다. 종전엔 보유기간을 보지
       않아 보유 1.5년 3주택이 1억855만원 과소계산됐다 (260805 Codex R10 P1). */
    const relaxed = hold >= 2;
    const rateYear = relaxed ? year : 2026;   // 2026·2029 가 원래 중과율
    sur = C.surcharge[rateYear][houses === 'three' ? 'three' : 'two'];
    surNote = `${houses === 'three' ? '3주택 이상' : '2주택'} 조정대상지역 중과 +${(sur * 100).toFixed(0)}%p`
      + (!relaxed && year >= 2027 && year <= 2028 ? ` (보유 ${hold}년 — 2년 미만이라 한시 완화 대상 아님)` : '');
  }
  /* ★ Math.round 선행 필수 — 0.42+0.15 가 0.5700000000000001 이 되어
     산출세액이 …999.99994 로 떨어지면 뒤의 10원 절사가 10원을 더 깎는다(260804 실측). */
  const taxBasic = base > 0 ? Math.max(0, Math.round(base * (br.rate + sur) - br.deduct)) : 0;
  const shortRate = hold < 1 ? C.shortTermRates.under1y : (hold < 2 ? C.shortTermRates.under2y : 0);
  const taxShort = shortRate ? Math.round(base * shortRate) : 0;
  let tax = Math.max(taxBasic, taxShort);
  const usedShort = taxShort > taxBasic;
  steps.push({
    k: '산출세액', v: tax,
    note: usedShort
      ? `보유 ${hold}년 — 단기보유 세율 ${(shortRate * 100).toFixed(0)}% 적용 (소득세법 §104①, 비교과세 §104⑤). 과세표준 ${rfWon(base)} × ${(shortRate * 100).toFixed(0)}%`
      : `과세표준 ${rfWon(base)} × ${((br.rate + sur) * 100).toFixed(0)}% − 누진공제 ${rfWon(br.deduct)}${surNote ? ' · ' + surNote : ''}`
        + (shortRate ? ` (단기보유 ${(shortRate * 100).toFixed(0)}%보다 큼)` : ''),
  });

  /* 6. 고령 1주택자 한시 감면 */
  let relief = 0, reliefNote = '';
  const sr = C.seniorRelief[year];
  /* ⚠️ 종전엔 나이·1주택·이주 의사만 봤다. 조특법 신설안은 «5년 이상 거주» +
        «양도일 현재 2년 이상 계속 거주»가 요건이다. 거주 0년인데도 감면이
        붙던 것을 막는다 (260805 Codex P1). */
  const seniorResOK = res >= C.seniorRelief.minResYears && input.seniorLive2y === 'yes';
  if (isOne && seniorMove && age >= C.seniorRelief.minAge && sr && !seniorResOK) {
    steps.push({
      k: '고령 1주택자 감면 배제', v: 0,
      note: res < C.seniorRelief.minResYears
        ? `거주 ${res}년 — 5년 이상 거주 요건 미충족`
        : '양도일 현재 2년 이상 계속 거주 요건 미충족',
    });
  }
  if (isOne && seniorMove && age >= C.seniorRelief.minAge && sr && seniorResOK) {
    relief = Math.min(tax * sr.rate, sr.cap);
    reliefNote = `65세 이상 1주택자 비수도권 이주 — ${(sr.rate * 100).toFixed(0)}% 감면(한도 ${rfEok(sr.cap)})`;
    tax -= relief;
    steps.push({ k: '고령 1주택자 감면', v: -relief, note: reliefNote });
  }

  /* 7. 지방소득세 */
  tax = Math.round(tax);
  const local = Math.floor(Math.round(tax * 0.1) / 10) * 10;
  const total = Math.floor(tax / 10) * 10 + local;
  steps.push({ k: '지방소득세 (10%)', v: local, note: '지방세법 §103의3' });

  return {
    year, total, tax: Math.floor(tax / 10) * 10, local, base, ltdRate, ltdAmount,
    surcharge: sur, relief, basicDeduct: basic, taxableGain, gain, steps,
    effRate: gain > 0 ? total / gain : 0,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   계산 엔진 — 종합부동산세
   ══════════════════════════════════════════════════════════════════════════ */
function rfCalcCRE(input, year) {
  const R = window.JT_REFORM_2026, C = R.cre;
  const totalValue = rfNum(input.totalValue);
  const houses = input.houses || 'one';            // one | two | three
  const isRes = input.isResident !== 'no';         // 본인 거주 여부 (1주택)
  const resValue = rfNum(input.residentValue);     // 다주택 — 거주용 주택 공시가격
  const age = rfNum(input.age);
  const holdY = rfNum(input.holdYears);
  const resY = rfNum(input.resYears);
  const adjusted = input.adjusted === 'yes';       // 조정대상지역 주택 보유
  const isOne = houses === 'one';
  const steps = [];

  /* 1. 기본공제 */
  const bdCfg = C.basicDeduct[year];
  let deduct, dNote;
  if (isOne) {
    deduct = isRes ? bdCfg.one : bdCfg.oneNonRes;
    dNote = year === 2026 ? '1세대 1주택자 12억원'
      : (isRes ? '거주용 1주택 — 14억원' : '비거주 1주택 — 9억원 (거주하지 않으면 공제 축소)');
  } else if (bdCfg.multiFormula) {
    const ratio = totalValue > 0 ? Math.min(1, resValue / totalValue) : 0;
    deduct = bdCfg.multi + bdCfg.multiBonus * ratio;
    dNote = `4억원 + 5억원 × (거주용 ${rfEok(resValue)} ÷ 합계 ${rfEok(totalValue)} = ${(ratio * 100).toFixed(1)}%)`;
  } else {
    deduct = bdCfg.multi;
    dNote = '1세대 1주택 외 — 9억원';
  }
  steps.push({ k: '기본공제', v: -deduct, note: dNote });

  /* 2. 과세표준 = (공시합계 − 기본공제) × 공정시장가액비율 */
  const heavy = !isOne && (houses === 'three' || adjusted);
  const ratio = C.fairRatio[year][heavy ? 'heavy' : 'light'];
  const excess = Math.max(0, totalValue - deduct);
  const base = Math.floor(excess * ratio);
  steps.push({
    k: `과세표준 (공정시장가액비율 ${(ratio * 100).toFixed(0)}%)`, v: base,
    note: `(공시합계 ${rfWon(totalValue)} − 공제 ${rfWon(deduct)}) × ${(ratio * 100).toFixed(0)}%`,
  });

  /* 3. 세율 적용 */
  const table = C.rates[year][heavy ? 'heavy' : 'light'];
  const gross = rfBracketTax(base, table);
  steps.push({
    k: '종부세 산출세액', v: gross,
    note: year >= 2028 ? '주택 수와 무관한 «가액 기준» 단일 세율표'
      : (heavy ? '3주택 이상·조정대상지역 세율' : '1·2주택 세율'),
  });

  /* 4. 1세대1주택 세액공제 (연령 + 보유/거주) */
  let credit = 0, cNote = '해당 없음';
  if (isOne && gross > 0) {
    const ac = (C.ageCredit.find((a) => age >= a.minAge) || { r: 0 }).r;
    const hr = C.holdResCredit[year];
    const pickRate = (tbl, y) => tbl ? ((tbl.find((t) => y >= t.y) || { r: 0 }).r) : 0;
    let hrRate = 0, hrLabel = '';
    if (hr.pick === 'hold') { hrRate = pickRate(hr.hold, holdY); hrLabel = `보유 ${(hrRate * 100).toFixed(0)}%`; }
    else if (hr.pick === 'res') { hrRate = pickRate(hr.res, resY); hrLabel = `거주 ${(hrRate * 100).toFixed(0)}%`; }
    else {
      const a = pickRate(hr.hold, holdY), b = pickRate(hr.res, resY);
      hrRate = Math.max(a, b);
      hrLabel = `보유공제 1/2(${(a * 100).toFixed(0)}%)·거주공제(${(b * 100).toFixed(0)}%) 중 높은 쪽`;
    }
    const rate = Math.min(ac + hrRate, C.creditRateCap);
    credit = gross * rate;
    const cap = C.creditAmountCap[year];
    let capped = false;
    if (cap != null && credit > cap) { credit = cap; capped = true; }
    cNote = `연령 ${(ac * 100).toFixed(0)}% + ${hrLabel} = ${(rate * 100).toFixed(0)}%` + (capped ? ` · 공제 한도 ${rfWon(cap)} 적용` : '');
    steps.push({ k: '1세대1주택 세액공제', v: -credit, note: cNote });
  }

  const net = Math.round(Math.max(0, gross - credit));
  /* 5. 농어촌특별세 */
  const rural = Math.floor(Math.round(net * C.ruralSurtaxRate) / 10) * 10;
  steps.push({ k: '농어촌특별세 (20%)', v: rural, note: '농어촌특별세법 §5①' });

  return {
    year, gross, credit, net: Math.floor(net / 10) * 10, rural,
    total: Math.floor(net / 10) * 10 + rural, base, deduct, fairRatio: ratio, heavy, steps,
  };
}

window.jtRfCalcCGT = rfCalcCGT;
window.jtRfCalcCRE = rfCalcCRE;

/* ══════════════════════════════════════════════════════════════════════════
   공용 UI 조각
   ══════════════════════════════════════════════════════════════════════════ */
function RfNotice() {
  const R = window.JT_REFORM_2026;
  return (
    <div className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '13px 17px', borderRadius: 8, marginBottom: 18 }}>
      <strong style={{ display: 'block', marginBottom: 5 }}>⚠️ 국회 통과 전 «정부안» 기준입니다</strong>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65 }}>
        {R.notice} 출처: {R.source}. 현행법 기준의 확정 세액은{' '}
        <a href="#/report" style={{ textDecoration: 'underline' }}>기존 세금 계산기</a>에서 계산하세요.
      </p>
    </div>
  );
}

/* 연도별 비교 카드 */
function RfYearCards({ rows, baseYear, unitLabel }) {
  const baseRow = rows.find((r) => r.year === baseYear) || rows[0];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(170px, 1fr))`, gap: 12, marginBottom: 22 }}>
      {rows.map((r) => {
        const diff = r.total - baseRow.total;
        const isBase = r.year === baseYear;
        const up = diff > 0;
        return (
          <div key={r.year} style={{
            border: isBase ? '2px solid #2a3038' : '1px solid #dcd8d0',
            background: isBase ? '#f7f5f0' : '#fff',
            borderRadius: 10, padding: '15px 16px',
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.03em', color: isBase ? '#2a3038' : '#7b756b', marginBottom: 7 }}>
              {r.label}
            </div>
            <div style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.25, marginBottom: 6, wordBreak: 'keep-all' }}>
              {rfEok(r.total)}
            </div>
            <div style={{ fontSize: 12.5, color: '#7b756b', marginBottom: 8 }}>{rfWon(r.total)}</div>
            {isBase ? (
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#7b756b' }}>기준 (현행)</div>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 800, color: diff === 0 ? '#7b756b' : (up ? '#b3261e' : '#1e6b45') }}>
                {diff === 0 ? '변동 없음' : `${up ? '▲ +' : '▼ '}${rfEok(Math.abs(diff))}`}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* 단계별 계산 내역 */
function RfSteps({ steps, title }) {
  return (
    <section className="jt-report-result__section">
      <h3 style={{ fontSize: 16, marginBottom: 10 }}>{title}</h3>
      <div style={{ border: '1px solid #e5e1d9', borderRadius: 8, overflow: 'hidden' }}>
        {steps.map((s, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start',
            padding: '11px 15px', borderTop: i ? '1px solid #efece6' : 'none',
            background: i % 2 ? '#fbfaf8' : '#fff',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{s.k}</div>
              {s.note && <div style={{ fontSize: 12.5, color: '#7b756b', marginTop: 3, lineHeight: 1.55 }}>{s.note}</div>}
            </div>
            <div style={{ fontWeight: 800, fontSize: 14.5, whiteSpace: 'nowrap', color: s.v < 0 ? '#1e6b45' : '#2a3038' }}>
              {s.v < 0 ? '−' : ''}{rfWon(Math.abs(s.v))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* 다른 계산기로 유도 (크로스 노출) */
function RfCrossLinks({ setSubRoute, exclude }) {
  const all = [
    { sub: 'cgt', kr: '양도소득세 계산기', d: '현행법 기준 정식 계산 — 비과세·중과·입주권까지' },
    { sub: 'comprehensive', kr: '종합부동산세 계산기', d: '재산세 공제까지 반영한 현행법 기준 계산' },
    { sub: 'property', kr: '재산세 계산기', d: '6월 1일 기준 보유세 — 공시가격 자동 조회' },
    { sub: 'acquisition', kr: '취득세 계산기', d: '살 때 내는 세금 — 다주택 중과·생애최초 감면' },
    { sub: 'gift', kr: '증여세 계산기', d: '10년 합산·부담부증여까지' },
    { sub: 'inheritance', kr: '상속세 계산기', d: '배우자·자녀 공제와 사전증여 합산' },
    { sub: 'compare', kr: '처분방법 비교', d: '증여 vs 매매 vs 상속 — 어느 길이 유리한가' },
  ].filter((x) => !(exclude || []).includes(x.sub));
  return (
    <section className="jt-report-result__section">
      <h3 style={{ fontSize: 16, marginBottom: 4 }}>다른 세금도 계산해 보세요</h3>
      <p style={{ fontSize: 13.5, color: '#7b756b', margin: '0 0 12px' }}>모두 무료 · 로그인 불필요 · 입력값은 저장하지 않습니다.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 10 }}>
        {all.map((x) => (
          <button key={x.sub} onClick={() => setSubRoute && setSubRoute(x.sub)} style={{
            textAlign: 'left', border: '1px solid #dcd8d0', borderRadius: 9, padding: '13px 15px',
            background: '#fff', cursor: 'pointer', font: 'inherit',
          }}>
            <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 4 }}>{x.kr} <span style={{ color: '#b0a89b' }}>→</span></div>
            <div style={{ fontSize: 12.5, color: '#7b756b', lineHeight: 1.5 }}>{x.d}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   주소 자동조회 — 공시가격 / 조정대상지역
   엔진 헬퍼 window.jtLookupHousePrice(주소, unit) 를 재사용한다(ReportProperty.jsx 정의).

   ★ 동·호는 «주소 문자열»이 아니라 «별도 필드»로 넘겨야 한다 (260805 실측)
   엔진은 address 안의 "102동 601호" 를 파싱하지 않는다. 실증:
     {address:'정릉로 305, 102동 601호'}        → needs_unit (860세대)
     {address:'정릉로 305', dong:'102', ho:'601'} → 411,000,000원
   종전 이 컴포넌트는 주소 한 줄만 넘겨, 사용자가 동·호를 같이 써도 늘 되물었다.
   → ① 주소에서 동·호를 «자동 추출»해 필드로 분리해 넘긴다
      ② 그래도 세대가 여럿이면 동·호 입력칸을 띄워 되묻는다(기존 계산기와 같은 방식)

   ★ 목록 모델 (R6~): 조회한 주소를 picks 로 들고 합계를 파생. 「빼기」로 되돌린다.
   ★ 에폭 (R8~R9): 조회 시작·수동 입력 때 증가. 응답은 시작 시점 에폭과 같을 때만 반영.
   ══════════════════════════════════════════════════════════════════════════ */

/* 주소 문자열에서 동·호를 뽑아낸다.
   잡는 것:  101동 / 101-1동 / A101동 / 제101동 / 601호 / B102호
   안 잡는 것(중요):
     · 「도곡동」·「정릉동」 — 법정동. 숫자가 아예 없다
     · 「상계1동」·「목1동」 — 행정동. 숫자는 있지만 **앞이 한글**이다
   그래서 동·호 앞은 «문장 시작·공백·쉼표·괄호»여야 하고, 뒤에 한글이 붙으면 안 된다
   (「1호선」의 '선'). 잡아낸 앞 글자는 그대로 되돌려 붙여 주소를 훼손하지 않는다. */
/* 전각 문자를 «패턴에» 직접 넣는다.
   ⚠️ 주소 전체에 NFKC 를 걸면 안 된다 (Codex R18 P2). NFKC 는 단위·기호까지 바꿔
      아파트명 「자이Ⅱ」→「자이II」, 「84㎡」→「84m2」, 「㈜」→「(주)」 가 되어
      엔진에 **원문과 다른 주소**를 보내게 된다. 정규화는 «뽑아낸 동·호 토큰»에만 건다. */
const RF_D = '0-9０-９';                       // 숫자 (반각+전각)
const RF_L = 'A-Za-zＡ-Ｚａ-ｚ';       // 영문 (반각+전각)
/* ⚠️ 문자 클래스 안에서 하이픈은 «맨 끝»에 둔다. '\\--－' 로 쓰면 U+002D~U+FF0D «범위»가
   되어 숫자·괄호·쉼표까지 전부 삼킨다 (260805에 실제로 그렇게 만들었다가 테스트가 잡음). */
const RF_HY = '－\\-';                                 // 하이픈 (전각+반각, R21 P2)
const RF_SEP = '\\s,，·';                              // 앞 경계로 인정할 구분자
/* 동·호 토큰: 「101」「101-1」「A101」「B」 — 문자만 있는 동(B동·C동)도 실데이터에 있다 (R18 P2) */
const RF_UNIT = '((?:[' + RF_L + '][' + RF_D + ']*|[' + RF_D + ']+)(?:[' + RF_HY + '][' + RF_D + ']+)?)';
/* 앞 경계에 전각 쉼표「，」·가운뎃점「·」도 넣는다 — 한글 IME 로 치면 흔히 나온다 (R21 P2) */
const rfUnitRe = (tail) => new RegExp(
  '(^|[' + RF_SEP + '(（])(?:제\\s*)?' + RF_UNIT + '\\s*' + tail + '(?![가-힣])'
);

function rfSplitUnit(raw) {
  let addr = String(raw || '');
  const pick = (re) => {
    const m = addr.match(re);
    if (!m) return '';
    /* 앞 경계 문자는 되돌려 붙여 주소를 훼손하지 않는다.
       단 «구분자로 쓰인» 가운뎃점은 공백으로 바꾼다 (Codex R22 P2).
       그러지 않으려고 마지막 정규화에서 「·」를 싹 지웠더니, 이번엔
       「서울 A·B아파트」처럼 **주소 본문의 가운뎃점**까지 공백이 됐다.
       지우는 자리를 여기로 좁혀야 본문이 산다. */
    const lead = m[1] === '·' ? ' ' : m[1];
    addr = addr.slice(0, m.index) + lead + ' ' + addr.slice(m.index + m[0].length);
    /* 토큰만 반각·대문자로 눕힌다. 주소 본문은 원문 그대로 남는다. */
    return m[2].normalize('NFKC').toUpperCase();
  };
  const dong = pick(rfUnitRe('동'));
  const ho = pick(rfUnitRe('호'));
  /* 「정릉로 305(101동 601호)」처럼 괄호 안이 통째로 빠지면 빈 괄호가 남는다 (Codex R16 P3).
     쉼표만 남는 경우「(101동, 601호)」와 중첩「((101동))」까지 걷어낸다 (R17 P3).
     길이가 매번 줄어드니 반복은 반드시 끝난다. 「(길음뉴타운)」처럼 내용이 남은
     괄호는 건드리지 않는다 — 단지명은 주소의 일부다. */
  let prev;
  do { prev = addr; addr = addr.replace(/[(（][\s,，·]*[)）]/g, ' '); } while (addr !== prev);
  /* 「정릉로 305((101동 601호)」처럼 짝이 안 맞으면 고아 괄호가 남아 엔진에 그대로 간다 (R18 P3).
     짝이 «맞지 않을 때만» 괄호를 전부 턴다 — 균형 잡힌 「(길음뉴타운)」은 그대로 살린다.
     ⚠️ «개수»만 세면 「305) 101동 (」처럼 순서가 뒤집힌 것을 놓친다 (R19 P2).
        왼쪽부터 깊이를 세어, 음수로 내려가거나 끝에 0이 아니면 전부 턴다. */
  let depth = 0, broken = false;
  for (const ch of addr) {
    if (ch === '(' || ch === '（') depth++;
    else if (ch === ')' || ch === '）') { depth--; if (depth < 0) { broken = true; break; } }
  }
  if (broken || depth !== 0) addr = addr.replace(/[(（)）]/g, ' ');
  addr = addr.replace(/[,，\s]+/g, ' ').replace(/[,，\s]+$/, '').trim();
  return { addr, dong, ho };
}

function RfAddrLookup({ mode, picks, onAdd, onRemove, onRegion, bumpEpoch, getEpoch }) {
  const [addr, setAddr] = useRfState('');
  const [busy, setBusy] = useRfState(false);
  const [info, setInfo] = useRfState(null);
  /* 세대가 여럿이라 되물어야 할 때만 뜨는 동·호 입력칸 */
  const [ask, setAsk] = useRfState(null);        // { complex, unitCount, priceMin, priceMax, baseAddr }
  const [dong, setDong] = useRfState('');
  const [ho, setHo] = useRfState('');
  /* 엔진이 «표기가 다른» 세대를 찾아 준 경우(loose) — 확인 전에는 목록에 넣지 않는다 (Codex R18 P1).
     예: 102동을 물었는데 103동이 돌아오면, 그대로 넣을 경우 「102동」 라벨로 옆집 금액이 확정된다. */
  const [pending, setPending] = useRfState(null); // { amount, year, asked, matched, base }
  const list = picks || [];

  const runWith = async (rawAddr, unit) => {
    const parsed = rfSplitUnit(rawAddr);
    const base = parsed.addr || String(rawAddr || '').trim();
    const u = { dong: (unit && unit.dong) || parsed.dong, ho: (unit && unit.ho) || parsed.ho };
    if (!base || busy) return;
    /* 새 조회를 시작하면 «직전 보류»는 버린다 (Codex R19 P1).
       안 버리면 확인창을 띄운 채 다시 조회 → 새 결과가 들어간 뒤에도
       옛 확인창이 남아 승인하면 «두 채»가 되어 합계가 부풀었다. */
    setPending(null);
    const ep = bumpEpoch ? bumpEpoch() : 0;
    setBusy(true); setInfo(null);
    const stale = () => (getEpoch ? getEpoch() !== ep : false);
    try {
      if (!window.jtLookupHousePrice) {
        setInfo({ ok: false, msg: '조회 기능을 불러오지 못했어요. 금액을 직접 넣어 주세요.' });
        return;
      }
      const r = await window.jtLookupHousePrice(base, (u.dong || u.ho) ? u : undefined);
      if (stale()) return;

      const reg = r && r.region;
      if (reg && onRegion) onRegion(reg);

      /* 세대가 여럿이라 금액을 못 정한 경우 — 동·호를 되묻는다.
         단 «조정대상지역만» 묻는 화면(mode 'region')에서는 금액이 필요 없다.
         그쪽은 위에서 이미 지역 판정을 넘겼으므로 되묻지 않고 결과만 알린다. */
      if (r && (r.status === 'needs_unit' || r.needs_unit_selection) && mode !== 'region') {
        setAsk({
          complex: r.complex || '', unitCount: Number(r.unitCount) || 0,
          priceMin: Number(r.priceMin) || 0, priceMax: Number(r.priceMax) || 0, baseAddr: base,
        });
        setDong(u.dong || ''); setHo(u.ho || '');
        setInfo(null);
        return;
      }

      /* 동·호를 줬는데 그 세대가 단지에 없는 경우 (Codex R17 P2 — 실측 응답 확인).
         엔진이 「입력하신 동·호를 이 단지에서 찾지 못했습니다(총 860세대)」 처럼
         구체적으로 알려 주는데, 종전엔 이걸 버리고 "상가·오피스텔 등" 이라는
         엉뚱한 일반 안내를 띄웠다. 오타를 고칠 수 있게 입력칸도 열어 둔다. */
      if (r && r.status === 'unit_not_found' && mode !== 'region') {
        setInfo({ ok: false, msg: r.note || '입력하신 동·호를 이 단지에서 찾지 못했습니다. 다시 확인해 주세요.' });
        if (!ask) setAsk({ complex: '', unitCount: 0, priceMin: 0, priceMax: 0, baseAddr: base });
        setDong(u.dong || ''); setHo(u.ho || '');
        return;
      }

      setAsk(null);
      if (r && r.amount > 0) {
        /* ★ loose = 엔진이 «표기가 다른» 세대를 찾은 것이다. 확인 없이 넣으면
           「102동」이라 물었는데 103동 금액이 102동 라벨로 확정된다 (Codex R18 P1).
           목록에 넣지 않고 보류해, 찾은 세대를 보여 주고 사용자 승인을 받는다. */
        /* 찾은 세대가 «무엇인지» 알 수 없으면 승인을 물을 수 없다 (Codex R19 P2).
           목록에 「정릉로 305」로만 남으면 나중에 어느 집 금액인지 분간이 안 된다. */
        if (r.loose && onAdd && !((r.matched || {}).dong || (r.matched || {}).ho)) {
          setInfo({ ok: false, msg: '비슷한 세대를 찾았지만 어느 동·호인지 확인되지 않아 넣지 않았습니다. '
            + '동·호를 다시 넣어 조회하시거나, 금액을 직접 넣어 주세요.' });
          return;
        }
        if (r.loose && onAdd) {
          setPending({
            amount: Number(r.amount), year: r.year || '', base,
            asked: r.asked || { dong: u.dong || '', ho: u.ho || '' },
            matched: r.matched || {},
          });
          setInfo(null);
          return;
        }
        /* .trim() 을 템플릿 «전체»에 걸면 앞 공백까지 먹어 「정릉로 305102동」이 된다 (260805) */
        const unitLabel = ((u.dong ? u.dong + '동 ' : '') + (u.ho ? u.ho + '호' : '')).trim();
        const label = base + (unitLabel ? ' ' + unitLabel : '');
        if (onAdd) onAdd({ label, amount: Number(r.amount), year: r.year || '' });
        setAddr(''); setDong(''); setHo('');
        setInfo({ ok: true, msg: (r.year ? r.year + '년 ' : '') + '공시가격 ' + rfWon(r.amount) + '을 넣었어요.'
          + (reg ? ' (' + (reg.is_adjusted_area ? '조정대상지역' : '조정대상지역 아님') + ')' : '')
          + (mode === 'priceAdd' ? ' 주택이 여러 채면 다음 주소를 이어서 조회하세요.' : '') });
      } else if (reg) {
        setInfo({ ok: true, msg: (reg.sigungu || '') + ' ' + (reg.dong || '') + ' — '
          + (reg.is_adjusted_area ? '조정대상지역입니다' : '조정대상지역이 아닙니다') + '.'
          + (mode !== 'region' ? ' 공시가격은 찾지 못했어요(상가·오피스텔 등). 금액은 직접 넣어 주세요.' : '') });
      } else {
        setInfo({ ok: false, msg: '주소를 찾지 못했어요. 도로명 주소로 다시 시도하거나 직접 입력해 주세요.' });
      }
    } catch (e) {
      if (!stale()) setInfo({ ok: false, msg: '조회 중 오류가 났어요. 직접 입력해 주세요.' });
    } finally {
      if (!stale()) setBusy(false);
    }
  };

  const run = () => runWith(addr, null);
  const retryWithUnit = () => {
    if (!dong.trim() && !ho.trim()) return;
    runWith(ask.baseAddr, { dong: dong.trim(), ho: ho.trim() });
  };
  /* loose 결과 승인 — 라벨은 «찾은 세대» 기준으로 남긴다. 물어본 값으로 남기면
     나중에 목록만 봐서는 옆집 금액인지 알 수 없다 (Codex R18 P1). */
  const acceptPending = () => {
    const m = pending.matched || {};
    const unit = ((m.dong ? m.dong + '동 ' : '') + (m.ho ? m.ho + '호' : '')).trim();
    const label = (m.complex ? m.complex + ' ' : '') + (unit || pending.base);
    if (onAdd) onAdd({ label, amount: pending.amount, year: pending.year });
    setPending(null); setAddr(''); setDong(''); setHo('');
    setInfo({ ok: true, msg: (pending.year ? pending.year + '년 ' : '') + '공시가격 '
      + rfWon(pending.amount) + '을 넣었어요.'
      + (mode === 'priceAdd' ? ' 주택이 여러 채면 다음 주소를 이어서 조회하세요.' : '') });
  };
  const rejectPending = () => {
    setPending(null);
    setInfo({ ok: false, msg: '넣지 않았습니다. 동·호를 다시 확인해 조회하시거나, 금액을 직접 넣어 주세요.' });
  };
  const rfUnitText = (o) => ((o && o.dong ? o.dong + '동 ' : '') + (o && o.ho ? o.ho + '호' : '')).trim() || '(동·호 없음)';

  return (
    <div style={{ border: '1px solid #dcd8d0', borderRadius: 10, padding: '13px 15px', background: '#fbfaf8', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        🔎 주소로 자동 조회 <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 12.5 }}>(선택 — 직접 입력해도 됩니다)</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="text" value={addr}
          onChange={(e) => {
            if (busy) { if (bumpEpoch) bumpEpoch(); setBusy(false); }
            setInfo(null); setAsk(null); setPending(null); setAddr(e.target.value);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); run(); } }}
          placeholder="예: 정릉로 305, 102동 601호 (동·호까지 쓰면 바로 찾습니다)"
          style={{ flex: '1 1 240px', minWidth: 0, padding: '11px 13px', fontSize: 15, border: '1px solid #dcd8d0', borderRadius: 8 }}
        />
        <button className="jt-btn jt-btn--primary" disabled={busy || !addr.trim()} onClick={run}
          style={{ flex: '0 0 auto', padding: '11px 18px', opacity: (busy || !addr.trim()) ? 0.5 : 1 }}>
          {busy ? '조회 중…' : '조회'}
        </button>
      </div>

      {/* 표기가 다른 세대를 찾은 경우 — 넣기 전에 «내 집이 맞는지» 확인받는다 */}
      {pending && (
        <div style={{ marginTop: 11, border: '1px solid #e5c98a', background: '#FFF8EC', borderRadius: 9, padding: '12px 14px' }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#6b5320', marginBottom: 10 }}>
            ⚠️ 입력하신 <strong>{rfUnitText(pending.asked)}</strong> 와 표기가 조금 다른 세대를 찾았습니다.
            <div style={{ marginTop: 7, background: '#fff', border: '1px solid #e5e1d9', borderRadius: 7, padding: '9px 11px' }}>
              찾은 세대 — <strong>{pending.matched.complex || ''} {rfUnitText(pending.matched)}</strong>
              {pending.matched.area ? ` · 전용 ${pending.matched.area}㎡` : ''}
              <div style={{ marginTop: 3 }}>공시가격 <strong>{rfWon(pending.amount)}</strong>{pending.year ? ` (${pending.year}년)` : ''}</div>
            </div>
            <div style={{ marginTop: 7 }}>이 집이 <strong>내 집이 맞습니까?</strong> 맞을 때만 넣어 드립니다.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="jt-btn jt-btn--primary" onClick={acceptPending}
              style={{ flex: '0 0 auto', padding: '10px 16px' }}>맞습니다 — 이 금액 넣기</button>
            <button onClick={rejectPending}
              style={{ flex: '0 0 auto', padding: '10px 16px', border: '1px solid #dcd8d0', background: '#fff', borderRadius: 8, cursor: 'pointer', font: 'inherit' }}>
              아닙니다
            </button>
          </div>
        </div>
      )}

      {/* 세대가 여럿 — 동·호를 되묻는다 */}
      {ask && (
        <div style={{ marginTop: 11, border: '1px solid #e5c98a', background: '#FFF8EC', borderRadius: 9, padding: '12px 14px' }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.65, color: '#6b5320', marginBottom: 10 }}>
            {ask.complex ? <strong>{ask.complex}</strong> : null}
            {ask.complex ? ' — ' : ''}
            이 주소에 {ask.unitCount ? ask.unitCount.toLocaleString('ko-KR') + '세대' : '여러 세대'}가 있습니다.
            {ask.priceMin && ask.priceMax ? ` 단지 내 공시가격이 ${rfEok(ask.priceMin)} ~ ${rfEok(ask.priceMax)}으로 갈립니다.` : ''}
            {' '}<strong>동·호를 넣으면 내 세대 금액을 찾아 드립니다.</strong>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="text" value={dong} onChange={(e) => setDong(e.target.value)} placeholder="동 (예: 102)"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); retryWithUnit(); } }}
              style={{ flex: '1 1 110px', minWidth: 0, padding: '10px 12px', fontSize: 15, border: '1px solid #dcd8d0', borderRadius: 8 }} />
            <input type="text" value={ho} onChange={(e) => setHo(e.target.value)} placeholder="호 (예: 601)"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); retryWithUnit(); } }}
              style={{ flex: '1 1 110px', minWidth: 0, padding: '10px 12px', fontSize: 15, border: '1px solid #dcd8d0', borderRadius: 8 }} />
            <button className="jt-btn jt-btn--primary" disabled={busy || (!dong.trim() && !ho.trim())} onClick={retryWithUnit}
              style={{ flex: '0 0 auto', padding: '10px 16px', opacity: (busy || (!dong.trim() && !ho.trim())) ? 0.5 : 1 }}>
              {busy ? '조회 중…' : '이 세대로 조회'}
            </button>
          </div>
          <div style={{ fontSize: 12.5, color: '#8a6224', marginTop: 8 }}>
            모르시면 부동산공시가격알리미(realtyprice.kr)에서 확인하시거나, 금액을 직접 넣으셔도 됩니다.
          </div>
        </div>
      )}

      {/* 조회로 넣은 주소 목록 — 하나씩 되돌릴 수 있다 */}
      {list.length > 0 && (
        <div style={{ marginTop: 11, display: 'grid', gap: 6 }}>
          {list.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, background: '#fff', border: '1px solid #e5e1d9', borderRadius: 7, padding: '8px 11px' }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
              <strong style={{ whiteSpace: 'nowrap' }}>{rfEok(it.amount)}</strong>
              <button onClick={() => onRemove && onRemove(i)} title="이 주소 빼기"
                style={{ flex: '0 0 auto', border: '1px solid #dcd8d0', background: '#fff', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: 12 }}>빼기</button>
            </div>
          ))}
          {list.length > 1 && (
            <div style={{ fontSize: 12.5, color: '#7b756b', textAlign: 'right' }}>
              합계 {rfWon(list.reduce((t, x) => t + x.amount, 0))}
            </div>
          )}
        </div>
      )}

      {info && (
        <div style={{ marginTop: 9, fontSize: 13, lineHeight: 1.65, color: info.ok ? '#1e6b45' : '#8a6224' }}>{info.msg}</div>
      )}
    </div>
  );
}

/* 질문 렌더 (숫자 / 선택 / 주소조회) */
function RfQuestion({ q, value, onChange, onChangeRaw, picks, onAdd, onRemove, bumpEpoch, getEpoch }) {
  return (
    <div className="jt-report-q">
      <div className="jt-report-q__section">{q.section}</div>
      <h2 style={{ fontSize: 20, lineHeight: 1.45, margin: '6px 0 8px' }}>{q.q}</h2>
      {q.sub && <p className="jt-report-q__sub" style={{ fontSize: 13.5, lineHeight: 1.7, color: '#7b756b', marginBottom: 14 }}>{q.sub}</p>}
      {q.addr && (
        <RfAddrLookup
          mode={q.addr}
          picks={picks}
          onAdd={(q.addr === 'price' || q.addr === 'priceAdd') ? onAdd : null}
          onRemove={(q.addr === 'price' || q.addr === 'priceAdd') ? onRemove : null}
          onRegion={q.regionTo ? function (reg) { (onChangeRaw || onChange)(q.regionTo, reg.is_adjusted_area ? 'yes' : 'no'); } : null}
          bumpEpoch={bumpEpoch} getEpoch={getEpoch}
        />
      )}
      {q.opts ? (
        <div className="jt-report-q__opts" style={{ display: 'grid', gap: 9 }}>
          {q.opts.map(([v, label, hint]) => (
            <button key={v} onClick={() => onChange(q.id, v)} style={{
              textAlign: 'left', border: value === v ? '2px solid #2a3038' : '1px solid #dcd8d0',
              background: value === v ? '#f7f5f0' : '#fff', borderRadius: 9, padding: '12px 15px',
              cursor: 'pointer', font: 'inherit',
            }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{label}</div>
              {hint && <div style={{ fontSize: 12.5, color: '#7b756b', marginTop: 3 }}>{hint}</div>}
            </button>
          ))}
        </div>
      ) : (
        <>
          <input
            className="jt-report-q__input" type="text" inputMode="decimal"
            value={q.money && value ? Number(String(value).replace(/[^0-9]/g, '') || 0).toLocaleString('ko-KR') : (value || '')}
            placeholder={q.placeholder || ''}
            onChange={(e) => {
              const raw = String(e.target.value);
              if (q.money) { onChange(q.id, raw.replace(/[^0-9]/g, '')); return; }
              /* 기간: 소수점 «하나»만 허용. 형식에 안 맞으면 입력을 받지 않는다 (260805 R2 P2). */
              if (raw === '' || /^\d*(?:\.\d*)?$/.test(raw)) onChange(q.id, raw);
            }}
            style={{ width: '100%', padding: '13px 15px', fontSize: 17, border: '1px solid #dcd8d0', borderRadius: 9, fontWeight: 700 }}
          />
          {q.money && rfNum(value) > 0 && (
            <div style={{ fontSize: 13, color: '#7b756b', marginTop: 7 }}>= {rfEok(rfNum(value))}</div>
          )}
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   입력 위저드 — «한 문항씩» 넘어가는 구조
   기존 계산기(ReportCGT·ReportProperty 등)와 진행 방식을 통일한다.
   종전에는 전 문항을 한 화면에 쌓아 보여 줘 길이가 부담스러웠다 (260805 교체).
   ══════════════════════════════════════════════════════════════════════════ */
function RfWizard({ questions, answers, onChange, onSubmit, ctaLabel, onBack, tag, title, subtitle, notice, getPicks, setPicksFor, bumpEpoch, getEpoch }) {
  const [idx, setIdx] = useRfState(0);
  /* ⚠️ 「자동입력분인가」는 «값»이 아니라 «누가 넣었는가»로 판정해야 한다.
     값으로 기억하면 사용자가 우연히 같은 금액을 직접 넣었을 때도 자동값으로 오인해
     지워 버린다 (260805 Codex R3 P2). 자동입력된 문항 id 를 집합으로 들고 다니고,
     사용자가 그 칸을 직접 고치는 순간 해제한다. */
  const onChangeTracked = (id, v) => {
    /* 사용자가 직접 고치면 진행 중 조회를 무효화하고, 조회 목록도 버린다
       (목록에서 파생한 합계와 손으로 넣은 값이 뒤섞이면 되돌릴 수 없다). */
    bumpEpoch(id);
    if (getPicks(id).length) setPicksFor(id, []);
    onChange(id, v);
  };
  /* 지역 자동판정(조정대상지역)은 «조회 응답»이 넣는 값이라 에폭을 올리면 안 된다.
     올리면 자기 응답이 stale 로 판정돼 busy 가 안 풀린다 (260805 Codex R7 P2). */
  const onChangeRaw = (id, v) => onChange(id, v);

  const visible = questions.filter((q) => !q.showIf || q.showIf(answers));
  const total = Math.max(1, visible.length);
  const pos = Math.min(idx, total - 1);
  const cur = visible[pos];
  const last = pos === total - 1;

  /* 현재 문항만 검증 — 통과해야 다음으로 넘어간다 */
  const stepErr = (() => {
    if (!cur) return null;
    const v = answers[cur.id];
    if (cur.opts) return v ? null : '하나를 골라 주세요.';
    if (v == null || v === '') return cur.optional ? null : '값을 넣어 주세요.';
    /* ⚠️ 종전엔 '0' 도 통과해 전 문항을 0으로 넘기면 결과가 «0원»으로 나왔다.
          0 을 허용할 문항만 optional/allowZero 로 표시한다 (260805 Codex P2). */
    if (!cur.optional && !cur.allowZero && rfNum(v) <= 0) return '0보다 큰 값을 넣어 주세요.';
    return cur.check ? cur.check(v, answers) : null;
  })();

  /* ⚠️ 문항을 떠나거나 제출하면 그 문항의 진행 중 조회를 «취소»한다.
     안 그러면 늦은 응답이 이미 확정된 답을 뒤늦게 바꿔, 화면에 뜬 세액과
     실제 입력 상태가 갈린다 (260805 Codex R9 P1). */
  const cancelPending = () => { if (cur && bumpEpoch) bumpEpoch(cur.id); };
  const go = (d) => {
    if (d > 0 && stepErr) return;
    cancelPending();
    setIdx(Math.min(Math.max(0, pos + d), total - 1));
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
  };
  const submit = () => { cancelPending(); onSubmit(); };

  return (
    <JTReportShell tag={tag} stepIdx={pos} stepTotal={total} onBack={onBack} title={title} subtitle={subtitle}>
      <div className="jt-container">
        {notice}
        <div className="jt-report-calc"
          onKeyDown={(e) => { if (e.key === 'Enter' && !stepErr) { e.preventDefault(); if (last) submit(); else go(1); } }}>
          {cur && (
            <RfQuestion q={cur} value={answers[cur.id]} onChange={onChangeTracked} onChangeRaw={onChangeRaw}
              picks={getPicks(cur.id)}
              /* ⚠️ 목록은 «항상 ref 의 현재값»에서 읽는다. 클로저로 캡처하면
                 B 조회 중 A 를 빼도 B 응답이 옛 목록(A 포함)을 되살린다 (260805 Codex R7 P1). */
              onAdd={(item) => setPicksFor(cur.id, getPicks(cur.id).concat([item]))}
              onRemove={(i) => setPicksFor(cur.id, getPicks(cur.id).filter((_, j) => j !== i))}
              bumpEpoch={() => bumpEpoch(cur.id)} getEpoch={() => getEpoch(cur.id)} />
          )}
          {stepErr && <p style={{ color: '#b3261e', fontSize: 13.5, margin: '12px 0 0' }}>{stepErr}</p>}
          <div className="jt-report-q__nav" style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
            {pos > 0 && (
              <button className="jt-btn jt-btn--ghost" onClick={() => go(-1)} style={{ flex: '0 0 auto', padding: '14px 20px' }}>← 이전</button>
            )}
            <button className="jt-btn jt-btn--primary" onClick={() => (last ? submit() : go(1))} disabled={!!stepErr}
              style={{ flex: '1 1 200px', padding: '15px 20px', fontSize: 16.5, fontWeight: 800, borderRadius: 10,
                       opacity: stepErr ? 0.45 : 1, cursor: stepErr ? 'not-allowed' : 'pointer' }}>
              {last ? ctaLabel : '다음'} <span className="jt-arrow">→</span>
            </button>
          </div>
        </div>
      </div>
    </JTReportShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ① 2026 세제개편안 양도세 계산기
   ══════════════════════════════════════════════════════════════════════════ */
const RF_CGT_QS = [
  { id: 'transferPrice', section: '양도 (파는 금액)', q: '집을 얼마에 파시나요? (원)', money: true, placeholder: '예: 2,000,000,000',
    sub: '실제로 받는 매매대금(양도가액)입니다. 1세대 1주택은 12억원까지 비과세이고, 12억원을 넘는 부분만 세금 계산에 들어갑니다.' },
  { id: 'acqPrice', section: '취득 (산 금액)', q: '그 집을 얼마에 사셨나요? (원)', money: true, placeholder: '예: 1,000,000,000',
    check: (v, a) => (rfNum(v) > rfNum(a.transferPrice) ? '산 금액이 파는 금액보다 큽니다 — 양도차손이면 낼 세금이 없습니다.' : null),
    sub: '취득 당시 실제 매매대금입니다. 상속·증여로 받았다면 그때 평가된 금액을 넣으세요.' },
  { id: 'expenses', section: '필요경비', q: '취득세·중개수수료·자본적지출은 모두 얼마인가요? (원)', money: true, placeholder: '예: 40,000,000', optional: true,
    sub: '살 때 낸 취득세와 법무사·중개수수료, 그리고 «집의 가치를 올린» 공사비(새시·확장 등)를 더합니다. 도배·장판 같은 수선비는 들어가지 않습니다. 모르면 비워 두세요(세금이 다소 높게 나옵니다).' },
  { id: 'houses', section: '주택 수', q: '세대 전체가 가진 집은 몇 채인가요?',
    sub: '본인·배우자·같이 사는 가족(1세대)이 가진 집을 모두 셉니다. 분양권·입주권도 주택 수에 들어갑니다.',
    opts: [['one', '1채 (1세대 1주택)', '12억원까지 비과세 · 장기보유공제 최대 80%'],
           ['two', '2채', '조정대상지역이면 중과 대상'],
           ['three', '3채 이상', '조정대상지역이면 중과 폭이 더 큼']] },
  { id: 'adjusted', section: '조정대상지역', q: '파는 집이 조정대상지역에 있나요?',
    addr: 'region', regionTo: 'adjusted',
    sub: '조정대상지역은 정부가 지정하는 과열 지역입니다. 다주택자가 이 지역 집을 팔면 세율이 크게 올라가고(중과) 장기보유특별공제도 못 받습니다. 2026년 8월 현재 서울 전역과 경기 일부가 해당합니다.',
    opts: [['yes', '예 — 조정대상지역', '다주택이면 중과 대상'], ['no', '아니오', '중과 없음']] },
  { id: 'acqAdjusted', section: '취득 당시 지역', q: '살 때 그 집이 조정대상지역이었나요?',
    showIf: (a) => (a.houses || 'one') === 'one',
    sub: '★ 1세대 1주택 비과세 요건이 갈립니다. 2017년 8월 3일 이후 «취득 당시» 조정대상지역이었다면, 보유 2년만으로는 부족하고 «거주도 2년» 채워야 비과세를 받습니다(소득세법 시행령 §154①). 파는 시점의 지정 여부가 아니라 «살 때» 기준입니다.',
    opts: [['yes', '예 — 살 때 조정대상지역이었다', '보유 2년 + 거주 2년 모두 필요'],
           ['no', '아니오 / 2017.8.3. 이전 취득', '보유 2년이면 비과세']] },
  { id: 'holdYears', section: '보유기간', q: '몇 년 «보유» 하셨나요? (년)', placeholder: '예: 12',
    sub: '등기부상 취득일부터 양도일까지의 기간입니다. 개편안은 이 «보유» 기준 공제를 단계적으로 줄입니다.' },
  { id: 'resYears', section: '거주기간', q: '그중 실제로 몇 년 «거주» 하셨나요? (년)', placeholder: '예: 10', allowZero: true,
    check: (v, a) => (rfNum(v) > rfNum(a.holdYears) ? '거주기간이 보유기간보다 길 수는 없습니다.' : null),
    sub: '★ 이번 개편의 핵심입니다. 주민등록을 두고 실제 살았던 기간이며, 2029년부터는 «거주한 기간만» 공제받습니다. 보유만 하고 살지 않았다면 0을 넣으세요.' },
  { id: 'age', section: '나이', q: '양도자 나이가 몇 세인가요? (세)', placeholder: '예: 67',
    sub: '65세 이상 1주택자가 수도권 집을 팔고 비수도권으로 이주하면 2027~2028년에 한시 감면이 있습니다. 해당 없으면 대충 넣어도 결과에 영향이 없습니다.' },
  { id: 'seniorLive2y', section: '고령 특례', q: '양도일 현재 그 집에 2년 이상 «계속» 거주 중이신가요?',
    showIf: (a) => rfNum(a.age) >= 65 && (a.houses || 'one') === 'one' && a.seniorMove === 'yes',
    sub: '고령 1주택자 감면은 ①보유기간 중 5년 이상 거주 ②양도일 현재 2년 이상 계속 거주 두 가지를 모두 요구합니다. 하나라도 빠지면 감면이 없습니다.',
    opts: [['yes', '예 — 2년 이상 계속 거주 중', ''], ['no', '아니오', '감면 대상 아님']] },
  { id: 'seniorMove', section: '고령 특례', q: '수도권 집을 팔고 비수도권으로 이주하시나요?',
    showIf: (a) => rfNum(a.age) >= 65 && a.houses === 'one',
    sub: '65세 이상 1주택자 한시 특례입니다. 5년 이상 거주했고 양도일 현재 2년 이상 계속 거주 중인 수도권 주택을 팔고 비수도권으로 이주하는 경우입니다. 양도일부터 5년 안에 다시 수도권으로 이주하거나 수도권 주택을 사면 감면세액을 추징당합니다.',
    opts: [['yes', '예 — 비수도권으로 이주', "'27년 50%(5억 한도) · '28년 30%(3억 한도) 감면"], ['no', '아니오', '']] },
];

function JTReportReformCGT({ setRoute, setSubRoute, onBack }) {
  const [answers, setAnswers] = useRfState({ houses: 'one', adjusted: 'no', seniorMove: 'no' });
  const [result, setResult] = useRfState(null);
  const onChange = (id, v) => setAnswers((p) => ({ ...p, [id]: v }));
  /* 조회로 넣은 주소 목록 — «결과 화면 밖» 이 컴포넌트가 소유한다.
     위저드 안에 두면 「조건 바꿔서 다시 계산」으로 위저드가 언마운트될 때 목록만
     비고 answers 의 합계는 남아, 이후 조회가 «대체»처럼 동작한다 (260805 Codex R7 P1).
     ref 로 들고 다니는 이유는 조회 콜백이 «항상 현재값»을 봐야 하기 때문(stale closure 방지). */
  const picksRef = React.useRef({});
  /* 에폭도 «여기» 둔다. 위저드에 두면 결과 화면을 오갈 때 초기화돼, 이전 세션의
     늦은 응답이 새 세션 값을 덮는다 (260805 Codex R8 P1).
     목록·에폭을 한 소유자에 묶어 단일 상태원으로 만든다. */
  const epochsRef = React.useRef({});
  const bumpEpoch = (id) => { epochsRef.current[id] = (epochsRef.current[id] || 0) + 1; return epochsRef.current[id]; };
  const getEpoch = (id) => (epochsRef.current[id] || 0);
  const [, rfBump] = useRfState(0);
  const getPicks = (id) => (picksRef.current[id] || []);
  const setPicksFor = (id, arr) => {
    picksRef.current = Object.assign({}, picksRef.current, { [id]: arr });
    rfBump((n) => n + 1);
    onChange(id, arr.length ? String(arr.reduce((t, x) => t + x.amount, 0)) : '');
  };


  let invalid = null;
  if (!rfNum(answers.transferPrice)) invalid = '파는 금액(양도가액)을 넣어 주세요.';
  else if (!answers.acqPrice && answers.acqPrice !== '0') invalid = '산 금액(취득가액)을 넣어 주세요.';
  else if (rfNum(answers.acqPrice) > rfNum(answers.transferPrice)) invalid = '산 금액이 파는 금액보다 큽니다 — 양도차손이면 낼 세금이 없습니다.';
  else if (!answers.holdYears) invalid = '보유기간을 넣어 주세요.';
  else if (answers.resYears == null || answers.resYears === '') invalid = '거주기간을 넣어 주세요. 살지 않았다면 0을 넣으세요.';
  else if (rfNum(answers.resYears) > rfNum(answers.holdYears)) invalid = '거주기간이 보유기간보다 길 수는 없습니다.';

  const run = () => {
    const years = [2026, 2027, 2028, 2029];
    const rs = years.map((y) => {
      const r = rfCalcCGT(answers, y);
      r.label = y === 2026 ? '2026년 (현행)' : (y === 2029 ? '2029년 이후' : `${y}년`);
      return r;
    });
    setResult(rs);
    try { window.jtTrackCta && window.jtTrackCta('calc_run', 'reform_cgt'); } catch (e) {}
    setTimeout(() => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {} }, 30);
  };

  if (!result) {
    return (
      <RfWizard tag="2026 세제개편안" onBack={onBack}
        title="2026 세제개편안 양도세, 지금 얼마나 달라지나요?"
        subtitle="파는 해에 따라 세금이 달라집니다 — 2026년(현행)·2027·2028·2029년 이후를 한 번에 비교합니다."
        notice={<RfNotice />}
        questions={RF_CGT_QS} answers={answers} onChange={onChange} onSubmit={run}
        getPicks={getPicks} setPicksFor={setPicksFor}
        bumpEpoch={bumpEpoch} getEpoch={getEpoch}
        ctaLabel="연도별 양도세 비교하기" />
    );
  }

  const base = result[0];
  const best = result.reduce((a, b) => (b.total < a.total ? b : a), result[0]);
  const worst = result.reduce((a, b) => (b.total > a.total ? b : a), result[0]);
  return (
    <JTReportShell tag="2026 세제개편안" stepIdx={2} stepTotal={2} onBack={onBack}
      title="연도별 양도소득세 비교" subtitle="개편안이 그대로 시행된다고 가정했을 때, 파는 시점별 총 세부담입니다.">
      <div className="jt-container">
        <RfNotice />

        <section className="jt-report-result__section" style={{ marginBottom: 6 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>언제 팔면 얼마인가 (양도세 + 지방소득세)</h3>
          <RfYearCards rows={result} baseYear={2026} />
        </section>

        <div className="jt-report-result__section" style={{ background: '#f0f7f3', borderLeft: '4px solid #2a6d4f', padding: '15px 18px', borderRadius: 8, marginBottom: 20 }}>
          <strong style={{ display: 'block', marginBottom: 6 }}>한 줄 결론</strong>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7 }}>
            {best.total === worst.total
              ? '입력하신 조건에서는 개편안이 시행되어도 세부담이 달라지지 않습니다.'
              : <>세부담이 가장 낮은 시점은 <strong>{best.label}</strong>({rfEok(best.total)})이고, 가장 높은 시점은 <strong>{worst.label}</strong>({rfEok(worst.total)})입니다.
                  두 시점의 차이는 <strong>{rfEok(worst.total - best.total)}</strong>입니다.</>}
            {(() => {
              const rY = rfNum(answers.resYears), hY = rfNum(answers.holdYears);
              const isOne = (answers.houses || 'one') === 'one';
              const capY = isOne ? 10 : 15;
              if (answers.houses !== 'one' && answers.adjusted === 'yes')
                return ' 다주택자가 조정대상지역 주택을 팔면 장기보유특별공제가 아예 배제되므로, 이 경우 세금을 가르는 것은 오직 중과세율입니다 — 중과가 가장 낮은 2027년이 유리합니다.';
              if (rY >= capY)
                return ` 거주 ${rY}년으로 공제가 이미 상한(${isOne ? '80' : '30'}%)에 도달해 있어, 개편안이 시행돼도 공제율은 줄지 않습니다. 남는 변수는 중과세율과 기본공제입니다.`;
              return ` 거주기간을 ${rY}년으로 입력하셨는데, 개편안은 «보유»가 아니라 «거주»에 공제를 몰아줍니다 — 지금 조건이라면 ${capY}년까지 거주를 채울수록 2028년 이후 세금이 크게 줄어듭니다.`;
            })()}
          </p>
        </div>

        <section className="jt-report-result__section">
          <h3 style={{ fontSize: 16, marginBottom: 10 }}>무엇이 세금을 갈랐나</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 520 }}>
              <thead>
                <tr style={{ background: '#f7f5f0' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #dcd8d0' }}>구분</th>
                  {result.map((r) => <th key={r.year} style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '2px solid #dcd8d0', whiteSpace: 'nowrap' }}>{r.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {[
                  ['장기보유특별공제율', (r) => (r.ltdRate * 100).toFixed(0) + '%'],
                  ['장기보유특별공제액', (r) => rfEok(r.ltdAmount)],
                  ['양도소득 기본공제', (r) => rfWon(r.basicDeduct)],
                  ['다주택 중과 가산', (r) => (r.surcharge ? '+' + (r.surcharge * 100).toFixed(0) + '%p' : '—')],
                  ['고령 1주택 감면', (r) => (r.relief ? '−' + rfEok(r.relief) : '—')],
                  ['과세표준', (r) => rfEok(r.base)],
                  ['총 세부담', (r) => rfEok(r.total)],
                ].map(([label, fn], i) => (
                  <tr key={i} style={{ background: i % 2 ? '#fbfaf8' : '#fff' }}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #efece6', fontWeight: 700 }}>{label}</td>
                    {result.map((r) => (
                      <td key={r.year} style={{ padding: '10px 12px', borderBottom: '1px solid #efece6', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: label === '총 세부담' ? 800 : 400 }}>{fn(r)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <RfSteps steps={base.steps} title="2026년(현행) 기준 단계별 계산" />

        <section className="jt-report-result__section" style={{ background: '#f7f5f0', padding: '15px 18px', borderRadius: 8 }}>
          <h3 style={{ fontSize: 15.5, marginBottom: 8 }}>개편안 핵심 — 「보유」에서 「거주」로</h3>
          <ul style={{ margin: 0, paddingLeft: 19, fontSize: 14, lineHeight: 1.85 }}>
            <li><strong>장기보유특별공제가 폐지되는 것은 아닙니다.</strong> 이름이 「장기거주소득공제」로 바뀌고, 공제 기준이 «보유기간»에서 «거주기간»으로 단계적으로 옮겨 갑니다.</li>
            <li>1세대 1주택 최대 공제율은 <strong>80%로 그대로</strong>지만, 2029년부터는 «거주 연 8%»만 인정됩니다 — 살지 않고 보유만 했다면 공제가 0이 됩니다.</li>
            <li>공제 «금액» 한도가 새로 생깁니다: 2028년 20억원 → 2029년 이후 10억원.</li>
            <li>다주택자 조정대상지역 중과는 2027~2028년에 한시 완화됩니다(2주택 +5→+10%p, 3주택 이상 +10→+15%p). 2029년부터 원래대로(+20/+30%p) 돌아갑니다.</li>
            <li>10년 이상 «거주»한 양도가액 30억원 이하 1주택은 기본공제가 연 250만원 → <strong>연 2,500만원</strong>으로 오릅니다(2027년 양도분부터 — 장특공제 개편과 달리 유예가 없습니다).</li>
          </ul>
        </section>

        <section className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '14px 17px', borderRadius: 8 }}>
          <strong style={{ display: 'block', marginBottom: 6 }}>이 계산에 반영하지 않은 것</strong>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7 }}>
            일시적 2주택·상생임대·임대주택 특례, 입주권·분양권 판정, 부담부증여, 취득가액 환산, 상속·증여로 취득한 경우의 이월과세, 그리고 지역별 조정대상지역 지정 현황은 반영하지 않았습니다.
            실제 세액은 사실관계에 따라 크게 달라집니다 — 정확한 검토는 세무사 상담이 필요합니다.
          </p>
        </section>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0 6px' }}>
          <button className="jt-btn jt-btn--ghost" onClick={() => setResult(null)}>← 조건 바꿔서 다시 계산</button>
          <button className="jt-btn jt-btn--ghost" onClick={() => setSubRoute && setSubRoute('reform-cre')}>종부세는 얼마나 달라지나 →</button>
        </div>

        <JTReportCta setRoute={setRoute} />
        <RfCrossLinks setSubRoute={setSubRoute} exclude={[]} />
        <JTReportDisclaimer variant="inline" />
      </div>
    </JTReportShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ② 2026 종부세 개편안 계산기
   ══════════════════════════════════════════════════════════════════════════ */
const RF_CRE_QS = [
  { id: 'houses', section: '주택 보유 현황', q: '세대가 가진 집은 몇 채인가요?',
    sub: '종합부동산세는 매년 6월 1일 기준으로 세대가 가진 주택의 공시가격을 모두 더해 계산합니다.',
    opts: [['one', '1채 (1세대 1주택)', "공제 확대 — 거주하면 14억원"], ['two', '2채', ''], ['three', '3채 이상', '높은 세율·공정비율 적용']] },
  { id: 'totalValue', section: '공시가격 합계', q: '가진 집들의 공시가격을 모두 더하면 얼마인가요? (원)', money: true, placeholder: '예: 1,800,000,000',
    addr: 'priceAdd',
    sub: '실거래가가 아니라 정부가 매년 발표하는 «공시가격»입니다. 여러 채라면 아래 주소 조회를 «한 채씩 이어서» 하시면 합계에 더해집니다. 부동산공시가격알리미(realtyprice.kr)에서 직접 확인할 수도 있습니다.' },
  { id: 'isResident', section: '거주 여부', q: '그 집에 본인(세대)이 실제로 살고 있나요?', showIf: (a) => a.houses === 'one',
    sub: '★ 이번 개편의 핵심입니다. 살고 있으면 공제가 12억 → 14억으로 늘고, 살지 않으면 12억 → 9억으로 줄어듭니다.',
    opts: [['yes', '예 — 거주 중', '공제 14억원'], ['no', '아니오 — 비거주', '공제 9억원 (세금이 크게 늘어남)']] },
  { id: 'residentValue', section: '거주용 주택 가액', q: '그중 «본인이 사는 집»의 공시가격은 얼마인가요? (원)', money: true, placeholder: '예: 900,000,000', allowZero: true,
    addr: 'price',
    check: (v, a) => (rfNum(v) > rfNum(a.totalValue) ? '거주용 주택 가액이 전체 합계보다 클 수는 없습니다.' : null),
    showIf: (a) => a.houses !== 'one',
    sub: '개편안은 다주택자 공제를 「4억원 + 5억원 × (거주용 주택가액 ÷ 전체 합계)」로 바꿉니다. 사는 집의 비중이 클수록 공제가 커집니다. 아무 집에도 살지 않으면 0을 넣으세요.' },
  { id: 'adjusted', section: '조정대상지역', q: '조정대상지역에 있는 집을 가지고 있나요?', showIf: (a) => a.houses !== 'one',
    sub: '3주택 이상이거나 조정대상지역 주택을 가진 경우(1세대1주택자 제외) 더 높은 세율과 공정시장가액비율이 적용됩니다.',
    opts: [['yes', '예', ''], ['no', '아니오', '']] },
  { id: 'age', section: '나이', q: '납세자 나이가 몇 세인가요? (세)', placeholder: '예: 66', showIf: (a) => a.houses === 'one',
    sub: '1세대 1주택자는 만 60세부터 연령별 세액공제를 받습니다 (60세~ 20%, 65세~ 30%, 70세~ 40%).' },
  { id: 'holdYears', section: '보유기간', q: '몇 년 «보유» 하셨나요? (년)', placeholder: '예: 12', showIf: (a) => a.houses === 'one',
    sub: '현행은 보유기간에 따라 세액공제를 줍니다(5년~ 20%, 10년~ 40%, 15년~ 50%). 개편안은 이를 거주기간 기준으로 바꿉니다.' },
  { id: 'resYears', section: '거주기간', q: '그중 실제로 몇 년 «거주» 하셨나요? (년)', placeholder: '예: 10', allowZero: true, showIf: (a) => a.houses === 'one',
    check: (v, a) => (rfNum(v) > rfNum(a.holdYears) ? '거주기간이 보유기간보다 길 수는 없습니다.' : null),
    sub: '2028년부터는 «거주기간»만 세액공제 대상입니다. 살지 않았다면 0을 넣으세요.' },
];

function JTReportReformCRE({ setRoute, setSubRoute, onBack }) {
  const [answers, setAnswers] = useRfState({ houses: 'one', isResident: 'yes', adjusted: 'no' });
  const [result, setResult] = useRfState(null);
  const onChange = (id, v) => setAnswers((p) => ({ ...p, [id]: v }));
  /* 조회로 넣은 주소 목록 — «결과 화면 밖» 이 컴포넌트가 소유한다.
     위저드 안에 두면 「조건 바꿔서 다시 계산」으로 위저드가 언마운트될 때 목록만
     비고 answers 의 합계는 남아, 이후 조회가 «대체»처럼 동작한다 (260805 Codex R7 P1).
     ref 로 들고 다니는 이유는 조회 콜백이 «항상 현재값»을 봐야 하기 때문(stale closure 방지). */
  const picksRef = React.useRef({});
  /* 에폭도 «여기» 둔다. 위저드에 두면 결과 화면을 오갈 때 초기화돼, 이전 세션의
     늦은 응답이 새 세션 값을 덮는다 (260805 Codex R8 P1).
     목록·에폭을 한 소유자에 묶어 단일 상태원으로 만든다. */
  const epochsRef = React.useRef({});
  const bumpEpoch = (id) => { epochsRef.current[id] = (epochsRef.current[id] || 0) + 1; return epochsRef.current[id]; };
  const getEpoch = (id) => (epochsRef.current[id] || 0);
  const [, rfBump] = useRfState(0);
  const getPicks = (id) => (picksRef.current[id] || []);
  const setPicksFor = (id, arr) => {
    picksRef.current = Object.assign({}, picksRef.current, { [id]: arr });
    rfBump((n) => n + 1);
    onChange(id, arr.length ? String(arr.reduce((t, x) => t + x.amount, 0)) : '');
  };


  let invalid = null;
  if (!rfNum(answers.totalValue)) invalid = '공시가격 합계를 넣어 주세요.';
  else if (answers.houses !== 'one' && (answers.residentValue == null || answers.residentValue === '')) invalid = '거주용 주택의 공시가격을 넣어 주세요. 아무 집에도 살지 않으면 0을 넣으세요.';
  else if (rfNum(answers.residentValue) > rfNum(answers.totalValue)) invalid = '거주용 주택 가액이 전체 합계보다 클 수는 없습니다.';
  else if (answers.houses === 'one' && (answers.holdYears == null || answers.holdYears === '')) invalid = '보유기간을 넣어 주세요.';
  else if (answers.houses === 'one' && (answers.resYears == null || answers.resYears === '')) invalid = '거주기간을 넣어 주세요. 살지 않았다면 0을 넣으세요.';
  else if (rfNum(answers.resYears) > rfNum(answers.holdYears)) invalid = '거주기간이 보유기간보다 길 수는 없습니다.';

  const run = () => {
    const rs = [2026, 2027, 2028].map((y) => {
      const r = rfCalcCRE(answers, y);
      r.label = y === 2026 ? '2026년 (현행)' : (y === 2028 ? '2028년 이후' : '2027년');
      return r;
    });
    setResult(rs);
    try { window.jtTrackCta && window.jtTrackCta('calc_run', 'reform_cre'); } catch (e) {}
    setTimeout(() => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {} }, 30);
  };

  if (!result) {
    return (
      <RfWizard tag="2026 세제개편안" onBack={onBack}
        title="2026 종부세 개편안, 우리 집은 얼마나 달라지나요?"
        subtitle="주소만 넣으면 공시가격이 자동으로 들어갑니다 — 2026년(현행)·2027년·2028년 이후를 한 번에 비교합니다."
        notice={<RfNotice />}
        questions={RF_CRE_QS} answers={answers} onChange={onChange} onSubmit={run}
        getPicks={getPicks} setPicksFor={setPicksFor}
        bumpEpoch={bumpEpoch} getEpoch={getEpoch}
        ctaLabel="연도별 종부세 비교하기" />
    );
  }

  const base = result[0];
  const last = result[result.length - 1];
  const diff = last.total - base.total;
  return (
    <JTReportShell tag="2026 세제개편안" stepIdx={2} stepTotal={2} onBack={onBack}
      title="연도별 종합부동산세 비교" subtitle="개편안이 그대로 시행된다고 가정했을 때, 해마다 내야 할 종부세입니다.">
      <div className="jt-container">
        <RfNotice />

        <section className="jt-report-result__section" style={{ marginBottom: 6 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>해마다 얼마인가 (종부세 + 농어촌특별세)</h3>
          <RfYearCards rows={result} baseYear={2026} />
        </section>

        <div className="jt-report-result__section" style={{ background: diff > 0 ? '#fdf2f1' : '#f0f7f3', borderLeft: `4px solid ${diff > 0 ? '#b3261e' : '#2a6d4f'}`, padding: '15px 18px', borderRadius: 8, marginBottom: 20 }}>
          <strong style={{ display: 'block', marginBottom: 6 }}>한 줄 결론</strong>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7 }}>
            {diff === 0
              ? '입력하신 조건에서는 개편안이 시행되어도 종부세가 달라지지 않습니다.'
              : <>2028년 이후 종부세는 현행 대비 <strong>{diff > 0 ? rfEok(diff) + ' 늘어납니다' : rfEok(-diff) + ' 줄어듭니다'}</strong>
                  ({rfEok(base.total)} → {rfEok(last.total)}).</>}
            {answers.houses === 'one' && answers.isResident === 'no' &&
              ' 지금 그 집에 살지 않으시는데, 개편안은 비거주 1주택의 공제를 12억원에서 9억원으로 줄입니다 — 이것이 증가의 가장 큰 원인입니다.'}
            {answers.houses === 'one' && answers.isResident !== 'no' &&
              ' 실제 거주 중이시라 공제가 12억원에서 14억원으로 늘어나는 혜택을 받습니다.'}
          </p>
        </div>

        <section className="jt-report-result__section">
          <h3 style={{ fontSize: 16, marginBottom: 10 }}>무엇이 세금을 갈랐나</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 460 }}>
              <thead>
                <tr style={{ background: '#f7f5f0' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #dcd8d0' }}>구분</th>
                  {result.map((r) => <th key={r.year} style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '2px solid #dcd8d0', whiteSpace: 'nowrap' }}>{r.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {[
                  ['기본공제', (r) => rfEok(r.deduct)],
                  ['공정시장가액비율', (r) => (r.fairRatio * 100).toFixed(0) + '%'],
                  ['과세표준', (r) => rfEok(r.base)],
                  ['산출세액', (r) => rfEok(r.gross)],
                  ['1주택 세액공제', (r) => (r.credit ? '−' + rfEok(r.credit) : '—')],
                  ['농어촌특별세', (r) => rfEok(r.rural)],
                  ['총 세부담', (r) => rfEok(r.total)],
                ].map(([label, fn], i) => (
                  <tr key={i} style={{ background: i % 2 ? '#fbfaf8' : '#fff' }}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #efece6', fontWeight: 700 }}>{label}</td>
                    {result.map((r) => (
                      <td key={r.year} style={{ padding: '10px 12px', borderBottom: '1px solid #efece6', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: label === '총 세부담' ? 800 : 400 }}>{fn(r)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <RfSteps steps={base.steps} title="2026년(현행) 기준 단계별 계산" />

        <section className="jt-report-result__section" style={{ background: '#f7f5f0', padding: '15px 18px', borderRadius: 8 }}>
          <h3 style={{ fontSize: 15.5, marginBottom: 8 }}>개편안 핵심 — 「주택 수」에서 「가액과 거주」로</h3>
          <ul style={{ margin: 0, paddingLeft: 19, fontSize: 14, lineHeight: 1.85 }}>
            <li>1세대 1주택 기본공제가 <strong>거주하면 14억원, 살지 않으면 9억원</strong>으로 갈립니다(현행은 일률 12억원).</li>
            <li>다주택자 공제는 <strong>4억원 + 5억원 × (거주용 주택가액 ÷ 합계)</strong> 산식으로 바뀝니다 — 사는 집의 비중이 클수록 공제가 커집니다.</li>
            <li>공정시장가액비율이 60%에서 2027년 70%, 2028년에는 3주택 이상·조정대상지역 보유자는 80%까지 오릅니다.</li>
            <li>세율이 <strong>「주택 수 기준」에서 「주택 가액 기준」으로 일원화</strong>됩니다(2028년~). 과세표준 6~12억원 구간은 1.0% → 1.3%로 오릅니다.</li>
            <li>세액공제도 보유 → 거주 기준으로 바뀌고, 공제 «금액» 한도가 새로 생깁니다(2027년 800만원 → 2028년 이후 600만원).</li>
            <li>세부담 상한은 150% → 200%로 올라갑니다.</li>
          </ul>
        </section>

        <section className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '14px 17px', borderRadius: 8 }}>
          <strong style={{ display: 'block', marginBottom: 6 }}>이 계산에 반영하지 않은 것</strong>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7 }}>
            <strong>재산세 중복분 공제</strong>(종부세 과세표준에 이미 부과된 재산세를 빼 주는 제도)와 <strong>세부담 상한</strong>은 직전연도 보유세를 알아야 계산되므로 반영하지 않았습니다 — 실제 고지세액은 여기 금액보다 낮게 나옵니다.
            부부 공동명의 특례, 합산배제 임대주택·사원용 주택, 지방 저가주택·세컨드홈 특례도 반영하지 않았습니다.
            재산세 공제까지 반영한 현행법 기준 금액은 <a href="#/report/comprehensive" style={{ textDecoration: 'underline', fontWeight: 700 }}>종합부동산세 계산기</a>에서 확인하세요.
          </p>
        </section>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0 6px' }}>
          <button className="jt-btn jt-btn--ghost" onClick={() => setResult(null)}>← 조건 바꿔서 다시 계산</button>
          <button className="jt-btn jt-btn--ghost" onClick={() => setSubRoute && setSubRoute('reform-cgt')}>양도세는 얼마나 달라지나 →</button>
        </div>

        <JTReportCta setRoute={setRoute} />
        <RfCrossLinks setSubRoute={setSubRoute} exclude={[]} />
        <JTReportDisclaimer variant="inline" />
      </div>
    </JTReportShell>
  );
}

window.JTReportReformCGT = JTReportReformCGT;
window.JTReportReformCRE = JTReportReformCRE;

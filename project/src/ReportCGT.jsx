/* @jsx React.createElement */
/* 양도소득세 계산 — 검증 엔진(jt-tax-engine) 연결판 (v3)
   · 입력: 취득/양도가·실제 날짜·필요경비·실거주기간·자산유형·조정지역
   · 1차: 검증된 라이브 엔진(/v1/calc/transfer) 호출 → 법조문 단계·경고 표시
   · 폴백: 엔진 미응답 시 브라우저 자체 간이계산(기존 로직)으로 자동 전환 */

const { useState: useCgtState } = React;

/* 검증된 라이브 엔진 주소 (index.html의 window.JT_ENGINE_BASE로 덮어쓰기 가능) */
const CGT_ENGINE_BASE =
  (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'https://jt-tax-engine.fly.dev';

/* ================================================================
   폴백용 — 2025년 양도세 기본세율표(8구간) · 소득세법 §104
   ※ 엔진 미응답 시에만 사용하는 간이 근사. 지방소득세 10% 별도.
   ================================================================ */
const CGT_BRACKETS = [
  [14_000_000, 0.06, 0],
  [50_000_000, 0.15, 1_260_000],
  [88_000_000, 0.24, 5_760_000],
  [150_000_000, 0.35, 15_440_000],
  [300_000_000, 0.38, 19_940_000],
  [500_000_000, 0.40, 25_940_000],
  [1_000_000_000, 0.42, 35_940_000],
  [Infinity, 0.45, 65_940_000],
];

function calcBaseTax(taxBase) {
  if (taxBase <= 0) return 0;
  for (const [limit, rate, deduct] of CGT_BRACKETS) {
    if (taxBase <= limit) return Math.round(taxBase * rate - deduct);
  }
  return 0;
}

function calcLtDeductionRate(years, isOwnOccupied, is1House) {
  if (years < 3) return 0;
  if (is1House && isOwnOccupied) {
    const holdRate = Math.min(Math.floor(years), 10) * 0.04;
    const liveRate = Math.min(Math.floor(years), 10) * 0.04;
    return Math.min(holdRate + liveRate, 0.80);
  }
  const rate = Math.min(Math.floor(years) - 2, 13) * 0.02 + 0.06;
  return Math.min(rate, 0.30);
}

/* ── 날짜 유틸 ── */
function isoToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function yearsBetween(aIso, bIso) {
  if (!aIso || !bIso) return 0;
  const a = new Date(aIso), b = new Date(bIso);
  return Math.max((b - a) / (365.25 * 24 * 3600 * 1000), 0);
}
function subYearsIso(iso, years) {
  const [y, m, d] = iso.split('-').map(Number);
  const yy = y - Math.floor(years);
  const p = (n) => String(n).padStart(2, '0');
  return `${String(yy).padStart(4, '0')}-${p(m)}-${p(d)}`;
}

const CGT_QS = [
  {
    id: 'assetType',
    q: '양도하려는 자산은 무엇입니까?',
    opts: [
      ['house_1', '1세대 1주택 (비과세 가능성)', '2년 이상 보유·거주 시 비과세'],
      ['house_2', '다주택자 · 2주택', '조정지역 시 +20%p 중과 가능'],
      ['house_3', '다주택자 · 3주택 이상', '조정지역 시 +30%p 중과 가능'],
      ['commercial', '상가·오피스텔·토지', '일반 기본세율 적용'],
      ['other', '그 외 (분양권·입주권 등)', '분양권 60~70% 별도 세율'],
    ],
  },
  {
    id: 'acquired',
    q: '취득가는 얼마입니까? (원)',
    sub: '실제 매매가 또는 환산취득가. 숫자만 입력.',
    numeric: true,
    placeholder: '예: 500,000,000',
  },
  {
    id: 'sold',
    q: '양도가(예상 매도가)는 얼마입니까? (원)',
    numeric: true,
    placeholder: '예: 900,000,000',
  },
  {
    id: 'expenses',
    q: '필요경비 합계는 얼마입니까? (원)',
    sub: '취득세·법무사·중개수수료·자본적지출(증축·리모델링 등). 없거나 모르면 0.',
    numeric: true,
    optional: true,
    placeholder: '예: 20,000,000 (없으면 0)',
  },
  {
    id: 'acquiredDate',
    q: '취득일은 언제입니까?',
    sub: '잔금 지급일(등기 접수일) 기준. 보유기간·장기보유특별공제·단기세율의 기준입니다.',
    date: true,
  },
  {
    id: 'soldDate',
    q: '양도(예정)일은 언제입니까?',
    sub: '잔금 받는 날 기준. 미정이면 예상일을 넣어주세요.',
    date: true,
  },
  {
    id: 'residenceYears',
    q: '실제 거주한 기간은 몇 년입니까?',
    sub: '1세대 1주택만 해당 — 본인이 직접 거주한 햇수. 거주 안 했거나 상가·토지면 0.',
    numeric: true,
    optional: true,
    placeholder: '예: 5 (거주 안 함 = 0)',
  },
  {
    id: 'adjustedZone',
    q: '양도 대상은 조정대상지역 소재 주택입니까?',
    sub: '다주택 중과·1주택 거주요건 판정에 쓰입니다. (2026년 현재 서울 강남3구·용산구)',
    opts: [
      ['yes', '네, 조정대상지역입니다', '다주택 중과·거주요건 대상'],
      ['no', '아니오, 비조정지역입니다', '중과 없음 (기본세율)'],
      ['na', '해당 없음 (주택 아님)', ''],
    ],
  },
  {
    id: 'context',
    q: '추가로 공유하고 싶은 맥락이 있으면 적어주세요.',
    sub: '선택 사항 · 200자 이내. 취득 경위·이사·재개발·감면 등',
    freeform: true,
  },
];

function formatWon(n) {
  if (!n || isNaN(n)) return '0원';
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  const eok = Math.floor(n / 100_000_000);
  const man = Math.floor((n % 100_000_000) / 10_000);
  if (eok > 0 && man > 0) return `${sign}${eok}억 ${man.toLocaleString()}만원`;
  if (eok > 0) return `${sign}${eok}억원`;
  if (man > 0) return `${sign}${man.toLocaleString()}만원`;
  return `${sign}${n.toLocaleString()}원`;
}

/* ── 입력 → 엔진 파라미터 매핑 ── */
function buildEnginePayload(a) {
  const at = a.assetType;
  let property_type = '주택', housing_count = 1;
  if (at === 'house_2') housing_count = 2;
  else if (at === 'house_3') housing_count = 3;
  else if (at === 'commercial') { property_type = '토지'; housing_count = 0; }
  else if (at === 'other') { property_type = '분양권'; housing_count = 1; }

  const isReg = a.adjustedZone === 'yes';
  const resYears = Number(a.residenceYears) || 0;

  const p = {
    transfer_price: Number(a.sold) || 0,
    acquisition_price: Number(a.acquired) || 0,
    property_type,
    housing_count,
    acquisition_date: a.acquiredDate,
    transfer_date: a.soldDate,
    is_regulated_area: isReg,
    regulated_at_acquisition: isReg,
    expenses_total: Number(a.expenses) || 0,
  };
  // 실거주: move_in_date = 양도일 − 거주연수 (취득일 이전으로는 못 내려감)
  if (at === 'house_1' && resYears > 0 && a.soldDate && a.acquiredDate) {
    let moveIn = subYearsIso(a.soldDate, resYears);
    if (moveIn < a.acquiredDate) moveIn = a.acquiredDate;
    p.move_in_date = moveIn;
  }
  return p;
}

/* ── 엔진 응답 → 화면 표시용 정규화 ──
   FastAPI는 한글 요약 키(세액·총세부담…)를 최상위에 두고, 영문 구조 필드는 c.원본결과에 중첩한다. */
function normalizeEngineCalc(c) {
  const r = (c && c.원본결과) ? c.원본결과 : (c || {});
  const cap = r.transfer_gain || 0;
  return {
    source: 'engine',
    capGain: cap,
    ltRate: r.ltsd_total_rate || 0,
    ltDeduction: r.long_term_deduction || 0,
    transferIncome: r.transfer_income || 0,
    basicDeduction: r.basic_deduction || 0,
    taxBase: r.tax_base || 0,
    baseTax: r.calculated_tax || 0,
    reduction: r.reduction_amount || 0,
    finalTax: r.final_tax || 0,
    localTax: r.local_income_tax || 0,
    ruralTax: r.special_rural_tax || 0,
    totalTax: r.total_tax_burden || 0,
    isExempt: !!r.is_exempt,
    exemptionType: r.exemption_type || '',
    exemptionArticle: r.exemption_article || '',
    appliedRateType: r.applied_rate_type || '',
    returnType: r.return_type || '',
    returnDeadline: r.return_deadline || '',
    warnings: Array.isArray(r.warnings) ? r.warnings : (Array.isArray(c && c.경고사항) ? c.경고사항 : []),
    steps: Array.isArray(r.steps) ? r.steps : [],
    effectiveRate: cap > 0 ? (r.total_tax_burden / cap * 100) : 0,
  };
}

async function callEngine(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000); // 콜드스타트 대비 20초
  try {
    const res = await fetch(CGT_ENGINE_BASE + '/v1/calc/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('engine status ' + res.status);
    const data = await res.json();
    if (!data || !data.calc) throw new Error('engine empty');
    return normalizeEngineCalc(data.calc);
  } finally {
    clearTimeout(timer);
  }
}

/* ── 폴백: 브라우저 자체 간이계산(엔진 미응답 시) ── */
function runClientCalc(a) {
  const acquired = Number(a.acquired) || 0;
  const sold = Number(a.sold) || 0;
  const expenses = Number(a.expenses) || 0;
  const capGain = Math.max(sold - acquired - expenses, 0);
  const years = yearsBetween(a.acquiredDate, a.soldDate);
  const at = a.assetType;
  const is1House = at === 'house_1';
  const is2House = at === 'house_2';
  const is3House = at === 'house_3';
  const isHouse = is1House || is2House || is3House;
  const isBunyang = at === 'other';
  const isOwnOccupied = (Number(a.residenceYears) || 0) >= 2;
  const isAdjusted = a.adjustedZone === 'yes';

  let taxable = capGain, isExempt = false, exemptionType = '';
  if (is1House && sold <= 1_200_000_000 && years >= 2) {
    taxable = 0; isExempt = true; exemptionType = '1세대1주택';
  } else if (is1House && sold > 1_200_000_000 && years >= 2) {
    taxable = Math.round(capGain * ((sold - 1_200_000_000) / sold));
    isExempt = true; exemptionType = '1세대1주택(12억 초과분 과세)';
  }
  const ltRate = calcLtDeductionRate(years, isOwnOccupied, is1House);
  const ltDeduction = Math.round(taxable * ltRate);
  const afterLt = Math.max(taxable - ltDeduction, 0);
  const basicDeduction = 2_500_000;
  const taxBase = Math.max(afterLt - basicDeduction, 0);

  let baseTax, appliedRateType = '기본';
  if (isBunyang) {
    const rate = years < 1 ? 0.70 : 0.60;
    baseTax = Math.round(taxBase * rate); appliedRateType = `분양권 ${(rate * 100).toFixed(0)}%`;
  } else if (years < 1) {
    baseTax = Math.round(taxBase * 0.70); appliedRateType = '단기 70%';
  } else if (years < 2 && isHouse) {
    baseTax = Math.round(taxBase * 0.60); appliedRateType = '단기 60%';
  } else if (isHouse && isAdjusted && (is2House || is3House)) {
    const surcharge = is3House ? 0.30 : 0.20;
    baseTax = calcBaseTax(taxBase) + Math.round(taxBase * surcharge);
    appliedRateType = `중과 +${(surcharge * 100).toFixed(0)}%p`;
  } else {
    baseTax = calcBaseTax(taxBase);
  }
  const localTax = Math.round(baseTax * 0.10);
  const totalTax = baseTax + localTax;
  return {
    source: 'fallback',
    capGain, ltRate, ltDeduction, transferIncome: afterLt,
    basicDeduction, taxBase, baseTax, reduction: 0,
    finalTax: baseTax, localTax, ruralTax: 0, totalTax,
    isExempt, exemptionType, exemptionArticle: isExempt ? '소득세법 §89①3호' : '',
    appliedRateType, returnType: '', returnDeadline: '', warnings: [], steps: [],
    effectiveRate: capGain > 0 ? (totalTax / capGain * 100) : 0,
  };
}

/* ── 코멘터리(정적): 엔진 경고 + 일반 주의/절세/확인자료 ── */
function buildCommentary(a, calc) {
  const headline = calc.isExempt && calc.totalTax === 0
    ? `${calc.exemptionType || '비과세'} 대상으로 추정됩니다. 세대·거주 요건 증빙 확인이 핵심입니다.`
    : (calc.source === 'engine'
        ? '검증 엔진 기준 추정입니다. 감면·특례·세대 판정에 따라 달라질 수 있어 정밀 검토를 권합니다.'
        : '간이 추정 결과입니다(엔진 연결 실패). 정밀 분석은 담당 세무사 상담으로 이어받겠습니다.');

  const cautions = [];
  (calc.warnings || []).slice(0, 2).forEach((w) =>
    cautions.push({ title: '입력 기준 점검 경고', detail: w }));
  cautions.push({
    title: '세대·거주 요건 재확인',
    detail: '1세대1주택 비과세와 장기보유특별공제는 "세대" 판정과 "거주" 증빙이 핵심입니다. 주민등록·실거래·임대차 기록으로 검토해야 합니다.',
  });
  if (cautions.length < 3) cautions.push({
    title: '조정지역·중과 적용 시점',
    detail: '다주택 중과세는 조정대상지역 지정일·해제일·한시 유예 정책에 따라 갈립니다. 양도 시점 기준 법령 확인이 필요합니다.',
  });
  if (cautions.length < 3) cautions.push({
    title: '간이 추정치',
    detail: '본 계산은 입력값 기준 추정으로, 감면·이월과세·부담부증여 등 특례가 있으면 결과가 크게 달라질 수 있습니다.',
  });

  return {
    headline,
    cautions: cautions.slice(0, 3),
    saving_ideas: [
      { title: '필요경비 누락 점검', detail: '취득세·중개수수료·자본적 지출(증축·리모델링)은 필요경비로 차감됩니다. 영수증·계약서 확보가 관건입니다.' },
      { title: '양도 시점 조정', detail: '보유·거주 요건 충족 시점이나 과세구간 경계에 근접하면, 양도 시점 조정으로 세액이 수천만원 단위로 바뀔 수 있습니다.' },
    ],
    followup: [
      '취득 당시 매매계약서 및 취득세 영수증',
      '거주기간 입증 자료(주민등록초본·관리비·공과금 내역)',
      '필요경비 증빙(자본적지출·중개수수료 등)',
    ],
  };
}

function JTReportCGT({ setRoute, onBack }) {
  const [step, setStep] = useCgtState(0);
  const [answers, setAnswers] = useCgtState({ soldDate: isoToday() });
  const [loading, setLoading] = useCgtState(false);
  const [report, setReport] = useCgtState(null);
  const [err, setErr] = useCgtState(null);

  const total = CGT_QS.length;
  const cur = CGT_QS[step];
  const isLast = step === total - 1;

  const setAns = (id, v) => setAnswers(a => ({ ...a, [id]: v }));

  const canNext = () => {
    if (cur.freeform || cur.optional) return true;
    if (cur.numeric) {
      const v = Number(answers[cur.id]);
      return !isNaN(v) && v > 0;
    }
    if (cur.date) return !!answers[cur.id];
    return !!answers[cur.id];
  };

  const runAnalysis = async () => {
    setLoading(true);
    setErr(null);
    try {
      const payload = buildEnginePayload(answers);
      let calc;
      try {
        calc = await callEngine(payload);          // 1차: 검증 엔진
      } catch (engineErr) {
        console.warn('엔진 호출 실패 → 폴백 계산', engineErr);
        calc = runClientCalc(answers);             // 폴백: 자체 간이계산
      }
      const commentary = buildCommentary(answers, calc);
      setReport({ calc, commentary });
    } catch (e) {
      console.error(e);
      setErr(e.message || '분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => { isLast ? runAnalysis() : setStep(s => s + 1); };
  const goPrev = () => { step === 0 ? onBack() : setStep(s => s - 1); };

  // ===== 결과 =====
  if (report) {
    const { calc, commentary } = report;
    const fromEngine = calc.source === 'engine';
    return (
      <div className="jt-container jt-report-result">
        <div className="jt-report-result__head">
          <button className="jt-report-shell__back" onClick={onBack}>← JT 리포트 허브</button>
          <div className="jt-report-result__meta">
            <span className="jt-tag">{fromEngine ? 'ENGINE' : 'LEGACY'}</span>
            <span>양도소득세 계산 · {new Date().toLocaleDateString('ko-KR')}</span>
          </div>
        </div>

        <div className="jt-report-result__grade jt-grade-mid">
          <div className="jt-report-result__grade-label">
            {calc.isExempt && calc.totalTax === 0 ? '비과세 추정' : '추정 총 세부담'}
            {fromEngine ? ' · 검증 엔진' : ' · 간이 추정'}
          </div>
          <div className="jt-report-result__grade-val">
            {calc.isExempt && calc.totalTax === 0 ? '비과세' : formatWon(calc.totalTax)}
          </div>
          <p style={{ fontSize: 13, opacity: 0.75, marginTop: 8, marginBottom: 12, letterSpacing: '0.02em' }}>
            {fromEngine
              ? '※ 검증된 계산 엔진 기준 추정. 감면·특례·세대 판정 등 개별 사실관계에 따라 달라질 수 있습니다.'
              : '※ 엔진 연결이 일시적으로 실패하여 간이 추정으로 계산되었습니다. 정밀 결과는 상담에서 확인하세요.'}
          </p>
          <p>{commentary.headline}</p>
          {calc.isExempt && calc.exemptionType && (
            <p style={{ marginTop: 12, fontWeight: 500 }}>
              {calc.exemptionType} {calc.exemptionArticle ? `(${calc.exemptionArticle})` : ''}
            </p>
          )}
          {calc.appliedRateType && !calc.isExempt && (
            <p style={{ marginTop: 12, fontWeight: 500 }}>적용 세율 유형: {calc.appliedRateType}</p>
          )}
        </div>

        {(calc.warnings || []).length > 0 && (
          <section className="jt-report-result__section">
            <h3>입력 기준 점검</h3>
            <ul className="jt-report-check">
              {calc.warnings.map((w, i) => (
                <li key={i}><span className="jt-report-check__box">!</span>{w}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="jt-report-result__section">
          <h3>계산 내역</h3>
          <table className="jt-report-calc">
            <tbody>
              <tr><th>양도차익 (양도가 − 취득가 − 필요경비)</th><td>{formatWon(calc.capGain)}</td></tr>
              <tr><th>장기보유특별공제 ({(calc.ltRate * 100).toFixed(0)}%)</th><td>− {formatWon(calc.ltDeduction)}</td></tr>
              <tr><th>양도소득금액</th><td>{formatWon(calc.transferIncome)}</td></tr>
              <tr><th>기본공제</th><td>− {formatWon(calc.basicDeduction)}</td></tr>
              <tr><th><strong>과세표준</strong></th><td><strong>{formatWon(calc.taxBase)}</strong></td></tr>
              <tr><th>산출세액</th><td>{formatWon(calc.baseTax)}</td></tr>
              {calc.reduction > 0 && <tr><th>감면세액</th><td>− {formatWon(calc.reduction)}</td></tr>}
              <tr><th>납부할 양도소득세</th><td>{formatWon(calc.finalTax)}</td></tr>
              <tr><th>지방소득세 (10%)</th><td>{formatWon(calc.localTax)}</td></tr>
              {calc.ruralTax > 0 && <tr><th>농어촌특별세</th><td>{formatWon(calc.ruralTax)}</td></tr>}
              <tr className="jt-report-calc__total"><th>총 세부담</th><td>{formatWon(calc.totalTax)}</td></tr>
              <tr><th>실효세율 (양도차익 대비)</th><td>{calc.effectiveRate.toFixed(1)}%</td></tr>
              {calc.returnDeadline && <tr><th>{calc.returnType || '신고기한'}</th><td>{calc.returnDeadline}</td></tr>}
            </tbody>
          </table>

          {fromEngine && (calc.steps || []).length > 0 && (
            <details className="jt-report-steps" style={{ marginTop: 16 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 500 }}>상세 계산 근거 (법령 단계) 보기</summary>
              <table className="jt-report-calc" style={{ marginTop: 12 }}>
                <tbody>
                  {calc.steps.map((s, i) => (
                    <tr key={i}>
                      <th style={{ whiteSpace: 'normal' }}>
                        {s.name}
                        {s.note ? <span style={{ display: 'block', fontWeight: 400, fontSize: 12, opacity: 0.7 }}>{s.note}</span> : null}
                      </th>
                      <td style={{ fontSize: 12, opacity: 0.8 }}>{s.article || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </section>

        <div className="jt-report-result__grid">
          <section className="jt-report-result__section">
            <h3>주의 포인트</h3>
            <ol className="jt-report-reasons">
              {(commentary.cautions || []).map((r, i) => (
                <li key={i}>
                  <div className="jt-report-reasons__head">
                    <span className="jt-report-reasons__n">{String(i + 1).padStart(2, '0')}</span>
                    <h4>{r.title}</h4>
                  </div>
                  <p>{r.detail}</p>
                </li>
              ))}
            </ol>
          </section>
          <section className="jt-report-result__section">
            <h3>절세 여지</h3>
            <ol className="jt-report-reasons">
              {(commentary.saving_ideas || []).map((r, i) => (
                <li key={i}>
                  <div className="jt-report-reasons__head">
                    <span className="jt-report-reasons__n">{String(i + 1).padStart(2, '0')}</span>
                    <h4>{r.title}</h4>
                  </div>
                  <p>{r.detail}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section className="jt-report-result__section">
          <h3>추가 확인이 필요한 자료</h3>
          <ul className="jt-report-check">
            {(commentary.followup || []).map((c, i) => (
              <li key={i}><span className="jt-report-check__box">☐</span>{c}</li>
            ))}
          </ul>
        </section>

        <JTReportDisclaimer variant="inline" />
        <JTReportConvert
          setRoute={setRoute}
          reportType="양도소득세 계산"
          reportTag={fromEngine ? 'ENGINE' : 'LEGACY'}
          reportSummary={`총 세부담 ${calc.isExempt && calc.totalTax === 0 ? '비과세(추정)' : formatWon(calc.totalTax)} / 과세표준 ${formatWon(calc.taxBase)} / ${commentary.headline || ''}`}
          urgent={!calc.isExempt && (calc.appliedRateType || '').indexOf('단기') >= 0}
        />

        <div className="jt-report-result__foot">
          <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setStep(0); setAnswers({ soldDate: isoToday() }); }}>다시 계산</button>
          <button className="jt-btn jt-btn--ghost" onClick={() => window.print()}>PDF / 인쇄</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="jt-container jt-report-loading">
        <div className="jt-report-loading__spinner" />
        <h2>세액을 계산하고 있습니다</h2>
        <p>검증된 계산 엔진에 안전하게 연결하는 중입니다. (몇 초 걸릴 수 있습니다)</p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="jt-container jt-report-loading">
        <h2>일시적인 오류입니다</h2>
        <p>{err}</p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="jt-btn jt-btn--primary" onClick={() => { setErr(null); runAnalysis(); }}>다시 시도</button>
          <button className="jt-btn jt-btn--ghost" onClick={onBack}>허브로 돌아가기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="jt-container">
      <JTReportShell
        title="양도소득세 계산"
        subtitle="취득·양도가·실제 날짜·거주 정보로 검증 엔진이 세액을 계산합니다."
        stepIdx={step}
        stepTotal={total}
        onBack={goPrev}
        tag="ENGINE"
      >
        <div className="jt-report-q">
          <h2>{cur.q}</h2>
          {cur.sub && <p className="jt-report-q__sub">{cur.sub}</p>}

          {cur.freeform && (
            <textarea
              className="jt-report-q__textarea"
              maxLength={200}
              placeholder="예: 조정대상지역이며 분양권을 보유한 상태입니다"
              value={answers[cur.id] || ''}
              onChange={(e) => setAns(cur.id, e.target.value)}
            />
          )}

          {cur.date && (
            <input
              className="jt-report-q__input"
              type="date"
              value={answers[cur.id] || ''}
              max="2100-12-31"
              min="1980-01-01"
              onChange={(e) => setAns(cur.id, e.target.value)}
            />
          )}

          {cur.numeric && (
            <input
              className="jt-report-q__input"
              type="text"
              inputMode="numeric"
              placeholder={cur.placeholder}
              value={answers[cur.id] ? Number(answers[cur.id]).toLocaleString('ko-KR') : ''}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, '');
                setAns(cur.id, digits);
              }}
            />
          )}

          {!cur.freeform && !cur.numeric && !cur.date && (
            <div className="jt-report-q__opts">
              {cur.opts.map(([v, label, hint]) => {
                const selected = answers[cur.id] === v;
                return (
                  <button
                    key={v}
                    className={`jt-report-q__opt ${selected ? 'is-selected' : ''}`}
                    onClick={() => setAns(cur.id, v)}
                  >
                    <span className="jt-report-q__opt-bullet">{selected ? '●' : '○'}</span>
                    <span className="jt-report-q__opt-body">
                      <span className="jt-report-q__opt-label">{label}</span>
                      {hint && <span className="jt-report-q__opt-hint">{hint}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="jt-report-q__nav">
          <button className="jt-btn jt-btn--ghost" onClick={goPrev}>
            {step === 0 ? '← 허브' : '← 이전'}
          </button>
          <button className="jt-btn jt-btn--primary" onClick={goNext} disabled={!canNext()}>
            {isLast ? '리포트 생성 →' : '다음 →'}
          </button>
        </div>
      </JTReportShell>
    </div>
  );
}
window.JTReportCGT = JTReportCGT;

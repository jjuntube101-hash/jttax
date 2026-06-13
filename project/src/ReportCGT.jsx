/* @jsx React.createElement */
/* 양도소득세 간이 계산 — 7문항 · JS 결정론 + claude 코멘터리 (v2) */

const { useState: useCgtState } = React;

/* ================================================================
   2025년 양도소득세 기본세율표 (8구간) — 소득세법 §104
   ※ 간이 참고용. 지방소득세 10% 별도. 2025년 귀속분 기준.
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

// 장기보유특별공제율
function calcLtDeductionRate(years, isOwnOccupied, is1House) {
  if (years < 3) return 0;
  // 1세대1주택 실거주(2년 이상): 보유+거주 각 최대 40%, 합계 최대 80%
  if (is1House && isOwnOccupied) {
    const holdRate = Math.min(Math.floor(years), 10) * 0.04;
    const liveRate = Math.min(Math.floor(years), 10) * 0.04;
    return Math.min(holdRate + liveRate, 0.80);
  }
  // 일반(3년~15년+): 연 2%, 최대 30%
  const rate = Math.min(Math.floor(years) - 2, 13) * 0.02 + 0.06;
  return Math.min(rate, 0.30);
}

const CGT_QS = [
  {
    id: 'assetType',
    q: '양도하려는 자산은 무엇입니까?',
    opts: [
      ['house_1', '1세대 1주택 (비과세 가능성)', '2년 이상 보유·거주'],
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
    id: 'years',
    q: '보유 기간은 몇 년입니까?',
    opts: [
      ['1', '1년 미만', '단기 양도 — 중과세'],
      ['2', '1~2년', '단기 양도'],
      ['3', '2~3년', ''],
      ['5', '3~5년', ''],
      ['10', '5~10년', ''],
      ['15', '10~15년', ''],
      ['20', '15년 이상', ''],
    ],
  },
  {
    id: 'ownOccupied',
    q: '실거주(2년 이상)를 하셨습니까?',
    sub: '1세대 1주택 장기보유특별공제는 거주 요건에 따라 크게 달라집니다.',
    opts: [
      ['yes', '네, 2년 이상 실거주했습니다', '장특공 최대 80% 가능'],
      ['no', '아니요 / 2년 미만', '장특공 최대 30%'],
      ['na', '해당 없음 (상가·토지 등)', ''],
    ],
  },
  {
    id: 'adjustedZone',
    q: '양도 대상은 조정대상지역 소재 주택입니까?',
    sub: '다주택자 중과세 판정의 핵심 요건입니다. (2025년 현재 서울 강남3구·용산구)',
    opts: [
      ['yes', '네, 조정대상지역입니다', '다주택자 중과세율 적용 대상'],
      ['no', '아니오, 비조정지역입니다', '중과 없음 (기본세율)'],
      ['na', '해당 없음 (주택 아님)', ''],
    ],
  },
  {
    id: 'context',
    q: '추가로 공유하고 싶은 맥락이 있으면 적어주세요.',
    sub: '선택 사항 · 200자 이내. 취득 경위·이사·재개발 등',
    freeform: true,
  },
];

function formatWon(n) {
  if (!n || isNaN(n)) return '0원';
  const eok = Math.floor(n / 100_000_000);
  const man = Math.floor((n % 100_000_000) / 10_000);
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만원`;
  if (eok > 0) return `${eok}억원`;
  if (man > 0) return `${man.toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}

function JTReportCGT({ setRoute, onBack }) {
  const [step, setStep] = useCgtState(0);
  const [answers, setAnswers] = useCgtState({});
  const [loading, setLoading] = useCgtState(false);
  const [report, setReport] = useCgtState(null);
  const [err, setErr] = useCgtState(null);

  const total = CGT_QS.length;
  const cur = CGT_QS[step];
  const isLast = step === total - 1;

  const setAns = (id, v) => setAnswers(a => ({ ...a, [id]: v }));

  const canNext = () => {
    if (cur.freeform) return true;
    if (cur.numeric) {
      const v = Number(answers[cur.id]);
      return !isNaN(v) && v > 0;
    }
    return !!answers[cur.id];
  };

  const runAnalysis = async () => {
    setLoading(true);
    setErr(null);
    try {
      const acquired = Number(answers.acquired) || 0;
      const sold = Number(answers.sold) || 0;
      const capGain = Math.max(sold - acquired, 0);
      const years = Number(answers.years) || 0;
      const assetType = answers.assetType;
      const isOwnOccupied = answers.ownOccupied === 'yes';
      const is1House = assetType === 'house_1';
      const is2House = assetType === 'house_2';
      const is3House = assetType === 'house_3';
      const isHouse = is1House || is2House || is3House;
      const isBunyang = assetType === 'other';
      const isAdjusted = answers.adjustedZone === 'yes';

      // 1세대1주택 비과세 (12억 이하)
      let nonTaxableMsg = null;
      let taxable = capGain;
      if (is1House && sold <= 1_200_000_000 && years >= 2) {
        nonTaxableMsg = '1세대 1주택 · 양도가 12억 이하 · 2년 이상 보유 요건을 모두 충족하시면 원칙적으로 비과세 대상입니다.';
        taxable = 0;
      } else if (is1House && sold > 1_200_000_000 && years >= 2) {
        // 12억 초과분만 과세
        const taxableRatio = (sold - 1_200_000_000) / sold;
        taxable = Math.round(capGain * taxableRatio);
        nonTaxableMsg = '1세대 1주택이지만 양도가 12억 초과분에 대해서만 과세됩니다 (안분 계산).';
      }

      // 장기보유특별공제
      const ltRate = calcLtDeductionRate(years, isOwnOccupied, is1House);
      const ltDeduction = Math.round(taxable * ltRate);
      const afterLt = Math.max(taxable - ltDeduction, 0);

      // 기본공제 250만원
      const basicDeduction = 2_500_000;
      const taxBase = Math.max(afterLt - basicDeduction, 0);

      // 단기양도 중과세 (소득세법 §104) + 다주택자 중과세 + 분양권
      let baseTax;
      let shortTermNote = null;
      if (isBunyang) {
        // 분양권: 1년 미만 70%, 1년 이상 60%
        const rate = years < 1 ? 0.70 : 0.60;
        baseTax = Math.round(taxBase * rate);
        shortTermNote = `분양권·입주권 양도 · ${(rate * 100).toFixed(0)}% 단일세율이 적용됩니다.`;
      } else if (years < 1) {
        baseTax = Math.round(taxBase * 0.70);
        shortTermNote = '보유 1년 미만 단기양도 · 70% 중과세율이 적용됩니다.';
      } else if (years < 2 && isHouse) {
        baseTax = Math.round(taxBase * 0.60);
        shortTermNote = '주택 단기양도(1~2년) · 60% 중과세율이 적용됩니다.';
      } else if (isHouse && isAdjusted && (is2House || is3House)) {
        // 다주택자 + 조정대상지역 중과세: 기본세율 + 20%p(2주택) / +30%p(3주택 이상)
        const surcharge = is3House ? 0.30 : 0.20;
        const basicTax = calcBaseTax(taxBase);
        const surchargeTax = Math.round(taxBase * surcharge);
        baseTax = basicTax + surchargeTax;
        shortTermNote = `조정대상지역 ${is3House ? '3주택 이상' : '2주택'} · 기본세율 + ${(surcharge * 100).toFixed(0)}%p 중과세율이 적용됩니다. 단, 2025년 양도 시점까지 중과 한시 유예 여부는 별도 확인이 필요합니다.`;
      } else {
        baseTax = calcBaseTax(taxBase);
      }

      // 지방소득세 10%
      const localTax = Math.round(baseTax * 0.10);
      const totalTax = baseTax + localTax;

      const calc = {
        capGain,
        nonTaxableMsg,
        taxableAfter1House: taxable,
        ltRate,
        ltDeduction,
        afterLt,
        basicDeduction,
        taxBase,
        baseTax,
        localTax,
        totalTax,
        shortTermNote,
        effectiveRate: capGain > 0 ? (totalTax / capGain * 100) : 0,
      };

      // claude 코멘터리
      const context = `
사용자 응답:
- 자산 유형: ${CGT_QS[0].opts.find(o => o[0] === assetType)?.[1]}
- 취득가: ${formatWon(acquired)}
- 양도가: ${formatWon(sold)}
- 양도차익: ${formatWon(capGain)}
- 보유기간: ${answers.years}년
- 실거주: ${answers.ownOccupied}
- 조정대상지역: ${answers.adjustedZone || '미응답'}
- 추가 맥락: ${answers.context || '(없음)'}

계산 결과:
- 과세표준: ${formatWon(calc.taxBase)}
- 산출세액: ${formatWon(calc.baseTax)}
- 지방소득세: ${formatWon(calc.localTax)}
- 총 세액: ${formatWon(calc.totalTax)}
- 실효세율: ${calc.effectiveRate.toFixed(1)}%
${nonTaxableMsg ? '- 특이사항: ' + nonTaxableMsg : ''}
${shortTermNote ? '- 특이사항: ' + shortTermNote : ''}
`;

      const prompt = `당신은 한국 세법에 능통한 국세청 출신 세무사입니다. 아래 양도소득세 간이 계산 결과에 대해 납세자가 반드시 알아야 할 주의 포인트와 절세 여지를 JSON으로만 응답하세요. 단정적 결론은 피하고 "검토 필요", "가능성" 같은 표현을 사용하세요.

${context}

다음 JSON 스키마로만 응답:
{
  "headline": "한 문장 요약",
  "cautions": [
    {"title": "주의 포인트 제목", "detail": "2~3문장 설명"}
  ],
  "saving_ideas": [
    {"title": "절세 아이디어 제목", "detail": "2~3문장 설명"}
  ],
  "followup": ["추가로 확인할 자료·사실 1", "2", "3"]
}

cautions 3개, saving_ideas 2~3개.`;

      const txt = await window.claude.complete(prompt);
      const match = txt.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('JSON 추출 실패');
      const data = JSON.parse(match[0]);

      setReport({ calc, commentary: data });
    } catch (e) {
      console.error(e);
      // Claude API 실패 시 계산 결과만 가지고 기본 코멘터리를 구성해 폴백
      try {
        const acquired2 = Number(answers.acquired) || 0;
        const sold2 = Number(answers.sold) || 0;
        const capGain2 = Math.max(sold2 - acquired2, 0);
        const years2 = Number(answers.years) || 0;
        const assetType2 = answers.assetType;
        const isOwnOccupied2 = answers.ownOccupied === 'yes';
        const is1House2 = assetType2 === 'house_1';
        const isAdjusted2 = answers.adjustedZone === 'yes';

        // 기본 계산만 재실행 (runAnalysis 본문의 로직 요약)
        let taxable2 = capGain2;
        let nonTaxableMsg2 = null;
        if (is1House2 && sold2 <= 1_200_000_000 && years2 >= 2) {
          nonTaxableMsg2 = '1세대 1주택 · 양도가 12억 이하 · 2년 이상 보유 요건 충족 시 원칙적 비과세.';
          taxable2 = 0;
        } else if (is1House2 && sold2 > 1_200_000_000 && years2 >= 2) {
          taxable2 = Math.round(capGain2 * ((sold2 - 1_200_000_000) / sold2));
          nonTaxableMsg2 = '12억 초과분 안분 과세.';
        }
        const ltRate2 = calcLtDeductionRate(years2, isOwnOccupied2, is1House2);
        const afterLt2 = Math.max(taxable2 - Math.round(taxable2 * ltRate2), 0);
        const taxBase2 = Math.max(afterLt2 - 2_500_000, 0);
        const baseTax2 = calcBaseTax(taxBase2);
        const totalTax2 = Math.round(baseTax2 * 1.10);

        const fallback = {
          calc: {
            capGain: capGain2, nonTaxableMsg: nonTaxableMsg2, taxableAfter1House: taxable2,
            ltRate: ltRate2, ltDeduction: Math.round(taxable2 * ltRate2), afterLt: afterLt2,
            basicDeduction: 2_500_000, taxBase: taxBase2, baseTax: baseTax2,
            localTax: Math.round(baseTax2 * 0.10), totalTax: totalTax2, shortTermNote: null,
            effectiveRate: capGain2 > 0 ? (totalTax2 / capGain2 * 100) : 0,
          },
          commentary: {
            headline: '간이 계산 결과입니다. 정밀 분석은 담당 세무사 상담으로 이어받겠습니다.',
            cautions: [
              { title: '간이 추정치입니다', detail: '본 계산은 주요 변수만 반영한 참고치로, 실제 세액은 취득시기·감면·특례·조정지역 지정일 등에 따라 크게 달라질 수 있습니다.' },
              { title: '보유·거주 요건 재확인', detail: '1세대 1주택 비과세와 장기보유특별공제는 "세대" 판정과 "거주" 증빙이 핵심입니다. 주민등록·실거래·임대차 기록을 갖춰 검토해야 합니다.' },
              { title: '조정지역·중과 유예 확인', detail: '다주택자 중과세는 지정일·해제일·한시 유예 정책에 따라 적용 여부가 갈립니다. 양도 시점 기준 법령 확인이 필요합니다.' },
            ],
            saving_ideas: [
              { title: '양도 시점 조정', detail: '보유·거주 요건 충족 시점이나 과세 구간 경계에 근접한 경우, 양도 시점을 조정해 세액이 수천만원 단위로 바뀔 수 있습니다.' },
              { title: '필요경비 누락 점검', detail: '취득세·중개수수료·자본적 지출(리모델링·증축)은 필요경비로 차감 가능합니다. 영수증과 계약서 확보가 관건입니다.' },
            ],
            followup: ['취득 당시 매매계약서 및 취득세 영수증', '거주기간을 입증할 주민등록초본·관리비 내역', '필요경비 증빙(리모델링·중개수수료 등)'],
          },
        };
        setReport(fallback);
      } catch (ee) {
        setErr(e.message || '분석 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => { isLast ? runAnalysis() : setStep(s => s + 1); };
  const goPrev = () => { step === 0 ? onBack() : setStep(s => s - 1); };

  // ===== 결과 =====
  if (report) {
    const { calc, commentary } = report;
    return (
      <div className="jt-container jt-report-result">
        <div className="jt-report-result__head">
          <button className="jt-report-shell__back" onClick={onBack}>← JT 리포트 허브</button>
          <div className="jt-report-result__meta">
            <span className="jt-tag">LEGACY</span>
            <span>양도소득세 간이 계산 · {new Date().toLocaleDateString('ko-KR')}</span>
          </div>
        </div>

        <div className="jt-report-result__grade jt-grade-mid">
          <div className="jt-report-result__grade-label">추정 총 세액 · 간이 추정치</div>
          <div className="jt-report-result__grade-val">{formatWon(calc.totalTax)}</div>
          <p style={{fontSize: 13, opacity: 0.75, marginTop: 8, marginBottom: 12, letterSpacing: '0.02em'}}>
            ※ 주요 변수만 반영한 간이 추정. 실제 세액은 취득시기·감면·특례 등에 따라 달라집니다.
          </p>
          <p>{commentary.headline}</p>
          {calc.nonTaxableMsg && <p style={{marginTop: 12, fontWeight: 500}}>{calc.nonTaxableMsg}</p>}
          {calc.shortTermNote && <p style={{marginTop: 12, fontWeight: 500}}>{calc.shortTermNote}</p>}
        </div>

        <section className="jt-report-result__section">
          <h3>계산 내역</h3>
          <table className="jt-report-calc">
            <tbody>
              <tr><th>양도차익 (양도가 − 취득가)</th><td>{formatWon(calc.capGain)}</td></tr>
              <tr><th>1세대1주택 비과세 반영 후 과세대상</th><td>{formatWon(calc.taxableAfter1House)}</td></tr>
              <tr><th>장기보유특별공제 ({(calc.ltRate * 100).toFixed(0)}%)</th><td>− {formatWon(calc.ltDeduction)}</td></tr>
              <tr><th>공제 후 금액</th><td>{formatWon(calc.afterLt)}</td></tr>
              <tr><th>기본공제</th><td>− {formatWon(calc.basicDeduction)}</td></tr>
              <tr><th><strong>과세표준</strong></th><td><strong>{formatWon(calc.taxBase)}</strong></td></tr>
              <tr><th>산출세액</th><td>{formatWon(calc.baseTax)}</td></tr>
              <tr><th>지방소득세 (10%)</th><td>{formatWon(calc.localTax)}</td></tr>
              <tr className="jt-report-calc__total"><th>총 세액</th><td>{formatWon(calc.totalTax)}</td></tr>
              <tr><th>실효세율 (양도차익 대비)</th><td>{calc.effectiveRate.toFixed(1)}%</td></tr>
            </tbody>
          </table>
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
          reportType="양도소득세 간이 계산"
          reportTag="LEGACY"
          reportSummary={`총 세액 ${formatWon(calc.totalTax)} / 과세표준 ${formatWon(calc.taxBase)} / ${commentary.headline || ''}`}
          urgent={calc.shortTermNote !== null}
        />

        <div className="jt-report-result__foot">
          <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setStep(0); setAnswers({}); }}>다시 계산</button>
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
        <p>기본세율 · 장기보유특별공제 · 지방소득세를 반영합니다.</p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="jt-container jt-report-loading">
        <h2>일시적인 오류입니다</h2>
        <p>{err}</p>
        <div style={{marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center'}}>
          <button className="jt-btn jt-btn--primary" onClick={() => { setErr(null); runAnalysis(); }}>다시 시도</button>
          <button className="jt-btn jt-btn--ghost" onClick={onBack}>허브로 돌아가기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="jt-container">
      <JTReportShell
        title="양도소득세 간이 계산"
        subtitle="취득·양도·보유·거주 정보로 추정 세액을 계산합니다."
        stepIdx={step}
        stepTotal={total}
        onBack={goPrev}
        tag="LEGACY"
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

          {!cur.freeform && !cur.numeric && (
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

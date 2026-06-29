/* @jsx React.createElement */
/* 4대보험·실수령 계산기 — 월 급여(세전) → 4대보험 공제(요율) + 근로소득세(검증 엔진 /income 연→월) → 실수령액.
   4대보험 요율 = 2026년 기준(보건복지부·국민연금공단 공식 고시, 1차소스 확인 260624):
   · 국민연금 근로자 4.75%(2026 9.5%의 1/2), 기준소득월액 하한 40만·상한 637만(2025.7~2026.6 고시)
   · 건강보험 근로자 3.595%(2026 7.19%의 1/2)
   · 장기요양 = 근로자 건강보험료 × 13.14%(2026)
   · 고용보험 근로자 0.9%(실업급여분)
   근로소득세 원천징수는 간이세액표 기준이나, 본 계산은 연 근로소득세(엔진)/12로 추정 → 연말정산으로 정산.
   공통 헬퍼(formatWon·JTReportShell·JTReportConvert·acqKoreanAmount)는 먼저 로드된 파일의 전역 사용. */

const { useState: useInsState } = React;

// 2026년 4대보험 요율 (근로자 부담분) — 보건복지부·국민연금공단 공식 (1차소스 260624)
const INS_RATES_2026 = {
  pension: 0.0475,            // 국민연금 (9.5%의 1/2)
  pensionMin: 400000,        // 기준소득월액 하한 (2025.7~2026.6)
  pensionMax: 6370000,       // 기준소득월액 상한 (2025.7~2026.6)
  health: 0.03595,           // 건강보험 (7.19%의 1/2)
  longTermOfHealth: 0.1314,  // 장기요양 = 건강보험료 × 13.14%
  employment: 0.009,         // 고용보험 (실업급여분)
};

const INS_QS = [
  {
    id: 'monthlySalary',
    tier: 'quick',
    section: '월 급여',
    q: '세전 월 급여가 얼마인가요? (원)',
    sub: '4대보험·세금을 떼기 전 「월 급여(과세 대상)」를 넣어 주세요. 비과세(식대 월 20만원 등)는 빼고 넣으면 더 정확합니다. 연봉만 아시면 12로 나눈 금액을 넣으세요.',
    numeric: true, money: true,
    placeholder: '예: 3,500,000',
  },
  {
    id: 'dependents',
    section: '부양가족',
    q: '본인 외 부양가족(배우자·자녀·부모 등)은 몇 명인가요?',
    sub: '소득요건을 충족하는 부양가족 수(배우자 포함). 근로소득세(원천징수) 인적공제에 반영됩니다. 4대보험료는 부양가족과 무관합니다. 없으면 0.',
    numeric: true, optional: true,
    placeholder: '예: 1 (없으면 0)',
  },
  {
    id: 'children',
    section: '부양가족',
    q: `그중 ${window.jtLaw('childTaxCredit.minAge', 13)}세 이상 자녀는 몇 명인가요?`,
    sub: `${window.jtLaw('childTaxCredit.minAge', 13)}세 이상~${window.jtLaw('childTaxCredit.maxAge', 20)}세 이하 자녀 수(자녀세액공제, 소득세법 §59의2 · 2026.4.21 시행 ${window.jtLaw('childTaxCredit.minAge', 13)}세 상향). ${window.jtLaw('childTaxCredit.minAge', 13) - 1}세 이하는 대상 아님. 세금에만 반영됩니다. 없으면 0.`,
    numeric: true, optional: true,
    placeholder: '예: 0 (없으면 0)',
  },
];

async function callIncomeEngIns(body) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  const delays = [1000, 2000, 3000, 4000, 6000, 8000, 10000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const to = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
      const res = await fetch(base + '/v1/calc/income', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined,
      });
      if (to) clearTimeout(to);
      if (!res.ok) throw new Error('engine ' + res.status);
      return await res.json();
    } catch (e) { lastErr = e; if (attempt < delays.length) await new Promise(r => setTimeout(r, delays[attempt])); }
  }
  throw lastErr;
}

function insKoreanAmount(n) {
  if (typeof acqKoreanAmount === 'function') return acqKoreanAmount(n);
  if (!n || n <= 0) return '';
  const units = [[1_0000_0000_0000, '조'], [1_0000_0000, '억'], [1_0000, '만'], [1, '']];
  let rest = n, s = '';
  for (const [u, label] of units) { const q = Math.floor(rest / u); if (q > 0) { s += q.toLocaleString('ko-KR') + label + ' '; rest -= q * u; } }
  return s.trim() + '원';
}

// 실수령 계산기는 통장 금액이라 원 단위 정밀 표기 (formatWon은 만원 단위 절사)
function wonExact(n) {
  if (!n || isNaN(n)) return '0원';
  return Math.round(n).toLocaleString('ko-KR') + '원';
}

// 원 단위 절사 — 4대보험 보험료의 공식 산정규칙(원단위 미만 절사, 4대사회보험정보연계센터).
// float 오차(예: 3,500,000×0.9%=31,499.9999…)는 전(0.01원) 단위로 스냅한 뒤 내림 → 31,500 보존.
function floorWon(x) {
  return Math.floor(Math.round(x * 100) / 100);
}

// 4대보험 근로자 부담분 (월) — 요율·산정규칙 1차소스(보건복지부·4대사회보험정보연계센터), 순수 계산
function calcInsurance(monthly) {
  const r = INS_RATES_2026;
  if (!(monthly > 0)) return { pension: 0, health: 0, longTerm: 0, employment: 0, total: 0, pensionCapped: false };
  // 국민연금: 기준소득월액 = 보수월액의 천원 미만 절사(국민연금법 시행령 §5) 후 하한·상한(2025.7~2026.6 고시) 적용
  const pensionBaseRaw = Math.floor(monthly / 1000) * 1000;
  const pensionBase = Math.min(Math.max(pensionBaseRaw, r.pensionMin), r.pensionMax);
  const pension = floorWon(pensionBase * r.pension);                 // 원단위 절사
  const health = floorWon(monthly * r.health);
  const longTerm = floorWon(health * r.longTermOfHealth);            // 근로자 건강보험료 기준 × 13.14%
  const employment = floorWon(monthly * r.employment);
  const total = pension + health + longTerm + employment;
  return { pension, health, longTerm, employment, total, pensionCapped: pensionBaseRaw > r.pensionMax };
}

function buildInsDetail(answers, calc) {
  const L = ['■ 입력', '  · 세전 월 급여: ' + wonExact(calc.monthly)];
  if (answers.dependents) L.push('  · 부양가족: ' + answers.dependents + '명');
  if (answers.children) L.push('  · 13세 이상 자녀: ' + answers.children + '명');
  L.push('', '■ 4대보험(근로자분, 월) — 2026 요율');
  L.push('  · 국민연금(4.75%): ' + wonExact(calc.ins.pension));
  L.push('  · 건강보험(3.595%): ' + wonExact(calc.ins.health));
  L.push('  · 장기요양(건보×13.14%): ' + wonExact(calc.ins.longTerm));
  L.push('  · 고용보험(0.9%): ' + wonExact(calc.ins.employment));
  L.push('  · 4대보험 합계: ' + wonExact(calc.ins.total));
  if (calc.precise) {
    L.push('', '■ 세금(월, 추정) — 검증 엔진');
    L.push('  · 근로소득세: ' + wonExact(calc.taxMonthly));
    L.push('  · 지방소득세: ' + wonExact(calc.localMonthly));
  }
  L.push('', '■ 월 실수령액(추정): ' + wonExact(calc.net));
  return L.join('\n');
}

function buildInsKakao(answers, calc) {
  const L = ['[JT택스랩 4대보험·실수령 계산 — 상담 요청]', '', '▶ 입력'];
  L.push('· 세전 월 급여: ' + wonExact(calc.monthly));
  L.push('', '▶ 결과(추정)');
  L.push('· 4대보험(근로자): ' + wonExact(calc.ins.total));
  if (calc.precise) L.push('· 세금(소득세+지방세): ' + wonExact(calc.taxMonthly + calc.localMonthly));
  L.push('· 월 실수령액: ' + wonExact(calc.net));
  L.push('', '상담 부탁드립니다.');
  return L.join('\n');
}

function JTReportInsurance({ setRoute, onBack }) {
  const [step, setStep] = useInsState(0);
  const [answers, setAnswers] = useInsState({});
  const [loading, setLoading] = useInsState(false);
  const [report, setReport] = useInsState(null);
  const [err, setErr] = useInsState(null);
  const [phase, setPhase] = useInsState('quick');
  const [quickReport, setQuickReport] = useInsState(null);

  React.useEffect(() => {
    const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';
    if (base) { fetch(base + '/health', { method: 'GET' }).catch(function () {}); }
  }, []);

  const visibleQs = phase === 'quick' ? INS_QS.filter(q => q.tier === 'quick') : INS_QS.filter(q => q.tier !== 'quick');
  const total = visibleQs.length;
  const safeStep = Math.min(step, total - 1);
  const cur = visibleQs[safeStep];
  const isLast = safeStep === total - 1;
  const setAns = (id, v) => setAnswers(a => ({ ...a, [id]: v }));

  const canNext = () => {
    if (!cur) return false;
    if (cur.freeform) return true;
    if (cur.numeric) { if (cur.optional) return true; const v = Number(answers[cur.id]); return !isNaN(v) && v > 0; }
    return !!answers[cur.id];
  };

  const runAnalysis = async () => {
    setLoading(true); setErr(null);
    try {
      const monthly = Math.max(0, Math.round(Number(answers.monthlySalary) || 0));
      if (monthly <= 0) { setErr('세전 월 급여를 입력해 주세요.'); setLoading(false); return; }
      const deps = Math.max(0, Math.round(Number(answers.dependents) || 0));
      const kids = Math.max(0, Math.round(Number(answers.children) || 0));

      const ins = calcInsurance(monthly);
      const calc = { monthly, ins, precise: false };

      // 근로소득세(원천징수 근사) = 연 근로소득세(엔진) / 12
      // ★ 방금 계산한 4대보험 본인부담을 소득공제로 엔진에 환류 — 안 넘기면 세금 과대·실수령 과소.
      //   국민연금 = 연금보험료공제(소득세법 §51의3, 본인부담 전액)
      //   건강+장기요양+고용 = 특별소득공제(소득세법 §52①1호, 근로자 부담분 전액).
      //   엔진은 national_pension+health_insurance+employment_insurance를 보험료공제 1버킷으로 합산하므로
      //   건강·장기요양·고용을 health_insurance에 합쳐 넘겨도 결과 동일(엔진 스키마 변경 불필요).
      try {
        const j = await callIncomeEngIns({
          salary_income: monthly * 12, is_salary_earner: true,
          dependents: deps, children_count: kids,
          national_pension: ins.pension * 12,
          health_insurance: (ins.health + ins.longTerm + ins.employment) * 12,
        });
        const c = j && j.calc;
        // 수정 260628(INSURANCE-R2-02): 엔진 오류바디/부분응답 검증(세금0 거짓표시·경고 은폐 방지).
        if (c && !c['오류'] && c['결정세액'] != null) {
          calc.taxYear = c['결정세액'] || 0;
          calc.localYear = c['지방소득세'] || 0;
          calc.taxMonthly = Math.round(calc.taxYear / 12);
          calc.localMonthly = Math.round(calc.localYear / 12);
          calc.precise = true;
        } else if (c) { calc.taxErr = true; calc.taxMonthly = 0; calc.localMonthly = 0; console.warn('4대보험 세금 엔진 응답 무결성 실패', c); }
      } catch (e) { console.warn('4대보험 세금 엔진 연결 실패', e); calc.taxErr = true; calc.taxMonthly = 0; calc.localMonthly = 0; }

      calc.net = monthly - ins.total - (calc.taxMonthly || 0) - (calc.localMonthly || 0);
      const rep = { calc, quick: phase === 'quick' };
      setReport(rep);
      if (phase === 'quick') setQuickReport(rep);
    } catch (e) { console.error(e); setErr(e.message || '계산 중 오류가 발생했습니다.'); }
    finally { setLoading(false); }
  };

  const goDetail = () => { setReport(null); setPhase('detail'); setStep(0); };
  const goNext = () => { if (isLast) runAnalysis(); else setStep(s => s + 1); };
  const goPrev = () => {
    if (safeStep > 0) { setStep(s => s - 1); return; }
    if (phase === 'detail') { setPhase('quick'); setStep(0); setReport(quickReport); return; }
    onBack();
  };

  if (loading) {
    return (
      <div className="jt-container">
        <JTReportShell title="4대보험·실수령 계산기" subtitle="계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="BOOKKEEPING">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />4대보험과 세금을 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc } = report;
    return (
      <div className="jt-container">
        <JTReportShell title="4대보험·실수령 계산 결과" subtitle="월 급여에서 4대보험·세금을 뺀 실수령액" stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="BOOKKEEPING">
          <div className="jt-report-result__grade jt-grade-mid">
            <div className="jt-report-result__grade-label">예상 월 실수령액(추정)</div>
            <div className="jt-report-result__grade-val">{wonExact(calc.net)}</div>
            <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, opacity: 0.85 }}>세전 {wonExact(calc.monthly)} − 4대보험 {wonExact(calc.ins.total)}{calc.precise ? ` − 세금 ${wonExact(calc.taxMonthly + calc.localMonthly)}` : ''}. 연 환산 약 {wonExact(calc.net * 12)}.</div>
          </div>

          <section className="jt-report-result__section">
            <h3>4대보험 (근로자 부담분, 월) · 2026 요율</h3>
            <table className="jt-report-calc">
              <tbody>
                <tr><th>국민연금 (4.75%){calc.ins.pensionCapped ? ' · 상한적용' : ''}</th><td>{wonExact(calc.ins.pension)}</td></tr>
                <tr><th>건강보험 (3.595%)</th><td>{wonExact(calc.ins.health)}</td></tr>
                <tr><th>장기요양 (건보료×13.14%)</th><td>{wonExact(calc.ins.longTerm)}</td></tr>
                <tr><th>고용보험 (0.9%)</th><td>{wonExact(calc.ins.employment)}</td></tr>
                <tr style={{ background: '#fff7ea' }}><th><strong>4대보험 합계</strong></th><td><strong>{wonExact(calc.ins.total)}</strong></td></tr>
              </tbody>
            </table>
          </section>

          <section className="jt-report-result__section">
            <h3>세금 (월, 추정)</h3>
            {calc.precise ? (
              <table className="jt-report-calc">
                <tbody>
                  <tr><th>근로소득세</th><td>{wonExact(calc.taxMonthly)}</td></tr>
                  <tr><th>지방소득세 (10%)</th><td>{wonExact(calc.localMonthly)}</td></tr>
                  <tr style={{ background: '#f0f7f3' }}><th><strong>월 실수령액</strong></th><td><strong>{wonExact(calc.net)}</strong></td></tr>
                </tbody>
              </table>
            ) : (
              <div style={{ background: '#fdeeec', borderLeft: '4px solid #c0392b', padding: '12px 16px', borderRadius: 8, lineHeight: 1.6 }}>
                세금 계산 엔진 연결이 지연돼 <strong>4대보험만 먼저</strong> 보여드립니다. 실수령액에 세금은 아직 빠지지 않았습니다 — 잠시 후 다시 시도하세요.
                <div style={{ marginTop: 8 }}><button className="jt-btn jt-btn--ghost" onClick={runAnalysis}>세금까지 다시 계산 →</button></div>
              </div>
            )}
          </section>

          {report.quick && (
            <div className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '14px 18px' }}>
              <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}><strong>부양가족 없이 낸 빠른 계산이에요.</strong> 부양가족·자녀를 넣으면 근로소득세가 줄어 실수령액이 늘 수 있습니다 —</p>
              <button className="jt-btn jt-btn--primary" onClick={goDetail}>부양가족 넣어 정확히 →</button>
            </div>
          )}

          <section className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #b8860b', padding: '14px 18px', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
              <strong>참고하세요.</strong> 4대보험 요율은 <strong>2026년 기준</strong>(국민연금 9.5%·건강보험 7.19%·장기요양 13.14%·고용보험 0.9%, 근로자 부담분)입니다. 근로소득세는 회사가 매월 떼는 <strong>간이세액표</strong> 대신, <strong>방금 계산한 4대보험료를 소득공제로 반영한 1년치 세금을 12로 나눈 추정치</strong>입니다. 의료비·신용카드·연금저축 등 개인별 공제와 비과세 수당은 미반영이라 <strong>연말정산</strong>에서 더 줄어들 수 있고, 실제 매월 원천징수액과도 다릅니다. 정확한 금액은 상담에서 확인하세요.
            </p>
          </section>

          {typeof JTReportConvert === 'function' && (
            <JTReportConvert
              reportType="4대보험·실수령"
              reportTag="BOOKKEEPING"
              reportSummary={`세전 ${wonExact(calc.monthly)} → 월 실수령 ${wonExact(calc.net)}`}
              reportDetail={buildInsDetail(answers, calc)}
              kakaoSummary={buildInsKakao(answers, calc)}
              setRoute={setRoute}
            />
          )}

          <div className="jt-report-q__nav" style={{ marginTop: 16 }}>
            <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setPhase('quick'); setStep(0); setAnswers({}); }}>처음부터 다시</button>
            <button className="jt-btn jt-btn--ghost" onClick={onBack}>← JT 리포트 허브</button>
          </div>
        </JTReportShell>
      </div>
    );
  }

  if (!cur) { onBack(); return null; }

  return (
    <div className="jt-container">
      <JTReportShell title="4대보험·실수령 계산기" subtitle={phase === 'quick' ? '월 급여만 넣으면 4대보험·세금 떼고 실수령액을 바로 계산해요.' : '부양가족·자녀까지 반영해 세금을 더 정확히 계산합니다.'} stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="BOOKKEEPING">
        {err && <div style={{ background: '#fdeeec', borderLeft: '4px solid #c0392b', padding: '12px 16px', marginBottom: 16, borderRadius: 8 }}>{err}</div>}
        <div className="jt-report-q">
          <div className="jt-report-q__section">{cur.section}</div>
          <h2>{cur.q}</h2>
          {cur.sub && <p className="jt-report-q__sub">{cur.sub}</p>}

          {cur.numeric && (
            <div>
              <input className="jt-report-q__input" type="number" inputMode="numeric" placeholder={cur.placeholder || ''}
                value={answers[cur.id] || ''} onChange={e => setAns(cur.id, e.target.value)} />
              {cur.money && Number(answers[cur.id]) > 0 && (
                <div style={{ fontSize: 14, color: 'var(--accent,#2a6d4f)', marginTop: 6 }}>= {insKoreanAmount(Number(answers[cur.id]))}</div>
              )}
            </div>
          )}

          {cur.freeform && (
            <textarea className="jt-report-q__input" rows={3} placeholder={cur.placeholder || ''}
              value={answers[cur.id] || ''} onChange={e => setAns(cur.id, e.target.value)} />
          )}

          <div className="jt-report-q__nav">
            <button className="jt-btn jt-btn--ghost" onClick={goPrev}>← 이전</button>
            <button className="jt-btn jt-btn--primary" disabled={!canNext()} onClick={goNext}>
              {isLast ? (phase === 'quick' ? '실수령액 보기 →' : '결과 보기 →') : '다음 →'}
            </button>
          </div>
        </div>
      </JTReportShell>
    </div>
  );
}
window.JTReportInsurance = JTReportInsurance;

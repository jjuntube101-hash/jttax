/* @jsx React.createElement */
/* 종합소득세 계산기 — 사업·근로·금융·연금 소득 합산 → 검증 엔진 /v1/calc/income(소득세법 §55).
   인적·자녀·연금저축 세액공제·§59 근로소득세액공제 반영. 추계 vs 장부 비교는 상담 영역(엔진 미보유 경비율 환각 방지).
   엔진 다운 시 폴백 세액을 만들지 않고 '정밀 계산 필요'로 안내(잘못된 세액 방지).
   공통 헬퍼(formatWon·JTReportShell·JTReportConvert·acqKoreanAmount)는 먼저 로드된 파일의 전역 사용. */

const { useState: useIncState } = React;

const INC_QS = [
  {
    id: 'businessIncome',
    tier: 'quick',
    section: '사업·프리랜서 소득',
    q: '작년 사업·프리랜서 「소득금액」이 얼마인가요? (원)',
    sub: '1년 매출(수입)에서 필요경비(임차료·재료비·인건비 등)를 뺀 「순이익」을 넣어 주세요. 직장 급여만 있으면 0으로 두세요. 경비를 잘 모르면 수입의 절반 정도로 넣어 보세요.',
    numeric: true, money: true, optional: true,
    placeholder: '예: 60,000,000 (없으면 0)',
  },
  {
    id: 'salaryIncome',
    tier: 'quick',
    section: '근로소득',
    q: '직장 급여(근로소득) 총급여는 얼마인가요? (원)',
    sub: '직장에서 받은 1년 총급여(세전 연봉). 사업·프리랜서만 있으면 0으로 두세요. 사업소득과 근로소득이 둘 다 있으면 합산해 종합소득세를 계산합니다.',
    numeric: true, money: true, optional: true,
    placeholder: '예: 0 (없으면 0)',
  },
  {
    id: 'spouse',
    section: '부양가족',
    q: '배우자가 있나요? (기본공제 대상)',
    sub: '소득요건(연 100만원 이하 등)을 충족하는 배우자가 있으면 1인당 150만원 인적공제를 받습니다(소득세법 §50).',
    opts: [['yes', '네, 있습니다', '본인+배우자 공제'], ['no', '아니오', '본인만']],
  },
  {
    id: 'dependents',
    section: '부양가족',
    q: '본인·배우자 외 부양가족(부모·자녀 등)은 몇 명인가요?',
    sub: '소득요건을 충족하는 부양가족 수(부모·20세 이하 자녀 등). 1인당 150만원 인적공제(소득세법 §50). 없으면 0.',
    numeric: true, optional: true,
    placeholder: '예: 2 (없으면 0)',
  },
  {
    id: 'children',
    section: '부양가족',
    q: '그중 8세 이상 자녀는 몇 명인가요? (자녀세액공제)',
    sub: '위 부양가족 중 8세 이상~20세 이하 자녀 수. 1명 25만원·2명 55만원 등 자녀세액공제가 추가됩니다(소득세법 §59의2). 없으면 0.',
    numeric: true, optional: true,
    placeholder: '예: 1 (없으면 0)',
  },
  {
    id: 'financialIncome',
    tier: 'quick',
    section: '금융소득',
    q: '이자·배당 소득이 있나요? 연 합계 금액 (원)',
    sub: '예금이자·주식배당 등 1년 합계. 연 2,000만원을 넘으면 종합과세되며 비교과세(소득세법 §62)로 계산합니다. 배당 비중이 크면 가산·배당세액공제로 결과가 달라질 수 있어 상담을 권합니다. 사업·근로 없이 금융소득만 있어도 여기에 넣으면 계산됩니다. 없으면 0.',
    numeric: true, money: true, optional: true,
    placeholder: '예: 0 (없으면 0)',
  },
  {
    id: 'nationalPension',
    section: '공제 항목',
    q: '작년 국민연금 납입액은 얼마인가요? (소득공제)',
    sub: '1년간 낸 국민연금 보험료(전액 소득공제, 소득세법 §51의3). 모르면 0으로 두고 상담에서 확인하세요.',
    numeric: true, money: true, optional: true,
    placeholder: '예: 3,000,000 (없으면 0)',
  },
  {
    id: 'pensionSavings',
    section: '공제 항목',
    q: '연금저축 납입액은 얼마인가요? (세액공제)',
    sub: '개인연금저축계좌에 넣은 1년 금액. 연 600만원까지 12~15% 세액공제로 세금을 줄여줍니다(소득세법 §59의3). 사업자·프리랜서가 가장 흔히 놓치는 절세 항목. 없으면 0.',
    numeric: true, money: true, optional: true,
    placeholder: '예: 6,000,000 (없으면 0)',
  },
  {
    id: 'irp',
    section: '공제 항목',
    q: 'IRP·퇴직연금 납입액은 얼마인가요? (세액공제)',
    sub: 'IRP(개인형 퇴직연금)에 넣은 1년 금액. 위 연금저축과 합쳐 연 900만원까지 12~15% 세액공제를 받습니다(소득세법 §59의3). 없으면 0.',
    numeric: true, money: true, optional: true,
    placeholder: '예: 3,000,000 (없으면 0)',
  },
  {
    id: 'context',
    section: '추가 사항',
    q: '추가로 알려주실 내용이 있나요? (선택)',
    sub: '업종, 노란우산공제, 중소기업특별세액감면, 의료비·기부금·교육비 등 특별세액공제 대상이 있으면 적어주세요(이 항목들은 본 계산에 미반영 — 상담에서 반영).',
    freeform: true, optional: true,
    placeholder: '예: 음식점업 / 노란우산 연 300만 납입 / 의료비 500만',
  },
];

async function callIncomeEng(body) {
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

function incKoreanAmount(n) {
  if (typeof acqKoreanAmount === 'function') return acqKoreanAmount(n);
  if (!n || n <= 0) return '';
  const units = [[1_0000_0000_0000, '조'], [1_0000_0000, '억'], [1_0000, '만'], [1, '']];
  let rest = n, s = '';
  for (const [u, label] of units) { const q = Math.floor(rest / u); if (q > 0) { s += q.toLocaleString('ko-KR') + label + ' '; rest -= q * u; } }
  return s.trim() + '원';
}

function buildIncomeDetail(answers, calc) {
  const L = ['■ 고객 입력 정보'];
  INC_QS.forEach(q => {
    const val = answers[q.id];
    if (val === undefined || val === null || val === '') return;
    let v = val;
    if (q.opts) { const o = q.opts.find(x => x[0] === val); if (o) v = o[1]; }
    else if (q.numeric && q.money) v = formatWon(Number(val));
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('  · ' + ql + ': ' + v);
  });
  if (calc.precise) {
    L.push('', '■ 계산 결과 (검증 엔진)');
    L.push('  · 과세표준: ' + formatWon(calc.taxBase));
    L.push('  · 산출세액: ' + formatWon(calc.calculated) + (calc.rate ? ' (' + calc.rate + ')' : ''));
    L.push('  · 결정세액(세액공제 반영): ' + formatWon(calc.determined));
    L.push('  · 지방소득세(10%): ' + formatWon(calc.local));
    L.push('  · 총 세부담: ' + formatWon(calc.total));
    (calc.steps || []).forEach(s => { if (s && s.항목) L.push('    - ' + s.항목 + ': ' + formatWon(s.금액) + (s.조문 ? ' [' + s.조문 + ']' : '')); });
  }
  return L.join('\n');
}

function buildIncomeKakao(answers, calc) {
  const L = ['[JT택스랩 종합소득세 계산 — 상담 요청]', '', '▶ 입력'];
  L.push('· 사업·프리랜서 소득금액: ' + formatWon(Number(answers.businessIncome) || 0));
  L.push('· 근로 총급여: ' + formatWon(Number(answers.salaryIncome) || 0));
  if (calc.precise) {
    L.push('', '▶ 결과(추정)');
    L.push('· 과세표준: ' + formatWon(calc.taxBase));
    L.push('· 예상 총 세부담(종소세+지방세): ' + formatWon(calc.total));
  }
  L.push('', '상담 부탁드립니다.');
  return L.join('\n');
}

function JTReportIncome({ setRoute, onBack }) {
  const [step, setStep] = useIncState(0);
  const [answers, setAnswers] = useIncState({});
  const [loading, setLoading] = useIncState(false);
  const [report, setReport] = useIncState(null);
  const [err, setErr] = useIncState(null);
  const [phase, setPhase] = useIncState('quick');
  const [quickReport, setQuickReport] = useIncState(null);

  React.useEffect(() => {
    const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';
    if (base) { fetch(base + '/health', { method: 'GET' }).catch(function () {}); }
  }, []);

  const visibleQs = phase === 'quick' ? INC_QS.filter(q => q.tier === 'quick') : INC_QS.filter(q => q.tier !== 'quick');
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

  const runAnalysis = async (targetPhase) => {
    setLoading(true); setErr(null);
    try {
      // 엔진은 정수·음수불가(ge=0) 필드 → 소수·지수·음수 입력 방지(견고성: 음수→0 클램프)
      const clamp = (x) => Math.max(0, Math.round(Number(x) || 0));
      const biz = clamp(answers.businessIncome);
      const salary = clamp(answers.salaryIncome);
      const fin = clamp(answers.financialIncome);
      const np = clamp(answers.nationalPension);
      const ps = clamp(answers.pensionSavings);
      const irp = clamp(answers.irp);
      const spouse = answers.spouse === 'yes';
      const deps = clamp(answers.dependents);
      const kids = clamp(answers.children);

      if (biz + salary + fin <= 0) {
        setErr('사업·근로·금융 소득 중 하나 이상을 입력해 주세요.');
        setLoading(false);
        return;
      }

      let calc = { precise: false };
      try {
        const body = {
          business_revenue: biz, business_expenses: 0,
          salary_income: salary,
          is_salary_earner: salary > 0,    // 근로소득 있으면 근로자(표준공제 13만·§59), 없으면 사업자(7만)
          interest_income: fin,            // 이자+배당 합계(2천만 종합과세 임계 합산 기준)
          spouse, dependents: deps, children_count: kids,
          national_pension: np,
          pension_savings: ps,
          irp_contribution: irp,
        };
        const j = await callIncomeEng(body);
        const c = j && j.calc;
        if (c) {
          calc.taxBase = c['과세표준'] || 0;
          calc.calculated = c['산출세액'] || 0;
          calc.determined = c['결정세액'] || 0;
          calc.local = c['지방소득세'] || 0;
          calc.total = c['총세부담'] || 0;
          calc.rate = c['적용세율'];
          calc.refund = c['환급여부'];
          calc.steps = c['단계별계산'] || [];
          calc.engineWarnings = c['경고사항'] || [];
          calc.precise = true;
          calc.engineVer = j.version && j.version.engine;
        }
      } catch (e) { console.warn('종소세 엔진 연결 실패', e); calc.engineErr = true; }

      const rep = { calc, quick: (targetPhase || phase) === 'quick' };
      setReport(rep);
      if ((targetPhase || phase) === 'quick') setQuickReport(rep);
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
        <JTReportShell title="종합소득세 계산기" subtitle="검증 엔진으로 계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="BOOKKEEPING">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />소득을 합산해 종합소득세를 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc } = report;
    return (
      <div className="jt-container">
        <JTReportShell title="종합소득세 계산 결과" subtitle="사업·근로·금융 소득 합산 종합소득세" stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="BOOKKEEPING">
          {!calc.precise ? (
            <div style={{ background: '#fdeeec', borderLeft: '4px solid #c0392b', padding: '14px 18px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6 }}>
              <strong>정밀 계산이 필요합니다.</strong> 종합소득세는 여러 소득·공제를 정확히 합산해야 해서, 간이 추정으로는 세액을 잘못 안내할 수 있습니다. 정밀 엔진 연결이 지연됐으니 잠시 후 다시 시도하거나 상담을 권합니다.
              <div style={{ marginTop: 8 }}><button className="jt-btn jt-btn--ghost" onClick={() => runAnalysis()}>정밀 계산 다시 시도 →</button></div>
            </div>
          ) : (
            <>
              <div className="jt-report-result__grade jt-grade-mid">
                <div className="jt-report-result__grade-label">1년치 예상 종합소득세 (추정)</div>
                <div className="jt-report-result__grade-val">{formatWon(calc.total)}</div>
                <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, opacity: 0.85 }}>종합소득세 {formatWon(calc.determined)} + 지방소득세 {formatWon(calc.local)}. 과세표준 {formatWon(calc.taxBase)} · 적용세율 {calc.rate || '-'}.</div>
                <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, color: '#b8860b' }}>※ <strong>이미 낸 세금(프리랜서 3.3% 원천징수·중간예납·직장인 연말정산)을 빼기 전</strong> 1년치 산정액입니다. 5월에 실제로 더 내실 돈은 이보다 적고, 이미 낸 세금이 더 많으면 환급받습니다. 정확한 추가납부·환급액은 상담에서 확인하세요.</div>
              </div>

              <section className="jt-report-result__section">
                <h3>계산 내역</h3>
                <table className="jt-report-calc">
                  <tbody>
                    <tr><th>과세표준</th><td>{formatWon(calc.taxBase)}</td></tr>
                    <tr><th>산출세액 {calc.rate ? `(${calc.rate})` : ''}</th><td>{formatWon(calc.calculated)}</td></tr>
                    <tr><th>결정세액 (세액공제 반영)</th><td>{formatWon(calc.determined)}</td></tr>
                    <tr><th>지방소득세 (10%)</th><td>{formatWon(calc.local)}</td></tr>
                    <tr style={{ background: '#f0f7f3' }}><th><strong>총 세부담</strong></th><td><strong>{formatWon(calc.total)}</strong></td></tr>
                  </tbody>
                </table>
              </section>

              {(calc.steps && calc.steps.length > 0) && (
                <section className="jt-report-result__section">
                  <h3>단계별 계산 (법조문)</h3>
                  <table className="jt-report-calc">
                    <tbody>
                      {calc.steps.map((s, i) => (
                        <tr key={i}>
                          <th style={{ fontWeight: 400 }}>{s.항목}{s.조문 ? <span style={{ opacity: 0.6, fontSize: 12 }}> [{s.조문}]</span> : null}</th>
                          <td>{typeof s.금액 === 'number' ? formatWon(s.금액) : (s.금액 || '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {report.quick && (
                <div className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '14px 18px' }}>
                  <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}><strong>소득 금액만으로 낸 빠른 계산이에요.</strong> 부양가족·공제 항목을 넣으면 세금이 더 줄 수 있습니다 —</p>
                  <button className="jt-btn jt-btn--primary" onClick={goDetail}>공제 넣어 정확히 계산 →</button>
                </div>
              )}

              <section className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #b8860b', padding: '14px 18px', borderRadius: 8 }}>
                <p style={{ margin: '0 0 8px', fontWeight: 700 }}>흔히 놓치는 절세 항목 — 넣으면 세금이 더 줄 수 있어요</p>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>
                  <li><strong>연금저축·IRP</strong>: 위에 입력하셨으면 이미 반영됐습니다. 미가입이면 연 900만원까지 12~15% 세액공제(소득세법 §59의3) — 사업자·프리랜서에게 효과가 가장 큰 절세입니다.</li>
                  <li><strong>노란우산공제</strong>: 소상공인·사업자 소득공제(소득 구간별 한도). 본 계산에는 미반영 — 상담에서 반영.</li>
                  <li><strong>의료비·기부금·교육비·중소기업특별세액감면</strong>: 요건 충족 시 추가 절세. 본 계산에는 미반영이니 상담에서 확인하세요.</li>
                  <li><strong>장부 작성(기장)</strong>: 장부 없이 추계신고하면 무기장가산세가 붙을 수 있고, 간편장부대상자가 복식부기로 기장하면 기장세액공제(산출세액 20%·한도 100만)를 받습니다(소득세법 §56). 업종별 경비율·기장 유불리는 상담에서 따져 드립니다.</li>
                </ul>
              </section>

              {calc.precise && typeof JTReportConvert === 'function' && (
                <JTReportConvert
                  reportType="종합소득세 계산"
                  reportTag="BOOKKEEPING"
                  reportSummary={`과세표준 ${formatWon(calc.taxBase)} · 예상 총부담 ${formatWon(calc.total)}`}
                  reportDetail={buildIncomeDetail(answers, calc)}
                  kakaoSummary={buildIncomeKakao(answers, calc)}
                  setRoute={setRoute}
                />
              )}

              <div className="jt-report-q__nav" style={{ marginTop: 16 }}>
                <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setPhase('quick'); setStep(0); setAnswers({}); }}>처음부터 다시</button>
                <button className="jt-btn jt-btn--ghost" onClick={onBack}>← JT 리포트 허브</button>
              </div>
            </>
          )}
        </JTReportShell>
      </div>
    );
  }

  if (!cur) { onBack(); return null; }

  return (
    <div className="jt-container">
      <JTReportShell title="종합소득세 계산기" subtitle={phase === 'quick' ? '사업·근로·금융 소득을 넣으면 예상 종합소득세를 바로 계산해요.' : '부양가족·공제 항목까지 반영해 더 정확히 계산합니다.'} stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="BOOKKEEPING">
        {err && <div style={{ background: '#fdeeec', borderLeft: '4px solid #c0392b', padding: '12px 16px', marginBottom: 16, borderRadius: 8 }}>{err}</div>}
        <div className="jt-report-q">
          <div className="jt-report-q__section">{cur.section}</div>
          <h2>{cur.q}</h2>
          {cur.sub && <p className="jt-report-q__sub">{cur.sub}</p>}

          {cur.opts && (
            <div className="jt-report-q__opts">
              {cur.opts.map(o => (
                <button key={o[0]} className={'jt-report-q__opt' + (answers[cur.id] === o[0] ? ' is-selected' : '')} onClick={() => setAns(cur.id, o[0])}>
                  <span className="jt-report-q__opt-mark">{answers[cur.id] === o[0] ? '●' : '○'}</span>
                  <span><strong>{o[1]}</strong>{o[2] ? <span style={{ opacity: 0.7 }}> · {o[2]}</span> : null}</span>
                </button>
              ))}
            </div>
          )}

          {cur.numeric && (
            <div>
              <input className="jt-report-q__input" type="number" inputMode="numeric" placeholder={cur.placeholder || ''}
                value={answers[cur.id] || ''} onChange={e => setAns(cur.id, e.target.value)} />
              {cur.money && Number(answers[cur.id]) > 0 && (
                <div style={{ fontSize: 14, color: 'var(--accent,#2a6d4f)', marginTop: 6 }}>= {incKoreanAmount(Number(answers[cur.id]))}</div>
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
              {isLast ? (phase === 'quick' ? '빠른 계산 보기 →' : '결과 보기 →') : '다음 →'}
            </button>
          </div>
        </div>
      </JTReportShell>
    </div>
  );
}
window.JTReportIncome = JTReportIncome;

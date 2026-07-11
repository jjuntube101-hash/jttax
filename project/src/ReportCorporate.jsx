/* @jsx React.createElement */
/* 법인 전환 시뮬레이터 — 개인사업자(종합소득세) vs 법인(법인세 + 대표 급여 근로소득세) 세부담 비교.
   엔진: /v1/calc/income(소득세법 §55), /v1/calc/corporate(법인세법 §55, 2026 10/20/22/25%).
   비교 도구라 엔진 다운 시 폴백 비교를 만들지 않고 '정밀 계산 필요'로 안내(잘못된 유불리 판단 방지).
   공통 헬퍼(formatWon·JTReportShell·JTReportConvert)는 먼저 로드된 파일의 전역 사용. */

const { useState: useCorpState } = React;

const CORP_QS = [
  {
    id: 'businessIncome',
    tier: 'quick',
    section: '사업 이익',
    q: '연간 사업소득금액(이익)이 얼마인가요? (원)',
    sub: '1년 매출에서 필요경비(임차료·인건비·재료비 등)를 뺀 「순이익」을 넣어 주세요. 이 이익에 개인은 종합소득세(6~45% 누진), 법인은 법인세(10~25%)가 매겨집니다. 둘을 비교해 드립니다.',
    numeric: true, money: true,
    placeholder: '예: 300,000,000',
  },
  {
    id: 'ownerSalary',
    tier: 'quick',
    section: '대표 급여',
    q: '법인으로 전환하면 대표(본인) 연봉을 얼마로 가져갈까요? (원)',
    sub: '법인은 이익을 「대표 급여 + 법인 이익」으로 나눕니다. 급여는 법인 비용으로 빠져 법인세가 줄지만, 대표 개인에게 근로소득세가 붙습니다. 보통 생활비 수준으로 잡습니다(예: 이익의 30~50%). 모르면 이익의 절반 정도로 넣어 보세요.',
    numeric: true, money: true,
    placeholder: '예: 100,000,000',
  },
  {
    id: 'spouse',
    section: '부양가족',
    q: '배우자가 있나요? (기본공제 대상)',
    sub: '배우자·부양가족은 개인 종합소득세와 대표 급여 근로소득세 양쪽의 인적공제(1인당 150만원)에 반영됩니다(소득세법 §50). 사실만 골라 주세요.',
    showIf: (a) => true,
    opts: [['yes', '네, 있습니다', '본인+배우자 공제'], ['no', '아니오', '본인만']],
  },
  {
    id: 'dependents',
    section: '부양가족',
    q: '본인·배우자 외 부양가족(자녀·부모 등)은 몇 명인가요?',
    sub: '소득요건을 충족하는 부양가족 수(자녀·부모 등). 1인당 150만원 인적공제가 개인·법인 대표 양쪽에 반영됩니다. 없으면 0.',
    numeric: true, optional: true,
    placeholder: '예: 2 (없으면 0)',
  },
  {
    id: 'children',
    section: '부양가족',
    q: '그 중 13세 이상 자녀는 몇 명인가요? (자녀세액공제)',
    sub: '13세 이상 자녀는 자녀세액공제(1명 25만·2명 55만·3명+ 55만+초과 1명당 40만, 소법 §59의2)가 개인·법인 대표 양쪽 소득세에서 차감됩니다. 위 부양가족 중 13세 이상 자녀만. 없으면 0.',
    numeric: true, optional: true,
    placeholder: '예: 1 (없으면 0)',
  },
  {
    id: 'dividend',
    section: '잔여이익 배당',
    q: '법인에 남는 이익(법인세 낸 뒤)을 배당으로 가져가실 계획인가요?',
    sub: '법인 이익은 법인세를 낸 뒤 회사에 「유보」됩니다. 이를 대표 개인이 가져가려면 배당을 받아야 하고, 그때 배당소득세(15.4%~, 큰 금액은 종합과세)가 추가됩니다. 배당 없이 회사에 쌓아두면 법인이 더 유리해집니다.',
    showIf: (a) => true,
    opts: [
      ['retain', '아니오 — 회사에 유보(재투자)', '배당세 없음 · 법인 유리'],
      ['dividend', '네 — 배당으로 가져감', '배당소득세 추가 고려'],
    ],
  },
  {
    // P1-5(코덱스): 배당 종합과세는 그 해 이자·배당 '합계' 2천만원 기준. 새 배당만으로 판단하면 오류 →
    // 기존 금융소득 없음을 확인받고, 미확인/있음이면 15.4% 확정 대신 종합과세 경고(오너 확정 260712: 확인만).
    id: 'noOtherFinancialIncome',
    section: '기존 금융소득',
    q: '대표자에게 배당 외 다른 이자·배당소득이 있나요?',
    sub: '배당소득세는 그 해 이자·배당소득 「합계」가 2,000만원을 넘으면 금융소득종합과세로 넘어가 세부담이 크게 달라집니다. 다른 이자·배당소득이 없어야 이 계산의 15.4% 분리과세 추정이 맞습니다. 있거나 잘 모르시면 정밀 계산으로 안내드립니다.',
    showIf: (a) => a.dividend === 'dividend',
    opts: [
      ['none', '없음 — 배당 외 이자·배당소득 없음', '15.4% 분리과세 추정 가능'],
      ['has', '있음 (또는 잘 모름)', '종합과세 가능 · 정밀계산 필요'],
    ],
  },
  {
    id: 'context',
    section: '추가 사항',
    q: '추가로 알려주실 내용이 있나요? (선택)',
    sub: '업종, 4대보험, 성실신고확인 대상 여부, 전환 비용(법인 설립·자산 이전 시 양도세·취득세) 등 특수 사정이 있으면 적어주세요.',
    freeform: true, optional: true,
    placeholder: '예: 부동산임대업 / 성실신고확인 대상 / 기존 사업용 부동산 현물출자 예정',
  },
];

async function callCorpEng(endpoint, body) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  const delays = [1000, 2000, 4000, 8000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const to = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
      const res = await fetch(base + endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined,
      });
      if (to) clearTimeout(to);
      if (!res.ok) { const _err = new Error('engine ' + res.status); _err.status = res.status; throw _err; }
      return await res.json();
    } catch (e) { lastErr = e; if (e && e.status >= 400 && e.status < 500) break; if (attempt < delays.length) await new Promise(r => setTimeout(r, delays[attempt])); }
  }
  throw lastErr;
}

function buildCorpDetail(answers, calc, commentary) {
  const L = ['■ 고객 입력 정보'];
  CORP_QS.forEach(q => {
    if (q.showIf && !q.showIf(answers)) return;
    const val = answers[q.id];
    if (val === undefined || val === null || val === '') return;
    let v = val;
    if (q.opts) { const o = q.opts.find(x => x[0] === val); if (o) v = o[1]; }
    else if (q.numeric && q.money) v = formatWon(Number(val));
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('  · ' + ql + ': ' + v);
  });
  if (calc.precise) {
    L.push('', '■ 비교 결과 (검증 엔진)');
    L.push('  · [개인사업자] 종합소득세 총부담: ' + formatWon(calc.indivTotal));
    L.push('  · [법인] 법인세: ' + formatWon(calc.corpTax) + ' + 대표급여 근로소득세: ' + formatWon(calc.salaryTax) + ' = ' + formatWon(calc.corpTotal));
    L.push('  · 차이: ' + formatWon(Math.abs(calc.indivTotal - calc.corpTotal)) + ' (' + (calc.corpTotal < calc.indivTotal ? '법인 유리' : '개인 유리') + ')');
    L.push('  · 법인 잔여이익(사내유보): ' + formatWon(calc.retained) + (answers.dividend === 'dividend' ? ' → 배당 시 배당소득세 별도' : ' (유보 시 추가세 없음)'));
  }
  const ew = calc.engineWarnings || [];
  if (ew.length) { L.push('', '■ 경고'); ew.forEach(w => L.push('  · ' + w)); }
  L.push('', '■ 자동 분석');
  if (commentary.headline) L.push('  요약: ' + commentary.headline);
  (commentary.cautions || []).forEach(c => L.push('  · [주의] ' + c.title + ': ' + c.detail));
  return L.join('\n');
}

function buildCorpKakao(answers, calc) {
  const L = ['[JT택스랩 법인 전환 시뮬레이션 — 상담 요청]', '', '▶ 입력'];
  L.push('· 연 사업이익: ' + formatWon(Number(answers.businessIncome) || 0));
  L.push('· 법인 전환 시 대표 연봉: ' + formatWon(Number(answers.ownerSalary) || 0));
  if (calc.precise) {
    L.push('', '▶ 비교(추정)');
    L.push('· 개인 종소세: ' + formatWon(calc.indivTotal));
    L.push('· 법인(법인세+대표급여세): ' + formatWon(calc.corpTotal));
    L.push('· ' + (calc.corpTotal < calc.indivTotal ? '법인 유리' : '개인 유리') + ' ' + formatWon(Math.abs(calc.indivTotal - calc.corpTotal)));
  }
  L.push('', '상담 부탁드립니다.');
  return L.join('\n');
}

function JTReportCorporate({ setRoute, onBack }) {
  const [step, setStep] = useCorpState(0);
  const [answers, setAnswers] = useCorpState({});
  const [loading, setLoading] = useCorpState(false);
  const [report, setReport] = useCorpState(null);
  const [err, setErr] = useCorpState(null);
  const [phase, setPhase] = useCorpState('quick');
  const [quickReport, setQuickReport] = useCorpState(null);

  React.useEffect(() => {
    const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';
    if (base) { fetch(base + '/health', { method: 'GET' }).catch(function () {}); }
  }, []);

  const allVisible = CORP_QS.filter(q => !q.showIf || q.showIf(answers));
  const visibleQs = phase === 'quick' ? allVisible.filter(q => q.tier === 'quick') : allVisible.filter(q => q.tier !== 'quick');
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
      // 엔진은 정수 필드 → 소수·지수 입력은 422 유발. 매핑 직전 정수 반올림(견고성).
      const income = Math.round(Number(answers.businessIncome) || 0);
      const salary = Math.min(Math.round(Number(answers.ownerSalary) || 0), income);   // 급여는 이익 초과 불가
      const spouse = answers.spouse === 'yes';
      const deps = Number(answers.dependents) || 0;
      const kids = Number(answers.children) || 0;   // 수정 260628(CORPORATE-R2-01): 13세 이상 자녀세액공제(§59의2) 개인·법인대표 대칭 반영
      let calc = { precise: false };
      try {
        const [pj, cj, sj] = await Promise.all([
          // 개인사업자 → 근로자 아님: 표준세액공제 7만(소§59의4) 적용되도록 is_salary_earner=false
          callCorpEng('/v1/calc/income', { business_revenue: income, business_expenses: 0, spouse, dependents: deps, children_count: kids, is_salary_earner: false }),
          callCorpEng('/v1/calc/corporate', { net_income: Math.max(income - salary, 0) }),
          salary > 0 ? callCorpEng('/v1/calc/income', { salary_income: salary, spouse, dependents: deps, children_count: kids }) : Promise.resolve(null),
        ]);
        const pc = pj && pj.calc, cc = cj && cj.calc, sc = sj && sj.calc;
        // P1-4(코덱스): 정상 0원(소액 사업소득 종소세 0원)을 실패로 오판하지 않도록 '>0'이 아닌 공통 무결성 검증기 사용.
        // 오류·부분 응답·NaN·필드누락은 거부하되 0원은 정상 인정.
        if (window.jtValidCalc(pc, ['총세부담']) && window.jtValidCalc(cc, ['총납부세액'])) {
          calc.indivTotal = pc['총세부담'] || 0;
          calc.corpTax = cc['총납부세액'] || 0;
          calc.salaryTax = (sc && sc['총세부담']) || 0;
          calc.corpTotal = calc.corpTax + calc.salaryTax;
          calc.corpIncome = Math.max(income - salary, 0);
          calc.retained = Math.max(calc.corpIncome - calc.corpTax, 0);   // 법인세 낸 뒤 사내유보
          calc.indivRate = pc['적용세율']; calc.corpRate = cc['적용세율'];
          calc.engineWarnings = [];
          if (answers.dividend === 'dividend' && calc.retained > 0) {
            // 연 2천만 이하 + 기존 금융소득 없음 확인 시에만 분리과세(14%+지방1.4%=15.4%)로 단순추정.
            // 초과분 또는 기존 금융소득 미확인은 종합과세(타소득 합산 누진) → 수치 대신 경고(P1-5 코덱스).
            const noOther = answers.noOtherFinancialIncome === 'none';
            if (calc.retained <= 20_000_000 && noOther) {
              calc.dividendTax = Math.round(calc.retained * 0.154);
              calc.corpTotalWithDiv = calc.corpTotal + calc.dividendTax;
              calc.dividendComprehensive = false;
            } else {
              calc.dividendComprehensive = true;
              // 2천만 이하이나 기존 이자·배당소득 미확인(합산 시 초과 가능) → '초과 확정'과 구분해 안내
              calc.dividendUnconfirmed = (calc.retained <= 20_000_000 && !noOther);
            }
          }
          calc.precise = true; calc.engineVer = pj.version && pj.version.engine;
        }
      } catch (e) { console.warn('법인전환 엔진 연결 실패', e); calc.engineErr = true; }

      let commentary;
      try {
        if (!(window.claude && window.claude.complete)) throw new Error('claude 미가용');
        const prompt = `너는 한국 세무사다. 법인 전환 비교를 보고 JSON으로만 답하라.\n사업이익:${formatWon(income)} 대표연봉:${formatWon(salary)} 개인종소세:${formatWon(calc.indivTotal || 0)} 법인합계:${formatWon(calc.corpTotal || 0)}\n{"headline":"한줄요약","cautions":[{"title":"","detail":""}],"saving_ideas":[{"title":"","detail":""}],"followup":["필요자료"]}`;
        const txt = await window.claude.complete(prompt);
        commentary = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]);
      } catch (cErr) {
        commentary = {
          headline: '법인 전환은 「세율 차이」만이 아니라 잔여이익 활용·4대보험·전환비용까지 함께 봐야 합니다.',
          cautions: [
            { title: '잔여이익 배당', detail: '법인세를 낸 뒤 남는 이익을 대표가 가져가려면 배당이 필요하고 배당소득세(15.4%~)가 추가됩니다. 회사에 재투자(유보)하면 법인이 크게 유리합니다.' },
            { title: '4대보험·성실신고', detail: '대표 급여에는 4대보험이 붙고, 일정 매출 이상 법인은 성실신고확인 대상이 됩니다. 본 계산에는 미반영입니다.' },
            { title: '전환 비용', detail: '개인 사업용 부동산을 법인에 넘기면 양도세·취득세가 발생할 수 있습니다(현물출자·포괄양수도 특례 검토 필요).' },
          ],
          saving_ideas: [
            { title: '급여 수준 최적화', detail: '대표 급여를 조절해 법인세와 근로소득세 합계를 최소화할 수 있습니다. 정밀 시뮬레이션은 상담으로.' },
          ],
          followup: ['최근 사업 손익(매출·경비)', '대표 희망 연봉·생활비', '사업용 자산 보유 현황'],
        };
      }

      const rep = { calc, commentary, quick: phase === 'quick' };
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
        <JTReportShell title="법인 전환 시뮬레이터" subtitle="개인 vs 법인 비교 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="CONSULTING">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />개인·법인 세부담을 검증 엔진으로 비교하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc, commentary } = report;
    const favorable = calc.precise && calc.corpTotal < calc.indivTotal;
    return (
      <div className="jt-container">
        <JTReportShell title="법인 전환 시뮬레이터 결과" subtitle="개인사업자 vs 법인 세부담 비교" stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="CONSULTING">
          {!calc.precise ? (
            <div style={{ background: '#fdeeec', borderLeft: '4px solid #c0392b', padding: '14px 18px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6 }}>
              <strong>정밀 계산이 필요합니다.</strong> 법인 전환 비교는 개인·법인 세액을 동시에 정확히 계산해야 해서, 간이 추정으로는 유·불리를 잘못 안내할 수 있습니다. 정밀 엔진 연결이 지연됐으니 잠시 후 다시 시도하거나 상담을 권합니다.
              <div style={{ marginTop: 8 }}><button className="jt-btn jt-btn--ghost" onClick={runAnalysis}>정밀 계산 다시 시도 →</button></div>
            </div>
          ) : (
            <>
              <div className="jt-report-result__grade jt-grade-mid">
                <div className="jt-report-result__grade-label">{favorable ? '법인 전환 시 「세금만」 연간 절감(추정)' : '「세금만」 비교 — 개인 유지가 유리(추정)'}</div>
                <div className="jt-report-result__grade-val">{formatWon(Math.abs(calc.indivTotal - calc.corpTotal))}</div>
                <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, opacity: 0.85 }}>※ 종합소득세·법인세·근로소득세만 비교한 숫자입니다. <strong>4대보험·전환비용·유보 제약은 빠져 있어</strong>, 법인 전환의 실제 유·불리는 이 비용들까지 따져야 합니다(아래 참조).</div>
              </div>

              <section className="jt-report-result__section">
                <h3>개인 vs 법인 비교</h3>
                <table className="jt-report-calc">
                  <tbody>
                    <tr><th>[개인] 종합소득세 총부담 {calc.indivRate ? `(${calc.indivRate})` : ''}</th><td>{formatWon(calc.indivTotal)}</td></tr>
                    <tr><th>[법인] 법인세 {calc.corpRate ? `(${calc.corpRate})` : ''}</th><td>{formatWon(calc.corpTax)}</td></tr>
                    <tr><th>[법인] 대표 급여 근로소득세</th><td>{formatWon(calc.salaryTax)}</td></tr>
                    <tr><th><strong>[법인] 합계 (법인세 + 대표급여세)</strong></th><td><strong>{formatWon(calc.corpTotal)}</strong></td></tr>
                    <tr style={{ background: favorable ? '#f0f7f3' : '#fff7ea' }}><th><strong>{favorable ? '법인 전환 시 절감액' : '개인 유지 시 절감액'}</strong></th><td><strong>{formatWon(Math.abs(calc.indivTotal - calc.corpTotal))}</strong></td></tr>
                  </tbody>
                </table>
              </section>

              <section className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #b8860b', padding: '14px 18px', borderRadius: 8 }}>
                <p style={{ margin: '0 0 8px', fontWeight: 700 }}>위 비교에서 빠진 「세금 외」 비용 — 법인 전환 결정 전 꼭 보세요</p>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>
                  <li><strong>4대보험</strong>: 법인 대표가 되면 건강보험·국민연금이 급여 기준으로 새로 부과돼, 개인 지역가입 때보다 <strong>연 수백만원 이상 늘 수 있습니다</strong>(대표 연봉이 클수록 커짐). 이익 1~2억 구간에선 위 세금 절감액의 상당 부분을 깎을 수 있습니다.</li>
                  <li><strong>법인 돈은 「내 돈」이 아닙니다</strong>: 회사에 쌓인 돈을 대표가 사적으로 쓰면 「가지급금」으로 보아 이자를 물리고 상여로 과세됩니다. 결국 급여·배당으로 꺼낼 때 세금이 다시 붙습니다.</li>
                  <li><strong>전환·유지 비용</strong>: 사업용 부동산을 법인에 넘기면 양도세·취득세, 법인 전환 후 일정 기간 성실신고확인(세무대리 비용), 법인을 접을 때 잔여재산 과세가 더 듭니다.</li>
                  <li>대표 연봉을 바꾸면 이 비교도 달라집니다. 위 숫자는 입력하신 연봉 <strong>한 경우</strong>일 뿐, 최적 연봉·전환 여부는 상담에서 종합 판단합니다.</li>
                </ul>
              </section>

              <section className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '14px 18px' }}>
                <p style={{ margin: 0, lineHeight: 1.65 }}>
                  법인에 남는 이익(법인세 낸 뒤)은 <strong>{formatWon(calc.retained)}</strong>이 회사에 유보됩니다.{' '}
                  {answers.dividend !== 'dividend'
                    ? '회사에 재투자(유보)하면 추가 세금 없이 법인이 유리합니다. 대표가 가져가려면 배당소득세가 추가됩니다.'
                    : calc.dividendComprehensive
                      ? (calc.dividendUnconfirmed
                          ? <>배당 잔여이익은 2,000만원 이하지만, <strong>대표자에게 다른 이자·배당소득이 있으면 합산 2,000만원을 넘어 「금융소득종합과세」</strong> 대상이 될 수 있습니다. 그 경우 15.4%보다 세부담이 커지므로, 단정된 15.4% 대신 <strong>별도 정밀 계산</strong>이 필요합니다(본 화면에는 배당세를 합산하지 않았습니다).</>
                          : <>이를 <strong>배당으로 가져가면 「금융소득종합과세」 대상</strong>입니다(연 2,000만원 초과). 배당이 대표의 다른 소득과 합산돼 누진세율(최고 49.5%)로 과세되므로, 단순 15.4%보다 세부담이 <strong>크게 늘 수 있습니다</strong>. 배당 시 실제 세액은 <strong>별도 정밀 계산</strong>이 필요해, 본 화면에는 배당세를 합산하지 않았습니다.</>)
                      : <>이를 <strong>배당으로 가져가면 배당소득세 약 {formatWon(calc.dividendTax)}</strong>(2,000만원 이하 분리과세 15.4%)이 더 붙어, 법인 합계가 약 {formatWon(calc.corpTotalWithDiv)}이 됩니다.</>}
                </p>
              </section>

              {report.quick && (
                <div className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '14px 18px' }}>
                  <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}><strong>이익·대표연봉만으로 낸 빠른 비교예요.</strong> 부양가족·배당 계획을 넣으면 더 정확합니다 —</p>
                  <button className="jt-btn jt-btn--primary" onClick={goDetail}>부양가족·배당 넣어 정확히 →</button>
                </div>
              )}
            </>
          )}

          <section className="jt-report-result__section" style={{ background: '#f0f7f3', borderLeft: '4px solid #2a6d4f', padding: '12px 16px', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
              본 비교는 <strong>세율 차이(개인 종소세 vs 법인세+대표급여세)</strong>만 본 추정입니다. 실제 의사결정은 <strong>4대보험·성실신고확인·법인 설립/전환 비용(현물출자 양도세·취득세)·잔여이익 배당 계획</strong>까지 종합해야 하니, 정확한 판단은 상담으로 확인하세요.
            </p>
          </section>

          {commentary && commentary.headline && (
            <section className="jt-report-result__section">
              <h3>자동 분석</h3>
              <p style={{ fontWeight: 600 }}>{commentary.headline}</p>
              {(commentary.cautions || []).map((c, i) => (
                <div key={i} style={{ marginBottom: 8 }}><strong>· {c.title}</strong> — {c.detail}</div>
              ))}
            </section>
          )}

          {calc.precise && typeof JTReportConvert === 'function' && (
            <JTReportConvert
              reportType="법인 전환"
              reportSummary={`사업이익 ${formatWon(Number(answers.businessIncome) || 0)} → ${favorable ? '법인 유리' : '개인 유리'} ${formatWon(Math.abs(calc.indivTotal - calc.corpTotal))}`}
              reportDetail={buildCorpDetail(answers, calc, commentary)}
              kakaoSummary={buildCorpKakao(answers, calc)}
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
      <JTReportShell title="법인 전환 시뮬레이터" subtitle={phase === 'quick' ? '사업 이익·대표 연봉만 넣으면 개인 vs 법인을 바로 비교해요.' : '부양가족·배당 계획까지 반영해 더 정확히 비교합니다.'} stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="CONSULTING">
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
                <div style={{ fontSize: 14, color: 'var(--accent,#2a6d4f)', marginTop: 6 }}>= {corpKoreanAmount(Number(answers[cur.id]))}</div>
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
              {isLast ? (phase === 'quick' ? '빠른 비교 보기 →' : '결과 보기 →') : '다음 →'}
            </button>
          </div>
        </div>
      </JTReportShell>
    </div>
  );
}

function corpKoreanAmount(n) {
  if (typeof acqKoreanAmount === 'function') return acqKoreanAmount(n);
  if (!n || n <= 0) return '';
  const units = [[1_0000_0000_0000, '조'], [1_0000_0000, '억'], [1_0000, '만'], [1, '']];
  let rest = n, s = '';
  for (const [u, label] of units) { const q = Math.floor(rest / u); if (q > 0) { s += q.toLocaleString('ko-KR') + label + ' '; rest -= q * u; } }
  return s.trim() + '원';
}

window.JTReportCorporate = JTReportCorporate;

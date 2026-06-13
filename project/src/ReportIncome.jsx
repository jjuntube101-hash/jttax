/* @jsx React.createElement */
/* 종합소득세 절세 점검 — 5문항 · claude 기반 */

const { useState: useIncState } = React;

const INC_QS = [
  {
    id: 'work',
    q: '주 수입 형태는 무엇입니까?',
    opts: [
      ['freelance', '프리랜서 (3.3% 원천징수)', '강사·디자이너·작가 등'],
      ['sole', '개인사업자 (일반/간편장부)', ''],
      ['creator', '유튜버·크리에이터·인플루언서', '해외 플랫폼 수익 포함'],
      ['professional', '전문직 (변호사·의사·세무사 등)', ''],
      ['rental', '임대소득 위주', '주택·상가 임대'],
      ['mixed', '두 개 이상 혼합', ''],
    ],
  },
  {
    id: 'revenue',
    q: '작년 총 수입금액(매출) 규모는?',
    opts: [
      ['r1', '3,000만원 미만', ''],
      ['r2', '3,000만 ~ 7,500만원', '간편장부 대상 범위'],
      ['r3', '7,500만 ~ 1억 5천만원', '복식부기 의무 검토'],
      ['r4', '1.5억 ~ 3억원', ''],
      ['r5', '3억 ~ 7.5억원', ''],
      ['r6', '7.5억원 초과', ''],
    ],
  },
  {
    id: 'method',
    q: '작년 신고 방식은 어떻게 하셨습니까?',
    opts: [
      ['simple', '단순경비율로 신고', '수입 × 경비율'],
      ['standard', '기준경비율로 신고', ''],
      ['simple_book', '간편장부로 신고', ''],
      ['double_book', '복식부기로 신고', ''],
      ['home_tax', '홈택스 자동 신고 그대로', ''],
      ['unsure', '잘 기억나지 않음', ''],
    ],
  },
  {
    id: 'concerns',
    q: '절세 관점에서 놓치고 있다고 느끼는 항목이 있습니까? (복수 선택)',
    multi: true,
    opts: [
      ['deduction', '각종 공제·특례 적용', '노란우산·청년창업·중소기업특별세액감면 등'],
      ['expense', '경비 인정 범위', '업무용 차량·통신비·인건비'],
      ['timing', '소득·비용 인식 시점', '이월공제·결손금'],
      ['structure', '법인 전환·분산', '과세구조 재설계'],
      ['vat', '부가세 환급·면세 적용', ''],
      ['retirement', '연금·저축 관련 세액공제', '개인연금·IRP'],
      ['none', '특별히 떠오르는 것은 없습니다', ''],
    ],
  },
  {
    id: 'context',
    q: '추가로 공유하고 싶은 상황이 있다면 적어주세요.',
    sub: '선택 사항 · 300자 이내. 예: 올해 창업, 해외 수익 비중, 가족 고용 등',
    freeform: true,
  },
];

function JTReportIncome({ setRoute, onBack }) {
  const [step, setStep] = useIncState(0);
  const [answers, setAnswers] = useIncState({});
  const [loading, setLoading] = useIncState(false);
  const [report, setReport] = useIncState(null);
  const [err, setErr] = useIncState(null);

  const total = INC_QS.length;
  const cur = INC_QS[step];
  const isLast = step === total - 1;

  const setAns = (id, v) => setAnswers(a => ({ ...a, [id]: v }));
  const toggleMulti = (id, v) => setAnswers(a => {
    const cur = Array.isArray(a[id]) ? a[id] : [];
    if (cur.includes(v)) return { ...a, [id]: cur.filter(x => x !== v) };
    return { ...a, [id]: [...cur, v] };
  });

  const canNext = () => {
    if (cur.freeform) return true;
    const v = answers[cur.id];
    if (cur.multi) return Array.isArray(v) && v.length > 0;
    return !!v;
  };

  const runAnalysis = async () => {
    setLoading(true);
    setErr(null);
    try {
      const humanAnswers = INC_QS.map(q => {
        const a = answers[q.id];
        if (q.freeform) return `Q${q.id}: ${a || '(응답 없음)'}`;
        if (q.multi) {
          const labels = (Array.isArray(a) ? a : []).map(v => (q.opts.find(o => o[0] === v) || [])[1]).filter(Boolean);
          return `Q${q.id}: ${labels.join(', ') || '(응답 없음)'}`;
        }
        const label = (q.opts.find(o => o[0] === a) || [])[1] || '(응답 없음)';
        return `Q${q.id}: ${label}`;
      }).join('\n');

      const prompt = `당신은 한국 세법에 능통한 국세청 출신 세무사입니다. 다음 납세자의 종합소득세 절세 점검을 수행하고 "놓치고 있을 가능성이 높은" 공제·특례·비용 처리 TOP 3를 JSON으로만 응답하세요. 단정적 결론은 피하고 "가능성", "검토 필요" 같은 표현을 사용하세요.

사용자 응답:
${humanAnswers}

다음 JSON 스키마로만 응답:
{
  "headline": "한 문장 요약 (예: '프리랜서 강사의 경우 3가지 절세 여지가 확인됩니다')",
  "top3": [
    {"title": "항목명 (예: 노란우산공제)", "detail": "2~3문장 설명", "impact": "예상 절세 효과 범위", "keyword": "관련 법령·예규"}
  ],
  "checklist": ["점검 자료 1", "2", "3", "4"],
  "warnings": ["반드시 유의할 점 1", "2"],
  "next_steps": ["다음 액션 1", "2", "3"]
}

top3는 정확히 3개.`;

      const txt = await window.claude.complete(prompt);
      const match = txt.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('JSON 추출 실패');
      const data = JSON.parse(match[0]);
      setReport(data);
    } catch (e) {
      console.error(e);
      // Claude 실패 시 기본 체크리스트로 폴백
      setReport({
        headline: '분석 요청이 지연되어 기본 점검 항목을 먼저 안내드립니다. 정밀 분석은 담당 세무사가 이어받겠습니다.',
        top3: [
          { title: '노란우산공제 / 연금저축 / IRP 세액공제', detail: '사업자·프리랜서에게 가장 흔히 누락되는 공제입니다. 연 최대 500만원 + 연금계좌 700만원 한도가 있어 구간에 따라 세액이 크게 바뀝니다.', impact: '수십만~수백만원', keyword: '조세특례제한법 §86의3' },
          { title: '업무용 차량·통신비·가족 인건비', detail: '개인사업자의 가장 큰 경비 누락 지점. 업무일지·증빙 기준만 충족되면 인정 가능성이 큽니다.', impact: '연 수백만원', keyword: '법인세법 §27의2 / 소득세법 §33' },
          { title: '중소기업 특별세액감면·청년창업 감면', detail: '업종·지역·연령 요건을 충족하면 세액의 5~100%를 감면받을 수 있습니다. 누락 신고가 흔합니다.', impact: '수백만~수천만원', keyword: '조세특례제한법 §7·§6' },
        ],
        checklist: ['지난 3년치 종합소득세 신고서', '매출·매입 증빙 자료', '가족 인건비·임차료·차량 관련 영수증', '연금계좌·노란우산 납입내역'],
        warnings: ['사업자 유형·업종코드에 따라 적용 가능 감면이 달라집니다.', '단정적 절세는 없습니다. 반드시 담당 세무사 검토가 필요합니다.'],
        next_steps: ['지난 3년치 신고서 사본 준비', '담당 세무사에게 자료 공유 후 경정청구 여부 판단', '차년도 절세 구조 설계'],
      });
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => { isLast ? runAnalysis() : setStep(s => s + 1); };
  const goPrev = () => { step === 0 ? onBack() : setStep(s => s - 1); };

  if (report) {
    return (
      <div className="jt-container jt-report-result">
        <div className="jt-report-result__head">
          <button className="jt-report-shell__back" onClick={onBack}>← JT 리포트 허브</button>
          <div className="jt-report-result__meta">
            <span className="jt-tag">BOOKKEEPING</span>
            <span>종합소득세 절세 점검 · {new Date().toLocaleDateString('ko-KR')}</span>
          </div>
        </div>

        <div className="jt-report-result__grade jt-grade-mid">
          <div className="jt-report-result__grade-label">절세 점검 요약</div>
          <div className="jt-report-result__grade-val">TOP 3 항목 도출</div>
          <p>{report.headline}</p>
        </div>

        <section className="jt-report-result__section">
          <h3>놓치고 있을 가능성이 높은 TOP 3</h3>
          <ol className="jt-report-reasons">
            {(report.top3 || []).map((r, i) => (
              <li key={i}>
                <div className="jt-report-reasons__head">
                  <span className="jt-report-reasons__n">{String(i + 1).padStart(2, '0')}</span>
                  <h4>{r.title}</h4>
                  {r.keyword && <span className="jt-report-reasons__kw">{r.keyword}</span>}
                </div>
                <p>{r.detail}</p>
                {r.impact && <p style={{marginTop: 8, fontSize: 14, opacity: 0.7}}>예상 절세 효과: {r.impact}</p>}
              </li>
            ))}
          </ol>
        </section>

        <div className="jt-report-result__grid">
          <section className="jt-report-result__section">
            <h3>점검 자료 체크리스트</h3>
            <ul className="jt-report-check">
              {(report.checklist || []).map((c, i) => (
                <li key={i}><span className="jt-report-check__box">☐</span>{c}</li>
              ))}
            </ul>
          </section>
          <section className="jt-report-result__section">
            <h3>다음 스텝</h3>
            <ol className="jt-report-next">
              {(report.next_steps || []).map((n, i) => <li key={i}>{n}</li>)}
            </ol>
          </section>
        </div>

        {(report.warnings && report.warnings.length > 0) && (
          <div className="jt-report-caution">
            <strong>유의 사항</strong>
            {report.warnings.map((w, i) => <p key={i}>{w}</p>)}
          </div>
        )}

        <JTReportDisclaimer variant="inline" />
        <JTReportConvert
          setRoute={setRoute}
          reportType="종합소득세 절세 점검"
          reportTag="BOOKKEEPING"
          reportSummary={report.headline || ''}
          urgent={false}
        />

        <div className="jt-report-result__foot">
          <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setStep(0); setAnswers({}); }}>다시 진단</button>
          <button className="jt-btn jt-btn--ghost" onClick={() => window.print()}>PDF / 인쇄</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="jt-container jt-report-loading">
        <div className="jt-report-loading__spinner" />
        <h2>절세 점검 중입니다</h2>
        <p>공제·특례·비용 처리에서 놓친 가능성을 정리하고 있습니다.</p>
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
        title="종합소득세 절세 점검"
        subtitle="업종·수입·지출 구조에서 놓치고 있을 공제·특례를 찾습니다."
        stepIdx={step}
        stepTotal={total}
        onBack={goPrev}
        tag="BOOKKEEPING"
      >
        <div className="jt-report-q">
          <h2>{cur.q}</h2>
          {cur.sub && <p className="jt-report-q__sub">{cur.sub}</p>}

          {cur.freeform ? (
            <textarea
              className="jt-report-q__textarea"
              maxLength={300}
              placeholder="(선택) 창업 시점·가족 고용·해외 수익 비중 등"
              value={answers[cur.id] || ''}
              onChange={(e) => setAns(cur.id, e.target.value)}
            />
          ) : (
            <div className={`jt-report-q__opts ${cur.multi ? 'jt-report-q__opts--multi' : ''}`}>
              {cur.opts.map(([v, label, hint]) => {
                const selected = cur.multi
                  ? (Array.isArray(answers[cur.id]) && answers[cur.id].includes(v))
                  : answers[cur.id] === v;
                return (
                  <button
                    key={v}
                    className={`jt-report-q__opt ${selected ? 'is-selected' : ''}`}
                    onClick={() => cur.multi ? toggleMulti(cur.id, v) : setAns(cur.id, v)}
                  >
                    <span className="jt-report-q__opt-bullet">{cur.multi ? (selected ? '■' : '□') : (selected ? '●' : '○')}</span>
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
window.JTReportIncome = JTReportIncome;

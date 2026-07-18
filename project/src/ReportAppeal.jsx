/* @jsx React.createElement */
/* 경정청구 가능성 진단 — 5문항 · claude 기반 분석 */

const { useState: useApState, useEffect: useApEffect, useRef: useApRef } = React;

const APPEAL_QS = [
  {
    id: 'type',
    q: '경정청구를 검토하려는 신고는 어떤 거래입니까?',
    sub: '여러 건에 해당하면 가장 관심 있는 하나를 선택하세요.',
    opts: [
      ['capital_gains', '부동산 양도소득세', '주택·상가·토지 등'],
      ['inheritance', '상속세', '상속 발생 후 신고'],
      ['gift', '증여세', '부모·배우자 등으로부터 증여'],
      ['income', '종합소득세', '사업·프리랜서·임대 등'],
      ['corporate', '법인세', '법인 결산·신고'],
      ['vat_other', '부가세 / 기타', '원천·취득세 등'],
    ],
  },
  {
    id: 'timing',
    q: '신고 또는 과세 처분은 언제였습니까?',
    sub: '경정청구 법정기한은 원칙적으로 5년입니다.',
    opts: [
      ['lt_5y', '최근 5년 이내 신고했습니다', '법정기한 내'],
      ['gt_5y', '5년보다 더 이전에 신고했습니다', '원칙적 기한 경과'],
      ['post_audit', '세무조사·결정통지를 최근 3개월 이내에 받았습니다', '결정·경정 통지분 (§45의2①단서, 통지받은 날부터 3개월)'],
      ['never', '아직 신고 전입니다', '경정청구 대상 아님'],
      ['unsure', '정확한 시점을 모르겠습니다', ''],
    ],
  },
  {
    id: 'reason',
    q: '당시 사실관계·판단에서 의심되는 부분이 있습니까?',
    sub: '여러 개 해당 시 복수 선택 가능합니다.',
    multi: true,
    opts: [
      ['case_changed', '신고 이후 판례·예규가 변경되었습니다', '후발적 경정청구 사유'],
      ['fact_changed', '신고 이후 사실관계가 변경되었습니다', '예: 매매 취소·무효'],
      ['exemption', '적용 가능한 특례·감면을 놓쳤을 수 있습니다', '1세대1주택·가업상속 등'],
      ['valuation', '감정평가·시가 산정이 부적절했을 수 있습니다', '시가 과대·과소'],
      ['classification', '소득·자산 구분이 모호했습니다', '사업·기타소득, 주택·상가 구분'],
      ['calc_error', '계산·적용 세율에 단순 오류가 있어 보입니다', '기본공제·세율 구간'],
      ['none', '특별한 의심 사유는 없습니다', '일반 재검토'],
    ],
  },
  {
    id: 'amount',
    q: '예상하시는 환급 희망 규모는 어느 정도입니까?',
    sub: '참고용입니다. 정확한 금액은 정식 검토에서 산정됩니다.',
    opts: [
      ['xs', '~500만원', ''],
      ['s', '500~3,000만원', ''],
      ['m', '3,000만원~1억원', ''],
      ['l', '1억~5억원', ''],
      ['xl', '5억원 초과', ''],
      ['unknown', '아직 모르겠습니다', ''],
    ],
  },
  {
    id: 'context',
    q: '추가로 공유하고 싶은 맥락이 있으면 적어주세요.',
    sub: '선택 사항 · 최대 500자. 민감정보(주민번호·계좌)는 적지 마세요.',
    freeform: true,
  },
];

function JTReportAppeal({ setRoute, onBack }) {
  const [step, setStep] = useApState(0);
  const [answers, setAnswers] = useApState({});
  const [loading, setLoading] = useApState(false);
  const [report, setReport] = useApState(null);
  const [err, setErr] = useApState(null);

  const total = APPEAL_QS.length;
  const cur = APPEAL_QS[step];
  const isLast = step === total - 1;

  const setAns = (id, v) => setAnswers(a => ({ ...a, [id]: v }));
  const toggleMulti = (id, v) => setAnswers(a => {
    const cur = Array.isArray(a[id]) ? a[id] : [];
    if (cur.includes(v)) return { ...a, [id]: cur.filter(x => x !== v) };
    return { ...a, [id]: [...cur, v] };
  });

  const canNext = () => {
    if (cur.freeform) return true; // optional
    const v = answers[cur.id];
    if (cur.multi) return Array.isArray(v) && v.length > 0;
    return !!v;
  };

  const runAnalysis = async () => {
    setLoading(true);
    setErr(null);
    try {
      const humanAnswers = APPEAL_QS.map(q => {
        const a = answers[q.id];
        if (q.freeform) return `Q${q.id}: ${a || '(응답 없음)'}`;
        if (q.multi) {
          const labels = (Array.isArray(a) ? a : []).map(v => (q.opts.find(o => o[0] === v) || [])[1]).filter(Boolean);
          return `Q${q.id}: ${labels.join(', ') || '(응답 없음)'}`;
        }
        const label = (q.opts.find(o => o[0] === a) || [])[1] || '(응답 없음)';
        return `Q${q.id}: ${label}`;
      }).join('\n');

      const prompt = `당신은 한국 세법에 능통한 세무사입니다. 다음 사용자의 경정청구 가능성을 간이 평가하고 JSON으로만 응답하세요. 법령·예규·판례를 구체적으로 언급하되 단정적 결론은 피하고 "가능성", "검토 필요" 같은 표현을 사용하세요.

사용자 응답:
${humanAnswers}

다음 JSON 스키마로만 응답 (다른 텍스트 금지):
{
  "grade": "HIGH" | "MID" | "LOW" | "NONE",
  "grade_label": "한글 등급명 (예: 가능성 높음)",
  "summary": "2~3문장 요약",
  "reasons": [
    {"title": "짧은 사유 제목", "detail": "2~3문장 설명 (법령·예규 키워드 포함)", "keyword": "국세기본법 §45의2 등"}
  ],
  "checklist": ["필요 자료 1", "필요 자료 2", "필요 자료 3", "필요 자료 4"],
  "next_steps": ["다음 액션 1", "다음 액션 2", "다음 액션 3"],
  "caution": "반드시 유의할 점 한 문장"
}

reasons는 최소 3개, 최대 5개. 응답이 NONE이면 "경정청구 대상이 아닌 이유"를 reasons에 설명.`;

      const txt = await window.claude.complete(prompt);
      // Extract JSON
      const match = txt.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('JSON 추출 실패');
      const data = JSON.parse(match[0]);
      setReport(data);
    } catch (e) {
      console.error(e);
      // Claude 실패 시 입력값 기반 기본 등급 판정 폴백
      const hasValidTiming = answers.timing === 'lt_5y' || answers.timing === 'post_audit';
      const reasonCount = Array.isArray(answers.reason) ? answers.reason.length : 0;
      const postAudit = answers.timing === 'post_audit';
      let grade = 'LOW';
      if (answers.timing === 'never' || answers.timing === 'gt_5y') grade = 'NONE';
      else if (postAudit || reasonCount >= 2) grade = 'HIGH';
      else if (hasValidTiming && reasonCount >= 1) grade = 'MID';
      setReport({
        grade,
        grade_label: {HIGH:'가능성 높음', MID:'검토 가치 있음', LOW:'가능성 낮음', NONE:'대상 아님'}[grade],
        summary: '분석 요청이 지연되어 입력값 기반 기본 판정을 먼저 안내드립니다. 정밀 검토는 담당 세무사가 이어받겠습니다.',
        reasons: [
          { title: '법정기한 검토', detail: '경정청구 원칙 기한은 법정신고기한으로부터 5년입니다. 결정·경정 통지를 받은 증액분은 통지받은 날부터 3개월(5년 내 한정), 후발적 사유(심판·소송 확정·귀속 변경·상호합의 등 한정 열거)는 그 사유를 안 날부터 3개월 이내 청구할 수 있습니다(90일 아님).', keyword: '국세기본법 §45의2①단서·②' },
          { title: '사유 확정 필요', detail: '단순 오류·누락·특례 미적용·평가 과대 등 사유 유형에 따라 필요 증빙과 청구 방법이 달라집니다.', keyword: '기본법 §45의2·판례' },
          { title: '리스크 검토', detail: '경정청구 자체에는 불이익이 없으나, 반사적으로 원 신고의 허점이 드러날 수 있어 사전 검토가 중요합니다.', keyword: '실무 주의' },
        ],
        checklist: ['당시 신고서·세액계산서 사본', '계약서·거래 증빙', '판례·예규 관련 자료', '당시 담당 세무사 연락처(있다면)'],
        next_steps: ['담당 세무사에게 위 자료 공유', '법정기한 전 사유 확정 여부 판단', '인용 가능성 높은 순서로 청구 진행'],
        caution: '경정청구는 반사적으로 원 신고를 전면 재검토 대상으로 만들 수 있어 반드시 전문가 검토 후 진행해야 합니다.',
      });
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => {
    if (isLast) {
      runAnalysis();
    } else {
      setStep(s => s + 1);
    }
  };

  const goPrev = () => {
    if (step === 0) onBack();
    else setStep(s => s - 1);
  };

  // ===== 결과 화면 =====
  if (report) {
    return (
      <div className="jt-container jt-report-result">
        <div className="jt-report-result__head">
          <button className="jt-report-shell__back" onClick={onBack}>← 세금 계산기</button>
          <div className="jt-report-result__meta">
            <span className="jt-tag">APPEAL</span>
            <span>경정청구 가능성 진단 · {new Date().toLocaleDateString('ko-KR')}</span>
          </div>
        </div>

        <div className={`jt-report-result__grade jt-grade-${(report.grade || 'MID').toLowerCase()}`}>
          <div className="jt-report-result__grade-label">진단 결과</div>
          <div className="jt-report-result__grade-val">{report.grade_label || report.grade}</div>
          <p>{report.summary}</p>
        </div>

        <section className="jt-report-result__section">
          <h3>해당 가능 사유</h3>
          <ol className="jt-report-reasons">
            {(report.reasons || []).map((r, i) => (
              <li key={i}>
                <div className="jt-report-reasons__head">
                  <span className="jt-report-reasons__n">{String(i + 1).padStart(2, '0')}</span>
                  <h4>{r.title}</h4>
                  {r.keyword && <span className="jt-report-reasons__kw">{r.keyword}</span>}
                </div>
                <p>{r.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="jt-report-result__grid">
          <section className="jt-report-result__section">
            <h3>필요 자료 체크리스트</h3>
            <ul className="jt-report-check">
              {(report.checklist || []).map((c, i) => (
                <li key={i}><span className="jt-report-check__box">☐</span>{c}</li>
              ))}
            </ul>
          </section>
          <section className="jt-report-result__section">
            <h3>다음 스텝</h3>
            <ol className="jt-report-next">
              {(report.next_steps || []).map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ol>
          </section>
        </div>

        {report.caution && (
          <div className="jt-report-caution">
            <strong>유의 사항</strong>
            <p>{report.caution}</p>
          </div>
        )}

        <JTReportDisclaimer variant="inline" />
        <JTReportConvert
          setRoute={setRoute}
          reportType="경정청구 가능성 진단"
          reportTag="APPEAL"
          reportSummary={`${report.grade_label || report.grade || ''} · ${report.summary || ''}`}
          urgent={report.grade === 'HIGH' || (answers.timing === 'post_audit')}
        />

        <div className="jt-report-result__foot">
          <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setStep(0); setAnswers({}); }}>다시 진단하기</button>
          <button className="jt-btn jt-btn--ghost" onClick={() => window.print()}>PDF / 인쇄</button>
        </div>
      </div>
    );
  }

  // ===== 로딩 =====
  if (loading) {
    return (
      <div className="jt-container jt-report-loading">
        <div className="jt-report-loading__spinner" />
        <h2>분석 중입니다</h2>
        <p>법령·예규·판례 기준으로 경정청구 가능성을 정리하고 있습니다.</p>
        <p className="jt-report-loading__hint">약 10~20초 소요됩니다.</p>
      </div>
    );
  }

  // ===== 오류 =====
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

  // ===== 문항 화면 =====
  return (
    <div className="jt-container">
      <JTReportShell
        title="경정청구 가능성 진단"
        subtitle="이미 낸 세금, 다시 볼 수 있는지 5분 안에 살펴봅니다."
        stepIdx={step}
        stepTotal={total}
        onBack={goPrev}
        tag="APPEAL"
      >
        <div className="jt-report-q">
          <h2>{cur.q}</h2>
          {cur.sub && <p className="jt-report-q__sub">{cur.sub}</p>}

          {cur.freeform ? (
            <textarea
              className="jt-report-q__textarea"
              maxLength={500}
              placeholder="(선택) 거래 배경, 당시 판단 근거, 최근 알게 된 정보 등"
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
          <button
            className="jt-btn jt-btn--primary"
            onClick={goNext}
            disabled={!canNext()}
          >
            {isLast ? '리포트 생성 →' : '다음 →'}
          </button>
        </div>
      </JTReportShell>
    </div>
  );
}
window.JTReportAppeal = JTReportAppeal;

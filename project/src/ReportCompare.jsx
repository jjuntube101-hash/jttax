/* @jsx React.createElement */
/* 처분방법 비교 — 같은 부동산을 증여 vs 매매 vs 상속할 때 예상 세금 비교 → 검증 엔진 /v1/calc/compare-disposal.
   ★ 프리미엄 설계(로드맵): 엔진은 "세액 숫자"까지만 보여준다. "어느 방법이 유리한가"라는 판단은
   세무사 상담에서만 — 엔진의 '최적방법' 라벨은 UI에서 억제하고, 2차효과(상속=사망전제·증여=이월과세·
   매매=자금조달계획서·직계간 증여추정)를 의무 경고한다. 세액만 비교(실행가능성·비세무 요인 미반영).
   공통 헬퍼(formatWon·JTReportShell·JTReportConvert·acqKoreanAmount)는 먼저 로드된 파일의 전역 사용. */

const { useState: useCmpState } = React;

function cmpWon(n) {
  if (n === null || n === undefined || isNaN(n)) return '0원';
  return Math.round(n).toLocaleString('ko-KR') + '원';
}
function cmpKorean(n) {
  if (typeof acqKoreanAmount === 'function') return acqKoreanAmount(n);
  if (!n || n <= 0) return '';
  const units = [[1_0000_0000_0000, '조'], [1_0000_0000, '억'], [1_0000, '만'], [1, '']];
  let rest = Math.round(n), s = '';
  for (const [u, label] of units) { const q = Math.floor(rest / u); if (q > 0) { s += q.toLocaleString('ko-KR') + label + ' '; rest -= q * u; } }
  return s.trim() + '원';
}

// 방법별 2차효과 경고 (세액 외 — 세무사 검토 필수 사유). 법령근거는 1차소스 확인 대상.
const METHOD_NOTE = {
  '증여': '증여 후 10년(2022년 이전 증여분 5년) 내에 그 부동산을 팔면, 양도세 계산 시 「증여자의 취득가액」을 적용하는 이월과세가 있어 절세가 사라질 수 있습니다(소득세법 §97의2). 수증자의 자금출처·증여세 납부재원도 확인이 필요합니다.',
  '매매': '직계존비속·배우자 간 「매매」는 실제 대금을 주고받지 않으면 증여로 추정됩니다(상증법 §44). 대금 수수 입증·자금조달계획서가 필요하고, 저가 매매는 부당행위계산부인(소득세법 §101) 대상이 될 수 있습니다.',
  '상속': '상속은 「사망」을 전제로 하므로 시점을 정할 수 없습니다. 상속 직전 처분·사전증여 합산(10년)·동거주택 상속공제 등 변수에 따라 결과가 크게 달라집니다.',
};

const CMP_QS = [
  {
    id: 'propertyValue', section: '대상 부동산',
    q: '물려주려는 부동산의 현재 시세는 얼마인가요? (원)',
    sub: '지금 팔면 받을 수 있는 시가(실거래가 수준)를 넣어 주세요. 세 가지 방법(증여·매매·상속) 모두 이 금액을 기준으로 계산합니다.',
    numeric: true, money: true, placeholder: '예: 1,500,000,000',
  },
  {
    id: 'acquisitionPrice', section: '대상 부동산',
    q: '지금 소유자가 그 부동산을 살 때 얼마였나요? (취득가, 원)',
    sub: '현재 소유자(예: 부모님)가 처음 취득한 가격. 매매·증여 시 양도차익(양도세) 계산에 쓰입니다. 모르면 0으로 두면 시세의 절반으로 가정합니다.',
    numeric: true, money: true, optional: true, placeholder: '예: 400,000,000 (모르면 0)',
  },
  {
    id: 'housingCount', section: '현재 소유자',
    q: '지금 소유자(넘겨주는 분)는 주택을 몇 채 갖고 있나요?',
    sub: '증여·매매 시 다주택 중과 여부를 가릅니다. 이 부동산을 포함한 보유 주택 수.',
    numeric: true, optional: true, placeholder: '예: 2 (1주택이면 1)',
  },
  {
    id: 'holdingYears', section: '현재 소유자',
    q: '이 부동산을 보유한 지 몇 년 됐나요?',
    sub: '매매(양도세) 계산에 가장 중요합니다 — 오래 보유했을수록 장기보유특별공제로 양도세가 줄고, 2년 미만 단기보유면 양도세율(40~70%)이 크게 높아집니다.',
    numeric: true, placeholder: '예: 10',
  },
  {
    id: 'recipient', section: '받는 사람',
    q: '누구에게 넘기려 하나요?',
    sub: '가장 흔한 경우는 자녀입니다. 받는 사람에 따라 증여공제·세율이 달라집니다.',
    opts: [['child', '자녀에게', '직계비속'], ['spouse', '배우자에게', '']],
  },
  {
    id: 'hasSpouse', section: '상속 비교용',
    q: '지금 소유자에게 배우자가 있나요?',
    sub: '상속 방법을 비교하려면 필요해요. 배우자가 있으면 배우자 상속공제(최소 5억)가 적용됩니다.',
    opts: [['yes', '네, 있습니다', '배우자공제 적용'], ['no', '아니오', '']],
  },
  {
    id: 'numChildren', section: '상속 비교용',
    q: '자녀는 몇 명인가요?',
    sub: '상속 방법의 세금에 큰 영향을 줍니다 — 자녀가 많을수록 배우자 상속공제가 줄어 상속세가 늘어납니다. 자녀가 없으면 0을 넣어 주세요.',
    numeric: true, allowZero: true, placeholder: '예: 2 (없으면 0)',
  },
  {
    id: 'otherEstate', section: '상속 비교용',
    q: '이 부동산 외에 다른 재산은 대략 얼마인가요? (선택)',
    sub: '상속세는 전체 재산을 합쳐 누진세율로 계산하므로, 다른 재산이 많으면 상속세가 올라갑니다. 모르면 0.',
    numeric: true, money: true, optional: true, placeholder: '예: 500,000,000 (없으면 0)',
  },
  {
    id: 'context', section: '추가 사항',
    q: '추가로 알려주실 내용이 있나요? (선택)',
    sub: '소유자 연세·건강, 자녀의 자금 사정, 임대 여부, 이미 한 사전증여 등 — 실제 판단에 중요한 정보입니다(상담에서 반영).',
    freeform: true, optional: true, placeholder: '예: 아버지 78세 / 자녀 전세자금 부족 / 5년 전 5천만 증여함',
  },
];

async function callCompareEng(body) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  const delays = [1000, 2000, 3000, 4000, 6000, 8000, 10000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const to = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
      const res = await fetch(base + '/v1/calc/compare-disposal', {
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

function buildCompareDetail(answers, calc) {
  const L = ['■ 고객 입력 정보'];
  CMP_QS.forEach(q => {
    const val = answers[q.id];
    if (val === undefined || val === null || val === '') return;
    let v = val;
    if (q.opts) { const o = q.opts.find(x => x[0] === val); if (o) v = o[1]; }
    else if (q.numeric && q.money) v = cmpWon(Number(val));
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('  · ' + ql + ': ' + v);
  });
  if (calc.scenarios) {
    L.push('', '■ 방법별 예상 세금 (세액만 비교 — 검증 엔진)');
    ['증여', '매매', '상속'].forEach(m => {
      const sc = calc.scenarios[m]; if (!sc) return;
      L.push('  · ' + m + ' 총세부담: ' + cmpWon(sc['총세부담']) +
        ' (증여세 ' + cmpWon(sc['증여세']) + '·양도세 ' + cmpWon(sc['양도세']) +
        '·상속세 ' + cmpWon(sc['상속세']) + '·취득세 ' + cmpWon(sc['취득세']) + ')');
    });
    L.push('', '※ 세액만 비교한 결과이며, 실행가능성·2차효과·비세무 요인은 미반영. 어느 방법이 유리한지 판단은 세무사 검토 필요.');
  }
  return L.join('\n');
}

function buildCompareKakao(answers, calc) {
  const L = ['[JT택스랩 처분방법 비교 — 상담 요청]', '', '▶ 입력'];
  L.push('· 부동산 시가: ' + cmpWon(Number(answers.propertyValue) || 0));
  L.push('· 취득가: ' + cmpWon(Number(answers.acquisitionPrice) || 0));
  L.push('· 받는 사람: ' + (answers.recipient === 'spouse' ? '배우자' : '자녀'));
  if (calc.scenarios) {
    L.push('', '▶ 방법별 예상 세금(세액만)');
    ['증여', '매매', '상속'].forEach(m => { const sc = calc.scenarios[m]; if (sc) L.push('· ' + m + ': ' + cmpWon(sc['총세부담'])); });
  }
  L.push('', '어느 방법이 제 상황에 맞는지 상담받고 싶습니다.');
  return L.join('\n');
}

function JTReportCompare({ setRoute, onBack }) {
  const [step, setStep] = useCmpState(0);
  const [answers, setAnswers] = useCmpState({});
  const [loading, setLoading] = useCmpState(false);
  const [report, setReport] = useCmpState(null);
  const [err, setErr] = useCmpState(null);

  React.useEffect(() => {
    const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';
    if (base) { fetch(base + '/health', { method: 'GET' }).catch(function () {}); }
  }, []);

  const total = CMP_QS.length;
  const safeStep = Math.min(step, total - 1);
  const cur = CMP_QS[safeStep];
  const isLast = safeStep === total - 1;
  const setAns = (id, v) => setAnswers(a => ({ ...a, [id]: v }));

  const canNext = () => {
    if (!cur) return false;
    if (cur.freeform) return true;
    if (cur.numeric) {
      if (cur.optional) return true;
      const raw = answers[cur.id];
      if (raw === '' || raw === undefined || raw === null) return false;   // 빈칸=미상태(차단). '0'은 통과 — 미상태 vs 0 구분
      const v = Number(raw);
      return !isNaN(v) && (cur.allowZero ? v >= 0 : v > 0);
    }
    return !!answers[cur.id];
  };

  const runAnalysis = async () => {
    setLoading(true); setErr(null);
    try {
      const clamp = (x) => Math.max(0, Math.round(Number(x) || 0));
      if (clamp(answers.propertyValue) <= 0) { setErr('부동산 시세를 입력해 주세요.'); setLoading(false); return; }
      const body = {
        property_value: clamp(answers.propertyValue),
        acquisition_price: clamp(answers.acquisitionPrice),
        owner_housing_count: clamp(answers.housingCount) || 1,
        relationship: answers.recipient === 'spouse' ? '배우자' : '직계존속',
        has_spouse: answers.hasSpouse !== 'no',
        num_children: clamp(answers.numChildren),   // 필수 입력(0 허용) — 침묵 기본값 제거
        other_estate_value: clamp(answers.otherEstate),
        property_type: '주택',
      };
      // 보유연수 → 취득일 산정 (매매 양도세의 최대 변수: 장특공제·단기세율)
      // ★ raw 양수 그대로(반올림 금지 — 1년 미만 단기보유가 10년 기본값으로 둔갑 방지), 상한 100년, 명시 패딩(ISO slice 손상 방지)
      const hyRaw = Math.min(100, Math.max(0, Number(answers.holdingYears) || 0));
      if (hyRaw > 0) {
        const d = new Date(); d.setMonth(d.getMonth() - Math.round(hyRaw * 12));
        const pad = (x) => String(x).padStart(2, '0');
        body.acquisition_date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      }

      let calc = { precise: false };
      try {
        const j = await callCompareEng(body);
        const c = j && j.calc;
        if (c && c['시나리오별']) {
          calc.scenarios = c['시나리오별'];   // {증여, 매매, 상속}
          // ★ c['최적방법']·c['절세액'] 은 의도적으로 사용하지 않음(판단 라벨 억제)
          calc.engineWarnings = c['경고사항'] || [];
          calc.precise = true;
          calc.engineVer = j.version && j.version.engine;
        }
      } catch (e) { console.warn('처분비교 엔진 연결 실패', e); calc.engineErr = true; }

      setReport({ calc });
    } catch (e) { console.error(e); setErr(e.message || '계산 중 오류가 발생했습니다.'); }
    finally { setLoading(false); }
  };

  const goNext = () => { if (isLast) runAnalysis(); else setStep(s => s + 1); };
  const goPrev = () => { if (safeStep > 0) setStep(s => s - 1); else onBack(); };

  if (loading) {
    return (
      <div className="jt-container">
        <JTReportShell title="처분방법 비교" subtitle="증여·매매·상속 세금을 계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="LEGACY">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />증여·매매·상속 세 가지 방법의 예상 세금을 각각 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc } = report;
    const sc = calc.scenarios || {};
    const methods = ['증여', '매매', '상속'];
    const rows = [
      ['증여세', '증여세'], ['양도세', '양도세'], ['상속세', '상속세'], ['취득세', '취득세'],
    ];
    return (
      <div className="jt-container">
        <JTReportShell title="처분방법 비교 결과" subtitle="증여 vs 매매 vs 상속 — 예상 세금(세액만 비교)" stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LEGACY">
          {!calc.precise ? (
            <div style={{ background: '#fdeeec', borderLeft: '4px solid #c0392b', padding: '14px 18px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6 }}>
              <strong>정밀 계산이 필요합니다.</strong> 정밀 엔진 연결이 지연됐습니다. 잘못된 세액을 안내하지 않기 위해 결과를 표시하지 않았어요. 잠시 후 다시 시도하거나 상담을 권합니다.
              <div style={{ marginTop: 8 }}><button className="jt-btn jt-btn--ghost" onClick={() => runAnalysis()}>정밀 계산 다시 시도 →</button></div>
            </div>
          ) : (
            <>
              {/* 헤드라인 — '최적' 단정 없이 중립적으로 */}
              <div className="jt-report-result__grade jt-grade-mid">
                <div className="jt-report-result__grade-label">세 가지 방법의 예상 세금 (세액만 비교)</div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                  {methods.map(m => (
                    <div key={m} style={{ flex: '1 1 140px', minWidth: 130, background: 'rgba(255,255,255,.5)', borderRadius: 10, padding: '12px 10px' }}>
                      <div style={{ fontSize: 13, opacity: 0.8 }}>{m}</div>
                      <div style={{ fontSize: 19, fontWeight: 800, marginTop: 4 }}>{cmpWon((sc[m] || {})['총세부담'])}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6, color: '#b8860b' }}>※ <strong>세금(세액)만 비교한 추정</strong>입니다. 금액이 가장 적은 방법이 곧 정답은 아니에요 — 방법마다 「세금 외」 함정(증여 이월과세·매매 증여추정·상속 시점 등)과 실행가능성·자금 사정이 있어, 이 숫자만으로 결정하면 안 됩니다.</div>
                <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.65, color: '#8a6d3b' }}>· <strong>매매(양도세)</strong>는 입력하신 보유기간 기준이며 <strong>비조정대상지역</strong>으로 가정했습니다(조정지역이면 중과될 수 있어요).<br/>· <strong>상속</strong>은 「현재 재산 기준 약 10년 뒤 사망」을 가정한 추정이라, 실제 사망 시점·사전증여 합산(10년)에 따라 크게 달라집니다.<br/>· <strong>증여공제</strong>는 <strong>성년 자녀</strong> 기준입니다(미성년 자녀면 공제가 5천만→2천만으로 줄어 증여세가 늘어요).</div>
              </div>

              {/* 🔒 프리미엄 게이트 (옵션 B) — 세목별 상세·2차효과 설명·맞춤 전략은 상담에서 */}
              <section className="jt-report-result__section" style={{ background: '#f7f5f0', border: '1px dashed rgba(0,0,0,.25)', borderRadius: 12, padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>🔒</div>
                <p style={{ margin: '0 0 12px', fontWeight: 800, fontSize: 16 }}>더 깊은 분석은 상담에서 확인하세요</p>
                <ul style={{ margin: '0 auto 14px', padding: 0, listStyle: 'none', lineHeight: 1.95, fontSize: 14, maxWidth: 480, textAlign: 'left', display: 'inline-block' }}>
                  <li>🔹 <strong>방법별 세금 상세 분해</strong> — 증여세·양도세·상속세·취득세가 각각 얼마인지</li>
                  <li>🔹 <strong>방법마다의 「세금 외」 함정</strong> — 증여 이월과세, 매매 증여추정, 상속 시점 리스크</li>
                  <li>🔹 <strong>내 상황에 맞는 최적 경로와 실행 순서</strong></li>
                </ul>
                <p style={{ margin: 0, fontSize: 13.5, color: '#5a5a5a', lineHeight: 1.65 }}>이 셋은 사례마다 답이 달라 자동 계산만으론 위험합니다.<br/><strong>국세청 출신 세무사가 직접 검토</strong>해 드립니다 — 첫 상담 무료.</p>
              </section>

              {/* 판단 = 상담 (프리미엄 전환점) */}
              <section className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '16px 18px' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 800, fontSize: 15 }}>그래서 어느 방법이 유리한가요?</p>
                <p style={{ margin: '0 0 12px', lineHeight: 1.7 }}>그건 <strong>사장님 상황마다 다릅니다</strong> — 소유자 연세·건강(상속 시점), 자녀 자금, 보유 기간, 사전증여 이력, 향후 매각 계획까지 함께 봐야 「진짜 답」이 나옵니다. 위 숫자는 <strong>출발점</strong>이고, <strong>내 사례에 맞는 최적 경로와 실행 순서는 국세청 출신 세무사가 직접 검토</strong>해 드립니다.</p>
              </section>

              {calc.precise && typeof JTReportConvert === 'function' && (
                <JTReportConvert
                  reportType="처분방법 비교 (증여·매매·상속)"
                  reportTag="LEGACY"
                  reportSummary={`증여 ${cmpWon((sc['증여'] || {})['총세부담'])} · 매매 ${cmpWon((sc['매매'] || {})['총세부담'])} · 상속 ${cmpWon((sc['상속'] || {})['총세부담'])} (세액만)`}
                  reportDetail={buildCompareDetail(answers, calc)}
                  kakaoSummary={buildCompareKakao(answers, calc)}
                  setRoute={setRoute}
                />
              )}

              <div className="jt-report-q__nav" style={{ marginTop: 16 }}>
                <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setStep(0); setAnswers({}); }}>처음부터 다시</button>
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
      <JTReportShell title="처분방법 비교" subtitle="같은 부동산, 증여·매매·상속 중 세금이 어떻게 다른지 한눈에 비교합니다." stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="LEGACY">
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
                <div style={{ fontSize: 14, color: 'var(--accent,#2a6d4f)', marginTop: 6 }}>= {cmpKorean(Number(answers[cur.id]))}</div>
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
              {isLast ? '세 방법 비교하기 →' : '다음 →'}
            </button>
          </div>
        </div>
      </JTReportShell>
    </div>
  );
}
window.JTReportCompare = JTReportCompare;

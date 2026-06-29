/* @jsx React.createElement */
/* 부담부증여 최적화 — 자녀/배우자에게 부동산을 증여할 때 채무(전세·대출)를 얼마나 끼워야
   총세금(증여세+양도세+취득세)이 최소인가. 엔진 /v1/calc/optimize-burdened-gift.
   ★ 프리미엄 설계(옵션 B): 무료=절세 「여력(금액)」 + 세금이 줄어드는 추세 + §47③ 안전경고.
   🔒 상담=「정확한·안전한 채무비율」 + 실행 방법. 엔진이 찾은 이론적 최저비율은 부당행위
   위험이 커 그대로 노출하지 않는다(라벨 억제 = 무자격 판단 방어 + 안전).
   공통 헬퍼(formatWon·JTReportShell·JTReportConvert·acqKoreanAmount)는 먼저 로드된 전역 사용. */

const { useState: useBgState } = React;

function bgWon(n) {
  if (n === null || n === undefined || isNaN(n)) return '0원';
  return Math.round(n).toLocaleString('ko-KR') + '원';
}
function bgKorean(n) {
  if (typeof acqKoreanAmount === 'function') return acqKoreanAmount(n);
  if (!n || n <= 0) return '';
  const units = [[1_0000_0000_0000, '조'], [1_0000_0000, '억'], [1_0000, '만'], [1, '']];
  let rest = Math.round(n), s = '';
  for (const [u, label] of units) { const q = Math.floor(rest / u); if (q > 0) { s += q.toLocaleString('ko-KR') + label + ' '; rest -= q * u; } }
  return s.trim() + '원';
}

const BURDEN_QS = [
  {
    id: 'propertyValue', section: '대상 부동산',
    q: '자녀(또는 배우자)에게 물려줄 부동산의 현재 시세는? (원)',
    sub: '지금 팔면 받을 수 있는 시가(실거래가 수준)입니다. 부담부증여는 이 가액을 기준으로 증여세·양도세·취득세를 계산합니다.',
    numeric: true, money: true, placeholder: '예: 1,500,000,000',
  },
  {
    id: 'assetType', section: '대상 부동산',
    q: '어떤 종류의 부동산인가요?',
    sub: '주택이 아니면(토지·상가) 1세대1주택 양도세 비과세가 적용되지 않아 채무 인수분 양도세가 크게 달라집니다(소법 §89①3호).',
    opts: [['house', '주택 (아파트·빌라·단독)', ''], ['officetel', '오피스텔', '주거용이면 주택 취급'], ['land', '토지', '비과세 없음'], ['commercial', '상가·건물', '비과세 없음']],
  },
  {
    id: 'acquisitionPrice', section: '대상 부동산',
    q: '증여하는 분(예: 부모님)이 그 집을 살 때 얼마였나요? (취득가, 원)',
    sub: '부담부증여에서 「채무 인수분」은 유상양도로 보아 증여자에게 양도세가 나옵니다. 그 양도세 계산에 취득가가 꼭 필요합니다.',
    numeric: true, money: true, placeholder: '예: 400,000,000',
  },
  {
    id: 'holdingYears', section: '증여하는 분',
    q: '그 부동산을 보유한 지 몇 년 됐나요?',
    sub: '채무 인수분(유상양도)의 양도세에 가장 중요합니다 — 오래 보유했을수록 장기보유특별공제로 양도세가 줄어, 최적 채무비율이 달라집니다.',
    numeric: true, placeholder: '예: 10',
  },
  {
    id: 'donorHouseCount', section: '증여하는 분',
    q: '증여하는 분이 이 부동산 외에 보유한 주택은 몇 채인가요?',
    sub: '채무 인수분(유상양도)의 양도세는 증여자의 보유 주택 수에 좌우됩니다 — 1주택이면 비과세 가능하지만, 다주택이면 비과세 배제·중과로 절세 효과가 크게 줄거나 사라집니다(소법 §89·§104⑦).',
    opts: [['0', '이 부동산이 유일 (다른 주택 없음)', '1세대1주택 비과세 가능'], ['1', '1채 더 있음 (총 2주택)', '비과세 배제 가능'], ['2', '2채 이상 더 (총 3주택+)', '중과 가능']],
  },
  {
    id: 'recipient', section: '받는 사람',
    q: '누구에게 넘기려 하나요?',
    sub: '받는 사람에 따라 증여재산공제·세율이 달라집니다. 미성년 자녀는 증여공제가 5천만 → 2천만으로 줄어듭니다.',
    opts: [['child_adult', '자녀에게 (성년)', '만 19세 이상'], ['child_minor', '자녀에게 (미성년)', '만 19세 미만'], ['spouse', '배우자에게', '']],
  },
  {
    id: 'adjustedZone', section: '대상 부동산',
    q: '그 부동산이 조정대상지역에 있나요?',
    sub: '조정대상지역이면 채무 인수분 양도세 중과·증여 취득세 중과가 적용될 수 있어 최적 비율이 달라집니다. 모르면 「아니오」로 두고 상담에서 확인하세요.',
    opts: [['yes', '네, 조정대상지역', '중과 가능 — 상담 확인'], ['no', '아니오 / 모름', '비조정 가정']],
  },
  {
    id: 'context', section: '추가 사항',
    q: '추가로 알려주실 내용이 있나요? (선택)',
    sub: '증여자의 보유 주택 수, 채무(전세보증금·대출)의 실제 존재 여부·금액, 자녀의 상환 능력 등 — 실제 판단에 중요합니다(상담에서 반영).',
    freeform: true, optional: true, placeholder: '예: 아버지 2주택 / 전세보증금 8억 있음 / 자녀 소득 있음',
  },
];

async function callOptimizeEng(body) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  const delays = [1000, 2000, 3000, 4000, 6000, 8000, 10000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const to = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
      const res = await fetch(base + '/v1/calc/optimize-burdened-gift', {
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

// 상담 리드캡처(세무사=오너에게 전달) — 풀 디테일 포함 가능(유자격)
function buildBurdenDetail(answers, calc) {
  const L = ['■ 고객 입력 정보'];
  BURDEN_QS.forEach(q => {
    const val = answers[q.id];
    if (val === undefined || val === null || val === '') return;
    let v = val;
    if (q.opts) { const o = q.opts.find(x => x[0] === val); if (o) v = o[1]; }
    else if (q.numeric && q.money) v = bgWon(Number(val));
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('  · ' + ql + ': ' + v);
  });
  if (calc.precise) {
    L.push('', '■ 부담부증여 최적화 (검증 엔진)');
    L.push('  · 단순증여(채무 0) 총세금: ' + bgWon(calc.noDebt));
    L.push('  · 이론적 최저 총세금: ' + bgWon(calc.optTotal) + ' (이론적 최적채무비율 ' + Math.round((calc.optRatio || 0) * 100) + '%)');
    L.push('  · 최대 절세 여력: ' + bgWon(calc.savings));
    if (Array.isArray(calc.sims)) {
      L.push('  · 채무비율별 총세금:');
      calc.sims.filter(p => [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].some(r => Math.abs(p['채무비율'] - r) < 0.001))
        .forEach(p => L.push('     - ' + Math.round(p['채무비율'] * 100) + '%: ' + bgWon(p['총세부담'])
          + ' (증여 ' + bgWon(p['증여세']) + '·양도 ' + bgWon(p['양도세']) + '·취득 ' + bgWon(p['취득세']) + ')'));
    }
    L.push('', '⚠️ 이론적 최저비율은 부당행위계산부인·실질과세 위험이 크므로 그대로 실행 금지. 안전한 실행 비율은 세무사 검토 필요.');
    if (Array.isArray(calc.warnings)) calc.warnings.forEach(w => L.push('  · ' + w));
  }
  return L.join('\n');
}
function buildBurdenKakao(answers, calc) {
  const L = ['[JT택스랩 부담부증여 최적화 — 상담 요청]', '', '▶ 입력'];
  L.push('· 부동산 시가: ' + bgWon(Number(answers.propertyValue) || 0));
  L.push('· 증여자 취득가: ' + bgWon(Number(answers.acquisitionPrice) || 0));
  L.push('· 받는 사람: ' + (answers.recipient === 'spouse' ? '배우자' : '자녀'));
  if (calc.precise) {
    L.push('', '▶ 결과(요약)');
    L.push('· 단순증여 총세금: ' + bgWon(calc.noDebt));
    L.push('· 최대 절세 여력: ' + bgWon(calc.savings));
  }
  L.push('', '부담부증여로 안전하게 절세할 수 있는지 상담받고 싶습니다.');
  return L.join('\n');
}

function JTReportBurden({ setRoute, onBack }) {
  const [step, setStep] = useBgState(0);
  const [answers, setAnswers] = useBgState({});
  const [loading, setLoading] = useBgState(false);
  const [report, setReport] = useBgState(null);
  const [err, setErr] = useBgState(null);

  React.useEffect(() => {
    const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';
    if (base) { fetch(base + '/health', { method: 'GET' }).catch(function () {}); }
  }, []);

  const total = BURDEN_QS.length;
  const safeStep = Math.min(step, total - 1);
  const cur = BURDEN_QS[safeStep];
  const isLast = safeStep === total - 1;
  const setAns = (id, v) => setAnswers(a => ({ ...a, [id]: v }));

  const canNext = () => {
    if (!cur) return false;
    if (cur.freeform) return true;
    if (cur.numeric) {
      if (cur.optional) return true;
      const raw = answers[cur.id];
      if (raw === '' || raw === undefined || raw === null) return false;
      const v = Number(raw);
      return !isNaN(v) && v > 0;
    }
    return !!answers[cur.id];
  };

  const runAnalysis = async () => {
    setLoading(true); setErr(null);
    try {
      const clamp = (x) => Math.max(0, Math.round(Number(x) || 0));
      if (clamp(answers.propertyValue) <= 0) { setErr('부동산 시세를 입력해 주세요.'); setLoading(false); return; }
      if (clamp(answers.acquisitionPrice) <= 0) { setErr('증여자의 취득가를 입력해 주세요.'); setLoading(false); return; }
      // 수정 260628(BURDEN-R2-01): 자산유형 매핑(주택 외 토지·상가는 §89 비과세 배제). (BURDEN-R2-02): 증여자 보유 주택수 전송(다주택 비과세 배제·중과 — 엔진 optimize_burdened_gift donor param 노출 필요).
      const assetTypeMap = { house: '주택', officetel: '오피스텔', land: '토지', commercial: '상가' };
      const body = {
        property_value: clamp(answers.propertyValue),
        acquisition_price: clamp(answers.acquisitionPrice),
        relationship: answers.recipient === 'spouse' ? '배우자' : '직계존속',
        donee_age: answers.recipient === 'child_minor' ? 10 : 30,
        is_regulated_area: answers.adjustedZone === 'yes',
        property_type: assetTypeMap[answers.assetType] || '주택',
        donor_other_house_count: Number(answers.donorHouseCount) || 0,
      };
      // 보유연수 → 취득일 (채무 인수분 양도세의 장특공제·단기세율). 수정 260628(BURDEN-R2-04): 월감산 롤오버/로컬타임존 경계오차 → 연감산으로 정수 경계 안정화.
      const hyRaw = Math.min(100, Math.max(0, Number(answers.holdingYears) || 0));
      if (hyRaw > 0) {
        const d = new Date(); d.setFullYear(d.getFullYear() - Math.round(hyRaw));
        const pad = (x) => String(x).padStart(2, '0');
        body.acquisition_date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      }

      let calc = { precise: false };
      try {
        const j = await callOptimizeEng(body);
        const c = j && j.calc;
        if (c && Array.isArray(c['시뮬레이션결과']) && c['시뮬레이션결과'].length && (c['채무없는경우세액'] || 0) > 0) {
          calc.noDebt = c['채무없는경우세액'] || 0;
          calc.optTotal = c['최적총세부담'] || 0;   // 🔒 상담 리드캡처에만
          calc.optRatio = c['최적채무비율'] || 0;    // 🔒 상담 리드캡처에만
          calc.savings = c['절세액'] || 0;
          calc.sims = c['시뮬레이션결과'];
          calc.warnings = c['경고사항'] || [];
          calc.precise = true;
          calc.engineVer = j.version && j.version.engine;
        }
      } catch (e) { console.warn('부담부증여 최적화 엔진 연결 실패', e); calc.engineErr = true; }

      setReport({ calc });
    } catch (e) { console.error(e); setErr(e.message || '계산 중 오류가 발생했습니다.'); }
    finally { setLoading(false); }
  };

  const goNext = () => { if (isLast) runAnalysis(); else setStep(s => s + 1); };
  const goPrev = () => { if (safeStep > 0) setStep(s => s - 1); else onBack(); };

  if (loading) {
    return (
      <div className="jt-container">
        <JTReportShell title="부담부증여 최적화" subtitle="채무비율별 세금을 시뮬레이션 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="LIVE">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />채무비율 0~100%의 총세금(증여세+양도세+취득세)을 모두 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc } = report;
    // 무료 티저용 하강 추세점 (0·20·40%만 — 최적/최저 구간은 노출하지 않음)
    const pick = (r) => (calc.sims || []).find(p => Math.abs(p['채무비율'] - r) < 0.001);
    const teaser = [0, 0.2, 0.4].map(pick).filter(Boolean);
    const baseMax = calc.noDebt || (teaser[0] && teaser[0]['총세부담']) || 1;
    return (
      <div className="jt-container">
        <JTReportShell title="부담부증여 최적화 결과" subtitle="채무를 끼울 때 절세 여력 (세액 기준)" stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
          {!calc.precise ? (
            <div style={{ background: '#fdeeec', borderLeft: '4px solid #c0392b', padding: '14px 18px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6 }}>
              <strong>정밀 계산이 필요합니다.</strong> 정밀 엔진 연결이 지연됐습니다. 잘못된 세액을 안내하지 않기 위해 결과를 표시하지 않았어요. 잠시 후 다시 시도하거나 상담을 권합니다.
              <div style={{ marginTop: 8 }}><button className="jt-btn jt-btn--ghost" onClick={() => runAnalysis()}>정밀 계산 다시 시도 →</button></div>
            </div>
          ) : (
            <>
              {/* 헤드라인 — 절세 「여력(금액)」만. 최적 비율은 억제(상담) */}
              <div className="jt-report-result__grade jt-grade-mid">
                <div className="jt-report-result__grade-label">부담부증여로 줄일 수 있는 세금 (여력)</div>
                <div style={{ fontSize: 30, fontWeight: 800, marginTop: 8, color: '#2a6d4f' }}>최대 {bgWon(calc.savings)}</div>
                <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.65 }}>
                  그냥 증여하면 총세금이 <strong>{bgWon(calc.noDebt)}</strong>입니다. 부동산에 딸린 <strong>채무(전세보증금·대출)</strong>를 함께 넘기는 「부담부증여」로 채무 비율을 잘 정하면, 위 금액만큼 세금을 줄일 여지가 있습니다.
                </div>
              </div>

              {/* 무료 티저 — 채무를 끼울수록 세금이 내려가는 추세(0·20·40%) */}
              <section className="jt-report-result__section">
                <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: 14 }}>채무를 끼울수록 총세금이 내려갑니다</p>
                {teaser.map((p, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                      <span>채무 {Math.round(p['채무비율'] * 100)}%{i === 0 ? ' (그냥 증여)' : ''}</span>
                      <strong>{bgWon(p['총세부담'])}</strong>
                    </div>
                    <div style={{ background: '#eee', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                      <div style={{ width: Math.max(6, Math.round((p['총세부담'] / baseMax) * 100)) + '%', height: '100%', background: 'linear-gradient(90deg,#2a6d4f,#3d9970)' }} />
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 8, padding: '10px 12px', background: '#f7f5f0', border: '1px dashed rgba(0,0,0,.25)', borderRadius: 8, fontSize: 13, lineHeight: 1.6, textAlign: 'center' }}>
                  🔒 더 줄일 수 있지만, <strong>「안전하게 절세되는 정확한 채무비율」</strong>은 상담에서 확인하세요. 무작정 채무를 많이 끼우면 오히려 세금이 다시 늘고(아래 ⚠️), 부당행위로 부인될 수 있습니다.
                </div>
              </section>

              {/* §47③ 안전경고 — 필수 노출 (엔진 경고) */}
              {Array.isArray(calc.warnings) && calc.warnings.length > 0 && (
                <section className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '14px 18px' }}>
                  <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 14, color: '#8a6d3b' }}>⚠️ 부담부증여, 이건 꼭 아셔야 합니다</p>
                  {calc.warnings.map((w, i) => (
                    <p key={i} style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.6, color: '#6b5524' }}>· {String(w).replace(/최적\s*채무\s*비율\s*\(?\s*\d+(?:\.\d+)?\s*%\s*\)?/g, '이론적 최저 채무비율')}</p>
                  ))}
                </section>
              )}

              {/* 🔒 프리미엄 게이트 (옵션 B) */}
              <section className="jt-report-result__section" style={{ background: '#f7f5f0', border: '1px dashed rgba(0,0,0,.25)', borderRadius: 12, padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>🔒</div>
                <p style={{ margin: '0 0 12px', fontWeight: 800, fontSize: 16 }}>안전하게 절세하는 「실행 설계」는 상담에서</p>
                <ul style={{ margin: '0 auto 14px', padding: 0, listStyle: 'none', lineHeight: 1.95, fontSize: 14, maxWidth: 480, textAlign: 'left', display: 'inline-block' }}>
                  <li>🔹 <strong>안전한 최적 채무비율</strong> — 부당행위로 부인되지 않으면서 절세되는 실제 비율</li>
                  <li>🔹 <strong>채무 객관적 입증 방법</strong> — 전세·대출이 인정받는 요건(§47③)</li>
                  <li>🔹 <strong>증여자 다주택 여부 반영</strong> — 채무 인수분 양도세가 달라져 최적이 바뀝니다</li>
                </ul>
                <p style={{ margin: 0, fontSize: 13.5, color: '#5a5a5a', lineHeight: 1.65 }}>이 셋은 사례마다 답이 달라 자동 계산만으론 위험합니다.<br/><strong>국세청 출신 세무사가 직접 설계</strong>해 드립니다 — 첫 상담 무료.</p>
              </section>

              <section className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '16px 18px' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 800, fontSize: 15 }}>그래서 채무를 얼마나 끼워야 하나요?</p>
                <p style={{ margin: '0 0 12px', lineHeight: 1.7 }}>세금만 보면 채무를 많이 끼울수록 좋아 보이지만, <strong>일정 비율을 넘으면 부당행위계산부인·실질과세로 절세가 통째로 사라지고 가산세</strong>까지 붙습니다. 또 증여자가 다주택이면 양도세가 달라져 최적이 바뀝니다. 위 「절세 여력」은 <strong>출발점</strong>이고, <strong>안전하면서 절세되는 실제 비율과 실행 순서는 국세청 출신 세무사가 직접 설계</strong>해 드립니다.</p>
              </section>

              {calc.precise && typeof JTReportConvert === 'function' && (
                <JTReportConvert
                  reportType="부담부증여 최적화"
                  reportTag="LEGACY"
                  reportSummary={`단순증여 ${bgWon(calc.noDebt)} · 최대 절세 여력 ${bgWon(calc.savings)}`}
                  reportDetail={buildBurdenDetail(answers, calc)}
                  kakaoSummary={buildBurdenKakao(answers, calc)}
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
      <JTReportShell title="부담부증여 최적화" subtitle="자녀·배우자에게 부동산을 증여할 때, 채무를 얼마나 끼우면 세금이 줄어드는지 계산합니다." stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="LIVE">
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
                <div style={{ fontSize: 14, color: 'var(--accent,#2a6d4f)', marginTop: 6 }}>= {bgKorean(Number(answers[cur.id]))}</div>
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
              {isLast ? '절세 여력 계산하기 →' : '다음 →'}
            </button>
          </div>
        </div>
      </JTReportShell>
    </div>
  );
}
window.JTReportBurden = JTReportBurden;

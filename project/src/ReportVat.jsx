/* @jsx React.createElement */
/* 부가가치세 계산기 — 일반/간이/면세 → 검증 엔진 /v1/calc/vat
   (부가법 §30 매출세액 10%·§37 매입세액·§46 신용카드공제 1.3%·§63 간이 부가가치율 15~40%).
   일반=매출세액−매입세액−공제 / 간이=공급대가×부가율×10%−공제(환급없음) / 면세=면제(§26).
   납부세액은 신고금액이라 원 단위 정밀 표시(vatWon). 엔진 다운 시 잘못된 세액을 만들지 않고 '정밀 계산 필요'로 안내.
   공통 헬퍼(formatWon·JTReportShell·JTReportConvert·acqKoreanAmount)는 먼저 로드된 파일의 전역 사용. */

const { useState: useVatState } = React;

// 원 단위 정확 표시 (formatWon은 만원 절사 → 신고금액엔 부적합)
function vatWon(n) {
  if (n === null || n === undefined || isNaN(n)) return '0원';
  return Math.round(n).toLocaleString('ko-KR') + '원';
}
function vatKorean(n) {
  if (typeof acqKoreanAmount === 'function') return acqKoreanAmount(n);
  if (!n || n <= 0) return '';
  const units = [[1_0000_0000_0000, '조'], [1_0000_0000, '억'], [1_0000, '만'], [1, '']];
  let rest = Math.round(n), s = '';
  for (const [u, label] of units) { const q = Math.floor(rest / u); if (q > 0) { s += q.toLocaleString('ko-KR') + label + ' '; rest -= q * u; } }
  return s.trim() + '원';
}

// 신고기한 안내 (부가법 §49①/§48/§66)
const VAT_DEADLINE = {
  '1기_확정': '7월 25일',
  '2기_확정': '다음 해 1월 25일',
  '간이과세_확정': '다음 해 1월 25일',
};

const VAT_QS = [
  {
    id: 'businessType', section: '사업자 유형',
    q: '어떤 부가가치세 사업자인가요?',
    sub: '사업자등록증에 적혀 있어요. 헷갈리면 연 매출 1억 400만원 미만이면 보통 간이과세자, 그 이상이면 일반과세자입니다. 농수산물·병의원·학원 등은 면세사업자.',
    opts: [
      ['일반과세자', '일반과세자', '매출세액 10% − 매입세액'],
      ['간이과세자', '간이과세자', '연 매출 1억 400만원 미만 소규모'],
      ['면세사업자', '면세사업자', '농축수산물·병의원·학원 등 부가세 면제'],
    ],
  },
  {
    id: 'isCorporate', section: '사업자 유형',
    q: '개인사업자인가요, 법인인가요?',
    sub: '신용카드·현금영수증 매출세액공제(1.3%)는 개인사업자만 받습니다(부가법 §46). 법인은 해당 없음.',
    opts: [['no', '개인사업자', '신용카드공제 가능'], ['yes', '법인', '']],
    showIf: (a) => a.businessType === '일반과세자',
  },
  {
    id: 'periodType', section: '과세기간',
    q: '어느 기간을 신고하나요?',
    sub: '부가세는 1년에 두 번 확정신고합니다. 상반기(1~6월)분은 7월 25일까지, 하반기(7~12월)분은 다음 해 1월 25일까지.',
    opts: [
      ['1기_확정', '1기 확정 (1~6월분)', '신고·납부 7/25'],
      ['2기_확정', '2기 확정 (7~12월분)', '신고·납부 다음해 1/25'],
    ],
    showIf: (a) => a.businessType === '일반과세자',
  },
  // ── 일반과세자 ──
  {
    id: 'salesAmount', section: '매출', tier: 'core',
    q: '이 기간 매출(공급가액)은 얼마인가요? (원)',
    sub: '세금계산서·신용카드·현금영수증·현금으로 판 금액의 합계예요. 부가세 별도 금액(공급가액)으로 넣어 주세요. 부가세 포함 총액만 안다면 1.1로 나눈 값을 넣으면 됩니다.',
    numeric: true, money: true,
    showIf: (a) => a.businessType === '일반과세자',
    placeholder: '예: 100,000,000',
  },
  {
    id: 'purchaseAmount', section: '매입', tier: 'core',
    q: '사업 관련 매입(공급가액)은 얼마인가요? (원)',
    sub: '세금계산서·사업용 신용카드로 산 사업 경비(부가세 별도). 이 금액의 10%를 매입세액으로 돌려받아 낼 세금이 줄어요. 인건비·면세 농수산물처럼 부가세 없는 매입은 빼고 넣으세요. 모르면 0.',
    numeric: true, money: true, optional: true,
    showIf: (a) => a.businessType === '일반과세자',
    placeholder: '예: 60,000,000 (없으면 0)',
  },
  // ── 간이과세자 ──
  {
    id: 'simplifiedSector', section: '업종',
    q: '어떤 업종인가요?',
    sub: '간이과세자는 업종별 「부가가치율」(15~40%)로 세금을 계산합니다(부가법 §63②). 가장 가까운 업종을 골라 주세요.',
    opts: [
      ['도소매업', '소매·도매업 (15%)', ''],
      ['음식점업', '음식점업 (15%)', ''],
      ['제조업', '제조·농림어업·소화물운송 (20%)', ''],
      ['숙박업', '숙박업 (25%)', ''],
      ['기타서비스업', '건설·운수창고·정보통신·기타서비스업 (30%)', ''],
      ['부동산임대업', '금융·보험·전문서비스·부동산임대업 (40%)', ''],
    ],
    showIf: (a) => a.businessType === '간이과세자',
  },
  {
    id: 'supplyPrice', section: '매출',
    q: '1년 매출(공급대가)은 얼마인가요? (원)',
    sub: '간이과세자는 1년치 매출을 한 번에 신고합니다. 부가세를 포함한 1년 총매출(공급대가)을 넣어 주세요.',
    numeric: true, money: true,
    showIf: (a) => a.businessType === '간이과세자',
    placeholder: '예: 50,000,000',
  },
  {
    id: 'simplifiedInput', section: '공제',
    q: '세금계산서 받은 매입(공급대가)은? (원)',
    sub: '간이과세자는 세금계산서를 받은 매입액(부가세 포함)의 0.5%를 세액공제받습니다. 카드·세금계산서로 산 사업 매입액을 넣어 주세요. 없으면 0.',
    numeric: true, money: true, optional: true,
    showIf: (a) => a.businessType === '간이과세자',
    placeholder: '예: 20,000,000 (없으면 0)',
  },
  // ── 공통 (개인 일반 + 간이) ──
  {
    id: 'priorSupplyOver10', section: '공제',
    q: '직전 연도 공급가액(사업장 기준)이 10억원을 초과하나요?',
    sub: '개인 일반과세자는 직전 연도 공급가액이 10억원을 초과하면 신용카드 매출세액공제 대상에서 제외됩니다(부가법 §46①1호가목·시행령 §88③ 사업장 기준). 간이과세자는 해당 없음.',
    showIf: (a) => a.businessType === '일반과세자' && a.isCorporate !== 'yes',
    opts: [['no', '아니오 (10억원 이하)', '카드공제 대상'], ['yes', '네, 10억원 초과', '카드공제 제외']],
  },
  {
    id: 'creditCardSales', section: '공제',
    q: '신용카드·현금영수증 매출은 얼마인가요? (원)',
    sub: '개인사업자(일반·간이 모두)는 카드·현금영수증 매출의 1.3%(2026.12.31까지, 2027.1.1부터 1%)를 세액공제받습니다(부가법 §46, 한도 연 1천만원·2027.1.1부터 500만원). 법인·직전연도 공급가액 10억원 초과 개인(사업장 기준)은 제외돼요. 전체 매출 중 카드/현금영수증 비중을 넣어 주세요. 없으면 0.',
    numeric: true, money: true, optional: true,
    showIf: (a) => (a.businessType === '일반과세자' && a.isCorporate !== 'yes' && a.priorSupplyOver10 !== 'yes') || a.businessType === '간이과세자',   // 수정 260628(VAT-R2-06): 10억 초과 개인 카드공제 제외(§46①1가)
    placeholder: '예: 50,000,000 (없으면 0)',
  },
  // ── 공통 ──
  {
    id: 'context', section: '추가 사항',
    q: '추가로 알려주실 내용이 있나요? (선택)',
    sub: '수출(영세율)·면세 농수산물 구입(의제매입공제)·전자세금계산서 발급·예정고지 납부분 등이 있으면 적어 주세요(이 항목들은 본 계산에 미반영 — 상담에서 정확히 반영).',
    freeform: true, optional: true,
    showIf: (a) => a.businessType !== '면세사업자',
    placeholder: '예: 수출 매출 3천만 / 면세 농산물 매입 2천만 / 예정고지 50만 납부',
  },
];

async function callVatEng(body) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  const delays = [1000, 2000, 4000, 8000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const to = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
      const res = await fetch(base + '/v1/calc/vat', {
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

function buildVatDetail(answers, calc) {
  const L = ['■ 고객 입력 정보'];
  VAT_QS.forEach(q => {
    if (q.showIf && !q.showIf(answers)) return;
    const val = answers[q.id];
    if (val === undefined || val === null || val === '') return;
    let v = val;
    if (q.opts) { const o = q.opts.find(x => x[0] === val); if (o) v = o[1]; }
    else if (q.numeric && q.money) v = vatWon(Number(val));
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('  · ' + ql + ': ' + v);
  });
  if (calc.precise && !calc.isExempt) {
    L.push('', '■ 계산 결과 (검증 엔진)');
    const d = calc.detail || {};
    if (d['매출세액']) L.push('  · 매출세액: ' + vatWon(d['매출세액']));
    if (d['매입세액']) L.push('  · 매입세액: ' + vatWon(d['매입세액']));
    if (d['신용카드공제']) L.push('  · 신용카드공제: ' + vatWon(d['신용카드공제']));
    if (d['간이매입공제']) L.push('  · 간이매입공제: ' + vatWon(d['간이매입공제']));
    if (d['부가가치율'] && d['부가가치율'] !== '-') L.push('  · 부가가치율: ' + d['부가가치율']);
    L.push(calc.isRefund ? '  · 예상 환급세액: ' + vatWon(calc.refund) : '  · 예상 납부세액: ' + vatWon(calc.netTax));
    (calc.steps || []).forEach(s => { if (s && s.항목) L.push('    - ' + s.항목 + ': ' + (typeof s.금액 === 'number' ? vatWon(s.금액) : s.금액) + (s.조문 ? ' [' + s.조문 + ']' : '')); });
  }
  return L.join('\n');
}

function buildVatKakao(answers, calc) {
  const L = ['[JT택스랩 부가가치세 계산 — 상담 요청]', '', '▶ 입력'];
  L.push('· 사업자 유형: ' + (answers.businessType || '일반과세자'));
  if (answers.businessType === '간이과세자') L.push('· 1년 공급대가: ' + vatWon(Number(answers.supplyPrice) || 0));
  else if (answers.businessType === '일반과세자') {
    L.push('· 매출(공급가액): ' + vatWon(Number(answers.salesAmount) || 0));
    L.push('· 매입(공급가액): ' + vatWon(Number(answers.purchaseAmount) || 0));
  }
  if (calc.precise) {
    L.push('', '▶ 결과(추정)');
    if (calc.isExempt) L.push('· 면세사업자 — 부가세 면제');
    else L.push(calc.isRefund ? '· 예상 환급세액: ' + vatWon(calc.refund) : '· 예상 납부세액: ' + vatWon(calc.netTax));
  }
  L.push('', '상담 부탁드립니다.');
  return L.join('\n');
}

function JTReportVat({ setRoute, onBack }) {
  const [step, setStep] = useVatState(0);
  const [answers, setAnswers] = useVatState({});
  const [loading, setLoading] = useVatState(false);
  const [report, setReport] = useVatState(null);
  const [err, setErr] = useVatState(null);

  React.useEffect(() => {
    const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';
    if (base) { fetch(base + '/health', { method: 'GET' }).catch(function () {}); }
  }, []);

  const visibleQs = VAT_QS.filter(q => !q.showIf || q.showIf(answers));
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
      const clamp = (x) => Math.max(0, Math.round(Number(x) || 0));
      const bt = answers.businessType || '일반과세자';
      const isCorp = answers.isCorporate === 'yes';

      if (bt !== '면세사업자') {
        const anySales = clamp(answers.salesAmount) + clamp(answers.supplyPrice) + clamp(answers.purchaseAmount);
        if (anySales <= 0) { setErr('매출 금액을 입력해 주세요.'); setLoading(false); return; }
      }
      // P1-3(코덱스): 신용카드·현금영수증 매출(§46 공급대가=부가세 포함)은 전체 매출을 넘을 수 없음 — 엔진 422 전에 안내
      const _card = clamp(answers.creditCardSales);
      if (_card > 0) {
        if (bt === '일반과세자' && _card > Math.round((clamp(answers.salesAmount) + clamp(answers.exportSales)) * 1.1)) {
          setErr('신용카드·현금영수증 매출(부가세 포함)이 전체 매출을 초과합니다. 카드매출은 매출 공급가액의 약 1.1배 이하로 입력해 주세요.'); setLoading(false); return;
        }
        if (bt === '간이과세자' && clamp(answers.supplyPrice) > 0 && _card > clamp(answers.supplyPrice)) {
          setErr('신용카드 매출이 연간 공급대가를 초과합니다.'); setLoading(false); return;
        }
      }

      const purchaseAmt = clamp(answers.purchaseAmount);
      const body = {
        business_type: bt,
        is_corporate: isCorp,
        period_type: bt === '간이과세자' ? '간이과세_확정' : (answers.periodType || '1기_확정'),
        sales_amount: clamp(answers.salesAmount),
        purchase_amount: purchaseAmt,
        purchase_vat_paid: Math.round(purchaseAmt * 0.1),   // 매입세액 = 과세 매입액 × 10%
        credit_card_sales: ((bt === '일반과세자' && !isCorp && answers.priorSupplyOver10 !== 'yes') || bt === '간이과세자') ? clamp(answers.creditCardSales) : 0,   // §46 신용카드 공제 — 개인 일반(직전 공급가 10억↓) + 간이 대상. 수정 260628(VAT-R2-06)
        sales_supply_price: clamp(answers.supplyPrice),
        simplified_value_sector: answers.simplifiedSector || '도소매업',
        simplified_input_supply: clamp(answers.simplifiedInput),
      };

      let calc = { precise: false };
      try {
        const j = await callVatEng(body);
        const c = j && j.calc;
        // 수정 260628(VAT-R2-01): 엔진 오류바디/부분응답을 precise로 신뢰하지 않음(납부세액0 거짓표시 방지).
        if (c && !c['오류'] && (c['납부세액'] != null || c['환급세액'] != null || c['비과세여부'])) {
          calc.businessType = c['사업자유형'];
          calc.netTax = c['납부세액'] || 0;
          calc.isRefund = !!c['환급여부'];
          calc.refund = c['환급세액'] || 0;
          calc.isExempt = !!c['비과세여부'];
          calc.exemptReason = c['비과세사유'] || '';
          calc.detail = c['주요내역'] || {};
          calc.penaltyInfo = c['가산세_안내'] || null;
          calc.steps = c['단계별계산'] || [];
          calc.engineWarnings = c['경고사항'] || [];
          calc.periodType = body.period_type;
          calc.precise = true;
          calc.engineVer = j.version && j.version.engine;
          // §69 간이과세자 납부의무 면제. 수정 260628(VAT-R2-03): 프론트 독자 판정 제거 — 엔진 납부세액 0 신호로만 면제 라벨(§64 재고납부세액이 있으면 netTax>0 → 면제 제외·실액 표시, §69① 단서 준수).
          calc.simplifiedExempt = (calc.netTax === 0 && answers.businessType === '간이과세자' && clamp(answers.supplyPrice) > 0 && clamp(answers.supplyPrice) < 48000000);
        }
      } catch (e) { console.warn('부가세 엔진 연결 실패', e); calc.engineErr = true; }

      setReport({ calc });
    } catch (e) { console.error(e); setErr(e.message || '계산 중 오류가 발생했습니다.'); }
    finally { setLoading(false); }
  };

  const goNext = () => { if (isLast) runAnalysis(); else setStep(s => s + 1); };
  const goPrev = () => { if (safeStep > 0) setStep(s => s - 1); else onBack(); };

  if (loading) {
    return (
      <div className="jt-container">
        <JTReportShell title="부가가치세 계산기" subtitle="검증 엔진으로 계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="BOOKKEEPING">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />매출세액에서 매입세액·공제를 빼 부가가치세를 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc } = report;
    const d = calc.detail || {};
    const deadline = VAT_DEADLINE[calc.periodType] || '각 과세기간 종료 후 25일 이내';
    return (
      <div className="jt-container">
        <JTReportShell title="부가가치세 계산 결과" subtitle="매출세액 − 매입세액 − 공제" stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="BOOKKEEPING">
          {!calc.precise ? (
            <div style={{ background: '#fdeeec', borderLeft: '4px solid #c0392b', padding: '14px 18px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6 }}>
              <strong>정밀 계산이 필요합니다.</strong> 정밀 엔진 연결이 지연됐습니다. 잘못된 세액을 안내하지 않기 위해 결과를 표시하지 않았어요. 잠시 후 다시 시도하거나 상담을 권합니다.
              <div style={{ marginTop: 8 }}><button className="jt-btn jt-btn--ghost" onClick={() => runAnalysis()}>정밀 계산 다시 시도 →</button></div>
            </div>
          ) : calc.isExempt ? (
            <>
              <div className="jt-report-result__grade jt-grade-good">
                <div className="jt-report-result__grade-label">부가가치세 면제</div>
                <div className="jt-report-result__grade-val" style={{ fontSize: 28 }}>면세사업자</div>
                <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, opacity: 0.9 }}>{calc.exemptReason || '면세사업자는 부가가치세 납부의무가 없습니다(부가법 §26).'} 다만 매년 2월 10일까지 <strong>사업장현황신고</strong>는 해야 하며, 면세 매입분의 매입세액은 환급되지 않습니다.</div>
              </div>
              {typeof JTReportConvert === 'function' && (
                <JTReportConvert reportType="부가가치세 계산" reportTag="BOOKKEEPING"
                  reportSummary="면세사업자 — 부가세 면제"
                  reportDetail={buildVatDetail(answers, calc)} kakaoSummary={buildVatKakao(answers, calc)} setRoute={setRoute} />
              )}
              <div className="jt-report-q__nav" style={{ marginTop: 16 }}>
                <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setStep(0); setAnswers({}); }}>처음부터 다시</button>
                <button className="jt-btn jt-btn--ghost" onClick={onBack}>← 세금 계산기</button>
              </div>
            </>
          ) : (
            <>
              <div className={'jt-report-result__grade ' + ((calc.isRefund || calc.simplifiedExempt) ? 'jt-grade-good' : 'jt-grade-mid')}>
                <div className="jt-report-result__grade-label">{calc.simplifiedExempt ? '납부의무 면제 (간이과세자)' : ((calc.isRefund ? '예상 환급세액' : '예상 납부세액') + ' (' + calc.businessType + ')')}</div>
                <div className="jt-report-result__grade-val">{vatWon(calc.isRefund ? calc.refund : calc.netTax)}</div>
                {calc.simplifiedExempt ? (
                  <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.6 }}>1년 공급대가가 <strong>4,800만원 미만</strong>이라 부가가치세 <strong>납부의무가 면제</strong>됩니다(부가법 §69). <strong>신고는 해야 하지만 낼 세금은 0원</strong>이에요. 신고·납부 기한은 <strong>{deadline}</strong>.</div>
                ) : (
                  <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, opacity: 0.85 }}>{vatKorean(calc.isRefund ? calc.refund : calc.netTax)} · 신고·납부 기한 <strong>{deadline}</strong></div>
                )}
                <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, color: '#b8860b' }}>※ 입력하신 매출·매입 기준 추정입니다. 의제매입·영세율·전자세금계산서 공제, 예정고지 납부분은 미반영이라 실제와 다를 수 있어요.</div>
              </div>

              <section className="jt-report-result__section">
                <h3>계산 내역</h3>
                <table className="jt-report-calc">
                  <tbody>
                    {d['부가가치율'] && d['부가가치율'] !== '-' && (
                      <tr><th>부가가치율 (간이 업종)</th><td>{d['부가가치율']}</td></tr>
                    )}
                    {!!d['매출세액'] && <tr><th>매출세액 (공급가액 × 10%)</th><td>{vatWon(d['매출세액'])}</td></tr>}
                    {!!d['매입세액'] && <tr><th>(−) 매입세액</th><td>{vatWon(d['매입세액'])}</td></tr>}
                    {!!d['신용카드공제'] && <tr><th>(−) 신용카드·현금영수증 공제</th><td>{vatWon(d['신용카드공제'])}</td></tr>}
                    {!!d['간이매입공제'] && <tr><th>(−) 간이 매입세액공제</th><td>{vatWon(d['간이매입공제'])}</td></tr>}
                    {!!d['의제매입공제'] && <tr><th>(−) 의제매입세액공제</th><td>{vatWon(d['의제매입공제'])}</td></tr>}
                    <tr style={{ background: '#f0f7f3' }}>
                      <th><strong>{calc.isRefund ? '환급세액' : '납부세액'}</strong></th>
                      <td><strong>{vatWon(calc.isRefund ? calc.refund : calc.netTax)}</strong></td>
                    </tr>
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
                          <td>{typeof s.금액 === 'number' ? (s.금액 ? vatWon(s.금액) : (s.비고 || '-')) : (s.금액 || '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              <section className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #b8860b', padding: '14px 18px', borderRadius: 8 }}>
                <p style={{ margin: '0 0 8px', fontWeight: 700 }}>부가세, 이것도 챙기세요 — 더 줄이거나 가산세를 피하는 법</p>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>
                  <li><strong>매입세금계산서를 빠짐없이 챙기세요.</strong> 사업용 매입은 세금계산서·사업용 신용카드로 받아야 매입세액(10%)을 공제받습니다. 간이영수증·인건비는 공제 안 됩니다.</li>
                  <li><strong>신고기한({deadline})을 넘기면 가산세.</strong> 무신고 20%·과소신고 10%·납부지연(미납세액 × 1일 0.022%)이 붙습니다(국기법 §47의2~5).</li>
                  <li><strong>의제매입·신용카드·전자세금계산서 공제</strong>는 요건이 맞으면 세금을 더 줄입니다. 본 계산엔 미반영이니 상담에서 확인하세요.</li>
                  <li><strong>부가세는 「내 돈」이 아닙니다.</strong> 매출 부가세는 고객에게 받아 보관했다 내는 돈이에요. 따로 떼어 두면 신고철에 당황하지 않습니다.</li>
                </ul>
              </section>

              {typeof JTReportConvert === 'function' && (
                <JTReportConvert
                  reportType="부가가치세 계산"
                  reportTag="BOOKKEEPING"
                  reportSummary={`${calc.businessType} · ${calc.isRefund ? '예상 환급 ' + vatWon(calc.refund) : '예상 납부 ' + vatWon(calc.netTax)}`}
                  reportDetail={buildVatDetail(answers, calc)}
                  kakaoSummary={buildVatKakao(answers, calc)}
                  setRoute={setRoute}
                />
              )}

              <div className="jt-report-q__nav" style={{ marginTop: 16 }}>
                <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setStep(0); setAnswers({}); }}>처음부터 다시</button>
                <button className="jt-btn jt-btn--ghost" onClick={onBack}>← 세금 계산기</button>
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
      <JTReportShell title="부가가치세 계산기" subtitle="사업자 유형과 매출·매입만 넣으면 낼 부가세를 바로 계산해요." stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="BOOKKEEPING">
        {err && <div style={{ background: '#fdeeec', borderLeft: '4px solid #c0392b', padding: '12px 16px', marginBottom: 16, borderRadius: 8 }}>{err}</div>}
        <div className="jt-report-q">
          <div className="jt-report-q__section">{cur.section}</div>
          <h2>{cur.q}</h2>
          {cur.sub && <p className="jt-report-q__sub">{cur.sub}</p>}

          {cur.opts && (
            <div className="jt-report-q__opts">
              {cur.opts.map(o => (
                <button key={o[0]} className={'jt-report-q__opt' + (answers[cur.id] === o[0] ? ' is-selected' : '')} onClick={() => { setAns(cur.id, o[0]); }}>
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
                <div style={{ fontSize: 14, color: 'var(--accent,#2a6d4f)', marginTop: 6 }}>= {vatKorean(Number(answers[cur.id]))}</div>
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
              {isLast ? '결과 보기 →' : '다음 →'}
            </button>
          </div>
        </div>
      </JTReportShell>
    </div>
  );
}
window.JTReportVat = JTReportVat;

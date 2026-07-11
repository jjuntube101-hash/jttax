/* @jsx React.createElement */
/* 종합부동산세 계산 — 주택분 (공시합계·공제·공정비율·누진/중과세율·재산세공제·1세대1주택 세액공제)
   엔진: /v1/calc/comprehensive (종부세법 §7~§9). 미응답 시 간이 폴백.
   공통 헬퍼(formatWon·JTReportShell·JTReportConvert)는 먼저 로드된 파일의 전역 사용. */

const { useState: useCompState } = React;

const COMP_CIRCLED = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
function compFmtArticle(s) {
  if (!s) return '';
  return String(s).replace(/SS/g, '§').replace(/\((\d{1,2})\)/g, (m, n) => COMP_CIRCLED[Number(n)] || m);
}
/* 단계별 '비율'(0~1 실수)은 %로, 그 외는 금액(원). */
function compFormatStepValue(name, amount) {
  if (typeof amount !== 'number') return amount;
  if (amount > 0 && amount < 1) return (Math.round(amount * 1000) / 10) + '%';   // 공정비율 0.6 → 60%
  return formatWon(amount);
}

const COMP_QS = [
  {
    id: 'housingCount',
    tier: 'quick',
    section: '주택 보유 현황',
    q: '본인 세대가 보유한 주택은 몇 채인가요?',
    sub: '종합부동산세는 매년 6월 1일 기준, 세대가 보유한 주택의 공시가격을 합산해 공제(1세대1주택 12억·그 외 9억)를 넘는 부분에 부과됩니다(종부세법 §7·§8). 1세대 1주택이면 공제도 크고, 만 60세 이상·5년 이상 보유 시 세액공제까지 받습니다.',
    opts: [
      ['one', '1채 (1세대 1주택)', '공제 12억 · 연령·보유 세액공제'],
      ['two', '2채', '공제 9억 · 일반세율'],
      ['three', '3채 이상', '공제 9억 · 중과세율(12억 초과 구간↑)'],
    ],
  },
  {
    id: 'totalValue',
    tier: 'quick',
    section: '공시가격 합계',
    q: '보유 주택의 공시가격을 모두 더하면 얼마인가요? (원)',
    sub: '실거래가가 아니라 정부가 매년 고시하는 공시가격의 합계입니다. 여러 채면 전부 더해 주세요. 부동산공시가격알리미(realtyprice.kr)에서 조회됩니다. 공제(1세대1주택 12억·그 외 9억) 이하이면 종부세는 0원입니다.',
    numeric: true, money: true,
    placeholder: '예: 1,500,000,000',
  },
  {
    id: 'ownerAge',
    section: '나이 (세액공제)',
    q: '주택 소유자의 나이가 어떻게 되나요? (만 나이)',
    sub: '1세대 1주택자는 만 60세 이상이면 연령별 세액공제를 받습니다(60~65세 20%, 65~70세 30%, 70세 이상 40%, 종부세법 §9⑥). 아래 보유기간 공제와 합쳐 최대 80%까지 공제됩니다. 60세 미만이면 그대로 입력하세요.',
    showIf: (a) => a.housingCount === 'one',
    numeric: true,
    placeholder: '예: 62',
  },
  {
    id: 'holdingYears',
    section: '보유기간 (세액공제)',
    q: '그 주택을 몇 년 보유하셨나요?',
    sub: '1세대 1주택자는 5년 이상 보유하면 보유기간별 세액공제를 받습니다(5~10년 20%, 10~15년 40%, 15년 이상 50%, 종부세법 §9⑧). 위 연령 공제와 합쳐 최대 80%까지 공제됩니다. 5년 미만이면 그대로 입력하세요.',
    showIf: (a) => a.housingCount === 'one',
    numeric: true,
    placeholder: '예: 8',
  },
  {
    id: 'ownership',
    section: '명의 (단독 / 부부 공동)',
    q: '이 주택의 명의는 어떻게 되어 있나요?',
    sub: '부부 공동명의 1주택은 부부가 각자 공제(각 9억, 합 18억)를 받아(종부세법 §8①) 단독명의(12억)보다 유리할 수 있습니다. 다만 1세대1주택 연령·보유 세액공제는 공동명의 1주택자 특례(§10의2) 신청 시 받을 수 있어, 둘 중 유리한 쪽을 자동 비교해 드립니다.',
    showIf: (a) => a.housingCount === 'one',
    opts: [
      ['single', '단독명의', '1세대1주택 공제 12억'],
      ['joint', '부부 공동명의', '각 9억(합 18억) vs 특례 12억 자동 비교'],
    ],
  },
  {
    id: 'ownShare',
    section: '본인 지분율',
    q: '부부 공동명의 중 본인 지분율은 몇 %인가요?',
    sub: '본인이 가진 지분 비율입니다. 보통 50%이며, 나머지는 배우자 지분으로 계산합니다. 비워두면 50%로 봅니다.',
    showIf: (a) => a.housingCount === 'one' && a.ownership === 'joint',
    numeric: true, optional: true,
    placeholder: '예: 50',
  },
  {
    id: 'context',
    section: '추가 사항',
    q: '추가로 알려주실 내용이 있나요? (선택)',
    sub: '합산배제 임대주택, 일시적 2주택·상속주택·지방 저가주택(1세대1주택 특례), 토지 종부세 등 특수한 사정이 있으면 적어주세요. 상담 시 참고합니다.',
    freeform: true, optional: true,
    placeholder: '예: 임대사업자 등록 주택 / 상속주택 보유',
  },
];

function mapAnswersToComprehensive(a) {
  const countMap = { one: 1, two: 2, three: 3 };
  const body = {
    housing_values: [Number(a.totalValue) || 0],   // 엔진은 합산(sum)만 사용 → 합계 1건으로 전송
    housing_count: countMap[a.housingCount] || 1,
    is_one_house: a.housingCount === 'one',
  };
  // 1세대1주택 세액공제(연령·보유)는 1주택만 의미
  if (a.housingCount === 'one') {
    if (Number(a.ownerAge) > 0) body.owner_age = Number(a.ownerAge);
    if (Number(a.holdingYears) > 0) body.holding_years = Number(a.holdingYears);
    // 부부 공동명의 1주택 → 본인 지분율 전달(엔진이 §8① 지분별 vs §10의2 특례 비교)
    if (a.ownership === 'joint') {
      let pct = Number(a.ownShare) > 0 ? Number(a.ownShare) : 50;   // 기본 50%
      pct = Math.min(99, Math.max(1, pct));                          // 0<지분<1 보장(공동명의 비교 유효)
      body.ownership_share = pct / 100;
    }
  }
  return body;
}

/* 종부세 주택분 산출세액(간이) — 공시합계·공제·공정비율 60%·누진세율(3주택↑ 중과표). */
function _compGrossTax(total, deduction, is3) {
  const base = Math.max(0, total - deduction) * 0.60;   // 공정시장가액비율 60%
  if (base <= 0) return 0;
  // [한도, 세율, 누진공제] — 2주택↓ §9①1호 / 3주택↑ §9①2호 중과(12억 초과부터 상향)
  const brk = is3
    ? [[300_000_000, 0.005, 0], [600_000_000, 0.007, 600_000], [1_200_000_000, 0.010, 2_400_000], [2_500_000_000, 0.020, 14_400_000], [5_000_000_000, 0.030, 39_400_000], [9_400_000_000, 0.040, 89_400_000], [Infinity, 0.050, 183_400_000]]
    : [[300_000_000, 0.005, 0], [600_000_000, 0.007, 600_000], [1_200_000_000, 0.010, 2_400_000], [2_500_000_000, 0.013, 6_000_000], [5_000_000_000, 0.015, 11_000_000], [9_400_000_000, 0.020, 36_000_000], [Infinity, 0.027, 101_800_000]];
  let gross = 0;
  for (let i = 0; i < brk.length; i++) { if (base <= brk[i][0]) { gross = base * brk[i][1] - brk[i][2]; break; } }
  return Math.max(0, gross);
}

/* 간이 폴백(엔진 미응답 시) — 재산세공제(§9③)는 미반영 → 실제보다 '높게' 나오는 보수적 상향(안전 방향). 정밀은 엔진. */
function fallbackCompTax(a) {
  const total = Number(a.totalValue) || 0;
  const isOne = a.housingCount === 'one';
  const is3 = a.housingCount === 'three';
  // 수정 260628(COMP-A-02): 1세대1주택 연령·보유 세액공제(§9⑥⑧, 합산 80% 한도) — 종전 미반영으로 고령·장기보유 과대.
  const age = Number(a.ownerAge) || 0;
  const hold = Number(a.holdingYears) || 0;
  const ageCr = age >= 70 ? 0.4 : age >= 65 ? 0.3 : age >= 60 ? 0.2 : 0;
  const holdCr = hold >= 15 ? 0.5 : hold >= 10 ? 0.4 : hold >= 5 ? 0.2 : 0;
  const credit = isOne ? Math.min(ageCr + holdCr, 0.8) : 0;
  // 수정 260628(COMP-B-01): 부부 공동명의 1주택 → §8① 지분별(각 9억, 세액공제 없음) vs §10의2 특례(12억+세액공제) 중 유리한 쪽.
  if (isOne && a.ownership === 'joint') {
    let pct = Number(a.ownShare) > 0 ? Number(a.ownShare) : 50;
    pct = Math.min(99, Math.max(1, pct));
    const s = pct / 100;
    const routeA = _compGrossTax(total * s, 900_000_000, false) + _compGrossTax(total * (1 - s), 900_000_000, false);
    const routeB = _compGrossTax(total, 1_200_000_000, false) * (1 - credit);
    return Math.round(Math.min(routeA, routeB) * 1.20);   // + 농어촌특별세 20%
  }
  const gross = _compGrossTax(total, isOne ? 1_200_000_000 : 900_000_000, is3) * (1 - credit);
  return Math.round(gross * 1.20);   // + 농어촌특별세 20%
}

function buildCompDetail(answers, calc, commentary) {
  const L = ['■ 고객 입력 정보'];
  COMP_QS.forEach(q => {
    if (q.showIf && !q.showIf(answers)) return;
    const val = answers[q.id];
    if (val === undefined || val === null || val === '') return;
    let v = val;
    if (q.opts) { const o = q.opts.find(x => x[0] === val); if (o) v = o[1]; }
    else if (q.numeric && q.money) v = formatWon(Number(val));
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('  · ' + ql + ': ' + v);
  });
  L.push('', '■ 계산 결과' + (calc.precise ? ' (검증 엔진)' : ' (간이 추정)'));
  if (calc.precise) {
    L.push('  · 주택분 과세표준: ' + formatWon(calc.taxBase) + ' (공시합계 − 공제 × 공정비율 60%)');
    L.push('  · 주택분 산출세액: ' + formatWon(calc.grossTax));
    if (calc.propTaxCredit > 0) L.push('  · 재산세 공제(§9③ 이중과세 조정): −' + formatWon(calc.propTaxCredit));
    if (calc.taxCredit > 0) L.push('  · 세액공제(연령+보유): −' + formatWon(calc.taxCredit) + ' (합산 ' + (calc.combinedCreditRate || '') + ')');
    L.push('  · 종합부동산세: ' + formatWon(calc.netTax));
    L.push('  · 농어촌특별세(종부세의 20%): ' + formatWon(calc.ruralTax));
  }
  L.push('  · 총 납부세액: ' + formatWon(calc.totalTax));
  if (calc.joint && calc.joint['적용']) {
    const j = calc.joint;
    const selfPct = Math.round((j['본인지분'] || 0.5) * 100);
    L.push('', '■ 부부 공동명의 비교 (본인 ' + selfPct + '% · 배우자 ' + (100 - selfPct) + '%)');
    L.push('  · ① 지분별 과세(각 9억 · §8①): ' + formatWon(j['지분별과세_8조1항']));
    L.push('  · ② 공동명의 특례(12억+세액공제 · §10의2): ' + formatWon(j['공동명의특례_10조의2']));
    L.push('  · 적용 결과(유리한 쪽): ' + (j['선택경로'] || '') + ' = ' + formatWon(calc.totalTax));
  }
  const ew = calc.engineWarnings || [];
  if (ew.length) { L.push('', '■ 경고'); ew.forEach(w => L.push('  · ' + w)); }
  L.push('', '■ 자동 분석');
  if (commentary.headline) L.push('  요약: ' + commentary.headline);
  (commentary.cautions || []).forEach(c => L.push('  · [주의] ' + c.title + ': ' + c.detail));
  return L.join('\n');
}

function buildCompKakao(answers, calc) {
  const L = ['[JT택스랩 종합부동산세 계산 — 상담 요청]', '', '▶ 입력'];
  COMP_QS.forEach(q => {
    if (q.id === 'context') return;
    if (q.showIf && !q.showIf(answers)) return;
    const val = answers[q.id];
    if (val === undefined || val === null || val === '') return;
    let v = val;
    if (q.opts) { const o = q.opts.find(x => x[0] === val); if (o) v = o[1]; }
    else if (q.numeric && q.money) v = formatWon(Number(val));
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('· ' + ql + ': ' + v);
  });
  if (answers.context) L.push('· 추가: ' + answers.context);
  L.push('', '▶ 추정 결과', '· 총 납부세액: ' + formatWon(calc.totalTax), '', '상담 부탁드립니다.');
  return L.join('\n');
}

async function callCompEngine(body) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  const delays = [1000, 2000, 4000, 8000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const to = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
      const res = await fetch(base + '/v1/calc/comprehensive', {
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

function JTReportComprehensive({ setRoute, onBack }) {
  const [step, setStep] = useCompState(0);
  const [answers, setAnswers] = useCompState({});
  const [loading, setLoading] = useCompState(false);
  const [report, setReport] = useCompState(null);
  const [err, setErr] = useCompState(null);
  const [phase, setPhase] = useCompState('quick');
  const [quickReport, setQuickReport] = useCompState(null);
  const [laddr, setLaddr] = useCompState('');
  const [lbusy, setLbusy] = useCompState(false);
  const [linfo, setLinfo] = useCompState(null);
  const [addedCount, setAddedCount] = useCompState(0);

  React.useEffect(() => {
    const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';
    if (base) { fetch(base + '/health', { method: 'GET' }).catch(function () {}); }
  }, []);

  // 종부세는 여러 채 합계 → 주소 1건 조회할 때마다 공시가격을 합계에 '누적' 더함
  const doAddrLookup = async () => {
    if (!laddr.trim()) return;
    setLbusy(true); setLinfo(null);
    try {
      const r = await window.jtLookupHousePrice(laddr.trim());
      if (r) {
        const prev = Number(answers.totalValue) || 0;
        const next = prev + r.amount;
        setAns('totalValue', String(next));
        const n = addedCount + 1; setAddedCount(n);
        const kindLabel = r.kind === '공동주택' ? '아파트·연립·다세대' : '단독·다가구주택';
        setLinfo({ ok: true, msg: `${kindLabel} 공시가격 ${formatWon(r.amount)}을 합계에 더했어요. 현재 합계 ${formatWon(next)} (주택 ${n}채 반영). 여러 채면 다음 주소를 이어서 조회하세요.` });
        setLaddr('');
      } else {
        setLinfo({ ok: false, msg: '이 주소의 공시가격을 찾지 못했어요(상가·오피스텔·신축 등). 직접 더해 입력해 주세요.' });
      }
    } catch (e) {
      setLinfo({ ok: false, msg: '조회 중 오류가 발생했어요. 직접 입력해 주세요.' });
    } finally { setLbusy(false); }
  };
  const resetAddr = () => { setAns('totalValue', ''); setAddedCount(0); setLinfo(null); setLaddr(''); };

  const allVisible = COMP_QS.filter(q => !q.showIf || q.showIf(answers));
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
      let calc = { totalTax: fallbackCompTax(answers), precise: false };
      try {
        const ej = await callCompEngine(mapAnswersToComprehensive(answers));
        const c = ej && ej.calc;
        if (c && !c['오류']) {
          calc.totalTax = c['세액']; calc.compTotal = c['종부세합계']; calc.ruralTax = c['농어촌특별세'] || 0;
          const h = c['주택분'] || {};
          calc.taxBase = h['과세표준']; calc.grossTax = h['세액']; calc.propTaxCredit = h['재산세공제'] || 0; calc.taxCredit = h['세액공제'] || 0; calc.netTax = h['순세액'];
          const cr = c['세액공제율'] || {};
          calc.ageCreditRate = cr['연령']; calc.holdingCreditRate = cr['보유']; calc.combinedCreditRate = cr['합산'];
          calc.steps = c['단계별계산'] || []; calc.engineWarnings = c['경고사항'] || [];
          calc.joint = c['공동명의'] || null;   // 부부 공동명의 비교(선택경로·양 경로 세액)
          calc.precise = true; calc.engineVer = ej.version && ej.version.engine;
        }
      } catch (e) { console.warn('종부세 엔진 연결 실패 — 간이 추정 유지', e); }

      let commentary;
      try {
        if (!(window.claude && window.claude.complete)) throw new Error('claude 미가용');
        const prompt = `너는 한국 세무사다. 아래 종합부동산세 계산을 보고 JSON으로만 답하라.\n주택수:${answers.housingCount} 공시합계:${formatWon(Number(answers.totalValue) || 0)} 총세액:${formatWon(calc.totalTax)}\n{"headline":"한줄요약","cautions":[{"title":"","detail":""}],"saving_ideas":[{"title":"","detail":""}],"followup":["필요자료"]}`;
        const txt = await window.claude.complete(prompt);
        commentary = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]);
      } catch (cErr) {
        commentary = {
          headline: '종합부동산세는 매년 6월 1일 기준, 세대 보유 주택 공시가격 합계에서 공제를 뺀 금액에 부과됩니다.',
          cautions: [
            { title: '과세기준일 6월 1일', detail: '6월 1일 현재 보유한 주택으로 그 해 종부세가 정해집니다. 직전 매도·직후 매수가 그 해 부담 면에서 유리합니다(종부세법 §3).' },
            { title: '부부 공동명의', detail: '부부가 각자 공제(각 9억, 합 18억)를 받을 수 있어 1주택 공동명의가 단독명의(12억)보다 유리할 수 있습니다. 단 1세대1주택 세액공제(연령·보유)는 단독명의가 유리할 수 있어 비교가 필요합니다.' },
            { title: '세부담 상한·합산배제', detail: '전년 대비 150% 세부담 상한(§10), 합산배제 임대주택(§8②)은 본 계산에 반영되지 않았습니다 — 해당되면 상담으로 확인하세요.' },
          ],
          saving_ideas: [
            { title: '1세대 1주택 세액공제', detail: '만 60세 이상·5년 이상 보유 1세대1주택은 연령·보유 공제로 최대 80%까지 종부세가 줄어듭니다(§9⑥⑧).' },
          ],
          followup: ['주택별 공시가격(부동산공시가격알리미)', '주민등록등본(세대·주택 수)', '종부세 고지서(전년도)'],
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

  const hasCredit = answers.housingCount === 'one';

  if (loading) {
    return (
      <div className="jt-container">
        <JTReportShell title="종합부동산세 계산" subtitle="검증 엔진으로 계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="LIVE">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />검증된 세금 엔진으로 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc, commentary } = report;
    return (
      <div className="jt-container">
        <JTReportShell title="종합부동산세 계산 결과" subtitle={calc.precise ? '종부세 정밀 계산' : '종부세 간이 계산'} stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
          <div className="jt-report-result__grade jt-grade-mid">
            <div className="jt-report-result__grade-label">{report.quick ? '빠른 예상 종부세(연간, 농특세 포함)' : (calc.precise ? '연간 총 납부세액 · 정밀 계산 (JT택스랩 엔진)' : '연간 추정 납부세액 · 간이')}</div>
            <div className="jt-report-result__grade-val">{formatWon(calc.totalTax)}</div>
          </div>

          {report.quick && (
            <div className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '14px 18px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}>
                <strong>기본 정보로 낸 빠른 예상치예요.</strong>{' '}
                {hasCredit
                  ? '1세대 1주택이면 만 60세 이상·5년 이상 보유 시 세액공제(최대 80%)로 세금이 크게 줄 수 있어요 — 나이·보유기간을 넣어 정확히 계산해 보세요.'
                  : '실제 종부세에 가까운 값이에요(다주택은 세액공제가 없습니다). 부부 공동명의·합산배제 임대주택 등은 상담으로 확인하세요.'}
              </p>
              <button className="jt-btn jt-btn--primary" onClick={goDetail}>{hasCredit ? '나이·보유기간 넣어 정확히 →' : '추가 사항 입력 →'}</button>
            </div>
          )}

          {!calc.precise && calc.totalTax === 0 && (
            <div style={{ background: '#f0f7f3', borderLeft: '4px solid #2a6d4f', padding: '12px 16px', marginBottom: 16, borderRadius: 8 }}>
              공시가격 합계가 공제({hasCredit ? '1세대1주택 12억' : '9억'})보다 작거나 같아 <strong>종부세가 부과되지 않습니다</strong>(종부세법 §8). <span style={{ opacity: 0.7 }}>(정밀 엔진 연결이 지연되어 간이 판정 — 공시가격을 다시 확인하세요)</span>
            </div>
          )}
          {!calc.precise && calc.totalTax > 0 && (
            <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginBottom: 16, borderRadius: 8 }}>
              정밀 엔진 연결이 지연되어 <strong>간이 추정</strong>으로 보여드립니다 — 누진세율(3주택 이상 중과 포함)은 반영했으나 <strong>재산세 공제·1세대1주택 세액공제는 미반영</strong>이라 실제보다 <strong>높게</strong> 나옵니다(특히 1세대1주택·고령·장기보유는 실제가 훨씬 낮을 수 있어요).
              <div style={{ marginTop: 8 }}><button className="jt-btn jt-btn--ghost" onClick={runAnalysis}>정밀 계산 다시 시도 →</button></div>
            </div>
          )}

          {calc.precise && (
            <section className="jt-report-result__section">
              <h3>세금 구성 (주택분)</h3>
              <table className="jt-report-calc">
                <tbody>
                  <tr><th>주택분 과세표준 (공시합계 − 공제 × 공정비율 60%)</th><td>{formatWon(calc.taxBase)}</td></tr>
                  <tr><th>주택분 산출세액</th><td>{formatWon(calc.grossTax)}</td></tr>
                  {calc.propTaxCredit > 0 && <tr><th>(−) 재산세 공제 (이중과세 조정 · 종부세법 §9③)</th><td>−{formatWon(calc.propTaxCredit)}</td></tr>}
                  {calc.taxCredit > 0 && <tr><th>(−) 세액공제 (연령+보유, 합산 {calc.combinedCreditRate})</th><td>−{formatWon(calc.taxCredit)}</td></tr>}
                  <tr><th>종합부동산세</th><td>{formatWon(calc.netTax)}</td></tr>
                  <tr><th>농어촌특별세 (종부세의 20%)</th><td>{formatWon(calc.ruralTax)}</td></tr>
                  <tr><th><strong>연간 총 납부세액</strong></th><td><strong>{formatWon(calc.totalTax)}</strong></td></tr>
                </tbody>
              </table>
              {calc.netTax === 0 && !calc.joint && (
                <div style={{ background: '#f0f7f3', padding: '10px 16px', marginTop: 10, borderRadius: 8, fontSize: 14 }}>
                  공시가격 합계가 공제({hasCredit ? '1세대1주택 12억' : '9억'})보다 작거나 같아 <strong>종부세가 부과되지 않습니다</strong>(종부세법 §8).
                </div>
              )}
            </section>
          )}

          {calc.precise && calc.joint && calc.joint['적용'] && (() => {
            const j = calc.joint;
            const selfPct = Math.round((j['본인지분'] || 0.5) * 100);
            const pickShare = (j['선택경로'] || '').indexOf('지분별') >= 0;
            const rowSel = (sel) => (sel ? { fontWeight: 700, color: 'var(--accent,#2a6d4f)' } : {});
            return (
              <section className="jt-report-result__section" style={{ background: '#f0f7f3', borderLeft: '4px solid #2a6d4f', padding: '14px 18px', borderRadius: 8 }}>
                <h3 style={{ marginTop: 0 }}>부부 공동명의 비교 (본인 {selfPct}% · 배우자 {100 - selfPct}%)</h3>
                <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6 }}>
                  부부 공동명의 1주택은 ① <strong>지분별 과세</strong>(각자 9억 공제 · 종부세법 §8①)와 ② <strong>공동명의 1주택자 특례</strong>(1세대1주택자로 보아 12억 공제 + 연령·보유 세액공제 · §10의2 신청) 중 <strong>유리한 쪽</strong>으로 계산했습니다.
                </p>
                <table className="jt-report-calc">
                  <tbody>
                    <tr style={rowSel(pickShare)}><th>① 지분별 과세 (각 9억 · §8①){pickShare ? ' ✓ 선택' : ''}</th><td>{formatWon(j['지분별과세_8조1항'])}</td></tr>
                    <tr style={rowSel(!pickShare)}><th>② 공동명의 특례 (12억+세액공제 · §10의2){!pickShare ? ' ✓ 선택' : ''}</th><td>{formatWon(j['공동명의특례_10조의2'])}</td></tr>
                    <tr><th><strong>적용 결과 (유리한 쪽, 농특세 포함)</strong></th><td><strong>{formatWon(calc.totalTax)}</strong></td></tr>
                  </tbody>
                </table>
                <p style={{ margin: '10px 0 0', fontSize: 13, opacity: 0.8 }}>
                  ※ 특례(②)는 과세기준일 현재 부부가 그 1주택 외 다른 주택이 없을 때 9.16~9.30 신청 시 적용됩니다(§10의2①②). 실제 신청·적용 여부는 상담으로 확인하세요.
                </p>
              </section>
            );
          })()}

          {calc.precise && calc.steps && calc.steps.length > 0 && (
            <section className="jt-report-result__section">
              <h3>단계별 계산 (법조문 근거)</h3>
              <table className="jt-report-calc">
                <tbody>
                  {calc.steps.map((s, i) => (
                    <tr key={i}><th>{s['항목']}{s['조문'] ? ` · ${compFmtArticle(s['조문'])}` : ''}</th><td>{compFormatStepValue(s['항목'], s['금액'])}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {calc.engineWarnings && calc.engineWarnings.length > 0 && (
            <section className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', borderRadius: 8 }}>
              <h3 style={{ marginTop: 0 }}>확인이 필요한 점</h3>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{calc.engineWarnings.map((w, i) => <li key={i} style={{ marginBottom: 4 }}>{w}</li>)}</ul>
            </section>
          )}

          <section className="jt-report-result__section" style={{ background: '#f0f7f3', borderLeft: '4px solid #2a6d4f', padding: '12px 16px', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
              종합부동산세는 <strong>매년 6월 1일 기준 보유 주택</strong>의 공시가격 합계로 정해지며, 12월에 고지·납부합니다. 본 계산은 <strong>주택분</strong> 기준이며, 세부담 상한(§10)·합산배제 임대주택(§8②)·토지분·부부 공동명의 안분은 반영하지 않았습니다 — 해당되면 상담으로 정확히 확인하세요.
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

          {typeof JTReportConvert === 'function' && (
            <JTReportConvert
              reportType="종합부동산세"
              reportSummary={`주택 ${answers.housingCount === 'one' ? '1채' : answers.housingCount === 'two' ? '2채' : '3채+'} 공시합계 ${formatWon(Number(answers.totalValue) || 0)} → 연 ${formatWon(calc.totalTax)}`}
              reportDetail={buildCompDetail(answers, calc, commentary)}
              kakaoSummary={buildCompKakao(answers, calc)}
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
      <JTReportShell title="종합부동산세 계산" subtitle={phase === 'quick' ? '주택수·공시가격 합계만 넣으면 예상 종부세를 바로 보여드려요.' : '1세대1주택 연령·보유 세액공제까지 반영해 더 정확히 계산합니다.'} stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="LIVE">
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

          {cur.id === 'totalValue' && (
            <div style={{ background: 'var(--bg-1,#f7f5f0)', border: '1px solid #dfe3dc', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>🔎 주소로 공시가격 자동 합산 <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 13 }}>(선택 — 아파트·빌라·단독주택)</span></div>
              <p style={{ margin: '0 0 10px', fontSize: 13, opacity: 0.8, lineHeight: 1.55 }}>보유 주택 주소를 넣고 조회하면 공시가격을 아래 합계에 더해드려요. <strong>여러 채면 한 채씩 주소를 넣어 조회를 반복</strong>하면 자동으로 합산됩니다.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="jt-report-q__input" style={{ flex: '1 1 220px', margin: 0 }} type="text"
                  placeholder="예: 서울 종로구 자하문로36길 16-14"
                  value={laddr} onChange={e => setLaddr(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !lbusy) doAddrLookup(); }} />
                <button className="jt-btn jt-btn--primary" style={{ flex: '0 0 auto' }} disabled={lbusy || !laddr.trim()} onClick={doAddrLookup}>
                  {lbusy ? '조회 중…' : '합계에 추가'}
                </button>
              </div>
              {linfo && (
                <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.55, padding: '9px 12px', borderRadius: 8,
                  background: linfo.ok ? '#eaf5ee' : '#fff7ea', borderLeft: '4px solid ' + (linfo.ok ? '#2a6d4f' : '#d08b00') }}>
                  {linfo.msg}
                  {addedCount > 0 && <div style={{ marginTop: 6 }}><button className="jt-btn jt-btn--ghost" style={{ padding: '4px 10px', fontSize: 13 }} onClick={resetAddr}>합계 초기화</button></div>}
                </div>
              )}
            </div>
          )}
          {cur.numeric && (
            <div>
              <input className="jt-report-q__input" type="text" inputMode="numeric" placeholder={cur.placeholder || ''}
                value={answers[cur.id] ? (cur.money ? Number(answers[cur.id]).toLocaleString('ko-KR') : answers[cur.id]) : ''}
                onChange={e => setAns(cur.id, cur.money ? e.target.value.replace(/[^0-9]/g, '') : e.target.value.replace(/[^0-9.]/g, ''))} />
              {cur.money && Number(answers[cur.id]) > 0 && (
                <div style={{ fontSize: 14, color: 'var(--accent,#2a6d4f)', marginTop: 6 }}>= {compKoreanAmountOrWon(Number(answers[cur.id]))}</div>
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
              {isLast ? (phase === 'quick' ? '빠른 결과 보기 →' : '결과 보기 →') : '다음 →'}
            </button>
          </div>
        </div>
      </JTReportShell>
    </div>
  );
}

/* 금액 한글 보조(억/만) — 공통 헬퍼 없으면 간단 표기 */
function compKoreanAmountOrWon(n) {
  if (typeof acqKoreanAmount === 'function') return acqKoreanAmount(n);
  if (!n || n <= 0) return '';
  const units = [[1_0000_0000_0000, '조'], [1_0000_0000, '억'], [1_0000, '만'], [1, '']];
  let rest = n, s = '';
  for (const [u, label] of units) { const q = Math.floor(rest / u); if (q > 0) { s += q.toLocaleString('ko-KR') + label + ' '; rest -= q * u; } }
  return s.trim() + '원';
}

window.JTReportComprehensive = JTReportComprehensive;

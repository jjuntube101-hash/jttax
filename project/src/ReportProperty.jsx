/* @jsx React.createElement */
/* 재산세 계산 — 주택/건축물/토지 + 공시가격·1세대1주택 특례·도시지역분·세부담상한
   엔진: /v1/calc/property (지방세법 §110~§112, 1세대1주택 특례 §111의2). 미응답 시 간이 폴백.
   공통 헬퍼(formatWon·JTReportShell·JTReportConvert)는 먼저 로드된 파일의 전역 사용. */

const { useState: usePropState } = React;

const PROP_CIRCLED = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮'];
function propFmtArticle(s) {
  if (!s) return '';
  return String(s).replace(/SS/g, '§').replace(/\((\d{1,2})\)/g, (m, n) => PROP_CIRCLED[Number(n)] || m);
}
/* 단계별 '비율'(0.43 등 0~1 실수)은 %로, 그 외는 금액(원). */
function propFormatStepValue(name, amount) {
  if (typeof amount !== 'number') return amount;
  if (amount > 0 && amount < 1) return (Math.round(amount * 1000) / 10) + '%';   // 공정시장가액비율 0.43 → 43%
  return formatWon(amount);
}

const PROP_QS = [
  {
    id: 'propertyKind',
    tier: 'quick',
    section: '무엇의 재산세',
    q: '어떤 부동산의 재산세인가요?',
    sub: '재산세는 매년 6월 1일 기준 소유자에게, 공시가격을 기준으로 부과됩니다(지방세법 §107·§114). 종류에 따라 세율·공정시장가액비율이 다릅니다.',
    opts: [
      ['주택', '주택 (아파트·빌라·단독)', '0.1~0.4% 누진 · 1세대1주택 특례'],
      ['건축물', '건축물 (상가·사무실·공장)', '0.25% 단일'],
      ['토지', '토지', '종합/별도/분리 합산'],
    ],
  },
  {
    id: 'standardValue',
    tier: 'quick',
    section: '공시가격',
    q: '공시가격은 얼마인가요? (원)',
    sub: '재산세는 「공시가격 × 공정시장가액비율」을 과세표준으로 합니다. 실거래가가 아니라 정부가 매년 고시하는 공시가격이며, 부동산공시가격알리미(realtyprice.kr)나 위택스에서 조회됩니다.',
    numeric: true, money: true,
    placeholder: '예: 600,000,000',
  },
  {
    id: 'isOneHouse',
    tier: 'quick',
    section: '1세대 1주택',
    q: '1세대가 가진 유일한 주택인가요?',
    sub: '1세대 1주택이면 낮은 공정시장가액비율(43~45%)이 적용됩니다 — 공시가격 9억원을 초과하는 1세대 1주택도 포함됩니다(지방세법 시행령 §109). 여기에 더해 공시 9억원 이하이면 특례세율(0.05~0.35%, 지방세법 §111의2)까지 적용돼 세금이 더 줄어듭니다. 다주택이면 일반 비율(60%)·일반세율(0.1~0.4%)입니다.',
    showIf: (a) => a.propertyKind === '주택',
    opts: [
      ['yes', '네, 1세대 1주택', '공정비율·세율 특례'],
      ['no', '아니오 (다주택 등)', '일반 비율·세율'],
    ],
  },
  {
    id: 'landType',
    tier: 'quick',
    section: '토지 종류',
    q: '토지의 종류는 무엇인가요?',
    sub: '토지는 종류에 따라 세율이 완전히 다릅니다. 나대지·잡종지 등은 종합합산(0.2~0.5%), 상가·공장의 부속토지는 별도합산(0.2~0.4%), 전·답·과수원·임야 등은 분리과세(0.07%)입니다.',
    showIf: (a) => a.propertyKind === '토지',
    opts: [
      ['종합합산', '나대지·잡종지 등 (종합합산)', '0.2~0.5% 누진'],
      ['별도합산', '사업용 건물의 부속토지 (별도합산)', '0.2~0.4%'],
      ['분리전답', '전·답·과수원·목장·임야 (분리과세)', '0.07%'],
      ['분리기타', '공장용지 등 기타 (분리과세)', '0.2%'],
    ],
  },
  {
    id: 'isUrbanArea',
    section: '도시지역',
    q: '도시지역(도시계획구역 안)에 있나요?',
    sub: '도시지역(국토계획법상 도시계획구역)에 있으면 「도시지역분」(과세표준 × 0.14%)이 추가됩니다(지방세법 §112). 대부분의 시·읍 지역 부동산이 해당됩니다. 모르면 「네/모름」을 고르세요(대부분 해당).',
    opts: [
      ['yes', '네 / 모름', '도시지역분 추가'],
      ['no', '아니오 (비도시지역)', '도시지역분 없음'],
    ],
  },
  {
    id: 'priorYearTax',
    section: '전년도 재산세',
    q: '작년에 낸 재산세 본세를 알면 입력해 주세요 (원, 선택)',
    sub: '재산세는 전년 대비 일정 비율 이상 오르지 못하는 「세부담 상한」이 있습니다(토지·건축물 150%). 작년 본세를 넣으면 상한을 정확히 반영합니다. 모르면 비워두세요. (주택은 2023년부터 세부담 상한이 폐지되어 입력 불필요합니다.)',
    showIf: (a) => a.propertyKind !== '주택',
    numeric: true, money: true, optional: true,
    placeholder: '예: 500,000',
  },
  {
    id: 'context',
    section: '추가 사항',
    q: '추가로 알려주실 내용이 있나요? (선택)',
    sub: '여러 채 합산, 임대주택 감면, 재개발·멸실, 6월 1일 전후 매매 등 특수한 사정이 있으면 적어주세요. 상담 시 참고합니다.',
    freeform: true, optional: true,
    placeholder: '예: 6월 1일 직전에 매수 / 임대사업자 등록 주택 등',
  },
];

function mapAnswersToProperty(a) {
  const kind = a.propertyKind;
  let category = '주택';
  if (kind === '건축물') category = '건축물';
  else if (kind === '토지') {
    if (a.landType === '별도합산') category = '토지_별도합산';
    else if (a.landType === '분리전답' || a.landType === '분리기타') category = '토지_분리과세';
    else category = '토지_종합합산';
  }
  const body = {
    standard_value: Number(a.standardValue) || 0,
    category,
    is_urban_area: a.isUrbanArea !== 'no',   // 기본 true(도시지역)
  };
  // 분리과세 토지 세부유형: 전·답·과수원·임야=0.07%, 기타=0.2% (지§111①1호다)
  if (category === '토지_분리과세') body.land_divided_type = a.landType === '분리전답' ? '전답과수원' : '기타분리';
  // 1세대1주택 특례(§111의2)는 주택만
  if (kind === '주택' && a.isOneHouse === 'yes') body.is_one_house = true;
  // 세부담 상한(전년세액)은 주택 외(토지·건축물)만 의미 있음(주택은 2023~ 폐지)
  if (kind !== '주택' && Number(a.priorYearTax) > 0) body.prior_year_tax = Number(a.priorYearTax);
  return body;
}

/* 간이 폴백(엔진 미응답 시) — 대략 세율. 정밀은 엔진. 폴백은 보수적(과대=안전): 누진 토지는 상한율 근사. */
function fallbackPropTax(a) {
  const v = Number(a.standardValue) || 0;
  const kind = a.propertyKind;
  // 수정 260628(PROP-A-01/B-01): 주택을 단일세율 → 4단계 누진(§111①3호 일반 / §111의2 1주택특례). 종전 0.15/0.25% 단일은 구간별 과소/과대.
  // ⚠️ 일몰 가드 필요(PROPERTY-R2-03): §111의2 특례세율 2026.12.28 일몰 / §109①2호 1주택 누진비율 2026년도 한정 — 2027+ 재확인.
  if (kind === '주택') {
    const oneHouse = a.isOneHouse === 'yes';
    // 공정시장가액비율 §109①2호(2026년도 1세대1주택 누진, 시행 2026.6.1): 3억↓ 43% / 3억~6억 44% / 6억↑ 45%. 일반(다주택) 60%. (수정 260628 PROPERTY-R2-01/02 — 종전 0.45 단일은 6억↓ 과대)
    const ratio = oneHouse ? (v <= 300_000_000 ? 0.43 : v <= 600_000_000 ? 0.44 : 0.45) : 0.60;
    const tb = v * ratio;
    // 1주택 특례세율(§111의2)은 공시 9억 이하만. 9억 초과 1주택은 일반 누진(§111①3호). (PROP-A-01 오라클: 10억 1주택=일반 0.4%·ratio 45%, 총 2,034,000 일치)
    const special = oneHouse && v <= 900_000_000;
    const main = special
      ? (tb <= 60_000_000 ? tb * 0.0005
        : tb <= 150_000_000 ? 30_000 + (tb - 60_000_000) * 0.001
        : tb <= 300_000_000 ? 120_000 + (tb - 150_000_000) * 0.002
        : 420_000 + (tb - 300_000_000) * 0.0035)
      : (tb <= 60_000_000 ? tb * 0.001
        : tb <= 150_000_000 ? 60_000 + (tb - 60_000_000) * 0.0015
        : tb <= 300_000_000 ? 195_000 + (tb - 150_000_000) * 0.0025
        : 570_000 + (tb - 300_000_000) * 0.004);
    const edu = main * 0.2;
    const urban = (a.isUrbanArea !== 'no') ? tb * 0.0014 : 0;
    return Math.round(main + edu + urban);
  }
  let ratio, rate;
  if (kind === '건축물') { ratio = 0.70; rate = 0.0025; }
  else { // 토지 — 종류별(종합/별도는 누진 상한율로 과대 보정, 분리는 정확율)
    ratio = 0.70;
    if (a.landType === '별도합산') rate = 0.004;        // 0.2~0.4% → 상한 근사
    else if (a.landType === '분리전답') rate = 0.0007;  // 전·답·과수원·목장·임야 0.07%
    else if (a.landType === '분리기타') rate = 0.002;   // 공장용지 등 기타분리 0.2%
    else rate = 0.005;                                  // 종합합산 0.2~0.5% → 상한 근사(과소 방지)
  }
  const base = v * ratio;
  const main = base * rate;
  const edu = main * 0.2;
  const urban = (a.isUrbanArea !== 'no') ? base * 0.0014 : 0;
  return Math.round(main + edu + urban);
}

function buildPropDetail(answers, calc, commentary) {
  const L = ['■ 고객 입력 정보'];
  PROP_QS.forEach(q => {
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
    L.push('  · 과세표준: ' + formatWon(calc.taxBase) + ' (공시가격 × 공정시장가액비율 ' + (calc.fairRatio || '') + ')');
    L.push('  · 재산세 본세: ' + formatWon(calc.mainTax));
    L.push('  · 지방교육세: ' + formatWon(calc.eduTax));
    if (calc.urbanTax > 0) L.push('  · 도시지역분: ' + formatWon(calc.urbanTax));
    if (calc.fireTax > 0) L.push('  · 지역자원시설세(소방분): ' + formatWon(calc.fireTax));
    if (calc.burdenApplied) L.push('  · 세부담 상한 적용됨');
  }
  L.push('  · 총 납부세액: ' + formatWon(calc.totalTax));
  if (calc.firstHalf > 0 && calc.secondHalf > 0) L.push('  · 납부시기: 7월 ' + formatWon(calc.firstHalf) + ' + 9월 ' + formatWon(calc.secondHalf) + ' (반분)');
  else if (calc.firstHalf > 0) L.push('  · 납부시기: 7월 ' + formatWon(calc.firstHalf) + ' (전액)');
  else if (calc.secondHalf > 0) L.push('  · 납부시기: 9월 ' + formatWon(calc.secondHalf) + ' (전액)');
  const ew = calc.engineWarnings || [];
  if (ew.length) { L.push('', '■ 경고'); ew.forEach(w => L.push('  · ' + w)); }
  L.push('', '■ 자동 분석');
  if (commentary.headline) L.push('  요약: ' + commentary.headline);
  (commentary.cautions || []).forEach(c => L.push('  · [주의] ' + c.title + ': ' + c.detail));
  return L.join('\n');
}

function buildPropKakao(answers, calc) {
  const L = ['[JT택스랩 재산세 계산 — 상담 요청]', '', '▶ 입력'];
  PROP_QS.forEach(q => {
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

async function callPropEngine(body) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  const delays = [1000, 2000, 3000, 4000, 6000, 8000, 10000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const to = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
      const res = await fetch(base + '/v1/calc/property', {
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

/* 주소→공시가격 자동조회 (/v1/lookup/price) — 전 계산기 공통(window.jt*, 중복선언 방지).
   window.jtLookupPublicPrice(주소, 종류): 원본 응답. window.jtLookupHousePrice(주소): 주택 총액.
   주택은 공동주택 먼저→없으면 개별주택 폴백. 반환 {amount(총액 원), year, kind} 또는 null.
   (토지는 원/㎡ 단가라 면적 곱셈 필요 → 자동조회 미지원) */
if (typeof window !== 'undefined' && !window.jtLookupPublicPrice) {
  window.jtLookupPublicPrice = async function (address, housingKind) {
    const base = window.JT_ENGINE_BASE || 'http://127.0.0.1:8000';
    const res = await fetch(base + '/v1/lookup/price', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, housing_kind: housingKind }),
    });
    if (!res.ok) throw new Error('lookup ' + res.status);
    return res.json();
  };
  window.jtLookupHousePrice = async function (address) {
    // 공시가격(주택)을 공동→개별 순으로 찾되, region(지역규제)은 조회 성공/실패와 무관하게 확보
    let lastRegion = null;
    for (const kind of ['공동주택', '개별주택']) {
      try {
        const r = await window.jtLookupPublicPrice(address, kind);
        if (r && r.region) lastRegion = r.region;
        const v = (r && r.valuations && r.valuations[0]) || null;
        if (r && !r.manual_input_required && v && Number(v.amount) > 0) {
          return { amount: Number(v.amount), year: v.as_of_year || '', kind, region: r.region || lastRegion };
        }
      } catch (e) { /* 다음 종류 시도 */ }
    }
    // 공시가격을 못 찾아도(상가·오피스텔 등) 지역규제 판별은 유효 → region만이라도 반환
    return lastRegion ? { amount: 0, region: lastRegion } : null;
  };
}

function JTReportProperty({ setRoute, onBack }) {
  const [step, setStep] = usePropState(0);
  const [answers, setAnswers] = usePropState({});
  const [loading, setLoading] = usePropState(false);
  const [report, setReport] = usePropState(null);
  const [err, setErr] = usePropState(null);
  const [phase, setPhase] = usePropState('quick');
  const [quickReport, setQuickReport] = usePropState(null);
  // 주소→공시가격 자동조회 상태 (주택 standardValue 단계)
  const [laddr, setLaddr] = usePropState('');
  const [lbusy, setLbusy] = usePropState(false);
  const [linfo, setLinfo] = usePropState(null); // {ok:bool, msg:string}

  React.useEffect(() => {
    const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';
    if (base) { fetch(base + '/health', { method: 'GET' }).catch(function () {}); }
  }, []);

  const allVisible = PROP_QS.filter(q => !q.showIf || q.showIf(answers));
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

  const doAddrLookup = async () => {
    if (!laddr.trim()) return;
    setLbusy(true); setLinfo(null);
    try {
      const r = await window.jtLookupHousePrice(laddr.trim());
      if (r && r.amount > 0) {
        setAns('standardValue', String(r.amount));
        const kindLabel = r.kind === '공동주택' ? '아파트·연립·다세대' : '단독·다가구주택';
        let msg = `${r.year ? r.year + '년 ' : ''}공시가격 ${formatWon(r.amount)}을 자동 입력했어요 (${kindLabel}).`;
        // 도시지역 자동선택(근사) — 주소 기준. 재산세 도시지역분(0.14%) 판정용
        const reg = r.region;
        if (reg && reg.urban_area_likely === true) { setAns('isUrbanArea', 'yes'); msg += ` ${reg.sigungu || '해당 지역'}은 도시지역으로 자동판단했어요(다르면 뒤 단계에서 수정).`; }
        else if (reg && reg.urban_area_likely === false) { setAns('isUrbanArea', 'no'); msg += ' 비도시지역으로 자동판단했어요(다르면 수정).'; }
        msg += ' 값이 맞는지 확인하고 다음으로 진행하세요.';
        setLinfo({ ok: true, msg });
      } else if (r && r.region) {
        // 공시가격은 못 찾았지만 지역판별은 됨
        const reg = r.region;
        if (reg.urban_area_likely === true) setAns('isUrbanArea', 'yes');
        else if (reg.urban_area_likely === false) setAns('isUrbanArea', 'no');
        setLinfo({ ok: false, msg: '이 주소의 공시가격은 찾지 못했어요(상가·오피스텔·신축 등). 공시가격은 직접 입력하시고, 도시지역 여부는 자동판단했어요.' });
      } else {
        setLinfo({ ok: false, msg: '이 주소의 공시가격을 찾지 못했어요(상가·오피스텔·신축 등은 미수록일 수 있어요). 공시가격을 직접 입력해 주세요.' });
      }
    } catch (e) {
      setLinfo({ ok: false, msg: '조회 중 오류가 발생했어요. 잠시 후 다시 시도하거나 직접 입력해 주세요.' });
    } finally { setLbusy(false); }
  };

  const runAnalysis = async () => {
    setLoading(true); setErr(null);
    try {
      let calc = { totalTax: fallbackPropTax(answers), precise: false };
      try {
        const ej = await callPropEngine(mapAnswersToProperty(answers));
        const c = ej && ej.calc;
        if (c) {
          calc.totalTax = c['세액']; calc.mainTax = c['재산세본세']; calc.eduTax = c['지방교육세'];
          calc.urbanTax = c['도시지역분'] || 0; calc.fireTax = c['소방분'] || 0; calc.taxBase = c['과세표준'];
          calc.appliedRate = c['적용세율']; calc.fairRatio = c['공정시장가액비율']; calc.burdenApplied = c['세부담상한적용'];
          const np = c['납부시기'] || {}; calc.firstHalf = np['7월'] || 0; calc.secondHalf = np['9월'] || 0;
          calc.steps = c['단계별계산'] || []; calc.engineWarnings = c['경고사항'] || [];
          calc.precise = true; calc.engineVer = ej.version && ej.version.engine;
        }
      } catch (e) { console.warn('재산세 엔진 연결 실패 — 간이 추정 유지', e); }

      let commentary;
      try {
        if (!(window.claude && window.claude.complete)) throw new Error('claude 미가용');
        const prompt = `너는 한국 세무사다. 아래 재산세 계산을 보고 JSON으로만 답하라.\n종류:${answers.propertyKind} 공시가격:${formatWon(Number(answers.standardValue) || 0)} 총세액:${formatWon(calc.totalTax)}\n{"headline":"한줄요약","cautions":[{"title":"","detail":""}],"saving_ideas":[{"title":"","detail":""}],"followup":["필요자료"]}`;
        const txt = await window.claude.complete(prompt);
        commentary = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]);
      } catch (cErr) {
        commentary = {
          headline: '재산세는 매년 6월 1일 소유자에게, 공시가격 기준으로 부과됩니다.',
          cautions: [
            { title: '과세기준일 6월 1일', detail: '6월 1일 현재 소유자가 그 해 재산세를 전부 냅니다. 6월 1일 직전 매도/직후 매수가 유리합니다(지방세법 §114).' },
            { title: '납부 시기', detail: '주택 재산세는 7월과 9월에 절반씩 나눠 냅니다(연 20만원 이하면 7월 일괄). 건축물은 7월, 토지는 9월.' },
            { title: '공시가격 기준', detail: '실거래가가 아니라 정부 고시 공시가격 × 공정시장가액비율이 과세표준입니다.' },
          ],
          saving_ideas: [
            { title: '1세대 1주택 특례', detail: '공시 9억 이하 1세대 1주택은 특례세율과 낮은 공정시장가액비율로 세금이 크게 줄어듭니다(§111의2).' },
          ],
          followup: ['공시가격(부동산공시가격알리미)', '재산세 고지서(전년도)', '주민등록등본(세대·주택 수)'],
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
        <JTReportShell title="재산세 계산" subtitle="검증 엔진으로 계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="LIVE">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />검증된 세금 엔진으로 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc, commentary } = report;
    return (
      <div className="jt-container">
        <JTReportShell title="재산세 계산 결과" subtitle={calc.precise ? '재산세 정밀 계산' : '재산세 간이 계산'} stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
          <div className="jt-report-result__grade jt-grade-mid">
            <div className="jt-report-result__grade-label">{report.quick ? '빠른 예상 재산세(연간 총액)' : (calc.precise ? '연간 총 납부세액 · 정밀 계산 (JT택스랩 엔진)' : '연간 추정 납부세액 · 간이')}</div>
            <div className="jt-report-result__grade-val">{formatWon(calc.totalTax)}</div>
          </div>

          {report.quick && calc.appliedRate && (
            <p style={{ textAlign: 'center', margin: '0 0 16px', fontSize: 14, opacity: 0.8 }}>
              {answers.propertyKind} · 공시가격 {formatWon(Number(answers.standardValue) || 0)} 기준, 적용세율 약 {calc.appliedRate}로 계산했어요.
            </p>
          )}

          {!calc.precise && (
            <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginBottom: 16, borderRadius: 8 }}>
              정밀 엔진 연결이 지연되어 <strong>간이 추정</strong>(대략 세율 — 실제보다 다소 높게 나올 수 있어요)으로 보여드립니다. 1세대1주택 특례·세부담 상한 등 정밀 계산은 엔진 계산에서 반영됩니다 —
              <div style={{ marginTop: 8 }}><button className="jt-btn jt-btn--ghost" onClick={runAnalysis}>정밀 계산 다시 시도 →</button></div>
            </div>
          )}

          {report.quick && (
            <div className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '14px 18px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}>
                <strong>기본 정보로 낸 빠른 예상치예요.</strong> 더 정확히 하면 세액이 달라질 수 있어요. <strong>도시지역분(0.14%)은 「도시지역」으로 가정해 이미 포함</strong>했으니, 비도시지역이면 그만큼 줄어듭니다 —<br />
                {answers.propertyKind === '주택'
                  ? '여러 채 합산 등. 1세대1주택이면 낮은 공정비율(43~45%)이 반영됐어요 — 공시 9억 이하면 세율 특례까지, 9억 초과면 공정비율만 적용됩니다.'
                  : answers.propertyKind === '토지'
                  ? '토지 종류(종합/별도/분리)·세부담 상한(전년세액).'
                  : '세부담 상한(전년세액).'}
              </p>
              <button className="jt-btn jt-btn--primary" onClick={goDetail}>더 정확히 계산하기 →</button>
            </div>
          )}

          {calc.precise && (
            <section className="jt-report-result__section">
              <h3>세금 구성</h3>
              <table className="jt-report-calc">
                <tbody>
                  <tr><th>과세표준 (공시가격 × 공정비율 {calc.fairRatio})</th><td>{formatWon(calc.taxBase)}</td></tr>
                  <tr><th>적용세율</th><td>{calc.appliedRate}</td></tr>
                  <tr><th>재산세 본세</th><td>{formatWon(calc.mainTax)}</td></tr>
                  <tr><th>지방교육세 (본세의 20%)</th><td>{formatWon(calc.eduTax)}</td></tr>
                  {calc.urbanTax > 0 && <tr><th>도시지역분 (과표 × 0.14%)</th><td>{formatWon(calc.urbanTax)}</td></tr>}
                  {calc.fireTax > 0 && <tr><th>지역자원시설세 (소방분)</th><td>{formatWon(calc.fireTax)}</td></tr>}
                  <tr><th><strong>연간 총 납부세액</strong></th><td><strong>{formatWon(calc.totalTax)}</strong></td></tr>
                </tbody>
              </table>
              {(calc.firstHalf > 0 || calc.secondHalf > 0) && (
                <div style={{ background: 'var(--bg-1,#f7f5f0)', padding: '10px 16px', marginTop: 10, borderRadius: 8, fontSize: 14 }}>
                  <strong>납부 시기:</strong> {calc.firstHalf > 0 && calc.secondHalf > 0
                    ? `7월 ${formatWon(calc.firstHalf)} + 9월 ${formatWon(calc.secondHalf)} (절반씩 나눠 납부)`
                    : calc.firstHalf > 0
                    ? `7월 ${formatWon(calc.firstHalf)} (전액)`
                    : `9월 ${formatWon(calc.secondHalf)} (전액)`} <span style={{ opacity: 0.7 }}>(지방세법 §115)</span>
                </div>
              )}
              {calc.burdenApplied && (
                <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginTop: 12, borderRadius: 8 }}>
                  ⚠️ 세부담 상한이 적용되어, 전년 대비 일정 한도까지만 올랐습니다(지방세법 §122).
                </div>
              )}
            </section>
          )}

          {calc.precise && calc.steps && calc.steps.length > 0 && (
            <section className="jt-report-result__section">
              <h3>단계별 계산 (법조문 근거)</h3>
              <table className="jt-report-calc">
                <tbody>
                  {calc.steps.map((s, i) => (
                    <tr key={i}><th>{s['항목']}{s['조문'] ? ` · ${propFmtArticle(s['조문'])}` : ''}</th><td>{propFormatStepValue(s['항목'], s['금액'])}</td></tr>
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
              재산세는 <strong>매년 6월 1일 기준 소유자</strong>에게 그 해 전액 부과됩니다(지방세법 §114). 6월 1일 직전 매도·직후 매수가 그 해 재산세 부담 면에서 유리합니다. 공시가격은 부동산공시가격알리미(realtyprice.kr)에서 확인하세요.
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
              reportType="재산세"
              reportSummary={`${answers.propertyKind} 공시 ${formatWon(Number(answers.standardValue) || 0)} → 연 ${formatWon(calc.totalTax)}`}
              reportDetail={buildPropDetail(answers, calc, commentary)}
              kakaoSummary={buildPropKakao(answers, calc)}
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
      <JTReportShell title="재산세 계산" subtitle={phase === 'quick' ? '종류·공시가격만 넣으면 예상 재산세를 바로 보여드려요.' : '도시지역·세부담 상한까지 반영해 더 정확히 계산합니다.'} stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="LIVE">
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

          {cur.id === 'standardValue' && answers.propertyKind === '주택' && (
            <div style={{ background: 'var(--bg-1,#f7f5f0)', border: '1px solid #dfe3dc', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>🔎 주소로 공시가격 자동조회 <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 13 }}>(선택 — 아파트·빌라·단독주택)</span></div>
              <p style={{ margin: '0 0 10px', fontSize: 13, opacity: 0.8, lineHeight: 1.55 }}>주소를 넣으면 국토교통부 공시가격을 찾아 아래 칸에 자동으로 채워드려요. 직접 입력하셔도 됩니다.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="jt-report-q__input" style={{ flex: '1 1 220px', margin: 0 }} type="text"
                  placeholder="예: 서울 종로구 자하문로36길 16-14"
                  value={laddr} onChange={e => setLaddr(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !lbusy) doAddrLookup(); }} />
                <button className="jt-btn jt-btn--primary" style={{ flex: '0 0 auto' }} disabled={lbusy || !laddr.trim()} onClick={doAddrLookup}>
                  {lbusy ? '조회 중…' : '공시가격 조회'}
                </button>
              </div>
              {linfo && (
                <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.55, padding: '9px 12px', borderRadius: 8,
                  background: linfo.ok ? '#eaf5ee' : '#fff7ea', borderLeft: '4px solid ' + (linfo.ok ? '#2a6d4f' : '#d08b00') }}>
                  {linfo.msg}
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
                <div style={{ fontSize: 14, color: 'var(--accent,#2a6d4f)', marginTop: 6 }}>= {propKoreanAmountOrWon(Number(answers[cur.id]))}</div>
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
function propKoreanAmountOrWon(n) {
  if (typeof acqKoreanAmount === 'function') return acqKoreanAmount(n);
  if (!n || n <= 0) return '';
  const units = [[1_0000_0000_0000, '조'], [1_0000_0000, '억'], [1_0000, '만'], [1, '']];
  let rest = n, s = '';
  for (const [u, label] of units) { const q = Math.floor(rest / u); if (q > 0) { s += q.toLocaleString('ko-KR') + label + ' '; rest -= q * u; } }
  return s.trim() + '원';
}

window.JTReportProperty = JTReportProperty;

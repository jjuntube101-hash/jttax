/* @jsx React.createElement */
/* 취득세 계산 — 취득원인(매매·증여·상속·신축) + 주택/비주택 + 주택수·조정지역·면적·감면
   엔진: /v1/calc/acquisition (지방세법 §11~§15, 농특세·지방교육세 포함). 미응답 시 간이 폴백.
   공통 헬퍼(formatWon·formatStepValue·JTReportShell·JTReportConvert)는 먼저 로드된 파일의 전역 사용. */

const { useState: useAcqState } = React;

/* 조문 표기 정규화 — 엔진 일부 조문 ASCII("SS")·"(n)" → §·원문자(표시용). */
const ACQ_CIRCLED = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
function acqFmtArticle(s) {
  if (!s) return '';
  return String(s).replace(/SS/g, '§').replace(/\((\d{1,2})\)/g, (m, n) => ACQ_CIRCLED[Number(n)] || m);
}
function acqKoreanAmount(raw) {
  const n = Number(raw) || 0;
  if (n <= 0) return '';
  const units = [[1_0000_0000_0000, '조'], [1_0000_0000, '억'], [1_0000, '만'], [1, '']];
  let rest = n, s = '';
  for (const [u, label] of units) { const q = Math.floor(rest / u); if (q > 0) { s += q.toLocaleString('ko-KR') + label + ' '; rest -= q * u; } }
  return s.trim() + '원';
}

/* 단계별 '세율' 항목은 엔진이 만분율 정수(×10000)로 반환 → %로 표시(예: 1200→12%, 233→2.33%, 100→1%).
   그 외 항목(과세표준·본세·교육세·감면·총세액)은 금액(원). 공유 formatStepValue는 양도세 전용이라 취득세 세율을 오표시(만분율을 원으로). */
function acqFormatStepValue(name, amount, note) {
  if (typeof amount !== 'number') return amount;
  const label = String(name || '').replace(/^\d+\.\s*/, '');
  if (/세율/.test(label)) {
    if (amount === 0) return /중과/.test(label) ? '해당 없음' : '0%';
    return (Math.round(amount) / 100) + '%';
  }
  if (/주택수/.test(label)) return amount > 0 ? amount + '채' : '—';   // 비주택(0채)은 대시
  if (amount < 0) return '− ' + formatWon(-amount);                    // 감면 등 음수 = 통일 포맷
  // 금액 0이면서 구간·판정·유형·유예·특례 마커이거나 비고가 해당없음/무주택/비주택이면 '—'(통화 오표시 방지)
  if (amount === 0 && (/구간|판정|유형|유예|특례/.test(label) || /해당\s*없음|무주택|비주택/.test(String(note || '')))) return '—';
  return formatWon(amount);
}

const ACQ_QS = [
  {
    id: 'acquisitionType',
    tier: 'quick',
    section: '어떻게 취득',
    q: '부동산을 어떻게 취득하셨나요?',
    sub: '취득 원인에 따라 세율이 크게 다릅니다 — 매매(유상)·증여·상속·신축이 각각 다른 세율을 적용합니다(지방세법 §11).',
    opts: [
      ['매매', '사서 취득 (매매·분양)', '유상취득 — 주택 1~3%(중과 8·12%)·비주택 4%'],
      ['증여', '증여로 받음', '증여 취득 — 주택 3.5%(조정 3억↑ 12%)'],
      ['상속', '상속으로 받음', '상속 취득 — 주택 2.8% (1주택 특례 0.8%은 상담)'],
      ['신축', '새로 지음 (원시취득)', '원시취득 2.8%'],
    ],
  },
  {
    id: 'propertyType',
    tier: 'quick',
    section: '무엇을 취득',
    q: '취득한 부동산은 무엇인가요?',
    sub: '주택인지 아닌지에 따라 세율·중과·감면이 완전히 다릅니다. 실제 살던 주거용 오피스텔은 「주택」으로 보아 주택 수·중과 판정을 받을 수 있으니 해당되면 상담에서 알려주세요. 분양권·조합원입주권은 「권리」라서 취득 단계엔 취득세가 없고, 준공·잔금 때 주택분 취득세가 따로 나옵니다.',
    opts: [
      ['주택', '주택 (아파트·빌라·단독)', '1~3% 기본 · 다주택·조정지역 중과 가능'],
      ['상가', '상가·오피스텔·건물 (비주택)', '4% 단일'],
      ['토지', '토지', '4% (농지 3%·상속농지 2.3%)'],
      ['분양권', '분양권 (아파트 등 청약 당첨)', '취득 단계 비대상 (0원) · 준공·잔금 시 부과'],
      ['입주권', '조합원입주권 (재개발·재건축)', '권리 취득 비대상 (0원) · 준공 시 별도'],
    ],
  },
  {
    id: 'propertyValue',
    tier: 'quick',
    section: '취득가액',
    q: '취득가액(또는 신고가액)은 얼마인가요? (원)',
    sub: '매매는 실제 산 가격, 증여·상속은 시가(없으면 시가표준액), 신축은 공사비(원시취득 과표)입니다. 취득세는 이 금액에 세율을 곱해 계산합니다.',
    numeric: true, money: true,
    placeholder: '예: 800,000,000',
  },
  {
    id: 'housingCount',
    tier: 'quick',
    section: '주택 수',
    q: '취득 후 보유하게 되는 주택은 모두 몇 채인가요? (이 주택 포함)',
    sub: '취득세 다주택 중과는 「취득 결과 보유 주택 수」로 판정합니다. 조정대상지역은 2주택 8%·3주택 이상 12%, 비조정지역은 3주택 8%·4주택 이상 12%로 중과됩니다(지방세법 §13의2). 분양권·입주권·주거용 오피스텔도 주택 수에 포함될 수 있어요 — 헷갈리면 상담에서 정확히 봐드립니다.',
    showIf: (a) => a.propertyType === '주택' && a.acquisitionType === '매매',
    opts: [
      ['1', '1채 (이 집뿐)', '기본세율 1~3%'],
      ['2', '2채', '조정지역 8% 중과 · 비조정 일반세율'],
      ['3', '3채', '조정 12% · 비조정 8% 중과'],
      ['4', '4채 이상', '조정·비조정 모두 12% 중과'],
    ],
  },

  // ── 더 정확히 (상세) ──
  {
    id: 'exclusiveArea',
    section: '면적',
    q: '전용면적은 몇 ㎡인가요? (농어촌특별세 판정용)',
    sub: '전용면적 85㎡(약 25.7평) 초과 주택에는 농어촌특별세(취득세 표준세율분의 10%)가 추가됩니다. 85㎡ 이하면 농특세가 없습니다. 모르면 비워두세요(84로 가정).',
    showIf: (a) => a.propertyType === '주택',
    numeric: true, optional: true,
    placeholder: '예: 84.96',
  },
  {
    id: 'isRegulatedArea',
    section: '조정대상지역',
    q: '취득한 주택이 조정대상지역에 있나요?',
    sub: '조정대상지역은 다주택 중과(매매)·증여 중과(시가표준 3억↑)가 적용되는 지역입니다. 현재 서울 강남·서초·송파·용산만 해당(수시 변경 — 국토부 고시 확인). 모르면 「아니오/모름」을 고르세요(비조정으로 계산).',
    showIf: (a) => a.propertyType === '주택' && (a.acquisitionType === '매매' || a.acquisitionType === '증여'),
    opts: [['yes', '네, 조정대상지역', '중과 가능'], ['no', '아니오 / 모름', '기본 세율']],
  },
  {
    id: 'reduction',
    section: '감면',
    q: '취득세 감면 대상에 해당하나요?',
    sub: '생애최초로 집을 사면(본인·배우자 모두 무주택, 취득가액 12억 이하, 미성년 제외) 취득세를 최대 200만원까지 감면받습니다(지방세특례제한법 §36의3, 2028년 말까지). 신혼부부가 처음 사는 집도 여기에 포함됩니다. 작은 빌라·도시형생활주택·다가구주택이나 인구감소지역 주택은 300만원까지 가능하니 상담에서 확인하세요.',
    showIf: (a) => a.propertyType === '주택' && a.acquisitionType === '매매',
    opts: [
      ['none', '해당 없음', '감면 없음'],
      ['first', '생애최초 주택 구입 (신혼부부 첫 집 포함)', '최대 200만원 감면'],
    ],
  },
  {
    id: 'standardValue',
    section: '시가표준액',
    q: '이 주택의 시가표준액은 얼마인가요? (증여 중과 판정용 · 원)',
    sub: '앞에서 넣은 「시가」와 달리, 시가표준액은 정부가 매년 정하는 공시가격이에요(보통 시세보다 낮음). 증여 취득세 중과(조정대상지역 12%)를 이 공시가격 3억원 기준으로 따져서 따로 여쭤봅니다. 모르면 비워두세요 — 앞 금액으로 대신 판단합니다.',
    showIf: (a) => a.acquisitionType === '증여' && a.propertyType === '주택',
    numeric: true, money: true, optional: true,
    placeholder: '예: 400,000,000',
  },
  {
    id: 'giftOneHouseException',
    section: '1세대 1주택 증여',
    q: '증여하는 분이 이 주택 1채만 가진 1세대 1주택자이고, 받는 분이 배우자·자녀·부모인가요?',
    sub: '이 경우 조정대상지역이라도 증여 취득세 12% 중과에서 제외되어 일반 3.5%가 적용됩니다(지방세법 §13의2② 단서). 부모→자녀 1주택 증여가 대표적입니다.',
    showIf: (a) => a.acquisitionType === '증여' && a.propertyType === '주택' && a.isRegulatedArea === 'yes',
    opts: [['yes', '네, 1세대 1주택자가 가족에게 증여', '12% 중과 제외 (3.5%)'], ['no', '아니오 / 모름', '12% 중과 적용']],
  },
  {
    id: 'context',
    section: '추가 사항',
    q: '추가로 알려주실 내용이 있나요? (선택)',
    sub: '오피스텔 주거용 사용, 분양권·입주권, 일시적 2주택, 농지·임야 등 특수한 사정이 있으면 적어주세요. 상담 시 참고합니다.',
    freeform: true, optional: true,
    placeholder: '예: 분양받은 오피스텔을 주거용으로 사용 / 일시적 2주택 등',
  },
];

function mapAnswersToAcquisition(a) {
  const isHousing = a.propertyType === '주택';
  const isPurchase = a.acquisitionType === '매매';   // 유상거래(매매)만 다주택 중과·생애최초 감면 대상
  const body = {
    property_value: Number(a.propertyValue) || 0,
    acquisition_type: { '매매': '유상취득', '증여': '증여', '상속': '상속', '신축': '원시취득' }[a.acquisitionType] || '유상취득',
    property_type: isHousing ? '주택' : (a.propertyType === '토지' ? '토지' : a.propertyType === '분양권' ? '분양권' : a.propertyType === '입주권' ? '조합원입주권' : '상가사무실'),
    is_housing: isHousing,
  };
  if (isHousing && Number(a.exclusiveArea) > 0) body.exclusive_area = Number(a.exclusiveArea);
  // 다주택 중과(지§13의2①)·생애최초 감면(지특법§36의3)·조정지역은 '매매(유상거래)'만 적용.
  //   취득유형을 바꿔도 잔존 답변(주택수·조정·감면)이 신축·증여·상속에 새지 않도록 매매로 게이트.
  if (isHousing && isPurchase) {
    body.housing_count = Number(a.housingCount) || 1;
    if (a.isRegulatedArea === 'yes') body.is_regulated_area = true;
    // 생애최초 감면(§36의3): reduction_type을 보내야 적용. 신혼부부 첫 집도 §36의3 흡수(§36의2는 2020 일몰).
    //   300만(1호)은 '아파트 제외'+가액요건이라 면적만으론 자동판정 불가 → 보수적 200만(2호) 기본, 300만은 상담.
    if (a.reduction === 'first') { body.reduction_type = '생애최초'; body.is_first_home_buyer = true; }
  }
  // 증여 취득세: 시가표준액 + 조정 12% 중과(지§13의2②). 단 1세대1주택자→배우자·직계존비속 증여는 12% 제외(② 단서).
  if (a.acquisitionType === '증여') {
    if (Number(a.standardValue) > 0) body.standard_value = Number(a.standardValue);
    if (isHousing && a.isRegulatedArea === 'yes' && a.giftOneHouseException !== 'yes') {
      const std = Number(a.standardValue) || Number(a.propertyValue) || 0;
      if (std >= 300_000_000) body.gift_regulated_over_3b = true;
    }
  }
  return body;
}

/* 간이 폴백(엔진 미응답 시) — 대략 합산세율. 정밀은 엔진. */
function fallbackAcqTax(a) {
  const v = Number(a.propertyValue) || 0;
  const isHousing = a.propertyType === '주택';
  let rate;
  if (a.acquisitionType === '증여') rate = isHousing ? 0.04 : 0.04;          // 주택 증여 3.5%+교육세
  else if (a.acquisitionType === '상속') rate = isHousing ? 0.0316 : 0.0316; // 상속 2.8%+교육세
  else if (a.acquisitionType === '신축') rate = 0.0316;
  else if (!isHousing) rate = 0.046;                                         // 비주택 4%+교육세
  else { // 주택 매매(기본, 중과·감면 미반영 간이)
    if (v <= 600_000_000) rate = 0.011;
    else if (v <= 900_000_000) rate = (v * 2 / 300_000_000 - 3) / 100 + 0.001; // §11①8호나목 슬라이딩(1~3%)+교육세 근사
    else rate = 0.033;
  }
  return Math.round(v * rate);
}

function buildAcqDetail(answers, calc, commentary) {
  const L = ['■ 고객 입력 정보'];
  ACQ_QS.forEach(q => {
    if (q.showIf && !q.showIf(answers)) return;   // 취득유형 변경 시 잔존 답변 누설 방지
    const val = answers[q.id];
    if (val === undefined || val === null || val === '') return;
    let v = val;
    if (q.opts) { const o = q.opts.find(x => x[0] === val); if (o) v = o[1]; }
    else if (q.numeric && q.money) v = formatWon(Number(val));
    else if (q.numeric) v = val + '㎡';
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('  · ' + ql + ': ' + v);
  });
  L.push('', '■ 계산 결과' + (calc.precise ? ' (검증 엔진)' : ' (간이 추정)'));
  if (calc.precise) {
    L.push('  · 취득세 본세: ' + formatWon(calc.acqTax));
    L.push('  · 지방교육세: ' + formatWon(calc.eduTax));
    if (calc.farmTax > 0) L.push('  · 농어촌특별세: ' + formatWon(calc.farmTax));
    if (calc.heavyApplied) L.push('  · 중과 적용: ' + (calc.heavyReason || '예'));
    if (calc.reductionAmt > 0) L.push('  · 감면: ' + formatWon(calc.reductionAmt) + ' (' + (calc.reductionType || '') + ')');
  }
  L.push('  · 총 납부세액: ' + formatWon(calc.totalTax));
  if (calc.deadline) L.push('  · 신고기한: ' + calc.deadline);
  const ew = calc.engineWarnings || [];
  if (ew.length) { L.push('', '■ 경고'); ew.forEach(w => L.push('  · ' + w)); }
  L.push('', '■ 자동 분석');
  if (commentary.headline) L.push('  요약: ' + commentary.headline);
  (commentary.cautions || []).forEach(c => L.push('  · [주의] ' + c.title + ': ' + c.detail));
  return L.join('\n');
}

function buildAcqKakao(answers, calc) {
  const L = ['[JT택스랩 취득세 계산 — 상담 요청]', '', '▶ 입력'];
  ACQ_QS.forEach(q => {
    if (q.id === 'context') return;
    if (q.showIf && !q.showIf(answers)) return;   // 잔존 답변 누설 방지
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

async function callAcqEngine(body) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  const delays = [1000, 2000, 3000, 4000, 6000, 8000, 10000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const to = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
      const res = await fetch(base + '/v1/calc/acquisition', {
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

function JTReportAcquisition({ setRoute, onBack }) {
  const [step, setStep] = useAcqState(0);
  const [answers, setAnswers] = useAcqState({});
  const [loading, setLoading] = useAcqState(false);
  const [report, setReport] = useAcqState(null);
  const [err, setErr] = useAcqState(null);
  const [phase, setPhase] = useAcqState('quick');
  const [quickReport, setQuickReport] = useAcqState(null);

  React.useEffect(() => {
    const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';
    if (base) { fetch(base + '/health', { method: 'GET' }).catch(function () {}); }
  }, []);

  const allVisible = ACQ_QS.filter(q => !q.showIf || q.showIf(answers));
  const visibleQs = phase === 'quick' ? allVisible.filter(q => q.tier === 'quick') : allVisible.filter(q => q.tier !== 'quick');
  const total = visibleQs.length;
  const safeStep = Math.min(step, total - 1);
  const cur = visibleQs[safeStep];
  const isLast = safeStep === total - 1;
  const setAns = (id, v) => setAnswers(a => ({ ...a, [id]: v }));

  const canNext = () => {
    if (cur.freeform) return true;
    if (cur.numeric) { if (cur.optional) return true; const v = Number(answers[cur.id]); return !isNaN(v) && v > 0; }
    return !!answers[cur.id];
  };

  const runAnalysis = async () => {
    setLoading(true); setErr(null);
    try {
      let calc = { totalTax: fallbackAcqTax(answers), precise: false };
      try {
        const ej = await callAcqEngine(mapAnswersToAcquisition(answers));
        const c = ej && ej.calc;
        if (c) {
          calc.totalTax = c['세액']; calc.acqTax = c['취득세']; calc.eduTax = c['지방교육세'];
          calc.farmTax = c['농어촌특별세'] || 0; calc.taxBase = c['과세표준']; calc.appliedRate = c['적용세율'];
          calc.heavyApplied = c['중과여부']; calc.heavyReason = c['중과사유']; calc.housingNum = c['주택수'];
          calc.reductionType = c['감면유형']; calc.reductionAmt = c['감면금액'] || 0; calc.deadline = c['신고기한'];
          calc.steps = c['단계별계산'] || []; calc.engineWarnings = c['경고사항'] || [];
          calc.precise = true; calc.engineVer = ej.version && ej.version.engine;
        }
      } catch (e) { console.warn('취득세 엔진 연결 실패 — 간이 추정 유지', e); }

      let commentary;
      try {
        if (!(window.claude && window.claude.complete)) throw new Error('claude 미가용');
        const prompt = `너는 한국 세무사다. 아래 취득세 계산을 보고 JSON으로만 답하라.\n취득원인:${answers.acquisitionType} 종류:${answers.propertyType} 가액:${formatWon(Number(answers.propertyValue) || 0)} 총세액:${formatWon(calc.totalTax)}\n{"headline":"한줄요약","cautions":[{"title":"","detail":""}],"saving_ideas":[{"title":"","detail":""}],"followup":["필요자료"]}`;
        const txt = await window.claude.complete(prompt);
        commentary = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]);
      } catch (cErr) {
        commentary = {
          headline: '취득세는 취득 원인·주택 수·조정지역에 따라 세율이 크게 달라집니다.',
          cautions: [
            { title: '신고기한 60일', detail: '취득일부터 60일 이내(증여는 취득일이 속한 달 말일부터 3개월)에 신고·납부해야 합니다. 늦으면 가산세가 붙습니다(지방세법 §20).' },
            { title: '다주택 중과', detail: '조정대상지역 2주택 8%·3주택 이상 12%까지 중과될 수 있어, 보유 주택 수를 정확히 확인해야 합니다(§13의2).' },
            { title: '농어촌특별세·지방교육세', detail: '취득세 외에 지방교육세(취득세의 일부)와, 85㎡ 초과 주택은 농어촌특별세가 추가됩니다.' },
          ],
          saving_ideas: [
            { title: '생애최초·신혼부부 감면', detail: '요건을 충족하면 취득세 감면(최대 200만)을 받을 수 있으니 자격을 확인하세요.' },
            { title: '일시적 2주택', detail: '기존 집을 정해진 기간 내 처분하면 중과 대신 기본세율이 적용될 수 있습니다 — 처분 기한을 꼭 지키세요.' },
          ],
          followup: ['매매계약서(또는 증여·상속 증빙)', '시가표준액(공시가격)', '주민등록등본(세대·주택 수)'],
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
        <JTReportShell title="취득세 계산" subtitle="검증 엔진으로 계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="LEGACY">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />검증된 세금 엔진으로 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc, commentary } = report;
    return (
      <div className="jt-container">
        <JTReportShell title="취득세 계산 결과" subtitle={calc.precise ? '취득세 정밀 계산' : '취득세 간이 계산'} stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LEGACY">
          <div className="jt-report-result__grade jt-grade-mid">
            <div className="jt-report-result__grade-label">{report.quick ? '빠른 예상 취득세(총액)' : (calc.precise ? '총 납부세액 · 정밀 계산 (JT택스랩 엔진)' : '추정 납부세액 · 간이')}</div>
            <div className="jt-report-result__grade-val">{formatWon(calc.totalTax)}</div>
          </div>

          {report.quick && calc.totalTax > 0 && calc.appliedRate && calc.appliedRate !== '-' && (
            <p style={{ textAlign: 'center', margin: '0 0 16px', fontSize: 14, color: 'var(--jt-ink-700,#444)' }}>
              {answers.acquisitionType} · {formatWon(Number(answers.propertyValue) || 0)} · {answers.propertyType} 기준, 적용세율 약 <strong>{calc.appliedRate}</strong>로 계산했어요.
            </p>
          )}

          {!report.quick && answers.acquisitionType === '상속' && (
            <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6 }}>
              무주택 1가구가 1주택을 상속받으면 <strong>0.8% 특례세율</strong>(지방세법 §15①)이 적용될 수 있습니다. 현재 계산은 일반 상속 <strong>2.8%</strong> 기준이니, 해당되면 상담에서 확인하세요.
            </div>
          )}

          {answers.propertyType === '토지' && (
            <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6 }}>
              현재 계산은 <strong>일반 토지 4%</strong> 기준입니다. <strong>농지(전·답·과수원)</strong>는 유상취득 3%·상속 2.3%로 세율이 다르니, 농지라면 상담에서 정확히 확인하세요(지방세법 §11①1호·7호).
            </div>
          )}

          {!calc.precise && (
            <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginBottom: 16, borderRadius: 8 }}>
              정밀 엔진 연결이 지연되어 <strong>간이 추정</strong>(대략 세율)으로 보여드립니다. 다주택 중과·감면·농특세 등 정밀 계산은 엔진 계산에서 반영됩니다 —
              <div style={{ marginTop: 8 }}><button className="jt-btn jt-btn--ghost" onClick={runAnalysis}>정밀 계산 다시 시도 →</button></div>
            </div>
          )}

          {report.quick && (
            <div className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '14px 18px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}>
                <strong>기본 정보로 낸 빠른 예상치예요.</strong> 아래를 반영하면 세액이 크게 달라질 수 있어요 —<br />
                {answers.acquisitionType === '증여'
                  ? '증여 주택이 조정대상지역이고 시가표준액 3억원 이상이면 12%로 중과돼요(일반 3.5%의 3배 이상). 「더 정확히 계산하기」에서 조정지역·시가표준액을 입력해 확인하세요.'
                  : answers.acquisitionType === '상속'
                  ? '무주택 가구가 1주택을 상속받으면 0.8% 특례세율이 적용될 수 있어요(현재는 일반 2.8% 기준).'
                  : answers.acquisitionType === '신축'
                  ? '신축(원시취득)은 보통 표준세율 2.8%예요. 큰 평형(85㎡ 초과)이면 농어촌특별세가 조금 더 붙습니다.'
                  : '큰 평형(85㎡ 초과)이면 세금이 조금 늘고, 생애최초면 최대 200만원 줄어요. 조정지역·주택 수에 따라 중과될 수도 있으니 확인해보세요.'}
              </p>
              <button className="jt-btn jt-btn--primary" onClick={goDetail}>더 정확히 계산하기 →</button>
            </div>
          )}

          {calc.precise && (
            <section className="jt-report-result__section">
              <h3>세금 구성</h3>
              <table className="jt-report-calc">
                <tbody>
                  <tr><th>과세표준</th><td>{formatWon(calc.taxBase)}</td></tr>
                  <tr><th>적용세율{calc.heavyApplied ? ' (중과)' : ''}</th><td>{calc.appliedRate}</td></tr>
                  <tr><th>취득세 본세</th><td>{formatWon(calc.acqTax)}</td></tr>
                  <tr><th>지방교육세</th><td>{formatWon(calc.eduTax)}</td></tr>
                  {calc.farmTax > 0 && <tr><th>농어촌특별세 (85㎡ 초과)</th><td>{formatWon(calc.farmTax)}</td></tr>}
                  {calc.reductionAmt > 0 && <tr><th>감면 ({calc.reductionType})</th><td>− {formatWon(calc.reductionAmt)}</td></tr>}
                  <tr><th><strong>총 납부세액</strong></th><td><strong>{formatWon(calc.totalTax)}</strong></td></tr>
                </tbody>
              </table>
              {calc.heavyApplied && calc.heavyReason && (
                <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginTop: 12, borderRadius: 8 }}>
                  ⚠️ 중과 적용: {calc.heavyReason}. 일시적 2주택 등으로 중과가 빠질 수 있으니 해당되면 상담으로 확인하세요.
                </div>
              )}
              {calc.deadline && <p style={{ fontSize: 13, opacity: 0.8, marginTop: 8 }}>신고·납부 기한: {calc.deadline}</p>}
            </section>
          )}

          {calc.precise && calc.steps && calc.steps.length > 0 && (
            <section className="jt-report-result__section">
              <h3>단계별 계산 (법조문 근거)</h3>
              <table className="jt-report-calc">
                <tbody>
                  {calc.steps.map((s, i) => (
                    <tr key={i}><th>{s['항목']}{s['조문'] ? ` · ${acqFmtArticle(s['조문'])}` : ''}</th><td>{acqFormatStepValue(s['항목'], s['금액'], s['비고'])}</td></tr>
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

          {commentary.cautions && commentary.cautions.length > 0 && (
            <section className="jt-report-result__section">
              <h3>주의 포인트</h3>
              <ol className="jt-report-reasons">
                {commentary.cautions.map((r, i) => (<li key={i}><span className="jt-report-reasons__n">{String(i + 1).padStart(2, '0')}</span><h4>{r.title}</h4><p>{r.detail}</p></li>))}
              </ol>
            </section>
          )}
          {commentary.saving_ideas && commentary.saving_ideas.length > 0 && (
            <section className="jt-report-result__section">
              <h3>절세 여지</h3>
              <ol className="jt-report-reasons">
                {commentary.saving_ideas.map((r, i) => (<li key={i}><span className="jt-report-reasons__n">{String(i + 1).padStart(2, '0')}</span><h4>{r.title}</h4><p>{r.detail}</p></li>))}
              </ol>
            </section>
          )}

          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 16, lineHeight: 1.6 }}>
            본 계산은 입력 정보와 현행 지방세법을 기준으로 한 예상액입니다. 실제 세액은 과세표준(시가표준액)·주택 수·중과·감면 요건에 따라 달라질 수 있으며, 신고기한은 취득일부터 60일(증여는 취득일이 속한 달 말일부터 3개월)입니다. 정확한 신고는 담당 세무사 확인이 필요합니다.
          </p>

          <JTReportConvert
            setRoute={setRoute}
            reportType={calc.precise ? '취득세 정밀 계산' : '취득세 간이 계산'}
            reportTag="LEGACY"
            reportSummary={`총 납부세액 ${formatWon(calc.totalTax)} / ${answers.acquisitionType}·${answers.propertyType} / ${commentary.headline || ''}`}
            reportDetail={buildAcqDetail(answers, calc, commentary)}
            kakaoSummary={buildAcqKakao(answers, calc)}
            urgent={false}
          />
        </JTReportShell>
      </div>
    );
  }

  return (
    <div className="jt-container">
      <JTReportShell title="취득세 계산" subtitle={phase === 'quick' ? '취득 원인·종류·가액만 넣으면 예상 취득세를 바로 보여드려요.' : '면적·조정지역·감면을 반영해 더 정확히 계산합니다.'} stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="LEGACY">
        <div className="jt-report-q">
          {cur.section && <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10, letterSpacing: '0.18em', opacity: 0.6, marginBottom: 8 }}>{cur.section}</div>}
          <h2>{cur.q}</h2>
          {cur.sub && <p className="jt-report-q__sub">{cur.sub}</p>}

          {cur.freeform && (
            <textarea className="jt-report-q__textarea" maxLength={cur.id === 'context' ? 200 : 120}
              placeholder={cur.placeholder || ''} value={answers[cur.id] || ''} onChange={(e) => setAns(cur.id, e.target.value)} />
          )}
          {cur.numeric && (
            <input className="jt-report-q__input" type="text" inputMode="numeric" placeholder={cur.placeholder}
              value={answers[cur.id] ? (cur.money ? Number(answers[cur.id]).toLocaleString('ko-KR') : answers[cur.id]) : ''}
              onChange={(e) => setAns(cur.id, cur.money ? e.target.value.replace(/[^0-9]/g, '') : e.target.value.replace(/[^0-9.]/g, ''))} />
          )}
          {cur.numeric && cur.money && Number(answers[cur.id]) > 0 && (
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600, color: 'var(--accent,#2a6d4f)' }}>= {acqKoreanAmount(answers[cur.id])}</div>
          )}
          {cur.opts && (
            <div className="jt-report-q__opts">
              {cur.opts.map(([v, label, hint]) => {
                const selected = answers[cur.id] === v;
                return (
                  <button key={v} className={`jt-report-q__opt ${selected ? 'is-selected' : ''}`} onClick={() => setAns(cur.id, v)}>
                    <span className="jt-report-q__opt-bullet">{selected ? '●' : '○'}</span>
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
          <button className="jt-btn jt-btn--ghost" onClick={goPrev}>{safeStep === 0 ? '← 허브' : '← 이전'}</button>
          <button className="jt-btn jt-btn--primary" onClick={goNext} disabled={!canNext()}>{isLast ? (phase === 'quick' ? '빠른 결과 보기 →' : '결과 보기 →') : '다음 →'}</button>
        </div>
      </JTReportShell>
    </div>
  );
}

window.JTReportAcquisition = JTReportAcquisition;

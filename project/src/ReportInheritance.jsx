/* @jsx React.createElement */
/* 상속세 계산 — 총상속재산 + 배우자/자녀 + 공제(채무·장례·금융재산·동거주택)·간주상속(보험·퇴직)·사전증여 합산
   엔진: /v1/calc/inheritance (정밀, 상증법 §18~§30). 미응답 시 간이 폴백.
   공통 헬퍼(formatWon·formatStepValue·isValidISODate·JTReportShell·JTReportConvert)는
   ReportCGT/Report/ReportConvert가 먼저 로드되어 전역에 존재 → 재사용(중복 정의 방지). */

const { useState: useInhState } = React;

/* 상속세 기본세율표 (상증법 §26) — 증여세와 동일. 간이 폴백용, 정밀계산은 엔진. */
const INH_BRACKETS = [
  [100_000_000, 0.10, 0],
  [500_000_000, 0.20, 10_000_000],
  [1_000_000_000, 0.30, 60_000_000],
  [3_000_000_000, 0.40, 160_000_000],
  [Infinity, 0.50, 460_000_000],
];
function calcInhBaseTax(taxBase) {
  if (taxBase <= 0) return 0;
  for (const [limit, rate, deduct] of INH_BRACKETS) {
    if (taxBase <= limit) return Math.round(taxBase * rate - deduct);
  }
  return 0;
}
/* 큰 금액 한글 단위(억·만) 보조. */
function inhKoreanAmount(raw) {
  const n = Number(raw) || 0;
  if (n <= 0) return '';
  const units = [[1_0000_0000_0000, '조'], [1_0000_0000, '억'], [1_0000, '만'], [1, '']];
  let rest = n, s = '';
  for (const [u, label] of units) {
    const q = Math.floor(rest / u);
    if (q > 0) { s += q.toLocaleString('ko-KR') + label + ' '; rest -= q * u; }
  }
  return s.trim() + '원';
}

/* 조문 표시 정규화 — 엔진이 일부 조문을 ASCII("SS7", "(1)")로 반환 → §·원문자로 정돈(표시용). */
const INH_CIRCLED = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
function fmtArticle(s) {
  if (!s) return '';
  return String(s)
    .replace(/SS/g, '§')
    .replace(/\((\d{1,2})\)/g, (m, n) => INH_CIRCLED[Number(n)] || m);
}

const INHERITANCE_QS = [
  // ── 빠른 계산 (필수 3문항 → 즉시 예상) ──
  {
    id: 'estateValue',
    tier: 'quick',
    section: '상속재산',
    q: '고인이 남긴 재산은 모두 얼마인가요? (원)',
    sub: '부동산·예금·주식 등을 합한 금액입니다(빚을 빼기 전 총액). 사망보험금·퇴직금, 그리고 10년 내 사전증여한 재산은 뒤에서 따로 여쭤보고 자동 합산하니 여기엔 넣지 마세요(중복 합산 방지). 부동산은 시가(없으면 공시가격)로 평가하는데, 어느 값을 넣느냐에 따라 세액이 수천만 원 달라질 수 있어 정확한 평가는 상담에서 확인해 드립니다. 대략적인 금액이어도 괜찮아요 — 빠른 예상부터 보여드립니다.',
    numeric: true,
    money: true,
    placeholder: '예: 2,000,000,000',
  },
  {
    id: 'hasSpouse',
    tier: 'quick',
    section: '상속인',
    q: '고인의 배우자(남편/아내)가 살아계신가요?',
    sub: '배우자가 계시면 배우자상속공제(최소 5억 ~ 법정상속분 한도 내 최대 30억)가 적용되어 세금이 크게 줄어듭니다(상증법 §19).',
    opts: [
      ['yes', '네, 배우자가 있습니다', '배우자상속공제 최소 5억'],
      ['no', '아니오 (이혼·사별 등)', '일괄공제 5억 적용'],
    ],
  },
  {
    id: 'numChildren',
    tier: 'quick',
    section: '상속인',
    q: '자녀는 몇 명인가요?',
    sub: '법정상속분과 인적공제 계산에 쓰입니다. 손자녀가 대신 상속받는 경우(세대생략)는 상담에서 정밀하게 안내해 드립니다.',
    opts: [
      ['0', '자녀 없음', ''],
      ['1', '1명', ''],
      ['2', '2명', ''],
      ['3', '3명', ''],
      ['4', '4명 이상', ''],
    ],
  },

  // ── 더 정확히 (상세) ──
  {
    id: 'isResident',
    section: '당사자',
    q: '고인이 한국에 사시던 분(거주자)인가요?',
    sub: '세법상 「거주자」(국내에 주소를 두거나 1년에 183일 이상 국내 거주) 여부입니다. 비거주자는 국내 재산만 과세되고 일괄공제 등이 배제되어 계산이 크게 달라집니다. (이 답은 아래 세액 계산에는 반영되지 않으며, 비거주자면 정확한 계산을 상담으로 안내해 드립니다.)',
    opts: [
      ['yes', '네, 한국 거주자였습니다', '정상 공제 적용'],
      ['no', '아니오, 비거주자였습니다', '⚠️ 국내재산만·공제 배제 — 상담 권장'],
    ],
  },
  {
    id: 'debts',
    section: '공제 항목',
    q: '고인이 남긴 빚(채무)이 있나요? (원)',
    sub: '고인 명의의 대출·임대보증금 등 갚아야 할 채무는 상속재산에서 빼줍니다(상증법 §14). 없으면 비워두세요.',
    numeric: true, money: true, optional: true,
    placeholder: '예: 300,000,000',
  },
  {
    id: 'funeralExpenses',
    section: '공제 항목',
    q: '장례비용은 얼마나 드셨나요? (원)',
    sub: '실제 장례비를 봉안시설·자연장지 비용까지 합산해 한 칸에 입력하세요. 합산 최소 500만원~최대 1,500만원까지 공제됩니다(상증령 §9②). 증빙이 없어도 500만원은 인정됩니다. 모르면 비워두세요.',
    numeric: true, money: true, optional: true,
    placeholder: '예: 10,000,000',
  },
  {
    id: 'netFinancialAssets',
    section: '공제 항목',
    q: '예금·주식 등 순금융재산은 얼마인가요? (원)',
    sub: '상속재산 중 금융재산(예금·적금·주식·펀드 등)에서 금융기관 빚을 뺀 금액입니다. 금융재산상속공제(최대 2억)가 적용됩니다(상증법 §22). 이 금액은 위 「총재산」에 이미 포함된 것이며, 추가로 더하지 않고 공제 계산에만 씁니다(중복 가산 아님). 예) 예금 5억 + 주식 1억 − 대출 1억 = 순금융재산 5억. 모르면 비워두셔도 공제만 못 받을 뿐 세액이 틀리지 않습니다.',
    numeric: true, money: true, optional: true,
    placeholder: '예: 500,000,000',
  },
  {
    id: 'insuranceAmount',
    section: '간주상속재산',
    q: '고인의 사망으로 받는 보험금이 있나요? (원)',
    sub: '고인이 보험료를 낸 사망보험금은 상속재산으로 봅니다(간주상속재산, 상증법 §8). 앞의 「총재산」에는 넣지 마시고 여기에만 적어주세요(중복 합산 방지). 없으면 비워두세요.',
    numeric: true, money: true, optional: true,
    placeholder: '예: 100,000,000',
  },
  {
    id: 'retirementPay',
    section: '간주상속재산',
    q: '고인의 퇴직금·퇴직수당이 있나요? (원)',
    sub: '고인에게 지급될 퇴직금·퇴직수당도 상속재산으로 봅니다(상증법 §10). 앞의 「총재산」에는 넣지 마시고 여기에만 적어주세요(중복 합산 방지). 단, 국민연금·공무원연금 등 법정 유족연금은 제외됩니다. 없으면 비워두세요.',
    numeric: true, money: true, optional: true,
    placeholder: '예: 50,000,000',
  },
  {
    id: 'hasCohabitationHouse',
    section: '동거주택',
    q: '고인과 10년 이상 함께 산 자녀(직계비속)가 그 집을 상속받나요?',
    sub: '아래를 모두 충족할 때만 「예」를 고르세요(상증법 §23의2). ①상속개시일까지 10년 이상 계속 한 집에서 동거(상속인이 미성년인 기간 제외) ②그 기간 내내 1세대가 1주택만 보유 ③상속받는 직계비속(또는 그 배우자)이 상속개시일 현재 무주택. 요건이 까다로워 미충족 상태로 공제받으면 추후 추징·가산세 위험이 큽니다. 하나라도 애매하면 「아니오」를 고르고 상담에서 확인하세요. 공제는 최대 6억입니다.',
    opts: [
      ['yes', '네, 해당됩니다', '동거주택상속공제(최대 6억)'],
      ['no', '아니오 / 해당 없음', ''],
    ],
  },
  {
    id: 'cohabitationHouseValue',
    section: '동거주택',
    q: '그 동거주택의 평가액은 얼마인가요? (원)',
    sub: '주택가액(부수토지 포함)에서 담보된 채무를 뺀 금액의 100%, 최대 6억까지 공제됩니다.',
    showIf: (a) => a.hasCohabitationHouse === 'yes',
    numeric: true, money: true, optional: true,
    placeholder: '예: 600,000,000',
  },
  {
    id: 'priorGiftHas',
    section: '사전증여',
    q: '상속인이 고인에게서 최근 10년 내 증여받은 적이 있나요?',
    sub: '상속 개시 전 10년 이내(상속인 외의 사람은 5년) 증여한 재산은 상속재산에 합산됩니다(상증법 §13). 이미 낸 증여세는 공제됩니다. 합산 누락은 가산세 사고로 이어지니 꼭 확인하세요.',
    opts: [
      ['yes', '네, 있습니다', '상속재산에 합산(§13)'],
      ['no', '아니오 / 없습니다', ''],
    ],
  },
  {
    id: 'priorGiftValue',
    section: '사전증여',
    q: '10년 내 증여받은 재산은 모두 얼마인가요? (증여 당시 평가액 · 원)',
    sub: '여러 건이면 합산 금액을 입력하세요. 증여 당시의 평가액 기준입니다.',
    showIf: (a) => a.priorGiftHas === 'yes',
    numeric: true, money: true, optional: true,
    requiredIf: (a) => a.priorGiftHas === 'yes',   // '있음' 선택 시 금액 필수 — 빈칸 방치로 §13 가산 누락(세금 과소) 방지
    placeholder: '예: 100,000,000',
  },
  {
    id: 'priorGiftRelation',
    section: '사전증여',
    q: '그 증여를 받은 분(상속인)은 고인과 어떤 사이였나요?',
    sub: '증여 당시 적용된 증여재산공제(§53)를 가늠해, 이미 낸 증여세를 상속세에서 정확히 빼기(증여세액공제 §28) 위함입니다. 보통 자녀·손자녀가 받았으면 「직계비속」입니다.',
    showIf: (a) => a.priorGiftHas === 'yes',
    opts: [
      ['직계비속', '자녀·손자녀가 받음 (직계비속)', '증여공제 5천만 기준'],
      ['배우자', '배우자가 받음', '증여공제 6억 기준'],
      ['기타', '그 외 친족 등', '증여공제 1천만 기준'],
    ],
  },
  {
    id: 'spouseActual',
    section: '배우자 상속',
    q: '배우자가 실제로 재산을 상속받으시나요?',
    sub: '배우자상속공제는 배우자가 실제 상속받는 금액(법정상속분·최대 30억 한도)까지 공제합니다. 배우자가 전혀 상속받지 않아도 최소 5억은 공제됩니다(상증법 §19). 협의분할로 배우자가 법정상속분보다 더 받기로 하면 공제가 더 커질 수 있어(최대 30억) 그 경우 상담에서 정밀 계산해 드립니다.',
    showIf: (a) => a.hasSpouse === 'yes',
    opts: [
      ['auto', '법정상속분대로 받습니다 (자동 계산)', '배우자 법정상속분만큼 공제'],
      ['zero', '배우자는 상속받지 않습니다', '최소 5억 공제(§19④)'],
    ],
  },
  {
    id: 'context',
    section: '추가 사항',
    q: '추가로 알려주실 내용이 있나요? (선택)',
    sub: '가업상속·영농상속·장애인 상속인·재상속 등 특수한 사정이 있으면 적어주세요. 상담 시 참고합니다.',
    freeform: true,
    optional: true,
    placeholder: '예: 고인이 운영하던 중소기업을 자녀가 승계 / 장애인 자녀 있음 등',
  },
];

/* answers → 엔진 요청 바디 (/v1/calc/inheritance) */
function mapAnswersToInheritance(a) {
  const body = {
    estate_value: Number(a.estateValue) || 0,
    has_spouse: a.hasSpouse === 'yes',
    num_children: Number(a.numChildren) || 0,
  };
  if (Number(a.debts) > 0) body.debts = Number(a.debts);
  if (Number(a.funeralExpenses) > 0) body.funeral_expenses = Number(a.funeralExpenses);
  if (Number(a.netFinancialAssets) > 0) body.net_financial_assets = Number(a.netFinancialAssets);
  if (Number(a.insuranceAmount) > 0) body.insurance_amount = Number(a.insuranceAmount);
  if (Number(a.retirementPay) > 0) body.retirement_pay = Number(a.retirementPay);
  if (a.hasCohabitationHouse === 'yes') {
    body.has_cohabitation_house = true;
    body.cohabitation_house_value = Number(a.cohabitationHouseValue) || 0;
  }
  if (a.priorGiftHas === 'yes' && Number(a.priorGiftValue) > 0) {
    // gift_history(사실입력) 경로 — 엔진이 §58 증여세 산출세액을 자동도출해 §28 증여세액공제를 정상 반영.
    // (prior_gift_values만 보내면 §13 가산만 되고 §28 공제가 0이 되어 상속세가 과대추정됨)
    const pv = Number(a.priorGiftValue);
    const dedByRel = { '배우자': 600000000, '직계비속': 50000000, '기타': 10000000 };
    const ded = Math.min(dedByRel[a.priorGiftRelation] != null ? dedByRel[a.priorGiftRelation] : 50000000, pv);
    body.gift_history = [{ value: pv, deduction_used: ded, is_heir: true }];
  }
  if (a.spouseActual === 'zero') body.spouse_no_inheritance = true;
  return body;
}

/* 상담 전송용 상세 (이메일) */
function buildInhDetail(answers, calc, commentary) {
  const L = ['■ 고객 입력 정보'];
  INHERITANCE_QS.forEach(q => {
    const v = answers[q.id];
    if (v === undefined || v === null || v === '') return;
    let val = v;
    if (q.opts) { const o = q.opts.find(x => x[0] === v); if (o) val = o[1]; }
    else if (q.numeric) val = formatWon(Number(v));
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('  · ' + ql + ': ' + val);
  });
  L.push('', '■ 계산 결과' + (calc.precise ? ' (검증 엔진)' : ' (간이 추정)'));
  L.push('  · 과세표준: ' + formatWon(calc.taxBase));
  L.push('  · 산출세액: ' + formatWon(calc.calcTax));
  L.push('  · 총 납부세액: ' + formatWon(calc.totalTax));
  const ew = calc.engineWarnings || [];
  if (ew.length) { L.push('', '■ 경고'); ew.forEach(w => L.push('  · ' + w)); }
  L.push('', '■ 자동 분석');
  if (commentary.headline) L.push('  요약: ' + commentary.headline);
  (commentary.cautions || []).forEach(c => L.push('  · [주의] ' + c.title + ': ' + c.detail));
  (commentary.saving_ideas || []).forEach(s => L.push('  · [절세] ' + s.title + ': ' + s.detail));
  return L.join('\n');
}

function buildInhKakao(answers, calc) {
  const L = ['[JT택스랩 상속세 계산 — 상담 요청]', '', '▶ 입력'];
  INHERITANCE_QS.forEach(q => {
    if (q.id === 'context') return;
    const v = answers[q.id];
    if (v === undefined || v === null || v === '') return;
    let val = v;
    if (q.opts) { const o = q.opts.find(x => x[0] === v); if (o) val = o[1]; }
    else if (q.numeric) val = formatWon(Number(v));
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('· ' + ql + ': ' + val);
  });
  if (answers.context) L.push('· 추가: ' + answers.context);
  L.push('', '▶ 추정 결과');
  L.push('· 과세표준: ' + formatWon(calc.taxBase));
  L.push('· 총 납부세액: ' + formatWon(calc.totalTax));
  L.push('', '상담 부탁드립니다.');
  return L.join('\n');
}

async function callInhEngine(body) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  // 엔진은 비용절감용 scale-to-zero — 첫 호출은 부팅 대기(수십 초)·503 가능 → 넉넉히 재시도.
  const delays = [1000, 2000, 3000, 4000, 6000, 8000, 10000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const to = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
      const res = await fetch(base + '/v1/calc/inheritance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined,
      });
      if (to) clearTimeout(to);
      if (!res.ok) throw new Error('engine ' + res.status);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < delays.length) await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  throw lastErr;
}

function JTReportInheritance({ setRoute, onBack }) {
  const [step, setStep] = useInhState(0);
  const [answers, setAnswers] = useInhState({});
  const [loading, setLoading] = useInhState(false);
  const [report, setReport] = useInhState(null);
  const [err, setErr] = useInhState(null);
  const [phase, setPhase] = useInhState('quick');
  const [quickReport, setQuickReport] = useInhState(null);

  // 엔진 미리 깨우기(scale-to-zero 콜드스타트 대비) — fire-and-forget.
  React.useEffect(() => {
    const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';
    if (base) { fetch(base + '/health', { method: 'GET' }).catch(function () {}); }
  }, []);

  const allVisible = INHERITANCE_QS.filter(q => !q.showIf || q.showIf(answers));
  const visibleQs = phase === 'quick'
    ? allVisible.filter(q => q.tier === 'quick')
    : allVisible.filter(q => q.tier !== 'quick');
  const total = visibleQs.length;
  const safeStep = Math.min(step, total - 1);
  const cur = visibleQs[safeStep];
  const isLast = safeStep === total - 1;
  const setAns = (id, v) => setAnswers(a => ({ ...a, [id]: v }));

  const canNext = () => {
    if (cur.freeform) return true;
    if (cur.numeric) {
      const mustFill = cur.requiredIf && cur.requiredIf(answers);   // 조건부 필수(예: 사전증여 '있음' 시 금액)
      if (cur.optional && !mustFill) return true;
      const v = Number(answers[cur.id]);
      return !isNaN(v) && v > 0;
    }
    return !!answers[cur.id];
  };

  const runAnalysis = async () => {
    setLoading(true); setErr(null);
    try {
      const estate = Number(answers.estateValue) || 0;
      // 간이 폴백: 일괄공제 5억 + 배우자 최소공제 5억 + 채무·장례 차감
      // 배우자 단독상속(자녀 0)은 일괄공제 배제 → 기초공제 2억만(상증법 §21②) — 과소추정 방지
      const childCount = Number(answers.numChildren) || 0;
      const lumpSum = (answers.hasSpouse === 'yes' && childCount === 0) ? 200_000_000 : 500_000_000;
      const spouseDed = answers.hasSpouse === 'yes' ? 500_000_000 : 0;
      const debts = Number(answers.debts) || 0;
      const funeral = Math.min(Math.max(Number(answers.funeralExpenses) || 0, 5_000_000), 15_000_000);
      const grossInh = estate + (Number(answers.insuranceAmount) || 0) + (Number(answers.retirementPay) || 0);
      const taxableBase = Math.max(grossInh - debts - funeral - lumpSum - spouseDed, 0);
      const baseTax = calcInhBaseTax(taxableBase);
      const filingCredit = Math.round(baseTax * 0.03);
      let calc = {
        taxBase: taxableBase, calcTax: baseTax, filingCredit,
        totalTax: Math.max(baseTax - filingCredit, 0), precise: false,
        nonTaxableMsg: taxableBase === 0 ? '공제 범위 내로 납부할 상속세가 없는 것으로 추정됩니다(정밀 계산 권장).' : null,
      };
      try {
        const ej = await callInhEngine(mapAnswersToInheritance(answers));
        const c = ej && ej.calc;
        if (c) {
          calc.taxBase = c['과세표준']; calc.calcTax = c['산출세액'];
          calc.totalTax = c['세액'];
          calc.deductions = c['주요공제'] || {};
          calc.steps = c['단계별계산'] || [];
          calc.engineWarnings = c['경고사항'] || [];
          calc.precise = true; calc.engineVer = ej.version && ej.version.engine;
          calc.nonTaxableMsg = (c['세액'] === 0) ? '공제 범위 내로 납부할 상속세가 없습니다.' : null;
        }
      } catch (e) { console.warn('상속 엔진 연결 실패 — 간이 추정 유지', e); }

      let commentary;
      try {
        if (!(window.claude && window.claude.complete)) throw new Error('claude 미가용');
        const prompt = `너는 한국 세무사다. 아래 상속 계산을 보고 JSON으로만 답하라.\n총상속재산:${formatWon(estate)} 배우자:${answers.hasSpouse} 자녀:${answers.numChildren} 총세액:${formatWon(calc.totalTax)}\n{"headline":"한줄요약","cautions":[{"title":"","detail":""}],"saving_ideas":[{"title":"","detail":""}],"followup":["필요자료"]}`;
        const txt = await window.claude.complete(prompt);
        commentary = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]);
      } catch (cErr) {
        commentary = {
          headline: '상속세는 배우자·일괄공제와 10년 내 사전증여 합산이 핵심입니다.',
          cautions: [
            { title: '신고기한 6개월', detail: '상속개시일(사망일)이 속한 달의 말일부터 6개월 이내에 신고·납부해야 합니다. 늦으면 가산세가 붙습니다(상증법 §67).' },
            { title: '사전증여 합산', detail: '상속 전 10년(상속인) 이내 증여한 재산은 상속재산에 합산됩니다(§13). 누락하면 추징·가산세 위험이 큽니다.' },
            { title: '배우자상속공제', detail: '배우자가 실제 상속받는 금액(최대 30억)까지 공제되어 절세 효과가 큽니다(§19). 표시 세액은 별도 입력이 없으면 배우자가 법정상속분을 모두 상속받는다고 가정한 값이라, 배우자가 적게 상속받으면 세액이 늘어날 수 있습니다.' },
          ],
          saving_ideas: [
            { title: '배우자 상속분 조정', detail: '배우자상속공제 한도(법정상속분·30억) 내에서 배우자 상속분을 늘리면 1차 상속세를 줄일 수 있습니다(단, 2차 상속까지 함께 설계해야 합니다).' },
            { title: '연부연납·물납', detail: '상속세가 크면 연부연납(분할납부)·물납으로 자금 부담을 나눌 수 있습니다(§71).' },
          ],
          followup: ['고인 재산 목록(부동산·금융)', '채무·장례비 증빙', '가족관계증명서', '10년 내 증여 신고서(있으면)'],
        };
      }

      const rep = { calc, commentary, quick: phase === 'quick' };
      setReport(rep);
      if (phase === 'quick') setQuickReport(rep);
    } catch (e) {
      console.error(e);
      setErr(e.message || '계산 중 오류가 발생했습니다.');
    } finally { setLoading(false); }
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
        <JTReportShell title="상속세 계산" subtitle="검증 엔진으로 계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="LEGACY">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />검증된 세금 엔진으로 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc, commentary } = report;
    const nonResident = answers.isResident === 'no';
    return (
      <div className="jt-container">
        <JTReportShell title="상속세 계산 결과" subtitle={calc.precise ? '상속세 정밀 계산' : '상속세 간이 계산'} stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LEGACY">
          {nonResident && (
            <div className="jt-report-result__section" style={{ background: '#fff4e5', borderLeft: '4px solid #d08b00', padding: '14px 18px', marginBottom: 16 }}>
              ⚠️ 비거주자 상속은 국내 재산만 과세되고 일괄공제 등이 배제되어 계산이 크게 달라집니다. 아래는 거주자 기준 참고치이며, 정확한 계산은 상담으로 안내해 드립니다.
            </div>
          )}
          <div className="jt-report-result__grade jt-grade-mid">
            <div className="jt-report-result__grade-label">{report.quick ? '빠른 예상 상속세' : (calc.precise ? '총 납부세액 · 정밀 계산 (JT택스랩 엔진)' : '추정 납부세액 · 간이')}</div>
            <div className="jt-report-result__grade-val">{formatWon(calc.totalTax)}</div>
          </div>

          {!calc.precise && (
            <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginBottom: 16, borderRadius: 8 }}>
              정밀 엔진 연결이 지연되어 <strong>간이 추정</strong>으로 보여드립니다(일괄공제 5억·배우자 최소공제만 반영). 금융재산·동거주택·사전증여 등 정밀 공제는 엔진 계산에서 반영됩니다 —
              <div style={{ marginTop: 8 }}><button className="jt-btn jt-btn--ghost" onClick={runAnalysis}>정밀 계산 다시 시도 →</button></div>
            </div>
          )}

          {report.quick && (
            <div className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '14px 18px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}>
                <strong>총재산·배우자·자녀만으로 낸 빠른 예상치예요.</strong> 아래를 반영하면 세액이 달라질 수 있어요 —<br />
                채무·장례비 · 금융재산공제 · 동거주택공제 · 10년 내 사전증여(합산) · 배우자 실제 상속분.
              </p>
              <button className="jt-btn jt-btn--primary" onClick={goDetail}>더 정확히 계산하기 →</button>
            </div>
          )}

          <section className="jt-report-result__section">
            <h3>계산 내역</h3>
            <table className="jt-report-calc">
              <tbody>
                <tr><th><strong>과세표준</strong></th><td><strong>{formatWon(calc.taxBase)}</strong></td></tr>
                <tr><th>산출세액</th><td>{formatWon(calc.calcTax)}</td></tr>
                <tr><th><strong>총 납부세액</strong></th><td><strong>{formatWon(calc.totalTax)}</strong></td></tr>
              </tbody>
            </table>
            {calc.nonTaxableMsg && <p style={{ marginTop: 10 }}>{calc.nonTaxableMsg}</p>}
          </section>

          {calc.precise && calc.steps && calc.steps.length > 0 && (
            <section className="jt-report-result__section">
              <h3>단계별 계산 (법조문 근거)</h3>
              <table className="jt-report-calc">
                <tbody>
                  {calc.steps.map((s, i) => (
                    <tr key={i}><th>{s['항목']}{s['조문'] ? ` · ${fmtArticle(s['조문'])}` : ''}</th><td>{formatStepValue(s['항목'], s['금액'])}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {calc.engineWarnings && calc.engineWarnings.length > 0 && (
            <section className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', borderRadius: 8 }}>
              <h3 style={{ marginTop: 0 }}>확인이 필요한 점</h3>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {calc.engineWarnings.map((w, i) => <li key={i} style={{ marginBottom: 4 }}>{w}</li>)}
              </ul>
            </section>
          )}

          {commentary.cautions && commentary.cautions.length > 0 && (
            <section className="jt-report-result__section">
              <h3>주의 포인트</h3>
              <ol className="jt-report-reasons">
                {commentary.cautions.map((r, i) => (
                  <li key={i}><span className="jt-report-reasons__n">{String(i + 1).padStart(2, '0')}</span><h4>{r.title}</h4><p>{r.detail}</p></li>
                ))}
              </ol>
            </section>
          )}
          {commentary.saving_ideas && commentary.saving_ideas.length > 0 && (
            <section className="jt-report-result__section">
              <h3>절세 여지</h3>
              <ol className="jt-report-reasons">
                {commentary.saving_ideas.map((r, i) => (
                  <li key={i}><span className="jt-report-reasons__n">{String(i + 1).padStart(2, '0')}</span><h4>{r.title}</h4><p>{r.detail}</p></li>
                ))}
              </ol>
            </section>
          )}

          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 16, lineHeight: 1.6 }}>
            본 계산은 입력 정보와 현행 세법을 기준으로 한 예상액입니다. 실제 세액은 재산 평가액·상속재산 분할·공제 적용·세법 개정에 따라 달라질 수 있으며, 신고기한은 상속개시일(사망일)이 속한 달의 말일부터 6개월입니다(피상속인 또는 상속인 중 한 분이라도 외국에 주소를 둔 경우 9개월, 신고세액공제 3%). 정확한 신고는 담당 세무사 확인이 필요합니다.
          </p>

          <JTReportConvert
            setRoute={setRoute}
            reportType={calc.precise ? '상속세 정밀 계산' : '상속세 간이 계산'}
            reportTag="LEGACY"
            reportSummary={`총 납부세액 ${formatWon(calc.totalTax)} / 과세표준 ${formatWon(calc.taxBase)} / ${commentary.headline || ''}`}
            reportDetail={buildInhDetail(answers, calc, commentary)}
            kakaoSummary={buildInhKakao(answers, calc)}
            urgent={false}
          />
        </JTReportShell>
      </div>
    );
  }

  // 입력 화면
  return (
    <div className="jt-container">
      <JTReportShell title="상속세 계산" subtitle={phase === 'quick' ? '총재산·가족만 입력하면 예상 상속세를 바로 보여드려요.' : '공제·사전증여 등을 반영해 더 정확히 계산합니다.'} stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="LEGACY">
        <div className="jt-report-q">
          {cur.section && <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10, letterSpacing: '0.18em', opacity: 0.6, marginBottom: 8 }}>{cur.section}</div>}
          <h2>{cur.q}</h2>
          {cur.sub && <p className="jt-report-q__sub">{cur.sub}</p>}

          {cur.freeform && (
            <textarea className="jt-report-q__textarea" maxLength={cur.id === 'context' ? 200 : 120}
              placeholder={cur.placeholder || ''} value={answers[cur.id] || ''}
              onChange={(e) => setAns(cur.id, e.target.value)} />
          )}

          {cur.numeric && (
            <input className="jt-report-q__input" type="text" inputMode="numeric" placeholder={cur.placeholder}
              value={answers[cur.id] ? Number(answers[cur.id]).toLocaleString('ko-KR') : ''}
              onChange={(e) => setAns(cur.id, e.target.value.replace(/[^0-9]/g, ''))} />
          )}
          {cur.numeric && cur.money && Number(answers[cur.id]) > 0 && (
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600, color: 'var(--accent,#2a6d4f)' }}>= {inhKoreanAmount(answers[cur.id])}</div>
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

window.JTReportInheritance = JTReportInheritance;

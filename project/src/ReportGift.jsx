/* @jsx React.createElement */
/* 증여세 계산 — 부동산 중심(현금 직접입력) + 부담부증여 · JS 결정론 + claude 코멘터리 (v1)
   엔진: /v1/calc/gift (일반증여) · /v1/calc/burdened-gift (부담부). 미응답 시 간이 폴백.
   공통 헬퍼(formatWon·isValidISODate·yearsBetween·formatStepValue·ENGINE_BASE)는
   ReportCGT.jsx가 먼저 로드되어 전역에 존재 → 재사용(중복 정의 방지). */

const { useState: useGiftState } = React;

/* 증여세 기본세율표 (상증법 §26, §56) — 간이 폴백용. 정밀계산은 엔진. */
const GIFT_BRACKETS = [
  [100_000_000, 0.10, 0],
  [500_000_000, 0.20, 10_000_000],
  [1_000_000_000, 0.30, 60_000_000],
  [3_000_000_000, 0.40, 160_000_000],
  [Infinity, 0.50, 460_000_000],
];
function calcGiftBaseTax(taxBase) {
  if (taxBase <= 0) return 0;
  for (const [limit, rate, deduct] of GIFT_BRACKETS) {
    if (taxBase <= limit) return Math.round(taxBase * rate - deduct);
  }
  return 0;
}
/* 증여재산공제 (상증법 §53). 미성년 직계비속=2천만 고정. 기타친족=4촌이내혈족·3촌이내인척 1천만. */
function giftDeduction(relationship, isMinor) {
  switch (relationship) {
    case '배우자': return 600_000_000;
    case '직계존속': return isMinor ? 20_000_000 : 50_000_000;  // §53①2호: 직계존속으로부터 수증, 미성년 2천만
    case '직계비속': return 50_000_000;                          // §53①3호: 직계비속으로부터 수증, 미성년 감액 없음
    case '기타친족': return 10_000_000;
    default: return 0; // 비친족
  }
}
/* 큰 금액을 한글 단위(억·만)로 — 0이 많은 숫자 가독성 보조. 예: 800000000 → "8억원" */
function koreanAmount(raw) {
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

const GIFT_QS = [
  {
    id: 'assetType',
    tier: 'quick',
    section: '무엇을 증여하나요',
    q: '증여하는 재산이 무엇인가요?',
    sub: '부동산은 주소를 넣으면 공시가격을 조회해 드립니다(시가가 있으면 직접 입력). 현금·예금은 금액을 바로 입력하세요.',
    opts: [
      ['realestate', '부동산 (주택·토지·상가)', '주소→공시가격 조회 + 시가 직접입력 · 부담부증여 가능'],
      ['cash', '현금·예금·기타', '금액 직접 입력'],
    ],
  },
  // ── 부동산 경로 ──
  {
    id: 'reType',
    tier: 'quick',
    section: '부동산 정보',
    q: '어떤 부동산인가요?',
    showIf: (a) => a.assetType === 'realestate',
    opts: [
      ['공동주택', '아파트·연립·다세대 (공동주택)', '공동주택가격 + 유사매매사례'],
      ['개별주택', '단독·다가구 (개별주택)', '개별주택가격 · 감정평가 권장'],
      ['토지', '토지·나대지', '개별공시지가 · 감정평가 권장'],
      ['상가', '상가·오피스텔·건물', '기준시가 · 감정평가 권장'],
    ],
  },
  {
    id: 'reAddress',
    tier: 'quick',
    section: '부동산 정보',
    q: '부동산 주소를 입력해 주세요. (공동주택은 동·호까지)',
    sub: '도로명주소에 동·호수까지 입력해 주세요. 입력하신 주소로 공시가격을 조회해 드립니다. 시가(최근 실거래가·감정가)를 알고 계시면 아래 「평가액」 칸에 직접 입력하셔도 됩니다.',
    showIf: (a) => a.assetType === 'realestate',
    freeform: true,
    optional: true,
  },
  {
    id: 'giftValue',
    tier: 'quick',
    section: '부동산 정보',
    q: '증여재산 평가액은 얼마인가요? (시가 우선, 없으면 공시가격 · 원)',
    sub: '상증법은 시가(유사매매·감정가)를 우선하고, 없으면 공시가격으로 평가합니다(§60·§61). 단독주택·토지·꼬마빌딩은 공시가격이 시가와 차이가 클 수 있어 감정평가를 권장합니다.',
    showIf: (a) => a.assetType === 'realestate',
    numeric: true,
    money: true,
    placeholder: '예: 800,000,000',
  },
  // ── 현금 경로 ──
  {
    id: 'giftValueCash',
    tier: 'quick',
    section: '증여 금액',
    q: '증여하는 금액은 얼마인가요? (원)',
    showIf: (a) => a.assetType === 'cash',
    numeric: true,
    money: true,
    placeholder: '예: 100,000,000',
  },
  // ── 공통: 당사자 ──
  {
    id: 'isResident',
    section: '당사자',
    q: '재산을 받는 분이 한국에 사는 분인가요?',
    sub: '세법상 「거주자」(국내에 주소를 두거나 1년에 183일 이상 국내 거주) 여부입니다. 외국에 사는 비거주자는 증여재산공제(§53)가 적용되지 않는 등 계산이 크게 달라져, 상담으로 안내해 드립니다.',
    opts: [
      ['yes', '네, 한국에 삽니다 (거주자)', '증여재산공제 적용'],
      ['no', '아니오, 외국에 삽니다 (비거주자)', '⚠️ 공제 배제 등 별도 검토 — 상담 권장'],
    ],
  },
  {
    id: 'relationship',
    tier: 'quick',
    section: '당사자',
    q: '증여하는 분과 받는 분은 어떤 관계인가요? (받는 분 기준)',
    sub: '받는 분(수증자)이 「누구에게서」 받았는지 기준입니다. 10년 합산 증여재산공제 — 배우자 6억 / 부모·조부모(직계존속)에게서 5천만(미성년 2천만) / 자녀·손자녀(직계비속)에게서 5천만 / 기타친족 1천만 / 그 외 0 (상증법 §53).',
    opts: [
      ['배우자', '배우자에게서 받음', '공제 6억'],
      ['직계존속', '부모·조부모(직계존속)에게서 받음', '공제 5천만(미성년 2천만) · 혼인·출산 1억·손자녀 세대생략 가능'],
      ['직계비속', '자녀·손자녀(직계비속)에게서 받음', '공제 5천만'],
      ['기타친족', '기타 친족(형제·사위·며느리 등)에게서 받음', '공제 1천만'],
      ['기타', '친족이 아닌 타인에게서 받음', '공제 없음'],
    ],
  },
  {
    id: 'doneeAge',
    tier: 'quick',
    section: '당사자',
    q: '받는 분(수증자)의 나이는? (만 나이)',
    sub: '만 19세 미만이면 미성년자로, 직계존속(부모·조부모)에게서 받는 증여재산공제가 2천만원으로 줄어듭니다(§53①2호).',
    showIf: (a) => a.relationship === '직계존속',
    numeric: true,
    placeholder: '예: 30',
  },
  // ── 세대생략 (조부모→손자녀 = 손자녀가 직계존속에게서 받음, §57①) ──
  {
    id: 'genSkip',
    section: '특수 상황',
    q: '세대를 건너뛴 증여인가요? (예: 할아버지 → 손자)',
    sub: '자녀를 건너뛰고 손자녀 등에게 증여하면 산출세액의 30%(미성년+20억 초과는 40%)가 할증됩니다(상증법 §57①).',
    showIf: (a) => a.relationship === '직계존속',
    opts: [
      ['yes', '네 (손자녀 등 세대생략)', '30%/40% 할증'],
      ['no', '아니오 (자녀 등 직접 증여)', '할증 없음'],
    ],
  },
  {
    id: 'childDeceased',
    section: '특수 상황',
    q: '건너뛴 그 자녀(받는 분의 부모)가 이미 사망했나요?',
    sub: '대습(代襲) — 자녀가 먼저 사망해 손자녀가 받는 경우엔 세대생략 할증이 면제됩니다(§57① 단서).',
    showIf: (a) => a.genSkip === 'yes' && a.relationship === '직계존속',
    opts: [
      ['yes', '네, 사망했습니다 (대습)', '할증 면제'],
      ['no', '아니오, 생존해 있습니다', '할증 적용'],
    ],
  },
  // ── 혼인·출산 증여공제 (직계존속이 줄 때) ──
  {
    id: 'marriageDed',
    section: '특수 공제',
    q: '혼인일 전후 2년 이내에 직계존속(부모 등)에게서 받는 증여인가요?',
    sub: '혼인 증여공제 — 직계존속 증여에 대해 최대 1억원 추가 공제(상증법 §53의2). 출산공제와 합쳐 1억 한도.',
    showIf: (a) => a.relationship === '직계존속',
    opts: [['yes', '네 (혼인 전후 2년)', '최대 1억 추가공제'], ['no', '아니오', '']],
  },
  {
    id: 'childbirthDed',
    section: '특수 공제',
    q: '자녀 출생·입양일부터 2년 이내에 직계존속에게서 받는 증여인가요?',
    sub: '출산 증여공제 — 최대 1억원 추가 공제. ⚠️ 혼인공제와 합쳐 1억원이 한도입니다(둘 다 받아도 합 1억, §53의2③).',
    showIf: (a) => a.relationship === '직계존속',
    opts: [['yes', '네 (출생·입양 2년 내)', '혼인공제와 합산 1억 한도'], ['no', '아니오', '']],
  },
  // ── 사전증여 (10년 합산) ──
  {
    id: 'priorGiftHas',
    section: '사전증여 이력',
    q: '최근 10년 안에, 같은 분(증여자·직계존속이면 그 배우자 포함)에게서 받은 증여가 있나요?',
    sub: '10년 내 동일인 증여는 합산해 누진세율로 과세합니다(상증법 §47②). 합산 대상은 1천만원 이상 건입니다.',
    opts: [
      ['no', '없음', '합산 없음'],
      ['yes', '있음', '아래에 입력 (여러 건이면 추가)'],
    ],
  },
  {
    id: 'priorGiftValue',
    section: '사전증여 이력',
    q: '사전증여 재산가액 합계는? (가장 최근 건부터, 추가 가능)',
    sub: '10년 내 받은 증여재산가액의 합계를 입력하세요. (여러 건을 정확히 나누려면 상담에서 도와드립니다.)',
    showIf: (a) => a.priorGiftHas === 'yes',
    numeric: true,
    money: true,
    placeholder: '예: 100,000,000',
  },
  {
    id: 'priorGiftDed',
    section: '사전증여 이력',
    q: '그때 적용받은 증여재산공제는? (모르면 비우면 관계별 기본공제로 추정 · 선택)',
    sub: '사전증여 당시 적용받은 공제(예: 직계존비속 5천만·기타친족 1천만 등). 합산 시 이미 낸 증여세를 빼주는 한도(상증법 §58 납부세액공제) 계산에 쓰입니다. ⚠️ 0으로 두면 이 사전증여세액공제가 과다 산정돼 현재 증여세가 실제보다 적게 나올 수 있어, 비워두면 0이 아니라 관계별 기본공제로 추정해 드립니다. 사전증여 당시 혼인·출산공제 등으로 공제가 더 컸다면 정확한 값을 입력하세요.',
    showIf: (a) => a.priorGiftHas === 'yes',
    numeric: true,
    money: true,
    optional: true,
    placeholder: '예: 50,000,000 (모르면 비우면 기본공제 추정)',
  },
  // ── 부담부증여 (부동산) ──
  {
    id: 'isBurdened',
    section: '부담부증여',
    q: '재산과 함께 빚(채무)도 넘기나요? (부담부증여)',
    sub: '전세보증금·담보대출 등 받는 분이 떠안는 채무가 있으면, 그 부분은 「유상 양도」로 보아 증여자에게 양도세가, 나머지는 받는 분에게 증여세가 나옵니다(상증법 §47①).',
    showIf: (a) => a.assetType === 'realestate',
    opts: [
      ['yes', '네, 채무도 함께 넘깁니다', '증여세 + 양도세 + 취득세 통합 계산'],
      ['no', '아니오, 재산만 증여합니다', '일반 증여세만 계산'],
    ],
  },
  {
    id: 'debtAssumed',
    section: '부담부증여',
    q: '받는 분이 인수하는 채무액은? (원)',
    showIf: (a) => a.isBurdened === 'yes',
    numeric: true,
    money: true,
    placeholder: '예: 400,000,000',
  },
  {
    id: 'acqPrice',
    section: '부담부증여',
    q: '증여하는 분이 이 부동산을 처음 취득한 가액은? (증여자 양도세 계산용 · 선택)',
    sub: '받는 분이 인수한 채무(유상 양도분)에 대한 증여자의 양도차익을 계산합니다(소득세법 §97). ⚠️ 증여자가 다주택 등으로 양도세가 과세되는 경우, 이 값을 비우면 취득가 0원으로 보아 양도세가 크게 과대 계상됩니다 — 실제 취득가(또는 환산취득가)를 입력하세요. 증여자가 1세대1주택 비과세면 비워도 됩니다.',
    showIf: (a) => a.isBurdened === 'yes',
    numeric: true,
    money: true,
    optional: true,
    placeholder: '예: 400,000,000',
  },
  {
    id: 'debtObjective',
    section: '부담부증여',
    q: '받는 분이 떠안는 그 빚, 증빙 서류가 있나요?',
    sub: '⚠️ 가족 간(배우자·부모·자녀) 빚 넘기기는 서류로 증명돼야 인정됩니다(상증법 §47③). 증명이 안 되면 빚을 뺀 게 아니라 전체를 증여한 것으로 보아 세금이 더 나올 수 있어요.',
    showIf: (a) => a.isBurdened === 'yes',
    opts: [
      ['objective', '네, 은행 대출이거나 전세계약서·차용증으로 보여줄 수 있어요', '채무 인정 → 양도세 분리'],
      ['subjective', '아니오, 가족끼리 말로 한 빚이에요', '⚠️ 채무 불인정 가능 → 전액 증여 과세'],
    ],
  },
  {
    id: 'donorHouseCount',
    section: '부담부증여',
    q: '증여하는 분이 이 집 외에 보유한 주택은 몇 채인가요? (증여자 양도세 판정용)',
    sub: '증여자가 1세대 1주택이면 채무인수분 양도세가 비과세될 수 있습니다(소득세법 §89). 다주택이면 과세·중과될 수 있습니다. ⚠️ 비워두면 「1주택(비과세)」으로 가정해 양도세가 0원으로 계산됩니다 — 다른 주택이 있으면 반드시 채수를 입력하세요.',
    showIf: (a) => a.isBurdened === 'yes' && (a.reType === '공동주택' || a.reType === '개별주택'),
    numeric: true,
    optional: true,
    placeholder: '예: 0',
  },
  {
    id: 'regulatedArea',
    section: '부담부증여',
    q: '증여 대상 주택이 조정대상지역에 있나요? (취득세 중과 판정용)',
    showIf: (a) => a.isBurdened === 'yes' && (a.reType === '공동주택' || a.reType === '개별주택'),
    sub: '모르시면 「아니오/모름」을 고르세요 — 비조정대상지역(기본 세율)으로 계산되며, 실제 조정대상지역이면 취득세가 중과돼 실제 세액이 더 클 수 있습니다. 정확한 지정 여부는 국토부 고시·관할 시군구로 확인하세요.',
    opts: [['yes', '네, 조정대상지역', '다주택 중과 가능'], ['no', '아니오/모름', '기본 세율']],
  },
  {
    id: 'context',
    section: '추가 정보',
    q: '추가로 알려주실 내용이 있으면 적어주세요.',
    sub: '선택 · 200자 이내. 증여 경위·특이사항 등',
    freeform: true,
  },
];

/* ── 답변 → 엔진 요청 빌더 ───────────────────────────────────────── */
function giftAmount(a) { return Number(a.giftValue || a.giftValueCash) || 0; }

/* 사전증여 당시 공제액(deduction_used)을 산정한다. 입력값이 있으면 그대로,
   비어 있으면 0이 아니라 관계기반 기본공제로 추정한다.
   이유: deduction_used가 작을수록(=0) 사전증여 deemed 증여세산출세액이 커져 상증법 §58
   납부세액공제가 과다 산정되고, 그만큼 현재 증여세가 실제보다 낮아진다(침묵 0 기본값이 세금을
   낮추는 쪽). 빈칸을 관계별 기본공제(§53: 직계존속 5천만 등)로 추정하면 가장 흔한 동일인
   재증여에서 실제와 일치하고, 어긋나더라도 세금을 낮추지 않는 보수적 방향이 된다. 공제는
   사전증여가액을 넘을 수 없어 캡한다. 사용자가 0을 명시 입력하면(비친족 등) 그 값을 존중한다.
   근거: 상증법 §58①(납부세액공제=증여 당시 증여세산출세액) · §53(증여재산공제). */
function priorGiftDeductionUsed(a, priorValue) {
  const provided = a.priorGiftDed != null && String(a.priorGiftDed).trim() !== '';
  if (provided) return { used: Number(a.priorGiftDed) || 0, estimated: false };
  const rel = a.relationship || '직계존속';
  const isMinor = (Number(a.doneeAge) || 30) < 19;
  return { used: Math.min(giftDeduction(rel, isMinor), priorValue), estimated: true };
}

function mapAnswersToGift(a) {
  const body = {
    value: giftAmount(a),
    relationship: a.relationship || '직계존속',
    donee_age: Number(a.doneeAge) || 30,
    is_minor: (Number(a.doneeAge) || 30) < 19,
    is_generation_skip: a.genSkip === 'yes',
    donor_child_deceased: a.childDeceased === 'yes',
    marriage_deduction: a.marriageDed === 'yes',
    childbirth_deduction: a.childbirthDed === 'yes',
  };
  if (a.priorGiftHas === 'yes' && Number(a.priorGiftValue) > 0) {
    const priorValue = Number(a.priorGiftValue) || 0;
    body.gift_history = [{
      value: priorValue,
      deduction_used: priorGiftDeductionUsed(a, priorValue).used,
      is_generation_skip: false,
      is_minor: false,
    }];
  }
  return body;
}

function mapAnswersToBurdenedGift(a) {
  const isHouse = a.reType === '공동주택' || a.reType === '개별주택';
  // 수정 260628(GIFT-R2-04): 상가를 '오피스텔'로 오매핑하던 것을 '상가' enum 직접 전달(비주택 양도·취득세 정상 과세, 소법 §89①3호 비과세 배제).
  const propertyType = a.reType === '토지' ? '토지' : (a.reType === '상가' ? '상가' : '주택');
  const body = {
    property_value: giftAmount(a),
    debt_assumed: Number(a.debtAssumed) || 0,
    acquisition_price: Number(a.acqPrice) || 0,
    relationship: a.relationship || '직계존속',
    donee_age: Number(a.doneeAge) || 30,
    is_objective_debt: a.debtObjective === 'objective',
    property_type: propertyType,
    is_regulated_area: isHouse && a.regulatedArea === 'yes',
    donor_other_house_count: Number(a.donorHouseCount) || 0,
    // 수정 260628(GIFT-R2-01): 세대생략 할증 플래그 누락 보정(§57). 일반 매퍼와 동일 전달.
    is_generation_skip: a.genSkip === 'yes',
    donor_child_deceased: a.childDeceased === 'yes',
  };
  return body;
}

async function callGiftEngine(body, endpoint) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  // 엔진이 비용절감용 scale-to-zero라 한동안 안 쓰면 잠듦. 첫 호출은 부팅을 기다리며 수십 초 걸리거나
  // 부팅 중 503을 반환할 수 있음 → 콜드스타트를 확실히 넘기도록 넉넉히 재시도(누적 ~34초). 한 번 깨면 응답 <1초.
  const delays = [1000, 2000, 3000, 4000, 6000, 8000, 10000]; // 재시도 간 대기(초)
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const to = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;  // 한 시도가 영원히 멈추지 않게
      const res = await fetch(base + endpoint, {
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

/* 주소→상증법 평가 조회 (/v1/lookup/valuation: ①기준값 §15③ 시가 + ②실거래범위 + ③공시하한 §61).
   외부 API(VWORLD) 장애·해외리전 차단 시 success:false(manual_input_required)로 graceful 폴백. */
async function lookupValuation(address, taxType, evalDate) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  const res = await fetch(base + '/v1/lookup/valuation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, tax_type: taxType || '증여', eval_date: evalDate || '' }),
  });
  if (!res.ok) throw new Error('valuation ' + res.status);
  return res.json();
}

/* 상담 전송용 상세 (이메일) */
function buildGiftDetail(answers, calc, commentary) {
  const L = ['■ 고객 입력 정보'];
  GIFT_QS.forEach(q => {
    const v = answers[q.id];
    if (v === undefined || v === null || v === '') return;
    let val = v;
    if (q.opts) { const o = q.opts.find(x => x[0] === v); if (o) val = o[1]; }
    else if (q.numeric) val = q.money ? formatWon(Number(v)) : Number(v).toLocaleString('ko-KR');
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('  · ' + ql + ': ' + val);
  });
  L.push('', '■ 계산 결과' + (calc.precise ? ' (검증 엔진)' : ' (간이 추정)'));
  if (calc.mode === 'burdened') {
    L.push('  · 증여세: ' + formatWon(calc.giftTax));
    L.push('  · 양도세(증여자): ' + formatWon(calc.transferTax));
    L.push('  · 취득세(수증자): ' + formatWon(calc.acqTax));
    L.push('  · 채무비율: ' + Math.round((calc.debtRatio || 0) * 100) + '%');
    if (calc.debtRecognized === false) L.push('  · ⚠️ 채무 불인정 가능 — 전액 증여 과세 위험(§47③)');
    L.push('  · 총 세부담: ' + formatWon(calc.totalTax));
  } else {
    L.push('  · 증여재산가액: ' + formatWon(calc.giftValue));
    if (calc.nonTaxableMsg) L.push('  · ' + calc.nonTaxableMsg);
    L.push('  · 과세표준: ' + formatWon(calc.taxBase));
    L.push('  · 산출세액: ' + formatWon(calc.calcTax));
    if (calc.genSkipSurcharge) L.push('  · 세대생략 할증: ' + formatWon(calc.genSkipSurcharge));
    if (calc.giftCredit) L.push('  · 납부세액공제(사전증여): ' + formatWon(calc.giftCredit));
    L.push('  · 신고세액공제: ' + formatWon(calc.filingCredit));
    L.push('  · 총 세액: ' + formatWon(calc.totalTax));
  }
  const ew = calc.engineWarnings || [];
  if (ew.length) { L.push('', '■ 경고'); ew.forEach(w => L.push('  · ' + w)); }
  L.push('', '■ 자동 분석');
  if (commentary.headline) L.push('  요약: ' + commentary.headline);
  (commentary.cautions || []).forEach(c => L.push('  · [주의] ' + c.title + ': ' + c.detail));
  (commentary.saving_ideas || []).forEach(s => L.push('  · [절세] ' + s.title + ': ' + s.detail));
  return L.join('\n');
}

function buildGiftKakao(answers, calc) {
  const L = ['[JT택스랩 증여세 계산 — 상담 요청]', '', '▶ 입력'];
  GIFT_QS.forEach(q => {
    if (q.id === 'context') return;
    const v = answers[q.id];
    if (v === undefined || v === null || v === '') return;
    let val = v;
    if (q.opts) { const o = q.opts.find(x => x[0] === v); if (o) val = o[1]; }
    else if (q.numeric) val = q.money ? formatWon(Number(v)) : Number(v).toLocaleString('ko-KR');
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('· ' + ql + ': ' + val);
  });
  if (answers.context) L.push('· 추가: ' + answers.context);
  L.push('', '▶ 추정 결과');
  if (calc.mode === 'burdened') {
    L.push('· 증여세 ' + formatWon(calc.giftTax) + ' / 양도세 ' + formatWon(calc.transferTax) + ' / 취득세 ' + formatWon(calc.acqTax));
  }
  L.push('· 총 세부담: ' + formatWon(calc.totalTax));
  L.push('', '상담 부탁드립니다.');
  return L.join('\n');
}

function JTReportGift({ setRoute, onBack }) {
  const [step, setStep] = useGiftState(0);
  const [answers, setAnswers] = useGiftState({});
  const [loading, setLoading] = useGiftState(false);
  const [report, setReport] = useGiftState(null);
  const [err, setErr] = useGiftState(null);
  const [lookupState, setLookupState] = useGiftState({ loading: false, result: null, err: null });
  // 빠른 계산 먼저: 'quick'(필수 5문항→즉시 예상세액) → '더 정확히' → 'detail'(사전증여·부담부·세대생략 등)
  const [phase, setPhase] = useGiftState('quick');
  const [quickReport, setQuickReport] = useGiftState(null);

  // 엔진 미리 깨우기(scale-to-zero 콜드스타트 대비) — 사용자가 문항을 입력하는 동안 엔진을 워밍해 두면
  // 결과 단계에서 정밀계산(단계별 법조문 포함)이 바로 나옴. fire-and-forget.
  React.useEffect(() => {
    const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';
    if (base) { fetch(base + '/health', { method: 'GET' }).catch(function () {}); }
  }, []);

  const allVisible = GIFT_QS.filter(q => !q.showIf || q.showIf(answers));
  // quick 단계 = tier:'quick' 문항만 / detail 단계 = 나머지(상세) 문항만
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
      if (cur.optional) return true;
      const v = Number(answers[cur.id]);
      return !isNaN(v) && v > 0;
    }
    if (cur.date) {
      const v = answers[cur.id] || '';
      const valid = isValidISODate(v);
      if (cur.optional) return v === '' || valid;
      return valid;
    }
    return !!answers[cur.id];
  };

  const doLookup = async () => {
    if (!answers.reAddress) return;
    setLookupState({ loading: true, result: null, err: null });
    try {
      const r = await lookupValuation(answers.reAddress, '증여', answers.giftDate);
      setLookupState({ loading: false, result: r, err: null });
    } catch (e) {
      setLookupState({ loading: false, result: null, err: '주소 자동조회를 할 수 없습니다. 아래 「평가액」 칸에 직접 입력해 주세요.' });
    }
    // 부담부증여 취득세 중과 판정용 — 조정대상지역 자동선택 (주택만, region 획득)
    if (answers.reType === '공동주택' || answers.reType === '개별주택') {
      try {
        const pr = await window.jtLookupPublicPrice(answers.reAddress, answers.reType);
        if (pr && pr.region) setAns('regulatedArea', pr.region.is_adjusted_area ? 'yes' : 'no');
      } catch (e) { /* region 실패 시 질문 유지 */ }
    }
  };

  const runAnalysis = async () => {
    setLoading(true); setErr(null);
    try {
      const isBurdened = answers.isBurdened === 'yes' && answers.assetType === 'realestate';
      const value = giftAmount(answers);
      let calc;

      if (isBurdened) {
        // 부담부: 폴백 간이계산은 복잡 → 엔진 우선, 실패 시 안내
        calc = { mode: 'burdened', giftValue: value, totalTax: 0, precise: false };
        try {
          const ej = await callGiftEngine(mapAnswersToBurdenedGift(answers), '/v1/calc/burdened-gift');
          const c = ej && ej.calc;
          // 수정 260628(GIFT-R2-02): 엔진 오류바디/부분응답을 precise로 신뢰하지 않음(세액0 거짓표시 방지).
          if (c && !c['오류'] && c['총세부담'] != null && c['증여세'] != null && c['양도세'] != null && c['취득세'] != null) {
            calc.giftTax = c['증여세']; calc.transferTax = c['양도세']; calc.acqTax = c['취득세'];
            calc.totalTax = c['총세부담']; calc.debtRatio = c['채무비율']; calc.debtRecognized = c['채무인정여부'];
            calc.engineWarnings = c['경고사항'] || [];
            calc.steps = (c['원본결과'] && c['원본결과'].steps_summary) || c['단계별계산'] || [];
            calc.precise = true; calc.engineVer = ej.version && ej.version.engine;
          } else if (c) { calc.engineErr = true; console.warn('부담부증여 엔진 응답 무결성 실패', c); }
        } catch (e) { calc.engineErr = true; }
      } else {
        // 일반증여: 간이 폴백
        const isMinor = (Number(answers.doneeAge) || 30) < 19;
        const ded = giftDeduction(answers.relationship, isMinor);
        const prior = answers.priorGiftHas === 'yes' ? (Number(answers.priorGiftValue) || 0) : 0;
        const taxableBase = Math.max(value + prior - ded, 0);
        const baseTax = calcGiftBaseTax(taxableBase);
        const filingCredit = Math.round(baseTax * 0.03);
        calc = {
          mode: 'gift', giftValue: value, taxBase: taxableBase, calcTax: baseTax,
          genSkipSurcharge: 0, giftCredit: 0, filingCredit, totalTax: Math.max(baseTax - filingCredit, 0),
          precise: false, nonTaxableMsg: taxableBase === 0 ? '증여재산공제 범위 내로 납부할 증여세가 없습니다.' : null,
        };
        try {
          const ej = await callGiftEngine(mapAnswersToGift(answers), '/v1/calc/gift');
          const c = ej && ej.calc;
          // 수정 260628(GIFT-R2-02): 엔진 오류바디/부분응답 검증 — 미충족 시 간이폴백 유지.
          if (c && !c['오류'] && c['과세표준'] != null && c['산출세액'] != null && c['세액'] != null) {
            calc.taxBase = c['과세표준']; calc.calcTax = c['산출세액'];
            calc.genSkipSurcharge = c['세대생략할증'] || 0; calc.filingCredit = c['신고세액공제'] || 0;
            calc.totalTax = c['세액'];
            const mj = c['주요공제'] || {};
            calc.giftValue = mj['증여재산가액'] != null ? mj['증여재산가액'] : value;
            calc.giftCredit = mj['납부세액공제'] || 0;
            calc.nonTaxableMsg = c['비과세여부'] ? '증여재산공제 범위 내로 납부할 증여세가 없습니다(과세최저한).' : null;
            calc.steps = c['단계별계산'] || [];
            calc.engineWarnings = c['경고사항'] || [];
            calc.precise = true; calc.engineVer = ej.version && ej.version.engine;
          }
        } catch (e) { console.warn('증여 엔진 연결 실패 — 간이 추정 유지', e); }
      }

      // Claude 코멘터리 (실패해도 폴백)
      let commentary;
      try {
        if (!(window.claude && window.claude.complete)) throw new Error('claude 미가용');
        const prompt = `너는 한국 세무사다. 아래 증여 계산을 보고 JSON으로만 답하라.\n관계:${answers.relationship} 재산:${formatWon(value)} 부담부:${isBurdened} 총세부담:${formatWon(calc.totalTax)}\n{"headline":"한줄요약","cautions":[{"title":"","detail":""}],"saving_ideas":[{"title":"","detail":""}],"followup":["필요자료"]}`;
        const txt = await window.claude.complete(prompt);
        commentary = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]);
      } catch (cErr) {
        commentary = {
          headline: isBurdened ? '부담부증여는 증여세·양도세·취득세가 함께 발생합니다.' : '증여세는 10년 합산·관계별 공제가 핵심입니다.',
          cautions: [
            { title: '10년 합산', detail: '같은 분께 10년 내 받은 증여는 합산 과세됩니다(§47②). 과거 증여를 빠뜨리지 마세요.' },
            isBurdened ? { title: '채무 입증', detail: '가족 간 채무는 객관적 입증서류가 없으면 인정되지 않아 전액 증여로 과세될 수 있습니다(§47③).' }
                       : { title: '평가액', detail: '단독주택·토지는 공시가격보다 시가(감정가)가 높게 평가될 수 있어 감정평가 검토가 필요합니다.' },
          ],
          saving_ideas: [{ title: '분산 증여', detail: '10년 단위 분산·수증자 분산으로 누진세율을 낮출 수 있습니다.' }],
          followup: ['등기부등본', '가족관계증명서', '과거 증여 신고서(있으면)'],
        };
      }

      const rep = { calc, commentary, isBurdened, quick: phase === 'quick' };
      setReport(rep);
      if (phase === 'quick') setQuickReport(rep);
    } catch (e) {
      console.error(e);
      setErr(e.message || '계산 중 오류가 발생했습니다.');
    } finally { setLoading(false); }
  };

  // '더 정확히 계산하기' — 빠른 결과에서 상세 단계로 진입
  const goDetail = () => { setReport(null); setPhase('detail'); setStep(0); };

  const goNext = () => { if (isLast) runAnalysis(); else setStep(s => s + 1); };
  const goPrev = () => {
    if (safeStep > 0) { setStep(s => s - 1); return; }
    if (phase === 'detail') { setPhase('quick'); setStep(0); setReport(quickReport); return; }  // 상세 첫 문항에서 뒤로 → 빠른 결과로
    onBack();
  };

  if (loading) {
    return (
      <div className="jt-container">
        <JTReportShell title="증여세 계산" subtitle="검증 엔진으로 계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="LIVE">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />검증된 세금 엔진으로 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc, commentary, isBurdened } = report;
    const nonResident = answers.isResident === 'no';
    // 사전증여 공제를 입력하지 않아 관계기반 기본공제로 추정 적용한 경우 → 결과화면에 캐비엇 노출
    const priorDedEstimated = !isBurdened && calc.precise &&
      answers.priorGiftHas === 'yes' && Number(answers.priorGiftValue) > 0 &&
      priorGiftDeductionUsed(answers, Number(answers.priorGiftValue) || 0).estimated;
    return (
      <div className="jt-container">
        <JTReportShell title="증여세 계산 결과" subtitle={isBurdened ? '부담부증여 (증여세+양도세+취득세)' : (calc.precise ? '증여세 정밀 계산' : '증여세 간이 계산')} stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
          {nonResident && (
            <div className="jt-report-result__section" style={{ background: '#fff4e5', borderLeft: '4px solid #d08b00', padding: '14px 18px', marginBottom: 16 }}>
              ⚠️ 비거주자 증여는 증여재산공제 배제 등 계산이 크게 달라집니다. 아래는 거주자 기준 참고치이며, 정확한 계산은 상담으로 안내해 드립니다.
            </div>
          )}
          <div className="jt-report-result__grade jt-grade-mid">
            <div className="jt-report-result__grade-label">{report.quick ? '빠른 예상 세부담' : (calc.precise ? '총 세부담 · 정밀 계산 (JT택스랩 엔진)' : (calc.engineErr ? '엔진 연결 실패 — 재시도 필요' : '추정 총 세부담 · 간이'))}</div>
            <div className="jt-report-result__grade-val" style={calc.engineErr ? { fontSize: 22 } : undefined}>{calc.engineErr ? '정밀 계산 필요' : formatWon(calc.totalTax)}</div>
          </div>

          {calc.engineErr && (
            <div style={{ background: '#fdeeec', borderLeft: '4px solid #c0392b', padding: '12px 16px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6 }}>
              부담부증여는 <strong>증여세 + 양도세 + 취득세</strong>가 함께 발생해 간이 계산으로는 정확히 추정할 수 없습니다(<strong>0원이 아닙니다</strong>). 정밀 엔진 연결이 지연됐으니 잠시 후 다시 시도하거나 상담을 권합니다.
              <div style={{ marginTop: 8 }}><button className="jt-btn jt-btn--ghost" onClick={runAnalysis}>정밀 계산 다시 시도 →</button></div>
            </div>
          )}

          {!calc.precise && !calc.engineErr && (
            <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginBottom: 16, borderRadius: 8 }}>
              정밀 엔진 연결이 지연되어 <strong>간이 추정</strong>으로 보여드립니다. <strong>세대생략(손주 증여) 할증·10년 내 사전증여 합산</strong>은 간이추정에서 누락돼 실제보다 적게 나올 수 있으니 정밀 계산을 권합니다 —
              <div style={{ marginTop: 8 }}><button className="jt-btn jt-btn--ghost" onClick={runAnalysis}>정밀 계산 다시 시도 →</button></div>
            </div>
          )}

          {report.quick && (
            <div className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '14px 18px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}>
                <strong>관계·금액만으로 낸 빠른 예상치예요.</strong> 아래를 반영하면 세액이 달라질 수 있어요 —<br />
                10년 내 사전증여(합산) · 부담부(빚도 함께 넘김) · 세대생략(손주 증여) · 혼인·출산 공제.
              </p>
              <button className="jt-btn jt-btn--primary" onClick={goDetail}>더 정확히 계산하기 →</button>
            </div>
          )}

          {isBurdened ? (
            <section className="jt-report-result__section">
              <h3>세금 구성 (부담부증여)</h3>
              {calc.engineErr ? (
                <p>정밀 계산에 연결하지 못했습니다. 부담부증여는 정확한 계산이 중요하니 상담을 권합니다.</p>
              ) : (
                <table className="jt-report-calc">
                  <tbody>
                    <tr><th>증여세 (받는 분 · §47)</th><td>{formatWon(calc.giftTax)}</td></tr>
                    <tr><th>양도세 (증여자 · 채무인수분)</th><td>{formatWon(calc.transferTax)}</td></tr>
                    <tr><th>취득세 (받는 분)</th><td>{formatWon(calc.acqTax)}</td></tr>
                    <tr><th><strong>총 세부담</strong></th><td><strong>{formatWon(calc.totalTax)}</strong></td></tr>
                    <tr><th>채무 인수 비율</th><td>{Math.round((calc.debtRatio || 0) * 100)}%</td></tr>
                  </tbody>
                </table>
              )}
              {calc.debtRecognized === false && (
                <div style={{ background: '#fdecea', borderLeft: '4px solid #d14e3a', padding: '12px 16px', marginTop: 12 }}>
                  ⚠️ 가족 간 채무로 객관적 입증이 어려워 <strong>채무가 인정되지 않을 수 있습니다</strong>(§47③). 이 경우 전액 증여로 과세되니, 채무부담계약서·이자지급내역·금융기관 대출 증빙을 준비하세요.
                </div>
              )}
            </section>
          ) : (
            <section className="jt-report-result__section">
              <h3>계산 내역</h3>
              <table className="jt-report-calc">
                <tbody>
                  <tr><th>증여재산가액</th><td>{formatWon(calc.giftValue)}</td></tr>
                  <tr><th><strong>과세표준</strong></th><td><strong>{formatWon(calc.taxBase)}</strong></td></tr>
                  <tr><th>산출세액</th><td>{formatWon(calc.calcTax)}</td></tr>
                  {calc.genSkipSurcharge > 0 && <tr><th>세대생략 할증 (§57)</th><td>+ {formatWon(calc.genSkipSurcharge)}</td></tr>}
                  {calc.giftCredit > 0 && <tr><th>납부세액공제 (사전증여 §58)</th><td>− {formatWon(calc.giftCredit)}</td></tr>}
                  <tr><th>신고세액공제 (§69, 3%)</th><td>− {formatWon(calc.filingCredit)}</td></tr>
                  <tr><th><strong>총 세액</strong></th><td><strong>{formatWon(calc.totalTax)}</strong></td></tr>
                </tbody>
              </table>
              {calc.nonTaxableMsg && <p style={{ marginTop: 10 }}>{calc.nonTaxableMsg}</p>}
              {priorDedEstimated && (
                <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginTop: 12, borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
                  ※ 사전증여 당시 공제액을 입력하지 않아 <strong>관계별 기본공제(직계존속 5천만 등)로 추정</strong>해 납부세액공제(§58)를 계산했습니다. 실제 당시 공제액이 이와 다르면(혼인·출산공제로 더 컸던 경우 등) 세액이 달라질 수 있으니, 정확한 값을 입력하거나 상담으로 확인하세요.
                </div>
              )}
              {(answers.marriageDed === 'yes' && answers.childbirthDed === 'yes') && (
                <p style={{ fontSize: 13, opacity: 0.85, marginTop: 8 }}>※ 혼인·출산 증여공제는 <strong>합쳐서 1억원이 한도</strong>입니다(§53의2③).</p>
              )}
            </section>
          )}

          {calc.precise && calc.steps && calc.steps.length > 0 && (
            <section className="jt-report-result__section">
              <h3>단계별 계산 (법조문 근거)</h3>
              <table className="jt-report-calc">
                <tbody>
                  {calc.steps.map((s, i) => (
                    <tr key={i}><th>{s['항목']}{s['조문'] ? ` · ${s['조문']}` : ''}</th><td>{formatStepValue(s['항목'], s['금액'])}</td></tr>
                  ))}
                </tbody>
              </table>
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
            본 계산은 입력 정보와 현행 세법을 기준으로 한 예상액입니다. 실제 세액은 사실관계·평가액·세법 개정에 따라 달라질 수 있으며, 신고기한은 증여일이 속한 달의 말일부터 3개월입니다(신고세액공제 3%). 정확한 신고는 담당 세무사 확인이 필요합니다.
          </p>

          <JTReportConvert
            setRoute={setRoute}
            reportType={isBurdened ? '부담부증여 통합 계산' : (calc.precise ? '증여세 정밀 계산' : '증여세 간이 계산')}
            reportTag="LEGACY"
            reportSummary={`총 세부담 ${formatWon(calc.totalTax)}${isBurdened ? ' (부담부)' : ' / 과세표준 ' + formatWon(calc.taxBase)} / ${commentary.headline || ''}`}
            reportDetail={buildGiftDetail(answers, calc, commentary)}
            kakaoSummary={buildGiftKakao(answers, calc)}
            urgent={false}
          />
        </JTReportShell>
      </div>
    );
  }

  // 입력 화면
  return (
    <div className="jt-container">
      <JTReportShell title="증여세 계산" subtitle={phase === 'quick' ? '관계·금액만 입력하면 예상 증여세를 바로 보여드려요.' : '사전증여·부담부 등을 반영해 더 정확히 계산합니다.'} stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="LIVE">
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
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600, color: 'var(--accent,#2a6d4f)' }}>= {koreanAmount(answers[cur.id])}</div>
          )}

          {cur.date && (
            <input className="jt-report-q__input" type="text" inputMode="numeric" placeholder="예: 2024-06-01 (숫자 8자리)"
              value={answers[cur.id] || ''}
              onChange={(e) => {
                let d = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
                if (d.length > 6) d = d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
                else if (d.length > 4) d = d.slice(0, 4) + '-' + d.slice(4);
                setAns(cur.id, d);
              }} />
          )}

          {!cur.freeform && !cur.numeric && !cur.date && cur.opts && (
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

          {/* 주소 평가 보조 패널 (reAddress 질문에서만) — ①기준값(§15③ 시가) + ②실거래범위 + ③공시하한(§61) */}
          {cur.id === 'reAddress' && (() => {
            const R = lookupState.result;
            const base = R && R.기준값 || {};
            const range = R && R.실거래_범위 || {};
            const floor = R && R.공시하한 || {};
            return (
            <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--bg-1,#f7f5f0)', borderRadius: 8 }}>
              <button className="jt-btn jt-btn--ghost" disabled={!answers.reAddress || lookupState.loading}
                onClick={doLookup}>{lookupState.loading ? '조회 중… (최초 10~30초 소요)' : '주소로 시가·공시가격 조회'}</button>

              {/* 성공: ① 기준값 + ② 실거래 범위 + ③ 공시하한 */}
              {R && R.success && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ padding: '10px 12px', background: '#fff', borderRadius: 8, border: '1px solid var(--line,#e6e2d8)' }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>① 신고 기준값 — {base.방법}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <strong style={{ fontSize: 18 }}>{formatWon(base.금액_원)}</strong>
                      <button className="jt-btn jt-btn--primary" style={{ fontSize: 13 }}
                        onClick={() => setAns('giftValue', String(base.금액_원))}>이 금액 사용</button>
                    </div>
                    {base.선택거래 && (
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        선택 실거래: {base.선택거래.거래일} · 전용 {base.선택거래.전용면적_m2}㎡ · {formatWon(base.선택거래.거래가_원)}
                      </div>
                    )}
                  </div>
                  {range.건수 > 0 && (
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      ② 같은 단지·평형 실거래 <strong>{range.건수}건</strong>: {formatWon(range.최저_원)} ~ {formatWon(range.최고_원)}
                      {range.최신 && <span style={{ opacity: 0.7 }}> (최신 {range.최신.거래일})</span>}
                    </div>
                  )}
                  {floor.금액_원 != null && (
                    <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>
                      ③ 공시가격(법정 하한 §61): {formatWon(floor.금액_원)}
                    </div>
                  )}
                  {(R.warnings || []).map((w, i) => (
                    <p key={i} style={{ fontSize: 12, color: '#b97d2a', marginTop: 6 }}>⚠ {w}</p>
                  ))}
                  <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>※ {R.면책 || R.disclaimer}</p>
                </div>
              )}

              {/* 조회 결과 자동평가 불가(manual_input_required) — 친절 폴백 + ①②③ 설명 */}
              {R && !R.success && (
                <div style={{ marginTop: 10, fontSize: 13 }}>
                  <p style={{ color: '#b97d2a', margin: 0 }}>ℹ 주소 자동평가는 현재 준비 중입니다. 아래 「평가액」 칸에 시가(유사매매·감정가) 또는 공시가격을 직접 입력해 주세요.</p>
                  <p style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                    참고 — 상증법 평가는 ① <strong>시가(유사매매사례가액 §15③)</strong>를 우선하고, 없으면 ③ <strong>공시가격(§61, 법정 하한)</strong>으로 평가합니다. 같은 단지·평형의 ② 최근 실거래는 홈택스 '유사매매사례가액 조회'에서 확인하실 수 있습니다.
                  </p>
                </div>
              )}

              {lookupState.err && <p style={{ fontSize: 13, color: '#d14e3a', marginTop: 8 }}>{lookupState.err}</p>}
            </div>
            );
          })()}
        </div>

        <div className="jt-report-q__nav">
          <button className="jt-btn jt-btn--ghost" onClick={goPrev}>{safeStep === 0 ? '← 허브' : '← 이전'}</button>
          <button className="jt-btn jt-btn--primary" onClick={goNext} disabled={!canNext()}>{isLast ? (phase === 'quick' ? '빠른 결과 보기 →' : '결과 보기 →') : '다음 →'}</button>
        </div>
      </JTReportShell>
    </div>
  );
}

window.JTReportGift = JTReportGift;

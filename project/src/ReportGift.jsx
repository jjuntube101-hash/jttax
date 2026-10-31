/* @jsx React.createElement */
/* 증여세 계산 — 부동산 중심(현금 직접입력) + 부담부증여 · JS 결정론 + claude 코멘터리 (v1)
   엔진: /v1/calc/gift (일반증여) · /v1/calc/burdened-gift (부담부).
   261004: 일반증여 화면에는 자체 계산식(폴백)이 없다. 금액은 엔진이 준 값뿐이고, 엔진 값이 없으면
   금액 필드가 «없는» calc 가 되어 차단 화면으로 간다(아래 giftCalcFromEngine·giftFallbackGaps).
   모르는 사실은 «보내지 않는다»(키 생략) — 엔진이 가정을 경고사항([확인 필요])으로 알린다.
   공통 헬퍼(formatWon·isValidISODate·yearsBetween·formatStepValue·ENGINE_BASE)는
   ReportCGT.jsx가 먼저 로드되어 전역에 존재 → 재사용(중복 정의 방지). */

const { useState: useGiftState } = React;

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
  {id: 'giftDate', tier: 'quick', section: '증여 시점', q: '증여일은 언제인가요?', sub: '해당 날짜의 연도로 계산합니다. 지원하지 않는 과거 조건은 확인 안내가 표시됩니다.', date: true},
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
    q: '부동산 주소를 선택해 주세요.',
    sub: '주소를 검색해 선택하고, 공동주택은 아래에서 동·호를 따로 입력하세요. 시가(최근 실거래가·감정가)를 알고 계시면 「평가액」 칸에 직접 입력하셔도 됩니다.',
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
    /* ★ quick 으로 올린 이유는 상속세와 같다 — 상세에만 두면 빠른 계산에서 undefined 라
       차단이 안 걸리고 «증여재산공제를 받은» 금액이 정밀 계산으로 나갔다 (Codex P0). */
    tier: 'quick',
    section: '당사자',
    q: '재산을 받는 분이 한국에 사는 분인가요?',
    sub: '세법상 「거주자」(국내에 주소를 두거나 1년에 183일 이상 국내 거주) 여부입니다. 외국에 사는 비거주자는 증여재산공제(§53)가 적용되지 않아 계산이 크게 달라집니다. 계산 엔진이 아직 거주자 기준만 지원하므로, 비거주자를 고르시면 «틀린 금액을 보여 드리지 않기 위해» 금액 대신 상담 안내를 드립니다.',
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
    sub: '10년 내 동일인 증여는 합산해 누진세율로 과세합니다(상증법 §47②). 같은 분에게 받은 가액의 합계가 1천만원 이상이면 합산합니다.',
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
    showIf: (a) => a.priorGiftHas === 'yes' && !a.giftDate,
    numeric: true,
    money: true,
    optional: true,
    placeholder: '예: 50,000,000 (모르면 비우면 기본공제 추정)',
  },
  ...[
    ['historicalPriorValues','사전증여별 재산가액을 오래된 순서대로 입력하세요.','예: 150000000, 50000000'],
    ['historicalPriorTaxes','같은 순서로 각 사전증여의 실제 산출세액을 입력하세요.','신고세액공제 전 산출세액입니다. 예: 10000000, 10000000'],
    ['historicalPriorDeductions','같은 순서로 당시 일반 증여재산공제액을 입력하세요.','혼인·출산공제와 섞지 마세요. 예: 50000000, 0']
  ].map(([id,q,sub])=>({id,section:'과거 사전증여 사실',q,sub:sub+' 원 단위 정수를 쉼표로 구분합니다. 없으면 0을 명시하세요.',freeform:true,showIf:a=>a.priorGiftHas==='yes' && a.giftDate && a.giftDate.slice(0,4)<'2026'})),
  {
    id: 'priorGroupDeductionUsed', section: '사전증여 공제 확인',
    q: '최근 10년간 같은 공제그룹에서 이미 받은 일반 증여재산공제의 합계는 얼마인가요?',
    sub: '이번 증여 전 사용액입니다. 부모·조부모는 직계존속 그룹으로 함께 확인합니다. 합산 대상 증여에서 받은 공제도 포함하고, 혼인·출산공제는 제외하세요. 공제받은 적이 없으면 0을 입력하고, 모르면 비워 두세요.',
    showIf: a => a.giftDate && a.giftDate.slice(0,4) === '2026' && ['배우자','직계존속','직계비속','기타친족'].includes(a.relationship),
    numeric: true, money: true, blockOnBlank: true, placeholder: '없으면 0 · 모르면 비움',
  },
  {
    id: 'priorGiftOrdinaryDeduction', section: '사전증여 공제 확인',
    q: '위 합산 대상 사전증여에서 실제 적용받은 일반 증여재산공제 합계는 얼마인가요?',
    sub: '같은 공제그룹 전체 사용액 중 위 사전증여에 해당하는 금액만 입력하세요. 혼인·출산공제는 아래에서 따로 입력합니다. 없으면 0, 모르면 비워 두세요.',
    showIf: a => a.giftDate && a.giftDate.slice(0,4) === '2026' && a.priorGiftHas === 'yes',
    numeric: true, money: true, blockOnBlank: true, placeholder: '없으면 0 · 모르면 비움',
  },
  {
    id: 'priorGiftMarriageChildDeduction', section: '사전증여 공제 확인',
    q: '위 합산 대상 사전증여에서 실제 적용받은 혼인·출산공제 합계는 얼마인가요?',
    sub: '일반 증여재산공제와 구분한 실제 사용액입니다. 적용받지 않았으면 0, 모르면 비워 두세요.',
    showIf: a => a.giftDate && a.giftDate.slice(0,4) === '2026' && a.priorGiftHas === 'yes' && a.relationship === '직계존속',
    numeric: true, money: true, blockOnBlank: true, placeholder: '없으면 0 · 모르면 비움',
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
    id: 'acqDate',
    section: '부담부증여',
    q: '증여하는 분이 이 부동산을 취득한 날은? (잔금일 또는 등기접수일 · 증여자 양도세 계산용)',
    sub: '채무 인수분(유상양도)의 양도세는 보유기간으로 갈립니다 — 단기 보유 세율과 장기보유특별공제, 1세대1주택 비과세가 날짜 단위로 달라지므로 「몇 년쯤」이 아니라 취득일을 넣어 주세요. 모르면 비워 두고 다음으로 가세요: 취득일을 짐작해 계산하지 않고, 확인이 필요하다는 안내로 넘어갑니다. 숫자 8자리로 입력하면 자동 정리됩니다 (예: 20160903 → 2016-09-03).',
    showIf: (a) => a.isBurdened === 'yes',
    date: true,
    blockOnBlank: true,
  },
  {
    id: 'acqPrice',
    section: '부담부증여',
    q: '증여하는 분이 이 부동산을 취득한 가액은? (증여자 양도세 계산용)',
    sub: '받는 분이 인수한 채무(유상 양도분)에 대한 증여자의 양도차익을 계산합니다(소득세법 §97). 취득가액은 양도차익의 핵심이라 짐작해 계산하지 않습니다 — 등기부등본·매매계약서로 확인해 입력하세요. 모르면 비워 두고 다음으로 가세요: 환산취득가액 등 확인이 필요하다는 안내로 넘어갑니다.',
    showIf: (a) => a.isBurdened === 'yes',
    numeric: true,
    money: true,
    blockOnBlank: true,
    placeholder: '예: 400,000,000 (모르면 비움)',
  },
  {
    id: 'debtObjective',
    section: '부담부증여',
    q: '받는 분이 떠안는 그 빚, 증빙 서류가 있나요?',
    sub: '⚠️ 가족 간(배우자·부모·자녀) 빚 넘기기는 서류로 증명돼야 인정됩니다(상증법 §47③). 증명이 안 되면 빚을 뺀 게 아니라 전체를 증여한 것으로 보아 세금이 더 나올 수 있어요. 모르면 「모름」을 고르세요 — 서류로 확인되는지 짐작해 계산하지 않고, 확인이 필요하다는 안내가 나옵니다.',
    showIf: (a) => a.isBurdened === 'yes',
    opts: [
      ['objective', '네, 은행 대출이거나 전세계약서·차용증으로 보여줄 수 있어요', '채무 인정 → 양도세 분리'],
      ['subjective', '아니오, 가족끼리 말로 한 빚이에요', '⚠️ 채무 불인정 가능 → 전액 증여 과세'],
      ['unknown', '모름', '세무사 확인 필요 — 금액을 표시하지 않음'],
    ],
  },
  {
    id: 'donorHouseCount',
    section: '부담부증여',
    q: '증여하는 분의 「세대」가 이 부동산 외에 보유한 주택은 몇 채인가요? (증여자 양도세 판정용)',
    sub: '본인뿐 아니라 같은 세대의 배우자 등이 가진 주택까지 셉니다. 증여자 세대가 1세대 1주택이면 채무인수분 양도세가 비과세될 수 있습니다(소득세법 §89). 다주택이면 과세·중과될 수 있습니다. ⚠️ 비워두면 증여자의 다른 주택 수를 알 수 없어 금액을 확정하지 않고 확인을 요청합니다 — 다른 주택이 없으면 0 을 입력하세요.',
    showIf: (a) => a.isBurdened === 'yes' && (a.reType === '공동주택' || a.reType === '개별주택'),
    numeric: true,
    optional: true,
    placeholder: '예: 0',
  },
  {
    id: 'regulatedAtAcq',
    section: '부담부증여',
    q: '증여하는 분이 그 주택을 「취득할 당시」, 그곳이 조정대상지역이었나요?',
    sub: '취득할 당시 조정대상지역에 있던 주택은, 1세대1주택 비과세를 받으려면 보유 기간 중 2년 이상 거주해야 합니다(소득세법 시행령 §154①). 지금의 지정 여부와는 다른 질문입니다. 모르면 「모름」을 고르세요 — 어느 쪽이었는지를 정해서 계산하지 않고, 조정대상지역이었던 경우와 아니었던 경우를 모두 계산해 결과가 같으면 그대로 보여 드리고 달라지면 확인(취득 당시 지역·거주 여부)을 요청드립니다.',
    // 증여자 세대에 다른 주택이 없고(1주택) 취득일이 2017-08-03 이후인 주택에만 묻는다 — 다주택이면 거주 요건이 결과를 가르지 않는다.
    // 이 화면에는 앞 문항을 바꿀 때 딸린 답을 지우는 패턴이 없으므로, 요청 변환(mapAnswersToBurdenedGift)과 차단 판정이 같은 조건(giftAsksZoneAtAcq)을 다시 확인한다.
    showIf: (a) => giftAsksZoneAtAcq(a),
    opts: [['yes', '네, 조정대상지역이었습니다', '거주 2년 요건 적용'], ['no', '아니오', ''], ['unknown', '모름', '결과가 갈리면 확인 요청']],
  },
  {
    id: 'moveInDate',
    section: '부담부증여',
    q: '증여하는 분이 그 주택에 들어가 살기 시작한 날(전입일)은? (선택)',
    sub: '거주 기간은 1세대1주택 비과세의 거주 요건과 장기보유특별공제율에 반영됩니다. 그날부터 지금까지 계속 거주한 것으로 계산합니다. 실제로 살지 않았으면 비워 두세요. 숫자 8자리로 입력하면 자동 정리됩니다.',
    showIf: (a) => giftBurdenedHouse(a),
    date: true,
    optional: true,
  },
  {
    id: 'regulatedArea',
    section: '부담부증여',
    q: '증여 대상 주택이 조정대상지역에 있나요? (취득세 중과 판정용)',
    showIf: (a) => a.isBurdened === 'yes' && (a.reType === '공동주택' || a.reType === '개별주택'),
    sub: '모르시면 「모름」을 고르세요 — 어느 쪽으로도 짐작해 계산하지 않고, 지정 여부를 확인하라는 안내가 나옵니다. 정확한 지정 여부는 국토부 고시·관할 시군구로 확인하세요.',
    opts: [['yes', '네, 조정대상지역', '다주택 중과 가능'], ['no', '아니오', '기본 세율'], ['unknown', '모름', '확인 전에는 금액을 확정하지 않음']],
  },
  {"id": "appraisalFee", "section": "추가 계산 입력", "q": "공제 대상 감정평가 수수료 (원)", "sub": "감정평가액으로 신고하는 등 공제 요건을 확인한 수수료만 입력하세요.", "numeric": true, "money": true, "optional": true, showIf: (a) => a.isBurdened!=='yes'},
  {"id": "foreignTaxPaid", "section": "추가 계산 입력", "q": "외국에서 부과된 증여세 (원)", "sub": "외국 과세표준과 함께 입력해야 공제 한도를 계산합니다.", "numeric": true, "money": true, "optional": true, showIf: (a) => a.isBurdened!=='yes'},
  {"id": "foreignTaxBase", "section": "추가 계산 입력", "q": "해당 재산의 외국 법령상 과세표준 (원)", "sub": "국내 평가액이 아닌 외국에서 실제 적용한 과세표준입니다.", "numeric": true, "money": true, "optional": true, showIf: (a) => a.isBurdened!=='yes' && Number(a.foreignTaxPaid)>0},
  {"id": "nonTaxable", "section": "추가 계산 입력", "q": "증여재산 중 확인된 비과세 재산가액 (원)", "sub": "앞에서 입력한 총재산에 포함된 비과세 금액만 입력하세요. 증여재산공제와 다릅니다.", "numeric": true, "money": true, "optional": true, showIf: (a) => a.isBurdened!=='yes'},
  {"id": "priorMarriageChildUsed", "section": "추가 계산 입력", "q": "이미 사용한 혼인·출산 증여재산공제 합계 (원)", "sub": "이번 증여 이전의 사용액입니다. 사전증여 기본공제와 구분해 입력하세요.", "numeric": true, "money": true, "optional": true, showIf: (a) => a.isBurdened!=='yes' && a.relationship==='직계존속' && (a.marriageDed==='yes'||a.childbirthDed==='yes')},
  {
    id: 'context',
    section: '추가 정보',
    q: '추가로 알려주실 내용이 있으면 적어주세요.',
    sub: '선택 · 200자 이내. 증여 경위·특이사항 등',
    freeform: true,
  },
];

/* ── 답변 → 엔진 요청 빌더 ───────────────────────────────────────── */
function giftAmount(a) { return Number(a.assetType === 'cash' ? a.giftValueCash : a.giftValue) || 0; }

/* 사전증여 공제액 입력란을 «채웠는가» — 비우면 total_deduction_used 키를 보내지 않는다.
   비운 경우 엔진이 「한도 안에서 최초 증여부터 순차로 공제한 것」으로 보고 계산하며 경고를 붙인다
   (화면이 관계별 기본공제로 추정하던 종전 로직은 삭제). 사용자가 0을 명시 입력하면 그 값을 존중한다. */
function giftPriorDedGiven(a) {
  return a.priorGiftDed != null && String(a.priorGiftDed).trim() !== '';
}

/* 답 저장 — 순수 함수(시험 대상). 앞 문항이 바뀌면 그 답에 딸린 부담부증여 답을 지운다(최적화 화면의 bgApplyAnswer 와 같은 취지, 261011):
   · 취득일·증여자 세대의 다른 주택 수·부담부 여부·부동산 유형이 바뀌면 취득 당시 조정대상지역·전입일 — 묻는 조건이 달라지므로 낡은 답이 새 사실로 실리지 않게
   · 인수 채무액이 바뀌면 객관적 채무 답 — 그 답은 «그 채무»에 대한 것이었다
   · 부동산 유형·주소·동·호가 바뀌면 그 부동산에 딸린 답(평가액·인수 채무액·객관적 채무·취득일·취득가액·조정대상지역·전입일·취득 당시 지역·증여자 세대 주택 수)
   같은 값을 다시 고르거나 무관한 문항을 바꾸면 지우지 않는다. */
function giftApplyAnswer(a, id, v) {
  const next = Object.assign({}, a);
  next[id] = v;
  if (a[id] !== v) {
    if (id === 'acqDate' || id === 'donorHouseCount' || id === 'isBurdened' || id === 'reType' || id === 'assetType') { delete next.regulatedAtAcq; delete next.moveInDate; }
    if (id === 'debtAssumed') delete next.debtObjective;
    // 관계·증여일·이력 선택이 달라지면 이전 범위에서 확인한 공제액을 재사용하지 않는다.
    if (['relationship','giftDate','priorGiftHas','priorGiftValue'].includes(id)) {
      for (const key of ['priorGroupDeductionUsed','priorGiftOrdinaryDeduction','priorGiftMarriageChildDeduction','priorGiftDed',
          'historicalPriorValues','historicalPriorTaxes','historicalPriorDeductions']) delete next[key];
      if (id === 'relationship' || id === 'giftDate') { delete next.priorGiftHas; delete next.priorGiftValue; }
    }
    // 부동산을 가리키는 답(유형·주소·동·호)이 바뀌면 «그 부동산»에 딸린 답을 모두 지운다 — 평가액·인수 채무액·객관적 채무·취득일·취득가액·조정대상지역·전입일·취득 당시 지역,
    //   그리고 «이 부동산 외» 기준인 증여자 세대 주택 수. (공시가격 기준 연도 reYear 는 같은 부동산의 조회 조건이라 지우지 않는다.)
    if (id === 'reType' || id === 'reAddress' || id === 'reDong' || id === 'reHo') {
      for (const k of ['regulatedAtAcq', 'moveInDate', 'regulatedArea', 'acqDate', 'acqPrice', 'donorHouseCount', 'giftValue', 'debtAssumed', 'debtObjective']) delete next[k];
    }
  }
  return next;
}
/* 오늘(로컬) YYYY-MM-DD — 전입일이 미래인지 판정한다 */
function giftTodayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* 부담부증여(단건) 보조 판정 — 문항 표시 조건과 요청 변환·차단 판정이 «같은 함수»를 쓴다(이 화면에는 딸린 답을 지우는 패턴이 없다). */
function giftBurdenedHouse(a) {
  return a.isBurdened === 'yes' && a.assetType === 'realestate' && (a.reType === '공동주택' || a.reType === '개별주택');
}
/* 취득 당시 조정대상지역을 묻는 경우: 부담부증여 주택 + 증여자 세대에 다른 주택이 없음(0 을 입력) + 취득일 ≥ 2017-08-03(엔진의 거주 요건 기준일) */
function giftAsksZoneAtAcq(a) {
  const n = a.donorHouseCount;
  return giftBurdenedHouse(a) && n !== undefined && n !== null && String(n).trim() !== '' && Number(n) === 0
    && typeof a.acqDate === 'string' && isValidISODate(a.acqDate) && a.acqDate >= '2017-08-03';
}

/* 폴백 차단 판정 — «렌더»가 아니라 «분석 단계»에서 쓰라고 모듈 스코프로 뺐다.
   화면에서 금액을 가려도 그 전에 AI 프롬프트가 세액을 외부로 보내고 있었다
   (260806 Codex P0). runAnalysis 가 엔진 응답 직후 이 함수로 먼저 판정하고,
   렌더도 같은 함수를 쓴다 — 규칙이 두 벌이 되면 반드시 어긋난다.
   두 층이다: ① 입력 불확정(calc.precise 와 무관) ② 엔진 값 없음(calc.precise 가 거짓이면 항상 한 건).
   261004: 이 화면에는 자체 계산식(폴백)이 없다 — 「폴백이 못 다루는 입력」(세대생략·혼인출산공제·사전증여)을
   막던 규칙은 함께 지웠다(엔진이 직접 계산하거나, 못 하면 ②층이 어떤 입력이든 막는다). */
function giftFallbackGaps(answers, calc) {
  /* ★ engineErr(부담부증여 엔진 실패)를 «예외»로 빼 두면 안 된다 — 화면은 금액을 숨기지만
     그 앞의 AI 프롬프트에 「총세부담: 0원」이 나가고, JTReportConvert 도 그대로 렌더돼
     클립보드·Web3Forms 로 0원이 흘러간다 (260806 Codex P0 재현). 금액을 숨기는 상태는
     전송도 함께 막아야 한다. 화면 문구는 아래 why 가 그대로 이어받는다. */
  if (calc.engineErr) {
    return ['부담부증여는 «증여세 + 양도세 + 취득세»가 함께 발생해 간이 계산으로는 추정할 수 없습니다(0원이 아닙니다). 정밀 엔진 연결이 지연됐으니 잠시 후 다시 시도하거나 상담으로 확인해 주세요.'];
  }
  /* «아니오»만 보면 미입력이 새어 나간다 — 거주자라고 «확인된» 경우만 계산한다. */
  const nonResident = answers.isResident !== 'yes';
  /* ── ① 엔진도 «못 푸는» 입력 — precise 여도 막는다 ───────────────────────
     mapAnswersToGift 는 거주자 여부를 아예 보내지 않는다(260806 확인). 비거주자는
     증여재산공제가 통째로 배제되는데, 그대로 두면 «공제받은» 금액이 정밀 계산으로 나온다. */
  /* 부담부증여(단건): 증여자의 취득일·취득가액은 양도세(세율·장기보유특별공제·비과세·양도차익)를 가른다 — 모르면(빈칸·0) 엔진을 부르지 않고 막는다(261011) */
  const burdened = answers.isBurdened === 'yes' && answers.assetType === 'realestate';
  const currentHistory = !burdened && answers.giftDate && answers.giftDate.slice(0,4) === '2026';
  const groupRequired = currentHistory && ['배우자','직계존속','직계비속','기타친족'].includes(answers.relationship);
  const unknown = window.jtFallbackGaps([
    { when: currentHistory && !['yes','no'].includes(answers.priorGiftHas),
      why: '최근 10년간 같은 증여자의 사전증여 여부를 확인해 주세요. 미확인은 없음으로 계산하지 않습니다.' },
    { when: groupRequired && (answers.priorGroupDeductionUsed == null || String(answers.priorGroupDeductionUsed).trim() === ''),
      why: '같은 공제그룹의 최근 10년간 일반 증여재산공제 사용액을 확인해 주세요. 없으면 0을 입력하세요.' },
    { when: burdened && !isValidISODate(answers.acqDate || ''),
      why: '증여하는 분의 취득일을 모르면 세무사 확인이 필요합니다 — 보유기간이 채무 인수분 양도세의 세율·장기보유특별공제·1세대1주택 비과세를 가릅니다. 등기부등본으로 취득일(잔금일 또는 등기접수일)을 확인해 입력해 주세요.' },
    { when: burdened && answers.debtObjective === 'unknown',
      why: '넘기려는 채무가 금융기관 대출·전세보증금처럼 객관적으로 확인되는지 모르면 세무사 확인이 필요합니다. 가족 간 채무는 객관적으로 확인되어야 인정됩니다(상증법 §47③).' },
    { when: burdened && giftAsksZoneAtAcq(answers) && !['yes', 'no', 'unknown'].includes(answers.regulatedAtAcq),
      why: '증여하는 분이 그 주택을 취득할 당시 조정대상지역이었는지 선택해 주세요(모르면 「모름」).' },
    { when: burdened && giftBurdenedHouse(answers) && (answers.moveInDate || '') !== ''
        && (!isValidISODate(answers.moveInDate) || (isValidISODate(answers.acqDate || '') && answers.moveInDate < answers.acqDate) || answers.moveInDate > giftTodayISO()),
      why: '전입일을 다시 확인해 주세요 — 취득일부터 오늘 사이의 실제 날짜여야 합니다(살지 않았으면 비워 두세요).' },
    { when: burdened && !(Number(answers.acqPrice) > 0),
      why: '증여하는 분의 취득가액을 모르면 환산취득가액 등 확인이 필요하므로 상담을 권합니다 — 채무 인수분 양도세는 취득가액에 따라 크게 달라지는데, 이 계산기는 취득가액을 짐작해 계산하지 않습니다.' },
    { when: nonResident,
      why: '받는 분의 거주자 여부가 «거주자»로 확인되지 않았습니다 — 비거주자는 증여재산공제(배우자 6억·직계 5천만 등)가 배제됩니다. 계산 엔진이 아직 거주자 기준만 지원해 금액을 표시하지 않습니다(상담에서 정확히 안내해 드립니다).' },
  ]);
  /* ── ② 엔진 값이 없으면 어떤 입력이든 막는다 ──────────────────────────────
     이 화면에는 자체 계산식이 없으므로 «엔진이 준 금액»이 없으면 보여 줄 금액이 없다.
     사유는 «엔진이 거부했다(refused)»와 «연결하지 못했다(down·미지정)» 둘이다. */
  if (!burdened && (currentHistory || answers.priorGiftHas === 'yes')) {
    try { mapAnswersToGift(answers); }
    catch (e) { unknown.push(e.message); }
  }
  if (calc.precise) return unknown;
  const engineMsg = window.jtEngineMessageForDisplay(calc.engineMessage);   // 식별자·개발자용 꼬리말을 뗀 표시용 문구(261011)
  return unknown.concat([calc.engineState === 'refused'
    ? (engineMsg
      ? '엔진 안내: ' + engineMsg
      : '입력하신 조건은 이 계산기가 금액을 확정할 수 없는 경우입니다 — 세무사 확인이 필요합니다.')
    : '계산 엔진에 연결하지 못했습니다 — 연결되지 않은 상태에서는 금액을 표시하지 않습니다.']);
}

/* 일반증여 엔진 요청. 모르는 사실은 «보내지 않는다»(키 생략):
   · relationship — 답한 값 그대로(답이 없으면 생략 → 엔진이 거부)
   · donee_age — 나이 문항(직계존속일 때만 보인다)에 답한 경우에만. is_minor 는 보내지 않는다(엔진이 나이로 판정)
   · is_generation_skip — 세대생략 문항(직계존속일 때만 보인다)에 답한 경우에만. 빠른 단계에서는 문항이 없으므로 생략
   · gift_history — 합계 1건. total_deduction_used 는 입력란을 채운 경우에만 */
function mapAnswersToGift(a) {
  const body = { value: giftAmount(a) };
  if (a.giftDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.giftDate) || isNaN(Date.parse(a.giftDate)) || new Date(a.giftDate).toISOString().slice(0,10) !== a.giftDate) throw new Error('실제 증여일을 입력해 주세요.');
    body.tax_year = Number(a.giftDate.slice(0,4));
  }
  if (a.relationship) body.relationship = a.relationship;
  const groupGiven = body.tax_year === 2026 && ['배우자','직계존속','직계비속','기타친족'].includes(a.relationship)
    && a.priorGroupDeductionUsed != null && String(a.priorGroupDeductionUsed).trim() !== '';
  if (groupGiven) {
    if (!['string','number'].includes(typeof a.priorGroupDeductionUsed) || !Number.isSafeInteger(Number(a.priorGroupDeductionUsed)) || Number(a.priorGroupDeductionUsed) < 0)
      throw new Error('공제그룹 사용액은 0 이상의 원 단위 정수로 입력해 주세요.');
    body.prior_deduction_used = Number(a.priorGroupDeductionUsed);
  }
  /* 보이지 않는 문항의 낡은 답(관계를 바꾸기 전에 답한 것)은 보내지 않는다 */
  const lineal = a.relationship === '직계존속';
  const ageAnswered = lineal && a.doneeAge != null && String(a.doneeAge).trim() !== '' && Number.isFinite(Number(a.doneeAge));
  if (ageAnswered) body.donee_age = Number(a.doneeAge);
  const skipAnswer = lineal && (a.genSkip === 'yes' || a.genSkip === 'no') ? a.genSkip : undefined;
  if (skipAnswer) {
    body.is_generation_skip = skipAnswer === 'yes';
    if (skipAnswer === 'yes') body.donor_child_deceased = a.childDeceased === 'yes';
  }
  /* 혼인·출산공제 문항도 직계존속일 때만 보인다 — 관계를 바꾸기 전의 낡은 답을 보내지 않는다 */
  body.marriage_deduction = lineal && a.marriageDed === 'yes';
  body.childbirth_deduction = lineal && a.childbirthDed === 'yes';
  if (a.priorGiftHas === 'yes') {
    if (!['string','number'].includes(typeof a.priorGiftValue) || !Number.isSafeInteger(Number(a.priorGiftValue)) || Number(a.priorGiftValue) <= 0)
      throw new Error('사전증여가 있으면 재산가액 합계를 양의 원 단위 정수로 입력해 주세요.');
    const item = { value: Number(a.priorGiftValue) };
    /* 화면 문항은 「그때 적용받은 공제」를 한 칸으로 묻는다 — §53 공제와 혼인·출산공제(§53의2)가 섞인 합계일 수 있어
       엔진의 deduction_used(§53 공제만, 한도 초과 시 거부)가 아니라 total_deduction_used(구분 모름 합계)로 보낸다.
       두 키를 함께 보내면 엔진이 거부한다. */
    if (body.tax_year === 2026) {
      const fields = [['priorGiftOrdinaryDeduction','deduction_used']];
      if (lineal) fields.push(['priorGiftMarriageChildDeduction','marriage_child_deduction_used']);
      for (const [key, field] of fields) {
        const raw = a[key];
        if (!['string','number'].includes(typeof raw) || String(raw).trim() === '' || !Number.isSafeInteger(Number(raw)) || Number(raw) < 0)
          throw new Error('사전증여의 일반공제와 혼인·출산공제 사용액을 구분해 확인해 주세요. 없으면 0을 입력하세요.');
        item[field] = Number(raw);
      }
      if (item.deduction_used + (item.marriage_child_deduction_used || 0) > item.value)
        throw new Error('사전증여 공제액 합계가 재산가액보다 큽니다.');
      if (groupGiven && item.deduction_used > body.prior_deduction_used)
        throw new Error('공제그룹 전체 사용액은 합산 대상 사전증여의 일반공제액 이상이어야 합니다.');
    } else if (!a.giftDate && giftPriorDedGiven(a)) {
      if (!['string','number'].includes(typeof a.priorGiftDed) || !Number.isSafeInteger(Number(a.priorGiftDed)) || Number(a.priorGiftDed) < 0)
        throw new Error('사전증여 공제액은 0 이상의 원 단위 정수로 입력해 주세요.');
      item.total_deduction_used = Number(a.priorGiftDed);
    }
    /* 같은 증여자에게서 받은 증여이므로 세대생략 여부는 이번 증여와 같다 */
    item.is_generation_skip = skipAnswer === 'yes';
    /* 지금 19세 미만이면 10년 내 사전증여 당시에도 미성년자였다(할증률 40% 판정에 쓰인다, R1-F2).
       지금 성년이면 당시 미성년이었는지 알 수 없어 보내지 않는다. */
    if (ageAnswered && Number(a.doneeAge) < 19) item.is_minor = true;
    item.donor_child_deceased = skipAnswer === 'yes' && a.childDeceased === 'yes';
    if (body.tax_year >= 2020 && body.tax_year < 2026) {
      const lists=['historicalPriorValues','historicalPriorTaxes','historicalPriorDeductions'].map(key=>{
        const parts=String(a[key]||'').split(',').map(x=>x.trim());
        if(parts.some(x=>!/^\d+$/.test(x)) || parts.some(x=>!Number.isSafeInteger(Number(x)))) throw new Error('각 사전증여의 가액·실제 산출세액·일반 공제액을 같은 순서의 원 단위 정수로 입력해 주세요.');
        return parts.map(Number);
      });
      if(lists.some(x=>x.length!==lists[0].length) || lists[0].reduce((sum,x)=>sum+x,0)!==Number(a.priorGiftValue)) throw new Error('사전증여별 입력 건수를 맞추고 재산가액 합계가 앞선 합계와 같은지 확인해 주세요.');
      [body.prior_gift_values,body.prior_gift_taxes,body.prior_gift_deductions]=lists;
    } else body.gift_history = [item];
  }
  for (const [key,field] of [["appraisalFee", "appraisal_fee"], ["foreignTaxPaid", "foreign_tax_paid"], ["nonTaxable", "non_taxable"]]) {
    if(a[key]==null || String(a[key]).trim()==='') continue;
    const n=Number(a[key]); if(!Number.isSafeInteger(n)||n<0) throw new Error('추가 금액은 0 이상의 정수로 입력해 주세요.');
    body[field]=n;
  }
  if(body.foreign_tax_paid>0) {
    const n=Number(a.foreignTaxBase);
    if(a.foreignTaxBase==null || String(a.foreignTaxBase).trim()==='' || !Number.isSafeInteger(n)||n<=0) throw new Error('외국납부세액 공제를 위해 외국 과세표준을 입력해 주세요.');
    body.foreign_tax_base=n;
  }
  if(lineal && (body.marriage_deduction || body.childbirth_deduction) && a.priorMarriageChildUsed!=null && String(a.priorMarriageChildUsed).trim()!=='') {
    const n=Number(a.priorMarriageChildUsed); if(!Number.isSafeInteger(n)||n<0||n>100000000) throw new Error('기사용 혼인·출산공제를 0~1억원 사이로 입력해 주세요.');
    body.prior_marriage_child_deduction_used=n;
  }

  return body;
}

/* 부담부증여 엔진 요청 (261011 계약 정합). 모르는 사실은 «보내지 않는다»(키 생략) — 엔진이 모름을 입력 보완(needs_input)으로 돌려준다:
   · relationship — 답한 값 그대로(답이 없으면 생략 → 엔진이 입력 보완을 요구한다. 종전 「직계존속」 기본값 대체 삭제)
   · is_regulated_area — 주택에서 「네」·「아니오」로 답한 경우에만. 「모름」·미응답·주택이 아닌 경우는 생략(종전엔 「아니오/모름」이 false 로 갔다)
   · donor_other_house_count — 주택에서 숫자(0 이상)를 입력한 경우에만. 비움이면 생략(종전엔 0채로 갔다)
   · acquisition_date·acquisition_price — 증여자의 취득일·취득가액을 답한 경우에만(빈칸·0 은 생략; giftFallbackGaps 가 엔진 호출 전에 막는다)
   · is_objective_debt — 답한 경우에만(모름·미응답은 생략). is_generation_skip·donor_child_deceased — 관계가 직계존속일 때만
   · regulated_at_acquisition·move_in_date — 묻는 경우(giftAsksZoneAtAcq / 주택)에 답한 값만 */
function mapAnswersToBurdenedGift(a) {
  if (a.giftDate && !isValidISODate(a.giftDate)) throw new Error("실제 증여일을 입력해 주세요.");
  const isHouse = a.reType === '공동주택' || a.reType === '개별주택';
  // 수정 260628(GIFT-R2-04): 상가를 '오피스텔'로 오매핑하던 것을 '상가' enum 직접 전달(비주택 양도·취득세 정상 과세, 소법 §89①3호 비과세 배제).
  const propertyType = a.reType === '토지' ? '토지' : (a.reType === '상가' ? '상가' : '주택');
  const body = {
    property_value: giftAmount(a),
    ...(a.giftDate ? {gift_date:a.giftDate} : {}),
    debt_assumed: Number(a.debtAssumed) || 0,
    ...(Number(a.acqPrice) > 0 ? { acquisition_price: Number(a.acqPrice) } : {}),   // 빈칸·0 은 보내지 않는다(결과 단계 이전에 giftFallbackGaps 가 막는다)
    ...(isValidISODate(a.acqDate || '') ? { acquisition_date: a.acqDate } : {}),
    ...(a.relationship ? { relationship: a.relationship } : {}),
    donee_age: Number(a.doneeAge) || 30,
    property_type: propertyType,
  };
  // 객관적 채무(§47③): 답한 경우에만 — 객관적 → true, 아니오 → false, 모름·미응답은 키 없음(모름은 giftFallbackGaps 가 엔진 호출 전에 막는다)
  if (a.debtObjective === 'objective') body.is_objective_debt = true;
  else if (a.debtObjective === 'subjective') body.is_objective_debt = false;
  // 수정 260628(GIFT-R2-01): 세대생략 할증 플래그 누락 보정(§57). 세대생략 문항은 직계존속일 때만 보이므로, 관계를 바꾼 뒤 숨겨진 낡은 답이
  //   다른 관계의 요청에 실리지 않게 직계존속일 때만 보낸다(261011).
  if (a.relationship === '직계존속') {
    body.is_generation_skip = a.genSkip === 'yes';
    body.donor_child_deceased = a.genSkip === 'yes' && a.childDeceased === 'yes';
  }
  // 취득 당시 조정대상지역(증여자 1주택·주택·기준일 이후 취득일 때만 묻는다): 「예/아니오」만 보내고 «모름»은 키 없음(엔진이 두 값으로 대조 계산)
  if (giftAsksZoneAtAcq(a) && (a.regulatedAtAcq === 'yes' || a.regulatedAtAcq === 'no')) body.regulated_at_acquisition = a.regulatedAtAcq === 'yes';
  // 전입일: 주택에서 입력했고 취득일부터 오늘 사이의 실제 날짜일 때만(비우면 거주하지 않은 것으로 계산)
  if (giftBurdenedHouse(a) && isValidISODate(a.moveInDate || '') && isValidISODate(a.acqDate || '') && a.moveInDate >= a.acqDate && a.moveInDate <= giftTodayISO()) body.move_in_date = a.moveInDate;
  if (isHouse && (a.regulatedArea === 'yes' || a.regulatedArea === 'no')) body.is_regulated_area = a.regulatedArea === 'yes';
  const donorN = a.donorHouseCount;
  if (isHouse && donorN !== undefined && donorN !== null && String(donorN).trim() !== '' && Number.isFinite(Number(donorN)) && Number(donorN) >= 0) body.donor_other_house_count = Number(donorN);
  return body;
}

/* 부담부증여 응답의 상태 분류 (261011) — 금액은 엔진이 `상태: ok` 로 답한 값뿐이다. 종부세 화면(compEngineVerdict)과 같은 갈래:
     ok · needs_input(입력을 채우면 계산 가능) · unsupported · refused(상태 키 없음·알 수 없는 상태·오류 필드) · down(상태 'error'·calc 없음·깨진 응답·필수 키 무효)
   ⚠️ 시험이 «이 함수 + GIFT_BURDENED_REQUIRED» 만 꺼내 실행한다. */
const GIFT_BURDENED_REQUIRED = ['총세부담', '증여세', '양도세', '취득세'];
function giftBurdenedStatus(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'down';
  if (!Object.prototype.hasOwnProperty.call(c, '상태')) return 'refused';
  if (c['상태'] === 'needs_input') return 'needs_input';
  if (c['상태'] === 'unsupported') return 'unsupported';
  if (c['상태'] === 'error') return 'down';
  if (c['상태'] !== 'ok') return 'refused';
  if (c['오류'] || c.error || c.errors || c.detail || c.success === false) return 'refused';
  if (!window.jtValidCalc(c, GIFT_BURDENED_REQUIRED)) return 'down';
  /* 부동산 부담부증여는 증여 부분 또는 채무(유상) 부분의 취득세가 항상 양수라 정상이면 총세부담 > 0 — 전부 0원은 계산 실패 신호다.
     처분 비교·최적화 화면과 같이 총세부담 = 증여세 + 양도세 + 취득세 도 확인한다. */
  if (!(c['총세부담'] > 0) || c['총세부담'] !== c['증여세'] + c['양도세'] + c['취득세']) return 'down';
  return 'ok';
}

async function callGiftEngine(body, endpoint) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  // 엔진이 비용절감용 scale-to-zero라 한동안 안 쓰면 잠듦. 첫 호출은 부팅을 기다리며 수십 초 걸리거나
  // 부팅 중 503을 반환할 수 있음 → 콜드스타트를 확실히 넘기도록 넉넉히 재시도(누적 ~34초). 한 번 깨면 응답 <1초.
  const delays = [1000, 2000, 4000, 8000]; // 재시도 간 대기(초)
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
      if (!res.ok) { const _err = new Error('engine ' + res.status); _err.status = res.status; throw _err; }
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (e && e.status >= 400 && e.status < 500) break;   // P2-1: 4xx(422 검증오류·429)는 재시도 금지
      if (attempt < delays.length) await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  throw lastErr;
}

/* ══════════════════════════════════════════════════════════════════════════
   엔진 결과 → calc (261004 오너 방침: 프론트의 자체 계산식(폴백)을 삭제한다 — 양도세·취득세 화면과 같은 방식)

   일반증여 화면에는 세액을 «스스로» 계산하는 코드가 없다. 금액은 엔진(`POST /v1/calc/gift`)이 준 값뿐이고,
   엔진 값이 없으면 금액 필드(totalTax 등)를 아예 두지 않는다. 엔진 호출 결과는 셋이다.
     · 유효 응답  — HTTP 200 + 오류 없음 + calc.상태 가 없거나(구 엔진) 'ok' + 필수 숫자 키가 유한한 실수
                    (window.jtValidCalc) → precise:true 와 각 금액 필드
     · 거부       — HTTP 200 인데 calc.오류 가 있거나 calc.상태 가 있는데 'ok' 가 아님(needs_input·unsupported·
                    error), 또는 HTTP 4xx(408·429 제외) → precise:false, engineState:'refused'
                    («금액이 아니다»라는 엔진의 답이다 — 오류 사유 문구를 사용자에게 그대로 내지 않는다)
     · 연결 실패  — 네트워크 오류·타임아웃·HTTP 5xx·408·429·calc 없음·깨진 응답 → precise:false, engineState:'down'
   (부담부증여 경로는 이 함수들을 쓰지 않는다 — 종전 그대로 runAnalysis 안에서 처리한다.)
   ══════════════════════════════════════════════════════════════════════════ */
/* 결과표·상담 전송문이 «항상» 표시하는 금액은 모두 필수다 — 없는 값을 0원으로 메우지 않는다(Codex TASK-261004-046 R1-F1) */
const GIFT_ENGINE_REQUIRED = ['과세표준', '산출세액', '세액', '신고세액공제', '세대생략할증'];
function giftEngineVerdict(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'down';
  /* 공통 검증기(jtValidCalc)가 무효로 보는 명시적 오류 필드(error·detail 등)도 «거부»다 — 무결성 검사로 넘기면
     「연결 실패」로 잘못 안내된다. */
  /* 상태 키는 새 엔진부터 있다. error = 엔진 내부 실패(입력 탓이 아니다 → 다시 시도), needs_input·unsupported = 거부.
     구 엔진(키 없음)은 «오류 없음 + 유효성 통과»로만 받는다(R1-F3). */
  if (Object.prototype.hasOwnProperty.call(c, '상태') && c['상태'] !== 'ok') return c['상태'] === 'error' ? 'down' : 'refused';
  if (c['오류'] || c.error || c.errors || c.detail || c.success === false) return 'refused';
  if (!window.jtValidCalc(c, GIFT_ENGINE_REQUIRED)) return 'down';
  return 'ok';
}
/* inputValue — 엔진이 증여재산가액(주요공제)을 안 줬을 때 표시할 «사용자가 입력한» 금액(계산값이 아니다) */
function giftCalcFromEngine(ej, inputValue) {
  const c = ej && ej.calc;
  const verdict = giftEngineVerdict(c);
  if (verdict !== 'ok') return { precise: false, engineState: verdict };
  const mj = c['주요공제'] || {};
  return {
    precise: true, engineVer: ej.version && ej.version.engine, engineVersion: ej.version || null, calculationReview: ej.review || null,
    taxBase: c['과세표준'], calcTax: c['산출세액'],
    genSkipSurcharge: c['세대생략할증'], filingCredit: c['신고세액공제'],
    totalTax: c['세액'],
    giftValue: mj['증여재산가액'] != null ? mj['증여재산가액'] : inputValue,
    giftCredit: mj['납부세액공제'] || 0,
    ...(mj['외국납부세액공제'] > 0 ? {foreignCredit: mj['외국납부세액공제']} : {}),
    nonTaxableMsg: c['비과세여부'] ? '증여재산공제 범위 내로 납부할 증여세가 없습니다(과세최저한).' : null,
    steps: c['단계별계산'] || [],
    engineWarnings: c['경고사항'] || [],   // 엔진이 알리는 가정·경고([확인 필요] 등) — 결과 화면에 그대로 보인다
  };
}
/* 호출 자체가 던진 예외 — HTTP 4xx(callGiftEngine 이 status 를 달아 던진다)는 엔진의 «거부», 그 밖은 «연결 실패» */
function giftCalcFromEngineError(e) {
  /* 408(시간 초과)·429(호출 제한)는 입력 문제가 아니라 일시적 상태다 — 다시 시도를 안내한다 */
  return (e && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429)
    ? { precise: false, engineState: 'refused' }
    : { precise: false, engineState: 'down' };
}

/* 주소→상증법 평가 조회 (/v1/lookup/valuation: ①기준값 §15③ 시가 + ②실거래범위 + ③공시하한 §61).
   외부 API(VWORLD) 장애·해외리전 차단 시 success:false(manual_input_required)로 graceful 폴백. */
async function lookupValuation(address, taxType, evalDate, unit) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
  const res = await fetch(base + '/v1/lookup/valuation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, tax_type: taxType || '증여', eval_date: evalDate || new Date().toISOString().slice(0, 10),
      dong: unit && unit.dong || '', ho: unit && unit.ho || '',
      official_year: Number(unit && unit.year) || Number((evalDate || '').slice(0, 4)) || new Date().getFullYear() }),
    signal: ctrl.signal,
  });
  if (!res.ok) throw new Error('valuation ' + res.status);
  return await res.json();
  } finally { clearTimeout(timer); }
}

/* 상담 전송용 상세 (이메일) */
function buildGiftDetail(answers, calc, commentary) {
  const L = ['■ 고객 입력 정보'];
  GIFT_QS.forEach(q => {
    if (q.showIf && !q.showIf(answers)) return;
    const v = answers[q.id];
    if (v === undefined || v === null || v === '') return;
    let val = v;
    if (q.opts) { const o = q.opts.find(x => x[0] === v); if (o) val = o[1]; }
    else if (q.numeric) val = q.money ? formatWon(Number(v)) : Number(v).toLocaleString('ko-KR');
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('  · ' + ql + ': ' + val);
  });
  L.push('', '■ 계산 결과 (검증 엔진)');  // 차단이면 이 함수에 오지 않는다 — 금액은 전부 엔진 값
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
    if(calc.foreignCredit) L.push('  · 외국납부세액공제: ' + formatWon(calc.foreignCredit));
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
    if (q.showIf && !q.showIf(answers)) return;
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
  const [supportMode,setSupportMode]=useGiftState(null);
  const [supportDraft,setSupportDraft]=useGiftState(null);
  const [installmentMode,setInstallmentMode] = useGiftState(false);
  const [installmentDraft,setInstallmentDraft] = useGiftState({});
  const [caseMode, setCaseMode] = useGiftState(false);
  const [caseValuation, setCaseValuation] = useGiftState(null);
  const [step, setStep] = useGiftState(0);
  const [answers, rawSetAnswers] = useGiftState({});
  const [loading, rawSetLoading] = useGiftState(false);
  const [report, rawSetReport] = useGiftState(null);
  const [err, rawSetErr] = useGiftState(null);
  const [lookupState, setLookupState] = useGiftState({ loading: false, result: null, err: null });
  const lookupSeq = React.useRef(0);
  const lookupKey = React.useRef('');
  lookupKey.current = [answers.reAddress, answers.reDong, answers.reHo, answers.reYear, answers.giftDate, answers.reType].join('|');
  const changeLookup = (id, value) => { lookupSeq.current += 1; setLookupState({ loading: false, result: null, err: null }); setAns(id, value); };
  // 빠른 계산 먼저: 'quick'(필수 5문항→즉시 예상세액) → '더 정확히' → 'detail'(사전증여·부담부·세대생략 등)
  const [phase, setPhase] = useGiftState('quick');
  const [quickReport, rawSetQuickReport] = useGiftState(null);
  const inputSession=useJTInputSession(()=>{rawSetReport(null);rawSetLoading(false);rawSetErr(null);rawSetQuickReport(null);});
  const setAnswers=update=>{inputSession.invalidate();rawSetAnswers(update);};
  const setReport=rawSetReport;
  const setLoading=rawSetLoading;
  const setErr=rawSetErr;
  const setQuickReport=rawSetQuickReport;


  // 엔진 미리 깨우기(scale-to-zero 콜드스타트 대비) — 사용자가 문항을 입력하는 동안 엔진을 워밍해 두면
  // 결과 단계에서 정밀계산(단계별 법조문 포함)이 바로 나옴. fire-and-forget.
  React.useEffect(() => {
    const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';
    if (base) { fetch(base + '/health', { method: 'GET' }).catch(function () {}); }
  }, []);

  const allVisible = GIFT_QS.filter(q => !q.showIf || q.showIf(answers));
  // 과거연도는 엔진이 요구하는 사실을 첫 계산 전에 받는다.
  const isQuick = q => q.tier === 'quick' || (answers.giftDate && answers.giftDate.slice(0,4) === '2026'
    && ['priorGiftHas','priorGiftValue','priorGroupDeductionUsed','priorGiftOrdinaryDeduction','priorGiftMarriageChildDeduction'].includes(q.id)) || (answers.giftDate && answers.giftDate.slice(0,4) < '2026'
    && ['genSkip','childDeceased','marriageDed','childbirthDed','priorGiftHas','priorGiftValue',
        'historicalPriorValues','historicalPriorTaxes','historicalPriorDeductions','priorMarriageChildUsed'].includes(q.id));
  const visibleQs = phase === 'quick'
    ? allVisible.filter(isQuick)
    : allVisible.filter(q => !isQuick(q));
  const total = visibleQs.length;
  const safeStep = Math.min(step, total - 1);
  const cur = visibleQs[safeStep];
  const isLast = safeStep === total - 1;
  const setAns = (id, v) => setAnswers(a => giftApplyAnswer(a, id, v));

  const canNext = () => {
    if (cur.freeform) return true;
    if (cur.numeric) {
      if (cur.optional || cur.blockOnBlank) return true;   // blockOnBlank: 비워도 통과 — 결과 단계에서 «확인 필요» 안내로 막는다(0원으로 계산하지 않는다)
      const v = Number(answers[cur.id]);
      return !isNaN(v) && v > 0;
    }
    if (cur.date) {
      const v = answers[cur.id] || '';
      const valid = isValidISODate(v);
      if (cur.optional) return v === '' || valid;
      if (cur.blockOnBlank) return v === '' || valid;
      return valid;
    }
    return !!answers[cur.id];
  };

  const doLookup = async () => {
    if (!answers.reAddress) return;
    const seq = ++lookupSeq.current, key = lookupKey.current;
    const stale = () => seq !== lookupSeq.current || key !== lookupKey.current;
    const unit = { dong: answers.reDong, ho: answers.reHo, year: answers.reYear || (answers.giftDate || '').slice(0, 4) || new Date().getFullYear() };
    setLookupState({ loading: true, result: null, err: null });
    try {
      let r = answers.reType === '공동주택'
        ? await lookupValuation(answers.reAddress, '증여', answers.giftDate, unit)
        : await window.jtLookupPublicPrice(answers.reAddress, answers.reType, unit);
      /* 261021: 정부 전산망이 해외 접속을 막아 엔진(도쿄)은 실거래가를 국내 NAS 수집기로 받아온다.
         «수집 중»(pending)이면 안내를 보이고 잠시 뒤 자동으로 다시 묻는다(최대 9회). */
      for (let tries = 0; r && r.status === 'pending' && answers.reType === '공동주택' && tries < 9; tries++) {
        if (stale()) return;
        setLookupState({ loading: true, result: r, err: null });
        await new Promise(done => setTimeout(done, Math.min(30, Math.max(5, Number(r.retry_after) || 10)) * 1000));
        if (stale()) return;
        r = await lookupValuation(answers.reAddress, '증여', answers.giftDate, unit);
      }
      if (stale()) return;
      setLookupState({ loading: false, result: r, err: null });
    } catch (e) {
      if (stale()) return;
      setLookupState({ loading: false, result: null, err: '주소 자동조회를 할 수 없습니다. 아래 「평가액」 칸에 직접 입력해 주세요.' });
    }
    // 부담부증여 취득세 중과 판정용 — 조정대상지역 자동선택 (주택만, region 획득)
    if (answers.reType === '공동주택' || answers.reType === '개별주택') {
      try {
        const pr = await window.jtLookupPublicPrice(answers.reAddress, answers.reType, unit);
        if (!stale() && pr && pr.region) setAns('regulatedArea', pr.region.is_adjusted_area ? 'yes' : 'no');
      } catch (e) { /* region 실패 시 질문 유지 */ }
    }
  };

  const runAnalysis = async () => {
    const inputRequest=inputSession.begin();
    const setReport=inputSession.sink(inputRequest,rawSetReport);
    const setLoading=inputSession.sink(inputRequest,rawSetLoading);
    const setErr=inputSession.sink(inputRequest,rawSetErr);
    const setQuickReport=inputSession.sink(inputRequest,rawSetQuickReport);
    setReport(null);

    setLoading(true); setErr(null);
    try {
      /* ★ «불확정 입력»은 엔진을 부르기 «전»에 막는다 (260806 Codex R20 P1).
         판정 함수는 2층인데 ①불확정 층은 calc.precise 와 무관하다 — 그래서 여기서
         precise:true 로 불러 ①층만 본다. 못 낼 값이면 요청 자체가 낭비이고,
         「모르겠다」고 답한 사실이 기본값으로 둔갑해 엔진까지 가지도 않는다.
         엔진 응답 직후의 게이트는 그대로 ②엔진 값 없음을 잡는다. */
      if (giftFallbackGaps(answers, { precise: true }).length > 0) {
        /* precise:true 로 저장하는 이유 — 렌더가 같은 판정 함수를 다시 부르는데,
           precise:false 로 두면 ②엔진 값 없음 사유까지 붙어 «엔진 POST 를 멈춘 이유»와
           다른 항목이 화면에 뜬다 (260806 Codex R21 P2). preEngineBlock 은 그 상태를
           «정밀 계산 성공»과 구분하기 위한 표식이다. */
        const unknownRep = { calc: { precise: true, preEngineBlock: true }, commentary: null, quick: phase === 'quick' };
        setReport(unknownRep);
        if (phase === 'quick') setQuickReport(unknownRep);
        return;
      }
      const isBurdened = answers.isBurdened === 'yes' && answers.assetType === 'realestate';
      const value = giftAmount(answers);
      let calc;

      if (isBurdened) {
        // 부담부: 엔진 우선, 실패 시 안내
        calc = { mode: 'burdened', giftValue: value, totalTax: 0, precise: false };
        try {
          const ej = await callGiftEngine(mapAnswersToBurdenedGift(answers), '/v1/calc/burdened-gift');
          const c = ej && ej.calc;
          const bst = giftBurdenedStatus(c);
          if (bst === 'needs_input' || bst === 'unsupported' || bst === 'refused') {
            /* 엔진이 «금액을 확정하지 않겠다»고 답했다(입력 보완·지원 안 함·형식 오류) — 엔진 안내 문구를 그대로 보이고 금액은 내지 않는다 */
            const msg = !Object.prototype.hasOwnProperty.call(c, '상태') ? '엔진 응답 형식이 맞지 않습니다(상태 없음) — 잠시 후 다시 시도하거나 상담을 이용하세요'
              : ([c['오류'], c.error].find(x => typeof x === 'string' && x.trim()) || '').trim();
            calc.engineState = 'refused'; calc.engineMessage = msg;
          } else if (bst === 'down') {
            calc.engineErr = true; if (c) console.warn('부담부증여 엔진 응답: 상태 error 또는 무결성 실패', c);
          }
          // 수정 260628(GIFT-R2-02): 엔진 오류바디/부분응답을 precise로 신뢰하지 않음(세액0 거짓표시 방지). 여기까지 오면 상태는 'ok' 이다.
          else if (window.jtValidCalc(c, ['총세부담', '증여세', '양도세', '취득세'])) {
            calc.giftTax = c['증여세']; calc.transferTax = c['양도세']; calc.acqTax = c['취득세'];
            calc.totalTax = c['총세부담']; calc.debtRatio = c['채무비율']; calc.debtRecognized = c['채무인정여부'];
            calc.engineWarnings = c['경고사항'] || [];
            calc.steps = (c['원본결과'] && c['원본결과'].steps_summary) || c['단계별계산'] || [];
            calc.precise = true; calc.engineVer = ej.version && ej.version.engine;
          } else if (c) { calc.engineErr = true; console.warn('부담부증여 엔진 응답 무결성 실패', c); }
        } catch (e) {
          /* HTTP 4xx(408·429 제외)는 엔진의 «거부», 그 밖은 «연결 실패» — 일반증여(giftCalcFromEngineError)와 같은 분류 */
          if (e && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) { calc.engineState = 'refused'; }
          else calc.engineErr = true;
        }
      } else {
        /* ★ 엔진 값이 없으면 금액 필드가 «없는» calc 가 된다(giftCalcFromEngine 주석) —
           자체 계산식으로 메우지 않는다. 유효 응답이면 precise:true, 거부면 engineState:'refused',
           연결 실패면 engineState:'down'. */
        try {
          calc = giftCalcFromEngine(await callGiftEngine(mapAnswersToGift(answers), '/v1/calc/gift'), value);
        } catch (e) {
          console.warn('증여 엔진 호출 실패', e);
          calc = giftCalcFromEngineError(e);
        }
      }

      // Claude 코멘터리 (실패해도 기본 문구로 대체)
      /* ★ AI 프롬프트를 만들기 «전»에 막는다. 화면에서 금액을 가려도 이 호출이 먼저 나가면
         세액이 외부로 흘러간다 — 260806 Codex P0 로 실제 그러고 있었다.
         렌더와 «같은 함수»로 판정해야 규칙이 두 벌로 갈라지지 않는다. */
      if (giftFallbackGaps(answers, calc).length > 0) {
        const blockedRep = { calc, commentary: null, quick: phase === 'quick' };
        setReport(blockedRep);
        if (phase === 'quick') setQuickReport(blockedRep);
        return;
      }

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

  if(supportMode)return <JTSupportReviewDirect initialMode={supportMode} initialDraft={supportDraft} onBack={draft=>{setSupportDraft(draft);setSupportMode(null);}}/>;
  if (caseMode) return <JTGiftCases initialAnswers={answers} initialValuation={caseValuation} onAnswers={next => { setAnswers(next); setReport(null); setQuickReport(null); }} onExit={() => setCaseMode(false)} />;

  if (installmentMode) return <JTH7TaxDirect mode="installment" initialDraft={installmentDraft} onBack={draft=>{setInstallmentDraft(draft);setInstallmentMode(false);}} />;
  if (loading) {
    return (
      <div className="jt-container">
        <JTReportShell inputReview={{questions:visibleQs,answers,onEdit:index=>{inputSession.invalidate();setStep(index);}}} title="증여세 계산" subtitle="검증 엔진으로 계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="LIVE">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />검증된 세금 엔진으로 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc, commentary, isBurdened } = report;
    const nonResident = answers.isResident === 'no';
    // 사전증여 공제액 입력란이 비어 있었던 경우(엔진이 한도 안 순차 공제로 보고 계산) → 결과화면에 캐비엇 노출
    const priorDedEstimated = !isBurdened && calc.precise &&
      answers.priorGiftHas === 'yes' && Number(answers.priorGiftValue) > 0 &&
      !answers.giftDate &&
      !giftPriorDedGiven(answers);
    /* 엔진 값이 없거나(down·refused) 입력이 불확정이면 숫자를 내지 않는다 (261004: 자체 계산식 없음).
       부담부증여 엔진 실패(engineErr)도 여기서 함께 잡는다 — 종전엔 예외로 빼 두어
       화면만 가리고 AI·공유로는 0원이 나갔다. */
    const giftGaps = giftFallbackGaps(answers, calc);
    const giftBlocked = giftGaps.length > 0;
    /* ★ 차단이면 «결과 화면을 아예 만들지 않는다».
       가릴 것을 하나씩 세는 방식은 새 표현이 늘 때마다 샜다(260806: 계산표·공유버튼·
       AI 코멘터리·절세전략 문구가 차례로 발견). 조기 반환은 «세지 않아도» 안전하다. */
    if (giftBlocked) {
      /* 사유 구분: ①입력 불확정 → 'input' / 엔진이 거부 → 'refused' / 그 밖(연결 실패·미지정) → 'down' */
      const giftBlockReason = giftFallbackGaps(answers, { precise: true }).length > 0 ? 'input' : (calc.engineState === 'refused' ? 'refused' : 'down');
      const giftBlockTag = giftBlockReason === 'input' ? '정밀 계산 필요' : (giftBlockReason === 'refused' ? '세무사 확인 필요' : '계산 엔진 연결 실패');
      return (
        <div className="jt-container">
          <JTReportShell inputReview={{questions:visibleQs,answers,onEdit:index=>{inputSession.invalidate();setStep(index);}}} title="증여세 계산 결과" subtitle={giftBlockTag} stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
          <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setQuickReport(null); setPhase('quick'); setStep(0); }}>입력 수정·재계산</button>
            {/* 'down'·'refused' 는 패널 본문이 사유를 이미 말한다 — 같은 뜻의 사유 목록을 한 번 더 내지 않는다.
                단 부담부증여 엔진 실패(engineErr)의 사유 문구는 그대로 보인다(종전 동작) */}
            <JTFallbackBlocked gaps={(giftBlockReason === 'input' || calc.engineErr || calc.engineMessage) ? giftGaps : []} onRetry={runAnalysis} reason={giftBlockReason} inputEditLabel="입력 수정·재계산" />
            <div className="jt-report-q__nav" style={{ marginTop: 16 }}>
              <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setPhase('quick'); setStep(0); setAnswers({}); }}>처음부터 다시</button>
            </div>
          </JTReportShell>
        </div>
      );
    }
    return (
      <div className="jt-container">
        <JTReportShell inputReview={{questions:visibleQs,answers,onEdit:index=>{inputSession.invalidate();setStep(index);}}} title="증여세 계산 결과" subtitle={isBurdened ? '부담부증여 (증여세+양도세+취득세)' : (answers.giftDate || '2026년 기본값') + ' 증여세 계산'} stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
          <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setQuickReport(null); setPhase('quick'); setStep(0); }}>입력 수정·재계산</button>
          <button className="jt-btn jt-btn--ghost" onClick={() => setCaseMode(true)}>사건 저장·불러오기</button>
          {nonResident && (
            <div className="jt-report-result__section" style={{ background: '#fff4e5', borderLeft: '4px solid #d08b00', padding: '14px 18px', marginBottom: 16 }}>
              ⚠️ 비거주자 증여는 증여재산공제 배제 등 계산이 크게 달라집니다. 아래는 거주자 기준 참고치이며, 정확한 계산은 상담으로 안내해 드립니다.
            </div>
          )}
          {giftBlocked && <JTFallbackBlocked gaps={giftGaps} onRetry={runAnalysis} />}
          {!giftBlocked && (
          <div className="jt-report-result__grade jt-grade-mid">
            {/* engineErr 는 이제 giftBlocked 로 조기 반환된다 — 여기까지 오지 않는다 */}
            <div className="jt-report-result__grade-label">{report.quick ? '빠른 예상 세부담' : '총 세부담 · 정밀 계산 (JT택스랩 엔진)'}</div>
            <div className="jt-report-result__grade-val" style={{fontSize: 'clamp(24px, 7vw, 56px)', overflowWrap: 'anywhere'}}>{formatWon(calc.totalTax)}</div>
            {/* 엔진이 알리는 가정·경고(예: 세대생략 여부 미확인 → [확인 필요]) — 양도세 화면과 같은 표시 방식.
                일반증여 결과에만 보인다(부담부증여 화면은 종전 그대로) */}
            {!isBurdened && Array.isArray(calc.engineWarnings) && calc.engineWarnings
              .filter(w => typeof w === 'string' && w)
              .map((w, i) => (
                <p key={`ew${i}`} style={{marginTop: 12, fontWeight: 500}}>⚠️ {w}</p>
              ))}
          </div>
          )}

          {report.quick && (
            <div className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '14px 18px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}>
                {answers.giftDate && answers.giftDate.slice(0,4) < '2026'
                  ? <strong>입력한 증여일·관계·사전증여·공제 사실을 반영한 예상치입니다. 다른 사실을 추가하면 지원 여부와 세액이 달라질 수 있습니다.</strong>
                  : <><strong>관계·금액만으로 낸 빠른 예상치예요.</strong> 아래를 반영하면 세액이 달라질 수 있어요 —<br />10년 내 사전증여(합산) · 부담부(빚도 함께 넘김) · 세대생략(손주 증여) · 혼인·출산 공제.</>}
              </p>
              <button className="jt-btn jt-btn--primary" onClick={goDetail}>더 정확히 계산하기 →</button>
            </div>
          )}

          {isBurdened ? (
            <section className="jt-report-result__section">
              <h3>세금 구성 (부담부증여)</h3>
              {/* engineErr 는 giftBlocked 로 조기 반환되므로 여기까지 오지 않는다 */}
              {(
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
          ) : giftBlocked ? null : (
            <section className="jt-report-result__section">
              <h3>계산 내역</h3>
              <table className="jt-report-calc">
                <tbody>
                  <tr><th>증여재산가액</th><td>{formatWon(calc.giftValue)}</td></tr>
                  <tr><th><strong>과세표준</strong></th><td><strong>{formatWon(calc.taxBase)}</strong></td></tr>
                  <tr><th>산출세액</th><td>{formatWon(calc.calcTax)}</td></tr>
                  {calc.genSkipSurcharge > 0 && <tr><th>세대생략 할증 (§57)</th><td>+ {formatWon(calc.genSkipSurcharge)}</td></tr>}
                  {calc.giftCredit > 0 && <tr><th>납부세액공제 (사전증여 §58)</th><td>− {formatWon(calc.giftCredit)}</td></tr>}
                  {calc.foreignCredit > 0 && <tr><th>외국납부세액공제</th><td>− {formatWon(calc.foreignCredit)}</td></tr>}
                  <tr><th>신고세액공제 (§69, 해당 연도)</th><td>− {formatWon(calc.filingCredit)}</td></tr>
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
                    <tr key={i}><th><JTCalculationStepLabel step={s} /></th><td>{formatStepValue(s['항목'], s['금액'])}</td></tr>
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
            본 계산은 증여일 {answers.giftDate || '2026년 기본값'}의 적용 규정에 따른 예상액입니다. 실제 세액은 사실관계·평가액·세법 개정에 따라 달라질 수 있으며, 신고세액공제는 해당 연도 기준으로 반영합니다. 정확한 신고는 담당 세무사 확인이 필요합니다.
          </p>

          {/* ★ 차단 중에는 «공유·전송»도 막는다 — 화면에서 금액을 가려도
              kakaoSummary·reportSummary·reportDetail 에 세액이 담겨 클립보드와
              Web3Forms 로 나간다 (260806 Codex P0). 막은 척이 되는 대표 경로다. */}
          {!giftBlocked && (
          <JTReportConvert engineVersion={calc.engineVersion} calculationReview={calc.calculationReview}
            setRoute={setRoute}
            calcId="gift"
            completeEligible={true}
            precise={calc.precise}
            quick={report.quick}
            reportType={isBurdened ? '부담부증여 통합 계산' : (answers.giftDate || '2026년 기본값') + ' 증여세 계산'}
            reportTag="LEGACY"
            reportSummary={`총 세부담 ${formatWon(calc.totalTax)}${isBurdened ? ' (부담부)' : ' / 과세표준 ' + formatWon(calc.taxBase)} / ${commentary.headline || ''}`}
            reportDetail={buildGiftDetail(answers, calc, commentary)}
            kakaoSummary={buildGiftKakao(answers, calc)}
            urgent={false}
          />
          )}
        </JTReportShell>
      </div>
    );
  }

  // 입력 화면
  return (
    <div className="jt-container">
      <JTReportShell inputReview={{questions:visibleQs,answers,onEdit:index=>{inputSession.invalidate();setStep(index);}}} title="증여세 계산" subtitle={phase === 'quick' ? '관계·금액만 입력하면 예상 증여세를 바로 보여드려요.' : '사전증여·부담부 등을 반영해 더 정확히 계산합니다.'} stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="LIVE">
        <button type="button" onClick={()=>{inputSession.invalidate();setSupportMode('gift');}}>증여 재산명세·비상장 보충평가</button>
        <button type="button" data-testid="open-installment-direct" onClick={()=>setInstallmentMode(true)}>일반 연부연납 산식</button>
        <button className="jt-btn jt-btn--ghost" style={{ marginBottom: 16 }} onClick={() => setCaseMode(true)}>사건 저장·불러오기</button>
        <div className="jt-report-q">
          {cur.section && <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10, letterSpacing: '0.18em', opacity: 0.6, marginBottom: 8 }}>{cur.section}</div>}
          <h2>{cur.q}</h2>
          {cur.sub && <p className="jt-report-q__sub">{cur.sub}</p>}

          {cur.freeform && cur.id !== 'reAddress' && (
            <textarea className="jt-report-q__textarea" maxLength={cur.id === 'context' ? 200 : 120}
              placeholder={cur.placeholder || ''} value={answers[cur.id] || ''}
              onChange={(e) => setAns(cur.id, e.target.value)} />
          )}
          {cur.id === 'reAddress' && <>
            {window.JTAddressPick && <window.JTAddressPick onPick={v => { changeLookup('reAddress', v); setAns('reDong', ''); setAns('reHo', ''); }} />}
            <input className="jt-report-q__input" aria-label="부동산 주소" maxLength={250}
              value={answers.reAddress || ''} onChange={e => changeLookup('reAddress', e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['reDong', 'reHo'].map((id, i) => <label key={id}>{i ? '호' : '동'}
                <input className="jt-report-q__input" maxLength={30} value={answers[id] || ''} onChange={e => changeLookup(id, e.target.value)} /></label>)}
              <label>공시가격 연도<input className="jt-report-q__input" type="text" inputMode="numeric" maxLength={4} pattern="[0-9]{4}"
                value={answers.reYear || (answers.giftDate || '').slice(0, 4) || new Date().getFullYear()}
                onChange={e => changeLookup('reYear', e.target.value)} /></label>
            </div>
          </>}

          {cur.numeric && (
            <JTNumericInput className="jt-report-q__input" type="text" inputMode="numeric" placeholder={cur.placeholder}
              value={answers[cur.id]}
              onChange={(e) => window.jtSetNumericAns(setAns, cur.id, e.target.value, true)} />
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
                onClick={doLookup}>{lookupState.loading
                  ? (R && R.status === 'pending' ? '국내 자료 수집 중… 잠시 뒤 자동으로 다시 조회합니다' : '조회 중… (최초 10~30초 소요)')
                  : '주소로 시가·공시가격 조회'}</button>

              {/* 성공: ① 기준값 + ② 실거래 범위 + ③ 공시하한 */}
              {R && R.success && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ padding: '10px 12px', background: '#fff', borderRadius: 8, border: '1px solid var(--line,#e6e2d8)' }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>① 참고 평가액 — {base.방법} · 공시가격 {R.official_year}년</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <strong style={{ fontSize: 18 }}>{formatWon(base.금액_원)}</strong>
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
                      ③ 대상 세대 공시가격: {formatWon(floor.금액_원)}
                    </div>
                  )}
                  {(R.warnings || []).map((w, i) => (
                    <p key={i} style={{ fontSize: 12, color: '#b97d2a', marginTop: 6 }}>⚠ {w}</p>
                  ))}
                  <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>※ {R.면책 || R.disclaimer}</p>
                </div>
              )}

              {/* 조회 결과 자동평가 불가(manual_input_required) — 친절 폴백 + ①②③ 설명 */}
              {R && !R.success && !(R.valuations && R.valuations.length) && (
                <div style={{ marginTop: 10, fontSize: 13 }}>
                  <p style={{ color: '#b97d2a', margin: 0 }}>{R.error || R.note || '조회 결과를 확인하지 못했습니다. 평가액을 직접 입력해 주세요.'}</p>
                  {R.status !== 'pending' && <p style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                    공시자료 조회 실패만으로 시가가 없다고 판단할 수 없습니다. 유사매매·감정가 등 적용 가능한 자료와 평가기준일을 담당 세무사가 확인해야 합니다. 유사매매 후보는 홈택스 조회 결과와도 대조해 주세요.
                  </p>}
                </div>
              )}
              {R && R.valuations && R.valuations.map((v, i) => <p key={i}>{v.valuation_type} ({v.as_of_year}년): {formatWon(v.amount)}{answers.reType === '토지' ? ' / ㎡' : ''}</p>)}
              {R && R.reference_only && <p style={{ fontSize: 12, color: '#b97d2a' }}>{R.note} 확인 후 평가액을 직접 입력해 주세요.</p>}
              {R && R.needs_unit_selection && window.JTUnitAsk && <window.JTUnitAsk
                key={answers.reAddress} info={{ unitCount: R.unit_count || 0, complex: R.matched_complex || '', priceMin: R.price_min, priceMax: R.price_max }}
                busy={lookupState.loading} onPick={u => { changeLookup('reDong', u.dong); setAns('reHo', u.ho); }} />}

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

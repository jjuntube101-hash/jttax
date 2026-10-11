/* @jsx React.createElement */
/* 처분방법 비교 — 같은 부동산을 증여 vs 매매 vs 상속할 때 예상 세금 비교 → 검증 엔진 /v1/calc/compare-disposal.
   ★ 프리미엄 설계(로드맵): 엔진은 "세액 숫자"까지만 보여준다. "어느 방법이 유리한가"라는 판단은
   세무사 상담에서만 — 엔진의 '최적방법' 라벨은 UI에서 억제하고, 2차효과(상속=사망전제·증여=이월과세·
   매매=자금조달계획서·직계간 증여추정)를 의무 경고한다. 세액만 비교(실행가능성·비세무 요인 미반영).
   261003 정확성 개편: ①취득가·보유 주택 수를 필수로(종전: 취득가를 비우면 엔진이 시세의 50%로 대신 채웠다)
   ②보유 연수 대신 취득일을 받는다(월 환산의 날짜 밀림 제거) ③조정대상지역 여부를 묻고 「모름」을 구분한다
   ④엔진이 계산을 거부한 경우(지원 범위 밖)와 연결 실패를 구분해 안내한다.
   261011 계약 정합: ①세대 주택 수·조정대상지역·받는 분 세대 주택 수·취득가액의 「모름」·빈칸은 사실로 바꿔 보내지 않고 엔진을 부르지 않은 채
   «세무사 확인» 안내로 막는다 ②취득 당시 조정대상지역 「모름」은 키를 보내지 않는다(엔진이 두 값으로 대조 계산해 갈리면 입력 보완을 돌려준다)
   ③응답 `상태` 를 읽는다(ok 만 채택 · needs_input/unsupported 는 엔진 안내 문구와 함께 차단 · error/연결 실패는 재시도 · 상태 키 없음은 거부).
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

// 실제로 존재하는 YYYY-MM-DD 인가 (2월 30일 같은 값 거부)
function cmpValidISODate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const y = Number(v.slice(0, 4)), m = Number(v.slice(5, 7)), d = Number(v.slice(8, 10));
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
function cmpIsoDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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
    id: 'standardValue', section: '대상 부동산',
    q: '그 부동산의 공시가격(시가표준액)을 아시면 넣어 주세요. (선택, 원)',
    sub: '상속 취득세는 시세가 아니라 공시가격을 기준으로 계산하고, 조정대상지역 주택의 증여 취득세 중과도 공시가격으로 판정합니다. 모르면 비워 두세요 — 시세로 계산하고, 결과 화면에서 그 전제를 알려 드립니다(이 경우 상속 쪽 세금이 실제보다 크게 나올 수 있습니다).',
    numeric: true, money: true, optional: true, placeholder: '예: 900,000,000 (모르면 비움)',
  },
  {
    id: 'acquisitionPrice', section: '대상 부동산',
    q: '지금 소유자가 그 부동산을 살 때 얼마였나요? (취득가, 원)',
    sub: '현재 소유자(예: 부모님)가 처음 취득한 가격. 매매 시 양도차익(양도세)을 계산하는 데 꼭 필요합니다 — 등기부등본·매매계약서로 확인해 주세요. 모르면 비워 두고 다음으로 가세요: 환산취득가액 등 확인이 필요하므로 금액을 표시하지 않고 세무사 확인 안내로 넘어갑니다.',
    numeric: true, money: true, blockOnBlank: true, placeholder: '예: 400,000,000 (모르면 비움)',
  },
  {
    id: 'housingCount', section: '현재 소유자',
    q: '지금 소유자(넘겨주는 분)의 「세대」는 주택을 몇 채 갖고 있나요?',
    sub: '이 부동산을 포함한 수입니다. 본인뿐 아니라 같은 세대의 배우자 등이 가진 주택까지 셉니다. 매매 시 1세대1주택 비과세·다주택 중과, 증여 시 취득세 중과 여부를 가릅니다. 모르면 「모름」을 고르세요 — 세대 주택 수에 따라 양도세 비과세·취득세 중과가 갈리므로 금액을 표시하지 않고 세무사 확인 안내로 넘어갑니다.',
    opts: [['1', '이 부동산뿐 (1채)', '1세대1주택'], ['2', '2채', '다주택'], ['3', '3채 이상', '다주택'], ['unknown', '모름', '세무사 확인 필요 — 금액을 표시하지 않음']],
  },
  {
    id: 'acquisitionDate', section: '현재 소유자',
    q: '지금 소유자가 이 부동산을 언제 취득했나요? (잔금일 또는 등기접수일)',
    sub: '매매(양도세) 계산에 가장 중요합니다 — 단기 보유 세율과 장기보유특별공제가 날짜 단위로 달라지므로 「몇 년쯤」이 아니라 취득일을 넣어 주세요. 숫자 8자리로 입력하면 자동 정리됩니다 (예: 20160903 → 2016-09-03).',
    date: true,
  },
  {
    id: 'regulatedAtAcq', section: '현재 소유자',
    q: '지금 소유자가 그 주택을 「취득할 당시」, 그곳이 조정대상지역이었나요?',
    sub: '취득할 당시 조정대상지역에 있던 주택은, 1세대1주택 비과세를 받으려면 보유 기간 중 2년 이상 거주해야 합니다(소득세법 시행령 §154①). 지금의 지정 여부와는 다른 질문입니다. 모르면 「모름」을 고르세요 — 어느 쪽이었는지를 정해서 계산하지 않고, 조정대상지역이었던 경우와 아니었던 경우를 모두 계산해 결과가 같으면 그대로 보여 드리고 달라지면 확인(취득 당시 지역·거주 여부)을 요청드립니다.',
    // 기준일은 엔진의 REGULATED_RESIDENCE_START(support/exemption_rules.py)와 같은 값.
    showIf: (a) => typeof a.acquisitionDate === 'string' && a.acquisitionDate >= '2017-08-03',
    opts: [['yes', '네, 조정대상지역이었습니다', '거주 2년 요건 적용'], ['no', '아니오', ''], ['unknown', '모름', '결과가 갈리면 확인 요청']],
  },
  {
    id: 'moveInDate', section: '현재 소유자',
    q: '지금 소유자가 그 주택에 들어가 살기 시작한 날(전입일)은? (선택)',
    sub: '거주 기간은 매매 시 1세대1주택 비과세의 거주 요건과 장기보유특별공제율에 반영됩니다. 그날부터 지금까지 계속 거주한 것으로 계산합니다. 실제로 살지 않았으면 비워 두세요. 숫자 8자리로 입력하면 자동 정리됩니다.',
    date: true, optional: true,
  },
  {
    id: 'adjustedZone', section: '대상 부동산',
    q: '그 부동산이 조정대상지역에 있나요?',
    sub: '조정대상지역이면 매매 시 다주택 양도세 중과, 증여 시 취득세 중과가 적용될 수 있어 결과가 크게 달라집니다. 모르면 「모름」을 고르세요 — 어느 쪽으로도 짐작해 계산하지 않고, 금액을 표시하지 않은 채 세무사 확인 안내로 넘어갑니다.',
    opts: [['yes', '네, 조정대상지역', '중과 가능'], ['no', '아니오', ''], ['unknown', '모름', '세무사 확인 필요 — 금액을 표시하지 않음']],
  },
  {
    // 오너 결재 261004 A-3: 종전에는 면적을 묻지 않고 84㎡(농어촌특별세 비과세)로 가정했다.
    id: 'areaClass', section: '대상 부동산',
    q: '그 주택의 전용면적이 85㎡ 이하인가요?',
    sub: '전용 85㎡(약 25.7평)를 넘는 주택은 받는 분의 취득세에 농어촌특별세가 더해집니다(농어촌특별세법 §4 11호). 등기사항증명서나 분양계약서에 적힌 전용면적으로 판단하세요. 모르면 「모름」을 고르세요 — 농어촌특별세를 넣어 계산하고, 결과 화면에서 그 전제를 알려 드립니다.',
    opts: [['under', '네, 85㎡ 이하', '농어촌특별세 없음'], ['over', '아니오, 85㎡ 초과', '농어촌특별세 추가'], ['unknown', '모름', '농어촌특별세를 넣어 계산']],
  },
  {
    id: 'recipient', section: '받는 사람',
    q: '누구에게 넘기려 하나요?',
    sub: '받는 사람에 따라 증여공제·세율이 달라집니다. 미성년 자녀는 증여공제가 5천만 → 2천만으로 줄어 증여세가 늘어납니다.',
    opts: [['child_adult', '자녀에게 (성년)', '만 19세 이상'], ['child_minor', '자녀에게 (미성년)', '만 19세 미만'], ['spouse', '배우자에게', '']],
  },
  {
    id: 'recipientHouseCount', section: '받는 사람',
    q: '받는 분의 「세대」가 이 부동산 외에 보유한 주택은 몇 채인가요?',
    sub: '매매로 넘기는 경우, 사는 사람(받는 분) 세대의 주택 수에 따라 취득세율이 달라집니다(지방세법 §13의2①). ' + '받는 분과 같은 세대의 배우자·미혼 30세 미만 자녀 등이 가진 주택까지 셉니다. 받는 분이 미혼이고 30세 미만이면 원칙적으로 부모와 같은 세대로 보므로, 그 경우 부모 세대의 주택까지 세어 주세요(지방세법 시행령 §28의3). 조합원입주권·주택분양권·오피스텔도 주택 수에 들어갑니다(시행령 §28의4①). 모르면 「모름」을 고르세요 — 매수인의 취득세율을 정할 수 없어 금액을 표시하지 않고 세무사 확인 안내로 넘어갑니다.',
    // 배우자·미성년 자녀는 소유자와 같은 세대라서 엔진이 소유자 세대의 주택 수를 그대로 쓴다 — 성년 자녀에게만 묻는다.
    showIf: (a) => a.recipient === 'child_adult',
    opts: [['0', '없음 (무주택)', ''], ['1', '1채', ''], ['2', '2채', ''], ['3', '3채 이상', ''], ['unknown', '모름', '세무사 확인 필요 — 금액을 표시하지 않음']],
  },
  {
    id: 'hasSpouse', section: '상속 비교용',
    q: '지금 소유자에게 배우자가 있나요?',
    sub: '상속 방법을 비교하려면 필요해요. 배우자가 있으면 배우자 상속공제(최소 5억)가 적용됩니다.',
    showIf: (a) => a.recipient !== 'spouse',   // 받는사람=배우자면 배우자 존재 확정 → 질문 스킵 (COMPARE-R2-04 모순 방지)
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

/* 요청 본문 — 화면의 답을 엔진 입력으로 옮기는 «유일한» 자리. 순수 함수(tests_burden_compare_request.js 가 실행).
   원칙: 세액을 좌우하는 사실(취득가·취득일·주택 수)은 사용자가 답한 값만 보낸다. 엔진 기본값에 기대지 않는다. */
/* 답 저장 — 순수 함수(시험 대상). 취득일이 바뀌면 그 날짜에 딸린 답(취득 당시 지역·전입일)을 지운다.
   지우지 않으면 낡은 답이 새 취득일의 요청에 다시 실린다(TASK-261003-007 R3-F2). */
function cmpApplyAnswer(a, id, v) {
  const next = Object.assign({}, a);
  next[id] = v;
  if (id === 'acquisitionDate' && a[id] !== v) {
    delete next.regulatedAtAcq;
    delete next.moveInDate;
  }
  // 받는 분이 바뀌면 그 사람에 딸린 답(받는 분 세대의 주택 수)과, 받는 분에 따라 뜻이 갈리는 상속 비교용 답
  // (배우자 유무·자녀 수)을 지운다 — 뒤 문항에서 다시 답한다(TASK-261003-007 R6-F1·F2, 엔진 R7-F1).
  if (id === 'recipient' && a[id] !== undefined && a[id] !== v) {
    delete next.recipientHouseCount;
    delete next.hasSpouse;
    delete next.numChildren;
  }
  return next;
}

function cmpBuildBody(answers, todayIso) {
  const clamp = (x) => Math.max(0, Math.round(Number(x) || 0));
  const today = todayIso || cmpIsoDate(new Date());
  const value = clamp(answers.propertyValue), acq = clamp(answers.acquisitionPrice);
  if (value <= 0) return { error: '부동산 시세를 입력해 주세요.' };
  if (!['1', '2', '3', 'unknown'].includes(String(answers.housingCount))) return { error: '지금 소유자 세대의 보유 주택 수를 선택해 주세요.' };
  if (!cmpValidISODate(answers.acquisitionDate)) return { error: '지금 소유자의 취득일을 입력해 주세요.' };
  if (answers.acquisitionDate > today) return { error: '취득일은 오늘보다 뒤일 수 없습니다.' };
  const moveIn = answers.moveInDate || '';
  if (moveIn !== '') {
    if (!cmpValidISODate(moveIn)) return { error: '전입일을 다시 확인해 주세요(살지 않았으면 비워 두세요).' };
    if (moveIn < answers.acquisitionDate || moveIn > today) return { error: '전입일은 취득일부터 오늘 사이여야 합니다.' };
  }
  const needsZoneAtAcq = answers.acquisitionDate >= '2017-08-03';
  if (needsZoneAtAcq && !['yes', 'no', 'unknown'].includes(answers.regulatedAtAcq)) return { error: '취득 당시 조정대상지역 여부를 선택해 주세요.' };
  if (!['yes', 'no', 'unknown'].includes(answers.adjustedZone)) return { error: '그 부동산이 조정대상지역에 있는지 선택해 주세요.' };
  const rawChildren = answers.numChildren;
  if (rawChildren === '' || rawChildren === undefined || rawChildren === null) return { error: '자녀 수를 입력해 주세요(없으면 0).' };
  const toChild = answers.recipient === 'child_adult' || answers.recipient === 'child_minor';
  if (toChild && clamp(rawChildren) < 1) return { error: '받는 분이 자녀이면 자녀 수는 1 이상이어야 합니다.' };
  const needsRecipientHouses = answers.recipient === 'child_adult';
  if (needsRecipientHouses && !['0', '1', '2', '3', 'unknown'].includes(String(answers.recipientHouseCount))) return { error: '받는 분 세대의 주택 수를 선택해 주세요.' };
  const areaClass = { under: '85이하', over: '85초과', unknown: '모름' }[answers.areaClass];
  if (!areaClass) return { error: '전용면적이 85㎡ 이하인지 선택해 주세요.' };
  /* 막는 답 — 엔진을 부르지 않고 «세무사 확인» 안내로 간다. 「모름」·빈칸을 1채·비조정·시세의 절반 같은 값으로 바꿔 보내지 않는다(261011). */
  const blockReasons = [];
  if (acq <= 0) blockReasons.push('취득가액을 모르면 환산취득가액 등 확인이 필요하므로 상담을 권합니다. 매매(양도세) 금액은 취득가액에 따라 크게 달라지는데, 이 계산기는 취득가액을 짐작해 계산하지 않습니다.');
  if (answers.housingCount === 'unknown') blockReasons.push('지금 소유자 세대의 주택 수를 모르면 세무사 확인이 필요합니다. 세대 주택 수에 따라 양도세 비과세·다주택 중과와 취득세 중과 여부가 갈립니다.');
  if (answers.adjustedZone === 'unknown') blockReasons.push('대상 주택이 조정대상지역에 있는지 모르면 세무사 확인이 필요합니다. 조정대상지역 여부에 따라 양도세 중과·증여 취득세 중과가 갈립니다.');
  if (needsRecipientHouses && answers.recipientHouseCount === 'unknown') blockReasons.push('받는 분 세대의 주택 수를 모르면 세무사 확인이 필요합니다. 매수인의 취득세율이 받는 분 세대의 주택 수로 갈립니다.');
  if (blockReasons.length > 0) return { blocked: true, blockReasons };
  const sv = clamp(answers.standardValue);
  return { body: {
    property_value: value,
    ...(sv > 0 ? { standard_value: sv } : {}),   // 공시가격: 입력했을 때만(비우면 엔진이 미입력으로 보고 경고)
    acquisition_price: acq,
    acquisition_date: answers.acquisitionDate,
    owner_housing_count: Number(answers.housingCount),
    is_regulated_area: answers.adjustedZone === 'yes',
    // 취득 «당시» 조정대상지역(거주 요건) — 지금의 지정 여부와 다른 사실. 답한 것만 보낸다: 「모름」·묻지 않은 경우(기준일 전 취득)는 키가 없다.
    //   모르면 엔진이 두 값으로 대조 계산해 결과가 갈리면 입력 보완(needs_input)을 돌려준다.
    ...(needsZoneAtAcq && answers.regulatedAtAcq !== 'unknown' ? { regulated_at_acquisition: answers.regulatedAtAcq === 'yes' } : {}),
    ...(moveIn !== '' ? { owner_move_in_date: moveIn } : {}),
    relationship: answers.recipient === 'spouse' ? '배우자' : '직계존속',
    recipient_age: answers.recipient === 'child_minor' ? 10 : 30,   // 미성년(만19세 미만)→엔진이 §53②단서 2천만 공제 적용
    has_spouse: answers.recipient === 'spouse' ? true : answers.hasSpouse !== 'no',   // 받는사람=배우자면 소유자에게 배우자 존재 확정 (COMPARE-R2-04 모순입력 차단)
    num_children: clamp(rawChildren),
    other_estate_value: clamp(answers.otherEstate),
    property_type: '주택',
    // 면적 구분(농어촌특별세): 「모름」도 그대로 보낸다 — 엔진이 과세로 계산하고 경고한다(보내지 않으면 84㎡ 가정).
    area_class: areaClass,
    // 받는 분 세대의 다른 주택 수(매매 시나리오의 매수인 취득세율): 성년 자녀에게만 묻고 답한 값만 보낸다(「모름」은 위에서 막았다).
    ...(needsRecipientHouses ? { recipient_other_house_count: Number(answers.recipientHouseCount) } : {}),
  } };
}
if (typeof window !== 'undefined') { window.jtCompareBuildBody = cmpBuildBody; }

async function callCompareEng(body) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  const delays = [1000, 2000, 4000, 8000];
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
      if (!res.ok) { const _err = new Error('engine ' + res.status); _err.status = res.status; throw _err; }
      return await res.json();
    } catch (e) { lastErr = e; if (e && e.status >= 400 && e.status < 500) break; if (attempt < delays.length) await new Promise(r => setTimeout(r, delays[attempt])); }
  }
  throw lastErr;
}

/* ══════════════════════════════════════════════════════════════════════════
   엔진 응답 판독 (261011 계약 정합) — 금액은 엔진이 `상태: ok` 로 답한 값뿐이다. 종부세 화면(compEngineVerdict)과 같은 갈래:
     · ok          — 상태 'ok' + 오류 필드 없음 + 세 시나리오(증여·매매·상속)가 모두 유효(아래 allValid) → precise:true
     · needs_input — 상태 'needs_input'(입력을 채우거나 고치면 계산 가능) → 차단 안내 + 엔진 안내 문구(engineMessage)
     · unsupported — 상태 'unsupported' → 차단 안내 + 엔진 안내 문구
     · refused     — 상태 키가 없음(형식 오류)·알 수 없는 상태·ok 인데 오류 필드, 또는 HTTP 4xx(408·429 제외) → 차단 안내
     · down        — 상태 'error'(시나리오 계산 실패 등 엔진 내부 실패)·ok 인데 응답이 불완전·calc 없음·네트워크 오류·타임아웃·5xx·408·429 → 다시 시도 안내
   ⚠️ 시험(tests_compare_request.js)이 «이 함수 + 같은 파일의 allValid 식» 만 꺼내 실행한다 — 다른 모듈 상수·함수를 부르지 않는다.
   ══════════════════════════════════════════════════════════════════════════ */
function cmpEngineVerdict(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'down';
  /* 새 엔진은 항상 «상태» 를 낸다 — 상태 키가 없는 응답은 금액으로 받지 않는다(연결은 됐고 형식이 맞지 않는 것이므로 down 이 아니라 refused). */
  if (!Object.prototype.hasOwnProperty.call(c, '상태')) return 'refused';
  if (c['상태'] === 'needs_input') return 'needs_input';
  if (c['상태'] === 'unsupported') return 'unsupported';
  if (c['상태'] === 'error') return 'down';
  if (c['상태'] !== 'ok') return 'refused';
  if (c['오류'] || c.error || c.errors || c.detail || c.success === false) return 'refused';
  const scv = c['시나리오별'];
  // 수정 260628(COMPARE-R2-01): 빈 dict·부분 0원을 '정밀'로 신뢰하지 않음. 처분비교는 취득세(양수)가 늘 포함되어 정상 시 총세부담>0 — 0원/누락은 계산실패 신호(지법 §11①). 3시나리오 모두 유효할 때만 precise.
  // P1-4(코덱스): 공통 무결성 검증기로 오류·NaN·누락 거부. 처분비교는 취득세(양수)가 늘 포함되어
  // 정상 시 총세부담>0이므로, 이 세목 한정 도메인 규칙으로 >0을 함께 확인(0원/빈응답=계산실패 신호).
  // 261003(TASK-261003-007 R1-F4): 실패 시나리오가 하나라도 있으면 정밀 결과가 아니다. 화면·상담 본문에 쓰는
  // 세목별 금액도 모두 유한한 수여야 하고, 총세부담은 그 합과 같아야 한다.
  const allValid = c && !c['오류'] && !c.error && c.success !== false && scv
    && !(Array.isArray(c['실패시나리오']) && c['실패시나리오'].length > 0)
    && ['증여', '매매', '상속'].every(m => window.jtValidCalc(scv[m], ['총세부담', '증여세', '양도세', '상속세', '취득세'])
      && scv[m]['계산실패'] !== true && Number(scv[m]['총세부담']) > 0
      && scv[m]['총세부담'] === scv[m]['증여세'] + scv[m]['양도세'] + scv[m]['상속세'] + scv[m]['취득세']);
  return allValid ? 'ok' : 'down';
}
function cmpCalcFromEngine(ej) {
  const c = ej && ej.calc;
  const verdict = cmpEngineVerdict(c);
  if (verdict === 'down') return { precise: false, engineErr: true, engineState: 'down' };
  if (verdict !== 'ok') {
    if (!Object.prototype.hasOwnProperty.call(c, '상태')) return { precise: false, blocked: true, engineState: 'refused', engineMessage: '엔진 응답 형식이 맞지 않습니다(상태 없음) — 잠시 후 다시 시도하거나 상담을 이용하세요' };
    const msg = [c['오류'], c.error].find(x => typeof x === 'string' && x.trim());
    return { precise: false, blocked: true, engineState: verdict, engineMessage: msg ? msg.trim() : '' };
  }
  // ★ c['최적방법']·c['절세액'] 은 의도적으로 사용하지 않음(판단 라벨 억제)
  return {
    precise: true, engineVer: ej.version && ej.version.engine,
    scenarios: c['시나리오별'],   // {증여, 매매, 상속}
    engineWarnings: Array.isArray(c['경고사항']) ? c['경고사항'] : [],
  };
}
/* 호출 자체가 던진 예외 — HTTP 4xx(callCompareEng 이 status 를 달아 던진다)는 엔진의 «거부», 그 밖은 «연결 실패».
   408(시간 초과)·429(호출 제한)는 입력 문제가 아니라 일시적 상태다 — 다시 시도를 안내한다. */
function cmpCalcFromEngineError(e) {
  return (e && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429)
    ? { precise: false, blocked: true, engineState: 'refused', engineMessage: '' }
    : { precise: false, engineErr: true, engineState: 'down' };
}

function buildCompareDetail(answers, calc) {
  const L = ['■ 고객 입력 정보'];
  CMP_QS.forEach(q => {
    if (q.showIf && !q.showIf(answers)) return;   // 숨겨진 문항의 낡은 답은 요청에도 쓰이지 않았다(TASK-261003-007 R2-F3)
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

// 면적 구분을 상담 요약에 적는 문구 — 「모름」은 계산 전제(농어촌특별세 포함)까지 적는다(TASK-261004-013 R1-F1).
function cmpAreaLabel(v) {
  return { under: '85㎡ 이하', over: '85㎡ 초과', unknown: '모름(85㎡ 초과로 보고 농어촌특별세를 넣어 계산)' }[v] || '';
}
function buildCompareKakao(answers, calc) {
  const L = ['[JT택스랩 처분방법 비교 — 상담 요청]', '', '▶ 입력'];
  L.push('· 부동산 시가: ' + cmpWon(Number(answers.propertyValue) || 0));
  L.push('· 취득가: ' + cmpWon(Number(answers.acquisitionPrice) || 0));
  L.push('· 받는 사람: ' + (answers.recipient === 'spouse' ? '배우자' : '자녀'));
  if (cmpAreaLabel(answers.areaClass)) L.push('· 전용면적: ' + cmpAreaLabel(answers.areaClass));
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

  // showIf 거르기(COMPARE-R2-04): recipient=배우자면 hasSpouse 질문 스킵. acquisition/inheritance 위저드와 동일 패턴.
  const visibleQ = CMP_QS.filter(q => !q.showIf || q.showIf(answers));
  const total = visibleQ.length;
  const safeStep = Math.min(step, total - 1);
  const cur = visibleQ[safeStep];
  const isLast = safeStep === total - 1;
  const setAns = (id, v) => setAnswers(a => cmpApplyAnswer(a, id, v));

  const canNext = () => {
    if (!cur) return false;
    if (cur.freeform) return true;
    if (cur.numeric) {
      if (cur.optional) return true;
      if (cur.blockOnBlank) return true;   // 빈칸·0 도 통과 — 요청 단계에서 «세무사 확인» 안내로 막는다(0원으로 계산하지 않는다)
      const raw = answers[cur.id];
      if (raw === '' || raw === undefined || raw === null) return false;   // 빈칸=미상태(차단). '0'은 통과 — 미상태 vs 0 구분
      const v = Number(raw);
      return !isNaN(v) && (cur.allowZero ? v >= 0 : v > 0);
    }
    if (cur.date) {
      const v = answers[cur.id] || '';
      if (cur.optional && v === '') return true;                             // 선택 문항: 비워도 된다
      if (!cmpValidISODate(v) || v > cmpIsoDate(new Date())) return false;   // 미래 불허
      if (cur.id === 'moveInDate') return v >= (answers.acquisitionDate || '');   // 전입일은 취득일 이후
      return true;
    }
    return !!answers[cur.id];
  };

  const runAnalysis = async () => {
    setLoading(true); setErr(null);
    try {
      const built = cmpBuildBody(answers);
      if (built.error) { setErr(built.error); setLoading(false); return; }
      /* 막는 답(모름·취득가액 없음)이면 엔진을 부르지 않고 안내 화면으로 — 금액을 짐작해 내지 않는다 */
      if (built.blocked) { setReport({ calc: { precise: false, blocked: true, blockReasons: built.blockReasons, zoneYes: false, areaUnknown: false } }); setLoading(false); return; }
      const body = built.body;

      /* ★ 금액은 엔진이 `상태: ok` 로 준 값뿐이다 — 자체 계산식으로 메우지 않는다(cmpEngineVerdict 주석). */
      let calc;
      try {
        calc = cmpCalcFromEngine(await callCompareEng(body));
      } catch (e) {
        console.warn('처분비교 엔진 호출 실패', e);
        calc = cmpCalcFromEngineError(e);
      }
      calc.zoneYes = answers.adjustedZone === 'yes';
      calc.areaUnknown = answers.areaClass === 'unknown';
      setReport({ calc });
    } catch (e) { console.error(e); setErr(e.message || '계산 중 오류가 발생했습니다.'); }
    finally { setLoading(false); }
  };

  const goNext = () => { if (isLast) runAnalysis(); else setStep(s => s + 1); };
  const goPrev = () => { if (safeStep > 0) setStep(s => s - 1); else onBack(); };

  if (loading) {
    return (
      <div className="jt-container">
        <JTReportShell title="처분방법 비교" subtitle="증여·매매·상속 세금을 계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="LIVE">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />증여·매매·상속 세 가지 방법의 예상 세금을 각각 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc } = report;
    const sc = calc.scenarios || {};
    const cmpTotal = (m) => cmpWon((sc[m] || {})['총세부담']);
    return (
      <div className="jt-container">
        <JTReportShell title="처분방법 비교 결과" subtitle="증여 vs 매매 vs 상속 — 예상 세금(세액만 비교)" stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
          {calc.blocked ? (
            <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '14px 18px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6 }}>
              <strong>{calc.engineState === 'needs_input' ? '입력 확인이 필요합니다.' : '세무사 확인이 필요한 조건입니다.'}</strong> 입력하신 조건으로는 금액을 확정할 수 없어, 잘못된 세액을 안내하지 않기 위해 금액을 표시하지 않았어요. 입력을 다시 확인하시거나 상담을 권합니다.
              {Array.isArray(calc.blockReasons) && calc.blockReasons.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>{calc.blockReasons.map((w, i) => <li key={i} style={{ marginBottom: 4 }}>{String(w)}</li>)}</ul>
              )}
              {calc.engineMessage && (
                <p style={{ margin: '8px 0 0', fontSize: 13.5 }}>엔진 안내: {window.jtEngineMessageForDisplay(calc.engineMessage)}</p>
              )}
              <div style={{ marginTop: 8 }}>
                <button className="jt-btn jt-btn--ghost" onClick={() => setReport(null)}>입력 다시 확인 →</button>
                {calc.engineState === 'refused' && !calc.blockReasons && (
                  <button className="jt-btn jt-btn--ghost" style={{ marginLeft: 8 }} onClick={() => runAnalysis()}>다시 시도 →</button>
                )}
              </div>
            </div>
          ) : !calc.precise ? (
            <div style={{ background: '#fdeeec', borderLeft: '4px solid #c0392b', padding: '14px 18px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6 }}>
              <strong>정밀 계산이 필요합니다.</strong> 정밀 엔진 연결이 지연됐습니다. 잘못된 세액을 안내하지 않기 위해 결과를 표시하지 않았어요. 잠시 후 다시 시도하거나 상담을 권합니다.
              <div style={{ marginTop: 8 }}><button className="jt-btn jt-btn--ghost" onClick={() => runAnalysis()}>정밀 계산 다시 시도 →</button></div>
            </div>
          ) : (
            <>
              {calc.areaUnknown && (
                <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6, fontSize: 13.5 }}>
                  <strong>전용면적을 「모름」으로 두셨습니다.</strong> 전용 85㎡를 넘는 것으로 보고 받는 분의 취득세에 농어촌특별세를 넣어 계산했습니다. 85㎡ 이하이면 농어촌특별세가 없어 세금이 줄어들므로, 확인한 뒤 다시 계산해 주세요.
                </div>
              )}
              {/* 수정 260628(COMPARE-R2-02): 엔진 경고사항(시나리오 가정·계산 알림) 화면 노출 */}
              {calc.engineWarnings && calc.engineWarnings.length > 0 && (
                <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginBottom: 16, borderRadius: 8 }}>
                  <strong>확인이 필요한 점</strong>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>{calc.engineWarnings.map((w, i) => <li key={i} style={{ marginBottom: 4 }}>{String(w)}</li>)}</ul>
                </div>
              )}
              {/* 헤드라인 — '지금 넘기면(증여·매매)' vs '안 주고 기다리면(상속 기준선)' */}
              <div className="jt-report-result__grade jt-grade-mid">
                <div className="jt-report-result__grade-label">예상 세금 (세액만 비교)</div>

                {/* ① 지금 실행하는 방법 — 증여·매매 */}
                <div style={{ fontSize: 12.5, fontWeight: 700, opacity: 0.78, marginTop: 12, marginBottom: 6, textAlign: 'left' }}>지금 넘기면</div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {['증여', '매매'].map(m => (
                    <div key={m} style={{ flex: '1 1 140px', minWidth: 130, background: 'rgba(255,255,255,.6)', borderRadius: 10, padding: '12px 10px' }}>
                      <div style={{ fontSize: 13, opacity: 0.8 }}>{m}</div>
                      <div style={{ fontSize: 19, fontWeight: 800, marginTop: 4 }}>{cmpTotal(m)}</div>
                    </div>
                  ))}
                </div>

                {/* ② 안 주고 기다리는 경우 — 상속(비교 기준선, 사망 전제) */}
                <div style={{ fontSize: 12.5, fontWeight: 700, opacity: 0.62, marginTop: 14, marginBottom: 6, textAlign: 'left' }}>안 주고 기다리면 <span style={{ fontWeight: 400 }}>· 상속 (비교 기준선)</span></div>
                <div style={{ background: 'rgba(255,255,255,.28)', border: '1px dashed rgba(0,0,0,.22)', borderRadius: 10, padding: '12px 14px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                    <span style={{ fontSize: 13, opacity: 0.75 }}>상속 (사망 시 한 번에 이전)</span>
                    <span style={{ fontSize: 19, fontWeight: 800 }}>{cmpTotal('상속')}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#8a6d3b', marginTop: 5, lineHeight: 1.55 }}>＊ 상속은 <strong>사망을 전제</strong>로 해 시점을 정할 수 없어요. 「현재 재산 기준 <strong>약 10년 뒤</strong>」를 가정한 추정이며, 실제 사망 시점·사전증여 합산(10년)·자산가치 변동에 따라 크게 달라집니다.</div>
                </div>

                <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6, color: '#b8860b' }}>※ <strong>세금(세액)만 비교한 추정</strong>입니다. 금액이 가장 적은 방법이 곧 정답은 아니에요 — 방법마다 「세금 외」 함정(증여 이월과세·매매 증여추정·상속 시점 등)과 실행가능성·자금 사정이 있어, 이 숫자만으로 결정하면 안 됩니다.</div>
                <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.65, color: '#8a6d3b' }}>· <strong>매매(양도세)</strong>는 입력하신 취득일·취득가와 「오늘 시세대로 파는 것」을 기준으로 했고, 입력하신 대로 <strong>{calc.zoneYes ? '조정대상지역' : '조정대상지역이 아닌 것'}</strong>으로 계산했습니다. 매수인(받는 분)의 취득세율은 받는 분 세대의 주택 수로 판정했고, 대금을 실제로 지급한다고 전제했습니다.</div>
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
                <p style={{ margin: 0, fontSize: 13.5, color: '#5a5a5a', lineHeight: 1.65 }}>이 셋은 사례마다 답이 달라 자동 계산만으론 위험합니다.<br/><strong>세무사가 직접 검토</strong>해 드립니다 — 문의를 접수하면 검토 범위와 보수를 견적으로 안내합니다.</p>
              </section>

              {/* 판단 = 상담 (프리미엄 전환점) */}
              <section className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '16px 18px' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 800, fontSize: 15 }}>그래서 어느 방법이 유리한가요?</p>
                <p style={{ margin: '0 0 12px', lineHeight: 1.7 }}>그건 <strong>사장님 상황마다 다릅니다</strong> — 소유자 연세·건강(상속 시점), 자녀 자금, 보유 기간, 사전증여 이력, 향후 매각 계획까지 함께 봐야 「진짜 답」이 나옵니다. 위 숫자는 <strong>출발점</strong>이고, <strong>내 사례에 맞는 최적 경로와 실행 순서는 세무사가 직접 검토</strong>해 드립니다.</p>
              </section>

              {calc.precise && typeof JTReportConvert === 'function' && (
                <JTReportConvert
                  calcId="compare"
                  completeEligible={true}
                  precise={calc.precise}
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
      <JTReportShell title="처분방법 비교" subtitle="같은 부동산, 증여·매매·상속 중 세금이 어떻게 다른지 한눈에 비교합니다." stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="LIVE">
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
              <JTNumericInput money={!!cur.money} className="jt-report-q__input" type="text" inputMode="numeric" placeholder={cur.placeholder || ''}
                value={answers[cur.id] || ''} onChange={e => setAns(cur.id, e.target.value)} />
              {cur.money && Number(answers[cur.id]) > 0 && (
                <div style={{ fontSize: 14, color: 'var(--accent,#2a6d4f)', marginTop: 6 }}>= {cmpKorean(Number(answers[cur.id]))}</div>
              )}
            </div>
          )}

          {cur.date && (
            <input
              className="jt-report-q__input"
              type="text"
              inputMode="numeric"
              placeholder="예: 2016-09-03 (숫자 8자리로 입력)"
              value={answers[cur.id] || ''}
              onChange={(e) => {
                // 숫자만 받아 YYYY-MM-DD로 자동 정리 (ReportCGT 와 같은 방식)
                let d = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
                if (d.length > 6) d = d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
                else if (d.length > 4) d = d.slice(0, 4) + '-' + d.slice(4);
                setAns(cur.id, d);
              }}
            />
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

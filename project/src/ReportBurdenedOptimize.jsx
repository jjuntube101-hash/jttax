/* @jsx React.createElement */
/* 부담부증여 — 자녀/배우자에게 부동산을 증여할 때 딸린 채무(전세·대출)를 함께 넘기면
   총세금(증여세+양도세+취득세)이 얼마나 달라지는가. 엔진 /v1/calc/optimize-burdened-gift.
   ★ 프리미엄 설계(옵션 B): 무료=「입력한 채무 범위 안에서」 줄일 수 있는 세금(금액) + §47③ 안전경고.
   🔒 상담=「안전한 채무 금액」 + 실행 방법. 엔진이 찾은 최저 지점은 그대로 노출하지 않는다.
   261003 정확성 개편: ①실제 채무액을 받아 그 범위 안에서만 비교(채무는 실재해야 한다)
   ②받는 사람의 변제 능력 증명 여부를 묻는다(가족 간이면 그 증명이 있어야 채무 부분이 유상취득 —
   지방세법 §7⑪·⑫) ③보유 연수 반올림 대신 취득일을 받는다 ④「모름」을 「아니오」와 구분한다
   ⑤엔진이 계산을 거부한 경우(지원 범위 밖)와 연결 실패를 구분해 안내한다.
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
// 실제로 존재하는 YYYY-MM-DD 인가 (2월 30일 같은 값 거부)
function bgValidISODate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const y = Number(v.slice(0, 4)), m = Number(v.slice(5, 7)), d = Number(v.slice(8, 10));
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
function bgIsoDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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
    opts: [['house', '주택 (아파트·빌라·단독)', ''], ['officetel', '오피스텔', '자동 계산 대신 세무사 확인'], ['land', '토지', '비과세 없음'], ['commercial', '상가·건물', '비과세 없음']],
  },
  {
    id: 'standardValue', section: '대상 부동산',
    q: '그 부동산의 공시가격(시가표준액)을 아시면 넣어 주세요. (선택, 원)',
    sub: '조정대상지역 주택의 증여 취득세 중과는 시세가 아니라 공시가격이 3억원 이상인지로 판정합니다(지방세법 시행령 §28의6). 모르면 비워 두세요 — 시세로 가늠해 계산하고, 결과 화면에서 그 전제를 알려 드립니다.',
    numeric: true, money: true, optional: true, placeholder: '예: 900,000,000 (모르면 비움)',
  },
  {
    id: 'acquisitionPrice', section: '대상 부동산',
    q: '증여하는 분(예: 부모님)이 그 집을 살 때 얼마였나요? (취득가, 원)',
    sub: '부담부증여에서 「채무 인수분」은 유상양도로 보아 증여자에게 양도세가 나옵니다. 그 양도세 계산에 취득가가 꼭 필요합니다.',
    numeric: true, money: true, placeholder: '예: 400,000,000',
  },
  {
    id: 'acquisitionDate', section: '증여하는 분',
    q: '증여하는 분이 그 부동산을 언제 취득했나요? (잔금일 또는 등기접수일)',
    sub: '채무 인수분(유상양도)의 양도세는 보유기간으로 갈립니다 — 단기 보유 세율과 장기보유특별공제가 날짜 단위로 달라지므로 「몇 년쯤」이 아니라 취득일을 넣어 주세요. 숫자 8자리로 입력하면 자동 정리됩니다 (예: 20160903 → 2016-09-03).',
    date: true,
  },
  {
    id: 'regulatedAtAcq', section: '증여하는 분',
    q: '증여하는 분이 그 주택을 「취득할 당시」, 그곳이 조정대상지역이었나요?',
    sub: '취득할 당시 조정대상지역에 있던 주택은, 1세대1주택 비과세를 받으려면 보유 기간 중 2년 이상 거주해야 합니다(소득세법 시행령 §154①). 지금의 지정 여부와는 다른 질문입니다. 모르면 「모름」을 고르세요 — 조정대상지역이었던 것으로 보고(거주 요건 적용) 계산합니다.',
    // 기준일은 엔진의 REGULATED_RESIDENCE_START(support/exemption_rules.py)와 같은 값 — 그 전 취득분에는 엔진이 거주 요건을 적용하지 않는다.
    showIf: (a) => bgIsDwelling(a.assetType) && typeof a.acquisitionDate === 'string' && a.acquisitionDate >= '2017-08-03',
    opts: [['yes', '네, 조정대상지역이었습니다', '거주 2년 요건 적용'], ['no', '아니오', ''], ['unknown', '모름', '조정대상지역이었던 것으로 계산']],
  },
  {
    id: 'moveInDate', section: '증여하는 분',
    q: '증여하는 분이 그 주택에 들어가 살기 시작한 날(전입일)은? (선택)',
    sub: '거주 기간은 1세대1주택 비과세의 거주 요건과 장기보유특별공제율에 반영됩니다. 그날부터 지금까지 계속 거주한 것으로 계산합니다. 실제로 살지 않았으면 비워 두세요. 숫자 8자리로 입력하면 자동 정리됩니다.',
    showIf: (a) => bgIsDwelling(a.assetType),
    date: true, optional: true,
  },
  {
    id: 'actualDebt', section: '딸린 채무',
    q: '이 부동산에 딸린 채무는 모두 얼마인가요? (전세보증금 + 담보대출, 원)',
    sub: '받는 사람이 함께 넘겨받을 수 있는 채무는 「실제로 있는」 전세보증금·담보대출뿐입니다. 이 금액 범위 안에서만 비교합니다. 채무가 없으면 0을 넣어 주세요.',
    numeric: true, money: true, allowZero: true, placeholder: '예: 500,000,000 (없으면 0)',
    maxOf: 'propertyValue', maxMsg: '채무는 부동산 시세를 넘을 수 없습니다.',
  },
  {
    id: 'doneeCanRepay', section: '딸린 채무',
    q: '받는 분이 「본인의」 소득이나 재산으로 그 채무를 갚을 수 있음을 증명할 수 있나요?',
    sub: '자녀·배우자가 넘겨받는 채무는, 받는 분 본인의 소득·재산으로 갚을 수 있음이 증명되어야 취득세에서 「유상취득」으로 인정됩니다(지방세법 §7⑪·⑫). 증여받는 그 부동산이나 앞으로 받을 전세보증금은 여기에 들어가지 않습니다. 모르면 「모름」을 고르세요 — 증명되지 않는 것으로 보고 계산합니다.',
    showIf: (a) => Number(a.actualDebt) > 0,
    opts: [['yes', '네, 증명할 수 있습니다', '소득금액증명·보유 재산 등'], ['no', '아니오', '채무 부분도 증여 취득세율'], ['unknown', '모름', '증명되지 않는 것으로 계산']],
  },
  {
    id: 'donorHouseCount', section: '증여하는 분',
    q: '증여하는 분의 「세대」가 이 부동산 외에 보유한 주택은 몇 채인가요?',
    sub: '본인뿐 아니라 같은 세대의 배우자 등이 가진 주택까지 셉니다. 채무 인수분의 양도세(1세대1주택 비과세)와 증여 취득세 중과 여부가 이 숫자로 갈립니다(소법 §89·§104⑦, 지방세법 §13의2②).',
    opts: [['0', '이 부동산이 유일 (다른 주택 없음)', '1세대1주택'], ['1', '1채 더 있음 (총 2주택)', '비과세 배제 가능'], ['2', '2채 더 있음 (총 3주택)', '중과 가능'], ['3', '3채 이상 더 (총 4주택+)', '중과 가능']],
  },
  {
    id: 'recipient', section: '받는 사람',
    q: '누구에게 넘기려 하나요?',
    sub: '받는 사람에 따라 증여재산공제·세율이 달라집니다. 미성년 자녀는 증여공제가 5천만 → 2천만으로 줄어듭니다.',
    opts: [['child_adult', '자녀에게 (성년)', '만 19세 이상'], ['child_minor', '자녀에게 (미성년)', '만 19세 미만'], ['spouse', '배우자에게', '']],
  },
  {
    id: 'doneeHouseCount', section: '받는 사람',
    q: '받는 분의 「세대」가 이 부동산 외에 보유한 주택은 몇 채인가요?',
    sub: '채무를 넘겨받는 부분은 「유상취득」이어서, 받는 분 세대의 주택 수에 따라 취득세율이 달라집니다(지방세법 §13의2①). ' + '받는 분과 같은 세대의 배우자·미혼 30세 미만 자녀 등이 가진 주택까지 셉니다. 받는 분이 미혼이고 30세 미만이면 원칙적으로 부모와 같은 세대로 보므로, 그 경우 부모 세대의 주택까지 세어 주세요(지방세법 시행령 §28의3). 조합원입주권·주택분양권·오피스텔도 주택 수에 들어갑니다(시행령 §28의4①). 모르면 「모름」을 고르세요 — 1주택 기준으로 계산하고, 결과 화면에서 그 전제를 알려 드립니다.',
    // 배우자·미성년 자녀는 증여하는 분과 같은 세대라서 엔진이 증여자 세대의 주택 수를 그대로 쓴다 — 성년 자녀에게만 묻는다.
    showIf: (a) => bgNeedsDoneeHouses(a),
    opts: [['0', '없음 (무주택)', ''], ['1', '1채', ''], ['2', '2채', ''], ['3', '3채 이상', ''], ['unknown', '모름', '1주택 기준으로 계산']],
  },
  {
    id: 'adjustedZone', section: '대상 부동산',
    q: '그 부동산이 조정대상지역에 있나요?',
    sub: '조정대상지역이면 채무 인수분 양도세 중과·증여 취득세 중과가 적용될 수 있어 결과가 크게 달라집니다. 모르면 「모름」을 고르세요 — 조정대상지역이 아닌 것으로 계산하고, 결과 화면에서 그 전제를 알려 드립니다.',
    opts: [['yes', '네, 조정대상지역', '중과 가능'], ['no', '아니오', ''], ['unknown', '모름', '비조정으로 계산 — 확인 필요']],
  },
  {
    // 오너 결재 261004 A-3: 종전에는 면적을 묻지 않고 84㎡(농어촌특별세 비과세)로 가정했다. 주택에만 묻는다 —
    //   토지·상가는 면적과 무관하게 농어촌특별세가 과세된다.
    id: 'areaClass', section: '대상 부동산',
    q: '그 주택의 전용면적이 85㎡ 이하인가요?',
    sub: '전용 85㎡(약 25.7평)를 넘는 주택은 받는 분의 취득세에 농어촌특별세가 더해집니다(농어촌특별세법 §4 11호). 등기사항증명서나 분양계약서에 적힌 전용면적으로 판단하세요. 모르면 「모름」을 고르세요 — 농어촌특별세를 넣어 계산하고, 결과 화면에서 그 전제를 알려 드립니다.',
    showIf: (a) => (a.assetType || 'house') === 'house',
    opts: [['under', '네, 85㎡ 이하', '농어촌특별세 없음'], ['over', '아니오, 85㎡ 초과', '농어촌특별세 추가'], ['unknown', '모름', '농어촌특별세를 넣어 계산']],
  },
  {
    id: 'context', section: '추가 사항',
    q: '추가로 알려주실 내용이 있나요? (선택)',
    sub: '채무의 종류(전세보증금·은행 대출), 받는 분의 소득·재산, 증여하는 분의 거주 기간 등 — 실제 판단에 중요합니다(상담에서 반영).',
    freeform: true, optional: true, placeholder: '예: 전세보증금 5억(임차인 거주 중) / 자녀 연소득 6천만 / 아버지 10년 거주',
  },
];

/* 요청 본문 — 화면의 답을 엔진 입력으로 옮기는 «유일한» 자리. 순수 함수(tests_burden_compare_request.js 가 실행).
   원칙: 화면이 묻지 않은 사실을 지어내지 않는다. 「모름」은 값을 보내지 않아 엔진이 «모름»으로 처리하게 한다. */
// 양도세에서 주택으로 계산되는 유형 — 엔진은 오피스텔도 주택으로 보고 1세대1주택 비과세를 판정한다
//   (core/transfer_tax_calculator.py). 그래서 거주 요건 문항은 오피스텔에도 묻는다(TASK-261003-007 R2-F1).
function bgIsDwelling(t) {
  const v = t || 'house';
  return v === 'house' || v === 'officetel';
}

// 받는 분 세대의 주택 수를 물어야 하는 경우: 주택 + 채무 있음 + 변제 능력 증명 가능(=채무 부분이 유상취득) + 성년 자녀.
function bgNeedsDoneeHouses(a) {
  return (a.assetType || 'house') === 'house' && Number(a.actualDebt) > 0
    && a.doneeCanRepay === 'yes' && a.recipient === 'child_adult';
}

/* 답 저장 — 순수 함수(시험 대상). 자산 유형·취득일이 바뀌면 그 값에 딸린 답(취득 당시 지역·전입일)을 지운다.
   지우지 않으면 숨겨졌던 낡은 답이 다른 조건의 요청에 다시 실린다(TASK-261003-007 R3-F1). */
function bgApplyAnswer(a, id, v) {
  const next = Object.assign({}, a);
  next[id] = v;
  if ((id === 'assetType' || id === 'acquisitionDate') && a[id] !== v) {
    delete next.regulatedAtAcq;
    delete next.moveInDate;
  }
  // 면적 구분은 «주택»에 딸린 답이다 — 유형이 바뀌면 지운다(주택으로 돌아오면 다시 묻는다).
  if (id === 'assetType' && a[id] !== v) delete next.areaClass;
  // 채무액이 바뀌면 변제 능력 답도 지운다 — 그 답은 «그 금액»에 대한 것이었다(TASK-261003-007 R4-F1).
  if (id === 'actualDebt' && a[id] !== v) delete next.doneeCanRepay;
  // 받는 분이 바뀌어도 지운다 — 변제 능력은 «그 사람»에 대한 답이었다(R5-F1). 받는 분 문항이 뒤에 있어 다시 묻지는
  //   않으므로, 지워진 답은 요청에 실리지 않고 엔진이 「증명되지 않음」으로 계산한 뒤 그 전제를 경고로 알린다.
  //   처음 고를 때(이전 값 없음)는 지우지 않는다.
  if (id === 'recipient' && a[id] !== undefined && a[id] !== v) delete next.doneeCanRepay;
  // 받는 분 세대의 주택 수는 유형·채무액·변제 능력·받는 분에 딸린 답이다(엔진 R7-F1) — 그중 하나가 바뀌면 지운다.
  if ((id === 'assetType' || id === 'actualDebt' || id === 'doneeCanRepay' || id === 'recipient') && a[id] !== v) delete next.doneeHouseCount;
  return next;
}

function bgBuildBody(answers, todayIso) {
  // 오피스텔: 엔진의 세목별 주택 판정(양도세는 주택으로, 증여 취득 중과는 주택이 아닌 것으로 계산)이 실제 사용 현황에 따라
  // 달라질 수 있고 화면이 그 사실관계를 묻지 않는다 — 검증되지 않은 조합이므로 금액을 내지 않고 「세무사 확인 필요」로
  // 안내한다(계획 「차단 우선」. 지원 범위에 넣을지는 오너 검수 사항, TASK-261003-006 R6-F2·007 R2-F1).
  if (answers.assetType === 'officetel') return { blocked: true };
  const clamp = (x) => Math.max(0, Math.round(Number(x) || 0));
  const today = todayIso || bgIsoDate(new Date());
  const value = clamp(answers.propertyValue), acq = clamp(answers.acquisitionPrice);
  if (value <= 0) return { error: '부동산 시세를 입력해 주세요.' };
  if (acq <= 0) return { error: '증여자의 취득가를 입력해 주세요.' };
  if (!bgValidISODate(answers.acquisitionDate)) return { error: '증여하는 분의 취득일을 입력해 주세요.' };
  if (answers.acquisitionDate > today) return { error: '취득일은 오늘보다 뒤일 수 없습니다.' };
  const isHouse = bgIsDwelling(answers.assetType);
  const moveIn = answers.moveInDate || '';
  if (isHouse && moveIn !== '') {
    if (!bgValidISODate(moveIn)) return { error: '전입일을 다시 확인해 주세요(살지 않았으면 비워 두세요).' };
    if (moveIn < answers.acquisitionDate || moveIn > today) return { error: '전입일은 취득일부터 오늘 사이여야 합니다.' };
  }
  const needsZoneAtAcq = isHouse && answers.acquisitionDate >= '2017-08-03';
  if (needsZoneAtAcq && !['yes', 'no', 'unknown'].includes(answers.regulatedAtAcq)) return { error: '취득 당시 조정대상지역 여부를 선택해 주세요.' };
  const rawDebt = answers.actualDebt;
  if (rawDebt === '' || rawDebt === undefined || rawDebt === null) return { error: '딸린 채무 금액을 입력해 주세요(없으면 0).' };
  const debt = clamp(rawDebt);
  if (debt > value) return { error: '채무는 부동산 시세를 넘을 수 없습니다.' };
  if (!['0', '1', '2', '3'].includes(String(answers.donorHouseCount))) return { error: '증여하는 분 세대의 다른 주택 수를 선택해 주세요.' };
  const needsDoneeHouses = bgNeedsDoneeHouses(answers);
  if (needsDoneeHouses && !['0', '1', '2', '3', 'unknown'].includes(String(answers.doneeHouseCount))) return { error: '받는 분 세대의 주택 수를 선택해 주세요.' };
  const asksArea = (answers.assetType || 'house') === 'house';
  const areaClass = { under: '85이하', over: '85초과', unknown: '모름' }[answers.areaClass];
  if (asksArea && !areaClass) return { error: '전용면적이 85㎡ 이하인지 선택해 주세요.' };
  const assetTypeMap = { house: '주택', officetel: '오피스텔', land: '토지', commercial: '상가' };
  const body = {
    property_value: value,
    acquisition_price: acq,
    acquisition_date: answers.acquisitionDate,
    relationship: answers.recipient === 'spouse' ? '배우자' : '직계존속',
    donee_age: answers.recipient === 'child_minor' ? 10 : 30,
    is_regulated_area: answers.adjustedZone === 'yes',
    property_type: assetTypeMap[answers.assetType] || '주택',
    donor_other_house_count: Number(answers.donorHouseCount),
    max_debt: debt,
  };
  // 취득 당시 조정대상지역(1세대1주택 거주 요건): 「모름」은 유리하게 추정하지 않는다 → 조정대상지역이었던 것으로 보낸다.
  //   2017-08-03 전 취득분은 거주 요건이 없으므로 묻지 않고 false.
  if (isHouse) body.regulated_at_acquisition = needsZoneAtAcq ? answers.regulatedAtAcq !== 'no' : false;
  // 전입일: 입력했을 때만. 비우면 «거주하지 않음»으로 계산된다(엔진 기본).
  if (isHouse && moveIn !== '') body.move_in_date = moveIn;
  // 면적 구분(농어촌특별세): 주택에만 보낸다. 「모름」도 그대로 보낸다 — 엔진이 과세로 계산하고 경고한다.
  if (asksArea) body.area_class = areaClass;
  // 공시가격: 입력했을 때만 보낸다. 비우면 엔진이 «미입력»으로 보고 시세로 가늠한 뒤 경고한다.
  if (clamp(answers.standardValue) > 0) body.standard_value = clamp(answers.standardValue);
  // 변제 능력 증명: 네=true, 아니오=false, 모름=보내지 않음(엔진이 증명되지 않는 것으로 계산하고 경고한다)
  if (debt > 0 && answers.doneeCanRepay === 'yes') body.donee_can_repay = true;
  else if (debt > 0 && answers.doneeCanRepay === 'no') body.donee_can_repay = false;
  // 받는 분 세대의 다른 주택 수: 「모름」은 보내지 않는다(엔진이 1주택 기준으로 계산하고 경고한다).
  if (needsDoneeHouses && answers.doneeHouseCount !== 'unknown') body.donee_other_house_count = Number(answers.doneeHouseCount);
  return { body };
}

async function callOptimizeEng(body) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  const delays = [1000, 2000, 4000, 8000];
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
      if (!res.ok) { const _err = new Error('engine ' + res.status); _err.status = res.status; throw _err; }
      return await res.json();
    } catch (e) { lastErr = e; if (e && e.status >= 400 && e.status < 500) break; if (attempt < delays.length) await new Promise(r => setTimeout(r, delays[attempt])); }
  }
  throw lastErr;
}

/* 응답 판독 — 순수 함수(시험 대상). 세 가지로 가른다:
     precise  = 검증을 통과한 계산 결과
     blocked  = 엔진이 «계산하지 않겠다»고 답함(지원 범위 밖·입력 모순) → 「세무사 확인 필요」
     (둘 다 아님) = 응답이 불완전 → 연결 문제와 같은 안내 */
function bgReadResponse(c, maxDebt) {
  const calc = { precise: false, blocked: false, maxDebt: maxDebt };
  if (c && typeof c === 'object' && !Array.isArray(c) && c['오류']) { calc.blocked = true; return calc; }
  // 엔진이 일부 채무액을 계산하지 못해 표에서 뺐으면(계산제외채무액) 「최대 절세」를 말할 수 없다(TASK-261003-007 R2-F2).
  if (c && typeof c === 'object' && !Array.isArray(c)
    && (('계산제외채무액' in c) && !(Array.isArray(c['계산제외채무액']) && c['계산제외채무액'].length === 0))) { calc.blocked = true; return calc; }
  if (window.jtValidCalc(c, ['채무없는경우세액', '최적총세부담', '최적채무비율', '절세액'])
    && c['채무없는경우세액'] > 0 && c['최적채무비율'] <= 1
    && Array.isArray(c['시뮬레이션결과']) && c['시뮬레이션결과'].length > 0
    && c['시뮬레이션결과'].every(s => window.jtValidCalc(s, ['채무비율', '채무액', '증여세', '양도세', '취득세', '총세부담']))) {
    const sims = c['시뮬레이션결과'];
    const zero = sims.find(s => s['채무액'] === 0);
    const full = sims.find(s => s['채무액'] === maxDebt);
    // 표를 «다시 계산해서» 맞을 때만 믿는다(TASK-261003-007 R1-F3):
    //   ① 모든 행의 채무액이 0 ~ 입력한 채무 안에 있다 ② 각 행의 총세부담 = 증여세 + 양도세 + 취득세
    //   ③ 최적총세부담 = 표의 최솟값 ④ 절세액 = (채무 0 행) − (최솟값) ⑤ 채무 없는 경우 = 채무 0 행
    const inRange = sims.every(s => Number.isInteger(s['채무액']) && s['채무액'] >= 0 && s['채무액'] <= maxDebt);
    const sumsOk = sims.every(s => s['총세부담'] === s['증여세'] + s['양도세'] + s['취득세']);
    const minTotal = Math.min.apply(null, sims.map(s => s['총세부담']));
    if (zero && full && inRange && sumsOk
      && zero['총세부담'] === c['채무없는경우세액']
      && c['최적총세부담'] === minTotal
      && c['절세액'] === zero['총세부담'] - minTotal) {
      calc.noDebt = c['채무없는경우세액'];
      calc.fullDebt = full['총세부담'];
      calc.optTotal = c['최적총세부담'];   // 🔒 상담 리드캡처에만
      calc.optRatio = c['최적채무비율'];    // 🔒 상담 리드캡처에만
      calc.savings = c['절세액'];
      calc.sims = sims;
      calc.warnings = Array.isArray(c['경고사항']) ? c['경고사항'] : [];
      calc.precise = true;
    }
  }
  return calc;
}
if (typeof window !== 'undefined') { window.jtBurdenBuildBody = bgBuildBody; window.jtBurdenReadResponse = bgReadResponse; window.jtBurdenApplyAnswer = bgApplyAnswer; }

// 상담 리드캡처(세무사=오너에게 전달) — 풀 디테일 포함 가능(유자격)
function buildBurdenDetail(answers, calc) {
  const L = ['■ 고객 입력 정보'];
  BURDEN_QS.forEach(q => {
    if (q.showIf && !q.showIf(answers)) return;   // 숨겨진 문항의 낡은 답은 요청에도 쓰이지 않았다(R2-F3)
    const val = answers[q.id];
    if (val === undefined || val === null || val === '') return;
    let v = val;
    if (q.opts) { const o = q.opts.find(x => x[0] === val); if (o) v = o[1]; }
    else if (q.numeric && q.money) v = bgWon(Number(val));
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('  · ' + ql + ': ' + v);
  });
  if (calc.precise) {
    L.push('', '■ 부담부증여 비교 (검증 엔진 · 입력한 채무 범위 0 ~ ' + bgWon(calc.maxDebt) + ')');
    L.push('  · 단순증여(채무 0) 총세금: ' + bgWon(calc.noDebt));
    L.push('  · 입력한 채무 전부를 넘길 때 총세금: ' + bgWon(calc.fullDebt));
    L.push('  · 범위 안 최저 총세금: ' + bgWon(calc.optTotal) + ' (채무비율 ' + Math.round((calc.optRatio || 0) * 100) + '%)');
    L.push('  · 범위 안 최대 절세 여력: ' + bgWon(calc.savings));
    if (Array.isArray(calc.sims)) {
      L.push('  · 채무액별 총세금:');
      calc.sims.filter((p, i, a) => i === 0 || i === a.length - 1 || i % Math.max(1, Math.ceil(a.length / 10)) === 0)
        .forEach(p => L.push('     - 채무 ' + bgWon(p['채무액']) + ': ' + bgWon(p['총세부담'])
          + ' (증여 ' + bgWon(p['증여세']) + '·양도 ' + bgWon(p['양도세']) + '·취득 ' + bgWon(p['취득세']) + ')'));
    }
    L.push('', '⚠️ 범위 안 최저 지점은 부당행위계산부인·실질과세 위험을 따로 검토해야 합니다. 안전한 실행 금액은 세무사 검토 필요.');
    if (Array.isArray(calc.warnings)) calc.warnings.forEach(w => L.push('  · ' + w));
  }
  return L.join('\n');
}
function buildBurdenKakao(answers, calc) {
  const L = ['[JT택스랩 부담부증여 — 상담 요청]', '', '▶ 입력'];
  L.push('· 부동산 시가: ' + bgWon(Number(answers.propertyValue) || 0));
  L.push('· 증여자 취득가: ' + bgWon(Number(answers.acquisitionPrice) || 0));
  L.push('· 딸린 채무: ' + bgWon(Number(answers.actualDebt) || 0));
  L.push('· 받는 사람: ' + (answers.recipient === 'spouse' ? '배우자' : '자녀'));
  if (calc.precise) {
    L.push('', '▶ 결과(요약)');
    L.push('· 단순증여 총세금: ' + bgWon(calc.noDebt));
    L.push('· 입력한 채무 범위 안 절세 여력: ' + bgWon(calc.savings));
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

  // showIf 거르기 — 채무가 0이면 변제 능력 문항을 건너뛴다(ReportCompare 와 같은 패턴).
  const visibleQ = BURDEN_QS.filter(q => !q.showIf || q.showIf(answers));
  const total = visibleQ.length;
  const safeStep = Math.min(step, total - 1);
  const cur = visibleQ[safeStep];
  const isLast = safeStep === total - 1;
  const setAns = (id, v) => setAnswers(a => bgApplyAnswer(a, id, v));

  const overMax = () => !!(cur && cur.maxOf && Number(answers[cur.id]) > Number(answers[cur.maxOf] || 0));
  const canNext = () => {
    if (!cur) return false;
    if (cur.freeform) return true;
    if (cur.numeric) {
      if (cur.optional) return true;
      const raw = answers[cur.id];
      if (raw === '' || raw === undefined || raw === null) return false;   // 빈칸=미입력(차단). '0'은 allowZero 일 때만 통과
      const v = Number(raw);
      if (isNaN(v) || (cur.allowZero ? v < 0 : v <= 0)) return false;
      return !overMax();
    }
    if (cur.date) {
      const v = answers[cur.id] || '';
      if (cur.optional && v === '') return true;                           // 선택 문항: 비워도 된다
      if (!bgValidISODate(v) || v > bgIsoDate(new Date())) return false;   // 미래 불허
      if (cur.id === 'moveInDate') return v >= (answers.acquisitionDate || '');   // 전입일은 취득일 이후
      return true;
    }
    return !!answers[cur.id];
  };

  const runAnalysis = async () => {
    setLoading(true); setErr(null);
    try {
      const built = bgBuildBody(answers);
      if (built.error) { setErr(built.error); setLoading(false); return; }
      if (built.blocked) { setReport({ calc: { precise: false, blocked: true, maxDebt: 0 } }); setLoading(false); return; }
      const body = built.body;

      let calc = { precise: false, blocked: false, maxDebt: body.max_debt };
      try {
        const j = await callOptimizeEng(body);
        calc = bgReadResponse(j && j.calc, body.max_debt);
        calc.engineVer = j && j.version && j.version.engine;
      } catch (e) {
        console.warn('부담부증여 엔진 호출 실패', e);
        // 422(입력 거부)는 «연결 지연»이 아니다 — 이 조건을 엔진이 받지 않는다는 뜻이다. 429 는 잠시 뒤 재시도.
        if (e && e.status === 422) calc.blocked = true; else calc.engineErr = true;
      }
      calc.zoneUnknown = answers.adjustedZone === 'unknown';
      calc.areaUnknown = body.area_class === '모름';
      calc.acqZoneUnknown = answers.regulatedAtAcq === 'unknown' && body.regulated_at_acquisition === true;
      setReport({ calc });
    } catch (e) { console.error(e); setErr(e.message || '계산 중 오류가 발생했습니다.'); }
    finally { setLoading(false); }
  };

  const goNext = () => { if (isLast) runAnalysis(); else setStep(s => s + 1); };
  const goPrev = () => { if (safeStep > 0) setStep(s => s - 1); else onBack(); };

  if (loading) {
    return (
      <div className="jt-container">
        <JTReportShell title="부담부증여 최적화" subtitle="채무를 넘기는 정도에 따른 세금을 계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="LIVE">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />채무 0원부터 입력하신 채무 금액까지의 총세금(증여세+양도세+취득세)을 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 시간이 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc } = report;
    const sims = calc.sims || [];
    // 표시할 점: 채무 0 · 입력한 채무의 절반에 가장 가까운 점 · 입력한 채무 전부 (범위 안 최저 지점은 노출하지 않는다)
    const zeroRow = sims.find(p => p['채무액'] === 0);
    const fullRow = sims.find(p => p['채무액'] === calc.maxDebt);
    const midRow = (calc.maxDebt > 0 && sims.length > 2)
      ? sims.filter(p => p !== zeroRow && p !== fullRow).reduce((best, p) => (!best || Math.abs(p['채무액'] - calc.maxDebt / 2) < Math.abs(best['채무액'] - calc.maxDebt / 2)) ? p : best, null)
      : null;
    const teaser = [zeroRow, midRow, fullRow].filter((p, i, a) => p && a.indexOf(p) === i);
    const baseMax = Math.max(1, ...teaser.map(p => p['총세부담']));
    return (
      <div className="jt-container">
        <JTReportShell title="부담부증여 최적화 결과" subtitle="딸린 채무를 함께 넘길 때 총세금 (세액 기준)" stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
          {calc.blocked ? (
            <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '14px 18px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6 }}>
              <strong>세무사 확인이 필요한 조건입니다.</strong> 입력하신 조건은 자동 계산이 지원하는 범위 밖이어서, 잘못된 세액을 안내하지 않기 위해 금액을 표시하지 않았어요. 입력을 다시 확인하시거나 상담을 권합니다.
              <div style={{ marginTop: 8 }}><button className="jt-btn jt-btn--ghost" onClick={() => setReport(null)}>입력 다시 확인 →</button></div>
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
              {calc.zoneUnknown && (
                <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6, fontSize: 13.5 }}>
                  <strong>조정대상지역 여부를 「모름」으로 두셨습니다.</strong> 조정대상지역이 아닌 것으로 계산했습니다. 조정대상지역이면 증여 취득세와 채무 인수분 양도세가 크게 달라지므로, 확인한 뒤 다시 계산해 주세요.
                </div>
              )}

              {calc.acqZoneUnknown && (
                <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6, fontSize: 13.5 }}>
                  <strong>취득 당시 조정대상지역 여부를 「모름」으로 두셨습니다.</strong> 조정대상지역이었던 것으로 보고 1세대1주택 비과세에 거주 2년 요건을 적용했습니다. 조정대상지역이 아니었다면 채무 인수분 양도세가 줄어들 수 있으므로, 확인한 뒤 다시 계산해 주세요.
                </div>
              )}

              {/* 헤드라인 — 입력한 채무 범위 안의 절세 「여력(금액)」. 최저 지점의 채무 금액은 억제(상담) */}
              <div className="jt-report-result__grade jt-grade-mid">
                {calc.maxDebt === 0 ? (
                  <>
                    <div className="jt-report-result__grade-label">그냥 증여할 때의 총세금</div>
                    <div style={{ fontSize: 30, fontWeight: 800, marginTop: 8 }}>{bgWon(calc.noDebt)}</div>
                    <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.65 }}>딸린 채무가 없다고 입력하셔서, 채무를 함께 넘기는 「부담부증여」는 비교 대상이 없습니다. 위 금액은 증여세와 취득세의 합계입니다.</div>
                  </>
                ) : calc.savings > 0 ? (
                  <>
                    <div className="jt-report-result__grade-label">입력하신 채무 범위에서 줄일 수 있는 세금 (여력)</div>
                    <div style={{ fontSize: 30, fontWeight: 800, marginTop: 8, color: '#2a6d4f' }}>최대 {bgWon(calc.savings)}</div>
                    <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.65 }}>
                      그냥 증여하면 총세금이 <strong>{bgWon(calc.noDebt)}</strong>이고, 입력하신 채무 <strong>{bgWon(calc.maxDebt)}</strong>을 모두 함께 넘기면 <strong>{bgWon(calc.fullDebt)}</strong>입니다. 채무를 얼마나 넘기느냐에 따라 위 금액까지 세금을 줄일 여지가 있습니다.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="jt-report-result__grade-label">입력하신 조건에서는</div>
                    <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>채무를 함께 넘겨도 총세금이 줄지 않습니다</div>
                    <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.65 }}>
                      그냥 증여하면 총세금이 <strong>{bgWon(calc.noDebt)}</strong>이고, 입력하신 채무 <strong>{bgWon(calc.maxDebt)}</strong>을 모두 함께 넘기면 <strong>{bgWon(calc.fullDebt)}</strong>입니다.
                    </div>
                  </>
                )}
              </div>

              {/* 넘기는 채무에 따른 총세금 — 데이터 그대로(오르는지 내리는지 미리 단정하지 않는다) */}
              {calc.maxDebt > 0 && teaser.length > 1 && (
                <section className="jt-report-result__section">
                  <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: 14 }}>넘기는 채무에 따른 총세금</p>
                  {teaser.map((p, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                        <span>{p['채무액'] === 0 ? '채무 0원 (그냥 증여)' : '채무 ' + bgWon(p['채무액']) + (p === fullRow ? ' (전부)' : '')}</span>
                        <strong>{bgWon(p['총세부담'])}</strong>
                      </div>
                      <div style={{ background: '#eee', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                        <div style={{ width: Math.min(100, Math.max(6, Math.round((p['총세부담'] / baseMax) * 100))) + '%', height: '100%', background: 'linear-gradient(90deg,#2a6d4f,#3d9970)' }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 8, padding: '10px 12px', background: '#f7f5f0', border: '1px dashed rgba(0,0,0,.25)', borderRadius: 8, fontSize: 13, lineHeight: 1.6, textAlign: 'center' }}>
                    🔒 <strong>「안전하게 절세되는 채무 금액」</strong>은 상담에서 확인하세요. 채무를 넘기는 정도에 따라 세금이 다시 늘 수 있고(아래 ⚠️), 요건을 갖추지 못하면 부인될 수 있습니다.
                  </div>
                </section>
              )}

              {/* 전제·확인 필요 — 엔진이 붙인 경고를 그대로 보여 준다 (§47③, 변제 능력 증명, 중과 판정 등) */}
              {Array.isArray(calc.warnings) && calc.warnings.length > 0 && (
                <section className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '14px 18px' }}>
                  <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 14, color: '#8a6d3b' }}>⚠️ 이 계산의 전제 — 꼭 확인하세요</p>
                  {calc.warnings.map((w, i) => (
                    <p key={i} style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.6, color: '#6b5524' }}>· {String(w).replace(/최적\s*채무\s*비율\s*\(?\s*\d+(?:\.\d+)?\s*%\s*\)?/g, '범위 안 최저 지점의 채무비율')}</p>
                  ))}
                </section>
              )}

              {/* 🔒 프리미엄 게이트 (옵션 B) */}
              <section className="jt-report-result__section" style={{ background: '#f7f5f0', border: '1px dashed rgba(0,0,0,.25)', borderRadius: 12, padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>🔒</div>
                <p style={{ margin: '0 0 12px', fontWeight: 800, fontSize: 16 }}>안전하게 절세하는 「실행 설계」는 상담에서</p>
                <ul style={{ margin: '0 auto 14px', padding: 0, listStyle: 'none', lineHeight: 1.95, fontSize: 14, maxWidth: 480, textAlign: 'left', display: 'inline-block' }}>
                  <li>🔹 <strong>안전한 채무 금액</strong> — 부인되지 않으면서 절세되는 실제 금액</li>
                  <li>🔹 <strong>채무·변제 능력의 입증 방법</strong> — 증여세(§47③)와 취득세(지방세법 §7⑪)에서 각각 인정받는 요건</li>
                  <li>🔹 <strong>증여하는 분의 거주·보유 사실 반영</strong> — 채무 인수분 양도세가 달라집니다</li>
                </ul>
                <p style={{ margin: 0, fontSize: 13.5, color: '#5a5a5a', lineHeight: 1.65 }}>이 셋은 사례마다 답이 달라 자동 계산만으론 위험합니다.<br/><strong>세무사가 직접 설계</strong>해 드립니다 — 문의를 접수하면 검토 범위와 보수를 견적으로 안내합니다.</p>
              </section>

              <section className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '16px 18px' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 800, fontSize: 15 }}>그래서 채무를 얼마나 넘겨야 하나요?</p>
                <p style={{ margin: '0 0 12px', lineHeight: 1.7 }}>세금만 보면 채무를 넘길수록 유리해 보일 수 있지만, <strong>요건을 갖추지 못하면 부당행위계산부인·실질과세로 절세가 사라지고 가산세</strong>까지 붙습니다. 위 금액은 입력하신 사실을 전제로 한 <strong>출발점</strong>이고, <strong>안전하면서 절세되는 실제 금액과 실행 순서는 세무사가 직접 설계</strong>해 드립니다.</p>
              </section>

              {calc.precise && typeof JTReportConvert === 'function' && (
                <JTReportConvert
                  calcId="burden"
                  completeEligible={true}
                  precise={calc.precise}
                  reportType="부담부증여 최적화"
                  reportTag="LEGACY"
                  reportSummary={`단순증여 ${bgWon(calc.noDebt)} · 입력한 채무 범위 안 절세 여력 ${bgWon(calc.savings)}`}
                  reportDetail={buildBurdenDetail(answers, calc)}
                  kakaoSummary={buildBurdenKakao(answers, calc)}
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
      <JTReportShell title="부담부증여 최적화" subtitle="자녀·배우자에게 부동산을 증여할 때, 딸린 채무를 함께 넘기면 세금이 얼마나 달라지는지 계산합니다." stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="LIVE">
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
                <div style={{ fontSize: 14, color: 'var(--accent,#2a6d4f)', marginTop: 6 }}>= {bgKorean(Number(answers[cur.id]))}</div>
              )}
              {overMax() && (
                <div style={{ fontSize: 13.5, color: '#c0392b', marginTop: 6 }}>{cur.maxMsg}</div>
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
              {isLast ? '세금 비교하기 →' : '다음 →'}
            </button>
          </div>
        </div>
      </JTReportShell>
    </div>
  );
}
window.JTReportBurden = JTReportBurden;

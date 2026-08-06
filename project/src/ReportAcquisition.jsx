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

  {
    id: 'exclusiveArea',
    /* quick 로 올린 이유: 면적을 모르면 농특세(85㎡ 초과분)를 판정할 수 없어 폴백이 차단된다.
       상세 단계에 두면 엔진 장애 시 «빠른 계산 전체»가 막힌다 — 가드를 푸는 대신 물어본다. */
    tier: 'quick',
    section: '면적',
    q: '전용면적은 몇 ㎡인가요? (농어촌특별세 판정용)',
    /* 「84로 가정」은 실제 동작과 어긋난다 — 공란이면 가정하지 않고 폴백을 차단한다 (Codex P2) */
    sub: '전용면적 85㎡(약 25.7평) 초과 주택에는 농어촌특별세(취득세 표준세율분의 10%)가 추가됩니다. 85㎡ 이하면 농특세가 없습니다. 등기부·분양계약서에 적힌 숫자예요. 비워두시면 엔진이 연결됐을 때만 계산되고, 연결이 안 되면 금액 대신 안내를 보여 드립니다.',
    showIf: (a) => a.propertyType === '주택',
    numeric: true, optional: true,
    placeholder: '예: 84.96',
  },
  // ── 더 정확히 (상세) ──
  {
    id: 'isRegulatedArea',
    section: '조정대상지역',
    q: '취득한 주택이 조정대상지역에 있나요?',
    sub: '조정대상지역은 다주택 중과(매매)·증여 중과(시가표준 3억↑)가 적용되는 지역입니다. 현재 서울 강남·서초·송파·용산만 해당(수시 변경 — 국토부 고시 확인). 확실하지 않으면 「모르겠어요」를 고르세요 — 중과 여부가 갈리는 경우에는 금액을 내지 않고 상담으로 안내합니다.',
    showIf: (a) => a.propertyType === '주택' && (a.acquisitionType === '매매' || a.acquisitionType === '증여'),
    /* ★ 「아니오 / 모름」을 한 칸에 묶으면 «모름»이 «비조정»으로 계산돼 중과가 통째로
       빠진다(260806 Codex P1). 모름은 따로 받아 폴백을 차단한다. */
    opts: [['yes', '네, 조정대상지역', '중과 가능'], ['no', '아니오 (비조정)', '기본 세율'], ['unsure', '모르겠어요', '상담 안내']],
  },
  {
    id: 'temporaryTwoHouse',
    /* 다주택 매매에서 «8% 중과냐 1~3% 냐»는 취득세 최대 갈림이다 — 상세로 미루면
       빠른 계산이 통째로 틀리거나(중과 과대) 차단된다. quick 에서 묻는다. */
    tier: 'quick',
    section: '일시적 2주택',
    q: '이사·학업·취업·직장 이전 등으로 종전 주택등 1개를 3년 안에 처분할 계획인가요? (일시적 2주택)',
    /* 260806 law-verifier 원문 확인: 시행령 §28의5는 «지역 불문 3년» — 조문에 「조정대상지역」
       문구 자체가 없다. 과거의 조정지역 간 단축 규정은 현행 조문에 없다.
       근거 조문도 §13의2① «단서»가 아니라 1항 2호 괄호(「일시적 2주택은 제외한다」)다. */
    /* 「주택」이 아니라 «주택등» — 시행령 §28의5① 은 조합원입주권·주택분양권·주거용 오피스텔도
       종전 자산에 포함한다. 「주택」으로만 물으면 입주권 보유자가 「아니오」를 골라 중과를 맞는다
       (260806 Codex P2). 이 앱은 주택 수 안내에서 이미 그 셋을 포함한다고 설명하고 있다. */
    sub: '이사·직장 이동 등으로 잠깐 두 채가 되는 경우입니다. 여기서 「종전 주택등」에는 주택뿐 아니라 조합원입주권·주택분양권·주거용 오피스텔도 들어갑니다. 신규 주택 취득일부터 3년(조정대상지역인지와 무관하게 3년) 안에 종전 주택등을 처분하면 중과 없이 1~3% 일반 세율로 계산합니다(지방세법 §13의2①2호 괄호 — 일시적 2주택은 중과 대상 주택 수에서 제외, 시행령 §28의5). 기한을 넘기면 중과분이 «추징»되니, 계획이 확실할 때만 「네」를 고르세요.',
    /* 특례 대상은 «종전 주택등을 1개 보유한 1세대»뿐이다(시행령 §28의5①) — 취득 후 3채 이상이면
       애초에 일시적 2주택이 아니다. >= 2 로 두면 3주택자에게도 물어보고, 「예」를 고르면
       주택 수가 1로 줄어 엔진이 중과를 빼 버린다 (260806 Codex P1). */
    showIf: (a) => a.propertyType === '주택' && a.acquisitionType === '매매' && (Number(a.housingCount) || 1) === 2,
    opts: [['yes', '네, 종전 주택등 1개를 3년 내 처분 예정', '중과 제외 (1~3%)'], ['no', '아니오 / 계속 보유', '중과 적용 (8~12%)']],
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
    /* 여기서 「모름」→중과 적용은 «세금이 많게» 나오는 방향이라 안전하다(과소신고 위험 없음). */
    opts: [['yes', '네, 1세대 1주택자가 가족에게 증여', '12% 중과 제외 (3.5%)'], ['no', '아니오 / 모름', '12% 중과 적용']],
  },
  {
    id: 'context',
    section: '추가 사항',
    q: '추가로 알려주실 내용이 있나요? (선택)',
    /* 「일시적 2주택」을 예시에서 뺐다 — 이제 구조화 문항(temporaryTwoHouse)이 받는다.
       여기 적으면 «적었으니 반영됐다»고 믿는데 계산엔 안 들어간다 (260806). */
    sub: '오피스텔 주거용 사용, 분양권·입주권, 농지·임야 등 특수한 사정이 있으면 적어주세요. 여기 적은 내용은 계산에 반영되지 않고 상담 시 참고합니다.',
    freeform: true, optional: true,
    placeholder: '예: 분양받은 오피스텔을 주거용으로 사용 / 상속받은 농지 등',
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
    // 일시적 2주택(§13의2①2호 괄호·령 §28의5): 중과 대상 주택 수에서 종전 주택을 제외한다.
    //   ⚠ 3년 내 미처분 시 추징 대상이므로 화면 문구에서 기한을 반드시 알린다.
    // «2주택일 때만» 적용한다. 3주택 이상에서 주택 수를 1로 덮어쓰면 엔진이 중과를 빼고
    //   그 값이 «정밀 계산»으로 표시된다 — 폴백보다 위험하다.
    if (a.temporaryTwoHouse === 'yes' && (Number(a.housingCount) || 1) === 2) {
      body.is_temporary_two_house = true; body.housing_count = 1;
    }
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

/* 간이 폴백(엔진 미응답 시) — 대략 합산세율. 정밀은 엔진. 폴백은 보수적(과대=안전) 원칙. */
function fallbackAcqTax(a) {
  const v = Number(a.propertyValue) || 0;
  // 분양권·입주권 권리 취득은 취득 단계 취득세 비대상(지법 §7①) — 준공·잔금 시 그 주택분 별도 부과
  if (a.propertyType === '분양권' || a.propertyType === '입주권') return 0;
  const isHousing = a.propertyType === '주택';
  let rate;
  if (a.acquisitionType === '증여') {
    // 조정대상지역 + 시가표준 3억 이상 주택 무상취득 = 12% 중과(지법 §13의2②, 1세대1주택 단서 제외)
    const std = Number(a.standardValue) || v;
    rate = (isHousing && a.isRegulatedArea === 'yes' && a.giftOneHouseException !== 'yes' && std >= 300_000_000)
      ? 0.124 : 0.038;  // 증여 중과 12%+교육세(2%×20%=0.4%)=12.4% / 일반 증여 3.5%+교육세((3.5%−2%)×20%=0.3%)=3.8% (수정 260628 ACQ-A-03, 지§151①1호)
  }
  else if (a.acquisitionType === '상속') rate = 0.0296; // 상속 2.8%+교육세((2.8%−2%)×20%=0.16%)=2.96% (수정 260628 ACQ-A-02, 지§151①1호)
  else if (a.acquisitionType === '신축') rate = 0.0296; // 원시취득 2.8%+교육세 0.16%=2.96%
  else if (!isHousing) rate = 0.046;                    // 비주택 4%+교육세
  else { // 주택 매매(기본). 수정 260628(ACQ-A-01): 다주택 중과(§13의2) 반영 — 종전 미반영으로 8%중과 케이스 -69% 과소.
    // 일시적 2주택이면 중과 대상 주택 수에서 종전 주택을 제외한다 (지§13의2①2호 괄호)
    const rawHc = Number(a.housingCount) || 1;
    const hc = (a.temporaryTwoHouse === 'yes' && rawHc === 2) ? 1 : rawHc;
    const reg = a.isRegulatedArea === 'yes';
    if ((reg && hc >= 3) || (!reg && hc >= 4)) rate = 0.124;        // 12% 중과 + 교육세 0.4% (조정3주택+/비조정4주택+)
    else if ((reg && hc === 2) || (!reg && hc === 3)) rate = 0.084; // 8% 중과 + 교육세 0.4% (조정2주택/비조정3주택) — 엔진 800M=67,200,000 일치
    else if (v <= 600_000_000) rate = 0.011;
    else if (v <= 900_000_000) {
      // 6~9억 슬라이딩 본세율: §11①8호나목 단서 — 소수점 다섯째자리에서 반올림→넷째자리 (수정 260628 ACQ-A-04)
      const base6_9 = Math.round((v * 2 / 300_000_000 - 3) / 100 * 10000) / 10000;
      rate = base6_9 * 1.1; // 본세 + 지방교육세(본세율×50%×20%=본세율×10%, §151①1호) (ACQ-B-01)
    }
    else rate = 0.033;
  }
  return Math.round(v * rate);
}

/* 폴백 차단 판정 — «렌더»가 아니라 «분석 단계»에서 쓰라고 모듈 스코프로 뺐다.
   화면에서 금액을 가려도 그 전에 AI 프롬프트가 폴백 세액을 외부로 보내고 있었다
   (260806 Codex P0). runAnalysis 가 엔진 응답 직후 이 함수로 먼저 판정하고,
   렌더도 같은 함수를 쓴다 — 규칙이 두 벌이 되면 반드시 어긋난다. */
function acqFallbackGaps(answers, calc) {
  const acqArea = Number(answers.exclusiveArea) || 0;
  const hc = Number(answers.housingCount) || 1;
  const regUnknown = answers.isRegulatedArea !== 'yes' && answers.isRegulatedArea !== 'no';
  /* ── ① 엔진이 있어도 «못 메우는» 입력 — precise 여도 막는다 ──────────────
     사용자가 「모른다」고 한 사실을 그대로 보내면, 엔진은 필드가 없다는 이유로
     조용히 «유리한 쪽»을 가정한다. 그 값에 「정밀 계산」 딱지가 붙어 폴백보다 더 위험하다.
     아래 수치는 260806 에 실제 엔진(POST /v1/calc/acquisition)을 때려서 얻은 것이다. */
  const unknown = window.jtFallbackGaps([
    { when: answers.propertyType === '주택' && acqArea === 0,
      why: '전용면적을 넣지 않으셨습니다 — 85㎡ 초과면 농어촌특별세가 붙는데, 비워 두면 계산이 «없는 것»으로 처리합니다(실측: 100㎡면 160만원 차이).' },
    { when: answers.propertyType === '주택' && answers.acquisitionType === '매매' && hc >= 2 && regUnknown,
      why: '다주택인데 조정대상지역 여부가 정해지지 않았습니다 — 중과 여부가 갈립니다(8% ↔ 1~3%).' },
    { when: answers.propertyType === '주택' && answers.acquisitionType === '증여' && regUnknown,
      why: '증여인데 조정대상지역 여부가 정해지지 않았습니다 — 시가표준 3억 이상이면 12% 중과라 세금이 3배 넘게 갈립니다(실측 3,040만원 ↔ 9,920만원).' },
    /* 주택 수를 3채로 바꾸면 이 문항은 숨지만 답은 state 에 남는다. 남은 「예」로 주택 수를
       1로 줄여 보내면 엔진이 중과를 빼고, 그게 «정밀»로 표시된다(실측 2,050만 ↔ 6,720만). */
    { when: answers.propertyType === '주택' && answers.acquisitionType === '매매'
            && hc >= 3 && answers.temporaryTwoHouse === 'yes',
      why: '3주택 이상은 «일시적 2주택» 특례 대상이 아닙니다(시행령 §28의5① — 종전 주택등 1개를 보유한 세대만). 주택 수를 다시 확인해 주세요.' },
  ]);
  /* ── ② 여기부터는 «간이 폴백만»의 한계 — 엔진이 살아 있으면 엔진이 제대로 푼다 ── */
  if (calc.precise) return unknown;
  return unknown.concat(window.jtFallbackGaps([
    { when: answers.reduction === 'first',
      why: '생애최초 주택 구입 감면(최대 200만원) — 간이 계산에 없어 세금이 «많게» 나옵니다(실측 220만원 차이).' },
    { when: answers.propertyType === '주택' && acqArea > 85,
      why: '전용면적 85㎡ 초과 — 농어촌특별세가 간이 계산에 빠져 세금이 «적게» 나옵니다(실측 120만원 차이).' },
    /* 일시적 2주택은 «자유 서술»에만 있어 계산에 반영되지 않는다 — 중과가 통째로 빠진다 (Codex P1) */
    /* 「예」·「아니오」 둘 다 폴백이 정확히 계산한다 — 막을 것은 «답이 없는 경우»뿐이다.
       답까지 막으면 과잉 차단이라 배선해 둔 계산 경로가 죽는다. */
    { when: answers.propertyType === '주택' && answers.acquisitionType === '매매'
            && (Number(answers.housingCount) || 1) === 2 && !answers.temporaryTwoHouse,
      why: '2주택인데 «일시적 2주택»(3년 내 종전 주택 처분) 여부가 확인되지 않았습니다 — 해당하면 중과 없이 1~3%, 아니면 8%입니다.' },
    { when: answers.propertyType === '토지',
      why: '토지 취득 — 농지(전·답·과수원)는 세율이 달라 간이 계산이 일반 토지율만 적용합니다.' },
    { when: answers.acquisitionType === '상속' && answers.propertyType === '주택',
      why: '주택 상속 — 무주택 1가구 1주택 상속의 0.8% 특례를 간이 계산이 판정하지 못합니다.' },
  ]));
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
  const delays = [1000, 2000, 4000, 8000];
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
      if (!res.ok) { const _err = new Error('engine ' + res.status); _err.status = res.status; throw _err; }
      return await res.json();
    } catch (e) { lastErr = e; if (e && e.status >= 400 && e.status < 500) break; if (attempt < delays.length) await new Promise(r => setTimeout(r, delays[attempt])); }
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
  const [laddr, setLaddr] = useAcqState('');
  const [lbusy, setLbusy] = useAcqState(false);
  const [linfo, setLinfo] = useAcqState(null);
  const [unitAsk, setUnitAsk] = useAcqState(null); // 260720: 세대 여럿 → 동·호 되묻기
  // ⚠️ 260720 (Codex P0): 비동기 경합 방어. 주소 A 조회 뒤 B를 조회하면 A의 늦은 응답이
  //    B의 화면(되묻기·금액·안내문)을 덮는다. 요청마다 번호를 매기고 **최신 것만** 반영한다.
  const jtReqSeq = React.useRef(0);
  // ⚠️ 260720 2차 (Codex P0): seq만으로는 부족하다. 요청 도중 사용자가 **주소를 고치면**
  //    seq는 그대로라 옛 응답이 새 주소 화면에 그대로 적용된다.
  //    최신 주소를 ref로 들고, 응답 시점에 조회 당시 주소와 다르면 버린다.
  const jtAddrRef = React.useRef('');
  // ⚠️ 260720 3R (Codex P0): 종전엔 useEffect로 ref를 갱신했는데, effect는 **렌더 이후**에
  //    돌기 때문에 "주소 변경 렌더 ~ effect 실행" 사이에 응답이 도착하면 ref가 아직 옛 주소다.
  //    → 옛 응답이 반영되거나(위험) 최신 응답이 버려진다. 입력 시점에 **동기로** 갱신한다.
  const setLaddrSync = (v) => { jtAddrRef.current = v; setLaddr(v); };

  React.useEffect(() => {
    const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';
    if (base) { fetch(base + '/health', { method: 'GET' }).catch(function () {}); }
  }, []);

  const doAddrLookup = async (unit) => {
    if (!laddr.trim()) return;
    const addrNow = laddr.trim();
    // 되묻기 제출인데 그 사이 주소가 바뀌었으면 폐기 — 이전 주소의 동·호가 새 주소로 가면 안 된다
    if (unit && unitAsk && unitAsk.addr && unitAsk.addr !== addrNow) { setUnitAsk(null); return; }
    const mySeq = ++jtReqSeq.current;
    // 두 갈래로 나눈다:
    //   seqStale : 더 새 요청이 시작됨 → busy 해제 판단용(이걸로 막으면 busy가 영구히 남는다)
    //   stale    : seq가 낡았거나 **그 사이 주소가 바뀜** → 화면 상태 반영 금지
    const seqStale = () => jtReqSeq.current !== mySeq;
    const stale = () => seqStale() || (jtAddrRef.current || '').trim() !== addrNow;
    setLbusy(true); setLinfo(null);
    if (!unit) setUnitAsk(null);   // 주소를 새로 조회하면 이전 되묻기는 닫는다
    try {
      const r = await window.jtLookupHousePrice(addrNow, unit);
      if (stale()) return;   // 더 새 요청이 진행 중 — 이 응답은 버린다
      const applyRegulated = (reg) => {
        if (!reg) return '';
        setAns('isRegulatedArea', reg.is_adjusted_area ? 'yes' : 'no');
        return reg.is_adjusted_area
          ? ` ${reg.sigungu || '해당 지역'}은 조정대상지역으로 자동선택했어요(${reg.adjusted_as_of} 기준 — 취득 시점 기준으로 다시 확인하세요).`
          : ` ${reg.sigungu || '해당 지역'}은 비조정지역으로 자동판단했어요(다르면 뒤에서 수정).`;
      };
      // 260720: 이 주소에 세대가 여럿 — 금액을 채우지 않고 동·호를 되묻는다
      if (r && r.status === 'needs_unit') { setUnitAsk({ ...r, addr: addrNow }); applyRegulated(r.region); return; }
      if (r && (r.status === 'unit_not_found' || r.status === 'unit_mismatch')) {
        setLinfo({ ok: false, msg: r.note || '입력하신 동·호를 찾지 못했어요. 다시 확인해 주세요.' });
        return;
      }
      // ⚠️ 260720 3R (Codex P1): 금액만 보고 반영하지 않는다. 응답 계약을 확인한다 —
      //    상태가 'ok'이고, 유한한 양수이며, match_quality가 허용값일 때만.
      //    (업무 규칙 재검증이 아니라 계약 검증이다 — 이건 프론트가 해야 한다)
      const contractOk = r && r.status === 'ok'
        && Number.isFinite(Number(r.amount)) && Number(r.amount) > 0
        && ['', 'exact', 'loose'].indexOf(r.matchQuality === undefined ? '' : r.matchQuality) >= 0;
      if (contractOk) {
        setUnitAsk(null);
        setAns('standardValue', String(r.amount));
        const kindLabel = r.kind === '공동주택' ? '아파트·연립·다세대' : '단독·다가구주택';
        const ml = window.jtMatchedLabel && window.jtMatchedLabel(r.matched);
        // 무엇을 맞췄는지 함께 띄운다 — 금액만 보면 내 집 값인지 알 수 없다
        const looseNote = r.loose
          ? ` (입력 ${[r.asked.dong, r.asked.ho].filter(Boolean).join(' ')} → 찾은 세대 ${[r.matched.dong, r.matched.ho].filter(Boolean).join(' ')} — 표기가 조금 다릅니다)`
          : '';
        setLinfo({ ok: true, msg: (ml
          ? `${ml} — ${r.year ? r.year + '년 ' : ''}공시가격(시가표준액) ${formatWon(r.amount)}을 자동 입력했어요.${looseNote} 이 집이 맞는지 확인해 주세요. ⚠️ 대단지 아파트는 동·호에 따라 공시가격이 크게 다릅니다 — 부동산공시가격알리미(realtyprice.kr)에서 내 세대 금액을 꼭 대조하세요.`
          : `${r.year ? r.year + '년 ' : ''}공시가격(시가표준액) ${formatWon(r.amount)}을 자동 입력했어요 (${kindLabel}).`) + ' ⚠️ 대단지 아파트는 동·호에 따라 공시가격이 크게 다릅니다 — 부동산공시가격알리미(realtyprice.kr)에서 내 세대 금액을 꼭 대조하세요.' + applyRegulated(r.region) });
      } else if (r && r.region) {
        setLinfo({ ok: false, msg: '이 주소의 공시가격은 못 찾았어요(상가·오피스텔·신축 등). 시가표준액은 직접 입력하세요.' + applyRegulated(r.region) });
      } else {
        setLinfo({ ok: false, msg: '이 주소의 공시가격을 찾지 못했어요(상가·오피스텔·신축 등). 직접 입력하거나 비워두세요.' });
      }
    } catch (e) {
      // ⚠️ 260720 2차 (Codex P0): 늦게 실패한 옛 요청이 최신 화면을 덮지 않도록
      if (!stale()) setLinfo({ ok: false, msg: '조회 중 오류가 발생했어요. 직접 입력하거나 비워두세요.' });
    } finally { if (!seqStale()) setLbusy(false); }   // 주소가 바뀌어도 busy는 반드시 해제
  };

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
      /* ★ «불확정 입력»은 엔진을 부르기 «전»에 막는다 (260806 Codex R20 P1).
         판정 함수는 2층인데 ①불확정 층은 calc.precise 와 무관하다 — 그래서 여기서
         precise:true 로 불러 ①층만 본다. 못 낼 값이면 요청 자체가 낭비이고,
         「모르겠다」고 답한 사실이 기본값으로 둔갑해 엔진까지 가지도 않는다.
         엔진 응답 직후의 기존 게이트는 그대로 ②폴백 한계를 잡는다. */
      if (acqFallbackGaps(answers, { precise: true }).length > 0) {
        const unknownRep = { calc: { precise: false }, commentary: null, quick: phase === 'quick' };
        setReport(unknownRep);
        if (phase === 'quick') setQuickReport(unknownRep);
        return;
      }
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

      /* ★ AI 프롬프트를 만들기 «전»에 막는다. 화면에서 금액을 가려도 이 호출이 먼저 나가면
         폴백 세액이 외부로 흘러간다 — 260806 Codex P0 로 실제 그러고 있었다.
         렌더와 «같은 함수»로 판정해야 규칙이 두 벌로 갈라지지 않는다. */
      if (acqFallbackGaps(answers, calc).length > 0) {
        const blockedRep = { calc, commentary: null, quick: phase === 'quick' };
        setReport(blockedRep);
        if (phase === 'quick') setQuickReport(blockedRep);
        return;
      }

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
            { title: '취득세 신고·납부 기한', detail: '유상취득(매매)은 취득일부터 60일, 증여 등 무상취득은 취득일이 속한 달 말일부터 3개월, 상속은 상속개시일이 속한 달 말일부터 6개월(외국에 주소를 둔 상속인이 있으면 9개월) 이내에 신고·납부해야 합니다. 기한 말일이 토요일·공휴일·대체공휴일이면 그 다음 날까지입니다. 늦으면 가산세가 붙습니다(지방세법 §20①, 지방세기본법 §24).' },
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
        <JTReportShell title="취득세 계산" subtitle="검증 엔진으로 계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="LIVE">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />검증된 세금 엔진으로 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc, commentary } = report;
    /* 폴백이 «감당 못 하는» 사실관계면 숫자를 내지 않는다 (260806 Codex 실측 오차 기반) */
    const acqArea = Number(answers.exclusiveArea) || 0;
    const acqGaps = acqFallbackGaps(answers, calc);
    const acqBlocked = acqGaps.length > 0;
    /* ★ 차단이면 «결과 화면을 아예 만들지 않는다».
       가릴 것을 하나씩 세는 방식은 새 표현이 늘 때마다 샜다(260806: 계산표·공유버튼·
       AI 코멘터리·절세전략 문구가 차례로 발견). 조기 반환은 «세지 않아도» 안전하다. */
    if (acqBlocked) {
      return (
        <div className="jt-container">
          <JTReportShell title="취득세 계산 결과" subtitle="정밀 계산 필요" stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
            <JTFallbackBlocked gaps={acqGaps} onRetry={runAnalysis} />
            <div className="jt-report-q__nav" style={{ marginTop: 16 }}>
              <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setPhase('quick'); setStep(0); setAnswers({}); }}>처음부터 다시</button>
            </div>
          </JTReportShell>
        </div>
      );
    }
    return (
      <div className="jt-container">
        <JTReportShell title="취득세 계산 결과" subtitle={calc.precise ? '취득세 정밀 계산' : '취득세 간이 계산'} stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
          {acqBlocked && <JTFallbackBlocked gaps={acqGaps} onRetry={runAnalysis} />}
          {!acqBlocked && (
          <div className="jt-report-result__grade jt-grade-mid">
            <div className="jt-report-result__grade-label">{report.quick ? '빠른 예상 취득세(총액)' : (calc.precise ? '총 납부세액 · 정밀 계산 (JT택스랩 엔진)' : '추정 납부세액 · 간이')}</div>
            <div className="jt-report-result__grade-val">{formatWon(calc.totalTax)}</div>
          </div>
          )}

          {report.quick && calc.totalTax > 0 && calc.appliedRate && calc.appliedRate !== '-' && (
            <p style={{ textAlign: 'center', margin: '0 0 16px', fontSize: 14, color: 'var(--jt-ink-700,#444)' }}>
              {answers.acquisitionType} · {formatWon(Number(answers.propertyValue) || 0)} · {answers.propertyType} 기준, 적용세율 약 <strong>{calc.appliedRate}</strong>로 계산했어요.
            </p>
          )}

          {(answers.propertyType === '분양권' || answers.propertyType === '입주권') && (
            <div style={{ background: '#f0f7f3', borderLeft: '4px solid #2a6d4f', padding: '12px 16px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6 }}>
              {answers.propertyType}은 <strong>권리를 살 때 취득세가 부과되지 않습니다(0원)</strong> — 지방세법 §7①상 취득세 과세대상(부동산등)에 미포함. 나중에 <strong>준공·잔금으로 그 주택을 취득하는 시점에 그 주택분 취득세</strong>가 부과됩니다(입주권은 정비사업에 따라 §7⑯ 별도 발생). 매매가 전체에 주택 취득세를 매기지 않습니다.
            </div>
          )}

          {!report.quick && answers.acquisitionType === '상속' && (
            <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6 }}>
              무주택 1가구가 1주택을 상속받으면 <strong>0.8% 특례세율</strong>(지방세법 §15①)이 적용될 수 있습니다. 현재 계산은 일반 상속 <strong>본세 2.8%</strong>(지방교육세를 더해 실효 2.96%) 기준이니, 해당되면 상담에서 확인하세요.
            </div>
          )}

          {answers.propertyType === '토지' && (
            <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6 }}>
              현재 계산은 <strong>일반 토지 본세 4%</strong>(지방교육세를 더해 실효 4.6%) 기준입니다. <strong>농지(전·답·과수원)</strong>는 유상취득 3%·상속 2.3%로 세율이 다르니, 농지라면 상담에서 정확히 확인하세요(지방세법 §11①1호·7호).
            </div>
          )}

          {!calc.precise && !acqBlocked && (
            <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginBottom: 16, borderRadius: 8 }}>
              정밀 엔진 연결이 지연되어 <strong>간이 추정</strong>으로 보여드립니다.<br /><strong>반영한 것</strong>: <strong>일반</strong> 취득유형별 세율 · 6~9억 구간 산식 · <strong>다주택 중과</strong>(조정 2주택·비조정 3주택 8.4% / 그 이상 12.4%) · 지방교육세.<br /><strong>반영하지 않은 것</strong>: <strong>생애최초 감면</strong> · <strong>85㎡ 초과 농어촌특별세</strong> · 일시적 2주택 등 중과배제 특례 · 법인 취득 · 농지 특례 · <strong>무주택 1가구 1주택 상속 0.8% 특례</strong>. 정밀 계산에서 반영됩니다 —
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
            본 계산은 입력 정보와 현행 지방세법을 기준으로 한 예상액입니다. 실제 세액은 과세표준(시가표준액)·주택 수·중과·감면 요건에 따라 달라질 수 있으며, 신고기한은 유상취득 60일·증여 등 무상취득 3개월(취득일이 속한 달 말일부터)·상속 6개월(상속개시일이 속한 달 말일부터, 외국 거주 상속인이 있으면 9개월)이고, 기한 말일이 공휴일이면 그 다음 날까지입니다. 정확한 신고는 담당 세무사 확인이 필요합니다.
          </p>

          {/* ★ 차단 중에는 «공유·전송»도 막는다 — 화면에서 금액을 가려도
              kakaoSummary·reportSummary·reportDetail 에 폴백 세액이 담겨 클립보드와
              Web3Forms 로 나간다 (260806 Codex P0). 막은 척이 되는 대표 경로다. */}
          {!acqBlocked && (
          <JTReportConvert
            setRoute={setRoute}
            reportType={calc.precise ? '취득세 정밀 계산' : '취득세 간이 계산'}
            reportTag="LEGACY"
            reportSummary={`총 납부세액 ${formatWon(calc.totalTax)} / ${answers.acquisitionType}·${answers.propertyType} / ${commentary.headline || ''}`}
            reportDetail={buildAcqDetail(answers, calc, commentary)}
            kakaoSummary={buildAcqKakao(answers, calc)}
            urgent={false}
          />
          )}
        </JTReportShell>
      </div>
    );
  }

  return (
    <div className="jt-container">
      <JTReportShell title="취득세 계산" subtitle={phase === 'quick' ? '취득 원인·종류·가액만 넣으면 예상 취득세를 바로 보여드려요.' : '면적·조정지역·감면을 반영해 더 정확히 계산합니다.'} stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="LIVE">
        <div className="jt-report-q">
          {cur.section && <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10, letterSpacing: '0.18em', opacity: 0.6, marginBottom: 8 }}>{cur.section}</div>}
          <h2>{cur.q}</h2>
          {cur.sub && <p className="jt-report-q__sub">{cur.sub}</p>}

          {cur.freeform && (
            <textarea className="jt-report-q__textarea" maxLength={cur.id === 'context' ? 200 : 120}
              placeholder={cur.placeholder || ''} value={answers[cur.id] || ''} onChange={(e) => setAns(cur.id, e.target.value)} />
          )}
          {cur.id === 'standardValue' && (
            <div style={{ background: 'var(--bg-1,#f7f5f0)', border: '1px solid #dfe3dc', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>🔎 주소로 시가표준액 자동조회 <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 13 }}>(선택 — 아파트·빌라·단독주택)</span></div>
              <p style={{ margin: '0 0 10px', fontSize: 13, opacity: 0.8, lineHeight: 1.55 }}>증여받는 주택 주소를 넣으면 국토교통부 공시가격(시가표준액)을 찾아 아래 칸에 채워드려요. 모르면 비워두셔도 됩니다.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="jt-report-q__input" style={{ flex: '1 1 220px', margin: 0 }} type="text"
                  placeholder="예: 서울 종로구 자하문로36길 16-14"
                  value={laddr} onChange={e => setLaddrSync(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !lbusy) doAddrLookup(); }} />
                {/* ⚠️ onClick={doAddrLookup} 면 React가 이벤트 객체를 unit 인자로 넘긴다 — 화살표 필수 */}
                <button className="jt-btn jt-btn--primary" style={{ flex: '0 0 auto' }} disabled={lbusy || !laddr.trim()} onClick={() => doAddrLookup()}>
                  {lbusy ? '조회 중…' : '공시가격 조회'}
                </button>
              </div>
              {linfo && (
                <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.55, padding: '9px 12px', borderRadius: 8,
                  background: linfo.ok ? '#eaf5ee' : '#fff7ea', borderLeft: '4px solid ' + (linfo.ok ? '#2a6d4f' : '#d08b00') }}>
                  {linfo.msg}
                </div>
              )}
              {/* JTUnitAsk는 ReportProperty.jsx에 정의된다. 이 파일이 먼저 로드될 수 있고,
                  정의가 실패하면 window.JTUnitAsk가 undefined라 렌더가 통째로 죽는다 —
                  되묻기가 필요 없는 평시에도. 존재 확인 후에만 렌더한다. */}
              {unitAsk && window.JTUnitAsk && (
                <window.JTUnitAsk info={unitAsk} busy={lbusy} onPick={(u) => doAddrLookup(u)} />
              )}
            </div>
          )}
          {cur.numeric && (
            <input className="jt-report-q__input" type="text" inputMode="numeric" placeholder={cur.placeholder}
              value={answers[cur.id] ? (cur.money ? Number(answers[cur.id]).toLocaleString('ko-KR') : answers[cur.id]) : ''}
              onChange={(e) => window.jtSetNumericAns(setAns, cur.id, e.target.value, !!cur.money)} />
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

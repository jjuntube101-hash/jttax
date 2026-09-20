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

/* 「유상거래」 묶음 — 매매와 공매는 엔진에서 주택 관련 규정(다주택 중과·일시적 2주택·
   생애최초/출산양육 감면·법인 중과)이 «완전히 같게» 동작한다. 260921 fly.dev 엔진 실측:
     공매 8억 2주택 조정 = 67,200,000 = 매매 동일 입력 / 공매 생애최초 = 매매 동일 입력
   그래서 공매를 매매와 같은 질문 묶음에 넣는다. 넣지 않으면 공매로 산 다주택자에게
   주택 수를 묻지 않아 중과가 통째로 빠진다(1% ↔ 8%). */
function acqIsPaid(a) {
  return a.acquisitionType === '매매' || a.acquisitionType === '공매';
}
/* 법인 명의 주택 유상취득은 엔진이 주택 수·조정지역과 무관하게 §13의2①1호를 적용한다
   (260921 실측 5억 → 12%). 검증된 조합 밖으로 나가지 않도록 개인 전용 문항을 감춘다. */
function acqIsCorporate(a) { return a.acquirerType === 'corporate'; }

/* 260921 신설 유형 — 간이 폴백이 다루지 못해 acqFallbackGaps 가 전부 차단하고,
   자동 해설(절세 아이디어)도 붙이지 않는다. */
function acqNewTypeSelected(a) {
  return a.acquisitionType === '공매' || a.acquisitionType === '재산분할'
    || a.propertyType === '농지' || a.propertyType === '오피스텔_주거용' || a.propertyType === '오피스텔_업무용'
    || acqIsCorporate(a) || a.reduction === 'childbirth';
}

/* 감면 선택지에 «항상» 붙는 고정 문구.
   엔진은 감면액 산식만 계산하고 나이·소득·주택 가액·처분 여부 같은 «요건»은 보지 않는다
   (260921 `01_엔진검증.md` §4: 「요건 검증은 엔진 밖」). 그래서 요건 확인 방법을 화면이
   직접 안내한다 — 자동 생성 문구가 아니라 고정 문구다. */
const ACQ_REDUCTION_NOTE = '⚠️ 감면 요건(나이·소득·주택 가액·기존 주택 처분 여부·세대 구성 등)은 이 계산기가 확인하지 않습니다. 계산 결과는 「요건을 갖췄다고 가정한 금액」입니다. 실제 해당 여부는 주민등록등본·가족관계증명서·매매계약서를 들고 물건 소재지 시·군·구청 세무과 또는 담당 세무사에게 확인하세요.';

/* 시·도 17개 — «조례 원문 안내»에만 쓴다. 엔진 payload 에 넣지 않는다(mapAnswersToAcquisition 참조). */
const ACQ_REGIONS = ['서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시',
  '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도',
  '경상북도', '경상남도', '제주특별자치도'];

const ACQ_QS = [
  {
    id: 'acquisitionType',
    tier: 'quick',
    section: '어떻게 취득',
    q: '부동산을 어떻게 취득하셨나요?',
    sub: '취득 원인에 따라 세율이 크게 다릅니다 — 매매(유상)·증여·상속·신축이 각각 다른 세율을 적용합니다(지방세법 §11). 계약서·등기원인에 적힌 사실대로 고르세요.',
    opts: [
      ['매매', '사서 취득 (매매·분양)', '유상취득 — 주택 1~3%(중과 8·12%)·비주택 4%'],
      ['증여', '증여로 받음', '증여 취득 — 주택 3.5%(조정 3억↑ 12%)'],
      ['상속', '상속으로 받음', '상속 취득 — 주택 2.8% (1주택 특례 0.8%은 상담)'],
      ['신축', '새로 지음 (원시취득)', '원시취득 2.8%'],
      ['공매', '공매로 낙찰받음', '한국자산관리공사(온비드)·세무서 공매'],
      ['재산분할', '이혼 재산분할로 이전받음', '협의·재판상 재산분할 등기'],
    ],
  },
  {
    id: 'propertyType',
    tier: 'quick',
    section: '무엇을 취득',
    q: '취득한 부동산은 무엇인가요?',
    sub: '주택인지 아닌지에 따라 세율·중과·감면이 완전히 다릅니다. 오피스텔은 건축물대장 용도가 기준이라 실제 사용 용도를 함께 여쭤봅니다 — 주거용으로 쓰는 오피스텔이 「주택 수」에 들어갈 수 있는지는 상담에서 확인하세요. 분양권·조합원입주권은 「권리」라서 취득 단계엔 취득세가 없고, 준공·잔금 때 주택분 취득세가 따로 나옵니다.',
    opts: [
      ['주택', '주택 (아파트·빌라·단독)', '1~3% 기본 · 다주택·조정지역 중과 가능'],
      ['상가', '상가·사무실·건물 (비주택)', '4% 단일'],
      ['오피스텔_주거용', '오피스텔 — 주거용으로 사용', '건축물대장 용도 기준으로 계산'],
      ['오피스텔_업무용', '오피스텔 — 업무용으로 사용', '건축물대장 용도 기준으로 계산'],
      ['농지', '농지 (전·답·과수원)', '지목·현황이 농지인 토지'],
      ['토지', '토지 (농지 외)', '대지·임야 등'],
      ['분양권', '분양권 (아파트 등 청약 당첨)', '취득 단계 비대상 (0원) · 준공·잔금 시 부과'],
      ['입주권', '조합원입주권 (재개발·재건축)', '권리 취득 비대상 (0원) · 준공 시 별도'],
    ],
  },
  {
    id: 'acquirerType',
    tier: 'quick',
    section: '취득 명의',
    q: '누구 명의로 취득하시나요?',
    sub: '등기 명의 기준입니다. 개인사업자는 「개인」입니다. 법인·단체 명의로 주택을 유상취득하면 주택 수와 무관하게 다른 규정이 적용됩니다(지방세법 §13의2①1호).',
    showIf: (a) => a.propertyType === '주택' && acqIsPaid(a),
    opts: [
      ['individual', '개인 명의 (개인사업자 포함)', '주택 수·조정지역으로 판정'],
      ['corporate', '법인·단체 명의', '주택 수와 무관하게 중과'],
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
    showIf: (a) => a.propertyType === '주택' && acqIsPaid(a) && !acqIsCorporate(a),
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
    sub: '조정대상지역은 다주택 중과(매매·공매)·증여 중과(시가표준 3억↑)가 적용되는 지역입니다. 현재 서울 강남·서초·송파·용산만 해당(수시 변경 — 국토부 고시 확인). 확실하지 않으면 「모르겠어요」를 고르세요 — 중과 여부가 갈리는 경우에는 금액을 내지 않고 상담으로 안내합니다.',
    showIf: (a) => a.propertyType === '주택' && (acqIsPaid(a) || a.acquisitionType === '증여') && !acqIsCorporate(a),
    /* ★ 260921 (Astra R1-F5): 이 답이 «없으면 계산 전 게이트가 막는» 분기에서는 quick 으로
       올린다. 종전에는 상세 단계에만 있어서, 2주택 매매·주택 증여로 빠른 계산을 누르면
       「조정지역 미입력」 차단 화면에 닿고 그 화면에는 돌아갈 길이 없었다.
       ⛔ 차단 «조건»은 그대로다 — 묻는 «위치»만 앞으로 옮긴 것이다. */
    quickIf: (a) => a.propertyType === '주택' && !acqIsCorporate(a) && (
      (acqIsPaid(a) && (Number(a.housingCount) || 1) >= 2) || a.acquisitionType === '증여'
    ),
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
    showIf: (a) => a.propertyType === '주택' && acqIsPaid(a) && !acqIsCorporate(a) && (Number(a.housingCount) || 1) === 2,
    opts: [['yes', '네, 종전 주택등 1개를 3년 내 처분 예정', '중과 제외 (1~3%)'], ['no', '아니오 / 계속 보유', '중과 적용 (8~12%)']],
  },
  {
    id: 'reduction',
    section: '감면',
    q: '취득세 감면 대상에 해당하나요?',
    /* ⛔ 선택지는 «엔진 산식이 조문과 대조된 것»만 둔다 (260921 `01_엔진검증.md` §4).
       신혼부부 감면(§36의2)은 산식이 생애최초 템플릿을 복제해 법정 「50% 경감」과 다르고
       조문에 일몰 표시가 남아 있어 제외한다. 귀농주택은 엔진이 인용한 근거조문이 존재하지
       않아 제외한다. 두 항목은 선택지로 만들지 않는다. */
    sub: '생애최초로 집을 사면(본인·배우자 모두 무주택, 취득가액 12억 이하, 미성년 제외) 취득세를 최대 200만원까지 감면받습니다(지방세특례제한법 §36의3, 2028년 말까지). 자녀 출산·양육 감면은 지방세특례제한법 §36의5입니다. 작은 빌라·도시형생활주택·다가구주택이나 인구감소지역 주택은 300만원까지 가능하니 상담에서 확인하세요. 앞에서 「2채 이상」 또는 「일시적 2주택」이라고 답하셨다면 생애최초 선택지가 나오지 않습니다 — 같은 법 §36의3③이 「주택을 소유한 사실이 없는 것으로 보는」 사정(상속 소수지분 등)에 해당하시면 계산기 대신 상담에서 확인하세요. ' + ACQ_REDUCTION_NOTE,
    showIf: (a) => a.propertyType === '주택' && acqIsPaid(a) && !acqIsCorporate(a),
    /* ★ 260921 R2-F1 [P0]. 생애최초(§36의3①)는 «본인·배우자 모두 무주택»이 요건이다
       — 조문대조표 2편 1번(법제처 원문 조회 260921, 조회한 법령 시행일 2026-06-02).
       취득 후 2채 이상이거나 종전 주택등을 들고 있는 «일시적 2주택»은 그 요건과 양립할 수
       없는데, 종전에는 선택지가 그대로 떠서 엔진에 감면 플래그가 갔다(실측: 공매·2주택·
       일시적2주택 «예»에 생애최초를 고르면 housing_count 1 + 생애최초 감면이 함께 전송).
       선택지의 4번째 원소 = «그 선택지가 보일 조건». acqNormalizeAnswers 가 같은 조건으로
       옛 답도 지운다 — 숨기기와 지우기를 한 곳에서 정의한다.
       ⛔ §36의3③ 의 「소유한 사실이 없는 것으로 보는」 사정은 이 계산기가 판정하지 못하므로
          숨기는 대신 위 sub 문구로 상담을 안내한다(길을 막지 않는다). */
    opts: [
      ['none', '해당 없음', '감면 없음'],
      ['first', '생애최초 주택 구입', '지특법 §36의3 · 최대 200만원',
        (a) => (Number(a.housingCount) || 1) === 1 && a.temporaryTwoHouse !== 'yes'],
      ['childbirth', '자녀 출산·양육 (출산양육 감면)', '지특법 §36의5'],
    ],
  },
  /* ★ 260921 R3-F1: 「1세대 1주택 증여 예외」를 시가표준액 «앞»으로 옮겼다.
     예외에 해당하면 조정지역이어도 중과가 없으므로 시가표준액을 물을 이유가 없다 —
     순서를 바꾸면 물어야 할 사람에게만 묻게 된다. */
  {
    id: 'giftOneHouseException',
    section: '1세대 1주택 증여',
    q: '증여하는 분이 이 주택 1채만 가진 1세대 1주택자이고, 받는 분이 배우자·자녀·부모인가요?',
    sub: '이 경우 조정대상지역이라도 증여 취득세 12% 중과에서 제외되어 일반 3.5%가 적용됩니다(지방세법 §13의2② 단서). 부모→자녀 1주택 증여가 대표적입니다.',
    showIf: (a) => a.acquisitionType === '증여' && a.propertyType === '주택' && a.isRegulatedArea === 'yes',
    /* 조정지역 증여는 이 답에 따라 중과가 갈리므로 결과 화면 «앞»에서 묻는다 */
    quickIf: (a) => a.acquisitionType === '증여' && a.propertyType === '주택' && a.isRegulatedArea === 'yes',
    /* 여기서 「모름」→중과 적용은 «세금이 많게» 나오는 방향이라 안전하다(과소신고 위험 없음). */
    opts: [['yes', '네, 1세대 1주택자가 가족에게 증여', '12% 중과 제외 (3.5%)'], ['no', '아니오 / 모름', '12% 중과 적용']],
  },
  {
    id: 'standardValue',
    section: '시가표준액',
    q: '이 주택의 시가표준액은 얼마인가요? (증여 중과 판정용 · 원)',
    /* ★ 260921 R3-F1 [P0]: 종전 문구는 「모르면 비워두세요 — 앞 금액으로 대신 판단합니다」였고
       매퍼가 실제로 «시가»를 시가표준액 대신 써서 3억 기준을 넘긴 것으로 «확정»했다.
       시가는 시가표준액보다 크기 마련이라, 실제 시가표준액이 3억 미만인 사람에게도 12% 중과가
       붙는다. 값을 추측으로 대체하지 않는다 — 없으면 판정하지 않고 차단한다(acqFallbackGaps). */
    sub: '앞에서 넣은 「시가」와 달리, 시가표준액은 정부가 매년 정하는 공시가격이에요(보통 시세보다 낮습니다). 증여 취득세 중과는 이 공시가격 3억원을 기준으로 갈립니다(지방세법 §13의2②·같은 법 시행령 §28의6①). ⛔ 앞의 시가로 대신 판단하지 않습니다 — 조정대상지역 증여인데 이 값이 없으면 중과 여부를 확정할 수 없어 금액을 내지 않고 안내로 넘어갑니다. 아래 주소 조회로 자동으로 채울 수 있고, 부동산공시가격알리미(realtyprice.kr)에서도 확인하실 수 있어요.',
    showIf: (a) => a.acquisitionType === '증여' && a.propertyType === '주택',
    /* 조정지역 증여이고 1세대1주택 예외가 아니면 «결과 화면보다 먼저» 묻는다 */
    quickIf: (a) => a.acquisitionType === '증여' && a.propertyType === '주택'
      && a.isRegulatedArea === 'yes' && a.giftOneHouseException !== 'yes',
    numeric: true, money: true, optional: true,
    placeholder: '예: 400,000,000',
  },
  {
    id: 'region',
    tier: 'quick',
    section: '소재지',
    q: '물건이 있는 시·도는 어디인가요?',
    /* ⛔ 이 답은 «세액 계산에 쓰지 않는다». 시도세 감면 조례 «원문»을 안내하기 위해서만
       쓰고, 엔진 payload 에는 넣지 않는다. 시도 선택으로 조정대상지역을 추정하지도 않는다. */
    sub: '세액 계산에는 쓰지 않습니다. 시·도마다 「도세(시세) 감면 조례」가 따로 있어서, 그 원문을 찾아 드리기 위해서만 씁니다. 모르시면 「선택 안 함」을 고르세요 — 세액은 그대로 계산됩니다.',
    opts: ACQ_REGIONS.map((r) => [r, r, '조례 원문 안내']).concat([['unknown', '선택 안 함 / 모르겠어요', '조례 안내 생략']]),
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

/* ══════════════════════════════════════════════════════════════════════════
   ★ 답 정규화 — «지금 화면에 보이지 않는 질문의 옛 답»을 한 곳에서 끊는다 (260921 R2)

   ▣ 왜 이 함수 하나인가
     Codex R2 가 낸 P0 1건·P1 1건·P2 1건은 «사례»가 달랐을 뿐 원인이 하나였다 —
     `setAns` 는 답을 병합만 하고 지우지 않으므로, 분기를 바꾸면 숨은 답이 그대로 남아
       · 공매 일시적2주택에 생애최초 감면이 함께 전송되고 (R2-F1, 양립 불가한 사실관계)
       · 증여로 바꿨는데 법인 답이 남아 «고칠 수 없는 차단»이 생기고 (R2-F2)
       · 농지로 바꿨는데 주택 시가표준액이 요청에 남았다 (R2-F3).
     사례마다 조건을 덧대면 다음 분기에서 또 난다. 그래서 «매퍼·차단 검사·요약·표시»가
     전부 이 함수를 거친 답만 보게 한다.

   ▣ 무엇을 남기나 — 두 층
     ① 질문 층: 지금 답을 기준으로 `showIf` 가 참인 질문의 답만 남긴다.
        ACQ_QS 순서대로 «이미 정규화된 답»을 보며 판정하므로, 위에서 지운 답이
        아래 질문의 노출 판정에 되살아나지 않는다.
     ② 선택지 층: 선택지에 노출 조건(4번째 원소)이 붙어 있으면, 그 조건을 만족하지 않는
        값은 지운다. 질문은 보이는데 «그 선택지만» 못 고르게 된 경우를 잡는다(R2-F1).

   ▣ 지운 결과 «차단이 풀리는» 경우를 어떻게 다루나
     지워서 필수 답이 비면 차단되는 것은 정상이다(사용자가 다시 답하면 된다).
     반대로 차단이 풀리는 경우는 «그 답이 애초에 계산에 들어가지 않는» 허위 차단뿐이어야
     한다. project/tests_acq_flow.js ⑥ 이 도달 가능한 조합을 전수로 훑어 그 목록을 고정한다.
   ══════════════════════════════════════════════════════════════════════════ */
function acqOptionAvailable(opt, answers) {
  const cond = opt && opt[3];
  return typeof cond === 'function' ? !!cond(answers) : true;
}
/* 지금 고를 수 있는 선택지 — 렌더와 정규화가 «같은 함수»를 쓴다(두 벌이면 어긋난다) */
function acqVisibleOpts(q, answers) {
  return (q.opts || []).filter((o) => acqOptionAvailable(o, answers));
}
/* ★ 260921 R4-F1: 정규화는 «무엇을 지웠는지»도 함께 돌려준다.
   지우는 동작 자체는 옳다 — 분기를 바꾼 사용자의 «현재 사실관계»는 그 답을 처음부터 그렇게
   넣은 사용자와 같고, 두 경로의 결과가 같아야 한다(tests_acq_flow ⑦-c 가 전수로 고정).
   그런데 «조용히» 지우면 사용자는 자기가 고른 감면이 빠진 줄 모른다. 그래서 목록을 내보내
   결과·차단 화면이 「이 답은 지금 조건에서 해당하지 않아 계산에서 제외했다」고 알린다.
   reason 은 두 가지뿐이다 — 'hidden'(그 질문이 지금 보이지 않음) / 'option'(그 선택지를
   지금 고를 수 없음). 이 둘 밖의 이유로 지우는 일이 생기면 시험이 실패한다. */
function acqNormalize(answers) {
  const raw = answers || {};
  const out = {};
  const dropped = [];
  for (const q of ACQ_QS) {
    const v = raw[q.id];
    const hasValue = !(v === undefined || v === null || v === '');
    if (q.showIf && !q.showIf(out)) {                  // ① 질문 층
      if (hasValue) dropped.push({ id: q.id, section: q.section || '', q: q.q || q.id, value: v, label: acqAnswerLabel(q, v), reason: 'hidden' });
      continue;
    }
    if (!hasValue) continue;
    if (q.opts && !acqVisibleOpts(q, out).some((o) => o[0] === v)) {            // ② 선택지 층
      dropped.push({ id: q.id, section: q.section || '', q: q.q || q.id, value: v, label: acqAnswerLabel(q, v), reason: 'option' });
      continue;
    }
    out[q.id] = v;
  }
  return { answers: out, dropped };
}
/* 답 값을 사람이 읽는 라벨로 — 선택지면 라벨, 금액이면 원 단위, 면적이면 ㎡ */
function acqAnswerLabel(q, v) {
  if (q.opts) { const o = q.opts.find((x) => x[0] === v); if (o) return o[1]; }
  /* formatWon 은 먼저 로드된 파일의 전역이다 — 시험이 이 함수만 떼어 실행할 수도 있어 폴백을 둔다 */
  if (q.numeric && q.money) return (typeof formatWon === 'function' ? formatWon(Number(v)) : Number(v).toLocaleString('ko-KR') + '원');
  if (q.numeric) return v + '㎡';
  return String(v);
}
function acqNormalizeAnswers(answers) { return acqNormalize(answers).answers; }

/* 화면 propertyType → 엔진 property_type.
   ⚠️ 농지는 property_type 만 '농지' 로 보내면 «4%»가 나온다 (260921 fly.dev 실측:
      property_type='농지' 단독 → 8,000,000 / is_farmland=true → 6,000,000).
      세율을 가르는 것은 is_farmland 플래그다 — 아래에서 반드시 함께 보낸다. */
const ACQ_PROPERTY_TYPE = {
  '주택': '주택',
  '상가': '상가사무실',
  '오피스텔_주거용': '오피스텔_주거용',
  '오피스텔_업무용': '오피스텔_업무용',
  '농지': '농지',
  '토지': '토지',
  '분양권': '분양권',
  '입주권': '조합원입주권',
};
/* 화면 acquisitionType → 엔진 acquisition_type (엔진 허용값: 유상취득/상속/증여/원시취득/공매/재산분할) */
const ACQ_ACQUISITION_TYPE = { '매매': '유상취득', '증여': '증여', '상속': '상속', '신축': '원시취득', '공매': '공매', '재산분할': '재산분할' };

function mapAnswersToAcquisition(rawA) {
  /* ★ 엔진 경계에서 한 번 더 정규화한다 (260921 R2). 호출자가 이미 정규화해서 넘기지만,
     «엔진으로 나가는 마지막 문»이라 여기서도 닫는다 — 정규화는 멱등이라 두 번 해도 같다.
     이 한 줄이 R2-F3(농지로 바꿨는데 남은 주택 시가표준액)을 부류째 막는다. */
  const a = acqNormalizeAnswers(rawA);
  const isHousing = a.propertyType === '주택';
  const isPurchase = acqIsPaid(a);   // 유상거래(매매·공매)만 다주택 중과·생애최초 감면 대상
  const isCorp = acqIsCorporate(a);
  const body = {
    property_value: Number(a.propertyValue) || 0,
    acquisition_type: ACQ_ACQUISITION_TYPE[a.acquisitionType] || '유상취득',
    property_type: ACQ_PROPERTY_TYPE[a.propertyType] || '상가사무실',
    is_housing: isHousing,
  };
  if (a.propertyType === '농지') body.is_farmland = true;   // ← 세율을 가르는 것은 이 플래그다(위 주석)
  if (isHousing && Number(a.exclusiveArea) > 0) body.exclusive_area = Number(a.exclusiveArea);
  // 법인·단체 명의 주택 유상취득(지§13의2①1호)은 주택 수·조정지역·감면과 무관하게 판정된다.
  //   검증된 조합(260921 실측: 법인 주택 유상 5억 → 12%) 밖으로 나가지 않도록 개인 전용 필드를 보내지 않는다.
  if (isHousing && isPurchase && isCorp) body.is_corporate = true;
  // 다주택 중과(지§13의2①)·생애최초 감면(지특법§36의3)·조정지역은 '매매·공매(유상거래)'만 적용.
  //   취득유형을 바꿔도 잔존 답변(주택수·조정·감면)이 신축·증여·상속에 새지 않도록 유상거래로 게이트.
  if (isHousing && isPurchase && !isCorp) {
    body.housing_count = Number(a.housingCount) || 1;
    if (a.isRegulatedArea === 'yes') body.is_regulated_area = true;
    // 생애최초 감면(§36의3): reduction_type을 보내야 적용.
    //   300만(1호)은 '아파트 제외'+가액요건이라 면적만으론 자동판정 불가 → 보수적 200만(2호) 기본, 300만은 상담.
    //   ★ 260921 R2-F1: «본인·배우자 무주택»(§36의3①)과 양립하지 않는 조합은 여기서도 거부한다.
    //     선택지 노출 조건·정규화가 이미 막지만, 엔진으로 나가는 문은 두 번 잠근다.
    if (a.reduction === 'first' && (Number(a.housingCount) || 1) === 1 && a.temporaryTwoHouse !== 'yes') {
      body.reduction_type = '생애최초'; body.is_first_home_buyer = true;
    }
    // 출산·양육 감면(§36의5): 260921 검증에서 산식이 조문과 일치함을 확인한 항목.
    //   ⛔ 신혼부부(§36의2)·귀농주택은 선택지에 두지 않으므로 여기서도 보내지 않는다.
    if (a.reduction === 'childbirth') { body.reduction_type = '출산양육'; body.is_childbirth = true; }
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
    // ★ 260921 R2-F3: 시가표준액 문항은 «증여 주택»에만 보인다 — 보내는 쪽에도 같은 조건을 건다.
    if (isHousing && Number(a.standardValue) > 0) body.standard_value = Number(a.standardValue);
    /* ★ 260921 R3-F1 [P0]. 종전에는 시가표준액이 비면 «시가»로 대신 판정했다
       (`Number(a.standardValue) || Number(a.propertyValue)`) — 분기점 a71b83f 에도 있던
       코드이고 이번 브랜치가 만든 것은 아니다. 시가는 시가표준액보다 크기 마련이라,
       실제 시가표준액이 3억 미만인 사람에게도 12% 중과가 «확정»돼 표시됐다.
       ⛔ 이제 «명시적으로 입력·조회된» 시가표준액만 본다. 없으면 이 파생값을 만들지 않고,
          acqFallbackGaps 가 그 조합을 아예 차단한다(엔진이 살아 있어도). */
    if (isHousing && a.isRegulatedArea === 'yes' && a.giftOneHouseException !== 'yes'
        && Number(a.standardValue) >= 300_000_000) {
      body.gift_regulated_over_3b = true;
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
      // 6~9억 슬라이딩 본세율: §11①8호나목 단서 — «계산식에 따라 산출한 세율»(×1/100 까지 마친 비율)을
      //    소수점 다섯째자리에서 반올림→넷째자리 (수정 260628 ACQ-A-04). 7억 → 0.016667 → 0.0167 = 1.67%(공식 세율표와 같다).
      // ⚠️ 260906(TASK-260906-022) 이력: 한때 «백분율 넷째 자리(1.6667%)»로 잘못 고쳤다가 Codex review_high 반증으로 복귀.
      //    남긴 개선 = 정수 절반올림(부동소수점이 정확한 동률 699,750,000 → 0.01665 를 못 올리는 것 방지) — 엔진과 같은 식.
      const base6_9 = Math.floor((v - 450_000_000 + 750_000) / 1_500_000) / 10_000;   // 7억 → 167 → 0.0167
      // 본세와 지방교육세(본세율×50%×20%, §151①1호)를 «각각» 원 단위로 반올림한 뒤 합산 — 엔진과 1원까지 같게
      return Math.round(v * base6_9) + Math.round(v * base6_9 * 0.5 * 0.2);
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
    /* ★ 260921 «추가»(기존 조건은 그대로 둔다). 공매는 엔진에서 매매와 완전히 같은 주택 규정을
       타므로(실측: 공매 8억 2주택 조정 = 67,200,000 = 매매 동일 입력), 매매에만 걸려 있던
       위 두 ①층 차단을 공매에도 «같은 이유로» 건다. 안 걸면 공매 다주택자에게 조정지역을
       안 물은 채 엔진이 비조정으로 가정해 8% ↔ 1~3% 가 통째로 갈린다. */
    { when: answers.propertyType === '주택' && answers.acquisitionType === '공매' && hc >= 2 && regUnknown,
      why: '공매로 취득한 다주택인데 조정대상지역 여부가 정해지지 않았습니다 — 중과 여부가 갈립니다(8% ↔ 1~3%).' },
    { when: answers.propertyType === '주택' && answers.acquisitionType === '공매'
            && hc >= 3 && answers.temporaryTwoHouse === 'yes',
      why: '3주택 이상은 «일시적 2주택» 특례 대상이 아닙니다(시행령 §28의5① — 종전 주택등 1개를 보유한 세대만). 주택 수를 다시 확인해 주세요.' },
    /* ★ 260921 «추가» (Codex R3-F1 [P0]). 조정대상지역 증여 주택에서 증여 중과는
       «시가표준액» 3억원으로 갈린다(지방세법 §13의2②·시행령 §28의6① — 01_엔진검증 A5).
       그 값이 없으면 판정할 수 없다. 종전에는 «시가»로 대신 판정해 3억 미만인 사람에게도
       12% 중과가 확정돼 표시됐다. 추측으로 메우지 않고 막는다 — 엔진이 살아 있어도(①층). */
    { when: answers.propertyType === '주택' && answers.acquisitionType === '증여'
            && answers.isRegulatedArea === 'yes' && answers.giftOneHouseException !== 'yes'
            && !(Number(answers.standardValue) > 0),
      why: '조정대상지역 증여인데 시가표준액(공시가격)을 넣지 않으셨습니다 — 증여 중과 12%는 이 «시가표준액» 3억원으로 갈리는데, 앞에서 넣은 시가로 대신 판단하면 실제로는 중과 대상이 아닌 분께 3배 넘는 세금을 보여 드리게 됩니다.' },
    /* ★ 260921 «추가». 주택 수는 중과를 가르는 필수 답인데 미응답이면 매퍼가 «1채»를 기본값으로
       쓴다. 화면 흐름은 답을 강제하므로 평시에는 닿지 않지만, 「필수 입력이 없을 때 다른 값으로
       대신 판정한다」는 같은 부류라 여기서 닫는다. */
    { when: answers.propertyType === '주택' && (answers.acquisitionType === '매매' || answers.acquisitionType === '공매')
            && answers.acquirerType !== 'corporate' && !(Number(answers.housingCount) > 0),
      why: '취득 후 보유하게 되는 주택 수가 정해지지 않았습니다 — 다주택 중과 여부가 갈립니다.' },
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
    /* ★ 260921 «추가»(기존 항목은 손대지 않는다) — 이번에 새로 노출한 유형은 간이 폴백
       (fallbackAcqTax)에 계산 경로가 «아예 없다». 폴백은 이 유형들을 매매·비주택 분기로
       흘려보내 조용히 다른 세율을 낸다. 그래서 엔진이 죽으면 전부 막는다.
       ⛔ 여기 조건을 좁히거나 지우면 그 순간 틀린 금액이 나간다. */
    { when: answers.acquisitionType === '공매',
      why: '공매 취득 — 간이 계산에 공매 취득 경로가 없습니다(매매 세율로 흘러가 감면·중과 판정이 어긋납니다).' },
    { when: answers.acquisitionType === '재산분할',
      why: '재산분할 취득 — 간이 계산에 재산분할 세율(지방세법 §15①)이 없습니다.' },
    { when: answers.propertyType === '농지',
      why: '농지 — 간이 계산이 농지 세율(유상 3%·상속 2.3%)과 농어촌특별세를 다루지 못하고 일반 토지율을 적용합니다.' },
    { when: answers.propertyType === '오피스텔_주거용' || answers.propertyType === '오피스텔_업무용',
      why: '오피스텔 — 간이 계산에 오피스텔 경로가 없어 농어촌특별세가 빠집니다.' },
    { when: answers.acquirerType === 'corporate',
      why: '법인·단체 명의 취득 — 간이 계산에 법인 중과(지방세법 §13의2①1호)가 없어 세금이 «훨씬 적게» 나옵니다.' },
    { when: answers.reduction === 'childbirth',
      why: '자녀 출산·양육 감면(지특법 §36의5) — 간이 계산에 이 감면이 없어 세금이 «많게» 나옵니다.' },
  ]));
}

/* 이 문항을 «빠른 계산» 단계에서 물어야 하는가.
   tier:'quick' 은 항상 quick, quickIf 는 «그 분기에서만» quick 으로 끌어올린다.
   quick/detail 양쪽 필터가 반드시 같은 함수를 봐야 한 문항이 두 번 나오거나 사라지지 않는다. */
function acqIsQuick(q, answers) {
  return q.tier === 'quick' || (typeof q.quickIf === 'function' && q.quickIf(answers));
}

/* 차단 화면의 «돌아갈 곳»을 고르는 «이동» 함수 — 판정 함수가 아니다.
   차단 «사유» 판정은 acqFallbackGaps 한 곳뿐이고(규칙이 두 벌이 되면 어긋난다),
   이 함수는 그 화면에서 커서를 어느 문항에 놓을지만 정한다.
   기준 ① 「모르겠어요」로 답한 문항 — 차단 사유의 대부분이 이것이다.
   기준 ② 빠른 계산 단계인데 아직 답이 없는 문항 (면적 미입력 등).
   ⚠️ «아직 묻지도 않은» 상세 단계 문항은 고르지 않는다 — 막은 이유와 무관한 곳으로
      보내면 「빠진 질문으로 돌아가기」가 거짓말이 된다.
   둘 다 없으면 null (앞선 답이 서로 모순인 경우 — 화면이 첫 문항으로 보내 훑게 한다). */
function acqFirstOpenQuestion(answers) {
  const visible = ACQ_QS.filter((q) => !q.showIf || q.showIf(answers));
  const unsure = visible.find((q) => answers[q.id] === 'unsure');
  if (unsure) return unsure;
  return visible.find((q) => {
    if (q.freeform || !acqIsQuick(q, answers)) return false;
    const v = answers[q.id];
    if (v === undefined || v === null || v === '') return true;
    return !!q.numeric && !(Number(v) > 0);
  }) || null;
}

/* 260921 신설 유형 전용 «고정» 해설 — 자동 생성(window.claude.complete)을 쓰지 않는다.
   프롬프트는 취득원인·물건·가액·총세액만 받으므로 새 유형의 요건·일몰·추징을 모른 채
   「절세 아이디어」를 지어낸다(Astra R1-F6). 그래서 아이디어 칸을 비우고 확인 항목만 남긴다. */
const ACQ_NEW_TYPE_COMMENTARY = {
  headline: '이번 계산은 검증 엔진이 낸 금액이며, 요건 확인이 필요한 항목이 남아 있습니다.',
  cautions: [
    { title: '신고·납부 기한', detail: '유상취득(매매·공매)은 취득일부터 60일, 증여 등 무상취득은 취득일이 속한 달 말일부터 3개월, 상속은 상속개시일이 속한 달 말일부터 6개월(외국에 주소를 둔 상속인이 있으면 9개월) 이내에 신고·납부해야 합니다. 기한 말일이 토요일·공휴일·대체공휴일이면 그 다음 날까지입니다(지방세법 §20①, 지방세기본법 §24).' },
    { title: '요건은 이 계산기가 확인하지 않습니다', detail: ACQ_REDUCTION_NOTE },
    { title: '물건 구분은 대장이 기준입니다', detail: '오피스텔의 주거용·업무용, 토지의 농지 여부는 건축물대장·토지대장(지목)과 실제 사용 현황으로 판정합니다. 대장과 실제가 다르면 세액도 달라질 수 있으니 등기사항증명서·대장을 들고 상담에서 확인하세요.' },
  ],
  saving_ideas: [],
  followup: ['매매·낙찰·재산분할 등 취득 원인을 알 수 있는 계약서 또는 판결문', '등기사항증명서', '건축물대장·토지대장', '시가표준액(공시가격)'],
};

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

/* ── 「이 계산에 넣지 않은 것」 ──────────────────────────────────────────────
   실제로 이 결과에서 «빠진» 항목만 적는다. 세율·요건을 새로 서술하지 않는다.
   (Astra 설계안 블록 4 채택 — 「계산에 넣지 않았다」는 사실 진술만) */
/* ── 「계산에서 제외한 옛 답」 안내 (260921 R4-F1) ──────────────────────────
   분기를 바꾸면 정규화가 옛 답을 지운다. 그 동작은 옳지만(현재 사실관계로 계산한다),
   조용히 지우면 사용자는 자기가 고른 답이 빠진 줄 모른다. 그래서 «무엇을 왜 뺐는지»만
   중립적으로 알린다.
   ⛔ 세액·환급을 예단하는 표현을 쓰지 않는다 — 「세금이 늘어납니다」·「더 받을 수 있습니다」
      류 금지. 사실 진술과 「다시 고르려면 그 조건부터 바꿔야 한다」는 안내까지만. */
function JTAcqDroppedNotice({ dropped }) {
  if (!dropped || dropped.length === 0) return null;
  return (
    <div style={{ background: 'var(--bg-1,#f7f5f0)', border: '1px solid #dfe3dc', borderRadius: 10, padding: '14px 16px', marginBottom: 16, lineHeight: 1.7 }}>
      <strong style={{ display: 'block', marginBottom: 6 }}>앞에서 고르신 답 중 지금 조건에 해당하지 않는 것이 있어 계산에서 제외했습니다</strong>
      <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
        {dropped.map((d, i) => (
          <li key={i} style={{ marginBottom: 4 }}>
            <strong>{d.section || d.id}</strong> — 「{d.label}」
            <span style={{ opacity: 0.8 }}>{d.reason === 'option' ? ' (지금 조건에서는 고를 수 없는 선택지입니다)' : ' (지금 조건에서는 묻지 않는 항목입니다)'}</span>
          </li>
        ))}
      </ul>
      <p style={{ margin: 0, fontSize: 13.5, opacity: 0.85 }}>지금 답하신 조건으로만 계산했습니다. 위 항목을 다시 반영하려면 앞 단계로 돌아가 해당 조건부터 바꿔 주세요.</p>
    </div>
  );
}
window.JTAcqDroppedNotice = JTAcqDroppedNotice;

/* ── 결과 화면 «안내 문구» 허용 목록 (260921 R2-F4) ─────────────────────────
   종전에는 중과 안내가 조건 없이 렌더돼, 법인 주택 중과(§13의2①1호) 결과에도 개인용
   「일시적 2주택 등으로 중과가 빠질 수 있으니」가 붙었다 — 법인에는 그 특례가 없다.
   문구를 분기별 «허용 목록»으로 바꾼다: 어느 분기에 무엇이 붙는지를 한 곳에서 정하고,
   목록에 없는 분기에는 아무것도 붙지 않는다(새 유형이 늘어도 기본값이 «안 붙음»이다). */
function acqNoticeKey(a) {
  if (a.propertyType === '주택' && acqIsPaid(a) && acqIsCorporate(a)) return 'corporate';
  /* 개인 유상 주택(매매·공매)만 일시적 2주택 특례를 탄다 — 260921 실측으로 공매도 매매와
     같게 동작함을 확인했다(8억 일시적2주택 → 2.33%). 그 밖(증여 중과 등)은 중립 문구. */
  if (a.propertyType === '주택' && acqIsPaid(a)) return 'personalHousePaid';
  return 'other';
}
const ACQ_HEAVY_NOTICE = {
  corporate: '법인·단체 명의 주택 취득에 적용되는 중과입니다(지방세법 §13의2①1호). 개인의 일시적 2주택 특례는 해당하지 않습니다. 법인의 설립 시기·소재지에 따라 달리 볼 사정이 있으면 상담에서 확인하세요.',
  personalHousePaid: '일시적 2주택 등으로 중과가 빠질 수 있으니 해당되면 상담으로 확인하세요.',
  other: '중과 여부는 취득 원인과 사실관계에 따라 달라집니다 — 해당 여부는 상담에서 확인하세요.',
};

function acqExcludedItems(a) {
  const out = ['시·도 조례에 따른 추가 경감·감면 — 아래 「소재지 시·도 감면 조례」 칸의 원문을 직접 확인해야 합니다.'];
  if (a.reduction && a.reduction !== 'none') out.push('감면 요건 심사 — ' + ACQ_REDUCTION_NOTE);
  if (a.context) out.push('「추가 사항」에 적어 주신 내용 — 상담 때 참고하며 세액 계산에는 들어가지 않았습니다.');
  out.push('가산세·가산금, 등기 비용, 국민주택채권 등 세금이 아닌 비용.');
  if (a.acquisitionType === '상속') out.push('무주택 1가구 1주택 상속 특례 해당 여부 — 이 계산기가 판정하지 않습니다.');
  if (a.propertyType === '오피스텔_주거용') out.push('주거용 오피스텔이 다른 주택의 「주택 수」에 들어가는지 여부 — 이 계산기가 판정하지 않습니다.');
  if (a.acquirerType === 'corporate') out.push('법인의 설립 시기·소재지(대도시 등)에 따른 별도 규정 해당 여부.');
  return out;
}

/* ── 시·도 감면 조례 «원문 안내» 카드 ──────────────────────────────────────
   ⛔ 이 카드의 경감률은 «세액 계산에 절대 반영하지 않는다». 원문·시행일·조회일만 보여 주고,
      해당 여부 판단은 사용자·담당 세무사에게 넘긴다. 데이터는 빌드 시점에 법제처 API 에서
      받아 둔 스냅샷(project/data/ordinance-cards.json → window.JT_ORDINANCE_CARDS)이다. */
const ACQ_ORDINANCE_SEARCH = 'https://www.law.go.kr/ordinSc.do?menuId=3&subMenuId=27&tabMenuId=136&query=';
const ACQ_ORD_BOX = { background: 'var(--bg-1,#f7f5f0)', border: '1px solid #dfe3dc', borderRadius: 10, padding: '14px 16px', lineHeight: 1.65 };

function JTAcqOrdinanceCard({ region }) {
  if (!region || region === 'unknown') {
    return (
      <section className="jt-report-result__section">
        <h3>소재지 시·도 감면 조례</h3>
        <div style={ACQ_ORD_BOX}>물건이 있는 시·도를 고르지 않으셨습니다. 시·도마다 「도세(시세) 감면 조례」가 따로 있어, 소재지를 정하면 그 원문 위치를 안내해 드립니다. <strong>조례 내용은 어느 경우든 이 계산에 넣지 않습니다.</strong></div>
      </section>
    );
  }
  const store = (typeof window !== 'undefined' && window.JT_ORDINANCE_CARDS) || null;
  const card = store && store.cards && store.cards[region];
  const searchUrl = ACQ_ORDINANCE_SEARCH + encodeURIComponent(region + ' 감면 조례');
  if (!card) {
    return (
      <section className="jt-report-result__section">
        <h3>{region} 감면 조례</h3>
        <div style={ACQ_ORD_BOX}>
          이 시·도의 시도세 감면 조례에 추가 경감 규정이 있을 수 있습니다. 법제처 자치법규 원문에서 확인하십시오.
          <div style={{ marginTop: 10 }}><a className="jt-btn jt-btn--ghost" href={searchUrl} target="_blank" rel="noopener">법제처 자치법규에서 찾아보기 (새 창) →</a></div>
          <p style={{ margin: '10px 0 0', fontSize: 13, opacity: 0.85 }}><strong>이 계산에는 넣지 않았습니다.</strong></p>
        </div>
      </section>
    );
  }
  const ymd = (s) => (String(s || '').length === 8 ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}` : (s || ''));
  const daysSince = (() => {
    const t = Date.parse(card.fetchedAt);
    return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000);
  })();
  const stale = daysSince !== null && daysSince > 30;
  return (
    <section className="jt-report-result__section">
      <h3>{card.region} · {card.ordinanceName} {card.articleLabel}</h3>
      <div style={ACQ_ORD_BOX}>
        <p style={{ margin: '0 0 10px', fontSize: 13.5, opacity: 0.85 }}>
          시행일 {ymd(card.effectiveDate)} · 공포번호 제{card.promulgationNo}호 · 자치법규일련번호 {card.ordinanceSerial} · 조회일 {card.fetchedAt}
          {stale && <strong style={{ color: '#a35a00' }}> · 갱신 확인 필요(조회 후 {daysSince}일 경과)</strong>}
        </p>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'keep-all', fontFamily: 'inherit', fontSize: 14.5, margin: '0 0 12px', padding: '12px 14px', background: '#fff', border: '1px solid rgba(0,0,0,.08)', borderRadius: 8 }}>{card.articleText}</pre>
        <p style={{ margin: '0 0 10px' }}>
          이 조문이 적용되는 대상은 <strong>산업단지 등에 관한 지방세특례제한법 제78조의 감면 대상자</strong>입니다. 해당하는지는 확인이 필요합니다 — 물건이 산업단지·산업기술단지 안에 있는지, 어떤 용도로 쓰는지, 감면 후 처분·용도 변경이 있었는지를 분양계약서·사업계획서·등기사항증명서로 확인하세요.
        </p>
        <p style={{ margin: '0 0 10px' }}><strong>이 계산에는 넣지 않았습니다.</strong> 위 경감률은 세액에 반영되지 않았습니다.</p>
        <a className="jt-btn jt-btn--ghost" href={card.sourceUrl} target="_blank" rel="noopener">법제처 원문 보기 (새 창) →</a>
      </div>
    </section>
  );
}
window.JTAcqOrdinanceCard = JTAcqOrdinanceCard;

function JTReportAcquisition({ setRoute, onBack }) {
  const [step, setStep] = useAcqState(0);
  /* ★ 260921 R2: 상태에 담기는 것은 «원본 답»이고(setAns 는 병합만 한다), 화면·매퍼·차단
     검사가 보는 것은 정규화를 거친 답이다. 이름을 answers 로 둬서 «이 컴포넌트 안에서는
     정규화된 답만 answers 다»를 강제한다 — 아래 어디서도 rawAnswers 를 직접 쓰지 않는다. */
  const [rawAnswers, setAnswers] = useAcqState({});
  const acqNorm = acqNormalize(rawAnswers);
  const answers = acqNorm.answers;
  /* 정규화가 «실제로 입력했던» 답을 지운 목록 — 결과·차단 화면이 그대로 알린다 (R4-F1) */
  const acqDropped = acqNorm.dropped;
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
  const visibleQs = allVisible.filter(q => acqIsQuick(q, answers) === (phase === 'quick'));
  const total = visibleQs.length;
  const safeStep = Math.min(step, total - 1);
  const cur = visibleQs[safeStep];
  const isLast = safeStep === total - 1;
  const setAns = (id, v) => setAnswers(a => ({ ...a, [id]: v }));

  const canNext = () => {
    if (cur.freeform) return true;
    if (cur.numeric) { if (cur.optional) return true; const v = Number(answers[cur.id]); return !isNaN(v) && v > 0; }
    /* answers 는 정규화된 답이다 — 분기를 바꿔 «못 고르게 된» 옛 선택지는 여기서 비어 있고,
       그래서 다음으로 넘어가지 못하고 다시 답하게 된다 (260921 R2). */
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
        /* precise:true 로 저장하는 이유 — 렌더가 같은 판정 함수를 다시 부르는데,
           precise:false 로 두면 ②폴백 한계 사유까지 붙어 «엔진 POST 를 멈춘 이유»와
           다른 항목이 화면에 뜬다 (260806 Codex R21 P2). preEngineBlock 은 그 상태를
           «정밀 계산 성공»과 구분하기 위한 표식이다. */
        const unknownRep = { calc: { precise: true, preEngineBlock: true }, commentary: null, quick: phase === 'quick' };
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

      /* ★ 260921 (Astra R1-F6): 이번에 새로 노출한 유형(공매·재산분할·농지·오피스텔·법인·
         출산양육 감면)에는 «자동 생성 해설»을 붙이지 않는다. 프롬프트가 받는 것은
         취득원인·물건·가액·총세액뿐이라, 그 유형의 요건·일몰·추징을 모른 채 「절세 아이디어」를
         지어낸다. 검증된 고정 문구만 쓴다.
         ⚠️ 종전 초안은 여기서 throw 해서 «아래 catch» 로 빠지게 했는데, 그 catch 가 내놓는
            것은 «기존 유형용» 폴백 문구다 — 그래서 농지·공매 결과에 「생애최초·신혼부부
            감면」·「다주택 중과」가 그대로 붙었다(260921 브라우저 실행으로 발견. 구문 검사는
            못 잡는다). 신규 유형은 catch 를 거치지 않고 «미리» 고정 문구를 넣는다. */
      const acqNewType = acqNewTypeSelected(answers);
      let commentary = acqNewType ? ACQ_NEW_TYPE_COMMENTARY : null;
      try {
        if (acqNewType) throw new Error('신규 유형 — 자동 해설 미사용');
        if (!(window.claude && window.claude.complete)) throw new Error('claude 미가용');
        const prompt = `너는 한국 세무사다. 아래 취득세 계산을 보고 JSON으로만 답하라.\n취득원인:${answers.acquisitionType} 종류:${answers.propertyType} 가액:${formatWon(Number(answers.propertyValue) || 0)} 총세액:${formatWon(calc.totalTax)}\n{"headline":"한줄요약","cautions":[{"title":"","detail":""}],"saving_ideas":[{"title":"","detail":""}],"followup":["필요자료"]}`;
        const txt = await window.claude.complete(prompt);
        commentary = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]);
      } catch (cErr) {
        if (commentary) { /* 신규 유형 — 위에서 이미 고정 문구를 넣었다. 덮어쓰지 않는다 */ }
        else commentary = {
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
  /* 차단 화면 → 그 문항으로 «되돌아가기». 다른 답은 그대로 두고 커서만 옮긴다.
     (260921 Astra R1-F5: 종전 차단 화면에는 「처음부터 다시」밖에 없어서, 답을 전부
      버리지 않고는 빠진 항목을 채울 방법이 없었다.) */
  const goToQuestion = (q) => {
    setReport(null);
    if (!q) { setPhase('quick'); setStep(0); return; }
    const ph = acqIsQuick(q, answers) ? 'quick' : 'detail';
    const list = ACQ_QS.filter(x => !x.showIf || x.showIf(answers))
      .filter(x => acqIsQuick(x, answers) === (ph === 'quick'));
    const i = list.indexOf(q);
    setPhase(ph); setStep(i >= 0 ? i : 0);
  };
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
    /* 차단 화면에서 «돌아갈 문항» — 계산이 아니라 이동 대상만 고른다(acqFirstOpenQuestion 주석) */
    const acqOpenQ = acqFirstOpenQuestion(answers);
    /* ★ 차단이면 «결과 화면을 아예 만들지 않는다».
       가릴 것을 하나씩 세는 방식은 새 표현이 늘 때마다 샜다(260806: 계산표·공유버튼·
       AI 코멘터리·절세전략 문구가 차례로 발견). 조기 반환은 «세지 않아도» 안전하다. */
    if (acqBlocked) {
      return (
        <div className="jt-container">
          <JTReportShell title="취득세 계산 결과" subtitle="정밀 계산 필요" stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
            <JTAcqDroppedNotice dropped={acqDropped} />
            <JTFallbackBlocked gaps={acqGaps} onRetry={runAnalysis} reason={acqFallbackGaps(answers, { precise: true }).length > 0 ? 'input' : 'engine'} />
            {/* ★ 260921 (Astra R1-F5): 되돌아갈 길을 준다. 종전엔 「처음부터 다시」뿐이라
                답을 전부 버려야만 빠진 항목을 채울 수 있었다. 다른 답은 그대로 둔다. */}
            <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6 }}>
              {acqOpenQ
                ? <React.Fragment>확인이 필요한 문항: <strong>{acqOpenQ.q}</strong><br />지금까지 답하신 다른 내용은 그대로 남습니다.</React.Fragment>
                : <React.Fragment>입력으로 돌아가 앞선 답(특히 주택 수)을 다시 확인해 주세요. 지금까지 답하신 내용은 그대로 남습니다.</React.Fragment>}
            </p>
            <div className="jt-report-q__nav" style={{ marginTop: 16 }}>
              <button className="jt-btn jt-btn--primary" onClick={() => goToQuestion(acqOpenQ)}>
                {acqOpenQ ? '빠진 질문으로 돌아가기 →' : '입력 수정하러 돌아가기 →'}
              </button>
              <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setPhase('quick'); setStep(0); setAnswers({}); }}>처음부터 다시</button>
            </div>
          </JTReportShell>
        </div>
      );
    }
    return (
      <div className="jt-container">
        <JTReportShell title="취득세 계산 결과" subtitle={calc.precise ? '취득세 정밀 계산' : '취득세 간이 계산'} stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
          <JTAcqDroppedNotice dropped={acqDropped} />
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
              현재 계산은 <strong>일반 토지 본세 4%</strong>(지방교육세를 더해 실효 4.6%) 기준입니다. <strong>농지(전·답·과수원)</strong>는 세율이 달라 별도 항목으로 계산합니다 — 농지라면 「무엇을 취득」 문항에서 <strong>농지</strong>를 고르세요(지방세법 §11①1호·7호).
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
                {/* 260921: 신규 유형에 「생애최초·평형」 안내가 그대로 뜨던 것을 갈랐다
                    (농지·공매 결과에서 실제로 그랬다 — 브라우저 확인) */}
                {acqNewTypeSelected(answers)
                  ? '금액은 검증 엔진이 낸 값입니다. 다만 물건 구분(오피스텔 용도·농지 여부)과 감면 요건은 이 계산기가 판정하지 않으니, 아래 「이 계산에 넣지 않은 것」을 함께 확인하세요.'
                  : answers.acquisitionType === '증여'
                  ? '증여 중과(조정대상지역·시가표준액 3억원 이상이면 12%)는 앞에서 고르신 조정지역 답으로 이미 반영했어요. 다만 시가표준액은 앞의 금액으로 대신 판단했으니, 「더 정확히 계산하기」에서 공시가격(시가표준액)과 1세대 1주택자의 가족 증여 여부를 넣어 확인하세요.'
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
                  {/* 「85㎡ 초과」는 주택에만 해당하는 이유다 — 농지·상가에 붙이면 틀린 설명이 된다(260921) */}
                  {calc.farmTax > 0 && <tr><th>농어촌특별세{answers.propertyType === '주택' ? ' (85㎡ 초과)' : ''}</th><td>{formatWon(calc.farmTax)}</td></tr>}
                  {calc.reductionAmt > 0 && <tr><th>감면 ({calc.reductionType})</th><td>− {formatWon(calc.reductionAmt)}</td></tr>}
                  <tr><th><strong>총 납부세액</strong></th><td><strong>{formatWon(calc.totalTax)}</strong></td></tr>
                </tbody>
              </table>
              {calc.heavyApplied && calc.heavyReason && (
                <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginTop: 12, borderRadius: 8 }}>
                  ⚠️ 중과 적용: {calc.heavyReason}. {ACQ_HEAVY_NOTICE[acqNoticeKey(answers)]}
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

          {/* ★ 260921 신설 — 「이 계산에 넣지 않은 것」. 결과를 읽는 사람이 «무엇이 빠졌는지»를
              숫자 바로 아래에서 알게 한다 (Astra 설계안 블록 4). */}
          <section className="jt-report-result__section">
            <h3>이 계산에 넣지 않은 것</h3>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
              {acqExcludedItems(answers).map((x, i) => <li key={i} style={{ marginBottom: 6 }}>{x}</li>)}
            </ul>
          </section>

          <JTAcqOrdinanceCard region={answers.region} />

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
            calcId="acquisition"
            completeEligible={true}
            precise={calc.precise}
            quick={report.quick}
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
              {/* 노출 조건이 붙은 선택지는 조건을 만족할 때만 보인다 — 정규화와 «같은 함수»를 쓴다 */}
              {acqVisibleOpts(cur, answers).map(([v, label, hint]) => {
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

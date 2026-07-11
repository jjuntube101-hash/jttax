/* @jsx React.createElement */
/* 양도소득세 간이 계산 — 7문항 · JS 결정론 + claude 코멘터리 (v2) */

const { useState: useCgtState } = React;

/* ================================================================
   2025년 양도소득세 기본세율표 (8구간) — 소득세법 §104
   ※ 간이 참고용. 지방소득세 10% 별도. 2025년 귀속분 기준.
   ================================================================ */
const CGT_BRACKETS = [
  [14_000_000, 0.06, 0],
  [50_000_000, 0.15, 1_260_000],
  [88_000_000, 0.24, 5_760_000],
  [150_000_000, 0.35, 15_440_000],
  [300_000_000, 0.38, 19_940_000],
  [500_000_000, 0.40, 25_940_000],
  [1_000_000_000, 0.42, 35_940_000],
  [Infinity, 0.45, 65_940_000],
];

function calcBaseTax(taxBase) {
  if (taxBase <= 0) return 0;
  for (const [limit, rate, deduct] of CGT_BRACKETS) {
    if (taxBase <= limit) return Math.round(taxBase * rate - deduct);
  }
  return 0;
}

// 장기보유특별공제율
// 수정 260627(V2-5): 표2 거주공제는 '거주연수' 기준이어야 한다. 종전 거주율도 years(보유)로 계산해
// 보유>거주인 경우 거주공제 과다(예 보유10·거주2 → 80% 산정, 실제 48%) → 세액 과소. residenceYears 인자 분리.
function calcLtDeductionRate(years, residenceYears, isOwnOccupied, is1House) {
  if (years < 3) return 0;
  // 1세대1주택 실거주(2년 이상): 보유 연4% + 거주 연4%, 합계 최대 80% (소§95② 표2)
  if (is1House && isOwnOccupied) {
    const holdRate = Math.min(Math.floor(years), 10) * 0.04;
    const liveRate = Math.min(Math.floor(residenceYears || 0), 10) * 0.04;
    return Math.min(holdRate + liveRate, 0.80);
  }
  // 일반(3년~15년+): 3년 6%, 이후 연 2%p, 최대 30% (소§95② 표1)
  // 수정 260627: 종전 `floor(years)-2`는 전 구간 +2%p 과다(3년→8%, 11년→24%). 정답은 `-3`(3년→6%, 11년→22%).
  const rate = (Math.min(Math.floor(years), 15) - 3) * 0.02 + 0.06;
  return Math.min(rate, 0.30);
}

const CGT_QS = [
  {
    id: 'assetType',
    section: '어떤 집을 파나요',
    q: '무엇을 파시려고 하나요?',
    sub: '주택은 세대 전체(본인·배우자·같은 세대원)가 가진 집의 수로 골라 주세요. 비과세·중과는 이 채수로 자동 판정됩니다.',
    opts: [
      ['house_1', '주택 — 1채', '세대 전체가 집 1채 (1세대1주택 비과세 가능성)'],
      ['house_2', '주택 — 2채', '세대 전체가 집 2채'],
      ['house_3', '주택 — 3채 이상', '세대 전체가 집 3채 이상'],
      ['presale', '분양권', '아직 다 안 지어진 새 아파트를 분양받을 권리'],
      ['occupancy_orig', '입주권 (원조합원)', '원래 갖고 있던 내 집·땅이 재개발되며 새 아파트 받을 권리로 바뀐 경우'],
      ['occupancy_succ', '입주권 (승계취득)', '그 입주권을 다른 사람에게서 사 온 경우'],
      ['replacement', '대체주택 (재개발 중 거주용)', '내 집이 재개발되는 동안 살려고 산 다른 집을 파는 경우'],
      ['commercial', '상가·업무용 오피스텔·토지 (비주택)', '집이 아닌 부동산 (비과세 없음) · 실제 살던 주거용 오피스텔은 위의 「주택」으로 선택하세요'],
    ],
  },
  {
    id: 'nonHouseType',
    section: '어떤 집을 파나요',
    q: '어떤 비주택인가요?',
    sub: '비주택은 1세대1주택 비과세가 없고 기본세율·표1 장기보유공제가 적용됩니다.',
    showIf: (a) => a.assetType === 'commercial',
    opts: [
      ['building', '상가·사무실·업무용 오피스텔·건물', '기본세율 · 표1 장특(연 2%·최대 30%)'],
      ['land', '토지·나대지', '기본세율 · 비사업용이면 +10%p 중과(별도 확인)'],
    ],
  },
  {
    id: 'landUse',
    section: '어떤 집을 파나요',
    q: '이 토지를 어떻게 사용해 오셨나요?',
    sub: '세법 용어로 판단하지 마시고, 실제 사용한 사실만 골라 주세요. 답을 바탕으로 비사업용 토지 중과(+10%p) 여부를 계산에 반영합니다.',
    showIf: (a) => a.assetType === 'commercial' && a.nonHouseType === 'land',
    opts: [
      ['business', '직접 농사·축산을 지었거나(인근 거주+자경), 사업장·공장 부지로 계속 썼다', '사업용 토지 — 기본세율'],
      ['non_business', '빈 땅(나대지)·별장 부지였거나 · 멀리 살아 직접 농사 안 지음 · 남에게 빌려줌', '비사업용 토지 — 기본세율 +10%p 중과'],
      ['unsure', '잘 모르겠다 / 시기마다 섞여 있다', '정확한 판정을 위해 우선 비사업용(+10%p)으로 보수 계산 · 상담 권장'],
    ],
  },
  // ───────── 취득 시 정보 ─────────
  {
    id: 'acquiredDate',
    section: '취득 시 정보',
    q: '언제 취득했나요? (잔금일 또는 등기접수일)',
    sub: '보유기간·장기보유특별공제·2년 비과세 요건을 정확히 계산합니다. 보통 잔금 치른 날(잔금일)을 입력하세요 — 등기를 더 먼저 했다면 등기접수일을 입력합니다. 숫자 8자리로 입력하면 자동 정리됩니다 (예: 20180315 → 2018-03-15).',
    date: true,
  },
  {
    id: 'acquired',
    section: '취득 시 정보',
    q: '얼마에 취득했나요? (취득가 · 원)',
    sub: '실제 산 가격을 입력하세요. 오래전 상속·증여로 받아 취득가를 모르면 「환산취득가」(양도가에 취득시점 기준시가 비율을 곱해 추정한 취득가, 소법 §97①1호나목)로 갈음할 수 있는데, 이 경우 아래 「필요경비」에 취득세·법무사비 등 실제 경비를 다시 넣지 마세요 — 환산취득가를 쓰면 경비가 개산공제로 갈음되어 별도 차감이 안 됩니다(소법 §97②2호). 환산 계산은 복잡하니 우선 아는 근사치를 넣고 상담으로 확정하세요. 숫자만 입력.',
    numeric: true,
    placeholder: '예: 500,000,000',
  },
  {
    id: 'expenses',
    section: '취득 시 정보',
    q: '필요경비가 있나요? (선택 — 없으면 비워두기)',
    sub: '취득 시 낸 취득세·법무사비·중개수수료와, 자본적지출(샷시·발코니 확장·보일러 교체 등 가치를 높인 공사비)을 합산. 영수증·계약서로 입증 가능한 금액만. 도배·장판·수리비 등 단순 수선비는 제외됩니다.',
    numeric: true,
    optional: true,
    placeholder: '예: 30,000,000 (없으면 0)',
  },
  // ───────── 양도 시 정보 ─────────
  {
    id: 'transferDate',
    section: '양도 시 정보',
    q: '언제 파시나요? (양도일 · 매도 잔금·등기일 · 오늘로 채워둠)',
    sub: '⚠️ 파는 날짜가 세금을 크게 좌우합니다 — 집을 여러 채 가진 분에게 세금을 더 매기는 규정이 2026.5.10부터 다시 적용되어, 같은 2주택도 그 전후로 세금이 크게 달라집니다. 실제 매도 예정일로 바꿔 비교해 보세요. (예: 20260815)',
    date: true,
    optional: true,
    allowFuture: true,
  },
  {
    id: 'sold',
    section: '양도 시 정보',
    q: '얼마에 파시나요? (양도가·예상 매도가 · 원)',
    sub: '아직 안 파셨다면 받고 싶은 예상 가격을 적어도 됩니다. 숫자를 바꿔 가며 세금을 비교해 볼 수 있어요. 숫자만 입력. ⚠️ 부부·가족 공동명의(지분 소유)라도 본인 지분이 아니라 「집 전체 양도가」를 넣으세요 — 12억 비과세·안분 판정은 집 전체 가격 기준입니다(지분 양도는 상담 권장).',
    numeric: true,
    placeholder: '예: 900,000,000',
  },
  // ───────── 거주 정보 ─────────
  {
    id: 'moveInDate',
    section: '거주 정보',
    q: '언제 전입했나요? (실거주 시작일 · 선택)',
    sub: '1세대 1주택 거주기간 공제용. 대체주택은 「1년 이상 거주」가 비과세 필수 요건이라 전입일을 꼭 입력하세요(시행령 §156의2⑤). 전입신고 후 실제 거주를 시작한 날. 거주하지 않았으면 비워두세요.',
    date: true,
    optional: true,
    showIf: (a) => a.assetType === 'house_1' || a.assetType === 'house_2' || a.assetType === 'house_3' || a.assetType === 'replacement',
  },
  // ───────── 주택 상황 ─────────
  {
    id: 'adjustedZone',
    section: '주택 상황',
    q: '양도 대상은 조정대상지역 소재 주택입니까?',
    sub: '조정대상지역은 집값 과열을 막으려 정부가 따로 지정한 지역으로, 여기 집을 여러 채 가진 분이 팔면 세금이 더 무겁습니다. 현재 서울 전역(25개 자치구)과 경기 12곳(과천·광명·성남·수원·안양 동안·용인 수지·의왕·하남 등)이 해당됩니다. (수시 변경되므로 파실 시점에 국토교통부 고시로 확인하세요.) ※ 「예」를 고르면 1세대1주택 비과세에 거주 2년 요건(시행령 §154①)을 보수적으로 적용합니다. 다만 이 요건은 「취득 당시」 조정대상지역이었는지로 결정되며, 취득 당시 비조정지역이었다면(나중에 조정지역으로 지정) 거주요건이 면제되어 비과세될 수 있습니다 — 이 경우 전입일을 입력하시거나 상담으로 확인하세요.',
    showIf: (a) => a.assetType === 'house_1' || a.assetType === 'house_2' || a.assetType === 'house_3',
    opts: [
      ['yes', '네, 조정대상지역입니다', '다주택자 중과세율 적용 대상'],
      ['no', '아니오, 비조정지역입니다', '중과 없음 (기본세율)'],
    ],
  },
  {
    id: 'otherHouseSource',
    section: '주택 상황',
    q: '지금 파는 집 말고, 보유 중인 다른 집은 어떻게 갖게 되었나요?',
    sub: '비과세 특례(일시적 2주택·상속주택)는 세법 용어를 몰라도 사실관계로 자동 판정됩니다. 편하게 사실만 골라 주세요.',
    showIf: (a) => a.assetType === 'house_2',
    opts: [
      ['bought', '직접 매수·분양 등으로 취득', '이사·갈아타기 포함 — 취득일로 일시적 2주택 자동 판정'],
      ['inherited', '상속·증여로 받음', '상속주택 특례 자동 판정'],
    ],
  },
  {
    id: 'newHouseDate',
    section: '주택 상황',
    q: '그 다른 집은 언제 취득했나요? (취득일)',
    sub: '지금 파는 집과 다른 집의 취득 시점만으로 일시적 2주택 비과세 여부를 자동으로 판정합니다. 모르면 비워두세요. (예: 20240601)',
    date: true,
    optional: true,
    showIf: (a) => a.assetType === 'house_2' && a.otherHouseSource === 'bought',
  },
  {
    id: 'inheritanceDate',
    section: '주택 상황',
    q: '다른 집을 언제 상속받았나요? (상속개시일 · 보통 사망일)',
    sub: '상속주택 비과세는 「상속받기 전부터 보유하던 집」을 팔 때만 적용됩니다(소령 §155②: 일반주택=상속개시 당시 보유한 주택). 입력하신 「파는 집 취득일」과 비교해 자동 판정합니다. 모르면 비워두세요. (예: 20200315)',
    date: true,
    optional: true,
    showIf: (a) => a.assetType === 'house_2' && a.otherHouseSource === 'inherited',
  },
  // ───────── 주택+입주권/분양권 동시보유 (§89② 일시적 특례) ─────────
  {
    id: 'houseConcurrentRight',
    section: '함께 보유한 권리',
    q: '이 집을 파는 지금, 조합원입주권이나 분양권을 함께 보유하고 계신가요?',
    sub: '집과 입주권(또는 분양권)을 함께 가진 채 그 집을 팔면, 1세대1주택 비과세가 원칙적으로 막힙니다(소법 §89②). 다만 「일시적으로」 겹친 경우(집 산 지 1년 후에 권리를 얻고, 권리 얻은 날부터 3년 안에 집을 팖)에는 비과세됩니다(시행령 §156의2③·§156의3②). 세법 판단은 마시고 사실만 골라 주세요.',
    showIf: (a) => a.assetType === 'house_1',
    opts: [
      ['none', '아니오 — 입주권·분양권 없음', '일반 1세대1주택 비과세 판정'],
      ['occupancy', '네 — 조합원입주권을 함께 보유', '§89② 적용 — 일시적 요건 자동 판정(시행령 §156의2③)'],
      ['presale', '네 — 분양권을 함께 보유', '§89② 적용 — 일시적 요건 자동 판정(시행령 §156의3②)'],
    ],
  },
  {
    id: 'houseRightAcqDate',
    section: '함께 보유한 권리',
    q: '그 입주권(또는 분양권)을 언제 취득하셨나요?',
    sub: '입주권은 「관리처분계획 인가일」, 분양권은 「분양계약일」을 넣으세요. 지금 파는 집을 산 지 1년이 지난 뒤에 이 권리를 얻었고, 권리 얻은 날부터 3년 안에 집을 팔면 일시적 특례로 비과세됩니다(시행령 §156의2③·§156의3②). 날짜만 넣으면 자동 판정합니다. 모르면 비워두면 보수적으로 과세 계산합니다. (예: 20240601)',
    date: true,
    optional: true,
    showIf: (a) => a.assetType === 'house_1' && (a.houseConcurrentRight === 'occupancy' || a.houseConcurrentRight === 'presale'),
  },
  // ───────── 입주권 상황 (조합원입주권 비과세 사실관계) ─────────
  {
    id: 'ipjuOtherHouse',
    section: '입주권 상황',
    q: '이 입주권 말고, 양도일 현재 보유한 다른 집이나 분양권이 있나요?',
    sub: '조합원입주권 1세대1주택 비과세는 「입주권 하나만」 보유할 때 적용됩니다(소법 §89①4호가목). 세법 판단은 하지 마시고 사실만 골라 주세요.',
    showIf: (a) => a.assetType === 'occupancy_orig',
    opts: [
      ['none', '없음 — 이 입주권 하나만 보유', '1세대1주택 비과세 1차 요건 충족(가목)'],
      ['has', '있음 — 다른 집/분양권을 함께 보유', '나목(1주택 3년내 양도) 비과세 가능 여부 추가 확인'],
    ],
  },
  {
    id: 'ipjuOtherHouseDetail',
    section: '입주권 상황',
    q: '함께 보유한 것은 정확히 어떤가요?',
    sub: '입주권 하나 + 「집 딱 1채」(분양권 없음)이고 그 집을 산 지 3년 안에 입주권을 팔면 비과세될 수 있습니다(소법 §89①4호나목). 사실만 골라 주세요.',
    showIf: (a) => a.assetType === 'occupancy_orig' && a.ipjuOtherHouse === 'has',
    opts: [
      ['one_house', '집 딱 1채만 (분양권 없음)', '나목 비과세 가능 — 그 집 취득일로 3년 판정'],
      ['multi_or_presale', '집 2채 이상 또는 분양권 보유', '나목 대상 아님 — 과세'],
    ],
  },
  {
    id: 'ipjuOtherHouseDate',
    section: '입주권 상황',
    q: '그 다른 집은 언제 취득했나요? (취득일)',
    sub: '그 집을 산 날부터 3년 이내에 입주권을 팔면 비과세입니다(소법 §89①4호나목). 취득일만 넣으면 3년 요건을 자동 판정합니다. (예: 20240601)',
    date: true,
    showIf: (a) => a.assetType === 'occupancy_orig' && a.ipjuOtherHouse === 'has' && a.ipjuOtherHouseDetail === 'one_house',
  },
  {
    id: 'ipjuFormerHouse',
    section: '입주권 상황',
    q: '재개발·재건축 전 원래 그 집에서, 2년 이상 보유(조정대상지역이었다면 2년 이상 거주)하셨나요?',
    sub: '원조합원 입주권 비과세는 「재개발 전 원래 집」이 1세대1주택 비과세 요건(2년 보유, 조정지역은 2년 거주)을 갖췄어야 합니다(소법 §89①4호·시행령 §154①). 사실만 골라 주세요.',
    showIf: (a) => a.assetType === 'occupancy_orig',
    opts: [
      ['yes', '네, 충족합니다', '비과세 요건 충족'],
      ['no', '아니오, 못 채웠습니다', '비과세 불가 (과세)'],
      ['unsure', '잘 모르겠어요', '보수적으로 과세 계산 · 상담 권장'],
    ],
  },
  {
    id: 'ipjuMgmtDate',
    section: '입주권 상황',
    q: '관리처분계획 인가일이 언제인가요? (선택 — 모르면 비워두기)',
    sub: '입주권의 장기보유특별공제는 「취득일~관리처분계획 인가일」까지만 인정됩니다(소법 §95②·시행령 §166⑤). ⚠️ 사업시행계획 인가일·착공일과는 다른 날짜입니다 — 반드시 「관리처분계획 인가(고시) 통지서」의 인가일(또는 관리처분계획서상 인가일/고시일)을 넣으세요. 인가일을 넣으면 더 정확히 계산합니다. 모르면 비워두세요. (예: 20200315)',
    date: true,
    optional: true,
    showIf: (a) => a.assetType === 'occupancy_orig',
  },
  {
    id: 'ipjuRightsValue',
    section: '입주권 상황',
    q: '권리가액이 얼마인가요? (선택 — 관리처분계획서상 「종전자산 평가액」)',
    sub: '입주권 장기보유특별공제는 「인가 전 차익」(권리가액−취득가)에만 적용됩니다(소법 §95②·시행령 §166①). 관리처분계획서·조합 통지서의 종전자산(기존 집·땅) 평가액을 넣으면 장특을 정확히 계산합니다. 모르면 비워두세요(보수적으로 계산). 청산금이 컸다면 상담을 권합니다. (예: 320,000,000)',
    numeric: true,
    optional: true,
    placeholder: '예: 320,000,000 (모르면 비움)',
    showIf: (a) => a.assetType === 'occupancy_orig' && !!a.ipjuMgmtDate,
  },
  // ───────── 대체주택 상황 (시행령 §156의2⑤) ─────────
  {
    id: 'replApprovalDate',
    section: '대체주택 상황',
    q: '재개발·재건축의 사업시행계획 인가일이 언제인가요?',
    sub: '대체주택 비과세는 「사업시행계획 인가일 이후」에 대체주택을 사야 적용됩니다(시행령 §156의2⑤1호). 내 원래 집이 들어간 재개발의 사업시행인가일을 넣어 주세요. 모르면 조합·구청 정비사업 공고(고시문)로 확인할 수 있고, 비워두면 나머지 사실로 판정 후 상담으로 확정해 드립니다. (관리처분인가일과 다릅니다 · 예: 20220115)',
    date: true,
    showIf: (a) => a.assetType === 'replacement',
  },
  {
    id: 'replCompletionDate',
    section: '대체주택 상황',
    q: '재개발 신축주택의 완공일이 언제인가요? (선택 — 아직 미완공이면 비워두기)',
    sub: '대체주택은 신축주택 「완공 전 또는 완공 후 3년 이내」에 팔아야 비과세됩니다(시행령 §156의2⑤3호). 완공일을 넣으면 기한을 자동 판정합니다. 아직 안 지어졌으면 비워두세요. (예: 20251201)',
    date: true,
    optional: true,
    showIf: (a) => a.assetType === 'replacement',
  },
  {
    id: 'context',
    section: '추가 정보',
    q: '추가로 공유하고 싶은 맥락이 있으면 적어주세요.',
    sub: '선택 사항 · 200자 이내. 취득 경위·이사·재개발 등',
    freeform: true,
  },
];

function formatWon(n) {
  if (!n || isNaN(n)) return '0원';
  const eok = Math.floor(n / 100_000_000);
  const man = Math.floor((n % 100_000_000) / 10_000);
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만원`;
  if (eok > 0) return `${eok}억원`;
  if (man > 0) return `${man.toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}

/* 상담 요청 시 담당 세무사에게 전달할 상세 — 고객 입력 전체 + 계산 결과 + 자동 분석 */
function buildReportDetail(answers, calc, commentary) {
  const L = [];
  L.push('■ 고객 입력 정보');
  CGT_QS.forEach(q => {
    const v = answers[q.id];
    if (v === undefined || v === null || v === '') return;
    let val = v;
    if (q.opts) { const o = q.opts.find(x => x[0] === v); if (o) val = o[1]; }
    else if (q.numeric) val = formatWon(Number(v));
    const qlabel = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('  · ' + qlabel + ': ' + val);
  });
  L.push('');
  L.push('■ 계산 결과' + (calc.precise ? ' (검증 엔진 정밀계산)' : ' (간이 추정)'));
  L.push('  · 양도차익: ' + formatWon(calc.capGain));
  if (calc.nonTaxableMsg) L.push('  · 비과세 판정: ' + calc.nonTaxableMsg);
  L.push('  · 과세대상(비과세 반영 후): ' + formatWon(calc.taxableAfter1House));
  L.push('  · 장기보유특별공제: ' + formatWon(calc.ltDeduction) + ' (' + Math.round((calc.ltRate || 0) * 100) + '%)');
  L.push('  · 과세표준: ' + formatWon(calc.taxBase));
  L.push('  · 산출세액: ' + formatWon(calc.baseTax));
  L.push('  · 지방소득세: ' + formatWon(calc.localTax));
  L.push('  · 총 세부담: ' + formatWon(calc.totalTax) + ' (실효세율 ' + (calc.effectiveRate || 0).toFixed(1) + '%)');
  const notes = [calc.shortTermNote, calc.multiHouseNote, calc.ipjuCaveat, calc.concurrentRightCaveat, calc.landCaveat, calc.replCaveat, calc.acqZoneCaveat, calc.deadlineWarn].filter(Boolean);
  const ew = calc.engineWarnings || [];
  if (notes.length || ew.length) {
    L.push('');
    L.push('■ 특이사항·경고');
    notes.forEach(n => L.push('  · ' + n));
    ew.forEach(w => L.push('  · [엔진경고] ' + w));
  }
  if (calc.timingTip || calc.orderTip) {
    L.push('');
    L.push('■ 절세 가능성');
    if (calc.timingTip) L.push('  · 양도시점: ' + calc.timingTip);
    if (calc.orderTip) L.push('  · 처분순서: ' + calc.orderTip);
  }
  L.push('');
  L.push('■ 자동 분석');
  if (commentary.headline) L.push('  요약: ' + commentary.headline);
  (commentary.cautions || []).forEach(c => L.push('  · [주의] ' + c.title + ': ' + c.detail));
  (commentary.saving_ideas || []).forEach(s => L.push('  · [절세] ' + s.title + ': ' + s.detail));
  const fu = commentary.followup || [];
  if (fu.length) { L.push('  추가 확인 필요 자료:'); fu.forEach(f => L.push('    - ' + f)); }
  return L.join('\n');
}

/* 카톡 전송용 간결 요약 — 고객 입력 + 추정 결과 (채팅창에 붙여넣기 좋게) */
function buildKakaoSummary(answers, calc) {
  const L = ['[JT택스랩 양도세 계산 — 상담 요청]', '', '▶ 입력'];
  CGT_QS.forEach(q => {
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
  if (calc.nonTaxableMsg) L.push('· ' + calc.nonTaxableMsg);
  L.push('· 총 세부담: ' + formatWon(calc.totalTax) + ' (과세표준 ' + formatWon(calc.taxBase) + ')');
  L.push('', '상담 부탁드립니다.');
  return L.join('\n');
}

/* ────────────────────────────────────────────────────────────────
   단계별계산 표시 단위 보정.
   엔진의 CalcStep.amount는 항목에 따라 원·년·%·채·세대로 의미가 다른데
   (예: '보유기간' amount=12 는 12년, '장특공제율' amount=80 은 80%,
    '다주택 중과' amount=20 은 +20%p), 단위 필드가 없어 모두 원으로
   찍히면 "12원" 처럼 오해를 부른다. 항목명으로 단위를 판별해 표시한다.
   ※ 금액(원)이 대다수이므로 비(非)금액 항목만 분기하고 기본은 원.
   ──────────────────────────────────────────────────────────────── */
function formatStepValue(name, amount) {
  if (typeof amount !== 'number') return amount;
  const label = String(name || '').replace(/^Step\s*[\dA-Za-z-]+\.\s*/, '');
  if (/기간/.test(label)) return `${amount}년`;              // 보유기간·거주기간·단기세율 보유기간
  // 실제 값이 %인 항목은 '장특공제율'류만. '단기양도세율·분양권세율·세율(기본)'은 amount가 산출세액(원)이므로 % 금지.
  if (/공제율|장특.*율/.test(label)) return `${amount}%`;       // 장특공제율(보유+거주율 합계)만 %
  // 그 외 '세율'·'세액' 등 amount가 원 단위인 항목은 금액으로 (아래 기본 formatWon 처리)
  if (/비교|vs/i.test(label)) return '—';  // 수정 260628(CGT-R2-02): '중과 vs 단기 비교' 마커 행(금액 0, 근거는 비고) — '0원' 오해 방지
  if (/미해당|미적용/.test(label) && amount === 0) return '해당 없음';  // '중과 미해당'(0) 등은 %p보다 먼저
  if (/중과(?!가산)/.test(label) && amount !== 0) return `+${amount}%p`;  // 다주택·비사업용 토지 중과(가산율, %p). '중과가산'(금액)·'중과 미해당'(0) 제외
  if (/주택수|임대주택/.test(label)) return `${amount}채`;   // 주택수·임대주택 제외(잔여 주택수)
  if (/세대\s*판정/.test(label)) return `${amount}세대`;     // 양도세 '세대 판정'(주택수)만 — '세대생략 할증'(상속, 금액) 오매칭 방지
  return formatWon(amount);                                   // 그 외 = 금액(원)
}

/* ================================================================
   JT택스랩 정밀 엔진 연결 (FastAPI /v1/calc/transfer)
   - 위 calcBaseTax 등은 '간이 추정' 폴백. 엔진 연결 성공 시 검증된 정밀세액으로 교체.
   - ENGINE_BASE: 운영 시 index.html에서 window.JT_ENGINE_BASE 지정. 기본=로컬 개발.
   ================================================================ */
const ENGINE_BASE = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';

// 실제 존재하는 날짜인지 검증 (2018-99-99, 2018-02-30 등 차단)
function isValidISODate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// 두 날짜(YYYY-MM-DD) 사이 연수(만연수 + 잔여비율). 빈 값은 오늘로 대체. 음수 방지.
// 수정 260628(LT-R2-02): 엔진 _years_between과 동일한 달력 만연수 기반. 종전 일수/365.25 근사는
// 정확히 N주년 양도에서 N 미달(3주년→2.998)로 floor가 1 작아져 장특·비과세·단기 경계가 어긋났음.
function yearsBetween(fromStr, toStr) {
  const today = isoDate(new Date());
  const a = new Date((fromStr || today) + 'T00:00:00');
  const b = new Date((toStr || today) + 'T00:00:00');
  if (isNaN(a) || isNaN(b) || b <= a) return 0;
  let y = b.getFullYear() - a.getFullYear();
  const anniv = new Date(a); anniv.setFullYear(a.getFullYear() + y);
  if (anniv > b) { y -= 1; anniv.setFullYear(a.getFullYear() + y); }   // 응당일 미도달 → 만연수 -1
  const next = new Date(a); next.setFullYear(a.getFullYear() + y + 1);
  const frac = next > anniv ? (b - anniv) / (next - anniv) : 0;        // 잔여 비율(표시·시나리오용 소수)
  return Math.max(y + frac, 0);
}

// 7문항 답변 → transfer_tax 요청 본문 (물건속성·시나리오 매핑)
function mapAnswersToTransfer(answers) {
  const assetType = answers.assetType;
  const housingMap = { house_1: 1, house_2: 2, house_3: 3 };
  const isOccupancy = assetType === 'occupancy_orig' || assetType === 'occupancy_succ';
  const propertyType = assetType === 'presale' ? '분양권'
                     : isOccupancy ? '입주권'
                     : assetType === 'commercial'
                       ? (answers.nonHouseType === 'land' ? '토지' : '상가')  // 업무용 오피스텔=상가(주거용 아님)
                     : '주택';  // house_1/2/3 · replacement(대체주택) → 주택
  const housingCount = housingMap[assetType] || 1;
  const today = isoDate(new Date());
  const acqDate = answers.acquiredDate || today;            // 취득일(필수)
  const transferDate = answers.transferDate || today;       // 양도일(미입력=오늘)
  // assetType 전환 시 잔존(stale)한 다른 경로 답변이 엔진에 잘못 전달되지 않도록 적용 자산유형 가드
  const isHouseType = assetType === 'house_1' || assetType === 'house_2' || assetType === 'house_3';
  const usesMoveIn = isHouseType || assetType === 'replacement';  // 거주: 주택·대체주택만 (입주권·분양권·비주택 무관)
  const body = {
    transfer_price: Number(answers.sold) || 0,
    acquisition_price: Number(answers.acquired) || 0,
    property_type: propertyType,
    transfer_date: transferDate,
    acquisition_date: acqDate,
    housing_count: housingCount,
    // 조정대상지역 중과는 주택만(§104⑦) — 비주택·입주권·분양권에 stale 'yes'가 새지 않도록 주택 한정
    is_regulated_area: isHouseType && answers.adjustedZone === 'yes',
    // 취득 당시 조정지역이면 1세대1주택 비과세에 거주 2년 추가요건(§154①). 보수적으로 현재 조정=취득당시 조정으로 간주
    // (현재 조정인데 취득당시 비조정이면 거주요건 과다적용될 수 있으나, 미적용 시 비과세 과대평가보다 안전)
    regulated_at_acquisition: isHouseType && answers.adjustedZone === 'yes',
    expenses_total: Number(answers.expenses) || 0,
    acquired_from_member: assetType === 'occupancy_succ',  // 승계취득 입주권 → 장특공제 배제(§95②)
  };
  // 토지: 사용현황 사실 → 비사업용 토지 +10%p 중과(§104①8호). '모름'은 보수적으로 비사업용 처리.
  if (propertyType === '토지') {
    body.is_non_business_land = answers.landUse === 'non_business' || answers.landUse === 'unsure';
  }
  // 입주권: 고객 자기분류 대신 사실(인가일·다른집/분양권 보유·기존주택 보유거주)로 엔진이 비과세 자동 판정
  if (isOccupancy) {
    body.is_original_member = assetType === 'occupancy_orig';
    if (answers.ipjuMgmtDate) body.management_approval_date = answers.ipjuMgmtDate;  // 장특 인가전 보유기간(§95②·§166⑤1호)
    if (answers.ipjuRightsValue) body.rights_value = Number(answers.ipjuRightsValue) || 0;  // 장특 인가전차익 정밀안분(§166①)
    if (answers.ipjuOtherHouse) {
      // 양도일 현재 입주권 외 다른 집·분양권 미보유 = 가목 비과세 1차요건(§89①4호가목)
      body.no_other_house_or_presale_at_transfer = answers.ipjuOtherHouse === 'none';
      // 나목(§89①4호나목): 입주권 외 1주택(분양권0) + 그 집 취득 3년내 입주권 양도 → 비과세
      if (answers.ipjuOtherHouse === 'has' && answers.ipjuOtherHouseDetail === 'one_house' && answers.ipjuOtherHouseDate) {
        body.one_house_acquisition_date = answers.ipjuOtherHouseDate;
        body.no_presale_right_at_transfer = true;  // 집 1채만(분양권 없음) 선택 = 분양권 미보유
      }
    }
    // 원조합원만 1세대1주택 비과세 가능(승계취득은 세대정의 미충족 → 엔진이 자동 차단)
    if (assetType === 'occupancy_orig' && answers.ipjuFormerHouse) {
      body.former_house_exemption_qualified = answers.ipjuFormerHouse === 'yes';
    }
  }
  // 대체주택(§156의2⑤): 재개발 중 거주용 대체주택 양도. 사실(인가일·취득일·거주·완공일)로 엔진 자동 판정
  if (assetType === 'replacement') {
    body.exemption_special_type = 'replacement_house';
    if (answers.replApprovalDate) body.project_approval_date = answers.replApprovalDate;  // 사업시행인가일(§156의2⑤1호)
    if (answers.replCompletionDate) body.completion_date = answers.replCompletionDate;     // 신축완공일(§156의2⑤3호)
  }
  // 전입일(표2 거주공제용): 주택·대체주택만 전송(입주권·분양권·비주택은 거주 무관 — stale 차단).
  // 취득일 이후·양도일 이하로 클램프(전입은 취득 후, 거주는 양도 전).
  if (usesMoveIn && answers.moveInDate) {
    let mid = answers.moveInDate;
    if (mid < acqDate) mid = acqDate;
    if (mid > transferDate) mid = transferDate;
    body.move_in_date = mid;
  }
  // 2주택: 고객 자기분류 대신 사실(다른 집 취득경위·취득일·상속개시일)로 엔진이 특례 자동 판정
  if (assetType === 'house_2') {
    if (answers.otherHouseSource === 'inherited') {
      // 상속주택 특례(§155②)는 일반주택(파는 집)을 상속개시 당시 보유한 경우만 → 취득일 ≤ 상속개시일
      if (answers.inheritanceDate && acqDate <= answers.inheritanceDate) {
        body.inherited_house_count = 1;
        body.inheritance_start_date = answers.inheritanceDate;
      }
    } else if (answers.otherHouseSource === 'bought' && answers.newHouseDate) {
      // 다른 집 취득일만 주면 엔진이 일시적 2주택 요건(1년경과·3년이내·2년보유) 자동 검사
      body.exemption_special_type = 'temporary_2house';
      body.new_house_acquisition_date = answers.newHouseDate;
    }
  }
  // 주택(1채) 양도 + 입주권/분양권 동시보유 §89② 일시적 특례 (시령§156의2③·§156의3②)
  // 집과 권리를 함께 가진 채 그 집 양도 → 비과세 배제(과세). 단 일시적(1년경과·3년이내)이면 엔진이 비과세 자동 판정.
  if (assetType === 'house_1' && answers.houseConcurrentRight && answers.houseConcurrentRight !== 'none') {
    body.held_right_type = answers.houseConcurrentRight === 'occupancy' ? '입주권' : '분양권';
    if (answers.houseRightAcqDate) body.right_acquisition_date = answers.houseRightAcqDate;  // 일시적 1·3년 기산
  }
  return body;
}

async function callTransferEngine(answers) {
  return callEngineBody(mapAnswersToTransfer(answers));
}

async function callEngineBody(body) {
  const res = await fetch(ENGINE_BASE + '/v1/calc/transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const _err = new Error('engine ' + res.status); _err.status = res.status; throw _err; }
  return res.json();
}

/* ================================================================
   "이 집 지금 팔지 말지" — 양도 시점 최적화
   입력 사실(취득일)에서 세금이 떨어지는 미래 양도일을 자동 산출해
   각 시점 세액을 엔진으로 계산·비교 (입력 추가 없음).
   ================================================================ */
function addYears(d, y) { const n = new Date(d); n.setFullYear(n.getFullYear() + y); return n; }
// 로컬(KST) 기준 YYYY-MM-DD. 수정 260627: toISOString()은 UTC라 KST 새벽 -1일 → 시점최적화 2주년 후보일이 하루 당겨져 비과세/세율 경계가 어긋남(V3-1).
function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

function buildScenarioDates(answers) {
  if (!answers.acquiredDate) return [];
  const acq = new Date(answers.acquiredDate + 'T00:00:00');
  const today = new Date((answers.transferDate || isoDate(new Date())) + 'T00:00:00');
  if (isNaN(acq) || isNaN(today)) return [];
  const is1House = answers.assetType === 'house_1';
  const heldYears = Math.max((today - acq) / (365.25 * 24 * 3600 * 1000), 0);
  const horizon = 5.5 * 365.25 * 24 * 3600 * 1000;  // 5년 이내 미래만
  const cand = [];
  const push = (d, label) => { if (d > today && (d - today) < horizon) cand.push({ date: isoDate(d), label }); };
  push(addYears(acq, 1), '보유 1년 — 단기세율 종료');
  push(addYears(acq, 2), is1House ? '보유 2년 — 1세대1주택 비과세 요건' : '보유 2년 — 일반세율 적용');
  const nextY = Math.floor(heldYears) + 1;
  push(addYears(acq, nextY), `보유 ${nextY}년 — 장기보유공제 증가`);
  push(addYears(acq, nextY + 1), `보유 ${nextY + 1}년 — 장기보유공제 증가`);
  const seen = new Set(); const out = [];
  for (const c of cand) { if (!seen.has(c.date)) { seen.add(c.date); out.push(c); } }
  return out.slice(0, 4);
}

async function computeScenarios(answers) {
  const base = mapAnswersToTransfer(answers);
  const todayStr = answers.transferDate || isoDate(new Date());
  const plan = [{ date: todayStr, label: '지금 양도', now: true }, ...buildScenarioDates(answers)];
  const results = await Promise.all(plan.map(async (p) => {
    try {
      const ej = await callEngineBody({ ...base, transfer_date: p.date });
      const c = ej && ej.calc;
      if (!c || c['총세부담'] == null) return null;
      return { date: p.date, label: p.label, now: !!p.now, tax: c['총세부담'], exempt: c['비과세여부'] };
    } catch (e) { return null; }
  }));
  return results.filter(Boolean);
}

function JTReportCGT({ setRoute, onBack }) {
  const [step, setStep] = useCgtState(0);
  // 양도일은 세액을 크게 좌우(2026.5.10 다주택 중과 복원 전후) → 오늘 날짜로 미리 채워 명시
  const [answers, setAnswers] = useCgtState(() => ({ transferDate: isoDate(new Date()) }));
  const [loading, setLoading] = useCgtState(false);
  const [report, setReport] = useCgtState(null);
  const [err, setErr] = useCgtState(null);

  // 조건부 질문(showIf) 반영: 현재 답변에 따라 보이는 질문만 추림 (예: 일시적2주택은 2주택만)
  const visibleQs = CGT_QS.filter(q => !q.showIf || q.showIf(answers));
  const total = visibleQs.length;
  const safeStep = Math.min(step, total - 1);
  const cur = visibleQs[safeStep];
  const isLast = safeStep === total - 1;

  const setAns = (id, v) => setAnswers(a => ({ ...a, [id]: v }));

  const canNext = () => {
    if (cur.freeform) return true;
    if (cur.numeric) {
      if (cur.optional) return true;             // 선택 항목(필요경비)은 0/공란 허용
      const v = Number(answers[cur.id]);
      return !isNaN(v) && v > 0;
    }
    if (cur.date) {
      const v = answers[cur.id] || '';
      const valid = isValidISODate(v);                  // 실제 존재하는 YYYY-MM-DD
      if (cur.optional) return v === '' || valid;       // 선택: 비우거나 유효한 날짜
      if (!valid) return false;                         // 필수: 유효한 날짜
      const today = isoDate(new Date());
      return cur.allowFuture ? true : v <= today;       // 취득일은 미래 불허
    }
    return !!answers[cur.id];
  };

  const runAnalysis = async () => {
    setLoading(true);
    setErr(null);
    try {
      // P1-1(코덱스): 취득일이 양도일보다 뒤일 수 없음(동일일 허용) — 엔진 422 전에 안내
      if (answers.acquiredDate && answers.transferDate && answers.acquiredDate > answers.transferDate) {
        setErr('취득일(' + answers.acquiredDate + ')이 양도일(' + answers.transferDate + ')보다 뒤일 수 없습니다. 날짜를 다시 확인해 주세요.');
        setLoading(false);
        return;
      }
      const acquired = Number(answers.acquired) || 0;
      const sold = Number(answers.sold) || 0;
      const expenses = Number(answers.expenses) || 0;
      const capGain = Math.max(sold - acquired - expenses, 0);  // 양도차익 = 양도가 − 취득가 − 필요경비
      // 보유·거주연수 = 실제 날짜로 정확 계산 (엔진과 동일 기준)
      const years = yearsBetween(answers.acquiredDate, answers.transferDate);
      const residenceYears = answers.moveInDate ? yearsBetween(answers.moveInDate, answers.transferDate) : 0;
      const assetType = answers.assetType;
      const isOwnOccupied = residenceYears >= 2;             // 실거주 2년 이상
      const is1House = assetType === 'house_1';
      const is2House = assetType === 'house_2';
      const is3House = assetType === 'house_3';
      const isHouse = is1House || is2House || is3House;
      const isPresale = assetType === 'presale';
      const isCommercial = assetType === 'commercial';
      const isAdjusted = answers.adjustedZone === 'yes';
      // 비주택은 엔진이 기본세율·표1 장특·단기(50/40)로 계산(비과세 없음). 토지는 사용현황 사실로 비사업용 중과 반영.
      const isLand = isCommercial && answers.nonHouseType === 'land';
      let landCaveat = null;
      if (isLand) {
        if (answers.landUse === 'non_business') {
          landCaveat = '비사업용 토지로 보아 기본세율에 10%p를 더한 중과세율로 계산했습니다(소법 §104①8호). 장기보유특별공제(표1)는 그대로 적용됩니다. 재촌·자경·보유기간 요건(§104의3)에 따라 결과가 달라질 수 있어 상담으로 확정하시길 권합니다.';
        } else if (answers.landUse === 'unsure') {
          landCaveat = '사업용/비사업용 판단이 불확실하여, 세금이 더 많은 비사업용(기본세율 +10%p)으로 보수적으로 계산했습니다(소법 §104①8호). 실제 사용 사실(재촌·자경·보유기간)에 따라 사업용이면 세금이 줄어들 수 있으니 상담으로 확인하세요.';
        } else {
          landCaveat = '사업용 토지(기본세율)로 계산했습니다. 다만 인근 거주·직접 경작(재촌·자경)이나 보유기간 요건(§104의3)을 충족하지 못하면 비사업용으로 보아 10%p가 더 중과될 수 있습니다(소법 §104①8호).';
        }
      }

      // 주택(1채)+입주권/분양권 동시보유 §89② 일시적 특례 안내
      const hasConcurrentRight = assetType === 'house_1'
        && (answers.houseConcurrentRight === 'occupancy' || answers.houseConcurrentRight === 'presale');
      let concurrentRightCaveat = null;
      if (hasConcurrentRight && !answers.houseRightAcqDate) {
        const rk = answers.houseConcurrentRight === 'occupancy' ? '조합원입주권' : '분양권';
        const art = answers.houseConcurrentRight === 'occupancy' ? '시행령 §156의2③' : '시행령 §156의3②';
        concurrentRightCaveat = `집과 ${rk}을(를) 함께 보유한 채 이 집을 팔면 1세대1주택 비과세가 원칙적으로 배제됩니다(소법 §89②). ${rk} 취득일(입주권=관리처분계획 인가일·분양권=분양계약일)을 입력하시면 일시적 특례(${art}: 집 산 지 1년 후 권리 취득 + 권리 취득 3년 내 집 양도) 비과세 여부를 자동 판정합니다.`;
      }

      // 입주권: 비과세 판정 사실관계에 따른 안내(엔진 판정 보조 설명)
      const isOccupancy = assetType === 'occupancy_orig' || assetType === 'occupancy_succ';
      let ipjuCaveat = null;
      if (isOccupancy) {
        if (assetType === 'occupancy_succ') {
          ipjuCaveat = '승계취득(조합원에게서 산) 입주권은 1세대1주택 비과세 대상이 아닙니다(소법 §89①4호 — 관리처분인가일 현재 기존주택을 보유한 원조합원 세대만 해당). 장기보유특별공제도 배제되어(§95②) 과세 기준으로 계산했습니다.';
        } else { // occupancy_orig 원조합원
          if (answers.ipjuOtherHouse === 'has') {
            if (answers.ipjuOtherHouseDetail === 'multi_or_presale') {
              ipjuCaveat = '입주권 외에 집 2채 이상 또는 분양권을 보유하셔서 1세대1주택 비과세(가목·나목 모두)가 적용되지 않습니다(소법 §89①4호) — 과세로 계산했습니다.';
            } else if (answers.ipjuOtherHouseDetail === 'one_house' && answers.ipjuOtherHouseDate) {
              // 「3년 이내」 = 취득일+3년 당일까지 포함 (엔진과 동일 날짜 직접비교 — 만연수 부동소수 불일치 방지)
              const od = answers.ipjuOtherHouseDate;            // YYYY-MM-DD
              const tdStr = answers.transferDate || isoDate(new Date());
              const [oy, om, odd] = od.split('-').map(Number);
              let deadline = `${oy + 3}-${String(om).padStart(2, '0')}-${String(odd).padStart(2, '0')}`;
              if (om === 2 && odd === 29) {  // 2/29 취득 → 3년 후 비윤년이면 3/1로 보정
                const ny = oy + 3, leap = (ny % 4 === 0 && ny % 100 !== 0) || ny % 400 === 0;
                if (!leap) deadline = `${ny}-03-01`;
              }
              if (tdStr > deadline) {  // ISO 문자열 비교 = 날짜 비교
                ipjuCaveat = `다른 집을 취득한 날부터 3년(${deadline})이 지나 양도하셔서 「3년 이내 입주권 양도」(나목) 요건을 넘겨 과세로 계산했습니다(소법 §89①4호나목). 다만 3년 내 양도가 어려운 부득이한 사유(경매·공매·수용·현금청산 소송 등)에 해당하면 비과세가 가능하니 상담으로 확인하세요.`;
              }
              // 3년 이내면 엔진이 나목 비과세 적용 → nonTaxableMsg가 표시되므로 별도 caveat 불필요
            } else {
              ipjuCaveat = '다른 집의 보유 내역(집 채수·취득일)을 입력하시면 나목(1주택 3년내 양도) 비과세 여부를 자동 판정합니다.';
            }
          } else if (answers.ipjuFormerHouse === 'unsure') {
            ipjuCaveat = '재개발 전 원래 집의 비과세 요건(2년 보유·조정지역이면 2년 거주) 충족 여부가 불확실하여, 우선 과세 기준으로 계산했습니다. 요건을 갖췄다면 비과세가 될 수 있으니 상담으로 확인하세요.';
          } else if (answers.ipjuFormerHouse === 'no') {
            ipjuCaveat = '재개발 전 원래 집이 비과세 요건(2년 보유·조정지역이면 2년 거주)을 못 채워 과세로 계산했습니다(소법 §89①4호).';
          }
          if (!answers.ipjuMgmtDate) {
            ipjuCaveat = (ipjuCaveat ? ipjuCaveat + ' ' : '')
              + '관리처분계획 인가일을 입력하시면 장기보유특별공제(취득일~인가일 기준)를 더 정확히 계산합니다(소법 §95②·시행령 §166⑤).';
          }
        }
      }

      // 대체주택(§156의2⑤): 비과세 시 사후요건 추징 안내, 미충족 시 사유 안내
      let replCaveat = null;
      if (assetType === 'replacement') {
        if (!answers.moveInDate) {
          // 거주개시일 미입력 → 엔진이 '거주 1년 미만'으로 비과세 탈락 → 침묵 탈락 방지 안내
          replCaveat = '⚠️ 대체주택에 「전입(거주 시작)일」을 입력하지 않으면 「1년 이상 거주」 요건(시행령 §156의2⑤1호)을 못 채운 것으로 보아 비과세가 적용되지 않습니다. 실제 1년 이상 거주하셨다면 전입일을 꼭 입력하세요.';
        } else {
          replCaveat = '대체주택 비과세(시행령 §156의2⑤)는 ①사업시행인가일 이후 취득+1년 이상 거주 ②신축 완공 후 3년 내 세대전원 이사+1년 거주 ③신축 완공 전 또는 완공 후 3년 내 양도를 모두 갖춰야 합니다. ②는 양도 이후의 사후 요건으로, 충족하지 못하면 비과세가 취소되어 세금이 추징됩니다(§156의2⑬). 정확한 적용은 상담으로 확인하세요.';
        }
      }

      // 1세대1주택 비과세 (12억 이하)
      // 수정 260628(V2R2-01): 조정지역 취득 1주택은 거주 2년 요건 필요(시령§154①). 폴백이 거주 미검사로
      // 과세 대상을 0원(완전비과세)으로 표시하던 과소 버그 차단. residenceOk 미충족 시 taxable=capGain(과세) 유지.
      let nonTaxableMsg = null;
      let taxable = capGain;
      const residenceOk = answers.adjustedZone !== 'yes' || residenceYears >= 2;
      if (is1House && sold <= 1_200_000_000 && years >= 2 && residenceOk && !hasConcurrentRight) {
        nonTaxableMsg = '1세대 1주택 · 양도가 12억 이하 · 2년 이상 보유 요건을 모두 충족하시면 원칙적으로 비과세 대상입니다.';
        taxable = 0;
      } else if (is1House && sold > 1_200_000_000 && years >= 2 && residenceOk && !hasConcurrentRight) {
        // 12억 초과분만 과세
        const taxableRatio = (sold - 1_200_000_000) / sold;
        taxable = Math.round(capGain * taxableRatio);
        nonTaxableMsg = '1세대 1주택이지만 양도가 12억 초과분에 대해서만 과세됩니다 (안분 계산).';
      } else if (is1House && years >= 2 && !residenceOk && !hasConcurrentRight) {
        // 조정지역 취득 1주택 거주 2년 미충족 → 비과세 배제(전액 과세). 취득 당시 비조정이면 비과세 가능(상담).
        nonTaxableMsg = '조정대상지역 취득 1주택의 2년 거주 요건 미충족으로 과세로 계산했습니다. 취득 당시 비조정지역이었다면 비과세가 될 수 있어 상담 확인을 권합니다.';
      }

      // 장기보유특별공제 + 단기/중과 (소득세법 §95②·§104·§104⑦)
      // 수정 260627(V2-2): 다주택 중과는 2026.5.10 양도부터 복원 → 양도일 게이트 추가(종전: 무조건 가산해 5.9 이전에도 과다).
      //                    중과 적용 시 장특공제 배제(엔진 동일)하도록 ltRate=0 후 과세표준 재산정.
      const basicDeduction = 2_500_000;
      const heavyRestored = (answers.transferDate || isoDate(new Date())) >= '2026-05-10';
      const isHeavyCgt = isHouse && isAdjusted && (is2House || is3House) && heavyRestored;
      let ltRate = calcLtDeductionRate(years, residenceYears, isOwnOccupied, is1House);
      if (isHeavyCgt) ltRate = 0;  // 다주택 중과 → 장특 배제
      const ltDeduction = Math.round(taxable * ltRate);
      const afterLt = Math.max(taxable - ltDeduction, 0);
      const taxBase = Math.max(Math.floor((afterLt - basicDeduction) / 1000) * 1000, 0);  // 천원미만 절사(엔진 truncate_base 정합, 소§92)

      let baseTax;
      let shortTermNote = null;
      if (isPresale) {
        // 분양권: 1년 미만 70%, 1년 이상 60%
        const rate = years < 1 ? 0.70 : 0.60;
        baseTax = Math.round(taxBase * rate);
        shortTermNote = `분양권·입주권 양도 · ${(rate * 100).toFixed(0)}% 단일세율이 적용됩니다.`;
      } else if (years < 1) {
        // 수정 260628(R2-01·소§104⑦ 후단): 조정 다주택 단기는 단기세액과 중과세액 중 큰 값(max).
        const shortTax = Math.round(taxBase * 0.70);
        if (isHeavyCgt) {
          const surcharge = is3House ? 0.30 : 0.20;
          baseTax = Math.max(shortTax, calcBaseTax(taxBase) + Math.round(taxBase * surcharge));
          shortTermNote = `보유 1년 미만 + 조정 다주택 — 단기 70%와 중과(+${(surcharge * 100).toFixed(0)}%p) 중 큰 세액(소§104⑦ 후단·장특 배제, 간이 추정).`;
        } else {
          baseTax = shortTax;
          shortTermNote = '보유 1년 미만 단기양도 · 70% 중과세율이 적용됩니다.';
        }
      } else if (years < 2 && isHouse) {
        const shortTax = Math.round(taxBase * 0.60);
        if (isHeavyCgt) {
          const surcharge = is3House ? 0.30 : 0.20;
          baseTax = Math.max(shortTax, calcBaseTax(taxBase) + Math.round(taxBase * surcharge));
          shortTermNote = `주택 1~2년 + 조정 다주택 — 단기 60%와 중과(+${(surcharge * 100).toFixed(0)}%p) 중 큰 세액(소§104⑦ 후단·장특 배제, 간이 추정).`;
        } else {
          baseTax = shortTax;
          shortTermNote = '주택 단기양도(1~2년) · 60% 중과세율이 적용됩니다.';
        }
      } else if (isHeavyCgt) {
        // 다주택자 + 조정대상지역 중과(2026.5.10 복원): 기본세율 + 20%p(2주택)/+30%p(3주택+)·장특 배제
        const surcharge = is3House ? 0.30 : 0.20;
        baseTax = calcBaseTax(taxBase) + Math.round(taxBase * surcharge);
        shortTermNote = `조정대상지역 ${is3House ? '3주택 이상' : '2주택'} 다주택 중과(+${(surcharge * 100).toFixed(0)}%p)·장기보유공제 배제가 2026.5.10 양도부터 복원 적용됩니다. (간이 추정 — 정밀 결과는 엔진 연결 시)`;
      } else if (isHouse && isAdjusted && (is2House || is3House) && !heavyRestored) {
        // 2026.5.9 이전 양도: 다주택 중과 유예 → 기본세율(장특 유지)
        baseTax = calcBaseTax(taxBase);
        shortTermNote = '조정대상지역 다주택이나 2026.5.9 이전 양도는 중과 유예로 기본세율이 적용됩니다(2026.5.10부터 +20/30%p 복원).';
      } else if (isLand && (answers.landUse === 'non_business' || answers.landUse === 'unsure')) {
        // 수정 260628(CGT-R2-LAND-01): 비사업용 토지 +10%p 중과(소§104①8호). 폴백 누락으로 ~5천만 과소·landCaveat 모순.
        baseTax = calcBaseTax(taxBase) + Math.round(taxBase * 0.10);
      } else {
        baseTax = calcBaseTax(taxBase);
      }

      // 지방소득세 10%
      const localTax = Math.round(baseTax * 0.10);
      const totalTax = baseTax + localTax;

      // 다주택자는 1세대1주택 비과세 대상이 아님 — 화면에서 명확히 안내(오해 방지)
      const multiHouseNote = (is2House || is3House)
        ? `${is3House ? '3주택 이상' : '2주택'} 다주택자는 1세대 1주택 비과세 대상이 아니며, 양도차익 전액이 과세됩니다.`
        : null;

      const calc = {
        capGain,
        expenses,
        nonTaxableMsg,
        multiHouseNote,
        taxableAfter1House: taxable,
        ltRate,
        ltDeduction,
        afterLt,
        basicDeduction,
        taxBase,
        baseTax,
        localTax,
        totalTax,
        shortTermNote,
        landCaveat,
        ipjuCaveat,
        replCaveat,
        concurrentRightCaveat,
        acquiredDate: answers.acquiredDate || '',
        transferDate: answers.transferDate || isoDate(new Date()),
        holdYears: years,
        residenceYears,
        effectiveRate: capGain > 0 ? (totalTax / capGain * 100) : 0,
      };

      // ── JT택스랩 정밀 엔진으로 교체 (연결 성공 시 검증된 세액·법조문) ──
      try {
        const ej = await callTransferEngine(answers);
        const c = ej && ej.calc;
        if (c) {
          calc.capGain = c['양도차익'];
          calc.taxBase = c['과세표준'];
          calc.ltDeduction = c['장기보유특별공제'];
          const ltsd = c['장특공제율'];
          if (ltsd) {
            // 엔진 장특공제율로 동기화: '16.0%'→0.16, '-'(미적용·중과배제)→0. 비과세 시 폴백 잔존 라벨(12%·0원) 제거(R2-01).
            const pct = parseFloat(String(ltsd['합계']).replace('%', ''));
            calc.ltRate = isNaN(pct) ? 0 : pct / 100;
          }
          calc.basicDeduction = c['기본공제'];
          calc.baseTax = c['세액'];
          calc.localTax = c['지방소득세'];
          calc.totalTax = c['총세부담'];
          // 계산내역 중간값을 엔진값으로 역산해 정합 (간이단계 값과 엔진 혼용 방지)
          calc.afterLt = (c['과세표준'] || 0) + (c['기본공제'] || 0);                // 공제 후 금액 = 과세표준 + 기본공제
          calc.taxableAfter1House = calc.afterLt + (c['장기보유특별공제'] || 0);       // 과세대상 = 공제후 + 장특
          calc.effectiveRate = calc.capGain > 0 ? (calc.totalTax / calc.capGain * 100) : 0;
          // 비과세 메시지는 엔진 판정을 정본으로: 비과세면 갱신, 아니면 간이단계 메시지 제거(모순 방지)
          // ⚠️ 비과세여부=True이나 세액>0이면 고가(12억 초과) 안분 과세 — "비과세"만 표시하면 세액과 모순되어 오해
          if (c['비과세여부'] && (c['총세부담'] || 0) > 0) {
            calc.nonTaxableMsg = (c['비과세사유'] || '1세대 1주택 비과세')
              + ' — 양도가 12억 초과분에 대해서만 과세됩니다(안분 계산). 아래 「총 세액」은 그 과세분입니다. (정밀 엔진 판정)';
          } else if (c['비과세여부']) {
            calc.nonTaxableMsg = (c['비과세사유'] || '1세대 1주택 비과세') + ' — 전액 비과세 (정밀 엔진 판정)';
          } else {
            calc.nonTaxableMsg = null;
          }
          // 대체주택 replCaveat: 엔진이 과세 판정 시 '사후요건 추징' 안내는 모순 → 과세 사유 안내로 교체
          if (assetType === 'replacement' && !c['비과세여부']) {
            calc.replCaveat = '대체주택 비과세 요건(시행령 §156의2⑤: 사업시행인가일 이후 취득·1년 이상 거주·신축 완공 전 또는 완공 후 3년 내 양도)을 충족하지 못해 과세로 계산했습니다. 정확한 적용은 상담으로 확인하세요.';
          }
          // V1-1(260627·사용자 승인=경고 강화): regulated_at_acquisition을 '현재 조정'으로 보수 간주(L440)하므로,
          // 취득 당시 비조정→이후 조정지정된 1주택자가 거주요건 미충족으로 과세 표시될 수 있다. 엔진 비과세 경고는
          // '비조정 가정' 시에만 나와 과세 사용자는 못 보므로(적대검증 V1-1), 과세된 1주택(12억이하·2년보유·현재조정)에
          // '취득당시 비조정이면 비과세 가능' 안내를 프론트가 상시 노출한다.
          if (is1House && answers.adjustedZone === 'yes' && !c['비과세여부'] && years >= 2) {
            // 수정 260628(V1-NEW-01): 12억 가격 게이트 제거 — §154① 거주요건 면제는 가격 무관. 고가는 안분 효과 명시.
            calc.acqZoneCaveat = sold <= 1_200_000_000
              ? '입력하신 「현재 조정대상지역」을 「취득 당시에도 조정」으로 보아 거주 2년 요건을 적용해 과세로 계산했습니다. 만약 취득 당시에는 비조정지역이었다면(이후 조정대상지역으로 지정) 거주요건이 면제되어 1세대 1주택 비과세가 될 수 있습니다(시행령 §154①). 취득 당시 조정대상지역 지정 여부를 상담으로 확인하세요.'
              : '입력하신 「현재 조정대상지역」을 「취득 당시에도 조정」으로 보아 거주 2년 요건을 적용해 전액 과세로 계산했습니다. 취득 당시 비조정지역이었다면(이후 조정 지정) 거주요건이 면제되어 12억 초과분만 과세되는 1세대1주택 안분 비과세가 적용될 수 있습니다(시행령 §154①·§160). 취득 당시 조정대상지역 지정 여부를 상담으로 확인하세요.';
          }
          // 특례로 비과세된 2주택은 "다주택 비과세 대상 아님" 안내가 모순 → 제거
          if (c['비과세여부']) calc.multiHouseNote = null;
          // 2주택 사실기반 자동판정 결과 안내 — 과세 시 "왜 비과세가 안 됐는지" 설명
          else if (is2House) {
            if (answers.otherHouseSource === 'bought' && answers.newHouseDate) {
              calc.multiHouseNote = '입력하신 취득일 기준, 일시적 2주택 비과세 요건(① 종전 집 취득 1년 후 새 집 취득 ② 새 집 취득 3년 내 종전 집 양도 ③ 종전 집 2년 이상 보유)을 충족하지 못해 과세됩니다.';
            } else if (answers.otherHouseSource === 'inherited') {
              if (!answers.inheritanceDate) {
                calc.multiHouseNote = '상속받은 날(상속개시일)을 입력하면 상속주택 비과세 여부를 자동 판정합니다. 미입력 시 일반 2주택으로 과세됩니다.';
              } else if ((answers.acquiredDate || '') > answers.inheritanceDate) {
                calc.multiHouseNote = `지금 파는 집을 상속개시일(${answers.inheritanceDate}) 이후에 취득하여, 상속주택 비과세(소령 §155② — 일반주택을 상속개시 당시 보유) 대상이 아닙니다. 일반 2주택으로 과세됩니다.`;
              } else {
                calc.multiHouseNote = '상속주택 비과세 요건(일반주택 2년 이상 보유 등)을 충족하지 못해 과세됩니다. 정확한 판정은 상담으로 확인해 드립니다.';
              }
            }
          }
          calc.precise = true;
          calc.steps = c['단계별계산'] || [];
          calc.engineWarnings = c['경고사항'] || [];  // 엔진 실질 경고(입주권 장특 인가전 한정·청산금 근사·승계취득 비과세 배제 등)
          calc.engineVer = ej.version && ej.version.engine;
        }
      } catch (engErr) {
        console.warn('정밀 엔진 연결 실패 — 간이 추정치 유지:', engErr);
      }

      // ── "이 집 지금 팔지 말지" — 양도 시점 최적화 (분양권 제외: 단일세율이라 시점 효과 적음) ──
      // 양도시점 최적화 제외: 분양권(60/70 단일세율)·입주권(장특 인가전 한정·승계배제로 시점효과 미미)
      if (calc.precise && assetType !== 'presale' && !isOccupancy) {
        try {
          const scns = await computeScenarios(answers);
          if (scns.length > 1) {
            const now = scns.find(s => s.now) || scns[0];
            const best = scns.reduce((a, b) => (b.tax < a.tax ? b : a), now);
            // 표에는 "지금 + 절세되는 미래"만 노출 (세금이 늘어나는 미래는 비교가 아니라 혼란 → 제외)
            calc.scenarios = scns.filter(s => s.now || s.tax < now.tax);
            if (!best.now && best.tax < now.tax) {
              const saving = now.tax - best.tax;
              const months = Math.max(1, Math.round((new Date(best.date) - new Date(now.date)) / (30.44 * 24 * 3600 * 1000)));
              calc.timingTip = { saving, months, date: best.date, label: best.label, exempt: best.exempt };
            }
            // 지금 비과세인데 미래에 과세로 바뀌면(일시적2주택 3년 기한 등) "비과세 기한 경고"
            if (now.tax === 0 && scns.some(s => !s.now && s.tax > 0)
                && is2House && answers.otherHouseSource === 'bought' && answers.newHouseDate) {
              const deadline = addYears(new Date(answers.newHouseDate + 'T00:00:00'), 3);
              const todayD = new Date((answers.transferDate || isoDate(new Date())) + 'T00:00:00');
              if (deadline > todayD) {
                const after = new Date(deadline); after.setDate(after.getDate() + 1);
                const ejD = await callEngineBody({ ...mapAnswersToTransfer(answers), transfer_date: isoDate(after) });
                const cD = ejD && ejD.calc;
                if (cD && cD['총세부담'] > 0) calc.deadlineWarn = { date: isoDate(deadline), missedTax: cD['총세부담'] };
              }
            }
          }
        } catch (e) { /* 시나리오 실패해도 본 결과는 유지 */ }
      }

      // ── 처분 순서 전략 — 다주택(2·3주택)이 과세될 때: 다른 집 먼저 정리 후 이 집을 1주택 비과세로 ──
      // (보유기간 재기산은 2022.5.10 폐지 → 1주택이 되면 당초 보유기간으로 즉시 1세대1주택 판정)
      if (calc.precise && (is2House || is3House) && calc.totalTax > 0) {
        try {
          const oneBody = { ...mapAnswersToTransfer(answers), housing_count: 1 };
          delete oneBody.exemption_special_type; delete oneBody.new_house_acquisition_date;
          delete oneBody.inherited_house_count; delete oneBody.inheritance_start_date;
          const ejO = await callEngineBody(oneBody);
          const cO = ejO && ejO.calc;
          if (cO && cO['총세부담'] != null && cO['총세부담'] < calc.totalTax) {
            calc.orderTip = { tax: cO['총세부담'], saving: calc.totalTax - cO['총세부담'], exempt: cO['비과세여부'] };
          }
        } catch (e) { /* 무시 */ }
      }

      // claude 코멘터리
      const context = `
사용자 응답:
- 자산 유형: ${CGT_QS[0].opts.find(o => o[0] === assetType)?.[1]}
- 취득가: ${formatWon(acquired)}
- 양도가: ${formatWon(sold)}
- 양도차익: ${formatWon(capGain)}
- 취득일: ${answers.acquiredDate || '미입력'} / 양도일: ${answers.transferDate || '오늘'}
- 보유기간: 약 ${years.toFixed(1)}년${(isHouse || assetType === 'replacement') && answers.moveInDate ? ` / 거주 약 ${residenceYears.toFixed(1)}년(전입 ${answers.moveInDate})` : ' / 거주정보 없음'}
- 조정대상지역: ${isHouse ? (answers.adjustedZone || '미응답') : '해당없음(비주택)'}
- 추가 맥락: ${answers.context || '(없음)'}

계산 결과:
- 과세표준: ${formatWon(calc.taxBase)}
- 산출세액: ${formatWon(calc.baseTax)}
- 지방소득세: ${formatWon(calc.localTax)}
- 총 세액: ${formatWon(calc.totalTax)}
- 실효세율: ${calc.effectiveRate.toFixed(1)}%
${nonTaxableMsg ? '- 특이사항: ' + nonTaxableMsg : ''}
${shortTermNote ? '- 특이사항: ' + shortTermNote : ''}
`;

      const prompt = `당신은 한국 세법에 능통한 국세청 출신 세무사입니다. 아래 양도소득세 간이 계산 결과에 대해 납세자가 반드시 알아야 할 주의 포인트와 절세 여지를 JSON으로만 응답하세요. 단정적 결론은 피하고 "검토 필요", "가능성" 같은 표현을 사용하세요.

${context}

다음 JSON 스키마로만 응답:
{
  "headline": "한 문장 요약",
  "cautions": [
    {"title": "주의 포인트 제목", "detail": "2~3문장 설명"}
  ],
  "saving_ideas": [
    {"title": "절세 아이디어 제목", "detail": "2~3문장 설명"}
  ],
  "followup": ["추가로 확인할 자료·사실 1", "2", "3"]
}

cautions 3개, saving_ideas 2~3개.`;

      // 코멘터리는 실패해도 calc(정밀 엔진 결과)를 유지하도록 별도 try/catch
      let commentary;
      try {
        if (!(window.claude && window.claude.complete)) throw new Error('claude 미가용');
        const txt = await window.claude.complete(prompt);
        const match = txt.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('JSON 추출 실패');
        commentary = JSON.parse(match[0]);
      } catch (cErr) {
        console.warn('코멘터리 생성 실패 — 기본 코멘터리 사용:', cErr);
        commentary = (calc.totalTax === 0) ? {
          // 비과세(또는 차익 없음) — 낼 세금 없음. "절세"가 아니라 "비과세 유지"가 핵심
          headline: '계산상 낼 양도소득세가 없습니다(비과세 또는 차익 없음). 비과세 요건을 끝까지 유지하는 것이 핵심입니다.',
          cautions: [
            { title: '비과세 요건 유지', detail: '양도일까지 보유·거주 요건과 1세대 구성, 양도 기한(일시적 2주택 3년 등)을 그대로 충족해야 비과세가 유지됩니다.' },
            { title: '입증 자료 준비', detail: '주민등록초본·실거래 내역 등 보유·거주·세대를 입증할 자료를 미리 갖춰 두세요.' },
            { title: '다른 주택·12억 초과', detail: '세대 내 다른 주택이 있거나 양도가가 12억을 넘으면 결과가 달라질 수 있어 사실관계 확인이 필요합니다.' },
          ],
          saving_ideas: [],
          followup: ['보유·거주·세대 입증 자료(주민등록초본 등)', '비과세 양도 기한(일시적 2주택 등)', '세대 내 다른 보유주택 여부'],
        } : {
          headline: calc.precise
            ? '검증된 세무 엔진으로 계산한 정밀 결과입니다. 위 「절세 전략」(양도 시점·처분 순서)을 함께 검토하세요.'
            : '간이 계산 결과입니다. 정밀 분석은 담당 세무사 상담으로 이어받겠습니다.',
          cautions: [
            { title: '정확한 취득일·양도일', detail: '보유기간을 실제 취득일·양도일로 입력하면 장기보유특별공제·중과 판정이 더 정확해집니다.' },
            { title: '다주택 중과·시점', detail: '다주택 중과는 양도 시점(2026.5.10 복원)에 따라 크게 달라집니다. 위 절세 전략을 확인하세요.' },
            { title: '세대·주택수', detail: '세대 구성과 보유 주택수에 따라 중과·비과세 결과가 달라질 수 있어 별도 검토가 필요합니다.' },
          ],
          saving_ideas: [
            { title: '양도 시점·처분 순서', detail: '위 「절세 전략」처럼 양도일을 조정하거나 처분 순서를 바꾸면 세부담이 크게 줄 수 있습니다.' },
            { title: '취득가액·필요경비 입증', detail: '취득세·중개비·자본적지출 등 입증 자료를 갖추면 과세표준을 줄일 수 있습니다.' },
          ],
          followup: ['정확한 취득일·양도일', '필요경비 영수증', '세대 구성·다른 보유주택'],
        };
      }
      setReport({ calc, commentary });
    } catch (e) {
      console.error(e);
      // Claude API 실패 시 계산 결과만 가지고 기본 코멘터리를 구성해 폴백
      try {
        const acquired2 = Number(answers.acquired) || 0;
        const sold2 = Number(answers.sold) || 0;
        const expenses2 = Number(answers.expenses) || 0;
        const capGain2 = Math.max(sold2 - acquired2 - expenses2, 0);
        const years2 = yearsBetween(answers.acquiredDate, answers.transferDate);
        const assetType2 = answers.assetType;
        const isOwnOccupied2 = (answers.moveInDate ? yearsBetween(answers.moveInDate, answers.transferDate) : 0) >= 2;
        const is1House2 = assetType2 === 'house_1';
        const isAdjusted2 = answers.adjustedZone === 'yes';
        // §89② 가드: 주택+입주권/분양권 동시보유는 1세대1주택 비과세 배제(1차 폴백과 동일 — 과다비과세 방지)
        const hasConcurrentRight2 = is1House2
          && (answers.houseConcurrentRight === 'occupancy' || answers.houseConcurrentRight === 'presale');

        // 기본 계산만 재실행 (runAnalysis 본문의 로직 요약)
        const residenceYears2 = answers.moveInDate ? yearsBetween(answers.moveInDate, answers.transferDate) : 0;
        const residenceOk2 = answers.adjustedZone !== 'yes' || residenceYears2 >= 2;  // 수정 260628(V2R2-01): 조정 거주 2년 요건
        let taxable2 = capGain2;
        let nonTaxableMsg2 = null;
        if (is1House2 && sold2 <= 1_200_000_000 && years2 >= 2 && residenceOk2 && !hasConcurrentRight2) {
          nonTaxableMsg2 = '1세대 1주택 · 양도가 12억 이하 · 2년 이상 보유 요건 충족 시 원칙적 비과세.';
          taxable2 = 0;
        } else if (is1House2 && sold2 > 1_200_000_000 && years2 >= 2 && residenceOk2 && !hasConcurrentRight2) {
          taxable2 = Math.round(capGain2 * ((sold2 - 1_200_000_000) / sold2));
          nonTaxableMsg2 = '12억 초과분 안분 과세.';
        } else if (is1House2 && years2 >= 2 && !residenceOk2 && !hasConcurrentRight2) {
          // 수정 260628(C-CARRY-01): 2차 폴백에도 조정 1주택 거주미충족 안내(간이 calc와 문구 통일).
          nonTaxableMsg2 = '조정대상지역 취득 1주택의 2년 거주 요건 미충족으로 과세로 계산했습니다. 취득 당시 비조정지역이었다면 비과세가 될 수 있어 상담 확인을 권합니다.';
        } else if (hasConcurrentRight2) {
          nonTaxableMsg2 = '주택과 입주권·분양권을 함께 보유한 상태에서 그 주택을 양도하면 1세대1주택 비과세가 배제됩니다(소법 §89②). 일시적 보유 등 정밀 판정은 상담으로 확인하세요.';
        }
        // 수정 260627(V2-3): 2차폴백도 단기(70/60)·분양권·다주택중과(2026.5.10+) 분기 반영 (종전 calcBaseTax만 → 단기/중과 과소).
        const isPresale2 = assetType2 === 'presale';
        const isHouse2x = is1House2 || assetType2 === 'house_2' || assetType2 === 'house_3';
        const is2or3House2 = assetType2 === 'house_2' || assetType2 === 'house_3';
        const heavy2 = isHouse2x && isAdjusted2 && is2or3House2 && (answers.transferDate || isoDate(new Date())) >= '2026-05-10';
        let ltRate2 = calcLtDeductionRate(years2, residenceYears2, isOwnOccupied2, is1House2);
        if (heavy2) ltRate2 = 0;  // 중과 → 장특 배제
        const afterLt2 = Math.max(taxable2 - Math.round(taxable2 * ltRate2), 0);
        const taxBase2 = Math.max(Math.floor((afterLt2 - 2_500_000) / 1000) * 1000, 0);  // 천원미만 절사(엔진 정합)
        let baseTax2;
        // 수정 260628(R2-01·소§104⑦ 후단): 조정 다주택 단기는 단기와 중과 중 큰 세액(max).
        const surcharge2 = assetType2 === 'house_3' ? 0.30 : 0.20;
        const heavyTax2 = () => calcBaseTax(taxBase2) + Math.round(taxBase2 * surcharge2);
        if (isPresale2) baseTax2 = Math.round(taxBase2 * (years2 < 1 ? 0.70 : 0.60));
        else if (years2 < 1) baseTax2 = heavy2 ? Math.max(Math.round(taxBase2 * 0.70), heavyTax2()) : Math.round(taxBase2 * 0.70);
        else if (years2 < 2 && isHouse2x) baseTax2 = heavy2 ? Math.max(Math.round(taxBase2 * 0.60), heavyTax2()) : Math.round(taxBase2 * 0.60);
        else if (heavy2) baseTax2 = heavyTax2();
        else if (assetType2 === 'commercial' && answers.nonHouseType === 'land' && (answers.landUse === 'non_business' || answers.landUse === 'unsure')) baseTax2 = calcBaseTax(taxBase2) + Math.round(taxBase2 * 0.10);  // 비사업용 토지 +10%p(CGT-R2-LAND-01)
        else baseTax2 = calcBaseTax(taxBase2);
        const totalTax2 = Math.round(baseTax2 * 1.10);

        const multiHouseNote2 = (assetType2 === 'house_2' || assetType2 === 'house_3')
          ? `${assetType2 === 'house_3' ? '3주택 이상' : '2주택'} 다주택자는 1세대 1주택 비과세 대상이 아니며, 양도차익 전액이 과세됩니다.`
          : null;
        const fallback = {
          calc: {
            capGain: capGain2, expenses: expenses2, nonTaxableMsg: nonTaxableMsg2, multiHouseNote: multiHouseNote2, taxableAfter1House: taxable2,
            ltRate: ltRate2, ltDeduction: Math.round(taxable2 * ltRate2), afterLt: afterLt2,
            basicDeduction: 2_500_000, taxBase: taxBase2, baseTax: baseTax2,
            localTax: Math.round(baseTax2 * 0.10), totalTax: totalTax2, shortTermNote: null,
            effectiveRate: capGain2 > 0 ? (totalTax2 / capGain2 * 100) : 0,
          },
          commentary: {
            headline: '간이 계산 결과입니다. 정밀 분석은 담당 세무사 상담으로 이어받겠습니다.',
            cautions: [
              { title: '간이 추정치입니다', detail: '본 계산은 주요 변수만 반영한 참고치로, 실제 세액은 취득시기·감면·특례·조정지역 지정일 등에 따라 크게 달라질 수 있습니다.' },
              { title: '보유·거주 요건 재확인', detail: '1세대 1주택 비과세와 장기보유특별공제는 "세대" 판정과 "거주" 증빙이 핵심입니다. 주민등록·실거래·임대차 기록을 갖춰 검토해야 합니다.' },
              { title: '조정지역·중과 유예 확인', detail: '다주택자 중과세는 지정일·해제일·한시 유예 정책에 따라 적용 여부가 갈립니다. 양도 시점 기준 법령 확인이 필요합니다.' },
            ],
            saving_ideas: [
              { title: '양도 시점 조정', detail: '보유·거주 요건 충족 시점이나 과세 구간 경계에 근접한 경우, 양도 시점을 조정해 세액이 수천만원 단위로 바뀔 수 있습니다.' },
              { title: '필요경비 누락 점검', detail: '취득세·중개수수료·자본적 지출(리모델링·증축)은 필요경비로 차감 가능합니다. 영수증과 계약서 확보가 관건입니다.' },
            ],
            followup: ['취득 당시 매매계약서 및 취득세 영수증', '거주기간을 입증할 주민등록초본·관리비 내역', '필요경비 증빙(리모델링·중개수수료 등)'],
          },
        };
        setReport(fallback);
      } catch (ee) {
        setErr(e.message || '분석 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => { isLast ? runAnalysis() : setStep(s => s + 1); };
  const goPrev = () => { step === 0 ? onBack() : setStep(s => s - 1); };

  // ===== 결과 =====
  if (report && report.notSupported) {
    return (
      <div className="jt-container jt-report-loading">
        <h2>{report.title}</h2>
        <p style={{maxWidth: 580, margin: '12px auto', lineHeight: 1.7, opacity: 0.85}}>{report.message}</p>
        <div style={{marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center'}}>
          <button className="jt-btn jt-btn--primary" onClick={() => { window.jtTrackCta && window.jtTrackCta('booking', 'report_cgt_result'); setRoute && setRoute('booking'); }}>상담 예약 <span className="jt-arrow">→</span></button>
          <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setStep(0); setAnswers({ transferDate: isoDate(new Date()) }); }}>다시 계산</button>
        </div>
      </div>
    );
  }

  if (report) {
    const { calc, commentary } = report;
    return (
      <div className="jt-container jt-report-result">
        <div className="jt-report-result__head">
          <button className="jt-report-shell__back" onClick={onBack}>← JT 리포트 허브</button>
          <div className="jt-report-result__meta">
            <span className="jt-tag">{calc.precise ? '정밀계산' : '간이추정'}</span>
            <span>양도소득세 간이 계산 · {new Date().toLocaleDateString('ko-KR')}</span>
          </div>
        </div>

        <div className="jt-report-result__grade jt-grade-mid">
          <div className="jt-report-result__grade-label">
            {calc.precise ? '총 세액 · 정밀 계산 (JT택스랩 엔진)' : '추정 총 세액 · 간이 추정치'}
          </div>
          <div className="jt-report-result__grade-val">{formatWon(calc.totalTax)}</div>
          <p style={{fontSize: 13, opacity: 0.75, marginTop: 8, marginBottom: 12, letterSpacing: '0.02em'}}>
            {calc.precise
              ? `※ 검증된 세무 엔진(${calc.engineVer || 'jt-tax-engine'})으로 계산 — 입력한 취득일·양도일·전입일로 보유기간·거주기간·2년 비과세 요건·장기보유특별공제·중과·비과세를 정밀 반영하고 단계별 법조문 근거를 제공합니다.`
              : '⚠️ 정밀 계산 엔진에 일시적으로 연결하지 못해 간이 추정치를 표시합니다 — 실제 세액과 다를 수 있으니 참고용으로만 보시고, 잠시 후 다시 시도하거나 상담으로 정확히 확인하세요. (단기·중과·감면·특례·조정지역 지정일 등은 미세 반영)'}
          </p>
          {calc.acquiredDate && (
            <p style={{fontSize: 13, opacity: 0.85, marginTop: 4, marginBottom: 10}}>
              📅 취득 {calc.acquiredDate} ~ 양도 {calc.transferDate} · 보유 {calc.holdYears.toFixed(1)}년
              {calc.residenceYears > 0 ? ` · 거주 ${calc.residenceYears.toFixed(1)}년` : ''}
            </p>
          )}
          <p>{commentary.headline}</p>
          {calc.nonTaxableMsg && <p style={{marginTop: 12, fontWeight: 500}}>{calc.nonTaxableMsg}</p>}
          {(answers.assetType === 'house_1' || answers.assetType === 'house_2') && !answers.moveInDate && calc.totalTax > 0 && (
            <p style={{marginTop: 12, fontWeight: 500, color: '#b8860b'}}>⚠️ 「전입(거주 시작)일」을 입력하지 않아 <strong>거주기간이 0년</strong>으로 계산됐습니다. 실제로 그 집에 사셨다면 전입일을 입력해 보세요 — 조정대상지역 1세대1주택(또는 일시적 2주택)의 <strong>거주 2년 비과세 요건</strong>이나 <strong>장기보유특별공제의 거주공제(보유+거주 최대 80%)</strong>가 적용돼 세금이 크게 줄 수 있습니다.</p>
          )}
          {calc.multiHouseNote && <p style={{marginTop: 12, fontWeight: 500}}>{calc.multiHouseNote}</p>}
          {calc.shortTermNote && <p style={{marginTop: 12, fontWeight: 500}}>{calc.shortTermNote}</p>}
          {calc.landCaveat && <p style={{marginTop: 12, fontWeight: 500}}>{calc.landCaveat}</p>}
          {calc.ipjuCaveat && <p style={{marginTop: 12, fontWeight: 500}}>{calc.ipjuCaveat}</p>}
          {calc.concurrentRightCaveat && <p style={{marginTop: 12, fontWeight: 500}}>{calc.concurrentRightCaveat}</p>}
          {calc.replCaveat && <p style={{marginTop: 12, fontWeight: 500}}>{calc.replCaveat}</p>}
          {calc.acqZoneCaveat && <p style={{marginTop: 12, fontWeight: 500, color: 'var(--color-text-warning, #854F0B)'}}>⚠️ {calc.acqZoneCaveat}</p>}
          {Array.isArray(calc.engineWarnings) && calc.engineWarnings
            .filter(w => w && ![calc.ipjuCaveat, calc.concurrentRightCaveat, calc.replCaveat, calc.landCaveat, calc.multiHouseNote, calc.shortTermNote]
              .some(c => c && (c.includes(w) || w.includes(c))))
            .map((w, i) => (
              <p key={`ew${i}`} style={{marginTop: 12, fontWeight: 500, color: 'var(--color-text-warning, #854F0B)'}}>⚠️ {w}</p>
            ))}
          {calc.deadlineWarn && (
            <p style={{marginTop: 12, fontWeight: 500, color: 'var(--color-text-warning, #854F0B)'}}>
              ⚠️ 일시적 2주택 비과세는 기한이 있습니다 — 새 집 취득 후 3년이 되는 <strong>{calc.deadlineWarn.date}까지</strong> 양도해야 비과세가 유지됩니다. 이 날을 넘기면 약 {formatWon(calc.deadlineWarn.missedTax)}이 부과됩니다.
            </p>
          )}
        </div>

        {(((calc.scenarios && calc.scenarios.length > 1)) || calc.orderTip) && (
          <section className="jt-report-result__section">
            <h3>이 집, 어떻게 팔면 세금이 줄까요? · 절세 전략</h3>
            {calc.orderTip && (
              <div style={{background: 'var(--color-background-success, #E1F5EE)', border: '1px solid #1D9E75', borderRadius: 8, padding: '12px 14px', marginBottom: 12}}>
                <strong>💡 처분 순서 — 다른 집을 먼저 정리해 이 집을 마지막(1주택)에 팔면: {formatWon(calc.orderTip.tax)}{calc.orderTip.exempt ? ' (비과세)' : ''}</strong>
                <span> — 지금({formatWon(calc.totalTax)})보다 이 집 세금이 약 {formatWon(calc.orderTip.saving)} 줄어듭니다.</span>
                <span style={{display: 'block', fontSize: 12, opacity: 0.75, marginTop: 6}}>※ 먼저 파는 다른 집은 그 집대로 과세되니 두 집을 합산해 비교하세요. 보유기간 재기산은 2022.5.10 폐지(당초 취득일 기산)라 1주택이 되면 즉시 비과세 판정됩니다.</span>
              </div>
            )}
            {calc.timingTip ? (
              <div style={{background: 'var(--color-background-success, #E1F5EE)', border: '1px solid #1D9E75', borderRadius: 8, padding: '12px 14px', marginBottom: 12}}>
                <strong>💡 양도 시점 — {calc.timingTip.label.split(' — ')[0]} 시점({calc.timingTip.date})에 팔면 약 {formatWon(calc.timingTip.saving)} 절세</strong>
                <span> — 지금보다 약 {calc.timingTip.months}개월 뒤{calc.timingTip.exempt ? ' (비과세 요건 충족)' : ''}.</span>
              </div>
            ) : (!calc.orderTip && calc.scenarios && calc.scenarios.length > 1 && (
              <p style={{marginBottom: 12, fontWeight: 500}}>지금 양도가 세금상 가장 유리하거나 비슷합니다. (아래 비교)</p>
            ))}
            {calc.scenarios && calc.scenarios.length > 1 && (
            <table className="jt-report-calc">
              <tbody>
                {calc.scenarios.map((s, i) => (
                  <tr key={i} style={s.tax === Math.min(...calc.scenarios.map(x => x.tax)) ? {fontWeight: 500} : null}>
                    <th>{s.now ? '지금 양도' : s.label}<span style={{display: 'block', fontSize: 12, opacity: 0.6, fontWeight: 400}}>{s.date}{s.exempt ? ' · 비과세' : ''}</span></th>
                    <td>{formatWon(s.tax)}{!s.now && s.tax < (calc.scenarios.find(x => x.now)?.tax ?? s.tax) ? <span style={{display: 'block', fontSize: 12, color: '#0F6E56'}}>− {formatWon((calc.scenarios.find(x => x.now)?.tax ?? s.tax) - s.tax)}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
            <p style={{fontSize: 12, opacity: 0.7, marginTop: 8}}>※ 세금만 비교한 결과입니다. 시세 변동·자금 사정·보유 비용은 별도로 고려하세요. 정확한 전략은 상담에서.</p>
          </section>
        )}

        <section className="jt-report-result__section">
          <h3>계산 내역</h3>
          <table className="jt-report-calc">
            <tbody>
              {calc.expenses > 0 && (
                <tr><th>필요경비 (취득세·중개비·자본적지출 등)</th><td>− {formatWon(calc.expenses)}</td></tr>
              )}
              <tr><th>{calc.expenses > 0 ? '양도차익 (양도가 − 취득가 − 필요경비)' : '양도차익 (양도가 − 취득가)'}</th><td>{formatWon(calc.capGain)}</td></tr>
              {calc.nonTaxableMsg && (
                <tr><th>비과세 반영 후 과세대상</th><td>{formatWon(calc.taxableAfter1House)}</td></tr>
              )}
              <tr><th>장기보유특별공제 ({(calc.ltRate * 100).toFixed(0)}%)</th><td>− {formatWon(calc.ltDeduction)}</td></tr>
              <tr><th>공제 후 금액</th><td>{formatWon(calc.afterLt)}</td></tr>
              <tr><th>기본공제</th><td>− {formatWon(calc.basicDeduction)}</td></tr>
              <tr><th><strong>과세표준</strong></th><td><strong>{formatWon(calc.taxBase)}</strong></td></tr>
              <tr><th>산출세액</th><td>{formatWon(calc.baseTax)}</td></tr>
              <tr><th>지방소득세 (10%)</th><td>{formatWon(calc.localTax)}</td></tr>
              <tr className="jt-report-calc__total"><th>총 세액</th><td>{formatWon(calc.totalTax)}</td></tr>
              <tr><th>실효세율 (양도차익 대비)</th><td>{calc.effectiveRate.toFixed(1)}%</td></tr>
            </tbody>
          </table>
        </section>

        {calc.precise && calc.steps && calc.steps.length > 0 && (
          <section className="jt-report-result__section">
            <h3>단계별 계산 · 법조문 근거</h3>
            <table className="jt-report-calc">
              <tbody>
                {calc.steps.map((s, i) => (
                  <tr key={i}>
                    <th>{s['항목']}{s['조문'] ? ` · ${s['조문']}` : ''}</th>
                    <td>{formatStepValue(s['항목'], s['금액'])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <div className={calc.totalTax > 0 ? 'jt-report-result__grid' : ''}>
          <section className="jt-report-result__section">
            <h3>주의 포인트</h3>
            <ol className="jt-report-reasons">
              {(commentary.cautions || []).map((r, i) => (
                <li key={i}>
                  <div className="jt-report-reasons__head">
                    <span className="jt-report-reasons__n">{String(i + 1).padStart(2, '0')}</span>
                    <h4>{r.title}</h4>
                  </div>
                  <p>{r.detail}</p>
                </li>
              ))}
            </ol>
          </section>
          {calc.totalTax > 0 && (commentary.saving_ideas || []).length > 0 && (
            <section className="jt-report-result__section">
              <h3>절세 여지</h3>
              <ol className="jt-report-reasons">
                {commentary.saving_ideas.map((r, i) => (
                  <li key={i}>
                    <div className="jt-report-reasons__head">
                      <span className="jt-report-reasons__n">{String(i + 1).padStart(2, '0')}</span>
                      <h4>{r.title}</h4>
                    </div>
                    <p>{r.detail}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <section className="jt-report-result__section">
          <h3>추가 확인이 필요한 자료</h3>
          <ul className="jt-report-check">
            {(commentary.followup || []).map((c, i) => (
              <li key={i}><span className="jt-report-check__box">☐</span>{c}</li>
            ))}
          </ul>
        </section>

        <JTReportDisclaimer variant="inline" />
        <JTReportConvert
          setRoute={setRoute}
          reportType="양도소득세 간이 계산"
          reportTag="LEGACY"
          reportSummary={`총 세액 ${formatWon(calc.totalTax)} / 과세표준 ${formatWon(calc.taxBase)} / ${commentary.headline || ''}`}
          reportDetail={buildReportDetail(answers, calc, commentary)}
          kakaoSummary={buildKakaoSummary(answers, calc)}
          urgent={calc.shortTermNote !== null}
        />

        <div className="jt-report-result__foot">
          <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setStep(0); setAnswers({ transferDate: isoDate(new Date()) }); }}>다시 계산</button>
          <button className="jt-btn jt-btn--ghost" onClick={() => window.print()}>PDF / 인쇄</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="jt-container jt-report-loading">
        <div className="jt-report-loading__spinner" />
        <h2>세액을 계산하고 있습니다</h2>
        <p>기본세율 · 장기보유특별공제 · 지방소득세를 반영합니다.</p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="jt-container jt-report-loading">
        <h2>일시적인 오류입니다</h2>
        <p>{err}</p>
        <div style={{marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center'}}>
          <button className="jt-btn jt-btn--primary" onClick={() => { setErr(null); runAnalysis(); }}>다시 시도</button>
          <button className="jt-btn jt-btn--ghost" onClick={onBack}>허브로 돌아가기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="jt-container">
      <JTReportShell
        title="양도소득세 간이 계산"
        subtitle="취득·양도·보유·거주 정보로 추정 세액을 계산합니다."
        stepIdx={safeStep}
        stepTotal={total}
        onBack={goPrev}
        tag="LIVE"
      >
        <div className="jt-report-q">
          {cur.section && (
            <div style={{display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: '#fff', background: '#111', borderRadius: 4, padding: '4px 10px', marginBottom: 12}}>
              {cur.section}
            </div>
          )}
          <h2>{cur.q}</h2>
          {cur.sub && <p className="jt-report-q__sub">{cur.sub}</p>}

          {cur.freeform && (
            <textarea
              className="jt-report-q__textarea"
              maxLength={200}
              placeholder="예: 조정대상지역이며 분양권을 보유한 상태입니다"
              value={answers[cur.id] || ''}
              onChange={(e) => setAns(cur.id, e.target.value)}
            />
          )}

          {cur.numeric && (
            <input
              className="jt-report-q__input"
              type="text"
              inputMode="numeric"
              placeholder={cur.placeholder}
              value={answers[cur.id] ? Number(answers[cur.id]).toLocaleString('ko-KR') : ''}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, '');
                setAns(cur.id, digits);
              }}
            />
          )}

          {cur.date && (
            <input
              className="jt-report-q__input"
              type="text"
              inputMode="numeric"
              placeholder="예: 2018-03-15 (숫자 8자리로 입력)"
              value={answers[cur.id] || ''}
              onChange={(e) => {
                // 숫자만 받아 YYYY-MM-DD로 자동 정리 (연도 6자리 넘침 방지)
                let d = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
                if (d.length > 6) d = d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
                else if (d.length > 4) d = d.slice(0, 4) + '-' + d.slice(4);
                setAns(cur.id, d);
              }}
            />
          )}

          {!cur.freeform && !cur.numeric && !cur.date && (
            <div className="jt-report-q__opts">
              {cur.opts.map(([v, label, hint]) => {
                const selected = answers[cur.id] === v;
                return (
                  <button
                    key={v}
                    className={`jt-report-q__opt ${selected ? 'is-selected' : ''}`}
                    onClick={() => setAns(cur.id, v)}
                  >
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
          <button className="jt-btn jt-btn--ghost" onClick={goPrev}>
            {step === 0 ? '← 허브' : '← 이전'}
          </button>
          <button className="jt-btn jt-btn--primary" onClick={goNext} disabled={!canNext()}>
            {isLast ? '리포트 생성 →' : '다음 →'}
          </button>
        </div>
      </JTReportShell>
    </div>
  );
}
window.JTReportCGT = JTReportCGT;

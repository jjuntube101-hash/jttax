/* @jsx React.createElement */
/* 상속세 계산 — 총상속재산 + 배우자/자녀 + 공제(채무·장례·금융재산·동거주택)·간주상속(보험·퇴직)·사전증여 합산
   엔진: /v1/calc/inheritance (정밀, 상증법 §18~§30).
   261010: 이 화면에는 자체 계산식(폴백)이 없다 — 증여세·양도세·취득세 화면과 같다. 금액은 엔진이 준 값뿐이고,
   엔진 값이 없으면(입력 부족·거부·연결 실패) 금액을 내지 않는다. 모르는 사실은 요청에 «넣지 않는다»(키 생략).
   공통 헬퍼(formatWon·formatStepValue·isValidISODate·JTReportShell·JTReportConvert)는
   ReportCGT/Report/ReportConvert가 먼저 로드되어 전역에 존재 → 재사용(중복 정의 방지). */

const { useState: useInhState } = React;

/* 자녀 수 — 「7명 이상」을 고르면 실제 인원을 쓴다. 「6명 이상」으로 뭉쳐 6을 보내면
   배우자 법정상속분이 실제보다 커져 세액이 과소 계산된다 (260806 Codex B P1). */
function inhChildCount(a) {
  if (!a) return 0;
  if (a.numChildren === 'many') return Math.max(7, Math.floor(Number(a.numChildrenExact) || 0));
  return Number(a.numChildren) || 0;
}
window.jtInhChildCount = inhChildCount;

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
      ['4', '4명', ''],
      ['5', '5명', ''],
      ['6', '6명', ''],
      ['many', '7명 이상 — 정확한 인원 입력', '법정상속분이 인원수로 갈려 «6명 이상»으로 뭉치면 세액이 틀립니다'],
    ],
  },
  /* ⚠️ 종전엔 「6명 이상」을 그대로 6으로 엔진에 보내, 자녀 7명 이상이면 배우자 법정상속분이
     실제보다 크게 잡혀 세액이 과소 계산됐다 (260806 Codex B P1). 실제 인원을 받는다. */
  {
    id: 'numChildrenExact',
    /* ⚠️ tier 를 안 주면 «빠른 계산» 단계에서 이 문항이 안 뜬다. 그러면 「7명 이상」을
       골라도 정확 인원을 못 받아 기본값 7로 계산돼, 고치려던 결함이 그대로 남는다
       (260806 Codex R2 P1). 앞 문항(numChildren)과 같은 tier 여야 한다. */
    tier: 'quick',
    section: '상속인',
    q: '자녀가 정확히 몇 명인가요? (명)',
    sub: '배우자 법정상속분이 자녀 수로 갈리기 때문에 정확한 인원이 필요합니다. 7명 이상이면 정확한 인원을 7 이상으로 적어 주십시오(7 미만을 적으면 인원을 임의로 올리지 않고 계산하지 않습니다).',
    numeric: true,
    min: 7,
    placeholder: '예: 7',
    showIf: (a) => a.numChildren === 'many',
  },
  /* 배우자가 실제로 상속받는 금액은 배우자상속공제(§19)를 갈라 세액이 크게 달라진다 — 그래서 «빠른 계산»에서 묻는다.
     종전엔 상세 단계에서 「법정상속분 / 받지 않음」 둘만 있었고, 묻지 않은 빠른 계산은 법정상속분으로 «확정»했다(261010 폐지).
     「모름」은 엔진을 부르지 않는다 — 짐작으로 채우면 틀린 금액에 「정밀 계산」 딱지가 붙는다. */
  {
    id: 'spouseActual',
    tier: 'quick',
    section: '배우자 상속',
    q: '배우자는 실제로 얼마를 상속받으시나요?',
    sub: '배우자상속공제는 배우자가 실제로 상속받는 금액(법정상속분 한도, 최대 30억)까지 공제되어(상증법 §19) 이 답에 따라 세액이 크게 달라집니다. 상속인들이 나누기로 한 방식을 골라 주세요. 아직 정해지지 않아 「모름」을 고르시면 «틀린 금액을 보여 드리지 않기 위해» 금액 대신 안내를 드립니다.',
    showIf: (a) => a.hasSpouse === 'yes',
    opts: [
      ['legal', '법정상속분대로 나눕니다', '배우자가 법정상속분만큼 상속'],
      ['amount', '배우자가 받을 금액을 직접 입력합니다', '협의분할 등으로 금액이 정해진 경우'],
      ['none', '배우자는 상속받지 않습니다', ''],
      ['unsure', '모르겠습니다 (아직 정해지지 않았습니다)', '⚠️ 금액 대신 안내를 드립니다'],
    ],
  },
  {
    id: 'spouseInheritanceAmount',
    tier: 'quick',
    section: '배우자 상속',
    q: '배우자가 실제로 상속받는 금액은 얼마인가요? (원)',
    sub: '상속재산을 나누기로 한 결과 배우자가 받는 재산의 상속세 평가액을 입력하세요. 공제 한도(법정상속분·30억)는 엔진이 계산합니다.',
    showIf: (a) => a.hasSpouse === 'yes' && a.spouseActual === 'amount',
    numeric: true, money: true,
    placeholder: '예: 1,500,000,000',
  },

  // ── 더 정확히 (상세) ──
  {
    id: 'isResident',
    /* ★ quick 으로 올린 이유: 상세에만 두면 빠른 계산에서 이 값이 undefined 가 되고,
       차단 조건(=== 'no')이 안 걸려 «거주자 기준 금액»이 정밀 계산으로 나갔다
       (260806 Codex P0). 엔진이 거주자 여부를 아예 받지 않으므로 나중에 물어봐선 늦다. */
    tier: 'quick',
    section: '당사자',
    q: '고인이 한국에 사시던 분(거주자)인가요?',
    /* 종전 문구는 「이 답은 계산에 반영되지 않으며」였다 — 이제는 «금액 자체를 내지 않는다».
       정책이 바뀌면 문항 안내도 같이 바꾼다. 안 그러면 화면이 거짓말을 한다 (260806). */
    sub: '세법상 「거주자」(국내에 주소를 두거나 1년에 183일 이상 국내 거주) 여부입니다. 비거주자는 국내 재산만 과세되고 일괄공제·배우자상속공제가 배제되어 계산 구조가 다릅니다. 계산 엔진이 아직 거주자 기준만 지원하므로, 비거주자를 고르시면 «틀린 금액을 보여 드리지 않기 위해» 금액 대신 상담 안내를 드립니다.',
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
    q: '일반 장례비용은 얼마나 드셨나요? (원)',
    sub: '장례에 직접 쓴 금액을 입력하세요. 봉안시설·자연장지(납골당·수목장 등) 사용 비용은 이 칸에 넣지 말고 바로 다음 칸에 따로 적어 주세요. 일반 장례비는 최소 500만원~최대 1,000만원까지 공제되고(증빙이 없어도 500만원은 인정), 봉안시설·자연장지 비용은 별도로 최대 500만원까지 더 공제됩니다(상증령 §9②). 모르면 비워두세요.',
    numeric: true, money: true, optional: true,
    placeholder: '예: 10,000,000',
  },
  {
    id: 'burialFacilityExpenses',
    section: '공제 항목',
    q: '봉안시설·자연장지 사용 비용은 얼마인가요? (원)',
    sub: '납골당(봉안시설)·수목장 등 자연장지를 사용하는 데 쓴 금액입니다. 일반 장례비와 별도로 최대 500만원까지 공제됩니다(상증령 §9②). 비용이 없었다면 0 을 입력하세요. 비워 두면 이 비용을 따로 반영하지 않고 일반 장례비(최대 1,000만원)만 계산하며, 결과 화면에 안내가 붙습니다.',
    numeric: true, money: true, optional: true,
    placeholder: '예: 3,000,000',
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
    q: '돌아가신 분이 상속인에게 10년 안에, 또는 상속인이 아닌 사람에게 5년 안에 증여한 재산이 있나요?',
    sub: '상속 개시 전 10년 이내(상속인 외의 사람은 5년) 증여한 재산은 상속재산에 합산됩니다(상증법 §13). 이미 낸 증여세는 공제됩니다. 합산 누락은 가산세 사고로 이어지니 꼭 확인하세요.',
    opts: [
      ['yes', '네, 있습니다', '상속재산에 합산(§13)'],
      ['no', '아니오 / 없습니다', ''],
    ],
  },
  /* 사전증여는 «한 사람이 받은 증여» 기준으로만 받는다 — 합계 1건으로 보내는데 수증자가 여럿이면 사람별 증여재산공제와
     증여세액공제가 섞여 틀린 금액이 나온다(Codex 261010 R1 F1·F2). 여러 명이면 요청을 만들지 않는다. */
  {
    id: 'priorGiftOneRecipient',
    section: '사전증여',
    q: '그 기간 안에 증여받은 사람이 한 명인가요?',
    sub: '이 계산기는 한 사람이 받은 증여만 계산합니다. 증여받은 사람이 여러 명이면 사람별 증여재산공제와 증여세액공제가 달라져 화면에서 계산하지 않고, 상담으로 안내해 드립니다.',
    showIf: (a) => a.priorGiftHas === 'yes',
    opts: [
      ['one', '한 명입니다', '한 사람 기준으로 계산'],
      ['many', '여러 명입니다', '⚠️ 금액 대신 상담 안내를 드립니다'],
    ],
  },
  {
    id: 'priorGiftValue',
    section: '사전증여',
    q: '그 한 사람이 증여받은 재산은 모두 얼마인가요? (증여 당시 평가액 · 원)',
    sub: '한 사람이 여러 건을 받았다면 합산 금액을 입력하세요. 증여 당시의 평가액 기준입니다.',
    showIf: (a) => a.priorGiftHas === 'yes' && a.priorGiftOneRecipient === 'one',
    numeric: true, money: true, optional: true,
    requiredIf: (a) => a.priorGiftHas === 'yes',   // '있음' 선택 시 금액 필수 — 빈칸 방치로 §13 가산 누락(세금 과소) 방지
    placeholder: '예: 100,000,000',
  },
  {
    id: 'priorGiftRelation',
    section: '사전증여',
    q: '그 증여를 받은 분은 고인과 어떤 사이였나요?',
    sub: '증여 당시 적용된 증여재산공제(§53)를 가늠해, 이미 낸 증여세를 상속세에서 정확히 빼기(증여세액공제 §28) 위함입니다. 보통 자녀·손자녀가 받았으면 「직계비속」입니다. 배우자가 받은 증여는 배우자상속공제 한도 계산에도 반영됩니다(§19). 직계비속·배우자는 상속인으로 봅니다. 「그 외」(상속인이 아닌 친족·타인 포함)를 고르시면 상속인 여부와 증여 시기를 추가로 여쭙니다.',
    showIf: (a) => a.priorGiftHas === 'yes' && a.priorGiftOneRecipient === 'one',
    opts: [
      ['직계비속', '자녀·손자녀가 받음 (직계비속 · 상속인)', '증여공제 5천만 기준'],
      ['배우자', '배우자가 받음 (상속인)', '증여공제 6억 기준'],
      ['기타', '그 외 — 상속인이 아닌 친족·타인 포함', '상속인 여부를 추가로 여쭙니다 · 증여공제 1천만 기준'],
    ],
  },
  {
    id: 'priorGiftHeir',
    section: '사전증여',
    q: '그 증여를 받은 분은 이번 상속의 상속인인가요?',
    sub: '상속재산에 합산하는 사전증여의 기간이 상속인은 10년, 상속인이 아닌 사람은 5년으로 다릅니다(상증법 §13). 한 사람 기준으로 답해 주세요.',
    showIf: (a) => a.priorGiftHas === 'yes' && a.priorGiftOneRecipient === 'one' && a.priorGiftRelation === '기타',
    opts: [
      ['yes', '네, 상속인입니다', '10년 이내 증여를 합산'],
      ['no', '아니오, 상속인이 아닙니다', '5년 이내 증여만 합산'],
    ],
  },
  {
    id: 'priorGiftWithin5y',
    section: '사전증여',
    q: '그 증여는 상속개시일(사망일) 전 5년 이내에 이루어졌나요?',
    sub: '한 사람 기준입니다. 상속인이 아닌 분에게 5년보다 앞서 한 증여는 상속재산에 합산하지 않으므로 계산에 넣지 않습니다.',
    showIf: (a) => a.priorGiftHas === 'yes' && a.priorGiftOneRecipient === 'one' && a.priorGiftRelation === '기타' && a.priorGiftHeir === 'no',
    opts: [
      ['yes', '네, 5년 이내입니다', '상속재산에 합산'],
      ['no', '아니오, 5년보다 앞선 증여입니다', '합산하지 않음 — 계산에 넣지 않습니다'],
    ],
  },
  {
    id: 'priorGiftMinor',
    section: '사전증여',
    q: '증여받은 분이 증여 당시 미성년자(만 19세 미만)였나요?',
    sub: '미성년 자녀·손자녀가 직계존속(고인)에게서 증여받았다면 증여재산공제가 2천만원으로 줄어듭니다(상증법 §53②단서). 이미 낸 증여세 계산에 반영됩니다.',
    showIf: (a) => a.priorGiftHas === 'yes' && a.priorGiftOneRecipient === 'one' && a.priorGiftRelation === '직계비속',
    opts: [
      ['no', '아니오 (성년이었음)', '증여공제 5천만'],
      ['yes', '네, 미성년이었습니다', '증여공제 2천만'],
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

/* 비상속인에게 5년보다 앞서 한 증여 — 상속재산에 합산하지 않으므로 요청에 넣지 않는다(결과 화면이 그 사실을 안내한다) */
function inhPriorGiftDropped(a) {
  return a.priorGiftHas === 'yes' && a.priorGiftOneRecipient === 'one' && Number(a.priorGiftValue) > 0 && a.priorGiftRelation === '기타'
    && a.priorGiftHeir === 'no' && a.priorGiftWithin5y === 'no';
}

/* answers → 엔진 요청 바디 (/v1/calc/inheritance). 모르는 사실은 «보내지 않는다»(키 생략) — 엔진이 기본값으로 확정하지 않는다.
   · has_spouse·num_children — 답한 경우에만(안 보내면 엔진이 입력 부족으로 거부한다)
   · 배우자 실제 상속(배우자 있음일 때만): 법정상속분대로 → spouse_legal_share:true / 직접 입력 → spouse_inheritance:<원>
     / 받지 않음 → spouse_no_inheritance:true. 「모름」·미응답·금액 미입력은 요청 자체를 만들지 않는다(null) — 호출 전 게이트가 먼저 막는다.
   · burial_facility_expenses — 칸을 채운 경우에만(0 포함). 비우면 키 생략(엔진이 «미분리»로 보고 안내를 붙인다)
   · gift_history[0] — «한 사람이 받은 증여» 1건(여러 명이면 요청을 만들지 않는다). 수증자 관계 배우자 → to_spouse:true, 그 외 친족 → 상속인 여부(is_heir)와 5년 이내 여부를 물은 뒤 보낸다
   요청을 만들 수 없는 불확정 입력이면 null. */
function mapAnswersToInheritance(a) {
  const spouseYes = a.hasSpouse === 'yes';
  const spouse = {};
  if (spouseYes) {
    if (a.spouseActual === 'legal') spouse.spouse_legal_share = true;
    else if (a.spouseActual === 'amount' && Number(a.spouseInheritanceAmount) > 0) spouse.spouse_inheritance = Number(a.spouseInheritanceAmount);
    else if (a.spouseActual === 'none') spouse.spouse_no_inheritance = true;
    else return null;                                   // 모름·미응답·금액 미입력 — 짐작으로 채우지 않는다
  }
  if (a.numChildren === 'many' && !(Number(a.numChildrenExact) >= 7)) return null;   // 7명 이상인데 정확한 인원이 없거나 7 미만이다 — 임의로 올리지 않는다
  if (a.priorGiftHas === 'yes' && a.priorGiftOneRecipient !== 'one') return null;   // 사전증여를 받은 사람이 여럿이거나 답이 없다 — 합계 1건으로 섞지 않는다
  const body = { estate_value: Number(a.estateValue) || 0 };
  if (a.hasSpouse === 'yes' || a.hasSpouse === 'no') body.has_spouse = spouseYes;
  if (a.numChildren != null && a.numChildren !== '') body.num_children = inhChildCount(a);
  Object.assign(body, spouse);
  if (Number(a.debts) > 0) body.debts = Number(a.debts);
  if (Number(a.funeralExpenses) > 0) body.funeral_expenses = Number(a.funeralExpenses);
  const burial = a.burialFacilityExpenses;
  if (burial != null && String(burial).trim() !== '' && Number.isFinite(Number(burial)) && Number(burial) >= 0) body.burial_facility_expenses = Number(burial);
  if (Number(a.netFinancialAssets) > 0) body.net_financial_assets = Number(a.netFinancialAssets);
  if (Number(a.insuranceAmount) > 0) body.insurance_amount = Number(a.insuranceAmount);
  if (Number(a.retirementPay) > 0) body.retirement_pay = Number(a.retirementPay);
  if (a.hasCohabitationHouse === 'yes') {
    body.has_cohabitation_house = true;
    body.cohabitation_house_value = Number(a.cohabitationHouseValue) || 0;
  }
  if (a.priorGiftHas === 'yes' && (!(Number(a.priorGiftValue) > 0) || !['직계비속', '배우자', '기타'].includes(a.priorGiftRelation))) return null;   // 금액·관계가 비었다 — 기본값(상속인·기본 공제)으로 채우지 않는다
  if (a.priorGiftHas === 'yes' && !inhPriorGiftDropped(a)) {
    // gift_history(사실입력) 경로 — 엔진이 §58 증여세 산출세액을 자동도출해 §28 증여세액공제를 정상 반영.
    // (prior_gift_values만 보내면 §13 가산만 되고 §28 공제가 0이 되어 상속세가 과대추정됨)
    const pv = Number(a.priorGiftValue);
    // 수정 260628(INHERITANCE-R2-05): 미성년 직계비속이 직계존속(고인)에게서 수증 시 증여재산공제 2천만(상증법 §53②단서). 성년 5천만.
    const isMinorGift = a.priorGiftMinor === 'yes' && a.priorGiftRelation === '직계비속';
    const dedByRel = { '배우자': 600000000, '직계비속': 50000000, '기타': 10000000 };
    const baseDed = isMinorGift ? 20000000 : dedByRel[a.priorGiftRelation];   // 관계는 위에서 세 값 중 하나로 확인했다 — 기본 공제액으로 메우지 않는다
    const ded = Math.min(baseDed, pv);
    const item = { value: pv, deduction_used: ded, is_heir: true, is_minor: isMinorGift };
    if (a.priorGiftRelation === '배우자') item.to_spouse = true;
    if (a.priorGiftRelation === '기타') {
      if (a.priorGiftHeir === 'yes') item.is_heir = true;
      else if (a.priorGiftHeir === 'no' && a.priorGiftWithin5y === 'yes') item.is_heir = false;
      else return null;                                 // 상속인 여부·시기를 답하지 않았다 — 기간(10년/5년)을 짐작하지 않는다
    }
    body.gift_history = [item];
  }
  return body;
}

/* 차단 판정 — «렌더»가 아니라 «분석 단계»에서 쓰라고 모듈 스코프로 뺐다.
   화면에서 금액을 가려도 그 전에 AI 프롬프트가 세액을 외부로 보내고 있었다
   (260806 Codex P0). runAnalysis 가 엔진 응답 직후 이 함수로 먼저 판정하고,
   렌더도 같은 함수를 쓴다 — 규칙이 두 벌이 되면 반드시 어긋난다.
   두 층이다: ① 입력 불확정(calc.precise 와 무관) ② 엔진 값 없음(calc.precise 가 거짓이면 항상 한 건).
   261010: 이 화면에는 자체 계산식(폴백)이 없다 — 「폴백이 못 다루는 입력」(사전증여·금융재산·동거주택·배우자 비수령)을
   막던 규칙은 함께 지웠다(엔진이 직접 계산하거나, 못 하면 ②층이 어떤 입력이든 막는다).
   ⚠️ 이 함수는 자기완결이어야 한다(tests_fallback_block.js 가 함수 본문만 꺼내 실행한다) — 다른 모듈 함수를 부르지 않는다. */
function inhFallbackGaps(answers, calc) {
  /* «아니오»만 보면 미입력이 새어 나간다 — 거주자라고 «확인된» 경우만 계산한다.
     state 조작·문항 구성 변경으로 값이 빠져도 거주자 가정 수치가 안 나오게 하는 방어다. */
  const nonResident = answers.isResident !== 'yes';
  const spouseYes = answers.hasSpouse === 'yes';
  const sp = answers.spouseActual;
  const spouseResolved = sp === 'legal' || sp === 'none' || (sp === 'amount' && Number(answers.spouseInheritanceAmount) > 0);
  const giftOther = answers.priorGiftHas === 'yes' && answers.priorGiftOneRecipient === 'one' && answers.priorGiftRelation === '기타';
  const giftHeirResolved = answers.priorGiftHeir === 'yes' || (answers.priorGiftHeir === 'no' && (answers.priorGiftWithin5y === 'yes' || answers.priorGiftWithin5y === 'no'));
  /* ── ① 엔진도 «못 푸는» 입력 · 짐작으로 채울 수 없는 입력 — precise 여도 막는다 ───────────────────────
     260806 실측(POST /v1/calc/inheritance, 20억·배우자·자녀2):
       필드 없음 / is_resident:false / resident:false → 셋 다 127,416,380 으로 «동일».
     즉 엔진은 거주자 여부를 받지 않는다. 비거주자는 일괄공제·배우자공제가 배제돼
     계산 구조 자체가 다른데, 그대로 두면 거주자 기준 금액에 「정밀 계산」 딱지가 붙는다.
     경고 배너만으로는 부족하다 — 사람은 숫자를 먼저 본다.
     배우자 「모름」은 요청을 보내지 않는다 — 배우자공제가 5억에서 30억까지 갈려 세액이 크게 달라진다(261010). */
  const unknown = window.jtFallbackGaps([
    { when: nonResident,
      why: '고인의 거주자 여부가 «거주자»로 확인되지 않았습니다 — 비거주자는 국내 재산만 과세되고 일괄공제·배우자상속공제가 배제됩니다. 계산 엔진이 아직 거주자 기준만 지원해 금액을 표시하지 않습니다(상담에서 정확히 안내해 드립니다).' },
    { when: spouseYes && sp === 'unsure',
      why: '배우자가 실제로 상속받을 금액에 따라 세액이 크게 달라집니다 — 「모름」으로는 금액을 계산할 수 없습니다. 「← 이전」으로 돌아가 「법정상속분대로」·「직접 입력」·「상속받지 않음」 중 하나를 골라 주세요(상속인들이 아직 나누지 않았다면 상담에서 시나리오별로 안내해 드립니다).' },
    { when: spouseYes && sp !== 'unsure' && !spouseResolved,
      why: '배우자가 실제로 상속받는 방식(법정상속분대로·직접 입력·상속받지 않음)이 정해지지 않았거나, 직접 입력의 금액이 비어 있습니다 — 배우자상속공제가 이 답에 따라 크게 달라집니다.' },
    { when: answers.numChildren === 'many' && !(Number(answers.numChildrenExact) >= 7),
      why: '자녀가 7명 이상인데 정확한 인원이 없거나 7 미만입니다 — 7명 이상이면 정확한 인원을 7 이상으로 적어 주십시오(배우자 법정상속분이 인원수로 갈립니다).' },
    { when: answers.priorGiftHas === 'yes' && answers.priorGiftOneRecipient === 'many',
      why: '증여받은 사람이 여러 명이면 사람별 공제와 증여세액공제가 달라져 화면에서 계산하지 않습니다 — 상담 문의로 사람별 금액을 적어 주십시오.' },
    { when: answers.priorGiftHas === 'yes' && answers.priorGiftOneRecipient === 'one'
        && (!(Number(answers.priorGiftValue) > 0) || !['직계비속', '배우자', '기타'].includes(answers.priorGiftRelation)),
      why: '10년 내 사전증여를 받은 한 사람의 증여 금액 또는 고인과의 관계(직계비속·배우자·그 외)가 비어 있습니다 — 상속인 여부와 증여재산공제가 관계로 갈려 짐작으로 채울 수 없습니다.' },
    { when: answers.priorGiftHas === 'yes' && answers.priorGiftOneRecipient !== 'one' && answers.priorGiftOneRecipient !== 'many',
      why: '10년 내 사전증여를 받은 사람이 한 명인지 여러 명인지 정해지지 않았습니다 — 이 계산기는 한 사람이 받은 증여만 계산합니다.' },
    { when: giftOther && !giftHeirResolved,
      why: '10년 내 사전증여를 받은 «그 외» 한 사람이 상속인인지(그리고 아니라면 5년 이내 증여인지) 정해지지 않았습니다 — 합산 기간(상속인 10년·비상속인 5년)이 달라집니다.' },
  ]);
  /* ── ② 엔진 값이 없으면 어떤 입력이든 막는다 ──────────────────────────────
     이 화면에는 자체 계산식이 없으므로 «엔진이 준 금액»이 없으면 보여 줄 금액이 없다.
     사유는 «엔진이 거부했다(refused: 입력 부족·지원 안 함)»와 «연결하지 못했다(down·미지정)» 둘이다.
     거부 사유는 엔진이 준 문구(calc.engineMessage)를 그대로 보인다. */
  if (calc.precise) return unknown;
  return unknown.concat([calc.engineState === 'refused'
    ? '입력이 더 필요합니다 — ' + (calc.engineMessage || '이 계산기가 금액을 확정할 수 없는 조건입니다. 「← 이전」으로 돌아가 답을 보완하시거나 상담으로 확인해 주세요.')
    : '계산 엔진에 연결하지 못했습니다 — 연결되지 않은 상태에서는 금액을 표시하지 않습니다.']);
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
  L.push('', '■ 계산 결과 (검증 엔진)');
  const dd = calc.deductions || {};
  [['선택공제', '선택공제(일괄 또는 기초·인적)'], ['배우자공제', '배우자상속공제'], ['증여세액공제', '증여세액공제']].forEach(([k, label]) => {
    if (typeof dd[k] === 'number' && dd[k] > 0) L.push('  · ' + label + ': ' + formatWon(dd[k]));
  });
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
  const delays = [1000, 2000, 4000, 8000];
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
   엔진 결과 → calc (261010 오너 방침: 프론트의 자체 계산식(폴백)을 삭제한다 — 증여세·양도세·취득세 화면과 같은 방식)

   상속세 화면에는 세액을 «스스로» 계산하는 코드가 없다. 금액은 엔진(`POST /v1/calc/inheritance`)이 준 값뿐이고,
   엔진 값이 없으면 금액 필드(totalTax 등)를 아예 두지 않는다. 엔진 호출 결과는 셋이다.
     · 유효 응답  — HTTP 200 + 오류 없음 + calc.상태 가 'ok' + 필수 숫자 키(과세표준·산출세액·세액)가 유한한 실수
                    (window.jtValidCalc) → precise:true 와 각 금액 필드
     · 거부       — HTTP 200 인데 calc.오류 가 있거나 calc.상태 가 'ok' 가 아님(needs_input·unsupported), 또는 HTTP 4xx(408·429 제외)
                    → precise:false, engineState:'refused', engineMessage(엔진이 준 오류 문구 — «입력이 더 필요합니다» 안내에 그대로 보인다)
     · 연결 실패  — 네트워크 오류·타임아웃·HTTP 5xx·408·429·calc 없음·깨진 응답·상태 'error'(엔진 내부 실패) → precise:false, engineState:'down'
   ══════════════════════════════════════════════════════════════════════════ */
const INH_ENGINE_REQUIRED = ['과세표준', '산출세액', '세액'];
function inhEngineVerdict(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'down';
  /* 상태 키가 있으면 먼저 본다. error = 엔진 내부 실패(입력 탓이 아니다 → 다시 시도), needs_input·unsupported = 거부.
     상태 키가 없는 응답(구 엔진)은 «오류 없음 + 유효성 통과»로만 받는다. */
  if (Object.prototype.hasOwnProperty.call(c, '상태') && c['상태'] !== 'ok') return c['상태'] === 'error' ? 'down' : 'refused';
  /* 공통 검증기(jtValidCalc)가 무효로 보는 명시적 오류 필드(error·detail 등)도 «거부»다 — 무결성 검사로 넘기면
     「연결 실패」로 잘못 안내된다. */
  if (c['오류'] || c.error || c.errors || c.detail || c.success === false) return 'refused';
  if (!window.jtValidCalc(c, INH_ENGINE_REQUIRED)) return 'down';
  return 'ok';
}
function inhCalcFromEngine(ej) {
  const c = ej && ej.calc;
  const verdict = inhEngineVerdict(c);
  if (verdict === 'refused') {
    const msg = [c['오류'], c.error].find(x => typeof x === 'string' && x.trim());
    return { precise: false, engineState: 'refused', engineMessage: msg ? msg.trim() : '' };
  }
  if (verdict !== 'ok') return { precise: false, engineState: verdict };
  const mj = (c['주요공제'] && typeof c['주요공제'] === 'object' && !Array.isArray(c['주요공제'])) ? c['주요공제'] : {};
  return {
    precise: true, engineVer: ej.version && ej.version.engine,
    taxBase: c['과세표준'], calcTax: c['산출세액'], totalTax: c['세액'],
    deductions: mj,
    steps: c['단계별계산'] || [],
    engineWarnings: c['경고사항'] || [],   // 엔진이 알리는 가정·경고([확인 필요] 등) — 결과 화면에 그대로 보인다
    nonTaxableMsg: c['세액'] === 0 ? '공제 범위 내로 납부할 상속세가 없습니다.' : null,
  };
}
/* 호출 자체가 던진 예외 — HTTP 4xx(callInhEngine 이 status 를 달아 던진다)는 엔진의 «거부», 그 밖은 «연결 실패» */
function inhCalcFromEngineError(e) {
  /* 408(시간 초과)·429(호출 제한)는 입력 문제가 아니라 일시적 상태다 — 다시 시도를 안내한다 */
  return (e && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429)
    ? { precise: false, engineState: 'refused', engineMessage: '' }
    : { precise: false, engineState: 'down' };
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
      return !isNaN(v) && v > 0 && (cur.min == null || v >= cur.min);
    }
    return !!answers[cur.id];
  };

  const runAnalysis = async () => {
    setLoading(true); setErr(null);
    try {
      /* ★ «불확정 입력»은 엔진을 부르기 «전»에 막는다 (260806 Codex R20 P1).
         판정 함수는 2층인데 ①불확정 층은 calc.precise 와 무관하다 — 그래서 여기서
         precise:true 로 불러 ①층만 본다. 못 낼 값이면 요청 자체가 낭비이고,
         「모르겠다」고 답한 사실이 기본값으로 둔갑해 엔진까지 가지도 않는다.
         엔진 응답 직후의 게이트는 ②엔진 값 없음(거부·연결 실패)을 잡는다. */
      if (inhFallbackGaps(answers, { precise: true }).length > 0) {
        /* precise:true 로 저장하는 이유 — 렌더가 같은 판정 함수를 다시 부르는데,
           precise:false 로 두면 ②엔진 값 없음 사유까지 붙어 «엔진 POST 를 멈춘 이유»와
           다른 항목이 화면에 뜬다 (260806 Codex R21 P2). preEngineBlock 은 그 상태를
           «정밀 계산 성공»과 구분하기 위한 표식이다. */
        const unknownRep = { calc: { precise: true, preEngineBlock: true }, commentary: null, quick: phase === 'quick' };
        setReport(unknownRep);
        if (phase === 'quick') setQuickReport(unknownRep);
        return;
      }
      const estate = Number(answers.estateValue) || 0;
      /* ★ 엔진 값이 없으면 금액 필드가 «없는» calc 가 된다(inhCalcFromEngine 주석) — 자체 계산식으로 메우지 않는다.
         유효 응답이면 precise:true, 거부면 engineState:'refused', 연결 실패면 engineState:'down'. */
      let calc;
      const reqBody = mapAnswersToInheritance(answers);
      if (!reqBody) {
        /* 위 ①층 게이트가 먼저 막으므로 여기까지 오지 않는다 — 요청을 만들 수 없는 불확정 입력이면 엔진을 부르지 않는다(방어) */
        calc = { precise: false, engineState: 'refused', engineMessage: '' };
      } else {
        try {
          calc = inhCalcFromEngine(await callInhEngine(reqBody));
        } catch (e) {
          console.warn('상속 엔진 호출 실패', e);
          calc = inhCalcFromEngineError(e);
        }
      }

      /* ★ AI 프롬프트를 만들기 «전»에 막는다. 화면에서 금액을 가려도 이 호출이 먼저 나가면
         세액이 외부로 흘러간다 — 260806 Codex P0 로 실제 그러고 있었다.
         렌더와 «같은 함수»로 판정해야 규칙이 두 벌로 갈라지지 않는다. */
      if (inhFallbackGaps(answers, calc).length > 0) {
        const blockedRep = { calc, commentary: null, quick: phase === 'quick' };
        setReport(blockedRep);
        if (phase === 'quick') setQuickReport(blockedRep);
        return;
      }

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
            { title: '배우자상속공제', detail: '배우자가 실제 상속받는 금액(최대 30억)까지 공제되어 절세 효과가 큽니다(§19). 표시 세액은 입력하신 배우자 상속 방식을 기준으로 한 값이라, 실제 분할이 달라지면 세액이 달라질 수 있습니다.' },
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
        <JTReportShell title="상속세 계산" subtitle="검증 엔진으로 계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="LIVE">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />검증된 세금 엔진으로 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc, commentary } = report;
    const nonResident = answers.isResident === 'no';
    /* 엔진 값이 없거나(down·refused) 입력이 불확정이면 숫자를 내지 않는다 (261010: 자체 계산식 없음). */
    const inhGaps = inhFallbackGaps(answers, calc);
    const inhBlocked = inhGaps.length > 0;
    /* ★ 차단이면 «결과 화면을 아예 만들지 않는다».
       가릴 것을 하나씩 세는 방식은 새 표현이 늘 때마다 샜다(260806: 계산표·공유버튼·
       AI 코멘터리·절세전략 문구가 차례로 발견). 조기 반환은 «세지 않아도» 안전하다. */
    if (inhBlocked) {
      /* 사유 구분: ①입력 불확정 → 'input' / 엔진이 거부(입력 부족·지원 안 함) → 'refused' / 그 밖(연결 실패·미지정) → 'down' */
      const inhBlockReason = inhFallbackGaps(answers, { precise: true }).length > 0 ? 'input' : (calc.engineState === 'refused' ? 'refused' : 'down');
      const inhBlockTag = inhBlockReason === 'input' ? '정밀 계산 필요' : (inhBlockReason === 'refused' ? '입력이 더 필요합니다' : '계산 엔진 연결 실패');
      return (
        <div className="jt-container">
          <JTReportShell title="상속세 계산 결과" subtitle={inhBlockTag} stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
            {/* 'down' 은 패널 본문이 사유를 이미 말한다 — 같은 뜻의 사유 목록을 한 번 더 내지 않는다.
                'input'·'refused' 는 무엇을 채워야 하는지(엔진이 준 문구 포함)를 목록으로 보인다 */}
            <JTFallbackBlocked gaps={inhBlockReason === 'down' ? [] : inhGaps} onRetry={runAnalysis} reason={inhBlockReason} />
            <div className="jt-report-q__nav" style={{ marginTop: 16 }}>
              <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setPhase('quick'); setStep(0); setAnswers({}); }}>처음부터 다시</button>
            </div>
          </JTReportShell>
        </div>
      );
    }
    const dd = calc.deductions || {};
    const ddNum = (k) => (typeof dd[k] === 'number' && isFinite(dd[k])) ? dd[k] : null;
    return (
      <div className="jt-container">
        <JTReportShell title="상속세 계산 결과" subtitle="상속세 정밀 계산" stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
          {nonResident && (
            <div className="jt-report-result__section" style={{ background: '#fff4e5', borderLeft: '4px solid #d08b00', padding: '14px 18px', marginBottom: 16 }}>
              ⚠️ 비거주자 상속은 국내 재산만 과세되고 일괄공제 등이 배제되어 계산이 크게 달라집니다. 아래는 거주자 기준 참고치이며, 정확한 계산은 상담으로 안내해 드립니다.
            </div>
          )}
          <div className="jt-report-result__grade jt-grade-mid">
            <div className="jt-report-result__grade-label">{report.quick ? '빠른 예상 상속세' : '총 납부세액 · 정밀 계산 (JT택스랩 엔진)'}</div>
            <div className="jt-report-result__grade-val">{formatWon(calc.totalTax)}</div>
          </div>

          {report.quick && (
            <div className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '14px 18px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}>
                <strong>총재산·가족·배우자 상속 방식만으로 낸 빠른 예상치예요.</strong> 아래를 반영하면 세액이 달라질 수 있어요 —<br />
                채무·장례비·봉안비 · 금융재산공제 · 동거주택공제 · 10년 내 사전증여(합산) · 보험금·퇴직금.
              </p>
              <button className="jt-btn jt-btn--primary" onClick={goDetail}>더 정확히 계산하기 →</button>
            </div>
          )}

          <section className="jt-report-result__section">
            <h3>계산 내역</h3>
            <table className="jt-report-calc">
              <tbody>
                {ddNum('선택공제') != null && <tr><th>{typeof dd['공제유형'] === 'string' && dd['공제유형'] ? `${dd['공제유형']} (선택공제)` : '선택공제 (일괄공제 또는 기초·인적공제)'}</th><td>{formatWon(ddNum('선택공제'))}</td></tr>}
                {ddNum('배우자공제') > 0 && <tr><th>배우자상속공제 (§19)</th><td>{formatWon(ddNum('배우자공제'))}</td></tr>}
                {ddNum('공제한도초과') > 0 && <tr><th>공제 한도(§24) 초과로 되돌린 금액</th><td>+ {formatWon(ddNum('공제한도초과'))}</td></tr>}
                <tr><th><strong>과세표준</strong></th><td><strong>{formatWon(calc.taxBase)}</strong></td></tr>
                <tr><th>산출세액</th><td>{formatWon(calc.calcTax)}</td></tr>
                {ddNum('증여세액공제') > 0 && <tr><th>증여세액공제 (사전증여 §28)</th><td>− {formatWon(ddNum('증여세액공제'))}</td></tr>}
                <tr><th><strong>총 납부세액</strong></th><td><strong>{formatWon(calc.totalTax)}</strong></td></tr>
              </tbody>
            </table>
            {calc.nonTaxableMsg && <p style={{ marginTop: 10 }}>{calc.nonTaxableMsg}</p>}
          </section>

          {calc.steps && calc.steps.length > 0 && (
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

          {inhPriorGiftDropped(answers) && (
            <section className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', borderRadius: 8 }}>
              <h3 style={{ marginTop: 0 }}>사전증여는 계산에 넣지 않았습니다</h3>
              <p style={{ margin: 0 }}>한 사람 기준으로 답하신 증여 중, 상속인이 아닌 분에게 상속개시일 전 5년보다 앞서 한 증여는 상속재산에 합산하지 않으므로, 입력하신 사전증여는 이 계산에서 제외했습니다(상증법 §13).</p>
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

          {/* 차단 중에는 위 조기 반환으로 이 화면에 오지 않으므로 «공유·전송»도 열리지 않는다 —
              화면에서 금액을 가려도 kakaoSummary·reportSummary·reportDetail 에 세액이 담겨 클립보드와
              Web3Forms 로 나가던 경로 (260806 Codex P0). */}
          <JTReportConvert
            setRoute={setRoute}
            calcId="inheritance"
            completeEligible={true}
            precise={true}
            quick={report.quick}
            reportType="상속세 정밀 계산"
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
      <JTReportShell title="상속세 계산" subtitle={phase === 'quick' ? '총재산·가족만 입력하면 예상 상속세를 바로 보여드려요.' : '공제·사전증여 등을 반영해 더 정확히 계산합니다.'} stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="LIVE">
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
            <JTNumericInput className="jt-report-q__input" type="text" inputMode="numeric" placeholder={cur.placeholder}
              value={answers[cur.id]}
              onChange={(e) => window.jtSetNumericAns(setAns, cur.id, e.target.value, true)} />
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

/* @jsx React.createElement */
/* 종합부동산세 계산 — 주택분 (공시합계·공제·공정비율·누진/중과세율·재산세공제·1세대1주택 세액공제·세부담 상한·§8④ 의제)
   엔진: /v1/calc/comprehensive (종부세법 §7~§10). 261011: 이 화면에는 자체 계산식(폴백)이 없다 —
   금액은 엔진이 준 값뿐이고, 엔진 값이 없거나 상태가 ok 가 아니면 금액을 내지 않는다(재산세 화면과 같은 구조).
   공통 헬퍼(formatWon·JTReportShell·JTReportConvert)는 먼저 로드된 파일의 전역 사용. */

const { useState: useCompState } = React;

const COMP_CIRCLED = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
function compFmtArticle(s) {
  if (!s) return '';
  return String(s).replace(/SS/g, '§').replace(/\((\d{1,2})\)/g, (m, n) => COMP_CIRCLED[Number(n)] || m);
}
/* 단계별 '비율'(0~1 실수)은 %로, 그 외는 금액(원). */
function compFormatStepValue(name, amount) {
  if (typeof amount !== 'number') return amount;
  if (amount > 0 && amount < 1) return (Math.round(amount * 1000) / 10) + '%';   // 공정비율 0.6 → 60%
  return formatWon(amount);
}

/* §8④ 1세대 1주택 의제 — 「2채여도 1세대 1주택자로 본다」는 네 가지(일시적 2주택·상속주택·지방 저가주택·부속토지).
   문항 showIf 가 쓰는 판정이다(매퍼·차단 함수는 시험이 «함수 본문만» 꺼내 실행하므로 이 함수를 부르지 않고 같은 목록을 직접 갖는다). */
function compIsDeemed(a) {
  return a.housingCount === 'two' && ['temp', 'inherit', 'rural', 'land'].indexOf(a.deemedOneHouse) >= 0;
}

const COMP_QS = [
  {"id": "ownerType", "section": "추가 계산 조건", "q": "주택의 소유자는 누구인가요?", "opts": [["person", "개인", ""], ["corporate", "법인", ""]], "tier": "quick", showIf:a=>true},
  {"id": "corporateType", "section": "추가 계산 조건", "q": "검토한 종부세 법인 유형을 선택하세요", "opts": [["일반", "일반 법인", ""], ["공익법인_직접사용", "공익법인 직접사용 요건 확인", ""], ["공공주택사업자등", "공공주택사업자 등 요건 확인", ""], ["공익법인_기타", "그 밖의 공익법인 요건 확인", ""]], "tier": "quick", showIf:a=>a.ownerType==='corporate'},
  {"id": "corporateHouseCount", "section": "추가 계산 조건", "q": "법인 세율 적용 주택 수 (정확한 채수)", "numeric": true, "money": false, "optional": false, "tier":"quick", showIf:a=>a.ownerType==='corporate'},

  {
    id: 'housingCount',
    showIf: a => a.ownerType !== 'corporate',
    tier: 'quick',
    section: '주택 보유 현황',
    q: '본인 세대가 보유한 주택은 몇 채인가요?',
    sub: '종합부동산세는 매년 6월 1일 기준, 세대가 보유한 주택의 공시가격을 합산해 공제(1세대1주택 12억·그 외 9억)를 넘는 부분에 부과됩니다(종부세법 §7·§8). 1세대 1주택이면 공제도 크고, 만 60세 이상·5년 이상 보유 시 세액공제까지 받습니다.',
    opts: [
      ['one', '1채 (1세대 1주택)', '공제 12억 · 연령·보유 세액공제'],
      ['two', '2채', '공제 9억 · 일반세율'],
      ['three', '3채 이상', '공제 9억 · 중과세율(12억 초과 구간↑)'],
    ],
  },
  {
    id: 'totalValue',
    tier: 'quick',
    section: '공시가격 합계',
    q: '보유 주택의 공시가격을 모두 더하면 얼마인가요? (원)',
    sub: '실거래가가 아니라 정부가 매년 고시하는 공시가격의 합계입니다. 여러 채면 전부 더해 주세요. 부동산공시가격알리미(realtyprice.kr)에서 조회됩니다. 공제(1세대1주택 12억·그 외 9억) 이하이면 종부세는 0원입니다.',
    numeric: true, money: true,
    placeholder: '예: 1,500,000,000',
  },
  /* 2채일 때만 묻는다. 「아니요」가 아니면 아래 secondValue 로 특례 대상 주택의 공시가격을 따로 받는다(합계 − 그 금액 = 주된 주택).
     「모름」은 차단(①층) — 공제 12억/9억과 세액공제가 이 답에 따라 갈리므로 짐작으로 채우지 않는다. */
  {
    id: 'deemedOneHouse',
    section: '1세대 1주택 특례(의제)',
    q: '두 번째 주택 때문에 2주택이 됐지만 1세대 1주택자로 보는 경우인가요?',
    sub: '일시적 2주택, 상속주택, 지방 저가주택, 다른 주택의 부속토지만 가진 경우에는 2채여도 1세대 1주택자로 보아 공제(12억)와 세액공제를 적용합니다(종부세법 §8④). 어느 경우인지에 따라 세액이 크게 갈리므로, 모르시면 「모름」을 골라 주세요 — 금액 대신 세무사 확인을 안내합니다.',
    showIf: (a) => a.ownerType !== 'corporate' && (a.housingCount === 'two'),
    opts: [
      ['no', '아니요 — 일반 2주택', '공제 9억 · 세액공제 없음'],
      ['temp', '일시적 2주택', '이사하려고 새 집을 산 뒤 3년 안'],
      ['inherit', '상속받은 주택', '상속 5년 안, 지분 40% 이하, 지분 공시가격 6억(수도권 밖 3억) 이하 중 하나'],
      ['rural', '지방 저가주택', '공시가격 4억 이하이고 수도권·광역시 밖 등'],
      ['land', '다른 주택의 부속토지만 소유', ''],
      ['unknown', '모름', '계산할 수 없음 — 세무사 확인'],
    ],
  },
  {
    id: 'secondValue',
    section: '특례 대상 주택의 공시가격',
    q: '특례 대상 주택(일시적 2주택의 새 집·상속주택·지방 저가주택, 또는 부속토지)의 공시가격은 얼마인가요? (원)',
    sub: '앞서 입력한 합계에 들어 있는 금액입니다. 합계에서 이 금액을 뺀 나머지를 주된 주택으로 계산합니다. 이 특례는 올해 9월 16일~30일에 1세대 1주택자 특례 신청을 했거나 할 예정이어야 적용됩니다 — 신청 여부는 묻지 않고, 신청하는 것으로 보고 계산합니다.',
    showIf: (a) => a.ownerType !== 'corporate' && (compIsDeemed(a)),
    numeric: true, money: true,
    placeholder: '예: 600,000,000',
  },
  /* 나이·보유기간은 «모름» 이 가능하다 — 모름이면 키를 보내지 않고, 엔진이 공제 없이 계산하며 경고를 낸다(차단이 아니다). */
  {
    id: 'ownerAge',
    section: '나이 (세액공제)',
    q: '주택 소유자의 나이가 어떻게 되나요? (만 나이)',
    sub: '1세대 1주택자는 만 60세 이상이면 연령별 세액공제를 받습니다(60~65세 20%, 65~70세 30%, 70세 이상 40%, 종부세법 §9⑥). 아래 보유기간 공제와 합쳐 최대 80%까지 공제됩니다. 60세 미만이면 그대로 입력하세요. 나이를 모르면 「모름」을 눌러 주세요 — 연령 공제 없이 계산하고 알려 드립니다.',
    showIf: (a) => a.ownerType !== 'corporate' && (a.housingCount === 'one' || compIsDeemed(a)),
    numeric: true, unknownId: 'ownerAgeUnknown', min: 1, max: 120,
    placeholder: '예: 62',
  },
  {
    id: 'holdingYears',
    section: '보유기간 (세액공제)',
    q: '그 주택을 몇 년 보유하셨나요?',
    sub: '1세대 1주택자는 5년 이상 보유하면 보유기간별 세액공제를 받습니다(5~10년 20%, 10~15년 40%, 15년 이상 50%, 종부세법 §9⑧). 위 연령 공제와 합쳐 최대 80%까지 공제됩니다. 5년 미만이면 그대로 입력하세요(1년 미만이면 0). 모르면 「모름」을 눌러 주세요 — 보유 공제 없이 계산하고 알려 드립니다.',
    showIf: (a) => a.ownerType !== 'corporate' && (a.housingCount === 'one' || compIsDeemed(a)),
    numeric: true, unknownId: 'holdingYearsUnknown', allowZero: true,
    placeholder: '예: 8',
  },
  {
    id: 'ownership',
    section: '명의 (단독 / 부부 공동)',
    q: '이 주택의 명의는 어떻게 되어 있나요?',
    sub: '부부 공동명의 1주택은 부부가 각자 공제(각 9억, 합 18억)를 받아(종부세법 §8①) 단독명의(12억)보다 유리할 수 있습니다. 다만 1세대1주택 연령·보유 세액공제는 공동명의 1주택자 특례(§10의2) 신청 시 받을 수 있어, 둘 중 유리한 쪽을 자동 비교해 드립니다. 2채 특례(의제)인 경우의 부부 공동명의는 이 계산기가 지원하지 않아 세무사 확인을 안내합니다.',
    showIf: (a) => a.ownerType !== 'corporate' && (a.housingCount === 'one' || compIsDeemed(a)),
    opts: [
      ['single', '단독명의', '1세대1주택 공제 12억'],
      ['joint', '부부 공동명의', '각 9억(합 18억) vs 특례 12억 자동 비교'],
    ],
  },
  {
    id: 'ownShare',
    section: '본인 지분율',
    q: '부부 공동명의 중 본인 지분율은 몇 %인가요?',
    /* 종전 「비워두면 50%로 봅니다」는 이제 거짓이다 — 비우면 계산하지 않는다 */
    sub: '본인이 가진 지분 비율입니다. 보통 50%이며, 나머지는 배우자 지분으로 계산합니다. 등기부등본의 「지분」란에 적혀 있어요. 비워 두시면 세액이 크게 갈려(50%면 65만원, 30%면 159만원) 금액 대신 안내를 드립니다.',
    showIf: (a) => a.ownerType !== 'corporate' && (a.housingCount === 'one' && a.ownership === 'joint'),
    numeric: true, optional: true,
    placeholder: '예: 50',
  },
  /* 선택 문항 둘 — 비우면 키를 보내지 않는다(엔진이 «모름» 으로 보고 추정·상한 없이 계산하며 경고를 낸다). */
  {
    id: 'priorYearTotalTax',
    section: '세부담 상한 (직전 연도 세액)',
    q: '작년에 이 주택(들)의 재산세 본세와 종합부동산세(농어촌특별세 제외)를 합치면 얼마였나요? (원, 선택)',
    sub: '세부담 상한(종부세법 §10, 직전 연도의 150%)을 계산하려면 필요합니다. 작년 재산세 고지서의 본세와 종부세 고지서의 종합부동산세액을 더해 주세요. 작년에 없었거나 모르면 비워 두세요 — 상한 없이 계산하고 알려 드립니다(공시가격이 크게 올랐다면 실제 세액은 더 적을 수 있습니다).',
    numeric: true, money: true, optional: true,
    placeholder: '예: 3,000,000',
  },
  {
    id: 'propertyTaxPaid',
    section: '올해 재산세 (재산세 공제)',
    q: '올해 7·9월 재산세 고지서의 주택분 재산세 본세를 모두 합하면 얼마인가요? (원, 선택)',
    sub: '도시지역분·지방교육세는 뺀 재산세 본세만 더해 주세요. 종부세는 같은 주택에 낸 재산세만큼을 빼 주므로(종부세법 §9③) 실제 금액을 넣으면 더 정확해집니다. 비워 두면 엔진이 추정해 계산하고 알려 드립니다.',
    numeric: true, money: true, optional: true,
    placeholder: '예: 2,000,000',
  },
  {
    id: 'context',
    section: '추가 사항',
    q: '추가로 알려주실 내용이 있나요? (선택)',
    sub: '합산배제 임대주택, 토지 종부세 등 특수한 사정이 있으면 적어주세요. 상담 시 참고합니다.',
    freeform: true, optional: true,
    placeholder: '예: 임대사업자 등록 주택',
  },
];

/* 불확정 입력 차단 — 다른 계산기와 같은 규약 `(answers, calc)`.
   ★ 「고지만 하고 계산은 한다」로 갔다가 되돌렸다 (260806 Codex R19 P1).
   부부 공동명의 지분은 «압도적 다수가 50%»라 고지로 충분하다고 봤는데, 화면은 그 숫자에
   「정밀 계산 (JT택스랩 엔진)」 딱지를 붙인다. 노란 경고 한 줄로 상쇄되지 않는다.
   실측(POST /v1/calc/comprehensive, 공시 20억·1주택): 지분 50% 655,200 / 30% 1,593,000 (2.4배).
   다른 계산기에 「모르면 막는다」를 적용해 놓고 여기만 예외를 두면 그건 규칙이 아니라 변덕이다.
   261011: 자체 계산식(폴백)을 삭제했다 — 두 층이다. ①입력 불확정(calc.precise 와 무관) ②엔진 값 없음(calc.precise 가 거짓이면 항상 한 건).
   ①층은 mapAnswersToComprehensive 가 null 을 돌려주는 입력과 «같은 규칙»이어야 한다(시험이 전수로 대조한다).
   ⚠️ 이 함수는 자기완결이어야 한다(tests_fallback_block.js 가 함수 본문만 꺼내 실행한다) — 다른 모듈 함수를 부르지 않는다. */
function compFallbackGaps(answers, calc) {
  if(answers.ownerType==='corporate') {
    const n=Number(answers.corporateHouseCount),v=Number(answers.totalValue);
    if(!['일반','공익법인_직접사용','공공주택사업자등','공익법인_기타'].includes(answers.corporateType)||!Number.isSafeInteger(n)||n<1||!Number.isSafeInteger(v)||v<0)return ['법인 유형·정확한 주택 수·공시가격을 확인해 주세요.'];
    for(const key of ['propertyTaxPaid','priorYearTotalTax'])if(answers[key]!=null&&String(answers[key]).trim()!==''&&(!Number.isSafeInteger(Number(answers[key]))||Number(answers[key])<0))return ['재산세·전년도 세액은 0 이상의 정수로 입력해 주세요.'];
    answers={...answers,housingCount:'three',deemedOneHouse:'no',ownership:'sole'};
  }

  const share = Number(answers.ownShare);
  /* §8④ 의제: 2채일 때만 의미가 있다. 미응답(빠른 계산 단계)·「아니요」는 일반 2주택이다. 「모름」·목록 밖의 값은 막는다. */
  const dm = answers.housingCount === 'two' ? answers.deemedOneHouse : undefined;
  const dmAsked = dm !== undefined && dm !== null && dm !== '' && dm !== 'no';
  const dmKnown = dm === 'temp' || dm === 'inherit' || dm === 'rural' || dm === 'land';
  const tv = Number(answers.totalValue) || 0;
  const second = Number(answers.secondValue) || 0;
  const unknown = window.jtFallbackGaps([
    /* 조건을 «계산이 지분을 실제로 쓰는 경우»와 일치시킨다 — 1주택일 때만 쓴다.
       2주택으로 바꿔도 state 에 joint 가 남아 엉뚱한 안내가 뜨던 것도 함께 막는다 (R19 P2). */
    { when: answers.housingCount === 'one' && answers.ownership === 'joint'
            && !(share > 0 && share < 100),
      why: '부부 공동명의인데 본인 지분율이 없습니다 — 지분에 따라 세액이 크게 갈립니다(실측: 50%면 65만원, 30%면 159만원). 등기부등본의 「지분」란에서 확인해 입력해 주세요.' },
    { when: dmAsked && !dmKnown,
      why: '1세대 1주택 의제 여부에 따라 공제 12억/9억과 세액공제가 갈립니다 — 일시적 2주택·상속주택·지방 저가주택·부속토지(종부세법 §8④)에 해당하는지는 세무사 확인이 필요해, 짐작으로 금액을 내지 않습니다.' },
    { when: dmKnown && answers.ownership === 'joint',
      why: '2주택 특례(의제) 주택이 부부 공동명의인 경우는 이 계산기가 지원하지 않습니다 — 세무사 확인이 필요해, 짐작으로 금액을 내지 않습니다.' },
    { when: dmKnown && !(second > 0),
      why: '특례 대상 주택의 공시가격이 없습니다 — 앞서 입력한 합계 중 그 주택의 공시가격을 입력해 주세요.' },
    { when: dmKnown && second > 0 && !(tv > second),
      why: '앞서 입력한 공시가격 합계가 특례 대상 주택의 공시가격 이하입니다 — 합계에는 주된 주택과 특례 대상 주택이 모두 들어 있어야 합니다. 두 금액을 다시 확인해 주세요.' },
  ]);
  /* ── ② 엔진 값이 없으면 어떤 입력이든 막는다 ──────────────────────────────
     엔진이 준 상태: needs_input(입력 보완) · unsupported/refused(세무사 확인) · 그 밖(down: 연결 실패·내부 오류·깨진 응답).
     엔진이 준 오류 문구(calc.engineMessage)는 그대로 보인다. */
  if (calc.precise) return unknown;
  const st = calc.engineState;
  return unknown.concat([st === 'needs_input'
    ? '입력이 더 필요합니다 — ' + (window.jtEngineMessageForDisplay(calc.engineMessage) || '이 계산기가 금액을 확정할 수 없는 조건입니다. 「← 이전」으로 돌아가 답을 보완하시거나 상담으로 확인해 주세요.')
    : (st === 'unsupported' || st === 'refused')
    ? '세무사 확인이 필요한 조건입니다 — ' + (window.jtEngineMessageForDisplay(calc.engineMessage) || '이 계산기가 금액을 확정할 수 없는 조건입니다. 상담으로 확인해 주세요.')
    : '계산 엔진에 연결하지 못했습니다 — 연결되지 않은 상태에서는 금액을 표시하지 않습니다.']);
}

/* answers → 엔진 요청 바디 (POST /v1/calc/comprehensive). 모르는 사실은 «보내지 않는다»가 아니라 «요청을 만들지 않는다»(null) —
   엔진이 기본값으로 확정하지 않게 하고, 호출 전 게이트(compFallbackGaps ①층)가 먼저 막는다.
   · 주택 수: 1채 → [합계]·count 1·is_one_house / 2채 «아니요»·미응답 → [합계]·count 2 / 3채 이상 → [합계]·count 3
   · 2채 + 의제(temp·inherit·rural·land) → [합계 − 특례 대상, 특례 대상]·one_house_exceptions ["", 유형]·is_one_house true·count(부속토지 2, 그 밖 1)
     (특례 대상 공시가격이 없거나 합계 이하면, 「모름」이거나 목록 밖의 값이면 null)
   · 나이·보유기간: 1세대 1주택(또는 의제)일 때만, 「모름」·비움이면 키를 보내지 않는다(엔진이 공제 없이 계산하고 알린다). 보유기간 0 은 보낸다.
   · 공동명의: 1채일 때만 ownership_share(지분 0<x<100 %), 지분이 없으면 null. 2채 의제 + 공동명의는 null(지원하지 않는다)
   · 선택: property_tax_paid(양수일 때), prior_year_total_tax(양수일 때) — 비우면 보내지 않는다. tax_year 는 보내지 않는다(엔진 기본 2026).
   ⚠️ 이 함수는 자기완결이어야 한다(tests_acq_holding.js 가 함수 본문만 꺼내 실행한다). */
function mapAnswersToComprehensive(a) {
  if(a.ownerType==='corporate') {
    const n=Number(a.corporateHouseCount),v=Number(a.totalValue);
    if(!['일반','공익법인_직접사용','공공주택사업자등','공익법인_기타'].includes(a.corporateType)||!Number.isSafeInteger(n)||n<1||!Number.isSafeInteger(v)||v<0)return null;
    const body={housing_values:[v],housing_count:n,is_corporate:true,corporate_type:a.corporateType,is_one_house:false};
    for(const [key,field] of [['propertyTaxPaid','property_tax_paid'],['priorYearTotalTax','prior_year_total_tax']]) {
      if(a[key]==null||String(a[key]).trim()==='')continue;
      if(!Number.isSafeInteger(Number(a[key]))||Number(a[key])<0)return null;
      body[field]=Number(a[key]);
    }
    return body;
  }

  const countMap = { one: 1, two: 2, three: 3 };
  const deemedType = { temp: '일시적2주택_신규', inherit: '상속주택', rural: '지방저가주택', land: '부속토지' };
  const tv = Number(a.totalValue) || 0;
  const dm = a.housingCount === 'two' ? a.deemedOneHouse : undefined;
  let body;
  let credit = false;   // 연령·보유 세액공제를 묻는 경우(1세대 1주택 또는 §8④ 의제)
  if (dm !== undefined && dm !== null && dm !== '' && dm !== 'no') {
    if (!Object.prototype.hasOwnProperty.call(deemedType, dm)) return null;   // 모름·목록 밖
    if (a.ownership === 'joint') return null;   // 의제 주택의 부부 공동명의는 엔진이 지원하지 않는다(unsupported) — 단독으로 확정하지 않는다
    const second = Number(a.secondValue) || 0;
    if (!(second > 0) || !(tv > second)) return null;
    body = {
      housing_values: [tv - second, second],
      housing_count: dm === 'land' ? 2 : 1,
      is_one_house: true,
      one_house_exceptions: ['', deemedType[dm]],
    };
    credit = true;
  } else {
    body = {
      housing_values: [tv],
      housing_count: countMap[a.housingCount] || 1,
      is_one_house: a.housingCount === 'one',
    };
    credit = a.housingCount === 'one';
  }
  if (credit) {
    const blank = (v) => v === undefined || v === null || String(v).trim() === '';
    if (a.ownerAgeUnknown !== 'yes' && !blank(a.ownerAge) && Math.floor(Number(a.ownerAge)) > 0) body.owner_age = Math.floor(Number(a.ownerAge));
    if (a.holdingYearsUnknown !== 'yes' && !blank(a.holdingYears) && Number.isFinite(Number(a.holdingYears)) && Number(a.holdingYears) >= 0) body.holding_years = Number(a.holdingYears);
  }
  // 부부 공동명의 1주택 → 본인 지분율 전달(엔진이 §8① 지분별 vs §10의2 특례 비교)
  if (a.housingCount === 'one' && a.ownership === 'joint') {
    const pct = Number(a.ownShare);
    if (!(pct > 0 && pct < 100)) return null;   // 지분을 모르면 요청을 만들지 않는다(50% 로 짐작하지 않는다)
    body.ownership_share = pct / 100;
  }
  if (Number(a.propertyTaxPaid) > 0) body.property_tax_paid = Number(a.propertyTaxPaid);
  if (Number(a.priorYearTotalTax) > 0) body.prior_year_total_tax = Number(a.priorYearTotalTax);
  return body;
}

/* ══════════════════════════════════════════════════════════════════════════
   엔진 결과 → calc (261011 오너 방침: 프론트의 자체 계산식(폴백)을 삭제한다 — 재산세·상속세·증여세·양도세·취득세 화면과 같은 방식)

   금액은 엔진(`POST /v1/calc/comprehensive`)이 준 값뿐이고, 엔진 값이 없으면 금액 필드(totalTax 등)를 아예 두지 않는다. 호출 결과는 다섯 갈래다.
     · 유효 응답   — HTTP 200 + 오류 없음 + calc.상태 가 'ok'(상태 키가 없으면 유효 응답이 아니다) + 필수 숫자 키(세액·종부세합계·농어촌특별세, 주택분.과세표준·세액·순세액) → precise:true
     · 입력 보완   — calc.상태 'needs_input' → engineState:'needs_input', engineMessage(엔진이 준 오류 문구)
     · 지원 안 함  — calc.상태 'unsupported' → engineState:'unsupported', engineMessage
     · 거부        — 상태 키가 없음(형식 오류)·상태가 알 수 없는 값·ok 인데 오류 필드가 있음, 또는 HTTP 4xx(408·429 제외) → engineState:'refused'
     · 연결 실패   — 네트워크 오류·타임아웃·HTTP 5xx·408·429·calc 없음·깨진 응답·상태 'error'(엔진 내부 실패)·필수 키 무효 → engineState:'down'
   ⚠️ 이 선언들은 시험(tests_calc_response.js)이 «이 함수 + COMP_ENGINE_REQUIRED» 만 꺼내 실행한다 — 다른 모듈 상수·함수를 부르지 않는다.
   ══════════════════════════════════════════════════════════════════════════ */
const COMP_ENGINE_REQUIRED = ['세액', '종부세합계', '농어촌특별세'];
function compEngineVerdict(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'down';
  /* 새 엔진은 항상 «상태» 를 낸다 — 상태 키가 없는 응답은 금액으로 받지 않는다(연결은 됐고 형식이 맞지 않는 것이므로 down 이 아니라 refused). */
  if (!Object.prototype.hasOwnProperty.call(c, '상태')) return 'refused';
  if (c['상태'] === 'needs_input') return 'needs_input';
  if (c['상태'] === 'unsupported') return 'unsupported';
  if (c['상태'] === 'error') return 'down';
  if (c['상태'] !== 'ok') return 'refused';
  if (c['오류'] || c.error || c.errors || c.detail || c.success === false) return 'refused';
  if (!window.jtValidCalc(c, COMP_ENGINE_REQUIRED) || !window.jtValidCalc(c['주택분'], ['과세표준', '세액', '순세액'])) return 'down';
  /* 세부담 상한이 «적용» 이라면서 상한액이 유한한 0 이상의 숫자가 아니면 불완전한 응답이다 — 0원 상한으로 보이지 않게 down. 상한 객체가 없으면 미적용으로 본다. */
  const lim = c['주택분']['세부담상한'];
  if (lim && typeof lim === 'object' && !Array.isArray(lim) && lim['적용'] === true && !(typeof lim['상한액'] === 'number' && Number.isFinite(lim['상한액']) && lim['상한액'] >= 0)) return 'down';
  return 'ok';
}
function compCalcFromEngine(ej) {
  const c = ej && ej.calc;
  const verdict = compEngineVerdict(c);
  if (verdict === 'down') return { precise: false, engineState: 'down' };
  if (verdict !== 'ok') {
    if (!Object.prototype.hasOwnProperty.call(c, '상태')) return { precise: false, engineState: 'refused', engineMessage: '엔진 응답 형식이 맞지 않습니다(상태 없음) — 잠시 후 다시 시도하거나 상담을 이용하세요' };
    const msg = [c['오류'], c.error].find(x => typeof x === 'string' && x.trim());
    return { precise: false, engineState: verdict, engineMessage: msg ? msg.trim() : '' };
  }
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x)) ? x : {};
  const num = (x) => (typeof x === 'number' && Number.isFinite(x) && x >= 0) ? x : 0;
  const h = obj(c['주택분']);
  const cr = obj(c['세액공제율']);
  const lim = obj(h['세부담상한']);
  const j = obj(c['공동명의']);
  return {
    precise: true, engineVer: ej.version && ej.version.engine,
    totalTax: c['세액'], compTotal: c['종부세합계'], ruralTax: c['농어촌특별세'],
    taxBase: h['과세표준'], grossTax: h['세액'], propTaxCredit: num(h['재산세공제']), taxCredit: num(h['세액공제']),
    creditExcluded: num(h['세액공제제외분']), beforeLimit: num(h['상한전세액']),
    limitApplied: lim['적용'] === true, limitAmount: num(lim['상한액']),
    netTax: h['순세액'],
    ageCreditRate: cr['연령'], holdingCreditRate: cr['보유'], combinedCreditRate: cr['합산'],
    payPeriod: typeof c['납부기간'] === 'string' ? c['납부기간'] : '',
    installmentOk: c['분납가능'] === true, installmentMax: num(c['분납가능액']),
    steps: Array.isArray(c['단계별계산']) ? c['단계별계산'] : [],
    engineWarnings: Array.isArray(c['경고사항']) ? c['경고사항'] : [],   // 엔진이 알리는 가정·경고(모름 처리·재산세 추정·세부담 상한 미적용 등) — 결과 화면에 그대로 보인다
    joint: j['적용'] === true ? j : null,   // 부부 공동명의 비교(선택경로·양 경로 세액)
  };
}
/* 호출 자체가 던진 예외 — HTTP 4xx(callCompEngine 이 status 를 달아 던진다)는 엔진의 «거부», 그 밖은 «연결 실패».
   408(시간 초과)·429(호출 제한)는 입력 문제가 아니라 일시적 상태다 — 다시 시도를 안내한다. */
function compCalcFromEngineError(e) {
  return (e && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429)
    ? { precise: false, engineState: 'refused', engineMessage: '' }
    : { precise: false, engineState: 'down' };
}

/* 입력 요약 줄 — 상담 전송(상세·카카오)이 같이 쓴다. 「모름」 보조 답(unknownId)이 켜진 문항은 «모름» 으로 보인다. */
function compAnswerLines(answers, prefix, skipId) {
  const L = [];
  COMP_QS.forEach(q => {
    if (q.id === skipId) return;
    if (q.showIf && !q.showIf(answers)) return;
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (q.unknownId && answers[q.unknownId] === 'yes') { L.push(prefix + ql + ': 모름'); return; }
    const val = answers[q.id];
    if (val === undefined || val === null || val === '') return;
    let v = val;
    if (q.opts) { const o = q.opts.find(x => x[0] === val); if (o) v = o[1]; }
    else if (q.numeric && q.money) v = formatWon(Number(val));
    L.push(prefix + ql + ': ' + v);
  });
  return L;
}

function buildCompDetail(answers, calc, commentary) {
  const L = ['■ 고객 입력 정보'].concat(compAnswerLines(answers, '  · ', null));
  L.push('', '■ 계산 결과 (검증 엔진)');
  L.push('  · 주택분 과세표준: ' + formatWon(calc.taxBase) + ' (공시합계 − 공제 × 공정비율 60%)');
  L.push('  · 주택분 산출세액: ' + formatWon(calc.grossTax));
  if (calc.propTaxCredit > 0) L.push('  · 재산세 공제(§9③ 이중과세 조정): −' + formatWon(calc.propTaxCredit));
  if (calc.taxCredit > 0) L.push('  · 세액공제(연령+보유): −' + formatWon(calc.taxCredit) + ' (합산 ' + (calc.combinedCreditRate || '') + ')');
  if (calc.creditExcluded > 0) L.push('  · 세액공제 제외분(§9⑦·⑨ 의제 주택분 안분): ' + formatWon(calc.creditExcluded));
  if (calc.limitApplied) L.push('  · 세부담 상한 적용(§10): 상한 전 ' + formatWon(calc.beforeLimit) + ' → 상한액 ' + formatWon(calc.limitAmount));
  L.push('  · 종합부동산세: ' + formatWon(calc.netTax));
  L.push('  · 농어촌특별세(종부세의 20%): ' + formatWon(calc.ruralTax));
  L.push('  · 총 납부세액: ' + formatWon(calc.totalTax));
  if (calc.payPeriod) L.push('  · 납부기간: ' + calc.payPeriod + (calc.installmentOk ? ' (분납 가능' + (calc.installmentMax > 0 ? ' — 분납가능액 ' + formatWon(calc.installmentMax) : '') + ', §20)' : ' (분납 대상 아님)'));
  if (calc.joint) {
    const j = calc.joint;
    const selfPct = Math.round((j['본인지분'] || 0.5) * 100);
    L.push('', '■ 부부 공동명의 비교 (본인 ' + selfPct + '% · 배우자 ' + (100 - selfPct) + '%)');
    L.push('  · ① 지분별 과세(각 9억 · §8①): ' + formatWon(j['지분별과세_8조1항']));
    L.push('  · ② 공동명의 특례(12억+세액공제 · §10의2): ' + formatWon(j['공동명의특례_10조의2']));
    L.push('  · 적용 결과(유리한 쪽): ' + (j['선택경로'] || '') + ' = ' + formatWon(calc.totalTax));
  }
  const ew = calc.engineWarnings || [];
  if (ew.length) { L.push('', '■ 경고'); ew.forEach(w => L.push('  · ' + w)); }
  L.push('', '■ 자동 분석');
  if (commentary.headline) L.push('  요약: ' + commentary.headline);
  (commentary.cautions || []).forEach(c => L.push('  · [주의] ' + c.title + ': ' + c.detail));
  return L.join('\n');
}

function buildCompKakao(answers, calc) {
  const L = ['[JT택스랩 종합부동산세 계산 — 상담 요청]', '', '▶ 입력'].concat(compAnswerLines(answers, '· ', 'context'));
  if (answers.context) L.push('· 추가: ' + answers.context);
  L.push('', '▶ 계산 결과', '· 총 납부세액: ' + formatWon(calc.totalTax), '', '상담 부탁드립니다.');
  return L.join('\n');
}

async function callCompEngine(body) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  const delays = [1000, 2000, 4000, 8000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const to = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
      const res = await fetch(base + '/v1/calc/comprehensive', {
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

function JTReportComprehensive({ setRoute, onBack }) {
  const [step, setStep] = useCompState(0);
  const [answers, setAnswers] = useCompState({});
  const [loading, setLoading] = useCompState(false);
  const [report, setReport] = useCompState(null);
  const [err, setErr] = useCompState(null);
  const [phase, setPhase] = useCompState('quick');
  const [quickReport, setQuickReport] = useCompState(null);
  const [laddr, setLaddr] = useCompState('');
  const [lbusy, setLbusy] = useCompState(false);
  const [linfo, setLinfo] = useCompState(null);
  const [addedCount, setAddedCount] = useCompState(0);
  const [unitAsk, setUnitAsk] = useCompState(null); // 260720: 세대 여럿 → 동·호 되묻기
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

  // 종부세는 여러 채 합계 → 주소 1건 조회할 때마다 공시가격을 합계에 '누적' 더함
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
      // 260720: 이 주소에 세대가 여럿 — 금액을 채우지 않고 동·호를 되묻는다
      if (r && r.status === 'needs_unit') { setUnitAsk({ ...r, addr: addrNow }); return; }
      if (r && (r.status === 'unit_not_found' || r.status === 'unit_mismatch')) {
        setLinfo({ ok: false, msg: r.note || '입력하신 동·호를 찾지 못했어요. 다시 확인해 주세요.' });
        return;
      }
      // ⚠️ 260720: 종전 조건은 `if (r)`였다. 헬퍼가 실패 시에도 객체를 돌려주므로
      //    **0원을 합계에 더하고 "더했어요"라고 알리는** 상태였다(주택 채수도 1 증가).
      //    금액이 실제로 있을 때만 누적한다.
      // ⚠️ 260720 3R (Codex P1): 금액만 보고 반영하지 않는다. 응답 계약을 확인한다 —
      //    상태가 'ok'이고, 유한한 양수이며, match_quality가 허용값일 때만.
      //    (업무 규칙 재검증이 아니라 계약 검증이다 — 이건 프론트가 해야 한다)
      const contractOk = r && r.status === 'ok'
        && Number.isFinite(Number(r.amount)) && Number(r.amount) > 0
        && ['', 'exact', 'loose'].indexOf(r.matchQuality === undefined ? '' : r.matchQuality) >= 0;
      if (contractOk) {
        setUnitAsk(null);
        const prev = Number(answers.totalValue) || 0;
        const next = prev + r.amount;
        setAns('totalValue', String(next));
        const n = addedCount + 1; setAddedCount(n);
        const kindLabel = r.kind === '공동주택' ? '아파트·연립·다세대' : '단독·다가구주택';
        const ml = window.jtMatchedLabel && window.jtMatchedLabel(r.matched);
        setLinfo({ ok: true, msg: `${ml || kindLabel} 공시가격 ${formatWon(r.amount)}을 합계에 더했어요. 현재 합계 ${formatWon(next)} (주택 ${n}채 반영). 맞는지 확인하시고, 여러 채면 다음 주소를 이어서 조회하세요. ⚠️ 대단지 아파트는 동·호에 따라 공시가격이 크게 다릅니다 — 부동산공시가격알리미(realtyprice.kr)에서 내 세대 금액을 꼭 대조하세요.` });
        setLaddrSync('');
      } else {
        setLinfo({ ok: false, msg: '이 주소의 공시가격을 찾지 못했어요(상가·오피스텔·신축 등). 직접 더해 입력해 주세요.' });
      }
    } catch (e) {
      // ⚠️ 260720 2차 (Codex P0): 늦게 실패한 옛 요청이 최신 화면을 덮지 않도록
      if (!stale()) setLinfo({ ok: false, msg: e.lookupStatus ? e.message : '조회 중 오류가 발생했어요. 직접 입력해 주세요.' });
    } finally { if (!seqStale()) setLbusy(false); }   // 주소가 바뀌어도 busy는 반드시 해제
  };
  const resetAddr = () => { setAns('totalValue', ''); setAddedCount(0); setLinfo(null); setLaddrSync(''); };

  const allVisible = COMP_QS.filter(q => (!q.showIf || q.showIf(answers)) && !(answers.ownerType==='corporate' && ['housingCount','deemedOneHouse','secondValue','ownership','ownShare','ownerAge','ownerAgeUnknown','holdingYears','holdingYearsUnknown'].includes(q.id)));
  const visibleQs = phase === 'quick' ? allVisible.filter(q => q.tier === 'quick') : allVisible.filter(q => q.tier !== 'quick');
  const total = visibleQs.length;
  const safeStep = Math.min(step, total - 1);
  const cur = visibleQs[safeStep];
  const isLast = safeStep === total - 1;
  const setAns = (id, v) => setAnswers(a => ({ ...a, [id]: v }));

  const canNext = () => {
    if (!cur) return false;
    if (cur.freeform) return true;
    /* 「모름」 보조 답이 켜져 있으면 값 없이 다음으로 간다 — 모름은 차단이 아니라 «공제 없이 계산 + 엔진 고지» 다. */
    if (cur.unknownId && answers[cur.unknownId] === 'yes') return true;
    if (cur.numeric) {
      if (cur.optional) return true;
      const raw = String(answers[cur.id] == null ? '' : answers[cur.id]).trim();
      if (raw === '') return false;
      const v = Number(raw);
      if (isNaN(v)) return false;
      if (cur.max != null && v > cur.max) return false;
      return cur.allowZero ? v >= 0 : v >= (cur.min != null ? cur.min : Number.MIN_VALUE);
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
         엔진 응답 직후의 게이트는 ②엔진 값 없음(입력 보완·지원 안 함·거부·연결 실패)을 잡는다. */
      if (compFallbackGaps(answers, { precise: true }).length > 0) {
        /* precise:true 로 저장하는 이유 — 렌더가 같은 판정 함수를 다시 부르는데,
           precise:false 로 두면 ②폴백 한계 사유까지 붙어 «엔진 POST 를 멈춘 이유»와
           다른 항목이 화면에 뜬다 (260806 Codex R21 P2). preEngineBlock 은 그 상태를
           «정밀 계산 성공»과 구분하기 위한 표식이다. */
        const unknownRep = { calc: { precise: true, preEngineBlock: true }, commentary: null, quick: phase === 'quick' };
        setReport(unknownRep);
        if (phase === 'quick') setQuickReport(unknownRep);
        return;
      }
      /* ★ 엔진 값이 없으면 금액 필드가 «없는» calc 가 된다(compCalcFromEngine 주석) — 자체 계산식으로 메우지 않는다.
         유효 응답이면 precise:true, 입력 보완이면 engineState:'needs_input', 지원 안 함·거부면 'unsupported'·'refused', 연결 실패면 'down'. */
      let calc;
      const reqBody = mapAnswersToComprehensive(answers);
      if (!reqBody) {
        /* 위 ①층 게이트가 먼저 막으므로 여기까지 오지 않는다 — 요청을 만들 수 없는 불확정 입력이면 엔진을 부르지 않는다(방어) */
        calc = { precise: false, engineState: 'refused', engineMessage: '' };
      } else {
        try {
          calc = compCalcFromEngine(await callCompEngine(reqBody));
        } catch (e) {
          console.warn('종부세 엔진 호출 실패', e);
          calc = compCalcFromEngineError(e);
        }
      }

      /* ★ AI 프롬프트를 만들기 «전»에 막는다 (다른 계산기와 같은 규약) */
      if (compFallbackGaps(answers, calc).length > 0) {
        const blockedRep = { calc, commentary: null, quick: phase === 'quick' };
        setReport(blockedRep);
        if (phase === 'quick') setQuickReport(blockedRep);
        return;
      }

      if(answers.ownerType==='corporate') {
        const rep={calc,commentary:{headline:'확인한 법인 유형과 입력 사실에 따른 계산입니다.',cautions:[],saving_ideas:[],followup:['주택별 공시가격','법인 유형 확인 자료','전년도 고지서']},quick:phase==='quick'};
        setReport(rep);if(phase==='quick')setQuickReport(rep);return;
      }
      let commentary;
      try {
        if (!(window.claude && window.claude.complete)) throw new Error('claude 미가용');
        const prompt = `너는 한국 세무사다. 아래 종합부동산세 계산을 보고 JSON으로만 답하라.\n주택수:${answers.housingCount} 공시합계:${formatWon(Number(answers.totalValue) || 0)} 총세액:${formatWon(calc.totalTax)}\n{"headline":"한줄요약","cautions":[{"title":"","detail":""}],"saving_ideas":[{"title":"","detail":""}],"followup":["필요자료"]}`;
        const txt = await window.claude.complete(prompt);
        commentary = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]);
      } catch (cErr) {
        commentary = {
          headline: '종합부동산세는 매년 6월 1일 기준, 세대 보유 주택 공시가격 합계에서 공제를 뺀 금액에 부과됩니다.',
          cautions: [
            { title: '과세기준일 6월 1일', detail: '6월 1일 현재 보유한 주택으로 그 해 종부세가 정해집니다. 직전 매도·직후 매수가 그 해 부담 면에서 유리합니다(종부세법 §3).' },
            { title: '부부 공동명의', detail: '부부가 각자 공제(각 9억, 합 18억)를 받을 수 있어 1주택 공동명의가 단독명의(12억)보다 유리할 수 있습니다. 단 1세대1주택 세액공제(연령·보유)는 단독명의가 유리할 수 있어 비교가 필요합니다.' },
            { title: '세부담 상한·합산배제', detail: '세부담 상한(§10)은 직전 연도 금액을 입력한 경우에만 반영됩니다. 합산배제 임대주택(§8②)과 토지분은 본 계산에 반영되지 않았습니다 — 해당되면 상담으로 확인하세요.' },
          ],
          saving_ideas: [
            { title: '1세대 1주택 세액공제', detail: '만 60세 이상·5년 이상 보유 1세대1주택은 연령·보유 공제로 최대 80%까지 종부세가 줄어듭니다(§9⑥⑧).' },
          ],
          followup: ['주택별 공시가격(부동산공시가격알리미)', '주민등록등본(세대·주택 수)', '종부세 고지서(전년도)'],
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

  /* 연령·보유 세액공제를 받을 수 있는 경우 — 1세대 1주택, 또는 2채여도 §8④ 로 1세대 1주택자로 보는 경우 */
  const hasCredit = answers.ownerType!=='corporate' && (answers.housingCount === 'one' || compIsDeemed(answers));

  if (loading) {
    return (
      <div className="jt-container">
        <JTReportShell title="종합부동산세 계산" subtitle="검증 엔진으로 계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="LIVE">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />검증된 세금 엔진으로 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc, commentary } = report;
    /* 엔진 값이 없거나(입력 보완·지원 안 함·거부·연결 실패) 입력이 불확정이면 숫자를 내지 않는다 (261011: 자체 계산식 없음). */
    const compGaps = compFallbackGaps(answers, calc);
    const compBlocked = compGaps.length > 0;
    /* 차단이면 결과 화면을 아예 만들지 않는다 — 다른 계산기와 같은 규약 */
    if (compBlocked) {
      /* 사유 구분: ①입력 불확정 → 'input' / 엔진이 입력 보완을 요구(needs_input)하거나 지원하지 않음·거부(unsupported·refused) → 'refused' / 그 밖(연결 실패·내부 오류·미지정) → 'down' */
      const compBlockReason = compFallbackGaps(answers, { precise: true }).length > 0 ? 'input'
        : ((calc.engineState === 'needs_input' || calc.engineState === 'unsupported' || calc.engineState === 'refused') ? 'refused' : 'down');
      const compBlockTag = compBlockReason === 'input' ? '정밀 계산 필요' : (calc.engineState === 'needs_input' ? '입력 보완 필요' : '세무사 확인 필요');
      return (
        <div className="jt-container">
          <JTReportShell title="종합부동산세 계산 결과" subtitle={compBlockTag} stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
            {/* 'down' 은 패널 본문이 사유를 이미 말한다 — 같은 뜻의 사유 목록을 한 번 더 내지 않는다. 엔진 오류 문구의 조문 표기(SS8(1))는 읽기 좋게 바꾼다 */}
            <JTFallbackBlocked gaps={compBlockReason === 'down' ? [] : compGaps.map(compFmtArticle)} onRetry={runAnalysis} reason={compBlockReason} />
            {/* 'refused' 패널에는 재시도 버튼이 없다 — 지원 안 함·형식 오류는 일시적일 수 있어 다시 시도할 길을 둔다(입력 보완은 «← 이전» 으로 고친다) */}
            {compBlockReason === 'refused' && calc.engineState !== 'needs_input' && (
              <div style={{ marginBottom: 12 }}><button className="jt-btn jt-btn--primary" onClick={runAnalysis}>다시 시도 →</button></div>
            )}
            <div className="jt-report-q__nav" style={{ marginTop: 16 }}>
              <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setPhase('quick'); setStep(0); setAnswers({}); }}>처음부터 다시</button>
            </div>
          </JTReportShell>
        </div>
      );
    }
    const deemedLabel = { temp: '일시적 2주택', inherit: '상속주택', rural: '지방 저가주택', land: '다른 주택의 부속토지' }[answers.deemedOneHouse];
    return (
      <div className="jt-container">
        <JTReportShell title="종합부동산세 계산 결과" subtitle="종부세 정밀 계산" stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="LIVE">
          <div className="jt-report-result__grade jt-grade-mid">
            <div className="jt-report-result__grade-label">{report.quick ? '빠른 예상 종부세(연간, 농특세 포함)' : '연간 총 납부세액 · 정밀 계산 (JT택스랩 엔진)'}</div>
            <div className="jt-report-result__grade-val">{formatWon(calc.totalTax)}</div>
          </div>

          {report.quick && answers.ownerType==='corporate' && <p>법인 유형: {answers.corporateType} · 세율 적용 주택 {answers.corporateHouseCount}채 <button className="jt-btn jt-btn--ghost" onClick={goDetail}>재산세·전년도 세액 추가 입력 →</button></p>}
          {report.quick && answers.ownerType!=='corporate' && (
            <div className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '14px 18px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}>
                <strong>기본 정보로 낸 빠른 예상치예요.</strong>{' '}
                {hasCredit
                  ? '1세대 1주택이면 만 60세 이상·5년 이상 보유 시 세액공제(최대 80%)로 세금이 크게 줄 수 있어요 — 나이·보유기간을 넣어 정확히 계산해 보세요. 이 값은 나이·보유기간을 모르는 것으로 보고 공제 없이 계산했습니다. '
                  : answers.housingCount === 'two'
                  ? '일반 2주택으로 계산했어요 — 일시적 2주택·상속주택·지방 저가주택 등 1세대 1주택자로 보는 특례(§8④)에 해당하면 세금이 크게 달라집니다(다주택은 세액공제가 없습니다). '
                  : '다주택은 세액공제가 없습니다. '}
                재산세 공제는 엔진이 추정했고, 세부담 상한은 직전 연도 금액을 넣어야 반영돼요. 부부 공동명의·합산배제 임대주택 등은 상담으로 확인하세요.
              </p>
              <button className="jt-btn jt-btn--primary" onClick={goDetail}>{hasCredit ? '나이·보유기간 넣어 정확히 →' : (answers.housingCount === 'two' ? '특례 여부 등 추가 사항 입력 →' : '추가 사항 입력 →')}</button>
            </div>
          )}

          {compIsDeemed(answers) && (
            <div style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', marginBottom: 16, borderRadius: 8, fontSize: 14, lineHeight: 1.6 }}>
              <strong>1세대 1주택 특례(§8④) 가정:</strong> {deemedLabel}을 1세대 1주택자로 보는 특례로 계산했습니다. 이 특례는 <strong>올해 9월 16일~30일에 1세대 1주택자 특례 신청</strong>을 했거나 할 예정이어야 적용됩니다.
            </div>
          )}

          <section className="jt-report-result__section">
            <h3>세금 구성 (주택분)</h3>
            <table className="jt-report-calc">
              <tbody>
                <tr><th>주택분 과세표준 (공시합계 − 공제 × 공정비율 60%)</th><td>{formatWon(calc.taxBase)}</td></tr>
                <tr><th>주택분 산출세액</th><td>{formatWon(calc.grossTax)}</td></tr>
                {calc.propTaxCredit > 0 && <tr><th>(−) 재산세 공제 (이중과세 조정 · 종부세법 §9③)</th><td>−{formatWon(calc.propTaxCredit)}</td></tr>}
                {calc.taxCredit > 0 && <tr><th>(−) 세액공제 (연령+보유, 합산 {calc.combinedCreditRate})</th><td>−{formatWon(calc.taxCredit)}</td></tr>}
                {calc.creditExcluded > 0 && <tr><th>세액공제 제외분 (의제 주택분 몫의 세액 — 세액공제 대상에서 뺌 · §9⑦·⑨)</th><td>{formatWon(calc.creditExcluded)}</td></tr>}
                {calc.limitApplied && <tr><th>세부담 상한 적용 (직전 연도 총세액상당액의 150% 한도 · 종부세법 §10) — 상한 전 {formatWon(calc.beforeLimit)} → 상한액</th><td>{formatWon(calc.limitAmount)}</td></tr>}
                <tr><th>종합부동산세</th><td>{formatWon(calc.netTax)}</td></tr>
                <tr><th>농어촌특별세 (종부세의 20%)</th><td>{formatWon(calc.ruralTax)}</td></tr>
                <tr><th><strong>연간 총 납부세액</strong></th><td><strong>{formatWon(calc.totalTax)}</strong></td></tr>
                {calc.payPeriod && <tr><th>납부기간 · 분납 (종부세법 §20)</th><td>{calc.payPeriod}{calc.installmentOk ? (calc.installmentMax > 0 ? ' · 분납 가능액 ' + formatWon(calc.installmentMax) : ' · 분납 가능') : ' · 분납 대상 아님'}</td></tr>}
              </tbody>
            </table>
            {calc.netTax === 0 && !calc.joint && (
              <div style={{ background: '#f0f7f3', padding: '10px 16px', marginTop: 10, borderRadius: 8, fontSize: 14 }}>
                {calc.taxBase === 0
                  ? <React.Fragment>공시가격 합계가 공제({hasCredit ? '1세대1주택 12억' : '9억'})보다 작거나 같아 <strong>종부세가 부과되지 않습니다</strong>(종부세법 §8).</React.Fragment>
                  : <React.Fragment>공제·상한 적용 후 <strong>납부할 종합부동산세가 없습니다</strong>.</React.Fragment>}
              </div>
            )}
          </section>

          {calc.joint && (() => {
            const j = calc.joint;
            const selfPct = Math.round((j['본인지분'] || 0.5) * 100);
            const pickShare = (j['선택경로'] || '').indexOf('지분별') >= 0;
            const rowSel = (sel) => (sel ? { fontWeight: 700, color: 'var(--accent,#2a6d4f)' } : {});
            return (
              <section className="jt-report-result__section" style={{ background: '#f0f7f3', borderLeft: '4px solid #2a6d4f', padding: '14px 18px', borderRadius: 8 }}>
                <h3 style={{ marginTop: 0 }}>부부 공동명의 비교 (본인 {selfPct}% · 배우자 {100 - selfPct}%)</h3>
                <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6 }}>
                  부부 공동명의 1주택은 ① <strong>지분별 과세</strong>(각자 9억 공제 · 종부세법 §8①)와 ② <strong>공동명의 1주택자 특례</strong>(1세대1주택자로 보아 12억 공제 + 연령·보유 세액공제 · §10의2 신청) 중 <strong>유리한 쪽</strong>으로 계산했습니다.
                </p>
                <table className="jt-report-calc">
                  <tbody>
                    <tr style={rowSel(pickShare)}><th>① 지분별 과세 (각 9억 · §8①){pickShare ? ' ✓ 선택' : ''}</th><td>{formatWon(j['지분별과세_8조1항'])}</td></tr>
                    <tr style={rowSel(!pickShare)}><th>② 공동명의 특례 (12억+세액공제 · §10의2){!pickShare ? ' ✓ 선택' : ''}</th><td>{formatWon(j['공동명의특례_10조의2'])}</td></tr>
                    <tr><th><strong>적용 결과 (유리한 쪽, 농특세 포함)</strong></th><td><strong>{formatWon(calc.totalTax)}</strong></td></tr>
                  </tbody>
                </table>
                <p style={{ margin: '10px 0 0', fontSize: 13, opacity: 0.8 }}>
                  ※ 특례(②)는 과세기준일 현재 부부가 그 1주택 외 다른 주택이 없을 때 9.16~9.30 신청 시 적용됩니다(§10의2①②). 실제 신청·적용 여부는 상담으로 확인하세요.
                </p>
              </section>
            );
          })()}

          {calc.steps && calc.steps.length > 0 && (
            <section className="jt-report-result__section">
              <h3>단계별 계산 (법조문 근거)</h3>
              <table className="jt-report-calc">
                <tbody>
                  {calc.steps.map((s, i) => (
                    <tr key={i}><th>{s['항목']}{s['조문'] ? ` · ${compFmtArticle(s['조문'])}` : ''}</th><td>{compFormatStepValue(s['항목'], s['금액'])}</td></tr>
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

          <section className="jt-report-result__section" style={{ background: '#f0f7f3', borderLeft: '4px solid #2a6d4f', padding: '12px 16px', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
              종합부동산세는 <strong>매년 6월 1일 기준 보유 주택</strong>의 공시가격 합계로 정해지며, 12월에 고지·납부합니다. 본 계산은 <strong>주택분</strong> 기준이며, 합산배제 임대주택·토지분은 반영하지 않았습니다(세부담 상한은 직전 연도 금액을 입력한 경우에만 반영) — 해당되면 상담으로 정확히 확인하세요.
            </p>
          </section>

          {commentary && commentary.headline && (
            <section className="jt-report-result__section">
              <h3>자동 분석</h3>
              <p style={{ fontWeight: 600 }}>{commentary.headline}</p>
              {(commentary.cautions || []).map((c, i) => (
                <div key={i} style={{ marginBottom: 8 }}><strong>· {c.title}</strong> — {c.detail}</div>
              ))}
            </section>
          )}

          {typeof JTReportConvert === 'function' && (
            <JTReportConvert
              calcId="comprehensive"
              completeEligible={true}
              precise={true}
              quick={report.quick}
              reportType="종합부동산세"
              reportSummary={`주택 ${answers.ownerType==='corporate' ? answers.corporateHouseCount+'채 (법인)' : answers.housingCount === 'one' ? '1채' : answers.housingCount === 'two' ? '2채' : '3채+'} 공시합계 ${formatWon(Number(answers.totalValue) || 0)} → 연 ${formatWon(calc.totalTax)}`}
              reportDetail={buildCompDetail(answers, calc, commentary)}
              kakaoSummary={buildCompKakao(answers, calc)}
              setRoute={setRoute}
            />
          )}

          <div className="jt-report-q__nav" style={{ marginTop: 16 }}>
            <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setPhase('quick'); setStep(0); setAnswers({}); }}>처음부터 다시</button>
            <button className="jt-btn jt-btn--ghost" onClick={onBack}>← 세금 계산기</button>
          </div>
        </JTReportShell>
      </div>
    );
  }

  if (!cur) { onBack(); return null; }

  return (
    <div className="jt-container">
      <JTReportShell title="종합부동산세 계산" subtitle={phase === 'quick' ? '주택수·공시가격 합계만 넣으면 예상 종부세를 바로 보여드려요.' : '1세대 1주택 특례 여부·연령·보유 세액공제·직전 연도 세액까지 반영해 더 정확히 계산합니다.'} stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="LIVE">
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

          {cur.id === 'totalValue' && (
            <div style={{ background: 'var(--bg-1,#f7f5f0)', border: '1px solid #dfe3dc', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>🔎 주소로 공시가격 자동 합산 <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 13 }}>(선택 — 아파트·빌라·단독주택)</span></div>
              <p style={{ margin: '0 0 10px', fontSize: 13, opacity: 0.8, lineHeight: 1.55 }}>보유 주택 주소를 넣고 조회하면 공시가격을 아래 합계에 더해드려요. <strong>여러 채면 한 채씩 주소를 넣어 조회를 반복</strong>하면 자동으로 합산됩니다.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="jt-report-q__input" style={{ flex: '1 1 220px', margin: 0 }} type="text"
                  placeholder="예: 서울 종로구 자하문로36길 16-14"
                  value={laddr} onChange={e => setLaddrSync(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !lbusy) doAddrLookup(); }} />
                {window.JTAddressPick && <window.JTAddressPick onPick={setLaddrSync} disabled={lbusy} />}
                {/* ⚠️ onClick={doAddrLookup} 면 React가 이벤트 객체를 unit 인자로 넘긴다 — 화살표 필수 */}
                <button className="jt-btn jt-btn--primary" style={{ flex: '0 0 auto' }} disabled={lbusy || !laddr.trim()} onClick={() => doAddrLookup()}>
                  {lbusy ? '조회 중…' : '합계에 추가'}
                </button>
              </div>
              {linfo && (
                <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.55, padding: '9px 12px', borderRadius: 8,
                  background: linfo.ok ? '#eaf5ee' : '#fff7ea', borderLeft: '4px solid ' + (linfo.ok ? '#2a6d4f' : '#d08b00') }}>
                  {linfo.msg}
                  {addedCount > 0 && <div style={{ marginTop: 6 }}><button className="jt-btn jt-btn--ghost" style={{ padding: '4px 10px', fontSize: 13 }} onClick={resetAddr}>합계 초기화</button></div>}
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
            <div>
              {/* 「모름」 보조 답(unknownId)이 켜져 있으면 입력 칸을 숨긴다 — 값을 지우지 않고 보조 답만 끈다(다시 누르면 입력 칸이 돌아온다) */}
              {!(cur.unknownId && answers[cur.unknownId] === 'yes') && (
                <JTNumericInput money={!!cur.money} className="jt-report-q__input" type="text" inputMode={cur.money ? 'numeric' : 'decimal'} placeholder={cur.placeholder || ''}
                  value={answers[cur.id]}
                  onChange={e => window.jtSetNumericAns(setAns, cur.id, e.target.value, !!cur.money)} />
              )}
              {cur.money && Number(answers[cur.id]) > 0 && (
                <div style={{ fontSize: 14, color: 'var(--accent,#2a6d4f)', marginTop: 6 }}>= {compKoreanAmountOrWon(Number(answers[cur.id]))}</div>
              )}
              {cur.unknownId && (
                <div style={{ marginTop: 10 }}>
                  <button type="button" className={'jt-report-q__opt' + (answers[cur.unknownId] === 'yes' ? ' is-selected' : '')}
                    onClick={() => setAns(cur.unknownId, answers[cur.unknownId] === 'yes' ? '' : 'yes')}>
                    <span className="jt-report-q__opt-mark">{answers[cur.unknownId] === 'yes' ? '●' : '○'}</span>
                    <span><strong>모름</strong><span style={{ opacity: 0.7 }}> · 공제 없이 계산하고 알려 드립니다</span></span>
                  </button>
                </div>
              )}
            </div>
          )}

          {cur.freeform && (
            <textarea className="jt-report-q__input" rows={3} placeholder={cur.placeholder || ''}
              value={answers[cur.id] || ''} onChange={e => setAns(cur.id, e.target.value)} />
          )}

          <div className="jt-report-q__nav">
            <button className="jt-btn jt-btn--ghost" onClick={goPrev}>← 이전</button>
            <button className="jt-btn jt-btn--primary" disabled={!canNext()} onClick={goNext}>
              {isLast ? (phase === 'quick' ? '빠른 결과 보기 →' : '결과 보기 →') : '다음 →'}
            </button>
          </div>
        </div>
      </JTReportShell>
    </div>
  );
}

/* 금액 한글 보조(억/만) — 공통 헬퍼 없으면 간단 표기 */
function compKoreanAmountOrWon(n) {
  if (typeof acqKoreanAmount === 'function') return acqKoreanAmount(n);
  if (!n || n <= 0) return '';
  const units = [[1_0000_0000_0000, '조'], [1_0000_0000, '억'], [1_0000, '만'], [1, '']];
  let rest = n, s = '';
  for (const [u, label] of units) { const q = Math.floor(rest / u); if (q > 0) { s += q.toLocaleString('ko-KR') + label + ' '; rest -= q * u; } }
  return s.trim() + '원';
}

window.JTReportComprehensive = JTReportComprehensive;

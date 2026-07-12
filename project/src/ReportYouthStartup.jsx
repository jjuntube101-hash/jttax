/* @jsx React.createElement */
/* 청년창업중소기업 세액감면 자동판단 — 조세특례제한법 §6
   엔진: /v1/calc/youth-startup (판정 트리·감면율) + /v1/lookup/industry (업종→KSIC 적격) + /v1/lookup/price(지역).
   업종(명칭검색/코드입력)·지역(주소 자동판정)을 자동으로 채워 감면 가능여부·감면율을 진단한다.
   공통 헬퍼(formatWon·JTReportShell·JTReportConvert)는 먼저 로드된 파일의 전역 사용. */

const { useState: useYSState } = React;

/* 업종 조회 공통함수 (window.jtLookupIndustry) — 업종코드/명 → KSIC + 감면적격 */
if (typeof window !== 'undefined' && !window.jtLookupIndustry) {
  window.jtLookupIndustry = async function ({ code, keyword, compareCode } = {}) {
    const base = window.JT_ENGINE_BASE || 'http://127.0.0.1:8000';
    const res = await fetch(base + '/v1/lookup/industry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code || '', keyword: keyword || '', compare_code: compareCode || '' }),
    });
    if (!res.ok) throw new Error('industry ' + res.status);
    return res.json();
  };
}

/* 지역 조회 경량함수 (window.jtLookupRegion) — 주소 → 지역규제만(공시가 생략, 렉 해결). RegionInfo 직접 반환 */
if (typeof window !== 'undefined' && !window.jtLookupRegion) {
  window.jtLookupRegion = async function (address) {
    const base = window.JT_ENGINE_BASE || 'http://127.0.0.1:8000';
    const res = await fetch(base + '/v1/lookup/region', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address || '' }),
    });
    if (!res.ok) throw new Error('region ' + res.status);
    return res.json();   // RegionInfo (sigungu_code·is_overcrowding·overcrowding_uncertain·is_sudogwon·is_depopulation…)
  };
}

const YS_QS = [
  {
    id: 'mode', tier: 'quick', section: '시작하기',
    q: '창업 상태가 어떻게 되나요?',
    sub: '이미 창업하셨다면 감면 가능여부와 감면율을 판정해 드리고, 아직 준비 중이시면 「어떻게 창업하면 감면을 받는지」 조건을 알려드립니다. 창업 전에 미리 설계하면 5년간 세금을 크게 줄일 수 있어요.',
    opts: [
      ['done', '이미 창업했어요', '사업자등록 완료 · 내 감면율 판정'],
      ['prospective', '아직 준비 중이에요', '창업 예정 · 감면받는 법 안내'],
    ],
  },
  {
    // 직원 피드백: 사업형태(개인/법인)를 먼저 물어 흐름을 자연스럽게
    id: 'entityType', tier: 'quick', section: '사업 형태',
    q: '개인사업자인가요, 법인인가요?',
    sub: '개인은 소득세, 법인은 법인세를 감면받습니다. 법인은 대표자가 지배주주이면서 최대주주(최대출자자)여야 「청년창업」으로 인정됩니다(시행령 §5①2호) — 정밀 단계에서 확인합니다.',
    opts: [['개인', '개인사업자', '소득세 감면'], ['법인', '법인', '법인세 감면']],
  },
  {
    id: 'foundingDate', tier: 'quick', section: '창업 시기', dateInput: true,
    datePlaceholder: '예: 2026-07-01 (숫자 8자리만 입력하면 -가 자동으로 붙어요)',
    q: '언제 창업하셨나요(또는 창업 예정일)?',
    qP: '창업 예정 시기가 대략 언제인가요? (아직 미정이면 건너뛰세요)',
    sub: '창업일이 2027년 12월 31일 이내여야 이 감면을 받을 수 있습니다(조특법 §6①). 또 2025년 12월 31일 이전 창업과 2026년 1월 1일 이후 창업은 감면율 체계가 다릅니다 — 2026년부터는 수도권·인구감소지역을 더 세밀하게 나눠 감면율을 정합니다. 사업자등록일(개인) 또는 법인설립일(법인)을 넣으세요.',
    subP: '아직 안 정하셨어도 괜찮아요. 2027년 12월 31일 이내에 창업하면 감면 대상입니다. 미정이면 건너뛰고 진행하세요 — 언제까지 창업해야 하는지 안내해 드릴게요.',
    optionalP: true,
  },
  {
    id: 'birthDate', tier: 'quick', section: '대표자 나이', dateInput: true,
    q: '대표자(창업자)의 생년월일은 언제인가요?',
    sub: '창업 당시 만 15~34세이면 「청년창업」으로 감면율이 가장 높습니다(시행령 §5①). 병역을 이행했다면 그 기간(최대 6년)을 나이에서 빼고 계산하므로, 병역 마친 분은 만 34세를 넘어도 청년으로 인정될 수 있습니다(정밀 단계에서 병역기간 입력). 만 34세를 넘으면 「일반 창업중소기업」으로 감면율이 낮아지지만, 연 수입 1억 4백만원 이하이면 소규모 특례로 청년과 같은 높은 감면율을 받을 수 있습니다(§6⑥).',
  },
  {
    id: 'industry', tier: 'quick', section: '업종', custom: 'industry',
    q: '어떤 업종인가요?',
    qP: '어떤 업종으로 창업하려고 하세요? (아직 안 정했으면 건너뛰기)',
    sub: '이 감면은 정해진 18개 업종(제조·건설·정보통신·통신판매·음식점·전문과학기술·사회복지 등)만 대상입니다(§6③). 부동산임대업·전문직(변호사·세무사 등)·유흥주점·비디오감상실·가상자산 매매중개 등은 제외됩니다. 업종명으로 찾거나, 사업자등록증의 6자리 업종코드를 직접 넣으면 국세청 업종코드↔한국표준산업분류(KSIC) 연계표로 감면대상 여부를 자동 판정합니다.',
    subP: '감면대상 18개 업종(제조·정보통신·통신판매(온라인쇼핑몰)·음식점·전문과학기술·사회복지 등)이면 감면됩니다. 아직 업종을 안 정했으면 건너뛰세요 — 어떤 업종이 감면대상인지 알려드릴게요. 부동산임대·전문직(변호사·세무사)·유흥주점 등은 제외입니다.',
  },
  {
    id: 'foundingRegion', tier: 'quick', section: '창업 지역', custom: 'region',
    q: '창업(사업장) 주소는 어디인가요?',
    qP: '어느 지역에서 창업할지 고민 중이신가요? (미정이면 건너뛰기)',
    sub: '감면율은 지역에 따라 크게 달라집니다. 주소만 넣으면 수도권과밀억제권역·수도권·인구감소지역 여부를 자동으로 판정합니다. 2026년 이후 창업 기준으로 청년은 수도권 밖·수도권 인구감소지역 100%, 수도권 75%, 과밀억제권역 50%입니다. 인구감소지역인지 스스로 알기 어려운데, 우리는 주소로 자동 판별합니다.',
    subP: '어디서 창업하느냐가 감면율을 좌우합니다. 후보 지역 주소를 넣으면 그 지역 감면율을 판정하고, 미정이면 건너뛰세요 — 지역별로 몇 %인지 비교표를 보여드릴게요.',
  },
  // ── 정밀(detail) ──
  {
    id: 'isLargestShareholder', tier: 'detail', section: '법인 최대주주',
    q: '대표자가 이 법인의 최대주주(최대출자자)이자 지배주주인가요?',
    sub: '법인으로 창업한 경우, 대표자가 지배주주등이면서 해당 법인의 최대주주 또는 최대출자자여야 「청년창업중소기업」으로 인정됩니다(시행령 §5①2호). 이 요건을 감면기간 중 잃으면 감면율이 낮아집니다(§5②).',
    showIf: (a) => a.entityType === '법인',
    opts: [['yes', '네, 최대주주이자 지배주주', '청년율 적용'], ['no', '아니오 (최대주주 아님)', '일반율'], ['unknown', '잘 모르겠어요', '확인 시 청년율 가능']],
  },
  {
    // 직원 피드백 #1·#2: 병역을 1차(quick)로 이동(청년판정에 직접 영향) + 입대일·전역일로 개월 자동계산
    id: 'military', tier: 'quick', section: '병역', custom: 'military', optional: true, optionalP: true,
    q: '병역을 이행하셨나요? (선택)',
    sub: '군 복무 등 병역 이행기간(최대 6년)은 창업 당시 나이에서 빼고 청년 여부를 판정합니다(시행령 §5①1호). 입대일·전역일을 넣으면 개월 단위로 정확히 계산합니다. 예를 들어 만 36세에 창업했어도 병역 2년을 마쳤다면 34세로 보아 청년으로 인정됩니다. 병역 미해당이면 건너뛰세요. 산업기능요원 등은 제외될 수 있으니(조심2021중6680) 상담에서 확인하세요.',
  },
  {
    id: 'existingBusinessAdd', tier: 'detail', section: '기존 사업자 여부',
    q: '이미 사업자등록이 있는 상태에서 거기에 업종을 추가하는 건가요?',
    sub: '⚠️ 매우 중요합니다. 기존 사업자등록에 업종을 추가하는 경우는 그 업종이 무엇이든(세분류가 달라도) 「창업」으로 인정되지 않습니다(§6⑩4호). 완전히 별도의 신규 사업자등록을 내야 창업 감면을 받을 수 있습니다. 많은 분들이 여기서 감면을 놓칩니다.',
    opts: [
      ['no', '아니오 — 완전히 새로 사업자등록', '창업 인정 가능'],
      ['yes', '네 — 기존 사업자에 업종추가', '창업 불인정(§6⑩4호)'],
    ],
  },
  {
    id: 'businessType', tier: 'detail', section: '창업 유형',
    q: '창업 형태가 다음 중 어디에 해당하나요?',
    sub: '다음은 「창업으로 보지 않는」 경우입니다(§6⑩): ①법인전환 ②폐업 후 같은 종류 사업 재개 ③다른 사람 사업을 승계·자산인수. 특히 폐업 후 재개는 폐업 전과 한국표준산업분류 「세분류」가 같으면 배제되는데(시행령 §5㉓), 우리는 종전 업종코드와 비교해 자동 판정합니다.',
    opts: [
      ['신규창업', '순수 신규 창업', '문제 없음'],
      ['법인전환', '개인사업을 법인으로 전환', '창업 배제(§6⑩2호)'],
      ['폐업후재개', '폐업 후 다시 사업 시작', '세분류 동일 시 배제'],
      ['사업승계', '기존 사업 승계·자산인수', '동종이면 배제(자산인수 30%↓만 예외)'],
    ],
  },
  {
    id: 'priorBusinessCode', tier: 'detail', section: '종전 업종코드', custom: 'priorindustry',
    q: '종전(폐업·승계)에 하던 사업의 업종코드나 업종명을 알려주세요',
    sub: '폐업 후 재개하거나 사업을 승계한 경우, 종전 사업과 새 사업의 한국표준산업분류 「세분류」가 같으면 창업으로 인정되지 않습니다(§6⑩③·①, 시행령 §5㉓). 종전 업종을 넣으면 신규 업종과 세분류가 같은지 자동으로 비교합니다.',
    showIf: (a) => a.businessType === '폐업후재개' || a.businessType === '사업승계',
    optional: true,
  },
  {
    id: 'annualRevenue', tier: 'detail', section: '연 수입금액', numeric: true, money: true, optional: true,
    q: '연 수입금액(매출)은 대략 얼마인가요? (선택)',
    sub: '청년이 아니어도 연 수입금액이 8천만원 이하인 「소규모」 창업이면 청년과 같은 높은 감면율을 받습니다(§6⑥, 소규모 특례). 대략적인 연 매출을 넣으면 이 특례 적용 여부를 판정합니다.',
    placeholder: '예: 80,000,000',
  },
  {
    id: 'employeeCount', tier: 'detail', section: '상시근로자', numeric: true, optional: true,
    q: '상시근로자(직원) 수는 몇 명인가요? (선택)',
    sub: '감면기간 중 상시근로자가 전년보다 늘면 「고용증가 추가감면」을 받을 수 있습니다(§6⑦, 100% 감면 연도는 제외). 광업·제조업·건설업·물류는 10명, 그 밖 업종은 5명이 업종별 기준입니다.',
    placeholder: '예: 3',
  },
  {
    id: 'expectedTax', tier: 'detail', section: '예상 세액', numeric: true, money: true, optional: true,
    q: '예상되는 연간 소득세(법인세) 산출세액이 있으면 넣어주세요 (선택)',
    sub: '감면율에 예상 산출세액을 곱하면 대략의 감면액을 추정할 수 있습니다. 다만 과세연도당 감면 한도는 5억원입니다(§6⑬). 정확한 세액은 소득·비용에 따라 달라지므로, 여기서는 참고용 추정만 제공합니다.',
    placeholder: '예: 20,000,000',
  },
  {
    id: 'context', tier: 'detail', section: '추가 사항', freeform: true, optional: true,
    q: '추가로 알려주실 내용이 있나요? (선택)',
    sub: '동업 여부, 벤처확인, 사업장 이전 계획, 여러 업종 겸업 등 특수한 사정이 있으면 적어주세요. 상담 시 참고합니다.',
    placeholder: '예: 공동대표 2인 / 벤처기업 확인 예정 / 6개월 뒤 지방 이전 계획',
  },
];

const YS_STATUS_META = {
  eligible: { label: '감면 대상 가능', color: '#2a6d4f', bg: '#eaf5ee' },
  conditional: { label: '조건부 — 확인 필요', color: '#b07b3a', bg: '#fdf6ea' },
  ineligible: { label: '현재 기준 대상 아님', color: '#c0392b', bg: '#fdeeec' },
  input_required: { label: '입력 필요', color: '#666', bg: '#f2f2f2' },
};

function ysValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const p = s.split('-').map(Number);
  const dt = new Date(p[0], p[1] - 1, p[2]);
  return dt.getFullYear() === p[0] && dt.getMonth() === p[1] - 1 && dt.getDate() === p[2];
}

// 두 ISO 날짜 사이 만 개월수(병역 입대~전역). 일 미달 시 -1(만 개월).
function ysMonthsBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  let m = (by - ay) * 12 + (bm - am);
  if (bd < ad) m -= 1;
  return Math.max(0, m);
}

async function callYouthEngine(body) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  const delays = [1000, 2000, 4000, 8000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const to = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
      const res = await fetch(base + '/v1/calc/youth-startup', {
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

function mapAnswersToYouth(a, industryMatch, region) {
  const body = {
    entity_type: a.entityType || '개인',
    business_type_founding: a.businessType || '신규창업',
  };
  if (a.mode === 'prospective') body.prospective = true;
  if (a.foundingDate) body.founding_date = a.foundingDate;
  if (a.birthDate) body.birth_date = a.birthDate;
  // 병역: 입대일·전역일 → 개월수 자동계산(military_months). 둘 다 유효할 때만, 최대 72개월(6년).
  if (a.enlistDate && a.dischargeDate && ysValidDate(a.enlistDate) && ysValidDate(a.dischargeDate)) {
    const mm = ysMonthsBetween(a.enlistDate, a.dischargeDate);
    if (mm > 0) body.military_months = Math.min(mm, 72);
  } else if (Number(a.militaryYears) > 0) {
    body.military_years = Number(a.militaryYears);   // 하위호환(구 입력)
  }
  if (a.entityType === '법인') {
    if (a.isLargestShareholder === 'yes') body.is_largest_shareholder = true;
    else if (a.isLargestShareholder === 'no') body.is_largest_shareholder = false;
    // 'unknown' 또는 미답변 → 필드 생략(None) → 엔진이 '요건 확인 필요(conditional)'로 처리
  }
  if (industryMatch && industryMatch.nts_code) body.industry_code = industryMatch.nts_code;
  if (a.existingBusinessAdd === 'yes') body.has_existing_business_add = true;
  if (a.priorBusinessCode) body.prior_business_code = a.priorBusinessCode;
  if (region) {
    body.is_overcrowding = !!region.is_overcrowding;
    body.is_sudogwon = !!region.is_sudogwon;
    body.is_depopulation = !!region.is_depopulation;
    body.overcrowding_uncertain = !!region.overcrowding_uncertain;   // 과밀 부분지정(남양주·시흥·인천 경제자유구역 등)
    if (region.sigungu_code) body.sigungu_code = region.sigungu_code;
  }
  if (Number(a.annualRevenue) > 0) body.annual_revenue = Number(a.annualRevenue);
  if (a.employeeCount !== undefined && a.employeeCount !== '') body.employee_count = Number(a.employeeCount);
  if (Number(a.expectedTax) > 0) body.expected_annual_tax = Number(a.expectedTax);
  return body;
}

function buildYSDetail(a, calc, industryMatch, region) {
  const L = ['■ 고객 입력 정보'];
  L.push('  · 창업일: ' + (a.foundingDate || '-'));
  L.push('  · 사업형태: ' + (a.entityType || '-'));
  L.push('  · 대표자 생년월일: ' + (a.birthDate || '-') + ((a.enlistDate && a.dischargeDate) ? ` (병역 ${a.enlistDate}~${a.dischargeDate})` : (a.militaryYears ? ` (병역 ${a.militaryYears}년)` : '')));
  if (industryMatch) L.push('  · 업종: ' + industryMatch.name + ' (KSIC ' + industryMatch.ksic5 + ', ' + (industryMatch.status === 'eligible' ? '감면대상' : industryMatch.status === 'review' ? '확인필요' : '대상아님') + ')');
  if (region) L.push('  · 창업지역: ' + (region.sigungu || '') + ' [' + calc.area + ']');
  if (a.businessType && a.businessType !== '신규창업') L.push('  · 창업유형: ' + a.businessType);
  if (a.existingBusinessAdd === 'yes') L.push('  · 기존 사업자 업종추가: 예');
  if (Number(a.annualRevenue) > 0) L.push('  · 연 수입금액: ' + formatWon(Number(a.annualRevenue)));
  L.push('', '■ 감면 판정 결과');
  if (calc.prospective) {
    L.push('  · [예비창업 진단] 요건 충족 시 최대 감면율: ' + calc.best_case_rate + '%');
    (calc.region_scenarios || []).forEach(s => L.push('  · 지역별 — ' + s.label + ': 청년 ' + s.youth_rate + '% / 일반 ' + s.general_rate + '%'));
    (calc.recommendations || []).forEach(r => L.push('  · [' + ({ ok: '충족', warn: '주의', info: '안내' }[r.status] || '') + '] ' + r.title));
  }
  L.push('  · 판정: ' + (YS_STATUS_META[calc.status] ? YS_STATUS_META[calc.status].label : calc.status));
  L.push('  · 감면율: ' + calc.reduction_rate + '%' + (calc.is_youth ? ' (청년창업)' : (calc.small_scale_applied ? ' (소규모 특례)' : ' (일반)')));
  L.push('  · 감면기간: ' + calc.reduction_period);
  if (calc.estimated_annual_reduction != null) L.push('  · 예상 감면액(연): ' + formatWon(calc.estimated_annual_reduction) + (calc.cap_applied ? ' (5억 한도 적용)' : ''));
  (calc.gates || []).forEach(g => L.push('  · [' + g.name + '] ' + (g.pass === true ? '통과' : g.pass === false ? '미충족' : '확인필요') + ' — ' + g.detail));
  if ((calc.warnings || []).length) { L.push('', '■ 확인·주의'); calc.warnings.forEach(w => L.push('  · ' + w)); }
  L.push('', '근거: ' + (calc.law_refs || []).join(', '));
  return L.join('\n');
}

function buildYSKakao(a, calc, industryMatch) {
  const L = ['[JT택스랩 청년창업 세액감면 진단 — 상담 요청]', '', '▶ 입력'];
  L.push('· 창업일: ' + (a.foundingDate || '-') + ' / ' + (a.entityType || '-'));
  L.push('· 대표자 생년월일: ' + (a.birthDate || '-'));
  if (industryMatch) L.push('· 업종: ' + industryMatch.name);
  L.push('', '▶ 진단', '· ' + (YS_STATUS_META[calc.status] ? YS_STATUS_META[calc.status].label : calc.status) + ' / 감면율 ' + calc.reduction_rate + '%');
  if (calc.estimated_annual_reduction != null) L.push('· 예상 감면액(연): ' + formatWon(calc.estimated_annual_reduction));
  L.push('', '상담 부탁드립니다.');
  return L.join('\n');
}

function JTReportYouthStartup({ setRoute, onBack }) {
  const [step, setStep] = useYSState(0);
  const [answers, setAnswers] = useYSState({});
  const [phase, setPhase] = useYSState('quick');
  const [loading, setLoading] = useYSState(false);
  const [report, setReport] = useYSState(null);
  const [quickReport, setQuickReport] = useYSState(null);
  const [err, setErr] = useYSState(null);
  // 업종 조회
  const [indMode, setIndMode] = useYSState('name');
  const [indKw, setIndKw] = useYSState('');
  const [indBusy, setIndBusy] = useYSState(false);
  const [indCands, setIndCands] = useYSState(null);
  const [industryMatch, setIndustryMatch] = useYSState(null);
  const [indCodeInput, setIndCodeInput] = useYSState('');
  // 종전 업종(세분류 비교)
  const [priorMatch, setPriorMatch] = useYSState(null);
  const [priorKw, setPriorKw] = useYSState('');
  const [priorBusy, setPriorBusy] = useYSState(false);
  const [priorCands, setPriorCands] = useYSState(null);
  // 지역 조회
  const [raddr, setRaddr] = useYSState('');
  const [rbusy, setRbusy] = useYSState(false);
  const [regionInfo, setRegionInfo] = useYSState(null);
  const [rinfo, setRinfo] = useYSState(null);

  React.useEffect(() => {
    const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';
    if (base) { fetch(base + '/health', { method: 'GET' }).catch(function () {}); }
  }, []);

  const allVisible = YS_QS.filter(q => !q.showIf || q.showIf(answers));
  const visibleQs = phase === 'quick' ? allVisible.filter(q => q.tier === 'quick') : allVisible.filter(q => q.tier !== 'quick');
  const total = visibleQs.length;
  const safeStep = Math.min(step, total - 1);
  const cur = visibleQs[safeStep];
  const isLast = safeStep === total - 1;
  const setAns = (id, v) => setAnswers(a => ({ ...a, [id]: v }));

  const prospective = answers.mode === 'prospective';

  const canNext = () => {
    if (!cur) return false;
    if (cur.custom === 'industry') return prospective ? true : !!industryMatch;
    if (cur.custom === 'region') return prospective ? true : !!regionInfo;
    if (cur.custom === 'priorindustry') return true; // optional
    if (cur.freeform || cur.optional) return true;
    if (prospective && cur.optionalP) return true;
    if (cur.numeric) { const v = Number(answers[cur.id]); return !isNaN(v) && v > 0; }
    if (cur.dateInput) return ysValidDate(answers[cur.id]);
    return !!answers[cur.id];
  };

  const doIndustrySearch = async () => {
    if (!indKw.trim()) return;
    setIndBusy(true); setIndCands(null);
    try {
      const r = await window.jtLookupIndustry({ keyword: indKw.trim() });
      setIndCands((r && r.candidates) || []);
    } catch (e) { setIndCands([]); } finally { setIndBusy(false); }
  };
  const doIndustryCode = async () => {
    const c = indCodeInput.trim();
    if (!c) return;
    setIndBusy(true);
    try {
      const r = await window.jtLookupIndustry({ code: c });
      if (r && r.match) { setIndustryMatch(r.match); setAns('industryCode', r.match.nts_code); setIndCands(null); }
      else { setIndustryMatch(null); setAns('industryCode', ''); setIndCands([]); }
    } catch (e) { setIndustryMatch(null); setAns('industryCode', ''); } finally { setIndBusy(false); }
  };
  const pickIndustry = (m) => { setIndustryMatch(m); setAns('industryCode', m.nts_code); setIndCands(null); };

  const doPriorSearch = async () => {
    if (!priorKw.trim()) return;
    setPriorBusy(true); setPriorCands(null);
    try {
      const r = await window.jtLookupIndustry({ keyword: priorKw.trim() });
      setPriorCands((r && r.candidates) || []);
    } catch (e) { setPriorCands([]); } finally { setPriorBusy(false); }
  };
  const pickPrior = (m) => { setPriorMatch(m); setAns('priorBusinessCode', m.nts_code); setPriorCands(null); };

  const doRegionLookup = async () => {
    if (!raddr.trim()) return;
    setRbusy(true); setRinfo(null);
    try {
      const reg = await window.jtLookupRegion(raddr.trim());   // 지역만 경량 조회(공시가 생략 → 렉 해결)
      if (reg && (reg.sigungu_code || reg.sigungu)) {
        setRegionInfo(reg);
        const parts = [];
        if (reg.is_overcrowding) parts.push('수도권과밀억제권역');
        else if (reg.overcrowding_uncertain) parts.push('수도권과밀억제권역 부분지정(법정동 확인 필요)');
        else if (reg.is_sudogwon && reg.is_depopulation) parts.push('수도권 인구감소지역');
        else if (reg.is_sudogwon) parts.push('수도권(과밀 외)');
        else parts.push('수도권 외 지역');
        if (!reg.is_sudogwon && reg.is_depopulation) parts.push('인구감소지역');
        setRinfo({ ok: true, msg: `${reg.sido || ''} ${reg.sigungu || ''} — ${parts.join(' · ')}(으)로 자동판정했어요. 감면율은 이 지역을 기준으로 계산됩니다.` });
      } else {
        setRinfo({ ok: false, msg: '이 주소의 지역을 확인하지 못했어요. 도로명/지번 주소를 정확히 넣어 다시 시도해 주세요.' });
      }
    } catch (e) {
      setRinfo({ ok: false, msg: '조회 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' });
    } finally { setRbusy(false); }
  };

  const runAnalysis = async () => {
    setLoading(true); setErr(null);
    try {
      const body = mapAnswersToYouth(answers, industryMatch, regionInfo);
      const ej = await callYouthEngine(body);
      const calc = ej && ej.calc;
      if (!calc) throw new Error('판정 결과를 받지 못했습니다.');
      const rep = { calc, quick: phase === 'quick' };
      setReport(rep);
      if (phase === 'quick') setQuickReport(rep);
    } catch (e) {
      console.error(e);
      setErr('판정 서버 연결이 지연되고 있어요. 잠시 후 다시 시도하거나 상담으로 문의해 주세요.');
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
        <JTReportShell title="청년창업 세액감면 진단" subtitle="감면 요건을 판정하고 있어요…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="NEW">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />업종·지역·창업요건을 조특법 §6 기준으로 판정하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc } = report;
    const isProspective = !!calc.prospective;
    const meta = isProspective ? YS_STATUS_META.eligible : (YS_STATUS_META[calc.status] || YS_STATUS_META.input_required);
    const isElig = calc.status === 'eligible';
    const isInelig = calc.status === 'ineligible' && !isProspective;
    const RECO_ICON = { ok: '✅', warn: '⚠️', info: '💡' };
    const myAreaIdx = (isProspective && regionInfo) ? ((calc.area === '과밀억제권역' || calc.area === '과밀_확인필요') ? 2 : calc.area === '수도권' ? 1 : 0) : -1;
    return (
      <div className="jt-container">
        <JTReportShell title="청년창업 세액감면 진단 결과" subtitle="조세특례제한법 §6 자동판정" stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="NEW">
          {/* 판정 배지 + 감면율 */}
          <div style={{ background: meta.bg, border: `1.5px solid ${meta.color}`, borderRadius: 14, padding: '20px 22px', marginBottom: 18, textAlign: 'center' }}>
            <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 999, background: meta.color, color: '#fff', fontWeight: 800, fontSize: 13.5, marginBottom: 10 }}>{isProspective ? '감면받는 법' : meta.label}</div>
            {isProspective ? (
              regionInfo ? (
                <div>
                  <div style={{ fontSize: 13.5, opacity: 0.78, marginBottom: 2 }}>{((regionInfo.sido || '') + ' ' + (regionInfo.sigungu || '')).trim()} · {calc.area} 기준{calc.is_youth ? ' (청년)' : (calc.small_scale_applied ? ' (소규모)' : '')}</div>
                  <div style={{ fontSize: 44, fontWeight: 800, color: meta.color, lineHeight: 1.1 }}>{calc.reduction_rate}%</div>
                  {calc.reduction_rate < calc.best_case_rate ? (
                    <div style={{ fontSize: 13.5, opacity: 0.85, marginTop: 6 }}>이 지역은 <strong>{calc.reduction_rate}%</strong>예요. 수도권 밖이나 인구감소지역(가평·연천·강화·옹진)에서 창업하면 <strong>최대 {calc.best_case_rate}%</strong>까지 받을 수 있어요 — 아래 비교표를 보세요.</div>
                  ) : (
                    <div style={{ fontSize: 13.5, opacity: 0.85, marginTop: 6 }}>가장 유리한 지역 구간이에요. 5년간 소득·법인세를 감면받습니다.</div>
                  )}
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 2 }}>요건을 갖춰 창업하면 최대</div>
                  <div style={{ fontSize: 44, fontWeight: 800, color: meta.color, lineHeight: 1.1 }}>{calc.best_case_rate}%</div>
                  <div style={{ fontSize: 13.5, opacity: 0.82, marginTop: 4 }}>청년 · 감면대상 업종 · 수도권 밖(또는 인구감소지역)에서 창업 시, 5년간 감면. 아래에서 지역별 감면율을 확인하세요.</div>
                </div>
              )
            ) : !isInelig ? (
              <div>
                <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 2 }}>{calc.status === 'conditional' ? '요건 충족 시 예상 감면율 (확인 필요)' : '예상 감면율 (창업 후 5년)'}</div>
                <div style={{ fontSize: 44, fontWeight: 800, color: meta.color, lineHeight: 1.1 }}>{(calc.status === 'conditional' && calc.best_if_confirmed != null) ? calc.best_if_confirmed : calc.reduction_rate}%</div>
                <div style={{ fontSize: 13.5, opacity: 0.8, marginTop: 4 }}>
                  {calc.is_youth ? '청년창업중소기업' : (calc.small_scale_applied ? '소규모 창업 특례(§6⑥)' : '일반 창업중소기업')} · {calc.area}
                </div>
                {calc.estimated_annual_reduction != null && (
                  <div style={{ marginTop: 10, fontSize: 15 }}>예상 감면액(연) <strong style={{ color: meta.color }}>{formatWon(calc.estimated_annual_reduction)}</strong>{calc.cap_applied ? ' (5억 한도)' : ''}</div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 15, lineHeight: 1.6 }}>현재 입력하신 내용으로는 이 감면 요건을 충족하지 못합니다. 아래 사유를 확인하세요 — <strong>다른 절세·감면 방안</strong>이 있을 수 있으니 상담으로 확인해 보세요.</div>
            )}
          </div>

          {report.quick && !isInelig && !isProspective && (
            <div className="jt-report-result__section" style={{ background: 'var(--bg-1,#f7f5f0)', borderLeft: '4px solid var(--accent,#2a6d4f)', padding: '14px 18px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 12px', lineHeight: 1.65 }}><strong>기본 정보로 낸 빠른 판정이에요.</strong> 창업유형(법인전환·폐업후재개·업종추가)·병역·연매출·직원수를 넣으면 배제사유와 예상 감면액까지 더 정확히 진단합니다.</p>
              <button className="jt-btn jt-btn--primary" onClick={goDetail}>정밀 진단하기 →</button>
            </div>
          )}

          {isProspective && (calc.recommendations || []).length > 0 && (
            <section className="jt-report-result__section">
              <h3>감면받는 법 — 체크리스트</h3>
              <p style={{ fontSize: 12.5, opacity: 0.72, margin: '0 0 10px' }}>아래 조건들을 갖춰 창업하면 감면을 받습니다. 지금까지 알려주신 정보로 확인된 항목은 표시해 두었어요.</p>
              {calc.recommendations.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 12px', marginBottom: 8, borderRadius: 8, background: r.status === 'ok' ? '#eaf5ee' : r.status === 'warn' ? '#fdf6ea' : '#f4f6f5', borderLeft: '3px solid ' + (r.status === 'ok' ? '#2a6d4f' : r.status === 'warn' ? '#b07b3a' : '#8a97a0') }}>
                  <span style={{ fontSize: 17, flex: '0 0 auto' }}>{RECO_ICON[r.status]}</span>
                  <div><strong style={{ fontSize: 14.5 }}>{r.title}</strong><div style={{ fontSize: 13, marginTop: 2, lineHeight: 1.55 }}>{r.detail}</div></div>
                </div>
              ))}
            </section>
          )}

          {isProspective && (calc.region_scenarios || []).length > 0 && (
            <section className="jt-report-result__section">
              <h3>어디서 창업하면 몇 %? (같은 조건, 지역만 다를 때)</h3>
              <table className="jt-report-calc">
                <thead><tr><th>창업 지역</th><th style={{ textAlign: 'right' }}>청년창업</th><th style={{ textAlign: 'right' }}>일반</th></tr></thead>
                <tbody>
                  {calc.region_scenarios.map((s, i) => (
                    <tr key={i} style={i === myAreaIdx ? { background: '#eaf5ee' } : null}>
                      <td>{s.label}{i === 0 ? <span style={{ marginLeft: 6, fontSize: 11, color: '#2a6d4f', fontWeight: 700 }}>가장 유리</span> : null}{i === myAreaIdx ? <span style={{ marginLeft: 6, fontSize: 11, color: '#1d6bd8', fontWeight: 700 }}>← 입력하신 지역</span> : null}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: s.youth_rate >= 100 ? '#2a6d4f' : 'inherit' }}>{s.youth_rate}%</td>
                      <td style={{ textAlign: 'right' }}>{s.general_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 12.5, opacity: 0.7, marginTop: 8 }}>※ 수도권 인구감소지역 = 인천 강화·옹진, 경기 가평·연천 (2026년 이후 창업 기준). 청년이 아니어도 연 수입 8천만원 이하 소규모면 청년과 같은 율을 받습니다.</p>
            </section>
          )}

          {/* 판정 트리 */}
          <section className="jt-report-result__section">
            <h3>판정 단계별 결과</h3>
            <table className="jt-report-calc">
              <tbody>
                {(calc.gates || []).filter(g => !(report.quick && g.name === '창업정의')).map((g, i) => (
                  <tr key={i}>
                    <th style={{ width: '30%' }}>{g.name}</th>
                    <td>
                      <span style={{ fontWeight: 700, color: g.pass === true ? '#2a6d4f' : g.pass === false ? '#c0392b' : '#b07b3a' }}>
                        {g.pass === true ? '✓ 통과' : g.pass === false ? '✕ 미충족' : '△ 확인필요'}
                      </span>
                      <div style={{ fontSize: 13, opacity: 0.85, marginTop: 3 }}>{g.detail}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* 업종 판정 */}
          {calc.industry && (
            <section className="jt-report-result__section" style={{ background: '#f0f7f3', borderLeft: '4px solid #2a6d4f', padding: '12px 16px', borderRadius: 8 }}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                <strong>업종 판정:</strong> {calc.industry.name} (한국표준산업분류 {calc.industry.ksic5}) — {calc.industry.category || calc.industry.reason}
              </p>
            </section>
          )}

          {/* 확인·주의 */}
          {(calc.warnings || []).length > 0 && (
            <section className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '12px 16px', borderRadius: 8 }}>
              <h3 style={{ marginTop: 0 }}>확인이 필요한 점</h3>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{calc.warnings.map((w, i) => <li key={i} style={{ marginBottom: 4 }}>{w}</li>)}</ul>
            </section>
          )}

          {/* 양방향 상담 유도 */}
          <section className="jt-report-result__section" style={{ background: isInelig ? '#fdf3f2' : '#f0f7f3', borderLeft: `4px solid ${meta.color}`, padding: '14px 18px', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65 }}>
              {isProspective
                ? '창업 전에 감면 구조를 함께 설계하면 5년간 세금을 크게 아낄 수 있습니다. 업종 선택·창업 지역·시기·사업자등록 방식을 어떻게 잡아야 감면을 최대로 받는지, 국세청 출신 세무사가 처음부터 잡아드립니다. 지금 상담하세요.'
                : isInelig
                ? '지금 기준으로는 이 감면 대상이 아니지만, 창업 시기·업종 구성·사업자등록 방식을 조정하면 받을 수 있는 경우가 많고, 다른 창업·중소기업 세제 혜택이 있을 수 있습니다. 포기하기 전에 상담으로 확인하세요.'
                : '감면 대상이어도 실제로 받으려면 과세표준 신고 때 세액감면신청서를 제출해야 하고(§6⑫), 청년요건·업종·고용 등 사후요건을 유지해야 합니다. 신청 실수나 요건 이탈로 감면을 놓치지 않도록, 신청·사후관리를 상담으로 챙기세요.'}
            </p>
          </section>

          {(calc.precedents || []).length > 0 && (
            <section className="jt-report-result__section">
              <h3>관련 참고 사례</h3>
              <p style={{ fontSize: 12.5, opacity: 0.72, margin: '0 0 10px' }}>창업 감면의 「창업 인정·업종·요건」 쟁점을 다룬 실제 심판례·판례입니다(유사 쟁점 포함). 사실관계에 따라 결론이 달라질 수 있으니 참고용으로 보시고, 정확한 판단은 상담에서 확인하세요.</p>
              {calc.precedents.map((p, i) => (
                <div key={i} style={{ borderLeft: '3px solid #c9a25e', padding: '8px 12px', marginBottom: 8, background: '#faf7f0', borderRadius: 6 }}>
                  <div style={{ fontSize: 12.5, marginBottom: 3 }}>
                    <strong>{p.case_no}</strong> {p.court ? '· ' + p.court : ''} {p.date ? '· ' + p.date : ''}
                    {p.conclusion ? <span style={{ marginLeft: 6, fontWeight: 700, color: p.conclusion === '부적격' ? '#c0392b' : p.conclusion === '적격' ? '#2a6d4f' : '#666' }}>[{p.conclusion}]</span> : null}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.55 }}>{p.summary}</div>
                </div>
              ))}
            </section>
          )}

          <section className="jt-report-result__section" style={{ fontSize: 12.5, opacity: 0.7, lineHeight: 1.55 }}>
            {calc.disclaimer}
          </section>

          {typeof JTReportConvert === 'function' && (
            <JTReportConvert
              reportType="청년창업 세액감면"
              reportSummary={`${meta.label} · 감면율 ${calc.reduction_rate}%${calc.estimated_annual_reduction != null ? ' · 예상 ' + formatWon(calc.estimated_annual_reduction) : ''}`}
              reportDetail={buildYSDetail(answers, calc, industryMatch, regionInfo)}
              kakaoSummary={buildYSKakao(answers, calc, industryMatch)}
              setRoute={setRoute}
            />
          )}

          <div className="jt-report-q__nav" style={{ marginTop: 16 }}>
            <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setPhase('quick'); setStep(0); setAnswers({}); setIndustryMatch(null); setRegionInfo(null); }}>처음부터 다시</button>
            <button className="jt-btn jt-btn--ghost" onClick={onBack}>← 세금 계산기</button>
          </div>
        </JTReportShell>
      </div>
    );
  }

  if (!cur) { onBack(); return null; }

  return (
    <div className="jt-container">
      <JTReportShell title="청년창업 세액감면 진단" subtitle={phase === 'quick' ? '창업일·나이·업종·지역만 넣으면 감면 가능여부와 감면율을 바로 보여드려요.' : '창업유형·병역·매출·직원까지 반영해 배제사유와 감면액을 정밀 진단합니다.'} stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="NEW">
        {err && <div style={{ background: '#fdeeec', borderLeft: '4px solid #c0392b', padding: '12px 16px', marginBottom: 16, borderRadius: 8 }}>{err}</div>}
        <div className="jt-report-q">
          <div className="jt-report-q__section">{cur.section}</div>
          <h2>{(prospective && cur.qP) ? cur.qP : cur.q}</h2>
          {(prospective && cur.subP) ? <p className="jt-report-q__sub">{cur.subP}</p> : (cur.sub && <p className="jt-report-q__sub">{cur.sub}</p>)}

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

          {cur.dateInput && (
            <div>
              <input className="jt-report-q__input" type="text" inputMode="numeric" placeholder={cur.datePlaceholder || '예: 1996-05-01 (숫자 8자리만 입력하면 자동으로 -가 붙어요)'}
                value={answers[cur.id] || ''}
                onChange={e => {
                  let v = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
                  if (v.length > 6) v = v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6);
                  else if (v.length > 4) v = v.slice(0, 4) + '-' + v.slice(4);
                  setAns(cur.id, v);
                }} />
              {answers[cur.id] && !ysValidDate(answers[cur.id]) && (
                <div style={{ fontSize: 13, color: '#b07b3a', marginTop: 6 }}>
                  {/^\d{4}-\d{2}-\d{2}$/.test(answers[cur.id]) ? '존재하지 않는 날짜예요. 연·월·일을 다시 확인해 주세요.' : '연·월·일 8자리를 모두 입력해 주세요 (예: 19960501 → 1996-05-01).'}
                </div>
              )}
            </div>
          )}

          {/* 업종 조회 UI */}
          {cur.custom === 'industry' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button className={'jt-btn ' + (indMode === 'name' ? 'jt-btn--primary' : 'jt-btn--ghost')} onClick={() => { setIndMode('name'); setIndCands(null); }}>업종명으로 찾기</button>
                <button className={'jt-btn ' + (indMode === 'code' ? 'jt-btn--primary' : 'jt-btn--ghost')} onClick={() => { setIndMode('code'); setIndCands(null); }}>업종코드로 입력</button>
              </div>
              {indMode === 'name' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="jt-report-q__input" style={{ flex: '1 1 200px', margin: 0 }} type="text" placeholder="예: 온라인쇼핑몰, 제조, 음식점, 소프트웨어"
                    value={indKw} onChange={e => setIndKw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !indBusy) doIndustrySearch(); }} />
                  <button className="jt-btn jt-btn--primary" style={{ flex: '0 0 auto' }} disabled={indBusy || !indKw.trim()} onClick={doIndustrySearch}>{indBusy ? '검색 중…' : '검색'}</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="jt-report-q__input" style={{ flex: '1 1 160px', margin: 0 }} type="text" inputMode="numeric" placeholder="사업자등록증 업종코드 6자리 (예: 525103)"
                    value={indCodeInput} onChange={e => setIndCodeInput(e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={e => { if (e.key === 'Enter' && !indBusy) doIndustryCode(); }} />
                  <button className="jt-btn jt-btn--primary" style={{ flex: '0 0 auto' }} disabled={indBusy || !indCodeInput.trim()} onClick={doIndustryCode}>{indBusy ? '조회 중…' : '조회'}</button>
                </div>
              )}
              {indCands && indCands.length > 0 && (
                <div style={{ marginTop: 12, maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {indCands.map(c => {
                    const badge = c.status === 'eligible' ? { t: '감면대상', c: '#2a6d4f' } : c.status === 'review' ? { t: '확인필요', c: '#b07b3a' } : { t: '대상아님', c: '#c0392b' };
                    return (
                      <button key={c.nts_code} className="jt-report-q__opt" style={{ textAlign: 'left' }} onClick={() => pickIndustry(c)}>
                        <span style={{ display: 'inline-block', minWidth: 62, padding: '2px 8px', borderRadius: 999, background: badge.c, color: '#fff', fontSize: 11, fontWeight: 700, marginRight: 8 }}>{badge.t}</span>
                        <strong>{c.name}</strong> <span style={{ opacity: 0.6, fontSize: 12 }}>({c.nts_code} · KSIC {c.ksic5})</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {indCands && indCands.length === 0 && <p style={{ marginTop: 10, fontSize: 13.5, opacity: 0.7 }}>일치하는 업종을 찾지 못했어요. 다른 키워드로 검색하거나 업종코드로 입력해 보세요.</p>}
              {industryMatch && (
                <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: industryMatch.status === 'eligible' ? '#eaf5ee' : industryMatch.status === 'review' ? '#fdf6ea' : '#fdeeec', border: '1px solid ' + (industryMatch.status === 'eligible' ? '#2a6d4f' : industryMatch.status === 'review' ? '#b07b3a' : '#c0392b') }}>
                  <strong>선택: {industryMatch.name}</strong> <span style={{ opacity: 0.7, fontSize: 12.5 }}>(KSIC {industryMatch.ksic5})</span>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{industryMatch.category || industryMatch.reason}</div>
                </div>
              )}
            </div>
          )}

          {/* 종전 업종(세분류 비교) */}
          {cur.custom === 'priorindustry' && (
            <div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="jt-report-q__input" style={{ flex: '1 1 200px', margin: 0 }} type="text" placeholder="종전 업종명 또는 업종코드"
                  value={priorKw} onChange={e => setPriorKw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !priorBusy) doPriorSearch(); }} />
                <button className="jt-btn jt-btn--primary" style={{ flex: '0 0 auto' }} disabled={priorBusy || !priorKw.trim()} onClick={doPriorSearch}>{priorBusy ? '검색 중…' : '검색'}</button>
              </div>
              {priorCands && priorCands.length > 0 && (
                <div style={{ marginTop: 10, maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {priorCands.map(c => (
                    <button key={c.nts_code} className="jt-report-q__opt" style={{ textAlign: 'left' }} onClick={() => pickPrior(c)}>
                      <strong>{c.name}</strong> <span style={{ opacity: 0.6, fontSize: 12 }}>({c.nts_code})</span>
                    </button>
                  ))}
                </div>
              )}
              {priorMatch && <div style={{ marginTop: 10, fontSize: 13.5 }}>종전 업종: <strong>{priorMatch.name}</strong> — 신규 업종과 세분류가 같으면 창업으로 인정되지 않습니다(자동 비교).</div>}
            </div>
          )}

          {/* 지역 조회 UI */}
          {cur.custom === 'region' && (
            <div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="jt-report-q__input" style={{ flex: '1 1 220px', margin: 0 }} type="text" placeholder="예: 경기 화성시 동탄대로 / 강원 홍천군 ○○로"
                  value={raddr} onChange={e => setRaddr(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !rbusy) doRegionLookup(); }} />
                <button className="jt-btn jt-btn--primary" style={{ flex: '0 0 auto' }} disabled={rbusy || !raddr.trim()} onClick={doRegionLookup}>{rbusy ? '판정 중…' : '지역 판정'}</button>
              </div>
              {rinfo && (
                <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.55, padding: '9px 12px', borderRadius: 8, background: rinfo.ok ? '#eaf5ee' : '#fff7ea', borderLeft: '4px solid ' + (rinfo.ok ? '#2a6d4f' : '#d08b00') }}>{rinfo.msg}</div>
              )}
            </div>
          )}

          {/* 병역 — 입대일·전역일 (자동 개월 계산) */}
          {cur.custom === 'military' && (
            <div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[['enlistDate', '입대일'], ['dischargeDate', '전역일']].map(([id, lbl]) => (
                  <div key={id} style={{ flex: '1 1 150px' }}>
                    <div style={{ fontSize: 12.5, opacity: 0.7, marginBottom: 4 }}>{lbl}</div>
                    <input className="jt-report-q__input" style={{ margin: 0 }} type="text" inputMode="numeric" placeholder="예: 2015-03-02"
                      value={answers[id] || ''}
                      onChange={e => {
                        let v = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
                        if (v.length > 6) v = v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6);
                        else if (v.length > 4) v = v.slice(0, 4) + '-' + v.slice(4);
                        setAns(id, v);
                      }} />
                  </div>
                ))}
              </div>
              {answers.enlistDate && answers.dischargeDate && ysValidDate(answers.enlistDate) && ysValidDate(answers.dischargeDate) && (() => {
                const mm = ysMonthsBetween(answers.enlistDate, answers.dischargeDate);
                const y = Math.floor(mm / 12);
                return (
                  <div style={{ marginTop: 10, fontSize: 13.5, padding: '9px 12px', borderRadius: 8, background: '#eaf5ee', borderLeft: '4px solid #2a6d4f' }}>
                    병역 이행기간 <strong>{y ? y + '년 ' : ''}{mm % 12}개월</strong>{mm > 72 ? ' (최대 6년까지 인정)' : ''} — 이 기간을 창업 당시 나이에서 빼고 청년 여부를 판정합니다.
                  </div>
                );
              })()}
            </div>
          )}

          {cur.numeric && !cur.custom && (
            <div>
              <input className="jt-report-q__input" type="text" inputMode="numeric" placeholder={cur.placeholder || ''}
                value={answers[cur.id] ? (cur.money ? Number(answers[cur.id]).toLocaleString('ko-KR') : answers[cur.id]) : ''}
                onChange={e => setAns(cur.id, cur.money ? e.target.value.replace(/[^0-9]/g, '') : e.target.value.replace(/[^0-9.]/g, ''))} />
            </div>
          )}

          {cur.freeform && (
            <textarea className="jt-report-q__input" rows={3} placeholder={cur.placeholder || ''} value={answers[cur.id] || ''} onChange={e => setAns(cur.id, e.target.value)} />
          )}

          <div className="jt-report-q__nav">
            <button className="jt-btn jt-btn--ghost" onClick={goPrev}>← 이전</button>
            <button className="jt-btn jt-btn--primary" disabled={!canNext()} onClick={goNext}>
              {isLast ? (phase === 'quick' ? '빠른 진단 보기 →' : '정밀 결과 보기 →') : '다음 →'}
            </button>
          </div>
          {cur.optional && <div style={{ textAlign: 'center', marginTop: 8 }}><button className="jt-btn jt-btn--ghost" style={{ fontSize: 13 }} onClick={goNext}>건너뛰기</button></div>}
        </div>
      </JTReportShell>
    </div>
  );
}

window.JTReportYouthStartup = JTReportYouthStartup;

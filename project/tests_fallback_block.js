/* 폴백 «차단» 회귀 — 엔진이 죽었을 때 틀린 숫자를 내놓지 않는지 지킨다.

   배경(260806): 각 계산기의 간이 폴백은 엔진보다 단순해 특정 사실관계에서 세액이 크게
   어긋난다(상속 1.8억 과소 · 취득 4,670만 과대 · 양도 5.8억 과소 등). 프론트에 다시
   구현하면 «엔진을 한 벌 더 만드는 것»이라 새 오류를 낳으므로, 감당 못 하는 입력이면
   숫자를 내지 않는다.

   ⚠️ 이 파일이 지키는 것은 세 층이다 — 셋 중 하나만 빠져도 «막은 척»이 된다.
     ① 판정 규칙   : 어떤 입력을 막는가 (그리고 «막지 않는가» — 과잉 차단도 결함이다)
     ② 게이트 순서 : 차단이 외부 전송(AI 프롬프트)보다 «먼저» 오는가
     ③ 화면 내용   : 차단 시 반환되는 서브트리에 금액을 만드는 표현이 없는가

   ①만 검사하던 시절에 계산표가 샜고, ①+③만 검사하던 시절에 AI 프롬프트가 샜다. */
const fs = require('fs'), path = require('path');
const SRC = (f) => path.join(__dirname, 'src', f);

/* 공용 판정기 추출 (Report.jsx) — 마커가 사라지면 조용히 통과하지 않고 죽는다 */
const rs = fs.readFileSync(SRC('Report.jsx'), 'utf8');
const a = rs.indexOf('window.jtFallbackGaps = function');
if (a < 0) throw new Error('Report.jsx 의 jtFallbackGaps 를 찾지 못했습니다.');
const end = rs.indexOf('\n};', a);
if (end < 0) throw new Error('jtFallbackGaps 끝을 찾지 못했습니다.');
global.window = {};
eval(rs.slice(a, end + 3));
const GAPS = window.jtFallbackGaps;

let fails = 0;
function eq(label, got, want) {
  const ok = String(got) === String(want); if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      got=${JSON.stringify(got)}  want=${JSON.stringify(want)}`);
}

console.log('════ 판정기 자체 ════');
eq('조건이 참인 것만 모은다', GAPS([{ when: true, why: 'A' }, { when: false, why: 'B' }]).join(','), 'A');
eq('전부 거짓이면 빈 배열 → 차단 안 함', GAPS([{ when: false, why: 'A' }]).length, 0);
eq('빈 입력 방어', GAPS().length + GAPS([]).length + GAPS([null]).length, 0);

/* ── ① 판정 규칙: 각 계산기의 «실제 판정 함수»를 소스에서 통째로 꺼내 실행한다 ─────
   조각(배열 리터럴)만 뽑아 재조립하던 종전 방식은, 함수 안의 전제(비거주자·면적 환산)를
   테스트가 흉내 내야 해서 «테스트가 본 규칙»과 «앱이 쓰는 규칙»이 갈라질 수 있었다.
   이제 함수 전체를 eval 해서 앱과 완전히 같은 것을 돌린다. */
function loadGapFn(file, fnName) {
  const s = fs.readFileSync(SRC(file), 'utf8');
  const head = `function ${fnName}(answers, calc) {`;
  const i = s.indexOf(head);
  if (i < 0) throw new Error(`${file} 에서 ${fnName} 을 찾지 못했습니다 — 차단 배선이 사라졌는지 확인하세요.`);
  let d = 1, j = i + head.length;
  while (j < s.length && d > 0) {
    const ch = s[j];
    if (ch === '{') d++; else if (ch === '}') d--;
    j++;
  }
  // eslint-disable-next-line no-eval
  return eval(`(${s.slice(i, j)})`);
}

const inhFallbackGaps = loadGapFn('ReportInheritance.jsx', 'inhFallbackGaps');
const giftFallbackGaps = loadGapFn('ReportGift.jsx', 'giftFallbackGaps');
const acqFallbackGaps = loadGapFn('ReportAcquisition.jsx', 'acqFallbackGaps');
const propFallbackGaps = loadGapFn('ReportProperty.jsx', 'propFallbackGaps');
const cgtFallbackGaps = loadGapFn('ReportCGT.jsx', 'cgtFallbackGaps');
/* 종소세·법인전환은 «간이 폴백»이 없어 ②층이 필요 없다.
   시그니처는 (answers, calc) 로 통일했다 — 다르면 테스트 규약에서 빠져 구멍이 된다
   (260806 Codex R18 P1: 법인전환이 1인자라 두 테스트 목록에서 누락돼 있었다). */
const incFallbackGaps = loadGapFn('ReportIncome.jsx', 'incFallbackGaps');
const corpFallbackGaps = loadGapFn('ReportCorporate.jsx', 'corpFallbackGaps');

const DOWN = { precise: false };            // 엔진 장애
const OK = { precise: true };               // 엔진 정상
const INH = (x) => inhFallbackGaps(x, DOWN);
const GIFT = (x) => giftFallbackGaps(x, DOWN);
const ACQ = (x) => acqFallbackGaps(x, DOWN);
const PROP = (x) => propFallbackGaps(x, DOWN);
const CGT = (x) => cgtFallbackGaps(x, DOWN);
/* ⚠️ 거주자 여부는 «yes 로 확인된» 경우만 통과한다(260806 하드닝) — 미입력도 막는다.
   빠른 계산에서 이 문항이 안 나와 undefined 로 새던 P0 를 닫은 결과다.
   그래서 상속·증여의 «통과» 케이스에는 isResident:'yes' 를 반드시 넣는다. */
const RES = { isResident: 'yes' };

console.log('\n════ 상속세 — 실측 최대 1.8억 오차 조건 ════');
eq('배우자 실제 상속 0 → 차단', INH({ spouseActual: 'zero' }).length > 0, true);
eq('사전증여 있음 → 차단', INH({ priorGiftHas: 'yes' }).length > 0, true);
eq('순금융재산 입력 → 차단', INH({ netFinancialAssets: '500000000' }).length > 0, true);
eq('동거주택 → 차단', INH({ hasCohabitationHouse: 'yes' }).length > 0, true);
eq('비거주자 → 차단', INH({ isResident: 'no' }).length > 0, true);
eq('자녀 7명↑인데 정확인원 없음 → 차단', INH({ numChildren: 'many' }).length > 0, true);
eq('자녀 7명↑ + 정확인원 입력 → 통과', INH({ ...RES, numChildren: 'many', numChildrenExact: '9' }).length, 0);
eq('평범한 입력 → 통과(숫자 표시)', INH({ ...RES, hasSpouse: 'yes', numChildren: '2' }).length, 0);

console.log('\n════ 증여세 ════');
eq('세대생략 → 차단', GIFT({ genSkip: 'yes' }).length > 0, true);
eq('혼인공제 → 차단', GIFT({ marriageDed: 'yes' }).length > 0, true);
eq('출산공제 → 차단', GIFT({ childbirthDed: 'yes' }).length > 0, true);
eq('사전증여 → 차단', GIFT({ priorGiftHas: 'yes' }).length > 0, true);
eq('비거주자 → 차단', GIFT({ isResident: 'no' }).length > 0, true);
eq('평범한 입력 → 통과', GIFT({ ...RES, relationship: '직계존속' }).length, 0);

console.log('\n════ 취득세 ════');
const ACQ_BASE = { propertyType: '주택', acquisitionType: '매매', exclusiveArea: '84', reduction: 'none', housingCount: '1' };
eq('생애최초 감면 → 차단', ACQ({ ...ACQ_BASE, reduction: 'first' }).length > 0, true);
eq('85㎡ 초과 → 차단', ACQ({ ...ACQ_BASE, exclusiveArea: '86' }).length > 0, true);
eq('면적 미입력(주택 매매) → 차단', ACQ({ ...ACQ_BASE, exclusiveArea: '' }).length > 0, true);
eq('토지 → 차단', ACQ({ propertyType: '토지' }).length > 0, true);
eq('주택 상속 → 차단', ACQ({ acquisitionType: '상속', propertyType: '주택', exclusiveArea: '84' }).length > 0, true);
eq('85㎡ 이하·면적 입력·감면없음 → 통과', ACQ(ACQ_BASE).length, 0);
/* 260806 Codex 지적으로 넓힌 조건들 — 다시 좁아지면 여기서 잡힌다 */
eq('증여 주택 + 면적 미입력 → 차단 (종전엔 매매만 봐서 샜다)',
   ACQ({ propertyType: '주택', acquisitionType: '증여', isRegulatedArea: 'no' }).length > 0, true);
eq('조정지역 «모르겠어요» + 다주택 → 차단 (종전엔 no 와 한 칸이라 그냥 통과했다)',
   ACQ({ ...ACQ_BASE, housingCount: '2', isRegulatedArea: 'unsure', temporaryTwoHouse: 'no' }).length > 0, true);
eq('증여 주택 + 조정 «모름» → 차단 (시가표준 3억↑면 12% 중과라 3배 갈린다)',
   ACQ({ propertyType: '주택', acquisitionType: '증여', exclusiveArea: '84', isRegulatedArea: 'unsure' }).length > 0, true);
eq('다주택인데 일시적2주택 미응답 → 차단',
   ACQ({ ...ACQ_BASE, housingCount: '2', isRegulatedArea: 'yes' }).length > 0, true);
eq('일시적2주택 «예» + 2주택 → 통과 (폴백이 1주택으로 정확히 계산한다)',
   ACQ({ ...ACQ_BASE, housingCount: '2', isRegulatedArea: 'yes', temporaryTwoHouse: 'yes' }).length, 0);
/* 시행령 §28의5① 은 «종전 주택등 1개 보유» 세대만 — 3주택 이상엔 특례가 없다 (Codex P1) */
eq('3주택인데 일시적2주택 «예» → 차단 (특례 대상이 아닌데 주택수를 1로 줄이면 안 된다)',
   ACQ({ ...ACQ_BASE, housingCount: '3', isRegulatedArea: 'yes', temporaryTwoHouse: 'yes' }).length > 0, true);

console.log('\n════ 재산세 ════');
eq('종합합산 토지 → 차단', PROP({ propertyKind: '토지', landType: '종합합산' }).length > 0, true);
eq('별도합산 토지 → 차단', PROP({ propertyKind: '토지', landType: '별도합산' }).length > 0, true);
eq('전년도 세액 입력 → 차단', PROP({ propertyKind: '주택', priorYearTax: '100000' }).length > 0, true);
eq('건축물 → 차단', PROP({ propertyKind: '건축물' }).length > 0, true);
eq('일반 주택 → 통과', PROP({ propertyKind: '주택', isOneHouse: 'yes' }).length, 0);

console.log('\n════ 양도세 ════');
eq('승계취득 입주권 → 차단', CGT({ assetType: 'occupancy_succ' }).length > 0, true);
eq('원조합원 입주권 → 차단', CGT({ assetType: 'occupancy_orig' }).length > 0, true);
eq('조정 1주택+입주권 동시보유 → 차단',
   CGT({ assetType: 'house_1', houseConcurrentRight: 'occupancy', adjustedZone: 'yes' }).length > 0, true);
/* 비조정도 막아야 한다 — 일시적 특례를 판정 못 해 «과대» 방향으로 틀린다.
   조정 조건이 다시 붙으면 이 케이스에서 잡힌다 (Codex P2) */
eq('«비»조정 1주택+입주권 동시보유도 차단',
   CGT({ assetType: 'house_1', houseConcurrentRight: 'occupancy', adjustedZone: 'no', acqAdjustedZone: 'no' }).length > 0, true);
eq('취득당시 조정지역 «모름» → 차단', CGT({ assetType: 'house_1', acqAdjustedZone: 'unsure' }).length > 0, true);
/* 취득 당시 조정지역은 1주택 거주요건에만 쓰인다 — 2·3주택까지 막으면 과잉 차단 (Codex P2) */
eq('2주택 + 취득당시 «모름» → 통과 (세액에 영향이 없다)',
   CGT({ assetType: 'house_2', acqAdjustedZone: 'unsure' }).length, 0);
eq('전입일이 취득일보다 앞섬 → 차단',
   CGT({ assetType: 'house_1', acquiredDate: '2020-01-01', moveInDate: '2010-01-01' }).length > 0, true);
eq('평범한 1주택 → 통과',
   CGT({ assetType: 'house_1', acqAdjustedZone: 'no', acquiredDate: '2015-01-01', moveInDate: '2015-06-01' }).length, 0);
eq('상가(비주택) → 통과 (단기세율·기본세율은 폴백도 맞다)', CGT({ assetType: 'commercial' }).length, 0);

/* ── «불확정 입력»은 엔진이 살아 있어도 막는다 ──────────────────────────────
   사용자가 「모른다」고 한 사실을 그대로 보내면 엔진은 필드가 없다는 이유로 조용히
   한쪽을 가정하고, 그 값에 「정밀 계산」 딱지가 붙는다 — 폴백보다 더 믿기 때문에 더 위험하다.
   아래 배수는 260806 에 실제 엔진을 호출해 얻은 값이다(추정 아님). */
console.log('\n════ «모른다»고 답한 입력은 엔진이 살아 있어도 막는다 ════');
eq('취득세 · 증여 + 조정 «모름» → precise 여도 차단 (실측 3,040만 ↔ 9,920만 = 3.26배)',
   acqFallbackGaps({ propertyType: '주택', acquisitionType: '증여', exclusiveArea: '84', isRegulatedArea: 'unsure' }, OK).length > 0, true);
eq('취득세 · 다주택 매매 + 조정 «모름» → precise 여도 차단',
   acqFallbackGaps({ ...ACQ_BASE, housingCount: '2', isRegulatedArea: 'unsure', temporaryTwoHouse: 'no' }, OK).length > 0, true);
eq('취득세 · 면적 미입력 → precise 여도 차단 (엔진은 농특세를 0 으로 둔다 — 실측 100㎡면 160만원)',
   acqFallbackGaps({ ...ACQ_BASE, exclusiveArea: '' }, OK).length > 0, true);
eq('취득세 · 3주택 + 일시적2주택 「예」 잔존 → precise 여도 차단 (실측 2,050만 ↔ 6,720만 = 3.3배)',
   acqFallbackGaps({ ...ACQ_BASE, housingCount: '3', isRegulatedArea: 'yes', temporaryTwoHouse: 'yes' }, OK).length > 0, true);
eq('양도세 · 취득당시 조정 «모름» → precise 여도 차단 (실측 2,484만 ↔ 2억 997만 = 8.45배)',
   cgtFallbackGaps({ assetType: 'house_1', acqAdjustedZone: 'unsure' }, OK).length > 0, true);
/* 엔진이 «받지도 않는» 사실 — 보내 봐야 무시된다. 260806 실측: /v1/calc/inheritance 에
   is_resident:false / resident:false / 필드없음 셋 다 127,416,380 으로 동일했다.
   증여세 payload(mapAnswersToGift)에는 거주자 필드 자체가 없다. */
eq('상속세 · 비거주자 → precise 여도 차단 (엔진이 is_resident 를 무시한다)',
   inhFallbackGaps({ isResident: 'no', hasSpouse: 'yes', numChildren: '2' }, OK).length > 0, true);
eq('증여세 · 비거주자 → precise 여도 차단 (payload 에 거주자 필드가 없다)',
   giftFallbackGaps({ isResident: 'no', relationship: '직계존속' }, OK).length > 0, true);
eq('상속세 · 거주자면 precise 에서 통과',
   inhFallbackGaps({ isResident: 'yes', hasSpouse: 'yes', numChildren: '2' }, OK).length, 0);
eq('증여세 · 거주자면 precise 에서 통과',
   giftFallbackGaps({ isResident: 'yes', relationship: '직계존속' }, OK).length, 0);
/* 반대 방향도 고정한다 — «답한» 입력까지 막으면 정상 이용자를 쫓아낸다 */
eq('취득세 · 조정을 «아니오»로 답하면 precise 에서 통과',
   acqFallbackGaps({ ...ACQ_BASE, housingCount: '2', isRegulatedArea: 'no', temporaryTwoHouse: 'no' }, OK).length, 0);
eq('양도세 · 취득당시 조정을 «아니오»로 답하면 precise 에서 통과',
   cgtFallbackGaps({ assetType: 'house_1', acqAdjustedZone: 'no' }, OK).length, 0);

console.log('\n════ 엔진 성공(precise)이면 «폴백 한계»로는 막지 않는다 — 정상 이용자를 막는 게 더 큰 사고다 ════');
/* ⚠️ 여기 입력에 «비거주자»를 넣으면 안 된다 — 그건 폴백 한계가 아니라 엔진 미지원이라
   precise 에서도 막는 게 «의도»다. 위 «모른다» 블록에서 따로 고정한다. */
[['상속세', inhFallbackGaps, { ...RES, spouseActual: 'zero', priorGiftHas: 'yes' }],
 ['증여세', giftFallbackGaps, { ...RES, genSkip: 'yes', priorGiftHas: 'yes' }],
 ['취득세', acqFallbackGaps, { propertyType: '토지', reduction: 'first' }],
 ['재산세', propFallbackGaps, { propertyKind: '건축물' }],
 ['양도세', cgtFallbackGaps, { assetType: 'occupancy_succ' }]].forEach(([name, fn, ans]) => {
  eq(`${name} · 차단 입력 + 엔진 실패 → 막는다`, fn(ans, DOWN).length > 0, true);
  eq(`${name} · 같은 입력이라도 엔진 성공 → 안 막는다`, fn(ans, OK).length, 0);
});

console.log('\n════ 종합소득세 — 배당 Gross-up (엔진 실측 최대 1,160만원 차이) ════');
/* 260806 실측(POST /v1/calc/income): 사업 5억 + 배당 2억 →
     grossup 240,160,000 / 미적용 251,760,000. 배당 단독이면 차이 0(공제가 전액 상쇄)이지만
     다른 소득이 있으면 갈린다. 종전엔 문항 없이 «무조건 국내 배당»으로 보냈다. */
eq('국내 배당 → 통과', incFallbackGaps({ dividendIncome: '50000000', dividendType: 'domestic' }, OK).length, 0);
/* 처음엔 «외국은 grossup 만 빼면 정확하다»고 통과시켰다. 확인해 보니 반쪽이었다 —
   엔진이 외국납부세액공제(§57)를 받지 않아(실측: foreign_tax_paid/credit 어느 이름으로도
   결과 128,190,000 불변) 현지 원천세만큼 «많게» 나온다. */
eq('외국 배당 → 차단 (엔진이 외국납부세액공제 §57 을 지원하지 않는다)',
   incFallbackGaps({ dividendIncome: '50000000', dividendType: 'foreign' }, OK).length > 0, true);
eq('국내·외국 «혼합» → 차단 (금액을 못 나눈다)',
   incFallbackGaps({ dividendIncome: '50000000', dividendType: 'mixed' }, OK).length > 0, true);
eq('배당 유형 «모름» → 차단', incFallbackGaps({ dividendIncome: '50000000', dividendType: 'unsure' }, OK).length > 0, true);
eq('배당 유형 «미입력» → 차단 (문항이 빠져도 새지 않게)',
   incFallbackGaps({ dividendIncome: '50000000' }, OK).length > 0, true);
eq('배당 0이면 유형과 무관하게 통과', incFallbackGaps({ dividendIncome: '0' }, OK).length, 0);

console.log('\n════ 법인 전환 — 입력값을 말없이 바꾸지 않는다 ════');
eq('대표급여 ≤ 사업이익 → 통과',
   corpFallbackGaps({ businessIncome: '100000000', ownerSalary: '50000000' }, OK).length, 0);
eq('대표급여 > 사업이익 → 차단 (종전엔 Math.min 으로 조용히 깎아 다른 시나리오를 계산했다)',
   corpFallbackGaps({ businessIncome: '50000000', ownerSalary: '100000000' }, OK).length > 0, true);
eq('같으면 통과', corpFallbackGaps({ businessIncome: '50000000', ownerSalary: '50000000' }, OK).length, 0);

/* ── ② 게이트 순서: 차단이 «외부 전송»보다 먼저인가 ─────────────────────────
   렌더 단계의 조기 반환만 검사하면 이 누설을 못 잡는다. 실제로 260806 에
   window.claude.complete 프롬프트가 폴백 총세액을 담아 조기 반환보다 «먼저»
   외부로 나가고 있었고, 종전 검사는 그걸 전부 통과시켰다(Codex P0). */
console.log('\n════ 차단 게이트가 외부 전송보다 «먼저» 오는가 ════');
/* ⚠️ 새 판정 함수를 만들면 여기와 tests_gate_ast.js 의 TARGETS 에 «둘 다» 등록한다.
   빠뜨리면 판정 규칙 테스트만 통과하고 누설 회귀는 안 잡힌다 (260806 Codex R18 P1). */
const FILES = [
  ['ReportInheritance.jsx', 'inhFallbackGaps', 'inhBlocked'],
  ['ReportGift.jsx', 'giftFallbackGaps', 'giftBlocked'],
  ['ReportAcquisition.jsx', 'acqFallbackGaps', 'acqBlocked'],
  ['ReportProperty.jsx', 'propFallbackGaps', 'propBlocked'],
  ['ReportCGT.jsx', 'cgtFallbackGaps', 'cgtBlocked'],
  ['ReportIncome.jsx', 'incFallbackGaps', 'incBlocked'],
  ['ReportCorporate.jsx', 'corpFallbackGaps', 'corpBlocked'],
];
FILES.forEach(([f, fn]) => {
  const src = fs.readFileSync(SRC(f), 'utf8');
  /* 인자 형태는 파일마다 다르다 — «부르는가»만 본다(구문 검증은 tests_gate_ast.js 담당) */
  const gate = src.indexOf(`if (${fn}(`);
  const ai = src.indexOf('window.claude.complete(');
  eq(`${f} · runAnalysis 안에 차단 게이트가 있다`, gate >= 0, true);
  /* 종합소득세처럼 AI 호출이 없는 계산기도 있다 — 없으면 순서를 볼 대상이 없다 */
  eq(`${f} · 차단 게이트가 window.claude.complete 보다 앞이다`,
     ai < 0 ? 'AI 호출 없음' : (gate >= 0 && gate < ai), ai < 0 ? 'AI 호출 없음' : true);
  /* 판정 규칙이 «한 벌»인지 — 렌더도 같은 함수를 불러야 한다. 두 벌이면 반드시 어긋난다.
     «정확히 3회»로 못박으면 정당한 네 번째 호출(예: 캐비엇에 사유 개수 표시)에도
     헛되이 깨진다 — 헛경보는 게이트를 죽인다. 지켜야 할 불변식은 «정의 말고도
     최소 두 곳(분석·렌더)이 같은 함수를 쓴다»이므로 하한만 본다.
     「어느 쪽이 쓰는가」의 구조 검증은 tests_gate_ast.js 담당. */
  eq(`${f} · 판정 함수를 정의 외에 최소 2곳(분석·렌더)에서 쓴다`,
     (src.match(new RegExp(fn + '\\(', 'g')) || []).length >= 3, true);
  /* 판정 배열이 «판정 함수 밖»에 있으면 그건 두 번째 규칙이다 — 반드시 어긋난다.
     함수 안에 여러 개인 것은 정상이다(불확정 입력 층 + 폴백 한계 층). */
  const fnStart = src.indexOf(`function ${fn}(answers, calc) {`);
  let depth = 1, fnEnd = fnStart + `function ${fn}(answers, calc) {`.length;
  while (fnEnd < src.length && depth > 0) {
    const ch = src[fnEnd];
    if (ch === '{') depth++; else if (ch === '}') depth--;
    fnEnd++;
  }
  const outside = [];
  const rx = /window\.jtFallbackGaps\(\[/g;
  let m;
  while ((m = rx.exec(src))) if (m.index < fnStart || m.index > fnEnd) outside.push(m.index);
  eq(`${f} · 판정 배열이 ${fn} 밖에 없다`, outside.length, 0);
});

/* ── ③ 화면 내용: 차단 시 반환되는 서브트리에 금액이 없는가 ────────────────
   가릴 것을 «세는» 방식은 표현이 늘 때마다 샌다. 반대로 «차단 화면에 무엇이 들었나»만
   보면, 가려야 할 대상이 앞으로 늘어도 이 검사는 그대로 유효하다. */
console.log('\n════ 차단 시 반환되는 화면에 금액이 없는가 ════');
function earlyReturnBody(src, blockVar) {
  const head = `if (${blockVar}) {`;
  const i = src.indexOf(head);
  if (i < 0) return null;
  let d = 1, j = i + head.length;
  while (j < src.length && d > 0) {
    const ch = src[j];
    if (ch === '{') d++; else if (ch === '}') d--;
    j++;
  }
  return src.slice(i, j);
}
/* 금액을 화면·클립보드·전송·외부 AI 로 내보내는 표현들 */
const LEAK_TARGETS = [
  { pat: 'JTReportConvert', what: '공유·카카오 전송' },
  { pat: 'formatWon', what: '금액 포맷 호출' },
  { pat: 'totalTax', what: '세액 값 참조' },
  { pat: 'commentary', what: 'AI 코멘터리' },
];
FILES.forEach(([f, , v]) => {
  const src = fs.readFileSync(SRC(f), 'utf8');
  const body = earlyReturnBody(src, v);
  if (body === null) { eq(`${f} 에 if (${v}) 조기 반환이 있다`, false, true); return; }
  const declEnd = src.indexOf(`const ${v} = `);
  const guardAt = src.indexOf(`if (${v}) {`);
  const mainReturn = src.indexOf('return (', declEnd);
  eq(`${f} · 조기 반환이 결과 화면 return 보다 앞에 있다`,
     declEnd >= 0 && guardAt > declEnd && guardAt < mainReturn, true);
  eq(`${f} · 차단 화면이 JTFallbackBlocked 를 렌더한다`, /<JTFallbackBlocked\b/.test(body), true);
  const hits = LEAK_TARGETS.filter(({ pat }) => body.includes(pat)).map((t) => t.what);
  eq(`${f} · 차단 화면에 금액 표현이 없다`, hits.length ? `누설: ${hits.join(' / ')}` : '없음', '없음');
});

console.log(`\n════════════════════\n실패 ${fails}건`);
process.exit(fails ? 1 : 0);

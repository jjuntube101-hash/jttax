/* 폴백 «차단» 회귀 — 엔진이 죽었을 때 틀린 숫자를 내놓지 않는지 지킨다.

   배경(260806): 각 계산기의 간이 폴백은 엔진보다 단순해 특정 사실관계에서 세액이 크게
   어긋난다(상속 1.8억 과소 · 취득 4,670만 과대 · 양도 5.8억 과소 등). 프론트에 다시
   구현하면 «엔진을 한 벌 더 만드는 것»이라 새 오류를 낳으므로, 감당 못 하는 입력이면
   숫자를 내지 않는다.

   ⚠️ 이 파일은 «판정 규칙»과 «배선»을 함께 지킨다 — 규칙만 맞고 화면이 안 쓰면 소용없다. */
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

/* ── 각 계산기의 «차단 조건»을 소스에서 추출해 그대로 실행한다 ──────────────
   문자열 비교가 아니라 «실제 조건식»을 돌려야 규칙이 바뀌면 테스트가 따라온다. */
function extractGapChecks(file, varName) {
  const s = fs.readFileSync(SRC(file), 'utf8');
  const i = s.indexOf(`const ${varName} = `);
  if (i < 0) throw new Error(`${file} 에서 ${varName} 을 찾지 못했습니다 — 차단 배선이 사라졌는지 확인하세요.`);
  const open = s.indexOf('window.jtFallbackGaps([', i);
  if (open < 0) throw new Error(`${file} 의 ${varName} 이 jtFallbackGaps 를 쓰지 않습니다.`);
  const close = s.indexOf('\n    ]);', open);
  if (close < 0) throw new Error(`${file} 의 ${varName} 끝을 찾지 못했습니다.`);
  return s.slice(open + 'window.jtFallbackGaps(['.length, close);
}

function runChecks(file, varName, answers, extra) {
  const body = extractGapChecks(file, varName);
  const calc = { precise: false };
  const fn = new Function('answers', 'calc', 'Number', 'window', Object.keys(extra || {}).join(',') || '_unused',
    'return window.jtFallbackGaps([' + body + ']);');
  return fn(answers, calc, Number, window, ...Object.values(extra || {}));
}

console.log('\n════ 상속세 — 실측 최대 1.8억 오차 조건 ════');
const INH = (a) => runChecks('ReportInheritance.jsx', 'inhGaps', a, { nonResident: a.isResident === 'no' });
eq('배우자 실제 상속 0 → 차단', INH({ spouseActual: 'zero' }).length > 0, true);
eq('사전증여 있음 → 차단', INH({ priorGiftHas: 'yes' }).length > 0, true);
eq('순금융재산 입력 → 차단', INH({ netFinancialAssets: '500000000' }).length > 0, true);
eq('동거주택 → 차단', INH({ hasCohabitationHouse: 'yes' }).length > 0, true);
eq('비거주자 → 차단', INH({ isResident: 'no' }).length > 0, true);
eq('자녀 7명↑인데 정확인원 없음 → 차단', INH({ numChildren: 'many' }).length > 0, true);
eq('자녀 7명↑ + 정확인원 입력 → 통과', INH({ numChildren: 'many', numChildrenExact: '9' }).length, 0);
eq('평범한 입력 → 통과(숫자 표시)', INH({ hasSpouse: 'yes', numChildren: '2' }).length, 0);

console.log('\n════ 증여세 ════');
const GIFT = (a) => runChecks('ReportGift.jsx', 'giftGaps', a, { nonResident: a.isResident === 'no' });
eq('세대생략 → 차단', GIFT({ genSkip: 'yes' }).length > 0, true);
eq('혼인공제 → 차단', GIFT({ marriageDed: 'yes' }).length > 0, true);
eq('출산공제 → 차단', GIFT({ childbirthDed: 'yes' }).length > 0, true);
eq('사전증여 → 차단', GIFT({ priorGiftHas: 'yes' }).length > 0, true);
eq('비거주자 → 차단', GIFT({ isResident: 'no' }).length > 0, true);
eq('평범한 입력 → 통과', GIFT({ relationship: '직계존속' }).length, 0);

console.log('\n════ 취득세 ════');
const ACQ = (a) => runChecks('ReportAcquisition.jsx', 'acqGaps', a, { acqArea: Number(a.exclusiveArea) || 0 });
eq('생애최초 감면 → 차단', ACQ({ reduction: 'first' }).length > 0, true);
eq('85㎡ 초과 → 차단', ACQ({ propertyType: '주택', exclusiveArea: '86' }).length > 0, true);
eq('면적 미입력(주택 매매) → 차단', ACQ({ propertyType: '주택', acquisitionType: '매매' }).length > 0, true);
eq('토지 → 차단', ACQ({ propertyType: '토지' }).length > 0, true);
eq('주택 상속 → 차단', ACQ({ acquisitionType: '상속', propertyType: '주택' }).length > 0, true);
eq('85㎡ 이하·면적 입력·감면없음 → 통과',
   ACQ({ propertyType: '주택', acquisitionType: '매매', exclusiveArea: '84', reduction: 'none', housingCount: '1' }).length, 0);

console.log('\n════ 재산세 ════');
const PROP = (a) => runChecks('ReportProperty.jsx', 'propGaps', a);
eq('종합합산 토지 → 차단', PROP({ propertyKind: '토지', landType: '종합합산' }).length > 0, true);
eq('별도합산 토지 → 차단', PROP({ propertyKind: '토지', landType: '별도합산' }).length > 0, true);
eq('전년도 세액 입력 → 차단', PROP({ propertyKind: '주택', priorYearTax: '100000' }).length > 0, true);
eq('건축물 → 차단', PROP({ propertyKind: '건축물' }).length > 0, true);
eq('일반 주택 → 통과', PROP({ propertyKind: '주택', isOneHouse: 'yes' }).length, 0);

console.log('\n════ 양도세 ════');
const CGT = (a) => runChecks('ReportCGT.jsx', 'cgtGaps', a);
eq('승계취득 입주권 → 차단', CGT({ assetType: 'occupancy_succ' }).length > 0, true);
eq('원조합원 입주권 → 차단', CGT({ assetType: 'occupancy_orig' }).length > 0, true);
eq('조정 1주택+입주권 동시보유 → 차단',
   CGT({ assetType: 'house_1', houseConcurrentRight: 'occupancy', adjustedZone: 'yes' }).length > 0, true);
eq('취득당시 조정지역 «모름» → 차단', CGT({ assetType: 'house_1', acqAdjustedZone: 'unsure' }).length > 0, true);
eq('전입일이 취득일보다 앞섬 → 차단',
   CGT({ assetType: 'house_1', acquiredDate: '2020-01-01', moveInDate: '2010-01-01' }).length > 0, true);
eq('평범한 1주택 → 통과',
   CGT({ assetType: 'house_1', acqAdjustedZone: 'no', acquiredDate: '2015-01-01', moveInDate: '2015-06-01' }).length, 0);
eq('상가(비주택) → 통과 (단기세율·기본세율은 폴백도 맞다)', CGT({ assetType: 'commercial' }).length, 0);

console.log('\n════ «배선» 확인 — 규칙만 있고 화면이 안 쓰면 소용없다 ════');
[['ReportInheritance.jsx', 'inhBlocked'], ['ReportGift.jsx', 'giftBlocked'],
 ['ReportAcquisition.jsx', 'acqBlocked'], ['ReportProperty.jsx', 'propBlocked'],
 ['ReportCGT.jsx', 'cgtBlocked']].forEach(([f, v]) => {
  const s = fs.readFileSync(SRC(f), 'utf8');
  eq(`${f} 가 JTFallbackBlocked 를 렌더한다`, /<JTFallbackBlocked\b/.test(s), true);
  eq(`${f} 가 ${v} 로 숫자 표시를 가른다`, new RegExp('\\{!?' + v + '\\b').test(s), true);
  /* 엔진 성공(precise)이면 절대 막지 않는다 — 정상 이용자를 막으면 그게 더 큰 사고다.
     증여세는 `(calc.precise || calc.engineErr) ? [] :` 형태다(부담부 경로가 이미 따로 막는다).
     그래서 «정확한 문자열»이 아니라 «precise 가 조건에 들어 있는가»로 본다. */
  eq(`${f} 는 precise 이면 차단하지 않는다`, /calc\.precise[^?\n]*\?\s*\[\]\s*:/.test(s), true);
});

console.log(`\n════════════════════\n실패 ${fails}건`);
process.exit(fails ? 1 : 0);

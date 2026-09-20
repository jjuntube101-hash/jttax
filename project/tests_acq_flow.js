/* 취득세 입력 흐름 회귀 — 260921 (Astra R1-F5·F3·F6 대응분)

   이 파일이 지키는 네 가지. 넷 다 «실제로 깨졌거나 깨질 수 있었던» 것이다.

     ① 되돌아갈 길 없는 차단 화면에 닿지 않는가
        조정대상지역 질문이 상세 단계에만 있어서, 2주택 매매·주택 증여로 «빠른 계산»을
        누르면 계산 전 게이트가 그 답을 요구하며 막았다. 그런데 그 화면에는 「처음부터
        다시」밖에 없어 답을 전부 버려야만 빠져나올 수 있었다(Astra R1-F5 실측).
        → 그 분기에서는 quick 으로 올라왔는가 + 차단 화면에 «돌아가기»가 있는가.

     ② 새로 노출한 유형이 엔진 미응답 시 «전부» 막히는가
        간이 폴백(fallbackAcqTax)에는 공매·재산분할·농지·오피스텔·법인·출산양육 감면의
        계산 경로가 없다. 막지 않으면 매매·비주택 분기로 흘러가 «다른 세율»이 나온다.

     ③ 신혼부부·귀농 감면이 선택지에 «없는가»
        엔진은 두 enum 을 받지만 260921 검증에서 산식이 조문과 어긋나거나(신혼부부 §36의2)
        근거조문 자체가 확인되지 않았다(귀농). 엔진이 받는다 ≠ 화면에 내도 된다.

     ④ 조례 카드가 세액에 새지 않는가
        조례 경감률은 «원문 안내»일 뿐이다. 매퍼 출력이 시·도 선택과 조례 스냅샷 유무에
        영향받으면, 검증되지 않은 지방 경감률이 세액에 반영된 셈이 된다.

   ⚠️ 판정 «규칙»은 여기서 흉내 내지 않는다 — 소스의 함수를 그대로 꺼내 실행한다
      (tests_fallback_block.js 와 같은 원칙: 테스트가 본 규칙과 앱이 쓰는 규칙이 갈라지면
       게이트가 비어 버린다). */
'use strict';
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const SRC = path.join(__dirname, 'src', 'ReportAcquisition.jsx');
const code = fs.readFileSync(SRC, 'utf8');

let fails = 0;
function eq(label, got, want) {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}` + (ok ? '' : `\n      got=${JSON.stringify(got)}  want=${JSON.stringify(want)}`));
}

/* ── 소스에서 «최상위 선언»을 이름으로 꺼내 그대로 실행한다 ─────────────────
   문자열·주석·중첩 괄호를 직접 세지 않고 구문 트리의 범위를 쓴다. 선언이 사라지거나
   이름이 바뀌면 조용히 통과하지 않고 여기서 죽는다. */
function loadDecls(names) {
  const ast = parser.parse(code, { sourceType: 'script', plugins: ['jsx'] });
  const want = new Set(names);
  const found = new Set();
  const chunks = [];
  for (const n of ast.program.body) {
    if (n.type === 'FunctionDeclaration' && n.id && want.has(n.id.name)) {
      found.add(n.id.name); chunks.push(code.slice(n.start, n.end));
    } else if (n.type === 'VariableDeclaration') {
      const ids = n.declarations.map((d) => (d.id && d.id.name) || '');
      if (ids.some((x) => want.has(x))) { ids.forEach((x) => want.has(x) && found.add(x)); chunks.push(code.slice(n.start, n.end)); }
    }
  }
  const missing = names.filter((n) => !found.has(n));
  if (missing.length) throw new Error(`ReportAcquisition.jsx 에서 최상위 선언을 찾지 못했습니다: ${missing.join(', ')}`);
  const sandbox = { window: { jtFallbackGaps: (cs) => (cs || []).filter((c) => c && c.when).map((c) => c.why) } };
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', chunks.join('\n\n') + '\n;return {' + names.join(',') + '};');
  return fn(sandbox.window);
}

const M = loadDecls([
  'acqIsPaid', 'acqIsCorporate', 'acqNewTypeSelected',
  'ACQ_REDUCTION_NOTE', 'ACQ_REGIONS', 'ACQ_QS',
  'ACQ_PROPERTY_TYPE', 'ACQ_ACQUISITION_TYPE',
  'mapAnswersToAcquisition', 'acqFallbackGaps', 'acqIsQuick', 'acqFirstOpenQuestion',
]);

const ENGINE_OK = { precise: true };
const ENGINE_DOWN = { precise: false };

/* ══════════════════════════════════════════════════════════════════════
   ① 되돌아갈 길 없는 차단 화면에 닿지 않는가
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ① 빠른 계산에서 «돌아갈 길 없는 차단»에 닿지 않는가 ════');

/* 사용자가 «빠른 계산» 단계를 순서대로 답해 나가는 것을 그대로 흉내 낸다.
   시나리오에 없는 문항이 quick 에 새로 생기면 그때 실패한다 — 「몰래 늘어난 필수 문항」이
   곧 새로운 막다른 길이기 때문이다. */
function walkQuick(scenario, label) {
  const answers = {};
  const asked = [];
  for (let guard = 0; guard < 40; guard++) {
    const visible = M.ACQ_QS.filter((q) => !q.showIf || q.showIf(answers));
    const quick = visible.filter((q) => M.acqIsQuick(q, answers));
    const next = quick.find((q) => {
      const v = answers[q.id];
      return v === undefined || v === null || v === '';
    });
    if (!next) break;
    if (!Object.prototype.hasOwnProperty.call(scenario, next.id)) {
      eq(`${label} · quick 문항 「${next.id}」이 시나리오에 없습니다 (필수 문항이 늘어났는지 확인)`, false, true);
      return { answers, asked };
    }
    answers[next.id] = scenario[next.id];
    asked.push(next.id);
  }
  return { answers, asked };
}

const SC_2HOUSE = {
  acquisitionType: '매매', propertyType: '주택', acquirerType: 'individual',
  propertyValue: '800000000', housingCount: '2', exclusiveArea: '84',
  isRegulatedArea: 'no', temporaryTwoHouse: 'no', region: '경기도',
};
const SC_GIFT = {
  acquisitionType: '증여', propertyType: '주택',
  propertyValue: '400000000', exclusiveArea: '84',
  isRegulatedArea: 'no', region: '경기도',
};

for (const [label, sc] of [['2주택 매매', SC_2HOUSE], ['주택 증여', SC_GIFT]]) {
  const { answers, asked } = walkQuick(sc, label);
  eq(`${label} · 조정대상지역을 «빠른 계산»에서 묻는다 (종전엔 상세 단계에만 있었다)`,
     asked.includes('isRegulatedArea'), true);
  eq(`${label} · 빠른 계산을 정상으로 마치면 입력 차단이 0건이다`,
     M.acqFallbackGaps(answers, ENGINE_OK).length, 0);
}

/* 1주택 매매는 조정지역 답이 없어도 막히지 않는다 — 그 분기까지 quick 으로 끌어올리면
   묻지 않아도 되는 것을 묻는 과잉 질문이 된다. */
{
  const { answers, asked } = walkQuick({
    acquisitionType: '매매', propertyType: '주택', acquirerType: 'individual',
    propertyValue: '500000000', housingCount: '1', exclusiveArea: '84', region: 'unknown',
  }, '1주택 매매');
  eq('1주택 매매 · 조정대상지역은 빠른 계산에서 «묻지 않는다» (과잉 질문 방지)',
     asked.includes('isRegulatedArea'), false);
  eq('1주택 매매 · 입력 차단 0건', M.acqFallbackGaps(answers, ENGINE_OK).length, 0);
}

/* 「모르겠어요」는 여전히 막는다 — 막는 것 자체는 고치지 않았다(차단 조건 불변).
   달라진 것은 «그때 돌아갈 곳이 있는가»다. */
{
  const blocked = { ...SC_2HOUSE, isRegulatedArea: 'unsure' };
  eq('조정지역 «모르겠어요» → 여전히 차단된다 (차단 조건은 바꾸지 않았다)',
     M.acqFallbackGaps(blocked, ENGINE_OK).length > 0, true);
  const target = M.acqFirstOpenQuestion(blocked);
  eq('차단 시 «돌아갈 문항»이 바로 그 조정대상지역 문항이다',
     target && target.id, 'isRegulatedArea');
}
{
  const blocked = { ...SC_GIFT, isRegulatedArea: 'unsure' };
  eq('증여 · 조정지역 «모르겠어요» → 차단되고 돌아갈 문항이 그 문항이다',
     (M.acqFallbackGaps(blocked, ENGINE_OK).length > 0) && M.acqFirstOpenQuestion(blocked).id === 'isRegulatedArea', true);
}
/* 모든 답이 채워졌는데 막히는 경우(3주택 + 일시적2주택 잔존)도 화면이 죽지 않아야 한다 */
{
  const stale = { ...SC_2HOUSE, housingCount: '3', isRegulatedArea: 'yes', temporaryTwoHouse: 'yes' };
  eq('3주택 + 일시적2주택 잔존 → 차단', M.acqFallbackGaps(stale, ENGINE_OK).length > 0, true);
  eq('이때 «빠진 문항»은 없으므로 null 을 돌려준다 (화면이 첫 문항으로 보낸다)',
     M.acqFirstOpenQuestion(stale), null);
}

/* 화면 배선 — 차단 화면에 «돌아가기»가 실제로 있는가.
   판정 규칙과 달리 이건 JSX 라 실행할 수 없다. 조기 반환 서브트리를 잘라 확인한다. */
{
  const head = 'if (acqBlocked) {';
  const i = code.indexOf(head);
  let d = 1, j = i + head.length;
  while (j < code.length && d > 0) { const ch = code[j]; if (ch === '{') d++; else if (ch === '}') d--; j++; }
  const body = i < 0 ? '' : code.slice(i, j);
  eq('차단 화면 블록을 찾았다', body.length > 0, true);
  eq('차단 화면에 «돌아가기» 동작(goToQuestion)이 배선돼 있다', /goToQuestion\(/.test(body), true);
  eq('차단 화면에 「처음부터 다시」도 남아 있다', body.includes('처음부터 다시'), true);
  /* 되돌아가기가 답을 지우면 «돌아갈 길»이 아니다 — 그 블록에서 setAnswers({}) 는
     「처음부터 다시」 버튼 하나에만 있어야 한다. */
  eq('차단 화면에서 답을 비우는 호출은 1개뿐이다 (돌아가기는 답을 보존한다)',
     (body.match(/setAnswers\(\{\}\)/g) || []).length, 1);
}

/* ══════════════════════════════════════════════════════════════════════
   ② 새 유형은 엔진이 응답하지 않으면 전부 막힌다
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ② 새로 노출한 유형은 엔진 미응답 시 «전부» 막히는가 ════');

const NEW_TYPE_CASES = [
  ['공매 주택', { acquisitionType: '공매', propertyType: '주택', acquirerType: 'individual', exclusiveArea: '84', housingCount: '1', isRegulatedArea: 'no', reduction: 'none' }],
  ['공매 상가', { acquisitionType: '공매', propertyType: '상가' }],
  ['재산분할 주택', { acquisitionType: '재산분할', propertyType: '주택', exclusiveArea: '84' }],
  ['재산분할 농지', { acquisitionType: '재산분할', propertyType: '농지' }],
  ['농지 유상', { acquisitionType: '매매', propertyType: '농지' }],
  ['농지 상속', { acquisitionType: '상속', propertyType: '농지' }],
  ['오피스텔 주거용', { acquisitionType: '매매', propertyType: '오피스텔_주거용' }],
  ['오피스텔 업무용', { acquisitionType: '매매', propertyType: '오피스텔_업무용' }],
  ['법인 주택 매매', { acquisitionType: '매매', propertyType: '주택', acquirerType: 'corporate', exclusiveArea: '84' }],
  ['출산양육 감면', { acquisitionType: '매매', propertyType: '주택', acquirerType: 'individual', exclusiveArea: '84', housingCount: '1', isRegulatedArea: 'no', reduction: 'childbirth' }],
];
for (const [label, ans] of NEW_TYPE_CASES) {
  eq(`${label} · 엔진이 죽으면 금액을 내지 않는다`, M.acqFallbackGaps(ans, ENGINE_DOWN).length > 0, true);
  eq(`${label} · 새 유형이라고 표시된다 (자동 해설을 붙이지 않는 기준)`, M.acqNewTypeSelected(ans), true);
}
/* 반대로 «종전부터 되던» 평범한 입력은 엔진이 죽어도 여전히 통과해야 한다 —
   차단을 넓히면서 정상 이용자를 쫓아내지 않았는지 같이 본다. */
eq('1주택 매매 84㎡ · 엔진이 죽어도 통과 (과잉 차단 없음)',
   M.acqFallbackGaps({ acquisitionType: '매매', propertyType: '주택', acquirerType: 'individual', exclusiveArea: '84', housingCount: '1', reduction: 'none' }, ENGINE_DOWN).length, 0);
eq('1주택 매매 84㎡ · 새 유형이 아니다 (자동 해설 경로 유지)',
   M.acqNewTypeSelected({ acquisitionType: '매매', propertyType: '주택', acquirerType: 'individual', exclusiveArea: '84', housingCount: '1', reduction: 'none' }), false);

/* 공매는 매매와 «같은 주택 규정»을 탄다 — 그래서 매매에 걸린 ①층 차단이 공매에도 걸려야 한다.
   안 걸리면 공매 다주택자에게 조정지역을 묻지 않은 채 엔진이 비조정으로 가정한다. */
eq('공매 2주택 + 조정 «모름» → 엔진이 살아 있어도 차단 (260921 추가분)',
   M.acqFallbackGaps({ propertyType: '주택', acquisitionType: '공매', exclusiveArea: '84', housingCount: '2', isRegulatedArea: 'unsure' }, ENGINE_OK).length > 0, true);
eq('공매 3주택 + 일시적2주택 잔존 → 엔진이 살아 있어도 차단 (260921 추가분)',
   M.acqFallbackGaps({ propertyType: '주택', acquisitionType: '공매', exclusiveArea: '84', housingCount: '3', isRegulatedArea: 'yes', temporaryTwoHouse: 'yes' }, ENGINE_OK).length > 0, true);

/* 매퍼가 공매를 유상거래로 보내는가 — 안 보내면 중과·감면이 통째로 빠진다 */
{
  const p = M.mapAnswersToAcquisition({ acquisitionType: '공매', propertyType: '주택', acquirerType: 'individual', propertyValue: '800000000', housingCount: '2', isRegulatedArea: 'yes', exclusiveArea: '84' });
  eq('공매 · acquisition_type 이 「공매」로 간다', p.acquisition_type, '공매');
  eq('공매 · 주택 수가 payload 에 실린다 (다주택 중과 판정용)', p.housing_count, 2);
  eq('공매 · 조정대상지역이 payload 에 실린다', p.is_regulated_area, true);
}
/* 농지는 property_type 만으로는 세율이 안 갈린다 — is_farmland 가 없으면 일반 토지율이 된다
   (260921 fly.dev 실측: 2억 농지 유상 → is_farmland 없으면 8,000,000, 있으면 6,000,000) */
{
  const p = M.mapAnswersToAcquisition({ acquisitionType: '매매', propertyType: '농지', propertyValue: '200000000' });
  eq('농지 · property_type=농지', p.property_type, '농지');
  eq('농지 · is_farmland 플래그를 반드시 함께 보낸다 (세율을 가르는 것은 이 값이다)', p.is_farmland, true);
}
/* 법인은 개인 전용 필드를 보내지 않는다 — 검증된 조합(법인 주택 유상) 밖으로 나가지 않는다 */
{
  const p = M.mapAnswersToAcquisition({ acquisitionType: '매매', propertyType: '주택', acquirerType: 'corporate', propertyValue: '500000000', housingCount: '3', isRegulatedArea: 'yes', reduction: 'first', exclusiveArea: '84' });
  eq('법인 · is_corporate 를 보낸다', p.is_corporate, true);
  eq('법인 · 주택 수를 보내지 않는다', 'housing_count' in p, false);
  eq('법인 · 감면 유형을 보내지 않는다', 'reduction_type' in p, false);
}

/* ══════════════════════════════════════════════════════════════════════
   ③ 신혼부부·귀농 감면은 선택지에 없다
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ③ 신혼부부·귀농 감면이 선택지에 «없는가» ════');
{
  const reductionQ = M.ACQ_QS.find((q) => q.id === 'reduction');
  eq('감면 문항이 있다', !!reductionQ, true);
  const values = (reductionQ.opts || []).map((o) => o[0]);
  eq('감면 선택지 값 목록', values.join(','), 'none,first,childbirth');
  /* 선택지 «값»뿐 아니라 «그 값을 골랐을 때 엔진에 무엇이 가는가»까지 본다 —
     라벨만 지우고 매퍼에 남겨 두면 검증 안 된 감면이 계속 계산된다. */
  const forbidden = ['신혼부부', '귀농주택', '귀농'];
  for (const v of values) {
    const p = M.mapAnswersToAcquisition({
      acquisitionType: '매매', propertyType: '주택', acquirerType: 'individual',
      propertyValue: '400000000', housingCount: '1', exclusiveArea: '84', reduction: v,
    });
    const rt = p.reduction_type || '';
    eq(`감면 「${v}」 → 금지 감면유형이 가지 않는다`, forbidden.some((f) => rt.includes(f)), false);
    eq(`감면 「${v}」 → is_newlywed 플래그가 없다`, 'is_newlywed' in p, false);
  }
  /* 매퍼 소스 자체에도 두 enum 이 남아 있으면 안 된다 (죽은 분기로 부활하는 경로) */
  const mapperSrc = M.mapAnswersToAcquisition.toString();
  eq('매퍼에 「신혼부부」 감면유형 대입이 없다', /reduction_type\s*=\s*["'『「]?\s*신혼부부/.test(mapperSrc), false);
  eq('매퍼에 「귀농」 감면유형 대입이 없다', /reduction_type\s*=\s*["'『「]?\s*귀농/.test(mapperSrc), false);
  eq('매퍼에 is_newlywed 대입이 없다', /is_newlywed/.test(mapperSrc), false);
  /* 문항 정의 쪽도 본다 — 선택지 «값»에 두 감면이 되살아나면 여기서 잡힌다 */
  eq('감면 선택지 값에 신혼부부·귀농이 없다',
     values.some((v) => /newlywed|farm|귀농|신혼/i.test(v)), false);
}

/* ══════════════════════════════════════════════════════════════════════
   ④ 조례 카드는 세액에 새지 않는다
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ④ 조례 카드의 경감률이 매퍼 출력에 영향을 주지 않는가 ════');
{
  const base = {
    acquisitionType: '매매', propertyType: '주택', acquirerType: 'individual',
    propertyValue: '500000000', housingCount: '1', exclusiveArea: '84',
    isRegulatedArea: 'no', reduction: 'none',
  };
  const noRegion = JSON.stringify(M.mapAnswersToAcquisition(base));
  const regions = M.ACQ_REGIONS.concat(['unknown']);
  const differing = regions.filter((r) => JSON.stringify(M.mapAnswersToAcquisition({ ...base, region: r })) !== noRegion);
  eq('시·도를 무엇으로 고르든 엔진 payload 가 같다', differing.join(',') || '-', '-');

  /* 조례 스냅샷이 «있을 때»도 같아야 한다. 실제 카드에는 경감률(100분의 25 등)이 들어 있다. */
  const prev = global.window;
  global.window = {
    JT_ORDINANCE_CARDS: {
      cards: { 경기도: { region: '경기도', ordinanceName: '경기도 도세 감면 조례', articleLabel: '제6조', articleText: '100분의 25 / 100분의 15', reductionRate: 0.25 } },
    },
  };
  const withCard = JSON.stringify(M.mapAnswersToAcquisition({ ...base, region: '경기도' }));
  global.window = prev;
  eq('조례 스냅샷이 있어도 payload 가 같다 (경감률이 세액에 반영되지 않는다)', withCard, noRegion);

  /* payload 에 조례 관련 키가 아예 없어야 한다 — 이름만 달리해 새는 경로 차단 */
  const keys = Object.keys(JSON.parse(noRegion));
  const leaked = keys.filter((k) => /region|ordinance|조례|reduction_rate|경감/i.test(k) && k !== 'is_regulated_area');
  eq('payload 에 조례·소재지 관련 키가 없다', leaked.join(',') || '-', '-');

  /* 카드 렌더 코드가 세액 계산에 손대지 않는가 — 계산 함수를 부르지 않는 것으로 고정 */
  const cardSrc = (() => {
    const head = 'function JTAcqOrdinanceCard(';
    const i = code.indexOf(head);
    if (i < 0) return '';
    let d = 0, j = code.indexOf('{', i), started = false;
    while (j < code.length) { const ch = code[j]; if (ch === '{') { d++; started = true; } else if (ch === '}') { d--; } j++; if (started && d === 0) break; }
    return code.slice(i, j);
  })();
  eq('조례 카드 컴포넌트를 찾았다', cardSrc.length > 0, true);
  for (const banned of ['fallbackAcqTax', 'mapAnswersToAcquisition', 'totalTax', 'acqTax']) {
    eq(`조례 카드가 «${banned}» 를 건드리지 않는다`, cardSrc.includes(banned), false);
  }
}

console.log(`\n════════════════════\n취득세 입력 흐름 실패 ${fails}건`);
process.exit(fails ? 1 : 0);

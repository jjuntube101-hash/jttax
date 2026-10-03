/* 취득세 입력 흐름 회귀 — 260921 (Astra R1-F5·F3·F6 대응분)

   이 파일이 지키는 네 가지. 넷 다 «실제로 깨졌거나 깨질 수 있었던» 것이다.

     ① 되돌아갈 길 없는 차단 화면에 닿지 않는가
        조정대상지역 질문이 상세 단계에만 있어서, 2주택 매매·주택 증여로 «빠른 계산»을
        누르면 계산 전 게이트가 그 답을 요구하며 막았다. 그런데 그 화면에는 「처음부터
        다시」밖에 없어 답을 전부 버려야만 빠져나올 수 있었다(Astra R1-F5 실측).
        → 그 분기에서는 quick 으로 올라왔는가 + 차단 화면에 «돌아가기»가 있는가.

     ② 엔진 값이 없으면 «모든» 입력이 막히는가 (261004: 프론트 자체 계산식(폴백) 삭제)
        엔진이 응답하지 않거나(down·미지정) 계산을 거부하면(refused) 금액을 만들 방법이 없다.
        공매·재산분할·농지·오피스텔·법인·출산양육 감면 같은 새 유형도, 평범한 1주택 매매도 똑같이 막힌다.

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
const vm = require('vm');
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
  /* acqCalcFromEngine 이 쓰는 공용 응답 검증기(window.jtValidCalc)는 Report.jsx 의 «실제 코드»를 꺼내 쓴다 */
  const vctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'src', 'Report.jsx'), 'utf8').match(/window\.jtValidCalc = function[\s\S]*?\n  };/)[0], vctx);
  const sandbox = { window: { jtValidCalc: vctx.window.jtValidCalc, jtFallbackGaps: (cs) => (cs || []).filter((c) => c && c.when).map((c) => c.why) } };
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', chunks.join('\n\n') + '\n;return {' + names.join(',') + '};');
  return fn(sandbox.window);
}

const M = loadDecls([
  'acqIsPaid', 'acqIsCorporate', 'acqNewTypeSelected',
  'ACQ_REDUCTION_NOTE', 'ACQ_REGIONS', 'ACQ_QS',
  'ACQ_PROPERTY_TYPE', 'ACQ_ACQUISITION_TYPE',
  'acqOptionAvailable', 'acqVisibleOpts', 'acqAnswerLabel', 'acqNormalize', 'acqNormalizeAnswers',
  'acqNoticeKey', 'ACQ_HEAVY_NOTICE',
  'mapAnswersToAcquisition', 'acqFallbackGaps', 'acqIsQuick', 'acqFirstOpenQuestion',
  'ACQ_ENGINE_REQUIRED', 'acqCalcFromEngine', 'acqCalcFromEngineError',
]);

const ENGINE_OK = { precise: true };
const ENGINE_DOWN = { precise: false };                                  // engineState 미지정 = 연결 실패로 취급
const ENGINE_DOWN_EXPLICIT = { precise: false, engineState: 'down' };
const ENGINE_REFUSED = { precise: false, engineState: 'refused' };       // 엔진이 계산을 거부

/* ★ 260921 R3-F2: 앱은 «정규화된 답»만 차단 검사·이동 함수에 넘긴다
   (ReportAcquisition.jsx 의 `const answers = acqNormalizeAnswers(rawAnswers)`).
   시험이 원본 답을 직접 넣으면 «실제 앱에서는 일어날 수 없는 경로»를 성공 사례로 굳힌다.
   그래서 이 파일의 모든 차단·이동 단언은 아래 두 함수를 거친다.
   (`acqFallbackGaps` 자체의 «판정 규칙»은 tests_fallback_block.js 가 원본 입력으로 따로
    고정한다 — 그쪽은 «함수» 시험이고, 여기는 «앱 경로» 시험이다.) */
const GAPS = (a, calc) => M.acqFallbackGaps(M.acqNormalizeAnswers(a), calc);
const OPENQ = (a) => M.acqFirstOpenQuestion(M.acqNormalizeAnswers(a));

/* ══════════════════════════════════════════════════════════════════════
   ① 되돌아갈 길 없는 차단 화면에 닿지 않는가
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ① 빠른 계산에서 «돌아갈 길 없는 차단»에 닿지 않는가 ════');

/* 사용자가 «빠른 계산» 단계를 순서대로 답해 나가는 것을 그대로 흉내 낸다.
   시나리오에 없는 문항이 quick 에 새로 생기면 그때 실패한다 — 「몰래 늘어난 필수 문항」이
   곧 새로운 막다른 길이기 때문이다. */
/* ⚠️ 260921 R2-F5: 컴포넌트가 실제로 하는 일을 그대로 따라간다 —
   ① 상태에는 «원본 답»이 쌓이고(setAns 는 병합만 한다) ② 화면·판정은 acqNormalizeAnswers
   를 거친 답만 본다 ③ 선택지는 acqVisibleOpts 가 고른다. 셋 다 실제 소스 함수를 쓴다. */
function walkQuick(scenario, label) {
  const raw = {};                 // = 컴포넌트의 rawAnswers
  const asked = [];
  for (let guard = 0; guard < 40; guard++) {
    const answers = M.acqNormalizeAnswers(raw);      // = 컴포넌트의 answers
    const visible = M.ACQ_QS.filter((q) => !q.showIf || q.showIf(answers));
    const quick = visible.filter((q) => M.acqIsQuick(q, answers));
    const next = quick.find((q) => {
      const v = answers[q.id];
      return v === undefined || v === null || v === '';
    });
    if (!next) break;
    if (!Object.prototype.hasOwnProperty.call(scenario, next.id)) {
      eq(`${label} · quick 문항 「${next.id}」이 시나리오에 없습니다 (필수 문항이 늘어났는지 확인)`, false, true);
      return { answers, raw, asked };
    }
    const want = scenario[next.id];
    /* 선택지 문항이면 «지금 고를 수 있는» 선택지여야 한다 — 시나리오가 사라진 선택지를
       고르려 하면 그건 시험이 화면과 어긋난 것이므로 실패시킨다. */
    if (next.opts && !M.acqVisibleOpts(next, answers).some((o) => o[0] === want)) {
      eq(`${label} · 「${next.id}」 선택지 「${want}」는 지금 고를 수 없습니다`, false, true);
      return { answers: M.acqNormalizeAnswers(raw), raw, asked };
    }
    raw[next.id] = want;
    asked.push(next.id);
  }
  return { answers: M.acqNormalizeAnswers(raw), raw, asked };
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
     GAPS(answers, ENGINE_OK).length, 0);
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
  eq('1주택 매매 · 입력 차단 0건', GAPS(answers, ENGINE_OK).length, 0);
}

/* 「모르겠어요」는 여전히 막는다 — 막는 것 자체는 고치지 않았다(차단 조건 불변).
   달라진 것은 «그때 돌아갈 곳이 있는가»다. */
{
  const blocked = { ...SC_2HOUSE, isRegulatedArea: 'unsure' };
  eq('조정지역 «모르겠어요» → 여전히 차단된다 (차단 조건은 바꾸지 않았다)',
     GAPS(blocked, ENGINE_OK).length > 0, true);
  const target = OPENQ(blocked);
  eq('차단 시 «돌아갈 문항»이 바로 그 조정대상지역 문항이다',
     target && target.id, 'isRegulatedArea');
}
{
  const blocked = { ...SC_GIFT, isRegulatedArea: 'unsure' };
  eq('증여 · 조정지역 «모르겠어요» → 차단되고 돌아갈 문항이 그 문항이다',
     (GAPS(blocked, ENGINE_OK).length > 0) && OPENQ(blocked).id === 'isRegulatedArea', true);
}
/* ★ 260921 R3-F2 정정. 종전 이 자리는 «원본 답»을 그대로 넣어 「3주택 + 일시적2주택 잔존이
   차단된다」를 고정했는데, 앱에서는 그 상태에 닿을 수 없다 — 주택 수를 3으로 바꾸는 순간
   정규화가 숨은 temporaryTwoHouse 를 지우기 때문이다(그게 R2 에서 넣은 장치의 목적이다).
   그래서 «앱 경로»에서 실제로 일어나는 일을 고정한다: 잔존 답이 사라지고 3주택으로 계산된다.
   차단 «규칙» 자체는 tests_fallback_block.js 가 원본 입력으로 계속 지킨다. */
{
  const stale = { ...SC_2HOUSE, housingCount: '3', isRegulatedArea: 'yes', temporaryTwoHouse: 'yes' };
  const norm = M.acqNormalizeAnswers(stale);
  eq('3주택으로 바꾸면 숨은 「일시적 2주택 예」가 정규화에서 사라진다', norm.temporaryTwoHouse, undefined);
  const p = M.mapAnswersToAcquisition(stale);
  eq('그래서 엔진에 is_temporary_two_house 가 가지 않는다', 'is_temporary_two_house' in p, false);
  eq('주택 수는 3으로 그대로 간다 (중과가 빠지지 않는다)', p.housing_count, 3);
  eq('앱 경로에서는 이 상태가 차단되지 않는다 (차단할 사유가 이미 사라졌다)',
     GAPS(stale, ENGINE_OK).length, 0);
  /* 원본을 그대로 넣으면 «함수»는 여전히 막는다 — 규칙을 약화시키지 않았다는 확인 */
  eq('판정 함수 자체는 원본 입력에서 여전히 막는다 (규칙 불변)',
     M.acqFallbackGaps(stale, ENGINE_OK).length > 0, true);
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
console.log('\n════ ② 엔진 값이 없으면(down·refused) 새 유형도 평범한 입력도 «전부» 막히는가 ════');

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
  eq(`${label} · 엔진이 죽으면 금액을 내지 않는다`, GAPS(ans, ENGINE_DOWN).length > 0, true);
  eq(`${label} · 엔진이 거부해도 금액을 내지 않는다 (사유에 「세무사 확인」)`,
     GAPS(ans, ENGINE_REFUSED).some((g) => g.includes('세무사 확인')), true);
  eq(`${label} · 새 유형이라고 표시된다 (자동 해설을 붙이지 않는 기준)`, M.acqNewTypeSelected(ans), true);
}
/* 261004: 자체 계산식이 없으므로 «평범한 입력»도 엔진 값이 없으면 막힌다.
   반대로 엔진이 값을 줬으면(precise) 입력이 평범한 한 막지 않는다 — 과잉 차단 방지. */
{
  const plain = { acquisitionType: '매매', propertyType: '주택', acquirerType: 'individual', exclusiveArea: '84', housingCount: '1', reduction: 'none' };
  eq('1주택 매매 84㎡ · 엔진이 죽으면 막힌다 (자체 계산식이 없다)', GAPS(plain, ENGINE_DOWN).length, 1);
  eq('1주택 매매 84㎡ · engineState:down 도 같다', GAPS(plain, ENGINE_DOWN_EXPLICIT).length, 1);
  eq('1주택 매매 84㎡ · 엔진이 거부해도 막힌다', GAPS(plain, ENGINE_REFUSED).length, 1);
  eq('1주택 매매 84㎡ · 엔진이 값을 주면 통과 (과잉 차단 없음)', GAPS(plain, ENGINE_OK).length, 0);
}
eq('1주택 매매 84㎡ · 새 유형이 아니다 (자동 해설 경로 유지)',
   M.acqNewTypeSelected({ acquisitionType: '매매', propertyType: '주택', acquirerType: 'individual', exclusiveArea: '84', housingCount: '1', reduction: 'none' }), false);

/* ── 새 유형에 «자동 생성 해설」이 붙지 않는가 (Astra R1-F6) ────────────────
   ⚠️ 260921 실사고: 「신규 유형이면 throw」로만 갈랐더니 기존 유형용 catch 폴백이
      그대로 나와, 농지·공매 결과에 「생애최초·신혼부부 감면」·「다주택 중과」가 붙었다.
      구문 검사로는 안 잡히고 브라우저에서 드러났다. 그래서 «어느 문구가 쓰이는가»를
      runAnalysis 소스 구조로 고정한다. */
console.log('\n════ ②-b 새 유형에 자동 해설·기존 절세 문구가 붙지 않는가 ════');
{
  const M2 = loadDecls(['ACQ_REDUCTION_NOTE', 'ACQ_NEW_TYPE_COMMENTARY']);
  const fixed = JSON.stringify(M2.ACQ_NEW_TYPE_COMMENTARY);
  eq('신규 유형 전용 고정 문구가 있다', !!M2.ACQ_NEW_TYPE_COMMENTARY, true);
  eq('그 문구의 절세 아이디어는 비어 있다', (M2.ACQ_NEW_TYPE_COMMENTARY.saving_ideas || []).length, 0);
  eq('그 문구에 「신혼부부」가 없다', fixed.includes('신혼부부'), false);
  eq('그 문구에 「생애최초」가 없다', fixed.includes('생애최초'), false);
  /* 260921: 기존 유형용 폴백 문구에도 「신혼부부 감면」이 «절세 여지»로 남아 있었다 — 지특법 §36의2①은
     2020-12-31 일몰(law.go.kr API 260921 조회). 화면에 나가는 문자열(주석 제외) 어디에도 없어야 한다. */
  /* 주석을 정규식으로 걷어내면 문자열 안의 `//`(URL) 뒤를 함께 지워 위음성이 날 수 있다(Codex R6).
     그래서 구문 분석으로 «문자열·템플릿·JSX 텍스트» 노드만 모아서 본다 — 주석은 애초에 노드가 아니다. */
  const raSrc = fs.readFileSync(path.join(__dirname, 'src', 'ReportAcquisition.jsx'), 'utf8');
  const literals = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'StringLiteral' || n.type === 'JSXText') literals.push(n.value);
    else if (n.type === 'TemplateElement') literals.push(n.value && (n.value.cooked || n.value.raw) || '');
    for (const k of Object.keys(n)) { if (k !== 'loc' && k !== 'leadingComments' && k !== 'trailingComments' && k !== 'innerComments') walk(n[k]); }
  })(require('@babel/parser').parse(raSrc, { sourceType: 'script', plugins: ['jsx'] }).program);
  eq('문자열 노드를 충분히 모았다(분석이 비어 있지 않다)', literals.length > 300, true);
  eq('ReportAcquisition.jsx 의 화면 문자열(문자열·템플릿·JSX 텍스트)에 「신혼부부」가 없다',
     literals.some((s) => String(s).includes('신혼부부')), false);
  const shown = literals.join('\n');
  eq('기존 유형 폴백의 절세 여지는 「생애최초 주택 구입 감면」(§36의3)이다',
     literals.includes('생애최초 주택 구입 감면') && literals.some((s) => /최대 200만/.test(s) && /§36의3/.test(s)) && shown.length > 0, true);
  eq('그 문구에 감면 요건 미검증 안내가 들어 있다', fixed.includes('이 계산기가 확인하지 않습니다'), true);
  /* 신규 유형이 «기존 폴백 문구로 떨어지지 않는지»를 배선으로 본다 */
  const ra = code.slice(code.indexOf('const runAnalysis'), code.indexOf('const goDetail'));
  eq('runAnalysis 가 신규 유형에 고정 문구를 «미리» 넣는다',
     /acqNewType\s*\?\s*ACQ_NEW_TYPE_COMMENTARY/.test(ra), true);
  eq('catch 폴백이 이미 정해진 문구를 덮어쓰지 않는다',
     /if \(commentary\)[\s\S]{0,120}else commentary = \{/.test(ra), true);
  /* 기존 폴백 문구 자체에는 종전대로 절세 아이디어가 남아 있어야 한다(기존 유형 경로 유지) */
  eq('기존 유형 폴백에는 절세 아이디어가 그대로 있다', ra.includes('saving_ideas: ['), true);
}

/* 공매는 매매와 «같은 주택 규정»을 탄다 — 그래서 매매에 걸린 ①층 차단이 공매에도 걸려야 한다.
   안 걸리면 공매 다주택자에게 조정지역을 묻지 않은 채 엔진이 비조정으로 가정한다. */
eq('공매 2주택 + 조정 «모름» → 엔진이 살아 있어도 차단 (260921 추가분)',
   GAPS({ propertyType: '주택', acquisitionType: '공매', acquirerType: 'individual', exclusiveArea: '84', housingCount: '2', isRegulatedArea: 'unsure' }, ENGINE_OK).length > 0, true);
/* ★ R3-F2 정정: 앱 경로에서는 3주택으로 바꾸는 순간 정규화가 잔존 「예」를 지운다.
   판정 «함수» 자체는 원본 입력에서 여전히 막는다 — 둘을 나눠서 고정한다. */
eq('공매 3주택 + 일시적2주택 잔존 → 판정 함수는 원본 입력에서 막는다 (규칙 불변)',
   M.acqFallbackGaps({ propertyType: '주택', acquisitionType: '공매', exclusiveArea: '84', housingCount: '3', isRegulatedArea: 'yes', temporaryTwoHouse: 'yes' }, ENGINE_OK).length > 0, true);
eq('공매 3주택 · 앱 경로에서는 잔존 답이 사라져 주택 수 3으로 계산된다',
   M.mapAnswersToAcquisition({ propertyType: '주택', acquisitionType: '공매', acquirerType: 'individual', propertyValue: '800000000', exclusiveArea: '84', housingCount: '3', isRegulatedArea: 'yes', temporaryTwoHouse: 'yes' }).housing_count, 3);

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
  /* ⚠️ 여는 중괄호를 «첫 {» 로 잡으면 매개변수 구조분해 `({ region })` 에 걸려 본문이
     통째로 빠진다 — 그러면 아래 금지어 검사가 «빈 문자열»을 통과시킨다(게이트가 비는 전형).
     함수 «몸통»의 여는 중괄호부터 센다. */
  const cardSrc = (() => {
    const head = 'function JTAcqOrdinanceCard(';
    const i = code.indexOf(head);
    if (i < 0) return '';
    const bodyStart = code.indexOf(') {', i);
    if (bodyStart < 0) return '';
    let d = 1, j = bodyStart + 3;
    while (j < code.length && d > 0) { const ch = code[j]; if (ch === '{') d++; else if (ch === '}') d--; j++; }
    return code.slice(i, j);
  })();
  eq('조례 카드 컴포넌트를 찾았다', cardSrc.length > 500, true);
  eq('조례 카드 본문을 «실제로» 잘라냈다 (매개변수 괄호에서 끊기지 않았다)',
     cardSrc.includes('JT_ORDINANCE_CARDS'), true);
  for (const banned of ['acqCalcFromEngine', 'mapAnswersToAcquisition', 'totalTax', 'acqTax']) {
    eq(`조례 카드가 «${banned}» 를 건드리지 않는다`, cardSrc.includes(banned), false);
  }
  eq('조례 카드가 「이 계산에는 넣지 않았습니다」를 표시한다', cardSrc.includes('이 계산에는 넣지 않았습니다'), true);
}

/* 스냅샷 파일 자체 — «비어 있어도 통과»하지 않게 내용을 본다 */
{
  const JSON_PATH = path.join(__dirname, 'data', 'ordinance-cards.json');
  const BUNDLE = path.join(__dirname, 'dist', 'app.js');
  eq('조례 스냅샷 파일이 있다', fs.existsSync(JSON_PATH), true);
  if (fs.existsSync(JSON_PATH)) {
    const raw = fs.readFileSync(JSON_PATH, 'utf8');
    let data = null;
    try { data = JSON.parse(raw); } catch (e) { eq('조례 스냅샷이 유효한 JSON 이다', e.message, '(파싱 성공)'); }
    if (data) {
      const entries = Object.entries(data.cards || {});
      eq('조례 스냅샷에 카드가 1장 이상 있다', entries.length > 0, true);
      for (const [region, c] of entries) {
        for (const k of ['ordinanceName', 'ordinanceSerial', 'effectiveDate', 'promulgationNo', 'articleLabel', 'articleText', 'fetchedAt', 'sourceUrl']) {
          eq(`조례 [${region}] · ${k} 가 비어 있지 않다`, !!(c && c[k]), true);
        }
        eq(`조례 [${region}] · 계산 미반영 표시`, c.appliedToCalculation, false);
      }
    }
    /* 법제처 API 사용자 ID(OC)가 산출물에 섞이면 공개 저장소로 나간다 */
    eq('조례 스냅샷에 OC 질의 인자가 없다', /[?&]OC=/i.test(raw), false);
  }
  eq('번들이 조례 스냅샷을 전역으로 싣는다', fs.existsSync(BUNDLE) && fs.readFileSync(BUNDLE, 'utf8').includes('window.JT_ORDINANCE_CARDS ='), true);
}

/* ══════════════════════════════════════════════════════════════════════
   ④-b 17개 시도 확대 (260921) — 카드마다 지켜야 할 다섯 가지
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ④-b 17개 시도 조례 카드 확대 ════');
{
  const JSON_PATH = path.join(__dirname, 'data', 'ordinance-cards.json');
  const raw = fs.existsSync(JSON_PATH) ? fs.readFileSync(JSON_PATH, 'utf8') : '';
  const data = raw ? JSON.parse(raw) : { cards: {} };
  const entries = Object.entries(data.cards || {});

  /* (a) 카드마다 필수 필드가 있고 원문이 비어 있지 않다 (articleTitle·upstream 포함) */
  const REQUIRED_FIELDS = ['region', 'ordinanceName', 'ordinanceSerial', 'ordinanceId',
    'effectiveDate', 'promulgationDate', 'promulgationNo', 'articleLabel', 'articleTitle',
    'articleText', 'upstream', 'fetchedAt', 'sourceUrl'];
  for (const [region, c] of entries) {
    for (const k of REQUIRED_FIELDS) {
      eq(`(a) 조례 [${region}] · ${k} 가 비어 있지 않다`, !!(c && String(c[k] || '').trim()), true);
    }
    eq(`(a) 조례 [${region}] · region 필드가 키와 같다`, c.region, region);
  }

  /* (b) 모든 카드 원문에 「제78조」와 「산업단지」가 들어 있다 */
  for (const [region, c] of entries) {
    const body = (c && c.articleText) || '';
    eq(`(b) 조례 [${region}] 원문에 「제78조」가 있다`, body.includes('제78조'), true);
    eq(`(b) 조례 [${region}] 원문에 「산업단지」가 있다`, body.includes('산업단지'), true);
  }

  /* (c) 카드 파일 어디에도 OC= 문자열이 없다 (apiUrl·sourceUrl 포함 전문 재검사) */
  eq('(c) 조례 스냅샷 전체에 OC= 문자열이 없다', /OC=/i.test(raw), false);
  for (const [region, c] of entries) {
    eq(`(c) 조례 [${region}] · apiUrl 에 OC= 가 없다`, /OC=/i.test((c && c.apiUrl) || ''), false);
    eq(`(c) 조례 [${region}] · sourceUrl 에 OC= 가 없다`, /OC=/i.test((c && c.sourceUrl) || ''), false);
  }

  /* (d) 시도 선택지(ACQ_REGIONS)와 카드 시도 이름이 «글자까지» 일치한다 */
  const regionSet = new Set(M.ACQ_REGIONS);
  for (const region of Object.keys(data.cards || {})) {
    eq(`(d) 카드 시도명 [${region}] 이 ACQ_REGIONS 선택지에 글자까지 일치한다`, regionSet.has(region), true);
  }
  /* 최신 법정 명칭 4곳이 실제로 선택지에 있는가(퇴역 명칭으로 남아있지 않은가) */
  for (const must of ['강원특별자치도', '전북특별자치도', '세종특별자치시', '제주특별자치도']) {
    eq(`(d) ACQ_REGIONS 에 최신 명칭 [${must}] 이 있다`, M.ACQ_REGIONS.includes(must), true);
  }

  /* (e) 조회일이 30일을 넘으면 경고가 나오는 기존 동작이 유지되는가 (정적 검사 —
     JSX 컴포넌트는 new Function 로 실행할 수 없으므로 ④ 와 같은 방식으로 소스만 본다) */
  const cardSrcForStale = (() => {
    const head = 'function JTAcqOrdinanceCard(';
    const i = code.indexOf(head);
    if (i < 0) return '';
    const bodyStart = code.indexOf(') {', i);
    if (bodyStart < 0) return '';
    let d = 1, j = bodyStart + 3;
    while (j < code.length && d > 0) { const ch = code[j]; if (ch === '{') d++; else if (ch === '}') d--; j++; }
    return code.slice(i, j);
  })();
  eq('(e) 화면 컴포넌트가 30일 경과 판정을 그대로 갖고 있다', /daysSince\s*>\s*30/.test(cardSrcForStale), true);
  eq('(e) 화면 컴포넌트가 「갱신 확인 필요」 경고 문구를 그대로 갖고 있다',
     cardSrcForStale.includes('갱신 확인 필요'), true);
  const bundleMjs = fs.readFileSync(path.join(__dirname, 'scripts', 'build_bundle.mjs'), 'utf8');
  eq('(e) 번들 빌더가 조회일 30일 기준선을 그대로 갖고 있다', /ORDINANCE_STALE_DAYS\s*=\s*30/.test(bundleMjs), true);
}

/* ══════════════════════════════════════════════════════════════════════
   ⑤ 허브로 «들어오는 길»이 있는가
   sitemap 에만 있고 들어오는 링크가 없으면 검색 계획이 아니다(Astra R1-F7).
   빌더 회귀로 링크가 조용히 빠지는 것을 막는다.
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ⑤ 취득세 허브·인사이트 허브로 들어오는 실 href 가 있는가 ════');
{
  const ROOT = path.join(__dirname, '..');
  const has = (rel, needle) => fs.existsSync(path.join(ROOT, rel)) && fs.readFileSync(path.join(ROOT, rel), 'utf8').includes(needle);
  const HUB = 'href="/acquisition-tax/"';
  for (const rel of ['calculators/index.html', 'calculators/acquisition-tax.html',
                     'insights/acquisition-tax-basics.html', 'insights/acquisition-tax-rate-guide.html',
                     'insights/index.html']) {
    eq(`${rel} → 취득세 허브 실 href`, has(rel, HUB), true);
  }
  eq('calculators/index.html → 인사이트 허브 실 href', has('calculators/index.html', 'href="/insights/"'), true);
  eq('취득세 허브가 실제로 생성됐다', fs.existsSync(path.join(ROOT, 'acquisition-tax', 'index.html')), true);
  eq('인사이트 허브가 실제로 생성됐다', fs.existsSync(path.join(ROOT, 'insights', 'index.html')), true);
  /* ⚠️ 「파일이 있다」만 보면 빌더가 허브 생성을 멈춰도 낡은 파일이 남아 그냥 통과한다
     (260921 결함 주입 NC-S3 로 실제 확인 — 「있다」 검사만으로는 못 잡았다).
     그래서 «허브가 지금 원고 목록과 같은가»를 본다 — 글이 늘거나 줄면 바로 어긋난다. */
  {
    const hub = fs.readFileSync(path.join(ROOT, 'insights', 'index.html'), 'utf8');
    const linked = new Set([...hub.matchAll(/href="\/insights\/([a-z0-9-]+)\.html"/g)].map((m) => m[1]));
    const built = new Set(fs.readdirSync(path.join(ROOT, 'insights'))
      .filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => f.replace(/\.html$/, '')));
    const missing = [...built].filter((s) => !linked.has(s));
    const ghost = [...linked].filter((s) => !built.has(s));
    eq('인사이트 허브가 모든 글을 싣는다 (허브 생성이 멈추면 여기서 어긋난다)', missing.join(',') || '-', '-');
    eq('인사이트 허브에 없는 글 링크가 없다', ghost.join(',') || '-', '-');
    eq('인사이트 허브에 글이 실제로 있다', linked.size > 0, true);
  }
  /* (260919 C3 «홈·전역 메뉴 비노출» → 260922 오너 지시로 뒤집힘) 업무분야에 취득세·크리에이터를
     기존 다섯 분야 옆에 나란히 둔다. 내비 드롭다운은 Data.jsx services 에서 오므로 여기서는
     푸터의 실 href 로 확인한다. 항목이 빠지면 여기서 잡힌다. */
  const chrome = fs.readFileSync(path.join(ROOT, 'project', 'src', 'Chrome.jsx'), 'utf8');
  eq('전역(푸터) 업무분야에 취득세 허브 실 href 가 있다', chrome.includes('href="/acquisition-tax/"'), true);
  eq('전역(푸터) 업무분야에 크리에이터 실 href 가 있다', chrome.includes('href="/creators.html"'), true);
  const dataSrc = fs.readFileSync(path.join(ROOT, 'project', 'src', 'Data.jsx'), 'utf8');
  eq('내비 드롭다운 데이터(services)에 취득세·크리에이터가 있다',
     dataSrc.includes("href: '/acquisition-tax/'") && dataSrc.includes("href: '/creators.html'"), true);
  eq('업무분야 목록(정적)에 카드가 7장이다',
     (fs.readFileSync(path.join(ROOT, 'services', 'index.html'), 'utf8').match(/class="jt-cc-card"/g) || []).length, 7);
  /* 카카오 링크는 채널 홈(pf.kakao.com/_CcxlJG) — 260922 오너 지시(채팅창 직행 /chat 금지, QR 과 같은 주소) */
  const kakaoBad = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const fp = path.join(d, f.name);
    if (f.isDirectory()) { if (!['node_modules', '.git', 'project'].includes(f.name)) walk(fp); }
    else if (f.name.endsWith('.html') && /pf\.kakao\.com\/_CcxlJG\/(chat|friend)/.test(fs.readFileSync(fp, 'utf8'))) kakaoBad.push(path.relative(ROOT, fp));
  } };
  walk(ROOT);
  eq('카카오 링크가 채널 홈이다 (/chat·/friend 잔존 0)', kakaoBad.join(',') || '-', '-');
  eq('전역 내비의 인사이트 링크에 실 href 가 있다', /href="\/insights\/"[^>]*인사이트|인사이트/.test(chrome) && chrome.includes('href="/insights/"'), true);
  /* FAQPage 는 노출 전략에서 제외했다 (리치 결과 2026-05-07 종료) */
  eq('취득세 허브에 FAQPage 구조화 데이터가 없다',
     fs.readFileSync(path.join(ROOT, 'acquisition-tax', 'index.html'), 'utf8').includes('FAQPage'), false);
  /* sitemap 등재 */
  const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  eq('sitemap 에 취득세 허브가 있다', sm.includes('<loc>https://www.jttax.co.kr/acquisition-tax/</loc>'), true);
  /* 260926: 취득세 글 «전편»에 1차 재검토 접수 배너가 있고(실행계획 v7 1~2주차 「기존 취득세 노출 글에 재검토 접수 연결」),
     취득세가 아닌 글에는 없다 — build-insights 의 slug 접두 규칙(acquisition-tax-)이 양쪽으로 지켜지는지 본다. */
  {
    const insDir = path.join(ROOT, 'insights');
    const files = fs.readdirSync(insDir).filter((f) => f.endsWith('.html') && f !== 'index.html');
    const acq = files.filter((f) => /^acquisition-tax(-|\.)/.test(f));
    const nonAcq = files.filter((f) => !/^acquisition-tax(-|\.)/.test(f));
    const hasIntake = (f) => fs.readFileSync(path.join(insDir, f), 'utf8').includes('href="/#/report/acq-check"');
    eq('취득세 글이 20편 이상 빌드돼 있다(글 묶음 1차 25편 + 기존 2편)', acq.length >= 20, true);
    eq('취득세 글 전편에 1차 재검토 접수 링크가 있다 (없는 글=)', acq.filter((f) => !hasIntake(f)).join(',') || '-', '-');
    eq('취득세가 아닌 글에는 접수 배너가 없다 (있는 글=)', nonAcq.filter(hasIntake).join(',') || '-', '-');
    eq('배너 문안이 «서류 없이 1차 재검토»다(종전 「1차 서류 점검」 아님)',
       acq.every((f) => { const h = fs.readFileSync(path.join(insDir, f), 'utf8'); return h.includes('1차 재검토 접수') && !h.includes('1차 서류 점검'); }), true);
  }
  eq('sitemap 에 인사이트 허브가 있다', sm.includes('<loc>https://www.jttax.co.kr/insights/</loc>'), true);
  /* 우월·결과 예단 표현 금지 (세무사법 §12조의7·시행령 §33) — 허브 신규 문안 한정 */
  const hubHtml = fs.readFileSync(path.join(ROOT, 'acquisition-tax', 'index.html'), 'utf8');
  for (const bad of ['유일', '업계 최초', '국내 최초', '1위', '최고', '환급받을', '가장 유리', '확정 세액', '무료']) {
    eq(`취득세 허브에 금지 표현 「${bad}」가 없다`, hubHtml.includes(bad), false);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   ⑥ 분기를 바꾼 뒤 «숨은 옛 답»이 계산에 들어가지 않는가 (260921 Codex R2)

   R2-F1(P0)·R2-F2(P1)·R2-F3(P2)는 사례가 달랐을 뿐 원인이 하나였다 —
   `setAns` 가 답을 병합만 해서, 분기를 바꿔도 «지금 화면에 없는 질문의 답»이 남았다.
   그래서 사례가 아니라 «부류»를 고정한다: payload 의 모든 필드가 지금 보이는 질문에서
   나왔는가 + 정규화가 차단에 구멍을 내지 않는가.
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ⑥ 분기 전환 뒤 숨은 옛 답이 새지 않는가 ════');

/* payload 필드 → 그 값을 만드는 «질문». 필드가 있는데 그 질문이 안 보이면 누설이다. */
const FIELD_SOURCE = {
  property_value: ['propertyValue'],
  acquisition_type: ['acquisitionType'],
  property_type: ['propertyType'],
  is_housing: ['propertyType'],
  is_farmland: ['propertyType'],
  exclusive_area: ['exclusiveArea'],
  is_corporate: ['acquirerType'],
  housing_count: ['housingCount'],
  is_temporary_two_house: ['housingCount', 'temporaryTwoHouse'],
  is_regulated_area: ['isRegulatedArea'],
  reduction_type: ['reduction'],
  is_first_home_buyer: ['reduction'],
  is_childbirth: ['reduction'],
  /* 증여 주택은 시가표준액 문항에서, 상속은 «취득가액 칸(= 시가표준액을 묻는다)»에서 온다 (261004) */
  standard_value: (norm) => (norm.acquisitionType === '상속' ? ['propertyValue'] : ['standardValue']),
  gift_regulated_over_3b: ['isRegulatedArea'],
  inheritance_one_house: ['inheritOneHouse'],
};
/* 매퍼가 내보낼 수 있는 요청 키의 «전체 허용 목록» — 여기 없는 키는 엔진 요청 모델(「모르는 키는 422」)에서 거부된다 */
const ALLOWED_KEYS = new Set(['property_value', 'acquisition_type', 'property_type', 'is_housing', 'is_farmland',
  'exclusive_area', 'is_corporate', 'housing_count', 'is_regulated_area', 'reduction_type', 'is_first_home_buyer',
  'is_childbirth', 'is_temporary_two_house', 'standard_value', 'gift_regulated_over_3b', 'inheritance_one_house']);
/* payload 의 모든 키가 ① 허용 목록 안이고 ② 그 값을 만드는 질문이 «지금 보이는가» */
function payloadProblems(norm, p) {
  const out = [];
  for (const k of Object.keys(p)) {
    if (!ALLOWED_KEYS.has(k)) out.push('허용 목록 밖 키 ' + k);
    let srcs = FIELD_SOURCE[k];
    if (typeof srcs === 'function') srcs = srcs(norm);
    if (!srcs) { out.push('미등록 필드 ' + k); continue; }
    for (const s of srcs) {
      const q = M.ACQ_QS.find((x) => x.id === s);
      if (q && q.showIf && !q.showIf(norm)) out.push(k + ' ← 숨은 문항 ' + s + ' / ' + JSON.stringify(norm));
    }
  }
  return out;
}

console.log('\n  ── 구체 사례 (Codex R2 재현 경로) ──');
{
  /* R2-F1 [P0] — 공매 2주택·일시적2주택 «예» 인데 생애최초를 고른 상태 */
  const raw = { acquisitionType: '공매', propertyType: '주택', acquirerType: 'individual',
    propertyValue: '500000000', housingCount: '2', exclusiveArea: '84',
    isRegulatedArea: 'no', temporaryTwoHouse: 'yes', reduction: 'first', region: '경기도' };
  const redQ = M.ACQ_QS.find((q) => q.id === 'reduction');
  eq('R2-F1 · 일시적 2주택에서는 생애최초 선택지가 «보이지 않는다»',
     M.acqVisibleOpts(redQ, raw).some((o) => o[0] === 'first'), false);
  eq('R2-F1 · 2채 이상에서도 생애최초 선택지가 보이지 않는다',
     M.acqVisibleOpts(redQ, { ...raw, temporaryTwoHouse: 'no' }).some((o) => o[0] === 'first'), false);
  eq('R2-F1 · 1채·일시적2주택 아님이면 생애최초 선택지는 그대로 있다 (과잉 제한 방지)',
     M.acqVisibleOpts(redQ, { ...raw, housingCount: '1', temporaryTwoHouse: undefined }).some((o) => o[0] === 'first'), true);
  eq('R2-F1 · 정규화가 그 옛 답을 지운다', M.acqNormalizeAnswers(raw).reduction, undefined);
  const p = M.mapAnswersToAcquisition(raw);
  eq('R2-F1 · 엔진에 생애최초 감면이 가지 않는다', 'reduction_type' in p || 'is_first_home_buyer' in p, false);
  eq('R2-F1 · 일시적 2주택 자체는 그대로 전달된다 (차단 조건 불변)', p.is_temporary_two_house, true);
  /* ⚠️ 위 두 줄은 «정규화»만으로도 통과한다 — 매퍼의 2차 방어선을 지우면 잡히지 않는다
     (260921 결함 주입 NC-R2 로 확인). 층이 하나 무너져도 다른 층이 남아 있는지는
     배선으로 못 박는다. 아래 두 줄이 그 «남은 층»을 고정한다. */
  const mapperSrc = M.mapAnswersToAcquisition.toString();
  eq('R2-F1 · 매퍼가 감면을 보내기 전에 주택 수·일시적2주택을 «다시» 본다 (2차 방어선)',
     /reduction === 'first'[\s\S]{0,140}housingCount[\s\S]{0,80}temporaryTwoHouse/.test(mapperSrc), true);
  eq('R2-F1 · 매퍼가 엔진 경계에서 다시 정규화한다',
     /acqNormalizeAnswers\(/.test(mapperSrc), true);
}
{
  /* R2-F2 [P1] — 법인 주택 매매에서 증여로 전환 */
  const raw = { acquisitionType: '증여', propertyType: '주택', acquirerType: 'corporate',
    propertyValue: '400000000', exclusiveArea: '84', isRegulatedArea: 'no', region: 'unknown' };
  const gaps = GAPS(raw, ENGINE_OK);
  eq('R2-F2 · 증여로 바꾸면 법인 사유로 차단되지 않는다', gaps.some((g) => g.includes('법인')), false);
  eq('R2-F2 · 엔진 값이 있으면 («고칠 수 없는 차단»이 없다) 통과한다', gaps.length, 0);
  eq('R2-F2 · payload 에 is_corporate 가 없다', 'is_corporate' in M.mapAnswersToAcquisition(raw), false);
  eq('R2-F2 · 신규 유형 판정에서도 법인이 빠진다', M.acqNewTypeSelected(M.acqNormalizeAnswers(raw)), false);
  /* 반대로 «지금 법인인» 경우는 엔진이 §13의2①1호로 판정한다(260921 실측: 법인 주택 유상 5억 → 12%).
     261004: 자체 계산식이 없어 «법인이라서 막는» 사유(종전 ②층)는 없다 — 엔진 값이 있으면 통과하고,
     엔진 값이 없으면 입력과 무관하게(법인 아니어도) 막힌다. */
  const corp = { acquisitionType: '매매', propertyType: '주택', acquirerType: 'corporate',
    propertyValue: '500000000', exclusiveArea: '84', region: 'unknown' };
  eq('R2-F2 · 실제 법인 주택 매매는 엔진 값이 있으면 통과한다', GAPS(corp, ENGINE_OK).length, 0);
  eq('R2-F2 · 실제 법인 주택 매매는 엔진 값이 없으면 막힌다', GAPS(corp, ENGINE_DOWN).length > 0, true);
}
{
  /* R2-F3 [P2] — 증여 주택에서 농지로 전환 */
  const raw = { acquisitionType: '증여', propertyType: '농지', standardValue: '400000000',
    propertyValue: '200000000', region: 'unknown' };
  eq('R2-F3 · 정규화가 주택용 시가표준액을 지운다', M.acqNormalizeAnswers(raw).standardValue, undefined);
  eq('R2-F3 · payload 에 standard_value 가 남지 않는다',
     'standard_value' in M.mapAnswersToAcquisition(raw), false);
  const gift = { acquisitionType: '증여', propertyType: '주택', standardValue: '400000000',
    propertyValue: '200000000', exclusiveArea: '84', isRegulatedArea: 'yes', region: 'unknown' };
  eq('R2-F3 · 증여 «주택»에서는 시가표준액이 그대로 간다 (과잉 제거 방지)',
     M.mapAnswersToAcquisition(gift).standard_value, 400000000);
  /* 위와 같은 이유로 매퍼의 2차 방어선도 배선으로 고정한다 (NC-R4 로 확인) */
  eq('R2-F3 · 매퍼가 시가표준액을 보내기 전에 주택 여부를 «다시» 본다 (2차 방어선)',
     /isHousing && Number\(a\.standardValue\) > 0/.test(M.mapAnswersToAcquisition.toString()), true);
}
{
  /* R3-F1 [P0] — 조정대상지역 증여 주택에서 시가표준액이 비었을 때.
     (이 «시가로 대신 판정» 동작은 분기점 a71b83f 에도 있었다 — 이번 브랜치가 만든 것이 아니다) */
  const noStd = { acquisitionType: '증여', propertyType: '주택', propertyValue: '800000000',
    exclusiveArea: '84', isRegulatedArea: 'yes', giftOneHouseException: 'no',
    standardValue: '', region: 'unknown' };
  eq('R3-F1 · 시가(취득가액)로 증여 중과를 «확정»하지 않는다 (시가표준액이 없으면 true 가 아니다)',
     M.mapAnswersToAcquisition(noStd).gift_regulated_over_3b, false);
  eq('R3-F1 · 그 대신 엔진이 살아 있어도 차단한다', GAPS(noStd, ENGINE_OK).length > 0, true);
  eq('R3-F1 · 차단 사유가 시가표준액 건이다',
     GAPS(noStd, ENGINE_OK).some((g) => g.includes('시가표준액')), true);
  eq('R3-F1 · 「빠진 질문으로 돌아가기」가 시가표준액 문항을 가리킨다',
     (OPENQ(noStd) || {}).id, 'standardValue');
  const sq = M.ACQ_QS.find((q) => q.id === 'standardValue');
  eq('R3-F1 · 시가표준액을 그 분기의 «결과 화면보다 앞»에서 묻는다',
     M.acqIsQuick(sq, M.acqNormalizeAnswers(noStd)), true);
  /* 값이 있으면 종전대로 판정한다 — 과잉 차단이 아니다 */
  const with4 = { ...noStd, standardValue: '400000000' };
  eq('R3-F1 · 시가표준액 4억이면 중과 파생값이 그대로 간다',
     M.mapAnswersToAcquisition(with4).gift_regulated_over_3b, true);
  eq('R3-F1 · 그때는 차단하지 않는다', GAPS(with4, ENGINE_OK).length, 0);
  const with2 = { ...noStd, standardValue: '250000000' };
  eq('R3-F1 · 시가표준액 2.5억이면 시가가 8억이어도 중과가 아니다 (false 를 명시해서 보낸다)',
     M.mapAnswersToAcquisition(with2).gift_regulated_over_3b, false);
  eq('R3-F1 · 그때도 차단하지 않는다 (값을 확인했으므로)', GAPS(with2, ENGINE_OK).length, 0);
  /* 1세대1주택 가족 증여 예외면 시가표준액을 묻지도, 막지도 않는다 */
  const exc = { ...noStd, giftOneHouseException: 'yes' };
  eq('R3-F1 · 1세대1주택 가족 증여면 시가표준액을 묻지 않는다',
     M.acqIsQuick(sq, M.acqNormalizeAnswers(exc)), false);
  eq('R3-F1 · 그 경우 차단도 하지 않는다', GAPS(exc, ENGINE_OK).length, 0);
  /* 비조정이면 애초에 중과 판정이 없다 */
  const nonReg = { acquisitionType: '증여', propertyType: '주택', propertyValue: '800000000',
    exclusiveArea: '84', isRegulatedArea: 'no', standardValue: '', region: 'unknown' };
  eq('R3-F1 · 비조정 증여는 시가표준액이 없어도 통과한다 (과잉 차단 방지)',
     GAPS(nonReg, ENGINE_OK).length, 0);
}
{
  /* 같은 부류 — 필수 답이 없을 때 «다른 값»으로 대신 판정하던 자리 (매퍼 전수 스캔 결과) */
  const noHc = { acquisitionType: '매매', propertyType: '주택', acquirerType: 'individual',
    propertyValue: '800000000', exclusiveArea: '84', region: 'unknown' };
  eq('주택 수 미응답 → 「1채」로 가정해 계산하지 않고 막는다',
     GAPS(noHc, ENGINE_OK).some((g) => g.includes('주택 수')), true);
  eq('주택 수를 답하면 그대로 통과한다',
     GAPS({ ...noHc, housingCount: '1', reduction: 'none' }, ENGINE_OK).length, 0);
}
{
  /* 감면은 서로 배타적인가 — 단일 문항이라 구조상 하나만 고를 수 있어야 한다 */
  const base = { acquisitionType: '매매', propertyType: '주택', acquirerType: 'individual',
    propertyValue: '400000000', housingCount: '1', exclusiveArea: '84', region: 'unknown' };
  for (const v of ['none', 'first', 'childbirth']) {
    const p = M.mapAnswersToAcquisition({ ...base, reduction: v });
    eq(`감면 「${v}」 · 생애최초와 출산양육이 동시에 가지 않는다`,
       (p.is_first_home_buyer === true) && (p.is_childbirth === true), false);
  }
  eq('감면 문항은 하나뿐이다 (동시 선택이 구조상 불가능)',
     M.ACQ_QS.filter((q) => /reduction/i.test(q.id)).length, 1);
}

console.log('\n  ── 부류 고정: 도달 가능한 조합 전수 ──');
{
  const DOM = {
    acquisitionType: ['매매', '증여', '상속', '신축', '공매', '재산분할'],
    propertyType: ['주택', '상가', '오피스텔_주거용', '농지', '토지', '분양권'],
    acquirerType: [undefined, 'individual', 'corporate'],
    housingCount: [undefined, '1', '2', '3'],
    exclusiveArea: ['', '84', '86'],
    isRegulatedArea: [undefined, 'yes', 'no', 'unsure'],
    temporaryTwoHouse: [undefined, 'yes', 'no'],
    reduction: [undefined, 'none', 'first', 'childbirth'],
    standardValue: ['', '400000000'],
    giftOneHouseException: [undefined, 'yes', 'no'],
  };
  const KEYS = Object.keys(DOM);
  let total = 0, leak = 0, holeDown = 0, holeOk = 0, notIdem = 0, badReason = 0;
  const leakSample = [], holeSample = [];
  (function sweep(i, a) {
    if (i === KEYS.length) {
      total++;
      const norm = M.acqNormalizeAnswers(a);
      const p = M.mapAnswersToAcquisition(a);
      /* ⓐ payload 의 모든 필드가 «허용 목록 안»이고 «지금 보이는 질문»에서 나왔는가 */
      const probs = payloadProblems(norm, p);
      if (probs.length) { leak++; if (leakSample.length < 3) leakSample.push(probs[0]); }
      /* ⓑ 엔진 값이 없으면 «어떤 입력 조합이든» 막힌다 — down·미지정·refused 모두.
         (종전엔 «폴백이 못 다루는 조합»만 막았다. 자체 계산식이 없는 지금은 전부다.) */
      for (const c of [ENGINE_DOWN, ENGINE_DOWN_EXPLICIT, ENGINE_REFUSED]) {
        if (M.acqFallbackGaps(norm, c).length === 0) {
          holeDown++; if (holeSample.length < 3) holeSample.push('엔진 값 없음인데 통과 ' + JSON.stringify(c) + ' ' + JSON.stringify(norm));
        }
      }
      if (!M.acqFallbackGaps(norm, ENGINE_REFUSED).some((g) => g.includes('세무사 확인'))
          || !M.acqFallbackGaps(norm, ENGINE_DOWN).some((g) => g.includes('연결하지 못했습니다'))) {
        badReason++; if (holeSample.length < 3) holeSample.push('사유 문구 ' + JSON.stringify(norm));
      }
      /* 엔진이 «없는 필드»를 유리하게 가정하는 자리(면적 미입력·다주택 조정 미응답)는
         엔진이 살아 있어도 막혀야 한다. is_regulated_area 는 «아니오»일 때 false 를 명시해서 보내므로(261004 D1)
         «답이 없는 경우»(미응답·모름)만 본다 — 그때는 키를 보내지 않는다(엔진: 보내지 않음 = 모름). */
      const needArea = p.is_housing === true && p.exclusive_area === undefined;
      const needReg = (p.housing_count || 0) >= 2 && !['yes', 'no'].includes(norm.isRegulatedArea);
      if ((needArea || needReg) && M.acqFallbackGaps(norm, ENGINE_OK).length === 0) {
        holeOk++; if (holeSample.length < 6) holeSample.push('엔진정상 ' + JSON.stringify(norm));
      }
      /* ⓒ 정규화는 멱등이어야 한다 — 아니면 «몇 번 거쳤는가»에 따라 결과가 갈린다 */
      if (JSON.stringify(M.acqNormalizeAnswers(norm)) !== JSON.stringify(norm)) notIdem++;
      return;
    }
    const k = KEYS[i];
    for (const v of DOM[k]) { if (v === undefined) delete a[k]; else a[k] = v; sweep(i + 1, a); }
    delete a[k];
  })(0, { propertyValue: '500000000', region: 'unknown' });

  console.log(`      (조합 ${total.toLocaleString('en-US')}건 전수)`);
  eq('payload 의 모든 필드가 허용 목록 안이고 «지금 보이는 질문»에서 나온다', leak ? leakSample.join(' | ') : 0, 0);
  eq('엔진 값이 없으면(down·미지정·refused) «모든» 입력 조합이 차단된다', holeDown ? holeSample.join(' | ') : 0, 0);
  eq('차단 사유 문구 — refused 는 「세무사 확인」, down 은 「연결하지 못했습니다」를 포함한다', badReason ? holeSample.join(' | ') : 0, 0);
  eq('엔진이 유리하게 가정하는 미응답은 엔진이 살아 있어도 막힌다', holeOk ? holeSample.join(' | ') : 0, 0);
  eq('정규화는 멱등이다', notIdem, 0);
}

/* ══════════════════════════════════════════════════════════════════════
   ⑥-b 정규화의 «두 불변식» (260921 Codex R4)

   R4-F1 은 「1주택에서 생애최초를 고른 뒤 2주택·일시적2주택으로 바꾸면 폴백 차단이 풀려
   5,500,000원이 나온다」였다. 지우는 동작 자체는 옳다 — 그 사용자의 «현재 사실관계»는
   처음부터 2주택으로 넣은 사용자와 같고, 두 경로의 결과가 달라지면 그게 오히려 결함이다.
   옛 답을 근거로 차단을 유지하면 «화면에 보이지 않는 질문 때문에 고칠 수 없는 차단»이
   다시 생긴다 — R2-F2 에서 닫은 바로 그 구멍이다.
   그래서 동작은 그대로 두고 «두 가지»를 못 박는다.
     I-A 경로 무관성 — 정규화된 답으로 낸 요청·차단은, 같은 답을 처음부터 순서대로 넣은
         경로의 결과와 «같다».
     I-B 풀린 차단의 사유 — 원본에서는 막히는데 정규화 뒤 안 막히는 조합은, 전부
         «지워진 답이 있고 그 사유가 hidden(안 보이는 질문)·option(못 고르는 선택지)»
         뿐이어야 한다. 아무것도 안 지웠는데 차단이 풀리면 실패한다.
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ⑥-b 정규화: 경로 무관성 + 풀린 차단의 사유 ════');
{
  /* R4-F1 의 그 입력으로 «두 경로»를 직접 비교한다 */
  const changed = { acquisitionType: '매매', propertyType: '주택', acquirerType: 'individual',
    propertyValue: '500000000', housingCount: '2', exclusiveArea: '84',
    isRegulatedArea: 'no', temporaryTwoHouse: 'yes', reduction: 'first', region: 'unknown' };
  const fresh = { ...changed }; delete fresh.reduction;   // 처음부터 2주택으로 넣은 사용자
  eq('R4-F1 · 분기를 바꾼 경로와 처음부터 넣은 경로의 요청 본문이 같다',
     JSON.stringify(M.mapAnswersToAcquisition(changed)), JSON.stringify(M.mapAnswersToAcquisition(fresh)));
  eq('R4-F1 · 두 경로의 차단 결과가 같다 (엔진 장애)',
     JSON.stringify(GAPS(changed, ENGINE_DOWN)), JSON.stringify(GAPS(fresh, ENGINE_DOWN)));
  eq('R4-F1 · 두 경로의 차단 결과가 같다 (엔진 거부)',
     JSON.stringify(GAPS(changed, ENGINE_REFUSED)), JSON.stringify(GAPS(fresh, ENGINE_REFUSED)));
  /* 조용히 지우지 않는다 — 무엇을 왜 뺐는지 목록으로 돌려준다 */
  const dr = M.acqNormalize(changed).dropped;
  eq('R4-F1 · 지워진 답을 목록으로 돌려준다', dr.length, 1);
  eq('R4-F1 · 그 항목이 생애최초 감면이다', dr[0] && dr[0].id, 'reduction');
  eq('R4-F1 · 사유가 「지금 고를 수 없는 선택지」다', dr[0] && dr[0].reason, 'option');
  eq('R4-F1 · 사람이 읽을 라벨이 들어 있다', !!(dr[0] && dr[0].label), true);
  /* 안내 문구가 세액·환급을 예단하지 않는다 */
  const noticeSrc = code.slice(code.indexOf('function JTAcqDroppedNotice'), code.indexOf('window.JTAcqDroppedNotice'));
  eq('제외 안내 컴포넌트를 찾았다', noticeSrc.length > 200, true);
  for (const bad of ['환급', '세금이 늘', '세금이 줄', '더 내', '덜 내', '유리']) {
    eq(`제외 안내에 예단 표현 「${bad}」가 없다`, noticeSrc.includes(bad), false);
  }
  eq('결과 화면과 차단 화면이 «둘 다» 제외 안내를 렌더한다',
     (code.match(/<JTAcqDroppedNotice dropped=\{acqDropped\} \/>/g) || []).length >= 2, true);
}

{
  const DOM = {
    acquisitionType: ['매매', '증여', '상속', '신축', '공매', '재산분할'],
    propertyType: ['주택', '상가', '오피스텔_주거용', '농지', '토지', '분양권'],
    acquirerType: [undefined, 'individual', 'corporate'],
    housingCount: [undefined, '1', '2', '3'],
    exclusiveArea: ['', '84', '86'],
    isRegulatedArea: [undefined, 'yes', 'no', 'unsure'],
    temporaryTwoHouse: [undefined, 'yes', 'no'],
    reduction: [undefined, 'none', 'first', 'childbirth'],
    standardValue: ['', '400000000'],
    giftOneHouseException: [undefined, 'yes', 'no'],
  };
  const KEYS = Object.keys(DOM);
  const CALCS = [['엔진정상', ENGINE_OK], ['엔진장애', ENGINE_DOWN], ['엔진장애(down)', ENGINE_DOWN_EXPLICIT], ['엔진거부', ENGINE_REFUSED]];
  /* 「같은 답을 처음부터 순서대로 넣은 경로」 — 문항 순서대로, 그때그때 보이는 질문·
     고를 수 있는 선택지만 채워 나간다(컴포넌트의 입력 흐름과 같다). */
  const replayFresh = (src) => {
    const out = {};
    for (const q of M.ACQ_QS) {
      if (q.showIf && !q.showIf(out)) continue;
      const v = src[q.id];
      if (v === undefined || v === null || v === '') continue;
      if (q.opts && !M.acqVisibleOpts(q, out).some((o) => o[0] === v)) continue;
      out[q.id] = v;
    }
    return out;
  };

  let total = 0, pathDiff = 0, badRelease = 0, badReason = 0;
  const pathSample = [], relSample = [];
  (function sweep(i, a) {
    if (i === KEYS.length) {
      total++;
      const norm = M.acqNormalize(a).answers;
      const dropped = M.acqNormalize(a).dropped;
      /* ── I-A 경로 무관성 ──────────────────────────────────────────
         ⚠️ replay 는 «정규화 결과»가 아니라 «원본»에서 출발해야 한다. norm 에서 출발하면
            이미 지워진 값이 입력에도 없어, 정규화가 «보이는 답까지 지우는» 회귀를 못 잡는다
            (260921 결함 주입 NC-U4 로 확인). 원본에서 출발하면 질문 목록을 독립적으로 훑는
            이 걸음과 정규화가 «서로 대조»된다. */
      const fr = replayFresh(a);
      if (JSON.stringify(fr) !== JSON.stringify(norm)
          || JSON.stringify(M.mapAnswersToAcquisition(norm)) !== JSON.stringify(M.mapAnswersToAcquisition(fr))
          || CALCS.some(([, c]) => JSON.stringify(M.acqFallbackGaps(norm, c)) !== JSON.stringify(M.acqFallbackGaps(fr, c)))) {
        pathDiff++; if (pathSample.length < 3) pathSample.push(JSON.stringify({ norm, fr }));
      }
      /* ── I-B 풀린 차단의 사유 ───────────────────────────────────── */
      for (const [lab, c] of CALCS) {
        const gr = M.acqFallbackGaps(a, c), gn = M.acqFallbackGaps(norm, c);
        if (!(gr.length > 0 && gn.length === 0)) continue;
        if (dropped.length === 0) {          // 아무것도 안 지웠는데 차단이 풀렸다 = 진짜 구멍
          badRelease++; if (relSample.length < 3) relSample.push(lab + ' ' + JSON.stringify(a));
        } else if (!dropped.every((d) => d.reason === 'hidden' || d.reason === 'option')) {
          badReason++; if (relSample.length < 3) relSample.push('사유불명 ' + JSON.stringify(dropped));
        }
      }
      return;
    }
    const k = KEYS[i];
    for (const v of DOM[k]) { if (v === undefined) delete a[k]; else a[k] = v; sweep(i + 1, a); }
    delete a[k];
  })(0, { propertyValue: '500000000', region: 'unknown' });

  console.log(`      (조합 ${total.toLocaleString('en-US')}건 전수)`);
  eq('I-A 정규화된 답 = 같은 답을 처음부터 넣은 경로 (답 집합·요청 본문·차단 전부)',
     pathDiff ? pathSample.join(' | ') : 0, 0);
  eq('I-B 차단이 풀린 조합에는 «지워진 답»이 반드시 있다', badRelease ? relSample.join(' | ') : 0, 0);
  eq('I-B 지워진 사유는 hidden(안 보이는 질문)·option(못 고르는 선택지)뿐이다',
     badReason ? relSample.join(' | ') : 0, 0);
}

/* ══════════════════════════════════════════════════════════════════════
   ⑦ 결과 안내 문구 허용 목록 · 조례 스크립트의 OC 불변식 (260921 Codex R2)
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ⑦ 중과 안내 문구가 분기별 허용 목록을 따르는가 ════');
{
  const corp = { acquisitionType: '매매', propertyType: '주택', acquirerType: 'corporate' };
  const person = { acquisitionType: '매매', propertyType: '주택', acquirerType: 'individual' };
  const auction = { acquisitionType: '공매', propertyType: '주택', acquirerType: 'individual' };
  const gift = { acquisitionType: '증여', propertyType: '주택' };
  eq('법인 주택 유상취득 → corporate 문구', M.acqNoticeKey(corp), 'corporate');
  eq('개인 주택 매매 → personalHousePaid 문구', M.acqNoticeKey(person), 'personalHousePaid');
  eq('개인 주택 공매 → personalHousePaid 문구 (실측상 매매와 같은 규정)', M.acqNoticeKey(auction), 'personalHousePaid');
  eq('증여 주택 → other(중립) 문구', M.acqNoticeKey(gift), 'other');
  eq('법인 문구에 「일시적 2주택」 권유가 없다 (R2-F4)',
     /일시적 2주택 등으로 중과가 빠질/.test(M.ACQ_HEAVY_NOTICE.corporate), false);
  eq('중립 문구에도 「일시적 2주택」 권유가 없다',
     /일시적 2주택 등으로 중과가 빠질/.test(M.ACQ_HEAVY_NOTICE.other), false);
  eq('개인 유상 주택 문구에는 종전 안내가 그대로 있다 (기능 후퇴 방지)',
     /일시적 2주택/.test(M.ACQ_HEAVY_NOTICE.personalHousePaid), true);
  /* 화면이 그 허용 목록을 실제로 쓰는가 — 하드코딩된 옛 문장이 남아 있으면 안 된다 */
  const resultArea = code.slice(code.indexOf('calc.heavyApplied && calc.heavyReason'));
  eq('결과 화면이 ACQ_HEAVY_NOTICE 를 쓴다', /ACQ_HEAVY_NOTICE\[acqNoticeKey\(/.test(resultArea), true);
  eq('결과 화면에 옛 하드코딩 문장이 남아 있지 않다',
     /중과 적용: \{calc\.heavyReason\}\. 일시적 2주택/.test(code), false);
}

console.log('\n════ ⑦-b 조례 스크립트가 OC 를 «항상» 검사하는가 ════');
{
  const PY = path.join(__dirname, 'scripts', 'build-ordinance-cards.py');
  const py = fs.readFileSync(PY, 'utf8');
  eq('산출 직전에 OC 질의 인자를 제거한다', /payload = strip_oc_deep\(payload\)/.test(py), true);
  /* 검사가 `if oc:` 블록 «안»에 있으면 get_oc() 실패 시 통째로 건너뛴다 (R2-F6) —
     들여쓰기 4칸(= main 본문)에 있어야 한다. */
  const line = py.split(/\r?\n/).find((l) => /re\.search\(r"\[\?&\]OC=/.test(l));
  eq('OC 검사 줄을 찾았다', !!line, true);
  /* ⚠️ 「들여쓰기 4칸」만 보면 `if oc and re.search(...)` 를 통과시킨다 — 그러면 get_oc()
     실패 시 다시 건너뛴다(260921 결함 주입 NC-R6 로 확인). 조건에 oc 가 «없어야» 한다. */
  eq('OC 검사가 조건 블록 밖(들여쓰기 4칸)에 있다', line ? /^ {4}if /.test(line) : false, true);
  eq('OC 검사 조건에 oc 값이 섞여 있지 않다 (get_oc 실패와 무관하게 돈다)',
     line ? /^ {4}if re\.search\(/.test(line.trimEnd()) : false, true);
  eq('oc 값을 알 때의 추가 검사는 그대로 남아 있다', /if oc and oc in text:/.test(py), true);
}

/* ══════════════════════════════════════════════════════════════════════
   ⑧ 261004 — 자체 계산식(폴백) 삭제 · 엔진 결과 3분류 · 상속 시가표준액·1주택 특례
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ⑧-a 폴백 삭제 — 소스에 자체 계산식이 남아 있지 않다 ════');
{
  eq('소스에 fallbackAcqTax 라는 이름이 없다 (주석 포함)', code.includes('fallbackAcqTax'), false);
  for (const rate of ['0.0296', '0.084', '0.124', '0.038', '0.046', '0.011', '0.033']) {
    eq(`소스에 폴백 세율 상수 ${rate} 가 없다 (주석 포함)`, code.includes(rate), false);
  }
  eq('소스에 6~9억 구간 산식(450_000_000)이 없다', code.includes('450_000_000'), false);
  /* 금액 필드는 «엔진 유효 응답»에서만 만든다 — 객체 리터럴의 `totalTax:` 는 acqCalcFromEngine 하나뿐이어야 한다 */
  eq('totalTax 를 값으로 채우는 곳이 한 곳뿐이다 (acqCalcFromEngine)', (code.match(/\btotalTax:/g) || []).length, 1);
  const fnSrc = M.acqCalcFromEngine.toString();
  eq('그 한 곳이 acqCalcFromEngine 안이다', fnSrc.includes('totalTax: c['), true);
  /* 화면에 «간이» 표시가 남지 않았다 */
  for (const gone of ['추정 납부세액', '취득세 간이 계산', '정밀 엔진 연결이 지연', '간이 추정', '비워두시면 엔진이 연결됐을 때만', '(간이 추정)']) {
    eq(`소스에 「${gone}」 가 없다`, code.includes(gone), false);
  }
  const ra = code.slice(code.indexOf('const runAnalysis'), code.indexOf('const goDetail'));
  eq('runAnalysis 가 엔진 응답을 acqCalcFromEngine 으로 분류한다', /acqCalcFromEngine\(await callAcqEngine\(/.test(ra), true);
  eq('엔진 호출 예외는 acqCalcFromEngineError 로 분류한다', /acqCalcFromEngineError\(e\)/.test(ra), true);
  eq('runAnalysis 가 totalTax 를 직접 대입하지 않는다', /\.totalTax\s*=|totalTax:/.test(ra), false);
}

console.log('\n════ ⑧-b 엔진 호출 결과 3분류 (유효 / 거부 refused / 연결 실패 down) ════');
{
  const OKC = { 상태: 'ok', 세액: 12859000, 취득세: 11690000, 지방교육세: 1169000, 농어촌특별세: 0, 과세표준: 700000000,
    적용세율: '1.67%', 중과여부: false, 중과사유: '', 주택수: 1, 감면유형: '', 감면금액: 0, 신고기한: '취득일부터 60일',
    단계별계산: [{ 항목: '1. 과세표준', 금액: 700000000 }], 경고사항: ['확인 필요'] };
  const v = M.acqCalcFromEngine({ calc: OKC, version: { engine: '7.1.0' } });
  eq('유효 응답 · precise:true', v.precise, true);
  eq('유효 응답 · totalTax 는 엔진 세액', v.totalTax, 12859000);
  eq('유효 응답 · 각 필드가 담긴다', [v.acqTax, v.eduTax, v.farmTax, v.taxBase, v.appliedRate, v.engineVer, v.steps.length, v.engineWarnings.length].join('|'),
     '11690000|1169000|0|700000000|1.67%|7.1.0|1|1');
  eq('유효 응답 · engineState 는 없다', 'engineState' in v, false);
  const z = M.acqCalcFromEngine({ calc: { ...OKC, 세액: 0, 취득세: 0, 지방교육세: 0, 과세표준: 0 } });
  eq('유효 응답 · 정상 0원도 유효하다 (분양권·입주권 등)', z.precise === true && z.totalTax === 0, true);

  /* 금액 필드가 «아예 없다» — 거부·연결 실패 모두 */
  const NOT_PRECISE = [
    ['refused · 상태 needs_input + 오류', { calc: { 상태: 'needs_input', 오류: '주택 수가 필요합니다' } }, 'refused'],
    ['refused · 상태 unsupported + 오류', { calc: { 상태: 'unsupported', 오류: '지원하지 않는 조합' } }, 'refused'],
    ['refused · 상태 error + 오류', { calc: { 상태: 'error', 오류: '계산 오류' } }, 'refused'],
    ['refused · 금액이 같이 와도 상태가 ok 가 아니면 거부', { calc: { ...OKC, 상태: 'needs_input', 오류: '입력 부족' } }, 'refused'],
    ['refused · 상태가 needs_input 이면 금액이 있어도 거부', { calc: { ...OKC, 상태: 'needs_input' } }, 'refused'],
    ['refused · 상태 ok 인데 오류가 있다', { calc: { ...OKC, 오류: '모순된 응답' } }, 'refused'],
    ['refused · 상태 키가 없다 (ok 가 아님)', { calc: { ...OKC, 상태: undefined } }, 'refused'],
    ['down · 응답이 null', null, 'down'],
    ['down · 응답이 undefined', undefined, 'down'],
    ['down · calc 키 없음', {}, 'down'],
    ['down · calc 가 null', { calc: null }, 'down'],
    ['down · calc 가 배열', { calc: [] }, 'down'],
    ['down · calc 가 문자열', { calc: 'ok' }, 'down'],
    ['down · 상태 ok 인데 필수 금액 키가 없다', { calc: { 상태: 'ok' } }, 'down'],
    ['down · 세액이 NaN', { calc: { ...OKC, 세액: NaN } }, 'down'],
    ['down · 세액이 음수', { calc: { ...OKC, 세액: -1 } }, 'down'],
    ['down · 세액이 문자열', { calc: { ...OKC, 세액: '12859000' } }, 'down'],
    ['down · success:false', { calc: { ...OKC, success: false } }, 'down'],
  ];
  const plain = { acquisitionType: '매매', propertyType: '주택', acquirerType: 'individual', exclusiveArea: '84', housingCount: '1', reduction: 'none' };
  for (const [label, resp, state] of NOT_PRECISE) {
    const r = M.acqCalcFromEngine(resp);
    eq(`${label} → precise:false, engineState:${state}`, r.precise === false && r.engineState === state, true);
    eq(`${label} → 금액 필드가 없다 (키 = engineState,precise 뿐)`, Object.keys(r).sort().join(','), 'engineState,precise');
    const g = GAPS(plain, r);
    eq(`${label} → 평범한 입력도 차단된다 (사유 1건)`, g.length, 1);
    eq(`${label} → 사유 문구`, state === 'refused' ? g[0].includes('세무사 확인') : g[0].includes('연결하지 못했습니다'), true);
  }
  eq('유효 응답이면 같은 입력이 통과한다', GAPS(plain, v).length, 0);

  /* 호출 자체가 던진 예외 — callAcqEngine 은 HTTP 오류에 status 를 달아 던진다 */
  const httpErr = (s) => Object.assign(new Error('engine ' + s), { status: s });
  for (const s of [400, 404, 422]) eq(`HTTP ${s} → refused`, M.acqCalcFromEngineError(httpErr(s)).engineState, 'refused');
  for (const s of [500, 502, 503, 504]) eq(`HTTP ${s} → down`, M.acqCalcFromEngineError(httpErr(s)).engineState, 'down');
  eq('네트워크 오류(TypeError, status 없음) → down', M.acqCalcFromEngineError(new TypeError('Failed to fetch')).engineState, 'down');
  eq('타임아웃(AbortError) → down', M.acqCalcFromEngineError(Object.assign(new Error('aborted'), { name: 'AbortError' })).engineState, 'down');
  eq('예외 값이 없어도 → down', M.acqCalcFromEngineError(undefined).engineState, 'down');
  eq('예외 결과도 금액 필드가 없다', Object.keys(M.acqCalcFromEngineError(httpErr(503))).sort().join(','), 'engineState,precise');
  eq('예외 결과도 precise:false', M.acqCalcFromEngineError(httpErr(422)).precise, false);
  eq('거부·연결 실패 사유 문구는 서로 다르다',
     GAPS(plain, { precise: false, engineState: 'refused' })[0] !== GAPS(plain, { precise: false, engineState: 'down' })[0], true);
  /* ①층(입력 불확정)은 엔진 상태와 무관하다 — 그대로 남아 있다 */
  eq('①층 — 면적 미입력은 엔진이 정상이어도 막힌다', GAPS({ ...plain, exclusiveArea: '' }, ENGINE_OK).length > 0, true);
  eq('①층 — 엔진이 죽었고 면적도 없으면 사유가 2건(입력 + 엔진)이다', GAPS({ ...plain, exclusiveArea: '' }, ENGINE_DOWN).length, 2);
}

console.log('\n════ ⑧-c 상속 — 과세표준(시가표준액)·1가구 1주택 특례 매퍼 ════');
{
  const base = { acquisitionType: '상속', propertyType: '주택', propertyValue: '500000000', exclusiveArea: '84', region: 'unknown' };
  const m = (x) => M.mapAnswersToAcquisition(x);
  eq('상속 · standard_value 가 property_value 와 같다', m(base).standard_value, m(base).property_value);
  eq('상속 · property_value 도 그대로 간다', m(base).property_value, 500000000);
  eq('상속 + 주택 + yes → inheritance_one_house === true', m({ ...base, inheritOneHouse: 'yes' }).inheritance_one_house, true);
  eq('상속 + 주택 + no → inheritance_one_house === false', m({ ...base, inheritOneHouse: 'no' }).inheritance_one_house, false);
  eq('상속 + 주택 + 모르겠어요(unknown) → 키 없음', 'inheritance_one_house' in m({ ...base, inheritOneHouse: 'unknown' }), false);
  eq('상속 + 주택 + 미응답 → 키 없음', 'inheritance_one_house' in m(base), false);
  eq('상속 + 주택 + 알 수 없는 값 → 키 없음', 'inheritance_one_house' in m({ ...base, inheritOneHouse: 'maybe' }), false);
  for (const [lab, x] of [['농지', { propertyType: '농지' }], ['상가', { propertyType: '상가' }], ['토지', { propertyType: '토지' }]]) {
    eq(`상속 + ${lab} → standard_value 는 같은 금액이다`, m({ ...base, ...x }).standard_value, 500000000);
    eq(`상속 + ${lab} + 옛 yes 답 → 키 없음 (주택이 아니다)`, 'inheritance_one_house' in m({ ...base, ...x, inheritOneHouse: 'yes' }), false);
  }
  for (const t of ['매매', '증여', '신축', '공매', '재산분할']) {
    eq(`${t} + 주택 + 옛 yes 답 → inheritance_one_house 키 없음`,
       'inheritance_one_house' in m({ ...base, acquisitionType: t, acquirerType: 'individual', housingCount: '1', inheritOneHouse: 'yes' }), false);
  }
  for (const t of ['매매', '신축', '공매', '재산분할']) {
    eq(`${t} + 주택 → standard_value 가 없다 (상속·증여 전용)`,
       'standard_value' in m({ ...base, acquisitionType: t, acquirerType: 'individual', housingCount: '1' }), false);
  }
  /* 증여의 standard_value 처리는 그대로 — 증여 + 주택 + 값이 있을 때만, 그리고 «시가표준액 문항»의 값이다 */
  const gift = { acquisitionType: '증여', propertyType: '주택', propertyValue: '800000000', exclusiveArea: '84', isRegulatedArea: 'no', region: 'unknown' };
  eq('증여 + 주택 + 시가표준액 입력 → 그 값이 간다 (취득가액이 아니다)', m({ ...gift, standardValue: '400000000' }).standard_value, 400000000);
  eq('증여 + 주택 + 시가표준액 미입력 → standard_value 가 없다', 'standard_value' in m(gift), false);
  /* 상속에서 숨은 «시가표준액» 문항의 옛 답은 정규화가 지운다 — 상속의 standard_value 는 취득가액 칸에서만 온다 */
  eq('상속 · 증여 때 넣은 시가표준액 옛 답이 남아도 취득가액 칸 값이 간다',
     m({ ...base, standardValue: '999000000' }).standard_value, 500000000);
  /* 정규화 — 취득 원인을 바꾸면 숨은 1주택 특례 답이 지워진다 */
  eq('상속 → 매매로 바꾸면 inheritOneHouse 옛 답이 지워진다',
     M.acqNormalizeAnswers({ ...base, acquisitionType: '매매', acquirerType: 'individual', housingCount: '1', inheritOneHouse: 'yes' }).inheritOneHouse, undefined);
  eq('주택 → 상가로 바꾸면 inheritOneHouse 옛 답이 지워진다',
     M.acqNormalizeAnswers({ ...base, propertyType: '상가', inheritOneHouse: 'yes' }).inheritOneHouse, undefined);

  /* 매퍼가 내보내는 키 집합 — 허용 목록 안 + 근거 문항이 지금 보이는 문항 (상속 부분공간 전수) */
  let n = 0; const bad = [];
  for (const at of ['상속', '매매', '증여', '신축']) for (const pt of ['주택', '농지', '상가', '토지'])
    for (const ih of [undefined, 'yes', 'no', 'unknown', 'unsure']) for (const area of ['', '84'])
      for (const sv of ['', '400000000']) {
        const a = { acquisitionType: at, propertyType: pt, propertyValue: '500000000', exclusiveArea: area, standardValue: sv,
          acquirerType: 'individual', housingCount: '1', isRegulatedArea: 'yes', giftOneHouseException: 'no', region: 'unknown' };
        if (ih !== undefined) a.inheritOneHouse = ih;
        n++;
        const probs = payloadProblems(M.acqNormalizeAnswers(a), M.mapAnswersToAcquisition(a));
        if (probs.length && bad.length < 3) bad.push(probs[0]);
        else if (probs.length) bad.push('…');
      }
  console.log(`      (상속 부분공간 ${n}건 전수)`);
  eq('요청 키가 허용 목록 안이고 근거 문항이 지금 보이는 문항이다 (inheritance_one_house 포함)', bad.join(' | ') || 0, 0);
}

console.log('\n════ ⑧-d 문항 정의 — inheritOneHouse · propertyValue(qFor) · 상속 선택지 ════');
{
  const ih = M.ACQ_QS.find((q) => q.id === 'inheritOneHouse');
  eq('inheritOneHouse 문항이 있다', !!ih, true);
  const ids = M.ACQ_QS.map((q) => q.id);
  eq('exclusiveArea 문항 바로 뒤에 있다', ids[ids.indexOf('exclusiveArea') + 1], 'inheritOneHouse');
  eq('tier 는 quick', ih.tier, 'quick');
  eq('section', ih.section, '상속 1주택 특례');
  eq('q', ih.q, '상속받는 분의 가구가 이 집을 포함해 국내에 주택을 1채만 갖게 되나요?');
  eq('sub', ih.sub, '상속인과 같은 주민등록표에 있는 가족(배우자, 미혼인 30세 미만 자녀 포함)이 이 집 말고는 주택이 없으면 세율이 2.8%에서 0.8%로 낮아집니다(지방세법 §15①2호 가목, 시행령 §29). 고급주택은 제외됩니다. 여러 명이 함께 상속받으면 지분이 가장 큰 상속인을 기준으로 봅니다.');
  eq('선택지(값·라벨·힌트) — «모르겠어요» 값은 unsure 가 아니라 unknown', JSON.stringify(ih.opts),
     JSON.stringify([['yes', '네, 이 집 1채만 갖게 됩니다', '0.8% 특례'], ['no', '아니오, 다른 주택이 있습니다', '2.8%'], ['unknown', '모르겠어요', '2.8%로 계산하고 안내']]));
  eq('선택지 값에 unsure 가 없다 (acqFirstOpenQuestion 이 «돌아갈 문항»으로 고르지 않게)', ih.opts.some((o) => o[0] === 'unsure'), false);
  const shown = [];
  for (const at of ['매매', '증여', '상속', '신축', '공매', '재산분할']) for (const pt of ['주택', '상가', '농지', '토지', '오피스텔_주거용', '분양권']) {
    if (ih.showIf({ acquisitionType: at, propertyType: pt })) shown.push(at + '/' + pt);
  }
  eq('노출 조건 — 상속 + 주택일 때만', shown.join(','), '상속/주택');
  eq('상속 + 주택에서 빠른 계산 단계에 묻는다', M.acqIsQuick(ih, { acquisitionType: '상속', propertyType: '주택' }), true);

  const pv = M.ACQ_QS.find((q) => q.id === 'propertyValue');
  eq('propertyValue sub', pv.sub, '매매는 실제 산 가격, 증여는 시가(매매사례가액·감정가액 등), 상속은 시가표준액(공시가격), 신축은 공사비입니다. 취득세는 이 금액에 세율을 곱해 계산합니다.');
  eq('상속이면 문항 제목이 시가표준액이다', pv.qFor({ acquisitionType: '상속' }), '상속받은 부동산의 시가표준액(공시가격)은 얼마인가요? (원)');
  for (const t of [undefined, '매매', '증여', '신축', '공매', '재산분할']) {
    eq(`상속이 아니면(${t}) 종전 제목 그대로다`, pv.qFor({ acquisitionType: t }), pv.q);
  }
  const others = M.ACQ_QS.filter((q) => q.id !== 'propertyValue' && typeof q.qFor === 'function').map((q) => q.id);
  eq('qFor 는 propertyValue 에만 있다 (다른 문항의 동작은 바꾸지 않는다)', others.join(',') || '-', '-');
  const at = M.ACQ_QS.find((q) => q.id === 'acquisitionType');
  eq('상속 선택지 설명', at.opts.find((o) => o[0] === '상속')[2], '상속 취득 — 주택 2.8% (1주택 특례 0.8%)');
  eq('상속 선택지 설명에 「상담」 안내가 남아 있지 않다', at.opts.find((o) => o[0] === '상속')[2].includes('상담'), false);
  eq('exclusiveArea sub 에 폴백 전제 문구가 없다', M.ACQ_QS.find((q) => q.id === 'exclusiveArea').sub.includes('엔진이 연결'), false);

  /* 화면 배선 — 제목을 그리는 곳과 차단 화면이 qFor 를 쓴다 */
  eq('문항 화면 제목이 qFor 를 쓴다', code.includes('<h2>{cur.qFor ? cur.qFor(answers) : cur.q}</h2>'), true);
  const blockedBody = (() => {
    const head = 'if (acqBlocked) {'; const i = code.indexOf(head);
    let d = 1, j = i + head.length;
    while (j < code.length && d > 0) { const ch = code[j]; if (ch === '{') d++; else if (ch === '}') d--; j++; }
    return code.slice(i, j);
  })();
  eq('차단 화면의 「확인이 필요한 문항」이 qFor 를 쓴다', /acqOpenQ\.qFor \? acqOpenQ\.qFor\(answers\) : acqOpenQ\.q/.test(blockedBody), true);
  eq('입력 요약(상담 접수·카톡)도 qFor 를 쓴다', (code.match(/q\.qFor \? q\.qFor\(answers\)/g) || []).length, 2);
  /* 차단 화면이 사유를 셋으로 가른다 — input(①층) / refused / down */
  eq('차단 화면이 reason 을 input·refused·down 으로 넘긴다',
     /acqFallbackGaps\(answers, \{ precise: true \}\)\.length > 0 \? 'input' : \(calc\.engineState === 'refused' \? 'refused' : 'down'\)/.test(blockedBody), true);
  /* 상속 안내 상자(0.8% 특례) — 상속 + 주택이고 yes 가 아닐 때만 */
  eq('상속 안내 상자는 «상속 + 주택 + inheritOneHouse !== yes» 일 때만 보인다',
     /!report\.quick && answers\.acquisitionType === '상속' && answers\.propertyType === '주택' && answers\.inheritOneHouse !== 'yes' && \(\s*<div/.test(code), true);
  eq('상속 안내 상자 문안은 그대로다 (본세 2.8% 기준)', code.includes('현재 계산은 일반 상속 <strong>본세 2.8%</strong>'), true);

  /* 차단·이동 — 이 문항은 차단 사유가 아니고, 돌아갈 문항으로 고르지도 않는다 */
  const inh = { acquisitionType: '상속', propertyType: '주택', propertyValue: '500000000', exclusiveArea: '84', region: 'unknown' };
  for (const [lab, val] of [['미응답', undefined], ['yes', 'yes'], ['no', 'no'], ['unknown', 'unknown']]) {
    const a = val === undefined ? inh : { ...inh, inheritOneHouse: val };
    eq(`상속 주택 · ${lab} · 엔진이 값을 주면 차단되지 않는다`, GAPS(a, ENGINE_OK).length, 0);
    eq(`상속 주택 · ${lab} · 「돌아갈 문항」이 없다 (다른 문항으로 보내지 않는다)`, OPENQ(a), null);
  }
  eq('상속 주택 · 면적이 비어 있으면 돌아갈 문항은 면적이다 (이 문항이 아니다)', (OPENQ({ ...inh, exclusiveArea: '' }) || {}).id, 'exclusiveArea');
  const walked = walkQuick({ ...inh, inheritOneHouse: 'unknown' }, '상속 주택');
  eq('상속 주택 · 빠른 계산 단계에서 1주택 특례를 묻는다', walked.asked.includes('inheritOneHouse'), true);
  eq('상속 주택 · 빠른 계산을 마치면 입력 차단이 0건이다', GAPS(walked.answers, ENGINE_OK).length, 0);
  eq('상속 주택 · 매퍼는 inheritance_one_house 키를 보내지 않는다 (모르겠어요)', 'inheritance_one_house' in M.mapAnswersToAcquisition(walked.answers), false);
}

console.log('\n════ ⑧-e 261004 D1·D2 — 「보내지 않음 = 모름」: 조정대상지역 «아니오»·증여 중과 판정은 명시해서 보낸다 ════');
{
  const m = (x) => M.mapAnswersToAcquisition(x);
  const paid = { acquisitionType: '매매', propertyType: '주택', acquirerType: 'individual', propertyValue: '800000000', exclusiveArea: '84', housingCount: '2', temporaryTwoHouse: 'no', region: 'unknown' };
  /* D1 — 유상취득 주택(개인) */
  eq('D1 · 유상 주택 2주택 + 조정 yes → is_regulated_area === true', m({ ...paid, isRegulatedArea: 'yes' }).is_regulated_area, true);
  eq('D1 · 유상 주택 2주택 + 조정 no → is_regulated_area === false (명시)', m({ ...paid, isRegulatedArea: 'no' }).is_regulated_area, false);
  eq('D1 · 유상 주택 2주택 + 조정 no → 키가 실제로 있다', 'is_regulated_area' in m({ ...paid, isRegulatedArea: 'no' }), true);
  eq('D1 · 유상 주택 2주택 + 조정 unsure → 키 없음 (①층이 엔진 호출 전에 막는다)', 'is_regulated_area' in m({ ...paid, isRegulatedArea: 'unsure' }), false);
  eq('D1 · 유상 주택 2주택 + 조정 미응답 → 키 없음', 'is_regulated_area' in m(paid), false);
  eq('D1 · 1주택 매매 + 조정 미응답(빠른 계산에서는 묻지 않는다) → 키 없음', 'is_regulated_area' in m({ ...paid, housingCount: '1' }), false);
  eq('D1 · 1주택 매매 + 상세 단계에서 no 로 답했으면 → false (명시)', m({ ...paid, housingCount: '1', isRegulatedArea: 'no' }).is_regulated_area, false);
  eq('D1 · 공매 주택 + 조정 no → false', m({ ...paid, acquisitionType: '공매', isRegulatedArea: 'no' }).is_regulated_area, false);
  eq('D1 · 법인 주택 유상 + 조정 no → 키 없음 (법인은 개인 전용 필드를 보내지 않는다)', 'is_regulated_area' in m({ ...paid, acquirerType: 'corporate', isRegulatedArea: 'no' }), false);
  eq('D1 · 비주택 유상 + 옛 no 답 → 키 없음', 'is_regulated_area' in m({ ...paid, propertyType: '상가', isRegulatedArea: 'no' }), false);
  eq('D1 · 상속 + 주택 + 옛 no 답 → 키 없음', 'is_regulated_area' in m({ ...paid, acquisitionType: '상속', isRegulatedArea: 'no' }), false);
  eq('D1 · 증여 + 주택 + 조정 no → is_regulated_area 키는 보내지 않는다 (유상취득 전용)', 'is_regulated_area' in m({ ...paid, acquisitionType: '증여', isRegulatedArea: 'no' }), false);
  /* D2 — 증여 + 주택 */
  const gift = { acquisitionType: '증여', propertyType: '주택', propertyValue: '800000000', exclusiveArea: '84', region: 'unknown' };
  eq('D2 · 증여 주택 비조정(no) → gift_regulated_over_3b === false', m({ ...gift, isRegulatedArea: 'no' }).gift_regulated_over_3b, false);
  eq('D2 · 증여 주택 + 조정 yes + 시가표준액 3억 + 예외 아님 → true', m({ ...gift, isRegulatedArea: 'yes', giftOneHouseException: 'no', standardValue: '300000000' }).gift_regulated_over_3b, true);
  eq('D2 · 증여 주택 + 조정 yes + 시가표준액 3억 미만 → false', m({ ...gift, isRegulatedArea: 'yes', giftOneHouseException: 'no', standardValue: '299999999' }).gift_regulated_over_3b, false);
  eq('D2 · 증여 주택 + 조정 yes + 1세대 1주택 예외 yes → false', m({ ...gift, isRegulatedArea: 'yes', giftOneHouseException: 'yes', standardValue: '400000000' }).gift_regulated_over_3b, false);
  eq('D2 · 증여 주택 + 조정 yes + 시가표준액 없음 → false (시가로 대신 판정하지 않는다)', m({ ...gift, isRegulatedArea: 'yes', giftOneHouseException: 'no' }).gift_regulated_over_3b, false);
  eq('D2 · 증여 주택 + 조정 미응답 → false (키는 있다)', ('gift_regulated_over_3b' in m(gift)) && m(gift).gift_regulated_over_3b === false, true);
  for (const pt of ['상가', '농지', '토지', '오피스텔_주거용']) {
    eq(`D2 · 증여 + ${pt}(비주택) → 키 없음`, 'gift_regulated_over_3b' in m({ ...gift, propertyType: pt, isRegulatedArea: 'yes', standardValue: '400000000' }), false);
  }
  for (const t of ['매매', '상속', '신축', '공매', '재산분할']) {
    eq(`D2 · ${t} + 주택 → 키 없음 (증여 전용)`, 'gift_regulated_over_3b' in m({ ...paid, acquisitionType: t, isRegulatedArea: 'yes', standardValue: '400000000' }), false);
  }
  /* 부분공간 전수 — 증여 주택이면 항상 boolean, 아니면 없음 / 유상 주택(개인)의 조정 답과 키가 1:1 */
  let n = 0; const bad = [];
  for (const at of ['매매', '공매', '증여', '상속', '신축']) for (const pt of ['주택', '상가', '농지'])
    for (const reg of [undefined, 'yes', 'no', 'unsure']) for (const hc of ['1', '2', '3'])
      for (const ex of [undefined, 'yes', 'no']) for (const sv of ['', '299999999', '300000000'])
        for (const ac of [undefined, 'individual', 'corporate']) {
          const a = { acquisitionType: at, propertyType: pt, propertyValue: '500000000', exclusiveArea: '84', housingCount: hc, temporaryTwoHouse: 'no',
            standardValue: sv, region: 'unknown' };
          if (reg !== undefined) a.isRegulatedArea = reg; if (ex !== undefined) a.giftOneHouseException = ex; if (ac !== undefined) a.acquirerType = ac;
          const norm = M.acqNormalizeAnswers(a), p = m(a); n++;
          const gift = at === '증여' && pt === '주택';
          if (gift !== ('gift_regulated_over_3b' in p) || (gift && typeof p.gift_regulated_over_3b !== 'boolean')) bad.push('D2 ' + JSON.stringify(norm));
          const wantReg = (at === '매매' || at === '공매') && pt === '주택' && norm.acquirerType !== 'corporate' && (norm.isRegulatedArea === 'yes' || norm.isRegulatedArea === 'no')
            ? norm.isRegulatedArea === 'yes' : undefined;
          if (p.is_regulated_area !== wantReg) bad.push('D1 ' + JSON.stringify(norm));
          const probs = payloadProblems(norm, p); if (probs.length) bad.push(probs[0]);
        }
  console.log(`      (D1·D2 부분공간 ${n}건 전수)`);
  eq('조정 답·증여 중과 판정 키가 규칙대로만 나간다 (D1·D2 부분공간 전수 + 근거 문항 가시성)', bad.slice(0, 3).join(' | ') || 0, 0);
}

console.log(`\n════════════════════\n취득세 입력 흐름 실패 ${fails}건`);
process.exit(fails ? 1 : 0);

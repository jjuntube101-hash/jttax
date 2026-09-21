'use strict';
/* 「이 집을 사면 앞으로 내는 세금」(취득→보유) 회귀 — 260921

   대상: project/src/ReportAcqHolding.jsx (신설) + ReportAcquisition.jsx 마운트 지점.
   설계 정본: D:\클로드\브랜딩\세무법인\홈페이지\취득세고도화_260921\02_파생계산기_설계.md §0·§1

   지키는 것 (a)~(h):
     (a) 폴백·차단·비주택·법인·공동명의 상태에서 블록이 열리지 않는다
     (b) 공시가격이 비어 있으면 fetch 가 호출되지 않는다
     (c) 매매가가 공시가격 필드(standard_value·housing_values)로 들어가지 않는다
     (d) 다른 주택 「모름」이면 종부세 fetch 가 호출되지 않고 0원 표기도 없다
     (e) 재산세 호출이 실패해도 종부세 결과가 남고, 반대도 성립한다
     (f) 소스에 세 블록 금액을 더하는 코드와 「총」 합계 표기가 없다
     (g) 금지 문구·새 gtag/jtEvent 호출이 없다
     (h) 요청 본문의 키 집합이 기존 두 화면 매퍼의 키 집합과 같다

   ⚠️ 판정 규칙은 흉내 내지 않는다 — 소스의 함수를 그대로 꺼내 실행한다
      (tests_acq_flow.js·tests_fallback_block.js 와 같은 원칙). */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const SRC_DIR = path.join(__dirname, 'src');
const HOLD_PATH = path.join(SRC_DIR, 'ReportAcqHolding.jsx');
const ACQ_PATH = path.join(SRC_DIR, 'ReportAcquisition.jsx');
const PROP_PATH = path.join(SRC_DIR, 'ReportProperty.jsx');
const COMP_PATH = path.join(SRC_DIR, 'ReportComprehensive.jsx');
const BUNDLE_PATH = path.join(__dirname, 'dist', 'app.js');

const holdSrc = fs.readFileSync(HOLD_PATH, 'utf8');
const acqSrc = fs.readFileSync(ACQ_PATH, 'utf8');

let fails = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : `\n      got=${JSON.stringify(got)}  want=${JSON.stringify(want)}`));
  if (!ok) fails++;
}

/* 최상위 선언(함수·const)을 이름으로 꺼내 순수 함수로 실행한다. window 등 외부 의존이
   없는 함수만 이 방식으로 시험한다(acqHoldPropAnswers·acqHoldCompAnswers·acqHoldingVisibility·
   acqHoldYears·acqHoldTodayNotice·mapAnswersToProperty·mapAnswersToComprehensive 전부 해당). */
function loadTopLevel(code, fileLabel, names) {
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
  if (missing.length) throw new Error(`${fileLabel} 에서 최상위 선언을 찾지 못했습니다: ${missing.join(', ')}`);
  // eslint-disable-next-line no-new-func
  const fn = new Function(chunks.join('\n\n') + '\n;return {' + names.join(',') + '};');
  return fn();
}

const H = loadTopLevel(holdSrc, 'ReportAcqHolding.jsx', [
  'acqHoldingVisibility', 'acqHoldYears', 'acqHoldTodayNotice',
  'acqHoldPropAnswers', 'acqHoldCompAnswers',
]);
const P = loadTopLevel(fs.readFileSync(PROP_PATH, 'utf8'), 'ReportProperty.jsx', ['mapAnswersToProperty']);
const C = loadTopLevel(fs.readFileSync(COMP_PATH, 'utf8'), 'ReportComprehensive.jsx', ['mapAnswersToComprehensive']);

/* 함수 «몸통»을 여는 중괄호부터 잘라낸다(매개변수 구조분해 괄호에서 끊기지 않도록) —
   tests_acq_flow.js·tests_acq_check.js 와 같은 방식. */
function sliceBody(code, headNeedle) {
  const i = code.indexOf(headNeedle);
  if (i < 0) return '';
  const braceStart = code.indexOf('{', i);
  if (braceStart < 0) return '';
  let d = 1, j = braceStart + 1;
  while (j < code.length && d > 0) { const ch = code[j]; if (ch === '{') d++; else if (ch === '}') d--; j++; }
  return code.slice(i, j);
}

/* ══════════════════════════════════════════════════════════════════════
   (a) 폴백·차단·비주택·법인·공동명의 상태에서 블록이 열리지 않는다
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ (a) 폴백·차단·비주택·법인·공동명의 → 블록이 열리지 않는다 ════');
{
  const housingIndiv = { propertyType: '주택', acquirerType: 'individual' };
  eq('정밀 계산 + 개인 + 주택 → open (양성 대조)', H.acqHoldingVisibility(housingIndiv, { precise: true }), 'open');
  eq('간이 폴백(precise:false) → hidden', H.acqHoldingVisibility(housingIndiv, { precise: false }), 'hidden');
  eq('calc 자체가 없음(엔진 호출 전 차단) → hidden', H.acqHoldingVisibility(housingIndiv, null), 'hidden');
  // ⚠️ 「입력 불확정 차단」(preEngineBlock)은 ReportAcquisition 관례상 calc.precise=true 로
  // 저장된다(§«정밀 계산 성공»과 구분하는 표식일 뿐) — 그래서 이 함수의 precise 판정만으로는
  // preEngineBlock 상태를 가려낼 수 없다. 실제 차단은 그 상태에서 acqBlocked 가 true 가 되어
  // «컴포넌트 자체가 마운트되지 않는» 것으로 막힌다 — 아래 구조 검사(마운트 지점)가 그걸 본다.
  eq('비주택(상가) → unsupported-type', H.acqHoldingVisibility({ propertyType: '상가', acquirerType: 'individual' }, { precise: true }), 'unsupported-type');
  eq('비주택(오피스텔) → unsupported-type', H.acqHoldingVisibility({ propertyType: '오피스텔_주거용' }, { precise: true }), 'unsupported-type');
  eq('법인 명의 → unsupported-owner', H.acqHoldingVisibility({ propertyType: '주택', acquirerType: 'corporate' }, { precise: true }), 'unsupported-owner');
  eq('공동명의(방어적 필드 ownership=joint) → unsupported-owner', H.acqHoldingVisibility({ propertyType: '주택', acquirerType: 'individual', ownership: 'joint' }, { precise: true }), 'unsupported-owner');
  eq('공동명의(방어적 필드 acquirerType=joint) → unsupported-owner', H.acqHoldingVisibility({ propertyType: '주택', acquirerType: 'joint' }, { precise: true }), 'unsupported-owner');

  /* 구조 검사 — 진짜 «차단(acqBlocked)» 상태는 calc.precise 값과 무관하게 컴포넌트 자체가
     마운트되지 않아야 한다: ReportAcquisition.jsx 에서 <JTAcqHoldingForecast 는
     `if (acqBlocked) { ... return ... }` 블록의 «닫힌 뒤»에만 나와야 한다. */
  const blockedBody = sliceBody(acqSrc, 'if (acqBlocked) {');
  eq('acqBlocked 블록을 찾았다', blockedBody.length > 100, true);
  eq('차단(acqBlocked) 화면 안에는 JTAcqHoldingForecast 가 없다', blockedBody.includes('JTAcqHoldingForecast'), false);
  const mountIdx = acqSrc.indexOf('<JTAcqHoldingForecast');
  const blockedIdx = acqSrc.indexOf('if (acqBlocked) {');
  eq('JTAcqHoldingForecast 마운트 지점이 소스에 있다', mountIdx > 0, true);
  eq('마운트 지점이 acqBlocked 분기보다 «뒤»에 있다(차단이면 아예 안 그린다)', mountIdx > blockedIdx, true);
}

/* ══════════════════════════════════════════════════════════════════════
   (b) 공시가격이 비어 있으면 fetch 가 호출되지 않는다
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ (b) 공시가격이 비어 있으면 fetch(엔진 호출)가 발생하지 않는다 ════');
{
  const runBody = sliceBody(holdSrc, 'const runHolding = async () => {');
  eq('runHolding 본문을 찾았다', runBody.length > 200, true);
  // 값이 없는 연도는 callPropEngine 호출 «전에» continue 로 빠진다
  eq('값이 없으면(continue) 엔진 호출부보다 먼저 걸러진다',
     /if \(!\(Number\(row\.value\) > 0\)\)[\s\S]{0,200}continue;/.test(runBody), true);
  const guardIdx = runBody.search(/if \(!\(Number\(row\.value\) > 0\)\)/);
  const propCallIdx = runBody.indexOf('callPropEngine(');
  eq('그 가드가 callPropEngine 호출보다 앞선다', guardIdx >= 0 && propCallIdx > guardIdx, true);
}

/* ══════════════════════════════════════════════════════════════════════
   (c) 매매가가 공시가격 필드로 들어가지 않는다
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ (c) 매매가가 공시가격 필드(standard_value·housing_values)로 들어가지 않는다 ════');
{
  // 공시가격을 입력하지 않은 상태(빈 문자열) → 매퍼를 태워도 0(취득 매매가가 대신 들어가지 않는다)
  const emptyProp = H.acqHoldPropAnswers('', 'yes', 'yes');
  const p1 = P.mapAnswersToProperty(emptyProp);
  eq('공시가격 미입력 · standard_value 는 0이다 (매매가로 대체되지 않는다)', p1.standard_value, 0);

  const emptyComp = H.acqHoldCompAnswers('', 'none', '', '', '', '');
  const c1 = C.mapAnswersToComprehensive(emptyComp);
  eq('공시가격 미입력 · housing_values 합계가 0이다', c1.housing_values, [0]);

  // 함수 자체가 «취득 매매가(propertyValue)»를 참조하지 않는지 — 소스 구조로 고정
  eq('acqHoldPropAnswers 소스에 propertyValue 참조가 없다', H.acqHoldPropAnswers.toString().includes('propertyValue'), false);
  eq('acqHoldCompAnswers 소스에 propertyValue 참조가 없다', H.acqHoldCompAnswers.toString().includes('propertyValue'), false);
  // acqHoldPropAnswers/acqHoldCompAnswers 는 acqAnswers(취득 답변) 자체를 인자로 받지 않는다
  eq('acqHoldPropAnswers 는 취득 답변 객체를 인자로 받지 않는다(연도 공시가격만 받는다)',
     /function acqHoldPropAnswers\(\s*yearValue/.test(holdSrc), true);
  eq('acqHoldCompAnswers 는 취득 답변 객체를 인자로 받지 않는다(연도 공시가격만 받는다)',
     /function acqHoldCompAnswers\(\s*yearValue/.test(holdSrc), true);

  // 정상 값이면 그대로 들어간다(과잉 차단 방지)
  const filled = H.acqHoldPropAnswers('600000000', 'no', 'yes');
  eq('공시가격 6억을 넣으면 standard_value 가 그 값이다', P.mapAnswersToProperty(filled).standard_value, 600000000);
}

/* ══════════════════════════════════════════════════════════════════════
   (d) 다른 주택 「모름」이면 종부세 fetch 가 호출되지 않고 0원 표기도 없다
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ (d) 다른 주택 「모름」 → 종부세 fetch 없음, 0원 표기 없음 ════');
{
  eq('otherHousing=unsure → acqHoldCompAnswers 는 null (엔진에 보낼 것이 없다)',
     H.acqHoldCompAnswers('500000000', 'unsure', '', '', '', ''), null);
  eq('otherHousing 미지정(undefined) 도 null', H.acqHoldCompAnswers('500000000', undefined, '', '', '', ''), null);

  const runBody = sliceBody(holdSrc, 'const runHolding = async () => {');
  eq('compA 가 없으면(모름) status:unsure 로만 두고 callCompEngine 을 부르지 않는다',
     /if \(!compA\) \{\s*yearOut\.comp = \{ status: 'unsure' \};\s*\} else \{/.test(runBody), true);

  // 렌더에서 「모름」 분기는 숫자를 formatWon 으로 찍지 않고 고정 문구만 보여준다
  const compSection = holdSrc.slice(holdSrc.indexOf('가지고 있을 때 — 종합부동산세'));
  const unsureBranch = (compSection.match(/otherHousing === 'unsure' \? \(([\s\S]*?)\) : \(/) || ['', ''])[1];
  eq('종부세 「모름」 렌더 분기를 찾았다', unsureBranch.length > 0, true);
  eq('그 분기에 「계산할 수 없음」 문구가 있다', unsureBranch.includes('계산할 수 없음'), true);
  eq('그 분기에 formatWon 호출이 없다(숫자를 찍지 않는다)', unsureBranch.includes('formatWon'), false);
  eq('그 분기에 「0원」 표기가 없다', unsureBranch.includes('0원'), false);
}

/* ══════════════════════════════════════════════════════════════════════
   (e) 재산세 호출이 실패해도 종부세 결과가 남고, 반대도 성립한다
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ (e) 재산세·종부세 호출은 서로 독립적으로 실패한다 ════');
{
  const runBody = sliceBody(holdSrc, 'const runHolding = async () => {');
  const tryBlocks = runBody.match(/try \{[\s\S]*?\} catch \(e\) \{[\s\S]*?\}/g) || [];
  eq('try/catch 블록이 정확히 2개다 (재산세 1 · 종부세 1, 서로 중첩되지 않는다)', tryBlocks.length, 2);
  eq('첫 번째 try 블록이 재산세(callPropEngine)를 부른다', (tryBlocks[0] || '').includes('callPropEngine'), true);
  eq('첫 번째 try 블록은 종부세(callCompEngine)를 부르지 않는다(독립)', (tryBlocks[0] || '').includes('callCompEngine'), false);
  eq('두 번째 try 블록이 종부세(callCompEngine)를 부른다', (tryBlocks[1] || '').includes('callCompEngine'), true);
  eq('재산세 catch 가 종부세 결과를 지우지 않는다(continue/return 없음)',
     /catch \(e\) \{ yearOut\.prop = \{ status: 'error' \}; \}/.test(runBody), true);
  eq('종부세 catch 가 재산세 결과를 지우지 않는다(continue/return 없음)',
     /catch \(e\) \{ yearOut\.comp = \{ status: 'error' \}; \}/.test(runBody), true);
  // 루프 안에 continue 는 «공시가격 미입력 skip» 한 곳뿐이어야 한다 — 실패로 인한 continue 가 있으면
  // 그 해의 다른 세목 결과까지 함께 사라진다
  const continues = (runBody.match(/continue;/g) || []).length;
  eq('continue 는 공시가격 미입력 분기 1곳뿐이다(실패해도 다음 세목을 계속 계산)', continues, 1);
}

/* ══════════════════════════════════════════════════════════════════════
   (f) 소스에 세 블록 금액을 더하는 코드와 「총」 합계 표기가 없다
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ (f) 금액을 더하는 코드·총액 표기가 없다 ════');
{
  for (const bad of [/\.prop\.total\s*\+/, /\.comp\.total\s*\+/, /total\s*\+\s*r\./, /r\.\w+\.total\s*\+\s*r\.\w+\.total/,
    /totalTax\s*\+\s*calc/, /grandTotal/i, /합계\s*세액/, /전체\s*합계/]) {
    eq(`금액 합산 패턴 「${bad}」 이 없다`, bad.test(holdSrc), false);
  }
  // 설계서 4절 금지 문구(합산·확정을 함축하는 것들)
  for (const bad of ['앞으로 낼 세금은 총', '총 납부세액', '전체 세금은', '총액은']) {
    eq(`금지 표현 「${bad}」 이 없다`, holdSrc.includes(bad), false);
  }
  // 「가지고 있을 때」·「팔 때」 두 섹션이 각자 독립 <section> 이고, 하나의 합계 섹션으로
  // 묶이지 않았는지 — 재산세·종부세 섹션 헤더가 각각 따로 있다
  eq('재산세 섹션 헤더가 있다', holdSrc.includes('가지고 있을 때 — 재산세'), true);
  eq('종부세 섹션 헤더가 있다', holdSrc.includes('가지고 있을 때 — 종합부동산세'), true);
  eq('종부세 섹션 제목에 「이 집의 세금」이라고 쓰지 않았다', holdSrc.includes('이 집의 세금'), false);
  eq('종부세 섹션에 「납세자가 가진 주택 전체 기준」이 명시된다', holdSrc.includes('납세자가 가진 주택 전체 기준'), true);
}

/* ══════════════════════════════════════════════════════════════════════
   (g) 금지 문구·새 gtag/jtEvent 호출이 없다
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ (g) 금지 문구·새 계측 호출이 없다 ════');
{
  const BANNED = ['환급받을 금액', '돌려받을 수 있습니다', '반드시', '확정 세액', '이 금액만 내면 됩니다',
    '환급 성공률', '최대 절세액', '가장 유리합니다', '세무사 검토 완료', '소개하면 혜택', '무료',
    '지금 사는 것이 가장 유리합니다'];
  for (const bad of BANNED) {
    eq(`금지 문구 「${bad}」 가 없다`, holdSrc.includes(bad), false);
  }
  for (const banned of ['gtag(', 'jtEvent(', 'jtTrackCta(', 'booking_submit', 'calc_complete', 'cta_click', 'jtBookingOrigin']) {
    eq(`새 계측 호출 「${banned}」 이 없다`, holdSrc.includes(banned), false);
  }
  eq('표시의무 문구(제이티 세무법인 · 광고 담당 세무사 이현준)가 있다',
     holdSrc.includes('제이티 세무법인 · 광고 담당 세무사 이현준'), true);
}

/* ══════════════════════════════════════════════════════════════════════
   (h) 요청 본문의 키 집합이 기존 두 화면 매퍼의 키 집합과 같다
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ (h) 요청 본문 키 집합이 기존 매퍼(재산세·종부세) 것과 같다 ════');
{
  // 같은 매퍼 함수를 그대로 재사용하므로, «같은 모양의 answers» 를 넣으면 키·값이 완전히 같아야 한다.
  const viaHold = P.mapAnswersToProperty(H.acqHoldPropAnswers('700000000', 'yes', 'no'));
  const viaOwnScreen = P.mapAnswersToProperty({ propertyKind: '주택', standardValue: '700000000', isOneHouse: 'yes', isUrbanArea: 'no' });
  eq('재산세 · 이 블록이 만든 요청 본문이 기존 재산세 화면과 키·값까지 같다', viaHold, viaOwnScreen);

  const viaHoldC = C.mapAnswersToComprehensive(H.acqHoldCompAnswers('700000000', 'has', '800000000', '2', '', ''));
  const viaOwnScreenC = C.mapAnswersToComprehensive({ housingCount: 'two', totalValue: String(700000000 + 800000000) });
  eq('종부세 · 이 블록이 만든 요청 본문이 기존 종부세 화면과 키·값까지 같다', viaHoldC, viaOwnScreenC);

  // 매퍼를 복제하지 않고 «그대로» 호출하는지 소스로도 고정한다
  eq('소스가 mapAnswersToProperty( 를 그대로 호출한다', holdSrc.includes('mapAnswersToProperty('), true);
  eq('소스가 mapAnswersToComprehensive( 를 그대로 호출한다', holdSrc.includes('mapAnswersToComprehensive('), true);
  eq('소스에 엔진 payload 키를 직접 쓰는 리터럴이 없다(standard_value:)', /standard_value\s*:/.test(holdSrc), false);
  eq('소스에 엔진 payload 키를 직접 쓰는 리터럴이 없다(housing_values:)', /housing_values\s*:/.test(holdSrc), false);
}

/* ══════════════════════════════════════════════════════════════════════
   배선 — ORDER·번들·라우팅
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ 배선 — 번들 ORDER·산출물 ════');
{
  const bundleMjs = fs.readFileSync(path.join(__dirname, 'scripts', 'build_bundle.mjs'), 'utf8');
  eq('번들 ORDER 에 ReportAcqHolding.jsx 가 있다', bundleMjs.includes("'ReportAcqHolding.jsx'"), true);
  eq('ORDER 는 ReportProperty·ReportComprehensive 보다 뒤에 둔다(관례상 인접 배치, 실행엔 무관)',
     bundleMjs.indexOf("'ReportAcqHolding.jsx'") > bundleMjs.indexOf("'ReportComprehensive.jsx'"), true);
  const bundle = fs.existsSync(BUNDLE_PATH) ? fs.readFileSync(BUNDLE_PATH, 'utf8') : '';
  eq('번들 산출물에 ReportAcqHolding.jsx 가 실제로 들어갔다', bundle.indexOf('────── ReportAcqHolding.jsx ──────') >= 0, true);
  eq('취득세 결과 화면이 JTAcqHoldingForecast 를 마운트한다', acqSrc.includes('<JTAcqHoldingForecast'), true);
  eq('마운트가 acqAnswers·acqCalc·setRoute 를 넘긴다',
     /acqAnswers=\{answers\}\s*acqCalc=\{calc\}\s*setRoute=\{setRoute\}/.test(acqSrc), true);
}

console.log('\n════════════════════');
if (fails) {
  console.error(`tests_acq_holding: FAIL ${fails}`);
  process.exit(1);
}
console.log('tests_acq_holding: PASS');
process.exit(0);

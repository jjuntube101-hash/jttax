'use strict';
/* 「내가 낸 취득세 점검」 접수 회귀 — 260921, R2(260921 Codex R2) 갱신

   설계서(D:\클로드\브랜딩\세무법인\홈페이지\취득세고도화_260921\02_파생계산기_설계.md) §2·§4 를
   화면(ReportAcqCheck.jsx)·허브(build-commercial.mjs → acquisition-tax/index.html)가 그대로
   지키는지 본다.

     (a) 새 컴포넌트 소스·허브 링크 문구에 설계서 §4 금지 문구 + 「무료」가 없다
     (b) 결과(접수 완료) 화면 소스에 금액·차액을 그리는 코드가 없다 — 이 화면은 재계산기가 아니다
     (c) 동의(수집·이용 + 국외이전) 없이는 제출 함수가 호출되지 않는다
     (d) 소스에 자유 서술 입력란이 남아 있지 않다(<textarea 없음, type="text"는 금액 칸뿐)
     (e) 이 파일에서 booking_submit·gtag·jtEvent·jtTrackCta 가 전혀 발화되지 않는다
         (관찰 기간 260921~1003 — 기존 지표를 오염시키지 않는다)
     (f) 표시의무 문구(「제이티 세무법인 · 광고 담당 세무사 이현준」)가 있다
     (g) 접수 번호가 순번이 아니다 + Web Crypto 없으면 만들지 않는다(R1-F4)
     (h) 라우팅 배선
     (i) 입구(들어오는 길)
     (j) R2-F1 — 시·군·구 자유입력란을 없애고 시·도만 받는다(부류를 닫았다)
     (k) R2-F3 — 전화번호: 허용 문자 전체 검증 + payload 는 정규화 숫자열만
     (l) R1-F4/canSubmit 가드 — 접수번호·전화 검증을 요구한다
     (m) R2-F2 — 사후이력 상세는 고정 라벨 체크박스로만 받는다
     (n) R2 불변식 — buildAcqCheckPayload 오염 문자열 전수 검사(부류가 닫혔다는 증거)

   ⚠️ 주석 안의 「무료를 쓰지 않는다」같은 «규칙 설명»까지 금지어로 잡으면 위양성이 난다.
      그래서 (a)는 블록 주석을 걷어낸 뒤 검사한다. */
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'src');
const ACQ_CHECK = path.join(SRC, 'ReportAcqCheck.jsx');
const ACQUISITION = path.join(SRC, 'ReportAcquisition.jsx');
const LEGAL = path.join(SRC, 'Legal.jsx');
const HUB_HTML = path.join(ROOT, 'acquisition-tax', 'index.html');
const HUB_BUILDER = path.join(ROOT, 'project', 'commercial', 'build-commercial.mjs');
const HUB_DATA = path.join(ROOT, 'project', 'commercial', 'commercial.data.mjs');

let fails = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : `\n      got=${JSON.stringify(got)}  want=${JSON.stringify(want)}`));
  if (!ok) fails++;
}

const acqCheckSrc = fs.readFileSync(ACQ_CHECK, 'utf8');
const acquisitionSrc = fs.readFileSync(ACQUISITION, 'utf8');
const legalSrc = fs.readFileSync(LEGAL, 'utf8');
const hubHtml = fs.existsSync(HUB_HTML) ? fs.readFileSync(HUB_HTML, 'utf8') : '';
const hubBuilderSrc = fs.readFileSync(HUB_BUILDER, 'utf8');
const hubDataSrc = fs.readFileSync(HUB_DATA, 'utf8');

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* 컴포넌트(JTReportAcqCheck) 앞의 모든 최상위 선언(상수·함수)을 통째로 로드한다 — R2 로
   payload 조립이 여러 상수·헬퍼로 나뉘었으므로, 하나씩 AST 로 골라내는 대신 «컴포넌트 이전
   전부»를 실행해 그 안의 이름들을 한 번에 꺼낸다. window.* = ... 대입문이 있어 fakeWindow 를
   준다(에러 없이 조용히 받아주기만 하면 된다). */
function loadAcqCheckModule() {
  const compIdx = acqCheckSrc.indexOf('function JTReportAcqCheck');
  if (compIdx < 0) throw new Error('JTReportAcqCheck 를 찾지 못했습니다');
  const header = acqCheckSrc.slice(0, compIdx);
  const names = ['buildAcqCheckPayload', 'validateAcqCheckPhone', 'validateAcqCheckDate', 'acqCheckPick',
    'acqCheckMoneyValue', 'acqCheckGenId', 'acqCheckCanSubmit', 'buildAcqCheckRequest', 'buildAcqCheckMailBody', 'ACQ_CHECK_REGIONS', 'ACQ_CHECK_POST_HISTORY_ITEMS',
    'ACQ_CHECK_ACQUISITION_TYPES', 'ACQ_CHECK_PROPERTY_TYPES', 'ACQ_CHECK_OWNERSHIP_TYPES',
    'ACQ_CHECK_NOTICE_TYPES', 'ACQ_CHECK_INFO_SOURCES', 'ACQ_CHECK_CONTACT_METHODS'];
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'React', header + '\n;return {' + names.join(',') + '};');
  return fn({}, { useState: () => [undefined, () => {}] });
}
const M = loadAcqCheckModule();

console.log('\n════ (a) 설계서 §4 금지 문구 + 「무료」가 없다 ════');
{
  const BANNED = ['환급받을 금액', '돌려받을 수 있습니다', '반드시', '확정 세액', '이 금액만 내면 됩니다',
    '환급 성공률', '최대 절세액', '가장 유리합니다', '세무사 검토 완료', '소개하면 혜택', '무료'];
  /* ⚠️ commercial.data.mjs·build-commercial.mjs 는 이 저장소의 «기존» 상업 랜딩 카피를
     담고 있고, 그중 상담 예약 안내(consult 「첫 상담은 무료」)처럼 이미 승인된 문구가
     이 목록의 일부 단어를 «정당하게» 포함한다(무료의 범위·조건을 같은 화면에 명시하는
     기존 정책, HANDOFF §1-3 260830). 그 기존 카피까지 이 시험이 잡으면 위양성이라
     이 시험 자체가 꺼진다 — 그래서 «이번에 새로 추가한 조각»만 도려내 검사한다. */
  const acqCheckLinkSnippet = (hubDataSrc.match(/acqCheck:\s*\{[^}]*\}/) || [''])[0];
  const acqCheckSectionSnippet = (hubBuilderSrc.match(/이미 낸 취득세를 점검받고 싶다면[\s\S]{0,600}?<\/section>/) || [''])[0];
  const hubEntryLinkSnippet = (acquisitionSrc.match(/이미 낸 취득세를 점검받고 싶다면[\s\S]{0,200}?<\/p>/) || [''])[0];
  const targets = [
    ['ReportAcqCheck.jsx (주석 제외, 전체가 신설분)', stripComments(acqCheckSrc)],
    ['ReportAcquisition.jsx · 신설 진입 링크', hubEntryLinkSnippet],
    ['acquisition-tax/index.html (허브, 전체)', hubHtml],
    ['build-commercial.mjs · 신설 「이미 낸 취득세」 섹션', acqCheckSectionSnippet],
    ['commercial.data.mjs · 신설 acqCheck 링크', acqCheckLinkSnippet],
  ];
  eq('진입 링크 스니펫을 찾았다(ReportAcquisition.jsx)', hubEntryLinkSnippet.length > 0, true);
  eq('허브 신설 섹션 스니펫을 찾았다(build-commercial.mjs)', acqCheckSectionSnippet.length > 0, true);
  eq('acqCheck 링크 스니펫을 찾았다(commercial.data.mjs)', acqCheckLinkSnippet.length > 0, true);
  for (const [label, text] of targets) {
    for (const bad of BANNED) {
      eq(`${label} · 금지 문구 「${bad}」 없음`, text.includes(bad), false);
    }
  }
  eq('허브가 실제로 빌드돼 있다(파일 존재)', fs.existsSync(HUB_HTML), true);
}

console.log('\n════ (b) 결과(접수 완료) 화면에 금액·차액을 그리는 코드가 없다 ════');
{
  const head = 'if (done) {';
  const i = acqCheckSrc.indexOf(head);
  let d = 1, j = i + head.length;
  while (j < acqCheckSrc.length && d > 0) { const ch = acqCheckSrc[j]; if (ch === '{') d++; else if (ch === '}') d--; j++; }
  const doneBlock = i < 0 ? '' : acqCheckSrc.slice(i, j);
  eq('done 블록을 찾았다', doneBlock.length > 200, true);
  /* ⚠️ 「차액」이라는 «낱말»이 아니라 «차액을 계산·표시하는 코드»가 없는지를 본다.
     done 블록에는 오히려 「세액·차액·환급 가능성을 계산하거나 표시하지 않습니다」라는
     안내 문장이 «있어야» 한다 — 부정문 속의 낱말까지 금지어로 잡으면 그 안내 자체를
     못 쓰게 되는 자기모순이 된다. 그래서 여기서는 «계산 코드»만 본다. */
  for (const banned of ['formatWon(', 'totalTax', '환급액', 'calc.', 'commentary.']) {
    eq(`done 블록에 「${banned}」 가 없다 (금액·차액을 그리지 않는다)`, doneBlock.includes(banned), false);
  }
  eq('done 블록은 대신 「계산하거나 표시하지 않습니다」 취지의 안내를 담는다',
     /계산하거나 표시하지 않습니다|계산하지도, 표시하지도 않습니다/.test(doneBlock), true);
  /* 결과 화면 컴포넌트 전체를 봐도(=제출 전 화면 포함) 세액을 계산·표시하는 흔적이 없어야
     한다 — 이 화면은 애초에 세액을 다루지 않는다. */
  for (const banned of ['formatWon(', 'window.jtMoneyDigits(', 'totalTax']) {
    // jtMoneyDigits 는 «신고서에 적힌 금액 입력값 정규화»에는 쓰인다(설계서 2-3 ⑥⑦) —
    // 세액을 «계산»하는 것이 아니라 «받아 그대로 전달」하는 것이므로 예외로 둔다.
    if (banned === 'window.jtMoneyDigits(') continue;
    eq(`컴포넌트 전체에 「${banned}」 가 없다 (재계산기가 아니다)`, acqCheckSrc.includes(banned), false);
  }
}

console.log('\n════ (c) 동의 없이는 제출 함수가 호출되지 않는다 ════');
{
  const canSubmitLine = (acqCheckSrc.match(/const canSubmit = [^\n]*(\n[^\n]*)*?;/) || [''])[0];
  eq('canSubmit 선언을 찾았다', canSubmitLine.length > 0, true);
  eq('canSubmit 이 두 동의(f.consent · f.consentIntl)를 모두 요구한다',
     /f\.consent\b/.test(canSubmitLine) && /f\.consentIntl\b/.test(canSubmitLine), true);
  const submitFn = (acqCheckSrc.match(/const submit = async \(\) => \{([\s\S]*?)\n  \};/) || ['', ''])[1];
  eq('submit 함수를 찾았다', submitFn.length > 0, true);
  eq('submit 이 진입 즉시 canSubmit 을 확인하고 아니면 반환한다',
     /^\s*if \(!canSubmit\) return;/.test(submitFn), true);
  eq('제출 버튼이 canSubmit 으로 disabled 된다', /disabled=\{!canSubmit\}/.test(acqCheckSrc), true);
  eq('제출 버튼이 submit 함수에 연결된다', /onClick=\{submit\}/.test(acqCheckSrc), true);
  eq('submit 이 payload 를 buildAcqCheckPayload(f, receiptId) 로 조립한다(순수 함수 재사용)',
     /const payload = buildAcqCheckPayload\(f, receiptId\);/.test(submitFn), true);   // R3: 펼쳐 합치지 않고 단독 대입
}

console.log('\n════ (d) 소스에 자유 서술 입력란이 남아 있지 않다 ════');
{
  eq('<textarea 가 없다', acqCheckSrc.includes('<textarea'), false);
  eq('주민등록번호·동·호·지번 등 상세주소 낱말이 소스(주석 제외)에 없다',
     ['주민등록번호', '주민번호', 'residentNumber', 'unitNumber'].every((w) => !stripComments(acqCheckSrc).includes(w)), true);
  eq('제출 본문(buildAcqCheckPayload)에 소재지_시군구 키가 없다(R2-F1로 제거)',
     acqCheckSrc.includes('소재지_시군구'), false);
  eq('sigungu·postHistoryDetail 식별자가 소스에 없다(부류 자체를 없앴다)',
     /\bsigungu\b/i.test(acqCheckSrc) || acqCheckSrc.includes('postHistoryDetail'), false);

  // type="text" 입력은 금액 칸(신고서 세목별 금액·합계·실제납부액) 뿐이어야 한다 — 5곳
  const textInputs = acqCheckSrc.match(/<input[^>]*type="text"[^>]*\/>/g) || [];
  eq('type="text" 입력이 정확히 5개(금액 칸만)다', textInputs.length, 5);
  for (const tag of textInputs) {
    eq(`금액 칸은 setMoney( 로 정규화한다: ${tag.slice(0, 60)}...`, /onChange=\{setMoney\(/.test(tag), true);
  }
}

console.log('\n════ (e) 이 화면은 booking_submit·gtag·jtEvent·jtTrackCta 를 전혀 쏘지 않는다 ════');
{
  // 주석 안의 「booking_submit 도 발화하지 않는다」같은 «규칙 설명»은 실제 호출이 아니다 — 걷어내고 본다
  const acqCheckNoComments = stripComments(acqCheckSrc);
  for (const banned of ['booking_submit', 'gtag(', 'jtEvent(', 'jtTrackCta(', 'jtCalcComplete']) {
    eq(`ReportAcqCheck.jsx (주석 제외) 에 「${banned}」 호출이 없다`, acqCheckNoComments.includes(banned), false);
  }
}

console.log('\n════ (f) 표시의무 문구가 있다 ════');
{
  eq('「제이티 세무법인 · 광고 담당 세무사 이현준」이 있다',
     acqCheckSrc.includes('제이티 세무법인 · 광고 담당 세무사 이현준'), true);
  const doneHead = 'if (done) {';
  const di = acqCheckSrc.indexOf(doneHead);
  eq('접수 완료 화면에도 표시의무 문구가 있다',
     acqCheckSrc.slice(di, di + 3000).includes('제이티 세무법인'), true);
}

console.log('\n════ (g) 접수 번호 — 순번이 아니다 + Web Crypto 없으면 만들지 않는다(R1-F4) ════');
{
  const ast = parse(acqCheckSrc, { sourceType: 'script', plugins: ['jsx'] });
  let genIdChunk = '';
  for (const n of ast.program.body) {
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'acqCheckGenId') {
      genIdChunk = acqCheckSrc.slice(n.start, n.end);
    }
  }
  eq('acqCheckGenId 최상위 선언을 찾았다', genIdChunk.length > 0, true);
  eq('소스에 Math.random 이 없다(R1-F4 — 예측 저항성 없는 폴백 삭제)', acqCheckSrc.includes('Math.random'), false);

  // R1-F4: crypto 가 없으면 값을 «돌려주지 않는다» — null 이거나 예외를 던져야 한다.
  const fn = M.acqCheckGenId;
  let noCryptoValue;
  let threw = false;
  try { noCryptoValue = fn(); } catch (_e) { threw = true; }
  eq('crypto 없음 · 값을 돌려주지 않는다(null 또는 예외)', threw || noCryptoValue == null, true);

  // crypto.getRandomValues 가 있는 정상 경로는 여전히 「추측하기 어려운」 성질을 지킨다.
  /* 260922: 난수를 «고정 바이트»로 주입한다. 종전에는 Math.random 으로 채우고 결과가 /^\d+$/ 이면
     FAIL 이었는데, 정상 구현도 바이트가 우연히 전부 0~9 로만 36진 표기되면(실측 약 2,000회에 1회)
     숫자만 나와 게이트가 간헐 실패했다. 「순번이 아니다」는 형식이 아니라 «출력이 주입한 난수
     바이트만으로 정해지는가»로 본다 — 순번·시각이 섞였다면 같은 바이트에서 값이 달라진다. */
  let fillByte = 0xAB;
  let filler = null; // 함수면 균일 채움 뒤에 호출해 배열을 덮어쓴다(위치별·표본 주입용)
  const rngCalls = [];
  /* Codex R3-F1: 호출마다 «새 window · 새 함수 인스턴스»로 돌린다. 하나를 계속 쓰면 window 에 「본 배열 → 순번」을
     캐시해 두는 상태 기반 순번 구현이 같은 입력엔 같은 값·다른 입력엔 다른 값을 내며 전부 통과한다. */
  /* Codex R4-F1: 시계도 주입한다 — 같은 날 안에서는 「날짜를 접미사로 붙이는」 구현이 같은 값을 내 통과한다.
     Date·performance 를 가짜로 가려 두고 호출할 때마다 400일씩 밀어, 시각이 섞였다면 같은 바이트에서 값이 갈리게 한다. */
  const RealDate = Date;
  let clockMs = RealDate.UTC(2026, 0, 1);
  function FakeDate(...args) {
    if (!new.target) return new RealDate(clockMs).toString(); // new 없는 Date() 는 문자열을 돌려준다
    return args.length ? new RealDate(...args) : new RealDate(clockMs);
  }
  FakeDate.prototype = RealDate.prototype; // instanceof Date · Date.prototype 접근을 그대로 둔다(R5 confirm)
  FakeDate.now = () => clockMs;
  FakeDate.UTC = RealDate.UTC;
  FakeDate.parse = RealDate.parse;
  const fakePerformance = { now: () => clockMs };
  // eslint-disable-next-line no-new-func
  const mkGenIdRaw = new Function('window', 'Date', 'performance', genIdChunk + '\n;return acqCheckGenId;');
  const mkGenId = (w) => {
    const f = mkGenIdRaw(w, FakeDate, fakePerformance);
    return () => { clockMs += 400 * 86400000; return f(); };
  };
  /* R4-F4: 난수 요청은 «생성마다 1회 이상»만 요구한다 — 정확한 누적 횟수를 못 박으면 8바이트를 두 번 받아
     잇는 정당한 구현이 떨어진다. 생성 1회가 부른 getRandomValues 횟수를 여기에 쌓는다. */
  const perGenCalls = [];
  const counted = (f) => { const before = rngCalls.length; const v = f(); perGenCalls.push(rngCalls.length - before); return v; };
  const mkWindow = () => ({
    Uint8Array: Uint8Array,
    crypto: { getRandomValues: (arr) => {
      rngCalls.push(arr.length); arr.fill(fillByte);
      if (filler) filler(arr);
      return arr;
    } },
  });
  const fn2 = () => counted(mkGenId(mkWindow()));
  /* ⚠️ 새 window 만 쓰면 반대쪽이 샌다 — window 에 순번을 두고 난수에 섞는 구현은 새 window 에서 순번이 늘 1 이라
     같은 값을 낸다(결함 주입 M5 가 통과하는 것을 실측). 그래서 «하나의 window 를 계속 쓰는» 함수로도 같은 바이트를
     되풀이해, 앞선 호출이 뒤 호출의 값을 바꾸지 않는지 본다. 두 방식은 서로의 구멍을 막는다. */
  const sharedRaw = mkGenId(mkWindow());
  const shared = () => counted(sharedRaw);
  const s1 = shared();
  const s2 = shared();
  fillByte = 0xCD;
  const s3 = shared();
  fillByte = 0xAB;
  const s4 = shared();
  const a1 = fn2();
  const a2 = fn2();
  fillByte = 0xCD;
  const b1 = fn2();
  eq('crypto 경로 · 문자열을 돌려준다', [typeof a1, typeof a2, typeof b1, typeof s1], ['string', 'string', 'string', 'string']);
  eq('crypto 경로 · 같은 window 에서 같은 바이트를 되풀이해도 값이 같다 (호출마다 시계를 400일 밀었다 — 순번·누적 상태·시각 없음)',
     [s1 === s2, s1 === s4, s1 !== s3], [true, true, true]);
  eq('crypto 경로 · 같은 window 든 새 window 든 같은 바이트면 같은 값', [s1 === a1, s3 === b1], [true, true]);
  eq('crypto 경로 · 접두사 ACQCK-', String(a1).indexOf('ACQCK-'), 0);
  eq('crypto 경로 · 생성마다 getRandomValues 를 1회 이상 부른다 (got=생성별 호출 수)',
     perGenCalls.length === 7 && perGenCalls.every((n) => n >= 1) ? true : perGenCalls, true);
  eq('crypto 경로 · 난수를 8바이트 이상 받는다 (추측하기 어려운 양)', rngCalls.length > 0 && rngCalls.every((n) => n >= 8), true);
  eq('crypto 경로 · 같은 바이트면 같은 값 (순번·시각이 섞이지 않았다)', a1 === a2, true);
  eq('crypto 경로 · 바이트가 다르면 값이 다르다 (입력 바이트가 출력에 반영된다)', a1 !== b1, true);
  eq('crypto 경로 · 길이가 12자를 넘는다 (추측하기 어려운 길이)', String(a1).length > 12 && String(b1).length > 12, true);
  eq('crypto 경로 · 고정 바이트 0xAB 에서 숫자만으로 된 형태가 아니다 (10진 순번식 표기가 아니다)',
     /^\d+$/.test(String(a1).replace('ACQCK-', '')), false);

  /* Codex R1-F1·R2-F1·R2-F2 — 「출력에 닿는 난수량을 줄이는 개조」 부류를 두 축으로 닫는다.
     균일한 두 배열만 비교하면 첫 1바이트만 쓰는 구현(256가지)도, 위치마다 1비트만 쓰는 구현(64가지)도 통과했다.
       ① 위치별: 한 위치에 0~255 를 전부 넣어 나온 유일 출력 수 n 의 log2(n) 을 전 위치에서 더해 40비트 이상.
          현 구현 실측(기준 0xAB) = 256·256·256·256·256·250·1·1·1·1 → 약 47.97비트 — 36진 표기를 이어 붙여
          앞 12자를 쓰므로 2글자 바이트에서는 앞 6바이트까지만 출력에 닿는다. 위치마다 7비트를 요구하면 바이트당
          6비트씩 10곳을 쓰는 정당한 60비트 구현이 떨어진다(R3-F2) — 그래서 위치 수·위치별 문턱이 아니라 합산이다.
       ② 결합: 결정적 LCG 로 만든 배열 65,536개의 출력이 (거의) 전부 달라야 한다. 바이트들을 XOR·합으로 접어
          좁은 공간에 넣으면 ①은 통과해도 여기서 충돌이 쏟아진다(24비트 공간이면 기대 충돌 약 128건).
     ⚠️ 한계: 블랙박스 시험은 엔트로피를 증명하지 못한다. 이 검사가 잡는 것은 대략 2^26 미만으로의 축소까지다.
        시드가 고정이라 같은 소스에서는 항상 같은 판정이 난다(난수원 비의존).
     ⚠️ 알려진 위양성(Codex R4-F2·F3, 채택하지 않음): 기준점이 «균일 배열»(0xAB·0xCD)이라, 이웃 바이트를 XOR 로
        묶거나 3바이트 다수결을 취하는 구현은 난수를 48비트 이상 쓰더라도 「바이트가 다르면 값이 다르다」·위치별 합산에서
        떨어진다. acqCheckGenId 를 그런 방식으로 바꾸게 되면 이 블록의 기준점을 비균일 배열로 함께 바꿔야 한다. */
  fillByte = 0xAB;
  const nBytes = rngCalls[0];
  const gensBefore = perGenCalls.length;
  const perPos = [];
  for (let i = 0; i < nBytes; i++) {
    const seen = new Set();
    for (let v = 0; v < 256; v++) { filler = (arr) => { arr[i] = v; }; seen.add(fn2()); }
    perPos.push(seen.size);
  }
  const posGens = perGenCalls.slice(gensBefore);
  eq('crypto 경로 · 위치별 주입도 생성마다 getRandomValues 를 거친다', [posGens.length, posGens.every((n) => n >= 1)], [nBytes * 256, true]);
  const posBits = perPos.reduce((sum, n) => sum + Math.log2(Math.max(n, 1)), 0);
  eq('crypto 경로 · 위치별로 출력에 닿는 정보량의 합이 40비트 이상 (got=위치별 유일 출력 수)',
     posBits >= 40 ? true : perPos, true);

  const SAMPLES = 65536;
  let lcg = 0x9E3779B9;
  filler = (arr) => {
    for (let i = 0; i < arr.length; i++) { lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0; arr[i] = lcg >>> 24; }
  };
  const uniq = new Set();
  for (let n = 0; n < SAMPLES; n++) uniq.add(fn2());
  filler = null;
  eq('crypto 경로 · 서로 다른 난수 배열 65,536개가 (거의) 전부 다른 접수번호가 된다 (좁은 공간으로 접지 않는다, got=유일값 수)',
     uniq.size >= SAMPLES - 8 ? true : uniq.size, true);
}

console.log('\n════ (h) 라우팅 배선 — JT_KNOWN_SUBS·번들 ORDER·라우터 렌더 ════');
{
  const reportSrc = fs.readFileSync(path.join(SRC, 'Report.jsx'), 'utf8');
  eq('JT_KNOWN_SUBS 에 acq-check 가 있다 (누락 시 딥링크가 조용히 허브로 감)',
     /JT_KNOWN_SUBS = \[[^\]]*'acq-check'[^\]]*\]/.test(reportSrc), true);
  eq('라우터가 acq-check 를 JTReportAcqCheck 로 렌더한다',
     /subRoute === 'acq-check' && <JTReportAcqCheck/.test(reportSrc), true);
  const bundleMjs = fs.readFileSync(path.join(ROOT, 'project', 'scripts', 'build_bundle.mjs'), 'utf8');
  eq('번들 ORDER 에 ReportAcqCheck.jsx 가 있다', bundleMjs.includes("'ReportAcqCheck.jsx'"), true);
  const bundle = fs.readFileSync(path.join(ROOT, 'project', 'dist', 'app.js'), 'utf8');
  eq('번들 산출물에 ReportAcqCheck.jsx 가 실제로 들어갔다', bundle.indexOf('────── ReportAcqCheck.jsx ──────') >= 0, true);
  /* ROUTES 폐집합(jtBookingOrigin) 은 건드리지 않았다 — report 상위 라우트가 이미 있었고
     이 화면은 그 아래 sub 하나를 늘렸을 뿐이다. tests_booking_origin.js 가 전체 스위트에서
     그대로 통과하는 것으로 이미 확인된다(이 파일은 그 사실을 다시 한 번 못박는다). */
  const chrome = fs.readFileSync(path.join(SRC, 'Chrome.jsx'), 'utf8');
  const allowed = (chrome.match(/var ALLOWED = \[([\s\S]*?)\];/) || ['', ''])[1];
  eq('jtBookingOrigin.ALLOWED 에 acq-check 관련 값을 추가하지 않았다 (건드리지 않는다)',
     /acq[_-]?check/i.test(allowed), false);
}

console.log('\n════ (i) 입구(들어오는 길) — 결과 화면 링크 1개 + 허브 링크 1개 ════');
{
  eq('ReportAcquisition.jsx 결과 화면에 acq-check 로 가는 실 href 가 있다',
     acquisitionSrc.includes('href="#/report/acq-check"'), true);
  eq('허브 데이터에 acqCheck 링크가 있다', /acqCheck:\s*\{\s*href:\s*'\/#\/report\/acq-check'/.test(hubDataSrc), true);
  eq('허브 HTML 에 acq-check 링크가 실제로 박혔다', hubHtml.includes('/#/report/acq-check'), true);
  // 홈·전역 메뉴에는 넣지 않는다(설계서 지시) — Home.jsx·Chrome.jsx 전역 내비에 없어야 한다
  const homeSrc = fs.readFileSync(path.join(SRC, 'Home.jsx'), 'utf8');
  eq('Home.jsx 에 acq-check 링크가 없다 (홈 전면 비노출)', homeSrc.includes('acq-check'), false);
  const chrome2 = fs.readFileSync(path.join(SRC, 'Chrome.jsx'), 'utf8');
  eq('Chrome.jsx 전역 내비·메뉴에 acq-check 링크가 없다', chrome2.includes('acq-check'), false);
}

console.log('\n════ (j) R2-F1 — 시·군·구 자유입력란을 없애고 시·도만 받는다 ════');
{
  eq('sigungu 관련 식별자·필드가 소스에 없다', /sigungu/i.test(acqCheckSrc), false);
  eq('물건 소재지는 시·도 select 하나뿐이다(select 라벨 「물건 소재지」 1회만)',
     (acqCheckSrc.match(/물건 소재지/g) || []).length, 1);
  eq('시·도 선택 아래 「시·군·구와 상세 주소는 받지 않습니다」 안내가 있다',
     acqCheckSrc.includes('시·군·구와 상세 주소는 받지 않습니다. 필요하면 세무사가 연락드릴 때 여쭙니다.'), true);
  eq('개인정보 수집·이용 동의 문구가 「소재지 시·도」로 고쳐졌다',
     acqCheckSrc.includes('취득일·소재지 시·도·취득 원인'), true);
  eq('동의 문구에 「소재지 시·군·구」가 더는 없다', acqCheckSrc.includes('소재지 시·군·구'), false);
  eq('Legal.jsx 처리방침이 「소재지 시·도」로 고쳐졌다(취득세 점검 접수 항목)',
     legalSrc.includes('선택: 취득일, 소재지 시·도, 취득 원인'), true);
  eq('Legal.jsx 가 시·군·구도 받지 않는다고 명시한다',
     legalSrc.includes('시·군·구·동·호수·주민등록번호는 받지 않으며'), true);

  // buildAcqCheckPayload 로도 확인 — 시·도 목록 밖 값은 「모름」으로 막힌다
  eq('허용 시·도(서울특별시)는 그대로 실린다', M.buildAcqCheckPayload({ sido: '서울특별시' }, 'ACQCK-TEST0001').소재지_시도, '서울특별시');
  eq('허용 목록 밖 값(강남구 테헤란로)은 「모름」으로 막힌다',
     M.buildAcqCheckPayload({ sido: '강남구 테헤란로 123' }, 'ACQCK-TEST0001').소재지_시도, '모름');
}

console.log('\n════ (k) R2-F3 — 전화번호: 허용 문자 전체 검증 + payload 는 정규화 숫자열만 ════');
{
  const validatePhone = M.validateAcqCheckPhone;
  eq('통과 · 010-1234-5678', validatePhone('010-1234-5678').ok, true);
  eq('통과 · 010-1234-5678 · digits 는 정규화 숫자열', validatePhone('010-1234-5678').digits, '01012345678');
  eq('통과 · 02 123 4567 (허용 문자만, 9자리, 0 시작)', validatePhone('02 123 4567').ok, true);
  eq('거부 · 「주소: 역삼동, 010-1234-5678」(허용 문자 밖 글자 포함)', validatePhone('주소: 역삼동, 010-1234-5678').ok, false);
  eq('거부 · 「abc01012345678xyz」(문자 섞임)', validatePhone('abc01012345678xyz').ok, false);
  eq('거부 · 01012345 (8자리)', validatePhone('01012345').ok, false);
  eq('거부 · 10-1234-5678 (0으로 시작하지 않음)', validatePhone('10-1234-5678').ok, false);
  eq('거부 · 010-1234-56789 (12자리)', validatePhone('010-1234-56789').ok, false);
  eq('거부 · 빈 값', validatePhone('').ok, false);
  eq('거부 시 digits 가 빈 문자열이다(원문이 새지 않는다)', validatePhone('abc01012345678xyz').digits, '');

  // payload 에는 원문이 아니라 정규화 숫자열만 실린다
  const p = M.buildAcqCheckPayload({ contactMethod: '전화', contactPhone: '주소: 역삼동, 010-1234-5678' }, 'ACQCK-TEST0001');
  eq('허용 문자 밖 전화는 거부 → payload 연락처가 빈 문자열이다(원문이 새지 않는다)', p.연락처, '');
  eq('거부된 전화번호는 payload 연락처에 원문 부분 문자열이 없다', String(p.연락처).includes('역삼동'), false);
  const p2 = M.buildAcqCheckPayload({ contactMethod: '전화', contactPhone: '010-1234-5678' }, 'ACQCK-TEST0001');
  eq('통과한 전화번호는 payload 에 숫자열로만 실린다', p2.연락처, '01012345678');

  // 선택 화면 — 카카오톡을 고르면 접수 후 채널에서 접수번호를 보내야 한다고 미리 안내한다
  eq('연락 방법 선택 화면에 카카오톡 사전 안내가 있다',
     acqCheckSrc.includes('접수 후 채널에서 접수 번호를 보내 주셔야 합니다.'), true);

  // 완료 화면 — 카카오톡 분기를 도려내 「먼저 연락」 약속이 없는지, 접수번호 전송 안내가 있는지 본다
  const doneHead = 'if (done) {';
  const di = acqCheckSrc.indexOf(doneHead);
  let d = 1, j = di + doneHead.length;
  while (j < acqCheckSrc.length && d > 0) { const ch = acqCheckSrc[j]; if (ch === '{') d++; else if (ch === '}') d--; j++; }
  const doneBlock = acqCheckSrc.slice(di, j);
  const kakaoBranch = (doneBlock.match(/sentMethod === '카카오톡 채널' \? \(([\s\S]*?)\) : \(/) || ['', ''])[1];
  eq('완료 화면에 카카오톡 분기를 찾았다', kakaoBranch.length > 0, true);
  eq('카카오톡 분기에 「자료를 보고 세무사가 연락드립니다」(전화 전용 문구)가 없다',
     kakaoBranch.includes('자료를 보고 세무사가 연락드립니다'), false);
  eq('카카오톡 분기가 「먼저 연락드릴 방법이 없습니다」를 명시한다(먼저 연락을 약속하지 않는다)',
     kakaoBranch.includes('먼저 연락드릴 방법이 없습니다'), true);
  eq('카카오톡 분기에 접수번호 전송 안내(「보내」)가 있다', kakaoBranch.includes('보내'), true);
  eq('카카오톡 분기가 기존 공용 함수 window.jtKakaoUrl() 로 채널 링크를 연다(새 URL 을 짓지 않는다)',
     kakaoBranch.includes('window.jtKakaoUrl()'), true);
  eq('카카오톡 채널 링크가 새 창으로 열린다(target=_blank)', /target="_blank"/.test(kakaoBranch), true);
  eq('카카오톡 채널 링크에 rel=noopener noreferrer 가 있다', /rel="noopener noreferrer"/.test(kakaoBranch), true);
  eq('카카오톡 분기에 cta_click·jtTrackCta·jtEvent·gtag 계측이 없다(새 GA4 이벤트 금지)',
     !/jtTrackCta\(|jtEvent\(|gtag\(/.test(kakaoBranch), true);
}

console.log('\n════ (l) canSubmit 가드 — 접수번호·전화 검증을 요구한다 ════');
{
  eq('접수번호가 없을 때(크립토 미가용) 안내 문구가 있다',
     acqCheckSrc.includes('이 브라우저에서는 접수 번호를 안전하게 만들 수 없습니다'), true);
  const canSubmitLine2 = (acqCheckSrc.match(/const canSubmit = [^\n]*(\n[^\n]*)*?;/) || [''])[0];
  eq('canSubmit 이 receiptId 를 요구한다(크립토 없으면 제출 불가)', /receiptId/.test(canSubmitLine2), true);
  eq('canSubmit 이 전화번호 검증(phoneCheck.ok)을 요구한다', /phoneCheck\.ok/.test(canSubmitLine2), true);
  eq('canSubmit 에 시·군·구 관련 참조가 없다(부류가 없어졌다)', /sigungu/i.test(canSubmitLine2), false);
}

console.log('\n════ (m) R2-F2 — 사후이력 상세는 고정 라벨 체크박스로만 받는다 ════');
{
  eq('postHistoryItems 상태로 배열을 관리한다(ACQ_CHECK_INIT)', acqCheckSrc.includes('postHistoryItems: []'), true);
  eq('ACQ_CHECK_POST_HISTORY_ITEMS 고정 라벨 5종을 정의한다',
     M.ACQ_CHECK_POST_HISTORY_ITEMS, ['수정신고', '경정', '환급', '추가 고지', '모름']);
  eq('체크박스가 ACQ_CHECK_POST_HISTORY_ITEMS 를 순회해 렌더한다',
     /ACQ_CHECK_POST_HISTORY_ITEMS\.map\(\(item\) => \(/.test(acqCheckSrc), true);
  eq('체크박스 onChange 가 togglePostHistoryItem 을 호출한다',
     /onChange=\{\(\) => togglePostHistoryItem\(item\)\}/.test(acqCheckSrc), true);

  // payload — 선택한 라벨만 고정 구분자로 실린다
  const p1 = M.buildAcqCheckPayload({ postHistory: '있음', postHistoryItems: ['수정신고', '경정'] }, 'ACQCK-TEST0001');
  eq('선택한 라벨이 「·」로 이어져 실린다', p1.사후이력_상세, '수정신고·경정');
  const p2 = M.buildAcqCheckPayload({ postHistory: '있음', postHistoryItems: [] }, 'ACQCK-TEST0001');
  eq('아무것도 선택하지 않으면 「—」다', p2.사후이력_상세, '—');
  const p3 = M.buildAcqCheckPayload({ postHistory: '없음', postHistoryItems: ['수정신고'] }, 'ACQCK-TEST0001');
  eq('postHistory 가 「없음」이면 items 가 있어도 「—」다(답 자체와 모순되지 않게)', p3.사후이력_상세, '—');
  // 오염 라벨은 허용 목록으로 걸러진다
  const p4 = M.buildAcqCheckPayload({ postHistory: '있음', postHistoryItems: ['수정신고', '서울 강남구 테헤란로 123'] }, 'ACQCK-TEST0001');
  eq('허용 목록 밖 라벨은 걸러지고 허용된 것만 남는다', p4.사후이력_상세, '수정신고');
}

console.log('\n════ (n) R2 불변식 — buildAcqCheckPayload 오염 문자열 전수 검사 ════');
{
  /* 모든 필드를 오염 문자열로 채운 뒤, 결과 값이 «허용 패턴»에만 맞는지 전수 검사한다.
     허용 패턴: ①선택지 값(화이트리스트 상수들) ②숫자만(^\d+$ 또는 「—」/「모름」)
     ③YYYY-MM-DD 또는 「모름」 ④정규화 전화 숫자열 또는 고정 문자열 ⑤접수번호(그대로 통과)
     ⑥고정 문자열(모름/—/구분값). 접수시각은 시스템 생성 타임스탬프라 별도 패턴으로 본다. */
  const POISON = '서울 강남구 테헤란로 123 101동 202호 900101-1234567 <script>';
  const poisonedF = {
    acqDateType: POISON, acqDate: POISON,
    sido: POISON,
    acquisitionType: POISON, propertyType: POISON, ownership: POISON,
    reportedAcqTax: POISON, reportedEduTax: POISON, reportedFarmTax: POISON, reportedTotal: POISON,
    paidAmount: POISON, paidDate: POISON,
    postHistory: POISON, postHistoryItems: [POISON],
    noticeType: POISON, noticeDate: POISON,
    infoSource: POISON,
    contactMethod: POISON, contactPhone: POISON,
  };
  const receiptId = 'ACQCK-TESTID0001';
  const payload = M.buildAcqCheckPayload(poisonedF, receiptId);

  const dangerousSubstrings = ['테헤란로', '101동', '202호', '900101', '<script>', '강남구'];
  for (const key of Object.keys(payload)) {
    if (key === '_subject') continue; // _subject 는 접수번호만 담는다(별도 확인)
    for (const bad of dangerousSubstrings) {
      eq(`payload.${key} 에 오염 부분 문자열 「${bad}」 가 없다`, String(payload[key]).includes(bad), false);
    }
  }
  for (const bad of dangerousSubstrings) {
    eq(`_subject 에도 오염 부분 문자열 「${bad}」 가 없다`, String(payload._subject).includes(bad), false);
  }

  // 필드별 허용 패턴 전수 검사
  const ALLOWED = {
    구분: (v) => v === 'ACQ_CHECK',
    접수번호: (v) => v === receiptId,
    취득일_구분: (v) => ['잔금일', '등기접수일', '모름'].includes(v),
    취득일: (v) => v === '모름' || /^\d{4}-\d{2}-\d{2}$/.test(v),
    소재지_시도: (v) => v === '모름' || M.ACQ_CHECK_REGIONS.includes(v),
    취득원인: (v) => v === '모름' || M.ACQ_CHECK_ACQUISITION_TYPES.includes(v),
    물건종류: (v) => v === '모름' || M.ACQ_CHECK_PROPERTY_TYPES.includes(v),
    명의와지분: (v) => v === '모름' || M.ACQ_CHECK_OWNERSHIP_TYPES.includes(v),
    신고서_취득세: (v) => v === '—' || /^\d+$/.test(v),
    신고서_지방교육세: (v) => v === '—' || /^\d+$/.test(v),
    신고서_농어촌특별세: (v) => v === '—' || /^\d+$/.test(v),
    신고서_합계만아는경우: (v) => v === '—' || /^\d+$/.test(v),
    실제납부액: (v) => v === '—' || /^\d+$/.test(v),
    납부일: (v) => v === '모름' || /^\d{4}-\d{2}-\d{2}$/.test(v),
    사후이력: (v) => ['없음', '있음', '모름'].includes(v),
    사후이력_상세: (v) => v === '—' || v.split('·').every((x) => M.ACQ_CHECK_POST_HISTORY_ITEMS.includes(x)),
    통지서_종류: (v) => v === '모름' || v === '해당없음' || M.ACQ_CHECK_NOTICE_TYPES.includes(v),
    통지서_수령일: (v) => v === '모름' || /^\d{4}-\d{2}-\d{2}$/.test(v),
    정보출처: (v) => v === '모름' || M.ACQ_CHECK_INFO_SOURCES.includes(v),
    연락방법: (v) => v === '모름' || M.ACQ_CHECK_CONTACT_METHODS.includes(v),
    연락처: (v) => v === '카카오톡 채널로 연락' || /^\d+$/.test(v),
    개인정보동의: (v) => v === '동의함' || v === '미동의',   // R3-F2: 고정 문자열
    국외이전동의: (v) => v === '동의함' || v === '미동의',
    접수시각: (v) => typeof v === 'string' && v.length > 0, // 시스템 생성 — Date().toLocaleString, 사용자 입력 아님
    _subject: (v) => v === `[JT 취득세 점검 접수] ${receiptId}`,
  };
  for (const [key, checker] of Object.entries(ALLOWED)) {
    eq(`payload.${key} 가 허용 패턴에 맞는다 (got=${JSON.stringify(payload[key])})`, checker(payload[key]), true);
  }
  eq('ALLOWED 표가 payload 의 모든 키를 커버한다(빠짐 없음)',
     Object.keys(payload).every((k) => ALLOWED.hasOwnProperty(k)), true);

  // 전화번호 허용 문자 안이지만 자릿수가 틀린 오염(주소 느낌 문자열)도 막힌다
  const p2 = M.buildAcqCheckPayload({ contactMethod: '전화', contactPhone: '02-강남-1234' }, receiptId);
  eq('허용 문자 밖 전화(한글 섞임)는 거부되어 고정 문자열로만 남는다(연락처가 숫자열이 아니다)',
     /^\d+$/.test(p2.연락처), false);
}

console.log('\n════ (R3) 제출 본문은 buildAcqCheckPayload 의 반환값이 «전부»다 — 다른 출처와 합치지 않는다 ════');
{
  /* R3-F1·F3: R2 의 오염 시험은 빌더 반환값만 봤는데, submit 이 그 뒤에 공용 유입정보
     (jtAttributionFields — utm_* 는 URL 에서 온 사용자 제어 문자열, 접수ID 는 미고지 세션 식별자)를
     합치고 있었다. 빌더를 아무리 조여도 «합치는 자리»가 열려 있으면 같은 부류가 되살아난다.
     그래서 시험의 대상을 «최종 본문을 만드는 코드»로 옮긴다. */
  const code = stripComments(acqCheckSrc);
  eq('submit 의 payload 는 buildAcqCheckPayload(f, receiptId) 단독 대입이다',
     /const\s+payload\s*=\s*buildAcqCheckPayload\(\s*f\s*,\s*receiptId\s*\)\s*;/.test(code), true);
  eq('이 파일은 jtAttributionFields 를 호출하지 않는다', /jtAttributionFields\s*\(/.test(code), false);
  eq('payload 에 다른 객체를 펼쳐 넣는 곳은 Web3Forms 본문 1곳뿐이다(access_key·subject·from_name + payload)',
     (code.match(/\.\.\.\s*(?!payload\b)[A-Za-z_$][\w$.]*\s*\(/g) || []).length, 0);
  eq('상태 f 를 통째로 직렬화하지 않는다', /JSON\.stringify\(\s*f\s*[,)]/.test(code) || /\.\.\.\s*f\s*[,}]/.test(code.replace(/\{\s*\.\.\.prev/g, '')), false);

  // 동의 기록(R3-F2)
  const pc = M.buildAcqCheckPayload({ consent: true, consentIntl: true, contactMethod: '카카오톡 채널' }, 'ACQCK-TEST00000000');
  eq('두 동의 기록이 고정 문자열로 실린다', [pc.개인정보동의, pc.국외이전동의], ['동의함', '동의함']);
  const pn = M.buildAcqCheckPayload({ consent: 'yes', consentIntl: 1 }, 'ACQCK-TEST00000000');
  eq('true 가 아닌 값은 동의로 적지 않는다', [pn.개인정보동의, pn.국외이전동의], ['미동의', '미동의']);

  // 전화 허용 문자(R3-F4) — 점은 선언한 집합에 없다
  eq('010.1234.5678 은 거부된다', M.validateAcqCheckPhone('010.1234.5678').ok, false);
  eq('010-1234-5678 은 통과한다', M.validateAcqCheckPhone('010-1234-5678'), { ok: true, digits: '01012345678' });

  // 고지와 실제 전송의 일치(R3-F3)
  eq('동의 문구가 유입 경로 정보를 보낸다고 적지 않는다', /유입 매체|첫 방문 경로|제출 위치/.test(code), false);
  eq('처리방침이 취득세 점검 접수에는 유입 경로 정보를 보내지 않는다고 적는다',
     /취득세 점검 접수는 접수번호\(임의 생성\)와 접수 시각만 함께 전송하며 유입 경로 정보는 보내지 않습니다/.test(legalSrc), true);
}

console.log('\n════ (R4) 제출 가드·전송 객체·메일 본문을 «실행해서» 검사한다 ════');
{
  /* R4-F2: 소스 정규식은 Object.assign(payload, f) 나 {...payload, ...rawForm} 같은 변형을 통과시킨다.
     그래서 submit 이 쓰는 세 순수 함수를 실제로 실행해 결과를 본다 + submit 이 그 셋 말고는
     전송 내용을 만들지 않음을 확인한다. */
  const RID = 'ACQCK-TEST00000000';
  const DIRTY = '서울 강남구 테헤란로 123 101동 202호 900101-1234567';
  const dirty = { acqDateType: DIRTY, acqDate: DIRTY, sido: DIRTY, acquisitionType: DIRTY, propertyType: DIRTY, ownership: DIRTY,
    reportedAcqTax: DIRTY, reportedEduTax: DIRTY, reportedFarmTax: DIRTY, reportedTotal: DIRTY, paidAmount: DIRTY, paidDate: DIRTY,
    postHistory: DIRTY, postHistoryItems: [DIRTY], noticeType: DIRTY, noticeDate: DIRTY, infoSource: DIRTY,
    contactMethod: '전화', contactPhone: '010-1234-5678', consent: true, consentIntl: true, extraField: DIRTY };
  const req = M.buildAcqCheckRequest(dirty, RID, 'KEY');
  const base = M.buildAcqCheckPayload(dirty, RID);
  const strip = (o) => { const c = { ...o }; delete c.접수시각; return c; };   // 시각은 호출마다 다를 수 있다
  eq('전송 객체의 키 = 빌더 키 + access_key·subject·from_name',
     Object.keys(req).sort(), Object.keys(base).concat(['access_key', 'subject', 'from_name']).sort());
  eq('전송 객체의 값이 빌더 반환값과 같다', strip(Object.fromEntries(Object.entries(req).filter(([k]) => !['access_key', 'subject', 'from_name'].includes(k)))), strip(base));
  const ser = JSON.stringify(req) + '\n' + M.buildAcqCheckMailBody(dirty, RID);
  for (const frag of ['테헤란로', '101동', '900101', '강남구', 'extraField']) {
    eq(`오염 문자열 조각 「${frag}」 이 전송 객체·메일 본문 어디에도 없다`, ser.includes(frag), false);
  }
  const mailKeys = M.buildAcqCheckMailBody(dirty, RID).split('\n').map((l) => l.split(': ')[0]).sort();
  eq('메일 본문의 키 = 빌더 키', mailKeys, Object.keys(base).sort());

  // 동의 네 조합 × 연락 방법 — 실제 호출 결과로 검증
  const ok = { consent: true, consentIntl: true, contactMethod: '카카오톡 채널', contactPhone: '' };
  eq('두 동의 + 카카오톡 → 제출 가능', M.acqCheckCanSubmit(ok, RID, false), true);
  eq('수집 동의만 → 불가', M.acqCheckCanSubmit({ ...ok, consentIntl: false }, RID, false), false);
  eq('국외 이전 동의만 → 불가', M.acqCheckCanSubmit({ ...ok, consent: false }, RID, false), false);
  eq('동의 없음 → 불가', M.acqCheckCanSubmit({ ...ok, consent: false, consentIntl: false }, RID, false), false);
  eq("동의가 true 가 아닌 참 같은 값('yes') → 불가", M.acqCheckCanSubmit({ ...ok, consent: 'yes' }, RID, false), false);
  eq('접수번호 없음 → 불가', M.acqCheckCanSubmit(ok, null, false), false);
  eq('전송 중 → 불가(이중 제출 방지)', M.acqCheckCanSubmit(ok, RID, true), false);
  eq('연락 방법 미선택 → 불가', M.acqCheckCanSubmit({ ...ok, contactMethod: '' }, RID, false), false);
  eq('허용 목록 밖 연락 방법 → 불가', M.acqCheckCanSubmit({ ...ok, contactMethod: '이메일' }, RID, false), false);
  eq('전화 + 형식 틀림 → 불가', M.acqCheckCanSubmit({ ...ok, contactMethod: '전화', contactPhone: '주소: 역삼동 010-1234-5678' }, RID, false), false);
  eq('전화 + 형식 맞음 → 가능', M.acqCheckCanSubmit({ ...ok, contactMethod: '전화', contactPhone: '010-1234-5678' }, RID, false), true);

  // submit 은 위 함수들 말고는 전송 내용을 만들지 않는다
  const code = stripComments(acqCheckSrc);
  const submitFn = (code.match(/const submit = async \(\) => \{([\s\S]*?)\n  \};/) || ['', ''])[1];
  eq('fetch 본문은 buildAcqCheckRequest 의 직렬화다', /body:\s*JSON\.stringify\(buildAcqCheckRequest\(frozen, receiptId, w3fKey\)\)/.test(submitFn), true);
  eq('메일 본문은 buildAcqCheckMailBody 다', /const body = buildAcqCheckMailBody\(frozen, receiptId\);/.test(submitFn), true);
  eq('submit 안에 Object.assign 이 없다', /Object\.assign/.test(submitFn), false);
  eq('submit 안에 객체 펼침(...)이 없다', /\.\.\./.test(submitFn), false);
  eq('submit 안에서 JSON.stringify 는 1번뿐이다', (submitFn.match(/JSON\.stringify\(/g) || []).length, 1);
  eq('canSubmit 은 acqCheckCanSubmit 의 결과다', /const canSubmit = acqCheckCanSubmit\(f, receiptId, submitting\);/.test(code), true);

  // R4-F1: 완료 화면은 «보낸» 연락 방법을 보고, 전송 중에는 폼 값이 바뀌지 않는다
  eq('완료 화면 분기가 sentMethod 를 본다', /sentMethod === '카카오톡 채널'/.test(code), true);
  const doneIdx = code.indexOf('if (done) {');
  eq('완료 화면이 현재 입력(f.contactMethod)을 보지 않는다', /f\.contactMethod/.test(code.slice(doneIdx, doneIdx + 3000)), false);
  eq('성공 시 보낸 연락 방법을 저장한다', /setSentMethod\(payload\.연락방법\);\s*\n\s*setDone\(true\);/.test(code), true);
  eq('전송 중에는 상태 갱신을 막는다(setAns)', /submittingRef\.current \? prev :/.test(code), true);
  eq('전송 중에는 체크박스 토글도 막는다', /if \(submittingRef\.current\) return prev;/.test(code), true);
}

console.log('\n════════════════════');
if (fails) {
  console.error(`tests_acq_check: FAIL ${fails}`);
  process.exit(1);
}
console.log('tests_acq_check: PASS');
process.exit(0);

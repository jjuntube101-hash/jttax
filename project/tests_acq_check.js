'use strict';
/* 「내가 낸 취득세 점검」 접수 회귀 — 260921

   설계서(D:\클로드\브랜딩\세무법인\홈페이지\취득세고도화_260921\02_파생계산기_설계.md) §2·§4 를
   화면(ReportAcqCheck.jsx)·허브(build-commercial.mjs → acquisition-tax/index.html)가 그대로
   지키는지 본다.

     (a) 새 컴포넌트 소스·허브 링크 문구에 설계서 §4 금지 문구 + 「무료」가 없다
     (b) 결과(접수 완료) 화면 소스에 금액·차액을 그리는 코드가 없다 — 이 화면은 재계산기가 아니다
     (c) 동의(수집·이용 + 국외이전) 없이는 제출 함수가 호출되지 않는다
     (d) 제출 본문(payload)에 주소 상세(동·호·지번)·주민등록번호 필드가 없다
     (e) 이 파일에서 booking_submit·gtag·jtEvent·jtTrackCta 가 전혀 발화되지 않는다
         (관찰 기간 260921~1003 — 기존 지표를 오염시키지 않는다)
     (f) 표시의무 문구(「제이티 세무법인 · 광고 담당 세무사 이현준」)가 있다
     (g) 접수 번호가 순번이 아니다 — 두 번 만들면 다르고, 길이·문자 범위가 고정 형태다

   ⚠️ 주석 안의 「무료를 쓰지 않는다」같은 «규칙 설명»까지 금지어로 잡으면 위양성이 난다.
      그래서 (a)는 블록 주석을 걷어낸 뒤 검사한다. */
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'src');
const ACQ_CHECK = path.join(SRC, 'ReportAcqCheck.jsx');
const ACQUISITION = path.join(SRC, 'ReportAcquisition.jsx');
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
const hubHtml = fs.existsSync(HUB_HTML) ? fs.readFileSync(HUB_HTML, 'utf8') : '';
const hubBuilderSrc = fs.readFileSync(HUB_BUILDER, 'utf8');
const hubDataSrc = fs.readFileSync(HUB_DATA, 'utf8');

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

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
}

console.log('\n════ (d) 제출 본문에 주소 상세·주민번호 필드가 없다 ════');
{
  const payloadBlock = (acqCheckSrc.match(/const payload = \{([\s\S]*?)\n    \};/) || ['', ''])[1];
  eq('payload 객체를 찾았다', payloadBlock.length > 0, true);
  for (const banned of ['주민등록번호', '주민번호', '동·호', '동/호', '지번', '상세주소', 'residentNumber', 'unitNumber']) {
    eq(`payload 에 「${banned}」 가 없다`, payloadBlock.includes(banned), false);
  }
  eq('payload 는 시·군·구까지만 받는다(소재지_시군구 키)', payloadBlock.includes('소재지_시군구'), true);
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
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', genIdChunk + '\n;return acqCheckGenId;')({});
  let noCryptoValue;
  let threw = false;
  try { noCryptoValue = fn(); } catch (_e) { threw = true; }
  eq('crypto 없음 · 값을 돌려주지 않는다(null 또는 예외)', threw || noCryptoValue == null, true);

  // crypto.getRandomValues 가 있는 정상 경로는 여전히 「추측하기 어려운」 성질을 지킨다
  const fakeWindow = {
    Uint8Array: Uint8Array,
    crypto: { getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; } },
  };
  const fn2 = new Function('window', genIdChunk + '\n;return acqCheckGenId;')(fakeWindow);
  const c = fn2();
  const d = fn2();
  eq('crypto 경로 · 접두사 ACQCK-', c.indexOf('ACQCK-'), 0);
  eq('crypto 경로 · 두 번 만들면 서로 다르다 (순번이면 예측 가능해진다)', c !== d, true);
  eq('crypto 경로 · 길이가 12자를 넘는다 (추측하기 어려운 길이)', c.length > 12, true);
  eq('crypto 경로 · 숫자만으로 된 순번 형태가 아니다', /^\d+$/.test(c.replace('ACQCK-', '')), false);
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

console.log('\n════ (j) R1-F1 — 시·군·구 자유입력란 검증(순수 함수) ════');
{
  const ast = parse(acqCheckSrc, { sourceType: 'script', plugins: ['jsx'] });
  let chunk = '';
  for (const n of ast.program.body) {
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'validateAcqCheckSigungu') {
      chunk = acqCheckSrc.slice(n.start, n.end);
    }
  }
  eq('validateAcqCheckSigungu 최상위 선언을 찾았다', chunk.length > 0, true);
  const constMatch = acqCheckSrc.match(/const ACQ_CHECK_SIGUNGU_ERROR = [^\n]*;/);
  eq('ACQ_CHECK_SIGUNGU_ERROR 상수를 찾았다', !!constMatch, true);
  // eslint-disable-next-line no-new-func
  const validate = new Function(constMatch[0] + '\n' + chunk + '\n;return validateAcqCheckSigungu;')();

  for (const v of ['성남시 분당구', '수원시', '강남구', '']) {
    eq(`통과 · 「${v || '(빈 값)'}」`, validate(v).ok, true);
  }
  eq('통과 · 앞뒤 공백 제거 후 판정 · 「  강남구  」', validate('  강남구  ').ok, true);

  for (const v of ['분당구 정자동 123', '강남구 테헤란로 1', '101동 202호', '래미안아파트']) {
    eq(`거부 · 「${v}」`, validate(v).ok, false);
  }
  eq('거부 · 16자(길이 초과, 표지·숫자 없음)', validate('x'.repeat(15) + '구').ok, false);
  eq('거부 · 전각 숫자가 섞이면(강남１구)', validate('강남１구').ok, false);
  eq('거부 시 안내 메시지를 준다', validate('101동 202호').message,
     '시·군·구까지만 적어 주세요(예: 성남시 분당구). 동·호수와 도로명은 받지 않습니다.');
}

console.log('\n════ (k) R1-F2 — 전화번호 형식 검증 + 카카오톡 「먼저 연락」 약속 금지 ════');
{
  const ast = parse(acqCheckSrc, { sourceType: 'script', plugins: ['jsx'] });
  let chunk = '';
  for (const n of ast.program.body) {
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'validateAcqCheckPhone') {
      chunk = acqCheckSrc.slice(n.start, n.end);
    }
  }
  eq('validateAcqCheckPhone 최상위 선언을 찾았다', chunk.length > 0, true);
  // eslint-disable-next-line no-new-func
  const validatePhone = new Function(chunk + '\n;return validateAcqCheckPhone;')();

  eq('통과 · 010-1234-5678', validatePhone('010-1234-5678'), true);
  eq('통과 · 0212345678 (9자리, 0 시작)', validatePhone('0212345678'), true);
  eq('거부 · 01012345 (8자리)', validatePhone('01012345'), false);
  eq('거부 · 10-1234-5678 (0으로 시작하지 않음)', validatePhone('10-1234-5678'), false);
  eq('거부 · 010-1234-56789 (12자리)', validatePhone('010-1234-56789'), false);
  eq('거부 · 빈 값', validatePhone(''), false);
  eq('거부 · 숫자가 없는 문자열', validatePhone('전화없음'), false);

  // 선택 화면 — 카카오톡을 고르면 접수 후 채널에서 접수번호를 보내야 한다고 미리 안내한다
  eq('연락 방법 선택 화면에 카카오톡 사전 안내가 있다',
     acqCheckSrc.includes('접수 후 채널에서 접수 번호를 보내 주셔야 합니다.'), true);

  // 완료 화면 — 카카오톡 분기를 도려내 「먼저 연락」 약속이 없는지, 접수번호 전송 안내가 있는지 본다
  const doneHead = 'if (done) {';
  const di = acqCheckSrc.indexOf(doneHead);
  let d = 1, j = di + doneHead.length;
  while (j < acqCheckSrc.length && d > 0) { const ch = acqCheckSrc[j]; if (ch === '{') d++; else if (ch === '}') d--; j++; }
  const doneBlock = acqCheckSrc.slice(di, j);
  const kakaoBranch = (doneBlock.match(/f\.contactMethod === '카카오톡 채널' \? \(([\s\S]*?)\) : \(/) || ['', ''])[1];
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

console.log('\n════ (l) R1-F4 — 크립토 없으면 폼 레벨에서 접수를 막는다 ════');
{
  eq('접수번호가 없을 때(크립토 미가용) 안내 문구가 있다',
     acqCheckSrc.includes('이 브라우저에서는 접수 번호를 안전하게 만들 수 없습니다'), true);
  const canSubmitLine2 = (acqCheckSrc.match(/const canSubmit = [^\n]*(\n[^\n]*)*?;/) || [''])[0];
  eq('canSubmit 이 receiptId 를 요구한다(크립토 없으면 제출 불가)', /receiptId/.test(canSubmitLine2), true);
  eq('canSubmit 이 시·군·구 검증(sigunguCheck.ok)을 요구한다', /sigunguCheck\.ok/.test(canSubmitLine2), true);
  eq('canSubmit 이 전화번호 검증(phoneOk)을 요구한다', /phoneOk/.test(canSubmitLine2), true);
}

console.log('\n════════════════════');
if (fails) {
  console.error(`tests_acq_check: FAIL ${fails}`);
  process.exit(1);
}
console.log('tests_acq_check: PASS');
process.exit(0);

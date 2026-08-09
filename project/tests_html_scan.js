/* html-scan.js 자체 검증 — «검사 도구가 맞는가»를 먼저 본다.
   여기 실린 고정값(fixture)은 대부분 Codex 교차검토가 실제로 제시한 회귀 코드다.
   정규식 게이트가 이것들에 4라운드 연속 뚫렸다 (260809 R2~R5). */
'use strict';
const { tokenize, parseAttrs, elementEnd, textBetween, inlineScripts, eventHandlers } = require('./_shared/html-scan.js');

let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`      got=${JSON.stringify(got)}  want=${JSON.stringify(want)}`);
};

console.log('\n════ 속성 파싱 ════\n');
eq('큰따옴표', [...parseAttrs(' type="checkbox" name="a"')], [['type', 'checkbox'], ['name', 'a']]);
eq('작은따옴표', [...parseAttrs(" type='text'")], [['type', 'text']]);
eq('인용부호 없음 (R5 P0)', [...parseAttrs(' onclick=alert(1)')], [['onclick', 'alert(1)']]);
eq('값 없는 속성', [...parseAttrs(' required disabled')], [['required', ''], ['disabled', '']]);
eq('등호 주변 공백·대문자', [...parseAttrs(' TYPE = "CHECKBOX"')], [['type', 'CHECKBOX']]);
eq('data-name 이 name 을 가리지 않음',
  parseAttrs(' data-name="office" name="주민등록번호"').get('name'), '주민등록번호');
eq('자기닫힘 슬래시가 값에 섞이지 않음', [...parseAttrs(' name="a" /')], [['name', 'a']]);
/* ⚠️ 중복 속성은 «앞»이 이긴다 (HTML 명세: duplicate attribute 무시). Map.set 으로 덮어쓰면
   실제로 실행되는 앞의 값을 못 보고 뒤의 무해한 값만 보게 된다 — 음성 대조군 ㋒ 가 적발. */
eq('중복 속성은 앞이 이긴다',
  parseAttrs(` onclick="this.form.submit()" class="x" onclick="jtTrackCta('a','b')"`).get('onclick'),
  'this.form.submit()');
eq('중복 name 도 앞이 이긴다', parseAttrs(' name="진짜" name="가짜"').get('name'), '진짜');

console.log('\n════ 주석 · 원시텍스트 ════\n');
{
  /* R2: 주석 안의 마크업은 «태그가 아니다» */
  const t = tokenize('<!-- <input name="개인정보동의" required> --><p>x</p>');
  eq('주석 안 <input> 은 태그로 잡히지 않음', t.filter(x => x.type === 'open' && x.name === 'input').length, 0);
  eq('주석 뒤 <p> 는 정상 인식', t.filter(x => x.type === 'open' && x.name === 'p').length, 1);
}
{
  /* R5 P0: JS 문자열 속 <!-- --> 로 실행 코드를 «검사에서만» 지울 수 없어야 한다 */
  const html = `<script>
const marker = '<!--';
document.querySelector('form').noValidate = true;
const end = '-->';
</script>`;
  const js = inlineScripts(tokenize(html));
  eq('JS 문자열 속 <!-- 가 코드를 삼키지 않음', /querySelector/.test(js) && /noValidate/.test(js), true);
}
{
  /* R3: `</script/>` 도 종료 태그다 */
  const t = tokenize(`<script>var a='<input name="개인정보동의" required>';</script/><form></form>`);
  eq('</script/> 이후는 원시텍스트가 아님', t.filter(x => x.type === 'open' && x.name === 'form').length, 1);
  eq('script 안 문자열은 input 태그가 아님', t.filter(x => x.type === 'open' && x.name === 'input').length, 0);
}
{
  /* R4 P2: 주석 처리된 script 는 실행 코드가 아니다 */
  eq('주석 처리된 script 는 인라인 JS 아님', inlineScripts(tokenize('<!-- <script>const form={};</script> -->')), '');
  /* JSON-LD 는 데이터지 코드가 아니다 */
  eq('JSON-LD 는 인라인 JS 아님', inlineScripts(tokenize('<script type="application/ld+json">{"form":1}</script>')), '');
  eq('평범한 인라인 JS 는 잡힌다', inlineScripts(tokenize('<script>var x=1;</script>')).trim(), 'var x=1;');
}
{
  /* R5 P0: «닫히지 않은» <script src> 도 잡아야 한다 */
  const t = tokenize('<p>x</p><script src="https://evil.example/p.js">');
  const srcs = t.filter(x => x.type === 'open' && x.name === 'script').map(x => x.attrs.get('src'));
  eq('닫히지 않은 <script src> 수집', srcs, ['https://evil.example/p.js']);
}

console.log('\n════ 이벤트 핸들러 ════\n');
{
  const h = eventHandlers(tokenize(`<button onclick=alert(1)>a</button><a onClick="jtTrackCta('k','v')">b</a>`));
  eq('인용부호 없는 on* 수집 (R5 P0)', h[0], { attr: 'onclick', value: 'alert(1)', tag: 'button' });
  eq('대문자 onClick 도 수집', h[1].attr, 'onclick');
  eq('주석 안 on* 는 수집 안 함', eventHandlers(tokenize('<!-- <b onclick="x()"></b> -->')).length, 0);
}

console.log('\n════ R6 회귀 — 브라우저와 어긋나던 것들 ════\n');
{
  /* 아래 기대값은 전부 브라우저 DOMParser 로 «직접 확인»한 것이다 (260809). */
  const { isExecutableScriptType, domTouches, externalScriptSrcs } = require('./_shared/html-scan.js');
  // ① 따옴표 «안»의 > 는 태그 끝이 아니다
  eq('따옴표 안 > 가 속성을 자르지 않음',
    eventHandlers(tokenize(`<button onclick="jtTrackCta('a','b')>alert(1)">x</button>`))[0].value,
    `jtTrackCta('a','b')>alert(1)`);
  // ② <script/> 는 자기닫힘이 아니라 원시텍스트를 «연다»
  eq('<script/> 뒤 내용이 본문으로 들어감',
    inlineScripts(tokenize('<script/>var z=1</script><p>뒤</p>')).trim(), 'var z=1');
  eq('<script/> 뒤의 <p> 는 정상 태그',
    tokenize('<script/>var z=1</script><p>뒤</p>').filter(t => t.type === 'open' && t.name === 'p').length, 1);
  // ③ MIME essence — 파라미터가 붙어도 실행되는 JS 다
  /* ⚠️ 이 기대값을 내가 «틀리게» 고정했었다 (R6 → R7 정정). script 의 type «속성»은
     MIME essence 와 정확히 일치해야 실행된다 — 파라미터가 붙으면 실행되지 않는다.
     브라우저 실측(script 를 문서에 넣어 평가 여부 확인, 260809):
       text/javascript                  → 실행
       text/javascript; charset=utf-8   → 실행 안 됨
       application/x-ecmascript         → 실행   (내 목록에 없어서 놓치던 것)
       text/x-javascript                → 실행   (〃) */
  eq('파라미터 붙은 type 은 실행 안 됨', isExecutableScriptType('text/javascript; charset=utf-8'), false);
  eq('공백 없는 파라미터도 실행 안 됨', isExecutableScriptType('text/javascript;charset=utf-8'), false);
  eq('application/x-ecmascript 는 실행', isExecutableScriptType('application/x-ecmascript'), true);
  eq('text/x-javascript 는 실행', isExecutableScriptType('text/x-javascript'), true);
  eq('text/plain 은 실행 아님', isExecutableScriptType('text/plain'), false);
  eq('동적 이름 접근은 그 자체를 결함으로', domTouches("window['a'+'b']['c'+'d']()"), ['동적 속성 접근(정적 확인 불가)']);
  eq('eval 탐지', domTouches('eval("x")'), ['eval(문자열 실행)']);
  eq('new Function 탐지', domTouches('new Function("x")()'), ['Function(문자열 실행)']);
  eq('배열 첨자는 통과', domTouches('var a=[1,2]; a[0]'), []);
  eq('JSON-LD 는 실행 아님', isExecutableScriptType('application/ld+json'), false);
  eq('type 없으면 실행', isExecutableScriptType(undefined), true);
  eq('src 목록에서 JSON-LD 제외',
    externalScriptSrcs(tokenize('<script type="application/ld+json" src="a.json"></script><script src="b.js"></script>')), ['b.js']);
  // ④ 단어 검사로는 못 잡던 대괄호 우회 — AST 로 잡는다
  eq("document.forms[0]['submit']() 탐지", domTouches("document.forms[0]['submit']()").sort(), ['document', 'forms', 'submit']);
  eq('this.form.submit() 탐지', domTouches('this.form.submit()').sort(), ['submit']);
  eq('GA 부트스트랩은 깨끗',
    domTouches('window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}'), []);
  eq('추적 호출은 깨끗', domTouches("jtTrackCta('kakao','desk_broker_top')"), []);
  /* ⑤ 중첩 label — 코덱스 R6 는 「브라우저가 앞 label 을 닫는다」고 했으나 실측은 반대였다.
     DOMParser 확인: `<label>A<label>B</label>C</label>` → 바깥 label 의 textContent 는 'ABC'.
     (암묵 종료가 일어나는 것은 <p>·<li> 같은 요소이고 label 은 아니다) 기대값을 유지한다. */
}

console.log('\n════ 요소 경계 (R5 P0 — label 밖 고지가 안으로 합쳐지던 것) ════\n');
{
  const html = '<p>바깥 고지</p><label><input name="c"><span>안쪽</span></label><p>뒤쪽</p>';
  const t = tokenize(html);
  const li = t.findIndex(x => x.type === 'open' && x.name === 'label');
  const end = elementEnd(t, li);
  eq('label 안 글자만 (바깥 제외)', textBetween(t, li, end).trim(), '안쪽');
}
{
  /* 중첩 label 에서도 «자기» 짝에서 닫혀야 한다 */
  const t = tokenize('<label>A<label>B</label>C</label>D');
  const li = t.findIndex(x => x.type === 'open' && x.name === 'label');
  eq('중첩 label 경계', textBetween(t, li, elementEnd(t, li)).replace(/\s/g, ''), 'ABC');
}
{
  /* void 요소는 스택에 쌓이지 않는다 — <input> 이 label 을 삼키면 안 된다 */
  const t = tokenize('<label><input required>텍스트</label>밖');
  const li = t.findIndex(x => x.type === 'open' && x.name === 'label');
  eq('void 요소가 경계를 망가뜨리지 않음', textBetween(t, li, elementEnd(t, li)).trim(), '텍스트');
}

console.log('\n════════════════════');
console.log(`실패 ${fail}건`);
process.exit(fail ? 1 : 0);

/* @jsx React.createElement */
/* JT 리포트 — 허브 + 공통 레이아웃 + 라우팅 + 면책 고지 */

const { useState: useReportState, useEffect: useReportEffect, useMemo: useReportMemo } = React;

/* ══════════════════════════════════════════════════════════════════════════
   숫자 입력 정규화 — «전 계산기 공용». 이 파일이 Report*.jsx 중 가장 먼저 로드된다.

   ⚠️ 「숫자가 아닌 문자를 전부 지운다」(`replace(/[^0-9]/g,'')`)는 방식은 **자릿수를 바꾼다**:
        "50,000,000.00" → 소수점만 사라져 5000000000  (100배)
        "18e8"          → 188                        (자릿수 붕괴)
        "１２３"(전각)   → ''                         (붙여넣기가 통째로 사라짐)
        "-100"          → 100                        (부호만 조용히 삭제)
      엑셀·거래소 명세·부동산 사이트에서 복사해 붙이면 실제로 일어나는 입력들이다.
      260805 개편안·가상자산 계산기에서 처음 잡았고, 260806 전수 점검 결과 **나머지
      계산기 7종도 같은 코드**였다 — 그래서 규칙을 여기 한 곳에 두고 전부가 재사용한다.

   반환: 정규화된 문자열 / '' (빈 입력) / **null = 「받지 않는다」**
         (호출부는 null 이면 값을 갱신하지 않는다 — 자릿수가 바뀐 값을 저장하느니 무시한다)
   ══════════════════════════════════════════════════════════════════════════ */
/* ⚠️ 구분자를 «위치 검증 없이» 지우면 여전히 자릿수가 바뀐다 (260806 Codex E P1):
     "1,2" → 12 · "1원2" → 12 · "12\n34" → 1234 · "1 2" → 12
   그래서 ①먼저 «전체 형태»를 확인하고 ②통과한 것만 구분자를 걷어낸다.
   허용 형태: 구분자 없는 숫자 / 정확한 천단위 표기(1,234,567) / 끝에 「원」·「₩」 한 번.
   앞뒤 공백은 붙여넣기에서 흔하므로 허용하되, 숫자 «사이»의 공백은 거부한다. */
window.jtMoneyDigits = function (raw) {
  var s = String(raw == null ? '' : raw).normalize('NFKC').trim();
  if (s === '') return '';
  s = s.replace(/^₩\s*/, '').replace(/\s*원$/, '').trim();       // 통화기호는 «양 끝»에서만
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?$/.test(s)) return null;
  var digits = s.replace(/,/g, '').split('.')[0].replace(/^0+(?=\d)/, '');
  return Number.isSafeInteger(Number(digits)) ? digits : null;  // 원 미만 절사·정수 정밀도 보장
};
/* 기간·비율·면적처럼 «소수»를 허용하는 칸 — 소수점 하나까지 살린다 */
window.jtDecimalInput = function (raw) {
  var s = String(raw == null ? '' : raw).normalize('NFKC').trim();
  if (s === '') return '';
  if (!/^\d*(?:\.\d*)?$/.test(s)) return null;   // 구분자·공백을 «지우지 않고» 거부한다
  return s;
};
/* 문항 입력 공용 핸들러 — `money` 여부로 갈라 정규화하고, 거부되면 값을 그대로 둔다 */
window.jtSetNumericAns = function (setAns, id, raw, isMoney) {
  var v = isMoney ? window.jtMoneyDigits(raw) : window.jtDecimalInput(raw);
  if (v !== null) setAns(id, v);
};

/* 원 단위 표시와 편집을 한 곳에서 처리한다. 저장/API 값은 쉼표 없는 정수 문자열이다.
   붙여넣기는 전체 형식을 검사하고, 직접 편집은 화면의 쉼표를 제거한 뒤 검증한다.
   선택 영역은 숫자 자릿수로 복원하여 중간 삽입·삭제 때 커서가 끝으로 뛰지 않는다. */
window.jtFormatMoneyInput = function (raw) {
  var digits = window.jtMoneyDigits(raw);
  return digits === null ? String(raw == null ? '' : raw) : digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};
window.jtMoneyCaret = function (formatted, digitCount) {
  if (digitCount <= 0) return 0;
  var seen = 0;
  for (var i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i]) && ++seen >= digitCount) return i + 1;
  }
  return formatted.length;
};
function JTNumericInput({ money = true, value, onChange, parseMoney, ...props }) {
  const [error, setError] = useReportState('');
  const [fractionDraft, setFractionDraft] = useReportState(null);
  const shown = money && fractionDraft !== null ? fractionDraft :
    (money ? window.jtFormatMoneyInput(value) : (value == null ? '' : String(value)));
  const accept = function (event, raw, digitCount) {
    var normalized = money ? window.jtMoneyDigits(raw) : window.jtDecimalInput(raw);
    if (normalized === null && money && parseMoney && /[억만]/.test(raw) && !/[,，]/.test(raw)) {
      var parsed = parseMoney(raw);
      if (parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0) normalized = String(parsed);
    }
    if (normalized === null) {
      setError(money ? '원 단위 숫자를 넣어 주세요. 음수·지수표기는 입력할 수 없습니다.' : '숫자와 소수점 하나만 입력해 주세요.');
      event.target.value = shown;
      return;
    }
    setError('');
    setFractionDraft(null);
    const el = event.target;
    // 기존 계산기 핸들러에는 정규화된 값을 전달한다. 계산 금액의 단위는 바꾸지 않는다.
    el.value = normalized;
    if (onChange) onChange(event);
    if (!money) return;
    const formatted = window.jtFormatMoneyInput(normalized);
    el.value = formatted;
    const caret = window.jtMoneyCaret(formatted, digitCount);
    if (typeof el.setSelectionRange === 'function') {
      el.setSelectionRange(caret, caret);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () {
        if (el.value === formatted && (typeof document === 'undefined' || document.activeElement === el)) el.setSelectionRange(caret, caret);
      });
    }
  };
  const change = function (event) {
    const raw = event.target.value;
    const position = event.target.selectionStart == null ? raw.length : event.target.selectionStart;
    const digitsBefore = raw.slice(0, position).normalize('NFKC').replace(/[^0-9]/g, '').length;
    // 직접 편집하면 1,234 → 1,9234 처럼 구분자의 위치가 일시적으로 달라질 수 있다.
    const native = event.nativeEvent || event;
    const inputType = native.inputType || '';
    // 자동완성·일부 브라우저의 붙여넣기는 여러 글자의 insertText로 들어온다.
    const bulkInsert = /^(?:insertFromPaste|insertFromDrop|insertReplacementText)$/.test(inputType) ||
      (typeof native.data === 'string' && native.data.length > 1);
    var edited = money && !bulkInsert ? raw.replace(/,/g, '') : raw;
    var caretDigits = digitsBefore;
    // 직접 소수를 입력할 때 점을 즉시 지우면 뒤의 소수 숫자가 정수에 붙는다.
    // 편집 중인 소수부를 화면에 보존하고, 입력을 떠날 때 원 미만을 절사한다.
    if (money && !bulkInsert && edited.normalize('NFKC').indexOf('.') >= 0 &&
        (window.jtMoneyDigits(edited) !== null || /^\.\d*$/.test(edited.normalize('NFKC')))) {
      setError('');
      const draft = raw.normalize('NFKC').replace(/^\./, '0.');
      setFractionDraft(draft);
      // Enter로 다음 문항에 가거나 제출하면 blur가 없을 수 있으므로 정수부는 즉시 동기화한다.
      const el = event.target;
      const selectionStart = el.selectionStart;
      const selectionEnd = el.selectionEnd;
      el.value = window.jtMoneyDigits(draft.replace(/,/g, ''));
      if (onChange) onChange(event);
      el.value = draft;
      if (typeof el.setSelectionRange === 'function' && selectionStart !== null) {
        const offset = draft.length - raw.length;
        el.setSelectionRange(selectionStart + offset, selectionEnd + offset);
      }
      return;
    }
    // 구분자만 지운 Backspace/Delete도 인접 숫자를 지우도록 한다.
    if (money && /^deleteContent(?:Backward|Forward)$/.test(inputType) &&
        raw.length < shown.length && edited === shown.replace(/,/g, '')) {
      const index = inputType === 'deleteContentBackward' ? digitsBefore - 1 : digitsBefore;
      if (index >= 0 && index < edited.length) {
        edited = edited.slice(0, index) + edited.slice(index + 1);
        caretDigits = inputType === 'deleteContentBackward' ? Math.max(0, digitsBefore - 1) : digitsBefore;
      }
    }
    accept(event, edited, caretDigits);
  };
  const paste = function (event) {
    if (!money) return;
    event.preventDefault();
    const pasted = event.clipboardData.getData('text');
    var normalized = window.jtMoneyDigits(pasted);
    if (normalized === null && parseMoney && /[억만]/.test(pasted) && !/[,，]/.test(pasted)) {
      const parsed = parseMoney(pasted);
      if (parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0) normalized = String(parsed);
    }
    if (normalized === null) { setError('붙여넣은 금액을 확인해 주세요. 예: 1,234,567원'); return; }
    const el = event.target;
    const start = el.selectionStart == null ? 0 : el.selectionStart;
    const end = el.selectionEnd == null ? el.value.length : el.selectionEnd;
    const left = el.value.slice(0, start).replace(/,/g, '');
    const right = el.value.slice(end).replace(/,/g, '');
    accept(event, left + normalized + right, left.length + normalized.length);
  };
  const blur = function (event) {
    if (money && fractionDraft !== null) {
      const integer = fractionDraft.normalize('NFKC').split('.')[0].replace(/[^0-9]/g, '');
      accept(event, fractionDraft, integer.length);
    }
    if (props.onBlur) props.onBlur(event);
  };
  const keyDown = function (event) {
    if (event.key === 'Enter' && money && fractionDraft !== null) {
      const integer = fractionDraft.normalize('NFKC').split('.')[0].replace(/[^0-9]/g, '');
      accept(event, fractionDraft, integer.length);
    }
    if (props.onKeyDown) props.onKeyDown(event);
  };
  return React.createElement(React.Fragment, null,
    React.createElement('input', { ...props, type: 'text', inputMode: money ? 'numeric' : 'decimal',
      value: shown, onChange: change, onPaste: paste, onBlur: blur, onKeyDown: keyDown, 'aria-invalid': error ? true : undefined }),
    error && React.createElement('span', { role: 'alert', style: { display: 'block', fontSize: 13, marginTop: 4 } }, error));
}
window.JTNumericInput = JTNumericInput;

/* ══════════════════════════════════════════════════════════════════════════
   폴백 «차단» 장치 — 엔진이 죽었을 때 «틀린 숫자»를 내놓느니 안 내놓는다.

   배경(260806 Codex A~E 전수 검토): 각 계산기의 간이 폴백은 엔진보다 훨씬 단순해서
   특정 사실관계에서 세액이 크게 어긋난다. 실측 예 —
     · 상속세 배우자가 실제로 상속받지 않는 경우 : 1억 8,381만원 «과소»
     · 상속세 10년 내 사전증여                   : 6,741만원 «과소»
     · 증여세 세대생략(손주 증여)                :   582만원 «과소»
     · 취득세 일시적 2주택                       : 4,670만원 «과대»
     · 취득세 85㎡ 초과 농특세 누락              :   120만원 «과소»
     · 양도세 1주택+입주권 동시보유 중과 누락     : 5억 8,000만원대 «과소»
   이걸 프론트에 다시 구현하는 것은 «엔진을 한 벌 더 만드는 것»이라 새 오류를 낳는다.
   그래서 «감당 못 하는 입력»이면 숫자를 감추고 재시도·상담으로 보낸다.
   (부담부증여 경로가 이미 이 방식이었다 — 그 패턴을 전 계산기로 넓힌 것)

   ★ 자유입력(context) 해석으로 판단하지 않는다. 구조화된 문항 답으로만 판정한다.
   ★ 「과대」도 차단 대상이다 — 세금이 실제보다 크게 나오면 이용자가 «하지 않아도 될
     포기»를 한다. 방향이 어느 쪽이든 «결정을 바꿀 만큼» 틀리면 숫자를 내지 않는다.
   ══════════════════════════════════════════════════════════════════════════ */
window.jtFallbackGaps = function (checks) {
  return (checks || []).filter(function (c) { return c && c.when; }).map(function (c) { return c.why; });
};

/* 차단 화면 — 숫자 자리에 «왜 못 내는지»와 다음 행동을 놓는다 */
/* 차단 패널.
   ★ `reason` 으로 «왜 막혔는가»를 구분한다 — 종전엔 무조건 「엔진 연결이 지연됐는데」라고 했다.
   그런데 불확정 입력(지분 미입력·「모르겠어요」)은 엔진과 아무 상관이 없다. 엔진은 멀쩡한데
   입력이 안 정해진 것이다. 그렇게 말하면 사용자는 「다시 시도」만 반복하고(260806 실측:
   3번 눌러도 아무 일도 안 일어났다) 정작 무엇을 입력해야 하는지 모른다.
     reason='input'   — 입력을 채우면 풀린다. 재시도 버튼을 보여 주지 않는다
     reason='engine'  — «간이 폴백»이 있는 계산기의 엔진 장애. 재시도가 의미 있다 (기본값)
     reason='down'    — 폴백이 없는 계산기(취득세)의 엔진 미응답. 금액을 내지 않고 재시도를 안내한다
     reason='refused' — 엔진이 계산을 거부했다(금액 확정 불가). 재시도가 의미 없으므로 버튼이 없다
   ⚠️ 'input'·'engine' 의 문구·동작은 다른 계산기가 그대로 쓴다 — 바꾸지 않는다. */
function JTFallbackBlocked({ gaps, onRetry, reason }) {
  var byInput = reason === 'input';
  var isDown = reason === 'down';
  var isRefused = reason === 'refused';
  var title = isDown ? '지금은 금액을 계산할 수 없습니다'
    : isRefused ? '세무사 확인이 필요한 조건입니다'
    : byInput ? '아래를 확인해 주시면 금액을 계산해 드릴게요'
    : '이 조건은 간이 계산으로 금액을 낼 수 없습니다';
  var retryLabel = isDown ? '다시 시도 →' : '정밀 계산 다시 시도 →';
  return (
    <div className="jt-report-result__section" style={{
      background: '#fdf6ec', borderLeft: '4px solid #d08b00', padding: '20px 22px',
      borderRadius: 8, marginBottom: 20, lineHeight: 1.7,
    }}>
      <strong style={{ display: 'block', fontSize: 16, marginBottom: 8 }}>{title}</strong>
      <p style={{ margin: '0 0 10px', fontSize: 14.5 }}>
        {isDown ? (
          <React.Fragment>계산 엔진에 연결하지 못했습니다. 이 계산기는 엔진이 계산한 값만 보여 드리므로 금액을 표시하지 않습니다.</React.Fragment>
        ) : isRefused ? (
          <React.Fragment>입력하신 조건은 이 계산기가 금액을 확정할 수 없는 경우입니다. 틀린 금액을 보여 드리지 않기 위해 금액을 표시하지 않습니다.</React.Fragment>
        ) : byInput ? (
          <React.Fragment><strong>세액이 크게 갈리는 항목이 아직 정해지지 않았습니다.</strong>{' '}
          짐작으로 채워 계산하면 틀린 금액을 「정밀 계산」처럼 보여 드리게 되어, <strong>금액을 표시하지 않습니다</strong>.</React.Fragment>
        ) : (
          <React.Fragment>정밀 계산 엔진 연결이 지연됐는데, <strong>입력하신 조건은 간이 계산이 다루지 못하는 항목</strong>을 포함합니다.
          틀린 금액을 보여 드리느니 알려 드리는 편이 낫다고 판단해 <strong>금액을 표시하지 않습니다</strong>.</React.Fragment>
        )}
      </p>
      <ul style={{ margin: '0 0 12px', paddingLeft: 19, fontSize: 14 }}>
        {(gaps || []).map(function (g, i) { return <li key={i}>{g}</li>; })}
      </ul>
      <p style={{ margin: '0 0 12px', fontSize: 13.5, color: '#5a5449' }}>
        {isDown
          ? <React.Fragment>잠시 후 <strong>다시 시도</strong>를 눌러 주세요. 계속 안 되면 상담으로 정확히 확인해 드립니다.</React.Fragment>
          : isRefused
          ? <React.Fragment>입력을 다시 확인하시거나 상담으로 문의해 주세요.</React.Fragment>
          : byInput
          ? <React.Fragment><strong>← 이전</strong>으로 돌아가 위 항목을 채워 주세요. 확인이 어려우면 상담으로 정확히 안내해 드립니다.</React.Fragment>
          : <React.Fragment>잠시 후 <strong>정밀 계산 다시 시도</strong>를 눌러 주세요. 계속 안 되면 상담으로 정확히 확인해 드립니다.</React.Fragment>}
      </p>
      {!byInput && !isRefused && onRetry && <button className="jt-btn jt-btn--primary" onClick={onRetry}>{retryLabel}</button>}
    </div>
  );
}
window.JTFallbackBlocked = JTFallbackBlocked;

// ============ 진단 메타 ============
window.JT_REPORTS = [
  {
    id: 'appeal',
    tag: 'APPEAL',
    kr: '경정청구 가능성 진단',
    en: 'Refund Eligibility Check',
    minutes: 5,
    questions: 5,
    hook: '이미 낸 세금, 돌려받을 수 있는지 5분 안에.',
    sub: '최근 5년 내 신고 건에 대해 경정청구 가능성과 사유를 살핍니다.',
    who: '최근 5년 이내 신고·납부한 분',
    output: '가능성 등급 · 해당 가능 사유 · 필요 자료',
  },
  {
    id: 'cgt',
    tag: 'LIVE',
    kr: '양도소득세 간이 계산',
    en: 'Capital Gains Estimate',
    minutes: 5,
    questions: 6,
    hook: '이 집 팔면 세금 얼마 나옵니까?',
    sub: '1세대1주택·장기보유특별공제·중과세 여부를 반영한 추정 세액.',
    who: '부동산 양도를 앞둔 분',
    output: '추정 양도소득세 · 주의 포인트 · 절세 여지',
  },
  {
    id: 'income',
    tag: 'BOOKKEEPING',
    kr: '종합소득세 절세 점검',
    en: 'Comprehensive Income Tax Review',
    minutes: 5,
    questions: 5,
    hook: '5월이 두려운 분을 위한 절세 체크리스트.',
    sub: '업종·수입·지출 구조에서 놓치고 있을 공제·특례 TOP 3.',
    who: '프리랜서·개인사업자·크리에이터·전문직',
    output: '예상 누락 항목 · 공제·특례 제안 · 다음 준비',
  },
];

// ============ 면책 고지 (강함 버전) ============
/* dataFlow 별 입력값 처리 고지 — 정의는 아래 JT_PRIVACY_NOTE (한 곳에서만 문안을 관리한다).
   ⚠️ 셸(JTReportShell)만으로는 «결과·로딩 화면»을 덮지 못한다. 그 화면들이 셸을 우회하기
      때문이다 (260806 Codex R8 P2 — 내가 면책에서 문단을 빼면서 만든 구멍).
      면책은 결과 화면마다 렌더되므로 여기에도 같은 문안을 둔다. 두 곳에 나와도
      «같은 출처»라 서로 모순하지 않는다. */
function JTReportDisclaimer({ variant, dataFlow }) {
  const full = (
    <>
      <strong>면책 고지</strong>
      <p>본 리포트는 공개 정보와 이용자가 입력한 사실관계를 바탕으로 제공되는 <strong>간이 참고 자료</strong>이며, 특정 거래·납세자에 대한 <strong>확정적 세무 판단이 아닙니다</strong>. 정식 검토는 반드시 유상 상담을 통해 담당 세무사가 자료 일체를 확인한 후 진행됩니다.</p>
      <p>본 리포트는 <strong>법적 효력이 없으며</strong>, 제이티 세무법인과 이용자 사이에 <strong>어떠한 위임·자문 관계나 권리·의무도 발생시키지 않습니다</strong>. 본 리포트만을 근거로 한 신고·결정·소송으로 발생한 손실에 대해 당사는 책임을 지지 않습니다.</p>
      <p>법령·예규·판례는 수시로 변경됩니다. 열람 시점 기준 최신 자료를 담당 세무사가 재확인합니다.</p>
      <p><strong>입력값 처리</strong> — {(window.JT_PRIVACY_NOTE || {})[dataFlow] || (window.JT_PRIVACY_NOTE || {}).engine}</p>
    </>
  );
  if (variant === 'inline') {
    return (
      <div className="jt-report-disc jt-report-disc--inline">
        {full}
      </div>
    );
  }
  return (
    <section className="jt-report-disc jt-report-disc--block">
      <div className="jt-container">
        {full}
      </div>
    </section>
  );
}
window.JTReportDisclaimer = JTReportDisclaimer;

// ============ calc_complete 이벤트 — 세션당 calc_id 1회 (260906 A1) ============
// «결과가 확정된» 계산기에서만, 개인정보·금액 없이 완료를 계측한다. 공용 컴포넌트
// (JTReportCta·JTReportConvert) 양쪽에서 같은 규칙으로 쓰기 위해 여기 한 곳에 둔다.
// 이 파일이 두 컴포넌트보다 먼저 로드되므로(ORDER 계약), window 에 걸어 두면
// 뒤에 로드되는 파일에서도 그대로 쓸 수 있다.
// 중복 방지: sessionStorage 에 calc_id 목록을 적재하고, 접근이 막히면(프라이빗 모드 등)
// 모듈 스코프 메모리 Set 으로 대체한다. ⚠️ 계약 범위(Codex R2-F4): 저장소가 살아 있으면 «브라우저 세션당 1회»,
// 저장소가 막힌 환경(프라이빗 모드·차단)에서는 «문서 생명주기(로드)당 1회»까지만 보장한다 — 새로고침·BFCache
// 미복원 재진입은 새 문서라 다시 1회 셀 수 있다. 이 환경은 GA4 자체도 대개 차단되므로 분석 영향은 제한적이다.
if (typeof window !== 'undefined' && !window.jtCalcComplete) {
  const JT_CALC_COMPLETE_KEY = 'jt_calc_complete_v1';
  const jtCalcCompleteMem = new Set();
  window.jtCalcComplete = function (calcId, extra) {
    if (!calcId) return;
    let already = false;
    try {
      const raw = window.sessionStorage.getItem(JT_CALC_COMPLETE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      if (list.indexOf(calcId) >= 0) {
        already = true;
      } else {
        list.push(calcId);
        window.sessionStorage.setItem(JT_CALC_COMPLETE_KEY, JSON.stringify(list));
      }
    } catch (_e) {
      if (jtCalcCompleteMem.has(calcId)) already = true;
      else jtCalcCompleteMem.add(calcId);
    }
    if (already) return;
    // ⛔ 금액·세액·주소·연락처·성명 등 개인정보·계산값은 절대 담지 않는다.
    const params = Object.assign({ calc_id: calcId }, extra || {});
    Object.keys(params).forEach(function (k) { if (params[k] === undefined) delete params[k]; });
    window.jtEvent('calc_complete', params);
  };
}

// ============ 공통 CTA 바 (진단 결과 하단) ============
function JTReportCta({ setRoute, calcId, completeEligible, precise, quick }) {
  useReportEffect(function () {
    if (completeEligible === true && calcId && window.jtCalcComplete) {
      window.jtCalcComplete(calcId, { precise: precise, quick: quick });
    }
  }, [completeEligible, calcId, precise, quick]);
  return (
    <div className="jt-report-cta">
      <div className="jt-report-cta__txt">
        <h4>이 진단은 참고용입니다.</h4>
        <p>개별 사안의 검토가 필요하면 상담을 신청해 주세요.</p>
      </div>
      <div className="jt-report-cta__btns">
        <button className="jt-btn jt-btn--primary" onClick={() => { window.jtTrackCta('booking', 'report_result'); setRoute && setRoute('booking'); }}>
          상담 예약 <span className="jt-arrow">→</span>
        </button>
        <a className="jt-btn jt-btn--ghost" href={window.jtKakaoUrl()} target="_blank" rel="noopener" onClick={() => window.jtTrackCta('kakao', 'report_result')}>
          카톡 상담
        </a>
      </div>
    </div>
  );
}
window.JTReportCta = JTReportCta;

// ============ 공통 응답 무결성 검증기 (P1-4 코덱스) ============
// 정상 0원(예: 사업소득 100만 종소세 0원)을 실패로 오판하지 않도록 '>0'이 아니라
// ①객체 존재 ②오류필드 없음 ③필수 숫자키가 유한한 실수(≥0)인지로 판정한다.
if (typeof window !== 'undefined' && !window.jtValidCalc) {
  window.jtValidCalc = function (c, requiredKeys) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
    if (c['오류'] || c.error || c.errors || c.detail || c.success === false) return false;
    // Both result dialects must agree. Diagnostic percentages are not tax amounts.
    const keys = (requiredKeys && requiredKeys.length) ? requiredKeys : ['총세부담'];
    const accepted = keys.length === 1 && keys[0] === 'reduction_rate'
      ? ['ok', 'eligible', 'conditional', 'ineligible'] : ['ok'];
    const statuses = ['상태', 'status'].filter(function (key) {
      return Object.prototype.hasOwnProperty.call(c, key);
    }).map(function (key) { return c[key]; });
    if (!statuses.every(function (value) {
      return typeof value === 'string' && accepted.includes(value) && value === statuses[0];
    })) return false;
    return keys.every(function (k) {
      const v = c[k];
      return typeof v === 'number' && isFinite(v) && v >= 0;         // NaN·무한대·문자·누락 거부, 0은 정상
    });
  };
}

// ============ 엔진 안내 문구 표시용 변환 (261011) ============
/* 엔진의 needs_input·unsupported 문구는 API 호출자(홈페이지 코드·MCP)가 어떤 «입력 키»를 채워야 하는지 알도록
   `owner_housing_count(처분 물건을 포함한 소유자 세대의 보유 주택 수)` 처럼 식별자를 함께 적는다. 사람에게 보이는
   화면에서는 그 식별자와 개발자용 꼬리말(«…0으로 두면 … 차단한다»)을 떼고 설명만 보인다. 식별자는 비밀값이 아니라
   (요청 본문에 매번 실리는 필드 이름) 품질 문제이지만, 화면에 내부 이름이 보이지 않게 한다. 식별자가 없는 문구는
   그대로 돌려준다. 시험은 이 함수를 정규식(함수 머리 줄부터 «};» 로 끝나는 줄까지)으로 꺼내 쓴다 — 함수 머리와 같은 문자열을
   이 주석에 적으면 시험이 주석을 먼저 잡으니 적지 않는다. */
window.jtEngineMessageForDisplay = function (msg) {
  let s = (msg == null ? '' : '' + msg).trim();
  if (!s) return '';
  // ① 식별자(설명) → 「설명」 — 설명 안의 괄호 한 겹까지 허용
  s = s.replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)*\(((?:[^()]|\([^()]*\))*)\)/g, '「$1」');
  // ② «식별자: 지원하지 않는 값 …» 머리의 식별자
  s = s.replace(/^[a-z][a-z0-9_]*:\s*(?=지원하지 않는 값)/, '');
  // ③ 남은 snake_case 식별자(«식별자=값» 모순 문구 등) → 입력값
  s = s.replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, '입력값');
  // ④ 개발자용 꼬리말(차단 이유 설명)
  s = s.replace(/\s*—\s*(?:확정할 수 없는 값을 0으로 두면|미지원 값을 기본값으로 대체하면)[^—]*차단한다\.?$/, '');
  return s.trim();
};

// ============ 공통 스텝 셸 (진단별 공용) ============
/* 입력값 처리 고지 — 계산기마다 «실제 데이터 흐름»이 다르다 (260806 Codex R6 P2).
     engine (기본) : 세액 계산 엔진 호출 + 일부 진단은 AI
     lookup        : 계산은 브라우저 안에서. 주소로 공시가격을 «조회할 때만» 엔진 호출
     local         : 전부 브라우저 안에서. 밖으로 나가는 것이 없다
   ⚠️ 하나로 뭉뚱그리면 «하지 않는 전송»을 한다고 말하게 된다 — 반대 방향의 거짓이다. */
const JT_PRIVACY_NOTE = window.JT_PRIVACY_NOTE = {
  engine: <>입력값은 계정에 저장하지 않습니다. 계산을 위해 세액 계산 엔진으로 전송되며, 일부 진단은 AI 응답을 이용합니다. 담당 세무사에게 전달되는 것은 <strong>동의하신 경우</strong>뿐입니다.</>,
  lookup: <>입력값은 계정에 저장하지 않습니다. 계산은 <strong>브라우저 안에서</strong> 이뤄지고, 주소로 공시가격을 조회할 때만 조회 서버로 주소가 전송됩니다. 담당 세무사에게 전달되는 것은 <strong>동의하신 경우</strong>뿐입니다.</>,
  local: <>입력값은 계정에 저장하지 않습니다. 계산은 <strong>전부 브라우저 안에서</strong> 이뤄지며 외부로 전송되지 않습니다. 담당 세무사에게 전달되는 것은 <strong>동의하신 경우</strong>뿐입니다.</>,
  ai: <>입력값은 계정에 저장하지 않습니다. 이 진단은 <strong>외부 AI</strong>에 입력 내용을 보내 답을 받는 방식이며, 세액 계산 엔진은 쓰지 않습니다. 담당 세무사에게 전달되는 것은 <strong>동의하신 경우</strong>뿐입니다.</>,
};

// The engine supplies the legal source and calculation note; never invent a citation.
function JTCalculationStepLabel({ step, formatArticle = value => value }) {
  return <React.Fragment>{step['항목']}{step['조문'] ? <span style={{opacity:0.7,fontSize:12}}> · {formatArticle(step['조문'])}</span> : null}
    {step['비고'] ? <small style={{display:'block',fontWeight:400,lineHeight:1.5,marginTop:4}}>{step['비고']}</small> : null}
  </React.Fragment>;
}

function JTReportShell({ title, subtitle, stepIdx, stepTotal, children, onBack, tag, dataFlow, inputReview, extraActions }) {
  const contentMotion = useJTContentMotion(title + ':' + stepIdx);
  // P2-2: 로딩·결과 화면은 stepIdx=stepTotal을 넘겨 진행률 100% 초과·"Step N+1/N"이 되던 것 클램프(0~100%)
  const hasSteps = Number.isInteger(stepIdx) && Number.isInteger(stepTotal) && stepTotal > 0;
  const _tot = hasSteps ? stepTotal : 1;
  const _stepNo = Math.max(0, Math.min((hasSteps ? stepIdx : 0) + 1, _tot));
  const pct = Math.max(0, Math.min(100, Math.round((_stepNo / _tot) * 100)));
  return (
    <div className="jt-report-shell">
      <div className="jt-report-shell__head">
        <button className="jt-report-shell__back" onClick={onBack}>← 세금 계산기 목록</button>
        <div className="jt-report-shell__meta">
          <span className="jt-tag">{tag}</span>
          {hasSteps && <span>Step {_stepNo} / {_tot}</span>}
        </div>
      </div>
      {hasSteps && <div className="jt-report-shell__bar"><div style={{width: `${pct}%`}} /></div>}
      <div className="jt-report-shell__title">
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {/* ⚠️ 입력값 처리 고지가 허브에만 있으면, 딥링크(#/report/gift 등)로 바로 들어온
            이용자는 «엔진 전송·AI 이용»을 모른 채 재산 정보를 넣는다 (260806 Codex R5 P1).
            모든 계산기가 이 셸을 쓰므로 여기 한 줄을 두면 전 화면이 덮인다. */}
        <p className="jt-report-shell__privacy" style={{ fontSize: 12.5, opacity: 0.65, lineHeight: 1.6, marginTop: 6 }}>
          {JT_PRIVACY_NOTE[dataFlow] || JT_PRIVACY_NOTE.engine}
        </p>
      </div>
      <div ref={contentMotion} className="jt-report-shell__body">
        {inputReview && <JTInputReview {...inputReview} />}
        {extraActions}
        {children}
      </div>
    </div>
  );
}
window.JTReportShell = JTReportShell;

// ============ 세목 약자 배지 (Pretendard 타이포 · 모노톤 — 손그림 아이콘 대체) ============
const JT_ABBR = {
  cgt: '양도', gift: '증여', inheritance: '상속', acquisition: '취득', property: '재산',
  comprehensive: '종부', income: '종소', vat: '부가', insurance: '급여', corporate: '법인',
  youthstartup: '창업', compare: '비교', burden: '부담', appeal: '경정',
  'reform-cgt': '개편', 'reform-cre': '개편', crypto: '코인',
};
window.JT_ABBR = JT_ABBR;

// ============ 허브 랜딩 ============
function JTReportHub({ setRoute, setSubRoute }) {
  const [query, setQuery] = useReportState('');
  const [group, setGroup] = useReportState('전체');
  const groups = ['전체', '재산', '사업·소득', '비교·진단'];
  const tools = [
    { sub: 'cgt', name: '양도소득세', group: '재산', text: '부동산을 팔기 전, 취득·양도 내역으로 세금을 살펴봅니다.' },
    { sub: 'gift', name: '증여세', group: '재산', text: '증여할 재산과 가족관계, 이전 증여 내역을 함께 확인합니다.' },
    { sub: 'inheritance', name: '상속세', group: '재산', text: '상속재산·채무와 가족관계를 정리해 예상 세액을 살펴봅니다.' },
    { sub: 'acquisition', name: '취득세', group: '재산', text: '매매·증여·상속 등 취득 원인과 주택 보유 상황을 확인합니다.' },
    { sub: 'property', name: '재산세', group: '재산', text: '주택·건물·토지의 보유 내역으로 재산세를 살펴봅니다.' },
    { sub: 'comprehensive', name: '종합부동산세', group: '재산', text: '보유 주택의 공시가격과 공제 조건을 함께 확인합니다.' },
    { sub: 'income', name: '종합소득세', group: '사업·소득', text: '사업·근로 등 소득과 공제 내역을 모아 예상 세액을 살펴봅니다.' },
    { sub: 'vat', name: '부가세 계산기', group: '사업·소득', text: '과세 유형과 매출·매입 내역으로 신고할 부가가치세를 살펴봅니다.' },
    { sub: 'insurance', name: '월급 실수령액 계산기', group: '사업·소득', text: '월 급여를 기준으로 4대보험과 세금 공제 후 금액을 확인합니다.' },
    { sub: 'corporate', name: '개인사업자·법인 세금 비교', group: '비교·진단', text: '법인 전환을 고민할 때, 사업 이익과 대표 급여를 기준으로 개인·법인의 세금을 비교합니다.' },
    { sub: 'compare', name: '증여·매매·상속 세금 비교', group: '비교·진단', text: '같은 재산의 이전 방법에 따라 달라지는 세금을 비교합니다.' },
    { sub: 'burden', name: '부담부증여 계산기', group: '비교·진단', text: '채무를 함께 넘기는 증여에서 세금이 어떻게 달라지는지 살펴봅니다.' },
    { sub: 'youthstartup', name: '청년창업 감면 진단', group: '비교·진단', text: '창업 시점·업종·지역 등 감면 검토에 필요한 조건을 확인합니다.' },
    { sub: 'acq-check', name: '취득세 신고 점검', group: '비교·진단', text: '취득세 신고에서 다시 확인할 항목을 차례로 점검합니다.' },
    { sub: 'appeal', name: '경정청구 검토', group: '비교·진단', text: '이미 신고한 세금에서 검토할 쟁점과 자료를 정리합니다.' },
    { sub: 'reform-cgt', name: '양도세 개편안 비교', group: '비교·진단', text: '개편안의 가정을 적용한 비교입니다. 확정 법령과 구분해 보세요.', note: '개편안 가정' },
    { sub: 'reform-cre', name: '종부세 개편안 비교', group: '비교·진단', text: '개편안의 조건에 따른 차이를 살펴봅니다. 실제 신고용 계산과 구분됩니다.', note: '개편안 가정' },
    { sub: 'crypto', name: '가상자산 세금 시뮬레이션', group: '비교·진단', text: '도구에 표시된 적용 시점과 가정을 확인하고 계산해 보세요.', note: '적용 시점 확인' },
  ];
  const normalized = query.trim().toLowerCase();
  const matches = tools.filter(t => (group === '전체' || t.group === group) && (t.name + ' ' + t.text).toLowerCase().includes(normalized));
  const openTool = (event, sub) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); setSubRoute(sub);
  };
  return (
    <div className="jt-renew-tools">
      <section className="jt-renew-flow-intro">
        <div className="jt-renew-flow-wrap">
          <h1>세금 계산기</h1>
          <p>내 상황에 맞는 계산과 비교·진단을 찾아보세요.</p>
          <div className="jt-renew-tool-search"><label htmlFor="jt-tool-query">어떤 세금이 궁금하신가요?</label><input id="jt-tool-query" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="예: 증여, 취득, 실수령액" autoComplete="off" /></div>
          <div className="jt-renew-filter" role="group" aria-label="도구 분야">{groups.map(g => <button type="button" key={g} aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>)}</div>
          <button type="button" className="jt-btn jt-btn--primary" onClick={() => setSubRoute("workspace")}>고객·사건 작업대 열기</button>
        </div>
      </section>
      <section className="jt-renew-flow-wrap jt-renew-tool-results" aria-labelledby="jt-tool-list-title">
        <div className="jt-renew-result-head"><h2 id="jt-tool-list-title">{group === '전체' ? '세금 계산기·비교·진단' : group + ' 도구'}</h2><p role="status">{matches.length}개 도구</p></div>
        {matches.length > 0 ? <div className="jt-renew-tool-list">{matches.map(t => <a key={t.sub} className="jt-renew-tool" href={'/#/report/' + t.sub} onClick={e => openTool(e, t.sub)}><div><span className="jt-renew-tool-category">{t.group}{t.note ? ' · ' + t.note : ''}</span><h3>{t.name}</h3><p>{t.text}</p></div><span className="jt-renew-tool-open">{t.group === '비교·진단' ? '살펴보기' : '계산하기'} <span aria-hidden="true">→</span></span></a>)}</div> : <div className="jt-renew-empty"><h3>일치하는 도구가 없습니다.</h3><p>세금 이름을 짧게 입력하거나 전체 분야에서 찾아보세요.</p><button type="button" className="jt-btn jt-btn--outline" onClick={() => {setQuery('');setGroup('전체');}}>전체 도구 보기</button></div>}
        <details className="jt-renew-coming"><summary>준비 중인 도구</summary><p>AI 세무 길잡이와 세무조사 위험도 진단은 준비 중입니다. 지금 필요한 사안은 상담으로 문의해 주세요.</p></details>
      </section>
      <JTReportDisclaimer />
      <section className="jt-renew-flow-cta"><div className="jt-renew-flow-wrap"><div><h2>계산 다음의 판단이<br />필요하신가요?</h2><p>입력한 상황과 결과를 바탕으로 상담을 준비해 보세요.</p></div><button className="jt-btn jt-btn--primary" onClick={() => { window.jtTrackCta('booking', 'report_hub'); setRoute('booking'); }}>상담 신청 <span aria-hidden="true">→</span></button></div></section>
    </div>
  );
}
window.JTReportHub = JTReportHub;

// ============ 라우터 (허브 ↔ 각 진단) ============
/* ★ 새 계산기를 추가하면 «반드시» 이 배열에도 키를 넣을 것.
   빠뜨리면 딥링크가 조용히 허브로 리다이렉트되고 에러도 안 난다(260804 실측). */
const JT_KNOWN_SUBS = ['hub', 'workspace', 'appeal', 'cgt', 'income', 'vat', 'gift', 'inheritance', 'acquisition', 'acq-check', 'property', 'comprehensive', 'corporate', 'insurance', 'compare', 'burden', 'youthstartup', 'reform-cgt', 'reform-cre', 'crypto'];
const jtNormSub = (s) => (JT_KNOWN_SUBS.indexOf(s) >= 0 ? s : 'hub'); // 모르는 계산기 키 → 허브 (깨진 공유링크 방어)

function JTReportPage({ setRoute }) {
  const [subRoute, setSubRouteRaw] = useReportState(() => {
    try {
      const r = window.JTRouter && window.JTRouter.parse();
      // An explicit hub URL takes priority over the last calculator saved locally.
      if (r && r.router && r.route === 'report') return jtNormSub(r.sub || 'hub');
      return jtNormSub(localStorage.getItem('jt_report_sub') || 'hub');
    } catch (e) { return 'hub'; }
  });

  // setSubRoute = 상태 + URL 해시(#/report/cgt) 동기화 → 계산기 딥링크·공유·북마크·뒤로가기
  const setSubRoute = (s) => {
    setSubRouteRaw(s);
    try { if (window.JTRouter) window.JTRouter.set('report', s); } catch (e) {}
  };

  useReportEffect(() => {
    try { localStorage.setItem('jt_report_sub', subRoute); } catch (e) {}
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [subRoute]);

  // 브라우저 뒤로/앞으로 → 해시 재해석해 subRoute 동기화 (idempotent)
  useReportEffect(() => {
    const onHash = () => {
      try {
        const r = window.JTRouter.parse();
        if (r.router && r.route === 'report') setSubRouteRaw(jtNormSub(r.sub || 'hub'));
      } catch (e) {}
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 최초 진입: localStorage 복원으로 들어온 계산기를 URL에도 반영 (URL=상태 일치)
  useReportEffect(() => {
    try {
      const r = window.JTRouter && window.JTRouter.parse();
      const hashSub = (r && r.router && r.route === 'report') ? (r.sub || 'hub') : null;
      if (subRoute && subRoute !== 'hub' && hashSub !== subRoute) window.JTRouter.set('report', subRoute);
    } catch (e) {}
  }, []);

  // Reveal: 리포트 페이지 내부는 단순화 — 진입 즉시 모두 visible (검게 고정되는 이슈 회피)
  useReportEffect(() => {
    const apply = () => {
      document.querySelectorAll('.jt-report .reveal:not(.is-visible)').forEach(e => e.classList.add('is-visible'));
    };
    requestAnimationFrame(() => requestAnimationFrame(apply));
    const t = setTimeout(apply, 80);
    return () => clearTimeout(t);
  }, [subRoute]);

  const back = () => setSubRoute('hub');

  return (
    <div className="jt-report">
      {subRoute === 'workspace' && <JTCaseWorkspace onBack={back} />}
      {subRoute === 'hub' && <JTReportHub setRoute={setRoute} setSubRoute={setSubRoute} />}
      {subRoute === 'reform-cgt' && <JTReportReformCGT setRoute={setRoute} setSubRoute={setSubRoute} onBack={back} />}
      {subRoute === 'reform-cre' && <JTReportReformCRE setRoute={setRoute} setSubRoute={setSubRoute} onBack={back} />}
      {subRoute === 'crypto' && <JTReportCrypto setRoute={setRoute} setSubRoute={setSubRoute} onBack={back} />}
      {subRoute === 'appeal' && <JTReportAppeal setRoute={setRoute} onBack={back} />}
      {subRoute === 'cgt' && <JTReportCGT setRoute={setRoute} onBack={back} />}
      {subRoute === 'income' && <JTReportIncome setRoute={setRoute} onBack={back} />}
      {subRoute === 'gift' && <JTReportGift setRoute={setRoute} onBack={back} />}
      {subRoute === 'inheritance' && <div className="jt-container"><button className="jt-btn jt-btn--ghost" onClick={() => setSubRoute('workspace')}>상속 사건 입력·저장 작업대 열기</button><p>사건 작업대에서는 고객별 재산·상속인 사실을 확인하고 저장·계산·과거 결과를 관리합니다. 아래 빠른 계산 답안은 자동 이전되지 않습니다.</p></div>}
      {subRoute === 'inheritance' && <JTReportInheritance setRoute={setRoute} onBack={back} />}
      {subRoute === 'acquisition' && <JTReportAcquisition setRoute={setRoute} onBack={back} />}
      {subRoute === 'acq-check' && <JTReportAcqCheck setRoute={setRoute} onBack={back} />}
      {subRoute === 'property' && <JTReportProperty setRoute={setRoute} onBack={back} />}
      {subRoute === 'comprehensive' && <JTReportComprehensive setRoute={setRoute} onBack={back} />}
      {subRoute === 'corporate' && <JTReportCorporate setRoute={setRoute} onBack={back} />}
      {subRoute === 'insurance' && <JTReportInsurance setRoute={setRoute} onBack={back} />}
      {subRoute === 'vat' && <JTReportVat setRoute={setRoute} onBack={back} />}
      {subRoute === 'compare' && <JTReportCompare setRoute={setRoute} onBack={back} />}
      {subRoute === 'burden' && <JTReportBurden setRoute={setRoute} onBack={back} />}
      {subRoute === 'youthstartup' && <JTReportYouthStartup setRoute={setRoute} onBack={back} />}
    </div>
  );
}
window.JTReportPage = JTReportPage;

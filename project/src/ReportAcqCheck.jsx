/* @jsx React.createElement */
/* 「이미 낸 취득세 1차 재검토」 접수 — 260921 설계서 §2 를 260926 오너 확정(접수와서류 4차본 B-1·B-4,
   실행계획 v7 Q절)으로 고친 화면이다.

   ⛔ 재계산기가 아니다. 경정청구는 5년 전 취득분까지 올라가는데 그 사건에 적용할 조문은
      «취득일 당시의 조문»이다(세대 판정·주택 수 산정·일시적2주택을 정하는 지방세법
      시행령 제28조의3~5가 해마다 바뀌었다). 현행 세율로 계산한 값을 과거 납부액과
      나란히 두면 그 차이는 «환급액»이 아니라 «법이 바뀐 폭»이다. 그래서 이 화면은
      세액·차액·환급 가능성을 계산하지도, 표시하지도 않는다 — 접수 확인만 보여 준다.
   ⛔ 서류를 요구하지 않는다(260926 오너 판정 — 「정확한 서류는 수임되면 요구하자, 처음엔 써 주는
      내용만으로 상담하자」). 접수 화면은 4차본 B-1 의 항목만 받고, 서류는 「가지고 계신지」만 표시한다.
      1차 재검토의 결론에는 「자료를 보면 달라질 수 있다」를 붙인다.
   ⛔ 「무료」·「비용 없음」을 쓰지 않는다(세무사회 광고규정 §8①·§4 10호, 260926 결재 R-1).
      상품명은 「1차 재검토」. 비용 안내는 문의한 고객에게 개별로 한다.
   ⛔ GA4 — 이 화면에서는 booking_submit 도, 새 이벤트도 발화하지 않는다.
      공용 유입정보(jtAttributionFields)도 이 접수에는 합치지 않는다(R3-F1·F3).
   ⛔ 동·호수, 주민등록번호, 파일 첨부, 자유 서술은 받지 않는다(설계서 2-3, R2 불변식).
*/

const { useState: useAcqCkState, useRef: useAcqCkRef } = React;

/* 접수번호 — 순번이 아니라 «추측하기 어려운» 무작위 문자열이어야 한다(설계서 2-3 ⑪ 인접 요구).
   R1-F4: Web Crypto 가 없는 환경에서는 접수번호를 만들지 않는다(null) — 예측 저항성이 없는
   구형 난수 폴백은 삭제했다. 호출부는 null 을 「이 브라우저에서는 접수 번호를 안전하게 만들
   수 없다」로 취급하고 제출을 막는다. */
function acqCheckGenId() {
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues && window.Uint8Array) {
      const arr = new window.Uint8Array(10);
      window.crypto.getRandomValues(arr);
      return 'ACQCK-' + Array.from(arr).map((b) => b.toString(36)).join('').toUpperCase().slice(0, 12);
    }
  } catch (_e) {}
  return null;
}
window.acqCheckGenId = acqCheckGenId;

/* R2-F1: 시·군·구 자유입력란은 우회 사례(전각 공백·줄바꿈·무공백 상세주소, R2 보고서)가
   나와 «부류를 닫기» 위해 아예 없앴다 — 소재지는 시·도 선택지(f.sido)만 받는다. 시·군·구·
   상세주소는 세무사가 연락할 때 직접 여쭙는다. */

/* R2-F3: 전화번호 — 허용 문자(숫자·하이픈·공백·괄호·+)만으로 이뤄졌는지 먼저 보고, 그 다음
   숫자만 추려 9~11자리·0 시작을 확인한다. 통과해도 payload 에는 원문이 아니라 이 함수가
   돌려주는 «정규화된 숫자열»만 싣는다(제출 본문에 원문이 그대로 남지 않게). */
const ACQ_CHECK_PHONE_CHARS = /^[0-9\-\s()+]+$/;   // R3-F4: 점(.)은 선언한 허용 집합에 없다
function validateAcqCheckPhone(raw) {
  const s = String(raw == null ? '' : raw);
  if (!s.trim() || !ACQ_CHECK_PHONE_CHARS.test(s)) return { ok: false, digits: '' };
  const digits = s.replace(/[^0-9]/g, '');
  const ok = digits.length >= 9 && digits.length <= 11 && digits.charAt(0) === '0';
  return { ok, digits: ok ? digits : '' };
}
window.validateAcqCheckPhone = validateAcqCheckPhone;

/* R2 공통: 날짜칸(type="date")은 브라우저가 YYYY-MM-DD 로 주지만, 그 계약을 코드로도
   못박는다 — 형식을 벗어난 값은 payload 에 싣지 않고 「모름」으로 남긴다(제출은 막지 않음,
   전부 선택 입력이므로). */
function validateAcqCheckDate(raw) {
  const v = String(raw == null ? '' : raw).trim();
  if (!v) return { ok: true, value: '' };
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? { ok: true, value: v } : { ok: false, value: '' };
}
window.validateAcqCheckDate = validateAcqCheckDate;

/* R2 공통: <select>·체크박스 선택지 폐집합 — JSX 렌더와 payload 화이트리스트가 «같은 배열»을 본다
   (드리프트 방지). payload 조립은 이 배열들로 다시 한 번 소속을 확인해, DOM 이 아닌 다른
   경로(예: 상태 조작)로 값이 들어와도 허용 목록 밖이면 고정 문자열 「모름」으로 막는다.
   항목은 접수와서류 4차본 B-1(260926 오너 확정)의 일곱 가지다. 시·도와 취득 원인은 B-1 에 없지만
   1차 재검토에서 조례·세율을 가르는 사실이라 선택지(부담 없음)로만 둔다. */
const ACQ_CHECK_PROPERTY_TYPES = ['주택', '오피스텔', '상가·사무실', '토지·농지', '그 밖'];          // B-1 ②
const ACQ_CHECK_ACQUISITION_TYPES = ['매매', '증여', '상속', '신축', '공매', '재산분할'];
const ACQ_CHECK_SITUATIONS = [                                                                   // B-1 ⑤
  '세금을 이미 냈는데 더 낸 것 같다',
  '구청에서 더 내라는 통지를 받았다',
  '경정청구를 냈는데 거부당했다',
  '아직 취득 전인데 세금이 궁금하다',
];
const ACQ_CHECK_NOTICE_TYPES = ['결정통지서', '경정통지서', '과세예고통지서', '추징통지서', '납세고지서'];
const ACQ_CHECK_DOC_ITEMS = ['취득세 신고서·납부확인서', '등기사항전부증명서', '매매계약서', '구청 통지서', '없음·모르겠음'];   // B-1 ⑥
const ACQ_CHECK_SOURCES = ['검색', '카페', '소개', '법무사·중개사', '유튜브', '그 밖'];                // B-1 ⑦ (G절 네 칸 ①)
const ACQ_CHECK_CONTACT_METHODS = ['카카오톡 채널', '전화'];                                        // B-1 ①

/* 값이 허용 목록에 없으면 fallback(기본 「모름」)으로 막는다 — payload 화이트리스트의 공용 헬퍼. */
function acqCheckPick(value, allowed, fallback) {
  const fb = fallback === undefined ? '모름' : fallback;
  return allowed.indexOf(value) >= 0 ? value : fb;
}
window.acqCheckPick = acqCheckPick;

/* 시·도 17개 — ReportAcquisition.jsx 의 ACQ_REGIONS 와 같은 목록을 이 파일에서 독립적으로
   유지한다(그쪽 식별자에 기대지 않는다 — 그 파일의 이름이 바뀌어도 이 접수 화면이 조용히
   깨지지 않게 하기 위해서다). 세율·상수가 아니라 행정구역 명칭이라 별도 검증 없이 복제한다. */
const ACQ_CHECK_REGIONS = ['서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시',
  '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도',
  '경상북도', '경상남도', '제주특별자치도'];

const ACQ_CHECK_INIT = {
  acqDateType: '', acqDate: '',
  sido: '',
  acquisitionType: '', propertyType: '',
  paidAmount: '',
  situation: '',
  noticeType: '', noticeDate: '',
  rejectDate: '',
  docItems: [],
  source: '',
  contactMethod: '', contactPhone: '',
  consent: false, consentIntl: false,
};

/* 숫자열이 아니면 버린다 — jtMoneyDigits 가 이미 정규화해 두지만, 이 함수는 f 를 «믿지 않고»
   다시 한 번 스스로 확인한다(상태가 다른 경로로 오염돼도 막히도록). */
function acqCheckMoneyValue(raw) {
  const v = String(raw == null ? '' : raw);
  return /^\d+$/.test(v) ? v : '';
}

/* R2 불변식: payload 의 모든 값은 ①선택지 값 ②숫자만 남긴 금액 ③YYYY-MM-DD 날짜
   ④정규화된 전화번호(숫자열) ⑤접수번호 ⑥고정 문자열 중 하나여야 한다. 사용자가 친 자유
   문자열이 하나도 실리지 않도록 payload 조립을 이 순수 함수 하나로 모은다 — window·DOM 을
   참조하지 않으므로 f 와 receiptId 만 넣고 그대로 시험할 수 있다(음성 시험: 모든 필드를
   오염 문자열로 채워도 허용 패턴 밖 부분 문자열이 결과에 없어야 한다). 선택지 필드는 DOM 이
   실제로 그 값만 만들어내더라도, 이 함수 자신이 허용 목록(acqCheckPick)으로 다시 확인한다 —
   f 가 어떤 경로로 왔는지 이 함수는 모르기 때문이다. */
function buildAcqCheckPayload(f, receiptId) {
  const acqDateCheck = validateAcqCheckDate(f.acqDate);
  const noticeDateCheck = validateAcqCheckDate(f.noticeDate);
  const rejectDateCheck = validateAcqCheckDate(f.rejectDate);
  const contactMethod = acqCheckPick(f.contactMethod, ACQ_CHECK_CONTACT_METHODS, '');
  const phoneCheck = contactMethod === '전화' ? validateAcqCheckPhone(f.contactPhone) : { ok: true, digits: '' };
  const situation = acqCheckPick(f.situation, ACQ_CHECK_SITUATIONS);
  /* 통지서 칸은 「구청에서 더 내라는 통지를 받았다」에서만, 거부 통지일은 「경정청구 거부」에서만 뜬다.
     다른 상황에서 남아 있는 옛 답은 싣지 않는다(«지금 화면에 없는 질문의 답»은 payload 에 없어야 한다). */
  const noticeShown = situation === ACQ_CHECK_SITUATIONS[1];
  const rejectShown = situation === ACQ_CHECK_SITUATIONS[2];
  const docItems = Array.isArray(f.docItems) ? f.docItems : [];
  const validDocItems = docItems.filter((x) => ACQ_CHECK_DOC_ITEMS.indexOf(x) >= 0);

  return {
    _subject: `[JT 취득세 1차 재검토 접수] ${receiptId}`,
    구분: 'ACQ_CHECK',
    접수번호: receiptId,
    취득일_구분: f.acqDateType === 'settlement' ? '잔금일' : f.acqDateType === 'registry' ? '등기접수일' : '모름',
    취득일: acqDateCheck.ok && acqDateCheck.value ? acqDateCheck.value : '모름',
    소재지_시도: acqCheckPick(f.sido, ACQ_CHECK_REGIONS.concat(['모름'])),
    취득원인: acqCheckPick(f.acquisitionType, ACQ_CHECK_ACQUISITION_TYPES),
    물건종류: acqCheckPick(f.propertyType, ACQ_CHECK_PROPERTY_TYPES),
    낸취득세_대략: acqCheckMoneyValue(f.paidAmount) || '—',
    지금상황: situation,
    통지서_종류: noticeShown ? acqCheckPick(f.noticeType, ACQ_CHECK_NOTICE_TYPES) : '해당없음',
    통지서_수령일: noticeShown && noticeDateCheck.ok && noticeDateCheck.value ? noticeDateCheck.value : '모름',
    거부통지_수령일: rejectShown && rejectDateCheck.ok && rejectDateCheck.value ? rejectDateCheck.value : '모름',
    가진서류: validDocItems.length ? validDocItems.join('·') : '—',
    알게된경로: acqCheckPick(f.source, ACQ_CHECK_SOURCES),
    연락방법: contactMethod || '모름',
    연락처: contactMethod === '전화' ? phoneCheck.digits : '카카오톡 채널로 연락',
    // R3-F2: 처리방침이 «모든 폼은 동의 기록을 함께 전송한다»고 고지한다 — 고정 문자열로 싣는다
    개인정보동의: f.consent === true ? '동의함' : '미동의',
    국외이전동의: f.consentIntl === true ? '동의함' : '미동의',
    접수시각: new Date().toLocaleString('ko-KR'),
  };
}
window.buildAcqCheckPayload = buildAcqCheckPayload;

/* R4-F2: 제출 가드·전송 객체·메일 본문을 «순수 함수»로 뺀다 — 소스 정규식이 아니라 실제 실행으로
   시험하기 위해서다(Object.assign(payload, f) 같은 변형은 정규식을 통과한다). submit 은 이 셋만 쓴다. */
function acqCheckCanSubmit(f, receiptId, submitting) {
  if (!receiptId || submitting) return false;
  if (f.consent !== true || f.consentIntl !== true) return false;
  if (ACQ_CHECK_CONTACT_METHODS.indexOf(f.contactMethod) < 0) return false;
  if (f.contactMethod === '전화') return validateAcqCheckPhone(f.contactPhone).ok;
  return true;
}
function buildAcqCheckRequest(f, receiptId, accessKey) {
  const payload = buildAcqCheckPayload(f, receiptId);
  return { access_key: accessKey, subject: payload._subject, from_name: '홈페이지 취득세 1차 재검토 접수', ...payload };
}
function buildAcqCheckMailBody(f, receiptId) {
  const payload = buildAcqCheckPayload(f, receiptId);
  return Object.keys(payload).map((k) => k + ': ' + payload[k]).join('\n');
}
window.acqCheckCanSubmit = acqCheckCanSubmit;
window.buildAcqCheckRequest = buildAcqCheckRequest;
window.buildAcqCheckMailBody = buildAcqCheckMailBody;

function JTReportAcqCheck({ setRoute }) {
  const [f, setFRaw] = useAcqCkState(ACQ_CHECK_INIT);
  /* R4-F1: 전송 중에는 폼 값을 바꾸지 못한다 — 응답을 기다리는 사이 연락 방법을 바꾸면 «보낸 값»과
     «완료 화면이 약속하는 것»이 어긋난다. 상태 갱신 자체를 막는다(입력란 개수와 무관하게 한 곳에서). */
  const submittingRef = useAcqCkRef(false);
  const setAns = (id, v) => setFRaw((prev) => (submittingRef.current ? prev : { ...prev, [id]: v }));
  const set = (k) => (e) => setAns(k, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  const setMoney = (k) => (e) => window.jtSetNumericAns(setAns, k, e.target.value, true);

  // 접수번호 — 화면이 열려 있는 동안 한 번만 만든다(다시 열면 새로 만든다. 순번이 아니므로 재사용할 이유가 없다)
  // R1-F4: Web Crypto 가 없는 환경에서는 acqCheckGenId() 가 null 을 돌려준다 — 그 브라우저에서는 접수번호를 못 만든다.
  const [receiptId] = useAcqCkState(() => acqCheckGenId());
  const [submitting, setSubmitting] = useAcqCkState(false);
  const [done, setDone] = useAcqCkState(false);
  const [error, setError] = useAcqCkState('');
  const [copied, setCopied] = useAcqCkState(false);
  const [sentMethod, setSentMethod] = useAcqCkState('');   // R4-F1: «실제로 보낸» 연락 방법 — 완료 화면은 이것만 본다

  // R2-F3: 연락 방법이 「전화」일 때만 형식을 검증한다(카카오톡은 별도 흐름)
  const phoneCheck = f.contactMethod === '전화' ? validateAcqCheckPhone(f.contactPhone) : { ok: true, digits: '' };
  const toggleDocItem = (item) => setFRaw((prev) => {
    if (submittingRef.current) return prev;
    const has = prev.docItems.includes(item);
    return { ...prev, docItems: has ? prev.docItems.filter((x) => x !== item) : [...prev.docItems, item] };
  });

  /* 최소 요건 — 두 동의와, «어떻게든 연락은 닿을 방법». 금액·날짜·서류 항목은 전부 비워도 된다
     (4차본 B-1: 「가지고 계신 것에 표시」·「대략 금액」). 연락 방법만은 예외다 — 접수 자체가
     「써 주신 내용을 보고 연락드립니다」이므로 연락할 방법이 없으면 접수의 의미가 없다.
     R1-F4·R2-F3: 접수번호가 만들어졌고(크립토 가용), 전화번호 형식이 맞을 때만 제출을 허용한다. */
  const canSubmit = acqCheckCanSubmit(f, receiptId, submitting);   // f.consent · f.consentIntl 둘 다 true 여야 한다(순수 함수, R4-F2)

  const copyReceiptId = () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && receiptId) {
        navigator.clipboard.writeText(receiptId).then(() => setCopied(true)).catch(() => {});
      }
    } catch (_e) {}
  };

  const submit = async () => {
    if (!canSubmit) return;
    submittingRef.current = true;
    setSubmitting(true); setError('');
    const w3fKey = (window.JT_DATA.integrations && window.JT_DATA.integrations.web3formsKey) || '';
    /* R3-F1·F3: 이 접수에는 공용 유입정보(jtAttributionFields)를 «합치지 않는다».
       utm_* 는 URL 에서 온 사용자 제어 문자열이라 불변식(자유 문자열 0)을 깨고, 세션 식별자(접수ID)는
       이 화면의 동의 문구에 고지하지 않았다. 제출 본문은 buildAcqCheckPayload 의 반환값이 «전부»다. */
    const payload = buildAcqCheckPayload(f, receiptId);
    const frozen = f;   // 이 시점의 값으로만 보낸다
    let sent = false;
    try {
      if (w3fKey && !w3fKey.includes('REPLACE')) {
        const res = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(buildAcqCheckRequest(frozen, receiptId, w3fKey)),
        });
        const data = await res.json().catch(() => ({}));
        // 200 + {} 를 성공으로 보면 안 된다 — Web3Forms 는 success 필드로 판정한다
        sent = !!(res.ok && data && data.success === true);
        if (!sent) throw new Error('submit_failed');
      } else {
        const body = buildAcqCheckMailBody(frozen, receiptId);
        window.location.href = `mailto:${window.JT_DATA.firm.email}?subject=${encodeURIComponent(payload._subject)}&body=${encodeURIComponent(body)}`;
        throw new Error('mailto_fallback');
      }
      setSentMethod(payload.연락방법);
      setDone(true);
    } catch (e) {
      const D = window.JT_DATA.firm;
      setError(
        e && e.message === 'mailto_fallback'
          ? `메일 앱으로 열었습니다. 전송이 되지 않았다면 전화(${D.phone}) 또는 카카오톡으로 연락해 주세요. 접수번호는 ${receiptId} 입니다.`
          : `전송에 실패했습니다. 전화(${D.phone}) 또는 카카오톡으로 다시 시도해 주세요. 접수번호는 ${receiptId} 입니다.`
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <>
        <section className="jt-page-hero">
          <div className="jt-page-hero__inner">
            <div className="jt-page-hero__crumb"><span>ACQUISITION TAX REVIEW</span><span>·</span><span>접수 완료</span></div>
            <h1>접수됐습니다.</h1>
          </div>
        </section>
        <section className="jt-section">
          <div className="jt-confirm">
            <div className="jt-kicker">RECEIPT — #{receiptId}</div>
            {/* R1-F2: 카카오톡을 고르면 저희 쪽에서 먼저 연락할 방법이 없다 — 「먼저 연락드립니다」를
                약속하지 않고, 채널에서 접수번호를 보내야 접수가 이어진다는 사실을 안내한다. */}
            {sentMethod === '카카오톡 채널' ? (
              <>
                <h2 className="jt-h2">카카오톡 채널에서 접수 번호를 보내 주세요.</h2>
                <p className="jt-body">
                  카카오톡은 저희 쪽에서 먼저 연락드릴 방법이 없습니다. 아래 접수 번호를 복사해 카카오톡 채널 대화창에 보내 주셔야 접수가 이어집니다.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', margin: '20px 0' }}>
                  <button type="button" className="jt-btn jt-btn--outline" onClick={copyReceiptId}>
                    {copied ? '복사됐습니다' : `접수번호 복사 (${receiptId})`}
                  </button>
                  <a className="jt-btn jt-btn--primary" href={window.jtKakaoUrl()} target="_blank" rel="noopener noreferrer">카카오톡 채널 열기 →</a>
                </div>
              </>
            ) : (
              <>
                <h2 className="jt-h2">써 주신 내용을 보고 담당 세무사가 연락드립니다.</h2>
                <p className="jt-body">
                  남겨 주신 내용만으로 1차 재검토를 한 뒤, 선택하신 연락 방법으로 안내해 드립니다. 이 단계에서는 서류를 보내지 않으셔도 됩니다.
                </p>
              </>
            )}
            <AcqCheckScopeNote />
            <div style={{ border: '1px solid var(--border-1)', padding: '20px 24px', margin: '24px 0', fontSize: 14, lineHeight: 1.75, maxWidth: 720 }}>
              <p style={{ margin: '0 0 10px' }}>
                취득세 감면은 신청이 있어야 받을 수 있습니다(지방세특례제한법 제183조 제1항). 신고 당시 감면을 신청하지 못했더라도, 경정청구를 하면서 그때 감면신청서를 함께 낼 수 있습니다(같은 법 시행령 제126조 제1항 제1호 단서).
              </p>
              <p style={{ margin: 0, fontWeight: 600 }}>
                다만 이것은 절차가 열려 있다는 뜻이지, 받아들여진다는 뜻은 아닙니다. 실체 요건과 취득일 당시의 법령·기한은 담당 세무사가 개별적으로 판단합니다.
              </p>
            </div>
            <p style={{ fontSize: 13, opacity: 0.75 }}>이 화면은 세액·차액·환급 가능성을 계산하거나 표시하지 않습니다.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
              <button className="jt-btn jt-btn--outline" onClick={() => setRoute('home')}>홈으로</button>
            </div>
            <p style={{ fontSize: 12, opacity: 0.6, marginTop: 40 }}>제이티 세무법인 · 광고책임세무사 이현준 대표세무사</p>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <section className="jt-page-hero">
        <div className="jt-page-hero__mark"><img src="project/assets/logo_symbol.png" alt="" /></div>
        <div className="jt-page-hero__inner">
          <div className="jt-page-hero__crumb"><span>ACQUISITION TAX</span><span>·</span><span>이미 낸 취득세 1차 재검토</span></div>
          <h1>이미 낸 취득세,<br/>써 주신 내용만으로 1차 재검토.</h1>
          <p className="jt-page-hero__sub">
            이 화면은 다시 계산해 드리는 것이 아니라 <strong>1차 재검토 접수</strong>입니다. 아래 항목만 적어 주시면 서류 없이 다시 볼 여지가 있는지 먼저 확인해 드립니다. 취득일 당시의 법령이 지금과 달라 현행 세율로 계산한 값을 그때 납부액과 나란히 두면 그 차이가 사실과 다르게 읽힐 수 있어, 금액은 계산하지 않습니다.
          </p>
        </div>
      </section>

      <section className="jt-section">
        <div style={{ border: '1px solid var(--border-1)', padding: '20px 24px', marginBottom: 32, fontSize: 14, lineHeight: 1.75, background: 'var(--bg-1,#f7f5f0)', maxWidth: 880 }}>
          <div className="jt-kicker">서류는 나중에</div>
          <p style={{ margin: '10px 0 0' }}>
            취득세 신고서·등기사항전부증명서·매매계약서·구청 통지서 같은 서류는 자문을 맡기시기로 한 뒤에 필요한 것만 알려드리고 받습니다. 지금은 아래에서 가지고 계신지만 표시해 주시면 됩니다.
          </p>
        </div>

        {/* R1-F4: Web Crypto 가 없으면 접수번호를 안전하게 못 만든다 — 구형 난수 폴백을 두지
            않고, 대신 이 화면에서 접수를 막고 다른 연락 방법을 안내한다. */}
        {!receiptId && (
          <div style={{ border: '1px solid #c00', padding: '16px 20px', marginBottom: 24, fontSize: 14, lineHeight: 1.7, background: '#fff5f5', maxWidth: 880 }}>
            <strong>이 브라우저에서는 접수 번호를 안전하게 만들 수 없습니다.</strong> 카카오톡 채널이나 전화로 문의해 주세요.
          </div>
        )}

        <form className="jt-form" onSubmit={(e) => e.preventDefault()}>
          {/* ② 어떤 부동산인지 (B-1 ②) */}
          <div className="jt-field">
            <label>어떤 부동산입니까</label>
            <select value={f.propertyType} onChange={set('propertyType')}>
              <option value="">선택해 주세요</option>
              {ACQ_CHECK_PROPERTY_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
              <option value="모름">모름</option>
            </select>
          </div>

          {/* 취득 원인 — B-1 밖의 선택지(증여·상속·법인 등 묶음을 가른다) */}
          <div className="jt-field">
            <label>취득 원인 <em>OPTIONAL</em></label>
            <select value={f.acquisitionType} onChange={set('acquisitionType')}>
              <option value="">선택해 주세요</option>
              {ACQ_CHECK_ACQUISITION_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
              <option value="모름">모름</option>
            </select>
          </div>

          {/* 소재지 — R2-F1: 시·군·구 자유입력란은 없앴다. 시·도 선택지만 받는다(조례가 시·도마다 다르다). */}
          <div className="jt-field">
            <label>물건 소재지 · 시·도 <em>OPTIONAL</em></label>
            <select value={f.sido} onChange={set('sido')}>
              <option value="">선택해 주세요</option>
              {ACQ_CHECK_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value="모름">모름</option>
            </select>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-3)' }}>시·군·구와 상세 주소는 받지 않습니다. 필요하면 세무사가 연락드릴 때 여쭙니다.</p>
          </div>

          {/* ③ 언제 취득했는지 (B-1 ③ — 정확한 날짜는 나중에) */}
          <div className="jt-field">
            <label>언제 취득하셨습니까 <em>아는 것만</em></label>
            <select value={f.acqDateType} onChange={set('acqDateType')}>
              <option value="">선택해 주세요</option>
              <option value="settlement">잔금일을 압니다</option>
              <option value="registry">등기접수일을 압니다</option>
              <option value="unknown">모름 · 대략만 압니다</option>
            </select>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-3)' }}>정확한 날짜는 나중에 확인해도 됩니다. 연·월만 아셔도 그 달 1일로 적어 주세요.</p>
          </div>
          {f.acqDateType && f.acqDateType !== 'unknown' && (
            <div className="jt-field">
              <label>그 날짜</label>
              <input type="date" value={f.acqDate} onChange={set('acqDate')} />
            </div>
          )}

          {/* ④ 취득세를 얼마 냈는지 — 대략 (B-1 ④). 세목별 금액은 받지 않는다(서류가 있어야 아는 값) */}
          <div className="jt-field">
            <label>취득세를 얼마 내셨습니까 <em>대략</em></label>
            <input type="text" inputMode="numeric" placeholder="원 · 대략" value={f.paidAmount ? Number(f.paidAmount).toLocaleString('ko-KR') : ''} onChange={setMoney('paidAmount')} />
          </div>

          {/* ⑤ 지금 상황 (B-1 ⑤) */}
          <div className="jt-field jt-field--full">
            <label>지금 상황이 어느 쪽입니까</label>
            <select value={f.situation} onChange={set('situation')}>
              <option value="">선택해 주세요</option>
              {ACQ_CHECK_SITUATIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {f.situation === ACQ_CHECK_SITUATIONS[1] && (
            <>
              <div className="jt-field">
                <label>통지서 이름 <em>꼭 적어 주십시오</em></label>
                <select value={f.noticeType} onChange={set('noticeType')}>
                  <option value="">선택해 주세요</option>
                  {ACQ_CHECK_NOTICE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                  <option value="모름">모름</option>
                </select>
              </div>
              <div className="jt-field">
                <label>받은 날짜 <em>꼭 적어 주십시오</em></label>
                <input type="date" value={f.noticeDate} onChange={set('noticeDate')} />
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-3)' }}>통지서 종류와 받은 날에 따라 남은 대응 기한이 다릅니다.</p>
              </div>
            </>
          )}
          {f.situation === ACQ_CHECK_SITUATIONS[2] && (
            <div className="jt-field">
              <label>거부 통지를 받은 날짜</label>
              <input type="date" value={f.rejectDate} onChange={set('rejectDate')} />
            </div>
          )}

          {/* ⑥ 가지고 계신 서류 (B-1 ⑥ — 지금 보내실 필요는 없습니다). 고정 라벨 복수 선택 */}
          <div className="jt-field jt-field--full">
            <label>아래 서류 중 가지고 계신 것 <em>지금 보내실 필요는 없습니다</em></label>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
              {ACQ_CHECK_DOC_ITEMS.map((item) => (
                <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={f.docItems.includes(item)} onChange={() => toggleDocItem(item)} />
                  {item}
                </label>
              ))}
            </div>
          </div>

          {/* ⑦ 어디에서 알게 됐는지 (B-1 ⑦ — G절 네 칸 ①) */}
          <div className="jt-field">
            <label>어디에서 저희를 알게 되셨습니까 <em>OPTIONAL</em></label>
            <select value={f.source} onChange={set('source')}>
              <option value="">선택해 주세요</option>
              {ACQ_CHECK_SOURCES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {/* ① 연락 방법 (B-1 ① — 성명은 받지 않는다. 카카오톡·전화에서 응대할 때 여쭙는다) */}
          <div className="jt-field">
            <label>연락 방법 <em>REQUIRED</em></label>
            <select value={f.contactMethod} onChange={set('contactMethod')} required>
              <option value="">선택해 주세요</option>
              {ACQ_CHECK_CONTACT_METHODS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            {/* R1-F2: 카카오톡을 고르면 저희가 먼저 연락할 방법이 없다 — 접수 전에 미리 알린다 */}
            {f.contactMethod === '카카오톡 채널' && (
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--fg-3)' }}>접수 후 채널에서 접수 번호를 보내 주셔야 합니다.</p>
            )}
          </div>
          {f.contactMethod === '전화' && (
            <div className="jt-field">
              <label>연락받으실 전화번호 <em>REQUIRED</em></label>
              <input type="tel" inputMode="tel" autoComplete="tel" placeholder="010-0000-0000" value={f.contactPhone} onChange={set('contactPhone')} />
              {/* R1-F2: 전화번호 형식 검증 — 숫자 9~11자리, 0으로 시작 */}
              {!phoneCheck.ok && f.contactPhone.trim() && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#c00' }}>전화번호 형식을 확인해 주세요(숫자·하이픈·공백·괄호·+ 만, 숫자 9~11자리·0 시작).</p>}
            </div>
          )}
        </form>

        <div style={{ marginTop: 32, maxWidth: 880 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.consent} onChange={set('consent')} style={{ marginTop: 3, width: 18, height: 18, accentColor: '#000' }} />
            <span style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6 }}>
              <strong>개인정보 수집·이용 동의</strong>(개인정보 보호법 §15①1호)<br />· <strong>목적</strong>: 취득세 1차 재검토 접수 및 결과 안내<br />· <strong>항목</strong>: 취득일·소재지 시·도·취득 원인·물건 종류·낸 취득세(대략)·지금 상황·통지서 종류와 받은 날·가지고 계신 서류(보유 여부만)·알게 되신 경로, 연락 방법(전화를 고르신 경우 전화번호) — 선택 항목은 비워 두셔도 접수됩니다<br />· <strong>함께 전송되는 정보</strong>: 접수번호(임의 생성), 접수 시각, 두 동의의 기록 — 유입 경로 정보는 이 접수에서 보내지 않습니다<br />· <strong>보유·이용기간</strong>: 상담 종료 후 3년 · 동의를 거부하실 수 있으며, 거부하시면 이 화면으로는 접수되지 않으나 전화·카카오톡으로 동일하게 문의하실 수 있습니다.
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.consentIntl} onChange={set('consentIntl')} style={{ marginTop: 3, width: 18, height: 18, accentColor: '#000' }} />
            <span style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6 }}>
              <strong>개인정보 국외 이전 동의</strong>(개인정보 보호법 §28의8①1호)<br />· <strong>이전 항목</strong>: 위 수집 항목 전부<br />· <strong>이전 국가·시기·방법</strong>: <b>미국</b>(US-East) · 제출 즉시 · 암호화 전송(HTTPS)<br />· <strong>이전받는 자</strong>: Web3Forms (Web3Creative, 인도) · support@web3forms.com<br />· <strong>이용목적·보유기간</strong>: 접수 내용을 사무소 메일로 전달하는 용도에 한함. 제출 내용은 저장하지 않으며 서버 접속 기록은 <b>2개월</b> 후 삭제<br />· <strong>거부할 권리</strong>: 거부하실 수 있습니다. 거부하시면 이 화면으로는 접수되지 않으나, 전화·카카오톡으로 동일하게 문의하실 수 있습니다.
            </span>
          </label>

          <AcqCheckScopeNote />

          <div style={{ marginTop: 28, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="jt-btn jt-btn--primary jt-btn--lg" disabled={!canSubmit} onClick={submit} style={{ opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
              {submitting ? '전송 중...' : <>1차 재검토 접수 <span className="jt-arrow">→</span></>}
            </button>
            {error && <span style={{ color: '#c00', fontSize: 13 }}>{error}</span>}
          </div>
        </div>

        <p style={{ fontSize: 12, opacity: 0.6, marginTop: 48 }}>제이티 세무법인 · 광고책임세무사 이현준 대표세무사</p>
      </section>
    </>
  );
}
/* 1차 재검토의 범위 — 4차본 B-4 첫 회신 문안과 같은 내용을 접수 «전»에 보여 준다.
   (tests_acq_check 로더가 JTReportAcqCheck «앞»을 순수 JS 로 실행하므로 JSX 헬퍼는 컴포넌트 뒤에 둔다 — 함수 선언은 끌어올려진다.)
   Q절: 접수 버튼 바로 위에 같은 크기로 붙이고, 접수 완료 화면에도 다시 단다. */
function AcqCheckScopeNote() {
  return (
    <div style={{ border: '1px solid var(--border-1)', padding: '20px 24px', margin: '28px 0 0', fontSize: 14, lineHeight: 1.75, maxWidth: 880 }}>
      <div className="jt-kicker">1차 재검토에서 하는 것</div>
      <p style={{ margin: '8px 0 10px' }}>
        접수 양식에 써 주신 내용으로 ①다시 볼 여지가 있는지 ②수임하게 되면 어떤 자료가 필요할지를 확인해,
        <strong> 「추가 검토 필요 / 사실관계 보완 / 판단 불가 / 가능성 낮음」</strong> 중 하나로 안내드리는 것까지입니다.
        이 단계에서는 서류를 보내지 않으셔도 됩니다. 서류 없이 내린 판단이므로 <strong>자료를 보면 결론이 달라질 수 있습니다.</strong>
      </p>
      <p style={{ margin: '0 0 10px' }}>
        서면 의견서 작성, 세액 계산, 구청 대응(경정청구·불복 제출)은 검토 범위와 보수를 견적으로 안내하고 동의를 받은 뒤에 시작합니다. 동의 전에는 어떤 서면도 제출하지 않습니다.
      </p>
      <p style={{ margin: 0, fontWeight: 600 }}>
        구청 통지서를 받으셨다면 대응 기한이 정해져 있습니다. 통지서 이름과 받으신 날짜를 알려 주시면 남은 날을 먼저 확인해 드립니다.
        다만 유료 수임이 확정되기 전에는 제이티가 대리와 기한 관리의 의무를 지지 않으므로, 기한은 고객께서도 함께 확인해 주십시오.
        결과를 보장하지 않으며, 사안마다 결론이 다르고 받아들여지지 않는 경우도 있습니다.
      </p>
    </div>
  );
}

window.JTReportAcqCheck = JTReportAcqCheck;

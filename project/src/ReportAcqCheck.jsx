/* @jsx React.createElement */
/* 「내가 낸 취득세 점검」 접수 — 260921 설계서 §2 그대로 구현한다.

   ⛔ 재계산기가 아니다. 경정청구는 5년 전 취득분까지 올라가는데 그 사건에 적용할 조문은
      «취득일 당시의 조문»이다(세대 판정·주택 수 산정·일시적2주택을 정하는 지방세법
      시행령 제28조의3~5가 해마다 바뀌었다). 현행 세율로 계산한 값을 과거 납부액과
      나란히 두면 그 차이는 «환급액»이 아니라 «법이 바뀐 폭»이다. 그래서 이 화면은
      세액·차액·환급 가능성을 계산하지도, 표시하지도 않는다 — 접수 확인만 보여 준다.
   ⛔ 「무료」를 쓰지 않는다. 범위·횟수·유료 전환 조건이 미확정이라 「1차 서류 점검」이라고만 쓴다.
   ⛔ GA4 — 관찰 기간(260921~1003) 동안 이 화면에서는 booking_submit 도, 새 이벤트도
      발화하지 않는다. 공용 유입정보(jtAttributionFields)도 이 접수에는 합치지 않는다(R3-F1·F3).
   ⛔ 동·호수, 주민등록번호, 파일 첨부는 받지 않는다(설계서 2-3).
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

/* R2-F2: 사후이력 상세는 자유 서술 대신 고정 라벨 중 복수 선택으로만 받는다. */
const ACQ_CHECK_POST_HISTORY_ITEMS = ['수정신고', '경정', '환급', '추가 고지', '모름'];

/* R2 공통: <select> 선택지 폐집합 — JSX 렌더와 payload 화이트리스트가 «같은 배열»을 본다
   (드리프트 방지). payload 조립은 이 배열들로 다시 한 번 소속을 확인해, DOM 이 아닌 다른
   경로(예: 상태 조작)로 값이 들어와도 허용 목록 밖이면 고정 문자열 「모름」으로 막는다. */
const ACQ_CHECK_ACQUISITION_TYPES = ['매매', '증여', '상속', '신축', '공매', '재산분할'];
const ACQ_CHECK_PROPERTY_TYPES = ['주택', '오피스텔', '상가', '토지'];
const ACQ_CHECK_OWNERSHIP_TYPES = ['단독', '공동', '법인'];
const ACQ_CHECK_NOTICE_TYPES = ['결정통지서', '경정통지서', '과세예고통지서', '추징통지서'];
const ACQ_CHECK_INFO_SOURCES = ['자료를 보고 적었습니다', '기억으로 적었습니다', '둘 다 섞여 있습니다'];
const ACQ_CHECK_CONTACT_METHODS = ['카카오톡 채널', '전화'];

/* 값이 허용 목록에 없으면 fallback(기본 「모름」)으로 막는다 — payload 화이트리스트의 공용 헬퍼. */
function acqCheckPick(value, allowed, fallback) {
  const fb = fallback === undefined ? '모름' : fallback;
  return allowed.indexOf(value) >= 0 ? value : fb;
}
window.acqCheckPick = acqCheckPick;

/* 준비하시면 좋은 자료 — «안내»일 뿐 첨부를 받지 않는다(설계서 2-2). */
const ACQ_CHECK_DOCS = [
  '취득세 신고서 또는 납부고지서(세목별 금액이 나뉘어 적힌 것)',
  '납부 영수증 또는 납부 확인서',
  '매매계약서(잔금일과 잔금 지급 내역이 보이는 부분)',
  '등기사항전부증명서',
  '취득일 당시의 주민등록표 등본 또는 초본',
  '구청에서 받은 결정·경정 통지서, 과세예고 통지서, 추징 통지서가 있으면 그것',
  '이미 감면을 신청했거나 받은 적이 있으면 그 신청서와 결정 안내문',
];

/* 시·도 17개 — ReportAcquisition.jsx 의 ACQ_REGIONS 와 같은 목록을 이 파일에서 독립적으로
   유지한다(그쪽 식별자에 기대지 않는다 — 그 파일의 이름이 바뀌어도 이 접수 화면이 조용히
   깨지지 않게 하기 위해서다). 세율·상수가 아니라 행정구역 명칭이라 별도 검증 없이 복제한다. */
const ACQ_CHECK_REGIONS = ['서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시',
  '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도',
  '경상북도', '경상남도', '제주특별자치도'];

const ACQ_CHECK_INIT = {
  acqDateType: '', acqDate: '',
  sido: '',
  acquisitionType: '', propertyType: '', ownership: '',
  reportedAcqTax: '', reportedEduTax: '', reportedFarmTax: '', reportedTotal: '',
  paidAmount: '', paidDate: '',
  postHistory: '', postHistoryItems: [],
  noticeType: '', noticeDate: '',
  infoSource: '',
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
  const paidDateCheck = validateAcqCheckDate(f.paidDate);
  const noticeDateCheck = validateAcqCheckDate(f.noticeDate);
  const contactMethod = acqCheckPick(f.contactMethod, ACQ_CHECK_CONTACT_METHODS, '');
  const phoneCheck = contactMethod === '전화' ? validateAcqCheckPhone(f.contactPhone) : { ok: true, digits: '' };
  const postHistory = acqCheckPick(f.postHistory, ['없음', '있음']);
  const postHistoryItems = Array.isArray(f.postHistoryItems) ? f.postHistoryItems : [];
  const validPostHistoryItems = postHistoryItems.filter((x) => ACQ_CHECK_POST_HISTORY_ITEMS.indexOf(x) >= 0);
  const postHistoryLabel = (postHistory === '있음' && validPostHistoryItems.length) ? validPostHistoryItems.join('·') : '—';

  return {
    _subject: `[JT 취득세 점검 접수] ${receiptId}`,
    구분: 'ACQ_CHECK',
    접수번호: receiptId,
    취득일_구분: f.acqDateType === 'settlement' ? '잔금일' : f.acqDateType === 'registry' ? '등기접수일' : '모름',
    취득일: acqDateCheck.ok && acqDateCheck.value ? acqDateCheck.value : '모름',
    소재지_시도: acqCheckPick(f.sido, ACQ_CHECK_REGIONS.concat(['모름'])),
    취득원인: acqCheckPick(f.acquisitionType, ACQ_CHECK_ACQUISITION_TYPES),
    물건종류: acqCheckPick(f.propertyType, ACQ_CHECK_PROPERTY_TYPES),
    명의와지분: acqCheckPick(f.ownership, ACQ_CHECK_OWNERSHIP_TYPES),
    신고서_취득세: acqCheckMoneyValue(f.reportedAcqTax) || '—',
    신고서_지방교육세: acqCheckMoneyValue(f.reportedEduTax) || '—',
    신고서_농어촌특별세: acqCheckMoneyValue(f.reportedFarmTax) || '—',
    신고서_합계만아는경우: acqCheckMoneyValue(f.reportedTotal) || '—',
    실제납부액: acqCheckMoneyValue(f.paidAmount) || '—',
    납부일: paidDateCheck.ok && paidDateCheck.value ? paidDateCheck.value : '모름',
    사후이력: postHistory,
    사후이력_상세: postHistoryLabel,
    통지서_종류: acqCheckPick(f.noticeType, ACQ_CHECK_NOTICE_TYPES.concat(['해당없음'])),
    통지서_수령일: noticeDateCheck.ok && noticeDateCheck.value ? noticeDateCheck.value : '모름',
    정보출처: acqCheckPick(f.infoSource, ACQ_CHECK_INFO_SOURCES),
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
  return { access_key: accessKey, subject: payload._subject, from_name: '홈페이지 취득세 점검 접수', ...payload };
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
  const togglePostHistoryItem = (item) => setFRaw((prev) => {
    if (submittingRef.current) return prev;
    const has = prev.postHistoryItems.includes(item);
    return { ...prev, postHistoryItems: has ? prev.postHistoryItems.filter((x) => x !== item) : [...prev.postHistoryItems, item] };
  });

  /* 최소 요건 — 두 동의와, «어떻게든 연락은 닿을 방법». 금액·날짜·자료 항목은 전부 비워도 된다
     (설계서 2-3: 「금액을 다 채우지 못해도 접수됩니다」). 연락 방법만은 예외다 — 접수 자체가
     「자료를 보고 연락드립니다」이므로 연락할 방법이 없으면 접수의 의미가 없다.
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
            <div className="jt-page-hero__crumb"><span>ACQUISITION TAX CHECK</span><span>·</span><span>접수 완료</span></div>
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
                <h2 className="jt-h2">자료를 보고 세무사가 연락드립니다.</h2>
                <p className="jt-body">
                  남겨 주신 내용을 바탕으로 담당 세무사가 확인한 뒤, 선택하신 연락 방법으로 안내해 드립니다.
                </p>
              </>
            )}
            <div style={{ border: '1px solid var(--border-1)', padding: '20px 24px', margin: '24px 0', fontSize: 14, lineHeight: 1.75, maxWidth: 720 }}>
              <p style={{ margin: '0 0 10px' }}>
                취득세 감면은 신청이 있어야 받을 수 있습니다(지방세특례제한법 제183조 제1항). 신고 당시 감면을 신청하지 못했더라도, 경정청구를 하면서 그때 감면신청서를 함께 내는 절차가 시행령에 있습니다(같은 법 시행령 제126조 제1항 제1호, 지방세기본법 제50조 제1항).
              </p>
              <p style={{ margin: 0, fontWeight: 600 }}>
                다만 이것은 절차가 열려 있다는 뜻이지, 받아들여진다는 뜻은 아닙니다. 실체 요건과 취득일 당시의 법령·기한은 자료를 확인한 뒤 담당 세무사가 개별적으로 판단합니다.
              </p>
            </div>
            <p style={{ fontSize: 13, opacity: 0.75 }}>이 화면은 세액·차액·환급 가능성을 계산하거나 표시하지 않습니다.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
              <button className="jt-btn jt-btn--outline" onClick={() => setRoute('home')}>홈으로</button>
            </div>
            <p style={{ fontSize: 12, opacity: 0.6, marginTop: 40 }}>제이티 세무법인 · 광고 담당 세무사 이현준</p>
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
          <div className="jt-page-hero__crumb"><span>ACQUISITION TAX</span><span>·</span><span>내가 낸 취득세 점검</span></div>
          <h1>이미 낸 취득세,<br/>서류부터 점검받아 보세요.</h1>
          <p className="jt-page-hero__sub">
            이 화면은 다시 계산해 드리는 것이 아니라 <strong>서류 점검 접수</strong>입니다. 취득일 당시의 법령이 지금과 달라 현행 세율로 계산한 값을 그때 납부액과 나란히 두면 그 차이가 「법이 바뀐 폭」일 뿐 환급액이 아닐 수 있습니다. 그래서 자료를 먼저 받아 담당 세무사가 확인합니다.
          </p>
        </div>
      </section>

      <section className="jt-section">
        <div style={{ border: '1px solid var(--border-1)', padding: '20px 24px', marginBottom: 32, fontSize: 14, lineHeight: 1.75, background: 'var(--bg-1,#f7f5f0)', maxWidth: 880 }}>
          <div className="jt-kicker">준비하시면 좋은 자료 (있는 만큼만 — 지금 없어도 접수됩니다)</div>
          <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
            {ACQ_CHECK_DOCS.map((d, i) => <li key={i} style={{ marginBottom: 4 }}>{d}</li>)}
          </ul>
        </div>

        {/* R1-F4: Web Crypto 가 없으면 접수번호를 안전하게 못 만든다 — 구형 난수 폴백을 두지
            않고, 대신 이 화면에서 접수를 막고 다른 연락 방법을 안내한다. */}
        {!receiptId && (
          <div style={{ border: '1px solid #c00', padding: '16px 20px', marginBottom: 24, fontSize: 14, lineHeight: 1.7, background: '#fff5f5', maxWidth: 880 }}>
            <strong>이 브라우저에서는 접수 번호를 안전하게 만들 수 없습니다.</strong> 카카오톡 채널이나 전화로 문의해 주세요.
          </div>
        )}

        <form className="jt-form" onSubmit={(e) => e.preventDefault()}>
          {/* ① 취득일 */}
          <div className="jt-field">
            <label>취득일 <em>아는 것만</em></label>
            <select value={f.acqDateType} onChange={set('acqDateType')}>
              <option value="">선택해 주세요</option>
              <option value="settlement">잔금일을 압니다</option>
              <option value="registry">등기접수일을 압니다</option>
              <option value="unknown">모름</option>
            </select>
          </div>
          {f.acqDateType && f.acqDateType !== 'unknown' && (
            <div className="jt-field">
              <label>그 날짜</label>
              <input type="date" value={f.acqDate} onChange={set('acqDate')} />
            </div>
          )}

          {/* ② 소재지 — R2-F1: 시·군·구 자유입력란은 없앴다. 시·도 선택지만 받는다. */}
          <div className="jt-field">
            <label>물건 소재지 · 시·도</label>
            <select value={f.sido} onChange={set('sido')}>
              <option value="">선택해 주세요</option>
              {ACQ_CHECK_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value="모름">모름</option>
            </select>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-3)' }}>시·군·구와 상세 주소는 받지 않습니다. 필요하면 세무사가 연락드릴 때 여쭙니다.</p>
          </div>

          {/* ③ 취득 원인 */}
          <div className="jt-field">
            <label>취득 원인</label>
            <select value={f.acquisitionType} onChange={set('acquisitionType')}>
              <option value="">선택해 주세요</option>
              {ACQ_CHECK_ACQUISITION_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
              <option value="모름">모름</option>
            </select>
          </div>

          {/* ④ 물건 종류 */}
          <div className="jt-field">
            <label>물건 종류</label>
            <select value={f.propertyType} onChange={set('propertyType')}>
              <option value="">선택해 주세요</option>
              {ACQ_CHECK_PROPERTY_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
              <option value="모름">모름</option>
            </select>
          </div>

          {/* ⑤ 명의와 지분 */}
          <div className="jt-field">
            <label>명의와 지분</label>
            <select value={f.ownership} onChange={set('ownership')}>
              <option value="">선택해 주세요</option>
              {ACQ_CHECK_OWNERSHIP_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
              <option value="모름">모름</option>
            </select>
          </div>

          {/* ⑥ 신고서에 적힌 세목별 금액 — 각각. 합계만 아는 경우 합계만 */}
          <div className="jt-field jt-field--full">
            <label>신고서에 적힌 금액 <em>있는 만큼만</em></label>
            <p style={{ margin: '-4px 0 6px', fontSize: 13, color: 'var(--fg-3)' }}>세목별로 나뉘어 있으면 각각, 합계만 아시면 합계 칸만 채워 주세요.</p>
          </div>
          <div className="jt-field">
            <label>취득세 <em>OPTIONAL</em></label>
            <input type="text" inputMode="numeric" placeholder="원" value={f.reportedAcqTax ? Number(f.reportedAcqTax).toLocaleString('ko-KR') : ''} onChange={setMoney('reportedAcqTax')} />
          </div>
          <div className="jt-field">
            <label>지방교육세 <em>OPTIONAL</em></label>
            <input type="text" inputMode="numeric" placeholder="원" value={f.reportedEduTax ? Number(f.reportedEduTax).toLocaleString('ko-KR') : ''} onChange={setMoney('reportedEduTax')} />
          </div>
          <div className="jt-field">
            <label>농어촌특별세 <em>OPTIONAL</em></label>
            <input type="text" inputMode="numeric" placeholder="원" value={f.reportedFarmTax ? Number(f.reportedFarmTax).toLocaleString('ko-KR') : ''} onChange={setMoney('reportedFarmTax')} />
          </div>
          <div className="jt-field">
            <label>합계만 아는 경우 <em>OPTIONAL</em></label>
            <input type="text" inputMode="numeric" placeholder="원" value={f.reportedTotal ? Number(f.reportedTotal).toLocaleString('ko-KR') : ''} onChange={setMoney('reportedTotal')} />
          </div>

          {/* ⑦ 실제로 낸 금액과 납부일 */}
          <div className="jt-field">
            <label>실제로 낸 금액 <em>OPTIONAL</em></label>
            <input type="text" inputMode="numeric" placeholder="원" value={f.paidAmount ? Number(f.paidAmount).toLocaleString('ko-KR') : ''} onChange={setMoney('paidAmount')} />
          </div>
          <div className="jt-field">
            <label>납부일 <em>OPTIONAL</em></label>
            <input type="date" value={f.paidDate} onChange={set('paidDate')} />
          </div>

          {/* ⑧ 그 뒤 수정신고·경정·환급·추가 고지 이력 */}
          <div className="jt-field">
            <label>그 뒤 수정신고·경정·환급·추가 고지가 있었나요?</label>
            <select value={f.postHistory} onChange={set('postHistory')}>
              <option value="">선택해 주세요</option>
              <option value="없음">없음</option>
              <option value="있음">있음</option>
              <option value="모름">모름</option>
            </select>
          </div>
          {/* R2-F2: 자유 서술 대신 고정 라벨 복수 선택으로만 받는다 */}
          {f.postHistory === '있음' && (
            <div className="jt-field jt-field--full">
              <label>어떤 것이었는지 <em>있는 만큼 선택</em></label>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
                {ACQ_CHECK_POST_HISTORY_ITEMS.map((item) => (
                  <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                    <input type="checkbox" checked={f.postHistoryItems.includes(item)} onChange={() => togglePostHistoryItem(item)} />
                    {item}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ⑨ 통지서 종류와 받은 날 */}
          <div className="jt-field">
            <label>통지서를 받으셨다면 종류</label>
            <select value={f.noticeType} onChange={set('noticeType')}>
              <option value="">선택해 주세요</option>
              {ACQ_CHECK_NOTICE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
              <option value="해당없음">받은 것 없음</option>
              <option value="모름">모름</option>
            </select>
          </div>
          {f.noticeType && f.noticeType !== '해당없음' && f.noticeType !== '모름' && (
            <div className="jt-field">
              <label>받은 날 <em>OPTIONAL</em></label>
              <input type="date" value={f.noticeDate} onChange={set('noticeDate')} />
            </div>
          )}

          {/* ⑩ 자료를 보고 적었는지, 기억으로 적었는지 */}
          <div className="jt-field jt-field--full">
            <label>위 내용은 자료를 보고 적으신 건가요, 기억으로 적으신 건가요?</label>
            <select value={f.infoSource} onChange={set('infoSource')}>
              <option value="">선택해 주세요</option>
              {ACQ_CHECK_INFO_SOURCES.map((v) => <option key={v} value={v}>{v}</option>)}
              <option value="모름">모름</option>
            </select>
          </div>

          {/* ⑪ 연락 방법 */}
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
              <strong>개인정보 수집·이용 동의</strong>(개인정보 보호법 §15①1호)<br />· <strong>목적</strong>: 취득세 서류 점검 접수 및 결과 안내<br />· <strong>항목</strong>: 취득일·소재지 시·도·취득 원인·물건 종류·명의와 지분·신고서상 세목별 금액·실제 납부액과 납부일·이후 이력·통지서 종류와 수령일·자료 확인 여부, 연락 방법(선택하신 경우 연락처) — 선택 항목은 비워 두셔도 접수됩니다<br />· <strong>함께 전송되는 정보</strong>: 접수번호(임의 생성), 접수 시각, 두 동의의 기록 — 유입 경로 정보는 이 접수에서 보내지 않습니다<br />· <strong>보유·이용기간</strong>: 상담 종료 후 3년 · 동의를 거부하실 수 있으며, 거부하시면 이 화면으로는 접수되지 않으나 전화·카카오톡으로 동일하게 문의하실 수 있습니다.
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.consentIntl} onChange={set('consentIntl')} style={{ marginTop: 3, width: 18, height: 18, accentColor: '#000' }} />
            <span style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6 }}>
              <strong>개인정보 국외 이전 동의</strong>(개인정보 보호법 §28의8①1호)<br />· <strong>이전 항목</strong>: 위 수집 항목 전부<br />· <strong>이전 국가·시기·방법</strong>: <b>미국</b>(US-East) · 제출 즉시 · 암호화 전송(HTTPS)<br />· <strong>이전받는 자</strong>: Web3Forms (Web3Creative, 인도) · support@web3forms.com<br />· <strong>이용목적·보유기간</strong>: 접수 내용을 사무소 메일로 전달하는 용도에 한함. 제출 내용은 저장하지 않으며 서버 접속 기록은 <b>2개월</b> 후 삭제<br />· <strong>거부할 권리</strong>: 거부하실 수 있습니다. 거부하시면 이 화면으로는 접수되지 않으나, 전화·카카오톡으로 동일하게 문의하실 수 있습니다.
            </span>
          </label>

          <div style={{ marginTop: 28, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="jt-btn jt-btn--primary jt-btn--lg" disabled={!canSubmit} onClick={submit} style={{ opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
              {submitting ? '전송 중...' : <>1차 서류 점검 접수 <span className="jt-arrow">→</span></>}
            </button>
            {error && <span style={{ color: '#c00', fontSize: 13 }}>{error}</span>}
          </div>
          <p style={{ fontSize: 12, opacity: 0.65, marginTop: 12, maxWidth: 640 }}>
            지금은 「1차 서류 점검」의 범위·횟수·유료로 넘어가는 지점이 확정되지 않았습니다. 확정되는 대로 이 화면에 안내를 더합니다.
          </p>
        </div>

        <p style={{ fontSize: 12, opacity: 0.6, marginTop: 48 }}>제이티 세무법인 · 광고 담당 세무사 이현준</p>
      </section>
    </>
  );
}
window.JTReportAcqCheck = JTReportAcqCheck;

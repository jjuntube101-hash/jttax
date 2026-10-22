/* global React */
const { useState: useStatePg2, useEffect: useEffectPg2 } = React;

// ============ Contact / Location page ============
const JT_PREPARATION = {
  '양도·상속·증여': ['검토할 재산과 거래·이전 예정 시점', '취득·양도 계약서 또는 재산 목록의 보유 여부', '함께 검토할 가족관계와 이전 신고 내역'],
  '세무조사 대응': ['받은 안내문·통지서의 종류와 수령일', '대상 기간과 회신·제출 기한', '기존 신고 자료와 소명 자료의 보유 여부'],
  '세무기장·세금 신고': ['사업 형태와 시작 시점', '최근 신고 내역과 장부 정리 범위', '매출·매입·급여 자료를 관리하는 방식'],
  '세금 종합 컨설팅': ['검토할 거래나 의사결정', '예상 일정과 비교할 대안', '현재까지 정리한 자료의 종류'],
  '경정청구': ['다시 검토할 세금과 신고 연도', '신고서·납부 내역의 보유 여부', '수정이 필요하다고 생각한 이유'],
  '취득세': ['취득 원인과 예정일 또는 취득일', '취득할 재산과 보유 주택 현황', '계약·신고·납부 자료의 보유 여부'],
  '유튜버·크리에이터 세무': ['수익을 받는 플랫폼과 사업자등록 여부', '플랫폼별 정산 자료의 보유 여부', '기장·신고 중 필요한 업무와 대상 기간'],
  '기타 / 분야 모름': ['궁금한 내용을 한두 문장으로 정리', '정해진 일정이나 받은 문서의 유무', '현재 어떤 도움이 필요한지'],
};
function JTRenewPreparation({ topic }) {
  const list = JT_PREPARATION[topic] || JT_PREPARATION['기타 / 분야 모름'];
  const [checked, setChecked] = useStatePg2({});
  useEffectPg2(() => setChecked({}), [topic]);
  return <details className="jt-renew-preparation" open><summary>상담 전에 정리해 두면 좋은 것 <span>선택 사항</span></summary><p>아는 내용만 확인해 주세요. 자료가 없어도 상담을 신청할 수 있습니다.</p><div className="jt-renew-preparation-list">{list.map((item, i) => <label key={item}><input type="checkbox" checked={!!checked[i]} onChange={e => setChecked({...checked, [i]:e.target.checked})} /><span>{item}</span></label>)}</div><p className="jt-renew-help">체크한 내용은 전송하지 않습니다. 주민등록번호·계좌번호 등 민감한 정보는 이 단계에서 입력하지 마세요.</p></details>;
}
function JTContact({ setRoute }) {
  const D = window.JT_DATA.firm;
  return (
    <div className="jt-renew-contact">
      <section className="jt-renew-flow-intro"><div className="jt-renew-flow-wrap"><h1>어디서부터 시작할지,<br />함께 정리합니다.</h1><p>상담이 필요한 상황과 일정을 알려주세요.<br />검토할 업무와 진행 방법을 안내합니다.</p></div></section>
      <section className="jt-renew-flow-wrap jt-renew-contact-methods" aria-labelledby="jt-contact-methods-title"><h2 id="jt-contact-methods-title">편한 방법으로 연락해 주세요.</h2><div className="jt-renew-channel-grid">
        <article><h3>상황을 정리해 남기기</h3><p>문의 분야와 연락처를 남기면 담당자가 연락드립니다.</p><button className="jt-btn jt-btn--primary" onClick={() => { window.jtTrackCta('booking', 'contact'); setRoute('booking'); }}>상담 신청 <span aria-hidden="true">→</span></button></article>
        <article><h3>전화로 문의하기</h3><p>{D.businessHours}<br />일정이 촉박한 사안은 연락 시 함께 말씀해 주세요.</p><a className="jt-renew-contact-link" href={'tel:' + D.phone} onClick={() => window.jtTrackCta('call', 'contact')}>{D.phone}</a></article>
        <article><h3>카카오톡으로 문의하기</h3><p>궁금한 내용과 연락 가능한 시간을 채팅으로 남겨주세요.</p><a className="jt-renew-contact-link" href={window.jtKakaoUrl()} target="_blank" rel="noopener noreferrer" onClick={() => window.jtTrackCta('kakao', 'contact')}>카카오톡 채널 <span aria-hidden="true">↗</span></a></article>
      </div><p className="jt-renew-contact-email">이메일로도 문의하실 수 있습니다. <a href={'mailto:' + D.email} onClick={() => window.jtTrackCta('email', 'contact')}>{D.email}</a></p></section>
      <section className="jt-renew-process"><div className="jt-renew-flow-wrap"><h2>상담은 이렇게 진행합니다.</h2><ol><li><h3>상황과 일정 확인</h3><p>어떤 검토가 필요한지, 정해진 일정이 있는지 먼저 확인합니다.</p></li><li><h3>업무 범위·보수 안내</h3><p>필요한 자료와 검토 범위를 확인한 뒤 견적으로 안내합니다.</p></li><li><h3>자료 검토와 설명</h3><p>합의한 자문 범위에 따라 검토하고 판단의 근거를 설명합니다.</p></li></ol><JTRenewPreparation topic="기타 / 분야 모름" /></div></section>
      <section className="jt-renew-flow-wrap jt-renew-visit" aria-labelledby="jt-visit-title"><div><h2 id="jt-visit-title">방문 상담 안내</h2><p>방문 전 일정을 예약해 주세요.<br />강남역 4번 출구에서 도보 2분입니다.</p><dl><dt>주소</dt><dd>{D.address}</dd><dt>운영 시간</dt><dd>{D.businessHours} · 주말·공휴일 휴무</dd><dt>주차</dt><dd>건물 지하 주차장 이용 · 방문 시 안내</dd></dl><div className="jt-renew-map-links"><a href={D.kakaoMapUrl} target="_blank" rel="noopener noreferrer">카카오맵 ↗</a><a href={D.naverMapUrl} target="_blank" rel="noopener noreferrer">네이버지도 ↗</a><a href={D.googleMapUrl} target="_blank" rel="noopener noreferrer">구글지도 ↗</a></div></div><div className="jt-map__canvas"><iframe title="제이티 세무법인 위치 지도" src={'https://www.google.com/maps?q=' + encodeURIComponent(D.address) + '&z=17&hl=ko&output=embed'} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /></div></section>
    </div>
  );
}
window.JTContact = JTContact;

// ============ Booking form (multi-step) ============
// 홈 상황 색인(Home.jsx JT_SITUATIONS.slug)과 같은 폐집합. 값은 아래 topics 의 k 와 글자까지 같아야 한다.
const JT_BOOKING_SLUGS = { asset: '양도·상속·증여', bookkeeping: '세무기장·세금 신고', audit: '세무조사 대응', refund: '경정청구', consulting: '세금 종합 컨설팅', acquisition: '취득세', creators: '유튜버·크리에이터 세무', general: '' };
// 주소의 slug 가 허용 목록에 있으면 그것이 우선, 없으면 저장소 값. 순수 함수 — tests_hero_calc 가 꺼내 실행한다.
function jtResolveBookingTopic(sub, stored) {
  if (Object.prototype.hasOwnProperty.call(JT_BOOKING_SLUGS, sub)) return JT_BOOKING_SLUGS[sub];
  // 명칭 변경 전 탭에서 저장한 상담 분야도 새 선택지로 이어 준다.
  if (stored === '기장·세금 신고') return '세무기장·세금 신고';
  if (stored === '크리에이터 세금') return '유튜버·크리에이터 세무';
  return stored || '';
}
function jtBookingSlugFromHash() {
  try { const r = window.JTRouter && window.JTRouter.parse(); return (r && r.route === 'booking' && r.sub) || ''; } catch(_){ return ''; }
}
function JTBooking({ setRoute }) {
  const [step, setStep] = useStatePg2(1);
  const preferredSlot = (() => { try { return sessionStorage.getItem('jt_preferred_slot') || ''; } catch(_){ return ''; } })();
  // 진입 시 한 번만 정한다. 저장소 접근이 막혀도(예외) 주소의 slug 해석은 독립적으로 수행한다.
  const [preferredTopic, setPreferredTopic] = useStatePg2(() => {
    let stored = '';
    try { stored = sessionStorage.getItem('jt_preferred_topic') || ''; } catch(_){}
    // 한 번 사용 후 비움 — 다음 진입 시 영향 X
    try { if (stored) sessionStorage.removeItem('jt_preferred_topic'); } catch(_){}
    return jtResolveBookingTopic(jtBookingSlugFromHash(), stored);
  });
  const [form, setForm] = useStatePg2({
    topic: preferredTopic,
    name: '', company: '', email: '', phone: '',
    channel: '전화', msg: preferredSlot ? `희망 상담 시간: ${preferredSlot}\n\n` : '', consent: false,
    /* §28의8①1호는 국외 이전에 «별도의» 동의를 요구한다 — 위 consent 와 합치면 안 된다 */
    consentIntl: false,
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target && e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  // 같은 화면에서 주소의 slug 만 바뀌면(#/booking/asset → /audit) 분야만 맞추고 작성 중인 다른 값은 유지한다.
  useEffectPg2(() => {
    const onHash = () => {
      const sub = jtBookingSlugFromHash();
      if (!Object.prototype.hasOwnProperty.call(JT_BOOKING_SLUGS, sub)) return;
      const t = JT_BOOKING_SLUGS[sub];
      setPreferredTopic(t);
      setForm((f) => ({ ...f, topic: t }));
      if (!t) setStep(1); // 일반 상담으로 바뀌면 분야가 비므로 분야 선택 단계로 돌아간다(입력한 연락처는 유지)
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [done, setDone] = useStatePg2(false);
  const [submitting, setSubmitting] = useStatePg2(false);
  const [submitError, setSubmitError] = useStatePg2('');
  const stepHeadingRef = React.useRef(null);
  const mountedRef = React.useRef(false);
  useEffectPg2(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (stepHeadingRef.current) { stepHeadingRef.current.focus({preventScroll:true}); stepHeadingRef.current.scrollIntoView({block:'start', behavior:'auto'}); }
  }, [step]);

  const topics = [
    { k: '양도·상속·증여', d: '재산을 팔거나 물려줄 때의 세금' },
    { k: '세무조사 대응', d: '조사 통지·현장·불복' },
    { k: '세무기장·세금 신고', d: '법인·개인의 월간 운영' },
    { k: '세금 종합 컨설팅', d: '거래 전에 세금과 선택지 검토' },
    { k: '경정청구', d: '이미 신고한 세금의 재검토' },
    { k: '취득세', d: '재산 취득 전후의 신고·검토' },
    { k: '유튜버·크리에이터 세무', d: '플랫폼 수익의 장부·신고' },
    { k: '기타 / 분야 모름', d: '어디에 속하는지 알 수 없는 경우' },
  ];

  if (done) {
    return (
      <>
        <section className="jt-page-hero">
          <div className="jt-page-hero__inner">
            <div className="jt-page-hero__crumb"><span>상담 신청</span><span>·</span><span>접수 완료</span></div>
            <h1>접수되었습니다.</h1>
          </div>
        </section>
        <section className="jt-section">
          <div className="jt-confirm">
            {/* 접수번호 = payload 로 실제 전송되는 접수ID(jtAttribution 의 sid) — 종전의 별개 난수는
                접수 메일과 대조가 안 돼 추적이 불가능했다 (260830 전수검사 A9) */}
            <div className="jt-kicker">접수번호 — #{(window.jtAttribution && window.jtAttribution().sid) || '—'}</div>
            <h2 className="jt-h2">상담 접수가 완료되었습니다.</h2>
            <p className="jt-body">
              접수 내용을 확인한 뒤 <b>기재해 주신 연락처</b>로 연락드립니다.<br/>
              기한이 정해진 사안은 전화로 일정도 함께 알려주세요.
            </p>
            <div style={{display: 'flex', gap: 12, flexWrap: 'wrap'}}>
              <button className="jt-btn jt-btn--primary" onClick={() => { setDone(false); setStep(1); setForm({ topic: '', name: '', company: '', email: '', phone: '', channel: '전화', msg: '', consent: false, consentIntl: false }); }}>
                새 문의 작성
              </button>
              <button className="jt-btn jt-btn--outline" onClick={() => setRoute('home')}>
                홈으로
              </button>
            </div>
          </div>
        </section>
      </>
    );
  }

  const canNext1 = form.topic;
  const canNext2 = form.name && form.phone;
  const canSubmit = form.consent && form.consentIntl;   // §28의8 별도 동의 — 둘 다 있어야 전송

  const submitBooking = async () => {
    if (!canSubmit || submitting) return;
    // 분야·연락처는 제출 직전에 다시 본다 — 주소 변경 등으로 비워진 채 뒤 단계에 남았으면 해당 단계로 돌려보낸다.
    if (!canNext1) { setStep(1); return; }
    if (!canNext2) { setStep(2); return; }
    setSubmitting(true);
    setSubmitError('');
    const w3fKey = (window.JT_DATA.integrations && window.JT_DATA.integrations.web3formsKey) || '';
    /* 크리에이터 허브(/creators.html)에서 경로를 고른 세션이면 그 값을 접수에 병합한다.
       jt_preferred_topic 과 달리 «지우지 않는다» — 귀속 규칙이 «세션 최초 선택 고정»이라
       같은 세션의 재접수에도 같은 경로가 실려야 분모(GA4 path_select)와 어긋나지 않는다.
       (성장기획_크리에이터SEO_260830.md §1단계 계측 스펙) */
    const creatorPath = (() => { try { return sessionStorage.getItem('jt_creator_path') || ''; } catch (_) { return ''; } })();
    const CREATOR_PATH_LABEL = { first: 'first(첫 정산)', side: 'side(직장 겸업)', mcn: 'mcn(팀·MCN)' };
    const payload = {
      _subject: `[JT 상담예약] ${form.topic} · ${form.name}`,
      구분: 'BOOKING',
      문의분야: form.topic,
      성명: form.name,
      회사: form.company || '—',
      이메일: form.email || '—',
      연락처: form.phone,
      선호채널: form.channel,
      문의내용: form.msg || '—',
      // 값이 없으면 필드 자체를 생략한다 — KPI 대시보드가 «크리에이터경로 없음 = 일반 접수»로 읽는다
      ...(creatorPath ? { 크리에이터경로: CREATOR_PATH_LABEL[creatorPath] || creatorPath } : {}),
      접수시각: new Date().toLocaleString('ko-KR'),
      // 어느 채널이 이 상담을 만들었는지 — 최초 진입 시점의 값이 보존된다 (Chrome.jsx)
      ...window.jtAttributionFields('booking_form'),
    };
    /* ⚠️ 두 가지를 «전송 성공 이후»로 옮겼다 (260808).
         ① GA4 booking_submit — 종전엔 fetch 이전에 발화해 실패·이탈 건까지 전환으로
            세었다. 전환 수치가 부풀려지면 그 수치로 내리는 모든 판단이 틀어진다.
         ② 완료 화면(setDone) — mailto 폴백은 메일 앱이 없는 기기에서 아무 일도
            일어나지 않는데 화면에는 「접수되었습니다」가 떴다. 사무소에는 아무것도
            오지 않은 채 방문자만 기다리게 된다.
       그래서 «실제로 사무소에 도달했는가»를 sent 로 따로 판정한다 — 리포트 PDF 게이트가
       260806 에 먼저 쓴 방식과 같다(ReportConvert.jsx). */
    let sent = false;
    try {
      if (w3fKey && !w3fKey.includes('REPLACE')) {
        const res = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ access_key: w3fKey, subject: payload._subject, from_name: form.name || '홈페이지 상담 접수', replyto: form.email || '', ...payload }),
        });
        const data = await res.json().catch(() => ({}));
        // 200 + {} 를 성공으로 보면 안 된다 — Web3Forms 는 success 필드로 판정한다
        sent = !!(res.ok && data && data.success === true);
        if (!sent) throw new Error('submit_failed');
      } else {
        /* 키 미설정 폴백 — 메일 앱을 열어 보되, «열렸다»를 «접수됐다»로 승격하지 않는다.
           mailto 는 성공 여부를 알려주지 않으므로 sent 는 false 로 둔다. */
        const body = Object.entries(payload).map(([k, v]) => `${k}: ${v}`).join('\n');
        window.location.href = `mailto:${window.JT_DATA.firm.email}?subject=${encodeURIComponent(payload._subject)}&body=${encodeURIComponent(body)}`;
        throw new Error('mailto_fallback');
      }
      /* jtEvent 로 감싸는 이유 — gtag 가 throw 하면(광고차단기 등) 이 자리가 catch 로
         빠져 «접수는 됐는데 실패 화면»이 뜬다. 계측이 접수를 망치지 않게 한다. */
      // 260906 C0 — 예약 유래(booking_origin·route)를 동봉한다. 개인정보·금액 없음 (Chrome.jsx jtBookingOrigin)
      window.jtEvent('booking_submit', Object.assign({ topic: form.topic, channel: form.channel },
        (window.jtBookingOrigin ? window.jtBookingOrigin.params() : {})));
      setDone(true);
    } catch (e) {
      const D = window.JT_DATA.firm;
      setSubmitError(
        e && e.message === 'mailto_fallback'
          ? `메일 앱으로 열었습니다. 전송이 되지 않았다면 전화(${D.phone}) 또는 카카오톡으로 연락해 주세요.`
          : `전송에 실패했습니다. 전화(${D.phone}) 또는 카카오톡으로 다시 시도해 주세요.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="jt-page-booking jt-renew-booking">
      <section className="jt-page-hero">
        <div className="jt-page-hero__mark"><img src="project/assets/logo_symbol.png" alt="" /></div>
        <div className="jt-page-hero__inner">
          <div className="jt-page-hero__crumb">상담 신청</div>
          <h1>지금 필요한 상담을<br />알려주세요.</h1>
          <p className="jt-page-hero__sub">
            분야를 고르고 연락처를 남겨주세요. 접수 내용을 확인한 뒤 연락드립니다. 검토 범위와 보수는 별도로 안내하며, 자문은 합의한 범위에 따라 진행합니다.
          </p>
        </div>
      </section>

      <section className="jt-section">
        <a className="jt-kakao-cta" href={window.jtKakaoUrl()} target="_blank" rel="noopener"
          onClick={() => { window.jtEvent('booking_kakao_top'); window.jtTrackCta('kakao', 'booking_top'); }}>
          <span className="jt-kakao-cta__msg">
            <span aria-hidden="true" style={{flexShrink: 0, display: 'inline-flex'}}>{React.createElement(window.JTIcon, { name: 'chat' })}</span>
            <span>짧은 문의는 <b>카카오톡으로 남겨주셔도 됩니다.</b></span>
          </span>
          <span className="jt-kakao-cta__go">카카오톡 문의 ↗</span>
        </a>
        <div className="jt-stepper" role="list" aria-label="상담 신청 진행 단계">
          <div className={`jt-stepper__step ${step >= 1 ? (step > 1 ? 'is-done' : 'is-active') : ''}`} role="listitem" aria-current={step === 1 ? 'step' : undefined}>
            <div className="jt-stepper__num">1</div>
            <div><div className="jt-stepper__label">문의 분야</div><div className="jt-stepper__sub">분야 선택</div></div>
          </div>
          <div className={`jt-stepper__step ${step >= 2 ? (step > 2 ? 'is-done' : 'is-active') : ''}`} role="listitem" aria-current={step === 2 ? 'step' : undefined}>
            <div className="jt-stepper__num">2</div>
            <div><div className="jt-stepper__label">연락처</div><div className="jt-stepper__sub">연락 정보</div></div>
          </div>
          <div className={`jt-stepper__step ${step >= 3 ? 'is-active' : ''}`} role="listitem" aria-current={step === 3 ? 'step' : undefined}>
            <div className="jt-stepper__num">3</div>
            <div><div className="jt-stepper__label">내용 확인</div><div className="jt-stepper__sub">접수 확인</div></div>
          </div>
        </div>

        {step === 1 && (
          <div>
            <div className="jt-kicker">1단계 · 어떤 사안인가요?</div>
            <h2 className="jt-h2 jt-booking-step-heading" ref={stepHeadingRef} tabIndex={-1} style={{marginBottom: (preferredTopic && form.topic === preferredTopic) ? 24 : 40}}>상담 분야를 선택해 주세요.</h2>
            {/* 안내는 실제 제출될 form.topic 과 같을 때만 — 사용자가 다른 분야로 바꾸면 사라진다 */}
            {preferredTopic && form.topic === preferredTopic && (
              <div className="jt-booking__prefill" style={{marginBottom: 32}}>
                <span className="jt-booking__prefill-dot" aria-hidden="true"></span>
                <div>
                  <div className="jt-booking__prefill-label">선택된 분야</div>
                  <div className="jt-booking__prefill-topic">{preferredTopic}</div>
                </div>
                <button type="button" className="jt-booking__prefill-clear" onClick={() => setForm({...form, topic: ''})}>
                  변경
                </button>
              </div>
            )}
            <div className="jt-renew-topic-grid" role="group" aria-label="문의 분야">
              {topics.map((t) => (
                <button
                  key={t.k}
                  type="button"
                  aria-pressed={form.topic === t.k}
                  onClick={() => setForm({...form, topic: t.k})}
                  className={`jt-service ${form.topic === t.k ? 'jt-service--dark' : ''}`}
                  style={{textAlign: 'left'}}
                >
                  <div className="jt-service__head" style={{marginBottom: 20}}>
                    <span>분야 선택</span>
                    <span className="jt-arrow">{form.topic === t.k ? '✓' : '→'}</span>
                  </div>
                  <div style={{fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6}}>{t.k}</div>
                  <div style={{fontSize: 13, color: form.topic === t.k ? 'rgba(255,255,255,.7)' : 'var(--fg-2)', lineHeight: 1.5}}>{t.d}</div>
                </button>
              ))}
            </div>


            {form.topic && <JTRenewPreparation topic={form.topic} />}
            {!canNext1 && <p id="jt-booking-topic-help" className="jt-renew-help">분야를 선택해 주세요. 잘 모르시면 ‘기타 / 분야 모름’을 선택하셔도 됩니다.</p>}
            <div className="jt-booking-actions">
              <button className="jt-btn jt-btn--primary jt-btn--lg" disabled={!canNext1} aria-describedby={!canNext1 ? 'jt-booking-topic-help' : undefined} onClick={() => setStep(2)} style={{opacity: canNext1 ? 1 : .4, cursor: canNext1 ? 'pointer' : 'not-allowed'}}>
                다음 단계 <span className="jt-arrow">→</span>
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="jt-kicker">2단계 · 어디로 연락드릴까요?</div>
            <h2 className="jt-h2 jt-booking-step-heading" ref={stepHeadingRef} tabIndex={-1} style={{marginBottom: 40}}>연락처를 남겨주세요.</h2>
            <form className="jt-form" onSubmit={(e) => { e.preventDefault(); if (canNext2) setStep(3); }}>
              {/* 260808: type·inputMode·autoComplete 추가.
                  연락처가 type="text" 라 휴대폰에서 «문자 키보드»가 떠서 번호를 치려면
                  키보드를 한 번 더 전환해야 했다. 상담 예약은 전환의 마지막 관문이라
                  입력 마찰을 그대로 두면 이탈로 이어진다. */}
              <div className="jt-field">
                <label htmlFor="jt-booking-name">성명 <em>필수</em></label>
                <input id="jt-booking-name" name="name" value={form.name} onChange={set('name')} required autoComplete="name" />
              </div>
              <div className="jt-field">
                <label htmlFor="jt-booking-company">회사 / 법인명 <em>선택</em></label>
                <input id="jt-booking-company" name="company" value={form.company} onChange={set('company')} placeholder="법인 건은 법인명을 기재해 주세요" autoComplete="organization" />
              </div>
              <div className="jt-field">
                <label htmlFor="jt-booking-phone">연락처 <em>필수</em></label>
                <input id="jt-booking-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} required placeholder="010-0000-0000" />
              </div>
              <div className="jt-field">
                <label htmlFor="jt-booking-email">이메일 <em>선택</em></label>
                <input id="jt-booking-email" name="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} placeholder="(선택) name@company.com" />
              </div>
              <div className="jt-field jt-field--full">
                <span id="jt-booking-channel-label" className="jt-booking-field-label">선호 연락 방법</span>
                <div className="jt-chips" role="group" aria-labelledby="jt-booking-channel-label">
                  {['전화', '이메일', '문자', '카카오톡'].map((c) => (
                    <button type="button" key={c} aria-pressed={form.channel === c} className={`jt-chip ${form.channel === c ? 'is-active' : ''}`} onClick={() => setForm({...form, channel: c})}>{c}</button>
                  ))}
                </div>
              </div>
              <div className="jt-field jt-field--full">
                <label htmlFor="jt-booking-msg">문의 내용 <em>선택</em></label>
                <textarea id="jt-booking-msg" name="message" value={form.msg} onChange={set('msg')} rows={5} placeholder="어떤 상황인지, 언제까지 검토가 필요한지 알려주세요. 주민등록번호·계좌번호는 적지 마세요." />
              </div>
              {!canNext2 && <p id="jt-booking-contact-help" className="jt-field--full jt-renew-help">성명과 연락처를 입력하면 다음 단계로 이동할 수 있습니다.</p>}
              <div className="jt-field jt-field--full jt-booking-actions">
                <button type="button" className="jt-btn jt-btn--outline" onClick={() => setStep(1)}>← 이전 단계</button>
                <button type="submit" className="jt-btn jt-btn--primary jt-btn--lg" disabled={!canNext2} aria-describedby={!canNext2 ? 'jt-booking-contact-help' : undefined} style={{opacity: canNext2 ? 1 : .4, cursor: canNext2 ? 'pointer' : 'not-allowed'}}>
                  확인 단계로 <span className="jt-arrow">→</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="jt-kicker">3단계 · 접수 전 확인</div>
            <h2 className="jt-h2 jt-booking-step-heading" ref={stepHeadingRef} tabIndex={-1} style={{marginBottom: 40}}>내용을 한 번만 확인해 주세요.</h2>
            <div className="jt-booking-summary">
              <dl className="jt-booking-summary__list">
                {[
                  ['문의 분야', form.topic],
                  ['성명', form.name],
                  ['회사 / 법인명', form.company || '—'],
                  ['이메일', form.email || '—'],
                  ['연락처', form.phone],
                  ['선호 연락 방법', form.channel],
                  ['문의 내용', form.msg || '—'],
                ].map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>

            <label style={{display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 32, maxWidth: 720, cursor: 'pointer'}}>
              <input type="checkbox" checked={form.consent} onChange={set('consent')} style={{marginTop: 3, width: 18, height: 18, flexShrink: 0, accentColor: 'var(--brand, #234d49)'}} />
              <span style={{fontSize: 15, color: 'var(--fg-2)', lineHeight: 1.7}}>
                {/* ⚠️ 수집 항목은 «실제로 보내는 것»과 반드시 일치해야 한다 (개인정보 보호법 §15①).
                    260808 에 유입 출처(접수ID·유입경로·랜딩페이지)를 payload 에 추가하면서
                    이 문구에 반영하지 않아 고지와 실제가 어긋나 있었다 (Codex R1 P1). */}
                <strong>개인정보 수집·이용 동의</strong>(개인정보 보호법 §15①1호)<br />· <strong>목적</strong>: 세무 상담 접수·응대 및 결과 회신<br />· <strong>항목</strong>: (필수) 성명, 연락처, 문의분야 / (선택) 이메일, 회사명, 선호 연락채널, 문의내용 — 선택 항목은 적지 않으셔도 접수됩니다<br />· <strong>함께 전송되는 접속 정보</strong>: 접수번호(임의 생성), 유입 매체(예: 검색·광고), 유입 사이트 주소(도메인까지), 첫 방문 경로, 제출 위치, 접수 시각, 크리에이터 경로(크리에이터 안내 페이지에서 상황을 선택한 경우에만). 문의가 어느 경로로 들어왔는지 확인하고 중복 접수를 가려내기 위한 것입니다<br />· <strong>보유·이용기간</strong>: 상담 종료 후 3년(상법 §33 상업장부 보존기간에 준함). 기간 경과 시 지체 없이 파기<br />· <strong>거부할 권리</strong>: 동의를 거부하실 수 있습니다. 다만 필수 항목 없이는 접수가 불가하므로, 거부하실 경우 전화·카카오톡·이메일로 상담을 신청해 주십시오.<br />수집된 정보는 상담 응대 목적에 한해 사용되며, 별도 동의 없이 마케팅 용도로 활용하지 않습니다.
              </span>
            </label>

            {/* 개인정보 보호법 §28의8①1호 «별도» 동의 (260809 결재 「안 A」).
                이 폼은 Web3Forms 를 거쳐 사무소 메일로 전달되는데 그 서버가 «미국»이라 국외 이전에
                해당한다. §28의8① 은 국외 제공·처리위탁·보관을 원칙 «금지»하고 5개 예외만 두며,
                1호를 쓰려면 ②의 5가지(항목 / 국가·시기·방법 / 받는 자의 명칭·연락처 /
                이용목적·보유기간 / 거부 방법·효과)를 «미리» 알려야 한다.
                ⛔ 「별도의 동의」라서 위 §15 체크박스와 합치면 안 된다.
                수령자 정보는 docs.web3forms.com 공식 문서 실측 (260809). */}
            <label style={{display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 16, maxWidth: 720, cursor: 'pointer'}}>
              <input type="checkbox" checked={form.consentIntl} onChange={set('consentIntl')} style={{marginTop: 3, width: 18, height: 18, flexShrink: 0, accentColor: 'var(--brand, #234d49)'}} />
              <span style={{fontSize: 15, color: 'var(--fg-2)', lineHeight: 1.7}}>
                <strong>개인정보 국외 이전 동의</strong>(개인정보 보호법 §28의8①1호)<br />· <strong>이전 항목</strong>: 위 수집 항목 전부<br />· <strong>이전 국가·시기·방법</strong>: <b>미국</b>(US-East) · 제출 즉시 · 암호화 전송(HTTPS)<br />· <strong>이전받는 자</strong>: Web3Forms (Web3Creative, 인도) · support@web3forms.com<br />· <strong>이용목적·보유기간</strong>: 상담 내용을 사무소 메일로 전달하는 용도에 한함. 제출 내용은 저장하지 않으며 서버 접속 기록은 <b>2개월</b> 후 삭제<br />· <strong>거부할 권리</strong>: 거부하실 수 있습니다. 거부하시면 이 폼으로는 접수되지 않으나, 전화·카카오톡·이메일로 동일하게 상담을 접수하실 수 있습니다.
              </span>
            </label>

            {!canSubmit && <p id="jt-booking-consent-help" className="jt-renew-help">2개의 동의 항목을 확인하면 접수할 수 있습니다.</p>}
            <div className="jt-booking-actions">
              <button className="jt-btn jt-btn--outline" onClick={() => setStep(2)}>← 이전 단계</button>
              <button className="jt-btn jt-btn--primary jt-btn--lg" disabled={!canSubmit || submitting} aria-describedby={!canSubmit ? 'jt-booking-consent-help' : undefined} onClick={submitBooking} style={{opacity: (canSubmit && !submitting) ? 1 : .4, cursor: (canSubmit && !submitting) ? 'pointer' : 'not-allowed'}}>
                {submitting ? '전송 중...' : <>상담 접수 제출 <span className="jt-arrow">→</span></>}
              </button>
              <a className="jt-btn jt-btn--outline" href={window.jtKakaoUrl()} target="_blank" rel="noopener" style={{flexBasis: '100%', textAlign: 'center', marginTop: 8}} onClick={() => window.jtTrackCta('kakao', 'booking_confirm')}>
                폼 제출이 번거로우시면 카카오톡으로 바로 문의 →
              </a>
            </div>
            {submitError && <p role="alert" style={{color: '#9f3030', marginTop: 16, fontSize: 15}}>{submitError}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
window.JTBooking = JTBooking;

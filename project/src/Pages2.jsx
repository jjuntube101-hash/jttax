/* global React */
const { useState: useStatePg2, useEffect: useEffectPg2 } = React;

// ============ Contact / Location page ============
function JTContact({ setRoute }) {
  const D = window.JT_DATA.firm;
  window.useReveal();
  return (
    <>
      <section className="jt-page-hero">
        <div className="jt-page-hero__mark"><img src="project/assets/logo_symbol.png" alt="" /></div>
        <div className="jt-page-hero__inner">
          <div className="jt-page-hero__crumb"><span>CONTACT</span><span>·</span><span>오시는 길</span></div>
          <h1>강남에<br/>자리잡았습니다.</h1>
          <p className="jt-page-hero__sub">
            강남대로 중심부, 강남역·신논현역 도보 5분 거리. 방문 상담은 사전 예약을 부탁드립니다.
          </p>
        </div>
      </section>

      <section className="jt-section">
        <div className="jt-map reveal">
          <div className="jt-map__info">
            <div className="jt-kicker">LOCATION</div>
            <h3 className="jt-h3" style={{marginBottom: 32}}>{D.nameKr}</h3>
            <ul className="jt-map__list">
              <li>
                <span className="jt-map__key">Address</span>
                <span className="jt-map__val">{D.address}</span>
              </li>
              <li>
                <span className="jt-map__key">Phone</span>
                <span className="jt-map__val"><a href={`tel:${D.phone}`} onClick={() => window.jtTrackCta('call', 'contact')}>{D.phone}</a></span>
              </li>
              <li>
                <span className="jt-map__key">Email</span>
                <span className="jt-map__val"><a href={`mailto:${D.email}`} onClick={() => window.jtTrackCta('email', 'contact')}>{D.email}</a></span>
              </li>
              <li>
                <span className="jt-map__key">KakaoTalk</span>
                <span className="jt-map__val"><a href={window.jtKakaoUrl()} target="_blank" rel="noopener" onClick={() => window.jtTrackCta('kakao', 'contact')}>{D.kakaoSearchId}</a><br/><small style={{color: 'var(--fg-3)'}}>카카오톡에서 검색 후 채널 추가</small></span>
              </li>
              <li>
                <span className="jt-map__key">Subway</span>
                <span className="jt-map__val">2호선 · 신분당선 강남역 11번 출구 도보 5분<br/>9호선 신논현역 6번 출구 도보 6분</span>
              </li>
              <li>
                <span className="jt-map__key">Hours</span>
                <span className="jt-map__val">평일 09:00 — 18:00 (주말·공휴일 휴무)<br/><small style={{color: 'var(--fg-3)'}}>세무조사 긴급 건은 예외 대응</small></span>
              </li>
              <li>
                <span className="jt-map__key">Parking</span>
                <span className="jt-map__val">건물 지하 주차장 이용 (방문 시 안내)</span>
              </li>
            </ul>
            <div style={{marginTop: 32, display: 'flex', gap: 12, flexWrap: 'wrap'}}>
              <button className="jt-btn jt-btn--primary" onClick={() => { window.jtTrackCta('booking', 'contact'); setRoute('booking'); }}>
                상담 예약 <span className="jt-arrow">→</span>
              </button>
              <a className="jt-btn jt-btn--outline" href={`tel:${D.phone}`} onClick={() => window.jtTrackCta('call', 'contact')}>전화상담</a>
              <a className="jt-btn jt-btn--outline" href={window.jtKakaoUrl()} target="_blank" rel="noopener" onClick={() => window.jtTrackCta('kakao', 'contact')}>카톡 상담</a>
            </div>
            <div style={{marginTop: 20}}>
              <div style={{
                fontFamily: 'var(--font-sans-en)', fontSize: 10, letterSpacing: '0.16em',
                textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 10
              }}>
                Open in maps
              </div>
              <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                <a className="jt-map__svc jt-map__svc--kakao" href={D.kakaoMapUrl} target="_blank" rel="noopener" aria-label="카카오맵에서 보기">
                  <span className="jt-map__svc-mark" style={{background: '#FEE500', color: '#191919'}}>K</span>
                  <span>카카오맵</span>
                  <span className="jt-arrow">↗</span>
                </a>
                <a className="jt-map__svc jt-map__svc--naver" href={D.naverMapUrl} target="_blank" rel="noopener" aria-label="네이버지도에서 보기">
                  <span className="jt-map__svc-mark" style={{background: '#03C75A', color: '#fff'}}>N</span>
                  <span>네이버지도</span>
                  <span className="jt-arrow">↗</span>
                </a>
                <a className="jt-map__svc jt-map__svc--google" href={D.googleMapUrl} target="_blank" rel="noopener" aria-label="구글지도에서 보기">
                  <span className="jt-map__svc-mark" style={{background: '#fff', color: '#1A1814', border: '1px solid rgba(0,0,0,.12)'}}>G</span>
                  <span>구글지도</span>
                  <span className="jt-arrow">↗</span>
                </a>
              </div>
            </div>
          </div>
          <div className="jt-map__canvas">
            <iframe
              title="제이티 세무법인 위치 지도"
              src={`https://www.google.com/maps?q=${encodeURIComponent(D.address)}&z=17&hl=ko&output=embed`}
              style={{width: '100%', height: '100%', minHeight: 460, border: 0, display: 'block'}}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
      </section>
    </>
  );
}
window.JTContact = JTContact;

// ============ Booking form (multi-step) ============
function JTBooking({ setRoute }) {
  const [step, setStep] = useStatePg2(1);
  const preferredSlot = (() => { try { return sessionStorage.getItem('jt_preferred_slot') || ''; } catch(_){ return ''; } })();
  const preferredTopic = (() => {
    try {
      const t = sessionStorage.getItem('jt_preferred_topic') || '';
      // 한 번 사용 후 비움 — 다음 진입 시 영향 X
      if (t) sessionStorage.removeItem('jt_preferred_topic');
      return t;
    } catch(_){ return ''; }
  })();
  const [form, setForm] = useStatePg2({
    topic: preferredTopic,
    name: '', company: '', email: '', phone: '',
    channel: '전화', msg: preferredSlot ? `희망 상담 시간: ${preferredSlot}\n\n` : '', consent: false,
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target && e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const [done, setDone] = useStatePg2(false);
  const [submitting, setSubmitting] = useStatePg2(false);
  const [submitError, setSubmitError] = useStatePg2('');
  window.useReveal();

  const topics = [
    { k: '양도·상속·증여', d: '자산 이전 전반의 설계·신고' },
    { k: '세무조사 대응', d: '조사 통지·현장·불복' },
    { k: '기장·세금 신고', d: '법인·개인의 월간 운영' },
    { k: '세금 종합 컨설팅', d: '의사결정 이전 시뮬레이션' },
    { k: '경정청구', d: '이미 낸 세금 환급' },
    { k: '기타 / 분야 모름', d: '어디에 속하는지 알 수 없는 경우' },
  ];

  if (done) {
    return (
      <>
        <section className="jt-page-hero">
          <div className="jt-page-hero__inner">
            <div className="jt-page-hero__crumb"><span>CONSULTATION</span><span>·</span><span>접수 완료</span></div>
            <h1>접수되었습니다.</h1>
          </div>
        </section>
        <section className="jt-section">
          <div className="jt-confirm">
            <div className="jt-kicker">REQUEST RECEIVED — #{Math.floor(100000 + Math.random() * 900000)}</div>
            <h2 className="jt-h2">상담 접수가 완료되었습니다.</h2>
            <p className="jt-body">
              영업일 기준 <b>24시간 이내</b>에 담당 세무사가 <b>기재해 주신 연락처</b>로 직접 연락드립니다.<br/>
              세무조사 긴급 건은 업무시간 내 즉시 대응됩니다.
            </p>
            <div style={{display: 'flex', gap: 12, flexWrap: 'wrap'}}>
              <button className="jt-btn jt-btn--primary" onClick={() => { setDone(false); setStep(1); setForm({ topic: '', name: '', company: '', email: '', phone: '', channel: '전화', msg: '', consent: false }); }}>
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
  const canSubmit = form.consent;

  const submitBooking = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    const w3fKey = (window.JT_DATA.integrations && window.JT_DATA.integrations.web3formsKey) || '';
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
      window.jtEvent('booking_submit', { topic: form.topic, channel: form.channel });
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
    <>
      <section className="jt-page-hero">
        <div className="jt-page-hero__mark"><img src="project/assets/logo_symbol.png" alt="" /></div>
        <div className="jt-page-hero__inner">
          <div className="jt-page-hero__crumb"><span>BOOKING</span><span>·</span><span>상담 예약</span></div>
          <h1>첫 상담은 무료입니다.</h1>
          <p className="jt-page-hero__sub">
            쟁점 확인·방향 안내까지 무료이며, 구체적 세무 판단·실행은 자문 계약 후 진행됩니다. 24시간 이내 담당 세무사가 직접 연락드립니다. 간단한 문의는 전화({window.JT_DATA.firm.phone})로도 가능합니다.
          </p>
        </div>
      </section>

      <section className="jt-section">
        <a className="jt-kakao-cta" href={window.jtKakaoUrl()} target="_blank" rel="noopener"
          onClick={() => { window.jtEvent('booking_kakao_top'); window.jtTrackCta('kakao', 'booking_top'); }}>
          <span className="jt-kakao-cta__msg">
            <span aria-hidden="true" style={{flexShrink: 0, display: 'inline-flex'}}>{React.createElement(window.JTIcon, { name: 'chat' })}</span>
            <span>폼 작성이 번거로우세요? <b>카카오톡으로 1:1 바로 상담</b>하세요.</span>
          </span>
          <span className="jt-kakao-cta__go">카톡 상담 →</span>
        </a>
        <div className="jt-stepper">
          <div className={`jt-stepper__step ${step >= 1 ? (step > 1 ? 'is-done' : 'is-active') : ''}`}>
            <div className="jt-stepper__num">1</div>
            <div><div className="jt-stepper__label">문의 분야</div><div className="jt-stepper__sub">TOPIC</div></div>
          </div>
          <div className={`jt-stepper__step ${step >= 2 ? (step > 2 ? 'is-done' : 'is-active') : ''}`}>
            <div className="jt-stepper__num">2</div>
            <div><div className="jt-stepper__label">연락처</div><div className="jt-stepper__sub">CONTACT</div></div>
          </div>
          <div className={`jt-stepper__step ${step >= 3 ? 'is-active' : ''}`}>
            <div className="jt-stepper__num">3</div>
            <div><div className="jt-stepper__label">내용 확인</div><div className="jt-stepper__sub">CONFIRM</div></div>
          </div>
        </div>

        {step === 1 && (
          <div>
            <div className="jt-kicker">STEP 1 · 어떤 사안인가요?</div>
            <h2 className="jt-h2" style={{marginBottom: preferredTopic ? 24 : 40}}>상담 분야를 선택해 주세요.</h2>
            {preferredTopic && (
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
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12}}>
              {topics.map((t) => (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setForm({...form, topic: t.k})}
                  className={`jt-service ${form.topic === t.k ? 'jt-service--dark' : ''}`}
                  style={{textAlign: 'left', padding: '24px 24px 28px', minHeight: 140}}
                >
                  <div className="jt-service__head" style={{marginBottom: 20}}>
                    <span>TOPIC</span>
                    <span className="jt-arrow">{form.topic === t.k ? '✓' : '→'}</span>
                  </div>
                  <div style={{fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6}}>{t.k}</div>
                  <div style={{fontSize: 13, color: form.topic === t.k ? 'rgba(255,255,255,.7)' : 'var(--fg-2)', lineHeight: 1.5}}>{t.d}</div>
                </button>
              ))}
            </div>


            <div style={{marginTop: 56, display: 'flex', justifyContent: 'flex-end', gap: 12}}>
              <button className="jt-btn jt-btn--primary jt-btn--lg" disabled={!canNext1} onClick={() => setStep(2)} style={{opacity: canNext1 ? 1 : .4, cursor: canNext1 ? 'pointer' : 'not-allowed'}}>
                다음 단계 <span className="jt-arrow">→</span>
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="jt-kicker">STEP 2 · 어디로 연락드릴까요?</div>
            <h2 className="jt-h2" style={{marginBottom: 40}}>연락처를 남겨주세요.</h2>
            <form className="jt-form" onSubmit={(e) => { e.preventDefault(); if (canNext2) setStep(3); }}>
              {/* 260808: type·inputMode·autoComplete 추가.
                  연락처가 type="text" 라 휴대폰에서 «문자 키보드»가 떠서 번호를 치려면
                  키보드를 한 번 더 전환해야 했다. 상담 예약은 전환의 마지막 관문이라
                  입력 마찰을 그대로 두면 이탈로 이어진다. */}
              <div className="jt-field">
                <label>성명 <em>REQUIRED</em></label>
                <input value={form.name} onChange={set('name')} required autoComplete="name" />
              </div>
              <div className="jt-field">
                <label>회사 / 법인명 <em>OPTIONAL</em></label>
                <input value={form.company} onChange={set('company')} placeholder="법인 건은 법인명을 기재해 주세요" autoComplete="organization" />
              </div>
              <div className="jt-field">
                <label>연락처 <em>REQUIRED</em></label>
                <input type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} required placeholder="010-0000-0000" />
              </div>
              <div className="jt-field">
                <label>이메일 <em>선택</em></label>
                <input type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} placeholder="(선택) name@company.com" />
              </div>
              <div className="jt-field jt-field--full">
                <label>선호 연락 방법</label>
                <div className="jt-chips">
                  {['전화', '이메일', '문자', '카카오톡'].map((c) => (
                    <button type="button" key={c} className={`jt-chip ${form.channel === c ? 'is-active' : ''}`} onClick={() => setForm({...form, channel: c})}>{c}</button>
                  ))}
                </div>
              </div>
              <div className="jt-field jt-field--full">
                <label>문의 내용 <em>OPTIONAL</em></label>
                <textarea value={form.msg} onChange={set('msg')} rows={5} placeholder="상담이 필요한 사안을 간략히 남겨주세요. 구체적인 숫자·일정이 있으면 더 정확히 안내드릴 수 있습니다." />
              </div>
              <div className="jt-field jt-field--full" style={{flexDirection: 'row', alignItems: 'center', gap: 48, marginTop: 12}}>
                <button type="button" className="jt-btn jt-btn--outline" onClick={() => setStep(1)}>← 이전 단계</button>
                <button type="submit" className="jt-btn jt-btn--primary jt-btn--lg" disabled={!canNext2} style={{opacity: canNext2 ? 1 : .4, cursor: canNext2 ? 'pointer' : 'not-allowed', marginLeft: 'auto'}}>
                  확인 단계로 <span className="jt-arrow">→</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="jt-kicker">STEP 3 · 접수 전 확인</div>
            <h2 className="jt-h2" style={{marginBottom: 40}}>내용을 한 번만 확인해 주세요.</h2>
            <div style={{border: '1px solid var(--border-1)', padding: '32px 36px', maxWidth: 720}}>
              <dl style={{margin: 0, display: 'grid', gridTemplateColumns: '140px 1fr', gap: '18px 24px'}}>
                {[
                  ['Topic', form.topic],
                  ['Name', form.name],
                  ['Company', form.company || '—'],
                  ['Email', form.email || '—'],
                  ['Phone', form.phone],
                  ['Channel', form.channel],
                  ['Message', form.msg || '—'],
                ].map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt style={{fontFamily: 'var(--font-sans-en)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-3)', paddingTop: 3}}>{k}</dt>
                    <dd style={{margin: 0, fontSize: 15, lineHeight: 1.55}}>{v}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>

            <label style={{display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 32, maxWidth: 720, cursor: 'pointer'}}>
              <input type="checkbox" checked={form.consent} onChange={set('consent')} style={{marginTop: 3, width: 18, height: 18, accentColor: '#000'}} />
              <span style={{fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6}}>
                {/* ⚠️ 수집 항목은 «실제로 보내는 것»과 반드시 일치해야 한다 (개인정보 보호법 §15①).
                    260808 에 유입 출처(접수ID·유입경로·랜딩페이지)를 payload 에 추가하면서
                    이 문구에 반영하지 않아 고지와 실제가 어긋나 있었다 (Codex R1 P1). */}
                <strong>개인정보 수집·이용 동의</strong>(개인정보 보호법 §15①1호)<br />· <strong>목적</strong>: 세무 상담 접수·응대 및 결과 회신<br />· <strong>항목</strong>: 성명, 연락처, 이메일, 회사명, 문의분야, 선호 연락채널, 문의내용<br />· <strong>함께 전송되는 접속 정보</strong>: 접수번호(임의 생성), 유입 매체(예: 검색·광고), 유입 사이트 주소(도메인까지), 첫 방문 경로, 제출 위치, 접수 시각. 문의가 어느 경로로 들어왔는지 확인하고 중복 접수를 가려내기 위한 것입니다<br />· <strong>보유·이용기간</strong>: 상담 종료 후 3년(상법 §33 상업장부 보존기간에 준함). 기간 경과 시 지체 없이 파기<br />· <strong>거부할 권리</strong>: 동의를 거부하실 수 있습니다. 다만 위 항목은 상담 접수에 «필수»이므로 거부 시 상담 신청이 접수되지 않습니다.<br />수집된 정보는 상담 응대 목적에 한해 사용되며, 별도 동의 없이 마케팅 용도로 활용하지 않습니다.
              </span>
            </label>

            <div style={{marginTop: 40, display: 'flex', gap: 12, flexWrap: 'wrap'}}>
              <button className="jt-btn jt-btn--outline" onClick={() => setStep(2)}>← 이전 단계</button>
              <button className="jt-btn jt-btn--primary jt-btn--lg" disabled={!canSubmit || submitting} onClick={submitBooking} style={{opacity: (canSubmit && !submitting) ? 1 : .4, cursor: (canSubmit && !submitting) ? 'pointer' : 'not-allowed', marginLeft: 'auto'}}>
                {submitting ? '전송 중...' : <>상담 접수 제출 <span className="jt-arrow">→</span></>}
              </button>
              <a className="jt-btn jt-btn--outline" href={window.jtKakaoUrl()} target="_blank" rel="noopener" style={{flexBasis: '100%', textAlign: 'center', marginTop: 8}} onClick={() => window.jtTrackCta('kakao', 'booking_confirm')}>
                폼 제출이 번거로우시면 카카오톡으로 바로 문의 →
              </a>
            </div>
            {submitError && <p style={{color: '#c00', marginTop: 16, fontSize: 13}}>{submitError}</p>}
          </div>
        )}
      </section>
    </>
  );
}
window.JTBooking = JTBooking;

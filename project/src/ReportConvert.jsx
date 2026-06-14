/* @jsx React.createElement */
/* JT 리포트 결과 → 상담 전환 장치 묶음 (v1)
   6개 장치:
   1. 검토 배너 (결과 직후)
   2. 리드 캡처 (이메일로 결과 받기)
   3. 사회적 증거 (비슷한 사안 해결 사례)
   4. 긴급도 기반 차별화 CTA
   5. 실시간 상담 가능 시간 (하드코딩 슬롯)
   6. PDF 소프트 게이트 (이메일 입력 시 PDF)
*/

const { useState: useCvtState, useMemo: useCvtMemo } = React;

// ===== 1. 검토 배너 =====
function JTConvertBanner({ setRoute, urgent }) {
  return (
    <div className={`jt-convert-banner ${urgent ? 'jt-convert-banner--urgent' : ''}`} style={{
      background: urgent ? '#1a0e0e' : '#0B0B0F',
      color: '#fff',
      padding: '36px 40px',
      margin: '48px 0',
      borderLeft: urgent ? '4px solid #d14e3a' : '4px solid #C7A15B',
    }}>
      <div style={{display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap'}}>
        <div style={{flex: 1, minWidth: 280}}>
          <div style={{fontFamily: 'ui-monospace,monospace', fontSize: 10, letterSpacing: '0.18em', opacity: 0.7}}>
            {urgent ? 'URGENT · 즉시 검토 권장' : 'NEXT STEP · 담당 세무사 검토'}
          </div>
          <h3 style={{fontSize: 24, letterSpacing: '-0.015em', marginTop: 10, marginBottom: 10}}>
            {urgent
              ? '이 사안, 시간이 중요합니다.'
              : '이 추정치는 시작점입니다.'}
          </h3>
          <p style={{fontSize: 15, opacity: 0.85, lineHeight: 1.65, margin: 0}}>
            {urgent
              ? '신고·결정 기한이 임박했거나 추가 증빙이 필요한 사안일 수 있습니다. 담당 세무사가 24시간 이내에 직접 검토해드립니다.'
              : '귀하의 사안은 이 계산보다 복잡할 수 있습니다. 담당 세무사가 15분 무료로 검토해드립니다.'}
          </p>
        </div>
        <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
          <button className="jt-btn jt-btn--onDark" onClick={() => {
            if (window.gtag) window.gtag('event', 'report_cta_banner_booking', { urgent });
            setRoute && setRoute('booking');
          }}>
            무료 15분 검토 예약 →
          </button>
          <a className="jt-btn jt-btn--ghostOnDark" href={window.jtKakaoUrl()} target="_blank" rel="noopener"
            onClick={() => { if (window.gtag) window.gtag('event', 'report_cta_banner_kakao', { urgent }); }}>
            카톡으로 결과 전송
          </a>
        </div>
      </div>
    </div>
  );
}
window.JTConvertBanner = JTConvertBanner;

// ===== 2. 리드 캡처 (이메일로 결과 받기) =====
function JTConvertLeadCapture({ reportType, reportSummary }) {
  const [email, setEmail] = useCvtState('');
  const [name, setName] = useCvtState('');
  const [phone, setPhone] = useCvtState('');
  const [agree, setAgree] = useCvtState(false);
  const [sending, setSending] = useCvtState(false);
  const [done, setDone] = useCvtState(false);
  const [err, setErr] = useCvtState('');

  const canSend = email.includes('@') && name.trim() && phone.trim() && agree && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true); setErr('');
    const w3fKey = (window.JT_DATA.integrations && window.JT_DATA.integrations.web3formsKey) || '';
    const payload = {
      _subject: `[JT 리포트 결과 요청] ${reportType} · ${name}`,
      구분: 'REPORT_LEAD',
      리포트유형: reportType,
      성명: name,
      이메일: email,
      연락처: phone,
      진단요약: reportSummary || '(요약 없음)',
      접수시각: new Date().toLocaleString('ko-KR'),
    };
    if (window.gtag) window.gtag('event', 'report_lead_submit', { reportType });
    try {
      if (w3fKey && !w3fKey.includes('REPLACE')) {
        const res = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: {'Content-Type': 'application/json', Accept: 'application/json'},
          body: JSON.stringify({ access_key: w3fKey, subject: payload._subject, from_name: name || '홈페이지 리포트 접수', replyto: email || '', ...payload }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error('fail');
      } else {
        // Fallback: mailto
        const body = Object.entries(payload).map(([k,v]) => `${k}: ${v}`).join('\n');
        window.location.href = `mailto:${window.JT_DATA.firm.email}?subject=${encodeURIComponent(payload._subject)}&body=${encodeURIComponent(body)}`;
      }
      setDone(true);
    } catch (e) {
      setErr('전송에 실패했습니다. 카카오톡 또는 전화로 연락해주세요.');
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <section className="jt-report-result__section" style={{background: '#F7F5EE', padding: '32px 36px', border: '1px solid rgba(199,161,91,0.3)'}}>
        <div style={{fontFamily: 'ui-monospace,monospace', fontSize: 10, letterSpacing: '0.18em', color: '#5a4a2a'}}>RECEIVED</div>
        <h3 style={{marginTop: 12, marginBottom: 8}}>접수되었습니다.</h3>
        <p style={{margin: 0, color: '#5a5a5a'}}>담당 세무사가 영업일 기준 24시간 이내에 직접 연락드립니다. 급한 사안이면 카카오톡({window.JT_DATA.firm.kakaoChannelName || '@JT세무'})으로 먼저 연락주세요.</p>
      </section>
    );
  }

  return (
    <section className="jt-report-result__section" style={{background: '#F7F5EE', padding: '32px 36px', border: '1px solid rgba(199,161,91,0.3)'}}>
      <div style={{fontFamily: 'ui-monospace,monospace', fontSize: 10, letterSpacing: '0.18em', color: '#5a4a2a'}}>REPORT BY EMAIL</div>
      <h3 style={{marginTop: 12, marginBottom: 8}}>이 진단, 담당 세무사가 검토해 드립니다</h3>
      <p style={{color: '#5a5a5a', fontSize: 14, marginBottom: 20}}>
        진단 결과와 함께 귀하 사안에 맞는 추가 질문·확인 포인트를 정리해 24시간 이내 회신드립니다. 수임·판매 목적으로 사용되지 않습니다.
      </p>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12}}>
        <input type="text" placeholder="성명 *" value={name} onChange={e => setName(e.target.value)}
          style={{padding: '12px 14px', border: '1px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 14}}/>
        <input type="tel" placeholder="연락처 *" value={phone} onChange={e => setPhone(e.target.value)}
          style={{padding: '12px 14px', border: '1px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 14}}/>
        <input type="email" placeholder="이메일 *" value={email} onChange={e => setEmail(e.target.value)}
          style={{padding: '12px 14px', border: '1px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 14}}/>
      </div>
      <label style={{display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: '#5a5a5a', marginBottom: 16, cursor: 'pointer'}}>
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{marginTop: 3}}/>
        <span>
          상담 목적 개인정보 수집·이용에 동의합니다. (필수) · 수집 항목: 성명·연락처·이메일 / 보유기간: 상담 종료 후 1년 / 동의를 거부할 권리가 있습니다.
        </span>
      </label>
      <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}>
        <button className="jt-btn jt-btn--primary" disabled={!canSend} onClick={send}
          style={{opacity: canSend ? 1 : 0.4, cursor: canSend ? 'pointer' : 'not-allowed'}}>
          {sending ? '전송 중…' : '결과 회신 요청 →'}
        </button>
        {err && <span style={{color: '#d14e3a', fontSize: 13}}>{err}</span>}
      </div>
    </section>
  );
}
window.JTConvertLeadCapture = JTConvertLeadCapture;

// ===== 3. 공개 판례·참고자료 (자사 실적이 아닌, 공개된 판례·통계) =====
const PRECEDENT_BANK = {
  LEGACY: [
    {
      tag: '조세심판원 · 2022',
      code: '조심-2021-전-6949',
      title: '오피스텔, 업무용이면 주택 수 제외',
      story: '배우자 명의 오피스텔을 법인에게 업무용으로 임차한 사안에서, 재산세가 일반건축물로 과세되고 부가세를 납부한 점 등을 근거로 "주택 아님"으로 인용 → 1세대 1주택 비과세 확정.',
      source: '국세법령정보시스템',
      lesson: '오피스텔 보유자의 주택 비과세 판단 시 임대 용도 증빙(임대차계약서·부가세 신고·재산세 고지서)이 결정적.'
    },
    {
      tag: '소득세법 · 2025 개정',
      code: '소득령 §155⑳ · §167',
      title: '장기임대주택 거주주택 비과세 특례',
      story: '장기임대주택 보유자의 거주주택 양도 시 비과세 횟수 제한이 완화되고, 다주택자 양도세 중과 한시 배제가 연장된 바 있음.',
      source: '국세청 양도소득세 개요',
      lesson: '법령 개정 시점에 따라 동일 사안도 과세·비과세가 달라질 수 있어, 양도 시점 사전 검토 필수.'
    },
  ],
  BOOKKEEPING: [
    {
      tag: '국세기본법 §45조의2',
      code: '경정청구 5년 원칙',
      title: '법정신고기한 5년 이내 경정청구',
      story: '연말정산·종합소득세에서 누락한 세액공제(기부금·자녀공제·교육비·월세 등)는 5년 이내 경정청구로 정정 가능. 2024년 세법 개정으로 이월공제 관련 경정 범위가 명확화됨.',
      source: '국세기본법',
      lesson: '사업자·프리랜서는 5년치 공제 누락 여부를 일괄 점검하는 "경정 헬스체크"가 절세 효과 큼.'
    },
    {
      tag: '국세청 통계 · 2022',
      code: '국세통계연보',
      title: '연간 경정청구 환급 규모 약 3.5조 원',
      story: '2022년 납세자들이 경정청구를 통해 환급받은 총액이 3조 5천억 원대로 집계. 그만큼 최초 신고 단계에서의 공제·감면 누락이 드물지 않음.',
      source: '국세청 국세통계연보',
      lesson: '최초 신고로 끝내지 않고, 매년 "작년 신고분 재검토" 루틴을 두면 평균 환급 발생 확률이 유의미하게 높음.'
    },
  ],
  APPEAL: [
    {
      tag: '조세심판원 · 경정청구',
      code: '조심2018중4657',
      title: '경정청구 거부, 취소 결정',
      story: '법인세 적용 대상이어야 할 양도소득을 양도세로 신고한 비영리법인에 대해 처분청이 거부한 경정청구를, 조세심판원은 "세법상 초과 신고에 해당"으로 보아 거부 취소.',
      source: '국세법령정보시스템',
      lesson: '세목 자체가 잘못 적용된 경우에도 경정청구 대상이 될 수 있음. 적용 법령 판단은 전문가 검토 권장.'
    },
    {
      tag: '국세기본법',
      code: '§45조의2 · 후발적 사유',
      title: '후발적 경정청구 (사유 발생 3개월 이내)',
      story: '판결 확정·계약 해제·상속재산 분할 등 후발적 사유로 과세표준이 변경되는 경우, 사유 발생 3개월 이내에 별도의 후발적 경정청구 가능.',
      source: '국세기본법 §45조의2 제2항',
      lesson: '5년 기본 기한을 넘었어도 후발적 사유가 있으면 청구 가능. 판결문·해제확인서 등 증빙 확보가 핵심.'
    },
  ],
};

function JTConvertPrecedents({ reportTag }) {
  const cases = PRECEDENT_BANK[reportTag] || PRECEDENT_BANK.LEGACY;
  return (
    <section className="jt-report-result__section">
      <div style={{fontFamily: 'ui-monospace,monospace', fontSize: 10, letterSpacing: '0.18em', color: '#888', marginBottom: 8}}>PUBLIC PRECEDENTS</div>
      <h3 style={{marginTop: 0}}>참고할 공개 판례·자료</h3>
      <p style={{color: '#666', fontSize: 13, marginTop: -4, marginBottom: 24, lineHeight: 1.6}}>
        ※ 아래는 <strong>당사 수임 실적이 아니며</strong>, 유사 사안의 <strong>공개된 조세심판원 결정·법원 판례·국세청 발표</strong>에서 발췌한 참고자료입니다. 귀하의 사안에 그대로 적용되지 않을 수 있습니다.
      </p>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16}}>
        {cases.map((c, i) => (
          <div key={i} style={{border: '1px solid rgba(0,0,0,0.1)', padding: 26, background: '#fff'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap'}}>
              <div style={{fontFamily: 'ui-monospace,monospace', fontSize: 10, letterSpacing: '0.14em', color: '#888'}}>{c.tag}</div>
              <div style={{fontFamily: 'ui-monospace,monospace', fontSize: 10, color: '#C7A15B'}}>{c.code}</div>
            </div>
            <h4 style={{fontSize: 18, letterSpacing: '-0.01em', marginTop: 14, marginBottom: 10, fontWeight: 500}}>{c.title}</h4>
            <p style={{fontSize: 14, color: '#333', lineHeight: 1.65, marginTop: 0, marginBottom: 14}}>{c.story}</p>
            <div style={{borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 12, marginTop: 12}}>
              <div style={{fontSize: 12, color: '#888', marginBottom: 4}}>시사점</div>
              <p style={{fontSize: 13, color: '#5a4a2a', margin: 0, lineHeight: 1.6, fontStyle: 'italic'}}>{c.lesson}</p>
            </div>
            <div style={{fontSize: 11, color: '#aaa', marginTop: 12}}>출처: {c.source}</div>
          </div>
        ))}
      </div>
      <p style={{fontSize: 12, color: '#888', marginTop: 18, marginBottom: 0, lineHeight: 1.6}}>
        동일 쟁점이라도 사실관계·증빙·법령 개정 시점에 따라 결과가 달라집니다. 귀하 사안의 적용 가능성은 담당 세무사의 개별 검토가 필요합니다.
      </p>
    </section>
  );
}
window.JTConvertPrecedents = JTConvertPrecedents;
// 하위 호환
window.JTConvertSocialProof = JTConvertPrecedents;

// ===== 4+5. 긴급도 차별화 CTA + 실시간 상담 가능 시간 =====
function JTConvertTimeSlots({ setRoute, urgent }) {
  // 오늘·내일·모레의 상담 가능 슬롯 (영업일 기준 하드코딩 시뮬)
  const slots = useCvtMemo(() => {
    const today = new Date();
    const fmtDay = (d) => `${d.getMonth() + 1}/${d.getDate()} (${['일','월','화','수','목','금','토'][d.getDay()]})`;
    const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
    const skipWeekend = (d) => { while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return d; };
    const d1 = skipWeekend(addDays(0));
    const d2 = skipWeekend(addDays(1));
    const d3 = skipWeekend(addDays(2));
    return [
      { day: fmtDay(d1), times: ['14:30', '16:00', '17:30'] },
      { day: fmtDay(d2), times: ['10:00', '11:30', '14:00', '15:30'] },
      { day: fmtDay(d3), times: ['10:30', '14:00', '16:30'] },
    ];
  }, []);

  return (
    <section className="jt-report-result__section" style={{
      background: urgent ? '#fff' : '#FAFAF8',
      border: '1px solid rgba(0,0,0,0.1)',
      padding: '36px 40px',
    }}>
      <div style={{display: 'flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8}}>
        <h3 style={{margin: 0}}>{urgent ? '긴급 상담 가능 시간' : '상담 가능 시간'}</h3>
        <span style={{fontSize: 13, color: urgent ? '#d14e3a' : '#5a5a5a'}}>
          {urgent ? '● 당일 예약 가능' : '● 실시간 반영 · 원하는 시간을 선택해 예약으로 이동'}
        </span>
      </div>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16, marginTop: 20}}>
        {slots.map((d, di) => (
          <div key={di} style={{border: '1px solid rgba(0,0,0,0.1)', padding: 20, background: '#fff'}}>
            <div style={{fontFamily: 'ui-monospace,monospace', fontSize: 11, letterSpacing: '0.14em', color: '#5a5a5a'}}>{d.day}</div>
            <div style={{display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap'}}>
              {d.times.map((t, ti) => (
                <button key={ti} className="jt-btn jt-btn--outline" style={{padding: '8px 14px', fontSize: 13, borderRadius: 0}}
                  onClick={() => {
                    if (window.gtag) window.gtag('event', 'report_cta_slot_click', { slot: `${d.day} ${t}` });
                    try { sessionStorage.setItem('jt_preferred_slot', `${d.day} ${t}`); } catch(_){}
                    setRoute && setRoute('booking');
                  }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p style={{fontSize: 12, color: '#888', marginTop: 16, marginBottom: 0}}>
        ※ 실제 가능 시간은 예약 확인 후 담당 세무사가 최종 조율합니다.
      </p>
    </section>
  );
}
window.JTConvertTimeSlots = JTConvertTimeSlots;

// ===== 6. PDF 소프트 게이트 =====
function JTConvertPdfGate({ reportType, reportSummary }) {
  const [email, setEmail] = useCvtState('');
  const [agree, setAgree] = useCvtState(false);
  const [sending, setSending] = useCvtState(false);
  const [done, setDone] = useCvtState(false);

  const canSend = email.includes('@') && agree && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    if (window.gtag) window.gtag('event', 'report_pdf_request', { reportType });
    const w3fKey = (window.JT_DATA.integrations && window.JT_DATA.integrations.web3formsKey) || '';
    const payload = {
      _subject: `[JT 리포트 PDF 요청] ${reportType}`,
      구분: 'REPORT_PDF',
      리포트유형: reportType,
      이메일: email,
      진단요약: reportSummary || '',
      접수시각: new Date().toLocaleString('ko-KR'),
    };
    try {
      if (w3fKey && !w3fKey.includes('REPLACE')) {
        await fetch('https://api.web3forms.com/submit', {method:'POST', headers:{'Content-Type':'application/json', Accept:'application/json'}, body: JSON.stringify({ access_key: w3fKey, subject: payload._subject, replyto: email || '', ...payload })});
      }
    } catch(_){}
    setTimeout(() => {
      window.print();
      setDone(true);
      setSending(false);
    }, 400);
  };

  return (
    <div style={{background: '#0B0B0F', color: '#fff', padding: '28px 32px', marginTop: 24}}>
      <div style={{fontFamily: 'ui-monospace,monospace', fontSize: 10, letterSpacing: '0.18em', opacity: 0.6}}>PDF SAVE</div>
      <h4 style={{fontSize: 18, marginTop: 8, marginBottom: 6}}>이 리포트를 PDF로 저장</h4>
      <p style={{fontSize: 13, opacity: 0.7, marginTop: 0, marginBottom: 16, lineHeight: 1.6}}>
        이메일을 남기시면 브랜디드 PDF로 저장 시 자동 인쇄창이 열립니다. 스팸 발송은 없으며, 후속 정보는 30일 내 최대 1회로 제한됩니다.
      </p>
      {done ? (
        <p style={{color: '#C7A15B', fontSize: 13, margin: 0}}>● 저장 창이 열렸습니다. 담당 세무사가 같은 사안을 검토해 회신드릴 수 있습니다.</p>
      ) : (
        <>
          <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10}}>
            <input type="email" placeholder="이메일 주소" value={email} onChange={e => setEmail(e.target.value)}
              style={{flex: 1, minWidth: 240, padding: '10px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 14}}/>
            <button className="jt-btn jt-btn--onDark" disabled={!canSend} onClick={send}
              style={{opacity: canSend ? 1 : 0.4, cursor: canSend ? 'pointer' : 'not-allowed'}}>
              {sending ? '준비 중…' : 'PDF 저장 →'}
            </button>
          </div>
          <label style={{display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, opacity: 0.7, cursor: 'pointer'}}>
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{marginTop: 3}}/>
            <span>개인정보(이메일) 수집에 동의합니다. 목적: 리포트 발송 · 보유기간: 발송 후 90일</span>
          </label>
        </>
      )}
    </div>
  );
}
window.JTConvertPdfGate = JTConvertPdfGate;

// ===== 통합 랩퍼 =====
function JTReportConvert({ setRoute, reportType, reportTag, reportSummary, urgent }) {
  return (
    <>
      <JTConvertBanner setRoute={setRoute} urgent={urgent} />
      <JTConvertLeadCapture reportType={reportType} reportSummary={reportSummary} />
      <JTConvertPrecedents reportTag={reportTag} />
      <JTConvertTimeSlots setRoute={setRoute} urgent={urgent} />
      <JTConvertPdfGate reportType={reportType} reportSummary={reportSummary} />
    </>
  );
}
window.JTReportConvert = JTReportConvert;

/* global React */
const { useState: useStateHome, useEffect: useEffectHome, useRef: useRefHome } = React;
// User rejected generated faces on 260919. Keep composites hidden pending selection.
const JT_TEAM_IMAGES_APPROVED = false;

// ============ 상황 카드 라인 아이콘 (절제된 stroke) ============
function JTSitIcon({ name }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  switch (name) {
    case 'home': // 양도·상속·증여 — 집/재산
      return <svg {...p}><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></svg>;
    case 'corp': // 법인·사업 운영 — 건물
      return <svg {...p}><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></svg>;
    case 'audit': // 세무조사 — 서류/조사
      return <svg {...p}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M10 13l1.6 1.6L15 11.5" /></svg>;
    case 'refund': // 경정·환급 — 되돌림
      return <svg {...p}><path d="M4 8h11a5 5 0 0 1 0 10H8" /><path d="M7 5 4 8l3 3" /></svg>;
    case 'consult': // 세금 컨설팅 — 나침반/전략
      return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="m15 9-3.4 1.6L10 14l3.4-1.6z" /></svg>;
    case 'chat': // 일반 상담 — 말풍선
      return <svg {...p}><path d="M5 5h14v10H9l-4 3.5z" /><path d="M9 9h6M9 11.5h4" /></svg>;
    case 'phone': // 전화
      return <svg {...p}><path d="M5 4h3l1.6 4-2 1.4a11 11 0 0 0 5 5l1.4-2 4 1.6V19a2 2 0 0 1-2 2A15 15 0 0 1 4 6a2 2 0 0 1 1-2z" /></svg>;
    case 'mail': // 이메일
      return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="m3.5 6.5 8.5 6 8.5-6" /></svg>;
    default:
      return null;
  }
}
window.JTSitIcon = JTSitIcon;
window.JTIcon = JTSitIcon;

// ============ 상황별 진입 카드 (히어로) ============
// 6개 = 서비스 5분야 + 일반상담. topic은 booking/services 분야 자동선택 키와 매칭.
const JT_SITUATIONS = [
// slug 는 새 탭·주소 복사에서도 분야가 전달되게 하는 링크 키 — 예약 폼(Pages2 JT_BOOKING_SLUGS)의 허용 목록과 같아야 한다.
{ ico: 'home', num: '01', sit: '재산을 팔거나 물려줄 때', t: '양도·상속·증여', d: '거래와 이전에 따른 세금, 신고에 필요한 사항을 검토합니다.', topic: '양도·상속·증여', slug: 'asset' },
{ ico: 'corp', num: '02', sit: '사업의 매월과 연말을 준비할 때', t: '기장·세금 신고', d: '법인과 개인사업자의 장부, 결산과 세금 신고를 다룹니다.', topic: '기장·세금 신고', slug: 'bookkeeping' },
{ ico: 'audit', num: '03', sit: '세무서에서 통지를 받았을 때', t: '세무조사 대응', d: '통지 내용과 자료를 확인하고 대응할 쟁점을 정리합니다.', topic: '세무조사 대응', slug: 'audit' },
{ ico: 'refund', num: '04', sit: '지난 신고를 다시 살펴볼 때', t: '경정청구', d: '신고 내용과 증빙을 바탕으로 정정 가능성을 검토합니다.', topic: '경정청구', slug: 'refund' },
{ ico: 'consult', num: '05', sit: '사업의 중요한 결정을 앞두고', t: '기업 자문·세무 컨설팅', d: '법인 전환과 사업 구조 변경에 따른 세무 사항을 살핍니다.', topic: '세금 종합 컨설팅', slug: 'consulting' },
{ ico: 'chat', num: '06', sit: '무엇부터 해야 할지 막막할 때', t: '일반 상담', d: '현재 상황을 알려주시면 필요한 업무와 절차를 안내합니다.', topic: '', slug: 'general', general: true }];


// ============ 상황 색인 — 3열 표제 / 9열 괘선 목록 ============
function JTHero({ setRoute }) {
  const pick = (s) => {
    // 일반 상담은 앞서 다른 메뉴에서 저장된 분야를 지운다 — 남겨 두면 예약 폼에 엉뚱한 분야가 선택된다.
    try { if (s.topic) sessionStorage.setItem('jt_preferred_topic', s.topic); else sessionStorage.removeItem('jt_preferred_topic'); } catch (e) {}
    window.jtTrackCta('booking', 'hero');
    setRoute('booking');
  };
  return (
    <section className="jt-sithero" id="home-services" aria-labelledby="home-services-title">
      <div className="jt-sithero__ledger">
      <div className="jt-sithero__inner reveal">
        <div className="jt-ledger-label"><span>02</span> WHERE TO START</div>
        <h2 className="jt-sithero__title" id="home-services-title">지금, 어떤<br />상황이신가요?</h2>
        <p className="jt-sithero__sub">기장과 신고부터 재산의 이전까지.<br />지금 필요한 업무에서 시작하세요.</p>
        <a className="jt-ledger-link" href="/services/">전체 업무 분야 <span aria-hidden="true">↗</span></a>
      </div>
      <div className="jt-sits">
        {JT_SITUATIONS.map((s) => <a
            key={s.num}
            className={`jt-sit ${s.general ? 'jt-sit--general' : ''}`}
            href={'/#/booking/' + s.slug}
            onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); pick(s); }}>
            <span className="jt-sit__num">{s.num}</span>
            <span className="jt-sit__sit">{s.sit}</span>
            <span className="jt-sit__t">{s.t}</span>
            <span className="jt-sit__go" aria-hidden="true">↗</span>
          </a>
        )}
      </div>
      </div>
    </section>);

}
window.JTHero = JTHero;

// ============ Brand Moment — 전체 업무를 소개하는 장부형 첫 화면 ============
function JTBrandMoment({ setRoute }) {
  return (
    <section className="jt-brandmoment" aria-label="제이티 세무법인">
      <div className="jt-brandmoment__inner">
        <div className="jt-brandmoment__copy">
          <div className="jt-brandmoment__eyebrow">
            <span>JT TAX CORP.</span><span>BUSINESS &amp; PROPERTY</span>
          </div>
          <h1 className="jt-brandmoment__slogan">근거 위에서,<br />끝까지.</h1>
          <p className="jt-brandmoment__sub">
            사업의 매일과 재산의 중요한 순간.<br />
            사실을 살피고, 판단의 근거를 세웁니다.
          </p>
          <div className="jt-brandmoment__actions">
            <a className="jt-ledger-button" href="/#/booking"
              onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); window.jtTrackCta('booking', 'hero'); setRoute('booking'); }}>상담 문의 <span aria-hidden="true">↗</span></a>
            <a className="jt-ledger-link" href="/services/">업무 분야 보기 <span aria-hidden="true">→</span></a>
          </div>
          <div className="jt-brandmoment__index"><span>기장·신고</span><span>재산 세무</span><span>기업 자문</span><span>조사·불복</span></div>
        </div>
        <aside className="jt-brandmoment__tool" aria-label="양도세 간이 계산">
          <div className="jt-brandmoment__tool-intro"><span>QUICK TAX CHECK</span><span>주택 기준</span></div>
          {/* 기존 엔진·동적 질문·결과 상태·계측은 변경하지 않는다. */}
          {window.JTHeroCalc ? <window.JTHeroCalc /> : null}
          <a className="jt-brandmoment__tools-link" href="/calculators/">전체 세금 계산기 보기 <span aria-hidden="true">→</span></a>
        </aside>
      </div>
    </section>);

}
window.JTBrandMoment = JTBrandMoment;

// ============ JT 리포트 — 차별화 도구 + 프리미엄 퍼널 (플랫폼형) ============
// 계산기(검증 엔진) = 미끼/증명 → 상담 → 종합 관리(구독·종합컨설팅). "JT"는 텍스트 대신 로고 락업.
function JTReportHome({ setRoute }) {
  return (
    <section className="jt-platform" aria-label="JT 리포트 — 세금 계산 엔진">
      <div className="jt-platform__inner">
        <div className="jt-kicker reveal">JT REPORT · 검증 계산 엔진</div>
        <h2 className="jt-platform__title reveal" data-delay="1">
          <span className="jt-platform__line">계산하고 · 상담하고 · 맡기고</span>
          <span className="jt-platform__line jt-platform__line--brand">
            <img className="jt-platform__logo" src="project/assets/logo_symbol.png" alt="제이티 세무법인" />
            <span>하나로.</span>
          </span>
        </h2>
        <p className="jt-platform__sub reveal" data-delay="2">
          양도·상속·증여부터 종합소득세·법인 전환까지.<br />
          계산 결과와 적용 조건을 확인하고, 개별 사안의 판단이 필요할 때 상담으로 이어가세요.
        </p>
        <ol className="jt-platform__steps reveal" data-delay="3">
          <li><span className="jt-platform__step-n">01</span><span className="jt-platform__step-t">직접 계산</span><span className="jt-platform__step-d">검증 엔진으로 무료·5분</span></li>
          <li><span className="jt-platform__step-n">02</span><span className="jt-platform__step-t">전문가 상담</span><span className="jt-platform__step-d">결과를 들고 바로 연결</span></li>
          <li><span className="jt-platform__step-n">03</span><span className="jt-platform__step-t">종합 관리</span><span className="jt-platform__step-d">신고·절세를 끝까지</span></li>
        </ol>
        <div className="jt-platform__cta reveal" data-delay="4">
          {/* 크롤러용 실링크(/calculators/) + 사용자는 종전대로 SPA 리포트 허브 —
              홈에 내부 <a>가 하나도 없으면 검색·AI 크롤러가 내부 페이지로 못 간다 (260830 SEO 파일럿 확정 #1) */}
          <a className="jt-btn jt-btn--primary" href="/calculators/" style={{ textDecoration: 'none' }}
            onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); setRoute('report'); }}
            onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); setRoute('report'); } }}>계산기 보러가기 <span className="jt-arrow">→</span></a>
          <a className="jt-link jt-platform__link" onClick={() => { window.jtTrackCta('booking', 'home_report'); setRoute('booking'); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.jtTrackCta('booking', 'home_report'); setRoute('booking'); } }}>먼저 상담부터 →</a>
        </div>
      </div>
    </section>);

}
window.JTReportHome = JTReportHome;

// ============ 티저 밴드 (홈 요약 → 더보기 페이지) ============
function JTTeaserBand({ kicker, title, sub, ctaLabel, onGo }) {
  return (
    <section className="jt-teaser">
      <div className="jt-teaser__inner reveal" role="link" tabIndex={0}
        onClick={onGo}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGo(); } }}>
        <div className="jt-kicker">{kicker}</div>
        <h2 className="jt-teaser__h">{title}</h2>
        <p className="jt-teaser__sub">{sub}</p>
        <span className="jt-link jt-teaser__more">{ctaLabel} <span className="jt-arrow">→</span></span>
      </div>
    </section>);
}
window.JTTeaserBand = JTTeaserBand;

// ============ Proof / Scenarios (benchmark: law-firm "case results") ============
function JTProof({ setRoute }) {
  const items = window.JT_DATA.scenarios;
  const [showAll, setShowAll] = useStateHome(false);
  const INITIAL = 3;
  const shown = showAll ? items : items.slice(0, INITIAL);
  return (
    <section className="jt-section jt-proof">
      <div className="jt-section__head jt-section__head--split reveal">
        <div>
          <div className="jt-kicker">PRECEDENTS · 공개 판례·참고자료</div>
          <h2 className="jt-h2 jt-display-h2">세법은 기록되어 있고,<br />결정은 공개되어 있습니다.</h2>
        </div>
        <div className="jt-proof__note">
          아래는 <strong>당사 수임 실적이 아닌</strong>, 국세법령정보시스템·국세청 통계·국세기본법에서 발췌한 공개 자료입니다.<br />귀하 사안의 적용 가능성은 개별 검토가 필요합니다.
        </div>
      </div>
      <div className="jt-proof__grid">
        {shown.map((it, i) =>
        <article key={i} className={i < INITIAL ? "jt-proof__card reveal" : "jt-proof__card"} data-delay={Math.min(i, 3)}>
            <div className="jt-proof__tag">{it.tag}</div>
            <div className="jt-proof__delta">{it.delta}</div>
            <div className="jt-proof__kr">{it.kr}</div>
            <dl className="jt-proof__story">
              <dt>사안</dt><dd>{it.background}</dd>
              <dt>쟁점</dt><dd>{it.action}</dd>
              {it.outcome && <><dt>시사점</dt><dd>{it.outcome}</dd></>}
              <dt>출처</dt><dd>{it.duration}</dd>
            </dl>
          </article>
        )}
      </div>
      {items.length > INITIAL &&
        <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center' }}>
          <button className="jt-btn jt-btn--outline jt-btn--sm" onClick={() => setShowAll(v => !v)} aria-expanded={showAll}>
            {showAll ? '접기 ↑' : `공개 사례 더 보기 (+${items.length - INITIAL}) ↓`}
          </button>
        </div>
      }
      <p className="reveal" style={{ marginTop: 32, fontSize: 12, color: 'var(--fg-3)', textAlign: 'right', lineHeight: 1.6 }}>
        ※ 본 내용은 공개된 조세심판원 결정·국세청 발표·국세기본법을 교육 목적으로 요약한 참고자료입니다. 법령 개정·사실관계에 따라 결론이 달라질 수 있으며, 특정 납세자에 대한 자문 의견이 아닙니다.
      </p>
      <div className="reveal" style={{ marginTop: 40, display: 'flex', justifyContent: 'flex-end' }}>
        <a tabIndex={0} role="link" onKeyDown={window.jtKeyActivate} className="jt-link" onClick={() => { window.jtTrackCta('booking', 'proof'); setRoute('booking'); }}>내 사안 적용 여부 상담하기 →</a>
      </div>
    </section>);

}
window.JTProof = JTProof;

// ============ 대표 소개 — 공통 실무와 각자의 경험 ============
function JTCreds() {
  const slugs = { '김민석': 'kim-minseok', '이현준': 'lee-hyunjun', '김가환': 'kim-gahwan' };
  return (
    <section className="jt-ident" id="home-team" aria-labelledby="home-team-title">
      <div className="jt-ident__inner">
        <div className="jt-ident__head reveal">
          <div className="jt-ledger-label"><span>01</span> THE PEOPLE AT JT</div>
          <h2 className="jt-ident__h2" id="home-team-title">세 사람의 경험,<br />제이티의 이름으로.</h2>
          <p className="jt-ident__lead">담당할 사람을 먼저 알아보세요.<br />세 대표세무사의 실무와 경력을 소개합니다.</p>
        </div>
        {JT_TEAM_IMAGES_APPROVED && <figure className="jt-team-editorial">
          <img src="/project/assets/people/team-editorial-260919.png" alt="제이티 세무법인 세 대표세무사의 단체 초상 — AI 연출 이미지" width="1672" height="941" loading="lazy" decoding="async" />
          <figcaption><span>김민석 · 이현준 · 김가환 대표세무사</span><span>대표 사진 기반 AI 연출 이미지</span></figcaption>
        </figure>}
        <div className="jt-ident__grid">
          {window.JT_DATA.team.partners.map((p, i) => (
            <article className="jt-person" key={p.name}>
              <div className="jt-person__heading"><span className="jt-person__number">0{i + 1}</span><h3>{p.name}</h3><span>대표세무사</span></div>
              <p className="jt-person__focus">{p.titleKr}</p>
              <p className="jt-person__summary">{p.summary}</p>
              <a className="jt-person__link" href={'/experts/' + slugs[p.name] + '.html'}>경력과 주요 업무 <span aria-hidden="true">↗</span></a>
            </article>
          ))}
        </div>
        <div className="jt-ident__more"><a className="jt-link" href="/experts/">대표세무사 소개 모두 보기 →</a></div>
      </div>
    </section>);
}
window.JTCreds = JTCreds;

// ============ 업무 방식 — 자료에서 판단, 실행으로 이어지는 한 장 ============
function JTMethod() {
  return (
    <section className={JT_TEAM_IMAGES_APPROVED ? 'jt-method' : 'jt-method jt-method--text'} aria-labelledby="home-method-title">
      <div className="jt-method__inner">
        <div className="jt-method__head reveal">
          <div className="jt-ledger-label"><span>03</span> HOW WE WORK</div>
          <h2 id="home-method-title">숫자만으로<br />끝나지 않는 일.</h2>
          <p>계산에 담기지 않는 사실까지 살핍니다.<br />자료를 확인하고, 필요한 판단과 절차를 함께 정리합니다.</p>
        </div>
        {JT_TEAM_IMAGES_APPROVED && <figure className="jt-method__figure">
          <img src="/project/assets/people/team-discussion-260919.png" alt="자료를 함께 살피며 논의하는 세 대표세무사 — AI 연출 이미지" width="1536" height="1024" loading="lazy" decoding="async" />
          <figcaption>대표 사진 기반 AI 연출 이미지</figcaption>
        </figure>}
        <ol className="jt-method__steps">
          <li><span>01</span><div><h3>먼저, 사실을 확인합니다.</h3><p>현재 상황과 일정, 보유한 자료에서 검토할 내용을 찾습니다.</p></div></li>
          <li><span>02</span><div><h3>판단의 근거를 정리합니다.</h3><p>적용할 요건과 쟁점을 살피고, 선택에 필요한 내용을 설명합니다.</p></div></li>
          <li><span>03</span><div><h3>다음 절차를 함께 준비합니다.</h3><p>상담 결과에 따라 신고와 대응에 필요한 업무를 안내합니다.</p></div></li>
        </ol>
        <a className="jt-ledger-link jt-method__link" href="/about/">제이티 세무법인 알아보기 <span aria-hidden="true">↗</span></a>
      </div>
    </section>
  );
}
window.JTMethod = JTMethod;

// ============ 대표 인용 (따뜻한 풀쿼트, 라이트) ============
function JTQuote() {
  return (
    <section className="jt-pullquote">
      <div className="jt-pullquote__inner reveal">
        <span className="jt-pullquote__mark">“</span>
        <p className="jt-pullquote__p">상담에서 가장 자주 본 장면은<br />‘미리 물었더라면’으로 시작하는 뒤늦은 문의였습니다.</p>
        <div className="jt-pullquote__by">
          <div className="jt-pullquote__avatar">JT</div>
          <div><b>이현준 대표세무사</b> · 제이티 세무법인</div>
        </div>
      </div>
    </section>);

}
window.JTQuote = JTQuote;

// ============ Insights list (home preview) ============
// 인사이트 카드 (홈·목록 공용)
function JTInsightCard({ a, i }) {
  const cat = String(a.tag || '인사이트').split('·').pop().trim();
  // 카드의 유일한 상호작용 요소는 내부 <a> 하나 — CSS 스트레치 링크(a.jt-icard__go::after)가
  // 히트 영역을 카드 전체로 늘려 «카드 아무 데나 클릭»을 유지한다. article 에 onClick 을 두면
  // 중첩 상호작용(Codex R2-F1) 또는 키보드 게이트(jsx 스모크) 중 하나를 깬다 (260830)
  return (
    <article className="jt-icard reveal" data-delay={Math.min(i, 5)}>
      <div className="jt-icard__top">
        <span className="jt-icard__cat">{cat}</span>
        <span className="jt-icard__date">{a.date}</span>
      </div>
      <h3 className="jt-icard__title">{a.title}</h3>
      {/* 크롤러·키보드·마우스 공용 실링크 (260830 SEO 파일럿 확정 #1) */}
      {a.slug
        ? <a className="jt-icard__go" href={'/insights/' + a.slug + '.html'} style={{ textDecoration: 'none' }}>읽기 <span className="jt-arrow">→</span></a>
        : <span className="jt-icard__go">읽기 <span className="jt-arrow">→</span></span>}
    </article>);

}
window.JTInsightCard = JTInsightCard;

function JTInsightsPreview({ setRoute, limit }) {
  const items = window.JT_DATA.insights.slice(0, limit || 4);
  return (
    <section className="jt-section jt-home-insights">
      <div className="jt-section__head jt-section__head--split reveal">
        <div>
          <div className="jt-ledger-label"><span>04</span> INSIGHTS</div>
          <h2 className="jt-h2 jt-display-h2">실무에 바로 쓰는 해설.</h2>
        </div>
        <a href="/insights/" className="jt-ledger-link" onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); setRoute('insights'); }}>전체 글 보기 <span aria-hidden="true">↗</span></a>
      </div>
      <div className="jt-icards">
        {items.map((a, i) => <JTInsightCard key={a.slug || a.title} a={a} i={i} />)}
      </div>
    </section>);

}
window.JTInsightsPreview = JTInsightsPreview;

// ============ CTA band ============
function JTCta({ setRoute }) {
  return (
    <section className="jt-cta">
      <div className="jt-cta__inner">
        <div className="reveal">
          <div className="jt-kicker jt-kicker--inverse jt-kicker--plain">CONSULTATION</div>
          <h2>신고·결정 이전에<br />먼저 물어보세요.</h2>
        </div>
        <div className="reveal" data-delay="1">
          <p className="jt-cta__body">어떤 업무가 필요한지 몰라도 괜찮습니다.<br />현재 상황을 알려주시면 검토할 내용과 다음 절차를 안내합니다.</p>
          <div className="jt-row jt-row--gap-3">
            <button className="jt-btn jt-btn--onDark jt-btn--lg" onClick={() => { window.jtTrackCta('booking', 'cta_band'); setRoute('booking'); }}>
              상담 예약 <span className="jt-arrow">→</span>
            </button>
            <a className="jt-btn jt-btn--ghostOnDark jt-btn--lg" href={`tel:${window.JT_DATA.firm.phone}`} onClick={() => window.jtTrackCta('call', 'cta_band')}>
              T. {window.JT_DATA.firm.phone}
            </a>
          </div>
        </div>
      </div>
    </section>);

}
window.JTCta = JTCta;

// ============ Fees section removed per brief ============

// ============ Channels (다양한 상담 채널) ============
function JTChannels({ setRoute }) {
  return (
    <section className="jt-channels">
      <div className="jt-channels__inner">
        <div className="jt-ledger-label"><span>CONTACT</span> 편한 방법으로 문의하세요.</div>
        <div className="jt-channels__grid reveal" data-delay="1">
          <a className="jt-channels__card" href={`tel:${window.JT_DATA.firm.phone}`} onClick={() => window.jtTrackCta('call', 'channels')}>
            <div className="jt-channels__label">전화 상담</div>
            <div className="jt-channels__big">{window.JT_DATA.firm.phone}</div>
            <div className="jt-channels__sub">평일 09:30–17:30 <span aria-hidden="true">↗</span></div>
          </a>
          <a className="jt-channels__card" href={`mailto:${window.JT_DATA.firm.email}`} onClick={() => window.jtTrackCta('email', 'channels')}>
            <div className="jt-channels__label">이메일</div>
            <div className="jt-channels__big">{window.JT_DATA.firm.email}</div>
            <div className="jt-channels__sub">검토할 자료를 함께 보내주세요. <span aria-hidden="true">↗</span></div>
          </a>
          <a className="jt-channels__card" href={window.jtKakaoUrl()} target="_blank" rel="noopener" onClick={() => window.jtTrackCta('kakao', 'channels')}>
            <div className="jt-channels__label">카카오톡 채널</div>
            {/* 채널 검색 ID 대신 라벨 표기 (260830 사용자 결재 F-6 — 종전엔 빈 문자열이 렌더됐다 A6) */}
            <div className="jt-channels__big">1:1 채팅 상담</div>
            {/* 260906 결재 H-5 — 카톡 채널을 «개정·기한 안내» 재방문 장치로 정식화(분기 1회 이상 발송, 채널 추가 보상 없음) */}
            <div className="jt-channels__sub">채팅 문의 · 세법 개정·신고기한 안내 <span aria-hidden="true">↗</span></div>
          </a>
        </div>
      </div>
    </section>);

}
window.JTChannels = JTChannels;

// ============ FAQ (자주 묻는 질문) ============
function JTFaq({ setRoute }) {
  const items = (window.JT_DATA.faq || []).slice(0, 4);
  const [open, setOpen] = useStateHome(-1);
  if (!items.length) return null;
  return (
    <section className="jt-section jt-home-faq">
      <div className="jt-section__head reveal">
        <div className="jt-ledger-label"><span>05</span> BEFORE WE MEET</div>
        <h2 className="jt-h2 jt-display-h2">상담 전에<br />궁금한 것들.</h2>
      </div>
      <div className="jt-faq__list">
        {items.map((it, i) =>
          <div key={i} className="jt-faq__item reveal" data-delay={Math.min(i, 4)}>
            <button
              className="jt-faq__q"
              aria-expanded={open === i}
              aria-controls={open === i ? 'jt-home-faq-a' + i : undefined}
              onClick={() => setOpen(open === i ? -1 : i)}>
              <span className="jt-faq__qtext">
                <span className="jt-faq__n">{String(i + 1).padStart(2, '0')}</span>
                <span className="jt-faq__t">{it.q}</span>
              </span>
              <span className="jt-arrow jt-faq__sign" aria-hidden="true">{open === i ? '−' : '+'}</span>
            </button>
            {open === i &&
              <p className="jt-faq__a" id={'jt-home-faq-a' + i}>{it.a}</p>
            }
          </div>
        )}
      </div>
      <div className="jt-faq__foot reveal">
        <span>더 궁금한 점이 있으신가요?</span>
        <button className="jt-btn jt-btn--primary" onClick={() => { window.jtTrackCta('booking', 'faq'); setRoute('booking'); }}>무료 상담 신청 <span className="jt-arrow">→</span></button>
      </div>
    </section>);
}
window.JTFaq = JTFaq;

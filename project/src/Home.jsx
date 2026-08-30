/* global React */
const { useState: useStateHome, useEffect: useEffectHome, useRef: useRefHome } = React;

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
{ ico: 'home', num: '01', sit: '집·재산을 팔거나, 물려주거나 받는다', t: '양도·상속·증여', hook: '시점이 곧 금액입니다.', d: '시점이 곧 금액입니다. 신고 전 절세 구간과 이전 구조를 먼저 설계합니다.', topic: '양도·상속·증여' },
{ ico: 'corp', num: '02', sit: '법인·개인사업체 운영 중', t: '법인·개인 사업 운영', hook: '매월이 12월 결산을 만듭니다.', d: '매월 결산이 12월 결산을 만듭니다. 기장·신고부터 법인 구조까지.', topic: '기장·세금 신고' },
{ ico: 'audit', num: '03', sit: '세무서에서 연락이 왔다', t: '세무조사 대응', hook: '첫 답변이 결과를 가릅니다.', d: '첫 답변이 결과를 가릅니다. 통지 단계부터 세무사가 함께합니다.', topic: '세무조사 대응' },
{ ico: 'refund', num: '04', sit: '이미 낸 세금이 억울하다', t: '경정·환급', hook: '5년 안이면 늦지 않았습니다.', d: '5년 이내면 늦지 않았습니다. 과오납 세금을 돌려받을 권리를 검토합니다.', topic: '경정청구' },
{ ico: 'consult', num: '05', sit: '큰 결정을 앞두고 있다', t: '세금 컨설팅', hook: '결정 전에, 숫자로 비교하세요.', d: '법인 전환·지분 재구성 전, 여러 시나리오의 총 부담을 수치로 비교합니다.', topic: '세금 종합 컨설팅' },
{ ico: 'chat', num: '06', sit: '어디에 속하는지 모르겠다', t: '일반 상담', hook: '상황만 말씀해 주세요.', d: '괜찮습니다. 상황만 말씀해 주시면 담당 분야와 다음 절차를 안내합니다.', topic: '', general: true }];


// ============ Hero — 상황별 진입 ============
function JTHero({ setRoute }) {
  /* 260808: 컬럼 수를 window.innerWidth 로 읽어 «인라인 style» 로 박고 있었다.
     리사이즈 리스너가 없어 값이 갱신되지 않는데, 인라인은 CSS 미디어쿼리를 이기므로
     기기를 회전하거나 창을 줄이면 옛 컬럼 수가 그대로 남았다(가로→세로에서 3열 잘림).
     redesign.css 가 이미 같은 분기(3열 / ≤960 2열 / ≤640 1열)를 갖고 있어
     인라인을 지우기만 하면 된다. */
  const pick = (s) => {
    if (s.topic) {try {sessionStorage.setItem('jt_preferred_topic', s.topic);} catch (e) {}}
    window.jtTrackCta('booking', 'hero');
    setRoute('booking');
  };
  return (
    <section className="jt-sithero">
      <div className="jt-sithero__inner">
        <div className="jt-kicker">WHERE TO START · 상황별 안내</div>
        <h2 className="jt-sithero__title">지금, 어떤 상황이신가요?</h2>
        <p className="jt-sithero__sub">세금은 상황마다 답이 다릅니다.</p>
      </div>
      <div className="jt-sits">
        {JT_SITUATIONS.map((s, i) => <div
            key={s.num}
            data-delay={Math.min(i, 5)}
            className={`jt-sit reveal ${s.general ? 'jt-sit--general' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => pick(s)}
            onKeyDown={(e) => {if (e.key === 'Enter' || e.key === ' ') {e.preventDefault();pick(s);}}}>
            <div className="jt-sit__top">
              <div className="jt-sit__ico" aria-hidden="true"><JTSitIcon name={s.ico} /></div>
              <span className="jt-sit__num">{s.num}</span>
            </div>
            <div className="jt-sit__sit">{s.sit}</div>
            {s.hook && <div className="jt-sit__hook">{s.hook}</div>}
            <div className="jt-sit__t">{s.t}</div>
            <div className="jt-sit__go">{s.general ? '편하게 문의' : '이 상황 상담'} <span className="jt-arrow">→</span></div>
          </div>
        )}
      </div>
    </section>);

}
window.JTHero = JTHero;

// ============ Brand Moment — 로고 + 슬로건 (다크 앵커) ============
function JTBrandMoment({ setRoute }) {
  return (
    <section className="jt-brandmoment" aria-label="제이티 세무법인">
      <div className="jt-brandmoment__inner">
        <div className="jt-brandmoment__logowrap reveal">
          {/* ⛔ CI 가이드(HEAZ, 2026) — Primary Logo 는 «심볼 + 제이티 세무법인 + JT TAX CORP.»
              가 하나로 잠긴 덩어리이고, 금지사항에 «배치 변경·비율 변경»이 명시돼 있다.
              종전엔 심볼만 SVG 로 그리고 회사명을 Pretendard 800, 영문을 모노스페이스로
              «다시 조판»했다 — 서체도 자간도 공식 락업과 달랐다(가이드 위반).
              → 공식 자산(logo_primary_white_transparent.png)을 그대로 쓴다.
              비율은 width:auto 로 보존하고, 배경은 단색 검정(정숙 영역)이다. */}
          <img className="jt-bm-primary" src="project/assets/logo_primary_white.png"
            alt="제이티 세무법인 JT TAX CORP." width="900" height="667" />
        </div>
        {/* 260808: 페이지의 h1 은 여기다. 종전엔 이 슬로건이 h2 이고 아래 상황
            섹션 제목이 h1 이라 문서 개요가 뒤집혀 있었다(검색엔진이 페이지 주제를
            「지금, 어떤 상황이신가요?」로 읽는다). CSS 는 전부 클래스 셀렉터라 영향 없음. */}
        <h1 className="jt-brandmoment__slogan">
          <span className="reveal" data-delay="1">근거 위에서,</span>{' '}
          <span className="reveal" data-delay="2">끝까지.</span>
        </h1>
        <p className="jt-brandmoment__sub reveal" data-delay="3">
          세금은 감이 아니라 근거로 다툽니다. 먼저 숫자부터 확인해 보세요.
        </p>
        {/* 260809 결재 「안 2」 — 브랜드 문장을 지키면서 도구를 첫 화면에 둔다.
            세액 계산은 검증된 jt-tax-engine 이 하고 이 컴포넌트는 «묻고 보여주기»만 한다. */}
        {window.JTHeroCalc ? <window.JTHeroCalc /> : null}
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
          세법을 가르치는 세무사가 <strong>직접 설계한 검증 계산 엔진</strong>.
          양도·상속·증여부터 종합소득세·법인 전환까지 직접 계산해 보고 —
          판단과 관리는 전문가와 끝까지 함께하세요.
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

// ============ 정체성 밴드 — «한 사안을, 세 대표가 봅니다» (260830 카피 패키지 C-1) ============
// 종전 «세 개의 동사»는 리드(집행)와 열 제목(검증)이 어긋났고(전수검사 A7) 이현준 단독 서사였다.
// 3인 대표 체제(사용자 결재 F-3)에 맞춰 재산·설계·장부의 «세 시선» 구조로 재작성.
// 문안 정본: 브랜딩/세무법인/홈페이지/인물브랜딩카피_260830.md §1 (코덱스 수렴본)
function JTCreds({ setRoute }) {
  return (
    <section className="jt-ident">
      <div className="jt-ident__inner">
        <div className="jt-ident__head reveal">
          <div className="jt-kicker">WHY JT · 우리가 누구인가</div>
          <h2 className="jt-ident__h2">한 사안을,<br /><em>세 대표가</em> 봅니다.</h2>
          <p className="jt-ident__lead">세금 문제는 한 과목이 아닙니다. 재산의 문제이면서, 구조의 문제이면서, 장부의 문제입니다. 그래서 제이티는 대표세무사 세 명이 각자의 전문 영역에서 같은 사안을 봅니다 — 누락 가능성을 낮추기 위해 정해 둔, 저희의 기본 검토 방식입니다.</p>
        </div>
        <div className="jt-ident__grid">
          <div className="jt-ident__col reveal">
            <div className="jt-ident__en">Assets · 김민석 대표세무사</div>
            <div className="jt-ident__verb">재산의<br />시선</div>
            <p className="jt-ident__body">양도·상속·증여와 <b>세무조사·불복</b>. «이 재산에 지금 무슨 일이 생기는가»를 봅니다.</p>
            <div className="jt-ident__foot">억울한 세금은 다퉈볼 수 있습니다 — 순서와 기한이 있을 뿐입니다.</div>
          </div>
          <div className="jt-ident__col reveal" data-delay="1">
            <div className="jt-ident__en">Design · 이현준 대표세무사</div>
            <div className="jt-ident__verb">설계의<br />시선</div>
            {/* 수강생 학습앱 링크는 «지금도 가르치고 있다»는 증거이자 수험생의 입구 — 유지 (260809 설계) */}
            <p className="jt-ident__body">가상자산·신종업종·종합 컨설팅. «구조를 바꾸면 숫자가 어떻게 달라지는가»를 봅니다. 공무원학원 <b>세법 강사</b>·세법 교재 <b>저자</b>이며, 수강생용 학습앱 <a href="https://class.jttax.co.kr" target="_blank" rel="noopener" onClick={() => { if (window.jtTrackCta) window.jtTrackCta('class_app', 'ident'); }}>class.jttax.co.kr</a> 을 직접 운영합니다.</p>
            <div className="jt-ident__foot">가르치는 사람의 의무는 정확함입니다.</div>
          </div>
          <div className="jt-ident__col reveal" data-delay="2">
            <div className="jt-ident__en">Books · 김가환 대표세무사</div>
            <div className="jt-ident__verb">장부의<br />시선</div>
            <p className="jt-ident__body">결산·기장·신고 운영. <b>투자를 유치한 회사들의 월 기장</b>을 맡습니다 — 투자사에 보고되는 장부는 대충 만들 수 없습니다.</p>
            <div className="jt-ident__foot">연말의 세금은 매월의 기록 위에서 계산됩니다.</div>
          </div>
        </div>
        <div className="reveal" data-delay="3" style={{ marginTop: 28, textAlign: 'right' }}>
          <a className="jt-link" href="/experts/" style={{ textDecoration: 'none' }}
            onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); if (setRoute) setRoute('about', 'team'); }}>
            전문가 소개 보기 →
          </a>
        </div>
      </div>
    </section>);

}
window.JTCreds = JTCreds;

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
    <section className="jt-section">
      <div className="jt-section__head jt-section__head--split reveal">
        <div>
          <div className="jt-kicker">INSIGHTS · 최근 글</div>
          <h2 className="jt-h2 jt-display-h2">실무에 바로 쓰는 해설.</h2>
        </div>
        <a tabIndex={0} role="link" onKeyDown={window.jtKeyActivate} className="jt-link" onClick={() => setRoute('insights')}>전체 보기 →</a>
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
          <p className="jt-cta__body">
            세무조사 통지, 상속 개시, 법인 설립, 경정청구 — 시점이 곧 금액이 되는 일입니다. 첫 의사결정을 함께 세우겠습니다. 첫 상담(쟁점 확인·방향 안내)은 무료입니다.
          </p>
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
        <div className="reveal">
          <div className="jt-kicker">CHANNELS · 편한 방식으로</div>
          <h2 className="jt-h2 jt-display-h2">전화가 부담스러우면,<br />카톡·이메일로도 됩니다.</h2>
        </div>
        <div className="jt-channels__grid reveal" data-delay="1">
          <a className="jt-channels__card" href={`tel:${window.JT_DATA.firm.phone}`} onClick={() => window.jtTrackCta('call', 'channels')}>
            <div className="jt-channels__label">전화 상담</div>
            <div className="jt-channels__big">{window.JT_DATA.firm.phone}</div>
            <div className="jt-channels__sub">평일 09:30–17:30 · 초기 응답 24h 이내</div>
          </a>
          <a className="jt-channels__card" href={`mailto:${window.JT_DATA.firm.email}`} onClick={() => window.jtTrackCta('email', 'channels')}>
            <div className="jt-channels__label">이메일</div>
            <div className="jt-channels__big">{window.JT_DATA.firm.email}</div>
            <div className="jt-channels__sub">자료 첨부 가능 · 영업일 기준 24h 내 회신</div>
          </a>
          <a className="jt-channels__card" href={window.jtKakaoUrl()} target="_blank" rel="noopener" onClick={() => window.jtTrackCta('kakao', 'channels')}>
            <div className="jt-channels__label">카카오톡 채널</div>
            {/* 채널 검색 ID 대신 라벨 표기 (260830 사용자 결재 F-6 — 종전엔 빈 문자열이 렌더됐다 A6) */}
            <div className="jt-channels__big">1:1 채팅 상담</div>
            <div className="jt-channels__sub">채널에서 바로 채팅 · 자료 전송 가능 · 영업일 24h 내 회신</div>
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
    <section className="jt-section">
      <div className="jt-section__head reveal">
        <div className="jt-kicker">FAQ · 자주 묻는 질문</div>
        <h2 className="jt-h2 jt-display-h2">궁금한 점을<br />먼저 풀어드립니다.</h2>
      </div>
      <div style={{ borderTop: '1px solid var(--border-1)' }}>
        {items.map((it, i) =>
          <div key={i} className="reveal" style={{ borderBottom: '1px solid var(--border-1)' }} data-delay={Math.min(i, 4)}>
            <button
              aria-expanded={open === i}
              onClick={() => setOpen(open === i ? -1 : i)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between', background: 'none', border: 0, textAlign: 'left', padding: '24px 4px', cursor: 'pointer', font: 'inherit', color: 'var(--fg-1)' }}>
              <span style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--font-sans-en)', fontSize: 13, color: 'var(--fg-3)' }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{it.q}</span>
              </span>
              <span className="jt-arrow" style={{ fontSize: 22, lineHeight: 1, color: 'var(--fg-2)', flexShrink: 0 }}>{open === i ? '−' : '+'}</span>
            </button>
            {open === i &&
              <p style={{ margin: 0, padding: '0 4px 28px 44px', fontSize: 16, lineHeight: 1.75, color: 'var(--fg-2)' }}>{it.a}</p>
            }
          </div>
        )}
      </div>
      <div className="reveal" style={{ marginTop: 36, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: 'var(--fg-2)', fontSize: 15 }}>더 궁금한 점이 있으신가요?</span>
        <button className="jt-btn jt-btn--primary" onClick={() => { window.jtTrackCta('booking', 'faq'); setRoute('booking'); }}>무료 상담 신청 <span className="jt-arrow">→</span></button>
      </div>
    </section>);
}
window.JTFaq = JTFaq;
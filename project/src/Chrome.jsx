/* global React */
const { useEffect, useState } = React;

// 카톡 상담 링크 — 모바일은 1:1 채팅 바로 열기, PC는 채널 홈으로(로그인 에러 화면 회피)
window.jtKakaoUrl = function () {
  const D = window.JT_DATA.firm;
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test((typeof navigator !== 'undefined' && navigator.userAgent) || '');
  return isMobile ? D.kakaoChatUrl : (D.kakaoChannelUrl || D.kakaoChatUrl);
};

// ============ GA4 상담 CTA 통일 계측 ============
// 모든 상담 지점(PC·모바일)에서 표준 이벤트 cta_click 1개로 발화한다.
//   channel : 'call' | 'kakao' | 'booking' | 'email'
//   location: 'sticky' | 'nav' | 'hero' | 'channels' | 'contact' | 'footer' | 'cta_band'
//             | 'proof' | 'faq' | 'home_report' | 'services' | 'booking_top' | 'booking_confirm'
//             | 'report_hub' | 'report_result' | 'report_banner' | 'report_slots' ...
// 기존 이벤트(mcta_* 등)는 과거 데이터 연속성을 위해 그대로 두고, cta_click을 추가 발화한다.
// gtag 미로드 환경(로컬 실행·광고차단)에서는 조용히 무시 — 에러를 내지 않는다.
window.jtTrackCta = function (channel, location, extra) {
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'cta_click', Object.assign({ channel: channel, location: location }, extra || {}));
    }
  } catch (_e) {}
};

// ============ Scroll reveal hook ============
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal:not(.is-visible)');
    if (!('IntersectionObserver' in window)) {
      els.forEach(e => e.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  });
}
window.useReveal = useReveal;

// ============ Count-up hook ============
function useCountUp(target, ms = 1600) {
  const [val, setVal] = useState(0);
  const [ref, setRef] = useState(null);
  useEffect(() => {
    if (!ref) return;
    let started = false;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && !started) {
          started = true;
          const start = performance.now();
          const tick = (t) => {
            const p = Math.min(1, (t - start) / ms);
            const eased = 1 - Math.pow(1 - p, 3);
            setVal(Math.round(target * eased));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          io.disconnect();
        }
      });
    }, { threshold: 0.4 });
    io.observe(ref);
    return () => io.disconnect();
  }, [ref, target, ms]);
  return [val, setRef];
}
window.useCountUp = useCountUp;

// ============ Nav ============
function JTNav({ route, setRoute }) {
  const [scrolled, setScrolled] = useState(false);
  const [svcOpen, setSvcOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeTimer = React.useRef(null);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const openSvc = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setSvcOpen(true); };
  const closeSvc = () => { closeTimer.current = setTimeout(() => setSvcOpen(false), 150); };
  const goService = (topic) => {
    if (topic) { try { sessionStorage.setItem('jt_preferred_topic', topic); } catch(_){} }
    setSvcOpen(false);
    setRoute('services');
  };
  const services = (window.JT_DATA && window.JT_DATA.services) || [];
  return (
    <header className={`jt-nav ${scrolled ? 'jt-nav--scrolled' : ''} ${menuOpen ? 'jt-nav--menu-open' : ''}`}>
      <a className="jt-nav__brand" onClick={() => setRoute('home')} aria-label="제이티 세무회계 홈">
        <img src="project/assets/logo_symbol.png" alt="" style={{ height: 26 }} />
        <span style={{ fontWeight: 700, letterSpacing: '-0.01em', marginLeft: 8 }}>제이티 세무회계</span>
      </a>
      <nav className="jt-nav__links">
        <a className={route === 'about' ? 'active' : ''} onClick={() => setRoute('about')}>회사소개</a>
        <div className="jt-nav__dd-wrap" onMouseEnter={openSvc} onMouseLeave={closeSvc}>
          <a
            className={`jt-nav__dd-trigger ${route === 'services' ? 'active' : ''}`}
            onClick={() => setRoute('services')}
            aria-haspopup="true"
            aria-expanded={svcOpen}
          >
            업무분야 <span className="jt-nav__dd-caret" aria-hidden="true">▾</span>
          </a>
          {svcOpen && (
            <div className="jt-nav__dd" onMouseEnter={openSvc} onMouseLeave={closeSvc}>
              {services.map((s) => (
                <a key={s.num} className="jt-nav__dd-item" onClick={() => goService(s.kr)}>
                  <span className="jt-nav__dd-num">{s.num}</span>
                  <span className="jt-nav__dd-label">
                    <span className="jt-nav__dd-kr">{s.kr}</span>
                    <span className="jt-nav__dd-en">{s.en}</span>
                  </span>
                </a>
              ))}
              <div className="jt-nav__dd-sep" role="separator"></div>
              <a className="jt-nav__dd-item jt-nav__dd-item--all" onClick={() => goService(null)}>
                <span className="jt-nav__dd-all-label">전체 업무분야 보기</span>
                <span className="jt-arrow">→</span>
              </a>
            </div>
          )}
        </div>
        <a className={route === 'report' ? 'active' : ''} onClick={() => setRoute('report')}>세금 계산기</a>
        <a className={route === 'insights' ? 'active' : ''} onClick={() => setRoute('insights')}>인사이트</a>
        <a className={route === 'contact' ? 'active' : ''} onClick={() => setRoute('contact')}>오시는 길</a>
      </nav>
      <div className="jt-nav__cta">
        <span className="jt-nav__phone">T. {window.JT_DATA.firm.phone}</span>
        <button className="jt-btn jt-btn--primary jt-btn--sm jt-nav__book" onClick={() => { window.jtTrackCta('booking', 'nav'); setRoute('booking'); }}>
          상담 예약 <span className="jt-arrow">→</span>
        </button>
        <button className="jt-nav__burger" aria-label="메뉴" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <span></span><span></span><span></span>
        </button>
      </div>
      {menuOpen && (
        <div className="jt-navmenu">
          {[['about', '회사소개'], ['services', '업무분야'], ['report', '세금 계산기'], ['insights', '인사이트'], ['contact', '오시는 길']].map(([r, l]) => (
            <a key={r} className={route === r ? 'is-active' : ''} onClick={() => { setRoute(r); setMenuOpen(false); }}>{l}</a>
          ))}
          <a className="jt-navmenu__phone" href={`tel:${window.JT_DATA.firm.phone}`} onClick={() => window.jtTrackCta('call', 'nav')}>T. {window.JT_DATA.firm.phone}</a>
          <button className="jt-btn jt-btn--primary" onClick={() => { window.jtTrackCta('booking', 'nav'); setRoute('booking'); setMenuOpen(false); }}>상담 예약 <span className="jt-arrow">→</span></button>
        </div>
      )}
    </header>
  );
}
window.JTNav = JTNav;

// ============ Mobile Sticky CTA Bar (전화·카톡·예약) ============
function JTMobileCta({ setRoute, route }) {
  const D = window.JT_DATA.firm;
  const Icon = window.JTSitIcon;
  // 예약/리포트 내부에서는 숨김 (중복 방지)
  if (route === 'booking') return null;
  return (
    <div className="jt-mcta" role="navigation" aria-label="빠른 상담">
      <a className="jt-mcta__btn" href={`tel:${D.phone}`} onClick={() => { window.gtag && window.gtag('event', 'mcta_call'); window.jtTrackCta('call', 'sticky'); }}>
        <span className="jt-mcta__ico" aria-hidden="true">{Icon ? <Icon name="phone" /> : '☏'}</span>
        <span>전화</span>
      </a>
      <a className="jt-mcta__btn" href={D.kakaoChatUrl} target="_blank" rel="noopener" onClick={() => { window.gtag && window.gtag('event', 'mcta_kakao'); window.jtTrackCta('kakao', 'sticky'); }}>
        <span className="jt-mcta__ico" aria-hidden="true">{Icon ? <Icon name="chat" /> : '💬'}</span>
        <span>카톡</span>
      </a>
      <button className="jt-mcta__btn jt-mcta__btn--primary" onClick={() => { if (window.gtag) window.gtag('event', 'mcta_booking'); window.jtTrackCta('booking', 'sticky'); setRoute('booking'); }}>
        <span>상담 예약 →</span>
      </button>
    </div>
  );
}
window.JTMobileCta = JTMobileCta;

// ============ SEO 동적 메타 업데이트 ============
let __jtLastGaPath = null; // GA4 page_view 중복 발화 방지(같은 path는 1회만) — apply() 직접호출 + hashchange 동시 발화 흡수
function useSeoMeta(route) {
  useEffect(() => {
    const apply = () => {
      const seo = window.JT_DATA.seo;
      // 현재 화면 키 = route, 단 계산기는 해시(#/report/cgt)의 sub까지 반영 → 'report:cgt'
      let key = route, sub = '';
      try {
        const r = window.JTRouter && window.JTRouter.parse();
        if (r && r.router && r.route) { key = r.route; sub = r.sub; }
      } catch (e) {}
      let metaKey = key;
      if (key === 'report' && sub && sub !== 'hub') metaKey = 'report:' + sub;
      const meta = (seo.pageMeta && (seo.pageMeta[metaKey] || seo.pageMeta[key])) || {};
      const title = meta.title ? `${meta.title} | ${window.JT_DATA.firm.nameKr}` : seo.titleDefault;
      const desc = meta.desc || seo.description;
      document.title = title;
      const setMeta = (name, content, attr = 'name') => {
        let el = document.querySelector(`meta[${attr}="${name}"]`);
        if (!el) {
          el = document.createElement('meta');
          el.setAttribute(attr, name);
          document.head.appendChild(el);
        }
        el.setAttribute('content', content);
      };
      setMeta('description', desc);
      setMeta('og:title', title, 'property');
      setMeta('og:description', desc, 'property');
      const hashPath = (window.JTRouter ? window.JTRouter.build(key, sub) : (key === 'home' ? '#/' : '#/' + key));
      setMeta('og:url', `${seo.siteUrl}/${hashPath === '#/' ? '' : hashPath}`, 'property');
      setMeta('twitter:title', title);
      setMeta('twitter:description', desc);
      // GA4 page_view — 계산기 단위 측정(/report/cgt). path가 바뀔 때만 1회(중복 발화 방지).
      const gaPath = '/' + metaKey.replace(':', '/');
      if (window.gtag && gaPath !== __jtLastGaPath) {
        __jtLastGaPath = gaPath;
        window.gtag('event', 'page_view', { page_path: gaPath, page_title: title });
      }
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [route]);
}
window.useSeoMeta = useSeoMeta;
function JTFooter({ setRoute }) {
  const D = window.JT_DATA.firm;
  return (
    <footer className="jt-footer">
      <div className="jt-footer__grid">
        <div>
          <div className="jt-footer__brand">
            <img src="project/assets/logo_symbol_white.png" alt="" style={{ height: 36 }} />
            <div style={{ marginTop: 8, fontWeight: 700 }}>제이티 세무회계 <span style={{ opacity: .6, fontWeight: 400 }}>· JT TAX</span></div>
          </div>
          <div className="jt-footer__addr">
            {D.address}<br />
            {D.representative && <>대표 {D.representative} · 사업자등록번호 {D.businessNumber}<br /></>}
            T. <a href={`tel:${D.phone}`} onClick={() => window.jtTrackCta('call', 'footer')}>{D.phone}</a><br />
            E. <a href={`mailto:${D.email}`} onClick={() => window.jtTrackCta('email', 'footer')}>{D.email}</a>
          </div>
        </div>
        <div className="jt-footer__col">
          <h4>Company</h4>
          <a onClick={() => setRoute('about')}>회사소개</a>
          <a onClick={() => setRoute('about', 'team')}>전문가</a>
          <a onClick={() => setRoute('report')}>세금 계산기</a>
          <a onClick={() => setRoute('insights')}>인사이트</a>
        </div>
        <div className="jt-footer__col">
          <h4>Services</h4>
          <a onClick={() => setRoute('services')}>양도·상속·증여</a>
          <a onClick={() => setRoute('services')}>세무조사 대응</a>
          <a onClick={() => setRoute('services')}>기장·세금 신고</a>
          <a onClick={() => setRoute('services')}>세금 종합 컨설팅</a>
          <a onClick={() => setRoute('services')}>경정청구</a>
        </div>
        <div className="jt-footer__col">
          <h4>Contact</h4>
          <a onClick={() => { window.jtTrackCta('booking', 'footer'); setRoute('booking'); }}>상담 예약</a>
          <a onClick={() => setRoute('contact')}>오시는 길</a>
          <a href={`tel:${D.phone}`} onClick={() => window.jtTrackCta('call', 'footer')}>전화 문의</a>
        </div>
      </div>
      <div className="jt-footer__bar">
        <span>© 2026 JT TAX — {D.domain}</span>
        <span>
          <a onClick={() => setRoute('privacy')} style={{cursor: 'pointer'}}>개인정보처리방침</a>
          {' · '}
          <a onClick={() => setRoute('terms')} style={{cursor: 'pointer'}}>이용약관</a>
        </span>
      </div>
    </footer>
  );
}
window.JTFooter = JTFooter;

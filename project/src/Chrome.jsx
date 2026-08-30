/* global React */
const { useEffect, useState } = React;

/* ⚠️ 라우팅 링크가 href 없는 <a> 라 «키보드로 조작할 수 없었다» — Tab 포커스가
   안 가고 Enter 도 안 먹었다 (260805 Codex R12 P1).
   경로가 setRoute 호출이라 정적 href 를 붙일 수 없는 곳이 섞여 있어,
   tabIndex·role=link 와 함께 Enter/Space 를 클릭으로 옮겨 준다. */
function jtKeyActivate(e) {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    if (e.currentTarget && e.currentTarget.click) e.currentTarget.click();
  }
}
window.jtKeyActivate = jtKeyActivate;

/* 실링크(<a href>) 위에서 SPA 라우팅을 우선하는 클릭 핸들러 팩토리 (260830 상업 랜딩).
   보조키(새 탭)·중클릭이면 href 로 정적 페이지에 가게 두고, 일반 클릭만 SPA 로 돌린다
   — 홈 계산기 CTA(Home.jsx, 260830 SEO 파일럿 확정 #1)와 같은 패턴의 공용화. */
function jtNavGo(fn) {
  return function (e) {
    if (e && (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0)) return;
    if (e && e.preventDefault) e.preventDefault();
    fn();
  };
}
window.jtNavGo = jtNavGo;



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

/* ============ 안전한 GA4 이벤트 발화 ============
   ⚠️ 왜 래퍼가 필요한가 (260808 Codex R1 P1):
     리드 폼에서 전환 이벤트를 «전송 성공 뒤»로 옮기면서 try 블록 «안»에 들어갔다.
     그런데 gtag 는 광고차단기·확장프로그램·CSP 환경에서 throw 할 수 있다. 그러면 —
       fetch 성공 → gtag throw → catch → 「전송에 실패했습니다」
     즉 «사무소에는 접수됐는데 방문자에게는 실패로 보이는» 최악의 조합이 된다.
     계측이 본업(리드 접수)을 망치면 안 된다 — 삼키고 조용히 지나간다. */
window.jtEvent = function (name, params) {
  try {
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  } catch (_e) {}
};

// ============ 유입 출처 보존 (attribution) ============
/* 왜 필요한가 (260808):
     리드 payload 에 주제·연락처·문의내용만 담겨 있어, «어느 채널이 실제로 상담을
     만들었는지»를 사후에 알 수 없었다. CTA 클릭 이벤트에는 location 이 있지만
     제출 payload 와 연결되지 않아 둘을 이어붙일 키가 없다.

   설계 원칙 3가지 —
     ① «최초 진입 1회»만 고정한다. 사이트 안에서 라우트를 옮겨 다니면 referrer 가
        자기 도메인으로 덮이고 utm 도 사라진다. 그러면 광고로 들어온 사람이
        「직접 유입」으로 기록된다. sessionStorage 에 처음 값을 박아 두고 이후엔 읽기만.
     ② 세션 ID 를 함께 남긴다. 전송 실패 후 재시도하면 같은 사람이 2건으로 세어져
        전환이 부풀려진다. 접수 메일에 같은 ID 가 보이면 중복임을 사무소가 안다.
     ③ ⛔ 금액·계산값은 절대 넣지 않는다. 이 함수가 담는 것은 «어디서 왔는가»뿐이다.
        (계산 입력값은 동의를 받은 경로로만 전송한다 — ReportConvert 의 confirm 참조)

   sessionStorage 를 쓰는 이유: 탭을 닫으면 사라진다 = 다음 방문은 새 유입으로 잡힌다.
   localStorage 로 하면 몇 달 전 광고가 오늘 상담의 공로를 계속 가져간다. */
window.jtAttribution = (function () {
  var KEY = 'jt_attribution';
  var SCHEMA_V = 2;   // 1: pathname+search·referrer 경로 포함 / 2: pathname 만·referrer origin 만
  var cached = null;

  function capture() {
    var params = {};
    try {
      var sp = new URLSearchParams(window.location.search || '');
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid'].forEach(function (k) {
        var v = sp.get(k);
        if (v) params[k] = String(v).slice(0, 120);
      });
    } catch (_e) {}

    var ref = '';
    try {
      ref = document.referrer || '';
      /* 자기 도메인에서 넘어온 것은 «유입»이 아니라 내부 이동이다.
         ⚠️ 문자열 prefix 비교로는 `https://jttax.co.kr.evil.com` 도 내부로 오분류된다
         (260808 Codex R2 P2). origin 을 파싱해 «정확히 같을 때»만 내부로 본다. */
      if (ref) {
        try { if (new URL(ref).origin === window.location.origin) ref = ''; }
        catch (_e0) { ref = ''; }   // 파싱 불가한 referrer 는 신뢰하지 않는다
      }
      /* ⚠️ referrer 는 «도메인만» 남긴다 — 경로도 query 도 버린다 (260808 Codex R2→R3).
         처음엔 query 만 버렸는데(R2), 경로 자체에 개인정보가 실릴 수 있다는 지적을 받았다:
           https://cafe.naver.com/xxx/member/홍길동  ← 제3자 계정명이 경로에 들어간다
         그 상태로 동의문에 「개인 식별 정보는 포함하지 않습니다」라고 쓰면 거짓이 된다.
         유입 분석에 필요한 것은 «어느 사이트에서 왔는가»이지 «그 사이트의 어느 페이지»가
         아니다. 필요 이상을 받아 두면 그 순간부터 우리가 그 정보의 보관 책임을 진다. */
      if (ref) {
        try { ref = new URL(ref).origin; } catch (_e2) { ref = ''; }
      }
    } catch (_e) {}

    /* 세션 ID — 암호학적 용도가 아니라 «같은 접수인지» 구분용이다.
       crypto.randomUUID 가 없는 구형 브라우저를 위해 폴백을 둔다. */
    var sid = '';
    try {
      sid = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    } catch (_e) { sid = Math.random().toString(36).slice(2, 10); }

    return {
      /* 스키마 버전 — 형식이 바뀌면 올린다 (260808 Codex R3 P1).
         sessionStorage 에 남아 있던 «옛 형식» 값을 그대로 재사용하면, 코드를 고쳐도
         이미 열려 있는 탭은 옛 규칙대로 계속 전송한다. 버전이 다르면 버리고 다시 잡는다. */
      v: SCHEMA_V,
      sid: sid,
      utm: params,
      referrer: ref.slice(0, 200),
      /* ⚠️ 랜딩은 «경로만» 남긴다 — query string 은 통째로 버린다 (260808 Codex R2 P1).
         종전엔 `pathname + search` 를 그대로 실었는데, URL 파라미터에 무엇이 붙어 들어올지
         우리가 정할 수 없다(외부 링크·광고·공유 도구가 임의 키를 붙인다). 그 상태로
         「개인 식별 정보는 포함하지 않습니다」라고 고지하면 지킬 수 없는 약속이 된다.
         우리가 실제로 필요한 유입 정보는 위 utm 화이트리스트로 이미 받고 있다. */
      landing: (function () {
        try { return String(window.location.pathname || '/').slice(0, 200); } catch (_e) { return ''; }
      })(),
      firstSeen: new Date().toISOString(),
    };
  }

  return function () {
    if (cached) return cached;
    try {
      var raw = sessionStorage.getItem(KEY);
      if (raw) {
        var prev = JSON.parse(raw);
        /* ⚠️ «옛 형식은 신뢰하지 않는다» (260808 Codex R3 P1).
           v 가 없거나 다르면 그 값은 지금 규칙보다 넓은 정보를 담고 있을 수 있다
           (예: v1 의 landing 에는 query 가, referrer 에는 경로가 들어 있다).
           고친 규칙이 «이미 열려 있는 탭»에도 적용되도록 버리고 다시 잡는다. */
        if (prev && prev.v === SCHEMA_V) { cached = prev; return cached; }
      }
    } catch (_e) {}
    cached = capture();
    try { sessionStorage.setItem(KEY, JSON.stringify(cached)); } catch (_e) {}
    return cached;
  };
})();

/* 리드 payload 에 붙일 «사람이 읽는» 한 줄로 정리한다.
   사무소 담당자가 접수 메일에서 바로 알아볼 수 있어야 하므로 한글 키를 쓴다. */
window.jtAttributionFields = function (ctaLocation) {
  try {
    var a = window.jtAttribution();
    var u = a.utm || {};
    var src = u.utm_source
      ? (u.utm_source + (u.utm_medium ? ' / ' + u.utm_medium : '') + (u.utm_campaign ? ' / ' + u.utm_campaign : ''))
      : (a.referrer ? a.referrer : '직접 유입');
    return {
      접수ID: a.sid,
      유입경로: src,
      유입상세: a.referrer || '—',
      랜딩페이지: a.landing || '/',
      제출위치: ctaLocation || '—',
    };
  } catch (_e) { return {}; }
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
      <a tabIndex={0} role="link" onKeyDown={jtKeyActivate} className="jt-nav__brand" onClick={() => setRoute('home')} aria-label="제이티 세무법인 홈">
        <img src="project/assets/logo_symbol.png" alt="" style={{ height: 26 }} />
        <span style={{ fontWeight: 700, letterSpacing: '-0.01em', marginLeft: 8 }}>제이티 세무법인</span>
      </a>
      {/* 크롤러용 실링크 + 사용자는 SPA (260830 상업 랜딩 — 계산기 CTA와 같은 «실링크+JS 우선» 패턴).
          jtGo(href 보존 조건: 보조키·중클릭)는 아래 jtNavGo 헬퍼로 통일한다. */}
      <nav className="jt-nav__links">
        <a href="/about/" tabIndex={0} role="link" onKeyDown={jtKeyActivate} className={route === 'about' ? 'active' : ''} onClick={jtNavGo(() => setRoute('about'))}>회사소개</a>
        <div className="jt-nav__dd-wrap" onMouseEnter={openSvc} onMouseLeave={closeSvc}>
          <a href="/services/" tabIndex={0} role="link" onKeyDown={jtKeyActivate}
            className={`jt-nav__dd-trigger ${route === 'services' ? 'active' : ''}`}
            onClick={jtNavGo(() => setRoute('services'))}
            aria-haspopup="true"
            aria-expanded={svcOpen}
          >
            업무분야 <span className="jt-nav__dd-caret" aria-hidden="true">▾</span>
          </a>
          {svcOpen && (
            <div className="jt-nav__dd" onMouseEnter={openSvc} onMouseLeave={closeSvc}>
              {services.map((s) => (
                <a href={s.slug ? `/services/${s.slug}.html` : '/services/'} tabIndex={0} role="link" onKeyDown={jtKeyActivate} key={s.num} className="jt-nav__dd-item" onClick={jtNavGo(() => goService(s.kr))}>
                  <span className="jt-nav__dd-num">{s.num}</span>
                  <span className="jt-nav__dd-label">
                    <span className="jt-nav__dd-kr">{s.kr}</span>
                    <span className="jt-nav__dd-en">{s.en}</span>
                  </span>
                </a>
              ))}
              <div className="jt-nav__dd-sep" role="separator"></div>
              <a href="/services/" tabIndex={0} role="link" onKeyDown={jtKeyActivate} className="jt-nav__dd-item jt-nav__dd-item--all" onClick={jtNavGo(() => goService(null))}>
                <span className="jt-nav__dd-all-label">전체 업무분야 보기</span>
                <span className="jt-arrow">→</span>
              </a>
            </div>
          )}
        </div>
        <a href="/calculators/" tabIndex={0} role="link" onKeyDown={jtKeyActivate} className={route === 'report' ? 'active' : ''} onClick={jtNavGo(() => setRoute('report'))}>세금 계산기</a>
        <a tabIndex={0} role="link" onKeyDown={jtKeyActivate} className={route === 'insights' ? 'active' : ''} onClick={() => setRoute('insights')}>인사이트</a>
        <a href="/consult.html" tabIndex={0} role="link" onKeyDown={jtKeyActivate} className={route === 'contact' ? 'active' : ''} onClick={jtNavGo(() => setRoute('contact'))}>오시는 길</a>
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
          {[['about', '회사소개', '/about/'], ['services', '업무분야', '/services/'], ['report', '세금 계산기', '/calculators/'], ['insights', '인사이트', null], ['contact', '오시는 길', '/consult.html']].map(([r, l, h]) => (
            h
              ? <a href={h} tabIndex={0} role="link" onKeyDown={jtKeyActivate} key={r} className={route === r ? 'is-active' : ''} onClick={jtNavGo(() => { setRoute(r); setMenuOpen(false); })}>{l}</a>
              : <a tabIndex={0} role="link" onKeyDown={jtKeyActivate} key={r} className={route === r ? 'is-active' : ''} onClick={() => { setRoute(r); setMenuOpen(false); }}>{l}</a>
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
      {/* ⚠️ raw gtag 를 직접 부르면 광고차단기 환경에서 throw 해 «그 다음 줄»이 실행되지 않는다.
          특히 예약 버튼은 setRoute('booking') 까지 막혀 «눌러도 아무 일도 안 나는» 상태가 된다
          (260808 Codex R2 P2). 계측은 jtEvent 로 감싸 삼킨다. */}
      <a className="jt-mcta__btn" href={`tel:${D.phone}`} onClick={() => { window.jtEvent('mcta_call'); window.jtTrackCta('call', 'sticky'); }}>
        <span className="jt-mcta__ico" aria-hidden="true">{Icon ? <Icon name="phone" /> : '☏'}</span>
        <span>전화</span>
      </a>
      <a className="jt-mcta__btn" href={D.kakaoChatUrl} target="_blank" rel="noopener" onClick={() => { window.jtEvent('mcta_kakao'); window.jtTrackCta('kakao', 'sticky'); }}>
        <span className="jt-mcta__ico" aria-hidden="true">{Icon ? <Icon name="chat" /> : '💬'}</span>
        <span>카톡</span>
      </a>
      <button className="jt-mcta__btn jt-mcta__btn--primary" onClick={() => { window.jtEvent('mcta_booking'); window.jtTrackCta('booking', 'sticky'); setRoute('booking'); }}>
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
      /* ⚠️ canonical 을 홈에 고정해 두면 모든 해시 화면이 «홈의 중복본»으로 신호된다.
         해시 화면은 색인 대상이 아니고(색인은 /calculators/*.html 정적 랜딩이 맡는다),
         그렇다고 홈을 가리키면 오신호다 → 화면별 URL 로 갱신 (260805 Codex R3 P2). */
      try {
        let can = document.querySelector('link[rel="canonical"]');
        if (!can) { can = document.createElement('link'); can.setAttribute('rel', 'canonical'); document.head.appendChild(can); }
        can.setAttribute('href', `${seo.siteUrl}/${hashPath === '#/' ? '' : hashPath}`);
      } catch (e) {}
      setMeta('twitter:title', title);
      setMeta('twitter:description', desc);
      // GA4 page_view — 계산기 단위 측정(/report/cgt). path가 바뀔 때만 1회(중복 발화 방지).
      const gaPath = '/' + metaKey.replace(':', '/');
      if (gaPath !== __jtLastGaPath) {
        __jtLastGaPath = gaPath;
        /* GA4 표준 필드는 page_location(전체 URL)·page_title 이다.
           page_path 는 UA 시절 필드라 GA4 에선 경로 분류가 안 잡힌다 (260805 Codex R12 P1).
           jtEvent 로 감싸 계측 예외가 이 effect 의 나머지(메타·canonical 갱신)를 막지 않게 한다. */
        window.jtEvent('page_view', {
          page_location: (function () { try { return location.origin + '/' + gaPath.replace(/^\//, ''); } catch (e) { return gaPath; } })(),
          page_title: title,
        });
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
            <div style={{ marginTop: 8, fontWeight: 700 }}>제이티 세무법인 <span style={{ opacity: .6, fontWeight: 400 }}>· JT TAX CORP.</span></div>
          </div>
          <div className="jt-footer__addr">
            {D.address}<br />
            {D.representative && (
              <>
                대표 {D.representative}
                {D.businessNumber && <> · 사업자등록번호 {D.businessNumber}</>}
                <br />
              </>
            )}
            T. <a href={`tel:${D.phone}`} onClick={() => window.jtTrackCta('call', 'footer')}>{D.phone}</a><br />
            E. <a href={`mailto:${D.email}`} onClick={() => window.jtTrackCta('email', 'footer')}>{D.email}</a>
          </div>
        </div>
        <div className="jt-footer__col">
          <h4>Company</h4>
          <a href="/about/" tabIndex={0} role="link" onKeyDown={jtKeyActivate} onClick={jtNavGo(() => setRoute('about'))}>회사소개</a>
          <a href="/experts/" tabIndex={0} role="link" onKeyDown={jtKeyActivate} onClick={jtNavGo(() => setRoute('about', 'team'))}>전문가</a>
          <a href="/calculators/" tabIndex={0} role="link" onKeyDown={jtKeyActivate} onClick={jtNavGo(() => setRoute('report'))}>세금 계산기</a>
          <a tabIndex={0} role="link" onKeyDown={jtKeyActivate} onClick={() => setRoute('insights')}>인사이트</a>
        </div>
        <div className="jt-footer__col">
          <h4>Services</h4>
          <a href="/services/asset-transfer.html" tabIndex={0} role="link" onKeyDown={jtKeyActivate} onClick={jtNavGo(() => setRoute('services'))}>양도·상속·증여</a>
          <a href="/services/tax-audit.html" tabIndex={0} role="link" onKeyDown={jtKeyActivate} onClick={jtNavGo(() => setRoute('services'))}>세무조사 대응</a>
          <a href="/services/bookkeeping.html" tabIndex={0} role="link" onKeyDown={jtKeyActivate} onClick={jtNavGo(() => setRoute('services'))}>기장·세금 신고</a>
          <a href="/services/consulting.html" tabIndex={0} role="link" onKeyDown={jtKeyActivate} onClick={jtNavGo(() => setRoute('services'))}>세금 종합 컨설팅</a>
          <a href="/services/tax-refund.html" tabIndex={0} role="link" onKeyDown={jtKeyActivate} onClick={jtNavGo(() => setRoute('services'))}>경정청구</a>
        </div>
        <div className="jt-footer__col">
          <h4>Contact</h4>
          <a tabIndex={0} role="link" onKeyDown={jtKeyActivate} onClick={() => { window.jtTrackCta('booking', 'footer'); setRoute('booking'); }}>상담 예약</a>
          <a href="/consult.html" tabIndex={0} role="link" onKeyDown={jtKeyActivate} onClick={jtNavGo(() => setRoute('contact'))}>오시는 길</a>
          <a href={`tel:${D.phone}`} onClick={() => window.jtTrackCta('call', 'footer')}>전화 문의</a>
        </div>
      </div>
      <div className="jt-footer__bar">
        <span>© 2026 JT TAX CORP. — {D.domain}</span>
        <span>
          <a tabIndex={0} role="link" onKeyDown={jtKeyActivate} onClick={() => setRoute('privacy')} style={{cursor: 'pointer'}}>개인정보처리방침</a>
          {' · '}
          <a tabIndex={0} role="link" onKeyDown={jtKeyActivate} onClick={() => setRoute('terms')} style={{cursor: 'pointer'}}>이용약관</a>
        </span>
      </div>
    </footer>
  );
}
window.JTFooter = JTFooter;

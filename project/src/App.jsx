"use strict";
/* global React, ReactDOM */
/* ══════════════════════════════════════════════════════════════════════════
   앱 진입점 — 라우터 + 최상위 App (260810 index.html 인라인에서 분리)

   ▣ 왜 파일로 뺐나
     종전엔 이 275줄이 index.html 안의 <script type="text/babel"> 였다. 그러면
     @babel/standalone(3.0MB)이 «방문자 브라우저에서» 이걸 변환해야 해서 그 라이브러리를
     지울 수 없었다. 파일로 빼면 빌드 때 미리 변환해 번들에 담을 수 있다.
   ⛔ 이 파일은 번들의 «맨 마지막»에 들어간다 — 다른 컴포넌트가 모두 정의된 뒤
      ReactDOM.render 가 실행돼야 한다. 순서는 project/scripts/build_bundle.mjs 가 정한다.
   ══════════════════════════════════════════════════════════════════════════ */

/* ⛔ 별칭을 쓴다 — 번들은 파일들을 «전역 스코프에 이어붙이므로» 다른 파일과 같은 이름을
   최상위에 선언하면 SyntaxError 로 앱 전체가 죽는다. 실제로 Chrome.jsx 가 useState·useEffect 를
   선언하고 있어 첫 빌드가 터졌다. 다른 파일들이 useStateHome·useHC 처럼 별칭을 쓰는 이유가 이것이다.
   (tests_bundle.js 가 중복 최상위 선언을 검사한다) */
const { useState: useAppState, useEffect: useAppEffect } = React;

// ============ 해시 라우터 (#/route/sub) — 계산기 딥링크·공유·뒤로가기 ============
// 형식: '#/' 홈 · '#/report' 허브 · '#/report/cgt' 양도세 계산기 · '#/services' 등
// '#/' 로 시작하는 해시만 라우터로 인식 → 회사소개 탭(#team)·인사이트 등 레거시 해시와 충돌 없음.
const JTRouter = {
  parse() {
    try {
      const raw = window.location.hash || '';
      if (!raw.indexOf || raw.indexOf('#/') !== 0) return { router: false, route: '', sub: '' };
      const parts = raw.replace(/^#\//, '').split('/').filter(Boolean);
      return { router: true, route: parts[0] || 'home', sub: parts[1] || '' };
    } catch (e) { return { router: false, route: '', sub: '' }; }
  },
  build(route, sub) {
    if (!route || route === 'home') return '#/';
    return '#/' + route + (sub && sub !== 'hub' ? '/' + sub : '');
  },
  set(route, sub) {
    try {
      const target = this.build(route, sub);
      if (window.location.hash !== target) window.location.hash = target;
    } catch (e) {}
  },
};
window.JTRouter = JTRouter;

const JT_KNOWN_ROUTES = ['home', 'services', 'team', 'about', 'insights', 'report', 'contact', 'booking', 'privacy', 'terms'];
const jtNormRoute = (r) => (JT_KNOWN_ROUTES.indexOf(r) >= 0 ? r : 'home'); // 모르는 페이지 키 → 홈 (깨진 링크 방어)

const TWEAK_DEFAULTS = {
  "servicesLayout": "grid",
  "showQuote": false,
  "showProof": false
};

function App() {
  const initRoute = (() => {
    const r = JTRouter.parse();
    if (r.router && r.route) return jtNormRoute(r.route);
    try { return jtNormRoute(localStorage.getItem('jt_route') || 'home'); } catch (e) { return 'home'; }
  })();
  const [route, setRouteRaw] = useAppState(initRoute);
  const [aboutTab, setAboutTab] = useAppState(() => {
    try {
      const h = (window.location.hash || '').replace('#', '');
      if (h === 'team') return 'team';
    } catch (e) {}
    return 'company';
  });
  const [detailOpen, setDetailOpen] = useAppState(null);
  const [tweaks, setTweaks] = useAppState(TWEAK_DEFAULTS);
  const [editMode, setEditMode] = useAppState(false);

  const setRoute = React.useCallback((name, tab) => {
    if (name === 'team') {
      setAboutTab('team');
      setRouteRaw('about');
      JTRouter.set('about');
      return;
    }
    if (name === 'about') {
      setAboutTab(tab === 'team' ? 'team' : 'company');
    }
    setRouteRaw(name);
    JTRouter.set(name);
  }, []);

  useAppEffect(() => {
    try { localStorage.setItem('jt_route', route); } catch (e) {}
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [route]);

  // 브라우저 뒤로/앞으로 → 해시 재해석해 route 동기화 (idempotent)
  useAppEffect(() => {
    const onHash = () => {
      const r = JTRouter.parse();
      if (r.router && r.route) setRouteRaw(jtNormRoute(r.route));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 최초 진입 시 URL이 라우터 해시가 아니면(localStorage 복원/맨주소) 현재 route를 URL에 반영
  useAppEffect(() => {
    const r = JTRouter.parse();
    if (!r.router) JTRouter.set(route);
  }, []);

  useAppEffect(() => {
    const handler = (e) => {
      const d = e.data || {};
      if (d.type === '__activate_edit_mode') setEditMode(true);
      if (d.type === '__deactivate_edit_mode') setEditMode(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  const updateTweak = (k, v) => {
    const next = { ...tweaks, [k]: v };
    setTweaks(next);
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
  };

  useAppEffect(() => {
    let io = null;
    const bind = () => {
      const els = document.querySelectorAll('.reveal:not(.is-visible)');
      if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('is-visible')); return; }
      if (!io) {
        io = new IntersectionObserver((entries) => {
          entries.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
          });
        }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
      }
      els.forEach(e => io.observe(e));
    };
    requestAnimationFrame(() => requestAnimationFrame(bind));
    const fallback = setTimeout(() => {
      document.querySelectorAll('.reveal:not(.is-visible)').forEach(e => {
        const r = e.getBoundingClientRect();
        if (r.top < window.innerHeight) e.classList.add('is-visible');
      });
    }, 200);
    return () => { clearTimeout(fallback); if (io) io.disconnect(); };
  }, [route]);

  const pageClass = `jt-app jt-page-${route}`;
  window.useSeoMeta(route);

  return (
    <div className={pageClass}>
      <JTNav route={route} setRoute={setRoute} />
      <main className="jt-main">
        {route === 'home' && (
          <div>
            <JTBrandMoment setRoute={setRoute} />
            <JTHero setRoute={setRoute} />
            <JTCreds />
            <JTReportHome setRoute={setRoute} />
            <JTTeaserBand kicker="SERVICES · 업무분야" title="근거에 기반한 다섯 개 전문 영역." sub={window.JT_DATA.services.map(s => s.kr).join('   ·   ')} ctaLabel="전체 업무분야 보기" onGo={() => setRoute('services')} />
            <JTTeaserBand kicker="TEAM · 담당 세무사" title="담당 세무사가 직접." sub="세법을 가르치고 집필해 온 세무사들이 각자의 전문 영역에서 직접 맡습니다." ctaLabel="전문가 소개 보기" onGo={() => setRoute('about', 'team')} />
            {tweaks.showQuote && <JTQuote />}
            {tweaks.showProof !== false && <JTProof setRoute={setRoute} />}
            <JTInsightsPreview setRoute={setRoute} limit={3} />
            <JTChannels setRoute={setRoute} />
            <JTFaq setRoute={setRoute} />
            <JTCta setRoute={setRoute} />
          </div>
        )}
        {route === 'services' && <div><JTServicesPage setRoute={setRoute} /></div>}
        {route === 'team' && <div><JTAbout setRoute={setRoute} initialTab="team" /></div>}
        {route === 'about' && <div><JTAbout setRoute={setRoute} initialTab={aboutTab} /></div>}
        {route === 'insights' && <div><JTInsightsPage setRoute={setRoute} /></div>}
        {route === 'report' && <div><JTReportPage setRoute={setRoute} /></div>}
        {route === 'contact' && <div><JTContact setRoute={setRoute} /></div>}
        {route === 'booking' && <div><JTBooking setRoute={setRoute} /></div>}
        {route === 'privacy' && <div><JTLegal kind="privacy" setRoute={setRoute} /></div>}
        {route === 'terms' && <div><JTLegal kind="terms" setRoute={setRoute} /></div>}
      </main>
      <JTFooter setRoute={setRoute} />
      <svg className="jt-logomark-fix" viewBox="138 201 156 102" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 0V-83.221L-17.231-65.99H-42.95V-98.204L9.612-98.174 32.154-75.119 32.213 0Z" transform="matrix(1,0,0,-1,182.414,203.14209)" />
        <path d="M0 0-48.285-.03-70.827-23.085-70.887-98.204H-38.673V-49.563L-56.021-32.215H0Z" transform="matrix(1,0,0,-1,291.8127,203.14209)" />
      </svg>
      <JTMobileCta setRoute={setRoute} route={route} />

      {editMode && (
        <div className="jt-tweaks">
          <div className="jt-tweaks__head">
            <h5>Tweaks · JT TAX CORP.</h5>
            <button className="jt-tweaks__close" onClick={() => setEditMode(false)}>×</button>
          </div>
          <div className="jt-tweaks__body">
            <div className="jt-tweaks__group">
              <label>서비스 섹션</label>
              <div className="jt-tweaks__opts">
                {[['grid','2×2 그리드'],['list','리스트 행']].map(([v, l]) => (
                  <button key={v} className={`jt-tweaks__opt ${tweaks.servicesLayout === v ? 'is-active' : ''}`} onClick={() => updateTweak('servicesLayout', v)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="jt-tweaks__group">
              <label>시나리오 섹션</label>
              <div className="jt-tweaks__opts">
                <button className={`jt-tweaks__opt ${tweaks.showProof !== false ? 'is-active' : ''}`} onClick={() => updateTweak('showProof', true)}>표시</button>
                <button className={`jt-tweaks__opt ${tweaks.showProof === false ? 'is-active' : ''}`} onClick={() => updateTweak('showProof', false)}>숨김</button>
              </div>
            </div>
            <div className="jt-tweaks__group">
              <label>인용구 섹션</label>
              <div className="jt-tweaks__opts">
                <button className={`jt-tweaks__opt ${tweaks.showQuote ? 'is-active' : ''}`} onClick={() => updateTweak('showQuote', true)}>표시</button>
                <button className={`jt-tweaks__opt ${!tweaks.showQuote ? 'is-active' : ''}`} onClick={() => updateTweak('showQuote', false)}>숨김</button>
              </div>
            </div>
            <div className="jt-tweaks__group">
              <label>바로가기 (페이지 이동)</label>
              <div className="jt-tweaks__opts">
                {[['home','홈'],['about','회사소개'],['services','업무분야'],['report','세금 계산기'],['insights','인사이트'],['contact','오시는 길'],['booking','상담 예약']].map(([v, l]) => (
                  <button key={v} className={`jt-tweaks__opt ${route === v ? 'is-active' : ''}`} onClick={() => setRoute(v)}>{l}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ⚠️ 렌더 중 예외 하나가 «전 화면을 백지»로 만든다 — React 는 에러 경계가 없으면
   트리 전체를 언마운트한다. 260805 에 실제로 홈이 20분간 백지였다(JSX 문법 오류).
   그때는 사이트에 전화번호조차 남지 않아, 방문자에게 «회사가 사라진 것»처럼 보였다.

   그래서 최후 방어선을 둔다 — 무엇이 깨지든 **연락 수단만은 화면에 남긴다**.
   계산기가 안 되는 것과 회사에 연락할 방법이 없는 것은 손해의 크기가 다르다.
   (Phase 2 번들 도입을 앞두고 미리 깔아 둔다 — 번들은 파일 하나의 오류가
    전체로 번지는 구조라 위험이 더 커진다.) */
class JTErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) {
    try {
      // 무슨 화면에서 깨졌는지 알아야 고칠 수 있다 — 계측은 실패해도 무시
      window.jtEvent && window.jtEvent('app_crash', {
        route: (window.location.hash || '#/').slice(0, 40),
        message: String((err && err.message) || err).slice(0, 120),
      });
    } catch (_e) {}
    try { console.error('[JT] 렌더 실패:', err); } catch (_e) {}
  }
  render() {
    if (!this.state.failed) return this.props.children;
    /* ⚠️ JT_DATA 가 «못 읽힌 것»이 실패 원인일 수 있다 — 그러면 연락처가 통째로
       사라진다 (260808 Codex P2a P1). 상수를 폴백으로 둔다.
       ⛔ 값을 바꿀 땐 project/src/Data.jsx 의 firm·상단 부팅 폴백과 함께 고칠 것. */
    const F = (window.JT_DATA && window.JT_DATA.firm) || {};
    const D = {
      phone: F.phone || '02-554-6405',
      kakaoChannelUrl: F.kakaoChannelUrl || F.kakaoChatUrl || 'https://pf.kakao.com/_CcxlJG',
      nameKr: F.nameKr || '제이티 세무법인',
      representative: F.representative || '이현준',
    };
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '80px 24px', fontFamily: 'Pretendard, system-ui, sans-serif', color: '#0B0B0F' }}>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.16em', color: '#888' }}>제이티 세무법인</div>
        <h1 style={{ fontSize: 26, letterSpacing: '-0.02em', margin: '12px 0 14px' }}>화면을 불러오지 못했습니다.</h1>
        <p style={{ fontSize: 15, lineHeight: 1.75, color: '#5a5a5a', margin: '0 0 28px' }}>
          일시적인 오류입니다. 새로고침해도 같으면 아래로 바로 연락 주세요 — 상담은 정상적으로 진행됩니다.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {/* 조건부(&&)를 쓰지 않는다 — 값이 비면 링크가 통째로 사라지는데,
              이 화면은 «연락 수단만은 남긴다»가 존재 이유다. 위 D 가 상수로 보장한다 */}
          <a href={`tel:${D.phone}`} style={{ padding: '13px 22px', background: '#0B0B0F', color: '#fff', textDecoration: 'none', fontSize: 14 }}>전화 {D.phone}</a>
          <a href={D.kakaoChannelUrl} target="_blank" rel="noopener" style={{ padding: '13px 22px', border: '1px solid rgba(0,0,0,.2)', color: '#0B0B0F', textDecoration: 'none', fontSize: 14 }}>카카오톡 상담 <span style={{ fontSize: 11, color: '#888' }}>(새 창)</span></a>
          <a href="/calculators/" style={{ padding: '13px 22px', border: '1px solid rgba(0,0,0,.2)', color: '#0B0B0F', textDecoration: 'none', fontSize: 14 }}>세금 계산기</a>
        </div>
        {/* 세무사법 시행령 §33① 표시의무 — 화면이 깨져도 사무소명·세무사 성명은 남긴다 */}
        <p style={{ fontSize: 12, color: '#888', marginTop: 32 }}>
          {D.nameKr || '제이티 세무법인'}{D.representative ? ` · 대표 세무사 ${D.representative}` : ''}
        </p>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <JTErrorBoundary><App /></JTErrorBoundary>
);
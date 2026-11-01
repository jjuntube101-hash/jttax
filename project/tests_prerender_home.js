/* 홈 첫 화면 선렌더 게이트 (261101 SEO 2-7)

   막으려는 것
   1) JSX(헤더·히어로)를 고쳤는데 index.html 의 선렌더가 옛 마크업으로 남는 것
      → 지금 번들로 다시 그려 index.html 과 글자 단위로 대조. 고치는 법: npm run build
   2) 선렌더용 React 판과 브라우저가 unpkg 에서 받는 판이 어긋나는 것
   3) 앱 스크립트가 다시 HTML 해석 중에 요청돼(src 단 script·preload) 첫 화면 경로에 끼는 것 — 로더가 두 번째 프레임에 붙인다
   4) 선렌더 때문에 #root 에 h1·main 이 둘이 되거나, 선렌더 안에 스크립트·이벤트 속성이 섞이는 것
*/
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const bad = [];
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

(async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, 'scripts', 'prerender_home.mjs')).href);

  /* 1) 최신성 */
  let parts = null;
  try { parts = mod.renderFirstScreen(); } catch (e) { bad.push('선렌더 실패 — ' + e.message); }
  if (parts && mod.applyToIndex(html, parts) !== html) bad.push('index.html 의 홈 선렌더가 지금 번들과 다릅니다 — npm run build (prerender_home.mjs) 를 다시 돌리세요');

  /* 2) 판 일치: package.json 고정 판 = unpkg 판 */
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const name of ['react', 'react-dom']) {
    const m = html.match(new RegExp(`https://unpkg\\.com/${name}@([0-9.]+)/umd/`));
    const want = m && m[1], got = (pkg.devDependencies || {})[name];
    if (!want || got !== want) bad.push(`package.json devDependencies.${name}(${got}) 가 index.html 의 unpkg 판(${want})과 정확히 같아야 합니다`);
  }

  /* 3) 앱 스크립트는 «첫 화면 뒤» 요청 (261101 2-7 후속) — 목록 태그 4개 + 로더 1개.
     진짜 src 가 달린 script 가 body 에 있으면 미리 읽기가 HTML 해석 중에 받아 버린다. */
  const bodyHtml = html.slice(html.indexOf('<body')).replace(/<!--[\s\S]*?-->/g, '');
  const realSrc = [...bodyHtml.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  if (realSrc.length) bad.push('index.html — body 에 src 를 단 script 가 있습니다(첫 화면 전에 요청됨): ' + realSrc.join(', '));
  /* 속성 순서와 무관하게 본다 (Codex 2-7b R1-F2) — 태그 하나씩 속성을 읽는다 */
  const attrsOf = (tag) => Object.fromEntries([...tag.matchAll(/\s([a-z-]+)(?:="([^"]*)")?/g)].map((m) => [m[1], m[2] === undefined ? '' : m[2]]));
  for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
    const at = attrsOf(tag);
    if (/^(preload|modulepreload)$/.test(at.rel || '') && /app\.js|insight-meta|react/.test(at.href || '')) bad.push('index.html — 앱 스크립트를 preload 합니다(첫 화면 전에 요청됨): ' + at.href);
  }
  const late = [...bodyHtml.matchAll(/<script\b[^>]*>/g)].map((m) => attrsOf(m[0])).filter((at) => 'data-late-script' in at)
    .map((at) => ({ src: at['data-src'], sri: at['data-integrity'], type: at.type }));
  for (const l of late) if (l.type !== 'text/plain') bad.push(`index.html — 늦게 받을 목록 태그 ${l.src} 의 type 이 text/plain 이 아닙니다(브라우저가 바로 실행·요청)`);
  const order = ['https://unpkg.com/react@', 'https://unpkg.com/react-dom@', 'project/dist/insight-meta.js?v=', 'project/dist/app.js?v='];
  if (late.length !== order.length || !order.every((o, i) => late[i].src.startsWith(o))) bad.push('index.html — 늦게 받을 스크립트 목록이 react → react-dom → insight-meta → app 네 개가 아닙니다');
  for (const l of late) if (l.src.startsWith('https://') !== !!l.sri) bad.push(`index.html — ${l.src}: 외부 파일에는 SRI(data-integrity)가 있어야 하고 자체 파일에는 없어야 합니다`);
  /* 로더를 실제로 돌려 본다 — 두 갈래 × 신호 순서 두 가지:
     (가) FCP 기록을 보는 브라우저: first-contentful-paint 뒤에 시작(그 전 페인트·프레임으로는 시작하지 않음)
     (나) 못 보는 브라우저: 두 번째 프레임에 시작
     (다) load 가 먼저 오는 경우(숨은 탭 등): load 직후가 아니라 그 뒤 두 번째 프레임에 시작 (Codex R2-F1·F2)
     공통: 목록 순서·async=false·SRI 옮김·시간 타이머 없음·두 번 붙이지 않음
     덧붙여: 선렌더 «상담 신청» 링크 클릭 → 예약 유래·cta_click 기록 (Codex R2-F3) */
  const loaderSrc = (bodyHtml.match(/<script>\s*(\(function \(\) \{\s*var started[\s\S]*?\}\)\(\);)\s*<\/script>/) || [])[1];
  if (!loaderSrc) bad.push('index.html — 늦게 받는 로더 스크립트가 없습니다');
  else {
    const tags = late.map((l) => ({ getAttribute: (k) => (k === 'data-src' ? l.src : k === 'data-integrity' ? (l.sri || null) : null) }));
    const load = (withPaint) => {
      const env = { appended: [], frames: [], timers: [], observers: [], loads: [], clicks: [], store: {}, events: [] };
      class PO {
        constructor(cb) { this.cb = cb; this.on = false; env.observers.push(this); }
        observe(o) { if (o.type === 'paint') this.on = true; }
        disconnect() { this.on = false; }
      }
      PO.supportedEntryTypes = withPaint ? ['paint', 'largest-contentful-paint'] : ['largest-contentful-paint'];
      const sandbox = {
        window: {
          requestAnimationFrame: true, PerformanceObserver: PO,
          addEventListener: (ev, f) => { if (ev === 'load') env.loads.push(f); },
          gtag: (...a) => env.events.push(a),
          location: { get hash() { return env.hash; } },
        },
        PerformanceObserver: PO,
        requestAnimationFrame: (f) => env.frames.push(f),
        setTimeout: (f, ms) => env.timers.push({ f, ms }),
        sessionStorage: { getItem: (k) => (k in env.store ? env.store[k] : null), setItem: (k, v) => { env.store[k] = String(v); } },
        document: {
          querySelectorAll: (sel) => (sel === 'script[data-late-script]' ? tags : []),
          createElement: () => ({}),
          body: { appendChild: (s) => env.appended.push(s) },
          addEventListener: (ev, f) => { if (ev === 'click') env.clicks.push(f); },
        },
      };
      require('vm').runInNewContext(loaderSrc, sandbox);
      return env;
    };
    const drainFrames = (env) => { for (let n = 0; env.frames.length && n < 10; n++) env.frames.shift()(); };
    const check = (env, tag) => {
      const { appended } = env;
      if (appended.length !== 4 || appended.some((s, i) => s.src !== late[i].src || s.async !== false)) bad.push(`로더${tag}가 목록 순서대로 async=false 로 붙이지 않습니다`);
      if (appended.some((s, i) => (late[i].sri ? s.integrity !== late[i].sri || s.crossOrigin !== 'anonymous' : s.integrity))) bad.push(`로더${tag}가 SRI·crossOrigin 을 옮기지 않습니다`);
      if (env.timers.some((t) => t.ms > 0)) bad.push(`로더${tag}가 시간 타이머로 시작합니다 — 느린 기기에서 FCP 보다 먼저 받을 수 있습니다`);
      // 다른 신호가 뒤늦게 와도 다시 붙이지 않는다
      env.loads.forEach((f) => f()); drainFrames(env);
      env.observers.forEach((o) => o.cb({ getEntries: () => [{ name: 'first-contentful-paint' }] }));
      env.timers.filter((t) => t.ms === 0).forEach((t) => t.f());
      if (appended.length !== 4) bad.push(`로더${tag}가 두 번 시작돼 스크립트를 두 번 붙입니다`);
    };
    for (const withPaint of [true, false]) {
      const tag = withPaint ? '(FCP 기록)' : '(프레임 대체)';
      // ① 정상 순서
      let env = load(withPaint);
      if (env.appended.length) bad.push(`로더${tag}가 시작 신호 전에 스크립트를 붙였습니다`);
      if (env.loads.length !== 1) bad.push(`로더${tag}에 load 안전판이 없습니다`);
      if (withPaint) {
        if (env.frames.length) bad.push('로더(FCP 기록)가 프레임 신호도 함께 겁니다 — FCP 보다 이르게 시작될 수 있습니다');
        const po = env.observers.find((o) => o.on);
        if (!po) { bad.push('로더가 paint 기록을 구독하지 않습니다'); continue; }
        po.cb({ getEntries: () => [{ name: 'first-paint' }] });
        env.timers.filter((t) => t.ms === 0).forEach((t) => t.f());
        if (env.appended.length) bad.push('로더가 first-paint(글자 없는 페인트)에 시작했습니다 — first-contentful-paint 여야 합니다');
        po.cb({ getEntries: () => [{ name: 'first-contentful-paint' }] });
        if (po.on) bad.push('로더가 FCP 뒤에 구독을 끊지 않습니다');
        env.timers.filter((t) => t.ms === 0).forEach((t) => t.f());
      } else {
        if (env.frames.length !== 1) { bad.push('로더(프레임 대체)가 프레임 신호를 걸지 않습니다'); continue; }
        env.frames.shift()();
        if (env.appended.length) bad.push('로더(프레임 대체)가 첫 프레임에 붙였습니다 — 두 번째 프레임이어야 합니다');
        env.frames.shift()();
      }
      check(env, tag);
      // ② load 가 FCP·프레임보다 먼저 온다 (숨은 탭에서 load 가 끝난 경우)
      env = load(withPaint);
      env.loads.forEach((f) => f());
      if (env.appended.length) bad.push(`로더${tag}가 load 직후 바로 시작합니다 — 숨은 탭에서는 FCP 보다 먼저 받습니다`);
      if (withPaint) {
        // 프레임이 하나만 돌았을 때도 아직이어야 한다
        if (env.frames.length !== 1) bad.push('로더(FCP 기록)가 load 뒤 프레임 신호를 걸지 않습니다');
        else { env.frames.shift()(); if (env.appended.length) bad.push('로더(FCP 기록)가 load 뒤 첫 프레임에 붙였습니다 — 두 번째 프레임이어야 합니다'); }
      }
      drainFrames(env);
      check(env, `${tag}·load 먼저`);
    }
    // ③ 선렌더 «상담 신청» 링크 클릭 계측
    {
      const env = load(true);
      if (env.clicks.length !== 1) bad.push('로더에 선렌더 상담 신청 클릭 기록이 없습니다');
      else {
        const link = (where) => ({ getAttribute: (k) => (k === 'data-prerender-book' ? where : null) });
        const hit = (where, hash) => {
          env.hash = hash || '';
          env.clicks[0]({ target: { closest: (sel) => (where && sel === 'a[data-prerender-book]' ? link(where) : null) } });
        };
        const rec = () => { try { return JSON.parse(env.store.jt_booking_origin_v1); } catch (_e) { return null; } };
        hit(null);
        if (Object.keys(env.store).length || env.events.length) bad.push('로더가 상담 신청 링크가 아닌 클릭도 기록합니다');
        hit('elsewhere');
        if (Object.keys(env.store).length || env.events.length) bad.push('로더가 nav·hero 밖의 표지 값도 기록합니다 — 앱의 위치 폐집합과 어긋납니다');
        // 위치·route 별 기록 — 매번 새 세션으로 본다. route 규칙은 Chrome.jsx jtBookingOrigin.route() 와 같다
        for (const [where, hash, route] of [['nav', '', 'home'], ['hero', '#/', 'home'], ['nav', '#/services/tax-audit', 'services'], ['nav', '#/x@y.z', 'unknown'], ['nav', '#top', 'home']]) {
          env.store = {}; env.events.length = 0;
          hit(where, hash);
          const r = rec();
          if (!r || r.v !== 1 || r.location !== where || r.route !== route || !r.at) bad.push(`선렌더 상담 신청(${where}, 해시 «${hash}») 클릭이 jt_booking_origin_v1 을 앱과 같은 형식(location ${where}·route ${route})으로 남기지 않습니다`);
          if (!env.events.some((a) => a[0] === 'event' && a[1] === 'cta_click' && a[2] && a[2].channel === 'booking' && a[2].location === where)) bad.push(`선렌더 상담 신청(${where}) 클릭이 cta_click 을 보내지 않습니다`);
        }
        env.store = { jt_booking_origin_v1: JSON.stringify({ v: 1, location: 'faq', route: 'home', at: 'x' }) };
        hit('nav', '');
        if ((rec() || {}).location !== 'faq') bad.push('선렌더 상담 신청 클릭이 이미 있는 예약 유래를 덮어씁니다 — 세션 최초 1회 고정이어야 합니다');
      }
    }
    // 로더의 route 폐집합이 앱(Chrome.jsx jtBookingOrigin.ROUTES)과 같은가
    {
      const listOf = (src, re) => { const m = src.match(re); return m ? (m[1].match(/'([^']+)'/g) || []).map((x) => x.slice(1, -1)) : null; };
      const appRoutes = listOf(fs.readFileSync(path.join(__dirname, 'src', 'Chrome.jsx'), 'utf8'), /var ROUTES = \[([^\]]*)\]/);
      const loaderRoutes = listOf(loaderSrc, /var ROUTES = \[([^\]]*)\]/);
      if (!appRoutes || !loaderRoutes || appRoutes.join() !== loaderRoutes.join()) bad.push(`로더의 ROUTES(${loaderRoutes})가 Chrome.jsx jtBookingOrigin 의 ROUTES(${appRoutes})와 다릅니다`);
    }
    // 선렌더 링크가 계측 표지를 달고 있는가 — 헤더(nav)·히어로(hero) 각 하나
    if ((html.match(/<a class="jt-btn jt-btn--primary jt-btn--sm jt-nav__book" href="\/#\/booking" data-prerender-book="nav">/g) || []).length !== 1) bad.push('선렌더 헤더의 상담 신청이 계측 표지(data-prerender-book="nav")를 단 /#/booking 링크가 아닙니다');
    if ((html.match(/<a href="\/#\/booking" class="rn-link" data-prerender-book="hero">/g) || []).length !== 1) bad.push('선렌더 히어로의 상담 신청이 계측 표지(data-prerender-book="hero")를 달고 있지 않습니다');
  }

  /* 4) #root 구조 */
  const a = html.indexOf('<div id="root">'), b = html.indexOf('<script', a);
  const rootBlock = html.slice(a, b);
  const count = (re) => (rootBlock.match(re) || []).length;
  if (count(/<h1[\s>]/g) !== 1) bad.push(`#root 의 h1 이 ${count(/<h1[\s>]/g)}개입니다 (1개여야 함)`);
  if (count(/<main[\s>]/g) !== 1) bad.push(`#root 의 main 이 ${count(/<main[\s>]/g)}개입니다 (1개여야 함)`);
  for (const key of ['header', 'hero']) {
    const [open, close] = mod.MARKS[key];
    if (count(new RegExp(open.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'g')) !== 1) { bad.push(`#root 에 ${key} 선렌더 표지가 하나가 아닙니다`); continue; }
    const seg = rootBlock.slice(rootBlock.indexOf(open) + open.length, rootBlock.indexOf(close));
    if (seg.length < 200) bad.push(`${key} 선렌더가 비어 있습니다`);
    if (/<script|\son[a-z]+=/i.test(seg)) bad.push(`${key} 선렌더에 스크립트나 이벤트 속성이 있습니다`);
  }
  const heroSeg = rootBlock.slice(rootBlock.indexOf(mod.MARKS.hero[0]), rootBlock.indexOf(mod.MARKS.hero[1]));
  if (!/<p class="rn-lead">[^<]{20,}<\/p>/.test(heroSeg)) bad.push('히어로 선렌더에 LCP 문단(p.rn-lead)이 없습니다');
  if (!heroSeg.includes('data-prerender="home"')) bad.push('히어로 선렌더에 data-prerender 표지가 없습니다 (head 안전판 규칙이 걸리지 않음)');
  if (/aria-controls=/.test(rootBlock.slice(rootBlock.indexOf(mod.MARKS.header[0]), rootBlock.indexOf(mod.MARKS.header[1])))) bad.push('헤더 선렌더에 aria-controls 가 남았습니다 (대상 메뉴 판은 넣지 않는다)');

  /* 5) head 안전판 (Codex R1-F1·F2) */
  const head = html.slice(0, html.indexOf('</head>'));
  if (!/:where\(\[data-prerender\] \.rn-hero-people\)\{\s*display:none;\s*\}/.test(head)) bad.push('head — CSS 실패 때 선렌더 사진을 숨기는 :where() 규칙이 없습니다');
  if (!/\.jt-boot-route \[data-prerender\]\{\s*display:none;\s*\}/.test(head)) bad.push('head — 홈이 아닌 경로에서 선렌더 히어로를 숨기는 규칙이 없습니다');
  const appSrc = fs.readFileSync(path.join(__dirname, 'src', 'App.jsx'), 'utf8');
  const appRoutes = (appSrc.match(/const JT_KNOWN_ROUTES = (\[[^\]]*\])/) || [])[1];
  const headRoutes = (head.match(/var known = (\[[^\]]*\])/) || [])[1];
  const norm = (s) => s && JSON.stringify(JSON.parse(s.replace(/'/g, '"')));
  if (!appRoutes || !headRoutes || norm(appRoutes) !== norm(headRoutes)) bad.push('head 의 첫 경로 판정 목록이 App.jsx JT_KNOWN_ROUTES 와 다릅니다');
  if (!/localStorage\.getItem\('jt_route'\)/.test(head) || !/localStorage\.getItem\('jt_route'\)/.test(appSrc)) bad.push('첫 경로 판정의 저장 키(jt_route)가 App.jsx 와 head 에서 어긋났습니다');

  bad.forEach((x) => console.log('FAIL  ' + x));
  console.log(`${bad.length ? '' : 'PASS  '}홈 선렌더 — 실패 ${bad.length}건`);
  process.exit(bad.length ? 1 : 0);
})();

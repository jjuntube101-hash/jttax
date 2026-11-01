/* ══════════════════════════════════════════════════════════════════════════
   홈 첫 화면 선렌더 — 헤더·히어로를 빌드 때 HTML 로 굽는다 (261101 SEO 2-7)

   ▣ 왜 (PageSpeed 모바일 실측, 261101)
     FCP·LCP 6.2초. LCP 요소는 히어로 문단(p.rn-lead)인데, 이 문단은 app.js(전송 613KB)가
     내려받히고 실행된 «뒤»에야 생겼다. 그 전까지 화면에는 부팅 폴백만 있었다.
     → 히어로를 원본 HTML 에 미리 넣으면 CSS 만 받고 바로 그려진다.

   ▣ 어떻게
     방문자가 받는 그 번들(project/dist/app.js)을 Node 의 vm 에서 그대로 실행하고,
     ReactDOM.createRoot().render() 에 넘어오는 첫 화면 요소를 가로채
     react-dom/server 로 HTML 을 만든다. 그 가운데 «건너뛰기 링크 + 헤더»와 «히어로 구역»만
     index.html 의 표지 사이에 넣는다.
     ⛔ JSX 를 따로 손으로 베끼지 않는다 — 문구·구조가 바뀌면 다음 빌드에서 저절로 따라간다.
     ⛔ app.js 는 건드리지 않는다(계산기 출시 기록이 그 해시를 고정한다).

   ▣ 브라우저에서는
     React 가 마운트되면 #root 를 통째로 새로 그린다(hydrate 아님). 같은 마크업이라
     눈에 보이는 변화가 없고, 새 노드라 레이아웃 이동(CLS)으로 잡히지 않는다.

   ▣ 버전 계약: 선렌더에 쓰는 react·react-dom 은 index.html 이 unpkg 에서 받는 판과
     같아야 한다(다르면 마크업이 어긋날 수 있다). 다르면 빌드를 멈춘다.

   실행: node project/scripts/prerender_home.mjs           (index.html 갱신)
         node project/scripts/prerender_home.mjs --check   (갱신이 필요하면 실패)
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const INDEX = path.join(ROOT, 'index.html');
const require = createRequire(import.meta.url);

export const MARKS = {
  header: ['<!-- prerender:home-header -->', '<!-- /prerender:home-header -->'],
  hero: ['<!-- prerender:home-hero -->', '<!-- /prerender:home-hero -->'],
};

function unpkgVersion(html, name) {
  const m = html.match(new RegExp(`https://unpkg\\.com/${name}@([0-9.]+)/umd/`));
  if (!m) throw new Error(`index.html 에서 unpkg ${name} 판을 찾지 못했습니다`);
  return m[1];
}

/* 번들이 최상위에서 만지는 브라우저 객체만 흉내 낸다. 화면은 홈(해시 없음)으로 고정. */
function browserStub(React, ReactDOM) {
  let captured = null;
  const el = () => ({
    style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, appendChild() {}, addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
  });
  const win = {
    location: { hash: '', pathname: '/', search: '', href: 'https://www.jttax.co.kr/', hostname: 'www.jttax.co.kr', origin: 'https://www.jttax.co.kr' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    addEventListener() {}, removeEventListener() {}, scrollTo() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    history: { pushState() {}, replaceState() {} }, navigator: { userAgent: 'prerender' },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    console, fetch: async () => { throw new Error('prerender: fetch 없음'); },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    gtag() {}, dataLayer: [], JT_ENGINE_BASE: 'https://jt-tax-engine.fly.dev',
    React,
    ReactDOM: { ...ReactDOM, createRoot: () => ({ render(x) { captured = x; } }) },
  };
  win.document = {
    getElementById: () => ({}), createElement: el, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, body: el(), documentElement: el(), head: el(), title: '',
  };
  win.window = win; win.self = win; win.globalThis = win;
  return { win, get captured() { return captured; } };
}

function cut(html, open, close, label) {
  const a = html.indexOf(open);
  if (a < 0 || html.indexOf(open, a + 1) >= 0) throw new Error(`선렌더 결과에서 ${label} 시작이 하나가 아닙니다`);
  const b = html.indexOf(close, a);
  if (b < 0) throw new Error(`선렌더 결과에서 ${label} 끝을 찾지 못했습니다`);
  return html.slice(a, b + close.length);
}

export function renderFirstScreen() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const React = require('react');
  const ReactDOM = require('react-dom');
  const Server = require('react-dom/server');
  for (const [name, mod] of [['react', React], ['react-dom', ReactDOM]]) {
    const want = unpkgVersion(html, name);
    if (mod.version !== want) throw new Error(`선렌더용 ${name} ${mod.version} ≠ index.html 의 unpkg ${want} — package.json devDependencies 를 맞추세요`);
  }
  const stub = browserStub(React, ReactDOM);
  const ctx = vm.createContext(stub.win);
  for (const f of ['project/dist/insight-meta.js', 'project/dist/app.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  if (!stub.captured) throw new Error('app.js 가 render() 를 부르지 않았습니다');
  const origError = console.error;
  /* 알려진 경고 두 가지만 삼킨다 — ① fetchPriority 미인식(React 18.3, 속성은 그대로 나가고 HTML 은 대소문자를 가리지 않는다)
     ② 서버의 useLayoutEffect(브라우저에서 React 가 새로 그릴 때 실행되므로 여기서 안 도는 게 맞다). 나머지는 그대로 보인다. */
  console.error = (...args) => {
    const text = args.map(String).join(' ');
    if (text.includes('fetchPriority') || text.includes('useLayoutEffect does nothing on the server')) return;
    origError(...args);
  };
  let full;
  try { full = Server.renderToStaticMarkup(stub.captured); } finally { console.error = origError; }

  const skip = cut(full, '<a class="jt-renewal-skip"', '</a>', '건너뛰기 링크');
  let header = cut(full, '<header class="jt-nav', '</header>', '헤더');
  /* 모바일 메뉴 판은 닫힌 상태(aria-hidden)라 첫 화면에 보이지 않는다 — 넣지 않는다.
     부팅 폴백에는 숨김 속성을 두지 않는다는 규칙(tests_static_shell)과도 맞춘다. */
  const menuAt = header.indexOf('<div class="jt-menu-clip">');
  if (menuAt < 0 || !header.endsWith('</nav></div></header>')) throw new Error('헤더 끝이 «모바일 메뉴 판»이 아닙니다 — 구조가 바뀌었는지 확인하세요');
  header = header.slice(0, menuAt) + '</header>';
  /* 메뉴 판을 뺐으니 그 판을 가리키는 aria-controls 도 뺀다 — 대상 없는 참조가 남지 않게 (Codex R1-F3).
     React 가 마운트되면 판과 함께 다시 붙는다. */
  const ctl = ' aria-controls="jt-mobile-menu"';
  if (header.split(ctl).length !== 2) throw new Error('헤더의 메뉴 버튼 aria-controls 가 하나가 아닙니다');
  header = header.replace(ctl, '');
  /* 앱 스크립트를 FCP 뒤에 받으므로, 그 사이 «상담 신청» 버튼을 눌러도 아무 일이 없다.
     선렌더에서는 같은 모양의 링크로 바꿔 둔다 — 누르면 예약 화면으로 간다 (Codex 2-7b R1-F3). */
  const bookBtn = /<button class="(jt-btn jt-btn--primary jt-btn--sm jt-nav__book)">([\s\S]*?)<\/button>/;
  if ((header.match(new RegExp(bookBtn.source, 'g')) || []).length !== 1) throw new Error('헤더의 상담 신청 버튼(jt-nav__book)이 하나가 아닙니다');
  /* data-prerender-book="<위치>": 앱이 붙기 전에 누르면 index.html 로더가 jtTrackCta('booking', 위치) 와 같은
     예약 유래·CTA 계측을 남기는 표지다. 값은 마운트 뒤 같은 자리의 jtTrackCta 위치와 같아야 한다 (Codex 2-7b R2-F3·R3-F3). */
  header = header.replace(bookBtn, '<a class="$1" href="/#/booking" data-prerender-book="nav">$2</a>');
  let hero = cut(full, '<section class="rn-hero rn-shell">', '</section>', '히어로');
  const heroBook = '<a href="/#/booking" class="rn-link">';
  if (hero.split(heroBook).length !== 2) throw new Error('히어로의 상담 신청 링크(/#/booking)가 하나가 아닙니다');
  if (!full.includes('<div class="rn-page rn-home">' + hero)) throw new Error('히어로가 홈 첫 구역이 아닙니다');
  if (!/<p class="rn-lead">/.test(hero)) throw new Error('히어로에 p.rn-lead 가 없습니다');
  hero = hero.replace(heroBook, '<a href="/#/booking" class="rn-link" data-prerender-book="hero">');
  /* data-prerender: head 의 규칙 두 개가 «선렌더 히어로에만» 걸리게 하는 표지다
     (홈이 아닌 경로로 들어오면 숨김, 외부 CSS 가 없으면 사진 묶음 숨김). React 가 그린 히어로에는 없다. */
  return { header: skip + header, hero: '<div class="rn-page rn-home" data-prerender="home">' + hero + '</div>' };
}

export function applyToIndex(html, parts) {
  let out = html;
  for (const key of ['header', 'hero']) {
    const [open, close] = MARKS[key];
    const a = out.indexOf(open), b = out.indexOf(close);
    if (a < 0 || b < a || out.indexOf(open, a + 1) >= 0) throw new Error(`index.html 의 ${key} 선렌더 표지가 없거나 겹칩니다`);
    out = out.slice(0, a + open.length) + parts[key] + out.slice(b);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const before = fs.readFileSync(INDEX, 'utf8');
  const after = applyToIndex(before, renderFirstScreen());
  if (process.argv.includes('--check')) {
    if (after !== before) { console.error('✗ index.html 의 홈 선렌더가 낡았습니다 — node project/scripts/prerender_home.mjs'); process.exit(1); }
    console.log('✓ 홈 선렌더 최신');
  } else {
    if (after !== before) fs.writeFileSync(INDEX, after);
    console.log(`✓ 홈 선렌더 — ${after === before ? '변화 없음' : 'index.html 갱신'}`);
  }
}

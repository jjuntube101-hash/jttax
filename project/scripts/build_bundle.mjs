/* ══════════════════════════════════════════════════════════════════════════
   JSX 번들 빌드 — 방문자 브라우저에서 «변환»을 걷어낸다 (260810 신설)

   ▣ 왜 만들었나 (실측)
     홈에 들어오면 방문자가 매번 이만큼을 받아서 «브라우저에서» 변환했다.
       @babel/standalone   3.0 MB   ← JSX 를 번역하는 도구 자체
       JSX 27개            1,019 KB  ← 그중 첫 화면에 필요한 건 132 KB 뿐
     빌드 때 한 번 변환해 두면 Babel 자체가 통째로 불필요해지고, 27번 요청이 1번이 되며,
     방문자 기기의 변환 작업이 0 이 된다.

   ▣ 왜 «이어붙이기»인가 — import/export 번들링이 아니다
     이 프로젝트는 모듈 시스템을 쓰지 않는다. 각 파일이 최상위에 컴포넌트를 선언하고
     window 에 내보내며, 서로를 «전역 이름»으로 참조한다. 그래서 esbuild 의 bundle 모드를
     쓰면 스코프가 파일별로 갇혀 그 참조가 전부 깨진다.
     → 각 파일을 «개별 변환»한 뒤 index.html 에 있던 순서 그대로 이어붙인다.
       실행 의미가 종전(각 <script> 가 전역 스코프에서 차례로 실행)과 정확히 같다.

   ▣ 순서가 계약이다
     ORDER 는 index.html 의 <script> 순서에서 왔고, 그 순서에 의미가 있다:
       · Data/lawValues 가 먼저 — 나머지가 window.JT_DATA 를 읽는다
       · HeroCalc 이 Home 보다 먼저 — Home 이 window.JTHeroCalc 를 참조한다
       · App 이 «맨 마지막» — 모든 컴포넌트가 정의된 뒤 ReactDOM 이 render 한다
     ⛔ 순서를 바꾸면 조용히 깨진다. tests_bundle.js 가 이 계약을 검사한다.
   ══════════════════════════════════════════════════════════════════════════ */

import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'project', 'src');
const OUT_DIR = path.join(ROOT, 'project', 'dist');
const OUT_FILE = path.join(OUT_DIR, 'app.js');

/* 종전 index.html 의 <script type="text/babel"> 순서 그대로. App 은 맨 마지막. */
export const ORDER = [
  'Data.jsx',
  'lawValues.jsx',
  'Chrome.jsx',
  'HeroCalc.jsx',
  'Home.jsx',
  'Pages1.jsx',
  'Pages2.jsx',
  'Legal.jsx',
  'Report.jsx',
  'ReportConvert.jsx',
  'ReportAppeal.jsx',
  'ReportCGT.jsx',
  'ReportReform2026.jsx',
  'ReportCrypto2027.jsx',
  'ReportIncome.jsx',
  'ReportGift.jsx',
  'ReportInheritance.jsx',
  'ReportAcquisition.jsx',
  'ReportProperty.jsx',
  'ReportComprehensive.jsx',
  'ReportCorporate.jsx',
  'ReportInsurance.jsx',
  'ReportVat.jsx',
  'ReportCompare.jsx',
  'ReportBurdenedOptimize.jsx',
  'ReportYouthStartup.jsx',
  'App.jsx',
];

/* ⚠️ 260810 Codex R1 P1 로 «정정». 초판 주석은 「종전과 지원 범위가 같다」고 썼는데
   그건 사실이 아니었다. 실측:
     · 종전 @babel/standalone 은 target 지정이 없으면 ES5 까지 낮춘다 → const→var, async→generator
     · esbuild target:'es2017' 은 const 1,526건·async 48건을 «그대로 남긴다»
   즉 지원 범위는 «좁아졌다». 그런데도 es2017 을 택한 것은 «제품 정책»이다 —
   이 사이트는 최신 상용 브라우저(대략 Chrome/Edge/Firefox 최근 버전, Safari 12+)만
   지원 대상으로 삼는다. React 18 이 IE 지원을 끊고 현대 브라우저 기능을 요구하는 것도
   같은 방향이다.
   ⛔ 260810 Codex R2 P2 정정: 초판 주석은 「React 18 UMD 가 Chrome60+/Safari12+ 를
      «강제»한다」고 썼는데, React 공식 문서는 그런 하한을 명시하지 않는다. 근거를
      React 에 떠넘기지 않고 우리 정책으로 적는다.
   ⛔ 더 낮은 브라우저를 지원해야 하면 TARGET 을 내려라(es2015 면 async 까지 변환된다).
      번들이 커지는 대신 범위가 넓어진다.

   ▣ 이 차이가 낳은 실제 사고: 종전엔 Babel 이 const 를 var 로 낮춰 «중복 선언이 허용»됐다.
     esbuild 는 const 를 남기므로 같은 이름을 두 파일이 최상위에 선언하면 SyntaxError 로
     앱 전체가 죽는다. 첫 빌드가 실제로 이걸로 터졌고, tests_bundle.js ③ 이 그걸 막는다.
     (「별도 <script> 라 격리됐던 것」이 아니다 — classic script 는 전역 환경을 공유한다.
      Codex R1 이 이 오해를 정정했다.) */
const TARGET = 'es2017';

export function buildBundle({ write = true } = {}) {
  const parts = [];
  const missing = [];

  for (const name of ORDER) {
    const p = path.join(SRC, name);
    if (!fs.existsSync(p)) { missing.push(name); continue; }
    const code = fs.readFileSync(p, 'utf8');
    const out = esbuild.transformSync(code, {
      loader: 'jsx',
      target: TARGET,
      // 파일마다 "use strict" 가 있어도 이어붙이면 첫 줄이 아니라 무효가 된다.
      // 최상위 스코프 의미를 종전(<script> 별 실행)과 같게 두려면 strict 를 «걸지 않는» 것이
      // 맞다 — 종전에도 각 스크립트의 "use strict" 는 그 스크립트에만 걸렸고,
      // 전역 선언이 공유되는 구조 자체는 동일하다.
      format: undefined,
    });
    /* ⚠️ "use strict" 를 «떼어낸다». 이어붙이면 첫 줄이 아니라서 지시문으로 인식되지도
       않고(무효), 남겨 두면 그 자리에 문자열 리터럴만 덩그러니 남는다.
       ⛔ 그래서 이 번들은 «비엄격» 모드로 돈다 — 종전 인라인 App 도 비엄격이었으므로
          동작 차이는 없지만, 소스에 "use strict" 를 넣어도 배포본에서는 «조용히 무효»다
          (260810 Codex R1 P2). strict 의미가 꼭 필요한 코드는 그 함수 안에 지시문을 두어라. */
    parts.push(
      '\n/* ────────── ' + name + ' ────────── */\n' +
      out.code.replace(/^\s*["']use strict["'];\s*\n/, '')
    );
  }

  if (missing.length) {
    throw new Error('번들 소스 누락: ' + missing.join(', ') +
      ' — ORDER 와 project/src 가 어긋났습니다');
  }

  const header = [
    '/* 자동 생성 파일 — 직접 수정하지 마세요.',
    '   생성: node project/scripts/build_bundle.mjs',
    '   소스: project/src/*.jsx (' + ORDER.length + '개, ORDER 순서)',
    '   ⛔ 이 파일을 손으로 고치면 다음 빌드에 덮어써집니다. 소스를 고치고 다시 빌드하세요.',
    '   ⛔ 커밋에서 빠뜨리면 라이브가 «옛 코드»로 돕니다 — tests_build_fresh.js 가 막습니다. */',
    '',
  ].join('\n');

  const bundle = header + parts.join('\n');

  if (write) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, bundle);
  }
  return bundle;
}

/* 직접 실행 시에만 파일을 쓴다 (테스트는 import 해서 write:false 로 쓴다) */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const bundle = buildBundle();
  const srcKB = ORDER.reduce((s, n) => s + fs.statSync(path.join(SRC, n)).size, 0) / 1024;
  console.log('✓ 번들 생성 — project/dist/app.js');
  console.log('  소스 ' + ORDER.length + '개 ' + srcKB.toFixed(0) + ' KB → 번들 ' + (bundle.length / 1024).toFixed(0) + ' KB');
  console.log('  ⓘ 방문자는 이제 @babel/standalone(3.0MB)을 받지 않습니다');
}

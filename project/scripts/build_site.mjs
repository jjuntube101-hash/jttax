/* ══════════════════════════════════════════════════════════════════════════
   배포본 만들기 — 사이트가 실제로 쓰는 파일만 _site/ 로 복사한다 (261121 신설)

   ▣ 왜 만들었나
     GitHub Pages 를 «main 브랜치 그대로» 서빙하면 저장소의 모든 파일이 URL 로 열린다.
     실제로 www.jttax.co.kr/project/src/*.jsx(계산기 화면 원본), /project/dev/(계산 계약·
     출시 점검 자료), /project/tests_*.js, 빌드 스크립트가 전부 HTTP 200 이었다(261121 실측).
     → Pages 를 «Actions 배포»로 바꾸고, 이 스크립트가 만든 _site/ 만 올린다.

   ▣ 무엇이 나가나: «진입점에서 참조를 따라 닿는 파일»만 (도달 집합)
     진입점 = sitemap.xml 의 모든 주소 + 고정 루트 파일(CNAME·robots·favicon·manifest·sitemap)
              + 검색엔진 소유 확인 파일(google<hex>.html · naver<hex>.html · <32hex>.txt).
     HTML·CSS·JS·JSON·XML 안의 경로 참조를 따라가며 모은다. 위치·확장자만 맞는다고 나가지 않는다
     — 아무도 링크하지 않은 내부 HTML·JS·이미지를 새로 넣어도 공개되지 않는다(Codex R1-F1).
     참조 해석 기준: HTML = 그 문서 위치 / CSS = 그 CSS 파일 위치 / JS = 그 JS 를 불러온 문서 위치
     (브라우저가 JS 안의 상대 경로를 문서 기준으로 읽기 때문 — R1-F3).
     동적 조합 경로(예: '/project/assets/people/renewal/' + 이름 + '-studio.jpg')는 폴더를 통째로
     열지 않는다. 그 폴더 바로 아래 파일 중 이름(또는 앞부분·뒷부분)이 같은 파일 안에 문자열로
     적힌 것만 넣는다(project/assets/ 안에서만).

   ▣ 그래도 막는 것 (빌드 실패)
     ① 형식: 도달했더라도 공개 형식(HTML·JS·CSS·이미지·폰트·xml·txt·manifest)이 아니면 실패
     ② 금지: 원본·스크립트·문서 확장자, 시험 파일, 개발·빌드 폴더, 숨김 파일, 내부 기록
        (대소문자 무시). 사이트가 이런 파일을 참조하면 «참조 쪽»을 고쳐야 한다.
     ③ 누락: 참조하는 로컬 파일이 저장소에 있는데 위 규칙 때문에 _site 에 못 들어가면 실패,
        project/ 안을 가리키는데 저장소에 없는 참조도 실패(배포 뒤 404)
     ④ 필수 파일(index.html·CNAME·robots.txt·sitemap.xml·번들 2개)이 없으면 실패
     저장소에도 없는 참조(외부 경로·원래부터 깨진 링크)는 이 스크립트가 아니라 html-scan 이 본다.

   ▣ 실행: npm run site  (npm run build 뒤에. 배포 워크플로는 gate → site 순서)
   ▣ 시험: project/tests_build_site.js (가짜 저장소로 포함·제외·실패를 확인)
   ══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const toPosix = (p) => p.split(path.sep).join('/');
const SITE_HOST = /^https?:\/\/(www\.)?jttax\.co\.kr(?=\/|$)/i;

/* ── 공개 형식 ───────────────────────────────────────────────────────────── */
const PUBLIC_TYPE = /\.(html|js|css|png|jpe?g|webp|svg|gif|ico|avif|woff2?|xml|txt)$/i;
const IMAGE_FONT = /\.(png|jpe?g|webp|svg|gif|ico|avif|woff2?)$/i;
const ROOT_FIXED = ['CNAME', 'favicon.ico', 'manifest.json', 'robots.txt', 'sitemap.xml'];
const VERIFY_FILE = /^(google[0-9a-f]{8,}\.html|naver[0-9a-f]{16,}\.html|[0-9a-f]{32}\.txt)$/i;
const PUBLIC_EXACT = new Set(ROOT_FIXED);

/* ── 금지 규칙 (대소문자 무시) ───────────────────────────────────────────── */
const DENY = [
  [/\.(jsx|mjs|cjs|ts|tsx|py|md|map|ya?ml|lock|sh|ps1|bat|cmd|bak|orig|swp|log|env|pem|key)$/i, '원본·스크립트·문서 확장자'],
  [/(^|\/)tests?_[^/]*$/i, '시험 파일'],
  [/(^|\/)(fixtures|dev|node_modules|_shared|scripts|commercial|data|src\/__)\//i, '개발·빌드 폴더'],
  [/^project\/(insights|calculators)\//i, '인사이트·계산기 생성 파이프라인'],
  [/^project\/[^/]+$/i, 'project/ 루트 파일(시험·설정)'],
  [/(^|\/)package(-lock)?\.json$/i, 'npm 설정'],
  [/(^|\/)\.[^/]+/, '숨김 파일·폴더'],
  [/(^|\/)(HANDOFF_|codex-|AGENTS|CLAUDE|PROGRESS)/i, '내부 작업 기록'],
  [/\.json$/i, 'JSON(manifest.json 외)'],
];

export function denyReason(rel) {
  if (PUBLIC_EXACT.has(rel)) return null;
  for (const [re, why] of DENY) if (re.test(rel)) return why;
  if (!PUBLIC_TYPE.test(rel)) return '공개 형식 아님';
  return null;
}

/* ── 참조 추출 ───────────────────────────────────────────────────────────── */
const REF = new RegExp(
  [
    String.raw`(?:[\w-]*src|href|content|poster|srcset|action)\s*=\s*["']([^"']+)["']`,
    String.raw`url\(\s*["']?([^"')]+)["']?\s*\)`,
    String.raw`["'\x60]((?:\.{1,2}\/)*\/?project\/[^"'\x60\s?#]*)`,
    // 위 규칙에 안 걸리는 상대 경로 문자열('img/a.png' 등) — 저장소에 있는 파일일 때만 효과가 있다
    String.raw`["'\x60]((?:\.{1,2}\/|\/)?[\w.-]+(?:\/[\w.-]+)*\.(?:png|jpe?g|webp|svg|gif|ico|avif|woff2?|css|js|html))(?=["'\x60?#])`,
    String.raw`["'\x60](\/(?:insights|calculators|services|experts|desk|about|acquisition-tax|property-values)\/[^"'\x60\s?#]*)`,
    String.raw`["'\x60](https?:\/\/(?:www\.)?jttax\.co\.kr\/[^"'\x60\s?#]*)`,
    String.raw`<loc>\s*([^<\s]+)\s*<\/loc>`,
  ].join('|'),
  'gi',
);
const TEXT_TYPE = /\.(html|css|js|json|webmanifest|xml)$/i;
const LITERAL = /["'`]([\w.-]{1,80})["'`]/g;

/** ref 를 baseDir(posix, 저장소 상대) 기준 저장소 상대 경로로. 외부·특수 주소는 null. */
function resolveRef(baseDir, ref) {
  ref = ref.trim().split(/\s+/)[0];
  if (SITE_HOST.test(ref)) ref = ref.replace(SITE_HOST, '') || '/';
  else if (!ref || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) return null;
  let p;
  try { p = decodeURIComponent(ref.split(/[?#]/)[0]); } catch { return null; }
  if (!p || p.startsWith('#')) return null; // url(%23n) 같은 data URI 안 SVG 조각 참조
  const cand = p.startsWith('/') ? path.posix.normalize(p).slice(1) : path.posix.normalize(path.posix.join(baseDir, p));
  if (cand.startsWith('..')) return null;
  return cand === '.' ? '' : cand;
}

/* ── 본체 ────────────────────────────────────────────────────────────────── */
const SKIP_DIRS = new Set(['.git', 'node_modules', '_site']);

// 동적 조합 경로로만 불리는 파일의 «명시 목록» (R3-F1). 폴더별 파일 이름 정규식.
// 문자열 대조는 후보를 «찾기»만 하고, 넣을지는 이 목록이 정한다. 목록에 없는 후보가 보이면 빌드 실패 —
// 새 대표 사진을 넣었으면 여기에 이름을 추가한다(조용히 404 가 나거나 내부 이미지가 섞이지 않게).
const DYNAMIC_FILES = {
  // Pages1.jsx(전문가 소개): '/project/assets/people/renewal/' + JT_RENEWAL_PEOPLE[이름] + '-studio.jpg' / '-work.jpg'
  'project/assets/people/renewal': /^(kim-gahwan|kim-minseok|lee-hyunjun)-(studio|work)\.jpg$/,
};

// 이 스크립트 도입(261121) 전부터 라이브에서도 404 인 참조 — 파일이 저장소에 커밋된 적이 없다.
// 배포를 막지 않고 경고만 낸다. 파일을 넣거나 참조를 지우면 이 목록에서도 뺀다.
const KNOWN_MISSING = new Set([
  'project/assets/people/team-editorial-260919.png',
  'project/assets/people/team-discussion-260919.png',
]);

export function buildSite({ root, out = path.join(root, '_site'), write = true } = {}) {
  const files = new Set();
  const dirs = new Set(['']);
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      const rel = toPosix(path.relative(root, abs));
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        dirs.add(rel);
        walk(abs);
      } else if (ent.isFile()) {
        files.add(rel); // 심볼릭 링크는 isFile()=false 라 따라가지 않는다
      }
    }
  })(root);

  const lookup = (c) => [c, c.replace(/\/$/, '') + (c ? '/' : '') + 'index.html', c + '.html'].find((v) => files.has(v));

  const errors = [];
  const unresolved = new Map(); // project/ 안인데 저장소에 없는 참조 → 처음 참조한 파일
  const reached = new Map(); // rel → 처음 참조한 파일
  const queue = [];
  const seenPair = new Set();
  const enqueue = (rel, baseDir, from) => {
    if (!reached.has(rel)) reached.set(rel, from);
    const key = rel + '\0' + baseDir;
    if (seenPair.has(key)) return;
    seenPair.add(key);
    queue.push([rel, baseDir]);
  };

  // 진입점
  for (const f of ROOT_FIXED) if (files.has(f)) enqueue(f, '', '(진입점)');
  for (const f of files) if (!f.includes('/') && VERIFY_FILE.test(f)) enqueue(f, '', '(소유 확인)');

  while (queue.length) {
    const [rel, baseDir] = queue.shift();
    if (!TEXT_TYPE.test(rel)) continue;
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    const isJs = /\.js$/i.test(rel);
    const ownDir = path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel);
    // JS 안 상대 경로는 «불러온 문서» 기준, 그 밖은 자기 위치 기준
    const base = isJs ? baseDir : ownDir;
    let literals = null; // 동적 접두어를 만났을 때만 계산
    for (const m of text.matchAll(REF)) {
      for (const raw of m.slice(1)) {
        if (!raw) continue;
        for (const part of raw.split(',')) {
          const c = resolveRef(base, part);
          if (c === null) continue;
          const hit = lookup(c);
          if (hit) {
            const childBase = /\.js$/i.test(hit) ? (isJs ? baseDir : ownDir) : '';
            enqueue(hit, childBase, rel);
          } else if (dirs.has(c.replace(/\/$/, '')) && c.startsWith('project/')) {
            // 동적 조합 접두어('…/people/renewal/' + 이름 + '-studio.jpg'): 폴더를 통째로 열지 않는다.
            // 그 폴더 바로 아래 이미지·폰트 중, 파일 이름 전체가 — 또는 «앞부분»과 «뒷부분»이 각각 —
            // 같은 파일 안에 문자열로 적혀 있는 것만 넣는다(R2-F1). 그 밖은 아무도 부를 수 없는 파일이다.
            const d = c.replace(/\/$/, '');
            if (!d.startsWith('project/assets/')) {
              errors.push(`project/assets 밖 폴더를 동적으로 참조: ${d}/ ← ${rel} (허용하지 않는다 — 파일 경로를 직접 적어야 한다)`);
              continue;
            }
            const allow = DYNAMIC_FILES[d];
            if (!allow) {
              errors.push(`동적 접두어 ${d}/ ← ${rel} 가 DYNAMIC_FILES 에 없음 (공개할 파일 이름을 명시 목록에 적어야 한다)`);
              continue;
            }
            literals ??= new Set([...text.matchAll(LITERAL)].map((x) => x[1]));
            let n = 0;
            for (const f of files) {
              if (path.posix.dirname(f) !== d) continue;
              const name = path.posix.basename(f);
              if (allow.test(name)) { enqueue(f, '', rel + ' (동적 ' + d + '/)'); n++; continue; }
              // 후보 탐지: 이름 전체 또는 앞·뒷부분이 이 파일의 문자열로 적혀 있으면 «불릴 수 있는» 파일이다
              let named = literals.has(name);
              for (let k = 1; !named && k < name.length; k++) named = literals.has(name.slice(0, k)) && literals.has(name.slice(k));
              if (named) errors.push(`동적 경로로 불릴 수 있는데 명시 목록에 없음: ${f} ← ${rel} (공개할 파일이면 DYNAMIC_FILES 에 추가, 아니면 폴더에서 뺀다)`);
            }
            if (!n) errors.push(`동적 접두어 ${d}/ 에 명시 목록과 맞는 파일이 없음 ← ${rel}`);
          } else if (c.startsWith('project/') && !/[\$\{}*]/.test(c)) {
            // project/ 안을 가리키는데 저장소에 없는 참조 — 배포 뒤 404 가 된다(R2-F2: 조용히 넘기지 않는다)
            unresolved.set(c, rel);
          }
        }
      }
    }
  }

  const warnings = [];
  for (const [c, from] of unresolved) {
    if (KNOWN_MISSING.has(c)) warnings.push(`기존 결함(라이브도 404): ${c} ← ${from}`);
    else errors.push(`참조한 파일이 저장소에 없음: ${c} ← ${from} (배포 뒤 404)`);
  }
  const picked = [...reached.keys()].filter((r) => !denyReason(r)).sort();
  for (const [r, from] of reached) {
    const why = denyReason(r);
    if (why) errors.push(`사이트가 참조하지만 공개할 수 없는 파일: ${r} ← ${from} (${why} — 참조 쪽을 고쳐야 한다)`);
  }
  // sitemap 의 모든 주소가 실제 페이지로 이어지는가 (R3-F2)
  if (files.has('sitemap.xml')) {
    for (const m of fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
      const c = resolveRef('', m[1]);
      if (c === null) errors.push(`sitemap 주소가 이 사이트가 아님: ${m[1]}`);
      else if (!lookup(c)) errors.push(`sitemap 주소에 해당하는 페이지 없음: ${m[1]}`);
    }
  }
  for (const must of ['index.html', 'CNAME', 'robots.txt', 'sitemap.xml', 'project/dist/app.js', 'project/dist/report-entry.js']) {
    if (!picked.includes(must)) errors.push(`필수 파일 없음: ${must}`);
  }

  if (write && !errors.length) {
    fs.rmSync(out, { recursive: true, force: true });
    for (const r of picked) {
      const dst = path.join(out, r);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(root, r), dst);
    }
    // 사후 검사: 실제로 쓰인 _site 를 다시 훑어 금지 규칙 적용(복사 단계의 실수 대비)
    (function walkOut(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, ent.name);
        if (ent.isDirectory()) walkOut(abs);
        else {
          const r = toPosix(path.relative(out, abs));
          const why = denyReason(r);
          if (why) errors.push(`_site 에 금지 파일: ${r} (${why})`);
        }
      }
    })(out);
  }

  const bytes = picked.reduce((s, r) => s + fs.statSync(path.join(root, r)).size, 0);
  return { picked, errors, warnings, bytes, total: files.size };
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { picked, errors, warnings, bytes, total } = buildSite({ root });
  for (const w of warnings) console.warn('⚠ ' + w);
  if (errors.length) {
    console.error(`✗ 배포본 검사 실패 ${errors.length}건 (_site 를 만들지 않았거나 금지 파일이 섞였다)`);
    for (const e of errors.slice(0, 50)) console.error('  - ' + e);
    if (errors.length > 50) console.error(`  … 외 ${errors.length - 50}건`);
    process.exit(1);
  }
  console.log(`✓ 배포본 _site/ — ${picked.length}개 파일, ${(bytes / 1024 / 1024).toFixed(1)} MB (저장소 ${total}개 중 ${total - picked.length}개 제외)`);
}

/* ══════════════════════════════════════════════════════════════════════════
   배포본 만들기 — 사이트에 나갈 파일만 _site/ 로 복사한다 (261121 신설)

   ▣ 왜 만들었나
     GitHub Pages 를 «main 브랜치 그대로» 서빙하면 저장소의 모든 파일이 URL 로 열린다.
     실제로 www.jttax.co.kr/project/src/*.jsx(계산기 화면 원본), /project/dev/(계산 계약·
     출시 점검 자료), /project/tests_*.js, 빌드 스크립트가 전부 HTTP 200 이었다(261121 실측).
     → Pages 를 «Actions 배포»로 바꾸고, 이 스크립트가 만든 _site/ 만 올린다.

   ▣ 원칙: 기본은 제외, 규칙에 맞는 것만 포함 (허용 목록)
     새 파일을 추가했는데 사이트에서 안 보이면 → 아래 ALLOW 규칙에 추가한다.
     «일단 다 넣고 빼기»로 바꾸지 말 것. 새 내부 자료가 조용히 공개되는 길이 다시 열린다.

   ▣ 실패 조건 (빌드를 멈춘다)
     ① DENY: _site/ 안에 원본·개발·시험·빌드 파일이 하나라도 있으면
     ② 누락: _site/ 의 HTML·CSS·JS 가 참조하는 로컬 파일이 저장소에는 있는데 _site/ 에 없으면
        (= 허용 목록이 사이트가 쓰는 파일을 빠뜨렸다)
     ③ 필수 파일(index.html·CNAME·robots.txt·sitemap.xml·번들) 이 없으면

   ▣ 실행: npm run site  (npm run build 뒤에. 배포 워크플로는 gate → site 순서)
   ══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, '_site');

const toPosix = (p) => p.split(path.sep).join('/');

/* ── 허용 규칙 ───────────────────────────────────────────────────────────── */
const IMAGE_FONT = /\.(png|jpe?g|webp|svg|gif|ico|avif|woff2?)$/i;

// project/ 밖 — 공개 페이지가 사는 폴더
const PAGE_DIRS = new Set([
  'about', 'acquisition-tax', 'calculators', 'desk', 'experts',
  'insights', 'property-values', 'services',
]);
// 루트 파일 — 정확한 이름 또는 패턴
const ROOT_FILES = new Set(['CNAME', 'favicon.ico', 'manifest.json', 'robots.txt', 'sitemap.xml']);
const ROOT_PATTERN = /^[^/]+\.(html|txt)$/; // 페이지·검색엔진 소유 확인 파일(google*.html·naver*.html·*.txt)

// project/ 안 — 사이트가 실제로 읽는 것만
const PROJECT_RULES = [
  /^project\/dist\/[^/]+\.js$/,                       // 번들(app.js·report-*.js·insight-meta.js)
  /^project\/src\/[^/]+\.css$/,                       // 스타일
  /^project\/src\/(renewal-static|guide-search)\.js$/, // 정적 페이지 런타임 스크립트 2개
  /^project\/assets\/vendor\/[^/]+\.min\.js$/,        // 공개 라이브러리 사본
];

function allowed(rel) {
  if (!rel.includes('/')) return ROOT_FILES.has(rel) || ROOT_PATTERN.test(rel);
  const top = rel.split('/')[0];
  if (PAGE_DIRS.has(top)) return /\.(html|js)$/.test(rel);
  if (top !== 'project') return false;
  if (rel.startsWith('project/assets/')) {
    // 자산은 확장자 규칙으로 포함한다: 번들이 '/project/assets/people/renewal/' + 이름 처럼
    // 경로를 런타임에 조합하므로 파일 하나하나를 추적해서는 빠뜨린다.
    return IMAGE_FONT.test(rel) || PROJECT_RULES.some((r) => r.test(rel));
  }
  return PROJECT_RULES.some((r) => r.test(rel));
}

/* ── 금지 규칙 (허용 규칙이 잘못 넓어져도 여기서 막는다) ─────────────────── */
const DENY = [
  [/\.(jsx|mjs|cjs|ts|tsx|py|md|map|ya?ml|lock|sh|ps1|bak)$/i, '원본·스크립트·문서 확장자'],
  [/(^|\/)tests?_[^/]*$/i, '시험 파일'],
  [/(^|\/)(fixtures|dev|node_modules|_shared|scripts|commercial|data)\//, '개발·빌드 폴더'],
  [/^project\/(insights|calculators)\//, '인사이트·계산기 생성 파이프라인'],
  [/^project\/[^/]+$/, 'project/ 루트 파일(시험·설정)'],
  [/(^|\/)package(-lock)?\.json$/, 'npm 설정'],
  [/(^|\/)\.[^/]+/, '숨김 파일·폴더'],
  [/(^|\/)(HANDOFF_|codex-)/i, '내부 작업 기록'],
  [/\.json$/i, 'JSON(manifest.json 외)'],
];
const DENY_EXCEPT = new Set(['manifest.json']);

function denyReason(rel) {
  if (DENY_EXCEPT.has(rel)) return null;
  for (const [re, why] of DENY) if (re.test(rel)) return why;
  return null;
}

/* ── 저장소 훑기 ─────────────────────────────────────────────────────────── */
const SKIP_DIRS = new Set(['.git', 'node_modules', '_site', '.github', '.selftest-backup']);
function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walk(path.join(dir, ent.name), acc);
    } else if (ent.isFile()) {
      acc.push(toPosix(path.relative(ROOT, path.join(dir, ent.name))));
    }
  }
  return acc;
}

const all = walk(ROOT).sort();
const picked = all.filter(allowed);
const errors = [];

for (const rel of picked) {
  const why = denyReason(rel);
  if (why) errors.push(`금지 파일이 허용 규칙에 걸림: ${rel} (${why})`);
}

/* ── 복사 ────────────────────────────────────────────────────────────────── */
fs.rmSync(OUT, { recursive: true, force: true });
for (const rel of picked) {
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(ROOT, rel), dst);
}

/* ── 사후 검사 ① _site 전체를 다시 훑어 금지 규칙 적용 ──────────────────── */
const shipped = new Set();
(function walkOut(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkOut(p);
    else shipped.add(toPosix(path.relative(OUT, p)));
  }
})(OUT);
for (const rel of shipped) {
  const why = denyReason(rel);
  if (why) errors.push(`_site 에 금지 파일: ${rel} (${why})`);
}

/* ── 사후 검사 ② 참조 누락 ───────────────────────────────────────────────── */
const inRepo = new Set(all);
const REF = new RegExp(
  [
    String.raw`(?:[\w-]*src|href|content|poster|srcset)\s*=\s*["']([^"']+)["']`,
    String.raw`url\(\s*["']?([^"')]+)["']?\s*\)`,
    String.raw`["'\x60](\/?project\/[^"'\x60\s?#]+)`,
    String.raw`["'\x60](\/(?:insights|calculators|services|experts|desk|about|acquisition-tax|property-values)\/[^"'\x60\s?#]+)`,
  ].join('|'),
  'g',
);
function resolveRef(base, ref) {
  ref = ref.trim().split(/\s+/)[0];
  if (/^https?:\/\/(www\.)?jttax\.co\.kr\//i.test(ref)) ref = '/' + ref.split('/').slice(3).join('/');
  else if (!ref || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) return null;
  let p;
  try { p = decodeURIComponent(ref.split(/[?#]/)[0]); } catch { return null; }
  if (!p) return null;
  const cand = p.startsWith('/') ? p.slice(1) : toPosix(path.posix.normalize(path.posix.join(path.posix.dirname(base), p)));
  if (cand.startsWith('..')) return null;
  return cand;
}
const missing = new Map();
for (const rel of shipped) {
  if (!/\.(html|css|js|json|webmanifest|xml)$/.test(rel)) continue;
  const text = fs.readFileSync(path.join(OUT, rel), 'utf8');
  for (const m of text.matchAll(REF)) {
    for (const raw of m.slice(1)) {
      if (!raw) continue;
      for (const part of raw.split(',')) {
        const c = resolveRef(rel, part);
        if (!c) continue;
        const variants = [c, c.replace(/\/$/, '') + '/index.html', c + '.html'];
        if (variants.some((v) => shipped.has(v))) continue;
        const repoHit = variants.find((v) => inRepo.has(v));
        if (repoHit) {
          if (!missing.has(repoHit)) missing.set(repoHit, rel);
        }
        // 저장소에도 없는 참조(외부 경로·원래부터 깨진 링크)는 이 검사의 대상이 아니다 — html-scan 이 본다.
      }
    }
  }
}
for (const [target, from] of missing) {
  const why = denyReason(target);
  errors.push(`사이트가 참조하는데 _site 에 없음: ${target} ← ${from}${why ? ` (금지 규칙: ${why} — 참조 쪽을 고쳐야 한다)` : ''}`);
}

/* ── 사후 검사 ③ 필수 파일 ───────────────────────────────────────────────── */
for (const must of ['index.html', 'CNAME', 'robots.txt', 'sitemap.xml', 'project/dist/app.js', 'project/dist/report-entry.js']) {
  if (!shipped.has(must)) errors.push(`필수 파일 없음: ${must}`);
}

/* ── 보고 ────────────────────────────────────────────────────────────────── */
const bytes = [...shipped].reduce((s, r) => s + fs.statSync(path.join(OUT, r)).size, 0);
const excludedProject = all.filter((r) => r.startsWith('project/') && !picked.includes(r)).length;
if (errors.length) {
  console.error(`✗ 배포본 검사 실패 ${errors.length}건`);
  for (const e of errors.slice(0, 50)) console.error('  - ' + e);
  if (errors.length > 50) console.error(`  … 외 ${errors.length - 50}건`);
  process.exit(1);
}
console.log(`✓ 배포본 _site/ — ${shipped.size}개 파일, ${(bytes / 1024 / 1024).toFixed(1)} MB (project/ 안 ${excludedProject}개 제외)`);

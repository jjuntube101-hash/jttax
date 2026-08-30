/* 커밋된 «빌드 산출물»이 현재 소스로부터 재생성한 것과 같은지 확인한다.

   왜 필요한가 (260808 Codex sol 지적 P0):
     `npm run gate` 는 build 를 «다시 돌린 뒤» test 를 한다. 그래서 로컬에서는 항상 최신
     산출물을 검사하게 되고 녹색이 나온다. 그런데 **커밋에는 옛 HTML 이 들어 있을 수 있다** —
     원고(.md)만 고치고 빌드를 잊은 채 커밋하면 그렇게 된다.
     GitHub Pages 는 «커밋된 파일»을 그대로 서빙하므로, 게이트가 녹색인데 라이브는 낡은
     상태가 된다. 게이트가 못 보는 종류의 사고다.

   무엇을 하나:
     build 를 돌린 «뒤» 워킹트리에 diff 가 있으면 = 커밋된 산출물이 소스와 어긋난 것이다.

   ⚠️ 로컬 개발 중에는 원고를 고치고 아직 커밋 전인 상태가 정상이므로 **경고만** 한다.
      CI(환경변수 CI) 에서는 «커밋된 상태를 checkout 해서» 도는 것이므로 diff = 결함 → 실패.
      이 구분이 없으면 개발 중 내내 빨간불이라 게이트를 끄게 된다.

   전제: sitemap 의 lastmod 가 «빌드한 날»이 아니어야 한다. 아니면 매일 거짓 실패한다.
        (260808 에 build-sitemap.mjs 를 실제 발행일 기반으로 고쳤다) */
const { execSync } = require('child_process');

const isCI = !!(process.env.CI && process.env.CI !== 'false');
/* 빌드가 만들어 내는 산출물만 본다 — 소스(.jsx/.md) 수정은 여기 관심사가 아니다.
   ⚠️ 260810 번들 도입: project/dist/app.js 가 «방문자가 실제로 받는 코드»다.
      이걸 빠뜨리면 소스를 고치고 번들을 안 만들거나 커밋에서 누락해도 게이트가 녹색이고,
      라이브는 옛 코드로 돈다(Codex R1 P0). */
/* ⚠️ 루트 단일 페이지(consult·creators)를 늘릴 때는 이 목록과 함께
   build-sitemap.mjs(rootSingles)·tests_static_shell.js(commercialRootSingles)도 같이 늘린다 —
   세 곳 중 하나만 빠져도 그 페이지는 해당 게이트에서 조용히 제외된다 (코덱스 021-R1-F1). */
const TARGETS = ['insights', 'calculators', 'services', 'experts', 'about', 'consult.html', 'creators.html', 'sitemap.xml', 'project/src/Data.jsx', 'project/dist'];  // 260830 상업 랜딩 추가 (코덱스 017-R2-F1) + creators (021-R1-F1)

function sh(cmd) {
  return execSync(cmd, { cwd: require('path').join(__dirname, '..'), encoding: 'utf8' });
}

console.log('════ 빌드 산출물 신선도 (커밋 == 소스로 재생성한 결과) ════\n');

let dirty = [];
try {
  /* ⚠️ core.autocrlf=true 환경에서는 줄끝만 다른 것도 diff 로 잡힌다 —
     내용은 같은데 실패하면 게이트 신뢰가 깨진다 (260808 실사고). CR 무시로 비교한다. */
  /* ⚠️ HEAD 와 비교한다. 그냥 `git diff` 는 «워킹트리 ↔ index» 라서, 산출물을 다시 만들고
     git add 만 해 둔 상태(= 아직 커밋 안 함)를 「일치」로 본다. 이 게이트가 지키려는 것은
     «커밋된 것이 소스와 같은가»이므로 index 가 아니라 HEAD 가 기준이다
     (260810 Codex R2 P2). */
  const out = sh(`git diff HEAD --name-only --ignore-cr-at-eol -- ${TARGETS.join(' ')}`);
  dirty = out.split('\n').map(s => s.trim()).filter(Boolean);
  /* ⚠️ git diff 는 «추적되지 않는» 파일을 못 본다 — 산출물이 처음 생긴 경우
     (예: dist/app.js 를 만들었는데 git add 를 안 함) 이 검사가 조용히 통과한다.
     그러면 Pages 는 그 파일이 «없는» 상태를 서빙한다 (260810 Codex R1 P0). */
  const untracked = sh(`git ls-files --others --exclude-standard -- ${TARGETS.join(' ')}`)
    .split('\n').map((s) => s.trim()).filter(Boolean);
  for (const f of untracked) if (!dirty.includes(f)) dirty.push(f + ' (추적되지 않음 — git add 필요)');
} catch (e) {
  /* ⚠️ CI 에서는 «검사하지 못함»을 통과로 만들면 안 된다 (260808 Codex P2a P1).
     git 이 없거나 실패하는 CI 는 그 자체가 설정 오류이고, 그 상태로 녹색이 나오면
     이 게이트는 있으나 마나다 — 「비었으니 통과」가 게이트의 최악의 실패다. */
  const msg = (e.message || '').split('\n')[0].slice(0, 80);
  if (isCI) {
    console.log(`FAIL  CI 인데 git 을 실행할 수 없어 검사하지 못했습니다 (${msg})`);
    console.log('      「검사 안 함」은 통과가 아닙니다 — CI 환경에 git 이 있는지 확인하세요.');
    console.log('\n════════════════════\n실패 1건');
    process.exit(1);
  }
  console.log(`SKIP  git 을 실행할 수 없어 검사하지 못했습니다 (${msg})`);
  console.log('      ⚠️ 「검사 안 함」을 「통과」로 읽지 마세요. CI 에서는 실패로 처리됩니다.');
  process.exit(0);
}

if (dirty.length === 0) {
  console.log('PASS  빌드 산출물이 커밋 상태와 일치합니다 (재생성해도 변화 없음)');
  console.log('\n════════════════════\n실패 0건');
  process.exit(0);
}

console.log(`${isCI ? 'FAIL' : 'WARN'}  빌드하니 ${dirty.length}개 파일이 달라졌습니다:`);
dirty.slice(0, 12).forEach(f => console.log(`        ${f}`));
if (dirty.length > 12) console.log(`        … 외 ${dirty.length - 12}건`);

if (isCI) {
  console.log('\n      → 커밋에 빌드 산출물이 반영되지 않았습니다.');
  console.log('        GitHub Pages 는 커밋된 파일을 그대로 서빙하므로 라이브가 낡은 상태가 됩니다.');
  console.log('        `npm run build` 후 산출물을 함께 커밋하세요.');
  console.log('\n════════════════════\n실패 1건');
  process.exit(1);
}

console.log('\n      (로컬이므로 경고만 — 커밋 전에 위 파일들을 함께 담으세요)');
console.log('       CI 에서는 이 상태가 실패로 처리됩니다.');
console.log('\n════════════════════\n실패 0건 (경고 1건)');
process.exit(0);

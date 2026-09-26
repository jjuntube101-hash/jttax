#!/usr/bin/env bash
# Aside 브라우저를 Claude Code의 기본 브라우저로 만드는 1회 설치 스크립트 (macOS / Linux).
#
# 하는 일
#   1. aside CLI 존재 확인 (없으면 설치 안내 후 종료)
#   2. 사용자 범위(user scope)에 Aside MCP 서버 등록  → 모든 프로젝트에서 Aside가 기본 브라우저
#   3. ~/.claude/settings.json 에 권한 병합
#        allow: mcp__aside__repl, mcp__aside__memory_search   (직접 조작 — 크레딧 미소모)
#        deny : mcp__aside__exec                               (Aside 에이전트 — 크레딧 소모)
#        deny : mcp__playwright__*, mcp__chrome-devtools__*    (다른 브라우저 경로 차단)
#   4. 이 저장소의 aside-browser 스킬을 ~/.claude/skills/ 에 복사 → 어느 프로젝트에서나 규칙 적용
#
# 되돌리기: claude mcp remove --scope user aside ; ~/.claude/settings.json 의 해당 항목 삭제 ;
#           rm -rf ~/.claude/skills/aside-browser
set -euo pipefail

SKILL_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS="$CLAUDE_DIR/settings.json"

say() { printf '\033[1;34m[aside-setup]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[aside-setup] %s\033[0m\n' "$*" >&2; exit 1; }

# 1. CLI
if ! command -v aside >/dev/null 2>&1; then
  if [ -x "$HOME/.local/bin/aside" ]; then
    export PATH="$HOME/.local/bin:$PATH"
  else
    cat <<'MSG'
aside CLI 가 없습니다. 먼저 설치하세요:
  macOS :  curl -fsSL https://releases.aside.com/install.sh | bash
  또는 Aside 앱  Settings > Developers > Install CLI
설치 후 새 터미널에서 이 스크립트를 다시 실행하세요.
MSG
    exit 1
  fi
fi
ASIDE_BIN="$(command -v aside)"
say "aside CLI: $ASIDE_BIN ($("$ASIDE_BIN" --version 2>/dev/null || echo 'version 확인 불가'))"

command -v claude >/dev/null 2>&1 || die "claude CLI 가 PATH 에 없습니다."
command -v node   >/dev/null 2>&1 || die "node 가 필요합니다 (settings.json 병합용)."

# 2. user-scope MCP 등록 (이미 있으면 갱신)
if claude mcp get aside >/dev/null 2>&1; then
  say "기존 user-scope 'aside' MCP 항목을 갱신합니다."
  claude mcp remove --scope user aside >/dev/null 2>&1 || true
fi
claude mcp add --scope user aside -- "$ASIDE_BIN" mcp
say "MCP 서버 등록 완료: aside → '$ASIDE_BIN mcp' (scope: user)"

# 3. settings.json 권한 병합
mkdir -p "$CLAUDE_DIR"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
cp "$SETTINGS" "$SETTINGS.bak.$(date +%Y%m%d%H%M%S)"
node - "$SETTINGS" <<'JS'
const fs = require('fs');
const file = process.argv[2];
const s = JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
s.permissions ??= {};
const add = (k, items) => {
  s.permissions[k] = Array.from(new Set([...(s.permissions[k] ?? []), ...items]));
};
add('allow', ['mcp__aside__repl', 'mcp__aside__memory_search',
              'Bash(aside repl:*)', 'Bash(aside guide:*)']);
add('deny',  ['mcp__aside__exec', 'Bash(aside exec:*)', 'Bash(aside session:*)',
              'mcp__playwright__*', 'mcp__chrome-devtools__*']);
// allow 에 exec 가 남아 있으면 제거 (deny 가 우선이지만 혼선 방지)
s.permissions.allow = s.permissions.allow.filter(x => x !== 'mcp__aside__exec');
fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
console.log('[aside-setup] settings.json 권한 병합 완료: ' + file);
JS

# 4. 스킬 전역 복사
mkdir -p "$CLAUDE_DIR/skills"
rm -rf "$CLAUDE_DIR/skills/aside-browser"
cp -R "$SKILL_SRC" "$CLAUDE_DIR/skills/aside-browser"
say "스킬 복사 완료: $CLAUDE_DIR/skills/aside-browser/SKILL.md"

# 5. 연결 확인
say "연결 테스트 (Aside 앱이 실행 중이어야 합니다)…"
if "$ASIDE_BIN" repl "const t = await listBrowserTabs(); console.log('tabs:', t.length)" 2>/dev/null; then
  say "OK — Aside 브라우저 제어 가능"
else
  say "repl 응답 없음 — Aside 앱을 실행한 뒤 다시 확인하세요:  aside repl \"console.log((await listBrowserTabs()).length)\""
fi

cat <<'MSG'

남은 수동 단계 (한 번만)
  1) Aside 앱  Settings > Developers > "Enable Aside MCP server" 토글 ON
  2) Claude Code 에서  /chrome  →  "Enabled by default" 가 켜져 있으면 끄기 (Chrome 확장 툴이 컨텍스트에 올라오지 않도록)
  3) 새 claude 세션 시작 → /mcp 에서 aside 가 connected 인지 확인
  4) (선택) OS 기본 브라우저를 Aside 로: Aside 앱 설정 또는 OS 기본 앱 설정
MSG

# Aside 브라우저를 Claude Code의 기본 브라우저로 만드는 1회 설치 스크립트 (Windows PowerShell).
# 동작은 setup-aside.sh 와 동일: user-scope MCP 등록 + 권한 병합 + 스킬 전역 복사.
$ErrorActionPreference = 'Stop'

$SkillSrc  = Resolve-Path (Join-Path $PSScriptRoot '..')
$ClaudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$Settings  = Join-Path $ClaudeDir 'settings.json'

function Say($m) { Write-Host "[aside-setup] $m" -ForegroundColor Cyan }

# 1. CLI
$aside = Get-Command aside -ErrorAction SilentlyContinue
if (-not $aside) {
  Write-Host @'
aside CLI 가 없습니다. Aside 앱  Settings > Developers > Install CLI  로 설치하거나
docs.aside.com/help/developers 의 PowerShell 설치 명령을 실행한 뒤, 새 터미널에서 다시 실행하세요.
'@
  exit 1
}
$AsideBin = $aside.Source
Say "aside CLI: $AsideBin"
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { throw 'claude CLI 가 PATH 에 없습니다.' }
if (-not (Get-Command node   -ErrorAction SilentlyContinue)) { throw 'node 가 필요합니다.' }

# 2. user-scope MCP 등록
& claude mcp get aside *> $null
if ($LASTEXITCODE -eq 0) { Say '기존 aside 항목 갱신'; & claude mcp remove --scope user aside *> $null }
& claude mcp add --scope user aside -- "$AsideBin" mcp
Say "MCP 서버 등록 완료 (scope: user)"

# 3. settings.json 권한 병합
New-Item -ItemType Directory -Force -Path $ClaudeDir | Out-Null
if (-not (Test-Path $Settings)) { Set-Content -Path $Settings -Value '{}' -Encoding UTF8 }
Copy-Item $Settings "$Settings.bak.$(Get-Date -Format yyyyMMddHHmmss)"
$js = @'
const fs = require('fs'); const file = process.argv[2];
const s = JSON.parse(fs.readFileSync(file, 'utf8') || '{}'); s.permissions ??= {};
const add = (k, items) => { s.permissions[k] = Array.from(new Set([...(s.permissions[k] ?? []), ...items])); };
add('allow', ['mcp__aside__repl', 'mcp__aside__memory_search', 'Bash(aside repl:*)', 'Bash(aside guide:*)']);
add('deny',  ['mcp__aside__exec', 'Bash(aside exec:*)', 'Bash(aside session:*)', 'mcp__playwright__*', 'mcp__chrome-devtools__*']);
s.permissions.allow = s.permissions.allow.filter(x => x !== 'mcp__aside__exec');
fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n'); console.log('[aside-setup] settings.json 병합 완료');
'@
$tmp = Join-Path $env:TEMP 'aside-merge.js'; Set-Content -Path $tmp -Value $js -Encoding UTF8
& node $tmp $Settings; Remove-Item $tmp

# 4. 스킬 전역 복사
$dst = Join-Path $ClaudeDir 'skills\aside-browser'
if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
Copy-Item -Recurse $SkillSrc $dst
Say "스킬 복사 완료: $dst\SKILL.md"

# 5. 연결 확인
Say '연결 테스트 (Aside 앱 실행 중이어야 함)…'
& $AsideBin repl "const t = await listBrowserTabs(); console.log('tabs:', t.length)"
if ($LASTEXITCODE -ne 0) { Say 'repl 응답 없음 — Aside 앱을 실행한 뒤 다시 확인하세요.' }

Write-Host @'

남은 수동 단계 (한 번만)
  1) Aside 앱  Settings > Developers > "Enable Aside MCP server" 토글 ON
  2) Claude Code 에서  /chrome  →  "Enabled by default" 가 켜져 있으면 끄기
  3) 새 claude 세션 시작 → /mcp 에서 aside 가 connected 인지 확인
  4) (선택) OS 기본 브라우저를 Aside 로 지정
'@

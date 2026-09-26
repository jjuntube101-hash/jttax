# Aside 브라우저를 Claude Code 기본 브라우저로 — 설치 안내

## 구조 한눈에

| 층 | 파일 | 역할 |
|---|---|---|
| 프로젝트 | `.mcp.json` | 이 저장소에서 `aside mcp`를 MCP 서버로 등록 |
| 프로젝트 | `.claude/settings.json` | `aside` 서버 자동 승인, `repl` 허용, `exec` 차단, Playwright·chrome-devtools 차단 |
| 프로젝트 | `.claude/skills/aside-browser/SKILL.md` | Claude가 Aside를 **직접 조작**하는 작업 규칙(정본) |
| 프로젝트 | `.claude/CLAUDE.md` | 브라우저 = Aside 고정, 스킬 로드 지시 |
| 전역(선택) | `.claude/skills/aside-browser/scripts/setup-aside.sh` / `.ps1` | 위 설정을 `~/.claude`(user scope)에 복제 → **모든 프로젝트**에서 Aside가 기본 |

## 왜 `exec`를 막고 `repl`만 쓰나

Aside MCP(`aside mcp`)가 노출하는 툴은 다음과 같다.

- **`exec`** — Aside 내장 에이전트에 자연어 태스크를 맡긴다. Aside 쪽 모델이 스스로 화면을 보고 판단하므로 **Aside 크레딧(Free 500/월, Pro 1,500/월)을 소모**한다. Aside 화면의 Ask AI(`Cmd/Ctrl+E`)·New Task에 채팅을 치는 것과 같은 경로다.
- **`repl`** — Playwright 스타일 JavaScript를 브라우저 안에서 실행한다. `goto`·`click`·`fill`·`snapshot`·`screenshot` 등을 **Claude Code가 직접 호출**한다. Aside 모델이 개입하지 않으므로 크레딧이 들지 않고, 판단 비용은 Claude Code 쪽(이미 쓰는 구독)에서만 발생한다.
- `memory_search` — Aside 메모리 검색(읽기 전용).

따라서 `.claude/settings.json`에서 `mcp__aside__exec`를 deny, `mcp__aside__repl`을 allow로 두면 Claude는 Aside에 채팅을 입력하지 않고 마우스·키보드를 직접 조작하는 방식으로만 작업한다.

## 1회 설치 (로컬 PC)

### 1) Aside 앱 + CLI
- Aside 앱 설치 후 실행(데몬이 떠 있어야 CLI가 브라우저를 잡는다).
- CLI: macOS `curl -fsSL https://releases.aside.com/install.sh | bash` / Windows는 앱의 **Settings > Developers > Install CLI** 또는 docs.aside.com/help/developers의 PowerShell 명령.
- 앱 **Settings > Developers > "Enable Aside MCP server"** 토글 ON. 같은 화면의 *Add skill to… > Claude Code*는 Aside 기본 스킬을 `~/.claude/skills/aside-browser/`에 쓰는데, 이 저장소 스킬이 그 이름을 **덮어쓴다**(우리 규칙이 `exec` 금지를 포함하므로 의도된 동작).

### 2) 저장소 안에서만 쓸 때
아무것도 더 할 필요 없다. 이 폴더에서 `claude`를 열고 워크스페이스를 신뢰(trust)하면 `.mcp.json`의 `aside` 서버가 `.claude/settings.json`의 `enabledMcpjsonServers`로 자동 승인된다. `/mcp`에서 `aside · connected`를 확인한다.

### 3) 모든 프로젝트에서 기본 브라우저로 쓸 때
```bash
# macOS / Linux
bash .claude/skills/aside-browser/scripts/setup-aside.sh
```
```powershell
# Windows
powershell -ExecutionPolicy Bypass -File .claude\skills\aside-browser\scripts\setup-aside.ps1
```
스크립트는 ① `claude mcp add --scope user aside -- <aside 경로> mcp` ② `~/.claude/settings.json`에 allow/deny 병합(백업 생성) ③ 스킬을 `~/.claude/skills/aside-browser/`에 복사 ④ `aside repl`로 연결 테스트를 수행한다.

### 4) Chrome 확장 비활성화
Claude Code에서 `/chrome` → **"Enabled by default"**가 켜져 있으면 끈다. 켜져 있으면 Chrome 확장 툴이 항상 컨텍스트에 올라와 토큰을 더 쓰고, Claude가 Aside 대신 Chrome을 고를 여지가 생긴다. 필요할 때만 `claude --chrome`으로 쓴다.

### 5) (선택) OS 기본 브라우저
터미널·다른 앱에서 여는 링크까지 Aside로 가게 하려면 OS 기본 브라우저를 Aside로 지정한다(macOS: 시스템 설정 > 데스크탑 및 Dock > 기본 웹 브라우저 / Windows: 설정 > 앱 > 기본 앱). Claude Code 자체는 MCP 경로로 Aside를 쓰므로 이 단계 없이도 동작한다.

## 동작 확인
새 `claude` 세션에서:
```
/mcp                      → aside: connected, tools: repl, memory_search (exec 는 deny 로 숨김)
aside 로 https://www.jttax.co.kr 열어서 헤더 메뉴 항목 읽어줘
```
Claude가 `mcp__aside__repl` 한 번으로 탭 attach → goto → snapshot을 실행하고, Aside 화면에 페이지가 실제로 열리면 정상이다. Aside 사이드바에 어떤 채팅도 생기지 않아야 한다.

## 되돌리기
```bash
claude mcp remove --scope user aside
rm -rf ~/.claude/skills/aside-browser
# ~/.claude/settings.json 의 permissions 에서 mcp__aside__* / mcp__playwright__* / mcp__chrome-devtools__* 항목 삭제 (스크립트가 만든 .bak 파일로 복원 가능)
```

## 알려진 제약
- `openTab()`으로 만든 탭은 `repl` 호출이 끝나면 사라진다. 스킬은 항상 **기존 탭에 attach**하도록 되어 있으므로, Aside에 **빈 탭 하나를 열어두면** Claude가 그 탭을 자기 작업 탭으로 쓴다.
- 키보드·마우스 저수준 API(`page.keyboard`, `page.mouse`)의 정확한 지원 범위는 CLI 버전에 따라 다를 수 있다. 스킬이 세션 시작 시 `aside guide`를 읽어 현재 버전의 API를 따르도록 되어 있다.
- Aside 앱이 꺼져 있으면 `Aside daemon is not reachable`. 스킬은 이때 다른 브라우저로 우회하지 않고 앱 실행을 요청한다.

## 공개 서빙 주의
이 저장소는 GitHub Pages가 main의 **모든 파일**을 www.jttax.co.kr 아래로 서빙한다(루트 `.gitignore`가 200으로 열리는 것을 실측). `.github/`는 404로 제외되지만 `.claude/`도 제외되는지는 배포 후 확인이 필요하다 `[확인 필요]`. 그래서 Claude 관련 파일은 전부 `.claude/`·`.mcp.json` 아래에만 두고, `robots.txt`에 `/.claude/`를 Disallow했다. 여기에는 **비밀값을 절대 넣지 않는다**(API 키·계정·토큰은 Aside 앱과 `~/.claude/` 전역 설정에만).

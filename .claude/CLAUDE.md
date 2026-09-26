# jttax-site — Claude Code 프로젝트 규칙

## 브라우저
- 이 저장소에서 브라우저가 필요한 모든 작업(페이지 확인·스크린샷·폼 입력·로그인된 사이트 조작)은 **Aside 브라우저**로 한다. 규칙 정본: `.claude/skills/aside-browser/SKILL.md` — 브라우저를 쓰기 전에 반드시 로드.
- Aside는 `mcp__aside__repl` 툴로 **Claude가 직접 클릭·입력·키 입력**한다. Aside 자체 AI(`exec` 툴, Ask AI 채팅, New Task)는 Aside 크레딧을 소모하므로 **사용 금지**(`.claude/settings.json`에서 deny).
- Playwright MCP·chrome-devtools MCP·Claude in Chrome 확장 등 다른 브라우저 경로는 사용자가 명시적으로 지시할 때만.
- 로컬 1회 설치(전역 기본 브라우저화·권한)는 `.claude/skills/aside-browser/SETUP.md` 참고. 설치 스크립트: `.claude/skills/aside-browser/scripts/setup-aside.sh`(macOS/Linux) · `setup-aside.ps1`(Windows).

## 빌드·테스트
- `npm run build` → `npm test` 순서(`package.json`의 `_gate_note` 참고). 정적 산출물이 커밋되므로 원고를 고치면 재빌드 후 커밋.

---
name: aside-browser
description: Aside 브라우저를 Claude Code의 기본(유일) 브라우저로 사용한다. 웹페이지 열기·확인·클릭·폼 입력·키 입력·스크린샷·로그인된 사이트(홈택스·위택스·구글·네이버 등) 작업이 필요할 때 로드한다. Aside의 exec(에이전트 태스크)·Ask AI 채팅은 절대 쓰지 않고, repl 툴로 Claude가 직접 마우스·키보드를 조작한다.
allowed-tools:
  - mcp__aside__repl
  - mcp__aside__memory_search
  - Bash(aside repl:*)
  - Bash(aside guide:*)
---

# Aside 브라우저 — 직접 조작 규칙

## 0. 한 줄 요약
브라우저는 **Aside 하나**다. 조작은 **`mcp__aside__repl` 한 툴**로만 한다.
Aside의 AI(`exec`, Ask AI 사이드바, New Task)는 **호출 금지** — Aside 크레딧(토큰)이 소모된다.

## 1. 왜 이렇게 하나
- Aside MCP(`aside mcp`)는 툴을 세 개 노출한다.
  - `exec` — Aside 내장 에이전트에게 자연어 태스크를 맡긴다. **Aside 모델이 돌면서 크레딧을 먹는다.** → 사용 금지(`.claude/settings.json` deny).
  - `repl` — Playwright 스타일 JavaScript를 브라우저 안에서 실행한다. **Aside 모델을 쓰지 않는다.** 클릭·입력·키 입력·스크린샷·DOM 읽기가 전부 여기서 된다. → 유일한 조작 경로.
  - `memory_search` — 사용자의 Aside 메모리 검색. 읽기 전용, 필요 시만.
- 따라서 "Aside에 채팅으로 시켜서" 하는 대신, **Claude가 `repl` 안에서 직접 `click`·`fill`·`press`를 호출**한다. 판단은 Claude(=Claude Code 토큰), 손발은 Aside 브라우저다.

## 2. 절대 금지
1. `mcp__aside__exec` 호출, `aside "자연어 태스크"`(인자 없는 agent 모드), `aside exec`, `aside session ...`.
2. Aside 화면의 **Ask AI**(`Cmd/Ctrl+E`), **New Task**(`Cmd/Ctrl+Shift+E`), 새 탭 옴니박스의 Ask AI 모드에 텍스트 입력. 옴니박스는 **Search 모드로 URL만** 넣거나, 그냥 `goto()`를 쓴다.
3. Playwright MCP·chrome-devtools MCP·Claude in Chrome 확장·headless Chromium 등 **다른 브라우저 경로로 우회** — 사용자가 명시적으로 지시한 경우만 예외.
4. 페이지 전체 `content()`/HTML을 통째로 출력 — 컨텍스트 낭비. 필요한 요소만 `snapshot`·`evaluate`로 뽑는다.

## 3. 세션 시작 시 1회
```bash
aside guide
```
을 Bash로 한 번 실행해 **현재 CLI 버전의 정확한 REPL API**(전역 함수·page 메서드·키보드/마우스 API·스크린샷 저장 경로)를 읽는다. 아래 §4의 목록은 검증된 최소 집합이고, `aside guide`가 더 최신이면 그쪽을 따른다.
MCP 툴 `mcp__aside__repl`이 목록에 없으면(연결 실패) 같은 코드를 `aside repl "<code>"`로 Bash에서 실행한다. 둘 다 안 되면 §7.

## 4. 검증된 REPL API (Aside CLI v1.26 기준)
**전역**: `openTab(url)`, `listBrowserTabs()`, `attachBrowserTab(targetId)`, `snapshot(page)`
**page 메서드**: `goto`, `goBack`, `goForward`, `reload`, `waitForLoadState`, `waitForURL`, `waitForSelector`, `locator`, `getByRole`, `getByLabel`, `getByText`, `click`, `fill`, `$`, `$$`, `$$eval`, `frameLocator`, `evaluate`, `evaluateInFrame`, `url()`, `title()`, `content()`, `screenshot`, `snapshot`, `frames`, `bringToFront`, `pdf`, `close`, `viewportSize`
- `page.title()`·`page.url()`은 **함수**(괄호 필요). `page.windowId`·`page.targetId`는 속성.
- `waitForLoad`는 없다 → `waitForLoadState('domcontentloaded')`.
- 키 입력은 Playwright 관례대로 `locator.press('Enter')`, `locator.type(...)`, `page.keyboard.press(...)`, `page.mouse.click(x, y)`를 먼저 시도하고, 없으면 `aside guide`에서 확인한다. `[확인 필요: 버전별 상이]`
- 출력은 **`console.log(...)`로만** 잡힌다. 마지막 표현식 값은 echo되지 않는다.
- 파일 쓰기(스크린샷 등)는 데몬이 `~/.aside/u/0/sessions/<session>/tmp/` 아래로 샌드박스한다. `/tmp`가 아니다.

## 5. 표준 작업 흐름 (반드시 이 순서)
```js
// 1) 기존 탭에 붙는다 — openTab()으로 만든 탭은 repl 종료 시 사라진다.
const tabs = await listBrowserTabs();
console.log(tabs.map((t, i) => `${i}: ${t.title} — ${t.url}`).join('\n'));
```
```js
// 2) 사용자의 작업 탭을 덮어쓰지 않도록, 빈 탭(about:blank/새 탭)이 있으면 그것을, 없으면 마지막 탭을 쓴다.
const tabs = await listBrowserTabs();
const spare = tabs.find(t => /^(about:blank|chrome:\/\/newtab|aside:\/\/)/.test(t.url)) ?? tabs[tabs.length - 1];
const p = await attachBrowserTab(spare.targetId);
await p.goto('https://example.com');
await p.waitForLoadState('domcontentloaded');
// 3) 화면을 "본다": 스크린샷보다 접근성 트리(snapshot)가 토큰이 훨씬 싸다.
const s = await snapshot(p);
console.log(s.tree);          // 요소마다 e1, e2 … 참조 ID가 붙는다
```
```js
// 4) 행동한다: 참조 ID·역할·라벨로 잡아서 click / fill / press
await p.getByLabel('아이디').fill('...');
await p.getByRole('button', { name: '로그인' }).click();
await p.waitForLoadState('networkidle');
// 5) 검증한다: 다시 snapshot(필요할 때만 screenshot)
console.log((await snapshot(p)).tree.slice(0, 3000));
```
- **한 `repl` 호출에 여러 단계를 묶는다**(attach → goto → 액션 → snapshot). 호출마다 새 세션이 열리므로 잘게 쪼개면 느리고 비싸다.
- 스크린샷은 **레이아웃·시각 확인이 꼭 필요할 때만** `await p.screenshot({ path: '<샌드박스 경로>/step.png' })` 후 Read로 본다.
- 셀렉터 우선순위: `getByRole` > `getByLabel` > `getByText` > CSS `locator`. `snapshot`의 참조 ID(`e12`)가 있으면 그것을 쓴다.
- 새 탭이 열리는 링크(`target=_blank`)는 클릭 뒤 `listBrowserTabs()`로 다시 찾아 attach한다.

## 6. 안전 규칙 (로그인된 실계정이 움직인다)
- **되돌리기 어려운 제출**(홈택스·위택스 신고 제출/납부, 결제, 삭제, 메일·메시지 발송, 계정 설정 변경)은 **클릭 직전 상태를 snapshot으로 보여주고 사용자 확인을 받은 뒤** 실행한다. 확인 없이는 "제출 직전까지"만 진행한다.
- 자격증명은 Aside 금고가 처리한다. 비밀번호를 사용자에게 묻거나 코드에 하드코딩하지 않는다. 로그인 폼이 나오면 **사용자에게 직접 로그인하라고 알리고 대기**한다.
- 캡차·2단계 인증 화면이면 멈추고 사용자에게 넘긴다.
- 사용자의 다른 탭을 닫거나(`close`) 이동시키지 않는다. 내 탭만 쓴다.

## 7. 장애 시
| 증상 | 조치 |
|---|---|
| `Aside daemon is not reachable` | Aside 앱이 꺼져 있다. 사용자에게 Aside 실행을 요청. `exec`나 다른 브라우저로 **우회하지 않는다**. |
| `mcp__aside__repl` 툴 없음 | 이 저장소 `.mcp.json`이 승인 안 됐거나 CLI 미설치. `claude mcp list` 확인 → `.claude/skills/aside-browser/SETUP.md` 안내. 당장은 `aside repl "..."` Bash로 대체. |
| `authStatus: paused / token_revoked` | Aside 앱에서 로그아웃 → 재로그인 필요(앱 재시작만으로 안 됨). repl은 계정 없이도 대개 동작하므로 먼저 시도. |
| 탭이 사라짐 | `openTab` 탭은 세션 종료 시 소멸 — 정상. `attachBrowserTab`으로 기존 탭을 쓴다. |

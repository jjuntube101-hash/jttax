## 1. 작업 요약

`77d5026..HEAD`(HEAD `95d6501`)를 정적 검토했습니다.
엔진 전 게이트의 실제 ①층 판정, 중복 상태 갱신·재시도 동작, AST 회귀검사의 오탐/누락, 8개 계산기의 차단 뒤 외부 전송 경로를 대조했습니다.

**P0/P1 지적은 없습니다.** 다만 사용자가 보는 차단 사유, 재시도 UX, 그리고 재발 방지 검사에 아래 **P2 4건**이 있습니다.

## 2. 지적 사항

### [P2] `ReportInheritance.jsx:432`, `ReportGift.jsx:552`, `ReportAcquisition.jsx:471`, `ReportCGT.jsx:675` · 엔진 전에는 ①층만 막지만, 차단 화면에서는 `precise:false`로 저장되어 ②층 사유까지 함께 표시됩니다

엔진 전 게이트는 정확히 `{ precise: true }`로 호출되어 ①층만 판정합니다. 그러나 차단 시 저장하는 `unknownRep.calc.precise`가 `false`이고, 렌더는 다시 `*FallbackGaps(answers, calc)`를 호출합니다. 이 재호출은 ②층까지 `concat`하므로, 실제로 엔진 POST를 멈춘 이유와 무관한 “간이 폴백 한계” 사유가 화면에 추가됩니다.

재현:

- 상속세: `isResident: 'no'`, `hasSpouse: 'yes'`, `spouseActual: 'zero'`
  - 엔진 전 판정은 비거주자(①) 하나만으로 차단합니다.
  - 그러나 `unknownRep.calc.precise === false` 때문에 렌더 시 배우자 실제 상속액 0(②)도 함께 표시됩니다.
- 증여세: `isResident: 'no'`, `genSkip: 'yes'`
  - 엔진 전 차단 사유는 비거주자(①)뿐인데, 화면에는 세대생략증여(②)도 추가됩니다.
- 취득세: 증여 주택, 조정대상지역 `unsure`, 전용면적 `86㎡`
  - 엔진 전 차단은 조정대상지역 미확인(①)으로 발생하지만, 화면에는 85㎡ 초과 간이계산 한계(②)도 표시됩니다.
- 양도세: 1주택, 취득 당시 조정대상지역 `unsure`, 동시 보유 입주권 `occupancy`
  - 엔진 전 차단은 취득 당시 조정대상지역 미확인(①)인데, 화면에는 동시 보유 입주권(②)도 붙습니다.

수정안:

- 엔진 전 차단 보고서에 출처를 명시하십시오. 예: `calc: { precise: true, blockedPreEngine: true }`.
- 렌더 단계에서 `blockedPreEngine`이면 `fn(answers, { precise: true })`로 사유를 다시 계산하거나, 사유 배열을 보고서에 그대로 저장해 재계산하지 마십시오.
- 단순히 `precise:true`로 바꾸는 것도 현재 UI에서는 동작하지만, 실제 정밀 결과라는 의미와 섞이지 않도록 `blockedPreEngine` 같은 명시적 상태를 추가하는 편이 안전합니다.

---

### [P2] `Report.jsx:85-87`, `ReportComprehensive.jsx:337-341` 등 6개 엔진 전 차단 경로 · 입력 불확정 차단에 “정밀 계산 다시 시도” 버튼이 기능적으로 무의미합니다

새 엔진 전 게이트는 엔진 장애가 아니라 **입력이 확정되지 않았기 때문에** 차단합니다. 그런데 공통 차단 화면은 모든 경우에 “잠시 후 정밀 계산 다시 시도”를 안내하고 동일한 `runAnalysis`를 재호출합니다. 차단 화면에는 값을 수정할 입력 UI도 없습니다.

재현:

1. 종합부동산세에서 `housingCount: 'one'`, `ownership: 'joint'`, `ownShare` 미입력 상태로 결과를 요청합니다.
2. `compFallbackGaps(answers, { precise: true })`가 차단하고 `setReport(unknownRep)` 뒤 즉시 반환합니다.
3. 차단 화면의 “정밀 계산 다시 시도”를 누릅니다.
4. 같은 `answers`로 같은 엔진 전 게이트가 다시 실행되어 다시 차단됩니다. 계산 엔진 POST는 발생하지 않습니다.
5. 자동 재시도나 렌더 루프는 없습니다. 다만 사용자가 누를 때마다 같은 상태 갱신만 반복되고, 안내 문구와 실제 해결 방법이 맞지 않습니다.

이 문제는 상속·증여·취득·양도·재산·종부세의 새 엔진 전 차단 모두에 해당합니다. 재산세는 현재 `{ precise: true }`에서 빈 배열을 반환하므로, 이 경로로는 들어가지 않습니다.

수정안:

- 위 `blockedPreEngine` 상태를 사용해 차단 화면을 두 종류로 나누십시오.
  - 입력 불확정: “입력 수정하기” 버튼을 제공하고 `setReport(null)`로 이전 문항으로 돌아가게 합니다. 재시도 버튼은 표시하지 않습니다.
  - 엔진 오류 또는 엔진 미지원 폴백: 기존 “정밀 계산 다시 시도”를 유지합니다.
- 최소 수정이라면 `JTFallbackBlocked`에 `onEdit`와 `retryable`을 추가하고, 엔진 전 차단 보고서에서는 `retryable={false}`를 넘기면 됩니다.

---

### [P2] `tests_gate_ast.js:202-231`, `tests_fallback_block.js:266-274` · 새 검사는 “엔진 전” 게이트 삭제 회귀를 잡지 못합니다

현재 검사는 다음만 보장합니다.

- `runAnalysis` 안에 반환하는 게이트가 하나 이상 존재한다.
- 그 게이트가 AI 호출보다 앞에 있다.
- `runAnalysis` 안의 판정 함수 호출이 어떤 게이트에 쓰인다.

하지만 **그 게이트가 계산 엔진 POST보다 앞에 있는지**는 검사하지 않습니다. 따라서 이번 P1의 핵심인 “불확정 입력을 엔진에 보내지 않는다”는 불변식이 자동 회귀검사로 고정되지 않았습니다.

재현:

1. 예를 들어 `ReportInheritance.jsx:431-436`의 엔진 전 `inhFallbackGaps(answers, { precise: true })` 블록 전체를 제거합니다.
2. 엔진 응답 뒤의 `ReportInheritance.jsx:478-483` 게이트는 그대로 둡니다.
3. `tests_gate_ast.js`는 후단 게이트가 반환하고 AI보다 앞에 있으므로 통과할 수 있습니다.
4. “모든 판정 호출이 게이트에 쓰인다” 검사도 남은 후단 호출은 실제 게이트 조건에 쓰이므로 통과합니다.
5. `tests_fallback_block.js`의 `indexOf(\`if (${fn}(\`)` 역시 후단 게이트를 찾아 AI보다 앞이라고 판단합니다.
6. 그러나 비거주자 등 ①층 입력은 `callInhEngine(...)` POST까지 전송됩니다.

수정안:

- 6개 2층 계산기에 대해 별도 불변식을 추가하십시오.
  - `fn(answers, { precise: true })`를 사용하는 반환 게이트가 존재한다.
  - 그 게이트가 해당 계산기의 첫 계산 엔진 호출보다 앞에 있다.
- 문자열 순서 검사가 아니라 현재처럼 Babel AST를 사용해 다음을 확인하는 편이 좋습니다.
  - 게이트 호출의 두 번째 인자가 `precise: true` 객체이다.
  - 해당 `IfStatement`가 실제 반환 게이트이다.
  - `callInhEngine` / `callGiftEngine` / `callAcqEngine` / `callPropEngine` / 양도세 엔진 호출 / `callCompEngine`보다 앞이다.
- 각 대상에서 엔진 전 게이트를 제거한 변이 사례가 실패하는 테스트를 추가하십시오.

---

### [P2] `tests_gate_ast.js:95-107`, `118-143`, `218-231` · 정당한 로그·조건부 게이트 표현도 “판정 무력화”로 오탐합니다

현재 검사는 `runAnalysis` 안의 판정 함수 호출을 전부 “반환 게이트 조건 또는 그 게이트가 쓰는 변수 초기화”로 제한합니다. 따라서 진단·로그·계측 목적의 정당한 호출도 실패시킵니다. 또 논리식으로 감싼 정상 게이트를 인정하지 않습니다.

재현 1 — 로그/디버그 호출:

```js
if (inhFallbackGaps(answers, { precise: true }).length > 0) {
  setReport(unknownRep);
  return;
}

console.debug('fallback gaps', inhFallbackGaps(answers, { precise: true }));
```

`tests_gate_ast.js:229`의 `orphan`에 두 번째 호출이 들어가므로 실패합니다. 하지만 이 호출은 게이트를 무력화하지 않고, 기존 게이트의 동작도 바꾸지 않습니다.

재현 2 — 조건부 분기 안의 정상 게이트:

```js
if (shouldValidate
    && inhFallbackGaps(answers, { precise: true }).length > 0) {
  setReport(unknownRep);
  return;
}
```

`tests_gate_ast.js:122`가 `BinaryExpression`만 받으므로 `LogicalExpression`인 위 조건은 게이트로 인정하지 않습니다. 다른 후단 게이트가 남아 있다면 이 호출은 `orphan`으로 실패하고, 후단 게이트가 없다면 “반환 게이트 없음”으로 실패합니다.

수정안:

- “모든 호출은 게이트여야 한다”가 아니라 “필수 게이트가 엔진 전·엔진 후에 각각 존재하고 실제 반환한다”를 검사 대상으로 좁히십시오.
- 디버그 호출 자체를 금지할 정책이라면 AST 구조 규칙에 섞지 말고 ESLint 또는 별도 금지 규칙으로 명시하는 편이 의도가 분명합니다.
- 조건식은 `LogicalExpression`을 재귀적으로 해석해, `&&`의 한 항에 실제 `gaps.length` 검사가 있고 참 분기에서 반환하는 정상 형태를 인정하십시오.

## 3. 재발 방지 및 확인 결과

### 엔진 전 ①층 판정 대조

| 계산기 | `{ precise: true }` 호출 결과 | 판정 |
|---|---|---|
| 상속세 | 비거주자만 ①층, 나머지는 `calc.precise` 이후 ②층 | 적정 |
| 증여세 | `engineErr`가 `undefined`이면 통과 후 비거주자만 ①층 | 적정 |
| 취득세 | 조정대상지역·면적 미입력·3주택 임시특례 등 ①층만 | 적정 |
| 재산세 | 첫 줄 `if (calc.precise) return []` — ①층 조건 없음 | 적정 |
| 양도세 | 취득 당시 조정대상지역 `unsure`만 ①층 | 적정 |
| 종합소득세 | 단일 층; 배당 유형 불확정이 엔진 전 차단 | 적정 |
| 법인전환 | 단일 층; 대표급여가 사업이익 초과 시 엔진 전 차단 | 적정 |
| 종합부동산세 | 단일 층; 공동명의 1주택 지분 미입력만 차단 | 적정 |

특히 증여세의 `giftFallbackGaps`는 `ReportGift.jsx:313-315`에서 `calc.engineErr`를 먼저 확인하지만, 엔진 전 호출은 `ReportGift.jsx:551`의 `{ precise: true }` 객체뿐입니다. 이 객체에는 `engineErr`가 없으므로 해당 조건은 거짓이며, 정상적으로 비거주자 ①층 판정으로 진행합니다. 이는 의도에 맞습니다.

### 중복 차단·상태

- 같은 `runAnalysis` 실행에서 엔진 전 게이트와 엔진 후 게이트가 모두 `setReport`하는 경로는 없습니다. 엔진 전 게이트는 `setReport` 직후 반환합니다.
- `phase === 'quick'`일 때만 `setQuickReport`도 같은 보고서 객체로 갱신하므로, `report.quick`과 `quickReport`의 값은 현재 구현상 일치합니다.
- 자동 무한 반복은 없습니다. 재시도 버튼을 누를 때만 한 번 재실행되는 수동 반복입니다.
- 다만 위 두 번째 P2처럼, 입력 불확정 상태의 수동 재시도는 해결 경로가 아니므로 분리해야 합니다.

### shadowing 방어의 실제 8개 파일 영향

현재 8개 파일에는 문제의 일반 이름 `gaps`를 서로 다른 함수에서 복수 선언한 구조가 없습니다. 각 파일은 렌더 단계에서만 고유 이름을 한 번 선언합니다.

- `inhGaps`, `giftGaps`, `acqGaps`, `propGaps`
- `cgtGaps`, `incGaps`, `corpGaps`, `compGaps`

따라서 **현재 8개 파일이 “같은 이름 2회 선언” 규칙 때문에 거부되는 사례는 없습니다.** 위 네 번째 P2는 이 저장소의 현 상태가 아니라, 검사 규칙이 향후 정당한 디버그·조건부 리팩터링까지 거부하는 범위 문제입니다.

### 차단 경로 8종 전수 대조

엔진 전 차단이 존재하는 6개 계산기에서, 해당 `return` 뒤에는 계산 엔진 POST와 AI 호출이 도달 불가입니다. 종합소득세·법인전환도 기존 엔진 전 게이트에서 동일하게 반환합니다.

| 경로 | 차단 중 결과 |
|---|---|
| 화면 | `JTFallbackBlocked`와 사유만 렌더; 금액 결과·AI 코멘터리·공유 컴포넌트는 조기 반환 뒤에 있음 |
| 외부 AI | 8개 모두 게이트 반환 뒤에 `window.claude.complete`가 위치 |
| 클립보드 | 8개 계산기 차단 서브트리에서 `navigator.clipboard` 호출 없음 |
| Web3Forms | 8개 계산기 차단 서브트리에서 Web3Forms 전송 없음 |
| `gtag` | 8개 계산기 파일의 차단 흐름에 `gtag` 호출 없음 |
| 주소조회 API | 주소조회는 별도 버튼 이벤트 핸들러이며 `runAnalysis` 차단 경로에서 호출되지 않음 |
| `localStorage` | 계산 답변·세액을 저장하는 호출은 8개 계산기 파일에서 확인되지 않음; 라우트용 `jt_report_sub` 저장은 `Report.jsx`의 별도 라우팅 효과임 |
| 계산 엔진 POST | 6개 새 게이트는 엔진 호출보다 앞에서 반환; 종합소득세·법인전환도 기존 게이트가 각 POST보다 앞에 있음 |

참고로 각 계산기 마운트 시 `/health` **GET** 워밍업은 별도로 존재합니다. 이는 입력값을 포함하지 않는 헬스체크이며, 요청하신 계산 엔진 **POST** 차단 범위와는 구분됩니다.

## 4. 검증 결과

실행한 읽기 전용 정적 검토 명령과 결과입니다.

```powershell
git log --oneline --decorate 77d5026..HEAD
git diff --stat 77d5026..HEAD
git diff --name-status 77d5026..HEAD
```

결과: 검토 범위는 6개 계산기, `tests_gate_ast.js`, `tests_fallback_block.js`, 캐시 버전/매니페스트 변경으로 확인했습니다.

```powershell
rg -n "FallbackGaps\(answers,|const .*Gaps" project/src/Report*.jsx
```

결과: 8개 판정 함수의 분석·렌더 호출 위치, 6개 새 `{ precise:true }` 엔진 전 게이트, 8개 렌더용 고유 `*Gaps` 변수 선언을 대조했습니다. 동일한 `gaps`/`*Gaps` 선언의 중복은 발견되지 않았습니다.

```powershell
rg -n "(gtag\(|navigator\.clipboard|web3forms|localStorage\.(?:setItem|getItem)|/v1/lookup|/v1/calc|claude\.complete)" project/src/Report*.jsx
```

결과: 차단 반환 이후 AI·계산 POST가 위치함을 확인했고, 차단 서브트리 내 클립보드·Web3Forms·gtag 호출은 발견되지 않았습니다.

```powershell
Get-FileHash project/src/Report*.jsx -Algorithm SHA256
Get-Content project/asset_versions.json | ConvertFrom-Json
```

결과: 변경된 6개 JSX 파일의 SHA-256이 `project/asset_versions.json`과 모두 일치했고, `index.html`의 캐시 버전도 매니페스트와 모두 일치했습니다.

요청에 따라 Node 및 `npm run gate` 실행은 시도하지 않았습니다.

## 5. 미확인 사항

- 브라우저에서의 fetch 계측 실측은 이번 검토에서 재실행하지 않았습니다. 다만 소스상 6개 엔진 전 게이트는 각 계산 엔진 호출문보다 앞에 있고, 게이트 본문은 `setReport` 후 반환합니다.
- 실제 배포 환경의 `window.claude`, Web3Forms, 분석 스크립트 동작은 네트워크를 호출하지 않는 정적 검토 범위를 벗어나므로 미확인입니다.
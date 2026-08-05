## 1. 작업 요약

R19의 세 수정은 코드상 올바릅니다. 다만 동일 세대를 정상 조회로 두 번 넣으면 `picks`가 중복되어 합계가 두 배가 되는 P2가 남아 있습니다.

| 심각도 | 파일:라인 | 구체적 재현 | 수정안 |
|---|---|---|---|
| P2 | [ReportReform2026.jsx](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:728), [985](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:985), [758](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:758) | `정릉로 305, 102동 601호`를 조회해 411,000,000원을 넣은 뒤, 같은 주소를 다시 조회·추가하면 `getPicks(...).concat([item])`이 같은 항목을 다시 넣어 합계가 822,000,000원이 됩니다. loose 승인 후 같은 주소를 재조회·승인해도 동일합니다. | `RfWizard` 소유자에서 추가를 단일 함수로 중앙화하고, 정규화한 주소+확정 동·호(가능하면 엔진 식별자)를 기준으로 중복을 거절하거나 기존 항목을 교체하십시오. 거절 결과를 `RfAddrLookup`에 돌려 성공 안내도 막아야 합니다. |
| P3 (검증 공백) | [tests_rf_reform2026.js](/D:/jt-data/jttax-cta/project/tests_rf_reform2026.js:6) | 이 테스트는 “공용 UI 조각” 앞까지만 평가하므로, 그 뒤의 `rfSplitUnit`(613행)과 `RfAddrLookup`은 실행하지 않습니다. 따라서 `정릉로 305) 101동 (` 및 loose/재조회 흐름은 자동 회귀검증 대상이 아닙니다. | `rfSplitUnit`을 직접 평가하는 회귀 테스트와 mocked `jtLookupHousePrice` 기반의 pending·중복 추가 테스트를 추가하십시오. |

## 2. 변경 내역

읽기 전용 검토이므로 변경한 파일은 없습니다.

## 3. 재발 방지

- R19의 에폭 처리 자체는 현재 목록의 stale-closure 문제를 막지만, 중복 항목 방지는 별도 소유자 수준 가드가 필요합니다.
- 테스트는 R19 변경 경로를 실제 실행하지 않습니다.

## 4. 검증 결과

- `git diff --check f8ac043^ f8ac043` → `diff_check_exit=0`
- `git status --porcelain=v1` → 변경 없음.
- `node=absent`라 이 환경에서는 `npm run gate`를 실행할 수 없었습니다.

집중 검토 결론:

- `setPending(null)`은 [661–667행](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:661)에 두는 것이 맞습니다. `busy`면 새 조회가 시작되지 않으며, 보류 확인창과 `busy`가 사용자에게 동시에 남는 경로도 없습니다. 입력 변경 중에는 [779–780행](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:779)에서 에폭 증가와 pending 폐기가 별도로 됩니다.
- 괄호 depth 루프는 `for...of` 코드 포인트 순회여도 안전합니다. 이모지는 한 코드 포인트로 한 번 건너뛸 뿐 ASCII/전각 괄호 판정에 영향을 주지 않습니다. 예: `정릉로 😀 305) 101동 (`은 괄호를 전부 제거합니다.
- 헬퍼는 서버의 `match_quality === 'loose'`와 unit 입력 시 [322–331행](/D:/jt-data/jttax-cta/project/src/ReportProperty.jsx:322)에서 `matched_dong/ho`를 그대로 복사합니다. 서버가 둘 다 빈 값으로 주면 그 경로는 가능합니다. 그러나 세대 식별값이 없으므로 현 거절은 정상적으로 넣어야 할 대상을 막는 동작이 아닙니다.
- `acceptPending`은 렌더된 `pending`이 있을 때만 누를 수 있고 JS 이벤트는 직렬 실행되므로, 일반 UI 경합으로 `pending === null`을 역참조하는 결함은 없습니다.
- 에폭은 상위 컴포넌트 ref가 소유하고 응답 전에 stale 검사를 하며, 목록도 현재 ref에서 읽으므로 R19 대상의 stale 응답·옛 pending 중복은 해소됐습니다.

## 5. 미확인 사항

실제 엔진이 `loose`이면서 `matched_dong`과 `matched_ho`를 모두 비워 반환하는지 여부는 이 저장소에 엔진 구현·실행 환경이 없어 확인할 수 없습니다.
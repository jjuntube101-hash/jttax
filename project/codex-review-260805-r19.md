검토 결과: 내부 코드 기준 P1 1건, P2 2건입니다. `RF_UNIT` 확장 자체의 새 오탐은 제시한 입력들에서는 확인되지 않았습니다.

| 심각도 | 파일:라인 | 구체적 재현 | 수정안 |
|---|---|---|---|
| P1 | [ReportReform2026.jsx:652](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:652), [700](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:700), [712](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:712) | `정릉로 305, 102동 601호` 첫 조회가 loose(`103동 601호`, 4억) → pending 표시. 주소를 고치지 않고 `조회`를 다시 눌러 exact(4.1억)가 오면 4.1억은 목록에 추가되지만 이전 pending은 남습니다. 이어 기존 pending을 승인하면 4억도 추가됩니다. | `runWith`에서 새 요청을 시작할 때 `setPending(null)`으로 이전 보류를 폐기하십시오. `needs_unit`/오류 응답으로 전환할 때도 pending을 명시적으로 비우는 단일 상태 전환이 안전합니다. |
| P2 | [ReportReform2026.jsx:738](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:738) | loose 응답이 `matched: {}`이면 확인 UI는 “찾은 세대 — (동·호 없음)”이고, 승인 라벨은 `pending.base`인 `정릉로 305`가 됩니다. 어느 세대를 승인한 것인지 목록에서 식별할 수 없습니다. | loose 승인 전 `matched.dong || matched.ho`를 필수로 검증하십시오. 없으면 자동 추가·승인 UI 대신 “찾은 세대 식별정보가 없어 금액을 넣지 않았습니다”를 표시하고 재입력/직접입력으로 유도하십시오. |
| P2 | [ReportReform2026.jsx:632](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:632) | `정릉로 305) 101동 (` → `{ addr: '정릉로 305) (', dong: '101', ho: '' }`. 여는·닫는 괄호 수는 각각 1개라 유지되지만 순서가 역전돼 있습니다. | 단순 개수 비교 대신 왼쪽부터 depth를 추적해, 닫는 괄호가 depth 0일 때 나오거나 최종 depth가 0이 아니면 모든 괄호를 제거하십시오. |

확인한 항목입니다.

- `E편한세상`은 추출 없음, `i-Park 101동`은 `dong: "101"`, `THE H 101동`은 `dong: "101"`입니다. 즉 `THE H`의 `H`를 동으로 오인하지 않습니다. `H동`만 단독으로 `dong: "H"`가 되며, 이는 이번에 지원하려는 영문 동 표기와 동일하므로 실제 오탐 근거는 없습니다.
- `b101동 601호`는 `dong: "B101", ho: "601"`으로 전송됩니다. 클라이언트의 단위 정규화도 NFKC 뒤 대문자화합니다([ReportProperty.jsx:268](/D:/jt-data/jttax-cta/project/src/ReportProperty.jsx:268)). 다만 서버 `_exact` 소스는 이 저장소에 없어서 `.upper()` 적용 자체는 직접 검증할 수 없었습니다.
- 주소 재입력은 pending을 즉시 지우고, 문항 이동은 승인되지 않은 pending을 추가하지 않은 채 소거하므로 의도에 맞습니다. 연속 재조회/되묻기 전환에서만 첫 번째 P1이 남습니다.
- 프로젝트 문서상 운영 엔진이 아직 동·호 요청을 무시하는 배포 상태일 수 있습니다([HANDOFF_260804.md:86](/D:/jt-data/jttax-cta/HANDOFF_260804.md:86)). 이는 이번 프런트 수정과 별개인 운영 P1 위험이며, 이번 검토 환경에서는 원격 실측 재확인이 불가했습니다.

검증: PowerShell로 현재 정규식을 동일하게 재현해 위 입력 결과를 확인했고, `git diff --check bfe945b^ bfe945b`는 오류가 없었습니다. Node가 설치되어 있지 않아 기존 JS 테스트 스위트는 실행하지 못했습니다.
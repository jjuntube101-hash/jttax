수렴 — 신규 P0/P1 없음. 다만 다음 P2 2건은 남아 있습니다.

- [P2] · `project/src/ReportAppeal.jsx:270` · AI 전송 실패 뒤의 독립 오류 화면은 `JTReportShell`과 `JT_PRIVACY_NOTE.ai`를 모두 우회한다. · 재현: `window.claude.complete()`가 거부되거나 비정상 응답을 반환하게 한 뒤 진단 실행. · 수정안: 오류 반환을 `dataFlow="ai"` 셸로 감싸거나, 로딩과 같은 AI 고지 문단을 추가.

- [P2] · `project/src/ReportCGT.jsx:1350` · 엔진/AI 처리 뒤의 독립 오류 화면에 입력값 처리 고지가 없다. · 재현: 엔진 또는 AI 후속 분석 실패로 `err` 상태를 만든 뒤 계산 실행. · 수정안: 오류 반환을 기본 `engine` 셸로 감싸거나, 로딩과 같은 엔진 고지 문단을 추가.

정상 입력 화면 17종은 모두 셸 고지, 14개 계산 로딩 경로는 셸 12개·직접 고지 2개로 확인했습니다. 이번 커밋의 `git diff --check HEAD~1..HEAD`는 출력 0이며, `ReportAppeal`·`ReportCGT` SHA-256도 자산 매니페스트와 일치합니다.
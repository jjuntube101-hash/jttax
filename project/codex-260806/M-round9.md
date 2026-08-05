[P2] · `project/src/ReportAppeal.jsx:253` · AI 요청이 진행되는 로딩 반환은 `JTReportShell`과 `JTReportDisclaimer`를 모두 우회합니다. AI 전송 직후 화면에서 고지가 사라집니다. · 재현: `#/report/appeal` 마지막 문항에서 진단 실행. · 수정안: 로딩 반환을 `dataFlow="ai"` 셸로 감싸거나 동일 출처 면책을 렌더링.

[P2] · `project/src/ReportCGT.jsx:1337` · 세액 엔진 호출 중인 로딩 반환이 셸·면책을 모두 우회합니다. 엔진 전송이 시작된 뒤 고지가 없는 화면이 됩니다. · 재현: `#/report/cgt` 입력 완료 후 계산 실행. · 수정안: 로딩 반환을 기본 `engine` 흐름의 `JTReportShell`로 감싸거나 동일 출처 면책을 렌더링.

검증: 자산 버전 SHA-256 불일치 0건. `JT_PRIVACY_NOTE`는 초기 렌더 전 스크립트 평가 중 정의되므로 현재 로드 순서에서 참조 시점은 안전합니다. 일반 결과 화면의 중복 고지는 동일 흐름값으로 일치합니다.
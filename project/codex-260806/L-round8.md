[P2] · [ReportAppeal.jsx:178](/D:/jt-data/jttax-cta/project/src/ReportAppeal.jsx:178), [255](/D:/jt-data/jttax-cta/project/src/ReportAppeal.jsx:255) · `dataFlow="ai"`는 문항 셸에만 적용됩니다. AI 응답을 기다리는 로딩과 결과 화면은 셸을 우회하고, 공통 면책의 입력값 처리 문단도 제거됐으므로 외부 AI 전송 고지가 사라집니다.
재현: `#/report/appeal`에서 문항 완료 후 진단 실행 → 로딩·결과에 AI 전송 고지 없음.
수정안: 결과·로딩(오류 포함)을 `JTReportShell dataFlow="ai"`로 감싸십시오.

[P2] · [ReportCGT.jsx:1139](/D:/jt-data/jttax-cta/project/src/ReportCGT.jsx:1139), [1153](/D:/jt-data/jttax-cta/project/src/ReportCGT.jsx:1153), [1339](/D:/jt-data/jttax-cta/project/src/ReportCGT.jsx:1339) · 양도소득세의 지원불가 결과·일반 결과·로딩·오류 경로가 `JTReportShell`을 우회합니다. 공통 면책에서 해당 문단을 제거한 뒤에는 세액 엔진 전송/AI 이용 고지가 이 경로들에 없습니다.
재현: 양도세 계산 실행 또는 엔진 실패 유도 → 로딩 및 결과 화면에 입력값 처리 고지 없음.
수정안: 해당 모든 반환 경로를 `JTReportShell` 기본 `engine` 흐름으로 통일하십시오.

정적 대조상 나머지 배정은 일치합니다: engine 13종은 모두 `/v1/calc/*` 호출이 있고, appeal은 `fetch` 0·AI 호출 1, reform은 공시가격 조회 헬퍼만, crypto는 외부 호출 0입니다. 자산 버전 해시 불일치도 0건입니다.
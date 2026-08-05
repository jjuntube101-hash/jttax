## 1. 작업 요약

- [P2] · [Report.jsx:178](/D:/jt-data/jttax-cta/project/src/Report.jsx:178), [ReportCrypto2027.jsx:354](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:354), [382](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:382) · 화면은 “입력값이 세액 계산 엔진으로 전송되고 일부 진단은 AI를 이용한다”고 말하지만, 코인 계산기는 `crCalc()`만으로 로컬 계산하며 `fetch`·`JT_ENGINE`·`claude` 호출이 없습니다. 결과 화면에도 같은 오고지가 반복됩니다. · 재현: `#/report/crypto`에서 코인 금액 입력 후 계산. · 수정안: `JTReportShell` 고지를 실제 외부 처리 계산기에만 prop으로 표시하고, 코인 계산기에는 로컬 계산 고지 또는 미표시 처리.

## 2. 변경 내역

읽기 전용 검토로 파일 수정 없음.

## 3. 재발 방지

`JTReportShell` 공통 고지는 “모든 셸 사용자”가 아니라 “외부 엔진/AI 전송 사용자”에만 명시적으로 적용하도록 호출부 계약을 분리해야 합니다.

## 4. 검증 결과

- `git diff HEAD~1..HEAD` 실제 확인: R5 반영 9개 파일, 76 추가/20 삭제.
- 취득·상속·재산세 폴백과 고지 대조: 이번 정정 목록은 코드와 일치. 반대로 미반영 항목을 반영했다고 적은 사례도 없음.
- Web3Forms: 카카오톡은 비-200·네트워크 실패·JSON 파싱 실패·`success !== true` 모두 실패 문구로 이동하며, PDF도 `res.ok && data.success === true`만 성공 처리.
- 일반 계산기의 로딩·결과 화면에서는 공통 고지가 중복되지 않고 위치도 적절함.
- `Get-FileHash`로 수정 5개 JS 파일과 `asset_versions.json` SHA-256 일치, `index.html` 쿼리 버전도 일치.
- `git diff --check` 오류 없음.
- `npm run gate`는 이 환경에 Node가 없어 독립 재실행하지 못함.

## 5. 미확인 사항

제공된 브라우저 실측(17종)과 gate 통과 결과는 재현하지 못했습니다.
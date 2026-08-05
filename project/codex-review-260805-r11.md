신규 P0/P1은 **0건**입니다. `crCalc`의 250만원은 과세최저한 판정과 과표 공제에 각각 필요한 동일 기준금액으로, 이중 차감이 아닙니다. `rfCalcCRE`도 80% 비율 한도 후 금액 한도, 순 종부세 기준 농특세 20% 순서가 맞습니다(농특세법 §5의 과표는 납부할 종부세액). [국가법령정보센터](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1032879999)

## 1. 작업 요약

SSOT 적용 경계, 가상자산 공제, 종부세 공제·농특세, 입력 검증 및 표시 단위를 재검토했습니다.

## 2. 지적 사항

- [P2] · [ReportReform2026.jsx:26](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:26), [28](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:28), [736](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:736) · 1억원 미만 금액을 만원 단위 정수로 반올림해, 보조 표기가 실제 입력액보다 커질 수 있습니다. 재현 입력값: 양도가액에 `99,995,000` 입력. 잘못된 출력: `= 10,000만원`; 실제는 `99,995,000원 = 9,999.5만원`입니다. 수정안: 만원 표기는 소수 첫째 자리까지 보존하거나, 반올림된 요약임을 명시하고 정확한 원화도 같은 위치에 병기하십시오.

## 3. 재발 방지

`rfEok`에 99,995,000원·99,999,999원·100,000,000원 경계 스냅샷 테스트를 추가해야 합니다.

## 4. 검증 결과

- `rfEok(99,995,000) = 10,000만원`, 정확값 `9,999.5만원`을 PowerShell로 직접 재현했습니다.
- 최근 R10 수정의 2년 보유 중과 완화 분기와 CASE 15를 확인했습니다.
- `git diff --check HEAD^ HEAD` 통과.
- `node=unavailable`이라 `project/tests_rf_reform2026.js` 실행은 불가했습니다.

## 5. 미확인 사항

None.
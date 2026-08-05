## 1. 작업 요약

R13 반영과 지정 조합을 재검토했습니다. 신규 P0은 0건, 신규 P1은 1건입니다. 따라서 수렴 카운트는 진행되지 않습니다.

## 2. 변경 내역 / 발견 결함

- [P1] · [Home.jsx:142](/D:/jt-data/jttax-cta/project/src/Home.jsx:142) · R13 자동 치환이 기존 버튼 속성과 병합되어 같은 `<a>`에 `role`, `tabIndex`, `onKeyDown`이 각각 두 번 선언됐습니다.  
  재현 입력값: 초기 홈 진입(`/#/`, 별도 입력 없음). 잘못된 출력: Babel JSX 변환에서 중복 attribute 오류가 나 `JTReportHome`이 정의되지 않고, 기본 홈 화면은 렌더링되지 않습니다.  
  수정안: 이 CTA는 상태 전환·추적을 수행하는 버튼이므로 `<button type="button">`으로 교체하거나, 앵커를 유지한다면 기존 `role="button"`, `tabIndex`, 인라인 `onKeyDown` 중 하나의 세트만 남기십시오. `role="link"`와 `role="button"`을 함께 두면 안 됩니다.

## 3. 재발 방지

JSX 전체에 대해 동일 opening tag 내 중복 prop을 검출하는 정적 검사와 Babel 변환 smoke test를 추가해야 합니다.

## 4. 검증 결과

- `rg 'role="link".*role=|tabIndex=\{0\}.*tabIndex=|onKeyDown=\{window\.jtKeyActivate\}.*onKeyDown=' project/src` 결과: `Home.jsx:142` 한 건 확인.
- 세액 재검산: 1주택·조정·1.5년 보유, 양도 12억/취득 1억이면 과표 10억9,750만원, 단기 60%=6억5,850만원, 지방세 6,585만원, 합계 7억2,435만원으로 코드 경로와 일치했습니다.
- 비조정 다주택 2028 선택공제, 종부세 다주택 공제 경계(4억~9억), 가상자산 보유 전후 혼합 및 손실 상계식도 코드상 산식 오류를 발견하지 못했습니다.
- Node/Babel 실행기는 환경에 없어 자동 테스트 실행은 불가했습니다(`node` 명령 미존재).

## 5. 미확인 사항

없음.
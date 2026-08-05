## 1. 작업 요약

신규 P0는 0건, 신규 P1은 2건입니다. 목록 모델은 기본적인 빠른 재조회는 에폭으로 막지만, 목록 변경·결과 화면 복귀에서 이전 목록을 다시 쓰거나 잃어버립니다.

## 2. 지적 사항

- [P1] · [ReportReform2026.jsx:752](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:752), [797](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:797), [661](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:661) · B 조회가 진행 중일 때 A를 「빼기」하면, B 응답의 `onAdd`가 조회 시작 당시 캡처한 `picks`(A 포함)를 사용합니다. A가 다시 살아납니다.

  재현: 1주택·거주·50세·보유 1년·거주 0년에서 A 주소(공시가 10억)를 조회한 뒤, B 주소(20억)를 조회합니다. B가 “조회 중”인 동안 A의 「빼기」를 누르고 B 응답을 받습니다. 기대 목록/합계는 B만 남은 20억이나, 실제는 A+B인 30억입니다. 2026년 표시세액은 실제 **10,080,000원**입니다: `(30억−12억)×60%=10.8억`, 종부세 840만원 + 농특세 168만원. 정답은 B만의 `(20억−12억)×60%=4.8억`, 종부세 276만원 + 농특세 55.2만원 = **3,312,000원**입니다.

  수정안: `picks`를 콜백 클로저가 아닌 ref 또는 단일 reducer의 현재 상태에서 읽으십시오. `onAdd`·`onRemove` 모두 같은 원자적 갱신으로 목록과 파생 `answers[id]`를 함께 갱신해야 합니다.

- [P1] · [ReportReform2026.jsx:742](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:742), [1050](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:1050), [1145](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:1145) · 결과 화면에서 「조건 바꿔서 다시 계산」을 누르면 `RfWizard`가 언마운트되어 `picks`는 `{}`로 초기화되지만, 부모 `answers.totalValue`는 이전 목록 합계를 유지합니다. 이후 주소를 하나 조회하면 기존 합계에 더하는 대신 새 주소 하나의 금액으로 덮어씁니다.

  재현: 2주택으로 A·B 각 10억을 조회해 합계 20억으로 계산합니다. 결과에서 「조건 바꿔서 다시 계산」을 누르고 주택 수를 3채로 바꾼 뒤 C(10억)를 조회합니다. 새 위저드의 목록은 비어 있으므로 실제 출력 합계는 **10억**입니다. 2026년 3주택 세액은 **360,000원**입니다. 실제 보유가액 30억의 정답은 `(30억−9억)×60%=12.6억`, 종부세 1,080만원 + 농특세 216만원 = **12,960,000원**입니다.

  수정안: `picks`를 `JTReportReformCRE` 같은 결과 화면 밖 부모로 올려 재계산 복귀에도 보존하십시오. 보존하지 않을 정책이면 복귀 시 `answers.totalValue`도 비우고 다시 입력하도록 해야 합니다.

- [P2] · [ReportReform2026.jsx:589](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:589), [601](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:601), [693](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:693), [759](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:759), [630](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:630) · `regionTo`는 `onAdd=null`이라 목록을 건드리지 않는 점은 안전합니다. 그러나 조정대상지역 문항은 조회 시작 때 `adjusted` 에폭을 올리고, 응답의 `onRegion`도 `onChangeTracked('adjusted', ...)`로 같은 에폭을 한 번 더 올립니다. 따라서 `finally`가 stale로 판단해 `busy=false`를 수행하지 않습니다.

  재현: 양도세의 「파는 집이 조정대상지역인가요?」에서 지역 정보를 반환하는 주소를 조회합니다. 지역 값은 설정되지만 버튼이 계속 **“조회 중…”** 및 비활성 상태로 남아 재조회할 수 없습니다. 기대 출력은 조회 완료 후 활성화된 「조회」 버튼입니다.

  수정안: 응답에서 확정한 `regionTo` 갱신은 에폭을 증가시키지 않는 자동 갱신 경로로 분리하십시오. 또는 현재 요청을 완료 처리한 뒤에만 해당 상태를 반영하십시오.

`rfCalcCRE`와 `crCalc` 본체도 다시 읽었습니다. 위 목록 상태 오류를 제외하고, 이번 범위에서 추가적인 직접 산식 P0/P1은 확인하지 못했습니다. 가상자산의 `lines` 기반 문구 판정도 R6 수정대로 전량 이후취득·혼합 보유를 구분합니다.

## 3. 재발 방지

- A 삭제 중 B 응답, 결과→조건변경→C 추가의 UI 회귀 테스트를 추가하십시오.
- 지역 조회 완료 후 버튼 활성화 테스트를 추가하십시오.
- 목록과 `answers`를 별도 상태로 복제하지 말고 reducer/ref 기반 단일 원천으로 관리하십시오.

## 4. 검증 결과

- `git show e3a13fd`로 R6 변경을 확인했습니다.
- `git diff --check e3a13fd^ e3a13fd`는 코드 오류 없이, 기존 리뷰 Markdown의 trailing whitespace 1건만 보고했습니다.
- 2026 종부세 재현값은 소스의 공제·60% 비율·누진표·농특세 20%를 직접 적용해 검산했습니다: 20억 3,312,000원, 30억 10,080,000원, 3주택 10억 360,000원, 3주택 30억 12,960,000원.
- `node project/tests_rf_reform2026.js; node project/tests_cr_crypto2027.js`는 이 환경에 `node` 실행 파일이 없어 실행되지 않았습니다.

## 5. 미확인 사항

Node 부재로 기존 51건 자동 검산은 이 환경에서 재실행하지 못했습니다.
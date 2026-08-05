## 1. 작업 요약

R17 반영 후 코드를 읽어 검토했습니다. R17의 전각 괄호·반복 빈 괄호·`unit_not_found` 처리 자체는 해결됐지만, P1 1건·P2 2건·P3 1건이 남았습니다.

## 2. 발견 내역

| 심각도 | 위치 | 재현 시나리오 | 수정안 |
|---|---|---|---|
| P1 | [ReportReform2026.jsx:683](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:683) | 헬퍼가 `{status:'ok', amount:411000000, loose:true, asked:{dong:'102',ho:'601'}, matched:{dong:'103',ho:'601'}}`를 반환하면, 경고를 표시하기 전 `onAdd`가 실행됩니다. 목록에는 요청값인 `102동 601호` 라벨로 103동 금액이 확정되고 입력도 비워집니다. | `loose`면 `pendingLoose` 상태에 보관하고, 찾은 세대와 금액을 보여 준 뒤 사용자의 “이 세대로 추가” 확인에서만 `onAdd`를 호출하십시오. 추가 라벨도 `matched` 기준으로 남겨야 합니다. `ok:false`는 색상만 바꿀 뿐 확정 삽입을 막지 못합니다. |
| P2 | [ReportReform2026.jsx:606](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:606) | `서울 … 자이Ⅱ 101동 601호` → 헬퍼에는 `서울 … 자이II`가 전달됩니다. 동일하게 `㎡→m2`, `㈜→(주)`, `①→1`, `Ⅲ→III`, 반각 카타카나→전각 카타카나로 주소 본문이 바뀝니다. `번지` 자체는 변하지 않습니다. | 주소 전체에는 NFKC를 적용하지 말고, 전각 괄호·숫자를 포함하도록 단위 추출 정규식을 확장한 뒤 **캡처된 동·호만** NFKC 하십시오. 원래 주소 문자열은 보존해야 합니다. |
| P2 | [ReportReform2026.jsx:613](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:613) | `정릉로 305 B동 601호`는 `{ addr:'정릉로 305 B동', dong:'', ho:'601' }`가 됩니다. `B동`은 `([A-Za-z]?\d+)`에서 문자 뒤 숫자가 필수라 추출되지 않습니다. 공통 헬퍼는 문자 동 값도 지원합니다. | 동·호 토큰을 `((?:[A-Za-z]\\d*|\\d+)(?:-\\d+)?)`처럼 바꿔 `B동`, `A101동`, `101-1동`을 모두 분리하십시오. |
| P3 | [ReportReform2026.jsx:620](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:620) | `정릉로 305((101동 601호)`는 동·호 제거 후 한 쌍만 정리되어 `정릉로 305(`가 조회 주소로 전달됩니다. 닫는 괄호가 하나 많은 경우도 반대로 잔존합니다. | “추출한 동·호만 들어 있던 괄호 그룹”을 구조적으로 제거하거나, 그 범위에서만 잔여 괄호를 정리하십시오. 단지명 괄호는 보존해야 합니다. |

## 3. 재발 방지

`rfSplitUnit`을 JSX 밖 순수 함수로 두고 다음 회귀 테스트를 추가해야 합니다: 전각 단위, `자이Ⅱ`·`84㎡` 보존, `B동`, 쉼표·중첩·불균형 괄호. 또한 `loose` 응답은 확인 전 `onAdd`가 호출되지 않는 컴포넌트 테스트가 필요합니다.

## 4. 검증 결과

- `git diff --check -- project/src/ReportReform2026.jsx project/src/ReportProperty.jsx` → 오류 없음.
- PowerShell FormKC 실측: `㎡→m2`, `Ⅱ→II`, `Ⅲ→III`, `㈜→(주)`, `①→1`, `번지→번지`.
- 헬퍼 반환 경로 전수 확인: loose `ok`와 일반 `ok`는 모두 `matched` 객체를 생성합니다([ReportProperty.jsx:322](/D:/jt-data/jttax-cta/project/src/ReportProperty.jsx:322), [ReportProperty.jsx:333](/D:/jt-data/jttax-cta/project/src/ReportProperty.jsx:333)). 호출부도 `r.matched || {}`로 방어하므로 `r.matched === undefined` 예외는 **없음**.
- `node`/`npm` 실행 파일이 환경에 없어 자동 테스트는 실행하지 못했습니다.

`unit_not_found`는 제공된 note를 그대로 표시하고, 0을 “0세대”로 노출하지 않으며, 해당 분기 전에는 `onAdd`가 없습니다. `finally`에서 busy도 해제되므로 picks·epoch·busy의 추가 불일치는 **없음**입니다. `mode==='region'`도 `onRegion(reg)`를 먼저 호출한 뒤 세대 질문만 생략하므로 조정대상지역 판정·안내 오류는 **없음**입니다. 반복 치환은 매칭 시 문자열 길이가 반드시 줄고, 미매칭 시 즉시 종료되므로 무한 루프 입력은 **없음**입니다.

## 5. 미확인 사항

NFKC로 바뀐 `자이Ⅱ` 등이 실제 엔진 DB에서 조회 실패하는지는 엔진 실행 환경 부재로 확인하지 못했습니다. 다만 프런트엔드가 원문과 다른 주소를 헬퍼에 전달한다는 사실은 코드와 정규화 실측으로 확인했습니다.
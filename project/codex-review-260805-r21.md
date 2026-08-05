## 1. 작업 요약

c66fd82의 주소 파서 회귀 테스트와 `npm test` 편입을 읽기 전용으로 검토했습니다. 현재 30개 기대값과 실패 전파는 대체로 엄격하지만, 전각 입력 및 추출 대상 식별에 중요한 회귀 공백이 있습니다.

## 2. 발견사항

| 심각도 | 위치 | 구체적 재현 | 수정안 |
|---|---|---|---|
| P2 | [tests_rf_addr.js](/D:/jt-data/jttax-cta/project/tests_rf_addr.js:29) | `indexOf` 절단은 첫 텍스트 일치만 사용합니다. 미래에 `RfAddrLookup` 뒤에 같은 이름의 `function rfSplitUnit`가 추가되면, 테스트는 앞의 구 구현만 eval해 통과하지만 브라우저 스크립트는 뒤 선언을 사용해 실패할 수 있습니다. | 순수 함수를 별도 공용 JS 모듈로 분리해 브라우저와 Node가 같은 export를 사용하게 하십시오. 최소한 AST로 최상위 `rfSplitUnit` 선언이 정확히 1개인지 확인하고, 중복이면 실패시키십시오. |
| P2 | [tests_rf_addr.js](/D:/jt-data/jttax-cta/project/tests_rf_addr.js:66), [ReportReform2026.jsx](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:610) | 전각 숫자를 지원한다고 테스트하지만 전각 쉼표 `，` 및 전각 하이픈 `－`은 빠졌습니다. `정릉로 305，１０２동 ６０１호`는 `dong=''`, `ho='601'`, 주소에 `，１０２동`이 남습니다. `１０１－１동`도 동을 못 뽑습니다. | `，`을 경계·정리 정규식에, `－`을 동 번호 하이픈 허용 문자에 추가하고 두 입력을 회귀 케이스로 넣으십시오. |
| P3 | [tests_rf_addr.js](/D:/jt-data/jttax-cta/project/tests_rf_addr.js:55) | 모든 호 추출 케이스에 동이 함께 있습니다. `정릉로 305 601호`가 `addr='정릉로 305', dong='', ho='601'`으로 전달되는 핵심 단독-호 경로는 회귀 보호되지 않습니다. | 호 단독, `제 101동`(접두 뒤 공백), `101동·601호` 같은 실무 구분자 케이스를 추가하십시오. |

판정 확인:

- `제101동 601호 어딘가로 12`의 기대값 `addr='어딘가로 12', dong='101', ho='601'`은 현재 함수 순서상 맞습니다.
- `서울 강남구 e편한세상 101동`도 `e` 뒤에 즉시 `동`이 없으므로 `e`를 동으로 오인하지 않고, 기대값이 맞습니다.
- 빈 문자열과 공백만 입력의 기대값도 `trim()` 처리에 맞습니다.
- `강남대로78길 22, 5층 → 강남대로78길 22 5층`은 현재 파서의 정확한 기대값입니다. 다만 [ReportReform2026.jsx](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:674)는 이 문자열을 그대로 엔진에 보내며, 이 단위 테스트에는 엔진 수용성을 증명하는 fixture/E2E가 없습니다.

## 3. 재발 방지

마커 부재·역전은 현재 [tests_rf_addr.js](/D:/jt-data/jttax-cta/project/tests_rf_addr.js:31)에서 `process.exit(1)`로 실패합니다. 현재 절단 범위는 소스 605–643행이며 JSX나 다른 최상위 선언 없이 상수와 `rfSplitUnit`만 포함합니다. 다만 텍스트 마커 방식 자체는 중복 선언·잘못된 첫 일치까지 방어하지 못합니다.

## 4. 검증 결과

- `package.json`의 `test` 체인은 `jsx_smoke && rf_addr && rf_reform2026 && crypto` 순서로 올바르게 편입되어 있습니다. `&&`와 마지막 `process.exit(fails ? 1 : 0)`은 실패를 npm에 전파합니다.
- 대상 커밋에서 마커는 `RF_D` 605행, `RfAddrLookup` 644행으로 확인했습니다.
- `node project/tests_rf_addr.js` 및 `npm test` 실행은 이 환경에 `node`/`npm` 실행 파일이 없어 불가했습니다 (`node … 인식되지 않습니다`).

## 5. 미확인 사항

실제 `/v1/lookup/price`가 공백화된 `강남대로78길 22 5층`을 수용하는지는 이 커밋의 단위 테스트와 로컬 실행 환경만으로 검증할 수 없습니다.
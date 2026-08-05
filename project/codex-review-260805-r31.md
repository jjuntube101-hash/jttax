## 1. 작업 요약

R30 반영본의 실제 diff와 변경 4개 파일을 UTF-8로 검토했다. 1번(공개 계산함수 중복 거부)은 수렴했으나, 2번 별칭 우회는 여전히 계산 오류를 낸다.

## 2. 발견

- [P2] [ReportCrypto2027.jsx:167](D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:167) · 종목 중복 키가 자유 입력 이름뿐이라 `BTC`와 `비트코인` 별칭은 계속 우회한다. 경고 문구([299](D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:299), [473](D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:473))는 계산을 막거나 재확인하지 않는다.

  재현 입력값:

  ```js
  [
    { name: 'BTC',      sale: '100000000', acq: '',         heldBefore: 'no', estimate: 'yes' },
    { name: '비트코인', sale: '100000000', acq: '90000000', heldBefore: 'no' }
  ]
  ```

  현재 계산값은 소득 60,000,000원, 총세액 **12,650,000원**이다. 같은 종목으로 한 줄에 합쳐 추계를 적용하면 필요경비 100,000,000원, 소득 100,000,000원, 총세액은 **21,450,000원**이다. 즉 **8,800,000원 과소**다.

  수정안: 내장 티커 목록은 필요 없다. 두 줄 이상일 때만 사용자가 입력하는 `종목 식별값`(홈택스 가상자산 종류 코드 + 심볼)을 필수화하고 `crNameKey` 대신 이를 중복키로 써라. 목록 밖 자산도 막지 않도록 미등재 자산은 `999999:심볼:네트워크` 같은 자유 식별값을 받으면 된다. 신고 서식도 홈택스의 종류 코드 조회를 안내하고, 목록 밖 자산에는 `999999` 코드를 둔다. [국가법령정보센터 시행규칙 서식 안내](https://www.law.go.kr/flDownload.do?bylClsCd=110202&flSeq=157673945&gubun=) 이 방식이면 내부 목록 갱신 문제 없이 별칭 실수를 실질적으로 줄인다.

## 3. 재발 방지

위 식별값을 `crDuplicateName`과 `jtCrCalc` 양쪽 불변식에 사용하고, `BTC`/`비트코인`이 같은 식별값일 때 거부하는 회귀 테스트를 추가해야 한다.

## 4. 검증 결과

- `crCalc`의 중복 거부 객체는 결과 화면이 읽는 `lines`, `total`, `belowMinimum`, `canSellIn2026` 등을 모두 가진다. 일반 UI 경로에서는 [crValidateRows](D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:185)가 버튼을 비활성화하므로 중복 오류 객체가 결과 화면에 도달하지 않는다. **R30 1번 신규 발견 없음 — 수렴.**
- R23~R29 반영 범위(금액 파서, Enter, 연도 이동, 음수 클램프, 절사 표시, 고령 특례, 접근성)를 변경 코드와 회귀 테스트에서 확인했다. 이번 변경으로 되살아난 회귀는 발견하지 못했다. **신규 발견 없음 — 수렴.**
- `git diff --check`: 공백 오류 출력 없음.
- 직접 테스트 실행은 불가했다. 이 환경에서 `node`가 설치되지 않아 `node project/tests_cr_crypto2027.js` 및 `node project/tests_rf_reform2026.js`가 “인식되지 않습니다”로 종료됐다.

## 5. 미확인 사항

`npm run gate`의 독립 재실행은 Node 부재로 검증하지 못했다.
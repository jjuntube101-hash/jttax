## 1. 작업 요약

신규 발견 2건입니다. R29의 고령 감면 3중 방어는 서로 충돌하지 않으며, `stillLiving` 미지정도 기존처럼 허용됩니다. 거주기간을 0으로 낮췄다가 복원하면 `seniorLive2y='no'` 상태로 질문이 다시 표시됩니다. 코인명 `aria-label`도 추가돼 있습니다.

## 2. 발견

- **[P1] [ReportCrypto2027.jsx](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:160) · 자유입력 코인명의 별칭을 이용하면 동일 종목 2줄 차단을 우회합니다.**  
  `BTC`와 `비트코인`, `ETH`와 `Ethereum`은 서로 다른 key로 처리됩니다.  
  재현 입력:  
  1) `BTC`, 매도 100,000,000원, 2027년 이후 취득, 추계 `yes`  
  2) `비트코인`, 매도 100,000,000원, 취득 90,000,000원, 2027년 이후 취득  
  검증은 통과하고 현재 출력은 필요경비 140,000,000원, 총세액 **12,650,000원**입니다. 같은 종류 전체 매도가액 200,000,000원에 50% 추계를 적용해야 하는 전제에서는 필요경비 100,000,000원, 총세액 **21,450,000원**이 맞습니다.  
  수정안: 자동합산 대신 입력 단계 강제라는 접근은 타당하나, 이름이 아니라 선택형 `assetId`/표준 티커로 중복을 판정해야 합니다. 별칭 표시는 별도 label로 두십시오. 신고 서식도 이용자별·가상자산 종류별 연간 거래를 합산하도록 요구하므로, “종목당 한 줄” 원칙 자체는 맞습니다. [국가법령정보센터 별지 제30호의4서식](https://www.law.go.kr/flDownload.do?bylClsCd=110202&flSeq=150295441&gubun=)

- **[P2] [ReportCrypto2027.jsx](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:93) · 공개된 `window.jtCrCalc`가 `crValidateRows()`를 전혀 호출하지 않아, 같은 이름의 중복 행도 직접 호출로 계산됩니다.**  
  재현 입력: 위와 동일하되 두 행 모두 이름을 `비트코인`으로 설정하여 `window.jtCrCalc({ rows })` 호출. UI에서는 [292행](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:292)의 검증으로 막히지만, 공개 계산 함수는 그대로 **12,650,000원**을 반환합니다. 올바른 종목 단위 처리 전제의 세액은 **21,450,000원**입니다.  
  수정안: `crCalc` 진입 시 중복 종목 불변식을 검사하여 오류 결과를 반환하거나, 외부 공개를 제거하고 검증을 거친 함수만 호출하게 하십시오. 현재 CASE 13b는 `jtCrValidateRows`만 검사하므로 별칭 및 `jtCrCalc` 우회 회귀를 잡지 못합니다.

## 3. 재발 방지

CASE 13b에 다음 두 회귀를 추가해야 합니다.

- `BTC`/`비트코인` 같은 동일 `assetId` 중복 거부
- 동일 명칭 중복 rows를 `window.jtCrCalc`에 직접 전달했을 때 계산 거부

## 4. 검증 결과

- `git diff --check -- project/src/ReportCrypto2027.jsx project/src/ReportReform2026.jsx project/tests_cr_crypto2027.js project/tests_rf_reform2026.js` → 오류 없음.
- PowerShell로 재현 산식 검산 → `wrong=12650000 right=21450000`.
- `Get-Command node,npm` → 출력 없음. 루트 `package.json`의 `gate`는 Node 실행을 요구하므로 이 환경에서는 독립 실행 검증을 할 수 없었습니다.

## 5. 미확인 사항

`npm run gate`는 Node/npm 부재로 이 환경에서 재실행하지 못했습니다.
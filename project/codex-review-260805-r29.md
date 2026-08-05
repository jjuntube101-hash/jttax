신규 발견 3건.

- [P1] [ReportCrypto2027.jsx:107](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:107) · §37⑥를 행별로 적용했습니다. 법문은 “같은 종류의 가상자산 전체의 총양도가액” 기준인데, 종목명은 자유 입력이고 계산에는 전혀 쓰지 않아 같은 BTC를 두 행으로 나누면 과소세액입니다.  
  재현: BTC ① 매도 1억·취득가 증빙불가·추계 선택, BTC ② 매도 1억·실제 취득가 9천만. 현재 필요경비 1.4억, 총세액 **12,650,000원**. 같은 종류 전체 양도가액 2억 × 50%면 필요경비 1억, 총세액은 **21,450,000원**입니다.  
  수정안: 종목 식별자를 필수화하고 같은 종목별로 합산한 뒤 §37⑥ 적용 여부와 필요경비를 종목 단위로 계산하거나, 최소한 중복 종목 행을 막고 “한 종목당 한 행에 연간 합계”를 강제해야 합니다.

- [P1] [ReportReform2026.jsx:1153](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:1153) · `stillLiving='no'`(이미 이사)와 `seniorLive2y='yes'`(양도일 현재 계속거주)를 동시에 선택할 수 있어 2027년 고령 감면이 부당 적용됩니다.  
  재현: 양도가 20억, 취득가 10억, 1주택, 보유·거주 각 5년, 현재 64세, `stillLiving=no`, `seniorMove=yes`, `seniorLive2y=yes`. 2027 카드에서 나이 65세로 이동해 감면을 적용하여 **35,326,500원**이 나옵니다. 이미 이사한 상태에서는 2027년 양도일 현재 2년 계속거주를 충족할 수 없으므로 감면 없는 **70,653,000원**이 맞습니다.  
  수정안: `seniorLive2y` 표시·선택 조건에 `stillLiving === 'yes'`를 포함하고, `stillLiving=no`로 바뀌면 기존 `seniorLive2y` 값을 `no`로 초기화하십시오.

- [P3] [ReportCrypto2027.jsx:195](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:195) · 코인명 입력칸만 `aria-label` 또는 연결된 `<label>`이 없습니다. 이번 접근성 수정의 “입력에 aria-label”이 완결되지 않았습니다.  
  수정안: `aria-label={'코인 ' + (i + 1) + ' 종목명'}`을 추가하십시오.

회귀 테스트도 위 P1 두 건을 잡지 못합니다. [tests_cr_crypto2027.js:134](/D:/jt-data/jttax-cta/project/tests_cr_crypto2027.js:134)는 단일 행 추계만, [tests_rf_reform2026.js:252](/D:/jt-data/jttax-cta/project/tests_rf_reform2026.js:252)는 정상적인 `stillLiving=yes` 이동만 검증합니다. 위 재현값을 각각 회귀 케이스로 추가해야 합니다.

그 외 1~8, 10~11, 13번 수정은 코드상 의도대로 반영됐습니다. §37⑥의 50% 및 수수료 불산입, 시행령 §88④의 증빙불가 사유, 종부세법 §9③의 재산세 공제 규정은 법령 MCP 원문으로 대조했습니다. `git diff --check`은 통과했습니다. 다만 `node tests_rf_reform2026.js` 및 `node tests_cr_crypto2027.js`는 이 환경에 `node` 실행 파일이 없어 실행 검증하지 못했습니다.
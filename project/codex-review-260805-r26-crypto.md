신규 발견 4건.

- [P1] · [ReportCrypto2027.jsx:69](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:69) · 과세연도 입력·분리가 없어 서로 다른 연도 거래를 한 해 손익으로 통산한다. 재현: 2027년 행 `매도 10,000,001 / 취득 1`, 2028년 행 `매도 5,000,000 / 취득 10,000,000`(모두 2027년 이후 취득). 현재 출력은 합산 소득 5,000,000원, 총세액 550,000원이다. 올바른 연도별 계산은 2027년 소득 10,000,000원→1,650,000원, 2028년 손실→0원, 합계 1,650,000원으로 1,100,000원 과소 계산된다. 수정안: 과세연도를 단일 필수값으로 받고 각 거래일/연도를 검증하거나, 연도별 결과를 완전히 분리한다.

- [P2] · [ReportCrypto2027.jsx:82](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:82), [298](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:298) · 같은 코인명을 두 행에 넣으면 결과가 두 개의 동일한 “비트코인 필요경비”로만 표시되어 거래별 매도·손익을 추적할 수 없다. 재현: `비트코인` 행① 매도 5,000,000/취득 3,000,000, 행② 매도 6,000,000/취득 1,000,000. 총소득 7,000,000원·정상 총세액 990,000원은 맞지만, 현재 출력은 `비트코인 필요경비 −3,000,000원`, `비트코인 필요경비 −1,000,000원`뿐이라 어느 거래인지 검증 불가다. 수정안: 행 ID·거래번호를 결과에 함께 표시하고, 중복 코인명은 경고하거나 “동일 코인의 별도 취득분”으로 명시한다.

- [P2] · [ReportCrypto2027.jsx:294](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:294), [316](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:316), [styles/redesign.css:675](/D:/jt-data/jttax-cta/project/src/redesign.css:675) · 320px 화면에서 긴 코인명과 큰 금액이 함께 있으면 결과 행의 코인명/설명 영역이 잘리거나 금액 영역과 충돌한다. 재현: 코인명 `비트코인국내거래소와해외지갑분산보유분2027년1월취득`, 매도 50,000,000/취득 10,000,000이면 정상 세액은 8,250,000원이지만, 결과의 해당 필요경비 행은 `keep-all`·고정 줄 금액·상위 `overflow:hidden` 조합으로 식별 문구가 온전히 보이지 않는다. 수정안: 360px 이하에서 계산 행을 세로 스택으로 전환하고, 코인명/주석에 `overflow-wrap:anywhere` 또는 말줄임+전체명 접근 수단을 둔다.

- [P3] · [ReportCrypto2027.jsx:349](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:349), [355](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:355), [styles.css:2806](/D:/jt-data/jttax-cta/project/src/styles.css:2806) · 인쇄 시 결과와 무관한 “조건 바꿔서 다시 계산”, 다른 계산기 카드, 상단 “세금 계산기” 버튼이 함께 출력된다. 위 50,000,000/10,000,000 재현의 올바른 인쇄 핵심값은 총세액 8,250,000원인데, 현재 출력물에는 탐색·상호작용 UI도 섞인다. 수정안: 인쇄 전용 클래스 부여 후 결과 본문·면책만 남기고 `.jt-report-shell__head`, 결과 하단 조작 버튼, 추천 계산기 섹션을 숨긴다.

확인 결과: 정확히 2,500,000원은 [≤ 분기](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:93)로 비과세 처리되며, `rate=0.20`과 지방소득세 10% 계산·화면의 22% 문구도 일치한다. 20행은 `filter/map/reduce` 단일 순회 수준이라 별도 성능 결함은 발견하지 못했다.

검증: UTF-8 `Get-Content`로 대상·공통 셸·CSS를 실제 열람했고 `rg -n`으로 인쇄·반응형 규칙을 대조했다. `node tests_cr_crypto2027.js`는 이 환경에 Node가 없어 실행 불가했다. 수정은 하지 않았다.
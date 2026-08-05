## 1. 작업 요약

신규 P0는 0건, 신규 P1은 2건입니다. 따라서 수렴 조건은 충족하지 못했습니다.

## 2. 발견 결함

- [P1] · [Home.jsx](/D:/jt-data/jttax-cta/project/src/Home.jsx:229), [362](/D:/jt-data/jttax-cta/project/src/Home.jsx:362), [478](/D:/jt-data/jttax-cta/project/src/Home.jsx:478), [526](/D:/jt-data/jttax-cta/project/src/Home.jsx:526) · R12 대상과 같은 href 없는 라우팅 `<a>` 4개가 키보드 접근성 없이 남아 있습니다.  
  재현: Tab으로 홈을 탐색해 “내 사안 적용 여부 상담하기”, “전체 업무분야”, “전체 보기”, “전체 구성원 보기”에 도달하려 합니다.  
  잘못된 출력: 포커스되지 않아 Enter/Space 입력으로 각각 `#/booking`, `#/services`, `#/insights`, `#/about` 이동이 불가능합니다. 마우스 클릭만 동작합니다.  
  수정안: 각 앵커에 R12와 동일하게 `tabIndex={0}`, `role="link"`, `onKeyDown={jtKeyActivate}`를 추가하거나, 라우팅용 `<button>`으로 교체하십시오.

- [P1] · [Pages2.jsx](/D:/jt-data/jttax-cta/project/src/Pages2.jsx:177), [Pages2.jsx](/D:/jt-data/jttax-cta/project/src/Pages2.jsx:361) · 개인정보 수집 동의문이 실제 Web3Forms 전송 항목과 법정 고지 항목을 충족하지 않습니다.  
  재현 입력값: `성명=홍길동`, `연락처=010-1234-5678`, `이메일=a@b.com`, `회사=(주)JT`, `문의내용=양도 10억원 상담`. 동의 후 제출합니다.  
  잘못된 출력: 요청 JSON에는 `회사`, `문의분야`, `선호채널`, `문의내용`까지 전송되지만 동의문은 성명·연락처·이메일만 열거하며, 보유기간과 동의 거부권·거부 시 불이익도 표시하지 않습니다. 동의를 근거로 수집하는 경우 목적·항목·보유기간·거부권 고지가 필요합니다. [개인정보 보호법 제15조 제2항](https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900079620)  
  수정안: 체크박스 옆에 목적, 실제 전송 전 항목, `상담 종료 후 3년`, 거부권 및 “거부 시 상담 접수 불가”를 명시하고 개인정보처리방침으로 연결하십시오.

- [P2] · [styles.css](/D:/jt-data/jttax-cta/project/src/styles.css:2801), [redesign.css](/D:/jt-data/jttax-cta/project/src/redesign.css:928) · 인쇄 규칙이 고정 로고 `.jt-logomark-fix`를 숨기지 않습니다.  
  재현: 데스크톱 폭에서 2쪽 이상인 리포트 결과를 인쇄합니다.  
  잘못된 출력: 좌하단 고정 로고가 인쇄 페이지 하단에 겹치거나 반복됩니다.  
  수정안: `@media print`의 숨김 목록에 `.jt-logomark-fix`를 추가하십시오.

## 3. 재발 방지

href 없는 `<a>` 및 클릭 가능한 비시맨틱 요소를 검사하는 정적 테스트를 추가하고, 동의문 텍스트와 전송 payload 필드를 대조하는 테스트를 두십시오.

## 4. 검증 결과

- slug 검사: 계산기 30개·인사이트 31개, 정규식 위반 0개.
- R12 GA 설정 확인: SPA의 `send_page_view: false`와 수동 `page_location` 전송이 존재합니다.
- href 없는 인터랙티브 앵커 정적 검사: 위 Home.jsx 4개를 확인했습니다.
- Web3Forms access key는 공급사 문서상 클라이언트 공개를 전제로 하므로 비밀키 노출로 판정하지 않았습니다. [Web3Forms FAQ](https://docs.web3forms.com/getting-started/faq)
- `node`가 없어 `tests_rf_reform2026.js`, `tests_cr_crypto2027.js`는 재실행하지 못했습니다. R12 diff에는 `Report*.jsx`·`lawValues.jsx` 변경이 없어, R12가 새 세액 오류를 만들었다는 증거는 없습니다.

## 5. 미확인 사항

기존 세액 검산 스위트의 현 상태는 Node 런타임 부재로 독립 재실행하지 못했습니다.
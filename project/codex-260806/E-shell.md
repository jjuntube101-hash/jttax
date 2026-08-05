## 1. 작업 요약

읽기 전용으로 지정 4개 파일·`index.html`을 UTF-8로 확인했다. 수정은 하지 않았다.

## 2. 발견 내역

- [P0] [ReportConvert.jsx:54](/D:/jt-data/jttax-cta/project/src/ReportConvert.jsx:54) — “카톡으로 결과 전송” 클릭만으로 동의 절차 없이 Web3Forms에 상세 입력과 세액 결과를 전송한다. `Data.jsx`의 실제 키는 `REPLACE`가 아니어서 전송 분기가 활성화된다.  
  재현: 처분방법 비교에서 시가 `1,500,000,000`, 취득가 `400,000,000`, 추가사항 `아버지 78세 / 5년 전 5천만원 증여` 입력 후 결과의 “카톡으로 결과 전송” 클릭.  
  잘못된 출력/행동: 카카오톡을 여는 동시에 `상세입력_및_분석`에 금액·건강·증여이력·세액을 담아 `https://api.web3forms.com/submit`으로 POST하고, 화면은 “결과를 담당 세무사에게 전달했습니다”라고 표시한다. 이 버튼 앞에는 개인정보·제3자 제공 동의가 없다.  
  수정안: 전송 전 별도 확인·동의를 받고, 수집 항목·Web3Forms 제공 사실·보유기간·철회 방법을 고지하라. 기본값은 카카오 링크 열기와 클립보드 복사만 수행해야 한다.

- [P1] [ReportConvert.jsx:103](/D:/jt-data/jttax-cta/project/src/ReportConvert.jsx:103), [ReportConvert.jsx:165](/D:/jt-data/jttax-cta/project/src/ReportConvert.jsx:165) — 이메일 리드 동의문은 성명·연락처·이메일만 수집한다고 쓰지만, 실제 POST에는 `진단요약`, `상세입력_및_분석`도 포함된다. PDF 저장도 이메일과 진단요약을 Web3Forms로 전송하면서 동의문은 “리포트 발송”이라고만 쓴다.  
  재현: 위 비교 결과에서 이름·전화·이메일 입력, 체크 후 “결과 회신 요청” 또는 이메일 입력 후 “PDF 저장” 클릭.  
  잘못된 출력/행동: 화면 고지보다 넓은 세무·재산 정보가 외부 서비스로 전송된다. PDF 경로는 클라이언트 코드상 이메일로 PDF를 보내지 않고 POST 후 `window.print()`만 실행한다.  
  수정안: 실제 전송 필드를 동의문에 모두 적고 제3자 제공 동의를 분리하라. PDF는 서버 발송을 구현하거나, 목적을 “인쇄창 열기 및 상담 접수”로 바로잡아라.

- [P1] [ReportAppeal.jsx:128](/D:/jt-data/jttax-cta/project/src/ReportAppeal.jsx:128), [ReportAppeal.jsx:136](/D:/jt-data/jttax-cta/project/src/ReportAppeal.jsx:136) — 배포 페이지에서 `window.claude`를 정의하는 코드가 없는데 호출은 무가드다. 따라서 실제 정적 페이지에서는 예외를 잡고 항상 단순 폴백 등급으로 간다.  
  재현: 신고 시점 `5년보다 더 이전`, 사유 `신고 이후 사실관계가 변경`, 맥락 `2026.7.1 확정판결로 2018년 매매계약이 무효가 됨` 입력.  
  잘못된 출력: `gt_5y`만으로 [ReportAppeal.jsx:141](/D:/jt-data/jttax-cta/project/src/ReportAppeal.jsx:141)이 `NONE`, 즉 “대상 아님”을 표시한다. 확정판결로 기초 거래가 달라진 경우는 후발적 사유의 검토 대상일 수 있는데, 폴백은 맥락과 사유의 법적 요건을 전혀 읽지 않는다. 국세기본법 제45조의2 제2항은 일정 후발적 사유에 대해 사유를 안 날부터 3개월 내 청구 구조를 둔다. [국가법령정보센터](https://law.go.kr/LSW/lsLinkCommonInfo.do?lsJoLnkSeq=1026641065)  
  수정안: AI 미가용이면 등급을 내지 말고 “판정 불가”로 중단하라. 폴백을 유지하려면 후발적 사유를 별도 분기·증빙 질문으로 구현해야 한다.

- [P2] [ReportAppeal.jsx:38](/D:/jt-data/jttax-cta/project/src/ReportAppeal.jsx:38) — “신고 이후 판례·예규가 변경되었습니다”에 “후발적 경정청구 사유”라는 확정적 힌트를 붙였다.  
  재현: 해당 선택지를 누르면 화면에 “후발적 경정청구 사유”가 표시된다.  
  잘못된 출력: 법령 해석 또는 판례·예규 변경 그 자체는 후발적 경정청구 사유에 포함되지 않는다는 판례 취지와 충돌한다. [국가법령정보센터 판결요지](https://www.law.go.kr/LSW/precInfoP.do?precSeq=185554)  
  수정안: “개별 거래의 확정판결·심판결정 등 별도 요건 확인 필요”로 바꾸고, 단순 해석 변경은 독립 사유처럼 제시하지 마라.

- [P1] [ReportConvert.jsx:276](/D:/jt-data/jttax-cta/project/src/ReportConvert.jsx:276), [ReportConvert.jsx:301](/D:/jt-data/jttax-cta/project/src/ReportConvert.jsx:301) — “실시간 반영”, “당일 예약 가능” 문구와 달리 시간표는 네트워크 조회 없는 하드코딩 배열이다.  
  재현: 토요일 `2026-08-08`에 결과 화면 진입.  
  잘못된 출력: 세 카드가 모두 `8/10 (월)`로 중복되고, 서로 다른 고정 시간만 표시한다. `urgent=true`이면 실제 잔여 슬롯 확인 없이 “당일 예약 가능”도 표시한다.  
  수정안: 예약 시스템의 가용 슬롯 API를 연결하거나 “상담 희망 시간”으로 문구를 바꿔라. 현재 문구는 거짓·과장 광고 제한과 충돌할 소지가 있다. [세무사법 시행령 제33조](https://law.go.kr/LSW/lsInfoP.do?lsiSeq=286849&viewCls=lsRvsDocInfoR)

- [P1] [Report.jsx:21](/D:/jt-data/jttax-cta/project/src/Report.jsx:21), [Report.jsx:28](/D:/jt-data/jttax-cta/project/src/Report.jsx:28) — 구분자를 위치 검증 없이 전부 삭제해 여전히 자릿수·소수 위치를 바꾼다.  
  재현 입력 → 잘못된 정규화값: 금액 `1,2` → `12`, `1,,2` → `12`, `1원2` → `12`, `12\n34` → `1234`; 소수 허용 입력 `1,2.5` → `12.5`, `1 2` → `12`.  
  수정안: 허용할 천단위 표기를 먼저 전체 형식으로 검증한 뒤 제거하라. 예: `^\d{1,3}(,\d{3})*(\.\d*)?$` 또는 구분자 없는 숫자만 수용하고, `원`은 끝부분 한 번만 허용해야 한다.

- [P2] [Report.jsx:35](/D:/jt-data/jttax-cta/project/src/Report.jsx:35) — `null` 입력을 조용히 무시한다.  
  재현: 기존 금액 `12`가 입력된 칸에 `-100` 또는 `12x` 붙여넣기.  
  잘못된 출력: 상태를 갱신하지 않아 이전의 유효값 `12`가 유지되고, 오류 메시지도 없다. 사용자는 새 입력이 거절된 사실을 모른 채 이전 금액으로 계산한다.  
  수정안: 필드별 오류 상태를 두고 “음수·문자·잘못된 천단위 표기는 입력할 수 없습니다”를 표시하며 다음 버튼을 막아라.

- [P2] [Report.jsx:416](/D:/jt-data/jttax-cta/project/src/Report.jsx:416) — `#/report`는 허브가 아니라 마지막 계산기를 복원한다.  
  재현: `localStorage.jt_report_sub='cgt'` 상태에서 `#/report` 직접 진입.  
  잘못된 출력: 허브 대신 양도소득세 계산기가 열리고, [Report.jsx:452](/D:/jt-data/jttax-cta/project/src/Report.jsx:452)에 의해 주소도 `#/report/cgt`로 바뀐다.  
  수정안: 해시에 `report`가 명시되었고 서브라우트가 비어 있으면 무조건 `hub`를 반환하라. 저장값 복원은 해시가 없는 진입에만 적용해야 한다.

- [P2] [index.html:167](/D:/jt-data/jttax-cta/index.html:167), [Report.jsx:413](/D:/jt-data/jttax-cta/project/src/Report.jsx:413) — 쿼리와 중첩 경로 처리가 일관되지 않다.  
  재현: `#/report?x=1` → 홈으로 이동, `#/report/cgt/anything` → 허용되지 않은 추가 경로를 무시하고 CGT를 연다.  
  잘못된 출력: 전자는 허브가 아닌 홈, 후자는 화이트리스트 밖 경로를 허용한다. 빈 화면·크래시는 확인되지 않았고, 미등록 서브라우트 자체는 허브로 정규화된다.  
  수정안: `URLSearchParams`로 쿼리를 분리하고 정확히 두 경로 세그먼트만 허용한 뒤 나머지는 허브로 정규화하라.

- [P2] [ReportConvert.jsx:184](/D:/jt-data/jttax-cta/project/src/ReportConvert.jsx:184), [ReportConvert.jsx:220](/D:/jt-data/jttax-cta/project/src/ReportConvert.jsx:220) — 결정례 번호와 “비과세 확정”, “거부 취소” 서술을 직접 링크·검증 근거 없이 표시한다. 공식 검색에서 두 번호의 일치 자료는 확인되지 않았다.  
  재현: 비교 결과 또는 경정청구 결과에서 “참고할 공개 판례·자료” 카드가 표시된다.  
  잘못된 출력: `조심-2021-전-6949`, `조심2018중4657`과 해당 결론이 검증 표지 없이 사실로 노출된다.  
  수정안: 원문 URL과 사건 식별을 확인할 때까지 카드에서 번호·결론을 제거하고 `[확인 필요]`로 처리하라.

## 3. 재발 방지

각 수정안과 함께 자동 검증을 추가해야 한다: 숫자 정규화 표·`#/report` 라우팅 표·토요일 시간표·외부 POST payload/동의문 일치 테스트가 최소 가드레일이다.

## 4. 검증 결과

- UTF-8 읽기: `Get-Content -Encoding utf8`로 지정 4개 파일과 `index.html`의 관련 행을 직접 확인.
- 로드 순서: `index.html` 136행 `Report.jsx`가 137~153행의 모든 `Report*.jsx`보다 먼저 로드된다. 따라서 현재 순서에서 헬퍼 미정의는 발견되지 않았다.
- 단, [ReportReform2026.jsx:45](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:45)가 나중에 `window.jtMoneyDigits`를 다시 대입한다. 현재 구현은 같지만 전역 단일 원본 원칙은 깨져 있다.
- 저장소 검색: 입력값의 `localStorage` 저장은 발견하지 못했고, `jt_report_sub`와 선택 시간 `jt_preferred_slot`만 저장한다. 외부 전송은 엔진·Web3Forms 경로에서 확인됐다.

## 5. 미확인 사항

원격 세액 엔진과 Web3Forms 서버 내부의 실제 보관·재전송 정책은 이 작업공간에 소스가 없어 검증 불가다. `JTReportDisclaimer` 자체 문구에서는 세무사법 §12조의7 위반으로 단정할 표현은 발견하지 못했다.
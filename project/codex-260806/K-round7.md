[P2] · [Report.jsx:96](/D:/jt-data/jttax-cta/project/src/Report.jsx:96) · 공통 `JTReportDisclaimer`는 여전히 “세액 계산 엔진으로 전송·일부 AI 이용”이라고 단정합니다. 이 컴포넌트가 [crypto 결과:526](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:526), [개편 양도 결과:1400](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:1400), [개편 종부 결과:1619](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:1619)에 렌더됩니다. 셸의 `local`/`lookup` 고지와 한 화면에서 모순합니다.
재현: 각 계산 결과 하단의 ‘입력값 처리’ 문구 확인.
수정안: `JTReportDisclaimer`도 `dataFlow`를 받아 같은 고지를 쓰거나, 해당 문단을 공통 면책에서 제거.

[P2] · [ReportAppeal.jsx:283](/D:/jt-data/jttax-cta/project/src/ReportAppeal.jsx:283) · 경정청구 진단은 `dataFlow` 미지정으로 기본 `engine` 고지를 표시하지만, 실제 분석 경로는 [Claude 호출:128](/D:/jt-data/jttax-cta/project/src/ReportAppeal.jsx:128)뿐이며 세액 엔진 `fetch`는 없습니다.
재현: `#/report/appeal` 문항 화면에서 “세액 계산 엔진으로 전송” 고지 확인.
수정안: `ai` 흐름을 별도 정의하거나, 기본 고지를 “외부 AI 분석”에 맞게 분리.

[P3] · [ReportCrypto2027.jsx:506](/D:/jt-data/jttax-cta/project/src/ReportCrypto2027.jsx:506), [ReportReform2026.jsx:687](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:687) · 교차계산기 영역이 “모두 … 세액 엔진을 거칩니다”라고 표시합니다. 목록에는 브라우저 계산인 `reform-cgt`·`reform-cre`가 포함되고, crypto도 로컬 계산입니다.
재현: crypto 또는 개편안 결과 하단 ‘다른 세금도 계산해 보세요’ 확인.
수정안: 해당 문구를 “계산 방식은 도구별로 다릅니다”로 바꾸거나 개별 흐름 고지를 사용.
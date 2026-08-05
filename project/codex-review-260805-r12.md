## 1. 작업 요약

신규 P0는 0건, 신규 P1은 3건입니다. 따라서 “P0/P1 0건” 연속 횟수는 이번 라운드에서 이어지지 않습니다. 가상자산 랜딩의 시행일·의제취득가액·세율 문구는 현행 소득세법 검색 결과와 일치해 지적에서 제외했습니다. [국가법령정보센터](https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=267581)

## 2. 지적 사항

- [P1] · [index.html:108](/D:/jt-data/jttax-cta/index.html:108), [Chrome.jsx:228](/D:/jt-data/jttax-cta/project/src/Chrome.jsx:228) · SPA 최초 진입마다 GA4 `page_view`가 자동·수동으로 둘 다 전송됩니다. `gtag('config')`의 기본값은 자동 pageview 전송인데, 이후 `useSeoMeta`가 다시 `page_view`를 보냅니다. 재현 입력: `/#/report/crypto`를 새로고침. 잘못된 출력: 동일 방문이 최소 2건으로 집계되며, 수동 이벤트는 GA4 표준 필드가 아닌 `page_path`를 보내 계산기별 경로 분류도 신뢰할 수 없습니다. 수정안: SPA의 config에 `send_page_view:false`를 넣고, 수동 이벤트는 `page_location: location.origin + '/report/crypto'`와 `page_title`을 보내십시오. Enhanced Measurement의 “history 기반 페이지 변경”도 끄거나 수동 계측 한쪽만 유지해야 합니다. [GA4 공식 문서](https://developers.google.com/analytics/devguides/collection/ga4/views?hl=en)

- [P1] · [Chrome.jsx:101](/D:/jt-data/jttax-cta/project/src/Chrome.jsx:101), [106](/D:/jt-data/jttax-cta/project/src/Chrome.jsx:106), [119](/D:/jt-data/jttax-cta/project/src/Chrome.jsx:119), [151](/D:/jt-data/jttax-cta/project/src/Chrome.jsx:151), [266](/D:/jt-data/jttax-cta/project/src/Chrome.jsx:266) · 라우팅용 `<a>` 27개가 `href` 없이 `onClick`만 가집니다. 재현 입력: 키보드만으로 홈에서 `Tab` 후 `Enter`로 “회사소개”, “세금 계산기”, 모바일 메뉴, 푸터 링크를 선택. 잘못된 출력: 해당 요소는 탭 포커스를 받지 않아 경로 전환이 불가능합니다. 수정안: 페이지 이동은 실제 `href="/#/about"` 등의 앵커로 바꾸거나 `<button type="button">`으로 교체하고, 서비스 드롭다운은 포커스·Escape·방향키 동작까지 구현하십시오.

- [P1] · [build-insights.mjs:119](/D:/jt-data/jttax-cta/project/insights/build-insights.mjs:119), [251](/D:/jt-data/jttax-cta/project/insights/build-insights.mjs:251), [build-calculators.mjs:294](/D:/jt-data/jttax-cta/project/calculators/build-calculators.mjs:294) · slug에 경로 구분자 검증이 없어 빌드 산출 경로를 탈출합니다. 재현 입력: 인사이트 frontmatter에 `slug: ../index` 지정. 잘못된 출력: `join(ARTICLE_OUT_DIR, '../index.html')`은 루트 `D:\jt-data\jttax-cta\index.html`로 해석되어 홈 SPA를 글 HTML로 덮어씁니다. 계산기 데이터의 `slug`도 같은 방식으로 `/calculators` 밖 파일을 쓸 수 있습니다. 수정안: 두 입력 모두 `^[a-z0-9]+(?:-[a-z0-9]+)*$`만 허용하고, `resolve()` 결과가 각 출력 디렉터리 하위인지 검증한 뒤 빌드 실패 처리하십시오.

## 3. 재발 방지

- GA: 초기 로드당 `page_view` 정확히 1건 및 `page_location` 검증 테스트.
- 접근성: Playwright/axe 키보드 탭 순서·Enter 라우팅 회귀 테스트.
- 빌드: `../index`, `/index`, `a/b` slug fixture가 모두 실패하는 테스트.

## 4. 검증 결과

- 경로 재현: `slug=../index` → `RESOLVED=D:\jt-data\jttax-cta\index.html`, `ESCAPES_OUT=True`.
- 정적 검사: 무-`href` 클릭 앵커 27개, GA 자동 config와 수동 `page_view` 호출을 확인했습니다.
- 결과 표는 [ReportReform2026.jsx:974](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:974)와 [1154](/D:/jt-data/jttax-cta/project/src/ReportReform2026.jsx:1154)에서 가로 스크롤 컨테이너를 사용해, 이번 범위에서 “잘림” P1은 확인하지 못했습니다.
- 이 환경에는 `node`가 없어 실제 빌드·브라우저 E2E는 실행하지 못했습니다.

## 5. 미확인 사항

GA4 속성의 Enhanced Measurement 설정은 저장소 밖 설정이라 확인하지 못했습니다. 켜져 있으면 해시 변경 시 중복 pageview가 추가될 수 있습니다.
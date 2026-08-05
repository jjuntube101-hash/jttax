## 1. 작업 요약

신규 P0은 **0건**, 신규 P1은 **2건**입니다. Home 수정 자체는 정확하지만, 새 스모크 테스트는 현재 Babel이 없는 구성에서 중복 JSX로 인한 홈 백지를 다시 거짓 통과시킬 수 있습니다.

## 2. 변경 내역 / 발견 결함

- [P1] · [project/tests_jsx_smoke.js:22](D:/jt-data/jttax-cta/project/tests_jsx_smoke.js:22)–[43](D:/jt-data/jttax-cta/project/tests_jsx_smoke.js:43) · 태그 종료 탐색이 문자열·템플릿 리터럴·정규식의 `{`, `}`, `>`를 코드 구조로 오인합니다.
  재현 입력값: `<a tabIndex={0} title="x > y" role="button" role="link">x</a>`; 또는 `<a tabIndex={0} onClick={() => \`}\` > 0} role="button" role="link">x</a>`; 또는 `<a tabIndex={0} onClick={() => /}/.test(s) ? s > 0 : false} role="button" role="link">x</a>`.
  잘못된 출력: `tags()`가 첫 문자열/표현식 내부의 `>`에서 잘려 `role=` 중복을 보지 못하고 `JSX 스모크 실패 0건`으로 종료합니다. `stripComments()`도 `<a title="//" onClick={go}>x</a>` 뒤에 `tabIndex` 앵커가 있으면 문자열의 `//`부터 주석으로 지워 첫 앵커가 뒤 태그까지 삼켜져 키보드 누락을 통과시킵니다.
  수정안: 수제 중괄호 파서를 제거하고 Babel parser를 필수 의존성으로 고정해 모든 JSX를 파싱하십시오.

- [P1] · [project/tests_jsx_smoke.js:46](D:/jt-data/jttax-cta/project/tests_jsx_smoke.js:46)–[49](D:/jt-data/jttax-cta/project/tests_jsx_smoke.js:49), [63](D:/jt-data/jttax-cta/project/tests_jsx_smoke.js:63)–[78](D:/jt-data/jttax-cta/project/tests_jsx_smoke.js:78) · fallback은 5개 태그와 7개 속성만 검사하며, 실제 파싱은 `@babel/standalone` 설치 시에만 수행합니다.
  재현 입력값: `<section role="button" role="link" />`, `<a tabIndex={0} aria-label="상담" aria-label="예약" />`, `<article onClick={go}>상담</article>`.
  잘못된 출력: 모두 검사 대상 밖이어서 `JSX 스모크 실패 0건`; 앞의 두 입력은 Babel 중복 attribute 오류 대상이고, 마지막 입력은 키보드 조작 불가입니다. 인계문서도 현재 Babel 미설치를 명시합니다.
  수정안: Babel 파싱을 선택 사항으로 두지 말고 CI/배포 게이트의 필수 단계로 만들고, 키보드 검사는 모든 `onClick` 비-native 요소에 `role`·`tabIndex`·Enter/Space 처리를 요구하십시오.

Home의 [142행](D:/jt-data/jttax-cta/project/src/Home.jsx:142)은 중복 `role`·`tabIndex`·`onKeyDown`이 제거됐고, 남은 `role="button"`, `tabIndex={0}`, Enter/Space `onKeyDown`은 클릭과 동일한 예약 이동·추적을 수행합니다. 기존 [Home.jsx:367](D:/jt-data/jttax-cta/project/src/Home.jsx:367)의 클릭 `li`와 [411](D:/jt-data/jttax-cta/project/src/Home.jsx:411)의 클릭 `article`은 키보드 접근 불가이나, `c4582e86`부터 존재해 이번 델타 결함으로는 산정하지 않았습니다.

## 3. 재발 방지

`@babel/standalone` 또는 동등 JSX parser를 lockfile에 고정하고, “Babel 파싱 성공” 없이는 배포 게이트가 성공하지 않게 바꾸어야 합니다.

## 4. 검증 결과

- `git show 86c0296`, `git show 32dbcb6`, `git blame -L 360,415 f5588d3 -- project/src/Home.jsx`로 델타와 기존 결함 경계를 확인했습니다.
- `Get-Command node` 및 `node project/tests_jsx_smoke.js` 결과: `node` 명령을 찾지 못해 이 환경에서는 스크립트 실행 자체가 불가했습니다.
- `Test-Path project/node_modules/@babel/standalone` 결과: `False`.
- `project/src`의 JSX 25개가 모두 직하위에 있어 파일 열거 누락은 없으며, 선택된 7개 속성의 현재 중복 검색 결과는 0건입니다.

## 5. 미확인 사항

Node와 필수 Babel parser가 없는 현재 환경에서는 실제 전체 JSX 파싱 성공을 검증할 수 없습니다.
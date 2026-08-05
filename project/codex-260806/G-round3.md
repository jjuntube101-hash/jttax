## 1. 작업 요약

R3 결과: 계산·질문 흐름의 신규 기능 결함은 없습니다. 다만 커밋된 리뷰 문서에 P3 공백 오류가 있습니다.

## 2. 발견

- [P3] · [F-round2.md](/D:/jt-data/jttax-cta/project/codex-260806/F-round2.md:3) · 새로 추가된 Markdown의 3, 4, 7, 8, 11, 12, 15, 16, 19, 20행 끝 공백 때문에 `git diff --check`가 실패합니다.
  재현 입력: `git diff --check HEAD~2..HEAD`
  잘못된 출력: 각 행 `trailing whitespace.` / 올바른 출력: 없음.
  수정안: 해당 행의 행말 공백을 제거하십시오.

반영 검증:

- 국민연금은 상한 `6,590,000 × 4.75% = 313,025원`으로 맞고, 만료 고지도 상·하한 구간에서만 작동합니다.
- `acqAdjustedZone`은 `house_1/2/3`에서 항상 표시되며, 엔진 payload와 두 폴백 모두 `acqAdjustedZone !== 'no'`를 사용합니다. 미응답·`unsure`는 모두 거주요건을 요구하는 보수적 처리입니다.
- `numChildrenExact`는 `quick` 단계이며, `many` 선택 직후 다음 문항으로 노출되고 엔진·폴백이 같은 `inhChildCount()`를 사용합니다.
- Web3Forms 배너의 `res.ok` 판정은 현행 문서 규약과 맞습니다. 공식 API는 JSON 요청에서 `200 = success:true`, 실패는 `400/429/500`으로 규정합니다. 문서상 `200`과 `success:false` 조합은 확인되지 않았습니다. 따라서 이 항목은 신규 결함이 아닙니다. [Web3Forms API reference](https://docs.web3forms.com/getting-started/api-reference), [React example](https://docs.web3forms.com/how-to-guides/js-frameworks/react-js/simple-react-contact-form)
- 기본세율표 기각은 타당합니다. 코드의 `6/15/24/35/38/40/42/45%`는 §55① 기본세율 구조와 일치하며, 비사업용 토지에만 별도로 `+10%p`를 적용합니다. 해당 지적은 철회되어야 합니다.

## 3. 재발 방지

P3 문서 공백 제거 후 커밋 전 `git diff --check HEAD~2..HEAD`를 게이트에 포함하면 됩니다.

## 4. 검증 결과

- `git diff --name-status HEAD~2..HEAD` 및 변경 JSX 4개를 UTF-8로 실제 열어 대조.
- `rg -n "regulated_at_acquisition|acqAdjustedZone|res && res.ok|data.success"`로 payload·폴백·전송 분기를 대조.
- `git diff --check HEAD~2..HEAD` → 위 P3 trailing whitespace 발견.
- `Get-Command node` → 출력 없음. 이 환경에서는 `npm run gate` 재실행 불가.

## 5. 미확인 사항

실제 Web3Forms POST는 개인정보 전송이므로 read-only 검토 범위에서 실행하지 않았습니다.
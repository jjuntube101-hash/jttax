신규 발견 없음 — 수렴.

- `rfCreVerdict`가 JSX 앞에 있고 `window.jtRfCreVerdict`로 공개되어 하네스 실행 범위에 포함됩니다.
- R35 반례(230.4만 / 207.36만 / 230.4만)에서 `kind='changed'`, `midDiffers=true`, `diff=0`을 각각 고정합니다. 결론 판정을 `diff === 0`으로 되돌리면 CASE 20b의 `kind='changed'` 단언이 실패합니다.
- JSX는 `v.kind`으로 ‘변동 없음’ 여부를 선택하고, `v.diff===0`은 이미 `changed`인 경우 2028년 문장만 고르는 데 사용됩니다. R35 문장은 의도대로 유지됩니다.
- `none`·`same`·2028만 변동·문턱 미달 혼합 갈래도 각 회귀 항목으로 확인했습니다.
- `git diff --check -- project/src/ReportReform2026.jsx project/tests_rf_reform2026.js`: 출력 없음.

이 환경에는 `node`가 없어 `npm run gate`의 독립 실행은 검증 불가입니다.
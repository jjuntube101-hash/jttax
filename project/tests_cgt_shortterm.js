/* 양도세 화면에 «자체 계산식(폴백)이 없다» — 소득세법 세율·공제를 프론트가 직접 계산하지 않는다 (261004)

   이 파일은 종전에 «폴백의 단기보유 세율 분기»(주택 70/60%, 상가·토지 50/40%)를 지켰다.
   오너 방침(261004)에 따라 양도세 화면도 취득세 화면처럼 «엔진이 준 값만 금액으로 표시한다».
   분기 규칙을 지킬 대상이 사라졌으므로, 이제 반대를 지킨다 — 세율표·장특공제율·단기세율·중과율·12억·기본공제
   같은 계산 상수와 그 계산식이 소스에 «되살아나지 않는가».

   ⚠️ ReportCGT.jsx 는 JSX 라 통째로 eval 할 수 없으므로 소스 텍스트를 본다. 주석은 뺀다(역사 설명이 남아도 된다).
      금액은 «엔진 값»으로만 채운다는 것(cgtCalcFromEngine 이 calc 를 만든다)은 tests_calc_response.js 가 실행으로 고정한다. */
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, 'src', 'ReportCGT.jsx');
const raw = fs.readFileSync(SRC, 'utf8');
/* 주석 제거 — 블록 주석 전부 + 줄 전체가 // 로 시작하는 줄. 문자열 안의 «//»(URL)는 줄 시작이 아니라 건드리지 않는다. */
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');

let fails = 0;
function eq(label, got, want) {
  const ok = got === want; if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      got=${got}  want=${want}`);
}
const absent = (label, re) => eq(label, re.test(code), false);

console.log('════ 삭제된 계산 상수·함수가 되살아나지 않았다 ════');
absent('기본세율표 상수(CGT_BRACKETS)', /CGT_BRACKETS/);
absent('기본세율 계산 함수(calcBaseTax)', /calcBaseTax/);
absent('장기보유특별공제율 함수(calcLtDeductionRate)', /calcLtDeductionRate/);
absent('세율표 구간 값(1,400만원 6% 구간 등)', /14_000_000|1_260_000|5_760_000|15_440_000|19_940_000|25_940_000|35_940_000|65_940_000/);
absent('12억 비과세 기준 상수(1_200_000_000)', /1_200_000_000|1200000000/);
absent('기본공제 상수(2_500_000)', /2_500_000|2500000/);
absent('단기세율 분기식(shortRate·isDwellingClass)', /shortRate|isDwellingClass/);
absent('중과 계산(heavyLand·isHeavyCgt·heavyRestored·surcharge)', /heavyLand|isHeavyCgt|heavyRestored|surcharge/);
absent('2차 폴백 변수(…2 접미: baseTax2·taxBase2·totalTax2)', /\b(?:baseTax2|taxBase2|totalTax2|ltRate2|capGain2)\b/);
absent('세액·과세표준을 «대입해서 계산»하는 문(let/const baseTax = …)', /\b(?:let|const|var)\s+(?:baseTax|localTax|totalTax|taxBase|ltDeduction|taxable)\b/);
absent('세율을 곱하는 식(taxBase * 0.xx · Math.round(… * 0.xx))', /taxBase\s*\*|Math\.round\([^)]*\*\s*0\.\d/);
absent('지방소득세 10% 자체 계산(* 0.10 · * 1.10 · * 0.1)', /\*\s*(?:0\.10?|1\.10)\b/);

console.log('\n════ 화면 문구 — 「간이추정」 딱지·문구가 없다 ════');
absent('「간이추정」 태그', /간이추정/);
absent('「간이 추정」 문구', /간이 추정/);
absent('엔진 연결 실패 시 간이 추정치를 표시한다는 문구', /간이 추정치를 표시/);
absent('정밀계산/간이 이분(calc.precise 삼항으로 라벨을 가르는 표현)', /calc\.precise\s*\?/);

console.log('\n════ 금액은 엔진 응답으로만 만든다 ════');
eq('cgtCalcFromEngine 이 있다', /function cgtCalcFromEngine\(ej\)/.test(code), true);
eq('runAnalysis 가 엔진 응답을 cgtCalcFromEngine 으로 판독한다', /cgtCalcFromEngine\(await callTransferEngine\(answers\)\)/.test(code), true);
eq('엔진 호출 예외를 cgtCalcFromEngineError 로 분류한다(예외 시 간이 계산으로 빠지지 않는다)', /cgtCalcFromEngineError\(engErr\)/.test(code), true);
eq('runAnalysis 의 catch 가 setErr 로 간다(2차 폴백 setReport 없음)', /console\.error\(e\);\s*setErr\(e\.message/.test(code), true);

console.log(`\n════════════════════\n실패 ${fails}건`);
process.exit(fails ? 1 : 0);

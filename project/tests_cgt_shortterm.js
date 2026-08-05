/* 양도세 폴백 «단기보유 세율» 회귀 — 소득세법 §104①2호·3호 (260806 원문 확인)
     · 주택·조합원입주권·분양권 : 1년 미만 70% / 1~2년 60%
     · 그 밖의 부동산(상가·토지) : 1년 미만 50% / 1~2년 40%
   종전 폴백은 1년 미만에 «모든 자산» 70%를 먹이고 1~2년은 주택만 60%로 처리해,
   상가·토지에 법정 단기세율이 아예 붙지 않았다(1~2년 상가는 기본세율로 떨어짐).

   ⚠️ 이 파일은 «세율표 자체»가 아니라 «분기 규칙»을 지킨다. ReportCGT.jsx 는 JSX 라
      통째로 eval 할 수 없으므로, 소스에서 분기식을 추출해 그대로 실행한다. */
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, 'src', 'ReportCGT.jsx');
const src = fs.readFileSync(SRC, 'utf8');

/* 분기식 추출 — 마커가 사라지면 «조용히 통과»하지 않고 죽는다 */
/* ⚠️ 이 저장소는 CRLF 다 — `;\n` 로 끝을 잡으면 `;\r\n` 에 안 걸린다(처음에 그렇게 짰다가 죽었다) */
const mDwell = src.match(/const isDwellingClass = ([\s\S]*?);\r?\n/);
const mRate = src.match(/const shortRate = ([\s\S]*?);\r?\n/);
if (!mDwell || !mRate) throw new Error('ReportCGT.jsx 의 단기세율 분기식을 찾지 못했습니다 — 구조가 바뀌었는지 확인하세요.');

function shortRateFor(assetType, years) {
  const is1House = assetType === 'house_1', is2House = assetType === 'house_2', is3House = assetType === 'house_3';
  const isDwellingClass = eval(mDwell[1]);
  return eval(mRate[1]);
}

let fails = 0;
function eq(label, got, want) {
  const ok = got === want; if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      got=${got}  want=${want}`);
}

console.log('════ 주택·입주권 (§104①3호 70% / 2호 60%) ════');
['house_1', 'house_2', 'house_3', 'replacement', 'occupancy_orig', 'occupancy_succ'].forEach((t) => {
  eq(`${t} 1년 미만 → 70%`, shortRateFor(t, 0.5), 0.70);
  eq(`${t} 1~2년 → 60%`, shortRateFor(t, 1.5), 0.60);
  eq(`${t} 2년 이상 → 단기 아님`, shortRateFor(t, 2), 0);
});

console.log('\n════ 주택 외 부동산 — 상가·토지 (§104①3호 50% / 2호 40%) ════');
/* 종전 결함: 1년 미만 70%(과대) · 1~2년 단기세율 없음(과소) */
eq('상가·토지 1년 미만 → 50% (종전 70%)', shortRateFor('commercial', 0.5), 0.50);
eq('상가·토지 1~2년 → 40% (종전 0 = 기본세율)', shortRateFor('commercial', 1.5), 0.40);
eq('상가·토지 2년 이상 → 단기 아님', shortRateFor('commercial', 2), 0);

console.log('\n════ 경계값 ════');
eq('정확히 1년 → 1~2년 구간', shortRateFor('house_1', 1), 0.60);
eq('정확히 2년 → 단기 아님', shortRateFor('house_1', 2), 0);
eq('0년 → 1년 미만', shortRateFor('house_1', 0), 0.70);

console.log('\n════ 조합원입주권이 60% 분기에 «실제로» 들어가는가 (종전 누락) ════');
eq('occupancy_succ 1.5년 ≠ 0 (기본세율로 떨어지면 안 된다)', shortRateFor('occupancy_succ', 1.5) > 0, true);
eq('occupancy_orig 1.5년 ≠ 0', shortRateFor('occupancy_orig', 1.5) > 0, true);

console.log('\n════ 분기가 «실제 계산»에 배선됐는가 ════');
/* 분기식만 맞고 호출부가 옛 상수(0.70/0.60 하드코딩)면 의미가 없다 */
eq('shortRate 를 세액 계산에 쓴다', /shortRate\s*>\s*0/.test(src) && /taxBase \* shortRate/.test(src), true);
eq('옛 하드코딩 분기(years < 2 && isHouse)가 남지 않았다', /years < 2 && isHouse/.test(src), false);
eq('비사업용 토지 2년 미만 비교과세(§104④ 후단) 반영', /heavyLand/.test(src), true);

console.log(`\n════════════════════\n실패 ${fails}건`);
process.exit(fails ? 1 : 0);

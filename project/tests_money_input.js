/* 공용 숫자 입력 정규화(Report.jsx) 회귀 — 전 계산기가 이 한 곳을 쓴다.
   ⚠️ 이 결함은 «세액을 100배로» 만든다: "50,000,000.00" → 5000000000.
      260805 개편안·가상자산에서 처음 잡았고, 260806 전수 점검에서 나머지 7종도 같았다. */
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, 'src', 'Report.jsx');
const src = fs.readFileSync(SRC, 'utf8');

/* 헬퍼 블록만 잘라낸다 — 마커가 사라지면 «조용히 통과»하지 않고 죽는다 */
const from = src.indexOf('window.jtMoneyDigits = function');
const toMark = 'window.jtSetNumericAns = function';
const to = src.indexOf(toMark);
if (from < 0 || to < 0) throw new Error('Report.jsx 의 숫자 정규화 헬퍼를 찾지 못했습니다 — 구조가 바뀌었는지 확인하세요.');
const end = src.indexOf('\n};', to);
if (end < 0) throw new Error('jtSetNumericAns 끝을 찾지 못했습니다.');

global.window = {};
eval(src.slice(from, end + 3));
const M = window.jtMoneyDigits, D = window.jtDecimalInput, S = window.jtSetNumericAns;

let fails = 0;
function eq(label, got, want) {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      got=${JSON.stringify(got)}  want=${JSON.stringify(want)}`);
}

console.log('════ 금액 입력 (jtMoneyDigits) ════');
/* 자릿수를 바꾸면 안 된다 — 이게 이 파일의 존재 이유다 */
eq('엑셀 복사 ".00" → 소수부 절사', M('50,000,000.00'), '50000000');
eq('소수부가 0이 아니어도 원 단위 절사', M('1,234,567.89'), '1234567');
eq('쉼표만', M('1,800,000,000'), '1800000000');
eq('「원」·공백·₩ 제거', M(' ₩1,234,567원 '), '1234567');
eq('전각 숫자 — 종전엔 통째로 사라졌다', M('１２３４５６'), '123456');
eq('전각 쉼표 포함', M('１，８００，０００，０００'), '1800000000');
eq('지수표기 거부 (종전 18e8 → 188)', M('18e8'), null);
eq('음수 거부 (종전엔 부호만 조용히 삭제)', M('-100000000'), null);
eq('문자 혼입 거부', M('1억2천'), null);
eq('빈 입력', M(''), '');
eq('0 유지', M('0'), '0');
eq('앞 0 제거', M('007'), '7');
eq('null/undefined 방어', M(null) + '|' + M(undefined), '|');

console.log('\n════ 소수 허용 입력 (jtDecimalInput) — 기간·비율 ════');
eq('정수', D('12'), '12');
eq('소수', D('1.5'), '1.5');
eq('입력 중 상태(끝 소수점)', D('12.'), '12.');
eq('전각', D('１２'), '12');
eq('지수표기 거부', D('1e9'), null);
eq('음수 거부', D('-3'), null);
eq('소수점 두 개 거부', D('1.2.3'), null);
eq('빈 입력', D(''), '');

console.log('\n════ 공용 핸들러 (jtSetNumericAns) — 거부되면 값을 «그대로 둔다» ════');
(function () {
  let store = { a: '999' };
  const setAns = (id, v) => { store[id] = v; };
  S(setAns, 'a', '50,000,000.00', true);
  eq('정상 입력은 반영', store.a, '50000000');
  S(setAns, 'a', '18e8', true);
  eq('거부 입력은 앞 값 유지 (자릿수 바뀐 값을 저장하지 않는다)', store.a, '50000000');
  S(setAns, 'a', '-1', true);
  eq('음수도 앞 값 유지', store.a, '50000000');
  S(setAns, 'b', '1.5', false);
  eq('money=false 는 소수 허용', store.b, '1.5');
  S(setAns, 'b', '1.5.5', false);
  eq('money=false 도 형식 위반은 거부', store.b, '1.5');
})();

console.log('\n════ 전 계산기가 실제로 이 헬퍼를 쓰는가 (배선 확인) ════');
/* 「헬퍼를 만든 것」과 「호출되는 것」은 다르다 — 호출부를 세어 확인한다 */
const WIRED = ['ReportCGT.jsx', 'ReportGift.jsx', 'ReportInheritance.jsx', 'ReportAcquisition.jsx',
               'ReportProperty.jsx', 'ReportComprehensive.jsx', 'ReportYouthStartup.jsx'];
WIRED.forEach((f) => {
  const t = fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
  eq(`${f} 가 공용 헬퍼를 호출한다`, /jtSetNumericAns\s*\(/.test(t), true);
  /* 옛 패턴이 남아 있으면 회귀다.
     ⚠️ «줄 전체»를 봐야 한다 — 매치 구간만 보면 그 앞에 있는 식별자(`setIndCodeInput` 등)를
        놓쳐 정상 코드를 위반으로 잡는다(처음에 그렇게 만들었다가 오탐 1건).
     제외 대상은 «금액이 아닌» 입력뿐: 날짜(YYYYMMDD 8자리)·업종코드 같은 «식별자».
     이들은 자릿수가 의미를 갖지 않아 소수점·전각 문제가 생기지 않는다. */
  const risky = t.split('\n')
    .filter((L) => /replace\(\/\[\^0-9\]\/g/.test(L))
    .filter((L) => !/slice\(0,\s*8\)/.test(L) && !/IndCodeInput|indCodeInput/.test(L));
  eq(`${f} 에 옛 금액 파서가 남지 않았다`, risky.length + (risky.length ? ' :: ' + risky[0].trim().slice(0, 70) : ''), 0);
});

console.log(`\n════════════════════\n실패 ${fails}건`);
process.exit(fails ? 1 : 0);

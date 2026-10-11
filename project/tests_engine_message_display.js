/* 엔진 안내 문구 표시용 변환(window.jtEngineMessageForDisplay, Report.jsx) — 261011
   엔진의 needs_input·unsupported 문구에 든 «요청 필드 식별자»(owner_housing_count 등)와 개발자용 꼬리말이
   사람에게 보이는 화면에 나오지 않는지, 식별자 없는 문구는 그대로인지, 조문 인용은 남는지를 실제 엔진 문구로 고정한다.
   (문구 표본은 261011 운영 엔진 3f3bfce 의 실제 응답과 enum_guard.py 의 메시지 형식에서 가져왔다.) */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const SRC = (f) => path.join(__dirname, 'src', f);
const rs = fs.readFileSync(SRC('Report.jsx'), 'utf8');
const m = rs.match(/window\.jtEngineMessageForDisplay = function[\s\S]*?\n};/);
assert.ok(m, 'Report.jsx 의 jtEngineMessageForDisplay 를 찾지 못했습니다.');
const ctx = vm.createContext({ window: {} });   // String·RegExp 같은 내장은 쓰지 않는다 — 다른 시험의 좁은 컨텍스트에서도 돌아야 한다
vm.runInContext(m[0], ctx);
const D = ctx.window.jtEngineMessageForDisplay;

let checks = 0, fails = 0;
function eq(got, want, label) {
  checks++;
  if (got !== want) { fails++; console.log('FAIL  ' + label + '\n      got =' + JSON.stringify(got) + '\n      want=' + JSON.stringify(want)); }
  else console.log('PASS  ' + label);
}
function noIdent(s, label) {
  checks++;
  const hit = s.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/);
  if (hit) { fails++; console.log('FAIL  ' + label + ' — 식별자 남음: ' + hit[0] + '\n      ' + s); }
  else console.log('PASS  ' + label);
}

console.log('════ needs_input (IncompleteInputError 형식) ════');
const NI1 = '양도소득세의 1세대 1주택 비과세·다주택 중과와 증여 취득세 중과 제외, 매수인의 주택 수를 가르는 소유자 세대의 주택 보유 현황을 확정할 수 없다 — 필요: owner_housing_count(처분 물건을 포함한 소유자 세대의 보유 주택 수) [소득세법 §89①3호·§104⑦, 지방세법 §13의2②] — 확정할 수 없는 값을 0으로 두면 「세액 0원」이 정상 결과처럼 반환되므로 차단한다.';
eq(D(NI1), '양도소득세의 1세대 1주택 비과세·다주택 중과와 증여 취득세 중과 제외, 매수인의 주택 수를 가르는 소유자 세대의 주택 보유 현황을 확정할 수 없다 — 필요: 「처분 물건을 포함한 소유자 세대의 보유 주택 수」 [소득세법 §89①3호·§104⑦, 지방세법 §13의2②]', '처분 비교: 식별자 → 「설명」, 조문 유지, 꼬리말 제거');
noIdent(D(NI1), '처분 비교: 식별자 없음');

const NI2 = '1세대 1주택 비과세의 거주요건(취득 당시 조정대상지역이면 2년 거주) 충족을 확정할 수 없다 — 필요: regulated_at_acquisition(취득 당시 조정대상지역 여부) 또는 move_in_date(전입일 — 2년 이상 거주했다면 취득 당시 지정 여부와 무관) [소득세법 시행령 §154①] — 확정할 수 없는 값을 0으로 두면 「세액 0원」이 정상 결과처럼 반환되므로 차단한다.';
eq(D(NI2), '1세대 1주택 비과세의 거주요건(취득 당시 조정대상지역이면 2년 거주) 충족을 확정할 수 없다 — 필요: 「취득 당시 조정대상지역 여부」 또는 「전입일 — 2년 이상 거주했다면 취득 당시 지정 여부와 무관」 [소득세법 시행령 §154①]', '거주요건: 설명 안의 줄표를 품은 두 식별자, 한글 괄호는 그대로');
noIdent(D(NI2), '거주요건: 식별자 없음');

const NI3 = '증여 취득세 중과 제외(지방세법 §13의2②)를 확정할 수 없다 — 필요: donor_other_house_count(증여자 세대의 다른 주택 수 (증여물건 제외)) [지방세법 §13의2②] — 확정할 수 없는 값을 0으로 두면 「세액 0원」이 정상 결과처럼 반환되므로 차단한다.';
eq(D(NI3), '증여 취득세 중과 제외(지방세법 §13의2②)를 확정할 수 없다 — 필요: 「증여자 세대의 다른 주택 수 (증여물건 제외)」 [지방세법 §13의2②]', '설명 안에 괄호가 한 겹 있어도 통째로 묶는다');

console.log('════ unsupported (UnsupportedChoiceError 형식) ════');
const US1 = "property_type: 지원하지 않는 값 '오피스텔'. 허용: 주택 / 분양권 / 입주권 / 토지 / 상가 / 건물 [지방세법 §11] — 미지원 값을 기본값으로 대체하면 «틀린 세액»이 정상 결과처럼 반환되므로 차단한다.";
eq(D(US1), "지원하지 않는 값 '오피스텔'. 허용: 주택 / 분양권 / 입주권 / 토지 / 상가 / 건물 [지방세법 §11]", '미지원 값: 머리의 식별자와 꼬리말 제거, 허용 목록·조문 유지');
const US2 = "tax_year: 지원하지 않는 값 2025. 허용: 2026 [종부세법 §3] — 미지원 값을 기본값으로 대체하면 «틀린 세액»이 정상 결과처럼 반환되므로 차단한다.";
eq(D(US2), '지원하지 않는 값 2025. 허용: 2026 [종부세법 §3]', '미지원 연도');

console.log('════ 모순 입력 (InconsistentInputError 형식) ════');
eq(D('모순된 입력: exclusive_area=84.5 은 전용면적(㎡)으로 쓸 수 없는 값이다 [농특세법§4 11호]'), '모순된 입력: 입력값=84.5 은 전용면적(㎡)으로 쓸 수 없는 값이다 [농특세법§4 11호]', '«식별자=값» 은 입력값으로');
eq(D('모순된 입력: property_value=-1 — 금액은 0 이상이어야 한다 [상증법 §60]'), '모순된 입력: 입력값=-1 — 금액은 0 이상이어야 한다 [상증법 §60]', '줄표가 있어도 꼬리말이 아니면 남긴다');

console.log('════ 그대로 두는 것 ════');
for (const s of ['입력 부족', '지원하지 않는 연도', '배우자 실제 상속액이 필요합니다', '주택 수를 확정할 수 없다',
                 '엔진 응답 형식이 맞지 않습니다(상태 없음) — 잠시 후 다시 시도하거나 상담을 이용하세요',
                 '취득 당시 조정대상지역 여부를 확인하세요']) {
  eq(D(s), s, '식별자 없는 문구는 그대로: ' + s);
}
eq(D(''), '', '빈 문자열');
eq(D(null), '', 'null');
eq(D(undefined), '', 'undefined');
eq(D('  양끝 공백  '), '양끝 공백', '공백 정리');
eq(D(12), '12', '문자열이 아닌 값도 문자열로');

console.log('════ 화면 배선 — 표시 지점이 변환기를 거친다 ════');
const wired = [
  ['ReportCompare.jsx', /엔진 안내: \{window\.jtEngineMessageForDisplay\(calc\.engineMessage\)\}/],
  ['ReportBurdenedOptimize.jsx', /엔진 안내: \{window\.jtEngineMessageForDisplay\(calc\.engineMessage\)\}/],
  ['ReportGift.jsx', /const engineMsg = window\.jtEngineMessageForDisplay\(calc\.engineMessage\)/],
  ['ReportComprehensive.jsx', /window\.jtEngineMessageForDisplay\(calc\.engineMessage\) \|\|/],
  ['ReportProperty.jsx', /window\.jtEngineMessageForDisplay\(calc\.engineMessage\) \|\|/],
  ['ReportInheritance.jsx', /window\.jtEngineMessageForDisplay\(calc\.engineMessage\) \|\|/],
];
for (const [f, re] of wired) {
  const code = fs.readFileSync(SRC(f), 'utf8');
  checks++;
  if (re.test(code)) console.log('PASS  ' + f + ' 표시 지점이 변환기를 거친다');
  else { fails++; console.log('FAIL  ' + f + ' 표시 지점이 변환기를 거치지 않는다'); }
  /* 변환기를 거치지 않은 «engineMessage 표시»가 남아 있으면 안 된다: 문자열 연결·JSX 삽입에 날것이 쓰이는지 */
  const raw = code.match(/(['"]엔진 안내: ['"] \+ calc\.engineMessage|\{String\(calc\.engineMessage\)\}|\(calc\.engineMessage \|\| ')/g);
  checks++;
  if (!raw) console.log('PASS  ' + f + ' 날것 engineMessage 표시 없음');
  else { fails++; console.log('FAIL  ' + f + ' 날것 engineMessage 표시 남음: ' + raw.join(' | ')); }
}

console.log(`\n${fails ? 'FAIL' : 'OK'}: ${checks - fails}/${checks} checks`);
if (fails) process.exit(1);

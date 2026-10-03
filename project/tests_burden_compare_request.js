/* 처분 비교·부담부증여 — 화면 답 → 엔진 요청 변환과 응답 판독을 «실행»으로 고정한다 (261003 정확성 개편).

   왜 필요한가: 두 화면은 종전에 요청 변환을 runAnalysis 안에 두어 시험이 없었고, 화면이 묻지 않은 사실을
   채워 보내거나(취득가 빈칸 → 엔진이 시세의 절반으로 가정) 값을 뭉갰다(보유 1.5년 → 2년).
   여기서는 소스에서 순수 함수 본문을 꺼내 실행한다(tests_calc_response.js 와 같은 방식).

   고정하는 것
   · 세액을 좌우하는 사실(취득가·취득일·주택 수·채무액)이 없으면 요청을 만들지 않는다.
   · 사용자가 넣은 값이 «그대로» 간다 — 반올림·날짜 밀림·기본값 대체가 없다.
   · 「모름」은 값을 보내지 않는다(엔진이 모름으로 처리).
   · 엔진의 거부(오류)는 연결 실패와 구분된다. 0원·누락 응답은 정밀 결과가 되지 못한다. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const assert = require('node:assert/strict');
const read = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');

let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const ok = (v, label) => { assert.ok(v, label); checks++; };

function fn(src, name) {
  const m = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\r?\\n}\\r?\\n'));
  assert.ok(m, name + ' 함수를 소스에서 찾지 못함');
  return m[0];
}
const common = read('Report.jsx');
const validSrc = common.match(/window\.jtValidCalc = function[\s\S]*?\n  };/)[0];

// ───────────────────────── 부담부증여 ─────────────────────────
const bgSrc = read('ReportBurdenedOptimize.jsx');
const bg = { window: {} };
vm.runInNewContext(validSrc + '\n' + fn(bgSrc, 'bgValidISODate') + fn(bgSrc, 'bgIsoDate') + fn(bgSrc, 'bgIsDwelling') + fn(bgSrc, 'bgNeedsDoneeHouses') + fn(bgSrc, 'bgApplyAnswer') + fn(bgSrc, 'bgBuildBody') + fn(bgSrc, 'bgReadResponse'), bg);
const TODAY = '2026-10-03';

const bgAnswers = {
  propertyValue: '1500000000', assetType: 'house', acquisitionPrice: '400000000',
  acquisitionDate: '2016-09-03', actualDebt: '437000000', doneeCanRepay: 'yes',
  donorHouseCount: '0', recipient: 'child_adult', doneeHouseCount: '0', adjustedZone: 'no',
};
eq(JSON.parse(JSON.stringify(bg.bgBuildBody(bgAnswers, TODAY).body)), {
  property_value: 1500000000, acquisition_price: 400000000, acquisition_date: '2016-09-03',
  relationship: '직계존속', donee_age: 30, is_regulated_area: false, property_type: '주택',
  donor_other_house_count: 0, max_debt: 437000000, regulated_at_acquisition: false, donee_can_repay: true,
  donee_other_house_count: 0,
}, '부담부증여: 답이 그대로 요청이 된다');
// 받는 분 세대의 주택 수(엔진 R7-F1): 채무 부분이 유상취득(변제 능력 증명 가능)이고 받는 분이 성년 자녀일 때만 묻고 보낸다
eq(bg.bgBuildBody({ ...bgAnswers, doneeHouseCount: '2' }, TODAY).body.donee_other_house_count, 2, '받는 분 세대의 다른 주택 2채');
eq(bg.bgBuildBody({ ...bgAnswers, doneeHouseCount: '3' }, TODAY).body.donee_other_house_count, 3, '받는 분 세대의 다른 주택 3채 이상');
ok(!('donee_other_house_count' in bg.bgBuildBody({ ...bgAnswers, doneeHouseCount: 'unknown' }, TODAY).body), '「모름」 → 보내지 않는다(엔진이 1주택 기준으로 계산하고 경고)');
ok(bg.bgBuildBody({ ...bgAnswers, doneeHouseCount: undefined }, TODAY).error, '성년 자녀·유상취득인데 받는 분 세대의 주택 수를 답하지 않으면 요청 거부');
for (const [over, label] of [
  [{ recipient: 'spouse' }, '배우자(증여자와 같은 세대 — 엔진이 증여자 세대의 주택 수를 쓴다)'],
  [{ recipient: 'child_minor' }, '미성년 자녀(같은 세대)'],
  [{ doneeCanRepay: 'no' }, '변제 능력 없음(채무 부분도 증여 취득)'],
  [{ doneeCanRepay: 'unknown' }, '변제 능력 모름'],
  [{ actualDebt: '0' }, '채무 0'],
  [{ assetType: 'land' }, '토지'],
]) {
  const rbh = bg.bgBuildBody({ ...bgAnswers, doneeHouseCount: undefined, ...over }, TODAY);
  ok(rbh.body && !('donee_other_house_count' in rbh.body), '받는 분 세대의 주택 수를 묻지도 보내지도 않는다: ' + label);
  ok(!('donee_other_house_count' in bg.bgBuildBody({ ...bgAnswers, doneeHouseCount: '2', ...over }, TODAY).body), '낡은 답이 있어도 보내지 않는다: ' + label);
}
eq(bg.bgBuildBody({ ...bgAnswers, donorHouseCount: '3' }, TODAY).body.donor_other_house_count, 3, '증여자 세대의 다른 주택 3채 이상');
for (const [id, v] of [['assetType', 'land'], ['actualDebt', '1'], ['doneeCanRepay', 'no'], ['recipient', 'spouse']]) {
  ok(!('doneeHouseCount' in bg.bgApplyAnswer(bgAnswers, id, v)), id + ' 변경 → 받는 분 세대의 주택 수 답 삭제');
}
ok(bg.bgApplyAnswer(bgAnswers, 'adjustedZone', 'yes').doneeHouseCount === '0', '무관한 답 변경은 받는 분 세대의 주택 수를 건드리지 않는다');

const bgBody = over => bg.bgBuildBody({ ...bgAnswers, ...over }, TODAY);
eq(bgBody({ doneeCanRepay: 'no' }).body.donee_can_repay, false, '변제 능력 「아니오」 → false');
ok(!('standard_value' in bgBody({}).body), '공시가격을 비우면 보내지 않는다(엔진이 미입력으로 처리)');
ok(!('standard_value' in bgBody({ standardValue: '0' }).body), '공시가격 0 도 미입력');
eq(bgBody({ standardValue: '900000000' }).body.standard_value, 900000000, '공시가격 입력 → 그대로');
ok(!('donee_can_repay' in bgBody({ doneeCanRepay: 'unknown' }).body), '변제 능력 「모름」 → 값을 보내지 않는다');
ok(!('donee_can_repay' in bgBody({ actualDebt: '0', doneeCanRepay: 'yes' }).body), '채무 0 이면 변제 능력을 보내지 않는다');
eq(bgBody({ actualDebt: '0' }).body.max_debt, 0, '채무 0 은 0 으로 간다(미입력과 다르다)');
eq(bgBody({ donorHouseCount: '2' }).body.donor_other_house_count, 2, '다른 주택 수');
eq(bgBody({ adjustedZone: 'yes' }).body.is_regulated_area, true, '조정대상지역 「네」');
eq(bgBody({ adjustedZone: 'unknown' }).body.is_regulated_area, false, '조정대상지역 「모름」 → 비조정으로 계산(결과 화면이 전제를 알린다)');
eq(bgBody({ recipient: 'spouse' }).body.relationship, '배우자', '배우자');
eq(bgBody({ recipient: 'child_minor' }).body.donee_age, 10, '미성년');
eq(bgBody({ assetType: 'land' }).body.property_type, '토지', '토지');
// 취득일은 입력한 날짜 그대로 — 연 단위 반올림도, 월 환산 밀림도 없다
for (const d of ['2025-03-31', '2024-02-29', '2025-04-15']) eq(bgBody({ acquisitionDate: d, regulatedAtAcq: 'no' }).body.acquisition_date, d, '취득일 ' + d);
// 취득 당시 조정대상지역(1세대1주택 거주 요건) — 지금의 지정 여부와 다른 사실 (TASK-261003-007 R1-F1)
eq(bgBody({}).body.regulated_at_acquisition, false, '기준일 전 취득(2016)은 거주 요건 없음 → false');
const late = { acquisitionDate: '2020-01-01' };
eq(bgBody({ ...late, regulatedAtAcq: 'yes' }).body.regulated_at_acquisition, true, '취득 당시 조정대상지역 「네」');
eq(bgBody({ ...late, regulatedAtAcq: 'no' }).body.regulated_at_acquisition, false, '취득 당시 조정대상지역 「아니오」');
eq(bgBody({ ...late, regulatedAtAcq: 'unknown' }).body.regulated_at_acquisition, true, '취득 당시 「모름」 → 유리하게 추정하지 않는다(true)');
ok(bgBody({ ...late }).error, '기준일 이후 취득인데 취득 당시 지역을 답하지 않으면 요청 거부');
ok(!('regulated_at_acquisition' in bgBody({ ...late, assetType: 'land' }).body), '주택이 아니면 거주 요건 사실을 보내지 않는다');
// 오피스텔은 검증되지 않은 조합 → 요청을 만들지 않고 차단한다(금액 대신 「세무사 확인 필요」) (TASK-261003-006 R6-F2·007 R2-F1)
const offi = { ...late, assetType: 'officetel' };
for (const over of [{}, { regulatedAtAcq: 'yes' }, { regulatedAtAcq: 'no', moveInDate: '2020-03-01' }]) {
  const rb = bgBody({ ...offi, ...over });
  ok(rb.blocked === true && !rb.body && !rb.error, '오피스텔 → 차단(요청 없음)');
}
assert.match(bgSrc, /if \(built\.blocked\) \{ setReport\(\{ calc: \{ precise: false, blocked: true/, '차단이면 엔진을 부르지 않고 안내 화면으로');
checks++;
// 답 저장: 자산 유형·취득일이 바뀌면 딸린 답(취득 당시 지역·전입일)을 지운다 — 낡은 답이 다른 조건의 요청에 실리지 않게 (007 R3-F1)
{
  const a0 = { assetType: 'house', acquisitionDate: '2020-01-01', regulatedAtAcq: 'no', moveInDate: '2020-03-01', propertyValue: '1' };
  let a1 = bg.bgApplyAnswer(a0, 'assetType', 'land');
  ok(!('regulatedAtAcq' in a1) && !('moveInDate' in a1) && a1.propertyValue === '1' && a1.assetType === 'land', '유형 변경 → 딸린 답 삭제, 나머지 보존');
  a1 = bg.bgApplyAnswer(a0, 'acquisitionDate', '2022-01-01');
  ok(!('regulatedAtAcq' in a1) && !('moveInDate' in a1) && a1.acquisitionDate === '2022-01-01', '취득일 변경 → 딸린 답 삭제');
  a1 = bg.bgApplyAnswer(a0, 'assetType', 'house');
  ok(a1.regulatedAtAcq === 'no' && a1.moveInDate === '2020-03-01', '같은 값을 다시 고르면 지우지 않는다');
  a1 = bg.bgApplyAnswer(a0, 'propertyValue', '2');
  ok(a1.regulatedAtAcq === 'no' && a1.moveInDate === '2020-03-01' && a1.propertyValue === '2', '무관한 답 변경은 건드리지 않는다');
  ok(a0.regulatedAtAcq === 'no' && a0.assetType === 'house', '원본 답 객체를 바꾸지 않는다');
  // 채무액이 바뀌면 변제 능력 답을 지운다(R4-F1): 1억·증명 가능 → 0 → 9억으로 바꿔도 낡은 「네」가 실리지 않는다
  let d = { ...bgAnswers, actualDebt: '100000000', doneeCanRepay: 'yes' };
  d = bg.bgApplyAnswer(bg.bgApplyAnswer(d, 'actualDebt', '0'), 'actualDebt', '900000000');
  ok(!('doneeCanRepay' in d), '채무액 변경 → 변제 능력 답 삭제');
  ok(!('donee_can_repay' in bg.bgBuildBody(d, TODAY).body), '낡은 변제 능력 답이 요청에 실리지 않는다(엔진이 모름으로 계산)');
  ok(bg.bgApplyAnswer({ actualDebt: '5', doneeCanRepay: 'yes' }, 'actualDebt', '5').doneeCanRepay === 'yes', '같은 채무액이면 유지');
  // 받는 분이 바뀌면 변제 능력 답을 지운다(R5-F1). 처음 고를 때는 유지한다.
  let rr = bg.bgApplyAnswer({ ...bgAnswers, recipient: undefined }, 'recipient', 'child_adult');
  ok(rr.doneeCanRepay === 'yes', '받는 분을 처음 고를 때는 변제 능력 답 유지');
  rr = bg.bgApplyAnswer(rr, 'recipient', 'spouse');
  ok(!('doneeCanRepay' in rr), '받는 분 변경 → 변제 능력 답 삭제');
  const rb2 = bg.bgBuildBody(rr, TODAY).body;
  ok(rb2.relationship === '배우자' && !('donee_can_repay' in rb2), '낡은 「네」가 새 수증자의 요청에 실리지 않는다');
  // 주택 → 토지 → 주택으로 돌아와도 낡은 답이 요청에 실리지 않는다: 취득 당시 지역을 다시 답해야 한다
  let w = { ...bgAnswers, ...late, regulatedAtAcq: 'no', moveInDate: '2020-03-01' };
  w = bg.bgApplyAnswer(bg.bgApplyAnswer(w, 'assetType', 'land'), 'assetType', 'house');
  ok(bg.bgBuildBody(w, TODAY).error, '유형을 되돌리면 취득 당시 지역을 다시 답해야 한다');
  assert.match(bgSrc, /const setAns = \(id, v\) => setAnswers\(a => bgApplyAnswer\(a, id, v\)\);/);
  checks++;
}
{
  const qs = bgSrc.match(/id: 'regulatedAtAcq'[\s\S]*?showIf: \(a\) => ([^\r\n]*),/)[1];
  const qm = bgSrc.match(/id: 'moveInDate'[\s\S]*?showIf: \(a\) => ([^\r\n]*),/)[1];
  const show = (expr, a) => vm.runInNewContext('(' + expr + ')', { a, bgIsDwelling: bg.bgIsDwelling });
  eq([show(qs, { assetType: 'officetel', acquisitionDate: '2020-01-01' }), show(qs, { assetType: 'land', acquisitionDate: '2020-01-01' }), show(qs, { assetType: 'house', acquisitionDate: '2016-01-01' })],
    [true, false, false], '취득 당시 지역 문항: 주택·오피스텔이고 기준일 이후 취득일 때만 표시');
  eq([show(qm, { assetType: 'officetel' }), show(qm, { assetType: 'house' }), show(qm, { assetType: 'commercial' })], [true, true, false], '전입일 문항: 주택·오피스텔만 표시');
}
// 전입일: 입력했을 때만, 취득일~오늘 사이만
ok(!('move_in_date' in bgBody({}).body), '전입일을 비우면 보내지 않는다(거주하지 않은 것으로 계산)');
eq(bgBody({ moveInDate: '2017-01-10' }).body.move_in_date, '2017-01-10', '전입일 입력 → 그대로');
ok(bgBody({ moveInDate: '2016-01-01' }).error, '전입일이 취득일보다 앞서면 거부');
ok(bgBody({ moveInDate: '2026-12-31' }).error, '미래 전입일 거부');
ok(bgBody({ moveInDate: '2017-02-30' }).error, '없는 전입일 거부');
ok(bgBody({ acquisitionDate: '2099-01-01', regulatedAtAcq: 'no' }).error, '미래 취득일 거부');

for (const [over, label] of [
  [{ propertyValue: '' }, '시세 없음'], [{ propertyValue: '0' }, '시세 0'],
  [{ acquisitionPrice: '' }, '취득가 없음'], [{ acquisitionPrice: '0' }, '취득가 0'],
  [{ acquisitionDate: '' }, '취득일 없음'], [{ acquisitionDate: '2025-02-30' }, '없는 날짜'], [{ acquisitionDate: '2016-9-3' }, '형식 틀린 날짜'],
  [{ actualDebt: '' }, '채무 미입력'], [{ actualDebt: undefined }, '채무 미입력(undefined)'],
  [{ actualDebt: '1500000001' }, '채무 > 시세'],
  [{ donorHouseCount: undefined }, '주택 수 미선택'], [{ donorHouseCount: '' }, '주택 수 빈칸'],
]) {
  const r = bgBody(over);
  ok(r.error && !r.body, '부담부증여 요청 거부: ' + label);
}

// 응답 판독
const row = (debt, total) => ({ 채무비율: debt / 1500000000, 채무액: debt, 증여세: total - 10, 양도세: 0, 취득세: 10, 총세부담: total });
const good = { 채무없는경우세액: 1000, 최적총세부담: 700, 최적채무비율: 0.2, 절세액: 300,
  시뮬레이션결과: [row(0, 1000), row(300000000, 700), row(437000000, 800)], 경고사항: ['전제'] };
const readBg = c => bg.bgReadResponse(c, 437000000);
let r = readBg(good);
ok(r.precise && !r.blocked, '정상 응답 → 정밀');
eq([r.noDebt, r.fullDebt, r.savings, r.maxDebt], [1000, 800, 300, 437000000], '기준 금액은 채무 0 행·입력한 채무 전부 행에서 읽는다');
eq(r.warnings, ['전제'], '엔진 경고 전달');
r = readBg({ 최적채무비율: 0, 절세액: 0, 오류: '채무 > 증여가액', 경고사항: [] });
ok(r.blocked && !r.precise, '엔진 오류 → 차단(세무사 확인 필요), 정밀 아님');
for (const [c, label] of [
  [null, 'null'], [{}, '빈 객체'], [[], '배열'],
  [{ ...good, 시뮬레이션결과: [] }, '빈 표'],
  [{ ...good, 시뮬레이션결과: [row(0, 1000), {}] }, '불완전한 행'],
  [{ ...good, 시뮬레이션결과: [row(300000000, 700), row(437000000, 800)] }, '채무 0 행 없음'],
  [{ ...good, 시뮬레이션결과: [row(0, 1000), row(300000000, 700)] }, '입력한 채무 전부 행 없음'],
  [{ ...good, 채무없는경우세액: 999 }, '채무 없는 경우 금액이 0원 행과 다름'],
  [{ ...good, 채무없는경우세액: 0, 시뮬레이션결과: [row(0, 0), row(437000000, 800)] }, '단순증여 0원(취득세가 늘 있으므로 계산 실패 신호)'],
  [{ ...good, 절세액: 2000 }, '절세액이 단순증여 세액보다 큼'],
  [{ ...good, 최적총세부담: 10, 절세액: 990, 시뮬레이션결과: [...good['시뮬레이션결과'], row(800000000, 10)] }, '입력한 채무 범위 밖의 행으로 만든 절세액(R1-F3)'],
  [{ ...good, 최적총세부담: 650, 절세액: 350 }, '최적총세부담이 표의 최솟값과 다름'],
  [{ ...good, 절세액: 250 }, '절세액이 (채무 0 행 − 최솟값)과 다름'],
  [{ ...good, 시뮬레이션결과: [row(0, 1000), { ...row(300000000, 700), 취득세: 11 }, row(437000000, 800)] }, '행의 세목 합계가 총세부담과 다름'],
  [{ ...good, 시뮬레이션결과: [row(0, 1000), { ...row(300000000.5, 700) }, row(437000000, 800)] }, '정수가 아닌 채무액'],
  [{ ...good, 최적채무비율: 1.2 }, '비율 > 1'],
  [{ ...good, 절세액: NaN }, 'NaN'],
]) {
  r = readBg(c);
  ok(!r.precise && !r.blocked, '부담부증여 응답 불채택: ' + label);
}
// 엔진이 일부 채무액을 계산하지 못해 표에서 뺀 응답은 «범위 전체 비교»가 아니다 → 금액 대신 세무사 확인 (R2-F2)
r = readBg({ ...good, 계산제외채무액: [150000000] });
ok(r.blocked && !r.precise, '계산 제외 채무액이 있으면 차단');
r = readBg({ ...good, 계산제외채무액: 'x' });
ok(r.blocked && !r.precise, '계산 제외 표지가 배열이 아니어도 차단');
r = readBg({ ...good, 계산제외채무액: [] });
ok(r.precise && !r.blocked, '계산 제외가 없으면 정밀');
// 숨겨진 문항의 낡은 답은 상담 내역에 적지 않는다 (R2-F3)
assert.match(bgSrc, /BURDEN_QS\.forEach\(q => \{\r?\n    if \(q\.showIf && !q\.showIf\(answers\)\) return;/);
assert.match(read('ReportCompare.jsx'), /CMP_QS\.forEach\(q => \{\r?\n    if \(q\.showIf && !q\.showIf\(answers\)\) return;/);
checks += 2;
// 절세액 0 은 «정상 결과»다(채무를 넘겨도 줄지 않음) — 화면이 「최대 0원」 대신 그 사실을 말한다
r = readBg({ ...good, 최적총세부담: 1000, 최적채무비율: 0, 절세액: 0, 시뮬레이션결과: [row(0, 1000), row(437000000, 1200)] });
ok(r.precise && r.savings === 0, '절세액 0 은 정밀 결과');
assert.match(bgSrc, /calc\.savings > 0 \?/, '절세액 0 일 때의 분기');
assert.match(bgSrc, /채무를 함께 넘겨도 총세금이 줄지 않습니다/);
assert.doesNotMatch(bgSrc, /채무를 끼울수록 총세금이 내려갑니다/, '방향을 미리 단정하는 고정 문구 금지');
assert.doesNotMatch(bgSrc, /setFullYear\(d\.getFullYear\(\) - Math\.round/, '보유 연수 반올림 금지');
assert.match(bgSrc, /calc\.blocked \?/, '차단 안내 분기');
checks += 5;

// ───────────────────────── 처분 비교 ─────────────────────────
const cmpSrc = read('ReportCompare.jsx');
const cmp = {};
vm.runInNewContext(fn(cmpSrc, 'cmpValidISODate') + fn(cmpSrc, 'cmpIsoDate') + fn(cmpSrc, 'cmpApplyAnswer') + fn(cmpSrc, 'cmpBuildBody'), cmp);
const cmpAnswers = {
  propertyValue: '1200000000', acquisitionPrice: '300000000', housingCount: '2', acquisitionDate: '2011-07-12',
  adjustedZone: 'yes', recipient: 'child_adult', recipientHouseCount: '0', hasSpouse: 'yes', numChildren: '2', otherEstate: '500000000',
};
eq(JSON.parse(JSON.stringify(cmp.cmpBuildBody(cmpAnswers, TODAY).body)), {
  property_value: 1200000000, acquisition_price: 300000000, acquisition_date: '2011-07-12',
  owner_housing_count: 2, is_regulated_area: true, regulated_at_acquisition: false, relationship: '직계존속', recipient_age: 30,
  has_spouse: true, num_children: 2, other_estate_value: 500000000, property_type: '주택',
  recipient_other_house_count: 0,
}, '처분 비교: 답이 그대로 요청이 된다');
const cmpBody = over => cmp.cmpBuildBody({ ...cmpAnswers, ...over }, TODAY);
// 받는 분 세대의 주택 수(엔진 R7-F1): 매매 시나리오의 매수인 취득세율 — 성년 자녀에게만 묻고 보낸다
eq(cmpBody({ recipientHouseCount: '2' }).body.recipient_other_house_count, 2, '처분 비교: 받는 분 세대의 다른 주택 2채');
ok(!('recipient_other_house_count' in cmpBody({ recipientHouseCount: 'unknown' }).body), '처분 비교: 「모름」 → 보내지 않는다');
ok(cmpBody({ recipientHouseCount: undefined }).error, '처분 비교: 성년 자녀인데 받는 분 세대의 주택 수를 답하지 않으면 요청 거부');
for (const rc of ['spouse', 'child_minor']) {
  const rbc = cmpBody({ recipient: rc, recipientHouseCount: '2' });
  ok(rbc.body && !('recipient_other_house_count' in rbc.body), '처분 비교: ' + rc + ' 은 같은 세대 — 묻지도 보내지도 않는다');
}
// 받는 분이 자녀인데 자녀 수 0 은 모순(007 R6-F2)
ok(cmpBody({ numChildren: '0' }).error, '처분 비교: 받는 분이 자녀이면 자녀 수 1 이상');
ok(cmpBody({ recipient: 'spouse', numChildren: '0' }).body, '처분 비교: 받는 분이 배우자이면 자녀 0 허용');
// 받는 분이 바뀌면 그에 딸린 답을 지운다(007 R6-F1·F2)
{
  const k0 = { ...cmpAnswers, recipient: 'spouse', hasSpouse: 'no', numChildren: '0', recipientHouseCount: '1' };
  const k1 = cmp.cmpApplyAnswer(k0, 'recipient', 'child_adult');
  ok(!('hasSpouse' in k1) && !('numChildren' in k1) && !('recipientHouseCount' in k1), '처분 비교: 받는 분 변경 → 배우자 유무·자녀 수·받는 분 세대 주택 수 삭제');
  const k2 = cmp.cmpApplyAnswer({ ...cmpAnswers, recipient: undefined }, 'recipient', 'child_adult');
  ok(k2.hasSpouse === 'yes' && k2.numChildren === '2', '처분 비교: 받는 분을 처음 고를 때는 지우지 않는다');
}
// 현재의 조정대상지역 여부와 취득 «당시»의 여부를 따로 보낸다 (TASK-261003-007 R1-F2)
const cLate = { acquisitionDate: '2020-01-01' };
eq([cmpBody({ ...cLate, adjustedZone: 'yes', regulatedAtAcq: 'no' }).body.is_regulated_area, cmpBody({ ...cLate, adjustedZone: 'yes', regulatedAtAcq: 'no' }).body.regulated_at_acquisition], [true, false], '지금은 조정대상지역·취득 당시는 아님');
eq(cmpBody({ ...cLate, adjustedZone: 'no', regulatedAtAcq: 'yes' }).body.regulated_at_acquisition, true, '지금은 아님·취득 당시는 조정대상지역');
eq(cmpBody({ ...cLate, regulatedAtAcq: 'unknown' }).body.regulated_at_acquisition, true, '취득 당시 「모름」 → true');
ok(cmpBody({ ...cLate }).error, '기준일 이후 취득인데 취득 당시 지역을 답하지 않으면 요청 거부');
// 답 저장: 취득일이 바뀌면 취득 당시 지역·전입일 답을 지운다 (007 R3-F2)
{
  const c0 = { acquisitionDate: '2011-07-12', regulatedAtAcq: 'no', moveInDate: '2012-03-01', housingCount: '1' };
  const c1 = cmp.cmpApplyAnswer(c0, 'acquisitionDate', '2020-01-01');
  ok(!('regulatedAtAcq' in c1) && !('moveInDate' in c1) && c1.housingCount === '1', '처분 비교: 취득일 변경 → 딸린 답 삭제');
  const c2 = cmp.cmpApplyAnswer(c0, 'housingCount', '2');
  ok(c2.regulatedAtAcq === 'no' && c2.moveInDate === '2012-03-01', '처분 비교: 무관한 답 변경은 건드리지 않는다');
  assert.match(cmpSrc, /const setAns = \(id, v\) => setAnswers\(a => cmpApplyAnswer\(a, id, v\)\);/);
  checks++;
}
ok(!('owner_move_in_date' in cmpBody({}).body), '전입일을 비우면 보내지 않는다');
eq(cmpBody({ moveInDate: '2012-03-01' }).body.owner_move_in_date, '2012-03-01', '전입일 입력 → 그대로');
ok(cmpBody({ moveInDate: '2010-01-01' }).error, '전입일이 취득일보다 앞서면 거부');
ok(cmpBody({ acquisitionDate: '2099-01-01', regulatedAtAcq: 'no' }).error, '미래 취득일 거부');
eq(cmpBody({ recipient: 'spouse', numChildren: '0' }).body.num_children, 0, '자녀 0명은 0 으로 간다(받는 분이 배우자일 때)');
ok(!('standard_value' in cmpBody({}).body), '처분 비교: 공시가격을 비우면 보내지 않는다');
eq(cmpBody({ standardValue: '700000000' }).body.standard_value, 700000000, '처분 비교: 공시가격 입력 → 그대로');
eq(cmpBody({ recipient: 'spouse', hasSpouse: undefined }).body.has_spouse, true, '받는 사람이 배우자면 배우자 있음');
eq(cmpBody({ hasSpouse: 'no' }).body.has_spouse, false, '배우자 없음');
eq(cmpBody({ adjustedZone: 'unknown' }).body.is_regulated_area, false, '조정대상지역 「모름」');
eq(cmpBody({ otherEstate: '' }).body.other_estate_value, 0, '다른 재산 빈칸은 0(선택 문항)');
for (const [over, label] of [
  [{ propertyValue: '0' }, '시세 0'],
  [{ acquisitionPrice: '' }, '취득가 없음 — 엔진의 「시세의 절반」 가정으로 넘기지 않는다'], [{ acquisitionPrice: '0' }, '취득가 0'],
  [{ housingCount: '' }, '주택 수 없음'], [{ housingCount: '0' }, '주택 수 0'],
  [{ acquisitionDate: '' }, '취득일 없음'], [{ acquisitionDate: '2011-13-01' }, '없는 날짜'],
  [{ numChildren: '' }, '자녀 수 없음'],
]) {
  const r2 = cmpBody(over);
  ok(r2.error && !r2.body, '처분 비교 요청 거부: ' + label);
}
assert.doesNotMatch(cmpSrc, /시세의 절반으로 가정/, '취득가 미입력 가정 문구 제거');
assert.doesNotMatch(cmpSrc, /clamp\(answers\.housingCount\) \|\| 1/, '주택 수 기본값 1 제거');
assert.doesNotMatch(cmpSrc, /d\.setMonth\(d\.getMonth\(\) - Math\.round/, '보유 연수 월 환산 제거');
assert.match(cmpSrc, /calc\.blocked \?/, '차단 안내 분기');
assert.match(cmpSrc, /c\['실패시나리오'\]/, '일부 시나리오 실패를 차단으로 처리');
checks += 5;

// 처분 비교 응답 수락식 — 실패 시나리오·세목 합계 (TASK-261003-007 R1-F4)
const allValidExpr = cmpSrc.match(/const allValid = ([\s\S]*?);\r?\n/)[1];
const sc = (g, t, i, a) => ({ 총세부담: g + t + i + a, 증여세: g, 양도세: t, 상속세: i, 취득세: a, 계산실패: false });
const cmpGood = { 시나리오별: { 증여: sc(60, 0, 0, 40), 매매: sc(0, 70, 0, 30), 상속: sc(0, 0, 50, 20) }, 실패시나리오: [] };
const acceptCmp = c => !!vm.runInNewContext(allValidExpr, { c, scv: c && c['시나리오별'], window: bg.window });
ok(acceptCmp(cmpGood), '처분 비교 정상 응답 수락');
ok(!acceptCmp({ ...cmpGood, 실패시나리오: ['매매'] }), '실패시나리오가 있으면 불채택');
ok(!acceptCmp({ ...cmpGood, 시나리오별: { ...cmpGood['시나리오별'], 증여: { ...sc(60, 0, 0, 40), 계산실패: true } } }), '계산실패 표시가 있으면 불채택');
ok(!acceptCmp({ ...cmpGood, 시나리오별: { ...cmpGood['시나리오별'], 매매: { ...sc(0, 70, 0, 30), 총세부담: 999 } } }), '세목 합계와 총세부담이 다르면 불채택');
ok(!acceptCmp({ ...cmpGood, 시나리오별: { ...cmpGood['시나리오별'], 상속: { 총세부담: 70 } } }), '세목별 금액이 없으면 불채택');

console.log(`OK burden/compare request: ${checks} checks`);

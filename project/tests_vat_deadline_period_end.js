/* 부가세 신고기한 표시 (261107) — 엔진은 period_end 가 있어야 신고기한을 낸다(부가법 §49①·§67①).
   이 계산기는 2026년 과세기간만 다루므로 신고 구분에서 과세기간 마지막 날(§5①)을 정해 보낸다.
   간이과세자 «신고기한» 단계 조문은 엔진이 §66(예정부과)으로 주므로 화면에서 §67 로 바꿔 보인다. */
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, 'src', 'ReportVat.jsx'), 'utf8');
let fails = 0;
const chk = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails++; };
const slice = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a + 1); return a >= 0 && b > a ? src.slice(a, b) : ''; };

// 1) 과세기간 마지막 날 표 — 실제 상수를 꺼내 실행
const periodSrc = slice('const VAT_PERIOD_END_2026', 'function vatDeadlineFromEngine');
chk('과세기간 표 구간을 찾음', !!periodSrc);
const P = periodSrc ? new Function(periodSrc + '; return {VAT_PERIOD_END_2026, VAT_DEADLINE_CAVEAT, vatPeriodEndForRequest};')() : {};
chk('1기 확정 → 2026-06-30', P.VAT_PERIOD_END_2026 && P.VAT_PERIOD_END_2026['1기_확정'] === '2026-06-30');
chk('2기 확정 → 2026-12-31', P.VAT_PERIOD_END_2026 && P.VAT_PERIOD_END_2026['2기_확정'] === '2026-12-31');
chk('간이 확정 → 2026-12-31', P.VAT_PERIOD_END_2026 && P.VAT_PERIOD_END_2026['간이과세_확정'] === '2026-12-31');
chk('예정신고 구분은 정하지 않음', P.VAT_PERIOD_END_2026 && !('1기_예정' in P.VAT_PERIOD_END_2026) && !('2기_예정' in P.VAT_PERIOD_END_2026));
chk('안내문에 폐업·과세유형 변경·간이과세 포기', typeof P.VAT_DEADLINE_CAVEAT === 'string' && /폐업/.test(P.VAT_DEADLINE_CAVEAT) && /과세유형 변경/.test(P.VAT_DEADLINE_CAVEAT) && /간이과세 포기/.test(P.VAT_DEADLINE_CAVEAT));

const end = P.vatPeriodEndForRequest;
chk('1년 내내 확인은 12개월 명시 전송', src.includes("else if (bt === '간이과세자' && answers.simplifiedPeriod === 'full')") && src.includes('body.simplified_period_months = 12;'));
chk('간이 전체연도 종료일 보존', end({businessType:'간이과세자',simplifiedPeriod:'full'}) === '2026-12-31');
chk('일반 1기 종료일 보존', end({businessType:'일반과세자',periodType:'1기_확정'}) === '2026-06-30');
const part = {businessType:'간이과세자',simplifiedPeriod:'part',simplifiedMonths:'6',simplifiedPeriodEndState:'known',simplifiedPeriodEnd:'2026-06-30'};
chk('실제 6월말 종료일 그대로 전송', end(part) === '2026-06-30');
chk('일부 기간이어도 실제 연말 종료일 허용', end({...part,simplifiedPeriodEnd:'2026-12-31'}) === '2026-12-31');
chk('월중 종료일은 추정하지 않고 그대로 전송', end({...part,simplifiedPeriodEnd:'2026-06-15'}) === '2026-06-15');
chk('종료일 미확인이면 보류', end({...part,simplifiedPeriodEndState:'unknown'}) === null);
chk('과거 날짜가 남아도 미확인은 보류', end({...part,simplifiedPeriodEndState:undefined}) === null);
for (const value of ['2026-02-30','2025-12-31','', '2026-6-30']) { let blocked=false;try{end({...part,simplifiedPeriodEnd:value});}catch(e){blocked=true;}chk('잘못된 종료일 차단 '+value,blocked); }
chk('종료일 미확인은 period_end를 생략하고 엔진이 세액 판단', src.includes('...(periodEnd ? { period_end: periodEnd } : {})') && !src.includes('if (periodEnd === null)'));
chk('일부 기간 종료일 확인과 미확인 선택지', src.includes("id: 'simplifiedPeriodEndState'") && src.includes("['unknown', '아직 확인하지 못했어요', '신고기한 미확인 · 확인된 자료로 세액 계산']"));
chk('실제 종료일 입력은 확인한 일부 기간만', src.includes("a.simplifiedPeriod === 'part' && a.simplifiedPeriodEndState === 'known'"));
chk('화면·전달은 엔진 반환 기한 사용', src.includes("calc.deadline = vatDeadlineFromEngine(c);") && (src.match(/if \(calc.deadline\) L.push/g)||[]).length === 2);

// 1-2) 신고 구분 화면 안내가 실제 2026년 기한과 맞음 — 요일을 시험이 직접 계산(국기법 §5① 토·일 이월)
const roll = (iso) => { const d = new Date(iso + 'T00:00:00Z'); while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1); return d; };
const jul = roll('2026-07-25'), jan = roll('2027-01-25');
const md = (d) => (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
const pblock = slice("id: 'periodType'", 'showIf');
chk('2026 1기 기한(토·일 이월 반영)이 선택지에 보임', md(jul) === '7/27' && pblock.includes("['1기_확정', '1기 확정 (1~6월분)', '신고·납부 7/25 (2026년은 토요일이라 " + md(jul) + ")']"));
chk('2기 기한 2027-01-25 는 평일이라 1/25 그대로', md(jan) === '1/25' && pblock.includes("'신고·납부 다음해 1/25'"));
chk('신고 구분 안내에 §49①·국기법 §5① 이월 규칙', pblock.includes('(부가법 §49①)') && pblock.includes('기한이 토요일·일요일, 공휴일·대체공휴일, 노동절이면 그 다음날로 넘어갑니다(국기법 §5①)'));

// 2) 요청 본문에 period_end 가 period_type 과 같은 규칙으로 실림
chk('요청에 period_end 를 실음', src.includes("...(periodEnd ? { period_end: periodEnd } : {})") && src.includes("const periodEnd = vatPeriodEndForRequest(answers);"));
chk('period_type 규칙은 그대로', src.includes("period_type: bt === '간이과세자' ? '간이과세_확정' : (answers.periodType || '1기_확정'),"));

// 3) 공제 확인의 과세기간 마지막 날이 신고 구분과 다르면 계산 전에 막음 — 실제 함수 실행
const creditSrc = slice('function vatCreditInputs', '// 261107: 엔진 키');
chk('공제 입력 함수 구간을 찾음', !!creditSrc);
const vatCreditInputs = creditSrc ? new Function(creditSrc + '; return vatCreditInputs;')() : null;
// 261107 묶음 2 ⑤: 간이 공제 계약은 1년 내내 사업한 경우만 — 새 질문 simplifiedPeriod 의 답을 넣는다
const ans = { businessType: '간이과세자', simplifiedPeriod: 'full', creditScope: 'yes', creditPeriodEnd: '2026-06-30', creditEvidence: '카드매출 집계표', cardEligible: 'yes', cardPriorSupply: '0', cardPriorUsed: '0' };
let msg = '';
try { vatCreditInputs(ans, { credit_card_sales: 1000000, period_end: '2026-12-31' }); } catch (e) { msg = e.message; }
chk('다른 종료일이면 오류', /선택한 신고기간/.test(msg));
let ok = null;
try { ok = vatCreditInputs(Object.assign({}, ans, { creditPeriodEnd: '2026-12-31' }), { credit_card_sales: 1000000, period_end: '2026-12-31' }); } catch (e) { ok = e; }
chk('같은 종료일이면 통과', ok && ok.period_end === '2026-12-31' && ok.credit_facts && ok.credit_facts.period_end === '2026-12-31');
let partMsg = '';
try { vatCreditInputs(Object.assign({}, ans, { simplifiedPeriod: 'part', creditPeriodEnd: '2026-12-31' }), { credit_card_sales: 1000000, period_end: '2026-12-31' }); } catch (e) { partMsg = e.message; }
chk('일부 기간 간이 공제는 계산 전에 막음', /일부 기간만 사업한 간이과세자/.test(partMsg));

// 4) 간이과세자 신고기한 단계 조문 §66 → §67 (화면만, 원본 불변)
const stepsSrc = slice('const VAT_SECTOR_DISPLAY', '// 261107: 엔진은 period_end');
const vatStepsForDisplay = stepsSrc ? new Function(stepsSrc + '; return vatStepsForDisplay;')() : null;
const eng = [{ '항목': '신고기한', '금액': 0, '조문': '부§66', '비고': '2027-01-25' }, { '항목': '신고기한', '금액': 0, '조문': '부§49', '비고': '2026-07-27' }];
const shown = vatStepsForDisplay ? vatStepsForDisplay(eng) : [];
chk('간이 신고기한 조문 → 부§67', shown[0] && shown[0]['조문'] === '부§67' && shown[0]['비고'] === '2027-01-25');
chk('일반 신고기한(부§49)은 그대로', shown[1] === eng[1]);
chk('엔진 응답 원본은 바꾸지 않음', eng[0]['조문'] === '부§66');

// 5) 화면: 기한이 있을 때만 안내 한 줄, 없으면 종전 문구
chk('기한 없을 때 종전 문구 유지', src.includes("const deadline = calc.deadline || '과세기간 종료일 또는 엔진 기한 미확인 · 별도 확인';"));
// 261107 묶음 2(Codex 059 R2-F1): 간이 일부 기간이면 폐업·유형 전환 안내로 바꿔 보인다 — 기한이 있을 때만이라는 조건은 그대로
chk('안내 한 줄은 기한이 있을 때만', /const deadlineCaveat = calc\.deadline \? <span[^>]*>\{calc\.simplifiedPartYear \? VAT_PART_YEAR_DEADLINE_CAVEAT : <>기한은 \{VAT_DEADLINE_CAVEAT\}<\/>\}<\/span> : null;/.test(src));
chk('면제 문구·납부 문구 두 곳에 안내', (src.match(/\{deadline\}<\/strong>\.?\{deadlineCaveat\}/g) || []).length === 2);

const won=n=>n.toLocaleString('ko-KR')+'원';
const display=new Function('vatWon',slice('function vatOutputLabel','const VAT_QS')+';return {vatOutputLabel,vatFormatStepValue};')(won);
const summaries = new Function('VAT_QS','vatWon','vatOutputLabel','vatFormatStepValue',slice('function buildVatDetail','function JTReportVat')+';return {buildVatDetail,buildVatKakao};')([],won,display.vatOutputLabel,display.vatFormatStepValue);
const calculated={precise:true,deadline:'2026-07-27',netTax:360000,detail:{},steps:[],businessType:'간이과세자'};
chk('전달 상세에 엔진 7월27일 유지', summaries.buildVatDetail(part,calculated).includes('신고기한: 2026-07-27'));
chk('상담 요약에 실제 종료일과 엔진 기한 유지', summaries.buildVatKakao({...part,supplyPrice:'24000000'},calculated).includes('실제 과세기간 종료일: 2026-06-30') && summaries.buildVatKakao(part,calculated).includes('신고기한: 2026-07-27'));
chk('종료일 미확인 상담 요약은 날짜 추정 안 함', !summaries.buildVatKakao({...part,simplifiedPeriodEndState:'unknown'}, {precise:false}).includes('신고기한:') && summaries.buildVatKakao({...part,simplifiedPeriodEndState:'unknown'}, {precise:false}).includes('종료일: 미확인'));

chk('종료일만 모르면 확정된 엔진 세액은 전달', summaries.buildVatKakao({...part,simplifiedPeriodEndState:'unknown'}, {...calculated,deadline:null}).includes('360,000원') && !summaries.buildVatKakao({...part,simplifiedPeriodEndState:'unknown'}, {...calculated,deadline:null}).includes('신고기한:'));

chk('사용되지 않는 정적 신고기한표 없음', !/const VAT_DEADLINE\s*=/.test(src));
chk('일반 매출세액 산식 보존', display.vatOutputLabel('일반과세자') === '매출세액 (공급가액 × 10%)');
chk('간이 산출세액 산식은 공급대가와 업종율', display.vatOutputLabel('간이과세자') === '산출세액 (공급대가 × 업종별 부가가치율 × 10%)');
for(const label of ['사업자 유형','과세기간','부가가치율','신고기한'])chk('비금액 '+label+' 0원 방지', display.vatFormatStepValue({항목:label,금액:0}) === '—');
for(const label of ['매입세액 합계','납부세액','전자세금계산서 발급공제'])chk('실제 금액 '+label+' 0원 보존', display.vatFormatStepValue({항목:label,금액:0}) === '0원');
const simpleCalc={...calculated,detail:{매출세액:360000,전자세금계산서공제:0,간이매입공제:5000},steps:[{항목:'신고기한',금액:0,조문:'부§67'}]};
chk('간이 전달 상세는 간이 산식과0.5% 표기', summaries.buildVatDetail(part,simpleCalc).includes('산출세액 (공급대가 × 업종별 부가가치율 × 10%)') && summaries.buildVatDetail(part,simpleCalc).includes('적격 매입 공급대가 × 0.5%'));
chk('간이 상담 요약도 같은 산식', summaries.buildVatKakao(part,simpleCalc).includes('산출세액 (공급대가 × 업종별 부가가치율 × 10%)'));
chk('일반 전달 상세 기존 산식 보존', summaries.buildVatDetail({}, {...simpleCalc,businessType:'일반과세자'}).includes('매출세액 (공급가액 × 10%)'));
chk('전달 단계 날짜가0원이 아님', summaries.buildVatDetail(part,simpleCalc).includes('신고기한: —'));
chk('전자발급 공제행은 실제 입력한 개인 일반만', src.includes("calc.businessType === '일반과세자' && answers.isCorporate !== 'yes' && Number(answers.eInvoiceCount) > 0 && typeof d['전자세금계산서공제'] === 'number'"));
chk('의제매입 공제행도 일반만', src.includes("calc.businessType === '일반과세자' && !!d['의제매입공제'] && <tr>"));
chk('간이 0.5%와 일반 적격매입·의제매입을 구분', src.includes("calc.businessType === '간이과세자' ? '적격 세금계산서 등 증빙을 갖춘 매입 공급대가의 0.5%") && src.includes(" : '과세 매입은 적격 증빙과 공제 요건을 확인하세요. 면세농산물 등의 의제매입세액공제"));

const types = vatStepsForDisplay([{항목:'사업자 유형',조문:'부§3',금액:0,비고:'간이과세자'}]);
chk('사업자등록 유형은 입력값으로 표시',types[0].항목==='입력한 사업자 유형' && !types[0].조문 && display.vatFormatStepValue(types[0])==='—');
const net = vatStepsForDisplay([{항목:'차감 세액',조문:'부§63',금액:360000}])[0];
chk('차감 후 세액과 초과 공제의 범위',net.항목==='공제 후 납부세액' && net.금액===360000 && net.비고.includes('공제액이 납부세액을 초과한 부분'));
const confirmed = new Function(slice('function vatAmountConfirmed', 'function vatOutputLabel')+';return vatAmountConfirmed;')();
chk('확인한 무실적과 미입력 구분',confirmed(0) && confirmed('0') && ![null,undefined,'', ' ', -1, 1.1].some(confirmed));
chk('잘못된 가산세 일괄 적용·원자료 임의 0 안내 방지',!src.includes('1일 0.022%') && !src.includes('해당 금액을 0으로 두고') && src.includes('신고 내용과 납부 경과기간'));
const rawRefundSteps=[{항목:'최종 납부세액',금액:-200000,조문:''},{항목:'차감 세액',금액:-200000},{항목:'최종 납부세액',금액:0},{항목:'최종 납부세액',금액:200000}];
const refundShown=vatStepsForDisplay(rawRefundSteps);
chk('음수 최종납부는 양수 최종환급으로 표시',refundShown[0].항목==='최종 환급세액'&&refundShown[0].금액===200000);
chk('환급 표시가 원본 엔진값을 바꾸지 않음',rawRefundSteps[0].항목==='최종 납부세액'&&rawRefundSteps[0].금액===-200000);
chk('차감단계 음수·납부0·납부양수 보존',refundShown[1]===rawRefundSteps[1]&&refundShown[2]===rawRefundSteps[2]&&refundShown[3]===rawRefundSteps[3]);
chk('공유 상세도 최종 환급20만원',summaries.buildVatDetail({}, {...calculated,businessType:'일반과세자',isRefund:true,refund:200000,netTax:-200000,steps:refundShown}).includes('최종 환급세액: 200,000원'));

console.log(fails ? `\n${fails} fails` : '\nall pass');
process.exit(fails ? 1 : 0);

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
const P = periodSrc ? new Function(periodSrc + '; return {VAT_PERIOD_END_2026, VAT_DEADLINE_CAVEAT};')() : {};
chk('1기 확정 → 2026-06-30', P.VAT_PERIOD_END_2026 && P.VAT_PERIOD_END_2026['1기_확정'] === '2026-06-30');
chk('2기 확정 → 2026-12-31', P.VAT_PERIOD_END_2026 && P.VAT_PERIOD_END_2026['2기_확정'] === '2026-12-31');
chk('간이 확정 → 2026-12-31', P.VAT_PERIOD_END_2026 && P.VAT_PERIOD_END_2026['간이과세_확정'] === '2026-12-31');
chk('예정신고 구분은 정하지 않음', P.VAT_PERIOD_END_2026 && !('1기_예정' in P.VAT_PERIOD_END_2026) && !('2기_예정' in P.VAT_PERIOD_END_2026));
chk('안내문에 폐업·과세유형 변경·간이과세 포기', typeof P.VAT_DEADLINE_CAVEAT === 'string' && /폐업/.test(P.VAT_DEADLINE_CAVEAT) && /과세유형 변경/.test(P.VAT_DEADLINE_CAVEAT) && /간이과세 포기/.test(P.VAT_DEADLINE_CAVEAT));

// 1-2) 신고 구분 화면 안내가 실제 2026년 기한과 맞음 — 요일을 시험이 직접 계산(국기법 §5① 토·일 이월)
const roll = (iso) => { const d = new Date(iso + 'T00:00:00Z'); while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1); return d; };
const jul = roll('2026-07-25'), jan = roll('2027-01-25');
const md = (d) => (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
const pblock = slice("id: 'periodType'", 'showIf');
chk('2026 1기 기한(토·일 이월 반영)이 선택지에 보임', md(jul) === '7/27' && pblock.includes("['1기_확정', '1기 확정 (1~6월분)', '신고·납부 7/25 (2026년은 토요일이라 " + md(jul) + ")']"));
chk('2기 기한 2027-01-25 는 평일이라 1/25 그대로', md(jan) === '1/25' && pblock.includes("'신고·납부 다음해 1/25'"));
chk('신고 구분 안내에 §49①·국기법 §5① 이월 규칙', pblock.includes('(부가법 §49①)') && pblock.includes('기한이 토요일·일요일, 공휴일·대체공휴일, 노동절이면 그 다음날로 넘어갑니다(국기법 §5①)'));

// 2) 요청 본문에 period_end 가 period_type 과 같은 규칙으로 실림
chk('요청에 period_end 를 실음', src.includes("period_end: VAT_PERIOD_END_2026[bt === '간이과세자' ? '간이과세_확정' : (answers.periodType || '1기_확정')],"));
chk('period_type 규칙은 그대로', src.includes("period_type: bt === '간이과세자' ? '간이과세_확정' : (answers.periodType || '1기_확정'),"));

// 3) 공제 확인의 과세기간 마지막 날이 신고 구분과 다르면 계산 전에 막음 — 실제 함수 실행
const creditSrc = slice('function vatCreditInputs', '// 261107: 엔진 키');
chk('공제 입력 함수 구간을 찾음', !!creditSrc);
const vatCreditInputs = creditSrc ? new Function(creditSrc + '; return vatCreditInputs;')() : null;
const ans = { businessType: '간이과세자', creditScope: 'yes', creditPeriodEnd: '2026-06-30', creditEvidence: '카드매출 집계표', cardEligible: 'yes', cardPriorSupply: '0', cardPriorUsed: '0' };
let msg = '';
try { vatCreditInputs(ans, { credit_card_sales: 1000000, period_end: '2026-12-31' }); } catch (e) { msg = e.message; }
chk('다른 종료일이면 오류', /선택한 신고기간/.test(msg));
let ok = null;
try { ok = vatCreditInputs(Object.assign({}, ans, { creditPeriodEnd: '2026-12-31' }), { credit_card_sales: 1000000, period_end: '2026-12-31' }); } catch (e) { ok = e; }
chk('같은 종료일이면 통과', ok && ok.period_end === '2026-12-31' && ok.credit_facts && ok.credit_facts.period_end === '2026-12-31');

// 4) 간이과세자 신고기한 단계 조문 §66 → §67 (화면만, 원본 불변)
const stepsSrc = slice('const VAT_SECTOR_DISPLAY', '// 261107: 엔진은 period_end');
const vatStepsForDisplay = stepsSrc ? new Function(stepsSrc + '; return vatStepsForDisplay;')() : null;
const eng = [{ '항목': '신고기한', '금액': 0, '조문': '부§66', '비고': '2027-01-25' }, { '항목': '신고기한', '금액': 0, '조문': '부§49', '비고': '2026-07-27' }];
const shown = vatStepsForDisplay ? vatStepsForDisplay(eng) : [];
chk('간이 신고기한 조문 → 부§67', shown[0] && shown[0]['조문'] === '부§67' && shown[0]['비고'] === '2027-01-25');
chk('일반 신고기한(부§49)은 그대로', shown[1] === eng[1]);
chk('엔진 응답 원본은 바꾸지 않음', eng[0]['조문'] === '부§66');

// 5) 화면: 기한이 있을 때만 안내 한 줄, 없으면 종전 문구
chk('기한 없을 때 종전 문구 유지', src.includes("const deadline = calc.deadline || '엔진 기한 미확인 · 별도 확인';"));
chk('안내 한 줄은 기한이 있을 때만', /const deadlineCaveat = calc\.deadline \? <span[^>]*>기한은 \{VAT_DEADLINE_CAVEAT\}<\/span> : null;/.test(src));
chk('면제 문구·납부 문구 두 곳에 안내', (src.match(/\{deadline\}<\/strong>\.?\{deadlineCaveat\}/g) || []).length === 2);

console.log(fails ? `\n${fails} fails` : '\nall pass');
process.exit(fails ? 1 : 0);

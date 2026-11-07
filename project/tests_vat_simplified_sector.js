/* 간이과세 업종 선택지 표기 (261107) — 부가법 시행령 §111② 1호 15% = 소매업·재생용 재료수집 및 판매업·음식점업.
   도매업은 §109②3호로 간이과세 배제 업종이라 «도매»를 15% 선택지에 쓰지 않는다. 엔진 키 '도소매업'은 계약이라 유지. */
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, 'src', 'ReportVat.jsx'), 'utf8');
let fails = 0;
const chk = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails++; };
const a = src.indexOf("id: 'simplifiedSector'"), b = src.indexOf("showIf", a);
const block = src.slice(a, b);
chk('업종 질문 구간을 찾음', a > 0 && b > a);
const opt = block.match(/\['도소매업', '([^']+)', ''\]/);
chk("엔진 키 '도소매업' 유지", !!opt);
chk('15% 선택지 = 소매업·재생용 재료수집 및 판매업', !!opt && opt[1] === '소매업·재생용 재료수집 및 판매업 (15%)');
chk('선택지에 «도매» 없음', !/\['[^']*', '[^']*도매[^']*'/.test(block));
chk('안내문 = §109②3호 원문 범위(재생용 재료수집 및 판매업 제외·상품중개업 포함)', block.includes('도매업(소매업 겸영 포함, 재생용 재료수집 및 판매업은 제외)과 상품중개업은 간이과세를 적용받을 수 없습니다(부가법 시행령 §109②3호)'));
// 결과 화면: 엔진이 «부가가치율» 비고에 키 '도소매업'을 그대로 싣는다 → 화면 표기로 바꾸는지 실제 함수로 확인
const fa = src.indexOf('const VAT_SECTOR_DISPLAY'), fb = src.indexOf('function vatDeadlineFromEngine', fa);
chk('표시 변환 함수 구간을 찾음', fa > 0 && fb > fa);
const vatStepsForDisplay = fa > 0 ? new Function(src.slice(fa, fb) + '; return vatStepsForDisplay;')() : null;
const engineSteps = [{ '항목': '공급대가(부가세 포함)', '금액': 60000000, '조문': '부SS61' }, { '항목': '부가가치율', '금액': 0, '조문': '§63②1호', '비고': '도소매업 15%' }, { '항목': '부가가치율', '금액': 0, '조문': '§63②1호', '비고': '음식점업 15%' }];
const shown = vatStepsForDisplay ? vatStepsForDisplay(engineSteps) : [];
chk('결과 비고 «도소매업 15%» → «소매업·재생용 재료수집 및 판매업 15%»', shown[1] && shown[1]['비고'] === '소매업·재생용 재료수집 및 판매업 15%');
chk('결과 금액은 그대로·다른 단계는 같은 객체', shown[1] && shown[1]['금액'] === 0 && shown[0] === engineSteps[0]);
// 261107 묶음 2 ⑩(오너 «권장안대로»): §63②에는 호가 없다 — 업종 표는 시행령 §111② 표의 호로 보인다
chk('결과 조문 «§63②1호» → «부§63②·령§111② 1호»', shown[1] && shown[1]['조문'] === '부§63②·령§111② 1호');
chk('다른 업종 비고는 그대로·조문만 시행령 호', shown[2] && shown[2]['비고'] === '음식점업 15%' && shown[2]['조문'] === '부§63②·령§111② 1호');
chk('엔진 응답 원본은 바꾸지 않음', engineSteps[1]['비고'] === '도소매업 15%' && engineSteps[1]['조문'] === '§63②1호');
const want = { '도소매업': 1, '음식점업': 1, '제조업': 2, '숙박업': 3, '기타서비스업': 6, '부동산임대업': 5 };
const optKeys = [...block.matchAll(/\['([^']+)', '[^']+', '[^']*'\]/g)].map(x => x[1]);
chk('화면 선택지 6개 = 표의 키', optKeys.length === 6 && optKeys.every(k => k in want));
for (const [k, n] of Object.entries(want)) {
  const st = vatStepsForDisplay ? vatStepsForDisplay([{ '항목': '부가가치율', '금액': 0, '조문': '§63②4호', '비고': k + ' 30%' }])[0] : null;
  chk(`${k} → 령§111② ${n}호`, st && st['조문'] === '부§63②·령§111② ' + n + '호');
}
// 261107 묶음 2 ⑦: 시행령 §111② 5호 «전문·과학 및 기술서비스업(인물사진 및 행사용 영상 촬영업은 제외)» → 6호 30%
chk('40% 선택지에 촬영업 제외 안내', block.includes("['부동산임대업', '금융·보험·전문서비스·부동산임대업 (40%)', '전문서비스 중 인물사진·행사용 영상 촬영업은 제외 → 30%']"));
chk('30% 선택지에 촬영업 안내', block.includes("['기타서비스업', '건설·운수창고·정보통신·기타서비스업 (30%)', '인물사진·행사용 영상 촬영업도 여기(30%)']"));
// 261107 묶음 2 ⑤: 4,800만원 면제는 과세기간이 1년이 안 되면 12개월 환산(부가법 §69③)
// Codex 059 R1-F2: 안내만 하면 일부 기간 매출을 1년치로 계산해 면제로 보일 수 있다 → 개월 수를 받아 엔진에 보낸다
chk('1년 내내 사업 질문(간이만)', /id: 'simplifiedPeriod'[\s\S]*?showIf: \(a\) => a\.businessType === '간이과세자',/.test(src));
chk('개월 수 질문(일부 기간만)', /id: 'simplifiedMonths'[\s\S]*?showIf: \(a\) => a\.businessType === '간이과세자' && a\.simplifiedPeriod === 'part',/.test(src));
chk('요청에 simplified_period_months(1~12, 일부 기간만)', src.includes("if (bt === '간이과세자' && answers.simplifiedPeriod === 'part')") && src.includes('body.simplified_period_months = months;') && src.includes('months < 1 || months > 12'));
// Codex 059 R2: 1월 중 개업 → 12개월(R2-F2) · 다음 버튼은 1~12 정수만(R2-F3) · 상담 요약에 기간(R2-F4) · 폐업·유형 전환 기한 안내(R2-F1)
chk('개월 수 질문 1~12 정수 범위', src.includes('numeric: true, intRange: [1, 12],') && src.includes('Number.isSafeInteger(v) && v >= cur.intRange[0] && v <= cur.intRange[1]'));
chk('상담 요약: 일부 기간은 «사업 기간 공급대가»와 개월 수', src.includes("'· 사업 기간 공급대가: '") && src.includes("'개월 — 중간 개업·휴업·폐업·과세유형 전환)'"));
chk('일부 기간 기한 안내(§5③~⑤)', src.includes('calc.simplifiedPartYear ? VAT_PART_YEAR_DEADLINE_CAVEAT') && src.includes('기한이 달라지니 따로 확인해 주세요(부가법 §5③~⑤)'));
chk('화면이 4,800만원과 직접 비교하지 않음', !src.includes('< 48000000'));
chk('카드·전자 공제는 1년 내내일 때만 full_year 확인', src.includes("if(a.simplifiedPeriod!=='full') throw new Error(") && src.includes('f.full_year_simplified_confirmed=true;'));
const ea = src.indexOf('function vatSimplifiedExemptFromEngine'), eb = src.indexOf('function vatDeadlineFromEngine', ea);
const exempt = ea > 0 ? new Function(src.slice(ea, eb) + '; return vatSimplifiedExemptFromEngine;')() : null;
chk('면제 판정 함수 구간을 찾음', !!exempt);
const st = n => ({ '단계별계산': [{ '항목': n }], '경고사항': [] });
chk('엔진 면제 단계 → 면제', exempt && exempt(st('납부의무 면제(§69)'), '간이과세자', 0) === true);
chk('면제 경고만 있어도 면제', exempt && exempt({ '단계별계산': [], '경고사항': ['… 납부의무가 면제됩니다 (부가법 §69).'] }, '간이과세자', 0) === true);
chk('환산으로 면제 아님 → 면제 아님', exempt && exempt({ '단계별계산': [{ '항목': '공급대가 12개월 환산(§69③)' }], '경고사항': ['… 면제되지 않습니다 (부가법 §69③).'] }, '간이과세자', 0) === false);
chk('세액 있으면 면제 아님', exempt && exempt(st('납부의무 면제(§69)'), '간이과세자', 450000) === false);
chk('일반과세자는 면제 아님', exempt && exempt(st('납부의무 면제(§69)'), '일반과세자', 0) === false);
chk('면제 문구: 일부 기간은 12개월 환산(§69①·③)', src.includes('12개월로 환산한 금액이 4,800만원 미만</strong>이라') && src.includes('(부가법 §69①·③)'));
chk('매출 질문에 일부 기간 안내', src.includes('그 기간의 실제 매출을 넣으세요(다음 질문에서 개월 수를 여쭤봐요)'));
chk('계산 결과 단계에 변환 함수를 거침', /calc\.steps = vatStepsForDisplay\(c\['단계별계산'\] \|\| \[\]\)/.test(src));
chk('계산 요청 키는 엔진 계약 그대로', src.includes("simplified_value_sector: answers.simplifiedSector || '도소매업'"));
chk('음식점업 15% 유지', block.includes("['음식점업', '음식점업 (15%)', '']"));
console.log(fails ? `\n${fails} fails` : '\nall pass');
process.exit(fails ? 1 : 0);

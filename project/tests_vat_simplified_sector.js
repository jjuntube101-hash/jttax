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
chk('결과 금액·조문은 그대로', shown[1] && shown[1]['금액'] === 0 && shown[1]['조문'] === '§63②1호' && shown[0] === engineSteps[0]);
chk('다른 업종 비고는 그대로', shown[2] === engineSteps[2]);
chk('엔진 응답 원본은 바꾸지 않음', engineSteps[1]['비고'] === '도소매업 15%');
chk('계산 결과 단계에 변환 함수를 거침', /calc\.steps = vatStepsForDisplay\(c\['단계별계산'\] \|\| \[\]\)/.test(src));
chk('계산 요청 키는 엔진 계약 그대로', src.includes("simplified_value_sector: answers.simplifiedSector || '도소매업'"));
chk('음식점업 15% 유지', block.includes("['음식점업', '음식점업 (15%)', '']"));
console.log(fails ? `\n${fails} fails` : '\nall pass');
process.exit(fails ? 1 : 0);

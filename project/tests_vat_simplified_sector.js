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
chk('안내문에 도매업 간이과세 배제(§109②3호)', /도매업\(소매업 겸영 포함\)은 간이과세를 적용받을 수 없습니다\(부가법 시행령 §109②3호\)/.test(block));
chk('음식점업 15% 유지', block.includes("['음식점업', '음식점업 (15%)', '']"));
console.log(fails ? `\n${fails} fails` : '\nall pass');
process.exit(fails ? 1 : 0);

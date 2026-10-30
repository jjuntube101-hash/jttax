/* @jsx React.createElement */
/* 부가가치세 계산기 — 일반/간이/면세 → 검증 엔진 /v1/calc/vat
   (부가법 §30 매출세액 10%·§37 매입세액·§46 신용카드공제 1.3%·§63 간이 부가가치율 15~40%).
   일반=매출세액−매입세액−공제 / 간이=공급대가×부가율×10%−공제(환급없음) / 면세=면제(§26).
   납부세액은 신고금액이라 원 단위 정밀 표시(vatWon). 엔진 다운 시 잘못된 세액을 만들지 않고 '정밀 계산 필요'로 안내.
   공통 헬퍼(formatWon·JTReportShell·JTReportConvert·acqKoreanAmount)는 먼저 로드된 파일의 전역 사용. */

const { useState: useVatState } = React;

// 원 단위 정확 표시 (formatWon은 만원 절사 → 신고금액엔 부적합)
function vatWon(n) {
  if (n === null || n === undefined || isNaN(n)) return '0원';
  return Math.round(n).toLocaleString('ko-KR') + '원';
}
function vatKorean(n) {
  if (typeof acqKoreanAmount === 'function') return acqKoreanAmount(n);
  if (!n || n <= 0) return '';
  const units = [[1_0000_0000_0000, '조'], [1_0000_0000, '억'], [1_0000, '만'], [1, '']];
  let rest = Math.round(n), s = '';
  for (const [u, label] of units) { const q = Math.floor(rest / u); if (q > 0) { s += q.toLocaleString('ko-KR') + label + ' '; rest -= q * u; } }
  return s.trim() + '원';
}

// 신고기한 안내 (부가법 §49①/§48/§66)
const VAT_DEADLINE = {
  '1기_확정': '7월 25일',
  '2기_확정': '다음 해 1월 25일',
  '간이과세_확정': '다음 해 1월 25일',
};

const VAT_QS = [
  {
    id: 'businessType', section: '사업자 유형',
    q: '어떤 부가가치세 사업자인가요?',
    sub: '사업자등록증에 적혀 있어요. 헷갈리면 연 매출 1억 400만원 미만이면 보통 간이과세자, 그 이상이면 일반과세자입니다. 농수산물·병의원·학원 등은 면세사업자.',
    opts: [
      ['일반과세자', '일반과세자', '매출세액 10% − 매입세액'],
      ['간이과세자', '간이과세자', '연 매출 1억 400만원 미만 소규모'],
      ['면세사업자', '면세사업자', '농축수산물·병의원·학원 등 부가세 면제'],
    ],
  },
  {
    id: 'isCorporate', section: '사업자 유형',
    q: '개인사업자인가요, 법인인가요?',
    sub: '신용카드·현금영수증 매출세액공제(1.3%)는 개인사업자만 받습니다(부가법 §46). 법인은 해당 없음.',
    opts: [['no', '개인사업자', '신용카드공제 가능'], ['yes', '법인', '']],
    showIf: (a) => a.businessType === '일반과세자',
  },
  {
    id: 'periodType', section: '과세기간',
    q: '어느 기간을 신고하나요?',
    sub: '부가세는 1년에 두 번 확정신고합니다. 상반기(1~6월)분은 7월 25일까지, 하반기(7~12월)분은 다음 해 1월 25일까지.',
    opts: [
      ['1기_확정', '1기 확정 (1~6월분)', '신고·납부 7/25'],
      ['2기_확정', '2기 확정 (7~12월분)', '신고·납부 다음해 1/25'],
    ],
    showIf: (a) => a.businessType === '일반과세자',
  },
  // ── 일반과세자 ──
  {
    id: 'salesAmount', section: '매출', tier: 'core',
    q: '이 기간 매출(공급가액)은 얼마인가요? (원)',
    sub: '세금계산서·신용카드·현금영수증·현금으로 판 금액의 합계예요. 부가세 별도 금액(공급가액)으로 넣어 주세요. 부가세 포함 총액만 안다면 1.1로 나눈 값을 넣으면 됩니다.',
    numeric: true, money: true, allowZero: true,
    showIf: (a) => a.businessType === '일반과세자',
    placeholder: '예: 100,000,000',
  },
  {
    id: 'purchaseAmount', section: '매입', tier: 'core',
    q: '사업 관련 매입(공급가액)은 얼마인가요? (원)',
    sub: '세금계산서·사업용 신용카드로 산 사업 경비(부가세 별도). 이 금액의 10%를 매입세액으로 돌려받아 낼 세금이 줄어요. 인건비·면세 농수산물처럼 부가세 없는 매입은 빼고 넣으세요. 실제 매입이 없으면 0을 입력하고, 금액을 확인하지 못했다면 자료를 먼저 확인해 주세요.',
    numeric: true, money: true, allowZero: true,
    showIf: (a) => a.businessType === '일반과세자',
    placeholder: '예: 60,000,000 (없으면 0)',
  },
  // ── 간이과세자 ──
  {
    id: 'simplifiedSector', section: '업종',
    q: '어떤 업종인가요?',
    sub: '간이과세자는 업종별 「부가가치율」(15~40%)로 세금을 계산합니다(부가법 §63②). 가장 가까운 업종을 골라 주세요.',
    opts: [
      ['도소매업', '소매·도매업 (15%)', ''],
      ['음식점업', '음식점업 (15%)', ''],
      ['제조업', '제조·농림어업·소화물운송 (20%)', ''],
      ['숙박업', '숙박업 (25%)', ''],
      ['기타서비스업', '건설·운수창고·정보통신·기타서비스업 (30%)', ''],
      ['부동산임대업', '금융·보험·전문서비스·부동산임대업 (40%)', ''],
    ],
    showIf: (a) => a.businessType === '간이과세자',
  },
  {
    id: 'supplyPrice', section: '매출',
    q: '1년 매출(공급대가)은 얼마인가요? (원)',
    sub: '간이과세자는 1년치 매출을 한 번에 신고합니다. 부가세를 포함한 1년 총매출(공급대가)을 넣어 주세요.',
    numeric: true, money: true,
    showIf: (a) => a.businessType === '간이과세자',
    placeholder: '예: 50,000,000',
  },
  {
    id: 'simplifiedInput', section: '공제',
    q: '세금계산서 받은 매입(공급대가)은? (원)',
    sub: '간이과세자는 세금계산서를 받은 매입액(부가세 포함)의 0.5%를 세액공제받습니다. 카드·세금계산서로 산 사업 매입액을 넣어 주세요. 없으면 0.',
    numeric: true, money: true, optional: true,
    showIf: (a) => a.businessType === '간이과세자',
    placeholder: '예: 20,000,000 (없으면 0)',
  },
  // ── 공통 (개인 일반 + 간이) ──
  {
    id: 'priorSupplyOver10', section: '공제',
    q: '직전 연도 공급가액(사업장 기준)이 10억원을 초과하나요?',
    sub: '개인 일반과세자는 직전 연도 공급가액이 10억원을 초과하면 신용카드 매출세액공제 대상에서 제외됩니다(부가법 §46①1호가목·시행령 §88③ 사업장 기준). 간이과세자는 해당 없음.',
    showIf: (a) => a.businessType === '일반과세자' && a.isCorporate !== 'yes',
    opts: [['no', '아니오 (10억원 이하)', '카드공제 대상'], ['yes', '네, 10억원 초과', '카드공제 제외']],
  },
  {
    id: 'creditCardSales', section: '공제',
    q: '신용카드·현금영수증 매출은 얼마인가요? (원)',
    sub: '개인사업자(일반·간이 모두)는 카드·현금영수증 매출의 1.3%(2026.12.31까지, 2027.1.1부터 1%)를 세액공제받습니다(부가법 §46, 한도 연 1천만원·2027.1.1부터 500만원). 법인·직전연도 공급가액 10억원 초과 개인(사업장 기준)은 제외돼요. 전체 매출 중 카드/현금영수증 비중을 넣어 주세요. 없으면 0.',
    numeric: true, money: true, optional: true,
    showIf: (a) => (a.businessType === '일반과세자' && a.isCorporate !== 'yes' && a.priorSupplyOver10 !== 'yes') || a.businessType === '간이과세자',   // 수정 260628(VAT-R2-06): 10억 초과 개인 카드공제 제외(§46①1가)
    placeholder: '예: 50,000,000 (없으면 0)',
  },
  {id:'deemedEnabled',section:'의제매입',q:'적격 면세농산물 등의 의제매입 공제를 계산하나요?',optional:true,opts:[['yes','계산할게요','검증한 정상 반기 범위'],['no','계산하지 않음','']],showIf:a=>a.businessType==='일반과세자'},
  {id:'deemedSector',section:'의제매입',q:'실제 적격 업종·명의를 선택해 주세요.',opts:[['음식점_개인','개인 음식점',''],['음식점_법인','법인 음식점',''],['음식점_과세유흥장소','과세유흥장소',''],['제조업_중소기업_개인','개인 중소 제조업',''],['제조업_법인','법인 제조업',''],['기타_과자점_도정업등','개인 과자점·도정업 등',''],['기타일반','기타 적격업종','']],showIf:a=>a.businessType==='일반과세자'&&a.deemedEnabled==='yes'},
  {id:'deemedPurchase',section:'의제매입',q:'이 반기 누적 적격 면세원재료 매입액 (원)',numeric:true,money:true,showIf:a=>a.businessType==='일반과세자'&&a.deemedEnabled==='yes'},
  {id:'deemedRelatedSupply',section:'의제매입',q:'해당 원재료와 관련된 반기 과세·영세율 공급가액 (원)',sub:'전체 매출을 자동 대입하지 않습니다. 실제 관련 과표를 확인하세요.',numeric:true,money:true,allowZero:true,showIf:a=>a.businessType==='일반과세자'&&a.deemedEnabled==='yes'},
  {id:'deemedPeriodEnd',section:'의제매입',q:'실제 반기 종료일',sub:'2026-06-30 또는 2026-12-31. 예정·조기·휴폐업·수정 신고는 별도 검토입니다.',date:true,showIf:a=>a.businessType==='일반과세자'&&a.deemedEnabled==='yes'},
  {id:'deemedOrdinary',section:'의제매입 확인',q:'정상 단일사업장 반기 누계이며 휴폐업·유형전환·제조 연간특례·과세면세 겸영이 없나요?',opts:[['yes','자료로 확인',''],['no','해당 없음 또는 미확인','금액 보류']],showIf:a=>a.businessType==='일반과세자'&&a.deemedEnabled==='yes'},
  {id:'deemedEligible',section:'의제매입 확인',q:'적격 면세원재료·과세 제조가공·증빙 요건을 확인했나요?',opts:[['yes','자료로 확인',''],['no','미확인','금액 보류']],showIf:a=>a.businessType==='일반과세자'&&a.deemedEnabled==='yes'},
  {id:'deemedNoReturns',section:'의제매입 확인',q:'같은 반기에 실제 예정·조기 신고를 하지 않았나요?',sub:'예정고지 세액을 낸 것과 실제 예정신고는 다릅니다.',opts:[['yes','실제 신고 없음 확인',''],['no','신고 있음 또는 미확인','별도 정산 검토']],showIf:a=>a.businessType==='일반과세자'&&a.deemedEnabled==='yes'},
  {id:'deemedPrior',section:'의제매입 확인',q:'이 반기에 이미 공제받은 의제매입 세액 (원)',sub:'현재 지원 범위는 실제 0원 확인 사례입니다. 비우면 0원으로 보지 않습니다.',numeric:true,money:true,allowZero:true,showIf:a=>a.businessType==='일반과세자'&&a.deemedEnabled==='yes'},
  {id:'deemedSmall',section:'의제매입 확인',q:'법인 제조업의 중소기업 해당 여부를 확인했나요?',opts:[['yes','중소기업 해당',''],['no','중소기업 아님','']],showIf:a=>a.businessType==='일반과세자'&&a.deemedEnabled==='yes'&&a.deemedSector==='제조업_법인'},
  {id:'deemedEvidence',section:'의제매입 확인',q:'자격·관련매출·매입·기공제액 확인자료',freeform:true,sub:'원장·증빙·검토 근거를 적고 고객 식별정보는 제외하세요.',showIf:a=>a.businessType==='일반과세자'&&a.deemedEnabled==='yes'},
  // ── 공통 ──
  {"id": "actualPurchaseVat", "section": "추가 계산 입력", "q": "증빙상 실제 매입세액 (원)", "sub": "비우면 기존대로 과세 매입 공급가액의 10%를 사용합니다. 실제 금액을 확인했으면 0원도 직접 입력하세요.", "numeric": true, "money": true, "optional": true, showIf: (a) => a.businessType==='일반과세자'},
  {"id": "nonDeductibleInput", "section": "추가 계산 입력", "q": "위 매입세액 중 불공제 세액 (원)", "sub": "공제할 수 없는 매입세액을 입력하세요. 실제 매입세액 합계에서 차감합니다.", "numeric": true, "money": true, "optional": true, showIf: (a) => a.businessType==='일반과세자'},
  {"id": "exportSales", "section": "추가 계산 입력", "q": "별도 영세율 매출 (원)", "sub": "앞의 10% 과세 매출에 포함하지 않은 영세율 매출입니다.", "numeric": true, "money": true, "optional": true, showIf: (a) => a.businessType==='일반과세자'},
  {"id": "eInvoiceCount", "section": "추가 계산 입력", "q": "공제 대상 전자세금계산서 발급 건수", "sub": "발급공제 요건을 확인한 건수만 입력하세요. 직전연도 공급가액 입력이 함께 필요합니다.", "numeric": true, "money": false, "optional": true, showIf: (a) => a.businessType==='일반과세자' && a.isCorporate!=='yes'},
  {id:'creditScope',section:'공제 요건 확인',q:'단일 사업장의 정상신고이며 올해 앞선 공제 이력을 모두 확인했나요?',sub:'간이는 연중 계속 12개월 영업, 신규·휴폐업·유형전환·재고 추가납부가 없는 경우입니다. 다른 사업장·수정신고나 연간 이력 미확인은 공제를 확정할 수 없습니다.',opts:[['yes','확인했어요',''],['no','아직 확인하지 못했어요','금액 확정 보류']],showIf:a=>Number(a.creditCardSales)>0||Number(a.eInvoiceCount)>0},
  {id:'creditPeriodEnd',section:'공제 요건 확인',q:'이 신고 과세기간의 마지막 날은 언제인가요?',sub:'2026년 1기 확정은 6월 30일, 2기 확정·간이는 12월 31일입니다.',date:true,showIf:a=>Number(a.creditCardSales)>0||Number(a.eInvoiceCount)>0},
  {id:'creditEvidence',section:'공제 요건 확인',q:'공제 요건·올해 기사용액을 확인한 자료를 적어 주세요.',sub:'예: 직전연도 매출원장, 올해 1기 신고서, 적기 전송내역. 고객 이름·식별번호는 쓰지 마세요.',freeform:true,showIf:a=>Number(a.creditCardSales)>0||Number(a.eInvoiceCount)>0},
  {id:'cardEligible',section:'카드 공제',q:'공제 대상 업종·과세거래의 적격 발급금액임을 확인했나요?',sub:'소비자 상대 업종 등 법정 대상인지, 면세거래가 포함되지 않았는지 확인하세요.',opts:[['yes','적격으로 확인',''],['no','공제 대상 아님','공제 0']],showIf:a=>Number(a.creditCardSales)>0},
  {id:'cardPriorSupply',section:'카드 공제',q:'직전연도 이 사업장의 공급가액은 얼마인가요? (원)',sub:'실제 금액을 확인해 입력하세요. 신규개업 등 실제 0원이면 0을 입력합니다.',numeric:true,money:true,allowZero:true,showIf:a=>Number(a.creditCardSales)>0},
  {id:'cardPriorUsed',section:'카드 공제',q:'올해 앞선 신고에서 이미 사용한 카드 공제액은? (원)',sub:'연 1천만원 한도에서 차감합니다. 앞선 사용액이 실제 없으면 0을 입력하세요.',numeric:true,money:true,allowZero:true,showIf:a=>Number(a.creditCardSales)>0},
  {id:'invoiceNewBusiness',section:'전자발급 공제',q:'올해 실제로 신규 개업한 사업장인가요?',opts:[['yes','네',''],['no','아니오','직전연도 과세·면세 공급가액 확인']],showIf:a=>Number(a.eInvoiceCount)>0},
  {"id": "priorInvoiceRevenue", "section": "추가 계산 입력", "q": "직전연도 사업장별 공급가액 (면세 포함, 원)", "sub": "전자세금계산서 발급공제 판정에 필요합니다. 실제 0원이면 0을 입력하세요.", "numeric": true, "money": true, "optional": true, showIf: (a) => a.businessType==='일반과세자' && a.isCorporate!=='yes' && Number(a.eInvoiceCount)>0 && a.invoiceNewBusiness!=='yes'},
  {id:'invoiceTimely',section:'전자발급 공제',q:'입력한 전자세금계산서의 법정 발급·전송기한을 충족했나요?',opts:[['yes','모두 충족',''],['no','충족하지 않음','공제 0']],showIf:a=>Number(a.eInvoiceCount)>0},
  {id:'invoicePriorUsed',section:'전자발급 공제',q:'올해 앞선 신고에서 이미 사용한 전자발급 공제액은? (원)',sub:'연 100만원에서 차감합니다. 실제 없으면 0을 입력하세요.',numeric:true,money:true,allowZero:true,showIf:a=>Number(a.eInvoiceCount)>0},
  {"id": "priorPeriodTax", "section": "추가 계산 입력", "q": "이미 납부한 예정고지 세액 (원)", "sub": "이 확정신고에서 차감할 예정고지 납부액입니다.", "numeric": true, "money": true, "optional": true, showIf: (a) => a.businessType==='일반과세자'},
  {"id": "previouslyPaid", "section": "추가 계산 입력", "q": "그 밖의 기납부세액 (원)", "sub": "바로 앞에서 입력한 예정고지 세액을 중복 포함하지 마세요.", "numeric": true, "money": true, "optional": true, showIf: (a) => a.businessType==='일반과세자'},
  {
    id: 'context', section: '추가 사항',
    q: '추가로 알려주실 내용이 있나요? (선택)',
    sub: '의제매입공제·과세 및 면세 겸영·가산세 등 별도 검토가 필요한 내용을 적어 주세요. 메모만으로는 세액에 반영되지 않습니다.',
    freeform: true, optional: true,
    showIf: (a) => a.businessType !== '면세사업자',
    placeholder: '예: 수출 매출 3천만 / 면세 농산물 매입 2천만 / 예정고지 50만 납부',
  },
];

function vatExtraInputs(a) {
  if(a.businessType!=='일반과세자') return {};
  const out={};
  for(const [key,field] of [['actualPurchaseVat','purchase_vat_paid'],['nonDeductibleInput','non_deductible_input'],['exportSales','export_sales'],['priorPeriodTax','prior_period_tax'],['previouslyPaid','previously_paid'],...(a.isCorporate==='yes'?[]:[['eInvoiceCount','e_invoice_count'],...(Number(a.eInvoiceCount)>0?[['priorInvoiceRevenue','prior_e_invoice_revenue']]:[])])]) {
    if(a[key]==null || String(a[key]).trim()==='') continue;
    const n=Number(a[key]); if(!Number.isSafeInteger(n)||n<0) throw new Error('추가 금액과 건수는 0 이상의 정수로 입력해 주세요.');
    out[field]=n;
  }
  if(a.invoiceNewBusiness==='yes') delete out.prior_e_invoice_revenue;
  if((out.e_invoice_count||0)>0 && a.invoiceNewBusiness!=='yes' && out.prior_e_invoice_revenue===undefined) throw new Error('전자세금계산서 공제를 위해 직전연도 공급가액을 입력해 주세요.');
  const input=out.purchase_vat_paid===undefined?Math.round((Number(a.purchaseAmount)||0)*0.1):out.purchase_vat_paid;
  if((out.non_deductible_input||0)>input) throw new Error('불공제 세액은 매입세액 합계를 넘을 수 없습니다.');
  return out;
}

function vatCreditInputs(a,body) {
  const card=body.credit_card_sales||0,count=body.e_invoice_count||0;
  if(!card&&!count) return {};
  if(a.creditScope!=='yes') throw new Error('단일'+' 사업장 정상신고와 올해 앞선 공제이력을 먼저 확인해 주세요.');
  const n=(key,label)=>{if(a[key]==null||String(a[key]).trim()==='') throw new Error(label+'을 입력해 주세요. 실제 없으면 0을 입력하세요.');const v=Number(a[key]);if(!Number.isSafeInteger(v)||v<0) throw new Error(label+'은 0 이상의 정수여야 합니다.');return v;};
  const yesno=(key,label)=>{if(!['yes','no'].includes(a[key])) throw new Error(label+'을 확인해 주세요.');return a[key]==='yes';};
  const end=String(a.creditPeriodEnd||'');
  if(!/^2026-\d{2}-\d{2}$/.test(end)||!a.creditEvidence||!String(a.creditEvidence).trim()) throw new Error('2026년 과세기간 종료일과 공제 확인자료를 입력해 주세요.');
  const f={schema_version:'vat-credits/1',tax_year:2026,period_end:end,ordinary_single_business_confirmed:true,annual_history_complete_confirmed:true,evidence_ref:String(a.creditEvidence).trim()};
  if(a.businessType==='간이과세자') f.full_year_simplified_confirmed=true;
  if(card) f.card={eligible_business_confirmed:yesno('cardEligible','카드공제 대상 업종·거래'),prior_year_supply:n('cardPriorSupply','직전 공급가액'),eligible_gross_sales:card,prior_used:n('cardPriorUsed','올해 기사용 카드공제')};
  if(count) {const fresh=yesno('invoiceNewBusiness','올해 신규개업 여부');f.e_invoice={new_business_this_year:fresh,timely_issue_transmission_confirmed:yesno('invoiceTimely','적기 발급·전송'),eligible_count:count,prior_used:n('invoicePriorUsed','올해 기사용 전자공제')};if(!fresh) f.e_invoice.prior_year_revenue=n('priorInvoiceRevenue','직전 과세·면세 공급가액');}
  return {period_end:end,credit_facts:f};
}

function vatDeadlineFromEngine(c) {
  const d=String(c&&c['신고기한']||'');
  return /^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d ? d : null;
}

function vatDeemedInputs(a,body) {
  if(a.businessType!=='일반과세자'||a.deemedEnabled!=='yes')return {};
  const n=(key,label)=>{const raw=a[key];if(raw==null||String(raw).trim()==='')throw Error(label+'을 확인해 입력해 주세요. 실제 0도 명시해야 합니다.');const v=Number(raw);if(!Number.isSafeInteger(v)||v<0)throw Error(label+'은 0 이상의 정수 원이어야 합니다.');return v;};
  for(const key of ['deemedOrdinary','deemedEligible','deemedNoReturns'])if(a[key]!=='yes')throw Error('정상 반기·적격 증빙·실제 예정/조기신고 없음 확인이 필요합니다.');
  const end=String(a.deemedPeriodEnd||'');
  if(!['2026-06-30','2026-12-31'].includes(end)||body.period_type!==(end.endsWith('06-30')?'1기_확정':'2기_확정'))throw Error('선택한 확정신고와 2026년 실제 반기 종료일을 일치시켜 주세요.');
  if(body.period_end&&body.period_end!==end)throw Error('다른 공제와 의제매입의 신고기간이 다릅니다.');
  if(n('deemedPrior','실제 기공제액')!==0)throw Error('기공제액이 있는 실제 예정·조기 정산은 별도 검토가 필요합니다.');
  const purchase=n('deemedPurchase','적격 반기매입액'),related=n('deemedRelatedSupply','관련 과세표준');
  if(!purchase)throw Error('의제매입을 선택했다면 양수 적격 매입액을 입력해 주세요.');
  if(related>(body.sales_amount||0)+(body.export_sales||0))throw Error('관련 과세표준이 반기 전체 과세·영세율 매출을 넘습니다.');
  const evidence=String(a.deemedEvidence||'').trim();if(!evidence)throw Error('의제매입 자격·매출·매입·기공제 확인자료를 입력해 주세요.');
  const sector=String(a.deemedSector||'');if(!['음식점_개인','음식점_법인','음식점_과세유흥장소','제조업_중소기업_개인','제조업_법인','기타_과자점_도정업등','기타일반'].includes(sector))throw Error('실제 적격 업종을 선택해 주세요.');
  const f={schema_version:'vat-deemed/1',tax_year:2026,period_end:end,ordinary_half_year_confirmed:true,eligibility_confirmed:true,no_preliminary_or_early_return_confirmed:true,related_taxable_supply:related,eligible_purchase_amount:purchase,prior_deducted_amount:0,evidence_ref:evidence};
  if(sector==='제조업_법인'){if(!['yes','no'].includes(a.deemedSmall))throw Error('법인 제조업의 실제 중소기업 여부를 확인해 주세요.');f.small_business_confirmed=a.deemedSmall==='yes';}
  return {tax_year:2026,period_end:end,deemed_purchase_amount:purchase,deemed_purchase_sector:sector,deemed_purchase_facts:f};
}

async function callVatEng(body) {
  const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || 'http://127.0.0.1:8000';
  const delays = [1000, 2000, 4000, 8000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const to = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
      const res = await fetch(base + '/v1/calc/vat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined,
      });
      if (to) clearTimeout(to);
      if (!res.ok) { const _err = new Error('engine ' + res.status); _err.status = res.status; throw _err; }
      return await res.json();
    } catch (e) { lastErr = e; if (e && e.status >= 400 && e.status < 500) break; if (attempt < delays.length) await new Promise(r => setTimeout(r, delays[attempt])); }
  }
  throw lastErr;
}

function buildVatDetail(answers, calc) {
  const L = ['■ 고객 입력 정보'];
  VAT_QS.forEach(q => {
    if (q.showIf && !q.showIf(answers)) return;
    const val = answers[q.id];
    if (val === undefined || val === null || val === '') return;
    let v = val;
    if (q.opts) { const o = q.opts.find(x => x[0] === val); if (o) v = o[1]; }
    else if (q.numeric && q.money) v = vatWon(Number(val));
    const ql = (q.q || q.id).replace(/\s*\([^)]*\)\s*$/, '').trim();
    L.push('  · ' + ql + ': ' + v);
  });
  if (calc.precise && !calc.isExempt) {
    L.push('', '■ 계산 결과 (검증 엔진)');
    const d = calc.detail || {};
    if (d['매출세액']) L.push('  · 매출세액: ' + vatWon(d['매출세액']));
    if (d['매입세액']) L.push('  · 매입세액: ' + vatWon(d['매입세액']));
    if (d['신용카드공제']) L.push('  · 신용카드공제: ' + vatWon(d['신용카드공제']));
    if (d['전자세금계산서공제']) L.push('  · 전자세금계산서공제: ' + vatWon(d['전자세금계산서공제']));
    if (d['간이매입공제']) L.push('  · 간이매입공제: ' + vatWon(d['간이매입공제']));
    if (d['부가가치율'] && d['부가가치율'] !== '-') L.push('  · 부가가치율: ' + d['부가가치율']);
    L.push(calc.isRefund ? '  · 예상 환급세액: ' + vatWon(calc.refund) : '  · 예상 납부세액: ' + vatWon(calc.netTax));
    (calc.steps || []).forEach(s => { if (s && s.항목) L.push('    - ' + s.항목 + ': ' + (typeof s.금액 === 'number' ? vatWon(s.금액) : s.금액) + (s.조문 ? ' [' + s.조문 + ']' : '')); });
  }
  return L.join('\n');
}

function buildVatKakao(answers, calc) {
  const L = ['[JT택스랩 부가가치세 계산 — 상담 요청]', '', '▶ 입력'];
  L.push('· 사업자 유형: ' + (answers.businessType || '일반과세자'));
  if (answers.businessType === '간이과세자') L.push('· 1년 공급대가: ' + vatWon(Number(answers.supplyPrice) || 0));
  else if (answers.businessType === '일반과세자') {
    L.push('· 매출(공급가액): ' + vatWon(Number(answers.salesAmount) || 0));
    L.push('· 매입(공급가액): ' + vatWon(Number(answers.purchaseAmount) || 0));
  }
  if (calc.precise) {
    L.push('', '▶ 결과(추정)');
    if (calc.isExempt) L.push('· 면세사업자 — 부가세 면제');
    else L.push(calc.isRefund ? '· 예상 환급세액: ' + vatWon(calc.refund) : '· 예상 납부세액: ' + vatWon(calc.netTax));
  }
  L.push('', '상담 부탁드립니다.');
  return L.join('\n');
}

function JTReportVat({ setRoute, onBack }) {
  const [step, setStep] = useVatState(0);
  const [answers, rawSetAnswers] = useVatState({});
  const [loading, rawSetLoading] = useVatState(false);
  const [report, rawSetReport] = useVatState(null);
  const [err, rawSetErr] = useVatState(null);
  const inputSession=useJTInputSession(()=>{rawSetReport(null);rawSetLoading(false);rawSetErr(null);});
  const setAnswers=update=>{inputSession.invalidate();rawSetAnswers(update);};
  const setReport=rawSetReport;
  const setLoading=rawSetLoading;
  const setErr=rawSetErr;


  React.useEffect(() => {
    const base = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';
    if (base) { fetch(base + '/health', { method: 'GET' }).catch(function () {}); }
  }, []);

  const visibleQs = VAT_QS.filter(q => !q.showIf || q.showIf(answers));
  const total = visibleQs.length;
  const safeStep = Math.min(step, total - 1);
  const cur = visibleQs[safeStep];
  const isLast = safeStep === total - 1;
  const setAns = (id, v) => setAnswers(a => ({ ...a, [id]: v }));

  const canNext = () => {
    if (!cur) return false;
    if (cur.date) {
      const v=String(answers[cur.id]||'');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
    }
    if (cur.freeform) return !!cur.optional || String(answers[cur.id]||'').trim().length>0;
    if (cur.allowZero) {
      const raw = answers[cur.id];
      const v = Number(raw);
      return raw != null && String(raw).trim() !== '' && Number.isSafeInteger(v) && v >= 0;
    }
    if (cur.numeric) { if (cur.optional) return true; const v = Number(answers[cur.id]); return !isNaN(v) && v > 0; }
    return !!answers[cur.id];
  };

  const runAnalysis = async () => {
    const inputRequest=inputSession.begin();
    const setReport=inputSession.sink(inputRequest,rawSetReport);
    const setLoading=inputSession.sink(inputRequest,rawSetLoading);
    const setErr=inputSession.sink(inputRequest,rawSetErr);
    setReport(null);

    setLoading(true); setErr(null);
    try {
      const clamp = (x) => Math.max(0, Math.round(Number(x) || 0));
      const bt = answers.businessType || '일반과세자';
      const isCorp = answers.isCorporate === 'yes';
      const extra = vatExtraInputs(answers);

      if (bt !== '면세사업자') {
        const anySales = bt === '일반과세자'
          ? clamp(answers.salesAmount) + clamp(answers.purchaseAmount) + (extra.purchase_vat_paid || 0) + (extra.export_sales || 0)
          : clamp(answers.supplyPrice);
        if (anySales <= 0) { setErr('매출·매입 또는 실제 매입세액을 입력해 주세요.'); setLoading(false); return; }
      }
      // P1-3(코덱스): 신용카드·현금영수증 매출(§46 공급대가=부가세 포함)은 전체 매출을 넘을 수 없음 — 엔진 422 전에 안내
      const _card = clamp(answers.creditCardSales);
      if (_card > 0) {
        if (bt === '일반과세자' && _card > Math.round((clamp(answers.salesAmount) + clamp(answers.exportSales)) * 1.1)) {
          setErr('신용카드·현금영수증 매출(부가세 포함)이 전체 매출을 초과합니다. 카드매출은 매출 공급가액의 약 1.1배 이하로 입력해 주세요.'); setLoading(false); return;
        }
        if (bt === '간이과세자' && clamp(answers.supplyPrice) > 0 && _card > clamp(answers.supplyPrice)) {
          setErr('신용카드 매출이 연간 공급대가를 초과합니다.'); setLoading(false); return;
        }
      }

      const purchaseAmt = clamp(answers.purchaseAmount);
      const body = {
        business_type: bt,
        is_corporate: isCorp,
        period_type: bt === '간이과세자' ? '간이과세_확정' : (answers.periodType || '1기_확정'),
        sales_amount: clamp(answers.salesAmount),
        purchase_amount: purchaseAmt,
        purchase_vat_paid: Math.round(purchaseAmt * 0.1),   // 매입세액 = 과세 매입액 × 10%
        credit_card_sales: ((bt === '일반과세자' && !isCorp && answers.priorSupplyOver10 !== 'yes') || bt === '간이과세자') ? clamp(answers.creditCardSales) : 0,   // §46 신용카드 공제 — 개인 일반(직전 공급가 10억↓) + 간이 대상. 수정 260628(VAT-R2-06)
        sales_supply_price: clamp(answers.supplyPrice),
        simplified_value_sector: answers.simplifiedSector || '도소매업',
        simplified_input_supply: clamp(answers.simplifiedInput),
        ...extra,
      };

      try {Object.assign(body,vatCreditInputs(answers,body));Object.assign(body,vatDeemedInputs(answers,body));} catch(e) {setErr(e.message);setLoading(false);return;}
      let calc = { precise: false };
      try {
        const j = await callVatEng(body);
        const c = j && j.calc;
        // 수정 260628(VAT-R2-01): 엔진 오류바디/부분응답을 precise로 신뢰하지 않음(납부세액0 거짓표시 방지).
        if (window.jtValidCalc(c, ['납부세액', '환급세액'])
          && typeof c['비과세여부'] === 'boolean' && typeof c['환급여부'] === 'boolean') {
          calc.businessType = c['사업자유형'];
          calc.netTax = c['납부세액'] || 0;
          calc.isRefund = !!c['환급여부'];
          calc.refund = c['환급세액'] || 0;
          calc.isExempt = !!c['비과세여부'];
          calc.exemptReason = c['비과세사유'] || '';
          calc.detail = c['주요내역'] || {};
          calc.penaltyInfo = c['가산세_안내'] || null;
          calc.steps = c['단계별계산'] || [];
          calc.engineWarnings = c['경고사항'] || [];
          calc.periodType = body.period_type;
          calc.deadline = vatDeadlineFromEngine(c);
          calc.deemedApplied = !!body.deemed_purchase_facts;
          calc.precise = true;
          calc.engineVer = j.version && j.version.engine; calc.engineVersion = j.version || null; calc.calculationReview = j.review || null;
          // §69 간이과세자 납부의무 면제. 수정 260628(VAT-R2-03): 프론트 독자 판정 제거 — 엔진 납부세액 0 신호로만 면제 라벨(§64 재고납부세액이 있으면 netTax>0 → 면제 제외·실액 표시, §69① 단서 준수).
          calc.simplifiedExempt = (calc.netTax === 0 && answers.businessType === '간이과세자' && clamp(answers.supplyPrice) > 0 && clamp(answers.supplyPrice) < 48000000);
        } else if(c) { calc.engineReason = ['needs_input','unsupported'].includes(c['상태']) ? window.jtEngineMessageForDisplay(c['오류'] || c['메시지'] || c['사유'] || '입력 요건 또는 지원 범위를 확인해 주세요.') : ''; }
      } catch (e) { console.warn('부가세 엔진 연결 실패', e); calc.engineErr = true; }

      setReport({ calc });
    } catch (e) { console.error(e); setErr(e.message || '계산 중 오류가 발생했습니다.'); }
    finally { setLoading(false); }
  };

  const goNext = () => { if (isLast) runAnalysis(); else setStep(s => s + 1); };
  const goPrev = () => { if (safeStep > 0) setStep(s => s - 1); else onBack(); };

  if (loading) {
    return (
      <div className="jt-container">
        <JTReportShell inputReview={{questions:visibleQs,answers,onEdit:index=>{inputSession.invalidate();setStep(index);}}} title="부가가치세(부가세) 계산기" subtitle="검증 엔진으로 계산 중…" stepIdx={total} stepTotal={total} onBack={() => {}} tag="BOOKKEEPING">
          <div className="jt-report-loading"><div className="jt-report-loading__spinner" />매출세액에서 매입세액·공제를 빼 부가가치세를 계산하고 있습니다…<br /><span style={{ fontSize: 13, opacity: 0.7 }}>처음 사용 시 엔진을 깨우느라 최대 30초까지 걸릴 수 있어요.</span></div>
        </JTReportShell>
      </div>
    );
  }

  if (report) {
    const { calc } = report;
    const d = calc.detail || {};
    const deadline = calc.deadline || '엔진 기한 미확인 · 별도 확인';
    return (
      <div className="jt-container">
        <JTReportShell inputReview={{questions:visibleQs,answers,onEdit:index=>{inputSession.invalidate();setStep(index);}}} title="부가가치세 계산 결과" subtitle="매출세액 − 매입세액 − 공제" stepIdx={total} stepTotal={total} onBack={() => setReport(null)} tag="BOOKKEEPING">
          {!calc.precise ? (
            <div style={{ background: '#fdeeec', borderLeft: '4px solid #c0392b', padding: '14px 18px', marginBottom: 16, borderRadius: 8, lineHeight: 1.6 }}>
              <strong>정밀 계산이 필요합니다.</strong> {calc.engineReason || '정밀 엔진 연결이 지연됐습니다.'} 잘못된 세액을 안내하지 않기 위해 결과를 표시하지 않았어요. 잠시 후 다시 시도하거나 상담을 권합니다.
              <div style={{ marginTop: 8 }}><button className="jt-btn jt-btn--ghost" onClick={() => runAnalysis()}>정밀 계산 다시 시도 →</button></div>
            </div>
          ) : calc.isExempt ? (
            <>
              <div className="jt-report-result__grade jt-grade-good">
                <div className="jt-report-result__grade-label">부가가치세 면제</div>
                <div className="jt-report-result__grade-val" style={{ fontSize: 28 }}>면세사업자</div>
                <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, opacity: 0.9 }}>{calc.exemptReason || '면세사업자는 부가가치세 납부의무가 없습니다(부가법 §26).'} 다만 매년 2월 10일까지 <strong>사업장현황신고</strong>는 해야 하며, 면세 매입분의 매입세액은 환급되지 않습니다.</div>
              </div>
              {typeof JTReportConvert === 'function' && (
                <JTReportConvert engineVersion={calc.engineVersion} calculationReview={calc.calculationReview} reportType="부가가치세 계산" reportTag="BOOKKEEPING"
                  calcId="vat" completeEligible={true} precise={calc.precise}
                  reportSummary="면세사업자 — 부가세 면제"
                  reportDetail={buildVatDetail(answers, calc)} kakaoSummary={buildVatKakao(answers, calc)} setRoute={setRoute} />
              )}
              <div className="jt-report-q__nav" style={{ marginTop: 16 }}>
                <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setStep(0); setAnswers({}); }}>처음부터 다시</button>
                <button className="jt-btn jt-btn--ghost" onClick={onBack}>← 세금 계산기</button>
              </div>
            </>
          ) : (
            <>
              <div className={'jt-report-result__grade ' + ((calc.isRefund || calc.simplifiedExempt) ? 'jt-grade-good' : 'jt-grade-mid')}>
                <div className="jt-report-result__grade-label">{calc.simplifiedExempt ? '납부의무 면제 (간이과세자)' : ((calc.isRefund ? '예상 환급세액' : '예상 납부세액') + ' (' + calc.businessType + ')')}</div>
                <div className="jt-report-result__grade-val">{vatWon(calc.isRefund ? calc.refund : calc.netTax)}</div>
                {calc.simplifiedExempt ? (
                  <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.6 }}>1년 공급대가가 <strong>4,800만원 미만</strong>이라 부가가치세 <strong>납부의무가 면제</strong>됩니다(부가법 §69). <strong>신고는 해야 하지만 낼 세금은 0원</strong>이에요. 신고·납부 기한은 <strong>{deadline}</strong>.</div>
                ) : (
                  <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, opacity: 0.85 }}>{vatKorean(calc.isRefund ? calc.refund : calc.netTax)} · 신고·납부 기한 <strong>{deadline}</strong></div>
                )}
                <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, color: '#b8860b' }}>※ 입력하신 매출·매입 기준 추정입니다. 추가 입력한 영세율 매출·전자세금계산서 공제·기납부세액을 반영합니다. {calc.deemedApplied ? '의제매입은 입력한 적격·관련매출·신고이력 확인 범위에서 반영했습니다.' : '의제매입은 별도 사실 입력이 필요합니다.'} 공통매입세액 안분은 별도 검토가 필요합니다.</div>
              </div>

              <section className="jt-report-result__section">
                <h3>계산 내역</h3>
                <table className="jt-report-calc">
                  <tbody>
                    {d['부가가치율'] && d['부가가치율'] !== '-' && (
                      <tr><th>부가가치율 (간이 업종)</th><td>{d['부가가치율']}</td></tr>
                    )}
                    {!!d['매출세액'] && <tr><th>매출세액 (공급가액 × 10%)</th><td>{vatWon(d['매출세액'])}</td></tr>}
                    {!!d['매입세액'] && <tr><th>(−) 매입세액</th><td>{vatWon(d['매입세액'])}</td></tr>}
                    {!!d['신용카드공제'] && <tr><th>(−) 신용카드·현금영수증 공제</th><td>{vatWon(d['신용카드공제'])}</td></tr>}
                    {!!d['간이매입공제'] && <tr><th>(−) 간이 매입세액공제</th><td>{vatWon(d['간이매입공제'])}</td></tr>}
                    {typeof d['전자세금계산서공제'] === 'number' && <tr><th>(−) 전자세금계산서 발급공제</th><td>{vatWon(d['전자세금계산서공제'])}</td></tr>}
                    {!!d['의제매입공제'] && <tr><th>(−) 의제매입세액공제</th><td>{vatWon(d['의제매입공제'])}</td></tr>}
                    <tr style={{ background: '#f0f7f3' }}>
                      <th><strong>{calc.isRefund ? '환급세액' : '납부세액'}</strong></th>
                      <td><strong>{vatWon(calc.isRefund ? calc.refund : calc.netTax)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {(calc.steps && calc.steps.length > 0) && (
                <section className="jt-report-result__section">
                  <h3>단계별 계산 (법조문)</h3>
                  <table className="jt-report-calc">
                    <tbody>
                      {calc.steps.map((s, i) => (
                        <tr key={i}>
                          <th style={{ fontWeight: 400 }}><JTCalculationStepLabel step={s} /></th>
                          <td>{typeof s.금액 === 'number' ? vatWon(s.금액) : (s.금액 || '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              <section className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #b8860b', padding: '14px 18px', borderRadius: 8 }}>
                <p style={{ margin: '0 0 8px', fontWeight: 700 }}>부가세, 이것도 챙기세요 — 더 줄이거나 가산세를 피하는 법</p>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>
                  <li><strong>매입세금계산서를 빠짐없이 챙기세요.</strong> 사업용 매입은 세금계산서·사업용 신용카드로 받아야 매입세액(10%)을 공제받습니다. 간이영수증·인건비는 공제 안 됩니다.</li>
                  <li><strong>신고기한({deadline})을 넘기면 가산세.</strong> 무신고 20%·과소신고 10%·납부지연(미납세액 × 1일 0.022%)이 붙습니다(국기법 §47의2~5).</li>
                  <li><strong>의제매입·신용카드·전자세금계산서 공제</strong>는 요건이 맞으면 세금을 더 줄입니다. 전자세금계산서는 추가 입력으로 반영하며, 의제매입은 적격 원재료·관련 매출·반기 신고 이력을 추가 입력해 검증 범위 안에서 계산합니다. 끝수·예정/조기 정산 등 미지원 사례는 세액 없이 안내합니다.</li>
                  <li><strong>부가세는 「내 돈」이 아닙니다.</strong> 매출 부가세는 고객에게 받아 보관했다 내는 돈이에요. 따로 떼어 두면 신고철에 당황하지 않습니다.</li>
                </ul>
              </section>

              {typeof JTReportConvert === 'function' && (
                <JTReportConvert engineVersion={calc.engineVersion} calculationReview={calc.calculationReview}
                  calcId="vat"
                  completeEligible={true}
                  precise={calc.precise}
                  reportType="부가가치세 계산"
                  reportTag="BOOKKEEPING"
                  reportSummary={`${calc.businessType} · ${calc.isRefund ? '예상 환급 ' + vatWon(calc.refund) : '예상 납부 ' + vatWon(calc.netTax)}`}
                  reportDetail={buildVatDetail(answers, calc)}
                  kakaoSummary={buildVatKakao(answers, calc)}
                  setRoute={setRoute}
                />
              )}

              <div className="jt-report-q__nav" style={{ marginTop: 16 }}>
                <button className="jt-btn jt-btn--ghost" onClick={() => { setReport(null); setStep(0); setAnswers({}); }}>처음부터 다시</button>
                <button className="jt-btn jt-btn--ghost" onClick={onBack}>← 세금 계산기</button>
              </div>
            </>
          )}
        </JTReportShell>
      </div>
    );
  }

  if (!cur) { onBack(); return null; }

  return (
    <div className="jt-container">
      <JTReportShell inputReview={{questions:visibleQs,answers,onEdit:index=>{inputSession.invalidate();setStep(index);}}} title="부가가치세(부가세) 계산기" subtitle="사업자 유형과 매출·매입만 넣으면 낼 부가세를 바로 계산해요." stepIdx={safeStep} stepTotal={total} onBack={goPrev} tag="BOOKKEEPING">
        {err && <div style={{ background: '#fdeeec', borderLeft: '4px solid #c0392b', padding: '12px 16px', marginBottom: 16, borderRadius: 8 }}>{err}</div>}
        <div className="jt-report-q">
          <div className="jt-report-q__section">{cur.section}</div>
          <h2>{cur.q}</h2>
          {cur.sub && <p className="jt-report-q__sub">{cur.sub}</p>}

          {cur.opts && (
            <div className="jt-report-q__opts">
              {cur.opts.map(o => (
                <button key={o[0]} className={'jt-report-q__opt' + (answers[cur.id] === o[0] ? ' is-selected' : '')} onClick={() => { setAns(cur.id, o[0]); }}>
                  <span className="jt-report-q__opt-mark">{answers[cur.id] === o[0] ? '●' : '○'}</span>
                  <span><strong>{o[1]}</strong>{o[2] ? <span style={{ opacity: 0.7 }}> · {o[2]}</span> : null}</span>
                </button>
              ))}
            </div>
          )}

          {cur.date && <input aria-label={cur.qFor ? cur.qFor(answers) : cur.q} className="jt-report-q__input" type="date" value={answers[cur.id] || ''} onChange={e=>setAns(cur.id,e.target.value)} />}
          {cur.numeric && (
            <div>
              <JTNumericInput money={!!cur.money} aria-label={cur.qFor ? cur.qFor(answers) : cur.q} className="jt-report-q__input" type="text" inputMode="numeric" placeholder={cur.placeholder || ''}
                value={answers[cur.id] || ''} onChange={e => setAns(cur.id, e.target.value)} />
              {cur.money && Number(answers[cur.id]) > 0 && (
                <div style={{ fontSize: 14, color: 'var(--accent,#2a6d4f)', marginTop: 6 }}>= {vatKorean(Number(answers[cur.id]))}</div>
              )}
            </div>
          )}

          {cur.freeform && (
            <textarea aria-label={cur.qFor ? cur.qFor(answers) : cur.q} className="jt-report-q__input" rows={3} placeholder={cur.placeholder || ''}
              value={answers[cur.id] || ''} onChange={e => setAns(cur.id, e.target.value)} />
          )}

          <div className="jt-report-q__nav">
            <button className="jt-btn jt-btn--ghost" onClick={goPrev}>← 이전</button>
            <button className="jt-btn jt-btn--primary" disabled={!canNext()} onClick={goNext}>
              {isLast ? '결과 보기 →' : '다음 →'}
            </button>
          </div>
        </div>
      </JTReportShell>
    </div>
  );
}
window.JTReportVat = JTReportVat;

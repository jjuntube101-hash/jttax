const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),parser=require('@babel/parser');
let checks=0;const cases=[];
function test(n,f){f();checks++;console.log('PASS '+n);}
function load(file,names){const s=fs.readFileSync(path.join(__dirname,'src',file),'utf8'),ast=parser.parse(s,{sourceType:'script',plugins:['jsx']});const c=vm.createContext({window:{jtLaw:(_k,v)=>v,jtFallbackGaps:r=>r.filter(x=>x.when).map(x=>x.why)},Number,Math,String,Object});vm.runInContext(ast.program.body.filter(n=>names.includes(n.id?.name)||n.type==='VariableDeclaration'&&n.declarations.some(d=>names.includes(d.id?.name))).map(n=>s.slice(n.start,n.end)).join('\n')+'\nglobalThis.api={'+names.join(',')+'}',c);return c.api;}
const inc=load('ReportIncome.jsx',['incomeExtraInputs','incFallbackGaps','INC_QS']);
const vat=load('ReportVat.jsx',['vatExtraInputs','VAT_QS']);
const gift=load('ReportGift.jsx',['mapAnswersToGift','giftAmount','giftPriorDedGiven']);
const inh=load('ReportInheritance.jsx',['mapAnswersToInheritance','inhChildCount','inhPriorGiftDropped']);
const plain=x=>JSON.parse(JSON.stringify(x));

// Render the real VAT component at its sales step: zero must reach the existing
// purchase/export inputs, while blank or invalid sales must not advance.
function vatSalesNextDisabled(salesAmount) {
 const values=[3,{businessType:'일반과세자',isCorporate:'no',periodType:'1기_확정',salesAmount},false,null,null];
 let hook=0;
 const env=vm.createContext({window:{},Number,Math,String,Object,
  React:{useState:()=>[values[hook++],()=>{}],useRef:value=>({current:value}),useEffect(){},createElement:(type,props,...children)=>({type,props:props||{},children})},
  JTReportShell:'shell',JTNumericInput:'input'});
 vm.runInContext(require('esbuild').transformSync(fs.readFileSync(path.join(__dirname,'src/InputReview.jsx'),'utf8'),{loader:'jsx'}).code,env);
 const source=fs.readFileSync(path.join(__dirname,'src/ReportVat.jsx'),'utf8');
 vm.runInContext(require('esbuild').transformSync(source,{loader:'jsx'}).code+'\nglobalThis.tree=JTReportVat({onBack(){}});',env);
 const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
 const next=walk(env.tree).find(n=>n.type==='button'&&n.children.includes('다음 →'));
 assert(next,'sales step must render a Next button');
 return next.props.disabled;
}
test('VAT zero sales reaches purchase and export inputs',()=>assert.equal(vatSalesNextDisabled('0'),false));
test('VAT positive sales still advances',()=>assert.equal(vatSalesNextDisabled('100000000'),false));
test('VAT blank and invalid sales do not advance',()=>{for(const value of ['',undefined,'-1','0.5','NaN'])assert.equal(vatSalesNextDisabled(value),true);});
test('empty extras preserve old requests',()=>{assert.deepEqual(plain(inc.incomeExtraInputs({})),{});assert.deepEqual(plain(vat.vatExtraInputs({businessType:'일반과세자'})),{});});
test('mixed domestic dividend explicit zero allowed',()=>{const a={dividendIncome:'30000000',dividendType:'mixed_grossup',grossupEligible:'0'};assert.equal(inc.incomeExtraInputs(a).grossup_eligible_dividend,0);assert.equal(inc.incFallbackGaps(a,{}).length,0);});
test('mixed domestic missing and excessive blocked',()=>{for(const n of ['',undefined,'30000001','-1','0.5'])assert.throws(()=>inc.incomeExtraInputs({dividendIncome:30000000,dividendType:'mixed_grossup',grossupEligible:n}));});
test('foreign dividends stay blocked',()=>{for(const t of ['foreign','mixed','unsure'])assert(inc.incFallbackGaps({dividendIncome:30000000,dividendType:t},{}).length);});
test('hidden dividend fields omitted',()=>assert.deepEqual(plain(inc.incomeExtraInputs({dividendIncome:0,dividendType:'domestic',dividendPaidYear:2025,grossupEligible:500})),{}));
test('dependent counts cannot exceed confirmed family',()=>assert.throws(()=>inc.incomeExtraInputs({dependents:1,elderlyDependents:2})));
for(const n of ['-1','0.1','9007199254740992','NaN'])test('invalid numeric '+n,()=>{assert.throws(()=>inc.incomeExtraInputs({healthInsurance:n}));assert.throws(()=>vat.vatExtraInputs({businessType:'일반과세자',actualPurchaseVat:n}));});
test('VAT invoice credit requires prior revenue',()=>assert.throws(()=>vat.vatExtraInputs({businessType:'일반과세자',eInvoiceCount:2})));
test('VAT explicit zero does not become 10 percent',()=>assert.equal(vat.vatExtraInputs({businessType:'일반과세자',purchaseAmount:10000000,actualPurchaseVat:'0'}).purchase_vat_paid,0));
test('VAT corporate and simplified drop stale credits',()=>{assert.deepEqual(plain(vat.vatExtraInputs({businessType:'간이과세자',eInvoiceCount:100,actualPurchaseVat:500})),{});assert.deepEqual(plain(vat.vatExtraInputs({businessType:'일반과세자',isCorporate:'yes',eInvoiceCount:100,priorInvoiceRevenue:0})),{});});
test('VAT nondeductible cannot exceed input',()=>assert.throws(()=>vat.vatExtraInputs({businessType:'일반과세자',actualPurchaseVat:1,nonDeductibleInput:2})));
const ga={assetType:'cash',giftValueCash:'500000000',relationship:'직계존속',doneeAge:30,genSkip:'no'};
const ia={estateValue:2000000000,hasSpouse:'no',numChildren:'2',isResident:'yes'};
for(const [label,map,a] of [['gift',gift.mapAnswersToGift,ga],['inheritance',inh.mapAnswersToInheritance,ia]]){
 test(label+' foreign tax base required',()=>assert.throws(()=>map({...a,foreignTaxPaid:1000000})));
 test(label+' blank amounts omitted and stale foreign base omitted',()=>{const b=map({...a,appraisalFee:'',foreignTaxPaid:0,foreignTaxBase:999});assert.equal(b.appraisal_fee,undefined);assert.equal(b.foreign_tax_base,undefined);});
 test(label+' exact amounts preserved',()=>{const b=map({...a,appraisalFee:123456,foreignTaxPaid:1000000,foreignTaxBase:10000000});assert.equal(b.appraisal_fee,123456);assert.equal(b.foreign_tax_base,10000000);});
}
test('income new controls in question list',()=>{for(const id of ['pensionIncome','grossupEligible','dividendPaidYear','elderlyDependents','disabledDependents','healthInsurance'])assert(inc.INC_QS.some(q=>q.id===id));});
test('VAT controls in question list',()=>{for(const id of ['actualPurchaseVat','nonDeductibleInput','exportSales','eInvoiceCount','priorInvoiceRevenue','priorPeriodTax','previouslyPaid'])assert(vat.VAT_QS.some(q=>q.id===id));});
function add(name,endpoint,request){cases.push({name,endpoint,request:plain(request)});}
add('income-extras','income',{business_revenue:60000000,dependents:2,...inc.incomeExtraInputs({dependents:2,pensionIncome:12000000,elderlyDependents:1,disabledDependents:1,healthInsurance:2400000})});
for(const n of [0,10000000,30000000])add('income-mixed-'+n,'income',{business_revenue:60000000,dividend_income:30000000,is_dividend_grossup:true,...inc.incomeExtraInputs({dividendIncome:30000000,dividendType:'mixed_grossup',grossupEligible:n,dividendPaidYear:2026})});
for(const n of [0,2500000])add('vat-actual-'+n,'vat',{business_type:'일반과세자',sales_amount:100000000,purchase_amount:60000000,...vat.vatExtraInputs({businessType:'일반과세자',actualPurchaseVat:n,exportSales:30000000,eInvoiceCount:100,priorInvoiceRevenue:200000000,priorPeriodTax:1000000,previouslyPaid:500000})});
add('vat-refund','vat',{business_type:'일반과세자',sales_amount:10000000,...vat.vatExtraInputs({businessType:'일반과세자',actualPurchaseVat:2000000,nonDeductibleInput:200000,previouslyPaid:500000})});
add('gift-extras','gift',gift.mapAnswersToGift({...ga,appraisalFee:2000000,nonTaxable:10000000,foreignTaxPaid:1000000,foreignTaxBase:100000000}));
add('gift-marriage-used','gift',gift.mapAnswersToGift({...ga,marriageDed:'yes',priorMarriageChildUsed:80000000}));
add('inheritance-extras','inheritance',inh.mapAnswersToInheritance({...ia,appraisalFee:2000000,foreignTaxPaid:1000000,foreignTaxBase:100000000,bequestNonHeirs:100000000,renouncedNext:50000000}));
const corp=load('ReportCorporate.jsx',['mapCorporateDirect']);
const cb={netIncome:300000000,year:2026,type:'중소기업',smallPassive:'no'};
test('corporate missing income and passive facts block',()=>{assert.throws(()=>corp.mapCorporateDirect({...cb,netIncome:''}));assert.throws(()=>corp.mapCorporateDirect({...cb,smallPassive:''}));});
test('corporate unsupported year blocked',()=>{for(const year of [2022,2027,'2026.5'])assert.throws(()=>corp.mapCorporateDirect({...cb,year}));});
test('corporate dates must be complete valid and ordered',()=>{for(const dates of [{start:'2026-01-01'},{start:'2026-02-30',end:'2026-12-31'},{start:'2025-01-01',end:'2026-12-31'},{start:'2026-12-31',end:'2026-01-01'}])assert.throws(()=>corp.mapCorporateDirect({...cb,...dates}));});
test('corporate flat foreign credit is guarded even with legacy confirmation',()=>{assert.throws(()=>corp.mapCorporateDirect({...cb,foreignPaid:1000,foreignIncome:10000}));assert.throws(()=>corp.mapCorporateDirect({...cb,foreignPaid:1000,foreignConfirmed:true}));assert.equal(corp.mapCorporateDirect({...cb,foreignIncome:10000,foreignConfirmed:true}).foreign_source_income,undefined);});
for(const year of [2023,2024,2025,2026])add('corporate-year-'+year,'corporate',corp.mapCorporateDirect({...cb,year}));
for(const type of ['중소기업','중견기업','일반법인'])add('corporate-loss-'+type,'corporate',corp.mapCorporateDirect({...cb,type,loss:100000000}));
test('corporate full flat FTC facts still require ledger',()=>assert.throws(()=>corp.mapCorporateDirect({...cb,foreignPaid:1000000,foreignIncome:30000000,foreignConfirmed:true}),/원장/));
test('corporate unclassified deduction is not silently treated as no deduction',()=>assert.throws(()=>corp.mapCorporateDirect({...cb,deduction:10000000}),/최저한세/));
test('corporate explicit zero deductions and FTC are retained',()=>{const r=corp.mapCorporateDirect({...cb,deduction:0,foreignPaid:0});assert.equal(r.income_deduction,0);assert.equal(r.foreign_tax_paid,0);});
add('corporate-passive','corporate',corp.mapCorporateDirect({...cb,smallPassive:'yes'}));
add('corporate-dates','corporate',corp.mapCorporateDirect({...cb,start:'2026-01-01',end:'2026-12-31'}));
if(process.env.WEB_REQUEST_OUTPUT)fs.writeFileSync(process.env.WEB_REQUEST_OUTPUT,JSON.stringify(cases,null,2));
console.log('OK '+checks+' checks; '+cases.length+' mapped HTTP cases');

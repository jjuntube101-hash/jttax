const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/src/SupportReviewDirect.jsx','utf8'),env={};vm.createContext(env);vm.runInContext(source.slice(0,source.indexOf('function JTSupportReviewDirect')),env);
const gift={date:'2026-10-20',evidence:'SYNTH:whole',donor:'D',donee:'R',age:'30',relationship:'직계존속',assets:[{id:'C1',kind:'cash',amount:'200000000',evidence:'SYNTH:balance'}],checks:Object.fromEntries(['same_donor_donee_date','resident_donee','all_current_assets_included','lawful_values_reviewed','no_duplicate_or_debt_netting','ordinary_gift'].map(k=>[k,true]))};
let n=0;const test=(name,fn)=>{fn();n++;};
test('actual builder accepts ISO date and exact integer inventory without doubling',()=>{const r=env.support11Request('gift',gift);assert.equal(r.path,'/v1/calc/gift');assert.equal(r.payload.value,200000000);assert.equal(r.payload.gift_asset_facts.assets[0].adopted_value,200000000);});
test('unknown row value is not zero',()=>assert.throws(()=>env.support11Request('gift',{...gift,assets:[{...gift.assets[0],amount:''}]})));
test('explicit actual zero is preserved',()=>assert.equal(env.support11Request('gift',{...gift,assets:[{...gift.assets[0],amount:'0'}]}).payload.value,0));
test('missing review cannot become qualified',()=>assert.throws(()=>env.support11Request('gift',{...gift,checks:{}})));
test('invalid leap date rejected before HTTP',()=>assert.throws(()=>env.support11Request('gift',{...gift,date:'2026-02-29'})));
test('scientific and unsafe money rejected before HTTP',()=>{for(const amount of ['1e8','9007199254740992','-1'])assert.throws(()=>env.support11Request('gift',{...gift,assets:[{...gift.assets[0],amount}]}));});
const stock={
  date:'2026-06-30',purpose:'증여',company:'SYNTH',evidence:'합성 평가표',marketEvidence:'합성 시가 검토표',
  equity:'100000000',equityEvidence:'합성 재무상태표',purchased:'0',purchaseSource:'합성 무형자산 원장',
  total:'10000',owned:'100',par:'5000',started:'10',remaining:'10',realEstatePercent:'0',stockPercent:'0',
  assets:[{id:'자산1',amount:'100000000',evidence:'합성 자산 원장'}],liabilities:[],
  checks:Object.fromEntries(vm.runInContext('S11_STOCK_CHECKS',env).map(([key])=>[key,true])),
  years:[2025,2024,2023].map(y=>({periodStart:y+'-01-01',periodEnd:y+'-12-31',source:y+' 합성 조정계산서',income:'20000000',tax:'0',add:'0',sub:'0',shares:'10000'}))
};
const stockRequest=env.support11Request('stock',stock);
test('public supplement carries all dated source rows and documented zero',()=>{
  const facts=stockRequest.payload.reviewed_supplement_facts;
  assert.equal(stockRequest.path,'/v1/calc/unlisted-stock');
  assert.equal(facts.purchased_intangibles,0);
  assert.equal(facts.purchased_evidence,stock.purchaseSource);
  stock.years.forEach((r,i)=>assert.deepEqual({...facts.profit_years[i]},{year:2025-i,period_start:r.periodStart,period_end:r.periodEnd,evidence:r.source}));
});
test('incomplete, short or wrong-year source periods and unconfirmed purchases withhold the result',()=>{
  for(const change of [{purchased:''},{purchased:'1'},{purchaseSource:''}])
    assert.throws(()=>env.support11Request('stock',{...stock,...change}));
  for(const change of [{source:''},{periodStart:''},{periodEnd:'2024-12-31'},{periodStart:'2025-02-01'}])
    assert.throws(()=>env.support11Request('stock',{...stock,years:[{...stock.years[0],...change},...stock.years.slice(1)]}));
});
const credit=fs.readFileSync(__dirname+'/src/CreditSettlementDirect.jsx','utf8'),c={};vm.createContext(c);vm.runInContext(credit.slice(0,credit.indexOf('function JTCreditSettlementDirect')),c);
const salary={taxType:'income',incomeMode:'salary',income:'30000000',spouse:'no',dependents:'0',pension:'0',evidence:'SYNTH:salary',checks:Object.fromEntries(['income_and_deductions_complete','residence_and_ordinary_tax_status','direct_foreign_taxes_only','eligibility_and_amounts_reviewed','no_other_credits','salary_worldwide_scope_and_treaty_costs_confirmed','no_special_salary_deductions_claimed'].map(k=>[k,true])),foreign:[],credits:[],local:[]};
test('salary stays gross salary in opt-in3 and is never business_income',()=>{const r=c.creditSettlementRequest(salary).request;assert.equal(r.schema_version,'credit-settlement/3');assert.equal(r.base.salary_income,30000000);assert(!('business_income'in r.base));});
test('salary treaty/deduction qualification cannot default true',()=>{const x=JSON.parse(JSON.stringify(salary));delete x.checks.salary_worldwide_scope_and_treaty_costs_confirmed;assert.throws(()=>c.creditSettlementRequest(x));});
test('legacy business keeps settlement1',()=>{const r=c.creditSettlementRequest({...salary,incomeMode:'business'}).request;assert.equal(r.schema_version,'credit-settlement/1');assert.equal(r.base.business_income,30000000);assert(!('salary_income'in r.base));});
console.log('Support11 source builders '+n+' PASS');

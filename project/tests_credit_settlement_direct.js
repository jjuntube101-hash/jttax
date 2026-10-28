const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const all=fs.readFileSync(path.join(__dirname,'src/CreditSettlementDirect.jsx'),'utf8');
const pure=all.split('function JTCreditSettlementDirect')[0];
const box={};vm.createContext(box);vm.runInContext(pure+';this.make=creditSettlementRequest;this.result=creditSettlementResult;this.checks=CREDIT_REVIEW_CHECKS;this.sources=CREDIT_SOURCE_CHECKS;',box);
function draft(kind='corporate'){const d={taxType:kind,income:kind==='corporate'?'500000000':'100000000',corporateType:'중소기업',loss:'0',spouse:'no',dependents:'0',pension:'0',evidence:'SYNTH:전체검토',countryEvidence:'SYNTH:조정후분자',credits:[],foreign:[],local:[],checks:{ordinary_minimum_status_confirmed:true,separate_businesses_reconciled:true}};for(const [k] of [...box.checks,...box.sources])d.checks[k]=true;return d;}
function ft(amount='50000000',sourceIncome='500000000'){return {id:'US-TAX',country:'US',sourceIncome,year:'2026',amount,used:'0',evidence:'SYNTH:실제직접외국세'};}
const cases=[];let d=draft();d.foreign=[ft()];cases.push(box.make(d));assert.equal(cases.at(-1).request.foreign_countries[0].adjustment_review.relief_income_excluded,true);
d=draft();d.credits=[{id:'INV',code:'investment',year:'2026',amount:'60000000',used:'0',business:'B1',assets:'ASSET1',evidence:'SYNTH:발생공제액'}];d.foreign=[ft('10000000')];cases.push(box.make(d));assert.equal(cases.at(-1).request.credits[0].generated_amount,60000000);
d=draft('income');d.foreign=[ft('10000000','40000000')];cases.push(box.make(d));assert.equal(cases.at(-1).request.base.business_income,100000000);
d=draft();d.income='2000000000';d.decreased='0';d.credits=[{id:'SME',code:'sme_reduction',year:'2026',business:'B1',assets:'',evidence:'SYNTH:적격30%',reductionIncome:'2000000000',percent:'30'}];cases.push(box.make(d));assert.equal(cases.at(-1).request.credits[0].generated_amount,0);assert.equal(cases.at(-1).request.credits[0].reduction_rate.numerator,30);assert.throws(()=>box.make({...d,credits:[{...d.credits[0],percent:'50'}]}));
d=draft();d.credits=[{id:'RD-OLD',code:'rd_general',year:'2019',amount:'50000000',used:'0',business:'B1',assets:'',evidence:'SYNTH',oldExpiry:'2024',transition:'yes',transitionEvidence:'SYNTH:유효잔액'}];d.foreign=[ft()];cases.push(box.make(d));assert.equal(cases.at(-1).request.credits[0].transition_2021_eligible,true);
d=draft();d.local=[{id:'LOCAL-2016',year:'2016',amount:'600000000',used:'0',evidence:'SYNTH:별도지방원장'}];cases.push(box.make(d));
for(const [k] of [...box.checks,...box.sources]){const x=draft();x.foreign=[ft()];x.checks[k]=false;assert.throws(()=>box.make(x));}
assert.throws(()=>box.make({...draft(),income:'9007199254740992'}));assert.throws(()=>box.make({...draft(),loss:''}));
assert.throws(()=>box.make({...draft(),foreign:[ft(),{...ft(),id:'OTHER',sourceIncome:'1'}]}));
assert.throws(()=>box.result({'상태':'needs_input','국세결정세액':0}));
assert.throws(()=>box.result({'상태':'ok','산출세액':80,'국세결정세액':30,'지방소득세':7,'총세부담':38}));
assert.equal(box.result({'상태':'partial','산출세액':80,'국세결정세액':0,'지방소득세':7,'총세부담':7})['상태'],'partial');
require('@babel/parser').parse(all,{sourceType:'script',plugins:['jsx']});
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(cases,null,2));
console.log('Credit form: strict known inputs, statutory rates, source adjustments, corporate/personal/local ledgers and partial display PASS; mapped cases '+cases.length);

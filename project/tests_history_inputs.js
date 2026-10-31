const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),esbuild=require('esbuild');
function load(name,functions){const s=fs.readFileSync(path.join(__dirname,'src/Report'+name+'.jsx'),'utf8'),env=vm.createContext({React:{useState(){},createElement(){}},Date,Number,String,Object,Math,JSON,window:{jtLaw:(_k,v)=>v,jtFallbackGaps:r=>r.filter(x=>x.when).map(x=>x.why)}});vm.runInContext(esbuild.transformSync(s,{loader:'jsx'}).code+'\nglobalThis.api={'+functions.join(',')+'}',env);return env.api;}
const g=load('Gift',['mapAnswersToGift']),i=load('Inheritance',['mapAnswersToInheritance']),c=load('Comprehensive',['mapAnswersToComprehensive']);
for(const year of [2017,2018,2020,2024,2025]) assert.equal(g.mapAnswersToGift({giftDate:year+'-06-01',giftValue:150000000}).tax_year,year);
assert.throws(()=>g.mapAnswersToGift({giftDate:'2020-02-30'}));
const inh={deathDate:'2020-06-01',historicalChildAges:'30',estateValue:1005000000,hasSpouse:'no',numChildren:'1',burialFacilityExpenses:0,netFinancialAssets:100000000};
const ib=i.mapAnswersToInheritance(inh);assert.equal(ib.death_date,'2020-06-01');assert.equal(ib.heirs[0].age,30);assert.equal(ib.burial_facility_expenses,0);assert.equal(ib.net_financial_assets,100000000);
assert.equal(i.mapAnswersToInheritance({...inh,historicalChildAges:'30, 40'}),null);
const sb=i.mapAnswersToInheritance({...inh,hasSpouse:'yes',spouseActual:'none'});assert.equal(sb.heirs[1].actual_inheritance,0);
const ca={taxYear:'2022',ownerType:'person',housingCount:'one',totalValue:1500000000,ownerAge:60,holdingYears:5,propertyTaxPaid:2000000,priorYearTotalTax:10000000};
assert.equal(c.mapAnswersToComprehensive(ca).tax_year,2022);
assert.equal(c.mapAnswersToComprehensive({...ca,taxYear:'2023'}).tax_year,2023);
const multi={...ca,taxYear:'2023',housingCount:'two',deemedOneHouse:'no',historicalHousingValues:'800000000,700000000'};
assert.equal(c.mapAnswersToComprehensive(multi).housing_values.length,2);
assert.equal(c.mapAnswersToComprehensive({...multi,historicalHousingValues:'1500000000'}),null);
assert.equal(c.mapAnswersToComprehensive({...ca,taxYear:'2022.5'}),null);
for(const name of ['Gift','Inheritance','Comprehensive'])assert(fs.readFileSync(path.join(__dirname,'src/Report'+name+'.jsx'),'utf8').includes('입력 수정·재계산'));
console.log('PASS historical date, edit mapping, child ages, spouse zero, housing values and edit controls');

const prior={giftDate:'2020-06-01',giftValue:100000000,priorGiftHas:'yes',priorGiftValue:150000000,historicalPriorValues:'150000000',historicalPriorTaxes:'10000000',historicalPriorDeductions:'50000000'};
const pg=g.mapAnswersToGift(prior);assert.equal(pg.prior_gift_taxes[0],10000000);assert.equal(pg.prior_gift_deductions[0],50000000);assert.equal(pg.gift_history,undefined);
assert.throws(()=>g.mapAnswersToGift({...prior,historicalPriorTaxes:''}));
assert.throws(()=>g.mapAnswersToGift({...prior,historicalPriorValues:'100000000,50000000'}));
const gaps=load('Comprehensive',['compFallbackGaps']);
assert(gaps.compFallbackGaps({...multi,historicalHousingValues:''},{precise:true})[0].includes('물건별'));
const ig=load('Inheritance',['inhFallbackGaps']);
assert(ig.inhFallbackGaps({...inh,isResident:'yes',historicalChildAges:''},{precise:true})[0].includes('만 나이'));
console.log('PASS Claude feedback: explicit prior facts, actionable missing input');

// 실제 컴포넌트의 질문 선택식을 실행한다: 필수 사실이 상세 단계에 갇히면 실패한다.
const giftSource=fs.readFileSync(path.join(__dirname,'src/ReportGift.jsx'),'utf8');
const ast=require('@babel/parser').parse(giftSource,{sourceType:'script',plugins:['jsx']});
const selectors=new Map();
function visit(node){
  if(!node || typeof node!=='object')return;
  if(node.type==='VariableDeclarator' && ['allVisible','isQuick','visibleQs'].includes(node.id.name))
    selectors.set(node.id.name,giftSource.slice(node.init.start,node.init.end));
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value && typeof value==='object')visit(value);
}
visit(ast);
assert.equal(selectors.size,3,'실제 빠른 계산 질문 선택식이 모두 존재해야 한다');
const giftQuestions=load('Gift',['GIFT_QS']).GIFT_QS;
function questionIds(answers,phase='quick'){
  const env=vm.createContext({answers,phase,GIFT_QS:giftQuestions});
  return JSON.parse(vm.runInContext([...selectors].map(([name,expr])=>'const '+name+' = '+expr+';').join('\n')+'\nJSON.stringify(visibleQs.map(q=>q.id))',env));
}
const historicalAnswers={...prior,relationship:'직계존속',genSkip:'no'};
for(const id of ['genSkip','marriageDed','childbirthDed','priorGiftHas','priorGiftValue','historicalPriorValues','historicalPriorTaxes','historicalPriorDeductions']){
  assert(questionIds(historicalAnswers).includes(id),'과거 첫 계산 전 필수 질문: '+id);
  assert(!questionIds(historicalAnswers,'detail').includes(id),'상세 단계 중복 질문 제외: '+id);
}
assert(questionIds({...historicalAnswers,genSkip:'yes'}).includes('childDeceased'));
assert(!questionIds({...historicalAnswers,priorGiftHas:'no'}).includes('historicalPriorTaxes'));
assert(!questionIds({...historicalAnswers,giftDate:'2026-06-01'}).includes('genSkip'),'현행 빠른 계산 동작 보존');
assert(questionIds({...historicalAnswers,giftDate:'2026-06-01'},'detail').includes('genSkip'));
console.log('PASS historical gift quick/detail question reachability and current-year preservation');

// Same donor aggregation and deduction-group use are different facts.
{
const gf=load('Gift',['mapAnswersToGift','giftFallbackGaps','giftApplyAnswer']);
const GB={assetType:'cash',giftDate:'2026-10-01',giftValueCash:'100000000',relationship:'직계존속',doneeAge:'30',genSkip:'no',isResident:'yes',priorGiftHas:'no',priorGroupDeductionUsed:'50000000'};
const GP={...GB,priorGiftHas:'yes',priorGiftValue:'40000000',priorGiftOrdinaryDeduction:'30000000',priorGiftMarriageChildDeduction:'0'};
const map=gf.mapAnswersToGift, gaps=a=>gf.giftFallbackGaps(a,{precise:true});
assert.equal(map(GB).prior_deduction_used,50000000);
assert.equal(map(GB).gift_history,undefined,'Other donor amount must not be aggregated');
assert.equal(gaps(GB).length,0);
assert.equal(map({...GB,priorGroupDeductionUsed:'0'}).prior_deduction_used,0);
const split=map({...GP,priorGiftDed:'99999999'});
assert.equal(split.gift_history[0].deduction_used,30000000);
assert.equal(split.gift_history[0].marriage_child_deduction_used,0);
assert.equal(split.gift_history[0].total_deduction_used,undefined,'Stale mixed deduction must not override confirmed components');
assert.equal(gaps(GP).length,0);
for(const field of ['priorGroupDeductionUsed','priorGiftOrdinaryDeduction','priorGiftMarriageChildDeduction']) {
  for(const bad of [undefined,null,'',' ',true,[],{},'x',-1,1.5,9007199254740992])
    assert(gaps({...GP,[field]:bad}).length>0,field+' '+String(bad)+' must block all result sinks');
}
for(const bad of [undefined,null,'',' ',true,[],{},'x',0,-1,1.5,9007199254740992]) {
  assert.throws(()=>map({...GP,priorGiftValue:bad}));
  assert(gaps({...GP,priorGiftValue:bad}).length>0);
}
assert(gaps({...GB,priorGiftHas:undefined}).length>0);
assert(gaps({...GP,priorGroupDeductionUsed:'20000000'}).length>0,'Group total smaller than selected history is contradictory');
assert(gaps({...GP,priorGiftOrdinaryDeduction:'50000000'}).length>0,'Deductions cannot exceed the selected gift');
for(const [key,value] of [['relationship','배우자'],['giftDate','2026-09-01'],['priorGiftHas','no'],['priorGiftValue','60000000']]) {
  const next=gf.giftApplyAnswer(GP,key,value);
  for(const field of ['priorGroupDeductionUsed','priorGiftOrdinaryDeduction','priorGiftMarriageChildDeduction'])assert.equal(next[field],undefined);
}
assert.equal(gf.giftApplyAnswer(GP,'priorGiftValue',GP.priorGiftValue).priorGroupDeductionUsed,GP.priorGroupDeductionUsed);
assert.equal(gf.giftApplyAnswer(GP,'giftValueCash','110000000').priorGroupDeductionUsed,GP.priorGroupDeductionUsed);
for(const id of ['priorGiftHas','priorGiftValue','priorGroupDeductionUsed','priorGiftOrdinaryDeduction','priorGiftMarriageChildDeduction']){
  assert(questionIds(GP).includes(id),id+' reachable before first calculation');
  assert(!questionIds(GP,'detail').includes(id),id+' not repeated in detail');
}
assert(!questionIds(GB).includes('priorGiftOrdinaryDeduction'));
assert(!questionIds({...GP,relationship:'배우자'}).includes('priorGiftMarriageChildDeduction'));
assert(!questionIds({...GP,giftDate:'2025-10-01'}).includes('priorGroupDeductionUsed'),'Historical support unchanged');
console.log('PASS 2026 gift group totals, separated deductions, missing/invalid facts, stale answer invalidation and first-step reachability');

}

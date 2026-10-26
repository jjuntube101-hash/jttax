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

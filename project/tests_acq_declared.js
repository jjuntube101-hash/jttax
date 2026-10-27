const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),esbuild=require('esbuild');
const source=fs.readFileSync(path.join(__dirname,'src/ReportAcquisition.jsx'),'utf8');
const env=vm.createContext({React:{useState(){},createElement(){}},Date,Number,String,Object,Math,JSON,window:{jtLaw:(_k,v)=>v}});
vm.runInContext(esbuild.transformSync(source,{loader:'jsx'}).code+'\nglobalThis.api={mapAcqDeclaredInputs,acqDeclaredFields};',env);
const {mapAcqDeclaredInputs:map,acqDeclaredFields:fields}=env.api;
const common={date:'2026-10-25',scopeEvidence:'합성 일반 취득 검토',scopeConfirmed:true};
const history={...common,mode:'history',date:'2019-10-25',propertyType:'주택',owner:'individual',cause:'유상취득',value:'720000000',standard:'0',wholeStandard:'0',baseRule:'actual_verified',actualBasis:'verified_transaction',valueEvidence:'합성 당시 거래신고 검증',valuationConfirmed:true,regulated:'no',areaClass:'85이하',housingConfirmed:true};
const component={...common,mode:'nonhousing_purchase',value:'600000000',dateEvidence:'합성 취득일',valueEvidence:'합성 가액',priceConfirmed:true,wholeConfirmed:true,basis:'standard_ratio',part1:'100000000',part2:'200000000',part1Evidence:'합성 첫 구성',part2Evidence:'합성 둘째 구성',area:'84',regulated:'no',housingEvidence:'합성 도시지역 1주택',housingConfirmed:true};
const cost={...common,mode:'cost',propertyType:'상가사무실',owner:'individual',contractAmount:'100000000',contractEvidence:'합성 도급',costConfirmed:true,exclusionsConfirmed:true,rows:[{category:'materials',amount:'10000000',overlap:'no',evidence:'합성 재료비'},{category:'labor',amount:'20000000',overlap:'yes',evidence:'합성 포함 노무비'},{category:'vat',amount:'11000000',overlap:'no',evidence:'합성 제외 부가세'}]};
const nonprofit={...common,mode:'nonprofit',propertyType:'상가사무실',owner:'corporate',value:'100000000',category:'social_welfare_corporation',eligibilityEvidence:'합성 취득일 자격',valueEvidence:'합성 시가인정액',eligibilityConfirmed:true,valuationConfirmed:true,wholeConfirmed:true,noDebtConfirmed:true};
const share={...common,mode:'share',value:'500000000',numerator:'1',denominator:'2',wholeStandard:'600000000',acquiredStandard:'300000000',expectedWhole:'1000000000',area:'100',regulated:'no',shareEvidence:'합성 지분과 대가',shareConfirmed:true};
const cases=[['history2019',history,15840000],['history2020',{...history,date:'2020-10-25',contractDate:'2020-01-02',presale:'no',contractEvidence:'합성 계약'},14256000],['nonhousing',component,27600000],['mixed',{...component,mode:'mixed_purchase'},20600000],['mixed-original',{...component,mode:'mixed_original',part1:'100',part2:'200'},18560000],['cost',cost,3476000],['nonprofit',nonprofit,3160000],['share',share,17500000]];
let mutations=0;
const exported=[];
for(const [name,a,total] of cases){
  const body=JSON.parse(JSON.stringify(map(a)));exported.push({name,answers:a,request:body,total});
  for(const f of fields(a)){assert.throws(()=>map({...a,[f.key]:f.type==='flag'?false:''}),name+' missing '+f.key);mutations++;}
  assert.throws(()=>map({...a,date:'2026-02-30'}));assert.throws(()=>map({...a,date:'2013-01-01'}));
}
assert.equal(map({...history,...{mode:'share'},...share}).historical_facts,undefined);
assert.deepEqual(Object.keys(map(component)),['composition_facts']);
assert.equal(map(cost).property_value,undefined);
assert.equal(map({...history,areaClass:'모름'}).area_class,'모름');
assert.throws(()=>map({...share,value:'9007199254740992'}));
assert.throws(()=>map({...cost,rows:[{...cost.rows[0],overlap:''}]}));
assert(source.includes('setResult(null);setError(\'\');'));
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(exported,null,2));
console.log(`PASS ${cases.length} real mapper contracts; ${mutations} missing-fact mutations; stale fields and integer boundaries`);

const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const text=fs.readFileSync(path.join(__dirname,'src/ReportAcquisition.jsx'),'utf8');
const box={React:{useState(){}},window:{}};vm.createContext(box);
vm.runInContext(require('esbuild').transformSync(text.split('function JTReportAcquisition')[0],{loader:'jsx'}).code+';globalThis.qs=ACQ_QS;',box);
const a={acquisitionDate:'2026-10-20',acquisitionType:'매매',propertyType:'주택',acquirerType:'individual',housingCount:'1',propertyValue:'500000000',exclusiveArea:'95',
 ruralReview:'yes',ruralCapital:'no',ruralUrban:'no',ruralUnit:'면',ruralResidential:'yes',ruralLand:'yes',ruralLandArea:'300',ruralFloorArea:'100',ruralEvidence:'SYNTH:취득일 자료'};
const plain=v=>JSON.parse(JSON.stringify(v));let n=0;const test=(name,f)=>{f();n++;};
test('explicit facts preserve false and exact independent payload',()=>{const p=plain(box.mapAnswersToAcquisition(a));assert.equal(p.housing_count,1);assert.deepEqual(p.rural_housing_facts,{schema_version:'rural-housing/1',is_capital_region:false,is_urban_area:false,administrative_unit:'면',wholly_residential:true,includes_appurtenant_land:true,acquired_appurtenant_land_area:300,dwelling_footprint_area:100,evidence_ref:a.ruralEvidence});});
test('no land explicitly maps to zero; never infer floor from exclusive area',()=>{const f=plain(box.mapAnswersToAcquisition({...a,ruralLand:'no'})).rural_housing_facts;assert.equal(f.acquired_appurtenant_land_area,0);assert.equal(f.includes_appurtenant_land,false);assert.equal(f.dwelling_footprint_area,undefined);});
test('missing active facts cannot become false or zero',()=>{for(const key of ['ruralCapital','ruralUrban','ruralUnit','ruralResidential','ruralLand','ruralLandArea','ruralFloorArea','ruralEvidence'])assert.throws(()=>box.mapAnswersToAcquisition({...a,[key]:''}),key);});
test('negative location requires other-exemption review',()=>{assert.throws(()=>box.mapAnswersToAcquisition({...a,ruralCapital:'yes'}));assert.equal(box.mapAnswersToAcquisition({...a,ruralCapital:'yes',ruralOther:'yes'}).rural_housing_facts.other_rural_exemptions_absent,true);});
test('unknown and hidden stale facts are not sent',()=>{for(const change of [{ruralReview:'unknown'},{acquisitionDate:'2026-11-16'},{exclusiveArea:'85'},{exclusiveArea:'100.01'},{housingCount:'2'},{acquirerType:'corporate'},{acquisitionType:'상속'},{propertyType:'상가'}])assert.equal(box.mapAnswersToAcquisition({...a,...change}).rural_housing_facts,undefined);});
test('verified autumn dates allow the original facts and direct missing-input navigation',()=>{
  const review={required_facts:['rural_housing_facts']};
  for(const date of ['2026-10-30','2026-10-31','2026-11-15']){
    const answers={...a, acquisitionDate:date};
    assert.ok(box.mapAnswersToAcquisition(answers).rural_housing_facts);
    assert.equal(box.acqFirstOpenQuestion({...answers,ruralReview:'unknown'},review).id,'ruralReview');
    assert.equal(box.acqRuralReviewLimit(answers,review),null);
  }
  const question=box.qs.find(q=>q.id==='ruralReview');
  assert.match(question.sub,/2026-01-01부터 2026-11-15까지/);
  const future={...a,acquisitionDate:'2026-11-16'};
  assert.match(box.acqRuralReviewLimit(future,review),/2026-11-15.*별도 검토/);
  assert.equal(box.acqRuralReviewLimit(future,{required_facts:['exclusive_area']}),null);
  assert.equal(box.acqRuralReviewLimit(future,null),null);
});
test('85 and100 boundaries only include strict extension interval',()=>{for(const [v,want]of [['85',false],['85.01',true],['100',true],['100.01',false]])assert.equal(box.acqRuralScope({...a,exclusiveArea:v}),want);});
test('required facts return to relevant question including freeform evidence',()=>{assert.equal(box.acqFirstOpenQuestion({...a,ruralReview:'unknown'},{required_facts:['rural_housing_facts']}).id,'ruralReview');assert.equal(box.acqFirstOpenQuestion({...a,ruralEvidence:''},{required_facts:['rural_housing_facts']}).id,'ruralEvidence');assert.equal(box.acqFirstOpenQuestion(a,{required_facts:['exclusive_area']}).id,'exclusiveArea');});
test('partial education issue is never cleared by client facts',()=>{box.window.jtValidCalc=()=>true;const review={can_present_amount:false,can_generate_commentary:false,can_share:false,issues:[{code:'ACQ_PARTIAL_FIXED_EDUCATION'}]};const result=box.acqCalcFromEngine({calc:{상태:'ok',세액:3500000,취득세:3000000,지방교육세:500000,농어촌특별세:0,과세표준:500000000},review});assert.equal(result.precise,false);assert.equal(result.engineState,'review');assert.equal(result.calculationReview.issues[0].code,'ACQ_PARTIAL_FIXED_EDUCATION');});
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(plain(box.mapAnswersToAcquisition(a)),null,2));
console.log('Rural housing input flow: '+n+' PASS; explicit facts, unknown refusal, stale pruning, area/date bounds and required-input navigation');

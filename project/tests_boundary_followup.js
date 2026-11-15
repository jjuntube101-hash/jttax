const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const read=n=>fs.readFileSync(path.join(__dirname,'src',n),'utf8');
const box={};vm.createContext(box);vm.runInContext(read('AcquisitionSpecialDirect.jsx').split('function JTAcquisitionSpecialDirect')[0]+read('CreditGenerationInputs.jsx').split('function JTCreditGenerationInputs')[0]+';this.make=acquisitionSpecialRequest;this.checks=acquisitionSpecialChecks;this.gen=creditGenerationRequest;',box);
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/boundary_followup_20261029.json'),'utf8')),f=fixture.treasury;
const d={kind:'majority_shareholder',majorityMode:'treasury_first',date:f.acquisition_date,evidence:f.evidence,formationDate:f.formation_date,sameGroup:'yes',actualAcquisition:'yes',groupEvidence:f.group_review_evidence,treasuryTransferEvidence:f.treasury_transfer_evidence,totalBefore:String(f.total_shares_before),totalAfter:String(f.total_shares_after),checks:{scope_confirmed:true},shareholders:f.shareholders.map(v=>({id:v.id,before:String(v.before_shares),after:String(v.after_shares),inGroup:v.in_group_before?'yes':'no',isTreasury:v.is_treasury?'yes':'no',evidence:v.evidence})),majorityHistory:f.history.map(v=>({date:v.date,issued:String(v.issued_shares),treasury:String(v.treasury_shares),group:String(v.group_shares),evidence:v.evidence})),assets:f.assets.map(v=>({id:v.id,type:v.property_type,value:String(v.net_book_value),region:v.jurisdiction,evidence:v.evidence}))};
for(const [key]of box.checks(d))d.checks[key]=true;
assert.deepStrictEqual(JSON.parse(JSON.stringify(box.make(d).special_facts)),f);
for(const [key]of box.checks(d))assert.throws(()=>box.make({...d,checks:{...d.checks,[key]:false}}));
assert.throws(()=>box.make({...d,treasuryTransferEvidence:''}));assert.throws(()=>box.make({...d,date:'2026-10-30'}));
const draft=v=>Array.isArray(v)?v.map(draft):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,typeof x==='boolean'?(k.endsWith('_confirmed')||k==='comparison_population_reviewed'?x:x?'yes':'no'):draft(x)])):typeof v==='number'?String(v):v;
const e=draft(fixture.employment);e.employmentEnabled=true;const raw=box.gen(e);assert.deepStrictEqual(JSON.parse(JSON.stringify(raw)),fixture.employment);
assert.equal(raw.employment.first_claim_year,2026);assert(raw.employment.first_claim_evidence.includes('SYNTH'));
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({treasury:box.make(d),employment:{generation_facts:raw}},null,2));
console.log('Boundary web payloads: treasury direct-single-cause /3, source/rights checks, first-claim facts and comparison-ledger mapping PASS');

// Exercise the active saved-transfer HTTP error handler, without a live account.
(async()=>{
  const source=read('TransferCases.jsx');
  const handler=source.slice(source.indexOf('  const api = async'),source.indexOf('  const mutation ='));
  let response;
  const context={AbortController,setTimeout,clearTimeout,window:{JT_ENGINE_BASE:'http://127.0.0.1:8000'},
    jtGiftSession:{token:'synthetic'},fetch:async()=>response};
  vm.createContext(context);vm.runInContext(handler+';this.api=api;',context);
  for(const [code,message] of [['ENGINE_NEEDS_INPUT','실제 거주기간 move_in_date 확인 필요'],
      ['ENGINE_UNSUPPORTED','양도연도 2028은 미지원'],['DRAFT_NOT_RUNNABLE','증여 이월과세 미적용 검토 필요']]){
    response={ok:false,status:422,json:async()=>({detail:{code,message,engine_state:'needs_input'}})};
    await assert.rejects(context.api('/v1/transfer-cases/synthetic/runs'),e=>
      e.message.includes(message)&&e.message.includes('이번 계산 결과는 저장되지 않았습니다.'));
  }
  response={ok:false,status:422,json:async()=>({detail:{code:'ENGINE_CALCULATION_ERROR',message:'internal detail'}})};
  await assert.rejects(context.api('/v1/transfer-cases/synthetic/runs'),e=>
    e.message.includes('계산 입력을 추가 확인')&&!e.message.includes('internal detail'));
  response={ok:true,status:200,json:async()=>({status:'succeeded',run_id:'frozen-synthetic'})};
  assert.equal((await context.api('/v1/transfer-cases/synthetic/runs')).run_id,'frozen-synthetic');
  assert(source.includes('saved.last_successful_run_id?await api'));
  assert(source.includes("await mutation(base+'/runs'"));
  console.log('Saved transfer holds: fact requirements reach customer alerts, internal errors remain generic, successful frozen flow PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});

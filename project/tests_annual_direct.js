const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),esbuild=require('esbuild');
const src=fs.readFileSync(path.join(__dirname,'src/TransferAnnualDirect.jsx'),'utf8');
const env=vm.createContext({React:{},window:{},Date,Number,String,Object,JSON,Set});
vm.runInContext(esbuild.transformSync(src,{loader:'jsx'}).code+'\nglobalThis.api={annualDirectRequest,annualDirectValid,annualStepAmount}',env);
const draft={year:'2026',taxpayer:'SYNTH-NH-ANNUAL',source:'synthetic-annual-review',residentConfirmed:true,scopeConfirmed:true,localConfirmed:true,assessmentsConfirmed:true,noCorrectionConfirmed:true,noOtherCreditsConfirmed:true,paymentsConfirmed:true,noOffsetsConfirmed:true,nationalAssessed:'20000000',localAssessed:'2000000',nationalPaid:'15000000',localPaid:'1500000',nationalAssessmentSource:'synthetic-national-return',localAssessmentSource:'synthetic-local-return',nationalPaymentSource:'synthetic-national-receipt',localPaymentSource:'synthetic-local-receipt',assets:[{_id:1,ref:'A',source:'synthetic-A',type:'토지',acquired:'2020-01-01',sold:'2026-10-19',sale:'500000000',cost:'300000000',expense:'10000000',ordinaryConfirmed:true,adjustedConfirmed:true,noSpecialConfirmed:true,businessConfirmed:true},{_id:2,ref:'B',source:'synthetic-B',type:'상가',acquired:'2019-01-01',sold:'2026-10-20',sale:'400000000',cost:'250000000',expense:'5000000',ordinaryConfirmed:true,adjustedConfirmed:true,noSpecialConfirmed:true}]};
const clone=x=>JSON.parse(JSON.stringify(x));let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
const request=d=>clone(env.api.annualDirectRequest(d));
test('separate credit and payment, no client-supplied tax',()=>{const r=request(draft);assert.equal(r.payment_context.national_paid_krw,15000000);assert.equal(r.settlement_context.national_prior_assessed_tax_krw,20000000);assert.equal(r.annual_request.common_facts.assets.length,2);assert(!JSON.stringify(r).includes('annual_tax'));});
for(const field of ['residentConfirmed','scopeConfirmed','localConfirmed','assessmentsConfirmed','noCorrectionConfirmed','noOtherCreditsConfirmed','paymentsConfirmed','noOffsetsConfirmed'])test('unconfirmed '+field,()=>assert.throws(()=>request({...draft,[field]:false})));
for(const [key,value] of [['year','2025'],['nationalPaid',''],['nationalPaid','1.1'],['nationalPaid','-1'],['nationalPaid','20000001'],['localPaid','2000001'],['taxpayer',' '],['nationalPaymentSource',''],['nationalPaid','9007199254740992']])test('invalid '+key+value,()=>assert.throws(()=>request({...draft,[key]:value})));
for(const [key,value] of [['ref','B'],['type','주택'],['sold','2025-10-19'],['sold','2026-02-30'],['acquired','2027-01-01'],['cost',''],['expense',''],['ordinaryConfirmed',false],['businessConfirmed',false],['noSpecialConfirmed',false]])test('invalid asset '+key,()=>{const d=clone(draft);d.assets[0][key]=value;assert.throws(()=>request(d));});
test('min/max assets',()=>{assert.throws(()=>request({...draft,assets:draft.assets.slice(0,1)}));assert.throws(()=>request({...draft,assets:Array(21).fill(draft.assets[0])}));});
test('explicit zero payment allowed',()=>assert.equal(request({...draft,nationalPaid:'0',localPaid:'0'}).payment_context.national_paid_krw,0));
test('malformed response never displayed',()=>{for(const c of [null,{}, {'상태':'ok'},{'상태':'needs_input','납부대사':{status:'ok'}}])assert.equal(env.api.annualDirectValid(c),false);});
const changed=clone(draft);changed.assets[0].sale='600000000';
const third=clone(draft);third.assets.push({...third.assets[0],_id:3,ref:'C',acquired:'2021-01-01',sold:'2026-10-20',sale:'80000000',cost:'100000000',expense:'2000000'});
const fixtures={draft,requests:{original:request(draft),changed:request(changed),third:request(third),unpaid:request({...draft,nationalPaid:'0',localPaid:'0'}),paid:request({...draft,nationalPaid:'20000000',localPaid:'2000000'})}};
if(process.env.ANNUAL_FIXTURE_OUT)fs.writeFileSync(process.env.ANNUAL_FIXTURE_OUT,JSON.stringify(fixtures,null,2));
module.exports={draft,fixtures};console.log(`${checks} annual direct checks PASS`);

for(const [value,expected] of [[0,'0원'],[-10,'-10원'],[{numerator:'150000000',denominator:'1'},'150,000,000원'],[{numerator:'2',denominator:'2'},'1원'],[{numerator:'1',denominator:'3'},'1 / 3원 (정확분수)'],[{numerator:'1',denominator:'0'},'금액 확인 필요'],[null,'금액 확인 필요']]) test('exact amount display '+JSON.stringify(value),()=>assert.equal(env.api.annualStepAmount(value),expected));
const report=fs.readFileSync(path.join(__dirname,'src/Report.jsx'),'utf8');
const shellSource=report.slice(report.indexOf('function JTReportShell('),report.indexOf('window.JTReportShell = JTReportShell;'));
const shellEnv=vm.createContext({React:{createElement:(tag,props,...children)=>({tag,props,children})},JT_PRIVACY_NOTE:{engine:'privacy'}});
vm.runInContext(esbuild.transformSync(shellSource,{loader:'jsx'}).code+';globalThis.shell=JTReportShell',shellEnv);
function textOf(node){return node==null||typeof node==='boolean'?'':typeof node==='object'?(node.children||[]).map(textOf).join(''):String(node);}
test('direct form hides undefined progress',()=>{const out=JSON.stringify(shellEnv.shell({}));assert(!out.includes('NaN'));assert(!out.includes('Step '));assert(!out.includes('jt-report-shell__bar'));});
test('wizard progress remains visible and clamped',()=>{assert(textOf(shellEnv.shell({stepIdx:1,stepTotal:3})).includes('Step 2 / 3'));assert(textOf(shellEnv.shell({stepIdx:3,stepTotal:3})).includes('Step 3 / 3'));});
console.log(`${checks} annual direct and display checks PASS`);

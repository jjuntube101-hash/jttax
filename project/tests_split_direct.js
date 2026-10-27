const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..'),esbuild=require(root+'/node_modules/esbuild');
const env=vm.createContext({React:{},window:{},Date,Number,String,Object,JSON,BigInt});
vm.runInContext(esbuild.transformSync(fs.readFileSync(root+'/project/src/TransferSplitDirect.jsx','utf8'),{loader:'jsx'}).code+'\nglobalThis.map=splitDirectRequest;globalThis.blank=splitDirectBlank;globalThis.labels=splitReviewLabels;globalThis.resume=splitDirectResume;globalThis.result=splitDirectResult;',env);
const clone=x=>JSON.parse(JSON.stringify(x));const draft=clone(env.blank());
assert.throws(()=>env.map(draft));assert.equal(Object.keys(draft.review).length,0);
Object.assign(draft,{source:'test-only-contract',property:'test-only-land',sold:'2026-10-17',whole:'600000000',lots:[{date:'2016-01-01',numerator:'1',denominator:'2',sale:'300000000',cost:'100000000',expense:'5000000',source:'test-only-A'},{date:'2023-10-17',numerator:'1',denominator:'2',sale:'300000000',cost:'200000000',expense:'5000000',source:'test-only-B'}]});
for(const k of Object.keys(env.labels)){draft.review[k]=true;draft.sources[k]='test-only-'+k;}
const request=clone(env.map(draft));assert.equal(request.schema_version,'transfer-split-public/1');assert.equal(request.common_facts.events.length,4);assert.equal(request.common_facts.amounts[0].amount_krw,100000000);assert.equal(request.common_facts.amounts[2].amount_krw,200000000);assert.equal(request.common_facts.expenses.length,2);
let guards=0;const bad=fn=>{const d=clone(draft);fn(d);assert.throws(()=>env.map(d));guards++;};
bad(d=>d.review.resident=false);bad(d=>d.sources.annual=' ');bad(d=>d.sold='2026-10-24');bad(d=>d.lots[0].date='2016-02-30');bad(d=>d.lots[1].date=d.lots[0].date);bad(d=>d.lots[1].numerator='2');bad(d=>d.whole='600000001');bad(d=>d.lots[0].expense='');bad(d=>d.lots[0].sale='105000000');bad(d=>d.lots[0].source='');bad(d=>d.lots[0].cost='1e8');bad(d=>d.lots[0].sale='9007199254740992');
const changed=clone(draft);changed.lots[1].cost='210000000';const changedRequest=clone(env.map(changed));assert.equal(changedRequest.common_facts.amounts[2].amount_krw,210000000);assert.equal(request.common_facts.amounts[2].amount_krw,200000000);
const resumed=clone(env.resume(draft));assert.deepEqual(resumed.lots,draft.lots);assert.deepEqual(resumed.review,{});assert.throws(()=>env.map(resumed));assert.equal(draft.review.resident,true);
bad(d=>d.whole='1000000000000001');
const calc={'상태':'ok','공개계약':'transfer-split-public/1','세액':72324000,'지방소득세':7232400,'농어촌특별세':0,'총세부담':79556400,'원본결과':{schema_version:'transfer-split-result/1',rows:[{lot_id:'L1',transfer_gain:195000000,long_term_deduction:39000000,transfer_income:156000000},{lot_id:'L2',transfer_gain:95000000,long_term_deduction:5700000,transfer_income:89300000}],transfer_income:245300000,basic_deduction:2500000,tax_base:242800000,calculated_tax:72324000,final_tax:72324000,local_income_tax:7232400,total_tax:79556400}};
assert.equal(env.result(calc),calc);for(const mutate of [r=>delete r['총세부담'],r=>r['원본결과'].rows[0].lot_id='L2',r=>r['세액']++,r=>r['원본결과'].rows[1].transfer_income++,r=>r['원본결과'].tax_base=-1,r=>r['원본결과'].rows.pop(),r=>r['원본결과'].schema_version='other']){const r=clone(calc);mutate(r);assert.throws(()=>env.result(r));}
if(process.env.SPLIT_FIXTURE_OUT)fs.writeFileSync(process.env.SPLIT_FIXTURE_OUT,JSON.stringify({draft,request,changedRequest},null,2));
console.log('split direct: empty defaults, attributed amounts, '+guards+' blocking guards, edit/recalculate mapping PASS');

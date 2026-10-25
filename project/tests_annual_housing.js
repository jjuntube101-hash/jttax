const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),esbuild=require('esbuild');
const {draft:base}=require('./tests_annual_direct');
const env=vm.createContext({React:{},window:{},Date,Number,String,Object,JSON,Set});
vm.runInContext(esbuild.transformSync(fs.readFileSync(path.join(__dirname,'src/TransferAnnualDirect.jsx'),'utf8'),{loader:'jsx'}).code+'\nglobalThis.api={annualDirectRequest}',env);
const clone=x=>JSON.parse(JSON.stringify(x)),request=d=>clone(env.api.annualDirectRequest(d));
const draft=clone(base);draft.nationalAssessed='10000000';draft.localAssessed='1000000';draft.nationalPaid='8000000';draft.localPaid='800000';
draft.assets=[0,1,2].map(i=>({...base.assets[0],_id:i+1,ref:'ABC'[i],source:'synthetic-'+i,type:'주택',acquired:'2024-01-01',sold:'2026-06-01',sale:String([300000000,250000000,180000000][i]),cost:'200000000',expense:'0',housingCount:'2',regulated:'no',acqRegulated:'no',housingOrdinaryConfirmed:true}));
draft.assets.forEach(r=>delete r.businessConfirmed);
let checks=0;function test(name,fn){fn();checks++;console.log('PASS '+name);}
test('housing routes existing public1 with reviewed sources',()=>{const r=request(draft);assert.equal(r.annual_request.schema_version,'transfer-annual-public/1');assert.equal(r.annual_request.transfers.length,3);assert.equal(r.annual_request.common_facts,undefined);assert.equal(r.annual_request.asset_source_ids.A,'synthetic-0');});
for(const [k,v] of [['housingCount',''],['housingCount','1'],['housingCount','2.1'],['regulated',''],['regulated','yes'],['acqRegulated',''],['housingOrdinaryConfirmed',false],['acquired','2025-01-01'],['source',''],['type','토지']])test('guard '+k+v,()=>{const d=clone(draft);d.assets[0][k]=v;assert.throws(()=>request(d));});
test('acquisition regulated explicitly true allowed',()=>{const d=clone(draft);d.assets[0].acqRegulated='yes';assert.equal(request(d).annual_request.transfers[0].regulated_at_acquisition,true);});
test('stale housing facts omitted on nonhousing path',()=>{const d=clone(base);d.assets[0]={...d.assets[0],housingCount:'1',regulated:'yes',housingOrdinaryConfirmed:false};assert.deepEqual(request(d),request(base));});
const changed=clone(draft);changed.assets[0].sale='310000000';const paid={...draft,nationalPaid:'10000000'};
const fixtures={draft,requests:{original:request(draft),changed:request(changed),paid:request(paid)}};
if(process.env.HOUSE_FIXTURE_OUT)fs.writeFileSync(process.env.HOUSE_FIXTURE_OUT,JSON.stringify(fixtures,null,2));
module.exports={draft,fixtures};console.log(`${checks} housing mapping checks PASS`);

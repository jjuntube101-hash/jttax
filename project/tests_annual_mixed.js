const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict'),esbuild=require('esbuild');
const {draft:houses}=require('./tests_annual_housing');const clone=x=>JSON.parse(JSON.stringify(x));
const env=vm.createContext({React:{},window:{},Date,Number,String,Object,JSON,Set});vm.runInContext(esbuild.transformSync(fs.readFileSync(path.join(__dirname,'src/TransferAnnualDirect.jsx'),'utf8'),{loader:'jsx'}).code+'\nglobalThis.map=annualDirectRequest',env);
const draft=clone(houses);draft.assets[1].type='토지';draft.assets[1].businessConfirmed=true;draft.assets[2].type='상가';
const request=d=>clone(env.map(d));let n=0;function test(name,fn){fn();n++;console.log('PASS '+name);}
test('mixed public5 has all assets and explicit applicable facts',()=>{const r=request(draft).annual_request;assert.equal(r.schema_version,'transfer-annual-public/5');assert.equal(r.transfers.length,3);assert.equal(r.transfers[0].business_land,null);assert.equal(r.transfers[1].business_land,true);assert.equal(r.transfers[1].housing_count,null);assert.equal(r.transfers[2].regulated_at_acquisition,null);});
const removed=clone(draft);removed.assets.pop();const changed=clone(draft);changed.assets[0].sale='310000000';const added=clone(draft);added.assets.push({...draft.assets[2],_id:4,ref:'D',source:'synthetic-D',sale:'220000000'});
test('delete loss row removes facts and source id',()=>{const r=request(removed).annual_request;assert.equal(r.transfers.length,2);assert.equal(r.asset_source_ids.C,undefined);});
test('add and edit supply current values',()=>{assert.equal(request(added).annual_request.transfers.length,4);assert.equal(request(changed).annual_request.transfers[0].transfer_price,310000000);});
for(const [index,key,value] of [[0,'housingCount','1'],[0,'regulated','yes'],[1,'businessConfirmed',false],[2,'adjustedConfirmed',false],[2,'noSpecialConfirmed',false],[1,'ref','A']])test('mixed guard '+key,()=>{const d=clone(draft);d.assets[index][key]=value;assert.throws(()=>request(d));});
const fixtures={draft,requests:{original:request(draft),removed:request(removed),changed:request(changed),added:request(added)}};
if(process.env.MIXED_FIXTURE_OUT)fs.writeFileSync(process.env.MIXED_FIXTURE_OUT,JSON.stringify(fixtures,null,2));
module.exports={draft,fixtures};console.log(`${n} mixed mapping checks PASS`);

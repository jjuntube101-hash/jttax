const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root=require('path').resolve(__dirname,'..'),esbuild=require(root+'/node_modules/esbuild');
const {draft:base}=require(root+'/project/tests_annual_mixed');
const draft=JSON.parse(JSON.stringify(base));
for(const r of draft.assets.slice(1)){r.sale=String(Number(r.sale)*2);r.cost=String(Number(r.cost)*2);r.expense=String(Number(r.expense)*2);Object.assign(r,{ownership:'share',shareNumerator:'1',shareDenominator:'2',shareBasisConfirmed:true});}
const env=vm.createContext({React:{},window:{},Date,Number,String,Object,JSON,Set});vm.runInContext(esbuild.transformSync(fs.readFileSync(root+'/project/src/TransferAnnualDirect.jsx','utf8'),{loader:'jsx'}).code+'\nglobalThis.map=annualDirectRequest',env);
const clone=x=>JSON.parse(JSON.stringify(x)),request=x=>clone(env.map(x));
const changed=clone(draft);changed.assets[1].shareNumerator='2';
const removed=clone(draft);removed.assets.pop();
const fixtures={draft,requests:{original:request(draft),changed:request(changed),removed:request(removed)}};
for(const [key,value] of [['shareBasisConfirmed',false],['shareNumerator','3'],['shareDenominator','0'],['sale','500000001']]){const d=clone(draft);d.assets[1][key]=value;assert.throws(()=>request(d));}
const house=clone(draft);house.assets[0].ownership='share';assert.throws(()=>request(house));
const nohouse=clone(draft);nohouse.assets.shift();assert.throws(()=>request(nohouse));
if(process.env.SHARE_FIXTURE_OUT)fs.writeFileSync(process.env.SHARE_FIXTURE_OUT,JSON.stringify(fixtures,null,2));console.log('6 share mapping guards PASS');

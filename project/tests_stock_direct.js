const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),esbuild=require('esbuild');
const source=fs.readFileSync(path.join(__dirname,'src/StockTransferDirect.jsx'),'utf8');
const env=vm.createContext({React:{},window:{},Date,Number,String,Object,JSON,Set});
vm.runInContext(esbuild.transformSync(source,{loader:'jsx'}).code+';globalThis.api={stockDirectRequest,stockDirectValid,STOCK_DIRECT_CHECKS,STOCK_BASIS_CHECKS};',env);
const draft={taxpayer:'SYNTH-TAXPAYER',issuer:'SYNTH-ISSUER',established:'2010-01-01',fye:'2025-12-31',issued:'1000000',own:'2000',other:'998000',value:'1000',assets:'1000000000',acquired:'2024-03-01',sold:'2026-10-20',lotQuantity:'1000',quantity:'1000',cost:'100000000',sale:'120000000',source:'SYNTH-ALL-EVIDENCE',reviewer:'fictional reviewer',reviewDate:'2026-10-20',jurisdiction:'SYNTH-JURISDICTION',sme:'SME',...Object.fromEntries(env.api.STOCK_DIRECT_CHECKS.map(([k])=>[k,true]))};
const clone=x=>JSON.parse(JSON.stringify(x)),request=d=>clone(env.api.stockDirectRequest(d));let count=0;
const historical={...draft,sold:'2025-10-20',fye:'2024-12-31',reviewDate:'2025-10-20'};
const rawBasis={...historical,valuationMode:'raw',value:'',netIncome:'80000000000',netAssets:'50000000000',businessStart:'2010-01-01',businessStartSource:'SYNTH-business-start',...Object.fromEntries(env.api.STOCK_BASIS_CHECKS.map(([key])=>[key,true]))};
const older={...rawBasis,sold:'2024-01-20',fye:'2023-12-31',acquired:'2022-03-01',reviewDate:'2024-01-20'};
function test(name,fn){fn();count++;console.log('PASS '+name);}
test('complete ordinary payload, independent input values',()=>{const r=request(draft);assert.equal(r.transactions[0].quantity,1000);assert.equal(r.issuers[0].holder_scope.positions[1].quantity,998000);assert.equal(r.transactions[0].acquisition_payment.amount,100000000);assert.equal(r.transactions[0].disposal_receipt.amount,120000000);assert.equal(r.taxpayer.taxpayer_id,draft.taxpayer);assert.deepEqual(r.foreign_taxes,[]);assert(!JSON.stringify(r).includes('national_payable'));});
for(const [key] of env.api.STOCK_DIRECT_CHECKS)test('unknown confirmation '+key,()=>assert.throws(()=>request({...draft,[key]:false})));
for(const [key,value] of [['sold','2026-10-21'],['sold','2026-02-30'],['acquired','2026-01-01'],['fye','2024-12-31'],['own','2001'],['quantity','1001'],['lotQuantity','2001'],['cost',''],['cost','1.5'],['cost','9007199254740992'],['other','0'],['assets','0'],['sme',''],['source',' '],['reviewer',''],['reviewDate','2026-02-30']])test('reject '+key+'='+value,()=>assert.throws(()=>request({...draft,[key]:value})));
test('changed sale actually changes request',()=>assert.equal(request({...draft,sale:'130000000'}).transactions[0].disposal_receipt.amount,130000000));
test('explicit zero sale permitted',()=>assert.equal(request({...draft,sale:'0'}).transactions[0].disposal_receipt.amount,0));
test('2025 historical date maps year, fiscal evidence and annual end',()=>{const r=request(historical);assert.equal(r.tax_year,2025);assert.equal(r.annual_scope.as_of,'2025-12-31');assert.equal(r.issuers[0].sme_document.as_of,'2024-12-31');assert.equal(r.transactions[0].disposal_receipt.occurred_on,'2025-10-20');});
for(const sold of ['2025-10-01','2025-11-27'])test('historical period edge '+sold,()=>assert.equal(request({...historical,sold}).tax_year,2025));
for(const [key,value] of [['sold','2025-09-30'],['sold','2025-11-28'],['fye','2025-12-31'],['acquired','2025-01-01']])test('historical guard '+key+value,()=>assert.throws(()=>request({...historical,[key]:value})));
test('raw statutory basis is explicit, no manual amount or cost replacement',()=>{const r=request(rawBasis);assert.equal(r.issuers[0].per_share_value.amount_krw,null);assert.equal(r.issuers[0].per_share_value.raw_basis.net_income_total,80000000000);assert.equal(r.issuers[0].per_share_value.raw_basis.issued_quantity,1000000);assert.equal(r.transactions[0].acquisition_payment.amount,100000000);});
for(const [key] of env.api.STOCK_BASIS_CHECKS)test('unknown raw basis '+key,()=>assert.throws(()=>request({...rawBasis,[key]:false})));
for(const key of ['netIncome','netAssets'])for(const value of ['','-1','1.5'])test('raw basis invalid '+key+value,()=>assert.throws(()=>request({...rawBasis,[key]:value})));
for(const [key,value] of [['businessStart',''],['businessStart','2024-02-30'],['businessStartSource','']])test('raw basis requires sourced business start '+key+value,()=>assert.throws(()=>request({...rawBasis,[key]:value})));
for(const sold of ['2024-01-01','2024-01-20','2024-02-28'])test('H6 older reviewed date '+sold,()=>{const r=request({...older,sold});assert.equal(r.tax_year,2024);assert.equal(r.annual_scope.as_of,'2024-12-31');assert.equal(r.issuers[0].per_share_value.raw_basis.reference_fiscal_year_end,'2023-12-31');});
for(const sold of ['2023-12-31','2024-02-29'])test('H6 unreviewed date blocked '+sold,()=>assert.throws(()=>request({...older,sold})));
test('malformed and blocked results never pass',()=>{for(const value of [null,{}, {status:'needs_input',totals:{national_payable:1,local_payable:1,total_payable:2}}, {status:'ok',candidate_only:false,issues:[],totals:{national_payable:10,local_payable:1,total_payable:12}}])assert.equal(env.api.stockDirectValid(value),false);});
test('valid zero and integer totals pass',()=>{for(const n of [0,1750000])assert.equal(env.api.stockDirectValid({status:'ok',candidate_only:false,issues:[],totals:{national_payable:n,local_payable:n/10,total_payable:n+n/10}}),true);});
// Exercise actual rendered edit handlers, including late async responses.
let states=[],cursor=0,refs=[],refCursor=0;const React={useState:init=>{const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef:init=>{const i=refCursor++;return refs[i]||(refs[i]={current:init});},useEffect:()=>{},createElement:(tag,props,...children)=>({tag,props:props||{},children})};
let resolveFetch,calls=0;const ui=vm.createContext({React,window:{JT_ENGINE_BASE:'http://test'},JTReportShell:'shell',Date,Number,String,Object,JSON,Set,AbortController,setTimeout,clearTimeout,fetch:()=>{calls++;return new Promise(resolve=>{resolveFetch=resolve;});}});
vm.runInContext(esbuild.transformSync(source,{loader:'jsx'}).code,ui);
function render(){cursor=0;refCursor=0;return ui.window.JTStockTransferDirect({initialDraft:clone(draft)});}
function find(node,test){if(!node||typeof node!=='object')return null;if(test(node))return node;for(const child of (node.children||[]).flat(Infinity)){const got=find(child,test);if(got)return got;}return null;}
function checkAll(){for(const [key] of env.api.STOCK_DIRECT_CHECKS)find(render(),n=>n.props['data-testid']==='stock-direct-'+key).props.onChange({target:{checked:true}});}
async function main(){
  test('restored draft does not restore confirmations',()=>{render();assert.equal(find(render(),n=>n.props['data-testid']==='stock-direct-resident').props.checked,false);});
  checkAll();const pending=find(render(),n=>n.tag==='form').props.onSubmit({preventDefault(){}});assert.equal(calls,1);
  find(render(),n=>n.props['data-testid']==='stock-direct-sale').props.onChange({target:{value:'130000000'}});
  resolveFetch({ok:true,json:async()=>({calc:{status:'ok',candidate_only:false,issues:[],totals:{national_payable:1750000,local_payable:175000,total_payable:1925000}}})});await pending;
  test('late response after edit is discarded',()=>assert.equal(find(render(),n=>n.props['data-testid']==='stock-direct-result'),null));
  test('edit resets confirmations',()=>assert.equal(find(render(),n=>n.props['data-testid']==='stock-direct-ordinary').props.checked,false));
  checkAll();const second=find(render(),n=>n.tag==='form').props.onSubmit({preventDefault(){}});resolveFetch({ok:true,json:async()=>({calc:{status:'needs_input',issues:[{path:'issuer',message:'evidence unknown'}],totals:null}})});await second;
  test('engine unknown displays blocker without totals',()=>{assert(find(render(),n=>n.props.role==='alert'));assert.equal(find(render(),n=>n.props['data-testid']==='stock-direct-result'),null);});
  const third=find(render(),n=>n.tag==='form').props.onSubmit({preventDefault(){}});resolveFetch({ok:true,json:async()=>({calc:{status:'ok',candidate_only:false,issues:[],totals:{national_payable:2750000,local_payable:275000,total_payable:3025000}}})});await third;
  test('corrected input can display fresh successful result',()=>assert(find(render(),n=>n.props['data-testid']==='stock-direct-result')));
  find(render(),n=>n.props['data-testid']==='stock-direct-cost').props.onChange({target:{value:'110000000'}});
  test('editing after success clears old result',()=>assert.equal(find(render(),n=>n.props['data-testid']==='stock-direct-result'),null));
  checkAll();delete ui.window.JT_ENGINE_BASE;const previousCalls=calls;await find(render(),n=>n.tag==='form').props.onSubmit({preventDefault(){}});
  test('missing server configuration blocks network',()=>{assert.equal(calls,previousCalls);assert(find(render(),n=>n.props.role==='alert'));});
  if(process.env.STOCK_FIXTURE_OUT)fs.writeFileSync(process.env.STOCK_FIXTURE_OUT,JSON.stringify({original:request(draft),changed:request({...draft,sale:'130000000'}),historical_original:request(historical),historical_changed:request({...historical,sale:'130000000'}),historical_raw_basis:request(rawBasis),historical_basis_below_threshold:request({...rawBasis,netIncome:'79999999999'}),current_raw_basis:request({...rawBasis,sold:draft.sold,fye:draft.fye,reviewDate:draft.reviewDate}),older_original:request({...older,valuationMode:'manual',value:'1000'}),older_raw_basis:request(older),older_changed:request({...older,valuationMode:'manual',value:'1000',sale:'130000000'})},null,2));
  console.log(count+' stock direct checks PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

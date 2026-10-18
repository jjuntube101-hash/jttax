/* Execute saved equity comparison and legacy comparison JSX without a server. */
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),esbuild=require('esbuild');
const code=esbuild.transformSync(fs.readFileSync(path.join(__dirname,'src/CaseComparisons.jsx'),'utf8'),{loader:'jsx'}).code;
const asset={equity_case_id:'issuer-case-id',company_name:'합성 회사',run_id:'equity-result-id',revision_id:'equity-revision-id',
 input_hash:'a'.repeat(64),share_fraction:'2000/10000',ownership_source:'주주명부 확인',valuation_date:'2026-10-17',unit_value:100000,value:200000000};
const contract={identity:{equities:[{equity_case_id:asset.equity_case_id}],event_date:'2026-10-17',tax_scope:'증여세 계산액만'},
 party_names:{donor:'donor-id',donee:'donee-id'},equity_assets:[asset],address:'합성 회사'};
function render(legacy=false,mixed=false){
 const draft={year:2026,run_ids:[],scope_confirmed:true,review_note:'검토',...(!legacy?{equity_identity_confirmed:true,equity_identity_note:'회사·주식·권한 근거'}:{})};
 let c=legacy?{identity:{share:'1',event_date:'2026-10-17',tax_scope:'증여세 계산액만'},address:'주택',party_names:{donor:'증여자',donee:'수증자'}}:contract;
 if(mixed)c={...c,identity:{...c.identity,assets:[{property_id:'property-id'}],cash:[{cash_source_id:'cash-source-id'}]},
 assets:[{property_id:'property-id',address:'주택 원본',share:'0.5',owner_share:'1',valuation_date:'2026-10-17',valuation_type:'시가',valuation_source:'주택 근거',value:300000000}],
 cash_assets:[{cash_source_id:'cash-source-id',asset_id:'cash-asset-id',valuation_date:'2026-10-17',share_basis:'이전금액 전액',value_source:'현금 계약',source_note:'동일 이전 대상 확인',value:100000000}]};
 const meta={comparison_id:'comparison',revision:1,read_only:true,draft,validation:{can_run:true,checked_contracts:[c]}};
 const row={...c,run_id:'gift-result',revision:1,label:'증여',value:200000000,total:19400000,delta:0,
 components:{증여세:19400000},input_differences:[],source_warnings:[],...(!legacy?{equity_value_differences:[{equity_case_id:asset.equity_case_id,alternative:200000000,delta:0,
 valuation_input_differences:[{field:'adjusted_assets',baseline:'1200000000',alternative:'2200000000'}]}]}:{})};
 if(mixed)row.cash_value_differences=[{cash_source_id:'cash-source-id',alternative:150000000,delta:50000000}];
 const states=[draft,'저장 비교',meta,{response_snapshot:{calc:{identity:c.identity,rows:[row],notice:'저장 세액 비교'}}}];let index=0;
 const ctx=vm.createContext({window:{},React:{createElement:(tag,props,...children)=>({tag,props,children}),
 useState:value=>[index<states.length?states[index++]:((index++,typeof value==='function')?value():value),()=>{}],
 useRef:current=>({current}),useEffect:()=>{}}});
 vm.runInContext(code,ctx);const tree=ctx.window.JTCaseComparisons({clientId:'client',onExit(){}});
 const text=n=>n==null||typeof n==='boolean'?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(''):text(n.children);
 const nodes=[];const walk=n=>{if(!n||typeof n!=='object')return;if(Array.isArray(n))return n.forEach(walk);nodes.push(n);walk(n.children)};walk(tree);
 return {text:text(tree),nodes};
}
let r=render();
for(const value of ['issuer-case-id','equity-result-id','equity-revision-id','a'.repeat(64),'2000/10000','donor-id','donee-id','회사·주식·권한 근거','평가 입력 adjusted_assets','19,400,000원'])assert.ok(r.text.includes(value),value);
assert.ok(r.nodes.some(n=>n.tag==='fieldset'&&n.props.disabled));
assert.ok(r.text.includes('재산별 세액으로 배분하지 않습니다'));
r=render(true);assert.ok(r.text.includes('주택'));assert.ok(r.text.includes('지분 1'));assert.ok(!r.text.includes('undefined'));
r=render(false,true);
for(const value of ['property-id','주택 원본','0.5','cash-source-id','cash-asset-id','2026-10-17','이전금액 전액','현금 계약','동일 이전 대상 확인','현금 가액 차이 50,000,000원'])assert.ok(r.text.includes(value),value);
assert.ok(r.nodes.some(n=>n.props?.['data-testid']==='comparison-cash-0'));
assert.ok(r.nodes.some(n=>n.props?.['data-testid']==='comparison-assets-0'));
console.log('PASS case-comparison JSX: legacy + stock + mixed property/cash identity, scope, proof, deltas, readonly (27 checks)');

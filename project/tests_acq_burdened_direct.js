const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),esbuild=require('esbuild');
const source=fs.readFileSync(path.join(__dirname,'src/AcquisitionBurdenedDirect.jsx'),'utf8');
const env=vm.createContext({React:{},window:{},Date,Number,String,Object,JSON,BigInt});
vm.runInContext(esbuild.transformSync(source,{loader:'jsx'}).code+';globalThis.api={acqBurdenedRequest,acqBurdenedResult,acqBurdenedClear,ACQ_BURDENED_FIELDS,ACQ_BURDENED_CHECKS};',env);
const api=env.api,clone=x=>JSON.parse(JSON.stringify(x));let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
function fixture(){return {...Object.fromEntries(api.ACQ_BURDENED_FIELDS.map(([key,,type])=>[key,type==='date'?'2026-10-23':'SYNTH-'+key])),...Object.fromEntries(api.ACQ_BURDENED_CHECKS.map(([key])=>[key,true])),market:'300000000',standard:'180000000',debt:'100000000'};}
const d=fixture(),original=clone(api.acqBurdenedRequest(d)),changed=clone(api.acqBurdenedRequest({...d,market:'400000000'}));
test('distinct acquisition-only payload, sourced dual values and debt',()=>{assert.equal(original.consultation_context.case_type,'burdened_gift_land_acquisition_ordinary');assert.equal(original.common_facts.valuations[0].amount_krw,300000000);assert.equal(original.common_facts.valuations[1].amount_krw,180000000);assert.equal(original.common_facts.liabilities[0].amount_krw,100000000);assert.equal(original.common_facts.events.length,3);assert.equal(original.consultation_context.filing_order_source_id,'SYNTH-filingSource');assert(!JSON.stringify(original).includes('final_tax'));});
for(const [key] of api.ACQ_BURDENED_FIELDS)test('missing fact/source '+key,()=>assert.throws(()=>api.acqBurdenedRequest({...d,[key]:''})));
for(const [key] of api.ACQ_BURDENED_CHECKS)test('unknown scope '+key,()=>assert.throws(()=>api.acqBurdenedRequest({...d,[key]:false})));
for(const [key,,type] of api.ACQ_BURDENED_FIELDS)if(type==='date')test('unreviewed date '+key,()=>assert.throws(()=>api.acqBurdenedRequest({...d,[key]:'2026-10-22'})));
for(const [key,value] of [['standard','100000000'],['debt','500000'],['market','100500000'],['debt','300000000'],['market','9007199254740992'],['market','1.5'],['debt','-1']])test('invalid '+key+'='+value,()=>assert.throws(()=>api.acqBurdenedRequest({...d,[key]:value})));
test('edit maps new amount without altering debt',()=>{assert.equal(changed.common_facts.valuations[0].amount_krw,400000000);assert.equal(changed.common_facts.liabilities[0].amount_krw,100000000);});
test('resume clears confirmations while preserving facts',()=>{const clean=api.acqBurdenedClear(d);assert.equal(clean.market,d.market);for(const [key] of api.ACQ_BURDENED_CHECKS)assert.equal(clean[key],undefined);});
const valid={'상태':'ok','신고기한':'2026-10-23','취득세':11000000,'지방교육세':1000000,'농어촌특별세':600000,'세액':12600000,'유상부분':{'과세표준':100000000,'취득세':4000000,'지방교육세':400000,'농어촌특별세':200000,'세액':4600000},'증여부분':{'과세표준':200000000,'취득세':7000000,'지방교육세':600000,'농어촌특별세':400000,'세액':8000000}};
test('dual result keeps bases separate',()=>assert.equal(api.acqBurdenedResult(valid)['유상부분']['과세표준'],100000000));
test('blocked/malformed result never shown',()=>{for(const c of [null,{}, {...valid,'상태':'needs_input'},{...valid,'세액':0},{...valid,'신고기한':'2026-12-22'},{...valid,'유상부분':null},{...valid,'증여부분':{...valid['증여부분'],'세액':1}}])assert.throws(()=>api.acqBurdenedResult(c));});
async function uiChecks(){
 let states=[],cursor=0,refs=[],refCursor=0,resolveFetch,calls=0;
 const React={useState:init=>{const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef:init=>{const i=refCursor++;return refs[i]||(refs[i]={current:init});},useEffect:()=>{},createElement:(tag,props,...children)=>({tag,props:props||{},children})};
 const ui=vm.createContext({React,window:{JT_ENGINE_BASE:'http://test'},JTReportShell:'shell',Date,Number,String,Object,JSON,BigInt,AbortController,setTimeout,clearTimeout,fetch:()=>{calls++;return new Promise(resolve=>{resolveFetch=resolve;});}});vm.runInContext(esbuild.transformSync(source,{loader:'jsx'}).code,ui);
 function render(){cursor=0;refCursor=0;return ui.window.JTAcquisitionBurdenedDirect({initialDraft:fixture()});}
 function find(node,test){if(!node||typeof node!=='object')return null;if(test(node))return node;for(const child of (node.children||[]).flat(Infinity)){const got=find(child,test);if(got)return got;}return null;}
 function checkAll(){for(const [key] of api.ACQ_BURDENED_CHECKS)find(render(),n=>n.props['data-testid']==='acq-burdened-'+key).props.onChange({target:{checked:true}});}
 test('restored inputs need fresh confirmation',()=>{assert.equal(find(render(),n=>n.props['data-testid']==='acq-burdened-market').props.value,'300000000');assert.equal(find(render(),n=>n.props['data-testid']==='acq-burdened-unrelated_individuals_confirmed').props.checked,false);});
 checkAll();const pending=find(render(),n=>n.tag==='form').props.onSubmit({preventDefault(){}});assert.equal(calls,1);find(render(),n=>n.props['data-testid']==='acq-burdened-market').props.onChange({target:{value:'400000000'}});resolveFetch({ok:true,json:async()=>({calc:valid})});await pending;
 test('edited input discards late response and resets checks',()=>{assert.equal(find(render(),n=>n.props['data-testid']==='acq-burdened-result'),null);assert.equal(find(render(),n=>n.props['data-testid']==='acq-burdened-unrelated_individuals_confirmed').props.checked,false);});
 checkAll();const next=find(render(),n=>n.tag==='form').props.onSubmit({preventDefault(){}});resolveFetch({ok:true,json:async()=>({calc:valid})});await next;test('fresh successful response displayed',()=>assert(find(render(),n=>n.props['data-testid']==='acq-burdened-result')));
 find(render(),n=>n.props['data-testid']==='acq-burdened-marketSource').props.onChange({target:{value:'SYNTH-new-value-source'}});checkAll();const blocked=find(render(),n=>n.tag==='form').props.onSubmit({preventDefault(){}});resolveFetch({ok:true,json:async()=>({calc:{'상태':'unsupported','세액':0}})});await blocked;test('unsupported never treated as zero tax',()=>{assert(find(render(),n=>n.props.role==='alert'));assert.equal(find(render(),n=>n.props['data-testid']==='acq-burdened-result'),null);});
 delete ui.window.JT_ENGINE_BASE;const before=calls;await find(render(),n=>n.tag==='form').props.onSubmit({preventDefault(){}});test('missing server blocks network',()=>assert.equal(calls,before));
 if(process.env.ACQ_BURDENED_FIXTURE_OUT)fs.writeFileSync(process.env.ACQ_BURDENED_FIXTURE_OUT,JSON.stringify({original,changed},null,2));console.log(count+' burdened acquisition direct checks PASS');
}
uiChecks().catch(e=>{console.error(e);process.exitCode=1;});

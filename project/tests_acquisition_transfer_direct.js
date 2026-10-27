const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),esbuild=require('esbuild');
const source=fs.readFileSync(path.join(__dirname,'src/AcquisitionTransferDirect.jsx'),'utf8');
const env=vm.createContext({React:{},window:{},Date,Number,String,Object,JSON,BigInt});
vm.runInContext(esbuild.transformSync(source,{loader:'jsx'}).code+';globalThis.api={acquisitionTransferRequest,acquisitionTransferChecks,acquisitionTransferFields,acquisitionTransferClear,acquisitionTransferResult};',env);
const api=env.api,clone=x=>JSON.parse(JSON.stringify(x));let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
function fixture(mode){const d=Object.fromEntries(api.acquisitionTransferFields(mode).map(([k])=>[k,'SYNTH-'+k]));d.day=mode==='court'?'2026-06-01':'2026-07-15';d.price='300000000';d.checkedOn='2026-09-15';for(const k of ['offeredContract','receivedContract','offeredValue','receivedValue'])d[k]='300000000';for(const [key] of api.acquisitionTransferChecks(mode))d[key]=true;return d;}
const requests={};
for(const mode of ['court','exchange']){
  const d=fixture(mode),body=clone(api.acquisitionTransferRequest(d,mode));requests[mode]=body;
  test(mode+' correct event/amount/confirmation mapping',()=>{assert.equal(body.consultation_context.case_type,mode==='court'?'court_auction_land_ordinary':'exchange_land_ordinary');assert.equal(body.common_facts.events.length,mode==='court'?1:4);assert.equal(body.common_facts.amounts.length,mode==='court'?1:2);assert.equal(body.common_facts.valuations.length,mode==='court'?0:2);assert.equal(body.common_facts.amounts[0].amount_krw,300000000);assert.equal(body.consultation_context.price_basis_source_id,'SYNTH-priceReview');});
  for(const [k] of api.acquisitionTransferFields(mode))test(mode+' missing '+k,()=>assert.throws(()=>api.acquisitionTransferRequest({...d,[k]:''},mode)));
  for(const [k] of api.acquisitionTransferChecks(mode))test(mode+' unknown '+k,()=>assert.throws(()=>api.acquisitionTransferRequest({...d,[k]:false},mode)));
  test(mode+' resumed checks cleared',()=>{const clean=api.acquisitionTransferClear(d);assert.equal(clean.day,d.day);for(const [k] of api.acquisitionTransferChecks(mode))assert.equal(clean[k],undefined);});
  test(mode+' invalid date',()=>assert.throws(()=>api.acquisitionTransferRequest({...d,day:'2026-02-30'},mode)));
  test(mode+' unreviewed date',()=>assert.throws(()=>api.acquisitionTransferRequest({...d,day:'2026-10-24'},mode)));
}
for(const value of ['0','-1','1.2','9007199254740992'])test('court invalid amount '+value,()=>assert.throws(()=>api.acquisitionTransferRequest({...fixture('court'),price:value},'court')));
test('court explicit 500000 amount retained for engine exemption decision',()=>assert.equal(api.acquisitionTransferRequest({...fixture('court'),price:'500000'},'court').common_facts.amounts[0].amount_krw,500000));
test('exchange independent values cannot silently equalize',()=>assert.throws(()=>api.acquisitionTransferRequest({...fixture('exchange'),offeredValue:'310000000'},'exchange')));
test('future registration review blocked',()=>assert.throws(()=>api.acquisitionTransferRequest({...fixture('exchange'),checkedOn:'2099-01-01'},'exchange')));
test('blocked and malformed results no tax',()=>{for(const v of [null,{}, {'상태':'needs_input','세액':0},{'상태':'ok','과세표준':1,'취득세':1,'지방교육세':0,'농어촌특별세':0,'세액':2}])assert.throws(()=>api.acquisitionTransferResult(v));});
test('independent ordinary land total result accepted',()=>assert.equal(api.acquisitionTransferResult({'상태':'ok','과세표준':300000000,'취득세':12000000,'지방교육세':1200000,'농어촌특별세':600000,'세액':13800000})['세액'],13800000));
requests.court_changed=clone(api.acquisitionTransferRequest({...fixture('court'),price:'400000000'},'court'));
requests.exchange_changed=clone(api.acquisitionTransferRequest({...fixture('exchange'),...Object.fromEntries(['offeredContract','receivedContract','offeredValue','receivedValue'].map(k=>[k,'400000000']))},'exchange'));
if(process.env.ACQ_TRANSFER_FIXTURE_OUT)fs.writeFileSync(process.env.ACQ_TRANSFER_FIXTURE_OUT,JSON.stringify(requests,null,2));
module.exports={fixture,requests};
async function uiChecks(){
  let states=[],cursor=0,refs=[],refCursor=0,resolveFetch,calls=0;
  const React={useState:init=>{const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef:init=>{const i=refCursor++;return refs[i]||(refs[i]={current:init});},useEffect:()=>{},createElement:(tag,props,...children)=>({tag,props:props||{},children})};
  const ui=vm.createContext({React,window:{JT_ENGINE_BASE:'http://test'},JTReportShell:'shell',Date,Number,String,Object,JSON,BigInt,AbortController,setTimeout,clearTimeout,fetch:()=>{calls++;return new Promise(resolve=>{resolveFetch=resolve;});}});
  vm.runInContext(esbuild.transformSync(source,{loader:'jsx'}).code,ui);
  function render(){cursor=0;refCursor=0;return ui.window.JTAcquisitionTransferDirect({mode:'court',initialDraft:fixture('court')});}
  function find(node,test){if(!node||typeof node!=='object')return null;if(test(node))return node;for(const child of (node.children||[]).flat(Infinity)){const got=find(child,test);if(got)return got;}return null;}
  function checkAll(){for(const [key] of api.acquisitionTransferChecks('court'))find(render(),n=>n.props['data-testid']==='acq-transfer-'+key).props.onChange({target:{checked:true}});}
  const valid={'상태':'ok','과세표준':300000000,'취득세':12000000,'지방교육세':1200000,'농어촌특별세':600000,'세액':13800000};
  test('restored draft retains values but clears checks',()=>{assert.equal(find(render(),n=>n.props['data-testid']==='acq-transfer-price').props.value,'300000000');assert.equal(find(render(),n=>n.props['data-testid']==='acq-transfer-noncorporate_confirmed').props.checked,false);});
  checkAll();const pending=find(render(),n=>n.tag==='form').props.onSubmit({preventDefault(){}});assert.equal(calls,1);find(render(),n=>n.props['data-testid']==='acq-transfer-price').props.onChange({target:{value:'400000000'}});resolveFetch({ok:true,json:async()=>({calc:valid})});await pending;
  test('late response after input edit discarded',()=>assert.equal(find(render(),n=>n.props['data-testid']==='acq-transfer-result'),null));
  test('input edit clears confirmations',()=>assert.equal(find(render(),n=>n.props['data-testid']==='acq-transfer-noncorporate_confirmed').props.checked,false));
  checkAll();const corrected=find(render(),n=>n.tag==='form').props.onSubmit({preventDefault(){}});resolveFetch({ok:true,json:async()=>({calc:{...valid,'과세표준':400000000,'취득세':16000000,'지방교육세':1600000,'농어촌특별세':800000,'세액':18400000}})});await corrected;
  test('corrected request gets fresh result',()=>assert(find(render(),n=>n.props['data-testid']==='acq-transfer-result')));
  find(render(),n=>n.props['data-testid']==='acq-transfer-paymentSource').props.onChange({target:{value:'SYNTH-new-receipt'}});checkAll();const blocked=find(render(),n=>n.tag==='form').props.onSubmit({preventDefault(){}});resolveFetch({ok:true,json:async()=>({calc:{'상태':'needs_input','세액':0}})});await blocked;
  test('unknown facts never rendered as zero tax',()=>{assert(find(render(),n=>n.props.role==='alert'));assert.equal(find(render(),n=>n.props['data-testid']==='acq-transfer-result'),null);});
  delete ui.window.JT_ENGINE_BASE;const before=calls;await find(render(),n=>n.tag==='form').props.onSubmit({preventDefault(){}});
  test('missing server blocks network',()=>assert.equal(calls,before));
  console.log(count+' acquisition transfer direct checks PASS');
}
uiChecks().catch(e=>{console.error(e);process.exitCode=1;});

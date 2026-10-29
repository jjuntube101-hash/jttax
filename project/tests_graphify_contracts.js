const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),esbuild=require('esbuild'),parser=require('@babel/parser');
const read=n=>fs.readFileSync(path.join(__dirname,'src',n),'utf8');let count=0;const test=(n,f)=>{f();count++;};
function load(name,names){const src=read(name),ctx=vm.createContext({React:{useState(){}},window:{jtLaw:(_k,v)=>v},Number,Math,Object,String,Date,JSON,isNaN});
 const common=read('Report.jsx');vm.runInContext(common.match(/window\.jtValidCalc = function[\s\S]*?\n  };/)[0],ctx);vm.runInContext(common.match(/window\.jtFallbackGaps = function[\s\S]*?\n};/)[0],ctx);
 vm.runInContext(esbuild.transformSync(src,{loader:'jsx'}).code+';globalThis.api={'+names.join(',')+'}',ctx);return ctx;}
const acq=load('ReportAcquisition.jsx',['acqCalcFromEngine','acqFallbackGaps','acqNormalizeAnswers','acqFirstOpenQuestion']);
const raw={acquisitionDate:'2026-10-20',acquisitionType:'매매',propertyType:'주택',propertyValue:'150000000',exclusiveArea:'84',housingCount:'1',isRegulatedArea:'no',reduction:'first'};
const base={세목:'취득세',상태:'ok',세액:150000,취득세:1500000,지방교육세:150000,농어촌특별세:0,과세표준:150000000,감면유형:'생애최초',감면금액:1500000};
const blocked={schema_version:'calculation-review/1',certainty:'provisional',can_present_amount:false,can_generate_commentary:false,can_share:false,issues:[{code:'ACQ_MINIMUM_AGGREGATION_FACTS',message:'합산사실 확인'}],required_facts:['fixed_exemption_facts']};
test('provisional blocked before interpretation',()=>{const c=acq.api.acqCalcFromEngine({calc:base,review:blocked,version:{engine:'7',build_id:'B',calculation_revision:'R'}});assert.equal(c.precise,false);assert(acq.api.acqFallbackGaps(acq.api.acqNormalizeAnswers(raw),c).length);assert.equal(c.engineVersion.build_id,'B');});
test('old server cannot bypass fixed relief boundary',()=>assert.equal(acq.api.acqCalcFromEngine({calc:base}).precise,false));
test('normal zero remains usable',()=>assert.equal(acq.api.acqCalcFromEngine({calc:{...base,세액:0,지방교육세:0},review:{...blocked,can_present_amount:true,can_share:true,certainty:'conditional',issues:[]}}).precise,true));
test('review targets required fact question',()=>assert.equal(acq.api.acqFirstOpenQuestion(raw,blocked).id,'fixedExemptionChoice'));
test('hidden first facts discarded',()=>{const a=acq.api.acqNormalizeAnswers({...raw,reduction:'none',fixedExemptionChoice:'yes',fixedExemptionEvidence:'SYNTH'});assert.equal(a.fixedExemptionChoice,undefined);assert.equal(a.fixedExemptionEvidence,undefined);});
const vat=load('ReportVat.jsx',['vatDeemedInputs','vatDeadlineFromEngine']),body={business_type:'일반과세자',period_type:'1기_확정',sales_amount:300000000,is_corporate:true};
const input={businessType:'일반과세자',deemedEnabled:'yes',deemedSector:'음식점_법인',deemedPurchase:'106000000',deemedRelatedSupply:'300000000',deemedPeriodEnd:'2026-06-30',deemedOrdinary:'yes',deemedEligible:'yes',deemedNoReturns:'yes',deemedPrior:'0',deemedEvidence:'SYNTH-CORP-FOOD'};
test('server holiday adjusted deadline retained',()=>assert.equal(vat.api.vatDeadlineFromEngine({신고기한:'2026-07-27'}),'2026-07-27'));
test('missing or invalid deadline never becomes generic July25',()=>{assert.equal(vat.api.vatDeadlineFromEngine({}),null);assert.equal(vat.api.vatDeadlineFromEngine({신고기한:'2026-02-30'}),null);});
test('actual zero and facts retained',()=>{const r=vat.api.vatDeemedInputs(input,body);assert.equal(r.deemed_purchase_facts.prior_deducted_amount,0);assert.equal(r.deemed_purchase_facts.related_taxable_supply,300000000);});
for(const key of ['deemedSector','deemedPurchase','deemedRelatedSupply','deemedPeriodEnd','deemedOrdinary','deemedEligible','deemedNoReturns','deemedPrior','deemedEvidence'])test('missing '+key,()=>assert.throws(()=>vat.api.vatDeemedInputs({...input,[key]:''},body)));
for(const [key,value]of [['deemedPrior','1'],['deemedPurchase','1.5'],['deemedRelatedSupply','300000001'],['deemedPeriodEnd','2026-12-31'],['deemedNoReturns','no']])test('guard '+key+value,()=>assert.throws(()=>vat.api.vatDeemedInputs({...input,[key]:value},body)));
test('no stale hidden facts',()=>assert.equal(Object.keys(vat.api.vatDeemedInputs({...input,businessType:'간이과세자'},body)).length,0));
test('explicit corporate SME required',()=>{assert.throws(()=>vat.api.vatDeemedInputs({...input,deemedSector:'제조업_법인'},body));assert.equal(vat.api.vatDeemedInputs({...input,deemedSector:'제조업_법인',deemedSmall:'no'},body).deemed_purchase_facts.small_business_confirmed,false);});
const cvt=load('ReportConvert.jsx',['JTConvertPrecedents']);cvt.React.createElement=(type,props,...children)=>({type,props:props||{},children});
test('unreviewed cross-tax precedent not selected',()=>{const tree=cvt.api.JTConvertPrecedents({reportTag:'LEGACY',calcId:'acquisition'});assert.equal(tree.props['aria-label'],'판례·예규 적용 범위');assert(!JSON.stringify(tree).includes('조심-2021-전-6949'));});
const acqSource=read('ReportAcquisition.jsx'),ast=parser.parse(acqSource,{sourceType:'script',plugins:['jsx']});let run;
function visit(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id?.name==='runAnalysis')run=n.init;for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}visit(ast);
async function actualFlow(choice,first,second){let report=null,ai=0,posts=[];const ctx=load('ReportAcquisition.jsx',['acqNormalizeAnswers']);ctx.answers=ctx.api.acqNormalizeAnswers({...raw,fixedExemptionChoice:choice,fixedExemptionEvidence:choice==='yes'?'SYNTH-NO-AGG':''});ctx.phase='quick';ctx.inputSession={begin:()=>1,sink:(_n,f)=>f};ctx.rawSetReport=v=>report=v;ctx.rawSetQuickReport=()=>{};ctx.rawSetLoading=()=>{};ctx.rawSetErr=()=>{};ctx.console={warn(){},error(e){throw e;}};ctx.window.claude={complete:async()=>{ai++;return JSON.stringify({headline:'合成'.replace('合成','합성')});}};ctx.formatWon=n=>String(n);ctx.serve=async request=>{posts.push(JSON.parse(JSON.stringify(request)));return posts.length===1?first:second;};vm.runInContext('callAcqEngine=serve;globalThis.run='+acqSource.slice(run.start,run.end),ctx);await ctx.run();return{report,ai,posts};}
(async()=>{
 const first={calc:base,review:blocked,version:{engine:'7',build_id:'B'}};
 const a=await actualFlow('unknown',first);assert.equal(a.ai,0);assert.equal(a.posts.length,1);assert.equal(a.report.calc.precise,false);count++;
 const second={...first,calc:{...base,세액:0,지방교육세:0},review:{...blocked,can_present_amount:true,can_generate_commentary:true,can_share:true,issues:[],required_facts:[]}};
 const b=await actualFlow('yes',first,second);assert.equal(b.posts.length,2);assert.equal(b.posts[0].fixed_exemption_facts,undefined);assert.equal(b.posts[1].fixed_exemption_facts.evidence_ref,'SYNTH-NO-AGG');assert.equal(b.report.calc.totalTax,0);count++;
 const partial={...first,review:{...blocked,required_facts:[]}};const c=await actualFlow('yes',partial);assert.equal(c.posts.length,1);assert.equal(c.ai,0);count++;
 if(process.env.GRAPHIFY_UI_FIXTURE_OUT)fs.writeFileSync(process.env.GRAPHIFY_UI_FIXTURE_OUT,JSON.stringify({vat:vat.api.vatDeemedInputs(input,body),vat_body:body},null,2));
 console.log('Graphify certainty/provenance/input tests '+count+' PASS; actual acquisition runAnalysis blocks uncertain AI and uses exact server fact branch');
})().catch(e=>{console.error(e);process.exitCode=1;});

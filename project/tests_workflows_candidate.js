const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm'),assert=require('assert/strict'),{parse}=require('@babel/parser');
const root=__dirname,data=JSON.parse(fs.readFileSync(path.join(root,'dev/release-readiness.json'),'utf8'));
let count=0;function test(name,fn){fn();count++;}
const bundle=fs.readFileSync(path.join(root,'dist/app.js'),'utf8');
const m=/window.JT_FRONTEND_BUILD = Object.freeze\((\{[^\n]+\})\);\n/.exec(bundle);assert(m);
const identity=JSON.parse(m[1]),payload=bundle.slice(m.index+m[0].length),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
test('executed identity matches actual payload and map',()=>{assert.equal(hash(payload),identity.payload_sha256);assert.deepEqual(identity,data.release_candidate.frontend);});
test('separate UI20 evidence stays bound to candidate and preserves held education',()=>{const v=data.workflow20_validation;assert.equal(v.candidate_id,data.release_candidate.id);assert.equal(v.total,20);assert.equal(v.amount_cases,14);assert.equal(v.guard_cases,6);assert.equal(new Set(v.case_ids).size,20);assert.equal(v.education_partial_fixed_confirmed,false);assert(v.not_added_to_original181&&v.original_grades_preserved);});
test('changed executable payload cannot retain same identity',()=>assert.notEqual(hash(payload+';'),identity.payload_sha256));
function declarations(source){const ast=parse(source,{sourceType:'script',plugins:['jsx']}),out={};function walk(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&['VAT_QS','canNext'].includes(n.id?.name))out[n.id.name]=n.init;for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}walk(ast);return out;}
const cgt=fs.readFileSync(path.join(root,'src/ReportCGT.jsx'),'utf8'),cgtAst=parse(cgt,{sourceType:'script',plugins:['jsx']}),gapNode=cgtAst.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='cgtFallbackGaps');
const gaps=Function('window','return ('+cgt.slice(gapNode.start,gapNode.end)+')')({jtFallbackGaps:rows=>rows.filter(r=>r.when).map(r=>r.why)});
test('unknown acquisition region warning contains no unrelated fixed case money',()=>{const warnings=gaps({assetType:'house_1',acqAdjustedZone:'unsure'},{precise:true});assert.equal(warnings.length,1);assert(warnings[0].includes('확인 전에는 현재 입력의 세액을 표시하지 않습니다'));assert(!/[0-9,]+(?:만|억)|실측|↔/.test(warnings[0]));});
test('known acquisition region adds no unknown-region warning',()=>assert.deepEqual(gaps({assetType:'house_1',acqAdjustedZone:'yes'},{precise:true}),[]));
const vat=fs.readFileSync(path.join(root,'src/ReportVat.jsx'),'utf8'),decl=declarations(vat);
const questions=Function('return ('+vat.slice(decl.VAT_QS.start,decl.VAT_QS.end)+')')(),purchase=questions.find(q=>q.id==='purchaseAmount');
const next=Function('cur','answers','return ('+vat.slice(decl.canNext.start,decl.canNext.end)+')()');
test('unknown purchase amount blocks next',()=>assert.equal(next(purchase,{}),false));
test('explicit actual zero advances without inventing purchase',()=>assert.equal(next(purchase,{purchaseAmount:'0'}),true));
test('known positive purchase advances',()=>assert.equal(next(purchase,{purchaseAmount:'1000000'}),true));
const html=fs.readFileSync(path.join(root,'dev/practical-workflows.html'),'utf8'),start=html.indexOf('async function verifyCandidate()'),end=html.indexOf('verifyCandidate();',start);
const nodes={'candidate-status':{textContent:''},'workflows-root':{hidden:false}},buttons=[{disabled:false},{disabled:false}];let mode='same';
const env={window:{JT_ENGINE_BASE:'http://127.0.0.1:19421',JT_FRONTEND_BUILD:identity},document:{getElementById:id=>nodes[id],querySelectorAll:()=>buttons},fetch:async url=>({json:async()=>url.includes('calculation-contracts')?(mode==='backend-stale'?{...data.release_candidate.contract,version:{...data.release_candidate.contract.version,build_sha256:'bad'}}:data.release_candidate.contract):data}),console,Promise};vm.createContext(env);vm.runInContext(html.slice(start,end),env);
(async()=>{await env.verifyCandidate();test('actual candidate controller accepts matching engine and executed payload',()=>assert.equal(env.window.__qa_candidate.matched,true));env.window.JT_FRONTEND_BUILD={...identity,payload_sha256:'bad'};await env.verifyCandidate();test('stale loaded frontend hides inputs and disables workflow launch',()=>{assert.equal(nodes['workflows-root'].hidden,true);assert(buttons.every(b=>b.disabled));});env.window.JT_FRONTEND_BUILD=identity;mode='backend-stale';await env.verifyCandidate();test('stale backend cannot pass same-candidate check',()=>assert.equal(env.window.__qa_candidate.matched,false));console.log('Workflow candidate '+count+' PASS');})().catch(e=>{console.error(e);process.exitCode=1;});

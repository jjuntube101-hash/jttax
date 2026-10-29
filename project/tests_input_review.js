const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const parser=require('@babel/parser');
const source=fs.readFileSync(path.join(__dirname,'src/InputReview.jsx'),'utf8');
const ast=parser.parse(source,{sourceType:'script',plugins:['jsx']});
const names=['jtCreateInputSession','jtInputReviewRows'];
const pure=ast.program.body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name)).map(n=>source.slice(n.start,n.end)).join('\n');
const box={window:{jtMoneyDigits:raw=>{const s=String(raw);return /^\d+$/.test(s)&&Number.isSafeInteger(Number(s))?s:null;}}};vm.createContext(box);vm.runInContext(pure,box);
let cleared=0,values=[];const session=box.jtCreateInputSession(()=>cleared++);
const first=session.begin(),oldResult=session.sink(first,v=>values.push(v));
oldResult('old-before-edit');session.invalidate();oldResult('stale-after-edit');assert.equal(cleared,1);assert.deepEqual(values,['old-before-edit']);
const second=session.begin(),newResult=session.sink(second,v=>values.push(v));oldResult('stale-during-new-request');newResult('fresh');assert.deepEqual(values,['old-before-edit','fresh']);
const third=session.begin();newResult('older-same-input-request');session.sink(third,v=>values.push(v))('newest');assert.equal(values.at(-1),'newest');
session.dispose();session.sink(third,v=>values.push(v))('unmounted');assert.equal(values.at(-1),'newest');session.mount();assert.equal(session.current(third),false);
let queued;const token=session.begin();session.sink(token,v=>{queued=v;})(prior=>prior+1);session.invalidate();assert.equal(queued(5),5);
const questions=[{id:'taxDate',q:'사건일',date:true},{id:'amount',q:'가액',money:true},{id:'zero',q:'없음 금액',money:true,optional:true},{id:'unknown',q:'미확인 금액',money:true},{id:'choice',q:'구분',opts:[['no','아니오'],['yes','예']]},{id:'optional',q:'선택',optional:true}];
let rows=box.jtInputReviewRows(questions,{taxDate:'2026-10-28',amount:'100000000',zero:'0',choice:'no'});
assert.equal(rows[0].value,'2026-10-28');assert.equal(rows[1].value,'100,000,000원');assert.equal(rows[2].value,'0원');assert.equal(rows[3].status,'unknown');assert.notEqual(rows[3].value,'0원');assert.equal(rows[4].value,'아니오');assert(rows[5].value.includes('입력하지 않음'));
rows=box.jtInputReviewRows(questions,{taxDate:'2026-02-30',amount:'9007199254740992'});assert.equal(rows[0].status,'invalid');assert.equal(rows[1].status,'invalid');
const taxes=['CGT','Acquisition','Gift','Inheritance','Property','Comprehensive','Income','Vat','Corporate'];
function walk(n,visit){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(x=>walk(x,visit));return;}if(n.type)visit(n);for(const k of Object.keys(n))if(!['loc','comments','tokens'].includes(k))walk(n[k],visit);}
function verify(text,name){const tree=parser.parse(text,{sourceType:'script',plugins:['jsx']});const fn=tree.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='JTReport'+name);let sessionHook=false,reset=false,guards=new Set(),shells=0;
 walk(fn.body,n=>{if(n.type==='CallExpression'&&n.callee.type==='Identifier'&&n.callee.name==='useJTInputSession')sessionHook=true;
  if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.object.name==='inputSession'&&n.callee.property.name==='sink')guards.add(n.arguments[1].name);
  if(n.type==='VariableDeclarator'&&n.id.name==='setAnswers')reset=text.slice(n.start,n.end).includes('inputSession.invalidate()')&&text.slice(n.start,n.end).includes('rawSetAnswers(update)');
  if(n.type==='JSXOpeningElement'&&n.name.name==='JTReportShell'){shells++;assert(n.attributes.some(a=>a.type==='JSXAttribute'&&a.name.name==='inputReview'),name+' missing review');}
 });assert(sessionHook&&reset&&shells>0,name+' missing draft lifetime');for(const setter of ['rawSetReport','rawSetLoading','rawSetErr'])assert(guards.has(setter),name+' unguarded '+setter);
}
for(const tax of taxes){const text=fs.readFileSync(path.join(__dirname,'src/Report'+tax+'.jsx'),'utf8');verify(text,tax);assert.throws(()=>verify(text.replace('inputSession.sink(inputRequest,rawSetReport)','inputSession.sink(inputRequest,rawSetErr)'),tax));}
console.log('Input review: nine tax wizards, explicit zero/unknown, units/date validation, edit invalidation, late/unmounted/retried response rejection and wiring negative controls PASS');
const directSource=fs.readFileSync(path.join(__dirname,'src/ReportCorporate.jsx'),'utf8');
function directLifetime(text){
 const tree=parser.parse(text,{sourceType:'script',plugins:['jsx']});
 const direct=tree.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='JTCorporateDirect');
 const section=text.slice(direct.start,direct.end);const sinks=new Set();let hook=false,entry=false;
 walk(direct,n=>{if(n.type==='CallExpression'&&n.callee.name==='useJTInputSession')hook=true;
  if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.object.name==='session'&&n.callee.property.name==='sink')sinks.add(n.arguments[1].name);
  if(n.type==='JSXOpeningElement'&&n.name.name==='button'){const click=n.attributes.find(a=>a.name?.name==='onClick');if(click){const handler=text.slice(click.start,click.end);if(handler.includes('onCredits'))entry=handler.includes('session.invalidate()');}}
 });assert(hook&&entry);for(const name of ['rawSetResult','rawSetError','rawSetBusy'])assert(sinks.has(name),'direct request must guard '+name);
 assert(section.includes('initialDraft')&&section.includes('foreignConfirmed:false'));
}
directLifetime(directSource);
assert.throws(()=>directLifetime(directSource.replace('session.sink(token,rawSetResult)','session.sink(token,rawSetError)')));
assert.throws(()=>directLifetime(directSource.replace('session.invalidate();onCredits','onCredits')));
console.log('Corporate direct ledger entry, preserved unconfirmed draft and stale-response wiring positive/negative controls PASS');

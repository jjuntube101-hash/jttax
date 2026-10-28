const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const all=fs.readFileSync(path.join(__dirname,'src/AcquisitionSpecialDirect.jsx'),'utf8');const pure=all.split('function JTAcquisitionSpecialDirect')[0];
const box={};vm.createContext(box);vm.runInContext(pure+';this.make=acquisitionSpecialRequest;this.checks=ACQ_MAJORITY_HISTORY_CHECKS;',box);
function draft(before='55',after='65'){const d={kind:'majority_shareholder',majorityMode:'history',date:'2026-10-28',formationDate:'2010-01-01',historyEvent:'transfer',sameGroup:'yes',actualAcquisition:'yes',totalBefore:'100',totalAfter:'100',evidence:'SYNTH:완전명세',groupEvidence:'SYNTH:10의2집단',checks:{scope_confirmed:true},shareholders:[{id:'A',before,after,inGroup:'yes',isTreasury:'no',evidence:'SYNTH'},{id:'B',before:String(100-Number(before)),after:String(100-Number(after)),inGroup:'no',isTreasury:'no',evidence:'SYNTH'},{id:'issuer',before:'0',after:'0',inGroup:'no',isTreasury:'yes',evidence:'SYNTH'}],majorityHistory:[{date:'2010-01-01',issued:'100',treasury:'0',group:'40',evidence:'SYNTH'},{date:'2020-01-01',issued:'100',treasury:'0',group:'60',evidence:'SYNTH'},{date:'2025-01-01',issued:'100',treasury:'0',group:before,evidence:'SYNTH'}],assets:[{id:'land',type:'토지',value:'100000000',region:'서울',evidence:'SYNTH:일반전체'}]};for(const [k] of box.checks)d.checks[k]=true;return d;}
const cases=[];let d=draft();cases.push(box.make(d));assert.equal(cases.at(-1).special_facts.schema_version,'acquisition-special/2');
d=draft('0','80');d.majorityHistory[1].group='70';cases.push(box.make(d));assert.equal(cases.at(-1).special_facts.history.at(-1).group_shares,0);
d=draft('44','48');d.shareholders[1].before='36';d.shareholders[1].after='32';d.shareholders[2].before=d.shareholders[2].after='20';d.majorityHistory.splice(1,1);d.majorityHistory[1].treasury='20';cases.push(box.make(d));assert.equal(cases.at(-1).special_facts.shareholders[2].is_treasury,true);
d=draft('40','40');d.historyEvent='treasury_acquisition_only';d.actualAcquisition='no';d.shareholders[1].after='30';d.shareholders[2].after='30';d.majorityHistory=d.majorityHistory.slice(0,1);cases.push(box.make(d));
d=draft('55','80');d.historyEvent='capital_increase';d.totalAfter='125';d.shareholders[1].after='45';cases.push(box.make(d));
for(const [k] of box.checks){const x=draft();x.checks[k]=false;assert.throws(()=>box.make(x));}
assert.throws(()=>box.make({...draft(),formationDate:'2010-02-30'}));assert.throws(()=>box.make({...draft(),actualAcquisition:''}));
assert.throws(()=>box.make({...draft(),shareholders:[{...draft().shareholders[0],isTreasury:''}]}));
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(cases,null,2));
console.log('Majority history form: full-group zero, treasury exclusion, raw event types, exact dates and review checks PASS; mapped cases '+cases.length);

assert(!all.includes("'select',yn"),'row options must occupy the third tuple slot to render selects');

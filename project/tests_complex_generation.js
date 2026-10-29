const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const read=n=>fs.readFileSync(path.join(__dirname,'src',n),'utf8');
const box={};vm.createContext(box);vm.runInContext(read('CreditGenerationInputs.jsx').split('function JTCreditGenerationInputs')[0]+read('CreditSettlementDirect.jsx').split('function JTCreditSettlementDirect')[0]+read('AcquisitionSpecialDirect.jsx').split('function JTAcquisitionSpecialDirect')[0]+';this.gen=creditGenerationRequest;this.make=creditSettlementRequest;this.maj=acquisitionSpecialRequest;this.checks=ACQ_ORDERED_CHECKS;this.cgchecks=CREDIT_REVIEW_CHECKS;',box);
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/complex_generation_20261029.json'),'utf8'));
const draft=v=>Array.isArray(v)?v.map(draft):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,typeof x==='boolean'?(k.endsWith('_confirmed')||k==='comparison_population_reviewed'?x:x?'yes':'no'):draft(x)])):typeof v==='number'?String(v):v;
const outputs=[];
for(const caseData of fixture.credits.filter(x=>x.expected_status==='ok')){
 const raw=draft(caseData.input);for(const key of ['research','investment','employment'])if(raw[key])raw[key+'Enabled']=true;
 const result=box.gen(raw);const expected=JSON.parse(JSON.stringify(caseData.input));if(expected.research?.method==='current')delete expected.research.prior_years;assert.deepStrictEqual(JSON.parse(JSON.stringify(result)),expected);outputs.push(result);
}
let raw=draft(fixture.credits.find(x=>x.id==='RD-FIRST').input);raw.researchEnabled=true;raw.research.costs[0].amount='9007199254740992';assert.throws(()=>box.gen(raw));
raw=draft(fixture.credits.find(x=>x.id==='RD-FIRST').input);raw.researchEnabled=true;raw.research.labs[0].valid_from='2020-02-30';assert.throws(()=>box.gen(raw));
const f=fixture.majority[0].input;
const d={kind:'majority_shareholder',majorityMode:'ordered',date:f.acquisition_date,evidence:f.evidence,formationDate:f.formation_date,sameGroup:'yes',groupEvidence:f.group_review_evidence,orderingEvidence:f.ordering_evidence,atomicConcurrent:'no',checks:{scope_confirmed:true},orderedEvents:f.events.map(e=>({sequence:String(e.sequence),time:e.effective_time,type:e.event_type,before:String(e.total_shares_before),after:String(e.total_shares_after),evidence:e.evidence})),orderedShareholders:f.events.flatMap(e=>e.shareholders.map(w=>({sequence:String(e.sequence),id:w.id,before:String(w.before_shares),after:String(w.after_shares),inGroup:w.in_group_before?'yes':'no',isTreasury:w.is_treasury?'yes':'no',evidence:w.evidence}))),majorityHistory:f.history.map(h=>({date:h.date,sequence:String(h.sequence),issued:String(h.issued_shares),treasury:String(h.treasury_shares),group:String(h.group_shares),evidence:h.evidence})),assets:f.assets.map(a=>({id:a.id,type:a.property_type,value:String(a.net_book_value),region:a.jurisdiction,evidence:a.evidence}))};
for(const [k]of box.checks)d.checks[k]=true;
assert.deepStrictEqual(JSON.parse(JSON.stringify(box.maj(d).special_facts)),f);
assert.throws(()=>box.maj({...d,orderedShareholders:[{...d.orderedShareholders[0],sequence:'999'}]}));
for(const [key]of box.checks)assert.throws(()=>box.maj({...d,checks:{...d.checks,[key]:false}}));
assert.throws(()=>box.maj({...d,date:'2026-10-30'}));
const base={taxType:'corporate',income:'500000000',loss:'0',corporateType:'중소기업',evidence:'SYNTH',credits:[],foreign:[],local:[],checks:{ordinary_minimum_status_confirmed:true,separate_businesses_reconciled:true},generate:true,generation:draft(fixture.credits[1].input)};
base.generation.researchEnabled=true;for(const [k]of box.cgchecks)base.checks[k]=true;
assert.equal(box.make(base).request.schema_version,'credit-settlement/2');
assert.equal(box.make(base).request.generation_facts.research.costs[0].amount,100000000);
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({generation:outputs,majority:box.maj(d)},null,2));
console.log('Complex input mappings PASS: '+outputs.length+' raw credit cases, actual-order majority and strict/date/source checks');
const esbuild=require('esbuild');
const componentBox={React:{createElement:(type,props,...children)=>({type,props:props||{},children})},JTNumericInput:()=>null};vm.createContext(componentBox);
vm.runInContext(esbuild.transformSync(read('CreditGenerationInputs.jsx')+';this.form=JTCreditGenerationInputs;',{loader:'jsx'}).code,componentBox);
const find=(node,id)=>{if(!node)return null;if(Array.isArray(node)){for(const child of node){const got=find(child,id);if(got)return got;}return null;}if(node.props?.['data-testid']===id)return node;return find(node.children,id);};
let current={};const render=()=>componentBox.form({value:current,onChange:v=>{current=v;}});
let tree=render();let dateField=find(tree,'generation-company_established_date');assert.equal(dateField.props.type,'text');assert.equal(dateField.props.placeholder,'YYYY-MM-DD');dateField.props.onChange({target:{value:'2010-01-01'}});
tree=render();find(tree,'generation-evidence').props.onChange({target:{value:'SYNTH:edited sibling'}});assert.equal(current.company_established_date,'2010-01-01');
tree=render();find(tree,'generation-enable-investment').props.onChange({target:{checked:true}});
current.investment.scope_confirmed=true;tree=render();find(tree,'generation-investment-first_investment_date').props.onChange({target:{value:'2023-07-01'}});
assert.equal(current.company_established_date,'2010-01-01');assert.equal(current.investment.first_investment_date,'2023-07-01');assert.equal(current.investment.scope_confirmed,false);
console.log('ISO date edit/sibling retention and source edit invalidation PASS');

tree=render();find(tree,'generation-company_established_date').props.onChange({target:{value:'20100101'}});assert.equal(current.company_established_date,'2010-01-01');console.log('Eight-digit date paste normalized to ISO PASS');

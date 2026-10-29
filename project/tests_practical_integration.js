const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),parser=require('@babel/parser'),esbuild=require('esbuild');
const read=name=>fs.readFileSync(path.join(__dirname,'src',name),'utf8');
const decl=(name,names)=>{const s=read(name);return parser.parse(s,{sourceType:'script',plugins:['jsx']}).program.body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name)).map(n=>s.slice(n.start,n.end)).join('\n');};
const box={window:{},React:{Fragment:'fragment',createElement:(type,props,...children)=>({type,props,children})},Number,String};vm.createContext(box);
vm.runInContext(decl('ReportCGT.jsx',['formatWon']),box);
for(const [input,expected] of [[4850001,'4,850,001원'],[87373000,'87,373,000원'],[100000001,'100,000,001원'],[-12345,'-12,345원'],[0,'0원']])assert.equal(box.formatWon(input),expected);
vm.runInContext(esbuild.transformSync(decl('Report.jsx',['JTCalculationStepLabel']),{loader:'jsx'}).code,box);
const words=x=>x==null?'':typeof x==='object'?(x.children||[]).map(words).join(''):String(x);
const label=box.JTCalculationStepLabel({step:{항목:'(-) 공제',조문:'검토 원문',비고:'수입금액 100,000,001원 · 요건 별도 확인'}});
assert(words(label).includes('검토 원문'));assert(words(label).includes('100,000,001원'));assert(words(label).includes('요건 별도 확인'));
assert.equal(words(box.JTCalculationStepLabel({step:{항목:'출처 없음'}})),'출처 없음');
vm.runInContext(read('lawValues.jsx'),box);
assert.equal(box.window.jtLaw('childTaxCredit.qualifiedBirthDateThrough'), '2016-12-31');
assert.equal(box.window.jtLaw('childTaxCredit.excludedBirthYear'),2017);
assert(box.window.jtLaw('childTaxCredit.guidance2026').includes('장애인 예외'));
for(const name of ['ReportIncome.jsx','ReportInsurance.jsx','ReportCorporate.jsx']){const s=read(name);assert(s.includes("jtLaw('childTaxCredit.guidance2026'"));assert(!s.includes('13세 이상'));}
for(const name of ['ReportCGT.jsx','ReportGift.jsx','ReportInheritance.jsx','ReportAcquisition.jsx','ReportProperty.jsx','ReportComprehensive.jsx','ReportIncome.jsx','ReportVat.jsx','ReportCorporate.jsx'])assert(read(name).includes('JTCalculationStepLabel'));
let state=0;box.React.useState=initial=>{state++;return [state===1?{year:'2026',netIncome:'500000000'}:state===3?'':false,()=>{}];};box.useJTInputSession=()=>({invalidate(){}});
vm.runInContext(esbuild.transformSync(decl('ReportCorporate.jsx',['JTCorporateDirect']),{loader:'jsx'}).code,box);
for(const name of ['JTReportShell','JTNumericInput'])box[name]=name;
const tree=box.JTCorporateDirect({onBack(){}}),nodes=[];const walk=n=>{if(!n||typeof n!=='object')return;nodes.push(n);(n.children||[]).flat(Infinity).forEach(walk);};walk(tree);
const numerics=nodes.filter(n=>n.type==='JTNumericInput');assert.equal(numerics.length,5);assert.equal(numerics.filter(n=>n.props.money).length,4);assert.equal(numerics.find(n=>n.props.value==='2026').props.money,false);assert.equal(nodes.filter(n=>n.type==='input'&&n.props.type==='date').length,2);
const comp=read('ReportComprehensive.jsx');assert(comp.includes('배우자·세대원의 별도 소유 지분은 더하지 않습니다'));assert(comp.includes('일반 공동소유는 조회 후 본인 지분가액으로 직접 수정'));
assert(comp.includes('엔진이 그 전체가액에 지분율을 한 번 적용합니다'));
console.log('Practical display, 9-tax evidence, 2026 child contract and corporate money input checks PASS');

vm.runInContext(esbuild.transformSync(read('ReportAcquisition.jsx'),{loader:'jsx'}).code+';globalThis.acqTest={mapAnswersToAcquisition,ACQ_QS};',box);
const base={acquisitionType:'매매',propertyType:'주택',acquirerType:'individual',propertyValue:'100000000',housingCount:'1',exclusiveArea:'100',region:'skip'};
for(const date of ['2026-10-01','2025-06-30','2024-02-29']){const r=box.acqTest.mapAnswersToAcquisition({...base,acquisitionDate:date});assert.equal(r.acquisition_date,date);assert.equal('tax_year' in r,false);assert.equal(r.property_value,100000000);}
for(const date of ['2026-02-29','2026-02-30','20261001','2026-13-01'])assert.throws(()=>box.acqTest.mapAnswersToAcquisition({...base,acquisitionDate:date}));
assert.throws(()=>box.acqTest.mapAnswersToAcquisition({...base,acquisitionType:'증여',giftBaseChoice:'standard',acquisitionDate:'2026-06-30',giftChoiceDate:'2026-07-01'}));
const dq=box.acqTest.ACQ_QS.find(q=>q.id==='acquisitionDate');assert(dq.date&&dq.tier==='quick'&&!dq.optional);
const asrc=read('ReportAcquisition.jsx');assert(asrc.indexOf('if(cur.date)')<asrc.indexOf('if (cur.freeform) return true'));assert(asrc.includes('if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(knownDate)'));assert(asrc.includes('cur.freeform && !cur.date'));assert(asrc.includes('type="date" value={answers[cur.id]'));
console.log('Acquisition explicit date/year, leap-day rejection, conflicting date and required wizard entry checks PASS');

assert(read('ReportAcquisition.jsx').includes('신청서 접수일까지 신고·납부해야 합니다(지방세법 §20④)'));

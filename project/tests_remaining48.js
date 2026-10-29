const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),parser=require('@babel/parser');
const s=fs.readFileSync(path.join(__dirname,'src/ReportVat.jsx'),'utf8');const body=parser.parse(s,{sourceType:'script',plugins:['jsx']}).program.body;
const f=body.filter(n=>n.type==='FunctionDeclaration'&&['vatCreditInputs','vatExtraInputs'].includes(n.id.name)).map(n=>s.slice(n.start,n.end)).join('\n');
const b={Number,String,Date};vm.createContext(b);vm.runInContext(f,b);
const a={businessType:'일반과세자',creditScope:'yes',creditPeriodEnd:'2026-12-31',creditEvidence:'SYNTH:원장과1기신고',cardEligible:'yes',cardPriorSupply:'900000000',cardPriorUsed:'8000000',invoiceNewBusiness:'no',invoiceTimely:'yes',invoicePriorUsed:'900000',priorInvoiceRevenue:'200000000',eInvoiceCount:'2000'};
const out=b.vatCreditInputs(a,{credit_card_sales:400000000,e_invoice_count:2000});
assert.equal(out.credit_facts.card.prior_used,8000000);assert.equal(out.credit_facts.e_invoice.prior_used,900000);assert.equal(out.period_end,'2026-12-31');
for(const key of ['creditScope','creditEvidence','cardPriorUsed','invoicePriorUsed','invoiceTimely']){const v={...a};delete v[key];assert.throws(()=>b.vatCreditInputs(v,{credit_card_sales:400000000,e_invoice_count:2000}));}
assert.equal(b.vatCreditInputs({...a,cardPriorUsed:'0'},{credit_card_sales:400000000}).credit_facts.card.prior_used,0);
assert.equal(b.vatExtraInputs({...a,invoiceNewBusiness:'yes'}).prior_e_invoice_revenue,undefined);
assert(s.includes('cur.date && <input')&&s.includes('d.toISOString().slice(0,10)===v'));
const qs=body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='VAT_QS'));vm.runInContext(s.slice(qs.start,qs.end)+';globalThis.qs=VAT_QS;',b);
const q=b.qs.find(q=>q.id==='creditPeriodEnd');assert(q.date);assert(b.qs.findIndex(q=>q.id==='creditScope')>b.qs.findIndex(q=>q.id==='eInvoiceCount'));
assert(b.qs.findIndex(q=>q.id==='priorInvoiceRevenue')>b.qs.findIndex(q=>q.id==='invoiceNewBusiness'));
const c=fs.readFileSync(path.join(__dirname,'src/ReportComprehensive.jsx'),'utf8');assert(c.includes('합의한 신청자')&&c.includes('지분이 큰 사람을 자동 선택하지 않음'));
console.log('Remaining48 qualification sources, explicit zero usage, date input and agreed spouse applicant checks PASS');

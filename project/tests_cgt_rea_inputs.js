const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path'),esbuild=require('esbuild');
const src=fs.readFileSync(path.join(__dirname,'src/ReportCGT.jsx'),'utf8');
const env=vm.createContext({React:{useState(){},createElement(){}},Date,Number,String,Object,Math,JSON,window:{jtLaw:(_k,v)=>v}});
vm.runInContext(esbuild.transformSync(src,{loader:'jsx'}).code+'\nglobalThis.api={mapAnswersToTransfer,cgtApplyAnswer};',env);
const map=env.api.mapAnswersToTransfer;
const keys=['취득세','등기비','법무사비','취득중개비','양도중개비','자본적지출','기타비용'];
const a={assetType:'commercial',nonHouseType:'building',costMethod:'actual',acquiredDate:'2013-07-01',transferDate:'2026-01-01',sold:1000000000,acquired:600000000,expenses:0,
 reviewed:{expensesEnabled:true,expensesConfirmed:true,...Object.fromEntries(keys.map(k=>['expense_'+k,'1000000'])),depreciationEnabled:true,depreciationConfirmed:true,depreciation:'20000000'}};
const body=map(a);assert.equal(body.depreciation_recaptured,20000000);assert.equal(body.expenses_total,0);assert.equal(Object.values(body.expenses).reduce((x,y)=>x+y,0),7000000);
for(const key of keys)assert.throws(()=>map({...a,reviewed:{...a.reviewed,['expense_'+key]:''}}));
for(const patch of [{expenses:1},{costMethod:'converted'},{nonHouseType:'land'},{reviewed:{...a.reviewed,expensesConfirmed:false}},{reviewed:{...a.reviewed,depreciationConfirmed:false}},{reviewed:{...a.reviewed,depreciation:'1.5'}}])assert.throws(()=>map({...a,...patch}));
const off=map({...a,reviewed:{...a.reviewed,expensesEnabled:false,depreciationEnabled:false}});assert.equal(off.expenses,undefined);assert.equal(off.depreciation_recaptured,undefined);
const changed=env.api.cgtApplyAnswer(a,'sold',1100000000);assert.throws(()=>map(changed));
const s={assetType:'house_1',sold:2000000000,acquired:1000000000,acquiredDate:'2016-01-01',transferDate:'2026-01-01',expenses:0,reviewed:{sangsaengEnabled:true,sangsaengConfirmed:true,sangsaengResidence:'none'}};
assert.equal(map(s).is_sangsaeng_rental,true);assert.equal(map(s).sangsaeng_no_residence,true);
assert.throws(()=>map({...s,moveInDate:'2024-01-01'}));
assert.throws(()=>map({...s,transferDate:'2022-08-01'}));
assert.throws(()=>map({...s,reviewed:{...s.reviewed,sangsaengConfirmed:false}}));
assert.equal(map({...s,reviewed:{...s.reviewed,sangsaengEnabled:false}}).sangsaeng_no_residence,undefined);
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(body,null,2));
console.log('PASS REA expense item mapping, depreciation, double deduction, confirmation reset and stale values');
const ledger={...a,transferDate:'2026-10-20',reviewed:{costLedgerEnabled:true,ledgerMethod:'purchase',ledgerNumerator:'1',ledgerDenominator:'2',ledgerBaseBasis:'transferred',ledgerSaleBasis:'whole',ledgerSource:'synthetic review',ledgerOrdinaryConfirmed:true,ledgerQualifiedConfirmed:true,ledgerAdjustmentsConfirmed:true,ledgerRows:[{category:'conversion_improvement',amount:'10000000',basis:'whole',included:'no',deducted:'0',paid:'2020-01-01',source:'invoice'}]}};
const lb=map(ledger);assert.equal(lb.acquisition_price,0);assert.equal(lb.cost_facts.base_price,600000000);assert.equal(lb.cost_facts.rows[0].amount,10000000);
assert.equal(lb.housing_count,0);assert.equal(lb.is_regulated_area,false);assert.equal(lb.regulated_at_acquisition,false);
for(const key of ['ledgerMethod','ledgerNumerator','ledgerDenominator','ledgerBaseBasis','ledgerSaleBasis','ledgerSource','ledgerOrdinaryConfirmed','ledgerQualifiedConfirmed','ledgerAdjustmentsConfirmed'])assert.throws(()=>map({...ledger,reviewed:{...ledger.reviewed,[key]:undefined}}));
for(const key of ['category','amount','basis','included','deducted','paid','source'])assert.throws(()=>map({...ledger,reviewed:{...ledger.reviewed,ledgerRows:[{...ledger.reviewed.ledgerRows[0],[key]:''}]}}));
for(const key of ['expensesEnabled','depreciationEnabled','giftEnabled','reliefEnabled','lateEnabled','sangsaengEnabled'])assert.throws(()=>map({...ledger,reviewed:{...ledger.reviewed,[key]:true}}));
assert.throws(()=>map(env.api.cgtApplyAnswer(ledger,'sold',1200000000)));
assert.equal(map({...ledger,reviewed:{...ledger.reviewed,costLedgerEnabled:false}}).cost_facts,undefined);
console.log('PASS cost ledger mapper: basis, explicit facts, stale opt-out, conflict guards, confirmation reset');

for(const year of [2018,2019,2020,2021,2022,2023,2024,2025])assert.equal(map({...ledger,transferDate:year+'-10-20'}).cost_facts.share_denominator,2);
assert.throws(()=>map({...ledger,transferDate:'2018-03-31'}));
for(const [category,flag,key] of [['contract_price_interest','interestConfirmed','interest'],['donated_road_land_cost','roadConfirmed','road']]) {
 const input={...ledger,nonHouseType:'land',reviewed:{...ledger.reviewed,ledgerRows:[{...ledger.reviewed.ledgerRows[0],category}]}};
 assert.throws(()=>map(input));input.reviewed.ledgerRows[0][flag]=true;
 assert.ok(map(input).cost_facts.rows[0][key]);
 assert.throws(()=>map(env.api.cgtApplyAnswer(input,'acquired',700000000)));
}
console.log('PASS historical 2018-2025 ledger and explicit contractual-interest/donated-road facts');

const giftReviews=vm.runInContext('CGT_GIFT_REVIEWS',env);
const gift={...a,acquiredDate:'2023-01-01',transferDate:'2025-10-20',acquired:500000000,expenses:10000000,
 reviewed:{giftEnabled:true,giftDate:'2023-01-01',donorDate:'2000-10-20',donorCost:'100000000',giftTax:'70000000',giftConfirmed:true,
 giftAssessment:'SYN-A',giftV47:'1000000000',giftTarget:'SHOP',giftAssets:[{ref:'SHOP',amount:'500000000'},{ref:'CASH',amount:'500000000'}],
 giftPriorMode:'none',giftReviewSource:'synthetic reviewed facts',...Object.fromEntries(giftReviews.map(([k])=>['gift_'+k+'Confirmed',true]))}};
const gp=map(gift);assert.equal(gp.donor_gift_tax_paid,70000000);assert.equal(gp.carryover_gift_tax_context.current_assets.length,2);
assert.equal(gp.carryover_gift_tax_context.assessment.v47_taxable_value,1000000000);
for(const [k] of giftReviews)assert.throws(()=>map({...gift,reviewed:{...gift.reviewed,['gift_'+k+'Confirmed']:false}}));
for(const patch of [{giftPriorMode:''},{giftV47:'1'},{giftAssets:[{ref:'SHOP',amount:'1000000000'},{ref:'SHOP',amount:'0'}]},{giftTarget:'MISSING'},{giftAssessment:''}])assert.throws(()=>map({...gift,reviewed:{...gift.reviewed,...patch}}));
const priorGift={...gift,reviewed:{...gift.reviewed,giftAssets:[gift.reviewed.giftAssets[0]],giftPriorMode:'list',giftPrior:[{ref:'OLD',date:'2019-01-01',amount:'500000000'}]}};
assert.equal(map(priorGift).carryover_gift_tax_context.prior_aggregated_gifts.length,1);
assert.throws(()=>map(env.api.cgtApplyAnswer(gift,'sold',1100000000)));
assert.equal(map({...gift,reviewed:{...gift.reviewed,giftTax:'0'}}).carryover_gift_tax_context,undefined);
assert.equal(map({...gift,reviewed:{...gift.reviewed,giftEnabled:false}}).carryover_gift_tax_context,undefined);
console.log('PASS positive assessed gift tax: current/prior composition, all explicit reviews, stale opt-out and edit reset');

const separate={...gift,expenses:'10000000',reviewed:{...gift.reviewed,giftDifferentExpenses:true,giftCarryExpenses:'20000000',giftNoncarryExpenses:'10000000',giftCarrySource:'SYNTH:carry',giftNoncarrySource:'SYNTH:noncarry',giftBranchCompleteConfirmed:true,giftTaxExcludedConfirmed:true}};
assert.equal(map(separate).carryover_gift_tax_context.schema_version,2);
assert.equal(map(separate).expenses_total,10000000);
assert.equal(map(separate).carryover_gift_tax_context.branch_expenses.carryover_amount,20000000);
assert.throws(()=>map({...separate,expenses:'9000000'}),/경비 합계/);
const detailedSeparate={...separate,expenses:'0',reviewed:{...separate.reviewed,expensesEnabled:true,expensesConfirmed:true,...Object.fromEntries(['취득세','등기비','법무사비','취득중개비','양도중개비','자본적지출','기타비용'].map(k=>['expense_'+k,k==='취득세'?'10000000':'0']))}};
assert.equal(map(detailedSeparate).carryover_gift_tax_context.branch_expenses.noncarryover_amount,10000000);
for(const key of ['giftBranchCompleteConfirmed','giftTaxExcludedConfirmed'])assert.throws(()=>map({...separate,reviewed:{...separate.reviewed,[key]:false}}));
console.log('Support11 distinct expense branch: common10m/detail10m accepted; mismatch/missing qualification refused.');

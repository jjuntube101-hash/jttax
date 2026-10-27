const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..'),esbuild=require(root+'/node_modules/esbuild');
const env=vm.createContext({React:{},window:{},Date,Number,String,Object,JSON,BigInt});
vm.runInContext(esbuild.transformSync(fs.readFileSync(root+'/project/src/LandStandardValueDirect.jsx','utf8'),{loader:'jsx'}).code+'\nglobalThis.map=landValueRequest;globalThis.blank=landValueBlank;globalThis.resume=landValueResume;globalThis.validate=landValueResult;globalThis.confirmations=LAND_VALUE_CONFIRMATIONS;globalThis.sources=LAND_VALUE_SOURCES;',env);
const clone=v=>JSON.parse(JSON.stringify(v)),d=clone(env.blank());assert.throws(()=>env.map(d));assert.deepEqual(d.confirmations,{});
Object.assign(d,{land_ref:'SYNTH-LAND',acquisition_date:'1988-05-01',area_sqm:'100',official_price_1990_per_sqm_krw:'100000',tax_value_at_acquisition_krw:'100',tax_value_before_19900830_krw:'200',tax_value_at_19900830_krw:'300',tax_value_basis:'krw_per_sqm',prior_tax_value_decision_date:'1989-01-01',current_tax_value_decision_date:'1990-01-01'});
for(const k of Object.keys(env.confirmations))d.confirmations[k]=true;for(const k of Object.keys(env.sources))d.sources[k]='SYNTH-'+k;
const request=clone(env.map(d));assert.equal(request.schema_version,'land-standard-value/1');assert.equal(request.area_sqm,'100');assert.equal(request.tax_value_at_acquisition_krw,100);assert.equal(request.sources.prior_tax_value,'SYNTH-prior_tax_value');
let count=0;const bad=fn=>{const c=clone(d);fn(c);assert.throws(()=>env.map(c));count++;};
for(const k of Object.keys(env.confirmations))bad(c=>c.confirmations[k]=false);for(const k of Object.keys(env.sources))bad(c=>c.sources[k]=' ');
for(const day of ['1984-12-31','1990-08-30','1988-02-30'])bad(c=>c.acquisition_date=day);
for(const value of ['0','-1','0.00001','1e2','1000000001'])bad(c=>c.area_sqm=value);
bad(c=>c.tax_value_basis='mixed');bad(c=>c.prior_tax_value_decision_date=c.current_tax_value_decision_date);bad(c=>c.current_tax_value_decision_date='1990-08-31');bad(c=>c.tax_value_at_19900830_krw='0');bad(c=>c.tax_value_at_acquisition_krw='1.5');bad(c=>c.official_price_1990_per_sqm_krw='1000000000000001');
const restored=clone(env.resume(d));assert.deepEqual(restored.sources,d.sources);assert.deepEqual(restored.confirmations,{});assert.throws(()=>env.map(restored));
const fraction=(n,den='1')=>({numerator:n,denominator:den});const r={status:'ok',schema_version:'land-standard-value-result/1',land_ref:'SYNTH-LAND',law_verified_on:'2026-10-27',valuation_purpose:'historical_acquisition_standard_value_only',tax_value_basis:'krw_per_sqm',average_tax_value_exact:fraction('250'),ratio_exact:fraction('2','5'),unit_value_exact:fraction('40000'),whole_land_value_exact:fraction('4000000'),area_sqm_exact:fraction('100'),source_refs:request.sources,warnings:['SYNTH-only']};
assert.equal(env.validate(r,request),r);let responseGuards=0;for(const mutate of [x=>x.status='needs_input',x=>x.land_ref='other',x=>x.whole_land_value_exact.numerator='4000001',x=>x.ratio_exact.denominator='0',x=>x.unit_value_exact.numerator=40000,x=>x.average_tax_value_exact.numerator='251',x=>delete x.area_sqm_exact,x=>x.source_refs={},x=>x.schema_version='other',x=>x.law_verified_on='2025-01-01']){let c=clone(r);mutate(c);assert.throws(()=>env.validate(c,request));responseGuards++;}
const edited=clone(d);edited.tax_value_at_acquisition_krw='101';assert.throws(()=>env.validate(r,clone(env.map(edited))));
if(process.env.LAND_VALUE_FIXTURE_OUT)fs.writeFileSync(process.env.LAND_VALUE_FIXTURE_OUT,JSON.stringify({draft:d,request,result:r},null,2));
console.log(`land standard value: ${count} input guards, ${responseGuards} malformed response guards, stale/request mismatch and reset PASS`);

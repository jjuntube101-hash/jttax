const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const text = fs.readFileSync('project/src/ReportProperty.jsx', 'utf8');
const fn = text.match(/window\.jtLookupHousePrice = async function[\s\S]*?\n  };/)[0];
const priceInput = text.match(/window\.jtVWorldPriceInput = function[\s\S]*?\n};/)[0];
let checks = 0;
(async () => {
  for (const status of ['pending','upstream_error','not_configured','busy']) {
    let calls = 0;
    const ctx = {window:{jtLookupPublicPrice:async () => { calls++; return {status,note:'확인 중'}; }}};
    vm.runInNewContext(fn,ctx);
    await assert.rejects(ctx.window.jtLookupHousePrice('fixture'),e=>e.lookupStatus===status);
    assert.equal(calls,1); checks+=2;
  }
  const ctx = {window:{jtLookupPublicPrice:async () => { throw new Error('fixture network error'); }}};
  vm.runInNewContext(fn,ctx);
  await assert.rejects(ctx.window.jtLookupHousePrice('fixture'),/network error/); checks++;
  const empty = {window:{jtLookupPublicPrice:async () => ({manual_input_required:true, status:'no_data'})}};
  vm.runInNewContext(fn,empty);
  assert.equal((await empty.window.jtLookupHousePrice('fixture')).status,'none'); checks++;
  assert.ok(text.includes('https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js')); checks++;
  const gift = fs.readFileSync('project/src/ReportGift.jsx','utf8');
  assert.ok(gift.includes('official_year:') && gift.includes('dong: unit') && gift.includes('ho: unit')); checks++;
  assert.ok(!gift.includes('이 금액 사용')); checks++;
  const transfer = {window: {jtUnitSame: (a,b) => String(a) === String(b)}};
  vm.runInNewContext(priceInput, transfer);
  const parameters = {pnu:'1129013300110150000',stdrYear:'2026',dongNm:'104',hoNm:'1908'};
  const result = {status:'ok',total_count:1,items:[{...parameters,pblntfPc:'418000000'}]};
  assert.equal(transfer.window.jtVWorldPriceInput(31,parameters,result,'주택'),418000000); checks++;
  for (const [api,params,response,kind] of [
    [31,{...parameters,stdrYear:'2025'},result,'주택'], [31,{...parameters,hoNm:'1909'},result,'주택'],
    [25,parameters,result,'토지'], [31,parameters,{...result,total_count:2},'주택'],
    [31,parameters,{...result,status:'upstream_error'},'주택'],
  ]) { assert.equal(transfer.window.jtVWorldPriceInput(api,params,response,kind),null); checks++; }
  console.log(`property data ${checks} checks PASS`);
})().catch(e=>{console.error(e);process.exit(1);});

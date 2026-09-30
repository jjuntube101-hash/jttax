const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const text = fs.readFileSync('project/src/ReportProperty.jsx', 'utf8');
const fn = text.match(/window\.jtLookupHousePrice = async function[\s\S]*?\n  };/)[0];
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
  console.log(`property data ${checks} checks PASS`);
})().catch(e=>{console.error(e);process.exit(1);});

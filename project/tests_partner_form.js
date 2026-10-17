'use strict';
// Runs the production handler with fake transport; never sends a real inquiry.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const attach = require('../desk/partner-form.js');
function harness(options = {}) {
  const calls = [], events = [], navigations = [], timers = new Map();
  let id = 0, resets = 0, submit;
  const button = { disabled: false }, status = { textContent: '' };
  const values = { access_key: 'fake-key', office: 'PRIVATE_OFFICE', contact: 'PRIVATE_CONTACT', memo: 'PRIVATE_MEMO',
    개인정보동의: '동의함', 국외이전동의: '동의함', redirect: 'https://www.jttax.co.kr/desk/thanks.html', ...options.values };
  const form = {
    dataset: { partnerType: options.type || 'scrivener' }, attrs: {},
    querySelector: s => s === '[type="submit"]' ? button : status,
    addEventListener: (name, fn) => { assert.equal(name, 'submit'); submit = fn; },
    reportValidity: () => options.valid !== false,
    setAttribute(name, value) { this.attrs[name] = value; },
    reset: () => { resets++; }
  };
  const env = {
    FormData: class { [Symbol.iterator]() { return Object.entries(values)[Symbol.iterator](); } },
    AbortController,
    fetch: async (url, config) => { calls.push({ url, config }); return options.fetch ? options.fetch(config) : { ok: true, json: async () => ({ success: true }) }; },
    setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
    clearTimeout: n => timers.delete(n),
    gtag: options.gtag === null ? undefined : (...args) => { events.push(args); if (options.gtag) options.gtag(...args); },
    location: { assign: url => navigations.push(url) }
  };
  attach(form, env);
  return { form, env, calls, events, navigations, button, status, timers, resets: () => resets,
    submit: () => submit({ preventDefault() {} }),
    flush: ms => { for (const [n, t] of [...timers]) if (t.ms === ms) { timers.delete(n); t.fn(); } } };
}
for (const type of ['scrivener', 'broker']) {
  test(`${type}: only confirmed success emits one non-PII event, then redirects once`, async () => {
    const h = harness({ type });
    assert.equal(h.events.length, 0);
    await h.submit(); await h.submit();
    assert.equal(h.calls.length, 1); assert.equal(h.events.length, 1); assert.equal(h.resets(), 1);
    assert.equal(h.button.disabled, true);
    assert.equal(h.form.attrs['aria-busy'], 'false');
    const [kind, event, params] = h.events[0];
    assert.equal(kind, 'event'); assert.equal(event, 'partner_submit');
    assert.equal(params.location, `desk_${type}`); assert.equal(params.partner_type, type);
    assert.deepEqual(Object.keys(params).sort(), ['channel','event_callback','event_timeout','location','partner_type','send_to']);
    assert.doesNotMatch(JSON.stringify(h.events), /PRIVATE_|fake-key/);
    assert.equal(h.calls[0].url, 'https://api.web3forms.com/submit');
    assert.equal(h.calls[0].config.headers['Content-Type'], 'application/json');
    assert.equal(JSON.parse(h.calls[0].config.body).redirect, undefined);
    assert.equal(JSON.parse(h.calls[0].config.body).contact, 'PRIVATE_CONTACT');
    assert.equal(h.navigations.length, 0);
    params.event_callback(); h.flush(1200);
    assert.deepEqual(h.navigations, ['/desk/thanks.html']);
    assert.equal(h.timers.size, 0);
  });
}
for (const [label, fetch] of [
  ['HTTP 500 despite success true', async () => ({ ok: false, json: async () => ({ success: true }) })],
  ['success false', async () => ({ ok: true, json: async () => ({ success: false }) })],
  ['string success is not boolean', async () => ({ ok: true, json: async () => ({ success: 'true' }) })],
  ['missing success', async () => ({ ok: true, json: async () => ({}) })],
  ['invalid JSON', async () => ({ ok: true, json: async () => { throw Error('json'); } })],
  ['network failure', async () => { throw Error('network'); }]
]) test(`${label}: no conversion, no redirect, no auto retry, preserve inputs`, async () => {
  const h = harness({ fetch }); await h.submit();
  assert.equal(h.events.length, 0); assert.equal(h.navigations.length, 0);
  assert.equal(h.calls.length, 1); assert.equal(h.resets(), 0);
  assert.equal(h.button.disabled, false); assert.equal(h.timers.size, 0);
  assert.match(h.status.textContent, /확인하지 못/);
});
test('double submit while pending sends exactly once', async () => {
  let resolve; const h = harness({ fetch: () => new Promise(r => { resolve = r; }) });
  const pending = h.submit(); await h.submit(); assert.equal(h.calls.length, 1);
  resolve({ ok: true, json: async () => ({ success: true }) }); await pending;
  assert.equal(h.events.length, 1);
});
test('timeout aborts without success or automatic retransmission', async () => {
  const h = harness({ fetch: config => new Promise((resolve, reject) => config.signal.addEventListener('abort', () => reject(Error('abort')))) });
  const pending = h.submit(); h.flush(20000); await pending;
  assert.equal(h.events.length, 0); assert.equal(h.navigations.length, 0); assert.equal(h.calls.length, 1);
});
test('validation failure sends nothing', async () => {
  const h = harness({ valid: false }); await h.submit(); assert.equal(h.calls.length, 0); assert.equal(h.events.length, 0);
});
for (const field of ['access_key', '개인정보동의', '국외이전동의']) test(`missing ${field} sends nothing`, async () => {
  const h = harness({ values: { [field]: '' } }); await h.submit(); assert.equal(h.calls.length, 0); assert.equal(h.events.length, 0);
});
test('blocked analytics cannot turn a successful inquiry into an error', async () => {
  const h = harness({ gtag: () => { throw Error('blocked'); } }); await h.submit();
  assert.match(h.status.textContent, /접수되었습니다/); assert.equal(h.navigations.length, 1); assert.equal(h.button.disabled, true);
});
test('no analytics SDK still reaches thanks', async () => {
  const h = harness({ gtag: null }); await h.submit(); assert.equal(h.navigations.length, 1);
});
test('queued analytics cannot indefinitely block the success page', async () => {
  const h = harness(); await h.submit(); h.flush(1200); assert.equal(h.navigations.length, 1);
});
test('retry after explicit rejection records only the subsequent success', async () => {
  let attempt = 0; const h = harness({ fetch: async () => ({ ok: true, json: async () => ({ success: ++attempt > 1 }) }) });
  await h.submit(); await h.submit(); assert.equal(h.calls.length, 2); assert.equal(h.events.length, 1);
});
test('binding twice does not add another handler', async () => {
  const h = harness(); h.form.addEventListener = () => { throw Error('rebound'); }; attach(h.form, h.env); await h.submit(); assert.equal(h.calls.length, 1);
});
test('both live pages load the handler; thanks cannot count direct visits or reloads', () => {
  for (const type of ['scrivener','broker']) {
    const html = fs.readFileSync(path.join(__dirname, `../desk/${type}.html`), 'utf8');
    assert.equal((html.match(/partner-form\.js\?v=1/g) || []).length, 1);
    assert.match(html, new RegExp(`data-partner-type="${type}"`)); assert.match(html, /role="status"/);
    assert.match(html, /name="redirect" value="https:\/\/www.jttax.co.kr\/desk\/thanks.html"/);
    for (const name of ['개인정보동의','국외이전동의']) assert.match(html, new RegExp(`name="${name}"[^>]*required`));
    assert.doesNotMatch(html, /onclick="[^"\n]*partner_submit/);
  }
  const thanks = fs.readFileSync(path.join(__dirname, '../desk/thanks.html'), 'utf8');
  assert.doesNotMatch(thanks, /partner_submit|partner-form\.js|wcs\.trans/);
});

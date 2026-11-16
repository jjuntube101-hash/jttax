'use strict';
// 공시가격·기준시가 검토 요청 양식(property-values/price-form.js) 실행 시험 — tests_partner_form.js 와 같은 계약.
// Runs the production handler with fake transport; never sends a real inquiry.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { attach, applyDeadline, deadlineState, daysLeft, DEADLINE_END_UTC } = require('../property-values/price-form.js');

function harness(options = {}) {
  const calls = [], events = [], navigations = [], timers = new Map();
  let id = 0, resets = 0, submit;
  const button = { disabled: false }, status = { textContent: '' };
  const values = { access_key: 'fake-key', contact: 'PRIVATE_CONTACT', kind: '오피스텔', area: 'PRIVATE_AREA', plan: '상속·증여를 검토 중',
    memo: 'PRIVATE_MEMO', 개인정보동의: '동의함', 국외이전동의: '동의함',
    redirect: 'https://www.jttax.co.kr/property-values/thanks.html', ...options.values };
  const form = {
    dataset: { priceForm: options.formType || 'price' }, attrs: {},
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
    submit: () => submit ? submit({ preventDefault() {} }) : undefined,
    flush: ms => { for (const [n, t] of [...timers]) if (t.ms === ms) { timers.delete(n); t.fn(); } } };
}

test('only confirmed success emits one non-PII event, then redirects once', async () => {
  const h = harness();
  await h.submit(); await h.submit();
  assert.equal(h.calls.length, 1); assert.equal(h.events.length, 1); assert.equal(h.resets(), 1);
  assert.equal(h.button.disabled, true);
  assert.equal(h.form.attrs['aria-busy'], 'false');
  const [kind, event, params] = h.events[0];
  assert.equal(kind, 'event'); assert.equal(event, 'property_values_submit');
  assert.equal(params.location, 'property_values');
  assert.deepEqual(Object.keys(params).sort(), ['channel', 'event_callback', 'event_timeout', 'location', 'send_to']);
  assert.doesNotMatch(JSON.stringify(h.events), /PRIVATE_|fake-key/);
  assert.equal(h.calls[0].url, 'https://api.web3forms.com/submit');
  const body = JSON.parse(h.calls[0].config.body);
  assert.equal(body.redirect, undefined);
  assert.equal(body.area, 'PRIVATE_AREA'); assert.equal(body.kind, '오피스텔');
  assert.equal(h.navigations.length, 0);
  params.event_callback(); h.flush(1200);
  assert.deepEqual(h.navigations, ['/property-values/thanks.html']);
  assert.equal(h.timers.size, 0);
});

for (const [label, fetch] of [
  ['HTTP 500 despite success true', async () => ({ ok: false, json: async () => ({ success: true }) })],
  ['success false', async () => ({ ok: true, json: async () => ({ success: false }) })],
  ['string success is not boolean', async () => ({ ok: true, json: async () => ({ success: 'true' }) })],
  ['invalid JSON', async () => ({ ok: true, json: async () => { throw Error('json'); } })],
  ['network failure', async () => { throw Error('network'); }]
]) test(`${label}: no conversion, no redirect, no auto retry, preserve inputs`, async () => {
  const h = harness({ fetch }); await h.submit();
  assert.equal(h.events.length, 0); assert.equal(h.navigations.length, 0);
  assert.equal(h.calls.length, 1); assert.equal(h.resets(), 0);
  assert.equal(h.button.disabled, false); assert.equal(h.timers.size, 0);
  assert.match(h.status.textContent, /확인하지 못/);
});

test('timeout aborts without success or automatic retransmission', async () => {
  const h = harness({ fetch: config => new Promise((resolve, reject) => config.signal.addEventListener('abort', () => reject(Error('abort')))) });
  const pending = h.submit(); h.flush(20000); await pending;
  assert.equal(h.events.length, 0); assert.equal(h.navigations.length, 0); assert.equal(h.calls.length, 1);
});

test('validation failure sends nothing', async () => {
  const h = harness({ valid: false }); await h.submit(); assert.equal(h.calls.length, 0);
});

for (const field of ['access_key', 'contact', 'kind', 'area', 'plan', '개인정보동의', '국외이전동의']) test(`missing ${field} sends nothing`, async () => {
  const h = harness({ values: { [field]: '' } }); await h.submit(); assert.equal(h.calls.length, 0); assert.equal(h.events.length, 0);
});

test('memo is optional', async () => {
  const h = harness({ values: { memo: '' } }); await h.submit(); assert.equal(h.calls.length, 1);
});

test('a form without data-price-form="price" is not bound', async () => {
  const h = harness({ formType: 'other' }); await h.submit(); assert.equal(h.calls.length, 0);
});

test('blocked analytics cannot turn a successful request into an error', async () => {
  const h = harness({ gtag: () => { throw Error('blocked'); } }); await h.submit();
  assert.match(h.status.textContent, /접수되었습니다/); assert.equal(h.navigations.length, 1);
});

test('no analytics SDK still reaches thanks', async () => {
  const h = harness({ gtag: null }); await h.submit(); assert.equal(h.navigations.length, 1);
});

test('deadline: 12월 2일 23:59 KST 까지 open, 12월 3일 00:00 KST 부터 closed', () => {
  assert.equal(DEADLINE_END_UTC, Date.parse('2026-12-03T00:00:00+09:00'));
  assert.equal(deadlineState(Date.parse('2026-12-02T23:59:59+09:00')), 'open');
  assert.equal(deadlineState(Date.parse('2026-12-03T00:00:00+09:00')), 'closed');
  const el = (text) => ({ textContent: text, dataset: {} });
  const badge = el('마감 전'), lede = el('리드');
  const openOnly = [{ hidden: false }, { hidden: false }], closedOnly = [{ hidden: true }];
  const doc = { getElementById: id => ({ 'pr-deadline': badge, 'pr-lede': lede })[id] || null,
    querySelectorAll: sel => ({ '[data-open-only]': openOnly, '[data-closed-only]': closedOnly })[sel] || [] };
  assert.equal(applyDeadline(doc, Date.parse('2026-11-16T12:00:00+09:00')), 'open');
  assert.match(badge.textContent, /12월 2일\(수\) 마감 · D-16$/);
  assert.equal(lede.textContent, '리드');
  assert.equal(applyDeadline(doc, Date.parse('2026-12-02T23:59:59+09:00')), 'open');
  assert.match(badge.textContent, /오늘 마감$/);
  assert.ok(openOnly.every(e => !e.hidden) && closedOnly.every(e => e.hidden), 'open: 마감 전 문장 그대로');
  assert.equal(applyDeadline(doc, Date.parse('2026-12-03T09:00:00+09:00')), 'closed');
  assert.ok(openOnly.every(e => e.hidden), 'closed: 마감 전 약속 문장을 숨김');
  assert.ok(closedOnly.every(e => !e.hidden), 'closed: 재산정 안내를 보임');
  assert.equal(badge.dataset.state, 'closed');
  assert.match(badge.textContent, /끝났습니다/);
  assert.match(lede.textContent, /30일 안에/);
});

test('D-day counts KST calendar days, not 24-hour blocks', () => {
  assert.equal(daysLeft(Date.parse('2026-11-30T23:59:59+09:00')), 2);
  assert.equal(daysLeft(Date.parse('2026-12-01T00:00:00+09:00')), 1);
  assert.equal(daysLeft(Date.parse('2026-12-01T08:59:59+09:00')), 1); // UTC 로는 11월 30일
  assert.equal(daysLeft(Date.parse('2026-12-02T00:00:00+09:00')), 0);
});

test('a tab opened before the deadline switches at midnight KST and on refocus', () => {
  const vm = require('node:vm');
  const src = fs.readFileSync(path.join(__dirname, '../property-values/price-form.js'), 'utf8');
  let now = Date.parse('2026-12-02T23:59:59+09:00'); const timers = []; const listeners = {};
  const badge = { textContent: '', dataset: {} }, lede = { textContent: '' }, openOnly = [{ hidden: false }], closedOnly = [{ hidden: true }];
  const document = { hidden: false, getElementById: id => ({ 'pr-deadline': badge, 'pr-lede': lede })[id] || null,
    querySelectorAll: sel => ({ '[data-open-only]': openOnly, '[data-closed-only]': closedOnly, 'form[data-price-form]': [] })[sel] || [],
    addEventListener: (n, fn) => { listeners[n] = fn; } };
  const FakeDate = { now: () => now, UTC: Date.UTC };
  const window = { document, setTimeout: (fn, ms) => timers.push({ fn, ms }) };
  vm.runInNewContext(src, { window, Date: FakeDate, setTimeout: window.setTimeout, Math, Array, Object });
  assert.equal(badge.dataset.state, undefined); assert.equal(openOnly[0].hidden, false);
  assert.equal(timers.length, 1); assert.ok(timers[0].ms >= 1000 && timers[0].ms <= 3000);
  now += timers[0].ms; timers[0].fn();
  assert.equal(badge.dataset.state, 'closed'); assert.equal(openOnly[0].hidden, true); assert.equal(closedOnly[0].hidden, false);
  // 예약이 막혀도(백그라운드 탭) 다시 보일 때 판정한다
  badge.dataset = {}; openOnly[0].hidden = false; listeners.visibilitychange();
  assert.equal(badge.dataset.state, 'closed'); assert.equal(openOnly[0].hidden, true);
});

test('live page loads the handler once; thanks page cannot count direct visits', () => {
  const html = fs.readFileSync(path.join(__dirname, '../property-values/nts-2027.html'), 'utf8');
  assert.equal((html.match(/price-form\.js\?v=1/g) || []).length, 1);
  assert.match(html, /data-price-form="price"/); assert.match(html, /role="status"/);
  assert.match(html, /id="pr-deadline"/); assert.match(html, /id="pr-lede"/);
  // 마감 뒤 사실과 달라지는 정적 문장은 data-open-only 로 묶여 있어야 한다 (Codex TASK-261116-010 R1-F1)
  for (const phrase of ['마감 전에 제출', '직접 제출</strong>', '직접 제출하는 방법']) {
    const i = html.indexOf(phrase); assert.ok(i > 0, phrase);
    const open = html.lastIndexOf('<', html.lastIndexOf('data-open-only', i)); const tagStart = html.lastIndexOf('<li', i) > html.lastIndexOf('<span', i) ? html.lastIndexOf('<li', i) : html.lastIndexOf('<span', i);
    assert.ok(open >= 0 && html.slice(tagStart, html.indexOf('>', tagStart)).includes('data-open-only'), phrase + ': data-open-only 안에 있음');
  }
  assert.match(html, /<li data-closed-only hidden>/);
  assert.match(html, /name="redirect" value="https:\/\/www.jttax.co.kr\/property-values\/thanks.html"/);
  for (const name of ['개인정보동의', '국외이전동의']) assert.match(html, new RegExp(`name="${name}"[^>]*required`));
  const thanks = fs.readFileSync(path.join(__dirname, '../property-values/thanks.html'), 'utf8');
  assert.doesNotMatch(thanks, /property_values_submit|price-form\.js/);
  assert.match(thanks, /noindex/);
});

test('price guide article sends readers to the review form at the top', () => {
  const html = fs.readFileSync(path.join(__dirname, '../insights/officetel-commercial-standard-price-2027.html'), 'utf8');
  const block = html.match(/<aside aria-label="기준시가 검토 요청"[\s\S]*?<\/aside>/);
  assert.ok(block, '검토 요청 상자');
  assert.match(block[0], /href="\/property-values\/nts-2027\.html#ask"[^>]*onclick="jtTrackCta\('property_values','insight_price'\)"/);
  assert.ok(html.indexOf(block[0]) < html.indexOf('id="section-1"'), '본문 앞에 있음');
  const page = fs.readFileSync(path.join(__dirname, '../property-values/nts-2027.html'), 'utf8');
  assert.match(page, /id="ask"/);
});

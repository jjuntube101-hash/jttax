'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const React = require('react');

const dist = name => fs.readFileSync(path.join(__dirname, 'dist', name), 'utf8');
const early = dist('report-entry.js');
const other = dist('report-other.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
const data = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, 'src/Data.jsx'), 'utf8'), data);
const context = vm.createContext({
  React, ReactDOM: {createRoot: () => ({render() {}})},
  document: {getElementById: () => ({}), addEventListener() {}},
  location: {hash: '#/report/income', search: ''},
  console, addEventListener() {},
});
context.window = context;
vm.runInContext(early, context);
const hash = code => createHash('sha256').update(code).digest('hex');
assert.equal(context.JT_FRONTEND_BUILD.payload_sha256, hash(early.slice(early.indexOf('\n') + 1)));
assert(context.JT_OTHER_BUNDLE.endsWith(hash(other).slice(0, 20)));
for (const key of ['firm', 'integrations', 'seo', 'services']) {
  assert.equal(JSON.stringify(context.JT_DATA[key]), JSON.stringify(data.window.JT_DATA[key]));
}
assert.equal(context.formatWon(9031000), '9,031,000원');
assert.equal(context.acqKoreanAmount(60000000), '6,000만원');
assert.equal(typeof context.JTReportIncome, 'function');
assert.equal(typeof context.JTCaseWorkspace, 'undefined');
assert(Buffer.byteLength(early) < 250 * 1024);
assert(fs.statSync(path.join(__dirname, 'assets/fonts/PretendardVariable-report.woff2')).size <= 160 * 1024);
const version = html.match(/data-report-src="project\/dist\/report-entry.js\?v=(\d+)"/)[1];
assert(html.includes('data-src="project/dist/app.js?v=' + version + '"'));
vm.runInContext(other, context);
assert.throws(() => vm.runInNewContext(other, {window: {JT_FRONTEND_BUILD: {payload_sha256: 'previous'}}}),
  /화면이 업데이트되었습니다/);
assert.equal(context.JT_OTHER_READY, true);
assert.equal(typeof context.JTCaseWorkspace, 'function');
assert.equal(JSON.stringify(context.JT_DATA), JSON.stringify(data.window.JT_DATA));

// Both public domains must load the real SDK. Opt-outs and staff previews skip it.
const bootstrap = scripts.find(([, , source]) => source.includes("getElementById('jt-ga-loader')"))[2];
const domainGate = scripts.find(([, , source]) => source.includes("window['ga-disable-G-ETRXTFKLFE'] = true"))[2];
const url = scripts.find(([, attributes]) => attributes.includes('id="jt-ga-loader"'))[1].match(/data-src="([^"]+)"/)[1];
for (const [hostname, optedOut, loads] of [['www.jttax.co.kr', false, 1], ['jttax.co.kr', false, 1],
  ['www.jttax.co.kr', true, 0], ['127.0.0.1', false, 0]]) {
  const sent = [];
  const window = {location: {hostname}, 'ga-disable-G-ETRXTFKLFE': optedOut};
  const document = {createElement: () => ({}), getElementById: () => ({getAttribute: () => url}),
    head: {appendChild: el => sent.push(el.src)}};
  vm.runInNewContext(domainGate + '\n' + bootstrap, {window, document});
  assert.equal(sent.length, loads);
  if (loads) assert.equal(sent[0], 'https://www.googletagmanager.com/gtag/js?id=G-ETRXTFKLFE');
}
console.log('PASS report entry, shared data and currency, deferred routes, font budget, analytics dispatch');

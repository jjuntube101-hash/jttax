'use strict';
/* Monetary input interaction regression: store won without comma, show grouped won,
   preserve middle edits, selection replacement and clipboard precision. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, 'src', 'Report.jsx'), 'utf8');
const start = source.indexOf('window.jtMoneyDigits = function');
const marker = 'window.JTNumericInput = JTNumericInput;';
const end = source.indexOf(marker);
if (start < 0 || end < 0) throw new Error('Money input helper/component not found');
let currentError = '', changes = [], checks = 0, hookStates = [], hookIndex = 0, renderProps;
const sandbox = { window: {}, Number, String, document: {},
  requestAnimationFrame: (fn) => fn(),
  useReportState: initial => {
    const index = hookIndex++;
    if (!(index in hookStates)) hookStates[index] = initial;
    return [hookStates[index], value => { hookStates[index] = value; if (index === 0) currentError = value; }];
  },
  React: { Fragment: 'fragment', createElement: (type, props, ...children) => ({type, props, children}) } };
vm.createContext(sandbox); vm.runInContext(source.slice(start, end + marker.length), sandbox);
const W = sandbox.window;
function eq(label, actual, expected) {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
function render(value, extra = {}) {
  currentError = ''; changes = []; hookStates = [];
  renderProps = { value, onChange: e => { changes.push(e.target.value); renderProps.value = e.target.value; }, ...extra };
  return rerender();
}
function rerender() {
  hookIndex = 0;
  return W.JTNumericInput(renderProps).children[0].props;
}
function element(value, start = value.length, end = start) {
  const el = { value, selectionStart: start, selectionEnd: end,
    setSelectionRange: (a,b) => { el.selectionStart = a; el.selectionEnd = b; } };
  sandbox.document.activeElement = el; return el;
}
let props = render('123456789');
eq('won visible grouped', props.value, '123,456,789');
eq('money text input supports commas', props.type, 'text');
eq('money numeric keyboard', props.inputMode, 'numeric');
eq('zero preserved', render(0).value, '0');
eq('blank preserved', render('').value, '');
eq('safe integer precision', W.jtMoneyDigits('9,007,199,254,740,991'), '9007199254740991');
eq('unsafe integer refused', W.jtMoneyDigits('9,007,199,254,740,992'), null);
props = render('1234'); let el = element('1,9234', 3);
props.onChange({target: el, nativeEvent: {inputType: 'insertText'}});
eq('middle insert stores correct won', changes, ['19234']);
eq('middle insert formats', el.value, '19,234');
eq('middle insert caret stays near digit', el.selectionStart, 2);
props = render('1234'); el = element('1234', 1);
props.onChange({target: el, nativeEvent: {inputType: 'deleteContentBackward'}});
eq('backspace on comma removes preceding digit', changes, ['234']);
eq('backspace caret', el.selectionStart, 0);
props = render('1234'); el = element('1234', 1);
props.onChange({target: el, nativeEvent: {inputType: 'deleteContentForward'}});
eq('delete on comma removes following digit', changes, ['134']);
eq('delete caret', el.selectionStart, 1);
props = render('1234567'); el = element('1,234,567', 2, 5);
let prevented = false;
props.onPaste({target: el, preventDefault: () => { prevented = true; }, clipboardData: {getData: () => '８，７６５.９９원'}});
eq('paste intercepted', prevented, true);
eq('paste selected digits replacement', changes, ['18765567']);
eq('paste grouped without decimal multiplication', el.value, '18,765,567');
eq('paste caret after replacement', el.selectionStart, 6);
for (const bad of ['1,2', '18e8', '-100', '12\n34', '1원2', '9007199254740992']) {
  props = render('1234'); el = element('1,234', 0, 5);
  props.onPaste({target: el, preventDefault: () => {}, clipboardData: {getData: () => bad}});
  eq('bad paste rejected: ' + JSON.stringify(bad), changes, []);
  eq('bad paste leaves amount: ' + JSON.stringify(bad), el.value, '1,234');
  eq('bad paste announced: ' + JSON.stringify(bad), Boolean(currentError), true);
}
props = render('1234'); el = element('1,2', 3);
props.onChange({target: el, nativeEvent: {inputType: 'insertFromPaste'}});
eq('paste fallback also strict', changes, []);
props = render('1234'); el = element('1,2', 3);
props.onChange({target: el, nativeEvent: {inputType: 'insertText', data: '1,2'}});
eq('bulk insertText also strict', changes, []);
eq('bulk insertText announced', Boolean(currentError), true);
props = render('1234'); el = element(''); props.onChange({target: el});
eq('clear stores blank', changes, ['']);
eq('clear remains blank', el.value, '');
props = render('1234'); el = element('0'); props.onChange({target: el});
eq('zero stores zero', changes, ['0']);
// Replace-all paste (currency suffix is clipboard content, not existing field content).
props = render('1234'); el = element('1,234', 0, 5);
props.onPaste({target: el, preventDefault: () => {}, clipboardData: {getData: () => ' ₩50,000,000.00원 '}});
eq('Excel amount keeps won unit', changes, ['50000000']);
eq('Excel amount shows comma', el.value, '50,000,000');
props = render('1.5', {money: false}); el = element('1.75'); props.onChange({target: el});
eq('area/years/percent decimals unchanged', changes, ['1.75']);
eq('decimal keyboard', props.inputMode, 'decimal');
props = render('', {parseMoney: raw => raw === '5억' ? 500000000 : null}); el = element('5억'); props.onChange({target: el});
eq('hero Korean shorthand converted to won', changes, ['500000000']);
eq('hero shorthand shown in won', el.value, '500,000,000');
props = render('1234', {parseMoney: raw => Number(raw.replace(/,/g, ''))}); el = element('1,2');
props.onChange({target: el, nativeEvent: {inputType: 'insertText', data: '1,2'}});
eq('hero shorthand parser cannot bypass invalid grouping', changes, []);
eq('hero grouping error announced', Boolean(currentError), true);
props = render('1234', {parseMoney: () => 1200000000}); el = element('1,234', 0, 5);
props.onPaste({target: el, preventDefault: () => {}, clipboardData: {getData: () => '1,2억'}});
eq('malformed grouping in Korean shorthand rejected', changes, []);
// Each event is one real keystroke, with React-style state and rerender between keys.
props = render(''); el = element('');
for (const key of '1234.56') {
  const before = props.value;
  el.value = before + key; el.selectionStart = el.value.length; el.selectionEnd = el.value.length;
  props.onChange({target: el, nativeEvent: {inputType: 'insertText', data: key}});
  props = rerender(); el.value = props.value;
}
eq('single key decimal typing preserves visible fraction', el.value, '1,234.56');
eq('single key decimal typing never inflates stored won', changes, ['1', '12', '123', '1234', '1234', '1234', '1234']);
props.onBlur({target: el}); props = rerender();
eq('blur truncates decimal to correct won', changes[changes.length - 1], '1234');
eq('blur displays grouped integer won', props.value, '1,234');
props = render('1234'); el = element('1,234.56');
props.onChange({target: el, nativeEvent: {inputType: 'insertText', data: '6'}}); props = rerender();
el.value = '2,234.56'; el.selectionStart = 1; el.selectionEnd = 1;
props.onChange({target: el, nativeEvent: {inputType: 'insertText', data: '2'}}); props = rerender();
eq('decimal draft middle integer edit stays visible', props.value, '2,234.56');
eq('Enter or submit before blur already stores current integer', renderProps.value, '2234');
eq('decimal draft middle integer edit keeps caret', el.selectionStart, 1);
let enterCalled = false;
props = render('1234', {onKeyDown: () => { enterCalled = true; }}); el = element('1,234.56');
props.onChange({target: el, nativeEvent: {inputType: 'insertText', data: '6'}}); props = rerender();
props.onKeyDown({target: el, key: 'Enter'});
renderProps.value = '5000'; props = rerender();
eq('Enter clears fraction draft before next question rerender', props.value, '5,000');
eq('Enter preserves caller key handler', enterCalled, true);
props = render(''); el = element('');
for (const key of '.56') {
  el.value = props.value + key; el.selectionStart = el.value.length;
  props.onChange({target: el, nativeEvent: {inputType: 'insertText', data: key}});
  props = rerender();
}
eq('leading point does not disappear during editing', props.value, '0.56');
props.onBlur({target: el}); props = rerender();
eq('leading point fraction truncates to zero won', props.value, '0');
props = render('', {money: false}); el = element('');
for (const key of '1.75') {
  el.value = props.value + key; el.selectionStart = el.value.length;
  props.onChange({target: el, nativeEvent: {inputType: 'insertText', data: key}});
  props = rerender();
}
props.onBlur({target: el}); props = rerender();
eq('nonmoney single key decimals survive blur', props.value, '1.75');
const reports = ['ReportAcqCheck','ReportAcqHolding','ReportAcquisition','ReportBurdenedOptimize','ReportCGT',
 'ReportCompare','ReportComprehensive','ReportCorporate','ReportCrypto2027','ReportGift','ReportIncome',
 'ReportInheritance','ReportInsurance','ReportProperty','ReportReform2026','ReportVat','ReportYouthStartup','HeroCalc'];
for (const name of reports) {
  const text = fs.readFileSync(path.join(__dirname, 'src', name + '.jsx'), 'utf8');
  eq(name + ' money input wired', /<JTNumericInput\b/.test(text), true);
  eq(name + ' no browser number input for money', /<input\b[^>]*type="number"/.test(text), false);
}
eq('holding other money does not strip clipboard decimal', /setOtherValue\(e\.target\.value\.replace/.test(fs.readFileSync(path.join(__dirname, 'src', 'ReportAcqHolding.jsx'), 'utf8')), false);
console.log(`PASS money won input: ${checks} assertions (format, store, edit, caret, paste, refusal, decimal fields, 18 calculators)`);

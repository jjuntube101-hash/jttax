/* Execute the real saved-result JSX against current and historical contracts. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');
const source = fs.readFileSync(path.join(__dirname, 'src/HoldingCases.jsx'), 'utf8');
const code = esbuild.transformSync(source, { loader: 'jsx', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' }).code;
const common = {'세목':'재산세','세액':120000,'과세표준':450000000,'단계별계산':[]};
function render(calc) {
  let stateIndex=0;
  const ctx=vm.createContext({window:{},React: {
    Fragment:'fragment',
    createElement:(tag,props,...children)=>({tag,props,children}),
    useState:value=>[stateIndex++===1?true:value,()=>{}],
    useRef:current=>({current}), useEffect:()=>{}
  }});
  vm.runInContext(code,ctx);
  const saved={uid:'synthetic',label:'saved',draft:{tax_year:2026,category:'building',tax_kind:'property'},
    meta:{client_id:'client',case_id:'case',revision:1,current_revision:1,validation:{errors:[],can_run:true}},
    run:{run_id:'run',revision_id:'revision',engine_request:{standard_value:1000000000},response_snapshot:{result_scope:'stored',calc:{...common,...calc}}}};
  ctx.seed=saved;
  vm.runInContext('jtHoldingSession=seed',ctx);
  const tree=vm.runInContext("JTHoldingCases({clientId:'client',caseId:'resume',onExit:()=>{}})",ctx);
  const text=node=>node==null||typeof node==='boolean'?'':typeof node!=='object'?String(node):Array.isArray(node)?node.map(text).join(''):text(node.children);
  return text(tree);
}
let text=render({'과세표준상한':{'상한전과세표준':600000000},'세부담상한적용':true,
  '세부담상한':{'본세적용':false,'도시지역분적용':true,'근거':'저장된 상한 근거'}});
assert.ok(text.includes('상한전 과세표준 600,000,000원 · 적용 과세표준 450,000,000원'));
assert.ok(text.includes('본세 상한 미적용 · 도시지역분 상한 적용'));
assert.ok(text.includes('상한 검토 근거: 저장된 상한 근거'));
assert.ok(!text.includes('주택 경과조치 비해당'));
text=render({'상한전과세표준':550000000,'세부담상한적용':true,'도시지역분상한적용':false,'주택경과조치적용':true});
assert.ok(text.includes('상한전 과세표준 550,000,000원'));
assert.ok(text.includes('본세 상한 적용 · 도시지역분 상한 미적용'));
assert.ok(text.includes('과거 저장본의 주택 경과조치: 해당'));
text=render({});
assert.ok(text.includes('상한전 과세표준 저장본에 없음'));
assert.ok(text.includes('본세 상한 저장본에 없음 · 도시지역분 상한 저장본에 없음'));
text=render({'과세표준상한':{'상한전과세표준':0},'상한전과세표준':123,
  '세부담상한':{'본세적용':false,'도시지역분적용':false},'세부담상한적용':true,'도시지역분상한적용':true});
assert.ok(text.includes('상한전 과세표준 0원'));
assert.ok(text.includes('본세 상한 미적용 · 도시지역분 상한 미적용'));
console.log('PASS holding saved-result JSX: production split caps, legacy history, missing fields, zero/false precedence (11 checks)');

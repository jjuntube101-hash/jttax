/* Anonymous two-acquisition land calculation; no saved customer/case records. */
const splitReviewLabels = {
  ordinary_purchase_sale:'통상적인 매수 후 매도입니다', domestic_registered_actual:'국내 등기 자산이며 실지거래가액입니다',
  business_land_after_use_tax_review:'사용 이력을 검토하여 사업용 토지로 확인했습니다', tax_adjusted_costs_and_eligible_expenses:'취득원가 조정과 필요경비 적격 검토를 마쳤습니다',
  no_depreciation_or_other_cost_adjustments:'감가상각 등 추가 원가 조정이 없습니다', no_special_exemption_relief_deferral:'비과세·감면·과세이연 특례가 없습니다',
  no_prior_disposals:'같은 해 다른 양도가 없습니다', known_lot_attribution:'각 취득분의 금액 귀속이 증빙으로 확인됩니다',
  resident:'거주자 개인입니다', annual:'해당 연도의 과세 대상 양도가 모두 포함되어 있습니다', local:'지방소득세 표준세율 적용을 확인했습니다'
};
function splitDirectBlank(){return {source:'',property:'',sold:'',whole:'',review:{},sources:{},lots:[0,1].map(()=>({date:'',numerator:'',denominator:'',sale:'',cost:'',expense:'',source:''}))};}
function splitDirectResume(d){return d?{...JSON.parse(JSON.stringify(d)),review:{}}:splitDirectBlank();}
function splitDirectResult(calc){
  const raw=calc?.['원본결과'],money=v=>Number.isSafeInteger(v)&&v>=0;
  if(calc?.['상태']!=='ok'||calc['공개계약']!=='transfer-split-public/1'||raw?.schema_version!=='transfer-split-result/1'||!Array.isArray(raw.rows)||raw.rows.length!==2)throw Error('계산 응답을 확인하지 못했습니다. 다시 계산하세요.');
  const top=['세액','지방소득세','농어촌특별세','총세부담'],totals=['transfer_income','basic_deduction','tax_base','calculated_tax','final_tax','local_income_tax','total_tax'];
  if(!top.every(k=>money(calc[k]))||!totals.every(k=>money(raw[k]))||!raw.rows.every((r,i)=>r.lot_id==='L'+(i+1)&&['transfer_gain','long_term_deduction','transfer_income'].every(k=>money(r[k]))&&r.transfer_gain>0&&r.transfer_gain-r.long_term_deduction===r.transfer_income)||raw.rows.reduce((s,r)=>s+BigInt(r.transfer_income),0n)!==BigInt(raw.transfer_income)||raw.tax_base!==Math.max(raw.transfer_income-raw.basic_deduction,0)||raw.final_tax!==calc['세액']||raw.local_income_tax!==calc['지방소득세']||raw.total_tax!==calc['총세부담']||calc['농어촌특별세']!==0||BigInt(calc['세액'])+BigInt(calc['지방소득세'])!==BigInt(calc['총세부담']))throw Error('계산 응답의 금액을 확인하지 못했습니다. 다시 계산하세요.');
  return calc;
}
function splitDirectRequest(d){
  const need=(v,label)=>{if(typeof v!=='string'||!v.trim())throw Error(label+'을 입력하세요.');return v.trim();};
  const amount=(v,label,positive=false)=>{if(!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v))||Number(v)>1000000000000000||(positive&&Number(v)<=0))throw Error(label+'은 1,000조 이하의 '+(positive?'양의':'0 이상의')+' 정수여야 합니다.');return Number(v);};
  const day=(v,label)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error(label+'을 확인하세요.');return v;};
  const source=need(d.source,'공통 증빙 참조'),property=need(d.property,'물건 식별명'),sold=day(d.sold,'양도일'),whole=amount(d.whole,'전체 양도가액',true);
  if(sold<'2026-10-01'||sold>'2026-10-23')throw Error('현재 지원 양도일은 2026-10-01부터 2026-10-23까지입니다.');
  for(const k of Object.keys(splitReviewLabels)){if(d.review[k]!==true)throw Error('모든 검토 항목을 확인해야 합니다.');need(d.sources[k],splitReviewLabels[k]+'의 근거');}
  if(!Array.isArray(d.lots)||d.lots.length!==2)throw Error('두 취득분이 필요합니다.');
  const common={schema_version:1,source_id:source,parties:[{party_ref:'T',source_id:d.sources.resident,role:'taxpayer',person_type:'individual',resident:true}],assets:[],events:[],valuations:[],liabilities:[],amounts:[],expenses:[]};
  const lots=d.lots.map((l,i)=>{const ref='L'+(i+1),s=need(l.source,ref+' 증빙 참조'),acquired=day(l.date,ref+' 취득일'),n=amount(l.numerator,'지분 분자',true),den=amount(l.denominator,'지분 분모',true),sale=amount(l.sale,'취득분 양도가액',true),cost=amount(l.cost,'취득분 원가',true),expense=amount(l.expense,'취득분 경비');
    if(n>=den||den>1000000000)throw Error('각 지분은 0보다 크고 1보다 작아야 하며 분모는 10억 이하여야 합니다.');
    if(acquired>=sold)throw Error('취득일은 양도일 이전이어야 합니다.');
    if(sale<=cost+expense)throw Error('현재 각 취득분의 양도차익이 양수인 경우만 지원합니다.');
    common.assets.push({asset_ref:ref,source_id:s,property_type:'토지',whole_property_confirmed:false,share_numerator:n,share_denominator:den,share_source_id:s});
    for(const [kind,date] of [['seller_acquisition',acquired],['seller_sale',sold]])common.events.push({kind,asset_ref:ref,party_ref:'T',occurred_on:date,source_id:s});
    for(const [purpose,value,date] of [['tax_adjusted_acquisition_cost',cost,acquired],['sale_consideration',sale,sold]])common.amounts.push({asset_ref:ref,purpose,scope:'transaction_share',amount_krw:value,as_of:date,source_id:s});
    common.expenses.push({asset_ref:ref,payer_ref:'T',kind:'deductible_sale_expenses',scope:'transaction_share',amount_krw:expense,event_kind:'seller_sale',source_id:s});
    return {n:BigInt(n),den:BigInt(den),sale,date:acquired};
  });
  if(lots[0].n*lots[1].den+lots[1].n*lots[0].den!==lots[0].den*lots[1].den)throw Error('두 지분 합계가 1이어야 합니다.');
  if(lots[0].date===lots[1].date)throw Error('두 취득일이 달라야 합니다.');
  if(BigInt(lots[0].sale)+BigInt(lots[1].sale)!==BigInt(whole))throw Error('취득분 양도가액 합계가 전체 양도가액과 다릅니다.');
  const keys=Object.keys(splitReviewLabels).filter(k=>!['resident','annual','local'].includes(k));
  return {schema_version:'transfer-split-public/1',ai_consultation:true,common_facts:common,consultation_context:{source_id:source,year:2026,taxpayer_ref:'T',property_id:property,property_source_id:source,all_annual_subject_transfers_included:true,annual_scope_source_id:d.sources.annual,local_standard_rate_confirmed:true,local_rate_source_id:d.sources.local,whole_sale_price_krw:whole,whole_sale_price_source_id:source,lot_refs:['L1','L2'],facts:Object.fromEntries(keys.map(k=>[k,true])),fact_sources:Object.fromEntries(keys.map(k=>[k,d.sources[k]]))}};
}
function JTTransferSplitDirect({onBack,initialDraft}){
  const [draft,setDraft]=React.useState(()=>splitDirectResume(initialDraft)),[result,setResult]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
  const version=React.useRef(0),control=React.useRef(null);
  React.useEffect(()=>()=>{version.current++;control.current?.abort();},[]);
  const edit=(fn,reviewOnly=false)=>{version.current++;control.current?.abort();setBusy(false);setResult(null);setError('');setDraft(d=>{const next=fn(d);return reviewOnly?next:{...next,review:{}};});};
  const field=(label,value,onChange,type='text')=><label style={{display:'grid',gap:5,marginBottom:12}}>{label}<input type={type} value={value} onChange={e=>onChange(e.target.value)} /></label>;
  const calculate=async e=>{e.preventDefault();if(busy)return;setResult(null);setError('');let body;try{body=splitDirectRequest(draft);}catch(e){setError(e.message);return;}
    const ticket=++version.current,ctrl=new AbortController();control.current=ctrl;setBusy(true);const timer=setTimeout(()=>ctrl.abort(),25000);
    try{const base=window.JT_ENGINE_BASE|| (typeof ENGINE_BASE!=='undefined'?ENGINE_BASE:'');if(!base)throw Error('계산 서버가 연결되지 않았습니다.');const response=await fetch(base.replace(/\/$/,'')+'/v1/calc/transfer-split',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctrl.signal});const data=await response.json();if(ticket!==version.current)return;if(!response.ok)throw Error('입력 형식 또는 지원 범위를 확인하세요.');if(!data.calc||data.calc['상태']!=='ok')throw Error(typeof window.jtEngineMessageForDisplay==='function'?window.jtEngineMessageForDisplay(data.calc?.['오류']||'추가 사실 확인이 필요합니다.'):'추가 사실 확인이 필요합니다.');setResult(splitDirectResult(data.calc));
    }catch(e){if(ticket===version.current)setError(e.name==='AbortError'?'계산 연결 시간이 초과되었습니다. 다시 시도하세요.':typeof window.jtEngineMessageForDisplay==='function'?window.jtEngineMessageForDisplay(e.message):'계산하지 못했습니다. 입력과 연결을 확인하세요.');}finally{clearTimeout(timer);if(ticket===version.current)setBusy(false);}
  };
  return <section style={{maxWidth:900,margin:'32px auto',padding:24}}><button type="button" onClick={()=>onBack(draft)}>돌아가기</button><h1>토지 분할취득 계산</h1><p>서로 다른 날 취득한 두 지분을 함께 양도한 경우입니다. 각 취득분의 양도가액·원가·경비는 증빙에 따른 귀속금액을 입력하세요. 전체 금액을 지분율로 자동 배분하지 않습니다.</p><p>지원 범위: 2026년 10월 1일~23일 양도, 각 취득분 2년 이상 보유, 지분 합계 100%, 각 취득분 양도차익이 양수인 사업용 토지입니다. 주택·입주권·청산금 결합은 지원하지 않습니다.</p><form onSubmit={calculate}>
    {field('물건 식별명 (개인정보 제외)',draft.property,v=>edit(d=>({...d,property:v})))}{field('공통 증빙 참조 (물건·전체 매매대금 확인 자료)',draft.source,v=>edit(d=>({...d,source:v})))}{field('양도일',draft.sold,v=>edit(d=>({...d,sold:v})),'date')}{field('전체 양도가액 (원)',draft.whole,v=>edit(d=>({...d,whole:v})))}
    {draft.lots.map((lot,i)=><fieldset key={i}><legend>취득분 {i+1}</legend>{[['취득일','date','date'],['지분 분자','numerator'],['지분 분모','denominator'],['이 취득분의 양도가액 (원)','sale'],['세무 조정 후 취득원가 (원)','cost'],['적격 필요경비 합계 (원, 없으면 0)','expense'],['취득·지분·금액·경비 증빙 참조','source']].map(([label,key,type])=><React.Fragment key={key}>{field(label,lot[key],v=>edit(d=>({...d,lots:d.lots.map((l,j)=>j===i?{...l,[key]:v}:l)})),type)}</React.Fragment>)}</fieldset>)}
    <h2>검토와 근거</h2><p>입력이나 근거를 수정하면 확인 표시와 이전 결과가 초기화됩니다. 근거 참조는 사용자가 입력한 정보이며 시스템이 증빙의 진위를 인증하지 않습니다.</p>
    {Object.entries(splitReviewLabels).map(([key,label])=><div key={key} style={{marginBottom:16}}>{field(label+' — 근거 참조',draft.sources[key]||'',v=>edit(d=>({...d,sources:{...d.sources,[key]:v}})))}<label><input type="checkbox" checked={draft.review[key]===true} onChange={e=>{const checked=e.target.checked;edit(d=>({...d,review:{...d.review,[key]:checked}}),true);}} /> {label} — 확인했습니다</label></div>)}
    <button disabled={busy} type="submit">{busy?'계산 중…':'계산하기'}</button></form>{error&&<p role="alert">{error}</p>}{result&&<div aria-live="polite"><h2>계산 결과</h2>{['세액','지방소득세','총세부담'].map(k=><p key={k}>{k}: {typeof result[k]==='number'?result[k].toLocaleString()+'원':'확인 필요'}</p>)}<table><thead><tr><th>취득분</th><th>양도차익</th><th>장기보유특별공제</th><th>양도소득금액</th></tr></thead><tbody>{(result['원본결과']?.rows||[]).map(r=><tr key={r.lot_id}><td>{r.lot_id}</td>{['transfer_gain','long_term_deduction','transfer_income'].map(k=><td key={k}>{r[k]?.toLocaleString()}원</td>)}</tr>)}</tbody></table></div>}</section>;
}

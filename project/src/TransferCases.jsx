/* Saved transfer cases use the same authenticated client/case workbench. */
let jtTransferSession = null;
function transferDirty(w = jtTransferSession) {
  return !!w && JSON.stringify({ label: w.label, draft: w.draft }) !== w.baseline;
}
function JTTransferCases({ clientId, caseId, onExit }) {
  const [w, setW] = React.useState(jtTransferSession);
  const [opened,setOpened] = React.useState(false);
  const [splitMode,setSplitMode] = React.useState(false);
  const ref = React.useRef(w), lock = React.useRef(false), alive = React.useRef(true);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const [catalog, setCatalog] = React.useState({properties:[]}), [choice, setChoice] = React.useState({transfer_share:'1',transfer_date:'',adoption_reason:'',confirmed:false});
  const [ownerTimeline,setOwnerTimeline] = React.useState(null);
  const ownerQuery = React.useRef(0);
  const [preview, setPreview] = React.useState(null), [revision, setRevision] = React.useState('');
  const keys = React.useRef({});
  const remember = value => { ref.current = value; jtTransferSession = value; if (alive.current) setW(value); };
  const api = async (path, options = {}) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(),45000);
    try {
      const r = await fetch((window.JT_ENGINE_BASE || 'http://127.0.0.1:8000').replace(/\/$/,'') + path,
        {...options,signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+jtGiftSession.token,...options.headers}});
      const data = await r.json().catch(()=>({}));
      if (!r.ok) {
        if (r.status === 401) jtGiftSession.token = '';
        const messages = {SOURCE_FACT_HISTORY_GAP:'원본 이력의 연결이 끊겼습니다. 변경 내역을 확인하세요.',SOURCE_FACT_VERSION_NOT_FOUND:'선택한 원본 버전을 찾을 수 없습니다.',SOURCE_FACT_NOT_FOUND:'해당 고객의 원본 자료가 없습니다.',SOURCE_FACT_DATE_INVALID:'선택 버전의 취득일·생년월일이 사건일보다 늦습니다.',SOURCE_FACT_APPLICABILITY_REQUIRED:'사건일을 포함하는 적용기간과 선택 근거를 확인하세요.',SOURCE_OWNERSHIP_HISTORY_GAP:'소유 이력과 현재 원본이 일치하지 않습니다. 변동 기록을 확인하세요.',SOURCE_OWNERSHIP_VERSION_DATE_MISMATCH:'사건 날짜에 맞는 소유 이력을 다시 조회하고 선택하세요.',SOURCE_OWNERSHIP_VERSION_OWNER_MISMATCH:'선택한 이력의 소유자를 다시 선택하세요.',SOURCE_OWNERSHIP_HISTORY_CONFIRM_REQUIRED:'과거 소유 지분과 현재 취득·평가자료의 사용을 확인하세요.',SOURCE_OWNERSHIP_DATE_REVIEW_REQUIRED:'현재 소유 변동일보다 이른 사건입니다. 과거 소유 자료를 확인해야 합니다.',SOURCE_CHANGED:'원본 자료가 변경됐습니다. 다시 확인해 주세요.',REVISION_CONFLICT:'다른 저장본이 있습니다. 다시 열어 확인해 주세요.',
          SOURCE_PROPERTY_UNSUPPORTED:'주택 또는 매매 취득 토지·상가 원본을 선택하세요. 원본 환산취득가는 지원하지 않습니다.',SOURCE_NONHOUSING_SHARE_UNSUPPORTED:'일반 비주택은 전체 지분 1의 양도부터 지원합니다.',SOURCE_SHARE_INVALID:'양도 지분은 보유 지분 이하여야 합니다.',
          DRAFT_NOT_RUNNABLE:'저장본의 보완 항목을 확인해 주세요.',ENGINE_CALCULATION_ERROR:'계산 입력을 추가 확인해야 합니다. 결과는 저장되지 않았습니다.'};
        throw new Error(r.status===401?'로그인이 필요합니다. 작업대로 돌아가 같은 계정으로 로그인하세요.':
          messages[data.detail?.code] || (r.status===422?'입력 형식과 날짜·금액을 확인해 주세요.':'자료를 처리하지 못했습니다. 저장본을 확인하고 다시 시도해 주세요.'));
      }
      return data;
    } finally { clearTimeout(timer); }
  };
  const mutation = (path, method, body, etag) => {
    const signature = JSON.stringify({path,method,body,etag});
    const memory = path==='/v1/transfer-cases' ? keys.current : ref.current?.keys || keys.current;
    return api(path,{method,body:JSON.stringify(body),headers:{'Idempotency-Key':memory[signature] ||= window.crypto.randomUUID(),...(etag?{'If-Match':etag}:{})}});
  };
  const act = async fn => {
    if (lock.current) return;
    lock.current=true;setBusy(true);setError('');
    try { await fn(); } catch(e) { if(alive.current)setError(e instanceof TypeError || e.name==='AbortError'?
      '응답을 받지 못했습니다. 입력은 유지됩니다. 같은 작업을 다시 누르면 저장 여부를 확인합니다.':e.message); }
    finally {lock.current=false;if(alive.current)setBusy(false);}
  };
  const load = async (id, number='') => {
    const saved = await api('/v1/transfer-cases/'+id+(number?'?revision='+number:''));
    if(saved.client_id!==clientId)throw new Error('선택한 고객의 사건이 아닙니다.');
    const run = saved.last_successful_run_id?await api('/v1/transfer-cases/'+id+'/runs/'+saved.last_successful_run_id):null;
    remember({uid:jtGiftSession.uid,meta:saved,label:saved.label,draft:saved.draft,run,keys:ref.current?.keys || keys.current,
      baseline:JSON.stringify({label:saved.label,draft:saved.draft})});
    if(alive.current)setOpened(true);
  };
  React.useEffect(()=>{
    alive.current=true;
    act(async()=>{
      if(caseId==='resume' && ref.current?.meta?.client_id===clientId){if(ref.current.uid!==jtGiftSession.uid)throw new Error('편집하던 계정으로 다시 로그인해 주세요.');setOpened(true);return;}
      if(caseId)await load(caseId);
      else {
        const made=await mutation('/v1/transfer-cases','POST',{client_id:clientId,label:'새 양도 사건',draft:{}});
        await load(made.case_id);
      }
    });
    const protect=e=>{if(lock.current||transferDirty(ref.current)){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',protect);
    return()=>{alive.current=false;window.removeEventListener('beforeunload',protect);};
  },[]);
  const current = opened && w?.meta?.client_id===clientId && (caseId==='resume'||!caseId||w.meta.case_id===caseId);
  const readonly = !current || w.meta.read_only || w.meta.revision!==w.meta.current_revision;
  const base = current?'/v1/transfer-cases/'+w.meta.case_id:'';
  const change = (key,value) => remember({...ref.current,draft:{...ref.current.draft,facts_confirmed:false,special_facts_confirmed:false,
    nonhousing_review:ref.current.draft.nonhousing_review?{...ref.current.draft.nonhousing_review,facts_confirmed:false}:null,merge_each_one_house_confirmed:false,acquisition_facts_confirmed:false,share_facts_confirmed:false,unregistered_review:ref.current.draft.unregistered_review?{...ref.current.draft.unregistered_review,facts_confirmed:false}:null,depreciation_review:ref.current.draft.depreciation_review?{...ref.current.draft.depreciation_review,facts_confirmed:false}:null,converted_review:ref.current.draft.converted_review?{...ref.current.draft.converted_review,facts_confirmed:false}:null,request:{...ref.current.draft.request,[key]:value}}});
  const mode = w?.draft?.request?.exemption_special_type || (w?.draft?.request?.inherited_house_count ? 'inherited' : 'ordinary');
  const acquisitionMode = w?.draft?.request?.is_inherited ? 'inherited' : w?.draft?.request?.is_gifted ? 'gifted' : 'purchased';
  const changeAcquisition = value => {
    const request = {...ref.current.draft.request,is_inherited:value==='inherited',is_gifted:value==='gifted',
      is_unregistered:false,depreciation_recaptured:0,use_converted_price:false,standard_price_at_acq:0,standard_price_at_transfer:0,acquisition_date:null,acquisition_price:0,expenses_total:0,regulated_at_acquisition:null,move_in_date:null,move_out_date:null,
      decedent_acquisition_date:null,gift_date:null,is_deferred:false,donor_acquisition_date:null,donor_acquisition_price:0,donor_gift_tax_paid:0,donor_relationship:'',
      exemption_special_type:'',new_house_acquisition_date:null,new_house_contract_date:null,temp2_both_regulated:null,
      new_house_before_designation:null,temp2_one_year_waived:null,inheritance_start_date:null,inherited_house_count:0,marriage_date:null,merge_date:null,parent_age:0};
    remember({...ref.current,draft:{...ref.current.draft,request,unregistered_review:null,depreciation_review:null,converted_review:null,acquisition_facts_confirmed:false,acquisition_review_note:'',gift_deferred_review:'',gift_donor_relationship:'',
      facts_confirmed:false,ordinary_sale_confirmed:false,special_facts_confirmed:false,special_review_note:'',merge_other_house_acquisition_date:null,merge_each_one_house_confirmed:false,
      share_facts_confirmed:false,share_review_note:''}});
  };
  const converted = !!w?.draft?.request?.use_converted_price;
  const changeConverted = value => {
    if(!window.confirm('취득가액 방식을 바꾸면 사건의 취득가액·필요경비·감가상각·기준시가·확인을 비웁니다. 원본 자료와 과거 결과는 유지됩니다. 계속할까요?'))return;
    const old=ref.current;
    remember({...old,draft:{...old.draft,facts_confirmed:false,ordinary_sale_confirmed:false,share_facts_confirmed:false,
      unregistered_review:null,depreciation_review:null,converted_review:value?{actual_unavailable:false,prior_methods_unavailable:false,simple_basis_confirmed:false,facts_confirmed:false,
        acquisition_source:'',transfer_source:'',review_note:'',actual_capital_transfer_expenses:null}:null,
      request:{...old.draft.request,is_unregistered:false,depreciation_recaptured:0,use_converted_price:value,acquisition_price:0,expenses_total:0,standard_price_at_acq:0,standard_price_at_transfer:0}}});
  };
  const changeConvertedReview = (key,value) => remember({...w,draft:{...w.draft,facts_confirmed:false,
    converted_review:{...w.draft.converted_review,facts_confirmed:false,[key]:value}}});
  const changeMode = value => {
    const request = {...ref.current.draft.request, is_unregistered:false, depreciation_recaptured:0, exemption_special_type:value==='ordinary'?'':value,
      new_house_acquisition_date:null,new_house_contract_date:null,temp2_both_regulated:null,
      new_house_before_designation:null,temp2_one_year_waived:null,inheritance_start_date:null,
      inherited_house_count:value==='inherited'?1:0,marriage_date:null,merge_date:null,parent_age:0};
    remember({...ref.current,draft:{...ref.current.draft,request,unregistered_review:null,depreciation_review:null,facts_confirmed:false,
      ordinary_sale_confirmed:false,special_facts_confirmed:false,special_review_note:'',
      merge_other_house_acquisition_date:null,merge_each_one_house_confirmed:false}});
  };
  const changeUnregistered = value => {
    const old=ref.current;
    remember({...old,draft:{...old.draft,facts_confirmed:false,ordinary_sale_confirmed:false,
      unregistered_review:value?{acquisition_not_registered:false,exceptions_excluded:false,facts_confirmed:false,review_note:''}:null,
      request:{...old.draft.request,is_unregistered:value}}});
  };
  const reviewUnregistered = (key,value) => remember({...ref.current,draft:{...ref.current.draft,facts_confirmed:false,
    unregistered_review:{...ref.current.draft.unregistered_review,facts_confirmed:false,[key]:value}}});
  const save = async () => {
    if(!transferDirty(ref.current))return ref.current.meta;
    const saved=await mutation(base,'PUT',{label:ref.current.label,draft:ref.current.draft},ref.current.meta.etag);
    await load(saved.case_id);return ref.current.meta;
  };
  const select = (key,value) => {setPreview(null);if(['property_id','transfer_date'].includes(key)){ownerQuery.current++;setOwnerTimeline(null);}setChoice(old=>({...old,[key]:value,...(['property_id','ownership_id','ownership_version','valuation_id','transfer_date'].includes(key)?{fact_selection:null}:{}),...(key!=='confirmed'?{confirmed:false}:{}),...(!['confirmed','nonhousing_share_basis_confirmed'].includes(key)?{nonhousing_share_basis_confirmed:false}:{}),...((['property_id','ownership_version'].includes(key)||(key==='transfer_date'&&old.ownership_version))?{ownership_id:'',ownership_history_confirmed:false}:{}),...(['property_id','transfer_date'].includes(key)?{ownership_version:null}:{}),...(key==='property_id'?{ownership_id:'',valuation_id:''}:{})}));};
  const selection = () => ({property_id:choice.property_id,ownership_id:choice.ownership_id,valuation_id:choice.valuation_id,
    transfer_share:choice.transfer_share,transfer_date:choice.transfer_date,adoption_reason:choice.adoption_reason,
    ...(['토지','상가'].includes(property?.property_type)&&Number(choice.transfer_share)<1?{nonhousing_share_basis_confirmed:!!choice.nonhousing_share_basis_confirmed}:{}),
    fact_selection:choice.fact_selection||null,amount_basis:'whole_property',amounts_confirmed:choice.confirmed,ownership_version:choice.ownership_version||null,ownership_history_confirmed:!!choice.ownership_history_confirmed});
  const property=catalog.properties.find(p=>p.id===choice.property_id);
  if(current&&(splitMode||w.draft.split_request))return <JTTransferSplit w={w} base={base} api={api} mutation={mutation} act={act} busy={busy} error={error} load={load} onExit={onExit} onCancel={()=>setSplitMode(false)} remember={remember}/>;
  const source=current?w.meta.master_snapshot:null;
  const nonhousing=['토지','상가'].includes(w?.draft?.request?.property_type);
  const reviewNonhousing=(key,value)=>remember({...w,draft:{...w.draft,facts_confirmed:false,nonhousing_review:{...w.draft.nonhousing_review,facts_confirmed:false,[key]:value}}});
  const partial=!!source&&Number(source.selection.transfer_share)<1;
  const pendingSource=!!source&&!!choice.property_id&&['property_id','ownership_id','valuation_id','transfer_share','ownership_version','transfer_date'].some(k=>
    k==='transfer_share'?Number(choice[k])!==Number(source.selection[k]):choice[k]!==source.selection[k]);
  const fields=[['address','재산 주소','text'],['transfer_price','양도가액(원)','number'],['acquisition_price','취득가액(원)','number'],
    ['expenses_total','필요경비(원)','number'],['exclusive_area','전용면적(㎡)','number'],['acquisition_date','취득일','date'],['transfer_date','양도일','date'],
    ['housing_count','세대 주택 수','number'],['move_in_date','전입일(거주 없으면 비움)','date'],['move_out_date','전출일(계속 거주하면 비움)','date']];
  return <div className="jt-container cw-workspace">
    <style>{`.tc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.tc-grid label{display:flex;flex-direction:column;gap:6px}.tc-grid input,.tc-grid select{padding:10px;font:inherit;min-height:44px}.tc-section{border:1px solid #ccd8cd;padding:20px;margin:20px 0;border-radius:10px}.tc-section button{margin:8px;min-height:44px}.tc-section p{line-height:1.6}`}</style>
    <button disabled={busy} onClick={onExit}>← 고객·사건 작업대</button><h1>양도 사건 입력·저장</h1>
    <button data-testid="transfer-split-mode" disabled={busy||readonly} onClick={()=>setSplitMode(true)}>분할취득 원본·양도 연결</button>
    <p>주택 및 매매 취득 토지·상가의 일반 양도를 연결합니다. 비주택은 2026-07-01~2026-10-17 양도, 단일 취득·전체 지분, 국내 거주자의 등기 실가 양도부터 지원합니다. 지분은 재산 전체 기준으로 입력하고 보유 지분 이내에서 선택하세요. 다른 주택 특례는 매매 취득 대상에서 검토하며, 환산취득가는 아래에서 적용 조건과 두 기준시가를 확인합니다. 복합 취득·분할 취득·감면은 아직 연결하지 않았습니다.</p>
    {error&&<p role="alert">{error}</p>}
    {!current&&!busy&&<button onClick={()=>act(async()=>{if(caseId&&caseId!=='resume')await load(caseId);else{const made=await mutation('/v1/transfer-cases','POST',{client_id:clientId,label:'새 양도 사건',draft:{}});await load(made.case_id);}})}>사건 열기 다시 시도</button>}
    {current&&<>
      <p>저장 버전 {w.meta.revision} / 최신 {w.meta.current_revision}{readonly?' · 읽기 전용 저장본':''}{transferDirty(w)?' · 저장하지 않은 변경 있음':''}</p>
      <label>사건명<input data-testid="transfer-label" disabled={busy||readonly} value={w.label} onChange={e=>remember({...w,label:e.target.value})}/></label>
      {source&&<section className="tc-section" aria-label="양도 가져오기 당시 원본 자료"><h2>가져오기 당시 자료</h2>
        <p>{source.property.address} · 소유자 {source.ownership.name} · 보유 지분 {source.ownership.share_ratio} · 양도 지분 {source.selection.transfer_share}</p>
      {source.fact_history&&<p data-testid="transfer-saved-fact-period">과거 사실 적용기간 {source.fact_history.applicability.applicable_from} ~ {source.fact_history.applicability.applicable_until} · 확인 근거: {source.fact_history.applicability.reason} · 당시 선택한 취득·당사자·평가자료 보존</p>}
      {source.ownership_history&&<p data-testid="transfer-saved-ownership-period">채택 소유 기간: {source.ownership_history.valid_from}부터 {source.ownership_history.valid_until||'이후'} (변동 당일은 확인한 선후관계 기준) · 기록 {source.ownership_history.revision} · 다른 원본 사실은 아래 선택 버전 또는 가져오기 시점 자료</p>}
        <p>평가일 {source.valuation.as_of_date} · {source.valuation.valuation_type} · {source.valuation.source} · 전체 평가액 {Number(source.valuation.amount).toLocaleString()}원</p>
        {source.property.necessary_expenses_detail?.schema_version==='property-expenses/1'&&<details data-testid="transfer-expense-detail"><summary>채택 당시 필요경비 명세(전체 재산 기준)</summary>
          <ul>{source.property.necessary_expenses_detail.rows.map(r=><li key={r.local_id}>{r.description} · {r.amount_krw}원 · {r.included?'산입':'제외'} · {r.source}</li>)}</ul>
          <p>검토 근거: {source.property.necessary_expenses_detail.review_note}</p><p>일반 취득 방식에서는 명세 합계에 양도 지분을 적용한 금액을 전달합니다. 환산 방식에서는 이 합계를 공제하지 않고 별도 확인한 기준시가로 개산공제를 계산합니다. 금액 수정은 원본 명세를 수정한 뒤 다시 가져오세요.</p>
        </details>}
        <p>채택 당시 양도가액 {source.adopted.transfer_price.toLocaleString()}원 · 취득가 {source.adopted.acquisition_price.toLocaleString()}원 · 필요경비 {source.adopted.expenses_total.toLocaleString()}원</p>
        <p>채택 사유: {source.selection.adoption_reason} · 저장 시각 {source.captured_at}</p><p>아래 입력은 별도로 수정할 수 있으며, 당시 원본과 과거 계산 결과는 유지됩니다.</p>
      </section>}
      <section className="tc-section"><h2>1. 재산·소유·평가자료 가져오기</h2>
        {pendingSource&&<div role="status"><p>선택 중인 지분 {choice.transfer_share} / 저장본 지분 {source.selection.transfer_share}: 아직 입력과 결과에 반영되지 않았습니다. 자료를 확인해 새 버전으로 가져오거나 선택을 취소하세요.</p>
          <button disabled={busy} onClick={()=>{ownerQuery.current++;setOwnerTimeline(null);setChoice({...source.selection,ownership_version:null,ownership_history_confirmed:false,ownership_id:'',fact_selection:null,confirmed:false});setPreview(null);}}>자료 선택 취소</button></div>}
        <button disabled={busy||readonly} onClick={()=>act(async()=>{setCatalog(await api(base+'/sources'));setPreview(null);})}>기존 자료 조회</button>
        {catalog.next_cursor&&<button disabled={busy||readonly} onClick={()=>act(async()=>{const data=await api(base+'/sources?cursor='+catalog.next_cursor);setCatalog({properties:[...catalog.properties,...data.properties],next_cursor:data.next_cursor});})}>재산 더 보기</button>}
        <div className="tc-grid">
          {[['property_id','재산',catalog.properties.map(p=>[p.id,p.address+' · '+p.property_type+' · '+p.acquired_by])],
            ['ownership_id','소유자',(ownerTimeline?.items.find(x=>x.version===choice.ownership_version)?.ownerships||property?.ownerships)?.map(o=>[o.id,o.name+' · 지분 '+o.share_ratio])||[]],
            ['valuation_id','양도가액으로 채택할 평가 후보',property?.valuations.map(v=>[v.id,v.as_of_date+' · '+v.valuation_type+' · '+Number(v.amount).toLocaleString()+'원'])||[]]].map(([key,label,items])=>
            <label key={key}>{label}<select data-testid={'transfer-source-'+key} disabled={busy||readonly} value={choice[key]||''} onChange={e=>select(key,e.target.value)}><option value="">선택</option>{items.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>)}
          {[['transfer_share','양도 지분(0 초과~1)','text'],['transfer_date','양도일','date'],['adoption_reason','이 평가액을 양도가액으로 채택한 사유','text']].map(([key,label,type])=>
            <label key={key}>{label}<input data-testid={'transfer-source-'+key} disabled={busy||readonly} type={type} value={choice[key]} onChange={e=>select(key,e.target.value)}/></label>)}
        </div>
        <div aria-label="사건일 소유 이력">
          <button data-testid="transfer-ownership-load" disabled={busy||readonly||!choice.property_id||!choice.transfer_date} onClick={()=>act(async()=>{
            const generation=++ownerQuery.current;setPreview(null);setOwnerTimeline(null);
            const data=await api('/v1/clients/'+clientId+'/masters/properties/'+choice.property_id+'/ownership-options?event_date='+choice.transfer_date);
            if(generation===ownerQuery.current){setOwnerTimeline(data);select('ownership_version',null);}
          })}>사건일 소유 이력 조회</button>
          {ownerTimeline&&<><label>사건 날짜에 맞는 지분 기록<select data-testid="transfer-ownership-version" disabled={busy||readonly} value={choice.ownership_version||''} onChange={e=>select('ownership_version',e.target.value||null)}>
            <option value="">명시적으로 선택</option>{ownerTimeline.items.filter(x=>x.eligible).map(x=><option key={x.version} value={x.version}>{x.valid_from}부터 {x.valid_until?'~ '+x.valid_until+' (당일 선후 확인)':'이후'} · 기록 {x.revision}{x.boundary_review_required?' · 당일 변동 후보':''}{x.basis==='before_first_retained_change'?' (첫 보관 전 상태·이전 변동 확인 필요)':''}</option>)}</select></label>
            {!ownerTimeline.items.some(x=>x.eligible)&&<p>이 날짜를 뒷받침하는 소유 기록이 없습니다.</p>}</>}
          {choice.ownership_version&&<label><input data-testid="transfer-ownership-confirm" type="checkbox" disabled={busy||readonly} checked={!!choice.ownership_history_confirmed} onChange={e=>select('ownership_history_confirmed',e.target.checked)}/>사건과 소유 변동의 선후관계·선택 지분·이전 변동 누락 여부를 확인했습니다. 재산·당사자·평가자료는 별도 과거 버전을 선택하거나 현재 자료를 사용하므로 취득 사실·금액을 함께 검토합니다.</label>}
        </div>
        <JTFactVersionPicker api={api} clientId={clientId} propertyId={choice.property_id} ownerId={(ownerTimeline?.items.find(x=>x.version===choice.ownership_version)?.ownerships||property?.ownerships||[]).find(x=>x.id===choice.ownership_id)?.person_id} doneeId={choice.donee_person_id} eventDate={choice.transfer_date} valuationId={choice.valuation_id} selection={choice.fact_selection} onChange={v=>select('fact_selection',v)} disabled={busy||readonly}/>
        <label><input data-testid="transfer-source-confirmed" type="checkbox" disabled={busy||readonly} checked={choice.confirmed} onChange={e=>select('confirmed',e.target.checked)}/>평가액·취득가·필요경비가 모두 재산 전체 금액임을 확인했습니다.</label>
        {['토지','상가'].includes(property?.property_type)&&Number(choice.transfer_share)<1&&<label><input data-testid="transfer-source-nonhousing_share_basis_confirmed" type="checkbox" disabled={busy||readonly} checked={!!choice.nonhousing_share_basis_confirmed} onChange={e=>select('nonhousing_share_basis_confirmed',e.target.checked)}/>동일 취득일·동일 단가의 한 취득분이며 전체 재산 금액 × 양도 지분이 실제 귀속 가액과 일치합니다. 토지·건물 일괄가액/개별 지분 비용/분할취득이 없고 현재 소유 기록과 양도일자 실가 자료를 확인했습니다.</label>}
        <p>비주택 일부 지분은 원 단위로 정확히 안분되는 금액만 가져옵니다. 금액·날짜 변경은 원본을 수정한 뒤 다시 가져오세요.</p>
        <p>평가액이 실제 계약금액과 다르면 가져온 뒤 양도가액을 수정하세요. 원본 자료를 다시 가져오면 현재 양도 입력과 확인 사항이 초기화됩니다.</p>
        <button disabled={busy||readonly||!choice.confirmed} onClick={()=>act(async()=>setPreview(await api(base+'/source-preview',{method:'POST',body:JSON.stringify(selection())})))}>선택 자료 확인</button>
        {preview&&<><p>전체 재산가액 {Number(preview.valuation.amount).toLocaleString()}원 × 양도 지분 {preview.selection.transfer_share} ({preview.amount_rule.endsWith('exact_won')?'원 단위 정확 안분':'원 미만 버림'})</p><p>채택 양도가액 {preview.adopted.transfer_price.toLocaleString()}원 · 취득가 {preview.adopted.acquisition_price.toLocaleString()}원 · 필요경비 {preview.adopted.expenses_total.toLocaleString()}원</p>
          <button disabled={busy||readonly} onClick={()=>act(async()=>{if(!window.confirm('선택한 원본으로 입력을 교체하고 새 버전으로 저장할까요?'))return;
            const saved=await mutation(base+'/source-imports','POST',{label:w.label,draft:w.draft,selection:selection(),expected_source_hash:preview.source_hash},w.meta.etag);
            await load(saved.case_id);setPreview(null);})}>가져와 새 버전 저장</button></>}
      </section>
      {w.draft.request&&<section className="tc-section"><h2>2. 양도 입력 확인</h2>
      {!nonhousing&&<><label>양도 대상 자체의 취득 경로<select data-testid="transfer-acquisition-mode" disabled={busy||readonly} value={acquisitionMode} onChange={e=>changeAcquisition(e.target.value)}>
        <option value="purchased">매매 취득</option><option value="inherited">상속으로 취득한 주택 양도</option><option value="gifted">증여받은 주택 양도</option></select></label>
      <p>취득 경로를 바꾸면 취득가액·필요경비·취득/거주 날짜·취득 당시 조정지역·특례·확인 입력을 비웁니다. 가져오기 당시 원본과 과거 저장본은 유지됩니다.</p></>}
      {acquisitionMode!=='purchased'&&<p>취득일에는 상속개시일 또는 증여 취득일을, 취득가액에는 해당 취득가액으로 확인한 평가액을 입력하세요. 현재 양도가액용 평가 후보를 취득가액으로 자동 대체하지 않습니다.</p>}
      <div className="tc-grid">
        {fields.filter(([key])=>!nonhousing||!['housing_count','move_in_date','move_out_date'].includes(key)).map(([key,label,type])=><label key={key}>{key==='exclusive_area'&&w.draft.request.property_type==='토지'?'토지면적(㎡)':label}<input data-testid={'transfer-'+key} type={type} disabled={busy||readonly||(converted&&['acquisition_price','expenses_total'].includes(key))} min={type==='number'?0:undefined}
          value={w.draft.request[key]??''} onChange={e=>change(key,type==='number'?(e.target.value===''?null:Number(e.target.value)):(e.target.value||null))}/></label>)}
        {!nonhousing&&[['is_regulated_area','양도 당시 조정대상지역'],['regulated_at_acquisition','취득 당시 조정대상지역']].map(([key,label])=>
          <label key={key}>{label}<select data-testid={'transfer-'+key} disabled={busy||readonly} value={w.draft.request[key]==null?'':String(w.draft.request[key])} onChange={e=>change(key,e.target.value===''?null:e.target.value==='true')}>
            <option value="">확인 필요</option><option value="true">예</option><option value="false">아니오</option></select></label>)}
      </div>
      {!nonhousing&&acquisitionMode==='purchased'&&<section className="tc-section" aria-label="환산취득가액 입력">
        <h3>취득가액 결정 방식</h3>
        <select data-testid="transfer-converted-mode" disabled={busy||readonly||mode!=='ordinary'} value={converted?'converted':'actual'} onChange={e=>changeConverted(e.target.value==='converted')}>
          <option value="actual">실지취득가액</option><option value="converted">실지취득가액 확인 불가 · 환산 검토</option>
        </select>
        <p>방식 전환 시 사건의 금액과 확인을 비웁니다. 일반 방식으로 돌아오면 취득가액·필요경비를 다시 입력하거나 원본을 다시 가져오세요.</p>
        {converted&&<>
          <p>2026년 일반 양도, 1996년 이후 매매 취득한 등기 주택부터 지원합니다. 상속·증여·특례 결합, 최초 공시 전 취득, 동일 고시기간의 기준시가 조정, 신축·증축·감가상각 등 별도 처리가 필요한 경우에는 계산을 보류하세요.</p>
          <p>양도가액 × 취득 당시 기준시가 ÷ 양도 당시 기준시가로 환산하고 취득 당시 기준시가의 3%를 개산공제합니다. 두 기준시가 모두 이 양도 지분에 해당하는 금액이어야 하며 지분을 다시 곱하지 않습니다.</p>
          <div className="tc-grid">{[['standard_price_at_acq','취득 당시 기준시가(양도 지분 기준, 원)'],['standard_price_at_transfer','양도 당시 기준시가(양도 지분 기준, 원)']].map(([key,label])=>
            <label key={key}>{label}<input data-testid={'transfer-'+key} type="number" min="1" step="1" disabled={busy||readonly} value={w.draft.request[key]||''} onChange={e=>change(key,Number(e.target.value)||0)}/></label>)}
          {['acquisition_source','transfer_source','review_note'].map((key,i)=><label key={key}>{['취득 기준시가의 공시일·금액·출처·지분 근거','양도 기준시가의 공시일·금액·출처·지분 근거','실가·선순위 방법 확인 불가 사유와 검토 근거'][i]}
            <textarea data-testid={'converted-'+key} maxLength={1000} disabled={busy||readonly} value={w.draft.converted_review?.[key]||''} onChange={e=>changeConvertedReview(key,e.target.value)}/></label>)}
          <label>비교용 실제 자본적 지출·양도비 합계(원, 없으면 확인한 0원)<input data-testid="converted-actual_capital_transfer_expenses" type="number" min="0" step="1" disabled={busy||readonly}
            value={w.draft.converted_review?.actual_capital_transfer_expenses??''} onChange={e=>changeConvertedReview('actual_capital_transfer_expenses',e.target.value===''?null:Number(e.target.value))}/></label></div>
          <p>원본 필요경비에는 취득 비용 등이 섞일 수 있어 비교 금액으로 자동 복사하지 않습니다. 비교 금액이 환산취득가액+개산공제보다 크면 실액 선택 경로 연결 전까지 계산을 보류합니다.</p>
          {[
            ['actual_unavailable','계약서·전 소유자 확인 등을 검토했으나 실제 취득가액을 확인할 수 없습니다.'],
            ['prior_methods_unavailable','선순위 매매사례가액·감정가액을 검토했으나 적용 가능한 가액이 없습니다.'],
            ['simple_basis_confirmed','최초 주택가격 공시 후 취득했고 보유 중 새 가격이 공시되었습니다. 입력 금액은 각 날짜의 유효한 기준시가이며, 별도 조정·신축·증축·감가상각 사실이 없습니다.'],
            ['facts_confirmed','두 기준시가·양도 지분·비교 비용과 적용 사유를 확인했습니다.']
          ].map(([key,label])=><label key={key} style={{display:'block'}}><input data-testid={'converted-'+key} type="checkbox" disabled={busy||readonly} checked={!!w.draft.converted_review?.[key]} onChange={e=>changeConvertedReview(key,e.target.checked)}/>{label}</label>)}
        </>}
      </section>}
      {!nonhousing&&acquisitionMode==='purchased'&&!converted&&mode==='ordinary'&&<section className="tc-section" aria-label="미등기 양도 검토">
        <h3>취득 등기 상태</h3>
        <label>등기 검토 경로<select data-testid="transfer-unregistered-mode" disabled={busy||readonly||!!w.draft.request.depreciation_recaptured} value={w.draft.request.is_unregistered?'unregistered':'registered'} onChange={e=>changeUnregistered(e.target.value==='unregistered')}>
          <option value="registered">등기 일반 경로</option><option value="unregistered">취득 등기 없이 양도 · 미등기 검토</option>
        </select></label>
        <p>2026년 매매 취득 일반 주택의 미등기를 연결합니다. 중과 후보·환산·상속·증여·감가상각·특례 결합은 별도 검토가 필요합니다.</p>
        {w.draft.request.is_unregistered&&<>
          <p>장기할부계약상 등기 불가능, 법률·법원 결정상 등기 불가능, 법정 농지, 허가 미취득으로 등기 불가능한 법정 비과세 주택, 미완성 도시개발 토지, 공사대금으로 취득한 체비지 등 시행령상 제외 사유를 확인하세요. 예외 해당 또는 미확인이면 확인란을 선택하지 말고 계산을 보류하세요.</p>
          <p>미등기 해당 시 비과세·감면·장기보유공제·기본공제를 적용하지 않습니다. 연간 합산은 미등기 사건끼리 지원하며 등기 사건과의 혼합은 보류합니다.</p>
          <label>등기·취득계약 및 제외 사유 검토 근거<textarea data-testid="unregistered-review_note" maxLength={1000} disabled={busy||readonly} value={w.draft.unregistered_review?.review_note||''} onChange={e=>reviewUnregistered('review_note',e.target.value)}/></label>
          {[
            ['acquisition_not_registered','취득한 재산을 취득 등기 없이 양도하는 사실을 확인했습니다.'],
            ['exceptions_excluded','미등기양도자산에서 제외되는 법정 사유에 해당하지 않음을 확인했습니다.'],
            ['facts_confirmed','관련 사실·등기 자료와 적용 범위를 검토했습니다.']
          ].map(([key,label])=><label key={key} style={{display:'block'}}><input data-testid={'unregistered-'+key} type="checkbox" disabled={busy||readonly} checked={!!w.draft.unregistered_review?.[key]} onChange={e=>reviewUnregistered(key,e.target.checked)}/>{label}</label>)}
        </>}
      </section>}
      {acquisitionMode==='purchased'&&!converted&&!w.draft.request.is_unregistered&&mode==='ordinary'&&<section className="tc-section" aria-label="감가상각 차감 입력">
        <h3>사업소득 필요경비에 산입한 감가상각비</h3>
        <p>취득가액에는 감가상각 차감 전 금액을 입력합니다. 사업소득 필요경비에 산입했거나 산입할 감가상각비 중 이 양도 지분에 귀속되는 누계액을 별도로 입력하면 기존 엔진이 취득가액에서 한 번 차감합니다. 일반 필요경비에 다시 더하지 마세요.</p>
        <label>취득가액에서 차감할 감가상각비(원, 해당 없으면 0)<input data-testid="transfer-depreciation_recaptured" type="number" min="0" step="1" disabled={busy||readonly} value={w.draft.request.depreciation_recaptured||0}
          onChange={e=>{const amount=Number(e.target.value)||0;remember({...w,draft:{...w.draft,facts_confirmed:false,share_facts_confirmed:false,
            nonhousing_review:w.draft.nonhousing_review?{...w.draft.nonhousing_review,facts_confirmed:false}:null,depreciation_review:amount?{...(w.draft.depreciation_review||{review_note:''}),facts_confirmed:false}:null,request:{...w.draft.request,depreciation_recaptured:amount}}});}}/></label>
        {w.draft.request.depreciation_recaptured>0&&<>
          <label>사업소득 신고·장부 출처, 산입기간, 건물·지분 귀속 및 차감 전 취득가액 확인 근거<textarea data-testid="depreciation-review-note" maxLength={1000} disabled={busy||readonly} value={w.draft.depreciation_review?.review_note||''}
            onChange={e=>remember({...w,draft:{...w.draft,facts_confirmed:false,depreciation_review:{review_note:e.target.value,facts_confirmed:false}}})}/></label>
          <label><input data-testid="depreciation-confirm" type="checkbox" disabled={busy||readonly} checked={!!w.draft.depreciation_review?.facts_confirmed}
            onChange={e=>remember({...w,draft:{...w.draft,facts_confirmed:false,depreciation_review:{...w.draft.depreciation_review,facts_confirmed:e.target.checked}}})}/>사업소득에 산입했거나 산입할 누계액과 양도 지분을 확인했고, 취득가액에서 이미 차감하거나 일반 필요경비에 중복 산입하지 않았습니다.</label>
        </>}
        <p>매매 취득 등기 주택·상가의 지원 기간 내 일반 양도에서 확인합니다. 환산·상속·증여·다른 주택 특례로 경로를 전환하면 감가상각 입력과 확인을 비웁니다. 원본 자료와 과거 결과는 유지됩니다.</p>
      </section>}
      {partial&&<section aria-label="일부 지분 금액 확인"><h3>현재 입력의 양도 지분 {source.selection.transfer_share}</h3>
        <p>양도가액·취득가액·필요경비는 양도 지분에 해당하는 금액입니다. 가져올 때 한 번만 안분하며 직접 수정한 금액에는 지분을 다시 곱하지 않습니다. {!nonhousing&&'주택 수·면적은 전체 주택 기준입니다.'}</p>
        {!nonhousing&&<><label>고가주택 판정용 전체 주택가액(원)<input data-testid="transfer-whole_house_value" type="number" min="0" disabled={busy||readonly} value={w.draft.request.whole_house_value??0}
          onChange={e=>change('whole_house_value',Number(e.target.value)||0)}/></label>
        <p>지분 양도가액을 수정하면 전체 주택가액도 같은 거래 기준으로 확인하세요. 증여자 취득가액·증여세액은 이 양도 지분에 해당하는 금액을 별도로 확인해 입력합니다.</p></>}
        <label>지분·금액 안분 확인 근거<textarea data-testid="transfer-share_review_note" maxLength={1000} disabled={busy||readonly} value={w.draft.share_review_note||''}
          onChange={e=>remember({...w,draft:{...w.draft,share_review_note:e.target.value,share_facts_confirmed:false}})}/></label>
        <label><input data-testid="transfer-share_facts_confirmed" type="checkbox" disabled={busy||readonly} checked={!!w.draft.share_facts_confirmed}
          onChange={e=>remember({...w,draft:{...w.draft,share_facts_confirmed:e.target.checked}})}/>현재 지분과 각 금액의 범위를 확인했습니다. 동일 취득분의 지분 양도이며 다른 양도와의 합산·공제 배분이 필요한 경우가 아닙니다.</label>
      </section>}
      {acquisitionMode==='inherited'&&<label>피상속인 취득일<input data-testid="transfer-decedent_acquisition_date" type="date" disabled={busy||readonly}
        value={w.draft.request.decedent_acquisition_date||''} onChange={e=>change('decedent_acquisition_date',e.target.value||null)}/></label>}
      {acquisitionMode==='gifted'&&<>
        <div className="tc-grid">
          <label>증여일(위 취득일과 동일한 날짜)<input data-testid="transfer-gift_date" type="date" disabled={busy||readonly} value={w.draft.request.gift_date||''} onChange={e=>change('gift_date',e.target.value||null)}/></label>
          <label>증여자는 양도자 기준 누구인가<select data-testid="transfer-gift_donor_relationship" disabled={busy||readonly} value={w.draft.gift_donor_relationship||''}
            onChange={e=>remember({...w,draft:{...w.draft,gift_donor_relationship:e.target.value,acquisition_facts_confirmed:false,facts_confirmed:false,
              request:{...w.draft.request,donor_relationship:e.target.value==='기타'?'':e.target.value}}})}>
            <option value="">확인 필요</option>{['배우자','직계존속','직계비속','직계존비속','기타'].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
          <label>이월과세 검토<select data-testid="transfer-gift_deferred_review" disabled={busy||readonly} value={w.draft.gift_deferred_review||''}
            onChange={e=>remember({...w,draft:{...w.draft,gift_deferred_review:e.target.value,acquisition_facts_confirmed:false,facts_confirmed:false,acquisition_review_note:'',
              request:{...w.draft.request,is_deferred:e.target.value==='engine_review',
                ...(e.target.value==='engine_review'&&!w.draft.gift_deferred_review?{}:{donor_acquisition_date:null,donor_acquisition_price:0,donor_gift_tax_paid:0})}}})}>
            <option value="">검토 필요</option><option value="engine_review">배우자·직계존비속 증여 · 기존 엔진으로 검토</option><option value="not_applicable">별도 검토 결과 대상 아님 · 근거 기록</option></select></label>
        </div>
        {w.draft.gift_deferred_review==='engine_review'&&<div className="tc-grid">{[['donor_acquisition_date','증여자 취득일','date'],['donor_acquisition_price','증여자 취득가액(원)','number'],['donor_gift_tax_paid','기존 엔진 검토용 증여세 산출세액(원, 0원도 확인)','number']].map(([key,label,type])=>
          <label key={key}>{label}<input data-testid={'transfer-'+key} type={type} min={type==='number'?0:undefined} disabled={busy||readonly} value={w.draft.request[key]??''}
            onChange={e=>change(key,type==='number'?(e.target.value===''?0:Number(e.target.value)):(e.target.value||null))}/></label>)}</div>}
        <p>검토 선택은 이월과세 적용 확정이 아닙니다. 기존 엔진의 기간·비교 결과를 계산 단계에서 확인하세요. 부담부증여·수용 예외 등 별도 사실이 필요한 경우는 이 경로에서 지원하지 않습니다.</p>
      </>}
      {acquisitionMode!=='purchased'&&<>
        <label style={{display:'block'}}>취득가액·날짜·필요경비 확인 근거 및 이월과세 검토 사유<textarea data-testid="transfer-acquisition_review_note" maxLength={1000} disabled={busy||readonly}
          value={w.draft.acquisition_review_note||''} onChange={e=>remember({...w,draft:{...w.draft,acquisition_review_note:e.target.value,acquisition_facts_confirmed:false}})}/></label>
        <label><input data-testid="transfer-acquisition_facts_confirmed" type="checkbox" disabled={busy||readonly} checked={!!w.draft.acquisition_facts_confirmed}
          onChange={e=>remember({...w,draft:{...w.draft,acquisition_facts_confirmed:e.target.checked}})}/>
          취득 경로·날짜·평가액·필요경비와 증여 검토 자료(0원 포함)를 확인했으며, 부담부증여·수용·복합 취득 등 별도 적용 사항이 없습니다.</label>
      </>}
      {!nonhousing&&<><h3>다른 주택의 취득 사실과 검토 경로</h3>
      {acquisitionMode!=='purchased'&&<p>대상 자체의 상속·증여 취득은 아래 다른 주택 특례와 구별하며, 현재는 동시 검토를 지원하지 않습니다.</p>}
      <label>검토 경로<select data-testid="transfer-special-mode" disabled={busy||readonly||acquisitionMode!=='purchased'||converted} value={mode} onChange={e=>changeMode(e.target.value)}>
        <option value="ordinary">특례 검토 없음 · 일반 양도</option><option value="temporary_2house">다른 주택 매수 · 일시적 2주택 검토</option><option value="inherited">다른 주택 상속 · 일반주택 양도 검토</option>
        <option value="marriage_merge">혼인으로 합가 · 2주택 검토</option><option value="parent_care">직계존속 봉양으로 합가 · 2주택 검토</option>
        {!['ordinary','temporary_2house','inherited','marriage_merge','parent_care'].includes(mode)&&<option value={mode}>아직 연결하지 않은 검토 경로</option>}
      </select></label>
      <p>경로 선택만으로 비과세가 확정되지 않습니다. 실제 주택 수와 사실을 입력하면 기존 엔진이 계산하며, 계산 근거와 확인할 사항은 결과에 표시됩니다.</p>
      {mode==='temporary_2house'&&<div className="tc-grid">
        {[['new_house_acquisition_date','신규주택 취득일'],['new_house_contract_date','신규주택 계약금 지급일']].map(([key,label])=>
          <label key={key}>{label}<input data-testid={'transfer-'+key} type="date" disabled={busy||readonly} value={w.draft.request[key]||''} onChange={e=>change(key,e.target.value||null)}/></label>)}
        {[['temp2_both_regulated','신규주택 취득 당시 두 주택 모두 조정대상지역'],['new_house_before_designation','신규주택의 조정지역 공고 전 취득 또는 계약금 지급'],['temp2_one_year_waived','취득 간격·보유·거주 요건 면제 사유 검토']].map(([key,label])=>
          <label key={key}>{label}<select data-testid={'transfer-'+key} disabled={busy||readonly} value={w.draft.request[key]==null?'':String(w.draft.request[key])} onChange={e=>change(key,e.target.value===''?null:e.target.value==='true')}>
            <option value="">확인 필요</option><option value="true">예 · 사실 확인</option><option value="false">아니오</option></select></label>)}
      </div>}
      {mode==='inherited'&&<><p>상속받은 집을 파는 경로가 아닙니다. 현재 양도할 일반주택 외에 상속주택 1채를 보유한 경우입니다.</p>
        <label>다른 주택의 상속개시일<input data-testid="transfer-inheritance_start_date" type="date" disabled={busy||readonly} value={w.draft.request.inheritance_start_date||''} onChange={e=>change('inheritance_start_date',e.target.value||null)}/></label></>}
      {['marriage_merge','parent_care'].includes(mode)&&<>
        <div className="tc-grid">
          <label>{mode==='marriage_merge'?'혼인일':'봉양 합가일'}<input data-testid={'transfer-'+(mode==='marriage_merge'?'marriage_date':'merge_date')} type="date" disabled={busy||readonly}
            value={w.draft.request[mode==='marriage_merge'?'marriage_date':'merge_date']||''} onChange={e=>change(mode==='marriage_merge'?'marriage_date':'merge_date',e.target.value||null)}/></label>
          {mode==='parent_care'&&<label>합가 당시 봉양 직계존속의 만 나이<input data-testid="transfer-parent_age" type="number" min="1" step="1" disabled={busy||readonly}
            value={w.draft.request.parent_age||''} onChange={e=>change('parent_age',e.target.value===''?0:Number(e.target.value))}/></label>}
          <label>{mode==='marriage_merge'?'배우자':'봉양 직계존속'} 측 다른 주택 취득일<input data-testid="transfer-merge_other_house_acquisition_date" type="date" disabled={busy||readonly}
            value={w.draft.merge_other_house_acquisition_date||''} onChange={e=>remember({...w,draft:{...w.draft,merge_other_house_acquisition_date:e.target.value||null,
              facts_confirmed:false,special_facts_confirmed:false,merge_each_one_house_confirmed:false}})}/></label>
        </div>
        <p>합가 직전 각각 1주택을 보유하여 합가로 2주택이 되었고, 이후 주택 변동이 없는 경우를 연결합니다. 다른 주택 취득일은 이 사실을 확인하는 저장 자료입니다.</p>
        <label><input data-testid="transfer-merge_each_one_house_confirmed" type="checkbox" disabled={busy||readonly} checked={!!w.draft.merge_each_one_house_confirmed}
          onChange={e=>remember({...w,draft:{...w.draft,merge_each_one_house_confirmed:e.target.checked,special_facts_confirmed:false}})}/>
          {mode==='marriage_merge'?'혼인':'직계존속 봉양을 위한 합가'} 전 각각 1주택을 보유했고, 합가로 2주택이 되었으며 이후 주택 변동이 없음을 확인했습니다.</label>
      </>}
      {mode!=='ordinary'&&<label style={{display:'block',marginTop:12}}>특례 사실 확인 근거·검토 메모(요건 면제 선택 시 필수)
        <textarea data-testid="transfer-special_review_note" disabled={busy||readonly} maxLength={1000} value={w.draft.special_review_note||''}
          onChange={e=>remember({...w,draft:{...w.draft,special_review_note:e.target.value,special_facts_confirmed:false}})}/></label>}
      </>}
      {nonhousing&&<section aria-label="일반 비주택 검토"><h3>일반 비주택 · {w.draft.request.property_type}</h3>
        <p>실제 주거용·겸용 건물, 비사업용 토지, 분할 취득, 미확인 지분 안분, 감면·수용·환산은 이 경로에서 지원하지 않습니다. 토지와 건물을 함께 거래했다면 먼저 가액·경비를 구분한 단일 자산별로 등록하세요. 토지의 사용 이력과 건물 부수토지의 비사업용 여부도 검토해야 합니다.</p>
        <p>주택 수·주택 조정지역 값은 비주택 계산에 적용하지 않습니다. 원본은 전체 재산 기준이며 아래 사건 금액은 양도 지분에 해당합니다. 감가상각 차감 전 취득가액을 확인하세요.</p>
        <label>용도·등기·토지 사용기간·실가 및 감가상각 검토 근거<textarea data-testid="nonhousing-review_note" maxLength={1000} disabled={busy||readonly} value={w.draft.nonhousing_review?.review_note||''} onChange={e=>reviewNonhousing('review_note',e.target.value)}/></label>
        {[
          ['resident_domestic','거주자의 국내 자산 양도입니다.'],['registered_actual','등기 자산의 단일 매매 취득분이며 양도·취득 실지거래가액을 확인했습니다.'],
          ['nonresidential_only','실제 주거용·겸용·용도전환 자산이 아니며, 토지·건물 일괄가액은 필요한 구분을 마쳤습니다.'],
          ['business_land_reviewed','토지 사용기간과 부수토지를 검토했고 비사업용 토지에 해당하지 않습니다. 건물만 양도하면 토지가 포함되지 않음을 확인했습니다.'],
          ['depreciation_reviewed','사업소득에 산입했거나 산입할 감가상각 누계액을 검토했습니다. 0원도 확인한 값이며 토지는 차감하지 않습니다.'],
          ['local_standard_rate','해당 관할의 지방소득세 표준세율 적용을 확인했습니다. 조례 가감세율·지방세 별도 감면이 적용되면 이 경로를 사용하지 않습니다.'],
          ['facts_confirmed','현재 입력과 지원 범위 및 위 근거를 확인했습니다.']
        ].map(([key,label])=><label key={key} style={{display:'block'}}><input data-testid={'nonhousing-'+key} type="checkbox" disabled={busy||readonly} checked={!!w.draft.nonhousing_review?.[key]} onChange={e=>reviewNonhousing(key,e.target.checked)}/>{label}</label>)}
      </section>}
      {[['facts_confirmed',nonhousing?'금액·날짜·자산 용도와 비주택 검토 사실을 확인했습니다.':'금액·날짜·세대 주택 수·조정지역·거주 사실을 확인했습니다.'],
        mode==='ordinary'?['ordinary_sale_confirmed','선택한 취득 경로와 지분의 양도이며, 입력한 증여·미등기 검토 외 별도 특례·감면·이월과세·입주권/분양권 적용 사항이 없습니다.']:
        ['special_facts_confirmed','선택한 특례의 사실과 확인 근거를 검토했으며, 이 경로 외 다른 특례·감면·수용·이월과세·입주권/분양권·미등기 적용 사항이 없습니다.']].map(([key,label])=>
        <label key={key} style={{display:'block',marginTop:12}}><input data-testid={'transfer-'+key} type="checkbox" disabled={busy||readonly} checked={!!w.draft[key]} onChange={e=>remember({...w,draft:{...w.draft,[key]:e.target.checked}})}/>{label}</label>)}
      </section>}
      <section className="tc-section"><h2>3. 저장·계산·재열기</h2>
        {(w.meta.validation.errors||[]).map((message,i)=><p key={i}>{message}</p>)}
        <button disabled={busy||readonly} onClick={()=>act(save)}>입력 저장</button>
        <button disabled={busy||readonly||pendingSource} onClick={()=>act(async()=>{const saved=await save();if(!saved.validation.can_run)throw new Error('저장본의 보완 항목을 확인해 주세요.');
          await mutation(base+'/runs','POST',{revision_id:saved.revision_id,expected_input_hash:saved.input_hash});await load(saved.case_id);})}>저장하고 계산</button>
        <label>다시 열 입력 버전(비우면 최신)<input data-testid="transfer-reopen-revision" type="number" min="1" disabled={busy} value={revision} onChange={e=>setRevision(e.target.value)}/></label>
        <button disabled={busy} onClick={()=>act(async()=>{if(transferDirty(w)&&!window.confirm('저장하지 않은 입력을 버리고 다시 열까요?'))return;await load(w.meta.case_id,revision);setPreview(null);})}>저장본 다시 열기</button>
        {w.run&&<div aria-label="저장된 양도 계산 결과"><h3>저장된 계산 결과 · 버전 {w.meta.revision}</h3>
          <p>이 결과의 양도 지분 {source?.selection.transfer_share} · 양도가액 {w.run.engine_request.transfer_price.toLocaleString()}원{!nonhousing&&<> · 전체 주택 판정가액 {(w.run.engine_request.whole_house_value||w.run.engine_request.transfer_price).toLocaleString()}원</>}</p>
          {transferDirty(w)&&<p>현재 편집 입력과 다른 저장본의 결과입니다. 변경 내용을 저장하고 계산하세요.</p>}
          <p>양도소득세(국세) {w.run.response_snapshot.calc.세액.toLocaleString()}원 · 지방소득세 {w.run.response_snapshot.calc.지방소득세.toLocaleString()}원 · 농어촌특별세 {w.run.response_snapshot.calc.농어촌특별세.toLocaleString()}원</p>
          <p>총세부담 {w.run.response_snapshot.calc.총세부담.toLocaleString()}원 · 엔진 {w.run.response_snapshot.version.engine}</p>
          <p>비과세 판정: {w.run.response_snapshot.calc.비과세여부 ? w.run.response_snapshot.calc.비과세사유 : '미적용'}{!nonhousing&&' · 고가주택은 비과세 판정이어도 과세분이 있을 수 있습니다.'}</p>
          {(w.run.response_snapshot.calc.경고사항||[]).map((x,i)=><p key={i}>{String(x)}</p>)}
          <details><summary>계산 단계·저장 입력 보기</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify({input:w.run.engine_request,steps:w.run.response_snapshot.calc.단계별계산},null,2)}</pre></details>
        </div>}
      </section>
    </>}
  </div>;
}
window.JTTransferCases=JTTransferCases;

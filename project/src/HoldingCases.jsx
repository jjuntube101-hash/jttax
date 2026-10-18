/* Saved holding cases use the same authenticated client/case workbench. */
let jtHoldingSession = null;
function holdingDirty(w = jtHoldingSession) {
  return !!w && JSON.stringify({ label: w.label, draft: w.draft }) !== w.baseline;
}
function JTHoldingCases({ clientId, caseId, onExit }) {
  const [w, setW] = React.useState(jtHoldingSession);
  const [opened,setOpened] = React.useState(false);
  const ref = React.useRef(w), lock = React.useRef(false), alive = React.useRef(true);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const [revision,setRevision] = React.useState('');
  const keys = React.useRef({});
  const remember = value => { ref.current = value; jtHoldingSession = value; if (alive.current) setW(value); };
  const api = async (path, options = {}) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(),45000);
    try {
      const r = await fetch((window.JT_ENGINE_BASE || 'http://127.0.0.1:8000').replace(/\/$/,'') + path,
        {...options,signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+jtGiftSession.token,...options.headers}});
      const data = await r.json().catch(()=>({}));
      if (!r.ok) {
        if (r.status === 401) jtGiftSession.token = '';
        const messages={SOURCE_TAX_SCOPE_UNSUPPORTED:'이 재산세 저장 결과는 현재 원본 연결 범위 밖입니다. 두 연도 공시가격·과세 이력·단독 소유와 원본 연결을 확인하세요.',SOURCE_PRIOR_VALUE_CONFLICT:'등록된 전년 공시가격이 있습니다. 부존재 확인과 충돌하므로 원본을 검토하고 전년 자료를 선택하세요.',SOURCE_CHANGED:'미리보기 이후 원본이 바뀌었습니다. 다시 확인해 주세요.',SOURCE_PUBLIC_VALUE_PERIOD_MISMATCH:'올해·전년의 공시가격과 기준일을 구분해 주세요.',SOURCE_SOLE_OWNER_REQUIRED:'선택한 소유 이력은 단독 소유가 아닙니다.',REVISION_CONFLICT:'다른 저장본이 있습니다. 다시 열어 확인해 주세요.',SNAPSHOT_MIGRATION_REQUIRED:'지원하지 않는 저장 버전입니다.',PARTY_OUTSIDE_CLIENT:'선택한 당사자가 이 고객의 자료가 아닙니다.',INVALID_CASE_INPUT:'금액과 중복 입력을 확인해 주세요.',DRAFT_NOT_RUNNABLE:'저장본의 보완 항목을 확인해 주세요.',ENGINE_CALCULATION_ERROR:'계산 입력을 추가 확인해야 합니다. 결과는 저장되지 않았습니다.'};
        throw new Error(r.status===401?'로그인이 필요합니다. 작업대로 돌아가 같은 계정으로 로그인하세요.':
          messages[data.detail?.code] || (r.status===422?'입력 형식과 날짜·금액을 확인해 주세요.':'자료를 처리하지 못했습니다. 저장본을 확인하고 다시 시도해 주세요.'));
      }
      return data;
    } finally { clearTimeout(timer); }
  };
  const mutation = (path, method, body, etag) => {
    const signature = JSON.stringify({path,method,body,etag});
    const memory = path==='/v1/holding-cases' ? keys.current : ref.current?.keys || keys.current;
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
    const saved = await api('/v1/holding-cases/'+id+(number?'?revision='+number:''));
    if(saved.client_id!==clientId)throw new Error('선택한 고객의 사건이 아닙니다.');
    const run = saved.last_successful_run_id?await api('/v1/holding-cases/'+id+'/runs/'+saved.last_successful_run_id):null;
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
        const made=await mutation('/v1/holding-cases','POST',{client_id:clientId,label:'새 보유세 사건',draft:{}});
        await load(made.case_id);
      }
    });
    const protect=e=>{if(lock.current||holdingDirty(ref.current)){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',protect);
    return()=>{alive.current=false;window.removeEventListener('beforeunload',protect);};
  },[]);
  const current = opened && w?.meta?.client_id===clientId && (caseId==='resume'||!caseId||w.meta.case_id===caseId);
  const readonly = !current || w.meta.read_only || w.meta.revision!==w.meta.current_revision;
  const base = current?'/v1/holding-cases/'+w.meta.case_id:'';
  if(current&&w.meta.read_only)return <div><button onClick={onExit}>작업대로</button><p>지원하지 않는 입력 버전입니다. 읽기 전용 원본을 보존합니다.</p><pre>{JSON.stringify(w.meta.case_input,null,2)}</pre></div>;
  const capEmpty={one_house:'unknown',pre2024_taxed:'unknown',prior_value_state:'unknown',prior_standard_value:null,prior_value_source:'',transition_source:'',prior_urban_tax:null,prior_urban_source:''};
  const change = (key,value,confirmation=false) => {
    const extra=key==='prior_value_state'?{prior_standard_value:null,prior_value_source:''}:
      key==='urban_area'?{prior_urban_tax:null,prior_urban_source:''}:
      key==='pre2024_taxed'||key==='one_house'?{prior_equivalent_tax:null,prior_source:'',prior_urban_tax:null,prior_urban_source:'',transition_source:''}:{};
    remember({...ref.current,draft:{...ref.current.draft,...(confirmation?{}:{facts_confirmed:false,ordinary_scope_confirmed:false}),...extra,[key]:value}});
  };
  const save=async()=>{if(!holdingDirty(ref.current))return ref.current.meta;const saved=await mutation(base,'PUT',{label:ref.current.label,draft:ref.current.draft},ref.current.meta.etag);await load(saved.case_id);return ref.current.meta;};
  const d=current?w.draft:null;
  const switchPath=(key,value)=>remember({...ref.current,draft:{...capEmpty,schema_version:'holding-case/1',tax_year:d.tax_year,tax_kind:d.tax_kind,category:d.category,[key]:value,...(key==='tax_kind'&&value==='comprehensive'?{category:'house'}:{}),description:'',standard_value:null,prior_equivalent_tax:null,urban_area:'unknown',value_source:'',prior_source:'',review_note:'',facts_confirmed:false,ordinary_scope_confirmed:false}});
  return <div className="jt-container cw-workspace">
    <style>{`.ic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.ic-grid label{display:flex;flex-direction:column;gap:6px}.ic-grid input,.ic-grid select,.ic-grid textarea{font:inherit;padding:10px;min-height:44px}.ic-section{border:1px solid #ccd8cd;padding:20px;margin:20px 0;border-radius:10px}.ic-section button{margin:8px;min-height:44px}.ic-section p{line-height:1.6}`}</style>
    <button disabled={busy} onClick={onExit}>← 고객·사건 작업대</button><h1>보유세 사건 입력·저장</h1>
    <p>2026년 개인 단독 소유 일반 주택·건축물 한 과세단위를 입력합니다. 전년 시가표준액, 2024년 이전 주택 과세 이력, 본세·도시지역분 상당액을 구분합니다. 토지·지역자원시설세·공유·감면·조례 가감 및 본세 4천원 미만의 소액 고지는 별도 검토 대상입니다.</p>
    {error&&<p role="alert">{error}</p>}
    {!current&&!busy&&<button onClick={()=>act(async()=>{if(caseId&&caseId!=='resume')await load(caseId);else{const made=await mutation('/v1/holding-cases','POST',{client_id:clientId,label:'새 보유세 사건',draft:{}});await load(made.case_id);}})}>사건 열기 다시 시도</button>}
    {current&&<>
      <p>저장 버전 {w.meta.revision} / 최신 {w.meta.current_revision}{readonly?' · 읽기 전용 저장본':''}{holdingDirty(w)?' · 저장하지 않은 변경 있음':''}</p>
      {!readonly&&d.tax_year===2026&&d.category==='house'&&<JTHoldingSources comprehensive={d.tax_kind==='comprehensive'} key={base+':'+w.meta.revision+':'+d.tax_kind} api={api} clientId={clientId} base={base} busy={busy} act={act} onImport={async(selection,preview)=>{if(!window.confirm('현재 입력을 선택한 주택의 공시가격 자료로 교체하고 새 버전을 저장합니다. 전년 세액과 특례는 다시 확인해야 합니다.'))return;const saved=await mutation(base+'/source-imports','POST',{label:ref.current.label,draft:ref.current.draft,selection,expected_source_hash:preview.source_hash},ref.current.meta.etag);await load(saved.case_id);}}/>}
      {w.meta.case_input?.master_snapshot&&<p data-testid="holding-source-status">채택 원본: {w.meta.case_input.master_snapshot.property.address} · {w.meta.case_input.source_status==='matched'?'채택한 공시가격과 일치':'채택 후 직접 수정한 입력'} · {w.meta.case_input.master_snapshot.schema_version==='comprehensive-master-source/1'?'종부세용 올해 공시가격·사실 원본':w.meta.case_input.master_snapshot.prior_value_absence?'전년 시가표준액 부존재 확인: '+w.meta.case_input.master_snapshot.prior_value_absence.reason:'전년 공시가격 원본 선택'} · 원본 추가 변경은 이 저장본에 자동 반영되지 않습니다.</p>}
      {!readonly&&<JTHoldingTaxSources key={base+':tax:'+w.meta.revision} api={api} base={base} busy={busy} act={act} onImport={async(selection,preview)=>{if(!window.confirm('선택한 재산세 결과와 원본으로 종부세 새 버전을 저장합니다. 두 연도 1주택 요건을 다시 확인하세요.'))return;const saved=await mutation(base+'/tax-source-imports','POST',{label:ref.current.label,selection,expected_source_hash:preview.source_hash},ref.current.meta.etag);await load(saved.case_id);}}/>}
      {w.meta.case_input?.master_snapshot?.worksheet&&<section aria-label="전년 상당세액 원본 산정표" data-testid="holding-prior-worksheet"><h3>저장된 원본 산정표</h3><p>재산세 결과 ID {w.meta.case_input.master_snapshot.property_result.run_id} · 원본 해시 {w.meta.case_input.master_snapshot.source_hash}</p><table><tbody>{[['current_uncapped_base','올해 상한 전 과표'],['current_property_tax_base','올해 상한 적용 과표'],['current_property_tax','올해 재산세 본세'],['prior_public_value','2025년 공시가격'],['prior_property_base','전년 상한 제외 과표'],['prior_property_tax','전년 재산세 상당액'],['prior_gross_tax','전년 종부세 산출세액'],['prior_property_credit','전년 재산세 공제'],['prior_age_holding_credit','전년 연령·보유기간 공제'],['prior_comprehensive_tax','전년 종부세 상당액']].map(([key,label])=><tr key={key}><th>{label}</th><td>{Number(w.meta.case_input.master_snapshot.worksheet[key]).toLocaleString('ko-KR')}원</td></tr>)}</tbody></table><p>전년 상당액은 상한·부가세목을 제외한 법정 산정액입니다. 원본 변경 시 기존 결과는 유지되며 새 재산세 결과를 선택해야 변경분이 반영됩니다.</p></section>}
      <fieldset disabled={busy||readonly}><legend>과세연도·세목·과세단위</legend><div className="ic-grid">
        <label>사건명<input data-testid="holding-label" value={w.label} onChange={e=>remember({...w,label:e.target.value})}/></label>
        <label>과세연도<select data-testid="holding-tax_year" value={d.tax_year} onChange={e=>switchPath('tax_year',Number(e.target.value))}>{[2025,2026,2027].map(y=><option key={y} value={y}>{y}{y===2026?'':' (초안만)'}</option>)}</select></label>
        <label>세목<select data-testid="holding-tax_kind" value={d.tax_kind} onChange={e=>switchPath('tax_kind',e.target.value)}><option value="property">재산세</option><option value="comprehensive">종합부동산세 (일반 단독 1주택)</option></select></label>
        <label>과세대상<select data-testid="holding-category" value={d.category} onChange={e=>switchPath('category',e.target.value)}><option value="building" disabled={d.tax_kind==='comprehensive'}>일반 건축물</option><option value="house">주택</option><option value="land" disabled={d.tax_kind==='comprehensive'}>토지 (초안만)</option></select></label>
        {d.tax_kind==='property'&&<><label>도시지역분 과세<select data-testid="holding-urban_area" value={d.urban_area} onChange={e=>change('urban_area',e.target.value)}><option value="unknown">확인 필요</option><option value="no">아니오</option><option value="yes">예 (표준세율 0.14%)</option></select></label>
        {[['description','과세단위 주소·식별 내용'],['standard_value','올해 시가표준액 (원)'],['value_source','시가표준액 근거'],['prior_equivalent_tax','직전 연도 재산세 본세 상당액 (원)'],['prior_source','전년 본세 상당액 산정 근거']].map(([key,title])=><label key={key}>{title}<input data-testid={'holding-'+key} value={d[key]??''} onChange={e=>change(key,e.target.value)}/></label>)}
        {d.category==='house'&&<>
          <label>1세대 1주택 특례 요건<select data-testid="holding-one_house" value={d.one_house??'unknown'} onChange={e=>change('one_house',e.target.value)}><option value="unknown">확인 필요</option><option value="yes">해당</option><option value="no">비해당</option></select></label>
          <label>2024년 이전 이 주택에 재산세 과세 이력<select data-testid="holding-pre2024_taxed" value={d.pre2024_taxed??'unknown'} onChange={e=>change('pre2024_taxed',e.target.value)}><option value="unknown">확인 필요</option><option value="yes">있음 (2028년까지 경과조치)</option><option value="no">없음</option></select></label>
          <label>전년 시가표준액 존재<select data-testid="holding-prior_value_state" value={d.prior_value_state??'unknown'} onChange={e=>change('prior_value_state',e.target.value)}><option value="unknown">확인 필요</option><option value="exists">있음</option><option value="absent">없음 확인 (올해 금액 대체)</option></select></label>
          {d.prior_value_state==='exists'&&<label>전년 시가표준액 (원)<input data-testid="holding-prior_standard_value" value={d.prior_standard_value??''} onChange={e=>change('prior_standard_value',e.target.value)}/></label>}
          {[['prior_value_source','전년 시가표준액 또는 부존재 확인 근거'],['transition_source','2024년 이전 과세 이력 확인 근거']].map(([k,label])=><label key={k}>{label}<input data-testid={'holding-'+k} value={d[k]??''} onChange={e=>change(k,e.target.value)}/></label>)}
        </>}
        {d.urban_area==='yes'&&(d.category==='building'||d.pre2024_taxed==='yes')&&[['prior_urban_tax','전년 도시지역분 상당액 (원)'],['prior_urban_source','전년 도시지역분 상당액 근거']].map(([k,label])=><label key={k}>{label}<input data-testid={'holding-'+k} value={d[k]??''} onChange={e=>change(k,e.target.value)}/></label>)}
      </>}
      {d.tax_kind==='comprehensive'&&<JTComprehensiveFacts draft={d} change={change} derived={w.meta.case_input?.derived_facts} worksheet={w.meta.case_input?.master_snapshot?.worksheet}/>}
      </div><p>기준일 {d.tax_year}-06-01 · 연도·세목·과세대상을 바꾸면 금액·근거·확인이 초기화됩니다.</p>
      {d.tax_kind==='property'&&<p>전년 금액은 교육세·도시지역분을 합친 납부총액이 아닙니다. 법령상 산정한 본세 상당액을 입력하세요. 상한 대상의 전년 상당액 0원은 별도 검토 대상으로 차단합니다. 경과조치 비대상 주택은 전년 본세 상당액/근거를 비우세요. 전년 시가표준액 미입력과 부존재는 다릅니다.</p>}
      <label>소유·과세단위·상당액 검토 근거<textarea data-testid="holding-review_note" value={d.review_note} onChange={e=>change('review_note',e.target.value)}/></label>
      {(d.tax_kind==='comprehensive'?[['ordinary_scope_confirmed','개인 거주자 단독 소유 일반 매매 1주택으로 공유·합산배제·감면·신탁·주택수 특례·조례 가감이 없습니다'],['facts_confirmed','6월 1일 원본·주택수·검토 경로와 근거를 확인했습니다 (공제 초과 시 본세·과표·전년 상당액 포함)']]:[['ordinary_scope_confirmed','개인 단독 소유 일반 주택·건축물·표준세율(도시지역분 포함)이며 공장/고급오락장/골프장·감면·조례 세율 변경이 없고, 지역자원시설세는 별도 검토합니다'],['facts_confirmed','6월 1일 소유·과세단위·시가표준액·전년 본세 상당액과 근거를 확인했습니다']]).map(([k,title])=><p key={k}><label><input type="checkbox" data-testid={'holding-'+k} checked={d[k]} onChange={e=>change(k,e.target.checked,true)}/>{title}</label></p>)}
      </fieldset>
      {(w.meta.validation.errors||[]).length>0&&<section aria-label="계산 전 확인"><p>마지막 저장 기준 확인 항목</p><ul>{w.meta.validation.errors.map((e,i)=><li key={i}>{e}</li>)}</ul></section>}
      <button disabled={busy||readonly} onClick={()=>act(save)}>입력 저장</button>
      <button disabled={busy||readonly} onClick={()=>act(async()=>{const saved=await save();if(!saved.validation.can_run)throw new Error('저장본의 보완 항목을 확인해 주세요.');await mutation(base+'/runs','POST',{revision_id:saved.revision_id,expected_input_hash:saved.input_hash});await load(saved.case_id);})}>저장하고 계산</button>
      <label>다시 열 입력 버전<input data-testid="holding-reopen-revision" value={revision} onChange={e=>setRevision(e.target.value)}/></label><button disabled={busy} onClick={()=>{if(!holdingDirty(w)||window.confirm('저장하지 않은 입력을 버리고 저장본을 여시겠습니까?'))act(()=>load(w.meta.case_id,revision));}}>저장본 다시 열기</button>
      {w.run&&<section className="ic-section" aria-label="저장된 보유세 계산 결과"><p>{w.run.response_snapshot.result_scope}</p><h2>저장된 계산 결과{holdingDirty(w)?' · 수정 전 입력 기준':''}</h2><p>시가표준액 {Number(w.run.engine_request.standard_value??w.run.engine_request.engine?.housing_values[0]).toLocaleString('ko-KR')}원</p><output data-testid="holding-saved-tax">{Number(w.run.response_snapshot.calc['세액']).toLocaleString('ko-KR')}원</output>{w.run.response_snapshot.calc['세목']==='종합부동산세'?<p>종부세 {w.run.response_snapshot.calc['종부세합계'].toLocaleString('ko-KR')}원 · 농특세 {w.run.response_snapshot.calc['농어촌특별세'].toLocaleString('ko-KR')}원{w.run.response_snapshot.calc['과표0원근거']?' · 기본공제 이하로 과표0원 확인':' · 상한 차감 '+w.run.response_snapshot.calc['세부담상한']['차감액'].toLocaleString('ko-KR')+'원'}</p>:<><p>상한전 과세표준 {Number(w.run.response_snapshot.calc['상한전과세표준']??w.run.response_snapshot.calc['과세표준']).toLocaleString('ko-KR')}원 · 적용 과세표준 {Number(w.run.response_snapshot.calc['과세표준']).toLocaleString('ko-KR')}원</p><p>주택 경과조치 {w.run.response_snapshot.calc['주택경과조치적용']?'해당':'비해당 또는 과거 저장본'} · 본세 상한 {w.run.response_snapshot.calc['세부담상한적용']?'적용':'미적용'} · 도시지역분 상한 {w.run.response_snapshot.calc['도시지역분상한적용']?'적용':'미적용'}</p></>}<p>결과 ID {w.run.run_id} · 입력 ID {w.run.revision_id}</p><details><summary>저장된 계산 단계</summary><ul>{w.run.response_snapshot.calc['단계별계산'].map((r,i)=><li key={i}>{r['항목']} · {r['금액']} · {r['비고']}</li>)}</ul></details><ul aria-label="엔진 경고">{(w.run.response_snapshot.calc['경고사항']||[]).map((v,i)=><li key={i}>{typeof v==='string'?v:JSON.stringify(v)}</li>)}</ul></section>}
    </>}
  </div>;
}
window.JTHoldingCases=JTHoldingCases;

function JTHoldingSources({api,clientId,base,busy,act,onImport,comprehensive=false}) {
  const [catalog,setCatalog]=React.useState(null),[options,setOptions]=React.useState(null);
  const [pid,setPid]=React.useState(''),[period,setPeriod]=React.useState(''),[current,setCurrent]=React.useState(''),[prior,setPrior]=React.useState('');
  const [facts,setFacts]=React.useState(null),[reason,setReason]=React.useState(''),[confirmed,setConfirmed]=React.useState(false),[preview,setPreview]=React.useState(null);
  const [priorState,setPriorState]=React.useState('exists'),[absenceReason,setAbsenceReason]=React.useState('');
  const selected=options?.ownership.items.find(x=>x.version===period),owner=selected?.ownerships[0];
  const change=fn=>{setPreview(null);setConfirmed(false);fn();};
  const selection=()=>({property_id:pid,ownership_id:owner?.id,ownership_version:period,ownership_history_confirmed:confirmed,
    fact_selection:facts,current_valuation_id:current,...(comprehensive?{purpose:'comprehensive'}:{prior_valuation_id:priorState==='absent'?null:prior,
    ...(priorState==='absent'?{prior_value_state:'absent',prior_absence_reason:absenceReason}:{})}),tax_year:2026,values_confirmed:confirmed,reason});
  return <section className="ic-section" aria-label="주택 공시가격 원본 채택"><h2>재산·공시가격 가져오기</h2>
    {comprehensive?<p>2026년 6월 1일 단독 소유 주택의 올해 공시가격·취득일·소유자 생년월일을 채택합니다. 1주택 요건·전년 법정 상당액은 별도로 검토합니다.</p>:<p>2026년 6월 1일 단독 소유 주택의 올해·전년 공시가격을 선택하거나 전년 시가표준액 부존재를 근거와 함께 확인합니다. 조회 결과가 없다는 이유만으로 부존재를 선택하면 안 됩니다. 시가·감정가를 공시가격으로 대체하지 않습니다. 선택 후 전년 세액·특례·확인은 다시 입력합니다.</p>}
    <button disabled={busy} data-testid="holding-source-list" onClick={()=>act(async()=>{setCatalog(await api(base+'/sources'));setPreview(null);})}>주택 원본 조회</button>
    {catalog&&<fieldset disabled={busy}><legend>원본 선택</legend>
      <label>주택<select data-testid="holding-source-property" value={pid} onChange={e=>{const id=e.target.value;change(()=>{setPid(id);setOptions(null);setPeriod('');setCurrent('');setPrior('');setPriorState('exists');setAbsenceReason('');setFacts(null);});if(id)act(async()=>setOptions(await api(base+'/source-options?property_id='+id)));}}><option value="">선택</option>{catalog.properties.map(x=><option key={x.id} value={x.id}>{x.address}</option>)}</select></label>
      {options&&<>
        <label>6월 1일 소유 이력<select data-testid="holding-source-ownership" value={period} onChange={e=>change(()=>{setPeriod(e.target.value);setFacts(null);})}><option value="">선택</option>{options.ownership.items.filter(x=>x.eligible&&x.ownerships.length===1&&Number(x.ownerships[0].share_ratio)===1).map(x=><option key={x.version} value={x.version}>{x.ownerships[0].name} · {x.valid_from}~{x.valid_until||'현재'}{x.boundary_review_required?' · 변동 당일 선후 확인 필요':''}</option>)}</select></label>
        {!comprehensive&&<><label>전년 공시가격 확인<select data-testid="holding-source-prior-state" value={priorState} onChange={e=>change(()=>{setPriorState(e.target.value);setPrior('');setAbsenceReason('');})}><option value="exists">전년 자료 선택</option><option value="absent">전년 시가표준액 부존재 확인</option></select></label>
        {priorState==='absent'&&<label>부존재를 확인한 문서·조회일·근거<input data-testid="holding-source-absence-reason" maxLength={1000} value={absenceReason} onChange={e=>change(()=>setAbsenceReason(e.target.value))}/></label>}
        </>}
        {[['current','올해',current,setCurrent,2026],['prior','전년',prior,setPrior,2025]].filter(([key])=>key!=='prior'||(!comprehensive&&priorState==='exists')).map(([key,label,value,setValue,year])=><label key={key}>{label} 공시가격<select data-testid={'holding-source-'+key} value={value} onChange={e=>change(()=>setValue(e.target.value))}><option value="">선택</option>{options.valuations.filter(x=>x.as_of_date.startsWith(String(year))).map(x=><option key={x.id} value={x.id}>{x.as_of_date} · {Number(x.amount).toLocaleString('ko-KR')}원 · {x.source}</option>)}</select></label>)}
        <JTFactVersionPicker key={current+':'+prior} api={api} clientId={clientId} propertyId={pid} ownerId={owner?.person_id} eventDate="2026-06-01" valuationId={current} selection={facts} onChange={v=>{setFacts(v);setPreview(null);setConfirmed(false);}} disabled={busy}/>
        <label>공시가격·과세단위 확인 근거<input data-testid="holding-source-reason" value={reason} maxLength={1000} onChange={e=>change(()=>setReason(e.target.value))}/></label>
        <label><input type="checkbox" data-testid="holding-source-confirm" checked={confirmed} onChange={e=>{setConfirmed(e.target.checked);setPreview(null);}}/>선택한 소유 이력의 적용일·변동 당일 선후, 전체 주택 공시가격과 각각의 연도·정정 여부를 확인했습니다.</label>
        <button disabled={busy||!owner||!current||(!comprehensive&&(priorState==='exists'?!prior:!absenceReason.trim()))||!facts?.confirmed||!confirmed||!reason.trim()} data-testid="holding-source-preview" onClick={()=>act(async()=>setPreview(await api(base+'/source-preview',{method:'POST',body:JSON.stringify(selection())})))}>채택 미리보기</button>
        {preview&&<><p data-testid="holding-source-values">올해 {Number(preview.valuations.current.amount).toLocaleString('ko-KR')}원{!comprehensive&&<> · 전년 {preview.prior_value_absence?'부존재 확인: '+preview.prior_value_absence.reason:Number(preview.valuations.prior.amount).toLocaleString('ko-KR')+'원'}</>}</p><button disabled={busy} data-testid="holding-source-import" onClick={()=>act(()=>onImport(selection(),preview))}>원본 채택·새 버전 저장</button></>}
      </>}
    </fieldset>}
  </section>;
}

function JTComprehensiveFacts({draft:d,change,derived,worksheet}) {
  const r=d.comprehensive_review||{},zero=!!r.zero_base_reviewed;
  const edit=(key,value)=>change('comprehensive_review',{...r,[key]:value});
  return <>
    <label><input type="checkbox" data-testid="comprehensive-zero_base_reviewed" disabled={!!worksheet} checked={zero} onChange={e=>change('comprehensive_review',e.target.checked?{zero_base_reviewed:true}:{})}/>일반 1세대1주택 공시가격이 기본공제 12억원 이하임을 확인합니다 (전환 시 검토 입력 초기화)</label>
    {worksheet?<p>재산세 저장 결과의 상한 적용 과표·본세와 2025년 법정 상당액을 연결했습니다. 두 연도 공시가격 12억원 초과~1,000억원, 1천원 단위, 2023년 6월 이전 일반 매매 계속 보유 범위입니다.</p>:zero?<p data-testid="comprehensive-zero-guidance">6월1일 원본·거주자·세대 전체 1주택·공제 요건 확인 후 과표0원을 계산합니다. 올해/전년 재산세·종부세 상당액과 상한 검토는 입력하지 않습니다. 재산세 고지액까지 0원이라는 뜻은 아닙니다.</p>:<p>공시가격 12억원 초과 1,000억원 이하, 재산세 1주택 비율 45%·과표상한 미감액 범위입니다. 전년 상당액은 올해 주택을 전년에 소유한 것으로 계산한 법정 금액입니다. 실제 납부총액을 복사하지 마세요.</p>}
    {worksheet&&<label><input type="checkbox" data-testid="comprehensive-prior_scope_reviewed" checked={!!r.prior_scope_reviewed} onChange={e=>edit('prior_scope_reviewed',e.target.checked)}/>올해 저장 본세가 부과자료와 일치하고 2025·2026년 동일 주택·국내 거주·세대 전체 1주택·계속 단독 소유이며 증축·멸실·합산배제·감면·조례 가감이 없고, 전년 산정표에서 과표상한·재산세 및 종부세 세부담상한을 제외했음을 확인했습니다.</label>}
    <p data-testid="comprehensive-derived">채택 공시가격 {Number(d.standard_value||0).toLocaleString('ko-KR')}원 · 저장 원본 기준 만 {derived?.owner_age??'확인 필요'}세 · 보유 {derived?.holding_years??'확인 필요'}년</p>
    {!zero&&[['property_tax_paid','올해 부과 재산세 본세 (교육세·도시지역분 제외)'],['property_tax_base',worksheet?'올해 재산세 과세표준 (저장 결과의 상한 적용 후)':'올해 재산세 과세표준 (공시가격 × 45%)'],['prior_property_tax','전년 법정 재산세 상당액'],['prior_comprehensive_tax','전년 법정 종부세 상당액 (없으면 0)'],['current_tax_source','올해 본세·과표 확인 문서와 근거'],['prior_tax_source','전년 상당액 산정 내역·경과조치 검토 근거']].map(([k,label])=><label key={k}>{label}<input readOnly={!!worksheet} data-testid={'comprehensive-'+k} value={r[k]??''} onChange={e=>edit(k,e.target.value)}/></label>)}
    {[['sole_house_resident','국내 거주자이며 세대 전체에서 이 주택 1채만 보유합니다'],['property_one_house',worksheet?'재산세도 1세대 1주택이며 저장 결과의 상한 적용 과표·본세를 확인했습니다':'재산세도 1세대 1주택에 해당하고 과표상한으로 과표가 줄지 않았습니다'],['ordinary_purchase_continuous','원본 취득일부터 매매 취득 주택을 계속 단독 소유했고 재건축·통산 등이 없습니다'],['credits_reviewed','원본 생년월일·취득일에 따른 만 나이와 보유 연수·세액공제를 확인했습니다'],['cap_equivalents_reviewed','전년 상당액은 실제 고지액이 아닌 법정 산정액이며 2028년까지 경과조치도 검토했습니다']].filter(([k])=>!zero||['sole_house_resident','ordinary_purchase_continuous'].includes(k)).map(([k,label])=><label key={k}><input type="checkbox" data-testid={'comprehensive-'+k} checked={!!r[k]} onChange={e=>edit(k,e.target.checked)}/>{label}</label>)}
  </>;
}

function JTHoldingTaxSources({api,base,busy,act,onImport}) {
  const [items,setItems]=React.useState(null),[run,setRun]=React.useState(''),[reason,setReason]=React.useState(''),[confirmed,setConfirmed]=React.useState(false),[preview,setPreview]=React.useState(null);
  const change=fn=>{setPreview(null);setConfirmed(false);fn();};
  const selection=()=>({run_id:run,confirmed,reason});
  return <section className="ic-section" aria-label="재산세 결과에서 종부세 연결"><h2>재산세 저장 결과 → 종부세 원본 연결</h2><p>감액 과세표준·본세와 올해/전년 공시가격을 함께 채택합니다. 전년 실제 납부액을 복사하지 않습니다.</p>
    <button data-testid="holding-tax-list" disabled={busy} onClick={()=>act(async()=>{setItems((await api(base+'/tax-sources')).items);setPreview(null);})}>재산세 저장 결과 조회</button>
    {items&&<fieldset disabled={busy}><legend>재산세 원본 결과 선택</legend><select aria-label="재산세 저장 결과" data-testid="holding-tax-run" value={run} onChange={e=>change(()=>setRun(e.target.value))}><option value="">선택</option>{items.map(x=><option key={x.run_id} value={x.run_id}>{x.label} · 버전{x.revision} · {x.computed_at} · {x.run_id}</option>)}</select>
    <label>원본 선택·두 연도 확인 근거<input data-testid="holding-tax-reason" value={reason} maxLength={2000} onChange={e=>change(()=>setReason(e.target.value))}/></label>
    <label><input type="checkbox" data-testid="holding-tax-confirm" checked={confirmed} onChange={e=>{setConfirmed(e.target.checked);setPreview(null);}}/>선택한 결과의 주택·소유자·지분·공시가격 연도·본세 범위를 확인했습니다.</label>
    <button data-testid="holding-tax-preview" disabled={busy||!run||!reason.trim()||!confirmed} onClick={()=>act(async()=>setPreview(await api(base+'/tax-source-preview',{method:'POST',body:JSON.stringify(selection())})))}>종부세 연결 미리보기</button>
    {preview&&<><p data-testid="holding-tax-values">{preview.property.address} · {preview.owner.name} · 2026-06-01 · 지분1 · 적용 과표 {Number(preview.worksheet.current_property_tax_base).toLocaleString('ko-KR')}원 · 본세 {Number(preview.worksheet.current_property_tax).toLocaleString('ko-KR')}원 · 전년 재산세 상당액 {Number(preview.worksheet.prior_property_tax).toLocaleString('ko-KR')}원 · 전년 종부세 상당액 {Number(preview.worksheet.prior_comprehensive_tax).toLocaleString('ko-KR')}원</p><button data-testid="holding-tax-import" disabled={busy} onClick={()=>act(()=>onImport(selection(),preview))}>재산세 원본 채택·종부세 새 버전 저장</button></>}
    </fieldset>}
  </section>;
}

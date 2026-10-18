/* Saved inheritance cases use the same authenticated client/case workbench. */
let jtInheritanceSession = null;
function inheritanceDirty(w = jtInheritanceSession) {
  return !!w && JSON.stringify({ label: w.label, draft: w.draft }) !== w.baseline;
}
function JTInheritanceCases({ clientId, caseId, onExit }) {
  const [w, setW] = React.useState(jtInheritanceSession);
  const [opened,setOpened] = React.useState(false);
  const ref = React.useRef(w), lock = React.useRef(false), alive = React.useRef(true);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const [revision,setRevision] = React.useState('');
  const [equityTarget,setEquityTarget]=React.useState('new');
  const [persons,setPersons] = React.useState([]);
  const keys = React.useRef({});
  const remember = value => { ref.current = value; jtInheritanceSession = value; if (alive.current) setW(value); };
  const api = async (path, options = {}) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(),45000);
    try {
      const r = await fetch((window.JT_ENGINE_BASE || 'http://127.0.0.1:8000').replace(/\/$/,'') + path,
        {...options,signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+jtGiftSession.token,...options.headers}});
      const data = await r.json().catch(()=>({}));
      if (!r.ok) {
        if (r.status === 401) jtGiftSession.token = '';
        const messages={REVISION_CONFLICT:'다른 저장본이 있습니다. 다시 열어 확인해 주세요.',SNAPSHOT_MIGRATION_REQUIRED:'지원하지 않는 저장 버전입니다.',PARTY_OUTSIDE_CLIENT:'선택한 당사자가 이 고객의 자료가 아닙니다.',INVALID_CASE_INPUT:'금액과 중복 입력을 확인해 주세요.',DRAFT_NOT_RUNNABLE:'저장본의 보완 항목을 확인해 주세요.',ENGINE_CALCULATION_ERROR:'계산 입력을 추가 확인해야 합니다. 결과는 저장되지 않았습니다.'};
        throw new Error(r.status===401?'로그인이 필요합니다. 작업대로 돌아가 같은 계정으로 로그인하세요.':
          ({SOURCE_CHANGED:'미리보기 이후 원본이 변경됐습니다. 다시 미리보기 후 가져오세요.',SOURCE_CASE_CONTEXT_MISMATCH:'상속개시일과 등록 피상속인을 다시 확인하세요.',SOURCE_DECEDENT_MISMATCH:'선택한 소유자가 피상속인과 다릅니다.',SOURCE_VALUATION_DATE_MISMATCH:'상속개시일과 같은 평가기준일의 자료를 선택하세요.',SOURCE_PROPERTY_DUPLICATE:'같은 재산이 이미 연결돼 있습니다. 해당 행을 교체하세요.',SOURCE_FRACTIONAL_WON_UNSUPPORTED:'지분 적용 결과가 원 미만입니다. 현재 가져오기 범위에서 지원하지 않습니다.'})[data.detail?.code] || messages[data.detail?.code] || (r.status===422?'입력 형식과 날짜·금액을 확인해 주세요.':'자료를 처리하지 못했습니다. 저장본을 확인하고 다시 시도해 주세요.'));
      }
      return data;
    } finally { clearTimeout(timer); }
  };
  const mutation = (path, method, body, etag) => {
    const signature = JSON.stringify({path,method,body,etag});
    const memory = path==='/v1/inheritance-cases' ? keys.current : ref.current?.keys || keys.current;
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
    const saved = await api('/v1/inheritance-cases/'+id+(number?'?revision='+number:''));
    if(saved.client_id!==clientId)throw new Error('선택한 고객의 사건이 아닙니다.');
    const run = saved.last_successful_run_id?await api('/v1/inheritance-cases/'+id+'/runs/'+saved.last_successful_run_id):null;
    remember({uid:jtGiftSession.uid,meta:saved,label:saved.label,draft:saved.draft,run,keys:ref.current?.keys || keys.current,
      baseline:JSON.stringify({label:saved.label,draft:saved.draft})});
    if(alive.current)setOpened(true);
  };
  React.useEffect(()=>{
    alive.current=true;
    act(async()=>{
      if(caseId==='resume' && ref.current?.meta?.client_id===clientId){if(ref.current.uid!==jtGiftSession.uid)throw new Error('편집하던 계정으로 다시 로그인해 주세요.');setPersons((await api('/v1/gift-cases/context?client_id='+clientId)).persons);setOpened(true);return;}
      setPersons((await api('/v1/gift-cases/context?client_id='+clientId)).persons);
      if(caseId)await load(caseId);
      else {
        const made=await mutation('/v1/inheritance-cases','POST',{client_id:clientId,label:'새 상속 사건',draft:{}});
        await load(made.case_id);
      }
    });
    const protect=e=>{if(lock.current||inheritanceDirty(ref.current)){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',protect);
    return()=>{alive.current=false;window.removeEventListener('beforeunload',protect);};
  },[]);
  const current = opened && w?.meta?.client_id===clientId && (caseId==='resume'||!caseId||w.meta.case_id===caseId);
  const readonly = !current || w.meta.read_only || w.meta.revision!==w.meta.current_revision;
  const base = current?'/v1/inheritance-cases/'+w.meta.case_id:'';
  if(current&&w.meta.read_only)return <div><button onClick={onExit}>작업대로</button><p>지원하지 않는 입력 버전입니다. 읽기 전용 원본을 보존합니다.</p><pre>{JSON.stringify(w.meta.case_input,null,2)}</pre></div>;
  const change = (key,value,confirmation=false) => {
    const draft={...ref.current.draft,...(confirmation?{}:{facts_confirmed:false,ordinary_scope_confirmed:false,spouse_partition_confirmed:false}),[key]:value};
    if(!confirmation&&draft.allocation)draft.allocation={...draft.allocation,confirmed:false};
    if(!confirmation&&draft.insurance)draft.insurance={...draft.insurance,no_double_count_confirmed:false,financial_scope_confirmed:false,rows:draft.insurance.rows.map(r=>r.partial_funding?{...r,partial_funding:{...r.partial_funding,complete_by_death_confirmed:false,beneficiary_own_funds_confirmed:false}}:r)};
    remember({...ref.current,draft});
  };
  const fundingEdit=(index,key,value,confirmation=false)=>change('insurance',{...ref.current.draft.insurance,rows:ref.current.draft.insurance.rows.map((r,n)=>n===index?{...r,partial_funding:{...r.partial_funding,[key]:value}}:r)},confirmation);
  const save=async()=>{if(!inheritanceDirty(ref.current))return ref.current.meta;const saved=await mutation(base,'PUT',{label:ref.current.label,draft:ref.current.draft},ref.current.meta.etag);await load(saved.case_id);return ref.current.meta;};
  const d=current?w.draft:null;
  const total=d?.assets.every(a=>a.value_krw!=null&&/^[0-9]+$/.test(String(a.value_krw)))?d.assets.reduce((sum,a)=>sum+BigInt(a.value_krw),0n).toLocaleString('ko-KR')+'원':'금액 입력 필요';
  const rowEdit=(group,index,key,value)=>change(group,d[group].map((r,i)=>i===index?{...r,[key]:value}:r));
  const money=(value)=>{if(value==='')return null;const n=Number(value);if(!/^[0-9]+$/.test(value)||!Number.isSafeInteger(n))throw new Error('0 이상의 정확한 원 단위 정수를 입력해 주세요.');return n;};
  const adjustments=[['debts','채무'],['public_charges','공과금'],['funeral_expenses','일반 장례비'],['burial_facility_expenses','봉안·자연장 비용'],['net_financial_assets','순금융재산'],['appraisal_fee','감정평가 수수료']];
  return <div className="jt-container cw-workspace">
    <style>{`.ic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.ic-grid label{display:flex;flex-direction:column;gap:6px}.ic-grid input,.ic-grid select,.ic-grid textarea{font:inherit;padding:10px;min-height:44px}.ic-section{border:1px solid #ccd8cd;padding:20px;margin:20px 0;border-radius:10px}.ic-section button{margin:8px;min-height:44px}.ic-section p{line-height:1.6}`}</style>
    <button disabled={busy} onClick={onExit}>← 고객·사건 작업대</button><h1>상속 사건 입력·저장</h1>
    <p>2026년 거주자 일반 상속의 성년 배우자·자녀와 현금·예금·부동산과 저장 평가를 선택한 일반 비상장주식을 연결합니다. 재산은 피상속인 소유 지분의 상속개시일 평가액으로 입력하세요. 사전증여·등록 범위 밖 보험/퇴직금·추정상속·유증/포기·미성년·장애·기타 상속인·특례는 아직 이 저장 경로에 연결하지 않았습니다.</p>
    {error&&<p role="alert">{error}</p>}
    {!current&&!busy&&<button onClick={()=>act(async()=>{if(caseId&&caseId!=='resume')await load(caseId);else{const made=await mutation('/v1/inheritance-cases','POST',{client_id:clientId,label:'새 상속 사건',draft:{}});await load(made.case_id);}})}>사건 열기 다시 시도</button>}
    {current&&<>
      <p>저장 버전 {w.meta.revision} / 최신 {w.meta.current_revision}{readonly?' · 읽기 전용 저장본':''}{inheritanceDirty(w)?' · 저장하지 않은 변경 있음':''}</p>
      <fieldset disabled={busy||readonly}><legend>상속 사실과 재산·상속인</legend>
        <div className="ic-grid"><label>사건명<input data-testid="inheritance-label" value={w.label} onChange={e=>remember({...w,label:e.target.value})}/></label>
        <label>상속개시일<input data-testid="inheritance-death_date" type="date" value={d.death_date||''} onChange={e=>change('death_date',e.target.value||null)}/></label>
        <label>등록 피상속인 (선택)<select data-testid="inheritance-decedent_person_id" value={d.decedent_person_id||''} onChange={e=>{const p=persons.find(p=>p.id===e.target.value);remember({...w,draft:{...d,decedent_person_id:p?.id||null,decedent_name:p?.name||'',allocation:d.allocation?{...d.allocation,confirmed:false}:null,facts_confirmed:false,ordinary_scope_confirmed:false,spouse_partition_confirmed:false}});}}><option value="">직접 입력</option>{persons.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>피상속인 이름<input data-testid="inheritance-decedent_name" value={d.decedent_name} onChange={e=>change('decedent_name',e.target.value)}/></label>
        <label>피상속인 거주자 여부<select data-testid="inheritance-resident" value={d.resident} onChange={e=>change('resident',e.target.value)}><option value="unknown">미확인</option><option value="yes">거주자</option><option value="no">비거주자</option></select></label></div>
        {typeof JTEquityPicker!=='undefined'&&<><label>평가 반영 위치<select data-testid="inheritance-equity-target" value={equityTarget} onChange={e=>setEquityTarget(e.target.value)}><option value="new">주식 재산 추가</option>{d.assets.filter(x=>x.kind==='stock').map(x=><option key={x.local_id} value={x.local_id}>기존 주식 {x.description} 교체</option>)}</select></label>
        <JTEquityPicker api={api} clientId={clientId} eventDate={d.death_date} purpose="상속" disabled={busy||readonly} onAdopt={x=>{const row={local_id:window.crypto.randomUUID(),kind:'stock',description:x.company_name,value_krw:String(x.total_value),value_source:'평가 결과 '+x.run_id,valuation_as_of:x.eval_date,equity_ref:x.reference,financial_eligible:false,financial_source:''};change('assets',equityTarget==='new'?[...d.assets,row]:d.assets.map(a=>a.local_id===equityTarget?{...row,local_id:a.local_id}:a));}}/></>}
        {!readonly&&d.death_date&&d.decedent_person_id&&<JTInheritanceSources key={base+':'+w.meta.revision+':'+d.death_date+':'+d.decedent_person_id} api={api} clientId={clientId} base={base} busy={busy} act={act} draft={d} onImport={async(selection,preview,target)=>{const saved=await mutation(base+'/source-imports','POST',{label:ref.current.label,draft:ref.current.draft,selection,expected_source_hash:preview.source_hash,target_local_id:target||null},ref.current.meta.etag);await load(saved.case_id);}}/>}
        <section className="ic-section"><h2>1. 상속재산 명세</h2>
        <p>원본 가져오기는 상속개시일과 등록 피상속인을 선택하면 표시됩니다. 기존 행 교체 또는 새 재산 추가를 선택하고, 가져온 뒤 분할액·채무·공제는 다시 확인하세요.</p>
        {d.assets.map((r,i)=><div key={r.local_id} className="ic-section"><h3>재산 {i+1}</h3><div className="ic-grid">
          <label>종류<select data-testid={'inheritance-asset-'+i+'-kind'} disabled={r.kind==='stock'} value={r.kind} onChange={e=>rowEdit('assets',i,'kind',e.target.value)}><option value="stock">비상장주식</option><option value="cash">현금</option><option value="deposit">예금 등 금융재산 (주식 제외)</option><option value="realestate">부동산</option></select></label>
          {[['description','재산 식별·주소'],['value_krw','상속 지분 평가액 (원)'],['value_source','상속개시일 평가 근거·출처']].map(([k,title])=><label key={k}>{title}<input readOnly={r.kind==='stock'} data-testid={'inheritance-asset-'+i+'-'+k} value={r[k]??''} onChange={e=>rowEdit('assets',i,k,e.target.value)}/></label>)}
        </div>{r.kind==='stock'&&<><p>{r.valuation_as_of} · {r.equity_ref?.shares}주 · 결과 {r.equity_ref?.run_id}</p><label>금융재산 공제 요건 검토 근거<input data-testid={'inheritance-stock-'+i+'-source'} value={r.financial_source||''} onChange={e=>change('assets',d.assets.map((a,n)=>n===i?{...a,financial_source:e.target.value,financial_eligible:false}:a))}/></label><label><input data-testid={'inheritance-stock-'+i+'-eligible'} type="checkbox" checked={!!r.financial_eligible} onChange={e=>rowEdit('assets',i,'financial_eligible',e.target.checked)}/>금융재산 해당·최대주주등 제외·실명 및 신고 요건을 확인했습니다.</label></>}<button data-testid={'inheritance-asset-'+i+'-remove'} onClick={()=>change('assets',d.assets.filter((_,n)=>n!==i))}>재산 제거</button></div>)}
        <button data-testid="inheritance-add-asset" onClick={()=>change('assets',[...d.assets,{local_id:window.crypto.randomUUID(),kind:'cash',description:'',value_krw:null,value_source:''}])}>재산 추가</button><p>등록 재산 합계: <output data-testid="inheritance-total">{total}</output></p>
        {Object.entries(w.meta.case_input?.property_sources||{}).map(([id,source])=><p key={id} data-testid={'inheritance-source-status-'+id}>저장된 원본: {source.property.address} · 평가일 {source.valuation.as_of_date} · 전체 {Number(source.valuation.amount).toLocaleString('ko-KR')}원 × 지분 {source.ownership.share_ratio} · {({matched:'채택 입력 일치',manually_modified:'채택 후 직접 수정',context_mismatch:'사건 기준 변경—재채택 필요'})[w.meta.case_input.property_source_status[id]]} · {source.source_hash}{inheritanceDirty(w)?' · 수정 전 저장본 기준':''}</p>)}
        </section>
        <section className="ic-section"><h2>2. 상속인 명세</h2><p>나이는 상속개시일 기준 만 나이입니다. 이름·관계·나이와 실제 상속액을 직접 확인하며 0원도 명시하세요. 등록 원본을 선택하면 이름만 채택하고 관계·나이·분할금액은 따로 입력합니다.</p>
        {d.heirs.map((r,i)=><div key={r.local_id} className="ic-section"><h3>상속인 {i+1}</h3><div className="ic-grid">
          <label>등록 당사자 (선택)<select data-testid={'inheritance-heir-'+i+'-person_id'} value={r.person_id||''} onChange={e=>{const p=persons.find(p=>p.id===e.target.value);change('heirs',d.heirs.map((h,n)=>n===i?{...h,person_id:p?.id||null,name:p?.name||'',age:null,actual_inheritance:null}:h));}}><option value="">직접 입력</option>{persons.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>이름<input data-testid={'inheritance-heir-'+i+'-name'} value={r.name} onChange={e=>rowEdit('heirs',i,'name',e.target.value)}/></label>
          <label>피상속인과의 관계<select data-testid={'inheritance-heir-'+i+'-relationship'} value={r.relationship} onChange={e=>rowEdit('heirs',i,'relationship',e.target.value)}><option>자녀</option><option>배우자</option></select></label>
          <label>상속개시일 만 나이<input data-testid={'inheritance-heir-'+i+'-age'} inputMode="numeric" value={r.age??''} onChange={e=>{const v=e.target.value;if(v===''||/^[0-9]+$/.test(v))rowEdit('heirs',i,'age',v===''?null:Number(v));}}/></label>
          <label>{d.allocation?'배분 명세에서 산정 (직접 입력 비활성)':d.insurance?'일반 재산 + 보험금 수령 합계 (원)':'실제 상속액 (원)'}<input disabled={!!d.allocation} data-testid={'inheritance-heir-'+i+'-actual_inheritance'} value={r.actual_inheritance??''} onChange={e=>rowEdit('heirs',i,'actual_inheritance',e.target.value)}/></label>
        </div><button data-testid={'inheritance-heir-'+i+'-remove'} onClick={()=>change('heirs',d.heirs.filter((_,n)=>n!==i))}>상속인 제거</button></div>)}
        <button data-testid="inheritance-add-heir" onClick={()=>change('heirs',[...d.heirs,{local_id:window.crypto.randomUUID(),person_id:null,name:'',relationship:'자녀',age:null,actual_inheritance:null}])}>상속인 추가</button></section>
        <section className="ic-section"><h2>상속인별 재산·채무 배분</h2>
        <p>2026-03-20~2026-10-17 일반 상속의 확인된 분할을 입력합니다. 재산 배분 합계와 채무·공과금 총액을 맞추면 순액을 실제 상속액으로 계산합니다. 비과세·불산입 재산과 특례는 지원하지 않습니다. 이 명세는 상속인별 납부세액이 아닙니다.</p>
        <label><input type="checkbox" data-testid="inheritance-allocation-enable" checked={!!d.allocation} onChange={e=>{
          if(!window.confirm('입력 방식을 바꾸면 실제 상속액 직접 입력과 기존 배분 명세를 비웁니다. 계속하시겠습니까?'))return;
          remember({...w,draft:{...d,heirs:d.heirs.map(h=>({...h,actual_inheritance:null})),allocation:e.target.checked?{assets:[],liabilities:[],basis:'',confirmed:false}:null,facts_confirmed:false,ordinary_scope_confirmed:false,spouse_partition_confirmed:false}});
        }}/>재산·채무 명세로 실제 상속액 산정</label>
        {d.allocation&&<>
          <p>각 재산을 상속인에게 배분하세요. 상속받지 않는 금액도 0원으로 입력하세요. 재산이나 상속인을 삭제한 뒤 남은 배분행은 아래에서 제거합니다.</p>
          {d.assets.map((a,ai)=><div className="ic-section" key={a.local_id}><h3>{a.description||'재산 '+(ai+1)}</h3><div className="ic-grid">{d.heirs.map((h,hi)=><label key={h.local_id}>{h.name||'상속인 '+(hi+1)} 배분액 (원)<input data-testid={'inheritance-allocation-'+ai+'-'+hi} value={d.allocation.assets.find(x=>x.asset_id===a.local_id&&x.heir_id===h.local_id)?.amount??''} onChange={e=>change('allocation',{...d.allocation,assets:[...d.allocation.assets.filter(x=>!(x.asset_id===a.local_id&&x.heir_id===h.local_id)),{asset_id:a.local_id,heir_id:h.local_id,amount:e.target.value}]})}/></label>)}</div></div>)}
          {d.allocation.assets.filter(x=>!d.assets.some(a=>a.local_id===x.asset_id)||!d.heirs.some(h=>h.local_id===x.heir_id)).map((x,i)=><p key={i}>삭제된 재산·상속인 배분 {x.amount}원 <button onClick={()=>change('allocation',{...d.allocation,assets:d.allocation.assets.filter(y=>y!==x)})}>남은 배분행 제거</button></p>)}
          {d.allocation.liabilities.map((r,i)=><div className="ic-section" key={r.local_id}><div className="ic-grid">
            <label>승계 상속인<select data-testid={'inheritance-liability-'+i+'-heir_id'} value={r.heir_id} onChange={e=>change('allocation',{...d.allocation,liabilities:d.allocation.liabilities.map((x,n)=>n===i?{...x,heir_id:e.target.value}:x)})}><option value="">선택</option>{d.heirs.map(h=><option key={h.local_id} value={h.local_id}>{h.name}</option>)}</select></label>
            <label>구분<select data-testid={'inheritance-liability-'+i+'-kind'} value={r.kind} onChange={e=>change('allocation',{...d.allocation,liabilities:d.allocation.liabilities.map((x,n)=>n===i?{...x,kind:e.target.value}:x)})}><option value="debts">채무</option><option value="public_charges">공과금</option></select></label>
            {[['amount','승계 금액 (원)'],['description','채권자·채무/공과금 식별'],['source','공제 적격·승계 근거']].map(([key,title])=><label key={key}>{title}<input data-testid={'inheritance-liability-'+i+'-'+key} value={r[key]??''} onChange={e=>change('allocation',{...d.allocation,liabilities:d.allocation.liabilities.map((x,n)=>n===i?{...x,[key]:e.target.value}:x)})}/></label>)}
          </div><button data-testid={'inheritance-liability-'+i+'-remove'} onClick={()=>change('allocation',{...d.allocation,liabilities:d.allocation.liabilities.filter((_,n)=>n!==i)})}>승계행 제거</button></div>)}
          <button data-testid="inheritance-add-liability" onClick={()=>change('allocation',{...d.allocation,liabilities:[...d.allocation.liabilities,{local_id:window.crypto.randomUUID(),heir_id:d.heirs[0]?.local_id||'unselected',kind:'debts',amount:null,description:'',source:''}]})}>채무·공과금 승계행 추가</button>
          <label>협의분할·승계 근거<textarea data-testid="inheritance-allocation-basis" value={d.allocation.basis} onChange={e=>change('allocation',{...d.allocation,basis:e.target.value})}/></label>
          <label><input data-testid="inheritance-allocation-confirmed" type="checkbox" checked={d.allocation.confirmed} onChange={e=>change('allocation',{...d.allocation,confirmed:e.target.checked},true)}/>배분과 승계, 채무 중복 없음 및 비과세·불산입 재산 없는 일반 분할임을 확인했습니다.</label>
        </>}
        {w.meta.case_input?.allocation_summary&&<div data-testid="inheritance-allocation-summary"><h3>저장된 배분 합계{inheritanceDirty(w)?' · 수정 전 입력 기준':''}</h3>{Object.entries(w.meta.case_input.allocation_summary.heirs).map(([id,x])=><p key={id}>{w.meta.draft.heirs.find(h=>h.local_id===id)?.name||id}: 재산 {x.gross.toLocaleString('ko-KR')}원 − 채무 {x.debts.toLocaleString('ko-KR')}원 − 공과금 {x.public_charges.toLocaleString('ko-KR')}원 = 순액 {x.net.toLocaleString('ko-KR')}원</p>)}<p>배우자 순액은 사건 전체의 배우자 공제 계산에 전달됩니다. 개인별 세액은 산정하지 않습니다.</p></div>}
        </section>
        <section className="ic-section" aria-label="검토한 상속 보험금"><h2>보험금 명세</h2>
        <p>2026-10-01~10-17 개시, 등록 피상속인 전액 부담 또는 피상속인과 수익자가 분담한 사망보험금을 연결합니다. 단독 성년 자녀 수익자, 계약자는 피상속인 또는 수익자만 지원합니다. 제3자 부담·증여받은 보험료·주식·배분 명세·채무·공과금은 지원하지 않습니다.</p>
        <label><input data-testid="inheritance-insurance-enable" type="checkbox" checked={!!d.insurance} onChange={e=>change('insurance',e.target.checked?{rows:[],no_double_count_confirmed:false,financial_scope_confirmed:false}:null)}/>검토한 보험금 연결</label>
        {d.insurance&&<>
          <p>일반 재산에 보험금을 다시 포함하지 마세요. 사망 시까지 납입한 보험료에는 보험료에 충당한 배당금도 포함하여 부담자를 확인합니다. 단독 자녀 수령액은 일반 재산과 보험금 합계, 순금융재산은 적격 예금과 상속재산에 포함되는 보험금만 합산하세요. 일부 부담의 포함액은 보험금 × 피상속인 부담 보험료 ÷ 전체 보험료입니다. 원 미만 안분은 보류합니다. 민법상 상속재산·분할액을 자동 판정하지 않습니다.</p>
          {d.insurance.rows.map((r,i)=><div key={r.local_id} className="ic-section"><h3>보험금 {i+1}</h3><div className="ic-grid">
            {[['insurer','국내 금융회사명'],['policy_ref','보험 계약 식별'],['as_of','보험금 기준일 (YYYY-MM-DD)'],['benefit','사망보험금 (원)'],['total_premiums','사망 시까지 납입 보험료 총액 (원)'],['decedent_premiums','피상속인 실제 부담 보험료 (원)'],['source','계약·지급·납입/배당금·금융재산 적격 검토 출처']].map(([k,title])=><label key={k}>{title}<input data-testid={'inheritance-insurance-'+i+'-'+k} value={r[k]??''} onChange={e=>change('insurance',{...d.insurance,rows:d.insurance.rows.map((x,n)=>n===i?{...x,[k]:e.target.value}:x)})}/></label>)}
            <label>보험 종류<select data-testid={'inheritance-insurance-'+i+'-kind'} value={r.kind} onChange={e=>change('insurance',{...d.insurance,rows:d.insurance.rows.map((x,n)=>n===i?{...x,kind:e.target.value}:x)})}><option value="unknown">미확인</option><option value="life">생명보험 사망보험금</option><option value="nonlife">손해보험 사망보험금</option></select></label>
            <label>수익자<select data-testid={'inheritance-insurance-'+i+'-beneficiary_heir_id'} value={r.beneficiary_heir_id} onChange={e=>change('insurance',{...d.insurance,rows:d.insurance.rows.map((x,n)=>n===i?{...x,beneficiary_heir_id:e.target.value}:x)})}><option value="">선택</option>{d.heirs.map(h=><option key={h.local_id} value={h.local_id}>{h.name||h.local_id}</option>)}</select></label>
          </div>{[['death_triggered','피상속인 사망으로 지급되는 보험금입니다'],['policyholder_is_decedent','보험계약자는 등록 피상속인입니다'],['financial_eligible','국내 금융회사 취급 적격 보험금이며 제외·비과세 특례가 없음을 검토했습니다']].map(([k,title])=><p key={k}><label><input type="checkbox" data-testid={'inheritance-insurance-'+i+'-'+k} checked={r[k]} onChange={e=>change('insurance',{...d.insurance,rows:d.insurance.rows.map((x,n)=>n===i?{...x,[k]:e.target.checked}:x)})}/>{title}</label></p>)}
          <label><input type="checkbox" data-testid={'inheritance-insurance-'+i+'-partial'} checked={!!r.partial_funding} onChange={e=>change('insurance',{...d.insurance,rows:d.insurance.rows.map((x,n)=>n===i?{...x,partial_funding:e.target.checked?{schema_version:'insurance-funding/1',policyholder_person_id:null,payments:[],complete_by_death_confirmed:false,beneficiary_own_funds_confirmed:false}:null}:x)})}/>피상속인·수익자 일부 부담 명세</label>
          {r.partial_funding&&<section aria-label="보험료 부담 원본행">
            <label>계약자<select data-testid={'inheritance-funding-'+i+'-policyholder'} value={r.partial_funding.policyholder_person_id||''} onChange={e=>fundingEdit(i,'policyholder_person_id',e.target.value||null)}><option value="">선택</option>{persons.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <p>사망일까지의 납입명세를 부담자별로 입력합니다. 행 금액에 배당금 충당액을 이미 포함하며, 배당금은 다시 더하지 않습니다. 같은 부담자의 기간이 겹치면 합쳐 입력하세요.</p>
            {r.partial_funding.payments.map((p,j)=><div key={p.local_id} className="ic-section"><p>납입행 ID {p.local_id}</p>
              <label>실제 부담자<select data-testid={'inheritance-payment-'+i+'-'+j+'-payer_person_id'} value={p.payer_person_id||''} onChange={e=>fundingEdit(i,'payments',r.partial_funding.payments.map((x,n)=>n===j?{...x,payer_person_id:e.target.value||null}:x))}><option value="">선택</option>{persons.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
              {[['period_from','납입 시작일'],['period_to','납입 종료일'],['amount','배당금 포함 납입액 (원)'],['dividend_included','납입액 중 배당금 (원, 없으면 0)'],['source','납입·자금 출처 근거']].map(([k,title])=><label key={k}>{title}<input data-testid={'inheritance-payment-'+i+'-'+j+'-'+k} value={p[k]??''} onChange={e=>fundingEdit(i,'payments',r.partial_funding.payments.map((x,n)=>n===j?{...x,[k]:e.target.value}:x))}/></label>)}
              <button data-testid={'inheritance-payment-'+i+'-'+j+'-remove'} onClick={()=>fundingEdit(i,'payments',r.partial_funding.payments.filter((_,n)=>n!==j))}>납입행 제거</button>
            </div>)}
            <button data-testid={'inheritance-payment-'+i+'-add'} onClick={()=>fundingEdit(i,'payments',[...r.partial_funding.payments,{local_id:window.crypto.randomUUID(),payer_person_id:null,period_from:null,period_to:d.death_date,amount:null,dividend_included:null,source:''}])}>납입행 추가</button>
            {[['complete_by_death_confirmed','사망일까지 전체 납입·배당금 내역과 부담자별 합계를 확인했습니다'],['beneficiary_own_funds_confirmed','수익자 부담분은 고유자금이며 제3자 부담·증여받은 보험료가 없습니다']].map(([k,title])=><p key={k}><label><input type="checkbox" data-testid={'inheritance-funding-'+i+'-'+k} checked={r.partial_funding[k]} onChange={e=>fundingEdit(i,k,e.target.checked,true)}/>{title}</label></p>)}
          </section>}
          <button data-testid={'inheritance-insurance-'+i+'-remove'} onClick={()=>change('insurance',{...d.insurance,rows:d.insurance.rows.filter((_,n)=>n!==i)})}>보험금 제거</button></div>)}
          <button data-testid="inheritance-insurance-add" onClick={()=>change('insurance',{...d.insurance,rows:[...d.insurance.rows,{local_id:window.crypto.randomUUID(),insurer:'',policy_ref:'',kind:'unknown',beneficiary_heir_id:'',as_of:d.death_date,benefit:null,total_premiums:null,decedent_premiums:null,source:'',death_triggered:false,policyholder_is_decedent:false,financial_eligible:false}]})}>보험금 추가</button>
          {[['no_double_count_confirmed','보험금은 일반 재산·예금·다른 보험행에 중복 계상하지 않았습니다'],['financial_scope_confirmed','예금·보험금의 금융재산 적격·실명/신고 요건과 금융채무 없음을 확인했습니다']].map(([k,title])=><p key={k}><label><input type="checkbox" data-testid={'inheritance-insurance-'+k} checked={d.insurance[k]} onChange={e=>change('insurance',{...d.insurance,[k]:e.target.checked},true)}/>{title}</label></p>)}
        </>}
        {w.meta.case_input?.insurance_summary&&<p data-testid="inheritance-insurance-summary">저장 기준 보험금 {Number(w.meta.case_input.insurance_summary.insurance_total_krw).toLocaleString('ko-KR')}원 · 일반 재산 포함 총액 {Number(w.meta.case_input.insurance_summary.gross_estate_krw).toLocaleString('ko-KR')}원 · 적격 금융재산 {Number(w.meta.case_input.insurance_summary.eligible_financial_krw).toLocaleString('ko-KR')}원{inheritanceDirty(w)?' · 수정 전 입력 기준':''}</p>}
        {w.meta.case_input?.insurance_summary?.received_insurance_krw!=null&&<div data-testid="inheritance-partial-summary"><p>저장 기준 전체 보험금 수령액 {w.meta.case_input.insurance_summary.received_insurance_krw.toLocaleString('ko-KR')}원 · 상속재산 포함액 {w.meta.case_input.insurance_summary.insurance_total_krw.toLocaleString('ko-KR')}원 · 수익자 고유자금 대응 제외액 {w.meta.case_input.insurance_summary.excluded_own_funds_krw.toLocaleString('ko-KR')}원{inheritanceDirty(w)?' · 수정 전 입력 기준':''}</p>{w.meta.case_input.insurance_summary.rows.filter(x=>x.attribution).map(x=><p key={x.local_id}>보험행 {x.local_id}: {x.attribution.included_krw==null?'입력 검토 필요':x.attribution.included_krw.toLocaleString('ko-KR')+'원 포함'}</p>)}</div>}
        </section>
        <section className="ic-section"><h2>3. 비용·공제 사실 확인</h2><div className="ic-grid">{adjustments.map(([k,title])=><label key={k}>{title} (원)<input data-testid={'inheritance-'+k} value={d.adjustments[k]} onChange={e=>{try{change('adjustments',{...d.adjustments,[k]:money(e.target.value)??0});setError('');}catch(err){setError(err.message);}}}/></label>)}</div>
        <label>채무 입증·비용 범위·순금융재산·재산분할·평가 확인 근거<textarea data-testid="inheritance-review_note" value={d.review_note} maxLength={2000} onChange={e=>change('review_note',e.target.value)}/></label>
        <p>순금융재산은 적격 주식·예금 등 금융재산에서 관련 금융채무를 차감한 확인 금액입니다. 단순 현금은 금융재산으로 자동 처리하지 않습니다.</p>
        {[['spouse_partition_confirmed','배우자 실제 상속액의 분할·등기 및 신고 기한 요건을 확인했습니다 (해당 시)'],['ordinary_scope_confirmed','사전증여·등록 범위 밖 보험/퇴직금·추정상속·유증/포기·장애/별도 동거가족·국외재산·그 밖의 특례가 없는 일반 사건입니다'],['facts_confirmed','재산 중복 없음·평가액·상속인 관계/나이/분할·비용 및 표시된 0원을 확인했습니다']].map(([k,title])=><p key={k}><label><input data-testid={'inheritance-'+k} type="checkbox" checked={d[k]} onChange={e=>change(k,e.target.checked,true)}/>{title}</label></p>)}</section>
      </fieldset>
      {(w.meta.validation.errors||[]).length>0&&<section aria-label="계산 전 확인"><p>마지막 저장 기준 확인 항목</p><ul>{w.meta.validation.errors.map((e,i)=><li key={i}>{e}</li>)}</ul></section>}
      <button disabled={busy||readonly} onClick={()=>act(save)}>입력 저장</button>
      <button disabled={busy||readonly} onClick={()=>act(async()=>{const saved=await save();if(!saved.validation.can_run)throw new Error('저장본의 보완 항목을 확인해 주세요.');await mutation(base+'/runs','POST',{revision_id:saved.revision_id,expected_input_hash:saved.input_hash});await load(saved.case_id);})}>저장하고 계산</button>
      <label>다시 열 입력 버전<input data-testid="inheritance-reopen-revision" value={revision} onChange={e=>setRevision(e.target.value)}/></label><button disabled={busy} onClick={()=>{if(!inheritanceDirty(w)||window.confirm('저장하지 않은 입력을 버리고 저장본을 여시겠습니까?'))act(()=>load(w.meta.case_id,revision));}}>저장본 다시 열기</button>
      {w.run&&<section className="ic-section" aria-label="저장된 상속 계산 결과"><h2>저장된 계산 결과{inheritanceDirty(w)?' · 수정 전 입력 기준':''}</h2><p>일반 재산가액 {Number(w.run.engine_request.estate_value).toLocaleString('ko-KR')}원</p>{w.run.engine_request.insurance_amount>0&&<p>별도 간주 보험금 {Number(w.run.engine_request.insurance_amount).toLocaleString('ko-KR')}원</p>}<output data-testid="inheritance-saved-tax">{Number(w.run.response_snapshot.calc['세액']).toLocaleString('ko-KR')}원</output><p>결과 ID {w.run.run_id} · 입력 ID {w.run.revision_id}</p><details><summary>저장된 계산 단계</summary><ul>{w.run.response_snapshot.calc['단계별계산'].map((r,i)=><li key={i}>{r['항목']} · {r['금액']} · {r['비고']}</li>)}</ul></details><ul aria-label="엔진 경고">{(w.run.response_snapshot.calc['경고사항']||[]).map((v,i)=><li key={i}>{typeof v==='string'?v:JSON.stringify(v)}</li>)}</ul></section>}
    </>}
  </div>;
}
window.JTInheritanceCases=JTInheritanceCases;

function JTInheritanceSources({api,clientId,base,busy,act,draft,onImport}) {
  const [catalog,setCatalog]=React.useState(null),[options,setOptions]=React.useState(null);
  const [pid,setPid]=React.useState(''),[period,setPeriod]=React.useState(''),[valuation,setValuation]=React.useState(''),[target,setTarget]=React.useState('');
  const [facts,setFacts]=React.useState(null),[reason,setReason]=React.useState(''),[confirmed,setConfirmed]=React.useState(false),[preview,setPreview]=React.useState(null);
  const selected=options?.ownership.items.find(x=>x.version===period),owner=selected?.ownerships.find(x=>x.person_id===draft.decedent_person_id);
  const change=fn=>{setPreview(null);setConfirmed(false);fn();};
  const selection=()=>({property_id:pid,ownership_id:owner?.id,ownership_version:period,ownership_history_confirmed:confirmed,
    fact_selection:facts,valuation_id:valuation,death_date:draft.death_date,decedent_person_id:draft.decedent_person_id,valuation_basis:'whole_property',values_confirmed:confirmed,reason});
  return <section className="ic-section" aria-label="상속 재산 원본 가져오기"><h2>재산·평가 원본 가져오기</h2>
    <p>등록된 주택·토지·상가·오피스텔의 상속개시일과 같은 평가기준일 자료를 선택합니다. 전체 재산 평가액에 피상속인의 당시 지분을 적용합니다. 자료의 법적 평가 적격성과 소유 변동 당일 선후는 직접 확인하세요. 채무·분할액·공제는 자동 변경하지 않습니다.</p>
    <button disabled={busy} data-testid="inheritance-source-list" onClick={()=>act(async()=>{setCatalog(await api(base+'/sources'));setPreview(null);})}>상속 재산 원본 조회</button>
    {catalog&&<fieldset disabled={busy}><legend>재산·평가 선택</legend>
      <label>반영 위치<select data-testid="inheritance-source-target" value={target} onChange={e=>change(()=>setTarget(e.target.value))}><option value="">새 재산 추가 / 같은 원본 재채택</option>{draft.assets.filter(a=>a.kind==='realestate').map(a=><option key={a.local_id} value={a.local_id}>{a.description||a.local_id} 교체</option>)}</select></label>
      <label>재산<select data-testid="inheritance-source-property" value={pid} onChange={e=>{const id=e.target.value;change(()=>{setPid(id);setOptions(null);setPeriod('');setValuation('');setFacts(null);});if(id)act(async()=>setOptions(await api(base+'/source-options?property_id='+id+'&death_date='+draft.death_date)));}}><option value="">선택</option>{catalog.properties.map(x=><option key={x.id} value={x.id}>{x.address} · {x.property_type}</option>)}</select></label>
      {options&&<>
        <label>상속개시일 소유 이력<select data-testid="inheritance-source-ownership" value={period} onChange={e=>change(()=>{setPeriod(e.target.value);setFacts(null);})}><option value="">선택</option>{options.ownership.items.filter(x=>x.eligible&&x.ownerships.some(o=>o.person_id===draft.decedent_person_id)).map(x=><option key={x.version} value={x.version}>{x.valid_from}~{x.valid_until||'현재'} · 피상속인 지분 {x.ownerships.find(o=>o.person_id===draft.decedent_person_id).share_ratio}{x.boundary_review_required?' · 변동 당일 선후 확인 필요':''}</option>)}</select></label>
        <label>상속개시일 평가자료<select data-testid="inheritance-source-valuation" value={valuation} onChange={e=>change(()=>setValuation(e.target.value))}><option value="">선택</option>{options.valuations.map(x=><option key={x.id} value={x.id}>{x.as_of_date} · {x.valuation_type} · {Number(x.amount).toLocaleString('ko-KR')}원 · {x.source}</option>)}</select></label>
        {!options.valuations.length&&<p>같은 평가기준일의 등록 자료가 없습니다. 원본 자료에서 확인한 평가액을 등록해야 합니다.</p>}
        <JTFactVersionPicker api={api} clientId={clientId} propertyId={pid} ownerId={owner?.person_id} eventDate={draft.death_date} valuationId={valuation} selection={facts} onChange={v=>{setFacts(v);setPreview(null);setConfirmed(false);}} disabled={busy}/>
        <label>평가액·지분 채택 근거<input data-testid="inheritance-source-reason" value={reason} maxLength={1000} onChange={e=>change(()=>setReason(e.target.value))}/></label>
        <label><input type="checkbox" data-testid="inheritance-source-confirm" checked={confirmed} onChange={e=>{setConfirmed(e.target.checked);setPreview(null);}}/>피상속인 소유·변동 당일 선후·전체 재산 평가액·상속개시일 평가 적격성·다른 행과 중복 없음을 확인했습니다.</label>
        <button disabled={busy||!owner||!valuation||!facts?.confirmed||!confirmed||!reason.trim()} data-testid="inheritance-source-preview" onClick={()=>act(async()=>setPreview(await api(base+'/source-preview',{method:'POST',body:JSON.stringify(selection())})))}>채택 미리보기</button>
        {preview&&<><p data-testid="inheritance-source-value">상속 지분 가액 {Number(preview.adopted_amount).toLocaleString('ko-KR')}원 · 피상속인 {preview.decedent.name}</p><button disabled={busy} data-testid="inheritance-source-import" onClick={()=>act(()=>onImport(selection(),preview,target))}>원본 채택·새 버전 저장</button></>}
      </>}
    </fieldset>}
  </section>;
}

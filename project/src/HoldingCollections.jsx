/* Annual totals reference saved individual runs; changing a selection never changes old results. */
function JTHoldingCollections({clientId,onExit}) {
  const blank = () => ({year:2026,run_ids:[],scope_confirmed:false,review_note:''});
  const [draft,setDraft]=React.useState(blank), [label,setLabel]=React.useState('주택별 재산세 묶음');
  const [meta,setMeta]=React.useState(null),[run,setRun]=React.useState(null),[baseline,setBaseline]=React.useState(()=>JSON.stringify({label:'주택별 재산세 묶음',draft:blank()}));
  const [items,setItems]=React.useState([]),[cursor,setCursor]=React.useState(null);
  const [histories,setHistories]=React.useState([]),[historyCursor,setHistoryCursor]=React.useState(null);
  const [revision,setRevision]=React.useState(''),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
  const lock=React.useRef(false), alive=React.useRef(true), keys=React.useRef({});
  const dirty=baseline!==JSON.stringify({label,draft});
  const readonly=!!meta?.read_only;
  const api=async(path,options={})=>{
    const control=new AbortController(),timer=setTimeout(()=>control.abort(),45000);
    try {
      const response=await fetch((window.JT_ENGINE_BASE||'http://127.0.0.1:8000').replace(/\/$/,'')+'/v1/holding-collections'+path,
        {...options,signal:control.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+jtGiftSession.token,...options.headers}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) {
        if(response.status===401) jtGiftSession.token='';
        throw new Error(response.status===401?'로그인이 필요합니다. 작업대로 돌아가 다시 로그인하세요.':
          response.status===409?'저장 버전이 달라졌습니다. 저장본을 다시 열어 확인하세요.':
          data.detail?.code==='DUPLICATE_SOURCE_CASE'?'한 사건의 서로 다른 계산 결과를 중복 선택했습니다. 이전 결과를 선택 해제하세요.':
          data.detail?.message||'요청을 처리하지 못했습니다. 선택한 사건과 저장 상태를 확인하세요.');
      }
      return data;
    } finally {clearTimeout(timer);}
  };
  const act=async fn=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try {await fn();} catch(e){if(alive.current)setError(e.name==='AbortError'||e instanceof TypeError?
      '연결이 끊겼습니다. 같은 버튼을 다시 누르면 중복 저장 없이 재시도합니다.':e.message);}
    finally{lock.current=false;if(alive.current)setBusy(false);}};
  const mutate=async(path,method,body,etag)=>{
    const key=JSON.stringify({path,method,body,etag});
    return api(path,{method,body:JSON.stringify(body),headers:{'Idempotency-Key':keys.current[key] ||= window.crypto.randomUUID(),...(etag?{'If-Match':etag}:{})}});
  };
  const list=async(more=false)=>{const d=await api('?client_id='+clientId+(more&&historyCursor?'&cursor='+historyCursor:''));
    if(alive.current){setHistories(v=>more?[...v,...d.items]:d.items);setHistoryCursor(d.next_cursor);}};
  const candidates=async(more=false)=>{const d=await api('/candidates?client_id='+clientId+'&year='+draft.year+(more&&cursor?'&cursor='+cursor:''));
    if(alive.current){setItems(v=>more?[...v,...d.items]:d.items);setCursor(d.next_cursor);}};
  React.useEffect(()=>{alive.current=true;act(async()=>{await list();await candidates();});return()=>{alive.current=false;};},[]);
  React.useEffect(()=>{const guard=e=>{if(dirty||lock.current){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty]);
  const discard=()=>!dirty||window.confirm('저장하지 않은 묶음 입력을 버리고 이동할까요?');
  const open=async(id,number='')=>{
    const s=await api('/'+id+(number?'?revision_number='+number:''));
    const r=s.last_successful_run_id?await api('/'+id+'/runs/'+s.last_successful_run_id):null;
    if(!alive.current)return;
    setMeta(s);setDraft(s.draft);setLabel(s.label);setRun(r);setRevision(number);
    setBaseline(JSON.stringify({label:s.label,draft:s.draft}));
  };
  const save=async()=>{
    const s=await mutate(meta?'/'+meta.collection_id:'',meta?'PUT':'POST',
      {label,draft,...(!meta?{client_id:clientId}:{})},meta?.etag);
    if(!alive.current)return s;
    setMeta(s);setRun(null);setRevision('');setBaseline(JSON.stringify({label,draft}));await list();return s;
  };
  const change=(key,value)=>setDraft(d=>({...d,[key]:value,...(['run_ids','review_note'].includes(key)?{scope_confirmed:false}:{})}));
  const money=v=>Number(v).toLocaleString('ko-KR')+'원';
  return <div className="jt-container" style={{maxWidth:1100,padding:'32px 20px'}}>
    <button disabled={busy} onClick={()=>{if(discard())onExit();}}>← 고객·사건 작업대</button>
    <h1>주택별 재산세 묶음</h1>
    <p>2026년 동일 소유자의 원본 연결된 일반 주택 결과를 모읍니다. 각 주택의 과세표준·세율·상한은 그대로 유지하고 저장된 세액만 더합니다. 종부세·토지·공동소유·1세대1주택 특례·지역자원시설세·고지/납부 내역은 포함하지 않습니다.</p>
    {error&&<p role="alert">{error}</p>}
    <section><h2>저장한 묶음 열기</h2>
      {histories.map(h=><button key={h.collection_id} disabled={busy} data-testid={'holding-collection-open-'+h.collection_id} onClick={()=>discard()?act(()=>open(h.collection_id)):undefined}>{h.label||'주택별 묶음'} · {h.year} · 버전 {h.revision}</button>)}
      {historyCursor&&<button disabled={busy} onClick={()=>act(()=>list(true))}>묶음 목록 더 보기</button>}
      <button disabled={busy} onClick={()=>{if(!discard())return;setMeta(null);setRun(null);setDraft(blank());setLabel('주택별 재산세 묶음');setBaseline(JSON.stringify({label:'주택별 재산세 묶음',draft:blank()}));setRevision('');keys.current={};}}>새 묶음</button>
    </section>
    <fieldset disabled={busy||readonly}><legend>주택별 저장 결과 선택 · 2026년</legend>
      <label>묶음 이름<input data-testid="holding-collection-label" maxLength={200} value={label} onChange={e=>setLabel(e.target.value)}/></label>
      <button onClick={()=>act(()=>candidates())}>보유세 사건 새로고침</button>
      <p>최신 입력의 계산이 끝난 사건을 선택합니다. 이미 저장한 묶음은 개별 사건을 수정하거나 새로 계산해도 자동으로 바뀌지 않습니다.</p>
      {items.map(s=><label key={s.id} style={{display:'block',padding:8}}>
        <input data-testid={'holding-collection-select-'+s.id} type="checkbox" disabled={!s.run_id} checked={draft.run_ids.includes(s.run_id)} onChange={e=>change('run_ids',e.target.checked?[...draft.run_ids,s.run_id]:draft.run_ids.filter(id=>id!==s.run_id))}/>
        {s.label||'보유세 사건'} · {s.assessment_date} · {s.taxpayer_name||'원본 소유자 확인 필요'} · 버전 {s.revision} {s.run_id?'':'· 최신 입력 계산 필요'}
      </label>)}
      {cursor&&<button onClick={()=>act(()=>candidates(true))}>보유세 사건 더 보기</button>}
      <h3>선택한 결과 {draft.run_ids.length}건</h3>
      <ul>{draft.run_ids.map(id=>{const s=(meta?.sources||[]).find(s=>s.run_id===id),candidate=items.find(s=>s.run_id===id);return <li key={id}>
        {s?.label||candidate?.label||'선택한 저장 결과'} · 버전 {s?.revision||candidate?.revision}
        {s&&!candidate&&' · 이전 저장 결과 유지'}<button data-testid={'holding-collection-remove-'+id} onClick={()=>change('run_ids',draft.run_ids.filter(v=>v!==id))}>선택 해제</button>
      </li>})}</ul>
      <label>과세단위·중복·누락 검토 근거<textarea data-testid="holding-collection-note" maxLength={1000} value={draft.review_note} onChange={e=>change('review_note',e.target.value)}/></label>
      <label style={{display:'block'}}><input data-testid="holding-collection-confirm" type="checkbox" checked={draft.scope_confirmed} onChange={e=>change('scope_confirmed',e.target.checked)}/>같은 소유자의 서로 다른 일반 주택이며 과세단위·중복·누락과 1세대1주택 특례 비대상을 확인했습니다.</label>
      <button data-testid="holding-collection-save" onClick={()=>act(save)}>묶음 입력 저장</button>
      <button data-testid="holding-collection-calculate" onClick={()=>act(async()=>{
        const s=dirty||!meta?await save():meta;if(!s.validation.can_run)throw new Error(s.validation.errors.join(' '));
        const r=await mutate('/'+s.collection_id+'/runs','POST',{revision_id:s.revision_id,expected_input_hash:s.input_hash});
        const detail=await api('/'+s.collection_id+'/runs/'+r.run_id);if(alive.current)setRun(detail);
      })}>저장하고 소계 계산</button>
    </fieldset>
    {meta&&<section><p>저장 버전 {meta.revision} {readonly?'· 과거 입력 읽기 전용':''}</p>
      {!meta.validation.can_run&&<ul>{meta.validation.errors.map(e=><li key={e}>{e}</li>)}</ul>}
      <label>다시 열 버전(비우면 최신)<input data-testid="holding-collection-revision" type="number" min="1" disabled={busy} value={revision} onChange={e=>setRevision(e.target.value)}/></label>
      <button data-testid="holding-collection-reopen" disabled={busy} onClick={()=>discard()?act(()=>open(meta.collection_id,revision)):undefined}>묶음 저장본 다시 열기</button>
    </section>}
    {run&&<section data-testid="holding-collection-result"><h2>저장된 주택별 재산세 소계</h2>
      {dirty&&<p role="status">현재 편집 입력과 다른 저장본의 결과입니다.</p>}
      <p>{run.response_snapshot.calc.notice}</p>
      <table><thead><tr><th>주택·버전</th><th>해당 주택 과세표준</th><th>본세</th><th>지방교육세</th><th>도시지역분</th><th>소계</th></tr></thead>
      <tbody>{run.response_snapshot.calc.rows.map(r=><tr key={r.run_id}><td>{r.address} · 버전 {r.revision}</td><td>{money(r.tax_base)}</td><td>{money(r.property_tax)}</td><td>{money(r.local_education_tax)}</td><td>{money(r.urban_tax)}</td><td>{money(r.total_tax)}</td></tr>)}</tbody></table>
      <p data-testid="holding-collection-total">본세 {money(run.response_snapshot.calc.totals.property_tax)} · 지방교육세 {money(run.response_snapshot.calc.totals.local_education_tax)} · 도시지역분 {money(run.response_snapshot.calc.totals.urban_tax)} · 합계 {money(run.response_snapshot.calc.totals.total_tax)}</p>
    </section>}
  </div>;
}
window.JTHoldingCollections=JTHoldingCollections;

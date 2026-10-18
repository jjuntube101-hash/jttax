/* Compare frozen individual runs; changed selections create new comparison revisions. */
function JTCaseComparisons({clientId,onExit}) {
  const blank = () => ({year:2026,run_ids:[],scope_confirmed:false,review_note:''});
  const [draft,setDraft]=React.useState(blank), [label,setLabel]=React.useState('사건 간 비교');
  const [meta,setMeta]=React.useState(null),[run,setRun]=React.useState(null),[baseline,setBaseline]=React.useState(()=>JSON.stringify({label:'사건 간 비교',draft:blank()}));
  const [items,setItems]=React.useState([]),[cursor,setCursor]=React.useState(null);
  const [histories,setHistories]=React.useState([]),[historyCursor,setHistoryCursor]=React.useState(null);
  const [revision,setRevision]=React.useState(''),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
  const lock=React.useRef(false), alive=React.useRef(true), keys=React.useRef({});
  const dirty=baseline!==JSON.stringify({label,draft});
  const readonly=!!meta?.read_only;
  const api=async(path,options={})=>{
    const control=new AbortController(),timer=setTimeout(()=>control.abort(),45000);
    try {
      const response=await fetch((window.JT_ENGINE_BASE||'http://127.0.0.1:8000').replace(/\/$/,'')+'/v1/case-comparisons'+path,
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
  const discard=()=>!dirty||window.confirm('저장하지 않은 비교 입력을 버리고 이동할까요?');
  const open=async(id,number='')=>{
    const s=await api('/'+id+(number?'?revision_number='+number:''));
    const r=s.last_successful_run_id?await api('/'+id+'/runs/'+s.last_successful_run_id):null;
    if(!alive.current)return;
    setMeta(s);setDraft(s.draft);setLabel(s.label);setRun(r);setRevision(number);
    setBaseline(JSON.stringify({label:s.label,draft:s.draft}));
  };
  const save=async()=>{
    const s=await mutate(meta?'/'+meta.comparison_id:'',meta?'PUT':'POST',
      {label,draft,...(!meta?{client_id:clientId}:{})},meta?.etag);
    if(!alive.current)return s;
    setMeta(s);setRun(null);setRevision('');setBaseline(JSON.stringify({label,draft}));await list();return s;
  };
  const change=(key,value)=>setDraft(d=>({...d,[key]:value,...(['run_ids','review_note'].includes(key)?{scope_confirmed:false}:{})}));
  const fieldName=k=>({'value':'증여가액','appraisal_fee':'감정평가수수료','non_taxable':'비과세 금액','foreign_tax_paid':'외국납부세액','standard_value':'시가표준액','prior_year_tax':'전년 본세 상당액','prior_standard_value':'전년 시가표준액','engine.housing_values':'주택 공시가격','engine.property_tax_paid':'재산세 본세','engine.property_tax_base':'재산세 과표','cap.prior_property_tax':'전년 재산세 상당액','cap.prior_comprehensive_tax':'전년 종부세 상당액'}[k]||k);
  const money=v=>Number(v).toLocaleString('ko-KR')+'원';
  return <div className="jt-container" style={{maxWidth:1100,padding:'32px 20px'}}>
    <button disabled={busy} onClick={()=>{if(discard())onExit();}}>← 고객·사건 작업대</button>
    <h1>사건 간 비교</h1>
    <p>원본이 연결된 일반 주택 증여(단일·다재산)끼리 또는 같은 세목의 단독 주택 보유세끼리 비교합니다. 같은 재산·지분·당사자·사건일·평가기준일·세액 범위와 계산 버전이 필요합니다. 첫 선택이 기준 사건입니다. 양도·상속·서로 다른 세목의 총세부담 비교는 아직 지원하지 않습니다.</p>
    {error&&<p role="alert">{error}</p>}
    <section><h2>저장한 비교 열기</h2>
      {histories.map(h=><button key={h.comparison_id} disabled={busy} data-testid={'case-comparison-open-'+h.comparison_id} onClick={()=>discard()?act(()=>open(h.comparison_id)):undefined}>{h.label||'주택별 비교'} · {h.year} · 버전 {h.revision}</button>)}
      {historyCursor&&<button disabled={busy} onClick={()=>act(()=>list(true))}>비교 목록 더 보기</button>}
      <button disabled={busy} onClick={()=>{if(!discard())return;setMeta(null);setRun(null);setDraft(blank());setLabel('사건 간 비교');setBaseline(JSON.stringify({label:'사건 간 비교',draft:blank()}));setRevision('');keys.current={};}}>새 비교</button>
    </section>
    <fieldset disabled={busy||readonly}><legend>비교할 저장 결과 선택 · 2026년</legend>
      <label>비교 이름<input data-testid="case-comparison-label" maxLength={200} value={label} onChange={e=>setLabel(e.target.value)}/></label>
      <button onClick={()=>act(()=>candidates())}>사건 새로고침</button>
      <p>최신 입력의 계산이 끝난 사건을 선택합니다. 이미 저장한 비교는 개별 사건을 수정하거나 새로 계산해도 자동으로 바뀌지 않습니다.</p>
      {items.map(s=><label key={s.id} style={{display:'block',padding:8}}>
        <input data-testid={'case-comparison-select-'+s.id} type="checkbox" disabled={!s.run_id} checked={draft.run_ids.includes(s.run_id)} onChange={e=>change('run_ids',e.target.checked?[...draft.run_ids,s.run_id]:draft.run_ids.filter(id=>id!==s.run_id))}/>
        {s.label||'사건'} · {s.scenario_type} · {s.assessment_date} · {s.taxpayer_name||'원본 소유자 확인 필요'} · 버전 {s.revision} {s.run_id?'':'· 최신 입력 계산 필요'}
      </label>)}
      {cursor&&<button onClick={()=>act(()=>candidates(true))}>사건 더 보기</button>}
      <h3>선택한 결과 {draft.run_ids.length}건</h3>
      <ul>{draft.run_ids.map(id=>{const s=(meta?.sources||[]).find(s=>s.run_id===id),candidate=items.find(s=>s.run_id===id);return <li key={id}>
        {s?.label||candidate?.label||'선택한 저장 결과'} · 버전 {s?.revision||candidate?.revision}
        {s&&!candidate&&' · 이전 저장 결과 유지'}<button data-testid={'case-comparison-remove-'+id} onClick={()=>change('run_ids',draft.run_ids.filter(v=>v!==id))}>선택 해제</button>
      </li>})}</ul>
      <label>비교 목적·입력 가정 차이와 검토 근거<textarea data-testid="case-comparison-note" maxLength={1000} value={draft.review_note} onChange={e=>change('review_note',e.target.value)}/></label>
      <label style={{display:'block'}}><input data-testid="case-comparison-confirm" type="checkbox" checked={draft.scope_confirmed} onChange={e=>change('scope_confirmed',e.target.checked)}/>같은 재산·지분·당사자·사건일·평가기준일·세액 범위이며 다른 입력 가정과 원본 경고를 검토했습니다.</label>
      <button data-testid="case-comparison-save" onClick={()=>act(save)}>비교 입력 저장</button>
      <button data-testid="case-comparison-calculate" onClick={()=>act(async()=>{
        const s=dirty||!meta?await save():meta;if(!s.validation.can_run)throw new Error(s.validation.errors.join(' '));
        const r=await mutate('/'+s.comparison_id+'/runs','POST',{revision_id:s.revision_id,expected_input_hash:s.input_hash});
        const detail=await api('/'+s.comparison_id+'/runs/'+r.run_id);if(alive.current)setRun(detail);
      })}>저장하고 비교</button>
    </fieldset>
    {meta&&<section><p>저장 버전 {meta.revision} {readonly?'· 과거 입력 읽기 전용':''}</p>
      {!meta.validation.can_run&&<ul>{meta.validation.errors.map(e=><li key={e}>{e}</li>)}</ul>}
      <label>다시 열 버전(비우면 최신)<input data-testid="case-comparison-revision" type="number" min="1" disabled={busy} value={revision} onChange={e=>setRevision(e.target.value)}/></label>
      <button data-testid="case-comparison-reopen" disabled={busy} onClick={()=>discard()?act(()=>open(meta.comparison_id,revision)):undefined}>비교 저장본 다시 열기</button>
    </section>}
    {meta?.validation?.checked_contracts?.length>0&&<section aria-label="저장된 비교 기준"><h2>저장된 비교 기준</h2>{meta.validation.checked_contracts.map((c,i)=><p key={i}>{i+1}. {c.assets?c.assets.length+'개 재산':c.address} {c.assets?'':'· 지분 '+c.identity.share} · {Object.entries(c.party_names).map(([k,v])=>({donor:'증여자',donee:'수증자',owner:'소유자'}[k]||k)+': '+v).join(' / ')} · 사건일 {c.identity.event_date} {c.identity.valuation_date?'· 평가일 '+c.identity.valuation_date:''} · {c.identity.tax_scope}</p>)}
      {meta.validation.checked_contracts.map((c,i)=>c.assets&&<div key={i} data-testid={'comparison-assets-'+i}><h3>{i+1}번 사건 재산별 범위</h3><table><thead><tr><th>재산ID·주소</th><th>증여/소유 지분</th><th>평가 기준·출처</th><th>채택 가액</th></tr></thead><tbody>{c.assets.map(a=><tr key={a.property_id}><td>{a.property_id}<br/>{a.address}</td><td>{a.share} / {a.owner_share}</td><td>{a.valuation_date} · {a.valuation_type}<br/>{a.valuation_source}</td><td>{money(a.value)}</td></tr>)}</tbody></table></div>)}
    </section>}
    {run&&<section data-testid="case-comparison-result"><h2>저장된 사건 비교</h2>
      {dirty&&<p role="status">현재 편집 입력과 다른 저장본의 결과입니다.</p>}
      <p>{run.response_snapshot.calc.notice}</p>{run.response_snapshot.calc.identity.assets&&<p>증여세는 사건 전체에 대한 계산액입니다. 재산별 가액 차이를 재산별 세액으로 배분하지 않습니다.</p>}<p>{run.response_snapshot.calc.identity.tax_scope}</p>
      <table><thead><tr><th>사건·버전</th><th>채택 가액</th><th>세액 구성</th><th>계산액</th><th>첫 사건 대비 차이</th><th>입력 차이·경고</th></tr></thead><tbody>
      {run.response_snapshot.calc.rows.map(r=><tr key={r.run_id}><td>{r.label} · 버전 {r.revision}</td><td>{money(r.value)}{r.asset_value_differences&&<ul>{r.asset_value_differences.map(a=><li key={a.property_id}>{a.property_id}: {money(a.alternative)} · 가액 차이 {money(a.delta)}</li>)}</ul>}</td><td>{Object.entries(r.components).map(([k,v])=><p key={k}>{k} {money(v)}</p>)}</td><td>{money(r.total)}</td><td>{money(r.delta)}</td><td><ul>{r.input_differences.map(x=><li key={x.field}>{fieldName(x.field)}: {JSON.stringify(x.baseline)} → {JSON.stringify(x.alternative)}</li>)}</ul><ul>{r.source_warnings.map((v,i)=><li key={i}>{typeof v==='string'?v:JSON.stringify(v)}</li>)}</ul></td></tr>)}
      </tbody></table>
    </section>}
  </div>;
}
window.JTCaseComparisons=JTCaseComparisons;

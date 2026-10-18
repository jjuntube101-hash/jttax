/* Compare frozen individual runs; changed selections create new comparison revisions. */
function JTCaseComparisons({clientId,onExit}) {
  const blank = () => ({year:2026,cash_bindings:[],run_ids:[],scope_confirmed:false,review_note:'',equity_identity_confirmed:false,equity_identity_note:''});
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
  const change=(key,value)=>setDraft(d=>({...d,[key]:value,...(['run_ids','review_note','equity_identity_note'].includes(key)?{scope_confirmed:false,equity_identity_confirmed:false}:{}),...(key==='run_ids'?{cash_bindings:(d.cash_bindings||[]).filter(b=>value.includes(b.run_id))}:{})}));
  const cashBinding=(source,asset)=> (draft.cash_bindings||[]).find(b=>b.run_id===source.run_id&&b.asset_id===asset.asset_id);
  const editCash=(source,asset,key,value)=>setDraft(d=>{
    const rows=d.cash_bindings||[],old=rows.find(b=>b.run_id===source.run_id&&b.asset_id===asset.asset_id)||{run_id:source.run_id,asset_id:asset.asset_id,source_id:'',source_note:'',ownership_confirmed:false};
    const next={...old,[key]:value,...(key!=='ownership_confirmed'?{ownership_confirmed:false}:{})};
    return {...d,scope_confirmed:false,cash_bindings:[...rows.filter(b=>!(b.run_id===source.run_id&&b.asset_id===asset.asset_id)),next]};
  });
  const fieldName=k=>({'value':'증여가액','appraisal_fee':'감정평가수수료','non_taxable':'비과세 금액','foreign_tax_paid':'외국납부세액','standard_value':'시가표준액','prior_year_tax':'전년 본세 상당액','prior_standard_value':'전년 시가표준액','engine.housing_values':'주택 공시가격','engine.property_tax_paid':'재산세 본세','engine.property_tax_base':'재산세 과표','cap.prior_property_tax':'전년 재산세 상당액','cap.prior_comprehensive_tax':'전년 종부세 상당액'}[k]||k);
  const money=v=>Number(v).toLocaleString('ko-KR')+'원';
  return <div className="jt-container" style={{maxWidth:1100,padding:'32px 20px'}}>
    <button disabled={busy} onClick={()=>{if(discard())onExit();}}>← 고객·사건 작업대</button>
    <h1>사건 간 비교</h1>
    <p>원본이 연결된 주택·검토된 토지/상가·저장 주식평가를 채택한 일반 증여와, 출처·기준일이 저장된 현금을 함께 포함한 혼합 증여끼리 또는 같은 세목의 단독 주택 보유세끼리 비교합니다. 같은 재산·지분·당사자·사건일·평가기준일·세액 범위와 계산 버전이 필요합니다. 첫 선택이 기준 사건입니다. 주식은 같은 평가 사건을 원본으로 쓰고 회사·주식 종류·이전 권한을 확인해야 합니다. 현금은 아래 대응표에서 같은 이전 대상에 공통 원본ID를 지정하고 증빙을 검토합니다. 서로 다른 토지·건물 포함 범위, 같은 이름의 별도 평가 사건, 양도·상속·세목 간 총세부담 비교는 아직 지원하지 않습니다.</p>
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
        {s.label||'사건'} · {s.scenario_type} · {s.assessment_date} · {s.taxpayer_name||'저장 후 당사자 ID 확인'} · 버전 {s.revision} {s.run_id?'':'· 최신 입력 계산 필요'}
      </label>)}
      {cursor&&<button onClick={()=>act(()=>candidates(true))}>사건 더 보기</button>}
      <h3>선택한 결과 {draft.run_ids.length}건</h3>
      <ul>{draft.run_ids.map(id=>{const s=(meta?.sources||[]).find(s=>s.run_id===id),candidate=items.find(s=>s.run_id===id);return <li key={id}>
        {s?.label||candidate?.label||'선택한 저장 결과'} · 버전 {s?.revision||candidate?.revision}
        {s&&!candidate&&' · 이전 저장 결과 유지'}<button data-testid={'case-comparison-remove-'+id} onClick={()=>change('run_ids',draft.run_ids.filter(v=>v!==id))}>선택 해제</button>
      </li>})}</ul>
      <section aria-label="현금 원본 대응표"><h3>현금 원본 대응표</h3>
        <p>사건을 선택한 뒤 아래 버튼으로 저장된 재산 행을 불러오세요. 같은 현금 이전 대상을 비교할 때만 공통 원본ID를 선택합니다. 이 ID는 이번 비교의 사용자 확인용이며 은행·계좌 원본ID가 아닙니다. 금액·행 순서로 자동 연결하지 않습니다.</p>
        <button data-testid="comparison-load-assets" onClick={()=>act(save)}>선택한 재산 불러오기·입력 저장</button>
        {(meta?.sources||[]).filter(src=>draft.run_ids.includes(src.run_id)).flatMap(src=>(src.case_input?.assets||[]).filter(a=>a.kind==='cash').map(a=>{
          const b=cashBinding(src,a)||{};const key=src.run_id+'-'+a.asset_id;
          const choices=[...new Set((draft.cash_bindings||[]).map(v=>v.source_id).filter(Boolean))];
          return <div key={key} data-testid={'cash-row-'+key}><p>{src.label||'증여 사건'} · 결과 {src.run_id}<br/>재산행 {a.asset_id} · {a.local_id} · {money(a.adopted_value_krw)} · {a.valuation_as_of}<br/>{a.value_source}</p>
            <label>공통 현금 원본ID<input data-testid={'cash-id-'+key} value={b.source_id||''} onChange={e=>editCash(src,a,'source_id',e.target.value)}/></label>
            <button data-testid={'cash-new-'+key} onClick={()=>editCash(src,a,'source_id',window.crypto.randomUUID())}>새 현금 원본ID 만들기</button>
            <label>확인한 기존 원본ID 선택<select data-testid={'cash-select-'+key} value={b.source_id||''} onChange={e=>editCash(src,a,'source_id',e.target.value)}><option value="">직접 검토 후 선택</option>{choices.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
            <label>동일 이전 대상·증여자 이전 권한 근거<textarea data-testid={'cash-note-'+key} maxLength={1000} value={b.source_note||''} onChange={e=>editCash(src,a,'source_note',e.target.value)}/></label>
            <label><input data-testid={'cash-confirm-'+key} type="checkbox" checked={!!b.ownership_confirmed} onChange={e=>editCash(src,a,'ownership_confirmed',e.target.checked)}/>증빙상 동일 현금 이전 대상과 전액 이전 권한을 확인했습니다. 계좌 전체 잔액·소유지분을 의미하지 않습니다.</label>
          </div>;
        }))}
      </section>
      <label>비교 목적·입력 가정 차이와 검토 근거<textarea data-testid="case-comparison-note" maxLength={1000} value={draft.review_note} onChange={e=>change('review_note',e.target.value)}/></label>
      <label>주식 비교의 회사·주식 종류·소유/이전 권한 검토 근거<textarea data-testid="case-comparison-equity-note" maxLength={1000} value={draft.equity_identity_note||''} onChange={e=>change('equity_identity_note',e.target.value)}/></label>
      <label style={{display:'block'}}><input data-testid="case-comparison-equity-confirm" type="checkbox" checked={!!draft.equity_identity_confirmed} onChange={e=>change('equity_identity_confirmed',e.target.checked)}/>주식 비교: 평가 사건별로 동일 회사·주식 종류이며 증여자가 해당 주식을 이전할 권한이 있음을 주주명부·계약 등으로 확인했습니다. 회사명 일치만으로 판단하지 않았습니다.</label>
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
    {meta?.validation?.checked_contracts?.length>0&&<section aria-label="저장된 비교 기준"><h2>저장된 비교 기준</h2>{meta.validation.checked_contracts.map((c,i)=><p key={i}>{i+1}. {c.cash_assets?(c.assets.length+c.equity_assets.length+c.cash_assets.length)+'개 재산':c.assets?c.assets.length+'개 재산':c.address} {c.assets||c.equity_assets?'':'· 지분 '+c.identity.share} · {Object.entries(c.party_names).map(([k,v])=>({donor:'증여자',donee:'수증자',owner:'소유자'}[k]||k)+': '+v+(typeof c.identity.parties?.[k]==='string'&&c.identity.parties[k]!==v?' · '+c.identity.parties[k]:'')).join(' / ')} · 사건일 {c.identity.event_date} {c.identity.valuation_date?'· 평가일 '+c.identity.valuation_date:''} · {c.identity.tax_scope}</p>)}
      {meta.validation.checked_contracts.map((c,i)=>c.assets?.length>0&&<div key={i} data-testid={'comparison-assets-'+i}><h3>{i+1}번 사건 재산별 범위</h3><table><thead><tr><th>재산ID·주소</th><th>증여/소유 지분</th><th>평가 기준·출처</th><th>채택 가액</th></tr></thead><tbody>{c.assets.map(a=><tr key={a.property_id}><td>{a.property_id}<br/>{a.address}{a.nonhousing_review&&<p>{a.property_type} · {{land_only:'토지만',building_only:'건물만',land_and_building:'토지·건물 함께'}[a.coverage]}<br/>{a.nonhousing_review.scope_note}<br/>{a.nonhousing_review.review_note}</p>}</td><td>{a.share} / {a.owner_share}</td><td>{a.valuation_date} · {a.valuation_type}<br/>{a.valuation_source}</td><td>{money(a.value)}</td></tr>)}</tbody></table></div>)}
      {meta.validation.checked_contracts.map((c,i)=>c.equity_assets?.length>0&&<div key={i} data-testid={'comparison-equities-'+i}><h3>{i+1}번 사건 주식 원본·범위</h3><p>당사자 ID는 계산 당시 저장본 기준입니다. 이전 주식수/발행주식수는 이전 대상 비율이며 증여자의 전체 보유비율을 뜻하지 않습니다.</p><table><thead><tr><th>회사·평가 사건 ID</th><th>이전/발행 주식수·권한 근거</th><th>평가일·결과·입력 버전·해시</th><th>주당/채택 가액</th></tr></thead><tbody>{c.equity_assets.map(a=><tr key={a.equity_case_id}><td>{a.company_name}<br/>{a.equity_case_id}</td><td>{a.share_fraction}<br/>{a.ownership_source}</td><td>{a.valuation_date}<br/>{a.run_id}<br/>{a.revision_id}<br/>{a.input_hash}</td><td>{money(a.unit_value)} / {money(a.value)}</td></tr>)}</tbody></table><p>동일성 검토: {meta.draft.equity_identity_note}</p></div>)}
      {meta.validation.checked_contracts.map((c,i)=>c.cash_assets?.length>0&&<div key={i} data-testid={'comparison-cash-'+i}><h3>{i+1}번 사건 현금 범위</h3><table><thead><tr><th>공통 원본ID·저장 재산행</th><th>기준일·이전 범위</th><th>출처·동일성 검토</th><th>채택 가액</th></tr></thead><tbody>{c.cash_assets.map(a=><tr key={a.cash_source_id}><td>{a.cash_source_id}<br/>{a.asset_id}</td><td>{a.valuation_date}<br/>{a.share_basis}</td><td>{a.value_source}<br/>{a.source_note}</td><td>{money(a.value)}</td></tr>)}</tbody></table></div>)}
    </section>}
    {run&&<section data-testid="case-comparison-result"><h2>저장된 사건 비교</h2>
      {dirty&&<p role="status">현재 편집 입력과 다른 저장본의 결과입니다.</p>}
      <p>{run.response_snapshot.calc.notice}</p>{(run.response_snapshot.calc.identity.assets||run.response_snapshot.calc.identity.equities)&&<p>증여세는 사건 전체에 대한 계산액입니다. 재산별 가액 차이를 재산별 세액으로 배분하지 않습니다.</p>}<p>{run.response_snapshot.calc.identity.tax_scope}</p>
      <table><thead><tr><th>사건·버전</th><th>채택 가액</th><th>세액 구성</th><th>계산액</th><th>첫 사건 대비 차이</th><th>입력 차이·경고</th></tr></thead><tbody>
      {run.response_snapshot.calc.rows.map(r=><tr key={r.run_id}><td>{r.label} · 버전 {r.revision}</td><td>{money(r.value)}{r.asset_value_differences&&<ul>{r.asset_value_differences.map(a=><li key={a.property_id}>{a.property_id}: {money(a.alternative)} · 가액 차이 {money(a.delta)}</li>)}</ul>}{r.equity_value_differences&&<ul>{r.equity_value_differences.map(a=><li key={a.equity_case_id}>{a.equity_case_id}: {money(a.alternative)} · 주식 가액 차이 {money(a.delta)}<ul>{a.valuation_input_differences.map(x=><li key={x.field}>평가 입력 {x.field}: {JSON.stringify(x.baseline)} → {JSON.stringify(x.alternative)}</li>)}</ul></li>)}</ul>}{r.cash_value_differences&&<ul>{r.cash_value_differences.map(a=><li key={a.cash_source_id}>{a.cash_source_id}: {money(a.alternative)} · 현금 가액 차이 {money(a.delta)}</li>)}</ul>}</td><td>{Object.entries(r.components).map(([k,v])=><p key={k}>{k} {money(v)}</p>)}</td><td>{money(r.total)}</td><td>{money(r.delta)}</td><td><ul>{r.input_differences.map(x=><li key={x.field}>{fieldName(x.field)}: {JSON.stringify(x.baseline)} → {JSON.stringify(x.alternative)}</li>)}</ul><ul>{r.source_warnings.map((v,i)=><li key={i}>{typeof v==='string'?v:JSON.stringify(v)}</li>)}</ul></td></tr>)}
      </tbody></table>
    </section>}
  </div>;
}
window.JTCaseComparisons=JTCaseComparisons;

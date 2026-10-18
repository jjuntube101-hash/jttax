/* Annual totals reference saved individual runs; changing a selection never changes old results. */
function JTTransferAnnual({clientId,onExit}) {
  const blank = () => ({year:2026,run_ids:[],resident_confirmed:false,scope_confirmed:false,review_note:'',credits:[],credits_confirmed:false,surcharge_reviews:[]});
  const [draft,setDraft]=React.useState(blank), [label,setLabel]=React.useState('연간 양도 합산');
  const [meta,setMeta]=React.useState(null),[run,setRun]=React.useState(null),[baseline,setBaseline]=React.useState(null);
  const [items,setItems]=React.useState([]),[cursor,setCursor]=React.useState(null);
  const [histories,setHistories]=React.useState([]),[historyCursor,setHistoryCursor]=React.useState(null);
  const [revision,setRevision]=React.useState(''),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
  const lock=React.useRef(false), alive=React.useRef(true), keys=React.useRef({});
  const dirty=baseline!==JSON.stringify({label,draft});
  const readonly=!!meta?.read_only;
  const api=async(path,options={})=>{
    const control=new AbortController(),timer=setTimeout(()=>control.abort(),45000);
    try {
      const response=await fetch((window.JT_ENGINE_BASE||'http://127.0.0.1:8000').replace(/\/$/,'')+'/v1/transfer-annual'+path,
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
  const discard=()=>!dirty||window.confirm('저장하지 않은 합산 입력을 버리고 이동할까요?');
  const open=async(id,number='')=>{
    const s=await api('/'+id+(number?'?revision_number='+number:''));
    const r=s.last_successful_run_id?await api('/'+id+'/runs/'+s.last_successful_run_id):null;
    if(!alive.current)return;
    setMeta(s);setDraft(s.draft);setLabel(s.label);setRun(r);setRevision(number);
    setBaseline(JSON.stringify({label:s.label,draft:s.draft}));
  };
  const save=async()=>{
    const s=await mutate(meta?'/'+meta.annual_id:'',meta?'PUT':'POST',
      {label,draft,...(!meta?{client_id:clientId}:{})},meta?.etag);
    if(!alive.current)return s;
    setMeta(s);setRun(null);setRevision('');setBaseline(JSON.stringify({label,draft}));await list();return s;
  };
  const change=(key,value)=>setDraft(d=>({...d,[key]:value,
    ...(['year','run_ids'].includes(key)?{scope_confirmed:false,credits_confirmed:false,...(d.split_review?{split_review:{...d.split_review,run_ids:(key==='run_ids'?value:d.run_ids).filter(id=>[...items,...(meta?.sources||[])].some(x=>x.run_id===id&&x.mapper_version==='transfer-master/11')),annual_scope_rechecked:false,income_before_basic_deduction_confirmed:false,no_duplicate_lots_confirmed:false}}:{}),surcharge_reviews:(d.surcharge_reviews||[]).map(r=>({...r,housing_count_confirmed:false,no_other_exclusion_confirmed:false,transition_not_applicable:false}))}:{}),
    ...(key==='credits'?{credits_confirmed:false}:{})}));
  const editSplit=(key,value)=>change('split_review',{...draft.split_review,[key]:value,...(key==='note'?{annual_scope_rechecked:false,income_before_basic_deduction_confirmed:false,no_duplicate_lots_confirmed:false}:{})});
  const editCredit=(index,key,value)=>change('credits',(draft.credits||[]).map((c,i)=>i===index?{...c,[key]:value}:c));
  const editReview=(index,key,value)=>change('surcharge_reviews',(draft.surcharge_reviews||[]).map((r,i)=>i===index?{...r,[key]:value,...(key==='note'?{housing_count_confirmed:false,no_other_exclusion_confirmed:false,transition_not_applicable:false}:{})}:r));
  const selected=(meta?.sources||[]).filter(s=>draft.run_ids.includes(s.run_id));
  const money=v=>Number(v).toLocaleString('ko-KR')+'원';
  return <div className="jt-container" style={{maxWidth:1100,padding:'32px 20px'}}>
    <button disabled={busy} onClick={()=>{if(discard())onExit();}}>← 고객·사건 작업대</button>
    <h1>연간 양도 합산</h1>
    <p>검토를 마친 2026-07-01~2026-10-17 토지·상가의 2년 이상 보유·양의 기본세율 소득도 합산합니다. 비주택끼리 또는 기본세율 과세 주택과 합산하며 연간 기본공제는 한 번만 적용합니다. 동일 취득분·정확한 원 단위 안분을 검토한 일부지분 사건도 연결하며, 저장된 지분 소득에 지분율을 다시 곱하지 않습니다. 같은 재산의 분할 사건은 중복·분할 거래 검토가 필요하여 제외합니다. 비주택이 포함된 단기·중과·차손·0원 조합은 보류합니다.</p>
    <p>2026년 거주자의 기본세율 및 단기 60%·70% 주택 사건을 지원합니다. 단기·차손은 매매 취득·비조정지역·2주택 이상 일반 양도를 지원합니다. 조정지역 다주택은 별도 검토 후 +20%p·+30%p와 단기 60%·70% 동시 적용도 지원합니다. 동일한 단기·중과 조합은 통산·공제 후 두 세액을 비교합니다. 후보 일부가 겹쳐도 공통 단기세율이 전체 가능한 과표 범위에서 우선이면 같은 세율로 묶습니다. 공통 중과 후보만 겹치는 경우에는 각 중첩 사건이 연간 차손과 기본공제를 모두 부담해도 중과 우선이 유지될 때 같은 중과세율로 묶습니다. 0원 사건은 세율 그룹을 연결하지 않습니다. 중첩 차손은 공제 대상 그룹이 하나이고 사건별 배분이 원 단위까지 같거나 전체 소득을 소진하면 세율을 임의로 선택하지 않고 계산합니다. 그 밖에 세율 선택에 따라 배분이 달라지는 차손·공통 후보 없는 교차 조합·비과세·감면·이월과세 및 같은 재산의 복수 사건은 계산을 보류합니다.</p>
    {error&&<p role="alert">{error}</p>}
    <section><h2>저장한 합산 열기</h2>
      {histories.map(h=><button key={h.annual_id} disabled={busy} data-testid={'annual-open-'+h.annual_id} onClick={()=>discard()?act(()=>open(h.annual_id)):undefined}>{h.label||'연간 합산'} · {h.year} · 버전 {h.revision}</button>)}
      {historyCursor&&<button disabled={busy} onClick={()=>act(()=>list(true))}>합산 목록 더 보기</button>}
      <button disabled={busy} onClick={()=>{if(!discard())return;setMeta(null);setRun(null);setDraft(blank());setLabel('연간 양도 합산');setBaseline(null);setRevision('');keys.current={};}}>새 합산</button>
    </section>
    <fieldset disabled={busy||readonly}><legend>합산 대상 선택</legend>
      <label>합산 이름 <input data-testid="annual-label" value={label} maxLength={200} onChange={e=>setLabel(e.target.value)}/></label>
      <label>귀속 연도 <input data-testid="annual-year" type="number" min="1900" max="2200" value={draft.year} onChange={e=>{change('year',Number(e.target.value));change('run_ids',[]);setItems([]);}}/></label>
      <button onClick={()=>act(()=>candidates())}>양도 사건 새로고침</button>
      <p>현재 저장 버전의 계산 결과를 선택합니다. 재계산 전 사건은 선택할 수 없습니다. 개별 사건을 수정해도 아래에 이미 저장한 결과는 자동 교체되지 않습니다.</p>
      {items.map(s=><label key={s.id} style={{display:'block',padding:8}}>
        <input data-testid={'annual-select-'+s.id} type="checkbox" disabled={!s.run_id} checked={draft.run_ids.includes(s.run_id)}
          onChange={e=>change('run_ids',e.target.checked?[...draft.run_ids,s.run_id]:draft.run_ids.filter(id=>id!==s.run_id))}/>
        {s.label||'양도 사건'} · {s.transfer_date} · {s.taxpayer_name||'납세자 확인 필요'} · 버전 {s.revision} {s.run_id?'':'· 최신 입력 계산 필요'}
      </label>)}
      {cursor&&<button onClick={()=>act(()=>candidates(true))}>양도 사건 더 보기</button>}
      <h3>선택한 저장 결과 {draft.run_ids.length}건</h3>
      <p>공제는 양도일 순서로 배분합니다. 양도일이 같으면 아래 선택 순서를 사용하므로 실제 거래 순서에 맞춰 정렬하세요.</p>
      <ol>{draft.run_ids.map((id,index)=>{const s=selected.find(v=>v.run_id===id),c=items.find(v=>v.run_id===id);return <li key={id}>
        {s?.label||c?.label||'선택 결과'} · 버전 {s?.revision||c?.revision} · {s?.engine_request?.transfer_date||c?.transfer_date}
        {s&&!items.some(v=>v.run_id===id)&&' · 이전에 저장한 결과 유지'}
        {s?.mapper_version==='transfer-master/11'&&<div data-testid={'annual-split-source-'+id}><p>재산 {s.master_snapshot.property.id} · 납세자 {s.master_snapshot.ownership.person_id} · 취득분 원본 버전 {s.master_snapshot.original_revision}</p>{s.engine_request.rows.map(l=><p key={l.lot_id}>취득분 {l.lot_id} · 취득일 {l.acquisition_date} · 양도 지분 {l.transfer_share} / 취득 지분 {l.acquired_share}</p>)}</div>}
        {s?.share_review&&<p data-testid={'annual-share-'+id}>재산 {s.master_snapshot.property.id} · 양도 지분 {s.master_snapshot.selection.transfer_share} / 소유 지분 {s.master_snapshot.ownership.share_ratio} · 귀속 양도가액 {money(s.engine_request.transfer_price)} · 검토 근거: {s.share_review.note}</p>}
        <button disabled={index===0} onClick={()=>{const v=[...draft.run_ids];[v[index-1],v[index]]=[v[index],v[index-1]];change('run_ids',v);}}>위로</button>
        <button onClick={()=>change('run_ids',draft.run_ids.filter(v=>v!==id))}>선택 해제</button>
      </li>;})}</ol>
      <section aria-label="분할취득 연간 범위 재검토"><h3>분할취득 저장 결과 연결</h3>
      <p>분할취득 단건 결과의 ‘다른 연간 양도 없음’ 확인은 그대로 보존합니다. 현재 합산 대상과 기본공제 사용을 새로 검토한 뒤 취득분별 기본공제 전 소득만 가져옵니다. 일반 비주택·서로 다른 재산·각 취득분 2년 이상·양의 기본세율 소득만 지원합니다.</p>
      <label><input data-testid="annual-split-enable" type="checkbox" checked={!!draft.split_review} onChange={e=>change('split_review',e.target.checked?{schema_version:'annual-split-review/1',run_ids:draft.run_ids.filter(id=>[...items,...(meta?.sources||[])].some(x=>x.run_id===id&&x.mapper_version==='transfer-master/11')),annual_scope_rechecked:false,income_before_basic_deduction_confirmed:false,no_duplicate_lots_confirmed:false,note:''}:null)}/>분할취득 연간 재검토 사용</label>
      {draft.split_review&&<><p>검토 대상 분할취득 결과 {draft.split_review.run_ids.length}건</p>
      <label>연간 대상·취득분·공제 검토 근거<textarea data-testid="annual-split-note" value={draft.split_review.note} maxLength={2000} onChange={e=>editSplit('note',e.target.value)}/></label>
      {[['annual_scope_rechecked','단건 확인과 별도로 같은 납세자·과세연도 전체 양도를 재검토했습니다'],['income_before_basic_deduction_confirmed','개별 기본공제·과세표준·세액은 합산하지 않고 기본공제 전 소득을 사용합니다'],['no_duplicate_lots_confirmed','재산·취득분 ID와 양도 지분의 중복 또는 누락이 없습니다']].map(([k,title])=><label key={k} style={{display:'block'}}><input data-testid={'annual-split-'+k} type="checkbox" checked={draft.split_review[k]} onChange={e=>editSplit(k,e.target.checked)}/>{title}</label>)}
      </>}
      </section>
      <label style={{display:'block'}}><input data-testid="annual-resident" type="checkbox" checked={draft.resident_confirmed} onChange={e=>change('resident_confirmed',e.target.checked)}/>해당 납세자는 거주자입니다.</label>
      <label style={{display:'block'}}><input data-testid="annual-confirm" type="checkbox" checked={draft.scope_confirmed} onChange={e=>change('scope_confirmed',e.target.checked)}/>같은 납세자의 합산 대상 누락·중복 및 같은 날 거래 순서를 확인했습니다.</label>
      <label>확인 내용 <textarea data-testid="annual-note" maxLength={1000} value={draft.review_note} onChange={e=>change('review_note',e.target.value)}/></label>
      <h3>조정지역 다주택 검토</h3>
      <p>먼저 합산 입력을 저장하면 대상별 검토를 추가할 수 있습니다. 주택 수는 중과 제외 주택을 검토한 순수 주택 수이며 분양권·입주권 혼합은 지원하지 않습니다. 2년 이상 보유 주택의 5월 9일까지 양도 유예와, 계약·토지거래허가에 따른 후속 유예는 구분합니다. 제외 사유가 있으면 확인을 체크하지 말고 개별 사건을 검토하세요.</p>
      {selected.filter(s=>s.engine_request.is_regulated_area&&s.engine_request.housing_count>=2).map(s=><button key={s.run_id} data-testid={'annual-surcharge-add-'+s.run_id} disabled={(draft.surcharge_reviews||[]).some(r=>r.run_id===s.run_id)} onClick={()=>change('surcharge_reviews',[...(draft.surcharge_reviews||[]),{run_id:s.run_id,housing_count_confirmed:false,no_other_exclusion_confirmed:false,transition_not_applicable:false,note:''}])}>{s.label} 중과 검토 추가</button>)}
      {(draft.surcharge_reviews||[]).map((r,index)=><section key={r.run_id} style={{border:'1px solid #ccc',padding:12}}>
        <p>{selected.find(s=>s.run_id===r.run_id)?.label||'이전 선택 사건'} · {draft.run_ids.includes(r.run_id)?'선택 결과에 연결':'선택에서 빠진 검토 — 삭제 필요'}</p>
        <label>주택 수·지역·중과 제외·계약/허가 검토 근거 <textarea data-testid={'annual-surcharge-note-'+index} maxLength={1000} value={r.note} onChange={e=>editReview(index,'note',e.target.value)}/></label>
        {[['housing_count_confirmed','주택 수 산입·제외 및 권리 혼합 없음 확인'],['no_other_exclusion_confirmed','임대·저가·특례·조정지역 공고 전 계약 등 기타 중과 제외 비대상 확인'],['transition_not_applicable','5월 9일 이전 계약·허가 신청에 따른 후속 유예 비대상 확인 (5월 10일 이후 양도)']].map(([key,title])=><label key={key} style={{display:'block'}}><input data-testid={'annual-surcharge-'+key+'-'+index} type="checkbox" checked={!!r[key]} onChange={e=>editReview(index,key,e.target.checked)}/>{title}</label>)}
        <button data-testid={'annual-surcharge-remove-'+index} onClick={()=>change('surcharge_reviews',(draft.surcharge_reviews||[]).filter((_,i)=>i!==index))}>중과 검토 삭제</button>
      </section>)}
      <h3>기신고 세액·기납부 내역</h3>
      <p>공제대상은 신고·결정서의 세액입니다. 실제 납부액은 별도로 기록하며 개별 계산 결과를 납부액으로 자동 대입하지 않습니다. 사건당 한 행에 정정·분납·환급을 대조한 최종 유효 배분액을 입력하세요. 여러 사건을 묶어 신고했다면 누적 신고 총액을 각 행에 반복 입력하지 마세요.</p>
      {draft.run_ids.map(id=><button key={id} data-testid={'annual-credit-add-'+id} disabled={(draft.credits||[]).some(c=>c.run_id===id)} onClick={()=>change('credits',[...(draft.credits||[]),{run_id:id,kind:'preliminary',record_date:null,reference:'',national_credit:0,local_credit:0,national_paid:0,local_paid:0}])}>
        {selected.find(s=>s.run_id===id)?.label||items.find(s=>s.run_id===id)?.label||'선택 사건'} 기신고 내역 추가</button>)}
      {(draft.credits||[]).map((c,index)=><section key={c.run_id} style={{border:'1px solid #ccc',padding:12,margin:'12px 0'}}>
        <p>{selected.find(s=>s.run_id===c.run_id)?.label||items.find(s=>s.run_id===c.run_id)?.label||'이전 선택 사건'} · {draft.run_ids.includes(c.run_id)?'선택 결과에 연결':'선택에서 빠진 내역 — 삭제 또는 대상 재선택 필요'}</p>
        <label>종류 <select data-testid={'annual-credit-kind-'+index} value={c.kind} onChange={e=>editCredit(index,'kind',e.target.value)}><option value="preliminary">예정신고</option><option value="assessment">결정·경정</option><option value="interim">수시부과</option></select></label>
        <label>확인 기준일 <input data-testid={'annual-credit-date-'+index} type="date" value={c.record_date||''} onChange={e=>editCredit(index,'record_date',e.target.value||null)}/></label>
        <label>신고·결정서 식별 및 납부 확인 근거 <input data-testid={'annual-credit-reference-'+index} maxLength={500} value={c.reference} onChange={e=>editCredit(index,'reference',e.target.value)}/></label>
        {[['national_credit','공제대상 국세'],['local_credit','공제대상 지방세'],['national_paid','실제 납부 국세'],['local_paid','실제 납부 지방세']].map(([key,title])=><label key={key} style={{display:'block'}}>{title} (원) <input data-testid={'annual-credit-'+key+'-'+index} type="number" min="0" max="9000000000000" step="1" value={c[key]} onChange={e=>editCredit(index,key,e.target.value===''?'':Number(e.target.value))}/></label>)}
        <button data-testid={'annual-credit-remove-'+index} onClick={()=>change('credits',(draft.credits||[]).filter((_,i)=>i!==index))}>기신고 내역 삭제</button>
      </section>)}
      <label style={{display:'block'}}><input data-testid="annual-credits-confirm" type="checkbox" checked={!!draft.credits_confirmed} onChange={e=>change('credits_confirmed',e.target.checked)}/>공제대상 세액·실제 납부액·미납 및 중복/정정/환급 여부를 확인했습니다 (내역 없음 포함).</label>
      <div><button data-testid="annual-save" onClick={()=>act(save)}>합산 입력 저장</button>
      <button data-testid="annual-calculate" onClick={()=>act(async()=>{
        const s=dirty||!meta?await save():meta;
        if(!s.validation.can_run)throw new Error(s.validation.errors.join(' '));
        const r=await mutate('/'+s.annual_id+'/runs','POST',{revision_id:s.revision_id,expected_input_hash:s.input_hash});
        const detail=await api('/'+s.annual_id+'/runs/'+r.run_id);if(alive.current)setRun(detail);
      })}>저장하고 합산 계산</button></div>
    </fieldset>
    {meta&&<section><p>저장 버전 {meta.revision} {readonly?'· 과거 입력 읽기 전용':''}</p>
      {!meta.validation.can_run&&<ul>{meta.validation.errors.map(e=><li key={e}>{e}</li>)}</ul>}
      <label>다시 열 버전 (비워 두면 최신) <input data-testid="annual-revision" type="number" min="1" disabled={busy} value={revision} onChange={e=>setRevision(e.target.value)}/></label>
      <button disabled={busy} onClick={()=>discard()?act(()=>open(meta.annual_id,revision)):undefined}>합산 저장본 다시 열기</button>
    </section>}
    {run&&<section data-testid="annual-result"><h2>저장된 연간 합산 결과</h2>
      {dirty&&<p role="status">현재 편집 입력과 다른 저장본의 결과입니다. 저장·계산 전 결과는 바뀌지 않습니다.</p>}
      <p>{run.response_snapshot.calc.notice}</p>
      <table><thead><tr><th>사건·입력 버전</th><th>양도일</th><th>세율</th><th>통산 전 소득·차손</th><th>차손 공제 배분</th><th>기본공제 배분</th></tr></thead>
      <tbody>{run.response_snapshot.calc.allocations.map(a=><tr key={a.run_id}><td>{a.label} · {a.revision}{a.transfer_share&&<small style={{display:"block"}}>재산 {a.property_id} · 양도 지분 {a.transfer_share} · 저장된 귀속 소득</small>}</td><td>{a.transfer_date}</td><td>{a.rate_label||'기본세율 (과거 버전)'}{(a.original_rate_candidates||a.rate_candidates)?.length>1&&<small style={{display:'block'}}>원래 후보: {(a.original_rate_candidates||a.rate_candidates).map(k=>k.startsWith('short_')?'단기 '+k.split('_')[1]+'%':'중과 +'+k.split('_')[1]+'%p').join(' / ')} · 개별 저장: {a.individual_rate_type||'차손·0 초기 반환'} · 연간 선택은 아래 비교표</small>}</td><td>{money(a.transfer_income)}</td><td>{a.loss_offset===undefined?'미지원 과거 버전':money(a.loss_offset)}</td><td>{money(a.basic_deduction)}</td></tr>)}</tbody></table>
      {run.response_snapshot.calc.rate_groups&&<section data-testid="annual-rate-groups"><h3>세율별 통산·공제</h3>
        <table><thead><tr><th>세율</th><th>양의 소득</th><th>차손</th><th>같은 세율 공제</th><th>다른 세율 차손 공제</th><th>세율 선택 무관 공제</th><th>기본공제</th><th>과세표준</th><th>중과 가산액</th><th>단기 비교세액</th><th>기본＋중과 비교세액</th><th>선택 세율</th><th>산출세액</th></tr></thead>
        <tbody>{run.response_snapshot.calc.rate_groups.map(g=><tr key={g.rate_group}><td>{g.label}</td><td>{money(g.positive_income)}</td><td>{money(g.loss_total)}</td><td>{money(g.same_rate_loss_offset)}</td><td>{money(g.cross_rate_loss_offset)}</td><td>{g.invariant_loss_offset===undefined?'—':money(g.invariant_loss_offset)}</td><td>{money(g.basic_deduction)}</td><td>{money(g.tax_base)}</td><td>{money(g.surcharge_amount||0)}</td><td>{g.short_tax===undefined?'—':money(g.short_tax)}</td><td>{g.surcharged_tax===undefined?'과거 결과':money(g.surcharged_tax)}</td><td>{g.selected_rate?.startsWith('short_')?'단기 '+g.selected_rate.split('_')[1]+'%':g.selected_rate?.startsWith('surcharge_')?'중과 +'+g.selected_rate.split('_')[1]+'%p':g.selected_rate==='basic'?'기본세율':g.selected_rate==='unregistered_70'?'미등기 70%':g.loss_allocation_basis?'세율 미선택':'과거 결과'}</td><td>{money(g.calculated_tax)}</td></tr>)}</tbody></table>
      </section>}
      {run.response_snapshot.calc.loss_resolution&&<section data-testid="annual-loss-resolution"><h3>차손 배분 결과가 동일한 근거</h3>
        <p>{run.response_snapshot.calc.loss_resolution.method==='invariant_loss_exhausted'?'전체 차손이 양의 소득을 모두 소진하므로 사건별 잔여 소득은 0원입니다.':'공제받을 세율 그룹이 하나이고 각 차손의 사건별 비례 배분이 원 단위까지 정확하므로 공제 순서에 따라 결과가 바뀌지 않습니다.'}</p>
        <p>중첩 차손의 단기·중과 세율을 임의로 선택하지 않았습니다. 같은 세율·다른 세율 공제로 단정하지 않고 별도 열에 공제액을 표시합니다.</p>
      </section>}
      {!!run.response_snapshot.calc.zero_income_run_ids?.length&&<p data-testid="annual-zero-income">0원 사건 {run.response_snapshot.calc.zero_income_run_ids.length}건은 원래 후보를 보존하고 세율 그룹 연결·차손·기본공제 배분에 영향을 주지 않습니다.</p>}
      {!!run.response_snapshot.calc.regrouping?.length&&<section data-testid="annual-regrouping"><h3>공통 세율로 묶은 근거</h3>
        {run.response_snapshot.calc.regrouping.map((p,i)=>p.selected_rate.startsWith('surcharge_')?<div key={i}>
          <p>중과 +{p.selected_rate.split('_')[1]}%p로 {p.run_ids.length}건을 통산합니다. 각 중첩 사건이 연간 전체 차손 {money(p.annual_loss_budget)}과 기본공제 {money(p.basic_deduction_budget)}를 모두 부담해도 중과세액이 단기세액 이상임을 확인했습니다.</p>
          <ul>{p.assets.map(a=><li key={a.run_id}>{run.response_snapshot.calc.allocations.find(r=>r.run_id===a.run_id)?.label||'중첩 사건'}: 검증 과표 {money(a.minimum_tax_base)} ~ {money(a.maximum_tax_base)} · 단기 {a.short_rate.split('_')[1]}%와 비교</li>)}</ul>
          <small>이 금액은 우열 검증용 보수적 범위입니다. 실제 차손·기본공제 배분은 위 사건별 내역을 따릅니다.</small>
        </div>:<p key={i}>단기 {p.selected_rate.split('_')[1]}%로 {p.run_ids.length}건을 통산합니다. 통산 전 양의 소득 합계 {money(p.gross_positive_upper_bound)} 이하 모든 과표 구간에서 단기세액이 중과세액 이상임을 확인했습니다. 차손·기본공제 후에도 적용 세율이 바뀌지 않습니다.</p>)}
      </section>}
      {run.response_snapshot.calc.comparison&&<p data-testid="annual-rate-comparison">전체 기본세율 계산 {money(run.response_snapshot.calc.comparison.aggregate_basic_tax)} / 세율별 계산 합계 {money(run.response_snapshot.calc.comparison.grouped_tax)} / 적용: {run.response_snapshot.calc.comparison.selected==='grouped'?'세율별 계산 합계':'전체 기본세율 계산'}</p>}
      {run.response_snapshot.calc.loss_total!==undefined&&<p>차손 {money(run.response_snapshot.calc.loss_total)} / 통산 {money(run.response_snapshot.calc.loss_absorbed)} / 미공제 차손 {money(run.response_snapshot.calc.unabsorbed_loss)} (이월 없음)</p>}
      {run.response_snapshot.calc.allocations.some(a=>a.lots)&&<section data-testid="annual-split-lots"><h3>취득분별 저장 소득</h3>{run.response_snapshot.calc.allocations.filter(a=>a.lots).map(a=><div key={a.run_id}><p>{a.label} · 재산 {a.property_id} · 납세자 {a.taxpayer_id} · 원본 {a.original_revision_id} · 합계 양도 지분 {a.transfer_share}</p><table><thead><tr><th>취득분 ID</th><th>취득일</th><th>양도/취득 지분</th><th>양도소득금액</th></tr></thead><tbody>{a.lots.map(l=><tr key={l.lot_id}><td>{l.lot_id}</td><td>{l.acquisition_date}</td><td>{l.transfer_share} / {l.acquired_share}</td><td>{money(l.transfer_income)}</td></tr>)}</tbody></table></div>)}</section>}
      <p>기본공제 합계 {money(run.response_snapshot.calc.basic_deduction)} / 과세표준 {money(run.response_snapshot.calc.tax_base)}</p>
      <p>양도소득세 {money(run.response_snapshot.calc.national_tax)} / 지방소득세 {money(run.response_snapshot.calc.local_tax)} / 합계 {money(run.response_snapshot.calc.total_tax)}</p>
      {run.response_snapshot.calc.settlement?<table data-testid="annual-settlement"><thead><tr><th>세목</th><th>기신고 공제</th><th>실제 납부</th><th>기신고 미납</th><th>추가 납부</th><th>초과공제·환급 검토</th></tr></thead><tbody>
        {['national','local'].map(key=>{const s=run.response_snapshot.calc.settlement[key];return <tr key={key}><td>{key==='national'?'국세':'지방세'}</td><td>{money(s.prior_credit)}</td><td>{money(s.actual_paid)}</td><td>{money(s.prior_unpaid)}</td><td>{money(s.additional_due)}</td><td>{money(s.over_credit)}</td></tr>;})}
      </tbody></table>:<p>이 과거 결과에는 차손 통산·기납부 정산이 없습니다. 내역 확인 후 새 버전으로 저장·계산하세요.</p>}
    </section>}
  </div>;
}
window.JTTransferAnnual=JTTransferAnnual;

/* Original lot facts and immutable case adoption; no tax arithmetic in the browser. */
function JTTransferSplit({w,base,api,mutation,act,busy,error,load,onExit,onCancel,remember}) {
  const [catalog,setCatalog]=React.useState({properties:[]}),[choice,setChoice]=React.useState({property_id:'',ownership_id:'',valuation_id:'',transfer_date:''});
  const [original,setOriginal]=React.useState(null),[lots,setLots]=React.useState([]),[reason,setReason]=React.useState('');
  const [originalConfirmed,setOriginalConfirmed]=React.useState(false),[costConfirmed,setCostConfirmed]=React.useState(false);
  const [loaded,setLoaded]=React.useState(''),[dirty,setDirty]=React.useState(false),[alloc,setAlloc]=React.useState([]),[preview,setPreview]=React.useState(null);
  const [revision,setRevision]=React.useState('');
  const readonly=w.meta.read_only||w.meta.revision!==w.meta.current_revision;
  const property=catalog.properties.find(p=>p.id===choice.property_id),source=w.meta.master_snapshot;
  const currentIdentity=choice.property_id+':'+choice.ownership_id;
  React.useEffect(()=>{act(async()=>setCatalog(await api(base+'/sources?limit=100')));},[]);
  React.useEffect(()=>{const protect=e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[dirty,busy]);
  const emptyLot=()=>({lot_id:window.crypto.randomUUID(),acquisition_date:'',acquired_share:'',acquisition_price:'',expenses_total:'',evidence:''});
  const resetPreview=()=>{setPreview(null);setCostConfirmed(false);};
  const editLot=(n,k,v)=>{setLots(old=>old.map((x,j)=>j===n?{...x,[k]:v}:x));setDirty(true);setOriginalConfirmed(false);resetPreview();};
  const choose=(k,v)=>{setChoice({...choice,[k]:v,...(k==='property_id'?{ownership_id:'',valuation_id:''}:{})});resetPreview();if(['property_id','ownership_id'].includes(k)){setLoaded('');setOriginal(null);setLots([]);setAlloc([]);setDirty(false);setOriginalConfirmed(false);}};
  const originals=async()=>{
    const r=await api(base+'/split-originals?property_id='+choice.property_id+'&ownership_id='+choice.ownership_id);
    const obj=r.original;setOriginal(obj);const rows=obj?.source_snapshot.lots||[emptyLot(),emptyLot()];setLots(rows);
    setReason(obj?.source_snapshot.reason||'');setOriginalConfirmed(false);setDirty(false);setLoaded(currentIdentity);resetPreview();
    setAlloc(rows.map(x=>({lot_id:x.lot_id,include:true,transfer_share:'',transfer_price:'',evidence:''})));
  };
  const number=value=>{if(!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value)))throw new Error('금액은 원 단위의 정확한 정수로 입력하세요.');return Number(value);};
  const selection=()=>({original_revision_id:original.id,valuation_id:choice.valuation_id,transfer_date:choice.transfer_date,
    proportional_cost_confirmed:costConfirmed,reason,allocations:alloc.filter(x=>x.include).map(({include,...x})=>({...x,transfer_price:number(x.transfer_price)}))});
  const reviews=[['domestic_resident_registered_actual','거주자·국내 등기 재산·실지거래'],['business_nonresidential_no_specials','사업용 비주택이며 비과세·감면·중과·특례 없음'],['no_depreciation_or_cost_adjustments','감가상각 및 별도 원가 조정 없음'],['known_lot_attribution','취득일·취득분별 양도 지분과 대금의 귀속 명확'],['no_other_annual_transfers_or_deductions','이 납세자의 같은 해 다른 양도 및 기본공제 사용 없음'],['local_standard_rate','지방소득세 표준세율 적용']];
  const review=(k,v)=>remember({...w,draft:{...w.draft,facts_confirmed:false,ordinary_sale_confirmed:false,split_review:{...w.draft.split_review,[k]:v}}});
  return <div className="jt-container cw-workspace">
    <style>{`.ts-section{border:1px solid #ccd8cd;padding:18px;margin:18px 0}.ts-section label{display:block;margin:10px 0}.ts-section input,.ts-section select,.ts-section textarea{padding:9px;max-width:100%;margin-left:8px}.ts-section button{margin:8px;padding:10px}.ts-table{overflow:auto}.ts-table td,.ts-table th{padding:8px;border-bottom:1px solid #ddd;text-align:left}`}</style>
    <button disabled={busy} onClick={onExit}>← 고객·사건 작업대</button><h1>분할취득 양도 사건</h1>
    {!w.draft.split_request&&<button disabled={busy} onClick={onCancel}>일반 양도 입력으로</button>}
    <p>토지·상가 매매 취득분을 각각 2년 이상 보유한 일반 양도, 양의 차익, 2026-07-01~2026-10-17 범위를 지원합니다. 취득일 불명·주택·단기·차손·특례는 별도 검토가 필요합니다.</p>
    {error&&<p role="alert">{error}</p>}
    <fieldset className="ts-section" disabled={busy||readonly}>
      <legend>1. 취득분 원본</legend><p>원가와 비용은 전체 부동산 금액이 아니라 각 취득분의 금액입니다. 수정하면 새 원본 버전이 생깁니다.</p>
      <label>재산<select data-testid="split-property" value={choice.property_id} onChange={e=>choose('property_id',e.target.value)}><option value="">선택</option>{catalog.properties.filter(x=>['토지','상가'].includes(x.property_type)).map(x=><option key={x.id} value={x.id}>{x.address} · {x.property_type}</option>)}</select></label>
      {catalog.next_cursor&&<button onClick={()=>act(async()=>{const n=await api(base+'/sources?limit=100&cursor='+catalog.next_cursor);setCatalog({properties:[...catalog.properties,...n.properties],next_cursor:n.next_cursor});})}>재산 더 보기</button>}
      <label>양도인<select data-testid="split-owner" value={choice.ownership_id} onChange={e=>choose('ownership_id',e.target.value)}><option value="">선택</option>{property?.ownerships.map(x=><option key={x.id} value={x.id}>{x.name} · 보유 {x.share_ratio}</option>)}</select></label>
      <button data-testid="split-load-original" disabled={!choice.ownership_id||busy} onClick={()=>act(originals)}>취득분 원본 열기</button>
      {loaded===currentIdentity&&lots.map((x,n)=><div className="ts-section" key={x.lot_id}>
        <strong>취득분 {n+1}</strong><p>ID: {x.lot_id}</p>
        {[['acquisition_date','취득일','date'],['acquired_share','취득 지분(전체 재산 대비)','text'],['acquisition_price','취득분 원가(원)','text'],['expenses_total','취득분 필요경비(원)','text'],['evidence','취득일·금액 증빙','text']].map(([k,l,type])=><label key={k}>{l}<input type={type} data-testid={'split-lot-'+n+'-'+k} value={x[k]} onChange={e=>editLot(n,k,e.target.value)}/></label>)}
      </div>)}
      {loaded===currentIdentity&&<><button disabled={lots.length>=50} onClick={()=>{const x=emptyLot();setLots([...lots,x]);setAlloc([...alloc,{lot_id:x.lot_id,include:true,transfer_share:'',transfer_price:'',evidence:''}]);setDirty(true);setOriginalConfirmed(false);resetPreview();}}>취득분 추가</button>
        <label>원본·귀속 검토 근거<textarea data-testid="split-reason" value={reason} onChange={e=>{setReason(e.target.value);setDirty(true);setOriginalConfirmed(false);resetPreview();}}/></label>
        <label><input type="checkbox" data-testid="split-original-confirm" checked={originalConfirmed} onChange={e=>setOriginalConfirmed(e.target.checked)}/>모든 취득일이 명확하며 선행 처분 없이 현재 보유한 취득분 전부입니다.</label>
        <button data-testid="split-save-original" disabled={!originalConfirmed||busy} onClick={()=>act(async()=>{
          const r=await mutation(base+'/split-originals','POST',{property_id:choice.property_id,ownership_id:choice.ownership_id,expected_revision_id:original?.id||null,known_dates_and_no_prior_disposal:originalConfirmed,reason,lots:lots.map(x=>({...x,acquisition_price:number(x.acquisition_price),expenses_total:number(x.expenses_total)}))});setOriginal(r);setDirty(false);resetPreview();
        })}>취득분 원본 저장</button>{original&&<p data-testid="split-original-version">원본 버전 {original.revision} · {original.id}</p>}
      </>}
    </fieldset>
    {original&&loaded===currentIdentity&&<fieldset className="ts-section" disabled={busy||readonly||dirty}>
      <legend>2. 양도 귀속·평가 연결</legend><label>양도일<input type="date" data-testid="split-transfer-date" value={choice.transfer_date} onChange={e=>choose('transfer_date',e.target.value)}/></label>
      <label>전체 재산 실지거래 평가<select data-testid="split-value" value={choice.valuation_id} onChange={e=>choose('valuation_id',e.target.value)}><option value="">선택</option>{property?.valuations.map(x=><option key={x.id} value={x.id}>{x.as_of_date} · {x.amount}원 · {x.valuation_type}</option>)}</select></label>
      {alloc.map((x,n)=><div key={x.lot_id}><p>취득분 {n+1} · {x.lot_id}</p><label><input type="checkbox" checked={x.include} onChange={e=>{setAlloc(alloc.map((a,j)=>j===n?{...a,include:e.target.checked}:a));resetPreview();}}/>이번 양도에 포함</label>
        {x.include&&[['transfer_share','양도 지분(전체 대비)'],['transfer_price','귀속 양도가액(원)'],['evidence','대금 귀속 근거']].map(([k,l])=><label key={k}>{l}<input data-testid={'split-allocation-'+n+'-'+k} value={x[k]} onChange={e=>{setAlloc(alloc.map((a,j)=>j===n?{...a,[k]:e.target.value}:a));resetPreview();}}/></label>)}</div>)}
      <label><input type="checkbox" data-testid="split-cost-confirm" checked={costConfirmed} onChange={e=>{setCostConfirmed(e.target.checked);setPreview(null);}}/>취득분 원가·비용이 해당 취득분 내 양도 지분에 비례하여 귀속됨을 증빙으로 확인했습니다.</label>
      <button data-testid="split-preview" disabled={!costConfirmed||busy} onClick={()=>act(async()=>setPreview(await api(base+'/split-preview',{method:'POST',body:JSON.stringify(selection())})))}>귀속 미리보기</button>
      {preview&&<><pre>{JSON.stringify(preview.request.rows,null,2)}</pre><button data-testid="split-adopt" onClick={()=>act(async()=>{await mutation(base+'/split-imports','POST',{selection:selection(),expected_source_hash:preview.source_hash},w.meta.etag);await load(w.meta.case_id);setPreview(null);})}>사건에 취득분 채택</button></>}
    </fieldset>}
    {w.draft.split_request&&<section className="ts-section"><h2>저장된 취득분과 귀속</h2>
      <p>양도인 {source.ownership.name} · {source.ownership.person_id} · 재산 {source.property.id} · 원본 버전 {source.original_revision} · 양도일 {w.draft.split_request.transfer_date}</p>
      <div className="ts-table"><table><thead><tr>{['취득분 ID','취득일','취득 지분','양도 지분','양도가액','귀속 원가','귀속 비용'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{w.draft.split_request.rows.map(x=><tr key={x.lot_id}>{['lot_id','acquisition_date','acquired_share','transfer_share','transfer_price','acquisition_price','expenses_total'].map(k=><td key={k}>{x[k]}</td>)}</tr>)}</tbody></table></div>
      <fieldset disabled={busy||readonly}>{reviews.map(([k,l])=><label key={k}><input type="checkbox" data-testid={'split-review-'+k} checked={!!w.draft.split_review?.[k]} onChange={e=>review(k,e.target.checked)}/>{l}</label>)}
        <label>검토 메모<textarea data-testid="split-review-note" value={w.draft.split_review?.note||''} onChange={e=>review('note',e.target.value)}/></label>
        <label><input type="checkbox" data-testid="split-facts" checked={w.draft.facts_confirmed&&w.draft.ordinary_sale_confirmed} onChange={e=>remember({...w,draft:{...w.draft,facts_confirmed:e.target.checked,ordinary_sale_confirmed:e.target.checked}})}/>일반 양도 사실과 취득분별 계산 범위를 최종 확인했습니다.</label>
        <button data-testid="split-save" onClick={()=>act(async()=>{await mutation(base,'PUT',{label:w.label,draft:w.draft},w.meta.etag);await load(w.meta.case_id);})}>분할취득 사건 저장</button>
        <button data-testid="split-run" disabled={busy||transferDirty(w)||!w.meta.validation.can_run} onClick={()=>act(async()=>{await mutation(base+'/runs','POST',{revision_id:w.meta.revision_id,expected_input_hash:w.meta.input_hash});await load(w.meta.case_id);})}>저장본 계산</button>
      </fieldset>
      {w.meta.validation.errors.map(x=><p key={x}>{x}</p>)}
      {w.run&&<div data-testid="split-result"><h2>저장 결과</h2><p>양도소득세 {w.run.response_snapshot.calc.세액.toLocaleString('ko-KR')}원 · 지방소득세 {w.run.response_snapshot.calc.지방소득세.toLocaleString('ko-KR')}원</p><p>취득분별 장기보유특별공제 후 소득을 합산하고 기본공제를 한 번 적용했습니다.</p><pre>{JSON.stringify(w.run.response_snapshot.calc.원본결과,null,2)}</pre></div>}
    </section>}
    <label>사건 버전(비우면 최신)<input data-testid="split-revision" value={revision} onChange={e=>setRevision(e.target.value)}/></label><button data-testid="split-reopen" disabled={busy} onClick={()=>act(()=>load(w.meta.case_id,revision))}>저장본 다시 열기</button>
  </div>;
}
window.JTTransferSplit=JTTransferSplit;

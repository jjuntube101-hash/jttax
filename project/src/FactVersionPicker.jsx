/* Recorded fact versions use explicit applicability, not audit timestamp inference. */
function JTFactVersionPicker({api,clientId,propertyId,ownerId,doneeId,eventDate,valuationId,selection,onChange,disabled}) {
  const [options,setOptions]=React.useState(null),[loading,setLoading]=React.useState(false),[error,setError]=React.useState('');
  const generation=React.useRef(0),alive=React.useRef(true);
  const scope=[clientId,propertyId,ownerId,doneeId,eventDate,valuationId].join('|'),scopeRef=React.useRef(scope);scopeRef.current=scope;
  React.useEffect(()=>{generation.current++;setOptions(null);setError('');setLoading(false);onChange(null);},[scope]);
  React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  const change=(key,value)=>onChange({...selection,[key]:value,...(key==='confirmed'?{}:{confirmed:false})});
  const load=async()=>{const id=++generation.current,initial=scopeRef.current;setLoading(true);setError('');onChange({property_version:'',owner_version:'',...(doneeId?{donee_version:''}:{}),applicable_from:'',applicable_until:'',reason:'',confirmed:false});
    try{const data=await api('/v1/clients/'+clientId+'/masters/properties/'+propertyId+'/fact-options?event_date='+eventDate+'&owner_person_id='+ownerId+(doneeId?'&donee_person_id='+doneeId:''));
      if(alive.current&&id===generation.current&&scopeRef.current===initial)setOptions(data);
    }catch(e){if(alive.current&&id===generation.current)setError(e.message);}
    finally{if(alive.current&&id===generation.current)setLoading(false);}};
  const locked=disabled||loading;
  return <section aria-label="과거 취득·당사자·평가자료">
    <h3>과거 취득·당사자 자료 선택</h3>
    <p>소유자·사건일·평가자료를 먼저 선택하세요. 기록 시각은 적용일이 아닙니다. 선택 버전과 평가액을 이번 사건에 사용할 수 있는 기간과 근거를 확인하세요.</p>
    <button data-testid="fact-load" disabled={locked||!propertyId||!ownerId||!eventDate||!valuationId} onClick={load}>과거 원본 버전 조회</button>
    {error&&<p role="alert">{error}</p>}
    {options&&<><p>사건일 {eventDate} · 선택 평가자료 {options.valuations.find(v=>v.id===valuationId)?.as_of_date} · {options.valuations.find(v=>v.id===valuationId)?.amount}원 (다른 기준일 자료 사용은 아래 근거 필수)</p>
      {['property','owner',...(doneeId?['donee']:[])].map(kind=><label key={kind}>{kind==='property'?'취득금액·재산 버전':kind==='owner'?'소유자/증여자 버전':'수증자 버전'}
        <select data-testid={'fact-'+kind} disabled={locked} value={selection?.[kind+'_version']||''} onChange={e=>change(kind+'_version',e.target.value)}>
          <option value="">버전 선택</option>{options[kind].map(x=><option key={x.version} value={x.version}>{x.label} · {x.recorded_at||'현재'} · {kind==='property'?x.record.acquisition_price+'원 / '+x.record.address:x.record.name+' / '+(x.record.birth_date||'생년월일 미상')}</option>)}</select></label>)}
      <label>적용 시작일<input data-testid="fact-from" type="date" disabled={locked} value={selection?.applicable_from||''} onChange={e=>change('applicable_from',e.target.value)}/></label>
      <label>적용 종료일(포함)<input data-testid="fact-until" type="date" disabled={locked} value={selection?.applicable_until||''} onChange={e=>change('applicable_until',e.target.value)}/></label>
      <label>해당 사건일의 자료로 선택한 근거<input data-testid="fact-reason" disabled={locked} maxLength={1000} value={selection?.reason||''} onChange={e=>change('reason',e.target.value)}/></label>
      <label><input data-testid="fact-confirm" type="checkbox" disabled={locked} checked={!!selection?.confirmed} onChange={e=>change('confirmed',e.target.checked)}/>선택한 재산·당사자 버전과 평가자료의 적용기간·기준일·금액을 확인했습니다.</label>
      <button disabled={locked} onClick={()=>{setOptions(null);onChange(null);}}>과거 사실 선택 해제</button>
    </>}
  </section>;
}
window.JTFactVersionPicker=JTFactVersionPicker;

/* Select immutable saved runs. No current-master lookups and no valuation calls. */
function JTEquityPicker({api,clientId,eventDate,purpose,onAdopt,disabled=false}) {
  const [items,setItems]=React.useState([]),[cursor,setCursor]=React.useState(null),[selected,setSelected]=React.useState('');
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[note,setNote]=React.useState(''),[confirmed,setConfirmed]=React.useState(false);
  const generation=React.useRef(0),alive=React.useRef(true),lock=React.useRef(false);
  React.useEffect(()=>{generation.current++;setItems([]);setSelected('');setCursor(null);setConfirmed(false);setError('')},[clientId,eventDate,purpose]);
  React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++}},[]);
  const load=async(more=false)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');const g=++generation.current;
    try{const r=await api('/v1/equity-cases?client_id='+encodeURIComponent(clientId)+'&event_date='+encodeURIComponent(eventDate)+'&purpose='+encodeURIComponent(purpose)+(more&&cursor?'&cursor='+cursor:''));if(alive.current&&g===generation.current){setItems(old=>more?[...old,...r.items]:r.items);setCursor(r.next_cursor);setSelected('');setConfirmed(false)}}
    catch(e){if(alive.current&&g===generation.current)setError(e.message)}finally{lock.current=false;if(alive.current)setBusy(false)}};
  const value=items.find(x=>x.run_id===selected);
  return <section className="gc-card ic-section"><h3>저장된 비상장주식 평가 가져오기</h3>
    <p>선택 고객·사건일·평가 목적이 같은 저장 결과만 조회합니다. 평가한 주식수 전체를 채택하며 일부 수량은 해당 수량으로 새 평가를 저장해 주세요. 재평가해도 이미 가져온 결과는 바뀌지 않습니다.</p>
    <button data-testid="equity-picker-load" disabled={disabled||busy||!clientId||!eventDate} onClick={()=>load()}>저장 평가 조회</button>
    {error&&<p role="alert">{error}</p>}
    <label>평가 결과<select data-testid="equity-picker-run" disabled={disabled||busy} value={selected} onChange={e=>{setSelected(e.target.value);setConfirmed(false)}}><option value="">결과 선택</option>{items.map(x=><option key={x.run_id} value={x.run_id}>{x.company_name} · {x.eval_date} · {x.shares}주 · {x.total_value.toLocaleString('ko-KR')}원 · {x.run_id}</option>)}</select></label>
    {cursor&&<button disabled={disabled||busy} onClick={()=>load(true)}>평가 더 보기</button>}
    {value&&<><p>{value.unit_value.toLocaleString('ko-KR')}원 × {value.shares.toLocaleString('ko-KR')}주 = {value.total_value.toLocaleString('ko-KR')}원</p>
      <label>소유·이전 수량·일자 확인 근거<input data-testid="equity-picker-note" disabled={disabled||busy} value={note} maxLength={1000} onChange={e=>{setNote(e.target.value);setConfirmed(false)}}/></label>
      <label><input data-testid="equity-picker-confirm" disabled={disabled||busy} type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>당사자 소유·이번 이전 주식수와 평가일·목적·중복 없음을 확인했습니다.</label>
      <button data-testid="equity-picker-adopt" disabled={disabled||busy||!confirmed||!note.trim()} onClick={()=>{onAdopt({...value,reference:{run_id:value.run_id,input_hash:value.input_hash,shares:value.shares,ownership_confirmed:true,ownership_source:note}});setSelected('');setConfirmed(false)}}>선택 평가를 입력에 반영</button>
      <p>아래 사건 저장을 완료해야 새 입력 버전으로 보존됩니다.</p></>}
  </section>;
}
window.JTEquityPicker=JTEquityPicker;

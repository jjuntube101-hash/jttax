/* Shared input review and request lifetime; tax formulas remain on the server. */
function jtCreateInputSession(onInvalidate){
 let revision=0,active=true;
 const current=token=>active&&token===revision;
 return {
  begin(){return ++revision;},
  invalidate(){revision++;if(active&&onInvalidate)onInvalidate();},
  current,
  sink(token,commit){return value=>{if(current(token))commit(typeof value==='function'?prior=>current(token)?value(prior):prior:value);};},
  mount(){active=true;},
  dispose(){active=false;revision++;}
 };
}
function useJTInputSession(reset){
 const resetRef=React.useRef(reset);resetRef.current=reset;
 const session=React.useRef(null);
 if(!session.current)session.current=jtCreateInputSession(()=>resetRef.current());
 React.useEffect(()=>{session.current.mount();return()=>session.current.dispose();},[]);
 return session.current;
}
function jtInputReviewRows(questions,answers){
 return (questions||[]).filter(q=>q&&q.id).map((q,index)=>{
  const raw=answers[q.id],blank=raw==null||String(raw).trim()===''||(Array.isArray(raw)&&raw.length===0);
  let value,status=blank?'unknown':'entered';
  const optional=!!q.optional&&!(q.requiredIf&&q.requiredIf(answers));
  if(blank)value=q.reviewed?'세부 사실 확인':optional?'입력하지 않음 · 적용 여부는 계산 결과에서 확인':'아직 입력하지 않음';
  else if(q.date){const s=String(raw);const valid=/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;value=s;if(!valid)status='invalid';}
  else if(q.money){const digits=window.jtMoneyDigits(raw);if(digits===null){status='invalid';value=String(raw);}else value=Number(digits).toLocaleString('ko-KR')+'원';}
  else if(Array.isArray(q.opts)){
   const label=v=>{const option=q.opts.find(o=>o[0]===v);return option?option[1]:String(v);};
   value=Array.isArray(raw)?raw.map(label).join(', '):label(raw);
  }else if(typeof raw==='boolean')value=raw?'예':'아니오';
  else if(typeof raw==='object')value='세부 자료 입력됨';
  else value=String(raw)+(q.unit?' '+q.unit:'');
  if(q.amountId&&answers[q.id]===q.amountWhen){const amount=answers[q.amountId];value+=' · '+(amount==null||String(amount).trim()===''?'관련 금액 미입력':Number.isSafeInteger(Number(amount))?Number(amount).toLocaleString('ko-KR')+'원':'관련 금액 확인 필요');}
  return {id:q.id,index,label:q.q||q.label||'입력 항목',value,status,optional};
 });
}
function JTInputReview({questions,answers,onEdit}){
 const rows=jtInputReviewRows(questions,answers),filled=rows.filter(r=>r.status==='entered').length;
 if(!rows.length)return null;
 return <details className="jt-input-review" data-testid="jt-input-review"><summary>현재 단계의 입력 확인 <span>{filled} / {rows.length}</span></summary>
  <p>질문을 눌러 수정할 수 있습니다. 수정하면 이전 계산 결과는 해제됩니다. 빈칸은 0원이나 해당 없음으로 표시하지 않습니다.</p>
  <ul>{rows.map(row=><li key={row.id} data-input-status={row.status}><div><strong>{row.label}</strong><span>{row.value}</span>{row.status==='invalid'&&<em>입력 형식을 확인해 주세요.</em>}</div><button type="button" className="jt-btn jt-btn--ghost" aria-label={'입력 수정: '+(typeof row.label==='string'?row.label:row.id)} onClick={()=>onEdit(row.index)}>수정</button></li>)}</ul>
 </details>;
}
window.jtCreateInputSession=jtCreateInputSession;
window.jtInputReviewRows=jtInputReviewRows;
window.useJTInputSession=useJTInputSession;
window.JTInputReview=JTInputReview;

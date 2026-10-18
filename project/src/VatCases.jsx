/* Saved vat cases use the same authenticated client/case workbench. */
let jtVatSession = null;
function vatDirty(w = jtVatSession) {
  return !!w && JSON.stringify({ label: w.label, draft: w.draft }) !== w.baseline;
}
function JTVatCases({ clientId, caseId, onExit }) {
  const [w, setW] = React.useState(jtVatSession);
  const [opened,setOpened] = React.useState(false);
  const ref = React.useRef(w), lock = React.useRef(false), alive = React.useRef(true);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const [revision,setRevision] = React.useState('');
  const [people,setPeople]=React.useState([]),[personCursor,setPersonCursor]=React.useState(null);
  const keys = React.useRef({});
  const remember = value => { ref.current = value; jtVatSession = value; if (alive.current) setW(value); };
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
          messages[data.detail?.code] || (r.status===422?'입력 형식과 날짜·금액을 확인해 주세요.':'자료를 처리하지 못했습니다. 저장본을 확인하고 다시 시도해 주세요.'));
      }
      return data;
    } finally { clearTimeout(timer); }
  };
  const mutation = (path, method, body, etag) => {
    const signature = JSON.stringify({path,method,body,etag});
    const memory = path==='/v1/vat-cases' ? keys.current : ref.current?.keys || keys.current;
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
    const saved = await api('/v1/vat-cases/'+id+(number?'?revision='+number:''));
    if(saved.client_id!==clientId)throw new Error('선택한 고객의 사건이 아닙니다.');
    const run = saved.last_successful_run_id?await api('/v1/vat-cases/'+id+'/runs/'+saved.last_successful_run_id):null;
    remember({uid:jtGiftSession.uid,meta:saved,label:saved.label,draft:saved.draft,run,keys:ref.current?.keys || keys.current,
      baseline:JSON.stringify({label:saved.label,draft:saved.draft})});
    if(alive.current)setOpened(true);
  };
  const persons=async(more=false)=>{const p=await api('/v1/clients/'+clientId+'/persons'+(more&&personCursor?'?cursor='+personCursor:''));if(alive.current){setPeople(v=>more?[...v,...p.items]:p.items);setPersonCursor(p.next_cursor);}};
  React.useEffect(()=>{
    alive.current=true;
    act(async()=>{
      await persons();
      if(caseId==='resume' && ref.current?.meta?.client_id===clientId){if(ref.current.uid!==jtGiftSession.uid)throw new Error('편집하던 계정으로 다시 로그인해 주세요.');setOpened(true);return;}

      if(caseId)await load(caseId);
      else {
        const made=await mutation('/v1/vat-cases','POST',{client_id:clientId,label:'새 부가세 사건',draft:{}});
        await load(made.case_id);
      }
    });
    const protect=e=>{if(lock.current||vatDirty(ref.current)){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',protect);
    return()=>{alive.current=false;window.removeEventListener('beforeunload',protect);};
  },[]);
  const current = opened && w?.meta?.client_id===clientId && (caseId==='resume'||!caseId||w.meta.case_id===caseId);
  const readonly = !current || w.meta.read_only || w.meta.revision!==w.meta.current_revision;
  const base = current?'/v1/vat-cases/'+w.meta.case_id:'';
  if(current&&w.meta.read_only)return <div><button onClick={onExit}>작업대로</button><p>지원하지 않는 입력 버전입니다. 읽기 전용 원본을 보존합니다.</p><pre>{JSON.stringify(w.meta.case_input,null,2)}</pre></div>;
  const change = (key,value,confirmation=false) => remember({...ref.current,draft:{...ref.current.draft,...(confirmation?{}:{ordinary_scope_confirmed:false,invoices_reviewed:false,no_other_adjustments_confirmed:false}),[key]:value}});
  const save=async()=>{if(!vatDirty(ref.current))return ref.current.meta;const saved=await mutation(base,'PUT',{label:ref.current.label,draft:ref.current.draft},ref.current.meta.etag);await load(saved.case_id);return ref.current.meta;};
  const d=current?w.draft:null;
  const checks=[['ordinary_scope_confirmed','2026년1기 전체기간 계속사업 일반 개인 단일사업장이며 국내10% 과세 거래만 있습니다. 신규·폐업·전환·법인·영세/면세·수입·예정신고·조기환급이 없습니다.'],
    ['invoices_reviewed','공급시기·증빙의 공급가액/세액과 매입 공제 여부·중복·누락을 검토했습니다.'],
    ['no_other_adjustments_confirmed','기한내 신고 기준의 재현이며 기한후/수정신고가 아닙니다. 공통매입 안분·대손·의제매입·카드/전자발급 등 공제·기타 기납부·가산세·특례 조정이 없습니다.']];
  const field=(k,label)=><label>{label}<input data-testid={'vat-'+k} value={d[k]??''} onChange={e=>change(k,e.target.value)}/></label>;
  return <div className="jt-container cw-workspace">
    <style>{`.vat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.vat-grid label{display:flex;flex-direction:column;gap:6px}.vat-grid input,.vat-grid select{font:inherit;padding:10px}.vat-section{padding:18px;border:1px solid #ccd8cd;margin:18px 0;border-radius:8px}`}</style>
    <button disabled={busy} onClick={onExit}>← 고객·사건 작업대</button><h1>일반과세 부가세 사건</h1>
    <p>2026-01-01~06-30 일반 개인사업자의 기한내 신고 기준 계산입니다. 납부액과 환급액을 구분하며 현재 신고서 제출·가산세 계산을 대신하지 않습니다.</p>
    {error&&<p role="alert">{error}</p>}
    {!current&&!busy&&<button onClick={()=>act(async()=>{if(caseId&&caseId!=='resume')await load(caseId);else{const made=await mutation('/v1/vat-cases','POST',{client_id:clientId,label:'새 부가세 사건',draft:{}});await load(made.case_id);}})}>사건 열기 다시 시도</button>}
    {current&&<>
      <p>저장 버전 {w.meta.revision} / 최신 {w.meta.current_revision}{readonly?' · 읽기 전용 저장본':''}{vatDirty(w)?' · 저장하지 않은 변경 있음':''}</p>
      <fieldset disabled={busy||readonly}><legend>사업장·거래 사실</legend>
        <div className="vat-grid"><label>사건명<input data-testid="vat-label" value={w.label} onChange={e=>remember({...w,label:e.target.value})}/></label>
        <label>개인 사업자<select data-testid="vat-taxpayer" value={d.taxpayer_person_id||''} onChange={e=>change('taxpayer_person_id',e.target.value||null)}><option value="">고객의 당사자 선택</option>
          {d.taxpayer_person_id&&!people.some(p=>p.id===d.taxpayer_person_id)&&<option value={d.taxpayer_person_id}>{w.meta.case_input?.taxpayer_snapshot?.name||'저장된 사업자'}</option>}
          {people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          {field('business_name','사업장명')}{field('business_ref','사업장 구분 근거(내부 코드 등)')}
        </div>
        {personCursor&&<button onClick={()=>act(()=>persons(true))}>당사자 더 보기</button>}
        <p>등록할 당사자가 없으면 작업대의 당사자·재산 등록에서 먼저 등록하세요. 선택한 사업자 정보는 저장 버전별로 보존됩니다.</p>
        <h2>매출·매입 명세</h2><p>부가세 별도 공급가액과 증빙상 세액을 입력합니다. 현재는 공급가액10원 단위·정확한10% 세액만 연결합니다.</p>
        {d.transactions.map((r,i)=>{const set=(k,v)=>change('transactions',d.transactions.map(x=>x.local_id===r.local_id?{...x,[k]:v}:x));return <section className="vat-section" key={r.local_id}><div className="vat-grid">
          <label>구분<select data-testid={'vat-kind-'+i} value={r.kind} onChange={e=>change('transactions',d.transactions.map(x=>x.local_id===r.local_id?{...x,kind:e.target.value,deductible_vat:null}:x))}><option value="sale">매출</option><option value="purchase">매입</option></select></label>
          <label>공급일<input data-testid={'vat-date-'+i} type="date" value={r.supplied_on||''} onChange={e=>set('supplied_on',e.target.value||null)}/></label>
          {[['supply_amount','공급가액 (원)'],['vat_amount','증빙상 세액 (원)'],...(r.kind==='purchase'?[['deductible_vat','검토한 공제 가능 매입세액 (0원도 명시)']]:[]),['source_ref','증빙 참조번호'],['review_note','공급시기·공제 검토 근거']].map(([k,label])=><label key={k}>{label}<input data-testid={'vat-'+k+'-'+i} value={r[k]??''} onChange={e=>set(k,e.target.value)}/></label>)}
        </div><button data-testid={'vat-remove-'+i} onClick={()=>change('transactions',d.transactions.filter(x=>x.local_id!==r.local_id))}>거래 삭제</button></section>})}
        <button data-testid="vat-add" disabled={d.transactions.length>=200} onClick={()=>{change('transactions',[...d.transactions,{local_id:window.crypto.randomUUID(),kind:'sale',supplied_on:null,supply_amount:null,vat_amount:null,deductible_vat:null,source_ref:'',review_note:''}]);}}>거래 추가</button>
        <label><input data-testid="vat-no-transactions" type="checkbox" checked={d.no_transactions_confirmed} onChange={e=>change('no_transactions_confirmed',e.target.checked)}/>거래가 없는 무실적 기간입니다.</label>
        <div className="vat-grid">{field('prior_notice_tax','예정고지 차감액 (없으면0원)')}{field('prior_notice_source','예정고지·납부 확인 근거')}{field('review_note','전체 기간·지원 범위 검토 근거')}</div>
        {checks.map(([k,label])=><p key={k}><label><input data-testid={'vat-'+k} type="checkbox" checked={d[k]} onChange={e=>change(k,e.target.checked,true)}/>{label}</label></p>)}
      </fieldset>
      <p>저장된 사업자: {w.meta.case_input?.taxpayer_snapshot?.name||'미선택'} · 명세 합계는 저장할 때 계산합니다.</p>
      {w.meta.case_input?.worksheet&&<section className="vat-section"><h2>저장된 집계{vatDirty(w)?' · 수정 전 입력 기준':''}</h2><dl>{[['sales','매출 공급가액'],['purchases','매입 공급가액'],['output_tax','매출세액'],['input_tax','증빙 매입세액'],['deductible_input','공제 가능 매입세액'],['non_deductible_input','불공제 매입세액'],['prior_notice_tax','예정고지 차감액']].map(([k,label])=><React.Fragment key={k}><dt>{label}</dt><dd>{w.meta.case_input.worksheet[k]?.toLocaleString('ko-KR')??'미입력'}원</dd></React.Fragment>)}</dl></section>}
      {(w.meta.validation.errors||[]).length>0&&<ul>{w.meta.validation.errors.map((x,i)=><li key={i}>{x}</li>)}</ul>}
      <button disabled={busy||readonly} onClick={()=>act(save)}>입력 저장</button>
      <button disabled={busy||readonly} onClick={()=>act(async()=>{const s=await save();if(!s.validation.can_run)throw new Error('저장본의 보완 항목을 확인해 주세요.');await mutation(base+'/runs','POST',{revision_id:s.revision_id,expected_input_hash:s.input_hash});await load(s.case_id);})}>저장하고 계산</button>
      <label>다시 열 입력 버전<input data-testid="vat-reopen-revision" value={revision} onChange={e=>setRevision(e.target.value)}/></label><button disabled={busy} onClick={()=>{if(!vatDirty(w)||window.confirm('저장하지 않은 입력을 버리고 저장본을 여시겠습니까?'))act(()=>load(w.meta.case_id,revision));}}>저장본 다시 열기</button>
      {w.run&&<section className="vat-section"><h2>저장된 부가세 결과{vatDirty(w)?' · 수정 전 입력 기준':''}</h2><p data-testid="vat-payable">납부액 {w.run.response_snapshot.calc['납부세액'].toLocaleString('ko-KR')}원</p><p data-testid="vat-refund">환급액 {w.run.response_snapshot.calc['환급세액'].toLocaleString('ko-KR')}원</p><p>기한내 신고 기준 기한: {w.run.response_snapshot.calc['신고기한']}</p><details><summary>계산 내역</summary><pre>{JSON.stringify(w.run.response_snapshot.calc['단계별계산'],null,2)}</pre></details></section>}
    </>}
  </div>;
}
window.JTVatCases=JTVatCases;

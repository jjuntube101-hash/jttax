/* New customer source data. Tax relationship/relief judgments stay in the case. */
function JTPropertyMasters({clientId,onExit,onValuations}) {
  const acquisitionBlank=()=>({inheritance_date:'',decedent_acquisition_date:'',gift_received_date:'',donor_acquisition_date:'',donor_acquisition_price:'0',donor_gift_tax_paid:'0',donor_relationship:''});
  const blank=()=>({...acquisitionBlank(),necessary_expenses_detail:null,property_type:'주택',acquired_by:'매매',address:'',exclusive_area:'',acquisition_date:'',acquisition_price:'',necessary_expenses:'',debt_amount:'',rental_deposit:'',is_regulated_area:'',regulated_at_acquisition:'',note:'',facts_confirmed:false,ownerships:[{person_id:'',share_ratio:'1'}]});
  const [person,setPerson]=React.useState({name:'',birth_date:''}),[form,setForm]=React.useState(blank);
  const [persons,setPersons]=React.useState([]),[cursor,setCursor]=React.useState(null),[pending,setPending]=React.useState(null);
  const [personMeta,setPersonMeta]=React.useState(null),[propertyMeta,setPropertyMeta]=React.useState(null);
  const [personReason,setPersonReason]=React.useState(''),[propertyReason,setPropertyReason]=React.useState(''),[effective,setEffective]=React.useState('');
  const [properties,setProperties]=React.useState([]),[propertyCursor,setPropertyCursor]=React.useState(null),[audit,setAudit]=React.useState(null);
  const personBaseline=React.useRef(JSON.stringify({name:'',birth_date:''})),propertyBaseline=React.useRef(JSON.stringify(blank()));
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[message,setMessage]=React.useState('');
  const lock=React.useRef(false),alive=React.useRef(true),dirty=React.useRef(false),identity=React.useRef(jtGiftSession.uid);
  dirty.current=!!pending||!!personReason||!!propertyReason||!!effective||JSON.stringify(person)!==personBaseline.current||JSON.stringify(form)!==propertyBaseline.current;
  React.useEffect(()=>{alive.current=true;const protect=e=>{if(lock.current||dirty.current){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',protect);return()=>{alive.current=false;window.removeEventListener('beforeunload',protect);};},[]);
  const base='/v1/clients/'+clientId;
  const api=async(path,options={})=>{
    if(identity.current!==jtGiftSession.uid||!jtGiftSession.token)throw new Error('작업대에서 기존 계정으로 다시 로그인해 주세요.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    try{const res=await fetch((window.JT_ENGINE_BASE||'http://127.0.0.1:8000').replace(/\/$/,'')+path,
      {...options,signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+jtGiftSession.token,...options.headers}});
      const data=await res.json().catch(()=>({}));
      if(!res.ok){if(res.status===401)jtGiftSession.token='';
        const messages={EXPENSE_DETAIL_EXPLICIT_REQUIRED:'기존 필요경비 명세를 포함해 저장해 주세요.',MASTER_CHANGED:'다른 사용자가 원본을 변경했습니다. 입력을 확인하고 최신 원본을 다시 열어 주세요.',NO_MASTER_CHANGES:'변경된 값이 없습니다.',OWNERSHIP_DATE_REQUIRED_OR_OUT_OF_ORDER:'지분이 바뀌면 소유 변동일이 필요합니다. 취득일·기존 변동일 이후이고 오늘 이하여야 합니다.',OWNERSHIP_DATE_WITHOUT_CHANGE:'소유 지분을 바꾸지 않았다면 변동일을 비워 주세요.',ACQUISITION_AFTER_OWNERSHIP:'취득일이 기록된 소유 변동일보다 늦습니다.',MASTER_EDIT_UNSUPPORTED:'이 취득 유형의 원본 수정은 아직 지원하지 않습니다.'};
        const e=new Error(messages[data.detail?.code]||(res.status===401?'로그인이 만료됐습니다. 입력을 확인한 뒤 작업대에서 다시 로그인해 주세요.':res.status===404?'고객 또는 선택한 소유자를 찾을 수 없습니다.':res.status===422?'이름·날짜·금액·면적·소유 지분 및 사실 확인을 점검하세요.':res.status===409?'같은 등록 요청으로 다른 내용이 처리됐습니다. 등록 목록을 확인하세요.':'등록을 처리하지 못했습니다. 같은 요청으로 재시도해 주세요.'));e.status=res.status;e.code=data.detail?.code;throw e;}
      return data;
    }finally{clearTimeout(timer);}
  };
  const act=async fn=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{await fn();}catch(e){if(alive.current)setError(e.name==='AbortError'||e instanceof TypeError?'응답을 확인하지 못했습니다. 등록 재시도로 같은 요청의 결과를 확인하세요.':e.message);}
    finally{lock.current=false;if(alive.current)setBusy(false);}};
  const load=async(more=false)=>{const data=await api(base+'/persons'+(more&&cursor?'?cursor='+cursor:''));
    if(alive.current){setPersons(old=>more?[...old,...data.items]:data.items);setCursor(data.next_cursor);}};
  const loadProperties=async(more=false)=>{const data=await api(base+'/properties'+(more&&propertyCursor?'?cursor='+propertyCursor:''));if(alive.current){setProperties(old=>more?[...old,...data.items]:data.items);setPropertyCursor(data.next_cursor);}};
  const loadHistory=async(kind,id,more=false)=>{const data=await api(base+'/masters/'+kind+'/'+id+'/history'+(more&&audit?.next_before?'?before='+audit.next_before:''));if(alive.current)setAudit(old=>({kind,id,items:more?[...old.items,...data.items]:data.items,next_before:data.next_before}));};
  const accept=(kind,data)=>{
    if(kind==='persons'){const value={name:data.edit.name,birth_date:data.edit.birth_date||''};setPerson(value);personBaseline.current=JSON.stringify(value);setPersonMeta(data);setPersonReason('');}
    else{const value={...acquisitionBlank(),...data.edit,...Object.fromEntries(['inheritance_date','decedent_acquisition_date','gift_received_date','donor_acquisition_date'].map(k=>[k,data.edit[k]||''])),acquisition_date:data.edit.acquisition_date||'',is_regulated_area:data.edit.is_regulated_area?'yes':'no',regulated_at_acquisition:data.edit.regulated_at_acquisition?'yes':'no'};setForm(value);propertyBaseline.current=JSON.stringify(value);setPropertyMeta(data);setPropertyReason('');setEffective('');}
  };
  const open=(kind,id)=>act(async()=>{if(dirty.current&&!window.confirm('저장하지 않은 입력을 버리고 선택한 원본을 열까요?'))return;
    const data=await api(base+'/masters/'+kind+'/'+id);resetForms();accept(kind,data);setAudit(null);setMessage('');await loadHistory(kind,id);});
  const resetForms=()=>{setPerson({name:'',birth_date:''});setForm(blank());personBaseline.current=JSON.stringify({name:'',birth_date:''});propertyBaseline.current=JSON.stringify(blank());setPersonMeta(null);setPropertyMeta(null);setPersonReason('');setPropertyReason('');setEffective('');setPending(null);};
  const newForms=()=>{if(dirty.current&&!window.confirm('저장하지 않은 입력을 버리고 새 등록을 시작할까요?'))return;resetForms();setAudit(null);setError('');setMessage('');};
  React.useEffect(()=>{act(async()=>{await load();await loadProperties();});},[]);
  const change=(key,value)=>{setForm(old=>({...old,[key]:value,...(key==='facts_confirmed'?{}:{facts_confirmed:false})}));setMessage('');};
  const changeAcquisition=value=>{setForm(old=>({...old,...acquisitionBlank(),acquired_by:value,acquisition_date:'',acquisition_price:'',necessary_expenses:'',necessary_expenses_detail:null,regulated_at_acquisition:'',facts_confirmed:false}));setMessage('취득 경로가 바뀌었습니다. 취득일·금액·필요경비·취득 당시 조정지역과 근거를 다시 확인하세요.');};
  const expenseChange=detail=>{
    const rows=detail?.rows||[],sum=rows.filter(x=>x.included).reduce((n,x)=>n+BigInt(/^\d+$/.test(x.amount_krw)?x.amount_krw:'0'),0n);
    setForm(old=>({...old,necessary_expenses_detail:detail?{...detail,reviewed:false}:null,necessary_expenses:detail?String(sum):old.necessary_expenses,facts_confirmed:false}));
  };
  const expenseRow=(index,key,value)=>expenseChange({...form.necessary_expenses_detail,rows:form.necessary_expenses_detail.rows.map((r,i)=>i===index?{...r,[key]:value}:r)});
  const save=kind=>act(async()=>{
    let request=pending;
    if(!request){let body;
      if(kind==='person'){
        if(!person.name.trim())throw new Error('이름을 입력하세요.');
        body={name:person.name.trim(),birth_date:person.birth_date||null};
      }else{
        body={...form,amount_basis:'whole_property'};
        for(const key of ['inheritance_date','decedent_acquisition_date','gift_received_date','donor_acquisition_date'])body[key]=form[key]||null;
        for(const key of ['acquisition_price','necessary_expenses','debt_amount','rental_deposit','donor_acquisition_price','donor_gift_tax_paid']){
          if(!/^\d+$/.test(form[key])||!Number.isSafeInteger(Number(form[key])))throw new Error('금액은 0원 이상의 정수로 입력하세요. 없는 금액도 0원으로 확인해 주세요.');
          body[key]=Number(form[key]);
        }
        for(const key of ['is_regulated_area','regulated_at_acquisition']){
          if(!['yes','no'].includes(form[key]))throw new Error('조정대상지역 여부를 확인해 선택하세요.');
          body[key]=form[key]==='yes';
        }
        if(!form.facts_confirmed)throw new Error('전체 재산 금액과 소유 사실을 확인해 주세요.');
      }
      const meta=kind==='person'?personMeta:propertyMeta;
      if(meta){body.reason=kind==='person'?personReason.trim():propertyReason.trim();if(!body.reason)throw new Error('수정 사유를 입력하세요.');if(kind==='property')body.ownership_effective_date=effective||null;}
      request={kind,key:window.crypto.randomUUID(),body,meta:meta?{id:meta.id,etag:meta.etag}:null};setPending(request);
    }
    try{const noun=request.kind==='person'?'persons':'properties';
      const path=base+(request.meta?'/masters/'+noun+'/'+request.meta.id:'/'+noun);
      const data=await api(path,{method:request.meta?'PUT':'POST',headers:{'Idempotency-Key':request.key,...(request.meta?{'If-Match':request.meta.etag}:{})},body:JSON.stringify(request.body)});
      setPending(null);
      if(request.meta){accept(noun,data);setMessage('원본 수정과 변경 이력이 저장됐습니다. 사건에서 변경 자료를 다시 선택해 가져와야 반영됩니다.');await load();await loadProperties();await loadHistory(noun,data.id);}
      else if(request.kind==='person'){setPerson({name:'',birth_date:''});setPersons(old=>[...old.filter(p=>p.id!==data.id),data]);setMessage('당사자가 등록됐습니다. 소유자나 수증자로 선택할 수 있습니다.');}
      else{setForm(blank());propertyBaseline.current=JSON.stringify(blank());await loadProperties();setMessage('재산과 소유 지분이 함께 등록됐습니다. 평가자료를 추가한 뒤 사건에서 가져오세요.');}
    }catch(e){if([400,403,404,422].includes(e.status)||e.code==='MASTER_CHANGED')setPending(null);throw e;}
  });
  const leave=fn=>{if(!dirty.current||window.confirm(pending?'등록 결과가 미확인입니다. 서버에 저장됐을 수 있습니다. 목록을 확인하며 이동할까요?':'등록하지 않은 입력을 버리고 이동할까요?'))fn();};
  const frozen=busy||!!pending;
  const money=[['acquisition_price','취득금액'],['necessary_expenses','필요경비'],['debt_amount','채무액'],['rental_deposit','임대보증금']];
  return <div className="jt-container" style={{maxWidth:1040,padding:'32px 20px'}}>
    <style>{`.pm-card{background:white;border:1px solid #d9e0d9;border-radius:12px;padding:20px;margin:20px 0}.pm-fields{display:flex;flex-wrap:wrap;gap:16px}.pm-fields label{display:flex;flex-direction:column;gap:6px}.pm-card input,.pm-card select{padding:10px;font:inherit;min-height:44px;max-width:100%}.pm-card button{min-height:44px}.pm-owner{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}.pm-card fieldset{border:0;padding:0}`}</style>
    <button disabled={busy} onClick={()=>leave(onExit)}>← 고객·사건 작업대</button>
    <h1>당사자·재산 등록과 수정</h1><p>주택과 매매 취득 토지·상가의 원본 및 소유 변동 이력을 관리합니다. 분양권·입주권 등록은 아직 지원하지 않습니다.</p>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <section className="pm-card"><h2>기존 원본 열기</h2><button disabled={frozen} onClick={newForms}>새 등록으로 전환</button>
      <button disabled={busy} onClick={()=>act(()=>loadProperties())}>재산 목록 새로고침</button>
      <ul>{properties.map(p=><li key={p.id}>{p.address||'주소 없는 재산'} <button data-testid={'master-edit-property-'+p.id} disabled={frozen} onClick={()=>open('properties',p.id)}>재산 수정·이력</button></li>)}</ul>
      {propertyCursor&&<button disabled={busy} onClick={()=>act(()=>loadProperties(true))}>재산 더 보기</button>}
      <p>소유 변동은 취득 원인과 금액을 자동으로 결정하지 않습니다. 새 소유자의 취득 사실은 사건에서 다시 확인하세요. 과거 사건은 저장 당시 입력과 결과를 유지합니다.</p>
    </section>
    <section className="pm-card"><h2>1. 당사자 등록</h2><p>소유자와 수증자를 각각 등록할 수 있습니다. 세법상 관계는 사건에서 확인하며, 여기서 추정하지 않습니다.</p>
      <fieldset disabled={frozen}><div className="pm-fields"><label>이름<input data-testid="master-person-name" maxLength={200} value={person.name} onChange={e=>setPerson(old=>({...old,name:e.target.value}))} /></label>
        <label>생년월일(선택)<input data-testid="master-person-birth" type="date" value={person.birth_date} onChange={e=>setPerson(old=>({...old,birth_date:e.target.value}))} /></label></div></fieldset>
      {personMeta&&<><p>수정 중 · 변경 {personMeta.revision}회</p><label>수정 사유<input data-testid="master-person-reason" value={personReason} maxLength={1000} disabled={frozen} onChange={e=>setPersonReason(e.target.value)} /></label><button disabled={frozen} onClick={()=>open('persons',personMeta.id)}>당사자 최신 원본 다시 열기</button></>}
      <button data-testid="master-person-save" disabled={busy||(pending&&pending.kind!=='person')||(!pending&&!person.name.trim())} onClick={()=>save('person')}>{pending?.kind==='person'?(pending.meta?'당사자 수정 재시도':'당사자 등록 재시도'):(personMeta?'당사자 수정 저장':'당사자 등록')}</button>
      <button disabled={busy} onClick={()=>act(()=>load())}>당사자 새로고침</button>{cursor&&<button disabled={busy} onClick={()=>act(()=>load(true))}>당사자 더 보기</button>}
      <ul>{persons.map(p=><li key={p.id}>{p.name} · {p.birth_date||'생년월일 미등록'} <button data-testid={'master-edit-person-'+p.id} disabled={frozen} onClick={()=>open('persons',p.id)}>당사자 수정·이력</button></li>)}</ul>
    </section>
    <section className="pm-card"><h2>2. 재산과 소유 지분 등록</h2><p>금액은 전체 재산 기준입니다. 없는 채무·보증금도 0원으로 입력하세요. 등록 지분 합계는 1 이하여야 하며, 미등록 지분은 자동으로 추정하지 않습니다.</p>
      <fieldset disabled={frozen||(propertyMeta&&!propertyMeta.editable)}><div className="pm-fields">
        <label>자산 유형<select data-testid="master-property_type" value={form.property_type} onChange={e=>{const property_type=e.target.value;setForm(old=>({...old,...acquisitionBlank(),property_type,acquired_by:'매매',is_regulated_area:property_type==='주택'?'':'no',regulated_at_acquisition:property_type==='주택'?'':'no',facts_confirmed:false}));}}><option>주택</option><option>토지</option><option>상가</option></select></label>
        <label>소재지<input data-testid="master-address" maxLength={500} value={form.address} onChange={e=>change('address',e.target.value)} /></label>
        <label>{form.property_type==='토지'?'토지면적(㎡)':'전용면적(㎡)'}<input data-testid="master-exclusive_area" inputMode="decimal" value={form.exclusive_area} onChange={e=>change('exclusive_area',e.target.value)} /></label>
        <label>취득 경로<select data-testid="master-acquired_by" value={form.acquired_by} onChange={e=>changeAcquisition(e.target.value)}><option>매매</option>{form.property_type==='주택'&&<><option>상속</option><option>증여</option></>}</select></label>
        <label>취득일<input data-testid="master-acquisition_date" type="date" value={form.acquisition_date} onChange={e=>change('acquisition_date',e.target.value)} /></label>
        {money.map(([k,label])=><label key={k}>{label}(원)<input data-testid={'master-'+k} inputMode="numeric" disabled={k==='necessary_expenses'&&!!form.necessary_expenses_detail} value={form[k]} onChange={e=>change(k,e.target.value)} /></label>)}
        {form.property_type==='주택'&&[['is_regulated_area','현재 조정대상지역'],['regulated_at_acquisition','취득 당시 조정대상지역']].map(([k,label])=><label key={k}>{label}<select data-testid={'master-'+k} value={form[k]} onChange={e=>change(k,e.target.value)}><option value="">확인 후 선택</option><option value="yes">해당</option><option value="no">해당 없음</option></select></label>)}
        <label>자료 출처·검토 메모<input data-testid="master-note" maxLength={1000} value={form.note} onChange={e=>change('note',e.target.value)} /></label>
      </div>
        {form.acquired_by==='상속'&&<div className="pm-fields">
          <label>상속개시일(취득일과 일치)<input data-testid="master-inheritance_date" type="date" value={form.inheritance_date} onChange={e=>change('inheritance_date',e.target.value)} /></label>
          <label>피상속인 취득일<input data-testid="master-decedent_acquisition_date" type="date" value={form.decedent_acquisition_date} onChange={e=>change('decedent_acquisition_date',e.target.value)} /></label>
        </div>}
        {form.acquired_by==='증여'&&<><div className="pm-fields">
          <label>증여받은 날(취득일과 일치)<input data-testid="master-gift_received_date" type="date" value={form.gift_received_date} onChange={e=>change('gift_received_date',e.target.value)} /></label>
          <label>증여자 관계<select data-testid="master-donor_relationship" value={form.donor_relationship} onChange={e=>change('donor_relationship',e.target.value)}><option value="">확인 후 선택</option>{['배우자','직계존비속','직계존속','직계비속','기타'].map(x=><option key={x}>{x}</option>)}</select></label>
          <label>증여자 취득일(확인된 경우)<input data-testid="master-donor_acquisition_date" type="date" value={form.donor_acquisition_date} onChange={e=>change('donor_acquisition_date',e.target.value)} /></label>
          {[['donor_acquisition_price','증여자 취득금액'],['donor_gift_tax_paid','이 재산에 대응하는 증여세 산출세액']].map(([k,label])=><label key={k}>{label}(원)<input data-testid={'master-'+k} inputMode="numeric" disabled={k==='necessary_expenses'&&!!form.necessary_expenses_detail} value={form[k]} onChange={e=>change(k,e.target.value)} /></label>)}
        </div><p>취득금액·증여세 산출세액은 전체 재산에 대응하는 금액입니다. 미확인 시 0으로 보관하고 사건에서 보완하세요. 실제 납부액과 구분하며, 이월과세 적용 여부와 일부 지분의 배분액은 양도 사건에서 따로 확인합니다.</p></>}
        {form.acquired_by!=='매매'&&<p>취득금액에는 해당 취득 당시 확인한 평가액을 입력하고, 자료 출처·검토 메모에 근거를 남기세요. 원본 등록만으로 특례가 적용되지는 않습니다.</p>}
      <h3>필요경비 명세</h3><p>재산 전체 기준으로 검토한 금액입니다. 항목명만으로 산입을 판정하지 않으며 취득가액에 이미 포함한 금액을 중복 산입하지 마세요.</p>
        <label>입력 방식<select data-testid="expense-mode" value={form.necessary_expenses_detail?'detail':'total'} onChange={e=>{
          if(e.target.value==='total'){if(window.confirm('현재 명세를 비우고 합계 입력으로 전환할까요? 저장된 과거 이력은 유지됩니다.'))expenseChange(null);}
          else expenseChange({schema_version:'property-expenses/1',reviewed:false,review_note:'',rows:[{local_id:window.crypto.randomUUID(),description:'',amount_krw:form.necessary_expenses||'0',included:false,source:''}]});
        }}><option value="total">합계 입력</option><option value="detail">명세 합계 사용</option></select></label>
        {form.necessary_expenses_detail?.schema_version==='property-expenses/1'&&(!propertyMeta||propertyMeta.editable)&&<>
          {form.necessary_expenses_detail.rows.map((r,i)=><div className="pm-owner" key={r.local_id}>
            <label>항목명<input data-testid={'expense-description-'+i} value={r.description} maxLength={200} onChange={e=>expenseRow(i,'description',e.target.value)} /></label>
            <label>금액(원)<input data-testid={'expense-amount-'+i} value={r.amount_krw} inputMode="numeric" onChange={e=>expenseRow(i,'amount_krw',e.target.value)} /></label>
            <label>증빙 출처·제외 사유<input data-testid={'expense-source-'+i} value={r.source} maxLength={500} onChange={e=>expenseRow(i,'source',e.target.value)} /></label>
            <label><input data-testid={'expense-included-'+i} type="checkbox" checked={r.included} onChange={e=>expenseRow(i,'included',e.target.checked)} />검토 후 산입</label>
            <button data-testid={'expense-remove-'+i} disabled={form.necessary_expenses_detail.rows.length===1} onClick={()=>expenseChange({...form.necessary_expenses_detail,rows:form.necessary_expenses_detail.rows.filter((_,j)=>i!==j)})}>항목 삭제</button>
          </div>)}
          <button data-testid="expense-add" disabled={form.necessary_expenses_detail.rows.length>=100} onClick={()=>expenseChange({...form.necessary_expenses_detail,rows:[...form.necessary_expenses_detail.rows,{local_id:window.crypto.randomUUID(),description:'',amount_krw:'0',included:false,source:''}]})}>필요경비 항목 추가</button>
          <p data-testid="expense-total">산입 합계 {form.necessary_expenses}원</p>
          <label>산입·제외 검토 근거<input data-testid="expense-review-note" value={form.necessary_expenses_detail.review_note} maxLength={1000} onChange={e=>expenseChange({...form.necessary_expenses_detail,review_note:e.target.value})} /></label>
          <label><input data-testid="expense-reviewed" type="checkbox" checked={form.necessary_expenses_detail.reviewed} onChange={e=>change('necessary_expenses_detail',{...form.necessary_expenses_detail,reviewed:e.target.checked})} />금액·증빙·산입 범위와 취득가액 중복 여부를 확인했습니다.</label>
        </>}
      <h3>소유자와 전체 재산 대비 지분</h3>
        {form.ownerships.map((o,i)=><div className="pm-owner" key={i}>
          <label>소유자<select data-testid={'master-owner-'+i} value={o.person_id} onChange={e=>change('ownerships',form.ownerships.map((x,j)=>i===j?{...x,person_id:e.target.value}:x))}><option value="">소유자 선택</option>{o.person_id&&!persons.some(p=>p.id===o.person_id)&&<option value={o.person_id}>{propertyMeta?.snapshot.ownerships.find(x=>x.person_id===o.person_id)?.name||'선택된 소유자'} · 기존 선택</option>}{persons.map(p=><option key={p.id} value={p.id}>{p.name} · {p.birth_date||'생년월일 미등록'} · {p.id.slice(0,8)}</option>)}</select></label>
          <label>지분(1=전체, 0.5=절반)<input data-testid={'master-share-'+i} inputMode="decimal" value={o.share_ratio} onChange={e=>change('ownerships',form.ownerships.map((x,j)=>i===j?{...x,share_ratio:e.target.value}:x))} /></label>
          <button disabled={form.ownerships.length===1} onClick={()=>change('ownerships',form.ownerships.filter((_,j)=>i!==j))}>소유자 제외</button>
        </div>)}
        <button data-testid="master-owner-add" disabled={form.ownerships.length>=20} onClick={()=>change('ownerships',[...form.ownerships,{person_id:'',share_ratio:''}])}>소유자 추가</button>
        {propertyMeta&&<><p>수정 중 · 변경 {propertyMeta.revision}회 · 최근 소유 변동일 {propertyMeta.snapshot.record.ownership_effective_date||'기록 없음'}</p>
          <label>수정 사유<input data-testid="master-property-reason" maxLength={1000} value={propertyReason} onChange={e=>{setPropertyReason(e.target.value);change('facts_confirmed',false);}} /></label>
          <label>소유 변동일(지분·소유자 변경 시 필수)<input data-testid="master-effective" type="date" value={effective} onChange={e=>{setEffective(e.target.value);change('facts_confirmed',false);}} /></label></>}
        <p><label><input data-testid="master-confirm" type="checkbox" checked={form.facts_confirmed} onChange={e=>change('facts_confirmed',e.target.checked)} />전체 재산의 금액·취득 사실·기재한 소유 지분을 확인했습니다.</label></p>
      </fieldset>
      <button data-testid="master-property-save" disabled={busy||(propertyMeta&&!propertyMeta.editable)||(pending&&pending.kind!=='property')||(!pending&&!form.facts_confirmed)} onClick={()=>save('property')}>{pending?.kind==='property'?(pending.meta?'재산 수정 재시도':'재산 등록 재시도'):(propertyMeta?'재산·소유 수정 저장':'재산·소유 등록')}</button>
    </section>
    {propertyMeta&&<><button disabled={frozen} onClick={()=>open('properties',propertyMeta.id)}>재산 최신 원본 다시 열기</button>{!propertyMeta.editable&&<p role="alert">이 취득 유형 또는 보관된 필요경비 형식은 현재 읽기와 이력 조회만 지원합니다.</p>}</>}
    {audit&&<section className="pm-card" data-testid="master-history"><h2>원본 변경 이력</h2><p>변경 전후 자료와 기록 시점입니다. 과거 사건을 자동으로 고치거나 이 이력으로 과거 지분을 자동 채택하지 않습니다.</p>
      {!audit.items.length&&<p>기록된 수정이 없습니다.</p>}{audit.items.map(h=><details key={h.id}><summary>변경 {h.revision} · {h.reason} · {h.ownership_effective_date?'소유 변동일 '+h.ownership_effective_date:'정보 정정'}</summary>
        <p>기록 {h.recorded_at} · 수정자 {h.actor_id}</p>
        <table><thead><tr><th>항목</th><th>변경 전</th><th>변경 후</th></tr></thead><tbody>{Object.entries({name:'이름',birth_date:'생년월일',address:'소재지',acquired_by:'취득 경로',inheritance_date:'상속개시일',decedent_acquisition_date:'피상속인 취득일',gift_received_date:'증여받은 날',donor_acquisition_date:'증여자 취득일',donor_acquisition_price:'증여자 취득금액',donor_gift_tax_paid:'증여세 산출세액',donor_relationship:'증여자 관계',exclusive_area:'면적',acquisition_date:'취득일',acquisition_price:'취득금액',necessary_expenses:'필요경비',necessary_expenses_detail:'필요경비 명세',debt_amount:'채무',rental_deposit:'보증금',is_regulated_area:'현재 조정지역',regulated_at_acquisition:'취득 당시 조정지역',note:'출처 메모',ownership_effective_date:'소유 변동일'}).filter(([k])=>h.before_snapshot.record[k]!==h.after_snapshot.record[k]).map(([k,label])=><tr key={k}><th>{label}</th><td>{(k==='necessary_expenses_detail'?JSON.stringify(h.before_snapshot.record[k]):String(h.before_snapshot.record[k]??'미등록'))}</td><td>{(k==='necessary_expenses_detail'?JSON.stringify(h.after_snapshot.record[k]):String(h.after_snapshot.record[k]??'미등록'))}</td></tr>)}</tbody></table>
        {h.before_snapshot.ownerships&&<><p>변경 전 소유: {h.before_snapshot.ownerships.map(x=>x.name+' '+x.share_ratio).join(' / ')}</p><p>변경 후 소유: {h.after_snapshot.ownerships.map(x=>x.name+' '+x.share_ratio).join(' / ')}</p></>}
      </details>)}{audit.next_before&&<button disabled={busy} onClick={()=>act(()=>loadHistory(audit.kind,audit.id,true))}>이력 더 보기</button>}
    </section>}
    <button disabled={busy} onClick={()=>leave(onValuations)}>평가자료 등록으로 이동</button>
  </div>;
}
window.JTPropertyMasters=JTPropertyMasters;

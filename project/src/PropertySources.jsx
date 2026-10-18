/* Append-only master valuations. Adoption into a case remains explicit. */
function JTPropertySources({ clientId, onExit }) {
  const blank = () => ({valuation_type:'예정가',as_of_date:'',amount:'',source:'',confirmed:false});
  const [properties,setProperties]=React.useState([]),[propertyCursor,setPropertyCursor]=React.useState(null);
  const [propertyId,setPropertyId]=React.useState(''),[rows,setRows]=React.useState([]),[cursor,setCursor]=React.useState(null);
  const [xlsx,setXlsx]=React.useState(null);
  const [files,setFiles]=React.useState([]),[fileCursor,setFileCursor]=React.useState(null),[opened,setOpened]=React.useState(null);
  const [batch,setBatch]=React.useState(''),[batchConfirmed,setBatchConfirmed]=React.useState(false);
  const [form,setForm]=React.useState(blank),[pending,setPending]=React.useState(null);
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[message,setMessage]=React.useState('');
  const lock=React.useRef(false),alive=React.useRef(true),dirty=React.useRef(false),identity=React.useRef(jtGiftSession.uid);
  dirty.current=!!pending||!!batch||JSON.stringify(form)!==JSON.stringify(blank());
  React.useEffect(()=>{alive.current=true;const protect=e=>{if(lock.current||dirty.current){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',protect);return()=>{alive.current=false;window.removeEventListener('beforeunload',protect);};},[]);
  const api=async(path,options={})=>{
    if(identity.current!==jtGiftSession.uid||!jtGiftSession.token)throw new Error('작업대에서 기존 계정으로 다시 로그인해 주세요.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    try{const response=await fetch((window.JT_ENGINE_BASE||'http://127.0.0.1:8000').replace(/\/$/,'')+path,
      {...options,signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+jtGiftSession.token,...options.headers}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){if(response.status===401)jtGiftSession.token='';
        const e=new Error(response.status===401?'로그인이 만료됐습니다. 입력을 확인하고 작업대로 돌아가 다시 로그인해 주세요.':response.status===404?'선택한 고객의 재산을 찾을 수 없습니다.':response.status===422?'금액·기준일·출처·전체 재산 확인을 점검하세요.':response.status===409?'이 저장 요청과 다른 내용이 이미 처리됐습니다. 등록 목록을 확인해 주세요.':'요청 처리에 실패했습니다. 다시 시도해 주세요.');e.status=response.status;if(Array.isArray(data.detail))e.message=data.detail.map(x=>{const i=x.loc?.indexOf('rows');return (i>=0&&Number.isInteger(x.loc[i+1])?(x.loc[i+1]+1)+'행: ':'')+x.msg;}).join(' / ');throw e;}
      return data;
    }finally{clearTimeout(timer);}
  };
  const base='/v1/clients/'+clientId+'/properties';
  const act=async fn=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{await fn();}catch(e){if(alive.current)setError(e.name==='AbortError'||e instanceof TypeError?'응답을 확인하지 못했습니다. 등록 재시도로 같은 요청의 처리 결과를 확인하세요.':e.message);}
    finally{lock.current=false;if(alive.current)setBusy(false);}};
  const loadProperties=async(more=false)=>{const data=await api(base+(more&&propertyCursor?'?cursor='+propertyCursor:''));
    if(alive.current){setProperties(old=>more?[...old,...data.items]:data.items);setPropertyCursor(data.next_cursor);}};
  const loadRows=async(id=propertyId,more=false)=>{const data=await api(base+'/'+id+'/valuations'+(more&&cursor?'?cursor='+cursor:''));
    if(alive.current){setRows(old=>more?[...old,...data.items]:data.items);setCursor(data.next_cursor);}};
  const loadFiles=async(id=propertyId,more=false)=>{const data=await api(base+'/'+id+'/valuation-files'+(more&&fileCursor?'?cursor='+fileCursor:''));
    if(alive.current){setFiles(old=>more?[...old,...data.items]:data.items);setFileCursor(data.next_cursor);}};
  const openFile=id=>act(async()=>{setOpened(null);const data=await api(base+'/'+propertyId+'/valuation-files/'+id);if(alive.current)setOpened(data);});
  const download=()=>{if(!opened)return;const bytes=window.Uint8Array.from(window.atob(opened.content_base64),c=>c.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const link=document.createElement('a');link.href=url;link.download=opened.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  React.useEffect(()=>{act(()=>loadProperties());},[]);
  const select=id=>act(async()=>{if(dirty.current&&!window.confirm('등록하지 않은 평가 입력을 버리고 재산을 바꿀까요?'))return;
    setBatch('');setBatchConfirmed(false);setXlsx(null);setPropertyId(id);setRows([]);setCursor(null);setForm(blank());setPending(null);setMessage('');setFiles([]);setFileCursor(null);setOpened(null);if(id){await loadRows(id);await loadFiles(id);}});
  const update=(key,value)=>{setForm(old=>({...old,[key]:value,...(key!=='confirmed'?{confirmed:false}:{})}));setMessage('');};
  const save=()=>act(async()=>{
    let request=pending;
    if(!request){const amount=Number(form.amount);
      if(!/^\d+$/.test(form.amount)||!Number.isSafeInteger(amount)||amount<0||!/^\d{4}-\d{2}-\d{2}$/.test(form.as_of_date)||!form.source.trim()||!form.confirmed)
        throw new Error('0원 이상의 정수 금액·기준일·출처를 입력하고 전체 재산 금액임을 확인하세요.');
      request={key:window.crypto.randomUUID(),propertyId,body:{valuation_type:form.valuation_type,as_of_date:form.as_of_date,amount,source:form.source.trim(),valuation_basis:'whole_property',whole_property_confirmed:true}};
      setPending(request);
    }
    try{await api(base+'/'+request.propertyId+'/valuations',{method:'POST',headers:{'Idempotency-Key':request.key},body:JSON.stringify(request.body)});}
    catch(e){if([400,403,404,422].includes(e.status))setPending(null);throw e;}
    setPending(null);setForm(blank());setMessage('새 평가자료가 등록됐습니다. 사건에서 자료를 선택하고 채택해야 입력에 반영됩니다.');
    await loadRows(request.propertyId);
  });
  const previewXlsx=file=>act(async()=>{
    setXlsx(null);setBatch('');setBatchConfirmed(false);setMessage('');
    if(!file)return;
    if(!/\.xlsx$/i.test(file.name)||file.size>2097152)throw new Error('2 MiB 이하 XLSX 파일을 선택하세요.');
    const bytes=new window.Uint8Array(await file.arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const result=await api(base+'/'+propertyId+'/valuation-xlsx-preview',{method:'POST',body:JSON.stringify({content_base64:window.btoa(binary)})});
    if(alive.current){setXlsx({...result,name:file.name,content_base64:window.btoa(binary)});setBatch(result.batch.rows.map(r=>[r.as_of_date,r.valuation_type,String(r.amount),r.source].join('\t')).join('\n'));}
  });
  const saveBatch=()=>act(async()=>{
    let request=pending;
    if(!request){
      if(!batchConfirmed)throw new Error('일괄 자료의 전체 재산 기준·날짜·출처를 확인하세요.');
      const lines=batch.replace(/\r/g,'').trim().split('\n');
      if(!batch.trim()||lines.length>100)throw new Error('1~100행을 입력하세요.');
      const rows=lines.map((line,index)=>{const cols=line.split('\t');if(cols.length!==4)throw new Error((index+1)+'행: 기준일, 종류, 금액, 출처 4열이 필요합니다.');
        const [as_of_date,valuation_type,raw,source]=cols.map(x=>x.trim());
        if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw new Error((index+1)+'행: 금액은 정확한 0원 이상 정수입니다.');
        return {property_id:propertyId,as_of_date,valuation_type,amount:Number(raw),source,valuation_basis:'whole_property',whole_property_confirmed:true};});
      request={kind:'batch',key:window.crypto.randomUUID(),propertyId,body:{schema_version:'valuation-batch/1',rows,...(xlsx?{source_file:{filename:xlsx.name,content_base64:xlsx.content_base64,expected_sha256:xlsx.file_sha256}}:{})}};setPending(request);
    }
    try{const saved=await api('/v1/clients/'+clientId+'/valuation-batches',{method:'POST',headers:{'Idempotency-Key':request.key},body:JSON.stringify(request.body)});
      setPending(null);setBatch('');setBatchConfirmed(false);setXlsx(null);setMessage(saved.count+'행이 모두 등록됐습니다. 과거 사건 입력과 결과는 유지됩니다.');await loadRows(request.propertyId);await loadFiles(request.propertyId);
    }catch(e){if([400,403,404,422].includes(e.status))setPending(null);throw e;}
  });
  const frozen=busy||!!pending;
  return <div className="jt-container cw-workspace">
    <style>{`.pv-card{background:white;border:1px solid #d9e0d9;border-radius:12px;padding:20px;margin:20px 0}.pv-fields{display:flex;gap:16px;flex-wrap:wrap}.pv-fields label{display:flex;flex-direction:column;gap:6px}.pv-fields input,.pv-fields select{font:inherit;padding:10px;min-height:44px}.pv-table{overflow-x:auto}.pv-table table{width:100%;border-collapse:collapse}.pv-table td,.pv-table th{padding:12px;border-bottom:1px solid #ddd;text-align:left}.pv-card [role=alert]{color:#82391e}.pv-card button{min-height:44px}`}</style>
    <button disabled={busy} onClick={()=>{if(!dirty.current||window.confirm(pending?'등록 결과가 미확인입니다. 서버에 저장됐을 수 있습니다. 작업대로 돌아갈까요?':'등록하지 않은 평가 입력을 버리고 작업대로 돌아갈까요?'))onExit();}}>← 고객·사건 작업대</button>
    <h1>재산 평가자료</h1><p>고객의 기존 재산에 평가자료를 추가합니다. 과거 사건과 계산 결과는 유지되며, 사건마다 사용할 자료를 선택합니다.</p>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <section className="pv-card"><div className="pv-fields"><label>재산<select data-testid="valuation-property" disabled={frozen} value={propertyId} onChange={e=>select(e.target.value)}>
      <option value="">재산 선택</option>{properties.map(p=><option key={p.id} value={p.id}>{p.address||'주소 없는 재산'} · {p.property_type}</option>)}</select></label>
      <button disabled={busy} onClick={()=>act(()=>loadProperties())}>재산 새로고침</button>{propertyCursor&&<button disabled={busy} onClick={()=>act(()=>loadProperties(true))}>재산 더 보기</button>}</div>
      {!properties.length&&!busy&&<p>등록된 재산이 없습니다. 현재는 기존 재산의 평가자료 등록을 지원합니다.</p>}</section>
    {propertyId&&<><section className="pv-card"><h2>새 평가 등록</h2><p>지분 금액이 아닌 전체 재산의 금액을 입력하세요. 지분 반영은 사건에서 처리합니다. 입력 금액은 외부 조회로 검증된 값이 아닙니다.</p>
      <fieldset disabled={frozen}><div className="pv-fields">
        <label>평가 종류<select data-testid="valuation-type" value={form.valuation_type} onChange={e=>update('valuation_type',e.target.value)}>{['공시가격','시가_유사매매','실지거래','예정가','감정가','기준시가'].map(t=><option key={t}>{t}</option>)}</select></label>
        <label>기준일<input data-testid="valuation-date" type="date" value={form.as_of_date} onChange={e=>update('as_of_date',e.target.value)} /></label>
        <label>전체 재산 금액(원)<input data-testid="valuation-amount" inputMode="numeric" value={form.amount} onChange={e=>update('amount',e.target.value)} /></label>
        <label>자료 출처<input data-testid="valuation-source" maxLength={500} value={form.source} onChange={e=>update('source',e.target.value)} /></label>
      </div><label><input data-testid="valuation-confirm" type="checkbox" checked={form.confirmed} onChange={e=>update('confirmed',e.target.checked)} />전체 재산의 금액과 기준일·출처를 확인했습니다.</label></fieldset>
      {form.valuation_type==='시가_유사매매'&&<p>유사매매 자료는 사건에서 홈택스 확인 등 채택 검토가 필요합니다.</p>}
      <button data-testid="valuation-save" disabled={busy||pending?.kind==='batch'||(!pending&&!form.confirmed)} onClick={save}>{pending?'등록 재시도':'평가자료 등록'}</button>
    </section><section className="pv-card"><h2>평가자료 일괄 등록</h2><p>선택한 재산의 자료를 표에서 복사해 붙여넣으세요. 머리글 없이 기준일(YYYY-MM-DD) · 종류 · 금액(원, 쉼표 없음) · 출처 순서의 탭 구분 4열, 최대 100행입니다. 하나라도 잘못되면 전체를 등록하지 않습니다.</p>
      <p>우리 XLSX 형식: 표시된 시트 한 개, 첫 행은 재산ID · 기준일 · 종류 · 금액(원) · 출처 5열입니다. 모든 셀을 텍스트로 입력하세요. 날짜는 YYYY-MM-DD, 금액은 쉼표 없는 정수이며 수식·빈 행·숨긴 행·병합·필터는 지원하지 않습니다.</p>
      <p>선택한 재산ID: <code data-testid="xlsx-property-id">{propertyId}</code></p>
      <label>XLSX 읽기 (최대 2 MiB)<input data-testid="valuation-xlsx" type="file" accept=".xlsx" disabled={frozen} onChange={e=>{const file=e.target.files?.[0];e.target.value='';previewXlsx(file);}}/></label>
      {xlsx&&<div data-testid="xlsx-preview"><p>{xlsx.name} · {xlsx.sheet_name} · {xlsx.batch.rows.length}행 — 아직 저장하지 않았습니다. 전체 행 등록 시 이 원본 파일도 함께 보존됩니다. 아래 표를 확인하세요.</p>
        <div className="pv-table"><table><thead><tr><th>기준일</th><th>종류</th><th>전체 금액(원)</th><th>출처</th></tr></thead><tbody>{xlsx.batch.rows.map((r,i)=><tr key={i}><td>{r.as_of_date}</td><td>{r.valuation_type}</td><td>{String(r.amount)}</td><td>{r.source}</td></tr>)}</tbody></table></div></div>}
      <fieldset disabled={frozen}><textarea data-testid="valuation-batch" rows={6} aria-label="일괄 평가자료" value={batch} onChange={e=>{setBatch(e.target.value);setBatchConfirmed(false);setXlsx(null);}}/>
      <label><input data-testid="valuation-batch-confirm" type="checkbox" checked={batchConfirmed} onChange={e=>setBatchConfirmed(e.target.checked)}/>모든 행의 전체 재산 금액·종류·기준일·출처를 확인했습니다.</label></fieldset>
      <button data-testid="valuation-batch-save" disabled={busy||(pending&&pending.kind!=='batch')||(!pending&&!batchConfirmed)} onClick={saveBatch}>{pending?.kind==='batch'?'일괄 등록 재시도':'전체 행 등록'}</button>
    </section><section className="pv-card"><h2>등록된 평가자료</h2><button disabled={busy} onClick={()=>act(()=>loadRows())}>평가 목록 새로고침</button>
      <div className="pv-table"><table><thead><tr><th>기준일</th><th>종류</th><th>전체 재산 금액(원)</th><th>출처</th><th>채택 검토</th></tr></thead><tbody>{[...rows].sort((a,b)=>b.as_of_date.localeCompare(a.as_of_date)||a.id.localeCompare(b.id)).map(r=><tr key={r.id} data-testid={'valuation-row-'+r.id}><td>{r.as_of_date}</td><td>{r.valuation_type}</td><td>{BigInt(r.amount).toLocaleString('ko-KR')}</td><td>{r.source}</td><td>{r.hometax_confirm_required?'홈택스 확인 필요':'사건에서 판단'}</td></tr>)}</tbody></table></div>
      {!rows.length&&<p>표시할 평가자료가 없습니다.</p>}{cursor&&<button disabled={busy} onClick={()=>act(()=>loadRows(propertyId,true))}>평가 더 보기</button>}
    </section><section className="pv-card"><h2>보존된 XLSX 원본</h2>
      <p>원본 파일과 등록 당시 평가행·영수증을 확인합니다. 이후 정정된 평가자료와 과거 사건 결과는 각각 유지됩니다.</p>
      <button disabled={busy} onClick={()=>act(()=>loadFiles())}>원본 목록 새로고침</button>
      {files.map(f=><p key={f.id}><button data-testid={'valuation-file-'+f.id} disabled={busy} onClick={()=>openFile(f.id)}>{f.metadata.filename} 원본 열기</button> · {f.metadata.byte_size}바이트</p>)}
      {fileCursor&&<button disabled={busy} onClick={()=>act(()=>loadFiles(propertyId,true))}>원본 더 보기</button>}
      {!files.length&&<p>보존된 원본이 없습니다. 이전에 행만 등록한 자료는 원본을 복원할 수 없습니다.</p>}
      {opened&&<div data-testid="valuation-original"><h3>{opened.filename}</h3><p>{opened.sheet_name} · {opened.byte_size}바이트</p>
        <p>SHA-256: <code>{opened.file_sha256}</code></p><p>등록 영수증: <code>{opened.operation} / {opened.idempotency_key}</code></p>
        <button data-testid="valuation-original-download" onClick={download}>보존 원본 내려받기</button>
        <div className="pv-table"><table><thead><tr><th>파일 행</th><th>평가행 ID</th><th>기준일</th><th>종류</th><th>금액(원)</th><th>출처</th></tr></thead>
        <tbody>{opened.registration.items.map(r=><tr key={r.id}><td>{r.row_number+1}</td><td>{r.id}</td><td>{r.as_of_date}</td><td>{r.valuation_type}</td><td>{r.amount}</td><td>{r.source}</td></tr>)}</tbody></table></div></div>}
    </section></>}
  </div>;
}
window.JTPropertySources=JTPropertySources;

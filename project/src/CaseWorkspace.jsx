/* Customer/case navigation. Existing gift revisions, runs and auth stay authoritative. */
function JTCaseWorkspace({ onBack }) {
  const [token, setToken] = React.useState(jtGiftSession.token);
  const [email, setEmail] = React.useState(''), [password, setPassword] = React.useState('');
  const [clients, setClients] = React.useState([]), [clientCursor, setClientCursor] = React.useState(null);
  const [clientId, setClientId] = React.useState(jtGiftSession.workspace?.clientId || '');
  const [name, setName] = React.useState('');
  const [cases, setCases] = React.useState([]), [cursor, setCursor] = React.useState(null);
  const [editor, setEditor] = React.useState(false), [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const lock = React.useRef(false), generation = React.useRef(0), alive = React.useRef(true);
  const createKeys = React.useRef({});
  const createdCases = React.useRef({});
  React.useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; generation.current++; };
  }, []);
  const api = async (path, options = {}, credential = token) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch((window.JT_ENGINE_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '') + path,
        { ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json',
          ...(credential ? { Authorization: 'Bearer ' + credential } : {}), ...options.headers } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) { jtGiftSession.token = ''; if (alive.current) setToken(''); }
        throw new Error(response.status === 401 ? '로그인이 필요합니다. 편집 내용은 메모리에 유지됩니다.' :
          response.status === 404 ? '고객 또는 사건을 찾을 수 없습니다.' : '요청을 처리하지 못했습니다. 목록을 확인한 뒤 다시 시도해 주세요.');
      }
      return data;
    } finally { clearTimeout(timer); }
  };
  const act = async fn => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await fn(); } catch (e) { if (alive.current) setError(e.name === 'AbortError' || e instanceof TypeError ?
      '연결이 끊겼습니다. 서버에 저장됐을 수 있으므로 목록을 새로고침해 확인하세요.' : e.message); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const loadClients = async (more = false) => {
    const data = await api('/v1/clients' + (more && clientCursor ? '?cursor=' + clientCursor : ''));
    if (alive.current) { setClients(old => more ? [...old, ...data.items] : data.items); setClientCursor(data.next_cursor); }
  };
  const loadCases = async (more = false) => {
    const version = ++generation.current;
    const data = await api('/v1/clients/' + clientId + '/cases' + (more && cursor ? '?cursor=' + cursor : ''));
    if (alive.current && version === generation.current) {
      setCases(old => more ? [...old, ...data.items] : data.items); setCursor(data.next_cursor);
    }
  };
  React.useEffect(() => {
    if (!token || editor) return;
    let active = true;
    api('/v1/clients').then(data => { if (active) { setClients(data.items); setClientCursor(data.next_cursor); } })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [token, editor]);
  React.useEffect(() => {
    setCases([]); setCursor(null);
    const version = ++generation.current;
    if (token && clientId && !editor) {
      api('/v1/clients/' + clientId + '/cases').then(data => {
        if (alive.current && version === generation.current) { setCases(data.items); setCursor(data.next_cursor); }
      }).catch(e => { if (alive.current && version === generation.current) setError(e.message); });
    }
    return () => { generation.current++; };
  }, [token, clientId, editor]);
  const canReplaceDraft = (ask = true) => {
    if (typeof vatDirty==='function' && vatDirty()) return ask && window.confirm('저장하지 않은 부가세 입력이 있습니다. 메모리에 유지하고 이동할까요?');
    if (typeof equityDirty==='function' && equityDirty()) return ask && window.confirm('저장하지 않은 주식평가 입력이 있습니다. 입력은 메모리에 유지하고 이동할까요?');
    if (typeof holdingDirty==='function' && holdingDirty()) return ask && window.confirm('저장하지 않은 보유세 입력이 있습니다. 입력은 메모리에 유지하고 이동할까요?');
    if (typeof inheritanceDirty==='function' && inheritanceDirty()) return ask && window.confirm('저장하지 않은 상속 입력이 있습니다. 입력은 메모리에 유지하고 이동할까요?');
    if (typeof acquisitionDirty==='function' && acquisitionDirty()) return ask && window.confirm('저장하지 않은 취득세 입력이 있습니다. 입력은 메모리에 유지하고 이동할까요?');
    const w = jtGiftSession.workspace;
    if (typeof transferDirty === 'function' && transferDirty()) return ask && window.confirm('저장하지 않은 양도 입력이 있습니다. 양도 입력은 메모리에 보관하고 이동할까요?');
    if (!w) return true;
    const dirty = w.baseline == null ? w.touched : JSON.stringify({ clientId: w.clientId, label: w.label, draft: w.draft }) !== w.baseline;
    const f = jtGiftSession.filings?.[w.run?.run_id];
    const filingDirty = f && (f.baseline == null ? f.touched : JSON.stringify(f.form) !== f.baseline);
    return (!dirty && !filingDirty) || (ask && window.confirm('저장하지 않은 입력이 있습니다. 현재 입력을 버리고 사건을 열까요?'));
  };
  React.useEffect(() => {
    const protect = e => {
      if (lock.current || !canReplaceDraft(false)) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, []);
  const enter = async (caseId = null) => {
    if (!canReplaceDraft()) return;
    // Read everything before replacing the in-memory editor, including its saved result.
    const data = caseId ? await api('/v1/gift-cases/' + caseId) : await api('/v1/gift-cases', {
      method: 'POST', headers: { 'Idempotency-Key': createKeys.current[clientId] ||= window.crypto.randomUUID() },
      body: JSON.stringify({ client_id: clientId, label: '새 증여 사건', draft: giftNewDraft() }) });
    if (!caseId) createdCases.current[clientId] = data.case_id;
    const saved = caseId ? data : await api('/v1/gift-cases/' + data.case_id);
    if (saved.client_id !== clientId) throw new Error('선택한 고객의 사건이 아닙니다.');
    const run = saved.last_successful_run_id ? await api('/v1/gift-cases/' + saved.case_id + '/runs/' + saved.last_successful_run_id) : null;
    if (!alive.current) return;
    const w = { clientId: saved.client_id, label: saved.label, draft: saved.draft,
      meta: saved, touched: false, request: null, run, operationKeys: {} };
    w.baseline = JSON.stringify({ clientId: w.clientId, label: w.label, draft: w.draft });
    const oldRunId = jtGiftSession.workspace?.run?.run_id;
    if (oldRunId && jtGiftSession.filings) delete jtGiftSession.filings[oldRunId];
    jtGiftSession.workspace = w;
    if (!caseId || createdCases.current[clientId] === caseId) {
      delete createKeys.current[clientId]; delete createdCases.current[clientId];
    }
    setEditor(true);
  };
  const login = e => { e.preventDefault(); return act(async () => {
    const data = await api('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, '');
    if (!data.access_token || !data.uid) throw new Error('로그인 응답을 확인할 수 없습니다.');
    if ((typeof jtEquitySession!=='undefined' && jtEquitySession?.uid && jtEquitySession.uid !== data.uid) || (jtGiftSession.uid && jtGiftSession.uid !== data.uid && jtGiftSession.workspace) || (jtTransferSession?.uid && jtTransferSession.uid !== data.uid) || (typeof jtInheritanceSession!=='undefined' && jtInheritanceSession?.uid && jtInheritanceSession.uid !== data.uid) || (typeof jtHoldingSession!=='undefined' && jtHoldingSession?.uid && jtHoldingSession.uid !== data.uid) || (typeof jtAcquisitionSession!=='undefined' && jtAcquisitionSession?.uid && jtAcquisitionSession.uid !== data.uid))
      throw new Error('편집 내용이 남아 있습니다. 기존 계정으로 로그인하거나 로그아웃으로 내용을 비워 주세요.');
    jtGiftSession.token = data.access_token; jtGiftSession.uid = data.uid;
    setToken(data.access_token); setPassword('');
  }); };
  const states = { calculated: '최신 입력 계산 완료', ready: '저장 완료 · 계산 전', draft: '초안 · 입력 보완 필요',
    read_only: '읽기 전용 · 버전 확인 필요', connection_pending: '기존 사건 · 편집 연결 준비 중' };
  if (editor?.vat) return <JTVatCases clientId={clientId} caseId={editor.caseId} onExit={()=>{setEditor(false);setToken(jtGiftSession.token);}} />;
  if (editor?.equity) return <JTEquityCases clientId={clientId} caseId={editor.caseId} onExit={()=>{setEditor(false);setToken(jtGiftSession.token);}} />;
  if (editor?.caseComparison) return <JTCaseComparisons clientId={clientId} onExit={()=>{setEditor(false);setToken(jtGiftSession.token);}} />;
  if (editor?.holdingCollection) return <JTHoldingCollections clientId={clientId} onExit={()=>{setEditor(false);setToken(jtGiftSession.token);}} />;
  if (editor?.holding) return <JTHoldingCases clientId={clientId} caseId={editor.caseId} onExit={()=>{setEditor(false);setToken(jtGiftSession.token);}} />;
  if (editor?.inheritance) return <JTInheritanceCases clientId={clientId} caseId={editor.caseId} onExit={() => {setEditor(false);setToken(jtGiftSession.token);}} />;
  if (editor?.acquisition) return <JTAcquisitionCases clientId={clientId} caseId={editor.caseId} onExit={() => {setEditor(false);setToken(jtGiftSession.token);}} />;
  if (editor?.masters) return <JTPropertyMasters clientId={clientId} onExit={() => { setEditor(false); setToken(jtGiftSession.token); }} onValuations={() => setEditor({sources:true})} />;
  if (editor?.sources) return <JTPropertySources clientId={clientId} onExit={() => { setEditor(false); setToken(jtGiftSession.token); }} />;
  if (editor?.annual) return <JTTransferAnnual clientId={clientId} onExit={() => { setEditor(false); setToken(jtGiftSession.token); }} />;
  if (editor && typeof editor === 'object') return <JTTransferCases clientId={clientId} caseId={editor.caseId} onExit={() => { setEditor(false); setToken(jtGiftSession.token); }} />;
  if (editor) return <JTGiftCases initialAnswers={{}} onAnswers={() => {}}
    exitLabel="← 고객·사건 작업대" onExit={() => { setEditor(false); setToken(jtGiftSession.token); }} />;
  return <div className="jt-container cw-workspace">
    <style>{`.cw-workspace{max-width:1040px;padding:32px 20px 64px}.cw-card{border:1px solid #d9e0d9;background:white;border-radius:12px;padding:24px;margin:20px 0}.cw-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:end}.cw-workspace label{display:flex;flex-direction:column;gap:6px}.cw-workspace input,.cw-workspace select{font:inherit;padding:10px;min-height:44px;border:1px solid #9ba99c;border-radius:6px}.cw-workspace p{line-height:1.6}.cw-workspace button{min-height:44px}.cw-workspace table{width:100%;border-collapse:collapse}.cw-workspace td,.cw-workspace th{text-align:left;padding:12px;border-bottom:1px solid #ddd}.cw-workspace :focus-visible{outline:3px solid #3d7855}.cw-workspace [role=alert]{color:#82391e;background:#fff1e9;padding:12px}.cw-table{overflow-x:auto}`}</style>
    <button className="jt-btn jt-btn--ghost" disabled={busy} onClick={onBack}>← 계산기 목록</button>
    <h1>고객·사건 작업대</h1><p>고객을 선택하고 사건별 입력과 계산 결과를 이어서 관리합니다.</p>
    {error && <p role="alert">{error}</p>}
    {!token ? <form className="cw-card" onSubmit={login}><h2>사건 저장용 로그인</h2><div className="cw-actions">
      <label>이메일<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>비밀번호<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      <button className="jt-btn jt-btn--primary" disabled={busy}>로그인</button></div></form> : <>
      <section className="cw-card"><h2>1. 고객 선택</h2><div className="cw-actions">
        <label>고객<select data-testid="workspace-client" value={clientId} disabled={busy} onChange={e => { generation.current++; setClientId(e.target.value); setError(''); }}>
          <option value="">고객 선택</option>{clientId && !clients.some(c => c.id === clientId) && <option value={clientId}>선택한 고객</option>}
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button className="jt-btn jt-btn--ghost" disabled={busy} onClick={() => act(() => loadClients())}>고객 새로고침</button>
        {clientCursor && <button disabled={busy} onClick={() => act(() => loadClients(true))}>고객 더 보기</button>}
      </div><form className="cw-actions" style={{marginTop:16}} onSubmit={e => { e.preventDefault(); return act(async () => {
        if (!name.trim()) return;
        const data = await api('/v1/clients', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
        setClients(old => [...old, {id:data.client_id,name:name.trim()}]); setClientId(data.client_id); setName('');
      }); }}><label>새 고객 이름<input data-testid="workspace-client-name" value={name} maxLength={200} required onChange={e => setName(e.target.value)} /></label>
        <button className="jt-btn jt-btn--ghost" disabled={busy || !name.trim()}>고객 등록</button></form></section>
      <section className="cw-card"><h2>2. 사건 생성·재열기</h2>
        <p>증여: 일반 거주자 단일 재산과 같은 당사자·2026년 증여일의 일반 다자산 입력·저장·계산·재열기를 지원합니다. 부담부·비거주자는 초안 저장만 지원합니다.</p>
        <p>양도: 주택 전체·일부 지분의 매매·상속·증여 취득 사실과 일반 양도·일시적 2주택·다른 상속주택 보유·혼인·봉양 합가 사실을 입력하고 저장·계산·재열기할 수 있습니다. 보유세는 2026년 개인 단독 소유 일반 주택·건축물의 전년 가액/본세/도시지역분 자료와 상한을 연결합니다. 토지·종부세는 초안만 저장합니다. 상속은 2026년 거주자 일반 사건의 성년 배우자·자녀, 재산·비용 입력과 저장·계산·재열기를 지원합니다.</p>
        <div className="cw-actions"><button className="jt-btn jt-btn--primary" disabled={!clientId || busy} onClick={() => act(() => enter())}>증여 사건 만들기</button>
          <button disabled={!clientId || busy} onClick={() => { if(canReplaceDraft()) setEditor({caseId:null}); }}>양도 사건 만들기</button>
          <button data-testid="workspace-holding-collection" disabled={!clientId||busy} onClick={()=>{if(canReplaceDraft())setEditor({holdingCollection:true});}}>주택별 재산세 묶음</button>
          <button data-testid="workspace-holding" disabled={!clientId||busy} onClick={()=>{if(canReplaceDraft())setEditor({holding:true,caseId:null});}}>보유세 사건 만들기</button>
          {typeof jtHoldingSession!=='undefined'&&jtHoldingSession&&<button disabled={busy} onClick={()=>{setClientId(jtHoldingSession.meta.client_id);setEditor({holding:true,caseId:'resume'});}}>편집하던 보유세 사건 이어서</button>}
          <button data-testid="workspace-inheritance" disabled={!clientId||busy} onClick={()=>{if(canReplaceDraft())setEditor({inheritance:true,caseId:null});}}>상속 사건 만들기</button>
          <button data-testid="workspace-vat" disabled={!clientId||busy} onClick={()=>{if(canReplaceDraft())setEditor({vat:true,caseId:null});}}>일반과세 부가세 사건 만들기</button>
          {typeof jtVatSession!=='undefined'&&jtVatSession&&<button disabled={busy} onClick={()=>{setClientId(jtVatSession.meta.client_id);setEditor({vat:true,caseId:'resume'});}}>편집하던 부가세 이어서</button>}
          <button data-testid="workspace-equity" disabled={!clientId||busy} onClick={()=>{if(canReplaceDraft())setEditor({equity:true,caseId:null});}}>주식평가 사건 만들기</button>
          {typeof jtEquitySession!=='undefined'&&jtEquitySession&&<button disabled={busy} onClick={()=>{setClientId(jtEquitySession.meta.client_id);setEditor({equity:true,caseId:'resume'});}}>편집하던 주식평가 이어서</button>}
          <button data-testid="workspace-acquisition" disabled={!clientId||busy} onClick={()=>{if(canReplaceDraft())setEditor({acquisition:true,caseId:null});}}>취득세 기본정보 초안 만들기</button>
          {typeof jtAcquisitionSession!=='undefined'&&jtAcquisitionSession&&<button disabled={busy} onClick={()=>{setClientId(jtAcquisitionSession.meta.client_id);setEditor({acquisition:true,caseId:'resume'});}}>편집하던 취득세 사건 이어서</button>}
          {typeof jtInheritanceSession!=='undefined'&&jtInheritanceSession&&<button disabled={busy} onClick={()=>{setClientId(jtInheritanceSession.meta.client_id);setEditor({inheritance:true,caseId:'resume'});}}>편집하던 상속 사건 이어서</button>}
          <button data-testid="workspace-masters" disabled={!clientId || busy} onClick={() => { if(canReplaceDraft()) setEditor({masters:true}); }}>당사자·재산 등록</button>
          <button data-testid="workspace-sources" disabled={!clientId || busy} onClick={() => { if(canReplaceDraft()) setEditor({sources:true}); }}>재산 평가자료</button>
          <button data-testid="workspace-comparison" disabled={!clientId || busy} onClick={() => { if(canReplaceDraft()) setEditor({caseComparison:true}); }}>사건 간 비교</button>
          <button data-testid="workspace-annual" disabled={!clientId || busy} onClick={() => { if(canReplaceDraft()) setEditor({annual:true}); }}>연간 양도 합산</button>
          {jtTransferSession && <button disabled={busy} onClick={() => { setClientId(jtTransferSession.meta.client_id); setEditor({caseId:'resume'}); }}>편집하던 양도 사건 이어서</button>}
          <button className="jt-btn jt-btn--ghost" disabled={!clientId || busy} onClick={() => act(() => loadCases())}>사건 새로고침</button>
          {jtGiftSession.workspace && <button className="jt-btn jt-btn--ghost" disabled={busy} onClick={() => { setClientId(jtGiftSession.workspace.clientId); setEditor(true); }}>편집하던 증여 사건 이어서</button>}
        </div>
        {clientId && cases.length === 0 && <p>현재 표시할 사건이 없습니다. 목록을 새로고침하거나 새 사건을 만드세요.</p>}
        {cases.length > 0 && <div className="cw-table"><table><thead><tr><th>사건</th><th>세목</th><th>저장 상태</th><th>열기</th></tr></thead>
          <tbody>{cases.map(item => <tr key={item.case_id}><td>{item.label || '제목 없는 사건'}</td><td>{item.scenario_type}{item.holding_period&&<small> · {item.holding_period.tax_year} · {item.holding_period.tax_kind==='property'?'재산세':'종부세'} · {item.holding_period.category==='building'?'건축물':item.holding_period.category==='house'?'주택':'토지'}</small>}</td><td>{states[item.state] || '지원 확인 필요'}{item.current_revision > 0 && ` · 버전 ${item.current_revision}`}</td>
            <td><button className="jt-btn jt-btn--ghost" data-testid={'workspace-open-' + item.case_id} disabled={busy || !['gift','transfer','inheritance','holding','acquisition','equity','vat'].includes(item.editor)} onClick={() => item.editor === 'vat' ? (canReplaceDraft() && setEditor({vat:true,caseId:item.case_id})) : item.editor === 'equity' ? (canReplaceDraft() && setEditor({equity:true,caseId:item.case_id})) : item.editor === 'holding' ? (canReplaceDraft() && setEditor({holding:true,caseId:item.case_id})) : item.editor === 'inheritance' ? (canReplaceDraft() && setEditor({inheritance:true,caseId:item.case_id})) : item.editor === 'acquisition' ? (canReplaceDraft() && setEditor({acquisition:true,caseId:item.case_id})) : item.editor === 'transfer' ? (canReplaceDraft() && setEditor({caseId:item.case_id})) : act(() => enter(item.case_id))}>사건 열기</button></td></tr>)}</tbody></table></div>}
        {cursor && <button disabled={busy} onClick={() => act(() => loadCases(true))}>사건 더 보기</button>}
      </section></>}
    {(token || jtGiftSession.workspace) && <button className="jt-btn jt-btn--ghost" disabled={busy} onClick={() => {
      if (!canReplaceDraft()) return;
      generation.current++; if(typeof jtEquitySession!=='undefined')jtEquitySession=null; if(typeof jtHoldingSession!=='undefined')jtHoldingSession=null; if(typeof jtInheritanceSession!=='undefined')jtInheritanceSession=null; if(typeof jtAcquisitionSession!=='undefined')jtAcquisitionSession=null; jtTransferSession = null; jtGiftSession = { token:'', uid:'', workspace:null };
      setToken(''); setClients([]); setCases([]); setClientId(''); setError('');
    }}>로그아웃·메모리 비우기</button>}
  </div>;
}
window.JTCaseWorkspace = JTCaseWorkspace;

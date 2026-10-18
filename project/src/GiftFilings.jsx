/* Filing profiles bind to a saved run; no calculation, Web Storage or submission. */
const GIFT_FILING_FIELDS = {
  header: [
    ['hometax_user_id', '홈택스 사용자 ID', 'text', true],
    ['submission_ym', '제출 연월 (YYYYMM)', 'text', true],
    ['payment_ym', '납부 연월 (YYYYMM)', 'text', true],
    ['agent_name', '세무대리인 성명'], ['agent_registration', '세무대리인 관리번호'],
    ['agent_phone', '세무대리인 전화번호'], ['agent_business_number', '세무대리인 사업자등록번호'],
  ],
  basic: [
    ['donee_identifier', '수증자 주민등록번호 (숫자 13자리)', 'password', true],
    ['donee_name', '수증자 성명', 'text', true],
    ['donee_phone', '수증자 전화번호', 'text', true], ['donee_email', '수증자 이메일'],
    ['donor_identifier', '증여자 주민등록번호 (숫자 13자리)', 'password', true],
    ['donor_name', '증여자 성명', 'text', true], ['donor_address', '증여자 주소'], ['donor_phone', '증여자 전화번호'],
    ['legal_dong_code', '수증자 법정동 코드 (10자리)', 'text', true],
    ['legal_dong_name', '수증자 법정동 명칭', 'text', true],
    ['mountain_code', '산 구분 코드', 'text', true],
    ['lot_main', '지번 본번', 'integer', true], ['lot_sub', '지번 부번 (없으면 0)', 'integer', true],
    ['building_name', '건물·단지명'], ['building_dong', '동'], ['building_ho', '호'],
    ['tong', '통', 'integer'], ['ban', '반', 'integer'],
  ],
};
// Official supplied gift specification T39/T40, restricted to backend-supported codes.
const GIFT_FILING_RELATIONS = [['02', '처'], ['07', '남편'], ['05', '자녀'], ['03', '부'], ['04', '모'],
  ['40', '손자녀'], ['43', '증손'], ['45', '고손'], ['76', '외손'], ['ZA', '무관계']];
function giftFilingBlank() {
  return { header: { program_code: '9000', taxpayer_type: '1', filing_role: 'self',
    ...Object.fromEntries(GIFT_FILING_FIELDS.header.map(([k]) => [k, ''])) },
    basic: { relationship_code: '', ...Object.fromEntries(GIFT_FILING_FIELDS.basic.map(([k]) => [k, ''])) } };
}
function giftFilingPack(form) {
  const packed = JSON.parse(JSON.stringify(form));
  for (const group of ['header', 'basic']) for (const [key, title, kind] of GIFT_FILING_FIELDS[group]) {
    const value = packed[group][key];
    if (value == null || value === '') packed[group][key] = null;
    else if (kind === 'integer') {
      const n = Number(value);
      if (!/^[0-9]+$/.test(String(value)) || !Number.isSafeInteger(n)) throw new Error(title + ': 0 이상의 정수를 입력해 주세요.');
      packed[group][key] = n;
    }
  }
  if (packed.basic.relationship_code === '') packed.basic.relationship_code = null;
  return packed;
}
function giftFilingIssue(issue) {
  const titles = Object.fromEntries(Object.entries(GIFT_FILING_FIELDS).flatMap(([group, fields]) =>
    fields.map(([key, title]) => ['filing_input.' + group + '.' + key, title])));
  Object.assign(titles, { 'filing_input.basic.relationship_code': '증여자 기준 수증자의 관계',
    'source.gift_date': '저장된 증여일', 'source.donee_age': '저장된 수증자 나이',
    'source.residency': '저장된 거주자 여부', 'source.generation_skip': '저장된 세대생략 사실' });
  const messages = { REQUIRED_FIELD: '필수 입력입니다.', BYTE_WIDTH_EXCEEDED: '신고 규격의 바이트 길이를 초과했습니다.',
    INVALID_KSC5601_TEXT: '신고 파일에서 지원하지 않는 문자입니다.', INVALID_FIELD_FORMAT: '입력 형식을 확인해 주세요.',
    INVALID_MONTH: '유효한 연월을 입력해 주세요.', SOURCE_GIFT_DATE_MISSING: '사건에 증여일을 저장하고 계산한 결과가 필요합니다.',
    SAVED_RUN_AGE_MISMATCH: '주민번호의 생년월일과 증여일 기준 나이가 저장된 계산과 다릅니다.',
    SAVED_RUN_RELATIONSHIP_MISMATCH: '저장된 계산의 증여 관계와 다릅니다.',
    SAVED_RUN_GENERATION_MISMATCH: '저장된 계산의 세대생략 사실과 다릅니다.',
    SAVED_RUN_FACT_MISMATCH: '저장된 계산 사실과 다릅니다.', SOURCE_FACT_MISMATCH: '계산 원본의 사실 확인이 필요합니다.',
    UNSUPPORTED_OR_INVALID_IDENTIFIER: '국내 자연인의 번호 형식·생년월일을 확인해 주세요.',
    PARTIES_MUST_DIFFER: '수증자와 증여자의 식별번호가 같습니다.', UNSUPPORTED_NONRESIDENT: '비거주자 신고 파일은 아직 지원하지 않습니다.',
    UNSUPPORTED_RELATIONSHIP_CODE: '이 관계 코드는 아직 지원하지 않습니다.', AGENT_ROLE_REQUIRED: '세무대리인 작성 구분을 확인해 주세요.' };
  return (titles[issue.field_path] || '신고 항목') + ': ' + (messages[issue.code] || '현재 지원 범위와 입력을 확인해 주세요.') + ' [' + issue.code + ']';
}

function JTGiftFilings({ run, requestApi, token, busy, act, dirty, onDirty, keyFor }) {
  const memory = React.useRef(jtGiftSession.filings?.[run.run_id]).current;
  const [form, setForm] = React.useState(memory?.form || giftFilingBlank);
  const [baseline, setBaseline] = React.useState(memory?.baseline || null);
  const [saved, setSaved] = React.useState(memory?.saved || null);
  const [touched, setTouched] = React.useState(memory?.touched || false);
  const [items, setItems] = React.useState([]);
  const [choice, setChoice] = React.useState(memory?.saved?.filing_id || '');
  const [message, setMessage] = React.useState('');
  const [listError, setListError] = React.useState('');
  const listVersion = React.useRef(0);
  const formDirty = baseline == null ? touched : JSON.stringify(form) !== baseline;
  const path = '/v1/gift-cases/' + run.case_id + '/runs/' + run.run_id + '/filings';
  React.useEffect(() => {
    (jtGiftSession.filings ||= {})[run.run_id] = { form, baseline, saved, touched };
    onDirty(formDirty);
  }, [form, baseline, saved, touched, formDirty]);
  React.useEffect(() => () => onDirty(false), []);
  React.useEffect(() => {
    if (!token) return;
    let active = true;
    const version = ++listVersion.current;
    requestApi(path).then(data => {
      if (active && version === listVersion.current) { setItems(data.items); setListError(''); }
    }).catch(() => { if (active && version === listVersion.current) setListError('신고 목록을 불러오지 못했습니다. 다시 조회해 주세요.'); });
    return () => { active = false; };
  }, [token, run.run_id]);
  const change = (group, key, value) => {
    setForm(old => ({ ...old, [group]: { ...old[group], [key]: value } })); setTouched(true); setMessage('');
  };
  const accept = data => {
    if (data.run_id !== run.run_id || data.case_id !== run.case_id || data.revision_id !== run.revision_id || !data.snapshot?.filing_input)
      throw new Error('신고 저장본과 선택한 계산 결과가 다릅니다. 목록을 확인해 주세요.');
    ++listVersion.current;
    setSaved(data); setForm(data.snapshot.filing_input); setBaseline(JSON.stringify(data.snapshot.filing_input)); setTouched(false);
    setChoice(data.filing_id); setItems(old => [data, ...old.filter(x => x.filing_id !== data.filing_id)]); setListError('');
  };
  const save = async () => {
    const body = { filing_input: giftFilingPack(form) };
    accept(await requestApi(path, { method: 'POST', headers: { 'Idempotency-Key': keyFor(path, body) }, body: JSON.stringify(body) }));
    setMessage('신고 입력을 저장했습니다. 아래는 저장본의 준비 상태입니다.');
  };
  const refresh = async () => {
    const version = ++listVersion.current;
    const data = await requestApi(path);
    if (version === listVersion.current) { setItems(data.items); setListError(''); }
  };
  const reopen = async () => {
    if (formDirty && !window.confirm('저장하지 않은 신고 입력을 버리고 선택한 저장본을 열까요?')) return;
    accept(await requestApi('/v1/gift-filings/' + choice)); setMessage('신고 입력과 준비 상태를 저장본에서 다시 열었습니다.');
  };
  const generate = async () => {
    const route = '/v1/gift-filings/' + saved.filing_id + '/artifacts';
    accept(await requestApi(route, { method: 'POST', headers: { 'Idempotency-Key': keyFor(route, {}) }, body: '{}' }));
    setMessage('01·02 부분 파일이 저장됐습니다. 홈택스 제출용 파일은 아닙니다.');
  };
  const download = async kind => {
    const blob = await requestApi('/v1/gift-filings/' + saved.filing_id + '/files/' + kind, { download: true });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'gift-PARTIAL-' + saved.filing_id + (kind === 'manifest' ? '.manifest.json' : '.records.txt');
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  const field = (group, descriptor) => {
    const [key, title, kind = 'text', required] = descriptor;
    return <GiftCaseField key={key} title={title + (required ? ' · 필수' : '')}>
      <input data-testid={'filing-' + key} autoComplete="off" spellCheck={false} type={kind === 'password' ? 'password' : 'text'}
        inputMode={kind === 'integer' || kind === 'password' ? 'numeric' : undefined}
        value={form[group][key] ?? ''} onChange={e => change(group, key, e.target.value)} />
    </GiftCaseField>;
  };
  const issues = saved?.validation?.issues || [];
  const conflicts = issues.filter(x => x.code === 'SPEC_RECORD_LENGTH_CONFLICT');
  const attachments = issues.filter(x => x.code === 'ATTACHMENT_NOT_IMPLEMENTED');
  const inputs = issues.filter(x => !['SPEC_RECORD_LENGTH_CONFLICT', 'ATTACHMENT_NOT_IMPLEMENTED'].includes(x.code));
  const ready = !!saved?.validation?.resolved_records_ready && !formDirty;
  return <section className="gc-card" aria-label="증여 신고 준비">
    <h3>이 계산 결과의 신고 준비</h3>
    <p className="gc-status">제출용 파일 미완성 · 현재는 기본정보 01·02 부분 파일만 만들 수 있습니다.</p>
    <p className="gc-help">{dirty ? '현재 수정 중인 계산 입력은 포함하지 않습니다. 위에 표시된 저장 계산 결과에 연결합니다.' : '위에 표시된 저장 입력·계산 결과에 연결하며 세액을 다시 계산하지 않습니다.'} 신고 입력을 바꿔도 계산 원본은 바뀌지 않습니다.</p>
    <p className="gc-help">현재 지원: 국내 자연인·거주자·지번 주소와 아래 관계 코드. 주민번호는 형식·생년월일만 확인하며 홈택스 ID·주소 코드의 실존이나 홈택스 수용은 확인하지 않습니다.</p>
    {message && <p role="status" className="gc-status">{message}</p>}
    {listError && <p role="alert" className="gc-status gc-error">{listError}</p>}
    <div className="gc-actions"><button className="jt-btn jt-btn--ghost" disabled={!token || busy} onClick={() => act(refresh)}>신고 저장 목록 조회</button>
      <GiftCaseField title="신고 저장본 선택"><select data-testid="filing-selection" value={choice} disabled={busy} onChange={e => setChoice(e.target.value)}>
        <option value="">선택해 주세요</option>{items.map(x => <option key={x.filing_id} value={x.filing_id}>{new Date(x.created_at).toLocaleString('ko-KR')} · {x.artifact ? '부분 파일 있음' : '신고 입력'} · {x.filing_id.slice(0, 8)}</option>)}
      </select></GiftCaseField>
      <button className="jt-btn jt-btn--ghost" disabled={!token || busy || !choice} onClick={() => act(reopen)}>신고 저장본 열기</button></div>
    <fieldset disabled={busy}>
      <h4>작성자와 제출 정보</h4><p className="gc-help">연월은 202610처럼 입력합니다. 필수 항목이 비어 있어도 초안 저장은 가능합니다.</p>
      <div className="gc-grid">{GIFT_FILING_FIELDS.header.slice(0, 3).map(f => field('header', f))}
        <GiftCaseField title="작성 구분"><select data-testid="filing-role" value={form.header.filing_role} onChange={e => change('header', 'filing_role', e.target.value)}><option value="self">본인 작성</option><option value="agent">세무대리인 작성</option></select></GiftCaseField></div>
      <details open={form.header.filing_role === 'agent'}><summary>세무대리인 정보 (대리 작성 시 필수)</summary><div className="gc-grid">{GIFT_FILING_FIELDS.header.slice(3).map(f => field('header', f))}</div></details>
      <h4>신고 인적사항과 지번 주소</h4><div className="gc-grid">{GIFT_FILING_FIELDS.basic.map(f => field('basic', f))}
        <GiftCaseField title="증여자 기준 수증자의 관계 · 필수" hint="예: 부모가 자녀에게 증여하면 자녀(05). 계산 화면의 ‘누구에게서 받았는가’와 기준이 다릅니다.">
          <select data-testid="filing-relationship_code" value={form.basic.relationship_code || ''} onChange={e => change('basic', 'relationship_code', e.target.value)}>
            <option value="">선택해 주세요</option>{GIFT_FILING_RELATIONS.map(([code, title]) => <option key={code} value={code}>{title} ({code})</option>)}
          </select></GiftCaseField></div>
    </fieldset>
    <p className="gc-help">{formDirty ? '저장하지 않은 신고 입력이 있습니다. 저장 후 준비 상태를 다시 확인하세요.' : saved ? '현재 표시된 신고 입력은 저장본입니다.' : '신고 정보를 입력하거나 저장본을 열어 주세요.'} 새로고침 전 저장해 주세요.</p>
    <button className="jt-btn jt-btn--primary" disabled={!token || busy} onClick={() => act(save)}>신고 입력 저장·검증</button>
    {saved && <section aria-label="신고 준비 검증 결과">
      <h4>저장본의 준비 상태 {formDirty ? '· 수정 전 기준' : ''}</h4>
      <p className="gc-help">증여일: {saved.snapshot.input_snapshot.case_input.gift_date || '미입력'} · 연결된 신고 저장본: {saved.filing_id.slice(0, 8)}</p>
      <h5>입력 확인 ({inputs.length})</h5>{inputs.length ? <ul>{inputs.map((x, i) => <li key={i}>{giftFilingIssue(x)}</li>)}</ul> : <p>지원 범위 내 기본정보 검사 통과</p>}
      <h5>규격 충돌 ({conflicts.length})</h5><ul>{conflicts.map((x, i) => <li key={i}>{x.record_code} 레코드: 공식 설명서의 요약·상세 길이가 달라 생성을 보류했습니다.</li>)}</ul>
      <h5>첨부 미지원 ({attachments.length})</h5><p className="gc-help">{attachments.map(x => x.record_code).join(', ') || '없음'} · 각 사건에 필요한 첨부를 아직 생성하지 않습니다. 모든 첨부가 필수라는 뜻은 아닙니다.</p>
      <div className="gc-actions"><button className="jt-btn jt-btn--ghost" disabled={!token || busy || !ready || !!saved.artifact} onClick={() => act(generate)}>01·02 부분 파일 만들기</button>
        {saved.artifact && <><button className="jt-btn jt-btn--ghost" disabled={!token || busy || formDirty} onClick={() => act(() => download('resolved-records'))}>저장된 부분 파일 다운로드</button>
          <button className="jt-btn jt-btn--ghost" disabled={!token || busy || formDirty} onClick={() => act(() => download('manifest'))}>파일 검증 정보 다운로드</button></>}</div>
      {saved.artifact && <p className="gc-help" style={{ overflowWrap: 'anywhere' }}>부분 파일 {saved.artifact.bytes}바이트 · SHA-256 {saved.artifact.sha256}</p>}
    </section>}
  </section>;
}
window.JTGiftFilings = JTGiftFilings;

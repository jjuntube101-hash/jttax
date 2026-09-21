/* @jsx React.createElement */
/* 「이 집을 사면 앞으로 내는 세금」 — 취득세 결과 아래에 붙는 «보유 단계»(재산세·종합부동산세) 파생 블록.
   260921 신설. 1차 범위 = 취득 → 보유까지만. 매도·증여·상속은 계산하지 않고 링크만 둔다.
   설계 정본: D:\클로드\브랜딩\세무법인\홈페이지\취득세고도화_260921\02_파생계산기_설계.md §0·§1

   ⛔ 세율·공제 상수를 이 파일에 새로 두지 않는다. 숫자는 전부 기존 매퍼(mapAnswersToProperty·
      mapAnswersToComprehensive, ReportProperty.jsx·ReportComprehensive.jsx)를 거쳐 엔진에서만 받는다.
   ⛔ 세목마다 납세자 범위가 달라(재산세·종부세는 "이 집"이 아니라 "납세자가 가진 재산 전체") 하나의
      총액으로 합치지 않는다(§1-1). 소스 어디에도 prop.total + comp.total 같은 합산이 없어야 한다. */

const { useState: useAcqHoldState, useRef: useAcqHoldRef } = React;

/* ── 여닫는 조건 (설계서 §1-5 「계산할 수 없음」 조건) ──────────────────────
   'hidden'            : 아예 렌더하지 않는다 — 취득세가 폴백·차단·엔진 실패 상태.
   'unsupported-type'  : 주택이 아니면 짧은 안내만 — 계산하지 않는다.
   'unsupported-owner' : 법인 명의·공동명의(지분 취득)는 짧은 안내만.
   'open'              : 보유 단계 질문·계산을 연다.
   ⚠️ 공동명의(지분 취득)는 현재 취득세 화면(ACQ_QS)에 그 개념 자체가 없다(개인/법인 명의만
      묻는다) — 그래서 실제로 이 값에 닿을 경로가 없다. 그래도 나중에 그 필드가 생겼을 때
      조용히 새지 않도록 acquirerType==='joint' 또는 ownership==='joint' 를 방어적으로 막는다. */
function acqHoldingVisibility(acqAnswers, acqCalc) {
  if (!acqCalc || !acqCalc.precise) return 'hidden';
  if (!acqAnswers || acqAnswers.propertyType !== '주택') return 'unsupported-type';
  if (acqAnswers.acquirerType === 'corporate' || acqAnswers.acquirerType === 'joint' || acqAnswers.ownership === 'joint') {
    return 'unsupported-owner';
  }
  return 'open';
}

/* 계산할 연도 — 올해부터 5개 연도. new Date() 를 직접 쓰는 이유는 «오늘 기준»이어야
   하기 때문이다(설계서 §1-4 「오늘 현재의 법으로 계산했습니다」와 같은 기준). */
function acqHoldYears() {
  const y = new Date().getFullYear();
  return [y, y + 1, y + 2, y + 3, y + 4];
}

function acqHoldTodayNotice() {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 현재의 법으로 계산했습니다.`;
}

/* ── 재산세 질문 재사용 — PROP_QS(ReportProperty.jsx) 원문을 그대로 쓴다 ─────
   1세대1주택 질문은 재산세 화면 원문(base.q·base.sub·base.opts)에 「모름」 선택지 하나만
   더한다 — 재산세 화면에는 그 선택지가 없지만(예/아니오뿐), 이 블록은 과세기준일 현재
   상태를 확정하지 못한 사용자도 받아야 한다(설계서 §1-3 「모름이면 특례 미적용」). */
function acqHoldOneHouseQ() {
  const base = (typeof PROP_QS !== 'undefined') ? PROP_QS.find((q) => q.id === 'isOneHouse') : null;
  const opts = (base && base.opts ? base.opts.slice() : [['yes', '네, 1세대 1주택', ''], ['no', '아니오 (다주택 등)', '']]);
  opts.push(['unsure', '모름', '특례를 적용하지 않은 값으로 계산합니다']);
  return {
    q: '과세기준일(6월 1일) 현재 1세대가 가진 유일한 주택인가요?',
    sub: base ? base.sub : '',
    opts,
  };
}
function acqHoldUrbanQ() {
  return (typeof PROP_QS !== 'undefined') ? PROP_QS.find((q) => q.id === 'isUrbanArea') : null;
}

/* ── 엔진 요청용 「answers」 구성 — 기존 매퍼(mapAnswersToProperty·mapAnswersToComprehensive)
   가 그대로 먹는 모양으로 만든다. 여기서 만든 값을 «다시» 세액으로 계산하지 않는다 — 매퍼와
   엔진에게 넘길 뿐이다.
   ⚠️ 취득세 매매가(acqAnswers.propertyValue)를 절대 참조하지 않는다 — 이 함수는 그 인자를
      아예 받지 않는다. 공시가격은 이 화면에서 «새로» 입력받은 yearValue 하나뿐이다. */
function acqHoldPropAnswers(yearValue, oneHouse, isUrbanArea) {
  const a = { propertyKind: '주택', standardValue: String(yearValue || ''), isUrbanArea };
  if (oneHouse === 'yes') a.isOneHouse = 'yes';
  return a;
}

/* 종부세 answers — 「다른 주택 모름」이면 null 을 돌려준다(호출부가 이걸 보고 fetch 자체를
   건너뛴다 — 0원으로 채우지 않는다, 설계서 §1-5).
   ⚠️ 이 함수도 yearValue(이 화면에서 입력한 공시가격)만 쓰고 취득세 매매가를 참조하지 않는다. */
function acqHoldCompAnswers(yearValue, otherHousing, otherTotalValue, totalHouseCount, ownerAge, holdingYears) {
  if (otherHousing === 'unsure' || !otherHousing) return null;
  const isOne = otherHousing !== 'has';
  const total = (Number(yearValue) || 0) + (otherHousing === 'has' ? (Number(otherTotalValue) || 0) : 0);
  const hc = isOne ? 'one' : ((Number(totalHouseCount) || 0) >= 3 ? 'three' : 'two');
  const a = { housingCount: hc, totalValue: String(total) };
  if (isOne) {
    if (Number(ownerAge) > 0) a.ownerAge = String(ownerAge);
    if (Number(holdingYears) > 0) a.holdingYears = String(holdingYears);
  }
  return a;
}

const ACQ_HOLD_BOX = { background: 'var(--bg-1,#f7f5f0)', border: '1px solid #dfe3dc', borderRadius: 10, padding: '14px 16px', marginBottom: 14 };

function JTAcqHoldingForecast({ acqAnswers, acqCalc, setRoute }) {
  /* React 훅 규칙 — 조기 반환보다 «먼저» 모두 호출한다. 아래 vis 판정과 무관하게 항상 돈다. */
  const [yearSel, setYearSel] = useAcqHoldState({});
  const [yearVal, setYearVal] = useAcqHoldState({});
  const [oneHouse, setOneHouse] = useAcqHoldState('');
  const [urban, setUrban] = useAcqHoldState('');
  const [otherHousing, setOtherHousing] = useAcqHoldState('');
  const [otherCount, setOtherCount] = useAcqHoldState('');
  const [otherValue, setOtherValue] = useAcqHoldState('');
  const [ownerAge, setOwnerAge] = useAcqHoldState('');
  const [holdingYears, setHoldingYears] = useAcqHoldState('');
  const [busy, setBusy] = useAcqHoldState(false);
  const [results, setResults] = useAcqHoldState(null);
  const [stale, setStale] = useAcqHoldState(false);
  /* R1-F3: 경쟁 상태 방지 — 실행마다 올라가는 요청 ID. 응답이 도착했을 때 이 값이 최신이
     아니면(=그 사이 다른 실행이 시작됐으면) 버린다. */
  const reqIdRef = useAcqHoldRef(0);

  /* R1-F3: 계산에 쓰이는 입력이 하나라도 바뀌면 — 계산 중이든 계산 후든 — 기존 결과를
     즉시 지우고 진행 중인 응답도 무효화한다(요청 ID를 올린다). 「입력이 바뀌었으니 다시
     계산해 달라」는 안내만 남긴다. */
  const clearOnInputChange = () => {
    reqIdRef.current += 1;
    if (results !== null) setStale(true);
    setResults(null);
  };

  const vis = acqHoldingVisibility(acqAnswers, acqCalc);
  if (vis === 'hidden') return null;
  if (vis === 'unsupported-type') {
    return (
      <section className="jt-report-result__section">
        <h3>이 집을 사면 앞으로 내는 세금</h3>
        <p>이 단계는 주택만 지원합니다.</p>
      </section>
    );
  }
  if (vis === 'unsupported-owner') {
    return (
      <section className="jt-report-result__section">
        <h3>이 집을 사면 앞으로 내는 세금</h3>
        <p>계산할 수 없음 — 명의</p>
      </section>
    );
  }

  const years = acqHoldYears();
  const oneHouseQ = acqHoldOneHouseQ();
  const urbanQ = acqHoldUrbanQ();
  const selectedRows = years.filter((y) => yearSel[y]).map((y) => ({ year: y, value: yearVal[y] }));
  const canRun = !busy && selectedRows.length > 0 && !!oneHouse && !!urban && !!otherHousing
    && (otherHousing !== 'has' || ((Number(otherCount) || 0) >= 2 && (Number(otherValue) || 0) > 0));

  const runHolding = async () => {
    if (!canRun) return;
    // R1-F3: 이 실행만의 요청 ID. 실행 도중 입력이 바뀌면(clearOnInputChange 가 reqIdRef 를
    // 올린다) 아래 비교에서 걸려 이 실행의 결과는 반영되지 않는다.
    const myReqId = ++reqIdRef.current;
    setStale(false);
    setBusy(true);
    // R1-F3: 표시 분기가 «지금의» otherHousing 이 아니라 «이 계산에 쓴» otherHousing 을
    // 보도록 스냅샷을 함께 저장한다.
    const snapshotOtherHousing = otherHousing;
    const out = [];
    for (const row of selectedRows) {
      if (reqIdRef.current !== myReqId) { setBusy(false); return; }
      const yearOut = { year: row.year };
      if (!(Number(row.value) > 0)) {
        yearOut.prop = { status: 'unknown' };
        yearOut.comp = { status: 'unknown' };
        out.push(yearOut);
        continue;
      }
      // ── 재산세 (독립 실패 허용) ──
      try {
        const ej = await callPropEngine(mapAnswersToProperty(acqHoldPropAnswers(row.value, oneHouse, urban)));
        const c = ej && ej.calc;
        if (c) yearOut.prop = { status: 'ok', total: c['세액'], effDate: ej.version && ej.version.tax_rates_effective_date };
        else yearOut.prop = { status: 'error' };
      } catch (e) { yearOut.prop = { status: 'error' }; }
      // ── 종합부동산세 (독립 실패 허용, 「모름」이면 아예 호출하지 않는다) ──
      const compA = acqHoldCompAnswers(row.value, otherHousing, otherValue, otherCount, ownerAge, holdingYears);
      if (!compA) {
        yearOut.comp = { status: 'unsure' };
      } else {
        try {
          const ej2 = await callCompEngine(mapAnswersToComprehensive(compA));
          const c2 = ej2 && ej2.calc;
          if (c2 && !c2['오류']) yearOut.comp = { status: 'ok', total: c2['세액'], effDate: ej2.version && ej2.version.tax_rates_effective_date };
          else yearOut.comp = { status: 'error' };
        } catch (e) { yearOut.comp = { status: 'error' }; }
      }
      out.push(yearOut);
    }
    // R1-F3: 응답을 반영하기 «직전에» 최신 요청인지 다시 확인한다 — 응답이 도착했을 때
    // 이미 새 실행이 시작됐다면(요청 ID 불일치) 이 결과는 버린다.
    if (reqIdRef.current === myReqId) {
      setResults({ rows: out, otherHousing: snapshotOtherHousing });
    }
    setBusy(false);
  };

  const curYear = years[0];
  const yearNote = (r) => {
    const parts = [acqHoldTodayNotice()];
    if (r && r.effDate) parts.push(`세율표 기준일 ${r.effDate}`);
    if (r && r.year > curYear) parts.push('그 사이에 세율·공제·공시가격이 바뀌면 실제 금액은 달라집니다.');
    return parts.join(' ');
  };
  const rowLabel = (row) => {
    if (!row) return '확인 필요';
    if (row.status === 'ok') return formatWon(row.total);
    if (row.status === 'unknown') return '확인 필요 (공시가격 미입력)';
    return '엔진 연결 실패 — 다시 시도해 주세요';
  };

  return (
    <section className="jt-report-result__section">
      <h3>이 집을 사면 앞으로 내는 세금 — 보유 단계</h3>
      <p style={{ fontSize: 13.5, opacity: 0.85, lineHeight: 1.6, marginTop: 0 }}>
        위 취득세에 이어, 앞으로 보유하는 동안의 재산세·종합부동산세를 따로 계산합니다. <strong>하나의 총액으로 합치지 않습니다</strong> — 재산세·종합부동산세는 이 집 하나가 아니라 납세자가 가진 재산 전체를 보고 계산되기 때문입니다.
      </p>

      <div style={ACQ_HOLD_BOX}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>계산할 연도와 그 연도의 공시가격</div>
        <p style={{ margin: '0 0 10px', fontSize: 13, opacity: 0.8, lineHeight: 1.55 }}>
          매매가가 아니라 <strong>그 연도의 공시가격</strong>을 넣어 주세요. 부동산공시가격알리미(realtyprice.kr)에서 조회됩니다. 비워 두면 그 연도는 계산하지 않고 「확인 필요」로 남습니다.
        </p>
        {years.map((y) => (
          <div key={y} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90 }}>
              <input type="checkbox" checked={!!yearSel[y]} disabled={busy}
                onChange={(e) => { clearOnInputChange(); setYearSel((s) => ({ ...s, [y]: e.target.checked })); }} />
              {y}년
            </label>
            <input className="jt-report-q__input" style={{ flex: '1 1 200px', margin: 0 }} type="text" inputMode="numeric"
              placeholder="공시가격 (원)" disabled={!yearSel[y] || busy}
              value={yearVal[y] ? Number(yearVal[y]).toLocaleString('ko-KR') : ''}
              onChange={(e) => { clearOnInputChange(); window.jtSetNumericAns((_id, v) => setYearVal((s) => ({ ...s, [y]: v })), y, e.target.value, true); }} />
          </div>
        ))}
      </div>

      <div style={ACQ_HOLD_BOX}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{oneHouseQ.q}</div>
        {oneHouseQ.sub && <p style={{ margin: '0 0 10px', fontSize: 13, opacity: 0.8 }}>{oneHouseQ.sub}</p>}
        <div className="jt-report-q__opts">
          {oneHouseQ.opts.map((o) => (
            <button key={o[0]} type="button" disabled={busy} className={'jt-report-q__opt' + (oneHouse === o[0] ? ' is-selected' : '')} onClick={() => { clearOnInputChange(); setOneHouse(o[0]); }}>
              <span className="jt-report-q__opt-mark">{oneHouse === o[0] ? '●' : '○'}</span>
              <span><strong>{o[1]}</strong></span>
            </button>
          ))}
        </div>
      </div>

      {urbanQ && (
        <div style={ACQ_HOLD_BOX}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{urbanQ.q}</div>
          {urbanQ.sub && <p style={{ margin: '0 0 10px', fontSize: 13, opacity: 0.8 }}>{urbanQ.sub}</p>}
          <div className="jt-report-q__opts">
            {urbanQ.opts.map((o) => (
              <button key={o[0]} type="button" disabled={busy} className={'jt-report-q__opt' + (urban === o[0] ? ' is-selected' : '')} onClick={() => { clearOnInputChange(); setUrban(o[0]); }}>
                <span className="jt-report-q__opt-mark">{urban === o[0] ? '●' : '○'}</span>
                <span><strong>{o[1]}</strong></span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={ACQ_HOLD_BOX}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>같은 납세자가 가진 다른 주택이 있나요?</div>
        <p style={{ margin: '0 0 10px', fontSize: 13, opacity: 0.8, lineHeight: 1.55 }}>
          종합부동산세는 이 집 하나가 아니라 <strong>납세자가 가진 주택 전체</strong>를 합산해 계산합니다. 「모름」이면 종합부동산세는 계산하지 않고 「계산할 수 없음」으로 표시합니다 — <strong>0원으로 적지 않습니다.</strong>
        </p>
        <div className="jt-report-q__opts">
          {[['none', '없음 (이 집 1채)'], ['has', '있음'], ['unsure', '모름']].map((o) => (
            <button key={o[0]} type="button" disabled={busy} className={'jt-report-q__opt' + (otherHousing === o[0] ? ' is-selected' : '')} onClick={() => { clearOnInputChange(); setOtherHousing(o[0]); }}>
              <span className="jt-report-q__opt-mark">{otherHousing === o[0] ? '●' : '○'}</span>
              <span><strong>{o[1]}</strong></span>
            </button>
          ))}
        </div>
        {otherHousing === 'has' && (
          <div style={{ marginTop: 10 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>이 집을 포함해 총 몇 채인가요?</label>
            <input className="jt-report-q__input" type="text" inputMode="numeric" placeholder="예: 2" disabled={busy}
              value={otherCount} onChange={(e) => { clearOnInputChange(); setOtherCount(e.target.value.replace(/[^0-9]/g, '')); }} />
            <label style={{ display: 'block', fontSize: 13, margin: '10px 0 4px' }}>다른 주택들의 공시가격 합계 (원)</label>
            <input className="jt-report-q__input" type="text" inputMode="numeric" placeholder="예: 800,000,000" disabled={busy}
              value={otherValue ? Number(otherValue).toLocaleString('ko-KR') : ''}
              onChange={(e) => { clearOnInputChange(); setOtherValue(e.target.value.replace(/[^0-9]/g, '')); }} />
          </div>
        )}
        {otherHousing === 'none' && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 13, opacity: 0.8, margin: '0 0 6px' }}>나이·보유기간은 선택 입력입니다 — 비우면 세액공제를 반영하지 않은 값으로 표시합니다.</p>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>소유자 나이 (만, 선택)</label>
            <input className="jt-report-q__input" type="text" inputMode="numeric" placeholder="예: 62" disabled={busy}
              value={ownerAge} onChange={(e) => { clearOnInputChange(); setOwnerAge(e.target.value.replace(/[^0-9]/g, '')); }} />
            <label style={{ display: 'block', fontSize: 13, margin: '10px 0 4px' }}>보유기간 (년, 선택)</label>
            <input className="jt-report-q__input" type="text" inputMode="numeric" placeholder="예: 8" disabled={busy}
              value={holdingYears} onChange={(e) => { clearOnInputChange(); setHoldingYears(e.target.value.replace(/[^0-9]/g, '')); }} />
          </div>
        )}
      </div>

      <button className="jt-btn jt-btn--primary" disabled={!canRun} onClick={runHolding}>
        {busy ? '계산 중…' : '보유 단계 계산하기 →'}
      </button>
      {/* R1-F3: 입력이 바뀌어 기존 결과를 지웠을 때만 보이는 안내 — 계산이 끝나거나 새로
          시작되면 runHolding 이 이 상태를 꺼 준다. */}
      {stale && <p style={{ fontSize: 13, color: '#b45309', marginTop: 8 }}>입력이 바뀌었습니다. 다시 계산해 주세요.</p>}

      {results && (
        <React.Fragment>
          <section className="jt-report-result__section" style={{ marginTop: 16 }}>
            <h3>가지고 있을 때 — 재산세</h3>
            {results.rows.map((r) => (
              <div key={'p' + r.year} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(0,0,0,.06)' }}>
                <div style={{ fontSize: 12.5, opacity: 0.7, marginBottom: 2 }}>{yearNote(r.prop && { ...r.prop, year: r.year })}</div>
                <div><strong>{r.year}년</strong> {rowLabel(r.prop)}</div>
              </div>
            ))}
          </section>

          <section className="jt-report-result__section">
            <h3>가지고 있을 때 — 종합부동산세 <span style={{ fontWeight: 400, fontSize: 13, opacity: 0.75 }}>(납세자가 가진 주택 전체 기준 — 이 집만의 세금이 아닙니다)</span></h3>
            {/* R1-F3: 이 표시 분기는 «지금의» otherHousing 이 아니라 이 결과를 만들 때
                스냅샷으로 저장한 results.otherHousing 을 본다. */}
            {results.otherHousing === 'unsure' ? (
              <p>계산할 수 없음 — 다른 주택 보유 여부를 확인하지 못했습니다.</p>
            ) : (
              results.rows.map((r) => (
                <div key={'c' + r.year} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(0,0,0,.06)' }}>
                  <div style={{ fontSize: 12.5, opacity: 0.7, marginBottom: 2 }}>{yearNote(r.comp && { ...r.comp, year: r.year })}</div>
                  <div><strong>{r.year}년</strong> {r.comp && r.comp.status === 'unsure' ? '계산할 수 없음' : rowLabel(r.comp)}</div>
                </div>
              ))
            )}
          </section>
        </React.Fragment>
      )}

      <section className="jt-report-result__section">
        <h3>팔 때 · 물려줄 때</h3>
        <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
          매도 가정은 넣지 않았습니다. <strong>0원이라는 뜻이 아닙니다.</strong> 필요하면 아래 계산기에서 직접 확인하세요.
        </p>
        <p style={{ margin: '4px 0' }}><a href="#/report/cgt">양도소득세 계산기 →</a></p>
        <p style={{ margin: '4px 0' }}><a href="#/report/gift">증여세 계산기 →</a></p>
        <p style={{ margin: '4px 0' }}><a href="#/report/inheritance">상속세 계산기 →</a></p>
      </section>

      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>제이티 세무법인 · 광고 담당 세무사 이현준</p>
    </section>
  );
}

window.JTAcqHoldingForecast = JTAcqHoldingForecast;

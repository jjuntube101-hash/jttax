/* @jsx React.createElement */
/* ──────────────────────────────────────────────────────────────────────────
   가상자산(코인) 소득세 계산기 — 2027.1.1 시행 대비
     JTReportCrypto : 2026년 매도(비과세) vs 2027년 이후 매도(과세) 비교

   ★ 시행 근거 (1차 소스 · jt-law-mcp 직접 조회 260805)
   소득세법 부칙(법률 17757, 2020.12.29 공포 / 2024.12.31 최종개정) 제5조:
     「제21조제1항제27호, 제37조제1항제3호 및 같은 조 제5항·제6항, 제64조의3제2항,
      제70조제2항, 제84조제3호 및 제164조의4의 개정규정은 **2027년 1월 1일 이후
      가상자산을 양도·대여하는 분부터 적용**한다.」
   → 세 차례 유예(2022→2023→2025→2027)를 거쳐 현재 2027.1.1 시행 «예정».
     법 자체는 이미 공포·게재돼 있고 적용시기만 부칙이 정한다.

   ★ 계산 근거 조문 (전부 원문 확인)
   - §21①27호  : 가상자산 양도·대여 소득 = 기타소득
   - §37①3호   : 필요경비 = 실제 취득가액 + 취득·양도·대여 부대비용
   - §37⑤      : 「2027년 1월 1일 전에 이미 보유하고 있던 가상자산의 취득가액은
                  2026년 12월 31일 당시의 시가와 그 가상자산의 취득가액 중에서
                  큰 금액으로 한다」  ← 의제취득가액
   - §37⑥      : (2024.12.31 신설) '27.1.1 이후 취득분 중 실제 취득가액 확인이
                  곤란한 경우 총양도가액 × 「100분의 50 이하의 범위에서 대통령령으로
                  정하는 비율」을 필요경비로 할 수 있다. **이 경우 부대비용 불산입.**
                  → 구체적 비율은 시행령 위임, 현재 미제정 [확인 필요]
   - §64의3②   : 「가상자산소득금액에서 250만원을 뺀 금액에 100분의 20을 곱하여」
   - §84 3호   : 「**해당 과세기간의** 가상자산소득금액이 250만원 이하인 경우」 과세 제외
                  → 건별이 아니라 «연간 합산» 기준
   - §70②      : 종합소득과세표준 확정신고 (다음 해 5월)

   ⚠️ 이 계산기는 «시행 예정» 제도를 다룬다. 국회에서 추가 유예·폐지 논의가
      반복돼 온 영역이므로 화면에 그 사실을 반드시 고지한다.
   ────────────────────────────────────────────────────────────────────────── */

const { useState: useCrState } = React;

const crNum = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')); return isFinite(n) ? n : 0; };
const crWon = (n) => (window.formatWon ? window.formatWon(Math.round(n)) : (Math.round(n).toLocaleString('ko-KR') + '원'));
const CR_EOK = 100000000;
const crEok = (n) => {
  const v = Math.round(n);
  if (Math.abs(v) < 10000) return v.toLocaleString('ko-KR') + '원';
  if (Math.abs(v) < CR_EOK) return Math.round(v / 10000).toLocaleString('ko-KR') + '만원';
  return (Math.round(v / CR_EOK * 100) / 100).toLocaleString('ko-KR') + '억원';
};

/* ══════════ SSOT — 법령 값 (개정 시 여기만 고친다) ══════════ */
window.JT_CRYPTO_2027 = {
  effectiveFrom: '2027-01-01',
  deemedBaseDate: '2026-12-31',
  basicDeduct: 2500000,      // §64의3② · §84 3호 (연간)
  rate: 0.20,                // §64의3② 100분의 20
  localRateOfTax: 0.10,      // 지방소득세 = 소득세의 10% → 실효 22%
  articles: {
    income: '소득세법 §21①27호', expense: '소득세법 §37①3호',
    deemed: '소득세법 §37⑤', estimate: '소득세법 §37⑥',
    tax: '소득세법 §64조의3②', minimum: '소득세법 §84 3호',
    filing: '소득세법 §70②', addendum: '소득세법 부칙(법률 17757) §5',
  },
};

/* ══════════ 계산 엔진 ══════════ */
/* ⚠️ 의제취득가액(§37⑤)은 «가상자산별»로 적용한다.
   종전엔 매도·취득·2026말시가를 «합계 3필드»로 받아 max(합계, 합계)를 한 번만 계산했다.
   그러면 종목마다 유불리가 반대인 경우 필요경비가 통째로 어긋난다 — 260805 Codex R3 P1:
     A: 매도 1.5억 / 실제취득 100만 / 2026말 1억   → 의제 1억
     B: 매도 1.5억 / 실제취득 1억   / 2026말 100만 → 의제 1억(실제취득)
     자산별 필요경비 2억 · 소득 1억 · 세액 21,450,000
     합계방식  필요경비 1.01억 · 소득 1.99억 · 세액 43,230,000  (2,178만원 과다)
   → 종목별 행(rows)으로 받아 «행마다» max(실제취득, 2026말시가)를 적용하고 합산한다.
      2026년 이전 보유분과 이후 취득분이 섞이는 경우도 행마다 heldBefore 를 둬 표현한다. */
function crCalc(input) {
  const C = window.JT_CRYPTO_2027;
  const rows = (Array.isArray(input.rows) ? input.rows : []).filter(
    (r) => r && (crNum(r.sale) > 0 || crNum(r.acq) > 0)
  );

  let sale = 0, expense = 0, shielded = 0, deemedApplies = false;
  const lines = rows.map((r, i) => {
    const s = crNum(r.sale), a = crNum(r.acq), m = crNum(r.mkt2026), f = crNum(r.fee);
    const held = r.heldBefore !== 'no';                 // 2026년 말 이전부터 보유했나
    const useDeemed = held && m > a;                    // 의제취득가액이 «유리하게» 작동하나
    const cost = held ? Math.max(a, m) : a;             // §37⑤ — 큰 금액
    sale += s; expense += cost + f;
    if (useDeemed) { shielded += (m - a); deemedApplies = true; }
    return {
      idx: i + 1, name: (r.name || '').trim() || `코인 ${i + 1}`,
      sale: s, acq: a, mkt2026: m, fee: f, held, useDeemed,
      baseCost: cost, gain: s - cost - f,
    };
  });

  /* ② 가상자산소득금액 — 그 해 전체 합산(§84 3호 «해당 과세기간의»).
     행별 손실은 합산 과정에서 자연히 상계된다(별도 손실 항목을 두면 이중 차감). */
  const income = sale - expense;

  /* ③ 과세최저한 §84 3호 — 연간 소득금액 250만원 이하면 과세하지 않는다 */
  const belowMinimum = income <= C.basicDeduct;

  /* ④ 결정세액 §64의3② — (소득금액 − 250만원) × 20% */
  const taxBase = Math.max(0, income - C.basicDeduct);
  const tax = Math.floor(taxBase * C.rate / 10) * 10;
  const local = Math.floor(Math.round(tax * C.localRateOfTax) / 10) * 10;
  const total = belowMinimum ? 0 : tax + local;

  return {
    lines, sale, expense, income, belowMinimum, taxBase, shielded, deemedApplies,
    tax: belowMinimum ? 0 : tax, local: belowMinimum ? 0 : local, total,
    effRate: sale > 0 ? total / sale : 0,
    /* 2026년 안에 팔았다면: 과세 규정 자체가 없으므로 0원 (의제취득가액 무관) */
    gainIfSoldIn2026: lines.reduce((t, l) => t + (l.sale - l.acq - l.fee), 0),
  };
}

window.jtCrCalc = crCalc;

/* ══════════ 문항 ══════════ */
/* ══════════ 화면 ══════════ */
function CrNotice() {
  return (
    <div className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '13px 17px', borderRadius: 8, marginBottom: 18 }}>
      <strong style={{ display: 'block', marginBottom: 5 }}>⚠️ 2027년 1월 1일 «시행 예정» 제도입니다</strong>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65 }}>
        가상자산 과세는 법에 이미 들어가 있고, 적용 시기만 부칙이 정합니다(소득세법 부칙 §5). 다만 시행일이 <strong>2022년 → 2023년 → 2025년 → 2027년으로 세 차례 미뤄졌고</strong>, 추가 유예·폐지 논의가 계속되고 있습니다. 최종 시행 여부는 국회 결정에 달려 있습니다.
      </p>
    </div>
  );
}

/* ══════════ 코인별 입력 행 ══════════
   의제취득가액이 «가상자산별»로 적용되므로(§37⑤) 종목을 한 줄씩 받는다.
   합계 3필드로는 종목마다 유불리가 반대인 경우를 표현할 수 없다 (260805 Codex R3 P1). */
const CR_EMPTY_ROW = { name: '', sale: '', acq: '', mkt2026: '', fee: '', heldBefore: 'yes' };

function CrMoney({ value, onChange, placeholder }) {
  return (
    <input type="text" inputMode="numeric" placeholder={placeholder || ''}
      value={value ? Number(String(value).replace(/[^0-9]/g, '') || 0).toLocaleString('ko-KR') : ''}
      onChange={(e) => onChange(String(e.target.value).replace(/[^0-9]/g, ''))}
      style={{ width: '100%', padding: '10px 12px', fontSize: 15, border: '1px solid #dcd8d0', borderRadius: 8, fontWeight: 700 }} />
  );
}

function CrRows({ rows, setRows }) {
  const upd = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const add = () => setRows(rows.concat([{ ...CR_EMPTY_ROW }]));
  const del = (i) => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : rows);

  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ border: '1px solid #dcd8d0', borderRadius: 10, padding: '14px 15px', marginBottom: 12, background: i % 2 ? '#fbfaf8' : '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
            <input type="text" value={r.name} onChange={(e) => upd(i, 'name', e.target.value)}
              placeholder={`코인 ${i + 1} (예: 비트코인)`}
              style={{ flex: 1, minWidth: 0, padding: '8px 11px', fontSize: 14.5, border: '1px solid #e5e1d9', borderRadius: 7, fontWeight: 700 }} />
            {rows.length > 1 && (
              <button onClick={() => del(i)} title="이 줄 삭제"
                style={{ flex: '0 0 auto', border: '1px solid #dcd8d0', background: '#fff', borderRadius: 7, padding: '8px 11px', cursor: 'pointer', fontSize: 13 }}>삭제</button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <label style={{ fontSize: 12.5, color: '#7b756b' }}>판 금액 (원)
              <CrMoney value={r.sale} onChange={(v) => upd(i, 'sale', v)} placeholder="예: 50,000,000" /></label>
            <label style={{ fontSize: 12.5, color: '#7b756b' }}>실제 산 금액 (원)
              <CrMoney value={r.acq} onChange={(v) => upd(i, 'acq', v)} placeholder="예: 10,000,000" /></label>
            {r.heldBefore !== 'no' && (
              <label style={{ fontSize: 12.5, color: '#7b756b' }}>2026.12.31 시가 (원)
                <CrMoney value={r.mkt2026} onChange={(v) => upd(i, 'mkt2026', v)} placeholder="예: 40,000,000" /></label>
            )}
            <label style={{ fontSize: 12.5, color: '#7b756b' }}>수수료 (원, 선택)
              <CrMoney value={r.fee} onChange={(v) => upd(i, 'fee', v)} placeholder="예: 250,000" /></label>
          </div>

          <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
            {[['yes', '2026년 말 이전부터 보유'], ['no', '2027년 이후 취득']].map(([v, label]) => (
              <button key={v} onClick={() => upd(i, 'heldBefore', v)} style={{
                border: r.heldBefore === v ? '2px solid #2a3038' : '1px solid #dcd8d0',
                background: r.heldBefore === v ? '#f7f5f0' : '#fff',
                borderRadius: 999, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', font: 'inherit', fontWeight: 700,
              }}>{label}</button>
            ))}
          </div>
          {r.heldBefore !== 'no' && crNum(r.mkt2026) > crNum(r.acq) && crNum(r.acq) > 0 && (
            <div style={{ fontSize: 12.5, color: '#1e6b45', marginTop: 9, lineHeight: 1.6 }}>
              → 2026년 말까지 오른 {crEok(crNum(r.mkt2026) - crNum(r.acq))}은 과세 대상에서 빠집니다(의제취득가액).
            </div>
          )}
        </div>
      ))}
      <button onClick={add} style={{
        width: '100%', border: '1px dashed #b0a89b', background: '#fff', borderRadius: 9,
        padding: '12px', cursor: 'pointer', font: 'inherit', fontWeight: 700, fontSize: 14.5, color: '#5a5449',
      }}>+ 코인 추가</button>
    </div>
  );
}

function JTReportCrypto({ setRoute, setSubRoute, onBack }) {
  const [rows, setRows] = useCrState([{ ...CR_EMPTY_ROW }]);
  const [result, setResult] = useCrState(null);
  const C = window.JT_CRYPTO_2027;

  /* 행 단위 검증 — 한 줄이라도 값이 있으면 그 줄은 완전해야 한다 */
  const invalid = (() => {
    const filled = rows.filter((r) => crNum(r.sale) > 0 || crNum(r.acq) > 0);
    if (!filled.length) return '판 금액과 산 금액을 넣어 주세요.';
    for (let i = 0; i < filled.length; i++) {
      const r = filled[i], nm = (r.name || '').trim() || `${i + 1}번째 코인`;
      if (crNum(r.sale) <= 0) return `${nm} — 판 금액을 넣어 주세요.`;
      if (crNum(r.acq) <= 0) return `${nm} — 실제 산 금액을 넣어 주세요.`;
      if (r.heldBefore !== 'no' && crNum(r.mkt2026) <= 0)
        return `${nm} — 2026년 12월 31일 시가를 넣어 주세요. 이 값이 세금을 크게 좌우합니다.`;
    }
    return null;
  })();

  const run = () => {
    setResult(crCalc({ rows }));
    try { window.jtTrackCta && window.jtTrackCta('calc_run', 'crypto_2027'); } catch (e) {}
    setTimeout(() => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {} }, 30);
  };

  if (!result) {
    return (
      <JTReportShell tag="2027 시행 예정" stepIdx={0} stepTotal={2} onBack={onBack}
        title="코인 세금, 2027년부터 얼마나 낼까요?"
        subtitle="2026년 안에 팔면 0원, 2027년부터는 과세됩니다 — 내 경우 얼마인지 바로 계산합니다.">
        <div className="jt-container">
          <CrNotice />
          <div className="jt-report-calc">
            <div className="jt-report-q__section">코인별 매도 내역</div>
            <h2 style={{ fontSize: 20, lineHeight: 1.45, margin: '6px 0 8px' }}>그 해에 판 코인을 종목별로 넣어 주세요</h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: '#7b756b', marginBottom: 16 }}>
              ★ 종목마다 «따로» 넣어야 정확합니다. 2026년 말 이전부터 갖고 있던 코인은 그날 시가를 취득가액으로 인정받는데(의제취득가액, 소득세법 §37⑤),
              이 판정이 <strong>코인 하나하나에 대해</strong> 이뤄지기 때문입니다. 손해 보고 판 코인도 넣으세요 — 그 해 전체를 합산하므로 자동으로 상계됩니다.
            </p>
            <CrRows rows={rows} setRows={setRows} />
            <div style={{ height: 18 }} />
            {invalid && <p style={{ color: '#b3261e', fontSize: 13.5, marginBottom: 12 }}>{invalid}</p>}
            <button className="jt-btn jt-btn--primary" onClick={run} disabled={!!invalid} style={{
              width: '100%', padding: '16px 20px', fontSize: 17, fontWeight: 800, borderRadius: 10,
              opacity: invalid ? 0.45 : 1, cursor: invalid ? 'not-allowed' : 'pointer',
            }}>내 코인 세금 계산하기 <span className="jt-arrow">→</span></button>
          </div>
        </div>
      </JTReportShell>
    );
  }

  const r = result;
  return (
    <JTReportShell tag="2027 시행 예정" stepIdx={2} stepTotal={2} onBack={onBack}
      title="가상자산 소득세 계산 결과" subtitle="2027년 1월 1일 이후 양도한다고 가정한 세액입니다.">
      <div className="jt-container">
        <CrNotice />

        {/* 언제 파느냐 비교 */}
        <section className="jt-report-result__section" style={{ marginBottom: 6 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>언제 팔면 얼마인가</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
            <div style={{ border: '1px solid #dcd8d0', background: '#f0f7f3', borderRadius: 10, padding: '15px 16px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1e6b45', marginBottom: 7 }}>2026년 12월 31일까지</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>0원</div>
              <div style={{ fontSize: 12.5, color: '#7b756b', lineHeight: 1.55 }}>
                아직 과세 규정이 적용되지 않아 세금이 없습니다{r.gainIfSoldIn2026 > 0 ? ` (차익 ${crEok(r.gainIfSoldIn2026)} 전액 비과세)` : ''}.
              </div>
            </div>
            <div style={{ border: '2px solid #2a3038', background: '#f7f5f0', borderRadius: 10, padding: '15px 16px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2a3038', marginBottom: 7 }}>2027년 1월 1일 이후</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>{crEok(r.total)}</div>
              <div style={{ fontSize: 12.5, color: '#7b756b' }}>{crWon(r.total)}</div>
            </div>
          </div>
        </section>

        {/* 한 줄 결론 */}
        <div className="jt-report-result__section" style={{ background: r.belowMinimum ? '#f0f7f3' : '#f7f5f0', borderLeft: `4px solid ${r.belowMinimum ? '#2a6d4f' : '#2a3038'}`, padding: '15px 18px', borderRadius: 8, marginBottom: 20 }}>
          <strong style={{ display: 'block', marginBottom: 6 }}>한 줄 결론</strong>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7 }}>
            {r.belowMinimum
              ? <>그 해 가상자산 소득금액이 <strong>{crEok(r.income)}</strong>으로 과세최저한(연 250만원) 이하라 <strong>세금이 없습니다</strong>(소득세법 §84 3호). 다만 같은 해에 다른 코인을 더 팔아 합산 소득이 250만원을 넘으면 과세됩니다.</>
              : <>2027년 이후 매도 시 <strong>{crWon(r.total)}</strong>을 내게 됩니다 — 소득금액 {crEok(r.income)}에서 250만원을 뺀 {crEok(r.taxBase)}에 20%(지방소득세 포함 22%)를 적용한 금액입니다.</>}
            {r.deemedApplies && <> 2026년 말까지 오른 <strong>{crEok(r.shielded)}</strong>은 의제취득가액 덕분에 <strong>과세 대상에서 빠집니다</strong>(소득세법 §37⑤).</>}
            {/* ⚠️ 결과 객체엔 heldBefore 가 없다(행 단위로 갈림) — lines 로 판정한다.
                   종전엔 !r.heldBefore 가 항상 참이라 「2027년 이후 취득」 문구가
                   의제취득 적용 설명 뒤에 늘 따라붙었다 (260805 Codex R6 P2). */}
            {r.lines.length > 0 && r.lines.every((l) => !l.held) &&
              ' 전부 2027년 이후 취득분이라 의제취득가액은 적용되지 않고, 실제 산 가격이 그대로 취득가액이 됩니다.'}
            {r.lines.some((l) => l.held) && r.lines.some((l) => !l.held) &&
              ' 2027년 이후 취득한 종목에는 의제취득가액이 적용되지 않아, 그 종목은 실제 산 가격이 취득가액이 됩니다.'}
          </p>
        </div>

        {/* 단계별 계산 */}
        <section className="jt-report-result__section">
          <h3 style={{ fontSize: 16, marginBottom: 10 }}>단계별 계산</h3>
          <div style={{ border: '1px solid #e5e1d9', borderRadius: 8, overflow: 'hidden' }}>
            {[
              { k: 'Step 1. 양도가액 (그 해 매도 합계)', v: r.sale, note: window.JT_CRYPTO_2027.articles.income },
              ...r.lines.map((l) => ({
                k: `　└ ${l.name} 필요경비`, v: -(l.baseCost + l.fee),
                note: (l.useDeemed
                  ? `2026.12.31 시가 ${crWon(l.mkt2026)} > 실제 취득가액 ${crWon(l.acq)} → 큰 금액 적용 (${C.articles.deemed})`
                  : (l.held ? `실제 취득가액이 2026년 말 시가보다 커서 실제 취득가액 적용 (${C.articles.deemed})`
                            : `2027년 이후 취득 — 실제 취득가액 (${C.articles.expense})`))
                  + (l.fee ? ` + 수수료 ${crWon(l.fee)}` : ''),
              })),
              { k: 'Step 2. 필요경비 합계', v: -r.expense, note: '코인별 의제취득가액을 «각각» 적용한 뒤 합산 (§37⑤)' },
              { k: '가상자산소득금액', v: r.income, note: '양도가액 − 필요경비 (그 해 전체 합산 — 손실 거래 포함)' },
              { k: '기본공제', v: -Math.min(C.basicDeduct, Math.max(0, r.income)), note: `연 250만원 (${C.articles.tax})` },
              { k: '과세표준', v: r.taxBase, note: r.belowMinimum ? `250만원 이하 → 과세 제외 (${C.articles.minimum})` : '' },
              { k: `소득세 (${(C.rate * 100).toFixed(0)}%)`, v: r.tax, note: C.articles.tax },
              { k: '지방소득세 (소득세의 10%)', v: r.local, note: '실효세율 합계 22%' },
            ].map((s, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start',
                padding: '11px 15px', borderTop: i ? '1px solid #efece6' : 'none', background: i % 2 ? '#fbfaf8' : '#fff',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{s.k}</div>
                  {s.note && <div style={{ fontSize: 12.5, color: '#7b756b', marginTop: 3, lineHeight: 1.55 }}>{s.note}</div>}
                </div>
                <div style={{ fontWeight: 800, fontSize: 14.5, whiteSpace: 'nowrap', color: s.v < 0 ? '#1e6b45' : '#2a3038' }}>
                  {s.v < 0 ? '−' : ''}{crWon(Math.abs(s.v))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 핵심 정리 */}
        <section className="jt-report-result__section" style={{ background: '#f7f5f0', padding: '15px 18px', borderRadius: 8 }}>
          <h3 style={{ fontSize: 15.5, marginBottom: 8 }}>알아 두실 것</h3>
          <ul style={{ margin: 0, paddingLeft: 19, fontSize: 14, lineHeight: 1.85 }}>
            <li><strong>2026년 말까지의 상승분은 과세되지 않습니다.</strong> 2027년 전부터 갖고 있던 코인은 「2026년 12월 31일 시가」와 「실제 산 가격」 중 <strong>큰 금액</strong>을 취득가액으로 인정합니다(§37⑤). 지금 크게 올라 있다면 그만큼이 과세 대상에서 빠집니다.</li>
            <li><strong>연 250만원까지는 세금이 없습니다.</strong> 건별이 아니라 <strong>그 해 전체를 합산</strong>한 소득금액 기준입니다(§84 3호).</li>
            <li><strong>세율은 20%, 지방소득세를 더하면 22%</strong>입니다(§64조의3②). 다른 소득과 합치지 않는 분리과세입니다.</li>
            <li><strong>신고는 본인이 해야 합니다.</strong> 소득이 생긴 다음 해 5월 종합소득세 신고기간에 직접 신고·납부합니다(§70②). 거래소가 대신 떼어 주지 않습니다.</li>
            <li><strong>같은 해 손실은 상계되지만, 다음 해로 이월하는 규정은 없습니다.</strong> 손해 본 거래도 매도액·취득가액에 함께 넣으면 자동으로 상계됩니다. 손익이 큰 해에는 실현 시점 관리가 중요합니다.</li>
            <li><strong>상속·증여는 지금도 과세됩니다.</strong> 양도 과세 시행과 무관하게, 가상자산을 물려주거나 받으면 현행 상속세및증여세법에 따라 평가·과세됩니다.</li>
          </ul>
        </section>

        <section className="jt-report-result__section" style={{ background: '#fff7ea', borderLeft: '4px solid #d08b00', padding: '14px 17px', borderRadius: 8 }}>
          <strong style={{ display: 'block', marginBottom: 6 }}>이 계산에 반영하지 않은 것</strong>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7 }}>
            취득가액 확인이 곤란한 경우의 <strong>추계 필요경비</strong>(§37⑥ — 총양도가액의 50% 이하 범위에서 시행령이 정하는 비율, <strong>시행령 미제정</strong>), 2026.12.31 시가의 구체적 산정 방법, 여러 번 나눠 산 경우의 취득가액 산정 순서(선입선출 등 시행령 위임 사항), 대여(스테이킹·렌딩) 소득, 해외 거래소·개인지갑 보유분, 채굴·에어드랍·하드포크로 취득한 코인, NFT 해당 여부는 반영하지 않았습니다.
            시행령이 아직 정비되지 않은 부분이 있어 실제 시행 시 세부 계산이 달라질 수 있습니다.
          </p>
        </section>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0 6px' }}>
          <button className="jt-btn jt-btn--ghost" onClick={() => setResult(null)}>← 조건 바꿔서 다시 계산</button>
          <button className="jt-btn jt-btn--ghost" onClick={() => setSubRoute && setSubRoute('reform-cgt')}>2026 세제개편안 양도세는? →</button>
        </div>

        <JTReportCta setRoute={setRoute} />
        <section className="jt-report-result__section">
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>다른 세금도 계산해 보세요</h3>
          <p style={{ fontSize: 13.5, color: '#7b756b', margin: '0 0 12px' }}>모두 무료 · 로그인 불필요 · 입력값은 저장하지 않습니다.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 10 }}>
            {[
              { sub: 'reform-cgt', kr: '2026 세제개편안 양도세 계산기', d: '장특공제 거주 전환 — 연도별 비교' },
              { sub: 'reform-cre', kr: '2026 종부세 개편안 계산기', d: '거주 14억 vs 비거주 9억' },
              { sub: 'gift', kr: '증여세 계산기', d: '코인을 자녀에게 넘길 때' },
              { sub: 'inheritance', kr: '상속세 계산기', d: '가상자산도 상속재산입니다' },
              { sub: 'income', kr: '종합소득세 계산기', d: '사업·프리랜서 소득까지 합산' },
              { sub: 'cgt', kr: '양도소득세 계산기', d: '부동산을 팔 때' },
            ].map((x) => (
              <button key={x.sub} onClick={() => setSubRoute && setSubRoute(x.sub)} style={{
                textAlign: 'left', border: '1px solid #dcd8d0', borderRadius: 9, padding: '13px 15px',
                background: '#fff', cursor: 'pointer', font: 'inherit',
              }}>
                <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 4 }}>{x.kr} <span style={{ color: '#b0a89b' }}>→</span></div>
                <div style={{ fontSize: 12.5, color: '#7b756b', lineHeight: 1.5 }}>{x.d}</div>
              </button>
            ))}
          </div>
        </section>
        <JTReportDisclaimer variant="inline" />
      </div>
    </JTReportShell>
  );
}

window.JTReportCrypto = JTReportCrypto;

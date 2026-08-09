/* global React */
/* 히어로 간이 계산기 — 첫 화면에서 «먼저 숫자부터» 보여 준다 (260809 결재 「안 2」)
 *
 * ⛔ 세액 로직을 여기서 «구현하지 않는다». 검증된 jt-tax-engine 을 그대로 호출한다.
 *    계산기가 두 벌이 되면 같은 입력에 다른 답이 나오고, 그 순간 둘 다 못 믿게 된다.
 *
 * ★ 왜 «범위»로 보여 주는가 (260809 Codex P0 → 실측으로 확인)
 *   간이 계산이라 조정대상지역을 묻지 않는데, 그걸 「아님」으로 두면 세금이 «훨씬» 적게 나온다.
 *   실측(1주택·2018취득·8억→15억): 비조정 2,732만원 ↔ 조정 2억 3,096만원 — 8.5배.
 *   첫 화면에 낮은 쪽만 보여 주고 정밀 계산에서 8배로 뛰면 그건 도구가 아니라 함정이다.
 *   그래서 두 경우를 모두 계산해 «범위»로 내놓는다. 그 폭 자체가 「왜 전문가가 필요한가」를
 *   가장 정직하게 설명한다 — 지어낸 카피보다 낫다.
 */
const { useState: useHC, useRef: useHCRef } = React;

const HC_ENGINE = (typeof window !== 'undefined' && window.JT_ENGINE_BASE) || '';

/* ⚠️ 엔진은 «IP당 분당 40회»로 제한한다 (jt-taxlab services/tax-engine/app/security.py,
   CALC_RATE_PER_MIN 기본 40). 이 계산기는 조정/비조정 두 경우를 재느라 클릭당 2회를 쓰므로
   실질 20클릭/분이다. 같은 입력을 다시 누르는 것만으로 한도를 깎지 않도록 결과를 기억한다.
   (사무실·모바일 통신망처럼 IP 를 공유하는 곳에서는 여럿이 함께 소모한다) */
const hcCache = new Map();
const HC_CACHE_MAX = 30;

/** 계측은 «있으면» 한다 — 없다고 계산이나 이동이 멈추면 안 된다 (Codex P1) */
function hcSafe(fn) { try { fn(); } catch (_e) { /* 계측 실패가 동선을 막지 않는다 */ } }

/** 원 단위 정수를 「N억 N,NNN만 원」으로.
 *  ⚠️ 버림이 아니라 «반올림» — 버리면 표시가 늘 실제보다 «낮아진다»(Codex P1).
 *     간이 추정이라 만원 단위로 끊되, 한쪽으로 치우치지는 않게 한다. */
function hcMoney(n) {
  const v = Math.round(Number(n) || 0);
  if (v <= 0) return '0원';
  if (v < 10000) return `${v.toLocaleString('ko-KR')}원`;
  const man10k = Math.round(v / 10000);              // 만원 단위 반올림
  const eok = Math.floor(man10k / 10000);
  const man = man10k % 10000;
  if (eok && man) return `${eok}억 ${man.toLocaleString('ko-KR')}만 원`;
  if (eok) return `${eok}억 원`;
  return `${man.toLocaleString('ko-KR')}만 원`;
}

/** 「5억」·「5억 3000만」·「530000000」 등 사람이 치는 대로 받아 원 단위로.
 *  ⛔ «모르는 형태는 통과시키지 않는다» — 돈을 다루는 입력에서 가장 나쁜 것은 거절이 아니라
 *     «조용히 틀린 값»이다. 자가 점검에서 실제로 이런 것들이 나왔다 (260809):
 *       '-5억'   → 500,000,000  (음수 부호를 말없이 버림)
 *       '5만억'  → 50,000       (「만억」을 「만」으로 오독)
 *       '5억5억' → 500,000,000  (뒤를 말없이 무시)
 *     → 문자열 «전체»가 정해진 형태와 맞을 때만 값을 낸다. 아니면 null(화면에 안내 표시).
 *  @returns {number|null} 원 단위. 형태가 아니거나 비상식적이면 null
 */
const HC_MAX = 1e13;   // 10조 — 이보다 크면 오타로 본다(간이 계산기의 상한)
/** 원 단위 숫자를 「5,000만 원」·「9억 원」처럼 읽어 준다 — 0 이 몇 개인지 세지 않게 */
function hcReadable(v) {
  if (v === null || v === undefined || v <= 0) return '';
  const eok = Math.floor(v / 100000000);
  const man = Math.floor((v % 100000000) / 10000);
  const rest = v % 10000;
  const parts = [];
  if (eok) parts.push(`${eok.toLocaleString('ko-KR')}억`);
  if (man) parts.push(`${man.toLocaleString('ko-KR')}만`);
  if (rest) parts.push(`${rest.toLocaleString('ko-KR')}`);
  return parts.join(' ') + ' 원';
}

function hcParse(raw) {
  const s = String(raw == null ? '' : raw).replace(/[\s,]/g, '').replace(/원$/, '');
  if (!s) return null;
  let v = null;
  if (/^\d+$/.test(s)) {                       // 530000000
    v = Number(s);
  } else {
    /* 전체 일치만 허용 — 「5억」 「5.3억」 「5억3000만」 「3000만」 */
    const m = s.match(/^(?:(\d+(?:\.\d+)?)억)?(?:(\d+(?:\.\d+)?)만)?$/);
    if (!m || (!m[1] && !m[2])) return null;
    v = Math.round((m[1] ? parseFloat(m[1]) * 100000000 : 0) + (m[2] ? parseFloat(m[2]) * 10000 : 0));
  }
  if (!Number.isFinite(v) || v < 0 || v > HC_MAX) return null;
  return v;
}

function JTHeroCalc() {
  /* ⛔ 이 계산기는 «주택 전용»이다 (260809 사용자 결정).
     한때 자산 유형을 5지선다로 물었는데, 첫 질문으로 두면 «대다수에게 마찰»을 주고
     소수를 구하는 구조가 된다 — 히어로에 오는 사람 대부분은 집을 판다.
     ⚠️ 다만 그냥 지우면 안 된다. 실측(5억→9억·2023취득)에서
        주택 0원 ↔ 입주권·상가·토지 1억 3,581만 ↔ 분양권 2억 6,235만 원이다.
        분양권 보유자가 「0원」을 보고 가는 일은 여전히 막아야 한다.
     → 유형을 «묻지» 않되, 범위 고지를 «숫자보다 먼저» 읽히는 자리에 두고
        결과에도 「주택 기준」을 남긴다. 위치가 곧 안전장치다. */
  const [houses, setHouses] = useHC('1');
  /* 조정대상지역을 «묻는다» (260809 사용자 지시). 종전엔 안 묻고 두 경우를 다 계산해
     범위로 냈는데, 폭이 8배까지 벌어져 「그래서 얼마인데」가 남았다.
     한 번 물으면 숫자 하나로 떨어지고 엔진 호출도 절반이 된다.
     ⚠️ 「모름」은 여전히 범위로 답한다 — 모르는 것을 아는 척하지 않는다. */
  /* 기본값 «아니요» (260809 사용자 결정) — 대부분 숫자 하나로 떨어져 읽기 쉽다.
     ⚠️ 대신 조정지역인 분께는 «실제보다 낮은» 숫자를 먼저 보여 주게 된다.
        그래서 결과의 가정 문구에 그 사실을 반드시 남긴다(아래 assume). */
  const [zone, setZone] = useHC('no');        // no(기본) | yes | unknown
  const [acqDate, setAcqDate] = useHC('');
  const [acqPrice, setAcqPrice] = useHC('');
  const [salePrice, setSalePrice] = useHC('');
  const [state, setState] = useHC({ phase: 'idle' });   // idle | loading | done | error
  const reqId = useHCRef(0);
  const outRef = useHCRef(null);
  /* 진행 중인 요청을 붙들어 둔다 — 입력이 바뀌면 «취소»해야 한다.
     reqId 만 올리면 응답을 «무시»할 뿐, 요청은 그대로 나가 분당 한도를 깎는다 (Codex P1). */
  const acRef = useHCRef(null);

  const acq = hcParse(acqPrice);
  const sale = hcParse(salePrice);
  /* 화면에는 «원 단위 콤마»로 되돌려 보여 준다 — `9000000000` 은 0 을 세게 만든다 */
  const shown = (raw, v) => (v !== null && /^[\d,]+$/.test(String(raw).replace(/\s/g, ''))
    ? v.toLocaleString('ko-KR') : raw);
  /* ⚠️ 취득가 0 을 유효로 두면 「취득가를 안 적은 사람」이 차익 전액에 대한 세액을 보게 된다
     (Codex P1). 0원에 산 집은 없다 — 둘 다 양수여야 계산한다. */
  const ready = !!acqDate && acq !== null && sale !== null && acq > 0 && sale > 0;

  /* ⚠️ 렌더 시점에 한 번 구하면 자정을 넘겨도 «어제»가 남는다 — 화면은 「오늘 양도 기준」이라
     써 놓고 전날 세액을 보여 주게 된다 (Codex P1). 누를 때마다 새로 구한다.
     ⚠️ toISOString() 은 UTC 라 KST 새벽에 하루가 당겨진다 — 지역 시각으로 만든다. */
  /* ⚠️ 로컬 시간으로 만들면 해외·VPN 브라우저에서 «한국 날짜와 다른 양도일»이 간다
     (Codex P1). 세법은 한국 날짜 기준이므로 UTC+9 로 고정한다. */
  const kstToday = () => {
    const d = new Date(Date.now() + 9 * 3600 * 1000);   // UTC+9
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  };
  /* ⚠️ 렌더 한 번의 날짜로 `max` 가 굳으면, 자정을 넘겨 창을 열어 둔 사람은 «오늘»을
     취득일로 고를 수 없다 (Codex P1). 날짜칸을 만질 때 다시 계산한다. */
  const [maxDate, setMaxDate] = useHC(kstToday());

  /* ⚠️ 입력이 바뀌면 «진행 중인 요청»도 무효로 만든다 (Codex P1) — state 만 idle 로 돌리면
     먼저 보낸 요청의 응답이 나중에 도착해 «바뀐 입력 밑에 옛 세액»을 그려 놓는다. */
  const touched = (fn) => (e) => {
    reqId.current += 1;
    /* reqId 만 올리면 응답을 «무시»할 뿐 요청은 그대로 나가 분당 한도를 깎는다 (Codex P1) */
    hcSafe(() => { if (acRef.current) acRef.current.abort(); });
    acRef.current = null;
    setState({ phase: 'idle' });
    fn(e);
  };

  const run = async () => {
    if (!ready || state.phase === 'loading') return;
    const my = ++reqId.current;
    setState({ phase: 'loading' });
    /* ⚠️ 한쪽이 응답하지 않으면 Promise.all 이 영영 끝나지 않아 「계산 중…」이 멈춘 채 남는다
       (Codex P1). 시간 제한을 두고, 넘으면 두 요청을 «취소»한다. */
    const reqDate = kstToday();       // ⚠️ 클릭 시점 — 렌더 시점이 아니다
    const ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    acRef.current = ac;
    let timer = null;
    /* ⚠️ AbortController 가 없는 환경에서는 abort 가 «아무 일도 안 한다» — 응답이 영영
       안 오면 「계산 중…」이 끝나지 않는다 (Codex P1). 경주(race)로 시간을 끊는다. */
    const HC_TIMEOUT_MS = 12000;
    const timeout = new Promise((_res, rej) => {
      timer = setTimeout(() => {
        hcSafe(() => ac && ac.abort());
        const e = new Error('timeout'); e.name = 'AbortError'; rej(e);
      }, HC_TIMEOUT_MS);
    });
    const multi = Number(houses) > 1;   // 다주택은 «지금», 1주택은 «취득 당시»가 좌우
    const call = (regulated) => fetch(HC_ENGINE + '/v1/calc/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ac ? ac.signal : undefined,
      body: JSON.stringify({
        transfer_price: sale,
        acquisition_price: acq,
        property_type: '주택',   // 이 계산기는 주택 전용
        transfer_date: reqDate,              // 간이 — 오늘 양도 기준(화면에 명시)
        acquisition_date: acqDate,
        housing_count: Number(houses),
        /* ⚠️ 「현재 조정」과 「취득 당시 조정」은 «다른 사실»이다 (Codex P1).
           둘을 한 선택으로 묶으면 시점이 엇갈리는 분은 정확한 조건을 넣을 방법이 없다.
           ★ 실측으로 «주택 수에 따라 좌우하는 시점이 다르다»는 것을 확인했다 (260809):
               1주택  FF=FT? 아니오 / FF=TF 예  → «취득 당시»가 좌우 (비과세 거주요건, 시행령 §154①)
               2·3주택 FF=FT 예 / FF=TF 아니오 → «지금»이 좌우 (중과, 소득세법 §104⑦)
           → 그 주택 수에서 «실제로 세액을 움직이는 시점»만 사용자의 답으로 반영하고,
              나머지 한쪽은 «보수적으로»(세금이 적게 나오지 않는 쪽) 둔다.
              보수 기본값이 필요한 이유: 첫 화면에서 낮게 보여 주고 정밀 계산에서 오르면
              그건 도구가 아니라 함정이다. */
        is_regulated_area: multi ? regulated : false,
        regulated_at_acquisition: multi ? true : regulated,
        expenses_total: 0,                 // 간이 — 필요경비 미반영(화면에 명시)
      }),
    }).then((res) => {
      if (!res.ok) { const e = new Error('engine ' + res.status); e.status = res.status; throw e; }
      return res.json();
    });

    const cacheKey = [houses, acqDate, acq, sale, reqDate, zone].join('|');
    try {
      /* 조정대상지역 «아닌 경우»와 «인 경우»를 둘 다 계산한다 —
         어느 쪽인지 묻지 않았으므로 한쪽만 단정해 보여 줄 수 없다. */
      /* 조정 여부를 «물었으면» 그 한 경우만 계산한다 — 호출이 절반이 되고 답이 하나로 떨어진다.
         「모름」일 때만 두 경우를 다 계산해 범위로 낸다 (모르는 것을 아는 척하지 않는다). */
      const asked = zone === 'no' || zone === 'yes';
      const hit = hcCache.get(cacheKey);
      const [plain, reg] = hit || await Promise.race([
        asked ? call(zone === 'yes').then((r) => [r, r]) : Promise.all([call(false), call(true)]),
        timeout,
      ]);
      /* ⚠️ 여기서 조기 return 하면 아래 정리에 도달하지 못하므로 타이머는 finally 에서 끈다. */
      if (my !== reqId.current) return;
      const cs = [plain && plain.calc, reg && reg.calc];
      /* ⚠️ 형태 검증 «전»에 캐시하면, 한 번 이상한 응답을 받은 뒤 서버가 회복해도 같은 입력은
         영원히 캐시된 불량을 재사용해 오류 화면만 반복한다 (Codex P1).
         쓸 수 있는 값이라는 걸 확인한 «뒤»에 저장한다. */
      if (cs.some((c) => !c || typeof c.총세부담 !== 'number')) throw new Error('shape');
      if (!hit) {
        hcCache.set(cacheKey, [plain, reg]);
        if (hcCache.size > HC_CACHE_MAX) hcCache.delete(hcCache.keys().next().value);
      }
      /* ⚠️ plain 을 무조건 lo, reg 를 무조건 hi 로 두면 엔진이 반대로 주는 순간 화면이
         「1만 원 ~ 0원」처럼 뒤집힌다 (Codex P1). 크기로 정렬한다.
         (실측: 조정 4조합 FF·FT·TF·TT 가 모두 FF~TT 범위 안이었다 — 2회 호출로 얻는
          범위 자체는 맞다. 다만 순서를 코드가 «가정»하지는 않는다) */
      /* ⚠️ 금액으로 정렬만 하면 «설명»이 어긋난다 — lo 를 늘 「비조정」이라 부르면,
         엔진이 반대로 주는 순간 화면이 사실과 «반대»를 말한다 (Codex P1).
         정렬하면서 그 값이 어느 경우였는지를 함께 들고 간다. */
      const pair = [{ v: cs[0].총세부담, reg: false }, { v: cs[1].총세부담, reg: true }]
        .sort((a, b) => a.v - b.v);
      const lo = pair[0].v;
      const hi = pair[1].v;
      const loIsReg = pair[0].reg;      // 낮은 쪽이 «조정» 경우인가
      const askedZone = zone === 'no' || zone === 'yes';
      /* 「비과세여부」가 true 라고 세금이 0 인 것이 아니다 — 1세대1주택도 12억 초과분은
         과세된다(소득세법 §89①3·시행령 §160). 실측: 5억→20억 에서 비과세여부=true 이면서
         총세부담 1억 9,215만원. 「비과세」라고만 쓰면 화면이 스스로 모순된다. */
      const kindOf = (c) => (c.비과세여부 ? (c.총세부담 > 0 ? 'partial' : 'full') : 'taxed');
      /* ⚠️ 두 세액이 «같아도» 비과세 판정은 다를 수 있다(한쪽은 비과세, 다른 쪽은 과세인데
         공제로 0원). 그때 한쪽 판정만 보고 「전액 비과세」라 단정하면 거짓이다 (Codex P1).
         판정이 갈리면 단정하지 않는다. */
      const k0 = kindOf(cs[0]);
      const k1 = kindOf(cs[1]);
      setState({
        phase: 'done', lo, hi, loIsReg, asked: askedZone, zoneAns: zone, spread: !askedZone && hi !== lo,
        kind: k0 === k1 ? k0 : 'mixed',
        reason: k0 === k1 ? (cs[0].비과세사유 || '') : '',
      });
      hcSafe(() => window.jtEvent('hero_calc_run', { housing_count: Number(houses) }));
    } catch (err) {
      if (my !== reqId.current) return;
      /* 오류를 세 가지로 나눈다 — 사용자가 «무엇을 하면 되는지»가 다르기 때문이다.
           429       잠시 기다리면 된다 (엔진은 IP당 분당 40회)
           시간초과   네트워크가 느린 것 — 다시 눌러 보면 된다
           그 외      진짜 고장 — 전화·카톡으로 안내
         뭉뚱그리면 도구가 망가진 줄 알고 떠난다. */
      const aborted = err && (err.name === 'AbortError' || err.code === 20);
      setState({
        phase: 'error',
        busy: !!(err && err.status === 429),
        slow: !!aborted,
      });
    } finally {
      /* 성공·실패·조기 return 어느 경로로 빠져나가도 타이머는 끄고, 남은 요청도 끊는다.
         ⚠️ 한쪽이 먼저 실패하면 Promise.all 은 즉시 끝나지만 «다른 쪽은 계속 살아 있다» —
            그대로 두면 재시도할 때마다 잔류 요청이 쌓여 분당 한도를 더 빨리 태운다
            (Codex P1). 여기서 반드시 abort 한다. */
      clearTimeout(timer);
      hcSafe(() => { if (ac) ac.abort(); });
      if (acRef.current === ac) acRef.current = null;
    }
    /* 결과가 화면 밖에 그려지면 «아무 일도 안 일어난 것»처럼 보인다 (모바일 실측: 756~928px).
       ⚠️ scrollIntoView 는 히어로의 `overflow:hidden` 때문에 무동작이고, behavior:'smooth' 는
          호출돼도 무시되는 환경이 있었다(scrollY 가 0 그대로) → 위치를 직접 대입한다. */
    setTimeout(() => {
      hcSafe(() => {
        const el = outRef.current;
        if (!el) return;
        const over = el.getBoundingClientRect().bottom - window.innerHeight + 16;
        if (over > 0) {
          const se = document.scrollingElement || document.documentElement;
          se.scrollTop = se.scrollTop + over;
        }
      });
    }, 60);
  };

  /* ⚠️ `setRoute('calculators')` 를 부르고 있었는데 그런 라우트가 «없다» — index.html 의
     어느 분기에도 안 걸려 누르면 «빈 화면»이 됐다 (260809 Codex P1, 실측 확인).
     계산기는 SPA 라우트가 아니라 별도 정적 페이지(`/calculators/`)다. 그리로 «이동»한다. */
  const goFull = () => {
    hcSafe(() => window.jtTrackCta('calculator', 'hero_calc'));
    window.location.href = '/calculators/';
  };

  const field = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', fontSize: 15, fontFamily: 'inherit',
    border: '1px solid rgba(255,255,255,.22)', borderRadius: 9, background: 'rgba(255,255,255,.06)', color: 'inherit' };
  const labelSt = { display: 'block', fontSize: 12, letterSpacing: '.02em', opacity: .7, marginBottom: 6 };

  return (
    <div className="jt-herocalc reveal" data-delay="4">
      <div className="jt-herocalc__head">양도소득세 · 간이 계산 <span style={{opacity:.7}}>· 주택</span></div>
      {/* ⚠️ 요청은 언제나 property_type:'주택' 이다 — 분양권·입주권·상가·토지는 세율도 공제도
          다른데 그대로 주택 세액을 보여 주면 «틀린 숫자»다 (260809 Codex P1).
          간이 계산기의 범위를 화면에 밝히고, 그 밖은 정밀 계산기로 보낸다. */}
      <p className="jt-herocalc__scope">
        <strong>아파트·주택</strong> 기준입니다. 분양권·입주권·상가·토지는 세금이 크게 달라서
        <button type="button" className="jt-herocalc__inline" onClick={goFull}>세금 계산기</button>를 이용해 주세요.
      </p>

      <div className="jt-herocalc__grid">
        <div>
          <label style={labelSt} htmlFor="hc-houses">보유 주택 수</label>
          {/* ⚠️ 주택 수를 바꾸면 조정지역 질문이 «다른 질문»이 된다(1주택=취득 당시 / 다주택=지금).
              그런데 이전 답이 그대로 남아 있으면 «취득 당시 예»가 «지금 예»로 조용히 재해석된다
              (260809 Codex P1). 1주택↔다주택 경계를 넘을 때 답을 되돌린다. */}
          <select id="hc-houses" style={field} value={houses} onChange={touched(e => {
            const prevMulti = Number(houses) > 1;
            const nextMulti = Number(e.target.value) > 1;
            if (prevMulti !== nextMulti) setZone('no');
            setHouses(e.target.value);
          })}>
            <option value="1">1주택</option>
            <option value="2">2주택</option>
            <option value="3">3주택 이상</option>
          </select>
        </div>
        <div>
          <label style={labelSt} htmlFor="hc-date">취득일</label>
          {/* ⚠️ 1주택에서는 조정지역을 «취득할 당시» 기준으로 묻는다 — 취득일이 바뀌면
              그 답은 더 이상 유효하지 않다(지정 전후로 날짜를 옮기면 사실이 뒤집힌다).
              날짜를 바꾸면 답을 되돌린다 (260809 Codex P1). 다주택은 «지금» 기준이라 무관. */}
          <input id="hc-date" type="date" style={field} value={acqDate} max={maxDate}
            onFocus={() => setMaxDate(kstToday())}
            onChange={touched(e => {
              if (Number(houses) === 1) setZone('no');
              setAcqDate(e.target.value);
            })} />
        </div>
        <div>
          <label style={labelSt} htmlFor="hc-acq">취득가</label>
          <input id="hc-acq" type="text" inputMode="numeric" placeholder="예: 500,000,000" style={field}
            value={shown(acqPrice, acq)}
            onChange={touched(e => setAcqPrice(e.target.value))} />
          {acqPrice && acq === null && <div className="jt-herocalc__hint">숫자로 적어 주세요 (「5억」·「5억 3000만」도 됩니다)</div>}
          {acq > 0 && <div className="jt-herocalc__read">{hcReadable(acq)}</div>}
        </div>
        <div>
          <label style={labelSt} htmlFor="hc-sale">양도가</label>
          <input id="hc-sale" type="text" inputMode="numeric" placeholder="예: 900,000,000" style={field}
            value={shown(salePrice, sale)}
            onChange={touched(e => setSalePrice(e.target.value))} />
          {salePrice && sale === null && <div className="jt-herocalc__hint">숫자로 적어 주세요 (「9억」도 됩니다)</div>}
          {sale > 0 && <div className="jt-herocalc__read">{hcReadable(sale)}</div>}
        </div>
        <div className="jt-herocalc__wide">
          {/* ⚠️ 이 하나가 세액을 최대 8배까지 바꾼다(실측: 1주택 8억→15억에서 2,733만 ↔ 2억 3,097만).
              그래서 «묻는다». 다만 모르는 분이 많으므로 「모름」을 기본으로 두고,
              그때는 두 경우를 다 계산해 범위로 답한다 — 한쪽으로 단정하지 않는다. */}
          {/* 주택 수에 따라 «묻는 시점»이 달라진다 — 실측으로 확인한 지배 요인만 묻는다.
              엉뚱한 시점을 물으면 답을 받아도 세액이 안 바뀌어 사용자가 속는다. */}
          <label style={labelSt} htmlFor="hc-zone">
            {Number(houses) > 1
              ? '지금 조정대상지역인가요?'
              : '취득할 당시 조정대상지역이었나요?'}
            <span style={{opacity:.6}}>
              {Number(houses) > 1 ? ' (다주택 중과를 가릅니다)' : ' (비과세 거주요건을 가릅니다)'}
            </span>
          </label>
          <select id="hc-zone" style={field} value={zone} onChange={touched(e => setZone(e.target.value))}>
            <option value="no">아니요</option>
            <option value="unknown">모르겠습니다 — 두 경우를 다 보여드립니다</option>
            <option value="yes">예</option>
          </select>
        </div>
      </div>

      <button type="button" className="jt-herocalc__go" disabled={!ready || state.phase === 'loading'} onClick={run}>
        {state.phase === 'loading' ? '계산 중…' : '세액 계산'}
      </button>

      {state.phase === 'done' && (
        <div className="jt-herocalc__out" role="status" aria-live="polite" ref={outRef}>
          {/* ⚠️ 가정은 «숫자 뒤»가 아니라 숫자와 «같이» 보여야 한다 — 숫자만 보고 닫는 사람이
              가장 많다 (Codex P1: 종전엔 금액 아래에만 있었다). */}
          <div className="jt-herocalc__outlabel">
            {state.spread ? '오늘 양도 기준 · 조정대상지역 여부에 따라'
              : state.kind === 'full' ? '오늘 양도 기준 · 전액 비과세'
              : state.kind === 'partial' ? '오늘 양도 기준 · 일부 비과세'
              : state.kind === 'mixed' ? '오늘 양도 기준 · 예상 세액 (간이)'
              : '오늘 양도 기준 · 예상 세액 (간이)'}
          </div>

          <div className="jt-herocalc__amount">
            {state.spread
              ? <>{hcMoney(state.lo)} <span className="jt-herocalc__tilde">~</span> {hcMoney(state.hi)}</>
              : hcMoney(state.lo)}
          </div>

          {state.spread && (
            <div className="jt-herocalc__why">
              {/* ⚠️ 「아니면/맞으면」이라 쓰면 안 된다 — 조정 여부는 «현재»와 «취득 당시» 두 개의
                  다른 사실이고, 우리는 그 둘을 함께 움직인 «양 끝»만 계산했다 (Codex P0).
                  실측으로 나머지 두 조합도 이 범위 «안»에 들어오는 것은 확인했다. */}
              {/* ⚠️ 「낮은 쪽 = 비조정」이라고 «가정»하지 않는다 — 정렬 결과가 어느 경우였는지를
                  그대로 말한다. 그래야 엔진이 반대로 주는 날에도 화면이 사실과 어긋나지 않는다. */}
              {/* ⚠️ 문구가 «실제로 보낸 조합»과 달랐다 (260809 Codex P1).
                  1주택은 FF·FT 를 계산하는데 「취득·양도 모두 조정」이라 적었고,
                  다주택은 FT·TT 를 계산하는데 「무관」이라 적었다.
                  → 물어보는 시점 하나만 놓고 «아니오/예»로 말한다. 그게 실제로 보낸 것이다. */}
              {Number(houses) > 1 ? '지금' : '취득 당시'} 조정대상지역이
              <strong> 아니면 {hcMoney(state.loIsReg ? state.hi : state.lo)}</strong>,
              <strong> 맞으면 {hcMoney(state.loIsReg ? state.lo : state.hi)}</strong> —
              {Number(houses) > 1
                ? ' 다주택 중과가 이 하나로 갈립니다.'
                : ' 1세대1주택 비과세의 거주요건이 이 하나로 갈립니다.'}
            </div>
          )}
          {!state.spread && state.kind === 'full' && state.reason && (
            <div className="jt-herocalc__why">{state.reason} — 전액 비과세입니다</div>)}
          {!state.spread && state.kind === 'partial' && (
            <div className="jt-herocalc__why">{state.reason || '1세대1주택'} 이지만 12억 원 초과분은 과세됩니다</div>)}

          <div className="jt-herocalc__assume">
            {/* ⚠️ 「주택 기준」은 결과에도 남긴다 — 입력칸 위 고지를 지나친 분에게는
                이것이 마지막 방어선이다. 실측상 분양권은 같은 입력에서 2억 6,235만원인데
                주택은 0원이라, 유형을 오인하면 숫자가 통째로 틀린다 (260809). */}
            <strong>아파트·주택</strong> 기준 간이 추정 — 필요경비·거주기간·감면은 넣지 않았고, 양도일은 오늘로 계산했습니다.
            {state.asked
              ? (state.zoneAns === 'no'
                ? ' 조정대상지역이 «아닌» 것으로 계산했습니다 — 맞다면 세금이 크게 올라갑니다.'
                : ' 조정대상지역으로 계산했습니다.')
              : ' 조정대상지역은 어느 쪽인지 알 수 없어 두 경우를 모두 계산했습니다.'}
            실제 세액은 이 조건들로 다시 달라집니다.
          </div>
          <button type="button" className="jt-herocalc__more" onClick={goFull}>이 숫자를 바꾸는 것들 확인 <span aria-hidden="true">→</span></button>
        </div>
      )}
      {state.phase === 'error' && (
        <div className="jt-herocalc__out" role="status" aria-live="polite" ref={outRef}>
          <div className="jt-herocalc__outlabel">
            {state.busy ? '잠시만 기다려 주세요' : state.slow ? '응답이 늦습니다' : '지금 계산할 수 없습니다'}
          </div>
          <div className="jt-herocalc__assume">
            {state.busy
              ? '짧은 시간에 계산이 몰렸습니다. 1분쯤 뒤에 다시 눌러 주시면 됩니다.'
              : state.slow
                ? '계산 서버 응답이 12초를 넘었습니다. 다시 눌러 보시고, 계속 같으면 전화 02-554-6405 로 문의해 주십시오.'
                : '잠시 후 다시 시도해 주시거나, 전화 02-554-6405 로 문의해 주십시오.'}
          </div>
          <button type="button" className="jt-herocalc__more" onClick={goFull}>세금 계산기로 이동 <span aria-hidden="true">→</span></button>
        </div>
      )}

      <p className="jt-herocalc__note">
        간이 추정입니다. <strong>여기까지가 계산기이고, 여기부터는 세무사가 봅니다.</strong>
      </p>
    </div>
  );
}
window.JTHeroCalc = JTHeroCalc;

/* 히어로 간이 계산기 게이트 (260809 결재 「안 2」)
 *
 * 이 계산기가 지켜야 하는 것은 «예쁘게 보이는 것»이 아니라 다음 셋이다.
 *   ① 세액을 «여기서 계산하지 않는다» — 검증된 엔진을 부른다
 *   ② 엔진이 「비과세」라 해도 세금이 0 이 아닐 수 있다(12억 초과 고가주택)
 *   ③ 묻지 않은 것을 «유리하게» 가정했다면 그 사실을 화면에 적는다
 * 셋 다 어기면 사용자가 «틀린 숫자»를 보게 된다. 그래서 검사한다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = (f) => path.join(__dirname, 'src', f);
let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`      got=${JSON.stringify(got)}  want=${JSON.stringify(want)}`);
};

const raw = fs.readFileSync(SRC('HeroCalc.jsx'), 'utf8');
const code = raw
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');

console.log('\n════ ① 세액을 여기서 계산하지 않는다 ════\n');
{
  /* 계산기가 두 벌이 되면 같은 입력에 다른 답이 나오고, 그 순간 둘 다 못 믿게 된다.
     세율·공제액 같은 «세법 상수»가 이 파일에 등장하면 그것이 두 번째 계산기의 시작이다. */
  eq('엔진 엔드포인트를 호출', /\/v1\/calc\/transfer/.test(code), true);
  eq('엔진 주소를 하드코딩하지 않음 (JT_ENGINE_BASE 사용)', /window\.JT_ENGINE_BASE/.test(code), true);
  /* ⚠️ 낱말만 세면 «안내 문구»까지 걸린다 — 「조정지역이면 중과로 올라갑니다」는 사용자에게
     알려 주는 말이지 계산이 아니다. 처음에 그걸로 위양성이 났다 (260809).
     막아야 하는 것은 «값을 만드는 코드»다: 대입·연산에 세법 낱말이 붙는 경우만 본다. */
  /* ⚠️ `new RegExp('…\\s…')` 은 쓰지 않는다 — 이 저장소의 도구 체인에서 백슬래시가 한 겹
     유실돼 `\s` 가 그냥 `s` 가 된 적이 두 번 있다. 정규식 «리터럴»만 쓴다. */
  const calcish = [
    /(?:const|let|var)\s+\w*(?:세율|누진공제|장기보유|기본공제|중과율|ltsd|surcharge)/i,
    /(?:세율|누진공제|장기보유|기본공제|중과율|ltsd|surcharge)\w*\s*=[^=]/i,
  ].filter(re => re.test(code));
  eq(`세법 상수를 «만드는» 코드가 없음 (${calcish.length}건)`, calcish.length, 0);
  /* 문구가 아니라 «표»로 들어오는 경우도 막는다 — 배열·객체 리터럴에 세율이 늘어서는 형태 */
  eq('세율표로 보이는 배열 리터럴 없음', /\[\s*\{[^}]*(?:rate|세율)[^}]*\}/i.test(code), false);
  /* 퍼센트 리터럴(0.06·0.45 등)도 세율 계산의 신호다. 금액 단위(1e8·1e4)는 표시용이라 허용. */
  const pct = (code.match(/\b0\.\d{2,}\b/g) || []);
  eq(`세율로 보이는 소수 리터럴 없음 (${pct.join('·') || '없음'})`, pct.length, 0);
}

console.log('\n════ ② 「비과세」와 「세금 0」은 다르다 ════\n');
{
  /* 1세대1주택도 12억 초과분은 과세된다(소득세법 §89①3·시행령 §160).
     실측: 5억→20억 에서 엔진이 비과세여부=true 이면서 총세부담 1억 9,215만원.
     그걸 「비과세」라고만 표시하면 화면이 스스로 모순된다 — 거짓 고지다. */
  eq('전액/일부/과세 3분기 판정',
    /kindOf\s*=\s*\(c\)\s*=>\s*\(c\.비과세여부\s*\?\s*\(c\.총세부담\s*>\s*0\s*\?\s*'partial'\s*:\s*'full'\)\s*:\s*'taxed'\)/.test(code), true);
  eq('전액 비과세 라벨', /전액 비과세/.test(code), true);
  eq('일부 비과세 라벨', /일부 비과세/.test(code), true);
  eq('12억 초과분 과세 설명', /12억 원 초과분은 과세/.test(code), true);
  /* 「비과세」라는 말만 단독으로 쓰면 안 된다 — 반드시 전액/일부가 붙어야 한다 */
  const bare = (code.match(/'예상 세액 — 비과세'/g) || []);
  eq('「— 비과세」 단독 라벨 없음', bare.length, 0);
}

console.log('\n════ ③ 묻지 않은 것을 숨기지 않는다 ════\n');
{
  /* 조정지역·필요경비·양도일을 묻지 않고 «세금이 적게 나오는 쪽»으로 두었다.
     첫 화면에서 낮은 숫자를 보여 주고 정밀 계산에서 올라가면 그게 더 나쁘다.
     그래서 무엇을 가정했는지 화면에 그대로 적는다. */
  /* ⚠️ 종전엔 조정지역을 «아님»으로 단정해 보냈다 — 실측에서 8.5배 차이가 났다
     (1주택·2018취득·8억→15억: 비조정 2,732만 ↔ 조정 2억 3,096만). 낮은 쪽만 보여 주면
     첫 화면이 함정이 된다 (260809 Codex P0). 두 경우를 «모두» 계산해 범위로 낸다. */
  /* ⚠️ `Promise.all` 문자열만 찾으면 yes/no 에서도 두 번 부르게 바꿔도 통과한다 (Codex P2).
     «물었으면 한 번, 모르면 두 번»이라는 «분기 자체»를 본다. */
  eq('물었으면 1회·모르면 2회 호출',
    /asked \? call\(zone === 'yes'\)\.then\(\(r\) => \[r, r\]\) : Promise\.all\(\[call\(false\), call\(true\)\]\)/.test(code), true);
  eq('asked 판정이 예·아니오일 때만 참', /const asked = zone === 'no' \|\| zone === 'yes';/.test(code), true);
  /* ⚠️ 「현재 조정」과 「취득 당시 조정」은 «다른 사실»이다 — 한 선택으로 묶으면 시점이
     엇갈리는 분은 정확한 조건을 넣을 수 없다 (260809 Codex P1).
     ★ 실측: 주택 수에 따라 «좌우하는 시점»이 다르다.
         1주택   → 취득 당시(비과세 거주요건)   FF=TF, FT=TT
         2·3주택 → 지금(다주택 중과)            FF=FT, TF=TT
     그래서 그 주택 수에서 실제로 세액을 움직이는 쪽만 사용자의 답으로 반영하고,
     나머지는 «세금이 적게 나오지 않는 쪽»으로 보수적으로 둔다. */
  eq('다주택은 «지금» 조정을 사용자의 답으로', /is_regulated_area: multi \? regulated : false/.test(code), true);
  eq('1주택은 «취득 당시» 조정을 사용자의 답으로', /regulated_at_acquisition: multi \? true : regulated/.test(code), true);
  eq('multi 판정이 주택 수 기준', /const multi = Number\(houses\) > 1;/.test(code), true);
  /* 엉뚱한 시점을 물으면 답을 받아도 세액이 안 바뀐다 — 질문 문구가 주택 수를 따라가야 한다 */
  eq('질문 문구가 주택 수에 따라 갈림',
    /'지금 조정대상지역인가요\?'/.test(code) && /'취득할 당시 조정대상지역이었나요\?'/.test(code), true);
  /* ⚠️ 주택 수를 바꾸면 조정지역 질문이 «다른 질문»이 된다 — 이전 답이 남으면
     「취득 당시 예」가 「지금 예」로 조용히 재해석된다 (260809 Codex P1) */
  eq('1주택↔다주택 전환 시 조정지역 답을 되돌림',
    code.indexOf("if (prevMulti !== nextMulti) setZone('no');") >= 0, true);
  /* ⚠️ 1주택은 조정지역을 «취득 당시» 기준으로 묻는다 — 취득일이 바뀌면 그 답은 더 이상
     유효하지 않다(지정 전후로 날짜를 옮기면 사실이 뒤집힌다). Codex P1.
     ⚠️ 이 검사는 «고치고도 안 만들어» 음성 대조군이 통과해 버려서 뒤늦게 넣었다. */
  eq('1주택에서 취득일을 바꾸면 조정지역 답을 되돌림',
    code.indexOf("if (Number(houses) === 1) setZone('no');") >= 0, true);
  /* ⚠️ 「모름」일 때 문구가 «실제로 보낸 조합»과 달랐다 — 1주택은 FF·FT 를 계산하면서
     「취득·양도 모두 조정」이라 적었다. 물어보는 시점 하나로만 말해야 한다. */
  eq('범위 설명이 «묻는 시점» 하나로 말함',
    /\{Number\(houses\) > 1 \? '지금' : '취득 당시'\} 조정대상지역이/.test(code), true);
  eq('「취득·양도 모두 조정」식 표현 없음', /취득·양도 모두 조정대상지역이면/.test(code), false);
  /* ⚠️ 요청은 언제나 주택이다 — 분양권·입주권은 세율도 공제도 다른데 주택 세액을 보여 주면 틀린 숫자다 */
  /* ⛔ 이 계산기는 «주택 전용»이다 (260809 사용자 결정 — 첫 질문 5지선다는 대다수에게 마찰).
     ⚠️ 그냥 지우면 안 된다: 실측(5억→9억·2023취득)에서 주택 0원 ↔ 입주권·상가·토지
        1억 3,581만 ↔ 분양권 2억 6,235만 원. 분양권 보유자가 「0원」을 보고 가는 일을
        막는 것은 «유도 문구의 위치»다 — 숫자보다 «먼저» 읽혀야 한다. */
  eq('요청은 언제나 주택', /property_type: '주택',/.test(code), true);
  eq('범위 고지가 존재', /<strong>아파트·주택<\/strong> 기준입니다/.test(code), true);
  /* ⚠️ 클래스 이름 두 개의 «등장 순서»만 보면, 이름을 바꿔치기했을 때 둘 다 -1 이 되어
     `-1 < -1` 이 false… 가 아니라 조용히 통과한다(음성 대조군이 잡았다).
     둘이 «실제로 존재»하는지 먼저 확인하고, 그다음 순서를 본다. */
  {
    const iScope = code.indexOf('기준입니다. 분양권·입주권·상가·토지는');
    const iAmt = code.indexOf('hcMoney(state.lo)');
    eq('범위 고지 문구·금액 출력이 둘 다 존재', iScope >= 0 && iAmt >= 0, true);
    eq('범위 고지가 «결과보다 앞»에 온다', iScope >= 0 && iAmt >= 0 && iScope < iAmt, true);
  }
  /* 고지를 지나친 분에게는 결과의 이 한 줄이 마지막 방어선이다 */
  eq('결과에도 「주택 기준」이 남음', /<strong>아파트·주택<\/strong> 기준 간이 추정/.test(code), true);
  eq('그 밖 유형은 정밀 계산기로 유도', /분양권·입주권·상가·토지는 세금이 크게 달라서/.test(code), true);
  /* 기본값 «아니요» (사용자 결정) — 대신 그 가정을 결과에 반드시 남긴다.
     조정지역인 분께는 «실제보다 낮은» 숫자를 먼저 보여 주게 되기 때문이다. */
  eq('조정지역 기본값이 아니요', /useHC\('no'\);/.test(code), true);
  /* ⚠️ 문자열 존재만 보면 가정 문구를 결과 «밖»으로 옮겨도 통과한다 — 완료 분기 안인지 본다 */
  {
    const done = code.slice(code.indexOf("{state.phase === 'done'"));
    eq('「아니요」로 계산했음을 «결과 안»에 고지',
      /state\.zoneAns === 'no'[\s\S]{0,200}조정대상지역이 «아닌» 것으로 계산했습니다/.test(done), true);
    eq('결과 카드에도 주택 기준 고지', /아파트·주택<\/strong> 기준 간이 추정/.test(done), true);
  }
  eq('뒤집힐 때의 크기를 알림', /맞다면 세금이 크게 올라갑니다/.test(code), true);
  /* ⚠️ 두 값을 함께 움직인 것은 «양 끝»만 잰다는 뜻이다 — 「아니면/맞으면」이라고 쓰면
     사실과 다르다(현재·취득당시는 별개 사실). 화면 문구가 그 한계를 밝히는지 본다. */
  /* ⚠️ 이 검사는 이름과 코드가 어긋나 있었다 — 지금 문구는 «묻는 시점 하나»로 좁힌 뒤
     일부러 「아니면/맞으면」을 쓴다. 금지해야 할 것은 «계산하지 않은 조합»을 말하는 것이다. */
  eq('계산하지 않은 조합을 말하지 않음', /취득·양도 모두 조정대상지역이면/.test(code), false);
  eq('설명이 «어느 시점을 물었는지»를 밝힘', /조정대상지역이$/m.test(code) || /'지금' : '취득 당시'/.test(code), true);
  eq('범위일 때 두 금액을 나란히 보여줌', /아니면 \{hcMoney\(state\.loIsReg \? state\.hi : state\.lo\)\}/.test(code) && /맞으면 \{hcMoney\(state\.loIsReg \? state\.lo : state\.hi\)\}/.test(code), true);
  eq('요청 바디에 필요경비=0', /expenses_total:\s*0/.test(code), true);
  /* 가정은 «숫자 뒤»가 아니라 라벨에서 함께 보여야 한다 — 숫자만 보고 닫는 사람이 가장 많다 */
  eq('라벨에 「오늘 양도 기준」', /오늘 양도 기준/.test(code), true);
  for (const k of ['필요경비', '거주기간', '감면']) {
    eq(`가정 고지: ${k} 미반영`, code.indexOf(k) >= 0, true);
  }
  eq('계측 부재가 동선을 막지 않음 (hcSafe)', /function hcSafe/.test(code) && /hcSafe\(\(\) => window\.jtTrackCta/.test(code), true);
  eq('「간이 추정」 명시', /간이 추정입니다/.test(code), true);
  /* ⚠️ `setRoute('calculators')` 를 부르고 있었는데 그런 라우트가 «없어서» 누르면 빈 화면이
     됐다 (260809 Codex P1). 계산기는 SPA 라우트가 아니라 별도 정적 페이지다.
     ⛔ 「존재하는 라우트로 보내는가」를 index.html 의 «실제» 분기 목록과 대조한다. */
  eq('정밀 계산기로 «실제 경로»로 이동', /window\.location\.href = '\/calculators\/'/.test(code), true);
  {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const routes = new Set([...html.matchAll(/route === '([a-z]+)'/g)].map(m => m[1]));
    const used = [...code.matchAll(/setRoute\('([a-z]+)'\)/g)].map(m => m[1]);
    const missing = used.filter(r => !routes.has(r));
    eq(`없는 라우트로 보내지 않음 (${missing.join('·') || '없음'})`, missing.length, 0);
    eq('계산기 정적 페이지 실존', fs.existsSync(path.join(__dirname, '..', 'calculators', 'index.html')), true);
  }
}

console.log('\n════ ④ 입력 파싱 — 조용히 틀린 값을 만들지 않는다 ════\n');
{
  /* 돈을 다루는 입력에서 가장 나쁜 것은 «거절»이 아니라 «조용히 틀린 값»이다.
     아래 고정값은 내가 자가 점검에서 «실제로» 잘못된 결과를 받은 입력들이다. */
  /* 파서만 떼어 실행한다 (React 의존 없음).
     ⚠️ `eval(body)` 는 안 된다 — 'use strict' 에서 eval 은 «자기 스코프»를 만들어 함수가
        밖으로 나오지 않는다. 그대로 두면 hcParse 가 undefined 라 검사 자체가 죽는다. */
  const body = raw.slice(raw.indexOf('const HC_MAX'), raw.indexOf('function JTHeroCalc'));
  const hcParse = new Function(body + '; return hcParse;')();
  const T = [
    ['5억', 500000000], ['5억 3000만', 530000000], ['530000000', 530000000],
    ['5.3억', 530000000], ['3000만', 30000000], ['5억원', 500000000], ['0', 0],
    /* 아래는 전부 «거절»이어야 한다 — 종전엔 조용히 값을 만들었다 */
    ['-5억', null], ['5억5억', null], ['5만억', null], ['3000만 5억', null],
    ['억', null], ['abc', null], ['1e9', null], ['０억', null],
    ['99999999999999999999', null],
  ];
  const wrong = T.filter(([i, w]) => String(hcParse(i)) !== String(w))
    .map(([i, w]) => `${i}→${hcParse(i)}(기대 ${w})`);
  eq(`파싱 ${T.length}건 전부 기대대로 (${wrong.join(' · ') || '어긋남 없음'})`, wrong.length, 0);
  /* ⚠️ 표시 함수는 «문자열 존재»만 보고 있었다 — 실제로 돌려 봐야 한다 (Codex P2).
     사용자가 보는 숫자를 만드는 코드라, 틀리면 그대로 틀린 금액이 화면에 나간다. */
  {
    /* ⚠️ 파일 앞부분을 통째로 쓰면 `const {useState} = React` 가 딸려 와 ReferenceError 다.
       React 에 의존하지 않는 «순수 함수 구간»만 잘라 쓴다 (파서 검사와 같은 방식). */
    const head = raw.slice(raw.indexOf('function hcSafe'), raw.indexOf('function JTHeroCalc'));
    const hcReadable = new Function(head + '; return hcReadable;')();
    const hcMoney = new Function(head + '; return hcMoney;')();
    const R = [
      [500000000, '5억 원'], [9000000000, '90억 원'], [530000000, '5억 3,000만 원'],
      [30000000, '3,000만 원'], [12345, '1만 2,345 원'], [0, ''], [null, ''],
    ];
    const rw = R.filter(([i2, w]) => hcReadable(i2) !== w).map(([i2, w]) => `${i2}→${hcReadable(i2)}(기대 ${w})`);
    eq(`읽기 보조 ${R.length}건 (${rw.join(' · ') || '어긋남 없음'})`, rw.length, 0);
    const M = [[0, '0원'], [27329500, '2,733만 원'], [230967000, '2억 3,097만 원'], [100000000, '1억 원']];
    const mw = M.filter(([i2, w]) => hcMoney(i2) !== w).map(([i2, w]) => `${i2}→${hcMoney(i2)}(기대 ${w})`);
    eq(`금액 표기 ${M.length}건 (${mw.join(' · ') || '어긋남 없음'})`, mw.length, 0);
  }
}

console.log('\n════ ⑤ 동작 안전 ════\n');
{
  /* ⚠️ 종전엔 `reqId.current` 라는 «글자»만 세고 있었다 — 가드를 `my > reqId.current` 로
     뒤집어도 통과했다 (260809 Codex 지적. 「검사한다고 적어 놓고 실제로는 안 보는」 것).
     방향까지 정확히 본다: 내 번호가 최신이 «아니면» 버려야 한다. */
  eq('완료 가드가 !== 로 최신 여부를 확인',
    (code.match(/if \(my !== reqId\.current\) return;/g) || []).length >= 2, true);
  eq('가드가 부등호로 뒤집혀 있지 않음', /if \(my [<>]=? reqId\.current\)/.test(code), false);
  /* 입력을 바꾸면 «진행 중인 요청»도 무효로 — 아니면 바뀐 입력 밑에 옛 세액이 그려진다 */
  eq('입력 변경이 진행 중 요청을 무효화', /const touched = \(fn\) => \(e\) => \{[\s\S]{0,60}reqId\.current \+= 1;/.test(code), true);
  /* 입력이 5개가 됐다 — 주택수·취득일·취득가·양도가·«조정대상지역» (260809 사용자 지시) */
  eq('모든 입력이 touched 를 거침', (code.match(/onChange=\{touched\(/g) || []).length, 5);
  /* 금액 표시가 «늘 낮게» 나오면 안 된다 — 버림이 아니라 반올림 */
  eq('만원 단위 반올림 (버림 아님)', /Math\.round\(v \/ 10000\)/.test(code), true);
  eq('범위를 크기로 정렬 (역순 표시 방지)', /\.sort\(\(a, b\) => a\.v - b\.v\)/.test(code) && /const lo = pair\[0\]\.v;/.test(code), true);
  eq('두 판정이 갈리면 단정하지 않음', /kind:\s*k0 === k1 \? k0 : 'mixed'/.test(code), true);
  eq('취득가 0 을 유효로 보지 않음', /acq > 0 && sale > 0/.test(code), true);
  eq('응답 없는 요청에 시간 제한', /AbortController/.test(code) && /hcSafe\(\(\) => ac && ac\.abort\(\)\)/.test(code) && /HC_TIMEOUT_MS/.test(code), true);
  eq('fetch 에 중단 신호 전달', /signal: ac \? ac\.signal : undefined/.test(code), true);
  eq('429 를 고장과 구분해 안내', /err\.status === 429/.test(code) && /잠시만 기다려 주세요/.test(code), true);
  /* ⚠️ 조기 return 경로(`my !== reqId.current`)가 clearTimeout «앞»에 있어서, 요청이
     교체되면 타이머가 남아 12초 뒤 끝난 요청을 abort 했다 — 자가 점검에서 찾았다.
     어느 경로로 빠져나가도 정리되도록 finally 로 옮겼다. */
  eq('타이머 정리를 finally 에서', /\} finally \{[\s\S]{0,120}clearTimeout\(timer\)/.test(code), true);
  eq('clearTimeout 이 try·catch 안에 흩어져 있지 않음',
    (code.match(/clearTimeout\(timer\)/g) || []).length, 1);
  /* 시간초과와 진짜 고장은 «사용자가 할 일»이 다르다 — 다시 누르면 되는가, 전화해야 하는가 */
  eq('시간초과를 따로 안내', /err\.name === 'AbortError'/.test(code) && /응답이 늦습니다/.test(code), true);
  /* ⚠️ 아래 다섯은 Codex 3차 P1 — 전부 «사용자가 틀린 숫자를 보거나 멈추는» 경로다 */
  eq('양도일을 클릭 시점에 구함 (자정 넘김)', /const reqDate = kstToday\(\);/.test(code) && /transfer_date: reqDate/.test(code), true);
  eq('캐시 키에 날짜·조정지역', /const cacheKey = \[houses, acqDate, acq, sale, reqDate, zone\]/.test(code), true);
  eq('입력 변경이 진행 중 요청을 «취소»', /if \(acRef\.current\) acRef\.current\.abort\(\)/.test(code), true);
  /* ⚠️ 게이트가 「acRef 를 쓰는가」만 보고 「선언했는가」를 안 봤다 — 선언을 빠뜨린 채
     쓰기만 하는 코드를 통과시켰고, 실제로 ReferenceError 로 입력 핸들러 전체가 죽어
     «버튼이 영영 안 눌리는» 상태가 됐다 (260809 자가 발견). 참조 전에 선언을 확인한다. */
  for (const ref of ['reqId', 'outRef', 'acRef']) {
    const decl = new RegExp('const ' + ref + ' = useHCRef\\(');
    eq(`${ref} 를 «선언»하고 쓴다`, decl.test(code), true);
  }
  /* React 훅 밖에서 만든 ref 는 렌더마다 초기화된다 — useHCRef(=useRef) 인지도 본다 */
  eq('ref 3개가 모두 useHCRef', (code.match(/= useHCRef\(/g) || []).length >= 3, true);
  /* ⚠️ ref «호출»만 보고 그 훅 자체의 정의는 안 봤다 — 14행 한 줄이 사라지면
     `useHC is not defined` 로 계산기가 통째로 사라지는데 게이트는 통과한다 (Codex P1).
     (전 JSX 대상 「정의 없는 참조」 검사는 tests_jsx_smoke.js 에도 별도로 있다) */
  eq('useHC·useHCRef 를 React 에서 꺼내 정의', /const \{ useState: useHC, useRef: useHCRef \} = React;/.test(code), true);
  for (const name of ['hcSafe', 'hcMoney', 'hcParse', 'hcCache', 'HC_CACHE_MAX', 'HC_MAX', 'HC_ENGINE']) {
    /* 백슬래시가 유실되는 사고가 이 저장소에서 세 번 있었다 — 조립 정규식 대신 «포함»으로 본다 */
    const declared = ['function ' + name, 'const ' + name, 'let ' + name, 'var ' + name]
      .some((d) => code.indexOf(d) >= 0);
    eq(`${name} 를 «선언»하고 쓴다`, declared, true);
  }
  /* 입력을 바꾸면 화면도 idle 로 돌아와야 한다 — 이 줄이 빠지면 loading 에 갇혀
     버튼이 영영 비활성이 된다 (Codex P1) */
  eq('입력 변경이 화면을 idle 로 되돌림',
    /const touched = \(fn\) => \(e\) => \{[\s\S]{0,220}setState\(\{ phase: 'idle' \}\);/.test(code), true);
  /* 한쪽이 먼저 실패해도 «남은 요청»을 끊는다 — 안 끊으면 잔류 요청이 한도를 태운다 */
  eq('finally 에서 남은 요청도 abort', /\} finally \{[\s\S]{0,320}hcSafe\(\(\) => \{ if \(ac\) ac\.abort\(\); \}\)/.test(code), true);
  /* 세법 날짜는 한국 기준 — 브라우저 시간대를 따라가면 해외에서 다른 날이 간다 */
  eq('양도일을 KST 로 고정', /Date\.now\(\) \+ 9 \* 3600 \* 1000/.test(code) && /getUTCFullYear/.test(code), true);
  eq('취득일 max 가 렌더에 굳지 않음', /onFocus=\{\(\) => setMaxDate\(kstToday\(\)\)\}/.test(code), true);
  eq('AbortController 없어도 끝남 (race)', /await Promise\.race\(\[/.test(code) && /timeout,/.test(code), true);
  eq('형태 검증 «뒤»에 캐시 저장',
    code.indexOf("throw new Error('shape')") < code.indexOf('hcCache.set(cacheKey'), true);
  eq('범위 설명이 «출처»를 따라감 (낮은 쪽=비조정 가정 없음)',
    /loIsReg \? state\.hi : state\.lo/.test(code) && /loIsReg \? state\.lo : state\.hi/.test(code), true);
  eq('타임아웃이 12초', /HC_TIMEOUT_MS = 12000/.test(code) && /}, HC_TIMEOUT_MS\)/.test(code), true);
  eq('같은 입력 재계산은 저장분 사용 (분당 40회 한도)', /hcCache\.get\(cacheKey\)/.test(code), true);
  eq('엔진 오류 시 사용자에게 알림 + 연락 수단', /phase: 'error'/.test(code) && /02-554-6405/.test(code), true);
  eq('응답 형태가 다르면 오류로 처리', /typeof c\.총세부담 !== 'number'/.test(code), true);
  /* ⚠️ scrollIntoView 는 히어로의 overflow:hidden 때문에 «아무 일도 안 한다».
     behavior:'smooth' 도 무시되는 환경이 있어 scrollY 가 0 그대로였다(실측). */
  eq('결과 스크롤에 scrollIntoView 를 쓰지 않음', /scrollIntoView/.test(code), false);
  eq('스크롤 위치를 직접 대입', /scrollingElement[\s\S]{0,80}scrollTop/.test(code), true);
  eq('라벨-입력 연결 (htmlFor 5개)', (code.match(/htmlFor=\"hc-/g) || []).length, 5);
  eq('결과를 보조기술에 알림 (aria-live)', /aria-live="polite"/.test(code), true);
}

console.log('\n════ ⑥ 히어로 배치 — 첫 화면에서 보여야 한다 ════\n');
{
  /* 안 2 의 목적이 「먼저 숫자부터」인데 계산기가 접히면 목적이 사라진다.
     실측으로 1280×720 에서 top 955px 였다 → 세로 여유 없는 화면 압축 규칙이 있어야 한다. */
  const css = fs.readFileSync(SRC('redesign.css'), 'utf8');
  eq('세로 여유 없는 화면 압축 규칙 존재', /@media \(max-height: 900px\)/.test(css), true);
  eq('아주 낮은 화면 추가 압축', /@media \(max-height: 720px\)/.test(css), true);
  /* ⛔ 슬로건·부제는 줄이지 않는다 — 브랜드 문장을 지키는 것이 안 2 를 고른 이유다 */
  const hSeg = css.slice(css.indexOf('@media (max-height: 900px)'));
  eq('세로 압축이 슬로건 크기를 건드리지 않음', /max-height[\s\S]{0,400}__slogan\s*\{[^}]*font-size/.test(hSeg), false);
  eq('모바일에서 입력 16px (iOS 자동확대 방지)', /font-size:\s*16px\s*!important/.test(css), true);
  const home = fs.readFileSync(SRC('Home.jsx'), 'utf8');
  eq('히어로에 계산기가 붙어 있음', /window\.JTHeroCalc/.test(home), true);
  eq('히어로가 setRoute 를 받음', /function JTBrandMoment\(\{ setRoute \}\)/.test(home), true);
  const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const iHero = idx.indexOf('HeroCalc.jsx');
  const iHome = idx.indexOf('src/Home.jsx');
  eq('HeroCalc 가 Home 보다 «먼저» 로드 (window.JTHeroCalc 선행)', iHero >= 0 && iHero < iHome, true);
  eq('JTBrandMoment 호출부가 setRoute 를 넘김', /<JTBrandMoment setRoute=\{setRoute\} \/>/.test(idx), true);
}

console.log('\n════════════════════');
console.log('\n════ ⑦ 로고 — CI 가이드 준수 ════\n');
{
  /* ⛔ CI 가이드(HEAZ, 2026) 금지사항: 배치 변경·기울기·비율 변경.
     Primary Logo 는 «심볼 + 제이티 세무법인 + JT TAX CORP.» 가 하나로 잠긴 덩어리다.
     ★ 실제 위반 (260809, 사용자 지적) — 심볼만 SVG 로 그리고 회사명을 Pretendard 800,
       영문을 모노스페이스 자간 .35em 으로 «다시 조판»했다. 가이드의 헤드라인 서체는
       Sandoll 격동고딕2 이고 자간·굵기도 공식 락업과 달랐다.
     → 공식 자산을 «그대로» 쓰는지, 손조판이 돌아오지 않았는지 검사한다. */
  const home = fs.readFileSync(SRC('Home.jsx'), 'utf8');
  eq('공식 Primary 로고 자산을 사용', /logo_primary_white\.png/.test(home), true);
  eq('로고 파일 실존', fs.existsSync(path.join(__dirname, 'assets', 'logo_primary_white.png')), true);
  {
    const css = fs.readFileSync(SRC('redesign.css'), 'utf8');
    const rule = (css.match(/\.jt-bm-primary\{[^}]*\}/) || [''])[0];
    eq('로고 너비를 강제하지 않음 (비율 보존)', /width:\s*auto/.test(rule), true);
    eq('로고에 변형(transform) 없음', /transform:/.test(rule), false);
  }
  const a = home.indexOf('jt-brandmoment__logowrap');
  const b = home.indexOf('jt-brandmoment__slogan');
  const hero = a >= 0 && b > a ? home.slice(a, b) : '';
  eq('로고 영역 추출', hero.length > 0, true);
  /* 손조판이 돌아오면 잡는다 — 회사명·영문을 «본문 서체»로 다시 쓰는 것이 그 신호다 */
  eq('로고 영역에 회사명 손조판 없음', />제이티 세무법인</.test(hero), false);
  eq('로고 영역에 JT TAX CORP. 손조판 없음', />JT TAX CORP/.test(hero), false);
  eq('심볼만 따로 그리는 SVG 없음', /jt-bm-logosvg/.test(home), false);
  eq('로고 alt 가 락업 내용을 담음', /alt=\"제이티 세무법인 JT TAX CORP\./.test(home), true);
  /* CI: 복잡한 패턴·이미지 위 금지 — 로고 영역은 단색이어야 한다(정숙 영역).
     파일 안에서 «끄는 규칙»과 «켜는 규칙»이 싸운 적이 있어 마지막 판정을 본다. */
  {
    const css = fs.readFileSync(SRC('redesign.css'), 'utf8');
    const last = css.lastIndexOf('.jt-brandmoment::before');
    const tail = last >= 0 ? css.slice(last, last + 320) : '';
    /* 빛은 «되살렸다»(사용자 결정) — 대신 로고 판독을 방해하지 않는 선을 지킨다:
       최대 불투명도 .06 이하 · 등장 4s 이상 · 동작 최소화 설정이면 애니메이션 없음 */
    /* ⚠️ 처음엔 파일 «전체»에서 밝은 rgba 를 찾아, 로고와 무관한 규칙(.18)까지 잡아
       위양성이 났다. 로고 배경 블록 «안»만 본다. */
    const glow = ([...css.matchAll(/\.jt-brandmoment::before\{[^}]*\}/g)]
      .map((m) => m[0]).find((b) => /radial-gradient/.test(b))) || '';
    eq('로고 뒤 빛이 은은함 (불투명도 .06 이하)',
      /rgba\(255,255,255,\.06\)/.test(glow) && !/rgba\(255,255,255,\.(?:0[7-9]|[1-9]\d)\)/.test(glow), true);
    eq('로고 뒤 빛이 천천히 (4s 이상)', /jt-bm-glow-in 4\.5s/.test(css), true);
    eq('동작 최소화 시 애니메이션 없음', /prefers-reduced-motion[\s\S]{0,220}animation: none !important/.test(css), true);
    /* ⚠️ :has() 를 모르는 브라우저에서는 애니메이션이 안 걸린다 — 기본 opacity 가 0 이면
       그 브라우저에서 빛이 «영영 안 뜬다». 기본을 보이는 값으로 둔다. */
    eq('빛 기본값이 보이는 값 (:has() 미지원 폴백)', /opacity: \.45;/.test(glow), true);
    eq('빛이 클릭을 가로채지 않음', /pointer-events: none/.test(glow), true);
    eq('빛이 콘텐츠 뒤에 (z-index 0)', /z-index: 0/.test(glow), true);
    /* ⚠️ ::before 만 z-index:0 이라고 콘텐츠가 위인 게 «아니다» — 일반 흐름 요소는
       스택 컨텍스트에 없어서 positioned 요소 아래로 갈 수 있다. inner 를 명시적으로 올린다.
       (이 규칙을 옛 블록 삭제 때 함께 날렸던 적이 있다) */
    eq('브랜드 콘텐츠가 빛보다 위',
      /\.jt-brandmoment__inner\{[^}]*position: relative[^}]*z-index: 1/.test(css), true);
  }
}

console.log(`히어로 계산기 게이트 실패 ${fail}건`);
process.exit(fail ? 1 : 0);

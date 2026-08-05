## 1. 작업 요약

P2 1건 발견: 주소 본문의 가운뎃점도 공백으로 훼손됩니다. 문자클래스 범위 결함은 없습니다.

## 2. 지적 사항

- **P2** — [ReportReform2026.jsx:645](D:\jt-data\jttax-cta\project\src\ReportReform2026.jsx:645)
  재현: `서울 A·B아파트 101동 601호` → `addr: "서울 A B아파트"`, `dong: "101"`, `ho: "601"`
  마지막 정규화가 분리용 `·`뿐 아니라 주소 본문의 U+00B7까지 모두 공백으로 바꿉니다.
  수정안: `pick()`에서 단위 앞 구분자 `·`만 공백으로 소비하고, 마지막 정규화 `/[,，\s]+/g`에서는 `·`를 제외하십시오. 회귀 테스트로 `A·B아파트` 보존 케이스를 추가하십시오.

- **P3** — [tests_rf_addr.js:55](D:\jt-data\jttax-cta\project\tests_rf_addr.js:55)
  실제 `chk()` 수는 **30 → 36건(추가 6건)**입니다. 요청에 적힌 “30 → 37”, “새 테스트 7건”과 맞지 않습니다.
  새 6건의 기댓값은 맞습니다. 특히 `정릉로 305 101동·601호` → `addr: "정릉로 305"`, `dong: "101"`, `ho: "601"`이 맞습니다. 위 P2 보존 테스트를 추가하면 37건이 됩니다.

## 3. 재발 방지

`서울 A·B아파트 101동 601호` → `addr: 서울 A·B아파트` 회귀 테스트를 추가해야 합니다.

## 4. 검증 결과

- `RF_D`: ASCII `U+0030–0039`, 전각 `U+FF10–FF19` 정확.
- `RF_L`: ASCII `A–Z/a–z`, 전각 `U+FF21–FF3A/U+FF41–FF5A` 정확.
- `RF_HY`는 런타임 정규식에서 `[－\-]`가 되어 하이픈이 이스케이프됩니다. 의도치 않은 범위 없음.
- `RF_SEP`의 실제 가운뎃점은 UTF-8 `C2 B7`, 즉 **U+00B7 MIDDLE DOT**입니다. 한국어 명칭도 `가운뎃점`입니다. U+318D `ㆍ`는 별개인 **HANGUL LETTER ARAEA**이므로 이 수정이 헛것은 아닙니다. [Unicode CLDR](https://unicode.org/cldr/charts/47/annotations/cjk.html), [Unicode names list](https://www.unicode.org/charts/nameslist/n_3130.html)
- `node project/tests_rf_addr.js`는 현재 환경에서 실행 불가: `node.exe` 실행이 sandbox에 의해 `Access is denied`로 차단됨.

## 5. 미확인 사항

`RfAddrLookup`의 실제 조회 API 연동은 실행 권한 제한으로 확인하지 못했습니다.
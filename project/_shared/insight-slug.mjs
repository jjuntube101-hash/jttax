// project/_shared/insight-slug.mjs
//
// 인사이트 원고(.md) 파일명·frontmatter 에서 slug 를 유도한다.
//
// ⚠️ 왜 파일로 뺐나 (260808 Codex P2a P1):
//   build-insights.mjs 는 `2026-06-14-foo.md` 의 날짜 접두사를 «떼고» slug 를 만드는데,
//   build-sitemap.mjs 는 같은 계산을 따로 구현하면서 그 처리를 빠뜨렸다.
//   두 곳의 규칙이 어긋나면 해당 글의 sitemap lastmod 가 조용히 누락된다 —
//   현재 원고는 전부 slug 프론트매터가 있어 «아직» 드러나지 않았을 뿐이다.
//   같은 개념을 두 곳에서 계산하지 않는다.

/** 파일명(.md 포함)과 frontmatter 의 slug 값으로 최종 slug 를 만든다. */
export function insightSlug(filename, frontmatterSlug) {
  if (frontmatterSlug) return String(frontmatterSlug);
  return filename.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

// Shared editorial presentation. Legal verification is opt-in per revised article.
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function readingTools(a) {
  const headings = [];
  const html = a.html.replace(/<h2>(.*?)<\/h2>/g, (_, title) => {
    const id = `section-${headings.length + 1}`;
    headings.push({ id, title: title.replace(/<[^>]*>/g, '') });
    return `<h2 id="${id}">${title}</h2>`;
  });
  const toc = headings.length < 3 ? '' : `<nav class="jt-ed-toc" aria-label="이 글의 목차"><strong>이 글에서 확인할 것</strong><ol>${headings.map(h => `<li><a href="#${h.id}">${escapeHtml(h.title)}</a></li>`).join('')}</ol></nav>`;
  return { html, toc };
}

export function hero(a) {
  if (!a.hero) return '';
  return `<figure class="jt-ed-hero"><img src="${escapeHtml(a.hero)}" width="1536" height="1024" alt="${escapeHtml(a.heroAlt)}" fetchpriority="high" decoding="async"><figcaption>${escapeHtml(a.heroCaption)}</figcaption></figure>`;
}

export const editorialCss = `
.jt-editorial{max-width:800px;margin:0 auto;padding:48px 24px 64px;word-break:keep-all;overflow-wrap:anywhere;font-size:17px;line-height:1.9;color:#263247}
.jt-editorial h1{font-size:clamp(30px,4.5vw,44px);line-height:1.3;letter-spacing:-.045em;color:#11213e;margin:20px 0}
.jt-editorial h2{font-size:clamp(23px,3vw,28px);line-height:1.45;letter-spacing:-.025em;color:#142b52;margin:54px 0 18px;padding:0;border:0;scroll-margin-top:24px}
.jt-editorial h3{font-size:20px;line-height:1.5;margin:28px 0 12px;color:#142b52}
.jt-editorial p{line-height:1.9;margin:18px 0}.jt-editorial li{margin:8px 0;line-height:1.8}
.jt-editorial a{color:#164bb0;text-underline-offset:4px}.jt-editorial a:focus-visible{outline:3px solid #e8843c;outline-offset:4px}
.jt-ed-kicker{color:#164bb0;font-size:12px;letter-spacing:.12em;font-weight:750}.jt-ed-deck{font-size:19px;color:#546177}
.jt-ed-byline{display:flex;flex-wrap:wrap;gap:6px 18px;padding:18px 0;border-top:1px solid #dfe5ee;font-size:13px;color:#56647a}
.jt-ed-hero{margin:24px 0 30px}.jt-ed-hero img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;border-radius:18px}
.jt-ed-hero figcaption{font-size:12px;color:#637083;margin-top:8px}
.jt-ed-toc{padding:22px 26px;background:#eff4ff;border:1px solid #d7e4ff;border-radius:14px;margin:28px 0 38px;font-size:15px}
.jt-ed-toc strong{color:#163c82}.jt-ed-toc ol{padding-left:22px;margin:12px 0 0}.jt-ed-toc li{margin:5px 0}
.jt-ed-summary{background:#163c82;color:#fff;border-radius:18px;padding:24px 28px;margin:30px 0}
.jt-ed-summary strong{color:inherit}.jt-ed-summary p{margin:8px 0}.jt-ed-summary ul{padding-left:20px;margin:8px 0}
.jt-ed-note{border-left:4px solid #dc7430;background:#fff4e9;border-radius:0 12px 12px 0;padding:18px 22px;margin:24px 0;color:#6e3b18;font-size:15px}
.jt-ed-diagram{border:1px solid #dbe3f0;background:#f5f8ff;border-radius:18px;padding:24px;margin:28px 0}
.jt-ed-diagram>strong{display:block;color:#183d7d;font-size:19px;margin-bottom:18px}
.jt-ed-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.jt-ed-cell{background:white;border:1px solid #dbe3f0;border-top:4px solid #3765cf;border-radius:10px;padding:18px;font-size:14px;line-height:1.75}
.jt-ed-cell strong{display:block;font-size:17px;color:#193b76;margin-bottom:9px}.jt-ed-cell:last-child{border-top-color:#dc7430}
.jt-ed-caption{font-size:13px;color:#58677e;margin:14px 0 0!important}
.jt-editorial .jt-ins-tbl td+td,.jt-editorial .jt-ins-tbl th+th{text-align:left}
.jt-ed-related{background:#eff4ff;padding:22px 26px;border-radius:14px;margin:38px 0}.jt-ed-related strong{display:block;color:#193b76}
.jt-editorial .jt-btn--primary{background:#174cb5;color:white}.jt-editorial .jt-btn--outline{color:#174cb5}
@media(max-width:600px){.jt-editorial{padding:30px 20px 48px;font-size:16px}.jt-ed-grid{grid-template-columns:1fr}.jt-ed-cell{padding:16px}.jt-ed-diagram{padding:18px}.jt-ed-summary{padding:20px}.jt-ed-toc{padding:20px}.jt-ed-hero img{border-radius:12px}}
`;

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const menu=[['/about/','제이티 소개'],['/services/','업무분야'],['/calculators/','세무도구'],['/insights/','인사이트'],['/desk/','법무사·중개사'],['/#/contact','상담 안내']];
const links=menu.map(([h,t])=>`<a href="${h}">${t}</a>`).join('');
const header=`<header class="jt-renewal-header"><a class="jt-renewal-skip" href="#content">본문으로 바로가기</a><a class="jt-renewal-brand" href="/#/" aria-label="제이티 세무법인 홈"><img src="/project/assets/logo_symbol.png" width="46" height="32" alt=""><span>제이티 세무법인</span></a><nav class="jt-renewal-desktop" aria-label="주 메뉴">${links}</nav><a class="jt-renewal-book" href="/#/booking" onclick="jtTrackCta('booking','nav')">상담 신청</a><details class="jt-renewal-menu"><summary aria-label="주 메뉴 열기">메뉴</summary><nav aria-label="모바일 주 메뉴">${links}<a href="/#/booking">상담 신청</a></nav></details></header>`;
const mobile=`<nav class="jt-renewal-mobile-cta" aria-label="빠른 상담"><a href="tel:02-554-6405" onclick="jtTrackCta('call','sticky')">전화</a><a href="https://pf.kakao.com/_CcxlJG" target="_blank" rel="noopener" onclick="jtTrackCta('kakao','sticky')">카카오톡</a><a href="/#/booking" onclick="jtTrackCta('booking','sticky')">상담 신청 →</a></nav>`;
const styles=['renewal.css','renewal-pages.css','renewal-flow.css','renewal-motion.css','renewal-static.css'];
const files=[];
async function walk(p){for(const d of await fs.readdir(p,{withFileTypes:true})){const f=path.join(p,d.name);if(d.isDirectory())await walk(f);else if(f.endsWith('.html'))files.push(f);}}
for(const name of ['about','services','experts','insights','calculators','acquisition-tax','desk'])await walk(path.join(root,name));
for(const name of ['index.html','consult.html','creators.html'])files.push(path.join(root,name));
const sharedStyleVersion=(await fs.readFile(path.join(root,'index.html'),'utf8')).match(/styles\.css\?v=(\d+)/)[1];
const evidence=[];
for(const f of files){let html=await fs.readFile(f,'utf8');const rel=path.relative(root,f).replaceAll('\\','/');const home=rel==='index.html';
 html=html.replace(/project\/src\/styles\.css\?v=\d+/g,'project/src/styles.css?v='+sharedStyleVersion);
 const beforeMain=html.match(/<(main|article)\b[\s\S]*?<\/\1>/i)?.[0]; const beforeH1=(html.match(/<h1\b/gi)||[]).length;
 html=html.replace(/\s*<link\b[^>]*href="[^"]*\/renewal(?:-pages|-flow|-motion|-static)?\.css[^>]*>/g,'');
 html=html.replace('</head>',styles.filter(n=>!home||n!=='renewal-static.css').map(n=>`<link rel="stylesheet" href="/project/src/${n}?v=6">`).join('\n')+'\n</head>');
 if(!home){
  // The first generated header must be navigation outside main; fail closed otherwise.
  const match=html.match(/<header\b[\s\S]*?<\/header>/i);
  if(!match || match.index>html.search(/<(main|article)\b/i) || /<h1\b/i.test(match[0]))throw new Error('Unexpected shell; refuse header replacement: '+rel);
  html=html.replace(match[0],header);
  html=html.replace(/\s*<script src="\/project\/src\/renewal-static\.js[^>]*><\/script>/g,'').replace('</body>','<script src="/project/src/renewal-static.js?v=1" defer></script>\n</body>');
  html=html.replace(/<body\b[^>]*>/i,'<body class="jt-renewal-static">');
  html=html.replace(/\s*<nav class="jt-renewal-mobile-cta"[\s\S]*?<\/nav>/g,'').replace('</body>',mobile+'\n</body>');
  html=html.replace(/<footer\b([^>]*)>([\s\S]*?)<\/footer>/i,(_all,attrs,body)=>{
   body=body.replace(/<nav class="jt-renewal-footer-links"[\s\S]*?<\/nav>/g,'');
   return `<footer class="jt-renewal-footer">${body}<nav class="jt-renewal-footer-links" aria-label="이용 안내">${links}<a href="/#/privacy">개인정보처리방침</a><a href="/#/terms">이용약관</a></nav></footer>`;
  });
  if(beforeMain!==html.match(/<(main|article)\b[\s\S]*?<\/\1>/i)?.[0])throw new Error('Main content altered: '+rel);
 }
 if(beforeH1!==(html.match(/<h1\b/gi)||[]).length)throw new Error('Heading lost: '+rel);
 await fs.writeFile(f,html);evidence.push({path:rel,h1:beforeH1,mainPreserved:true});
}
const metadata={};
for(const name of await fs.readdir(path.join(root,'project/insights'))){if(!name.endsWith('.md'))continue;const raw=await fs.readFile(path.join(root,'project/insights',name),'utf8');const block=raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);if(!block)continue;const m={};for(const line of block[1].split(/\r?\n/)){const i=line.indexOf(':');if(i>0)m[line.slice(0,i)]=line.slice(i+1).trim().replace(/^"|"$/g,'');}const slug=m.slug||name.replace(/^\d{4}-\d{2}-\d{2}-/,'').replace(/\.md$/,'');metadata[slug]=Object.fromEntries(['hero','heroAlt','heroCaption','updated','lawChecked'].filter(k=>m[k]).map(k=>[k,m[k]]));}
await fs.writeFile(path.join(root,'project/dist/insight-meta.js'),'window.JT_INSIGHT_META = '+JSON.stringify(metadata)+';\n');
await fs.writeFile(path.join(root,'project/dist/renewal-shell-evidence.json'),JSON.stringify(evidence,null,2));
console.log(`Renewal shell: ${files.length} pages; main and h1 preserved; metadata ${Object.keys(metadata).length} articles`);




// This release changes commercial copy and portraits; preserve article/engine dates.
const renewalDate='2026-10-22';
const sitemapPath=path.join(root,'sitemap.xml');
let sitemap=await fs.readFile(sitemapPath,'utf8');
sitemap=sitemap.replace(/<url>[\s\S]*?<\/url>/g,block=>{
 const loc=block.match(/<loc>([^<]+)<\/loc>/)?.[1];
 if(!loc)return block;
 const pathname=new URL(loc).pathname;
 if(!(pathname==='/'||/^\/(about|services|experts)(\/|$)/.test(pathname)||['/consult.html','/creators.html','/acquisition-tax/'].includes(pathname)))return block;
 return /<lastmod>/.test(block)?block.replace(/<lastmod>[^<]*<\/lastmod>/,'<lastmod>'+renewalDate+'</lastmod>'):block.replace('</loc>','</loc><lastmod>'+renewalDate+'</lastmod>');
});
await fs.writeFile(sitemapPath,sitemap);

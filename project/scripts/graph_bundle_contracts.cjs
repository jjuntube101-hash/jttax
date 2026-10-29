/* Supplement Graphify's code graph with conservative global-bundle AST bindings.
 * No semantic inference, source mutation, automatic module removal or runtime claim.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),parser=require('@babel/parser');
const {pathToFileURL}=require('url');
async function buildOverlay(graphPath,outputPath){
 const root=path.resolve(__dirname,'..'),src=path.join(root,'src'),{ORDER}=await import(pathToFileURL(path.join(__dirname,'build_bundle.mjs')).href);
 const graph=JSON.parse(fs.readFileSync(graphPath,'utf8')),nodes=graph.nodes,defs=new Map(),units=[],hashes={};
 const idName=n=>n.type==='Identifier'?[n.name]:n.type==='ObjectPattern'?n.properties.flatMap(p=>idName(p.value||p.argument)):n.type==='ArrayPattern'?n.elements.filter(Boolean).flatMap(idName):n.type==='AssignmentPattern'?idName(n.left):n.type==='RestElement'?idName(n.argument):[];
 for(const file of ORDER){const bytes=fs.readFileSync(path.join(src,file));hashes[file]=crypto.createHash('sha256').update(bytes).digest('hex');const text=bytes.toString('utf8'),ast=parser.parse(text,{sourceType:'script',plugins:['jsx']});
  for(const n of ast.program.body){let name,fn;if(n.type==='FunctionDeclaration'){name=n.id?.name;fn=n;}else if(n.type==='VariableDeclaration')for(const d of n.declarations)if(d.id.type==='Identifier'&&['ArrowFunctionExpression','FunctionExpression'].includes(d.init?.type)){const entry={file,name:d.id.name,fn:d.init,line:d.loc.start.line};units.push(entry);defs.set(entry.name,[...(defs.get(entry.name)||[]),entry]);}
   if(fn&&name){const entry={file,name,fn,line:n.loc.start.line};units.push(entry);defs.set(name,[...(defs.get(name)||[]),entry]);}}
 }
 const findId=(file,name)=>{const hits=nodes.filter(n=>n.source_file===file&&(n.label===name+'()'||n.label===name));return hits.length===1?hits[0].id:null;};
 const edges=[],unresolved=[],seen=new Set();
 for(const u of units){const locals=new Set(u.fn.params.flatMap(idName));
  function bindings(n){if(!n||typeof n!=='object')return;if(n!==u.fn&&/Function/.test(n.type||'')){if(n.id)locals.add(n.id.name);return;}if(n.type==='VariableDeclarator')idName(n.id).forEach(k=>locals.add(k));for(const v of Object.values(n))if(Array.isArray(v))v.forEach(bindings);else if(v&&typeof v==='object')bindings(v);}
  bindings(u.fn);
  function calls(n){if(!n||typeof n!=='object')return;if(n!==u.fn&&/Function/.test(n.type||''))return;
   if(n.type==='CallExpression'&&n.callee.type==='Identifier'&&!locals.has(n.callee.name)){const candidates=defs.get(n.callee.name)||[];if(candidates.length===1&&candidates[0].file!==u.file){const target=candidates[0],a=findId(u.file,u.name),b=findId(target.file,target.name);if(a&&b){const key=a+'|'+b+'|'+n.loc.start.line;if(!seen.has(key)){seen.add(key);edges.push({source:a,target:b,relation:'calls',confidence:'EXTRACTED',context:'bundle_global_binding',source_file:u.file,source_location:'L'+n.loc.start.line,evidence:{method:'unique top-level function binding; local parameters/declarations excluded',caller_sha256:hashes[u.file],target_file:target.file,target_line:target.line,target_sha256:hashes[target.file]},runtime_verified:false});}}else unresolved.push({caller:u.name,target:target.name,file:u.file,reason:'Graphify symbol missing or ambiguous; no edge fabricated'});}}
   for(const v of Object.values(n))if(Array.isArray(v))v.forEach(calls);else if(v&&typeof v==='object')calls(v);}
  calls(u.fn);
 }
 const output={schema_version:'bundle-global-ast-overlay/1',graph_source:graphPath,graph_sha256:crypto.createHash('sha256').update(fs.readFileSync(graphPath)).digest('hex'),source_hashes:hashes,edges,unresolved,
  duplicate_global_symbols:[...defs].filter(([,v])=>v.length>1).map(([name,v])=>({name,files:v.map(x=>x.file)})),scope:'Conservative static global-function bindings only; dynamic window members/closures and runtime branch validity are not complete.'};
 fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');
 if(!edges.some(e=>e.source_file==='ReportAcquisition.jsx'&&e.evidence.target_file==='ReportCGT.jsx'))throw Error('Known cross-file acquisition formatter binding was not modeled');
 console.log(JSON.stringify({edges:edges.length,source_files:ORDER.length,unresolved:unresolved.length,output:outputPath}));return output;
}
module.exports={buildOverlay};
if(require.main===module){const [graph,out]=process.argv.slice(2);if(!graph||!out)throw Error('Usage: node project/scripts/graph_bundle_contracts.cjs GRAPH_JSON OUTPUT_JSON');buildOverlay(path.resolve(graph),path.resolve(out)).catch(e=>{console.error(e);process.exitCode=1;});}

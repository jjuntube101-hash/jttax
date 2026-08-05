/* index.html 의 `?v=` 와 각 jsx 의 sha256 을 기록해 둔다.
   .jsx 를 고치고 index.html 의 버전을 올린 «뒤»에 실행한다 — 그러면
   tests_asset_versions.js 가 「고쳤는데 버전을 안 올린」 다음 번을 잡아 준다. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const OUT = path.join(HERE, '..', 'asset_versions.json');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const rec = {};
const re = /src="(project\/src\/([A-Za-z0-9_.-]+\.jsx))\?v=(\d+)"/g;
let m;
while ((m = re.exec(html)) !== null) {
  rec[m[1]] = {
    v: m[3],
    sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, m[1]))).digest('hex'),
  };
}
const n = Object.keys(rec).length;
if (n < 10) throw new Error(`index.html 에서 ${n}개만 찾았습니다 — 구조를 확인하세요.`);
fs.writeFileSync(OUT, JSON.stringify(rec, null, 2) + '\n', 'utf8');
console.log(`✓ asset_versions.json 갱신 — jsx ${n}개`);

// 从 clippyjs 模块里抽出精灵图集与动画元数据，落成独立文件。
const fs = require('fs');
const path = require('path');

const SRC = 'C:/Users/Tom-G/WorkBuddy/运维/clippy-demo/src/clippy/agents/clippy';
const OUT = 'D:/pro/_clippy_work';
fs.mkdirSync(OUT, { recursive: true });

// 1) 元数据：把 ESM 的对象字面量抓出来求值
const agentSrc = fs.readFileSync(path.join(SRC, 'agent.mjs'), 'utf8');
const objStart = agentSrc.indexOf('{', agentSrc.indexOf('var agent_default = '));
let depth = 0;
let end = -1;
for (let i = objStart; i < agentSrc.length; i++) {
  if (agentSrc[i] === '{') depth++;
  else if (agentSrc[i] === '}') {
    depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}
const meta = eval('(' + agentSrc.slice(objStart, end) + ')');
fs.writeFileSync(path.join(OUT, 'agent.json'), JSON.stringify(meta, null, 1), 'utf8');

// 2) 图集：map.mjs 里是一个 base64 data URI
const mapSrc = fs.readFileSync(path.join(SRC, 'map.mjs'), 'utf8');
const m = mapSrc.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
if (!m) throw new Error('未找到 base64 PNG');
const png = Buffer.from(m[1], 'base64');
fs.writeFileSync(path.join(OUT, 'map.png'), png);

console.log('animations:', Object.keys(meta.animations).length);
console.log('framesize:', meta.framesize.join('x'));
console.log('overlayCount:', meta.overlayCount);
console.log('map.png bytes:', png.length);

// 检查 images 数组长度分布（多图层？）
const lens = new Map();
for (const anim of Object.values(meta.animations)) {
  for (const f of anim.frames) {
    const n = Array.isArray(f.images) ? f.images.length : 0;
    lens.set(n, (lens.get(n) || 0) + 1);
  }
}
console.log('images-array lengths:', JSON.stringify([...lens]));

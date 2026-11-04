/**
 * 构建脚本：从 @ninkch/dsh-infinite-canvas 的 assets/canvas-director 中提取
 * 所有分类的 md 全文 + manifest.json 元数据，生成 n8n 插件内部的独立 JSON 数据文件。
 *
 * 用法：node scripts/build-data.mjs <source-dir>
 *   source-dir = dsh-infinite_canvas 项目里的 assets/canvas-director 目录
 *   （不传时用环境变量 DSH_SOURCE）
 *
 * 输出：data/embedded-catalog.json（自包含：含每张卡完整 Markdown，支持运行时按能力切片）
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || process.env.DSH_SOURCE || '';
if (!ROOT) {
  console.error('缺少源目录：请传入 assets/canvas-director 路径，或设置 DSH_SOURCE');
  process.exit(1);
}
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const OUT_DIR = path.join(process.cwd(), 'data');
const OUT_FILE = path.join(OUT_DIR, 'embedded-catalog.json');

/** 解析 md frontmatter + slices */
function parseMd(raw) {
  const result = { frontmatter: {}, slices: {} };

  const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---/u;
  const fmMatch = fmRegex.exec(raw);
  if (fmMatch) {
    for (const line of fmMatch[1].split(/\r?\n/)) {
      const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.+)$/.exec(line);
      if (kv) {
        let v = kv[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        result.frontmatter[kv[1]] = v;
      }
    }
    raw = raw.slice(fmMatch[0].length).trimStart();
  }

  const sliceRegex = /<!--\s*slice:([^\->]+?)\s*-->/gu;
  const matches = [...raw.matchAll(sliceRegex)];
  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
    result.slices[name] = raw.slice(start, end).trim();
  }

  return result;
}

/** 提取负向词 */
function extractNegativePrompt(prompt) {
  if (!prompt) return '';
  const m = prompt.match(/负向词[\s\S]{0,300}?`([\s\S]*?)`/u) ||
    prompt.match(/negative_prompt_adds:\s*\[([\s\S]*?)\]/u);
  return m ? (m[1] || m[0]).trim() : '';
}

/** 提取技术参数 */
function extractParams(prompt, shot, story) {
  const text = [prompt, shot, story].join('\n');
  const p = {};
  const f = text.match(/焦段区间[：:]\s*`?\[([^\]]+)\]`?/u); if (f) p.focalRange = f[1];
  const r = text.match(/光比区间[：:]\s*`?\[([^\]]+)\]`?/u); if (r) p.lightRatio = r[1];
  const t = text.match(/色温区间[：:]\s*`?\[([^\]]+)\]`?/u); if (t) p.colorTemp = t[1];
  const d = text.match(/景深[：:]\s*`?\[([^\]]+)\]`?/u); if (d) p.dof = d[1];
  const a = text.match(/ASL[^0-9]*([0-9]+(?:\s*[-~]\s*[0-9]+)?)\s*秒/u); if (a) p.asl = a[1];
  return p;
}

/** 解析 aliases（支持 YAML 数组 [a, b, c] 或逗号字符串） */
function parseAliases(v) {
  if (!v) return [];
  const s = String(v).replace(/^[\[\(]\s*/u, '').replace(/\s*[\]\)]$/u, '');
  return s.split(/\s*,\s*/u).map((a) => a.trim()).filter(Boolean);
}

async function main() {
  fsSync.mkdirSync(OUT_DIR, { recursive: true });

  let manifest = {};
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    console.warn('无法读取 manifest.json：', e.message);
  }

  const catalog = {
    version: '2.0.0',
    source: '@ninkch/dsh-infinite-canvas assets/canvas-director (embedded, full-md)',
    builtAt: new Date().toISOString(),
    lenses: [],
    genres: [],
    industries: [],
    forms: [],
    looks: [],
    moves: [],
  };

  const manifestById = {};
  for (const cat of Object.keys(catalog)) {
    const arr = Array.isArray(manifest[cat]) ? manifest[cat] : [];
    manifestById[cat] = new Map(arr.map((x) => [x.id, x]));
  }

  async function loadDir(category, dirName) {
    const dir = path.join(ROOT, dirName);
    if (!fsSync.existsSync(dir)) { console.warn(`  跳过 ${category}：目录不存在 ${dir}`); return; }
    const files = fsSync.readdirSync(dir).filter((f) => f.endsWith('.md'));
    const out = [];
    const mmap = manifestById[category] || new Map();

    for (const file of files) {
      const id = file.replace(/\.md$/, '');
      const raw = await fs.readFile(path.join(dir, file), 'utf8');
      const parsed = parseMd(raw);
      const fm = parsed.frontmatter;

      const m = mmap.get(id) || {};
      const name = m.name || fm.name || fm.title || id;
      const oneliner = m.oneliner || fm.oneliner || '';
      const group = m.group || fm.group || '';
      const tier = m.tier || fm.tier || '';
      const glyph = m.glyph || fm.glyph || id;
      const aliases = m.aliases ? (Array.isArray(m.aliases) ? m.aliases : parseAliases(m.aliases)) : parseAliases(fm.aliases);
      const kind = m.kind || fm.kind || '';
      const spec = m.spec || {};

      const prompt = parsed.slices.prompt || parsed.slices['story shot prompt'] || '';
      const shot = parsed.slices.shot || parsed.slices['shot prompt'] || parsed.slices['story shot'] || '';
      const story = parsed.slices.story || '';
      const neg = extractNegativePrompt(prompt);
      const params = extractParams(prompt, shot, story);

      out.push({
        id,
        name,
        oneliner,
        group,
        tier,
        glyph,
        file,
        aliases,
        kind,
        spec,
        md: raw, // 完整 Markdown（含 frontmatter + 所有 slice 小节），供运行时切片
        prompt: prompt.slice(0, 4000), // 兼容旧「提示词构建器」
        negativePrompt: neg,
        params,
        hasStoryboard: Boolean(parsed.slices.story || parsed.slices.shot || parsed.slices.storyboard),
      });
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    catalog[category] = out;
    console.log(`  ${category}: ${out.length} 条`);
  }

  console.log('正在提取创作要素数据（含完整 Markdown）...');
  await loadDir('lenses', 'lenses');
  await loadDir('genres', 'genres');
  await loadDir('industries', 'industries');
  await loadDir('forms', 'forms');
  await loadDir('looks', 'looks');
  await loadDir('moves', 'moves');

  await fs.writeFile(OUT_FILE, JSON.stringify(catalog, null, 1), 'utf8');
  const total = ['lenses', 'genres', 'industries', 'forms', 'looks', 'moves'].reduce((sum, k) => sum + catalog[k].length, 0);
  const sizeKB = (fsSync.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`\n完成！共 ${total} 条，输出到 ${OUT_FILE}（${sizeKB} KB）`);
}

main().catch((e) => { console.error(e); process.exit(1); });

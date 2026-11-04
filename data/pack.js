/**
 * canvas-director 技能包：切片与索引的共享纯函数（CommonJS 移植版）。
 *
 * 来源：@ninkch/dsh-infinite-canvas assets/canvas-director/pack.js
 * 用途：按「生成能力」切片，绝不整份注入。
 *   kind = 生成能力（script / storyboard / prompt / assets）
 *   layer = 数据层（lens 导演 / genre 叙事题材 / industry 行业题材 / form 规格 / look 影调 / moves 运镜）
 */

/** Markdown 里 slice 标记的格式：`<!-- slice:story prompt -->` */
const SLICE_RE = /^<!--\s*slice:([a-z ]+?)\s*-->\s*$/;

/** 每张小节的「缺省归属」——标记缺失时用它兜底 */
const SECTION_DEFAULT_SLICE = {
  // 透镜
  '一句话镜头 / Lens in one line': 'story shot prompt',
  '适用场景': 'story',
  '反例：这不是什么 / What this lens is NOT': 'story shot',
  '核心风格关键词': 'story shot prompt',
  '叙事方法': 'story',
  '镜头语言': 'story shot',
  '灯光与色彩': 'shot prompt assets',
  '剪辑节奏': 'story',
  '声音与音乐': 'story',
  '人物与表演': 'story shot',
  '风格参数 / Style parameters': 'shot prompt assets',
  '可迁移拍摄清单': 'storyboard shot',
  '提示词模板 / Prompt templates': 'prompt',
  '落地示例 / Worked example': 'prompt',
  // 叙事题材卡
  '题材核心与观众为什么看': 'story',
  '压力来源与冲突发动机': 'story',
  '人物策略与信息权限': 'story',
  '观众回报与情绪落点': 'story',
  '常见场面颗粒': 'story prompt',
  '集尾钩子取向': 'story',
  '前中后期打法': 'story',
  '制作难点': 'story shot',
  '禁止漂移': 'story shot',
  '证据与置信度': 'story',
  // 行业题材卡
  '视觉母题': 'story prompt',
  '证据点': 'story prompt',
  '常见承诺': 'story prompt',
  '禁项': 'prompt',
  '参考镜头': 'prompt',
  // 规格卡
  '交付规格': 'story shot prompt',
  '结构块': 'story',
  '这个类型的观众契约': 'story shot',
  '与导演透镜冲突时的改写': 'story shot',
  '类型级负向词': 'prompt',
  // 影调卡
  '成像底层': 'story shot prompt',
  '形体与骨相': 'story shot prompt',
  '影调与光比': 'shot prompt assets',
  '色彩命题': 'shot prompt assets',
  '空气与介质': 'shot prompt assets',
  '光学与镜头': 'shot prompt assets',
  '材质响应': 'prompt assets',
  '特效语言': 'shot prompt',
  '针对性禁项': 'prompt',
  '负向词块': 'prompt',
};

/** 把一份 Markdown 切成 { title, slice, body } 的小节数组 */
function splitSections(md) {
  const lines = String(md || '').split(/\r?\n/);
  const sections = [];
  let cur = null;
  let pendingSlice = null;
  let inFence = false;
  const preamble = [];
  for (const ln of lines) {
    if (/^\s*```/.test(ln)) inFence = !inFence;
    if (!inFence) {
      const sm = SLICE_RE.exec(ln.trim());
      if (sm) { pendingSlice = sm[1].trim(); continue; }
      const hm = /^##\s+(.+)$/.exec(ln);
      if (hm) {
        if (cur) sections.push(cur);
        const title = hm[1].trim();
        cur = {
          title,
          slice: pendingSlice || SECTION_DEFAULT_SLICE[title] || 'story',
          body: [],
        };
        pendingSlice = null;
        continue;
      }
    }
    if (cur) cur.body.push(ln);
    else preamble.push(ln);
  }
  if (cur) sections.push(cur);
  return sections.map((s) => ({ title: s.title, slice: s.slice, body: s.body.join('\n').replace(/^\n+|\n+$/g, '') }));
}

/** 按标题名精确取小节正文；找不到返回空串 */
function sectionText(md, title) {
  const hit = splitSections(md).find((s) => s.title === title);
  return hit ? hit.body : '';
}

/** 生成能力 → 需要的小节标签集合 */
const KIND_SLICES = {
  script: ['story'],
  storyboard: ['shot', 'storyboard'],
  prompt: ['prompt'],
  assets: ['assets', 'library'],
};

/** 取一份 Markdown 在某个生成能力下的全部小节正文 */
function pickSections(md, kind) {
  const want = KIND_SLICES[String(kind || '').trim()];
  if (!want) return '';
  return splitSections(md)
    .filter((s) => s.slice.split(/\s+/).some((t) => want.includes(t)))
    .map((s) => '## ' + s.title + '\n\n' + s.body)
    .join('\n\n');
}

/** 抽出 ```yaml 风格参数块原文（不含围栏） */
function yamlBlock(md) {
  const m = /```ya?ml\s*\n([\s\S]*?)```/.exec(String(md || ''));
  return m ? m[1].replace(/\s+$/, '') : '';
}

/** 抽出负向词 */
function negativePhrases(md) {
  const text = String(md || '');
  const sec = sectionText(text, '负向词块') || sectionText(text, '类型级负向词');
  const fromSec = sec
    ? sec.replace(/```[a-z]*\n?/g, '').split(/[,，\n]/)
      .map((s) => s.replace(/^[-*\d.\s]+/, '').trim())
      .filter((s) => /^[a-z][a-z0-9 '\-/]{2,}$/i.test(s))
    : [];
  if (fromSec.length) return [...new Set(fromSec)];
  const y = yamlBlock(text);
  const m = /negative_prompt_adds:\s*\[([^\]]*)\]/m.exec(y);
  if (!m) return [];
  return [...new Set(m[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean))];
}

/** 从 frontmatter 读一个标量字段 */
function frontmatterField(md, key) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(md || ''));
  if (!fm) return '';
  const m = new RegExp('^' + String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*(.+)$', 'm').exec(fm[1]);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

/** 从 frontmatter 读一个内联数组字段 */
function frontmatterList(md, key) {
  const raw = frontmatterField(md, key);
  if (!raw) return [];
  const inner = /^\[([\s\S]*)\]$/.exec(raw);
  const body = inner ? inner[1] : raw;
  return body.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

/** 从 frontmatter 读 spec 子块 */
function frontmatterSpec(md) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(md || ''));
  if (!fm) return {};
  const out = {};
  let inSpec = false;
  for (const ln of fm[1].split(/\r?\n/)) {
    if (/^spec:\s*$/.test(ln)) { inSpec = true; continue; }
    if (inSpec) {
      if (/^\S/.test(ln)) { inSpec = false; continue; }
      const m = /^\s+([A-Za-z0-9_]+):\s*(.+)$/.exec(ln);
      if (!m) continue;
      const v = m[2].trim().replace(/\s+#.*$/, '');
      if (/^\[/.test(v)) out[m[1]] = frontmatterList('---\n' + m[1] + ': ' + v + '\n---', m[1]);
      else if (/^-?\d+(\.\d+)?$/.test(v)) out[m[1]] = Number(v);
      else out[m[1]] = v.replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

/** 拼装一段可注入文本，返回 { text, bytes } */
function composePackText(blocks, opts) {
  const o = opts || {};
  const head = String(o.head || '').trim();
  const parts = [];
  if (head) parts.push(head);
  for (const b of blocks || []) {
    if (!b) continue;
    const title = String(b.title || '').trim();
    const body = String(b.body || '').trim();
    if (!body) continue;
    parts.push((title ? '### ' + title + '\n' : '') + body);
  }
  const text = parts.join('\n\n').trim();
  return { text, bytes: utf8Bytes(text) };
}

/** UTF-8 字节数 */
function utf8Bytes(str) {
  const s = String(str || '');
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/** 组装某个生成能力下的注入文本 */
function buildPackText(kind, items, opts) {
  const o = opts || {};
  const zh = o.zh !== false;
  const blocks = [];
  const used = [];
  for (const it of items || []) {
    if (!it || !it.md) continue;
    const meta = it.meta || {};
    const name = meta.name || meta.id || it.layer;
    let body = '';
    if (it.layer === 'moves') {
      body = String(it.md || '').trim();
    } else {
      body = pickSections(it.md, kind);
    }
    if (!body.trim()) continue;
    blocks.push({ title: layerLabel(it.layer, zh) + '：' + name + (meta.oneliner ? ' —— ' + meta.oneliner : ''), body });
    used.push({ layer: it.layer, id: meta.id || '', bytes: utf8Bytes(body) });
  }
  if (!blocks.length) return { text: '', bytes: 0, used: [] };
  const head = o.head || '';
  const r = composePackText(blocks, { head });
  return { text: r.text, bytes: r.bytes, used };
}

/** 层的中文标签 */
function layerLabel(layer, zh) {
  const ZH = { lens: '导演透镜', genre: '题材', industry: '行业题材', form: '规格', look: '影调', moves: '运镜与节奏' };
  const EN = { lens: 'Director lens', genre: 'Genre', industry: 'Industry', form: 'Spec', look: 'Look', moves: 'Camera & rhythm' };
  const m = zh === false ? EN : ZH;
  return m[layer] || layer;
}

/** 默认配置 */
const DEFAULT_PROFILE = {
  lens: '',
  genres: [],
  form: '',
  look: '',
  genreMode: 'auto',
};

/** 归一技能配置 */
function normalizeProfile(raw, allowed) {
  const b = (raw && typeof raw === 'object') ? raw : {};
  const a = allowed || {};
  const pick = (v, list) => {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '';
    if (Array.isArray(list) && list.length && !list.includes(s)) return '';
    return s;
  };
  const genres = Array.isArray(b.genres)
    ? [...new Set(b.genres.map((x) => String(x == null ? '' : x).trim()).filter(Boolean))]
      .filter((x) => !Array.isArray(a.genres) || !a.genres.length || a.genres.includes(x))
      .slice(0, 12)
    : [];
  return {
    lens: pick(b.lens, a.lenses),
    genres,
    form: pick(b.form, a.forms) || DEFAULT_PROFILE.form,
    look: pick(b.look, a.looks),
    genreMode: (b.genreMode === 'narrative' || b.genreMode === 'industry') ? b.genreMode : 'auto',
  };
}

module.exports = {
  SLICE_RE,
  SECTION_DEFAULT_SLICE,
  splitSections,
  sectionText,
  KIND_SLICES,
  pickSections,
  yamlBlock,
  negativePhrases,
  frontmatterField,
  frontmatterList,
  frontmatterSpec,
  composePackText,
  utf8Bytes,
  buildPackText,
  layerLabel,
  DEFAULT_PROFILE,
  normalizeProfile,
};

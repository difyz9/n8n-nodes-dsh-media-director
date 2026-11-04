/**
 * DSh 技能切片 节点（独立版）
 * 用途：等价于画布导演套件（canvas-director）的 canvas_skill_pack ——
 *   按生成能力（script / storyboard / prompt / assets）从已选的四件套配置里
 *   切出正确的小节并拼装成可注入文本，返回文本 + 字节数 + 生效配置。
 *
 * 全部数据嵌入插件内部，不依赖外部项目。
 *
 * CommonJS 版本：符合 n8n 自定义节点类导出规范。
 */

const { loadCatalog } = require('../../data/data-loader.js');
const { buildPackText, layerLabel } = require('../../data/pack.js');
const { lensOptions, genreAllOptions, formOptions, lookOptions } = require('../../data/catalog-options.js');

const LAYER_OF_CATEGORY = {
  lenses: 'lens',
  genres: 'genre',
  industries: 'industry',
  forms: 'form',
  looks: 'look',
  moves: 'moves',
};

function layerLabelOf(category) {
  return LAYER_OF_CATEGORY[category] || category;
}

/** 在 catalog 里按 id 查找条目，返回 { layer, meta, md } */
function resolveItem(catalog, id) {
  for (const cat of ['lenses', 'genres', 'industries', 'forms', 'looks']) {
    const list = catalog[cat] || [];
    const found = list.find((x) => x.id === id);
    if (found) {
      return {
        layer: layerLabelOf(cat),
        meta: { id: found.id, name: found.name, oneliner: found.oneliner, group: found.group },
        md: found.md || '',
      };
    }
  }
  return null;
}

function splitIds(str) {
  if (!str) return [];
  if (Array.isArray(str)) return str.map(String).filter(Boolean);
  return String(str).split(/[,，\s]+/u).map((s) => s.trim()).filter(Boolean);
}

class DshSkillPack {
  description = {
    name: 'dshSkillPack',
    displayName: 'DSh 技能切片',
    icon: 'file:../../media-director.svg',
    description: '按生成能力（剧本/分镜/提示词/资产）从导演四件套配置切出正确小节并拼装，等价于画布导演套件的 canvas_skill_pack（数据嵌入插件，独立运行）',
    group: ['transform'],
    version: 1,
    subtitle: '=skill: {{$parameter["kind"]}}',
    defaults: {
      name: 'DSh 技能切片',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [],
    properties: [
      {
        displayName: '生成能力',
        name: 'kind',
        type: 'options',
        options: [
          { name: '剧本（story）', value: 'script', description: '叙事与节奏为主：题材卡 + 透镜叙事/节奏/表演 + 规格结构块' },
          { name: '分镜（storyboard）', value: 'storyboard', description: '镜头语言 + 灯光 + 可迁移拍摄清单 + 规格卡 + 运镜词典' },
          { name: '提示词（prompt）', value: 'prompt', description: '风格参数/灯光/提示词模板 + 影调卡 + ASL 与负向词' },
          { name: '资产设定图（assets）', value: 'assets', description: '成像与材质相关：风格参数/灯光 + 影调卡' },
        ],
        default: 'prompt',
        description: '要切出哪种生成能力的小节（对应画布导演套件的 kind）',
      },
      {
        displayName: '导演透镜',
        name: 'lens',
        type: 'options',
        options: lensOptions,
        default: '',
        description: '导演透镜（如 wong_kar_wai、kubrick）。可映射自上游 DSh 导演四件套节点。',
      },
      {
        displayName: '题材（可多选）',
        name: 'genres',
        type: 'multiOptions',
        options: genreAllOptions,
        default: [],
        description: '叙事题材 / 行业题材，可多选（如 wuxia、crime-police）。',
      },
      {
        displayName: '规格',
        name: 'form',
        type: 'options',
        options: formOptions,
        default: '',
        description: '类型规格（如 short-drama、cinematic、commercial）。',
      },
      {
        displayName: '影调质感',
        name: 'look',
        type: 'options',
        options: lookOptions,
        default: '',
        description: '影调质感（如 cold-noir、ghibli-watercolor）。',
      },
      {
        displayName: '注入运镜词典与打斗节奏',
        name: 'includeMoves',
        type: 'boolean',
        default: true,
        description: '开启后把 moves/ 下的运镜词典、打斗节奏作为整份注入（分镜/提示词能力常用）。',
      },
      {
        displayName: '标题语言',
        name: 'outputLanguage',
        type: 'options',
        options: [
          { name: '中文', value: 'zh' },
          { name: '英文', value: 'en' },
        ],
        default: 'zh',
        description: '拼装文本中每个分区的标题语言。',
      },
    ],
  };

  async execute() {
    const items = [];
    const catalog = await loadCatalog();

    const totalInput = this.getInputData().length;
    const indices = totalInput > 0 ? Array.from({ length: totalInput }, (_, i) => i) : [0];

    for (const idx of indices) {
      const kind = this.getNodeParameter('kind', idx) || 'prompt';
      const lensId = String(this.getNodeParameter('lens', idx) || '').trim();
      const genresStr = this.getNodeParameter('genres', idx);
      const formId = String(this.getNodeParameter('form', idx) || '').trim();
      const lookId = String(this.getNodeParameter('look', idx) || '').trim();
      const includeMoves = this.getNodeParameter('includeMoves', idx) !== false;
      const outputLanguage = this.getNodeParameter('outputLanguage', idx) || 'zh';

      const genreIds = splitIds(genresStr);
      const profile = { kind, lens: lensId, genres: genreIds, form: formId, look: lookId, includeMoves };

      try {
        // 按固定顺序拼装：导演透镜 → 题材 → 规格 → 影调 → 运镜
        const packItems = [];
        const missed = [];

        const lensResolved = lensId ? resolveItem(catalog, lensId) : null;
        if (lensId) {
          if (lensResolved) packItems.push(lensResolved);
          else missed.push(`lens:${lensId}`);
        }

        for (const gid of genreIds) {
          const r = resolveItem(catalog, gid);
          if (r) packItems.push(r);
          else missed.push(`genre:${gid}`);
        }

        if (formId) {
          const r = resolveItem(catalog, formId);
          if (r) packItems.push(r);
          else missed.push(`form:${formId}`);
        }

        if (lookId) {
          const r = resolveItem(catalog, lookId);
          if (r) packItems.push(r);
          else missed.push(`look:${lookId}`);
        }

        if (includeMoves) {
          for (const mv of catalog.moves || []) {
            packItems.push({
              layer: 'moves',
              meta: { id: mv.id, name: mv.name, oneliner: mv.oneliner },
              md: mv.md || '',
            });
          }
        }

        const head = outputLanguage === 'en'
          ? `[canvas-director skill pack] kind=${kind}`
          : `[画布导演套件 技能切片] kind=${kind}`;
        const packed = buildPackText(kind, packItems, { head, zh: outputLanguage !== 'en' });

        items.push({
          json: {
            kind,
            profile,
            text: packed.text,
            bytes: packed.bytes,
            used: packed.used,
            missed,
            effective: {
              lens: lensResolved ? lensResolved.meta : null,
              genres: packItems.filter((p) => p.layer === 'genre' || p.layer === 'industry').map((p) => p.meta),
              form: packItems.find((p) => p.layer === 'form')?.meta || null,
              look: packItems.find((p) => p.layer === 'look')?.meta || null,
              movesIncluded: includeMoves,
            },
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        items.push({
          json: {
            kind,
            profile,
            error: error.message || String(error),
            text: '',
            bytes: 0,
            used: [],
            timestamp: new Date().toISOString(),
          },
          pairedItem: { item: idx },
        });
      }
    }

    return [items];
  }
}

module.exports = { DshSkillPack };

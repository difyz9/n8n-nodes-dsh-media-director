/**
 * DSh Media Catalog 节点（独立版）
 * 用途：列出媒体创作要素清单，全部数据嵌入插件内部，不依赖外部项目。
 *
 * 分类：
 *   - 导演透镜 (lenses)
 *   - 叙事题材 (genres)
 *   - 行业题材 (industries)
 *   - 规格 (forms)
 *   - 影调质感 (looks)
 *   - 运镜与节奏 (moves)
 *
 * 输出：所选分类的全部条目元数据
 *
 * CommonJS 版本：符合 n8n 自定义节点类导出规范。
 */

const { loadCatalog, CATEGORY_LABELS } = require('../../data/data-loader.js');

async function loadCategoryItems(operation, groupFilter, lightweight) {
  const catalog = await loadCatalog();
  const list = Array.isArray(catalog[operation]) ? catalog[operation] : [];

  return list
    .map((item) => {
      if (groupFilter && item.group !== groupFilter) return null;
      if (lightweight) {
        return {
          id: item.id,
          name: item.name,
          oneliner: item.oneliner || '',
          group: item.group || '',
          category: operation,
          label: CATEGORY_LABELS[operation] || operation,
        };
      }
      return {
        id: item.id,
        name: item.name,
        oneliner: item.oneliner || '',
        group: item.group || '',
        tier: item.tier || '',
        glyph: item.glyph || '',
        aliases: item.aliases || [],
        kind: item.kind || '',
        spec: item.spec || {},
        category: operation,
        label: CATEGORY_LABELS[operation] || operation,
        negativePrompt: item.negativePrompt || '',
        params: item.params || {},
        hasStoryboard: item.hasStoryboard || false,
        prompt: item.prompt || '',
      };
    })
    .filter(Boolean);
}

class DshMediaCatalog {
  description = {
    name: 'dshMediaCatalog',
    displayName: 'DSh 媒体清单',
    icon: 'file:../../media-director.svg',
    description: '列出导演透镜、题材、规格、影调等创作要素，供 n8n 工作流下游节点使用（数据嵌入插件，独立运行）',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    defaults: {
      name: 'DSh 媒体清单',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [],
    properties: [
      {
        displayName: '操作',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: '导演透镜', value: 'lenses', description: '导演风格透镜（库布里克、宫崎骏、王家卫 等）' },
          { name: '叙事题材', value: 'genres', description: '叙事题材（武侠、仙侠、悬疑规则 等）' },
          { name: '行业题材', value: 'industries', description: '行业题材（汽车、金融、医疗 等）' },
          { name: '规格', value: 'forms', description: '类型规格（短剧、商业片、纪实 等）' },
          { name: '影调质感', value: 'looks', description: '影调质感（冷调悬疑、吉卜力水彩 等）' },
          { name: '运镜与节奏', value: 'moves', description: '运镜与节奏（运镜词典、打斗节奏 等）' },
        ],
        default: 'lenses',
        description: '要列出的创作要素分类',
      },
      {
        displayName: '分组过滤',
        name: 'groupFilter',
        type: 'string',
        default: '',
        description: '可选：只返回指定分组名的条目（如“华语”“欧美”“冷调”）。留空返回全部。',
      },
      {
        displayName: '只返回 ID 和名称（轻量模式）',
        name: 'lightweight',
        type: 'boolean',
        default: false,
        description: '开启后仅返回 id、name、oneliner、group，不包含 prompt、params 等详细字段，适合下拉菜单数据源。',
      },
    ],
  };

  async execute() {
    const items = [];
    const input = this.getInputData();

    for (let i = 0; i < input.length; i++) {
      const operation = this.getNodeParameter('operation', i) || 'lenses';
      const groupFilter = this.getNodeParameter('groupFilter', i) || '';
      const lightweight = this.getNodeParameter('lightweight', i) === true || this.getNodeParameter('lightweight', i) === 'true';

      try {
        const categoryItems = await loadCategoryItems(operation, groupFilter, lightweight);

        items.push({
          json: {
            operation,
            category: operation,
            categoryLabel: CATEGORY_LABELS[operation] || operation,
            count: categoryItems.length,
            items: categoryItems,
            groupFilter,
            lightweight,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        items.push({
          json: {
            operation,
            category: operation,
            error: error.message || String(error),
            items: [],
            count: 0,
          },
          pairedItem: { item: i },
        });
      }
    }

    return [items];
  }
}

module.exports = { DshMediaCatalog };

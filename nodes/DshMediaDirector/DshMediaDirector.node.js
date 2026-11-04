/**
 * DSh Media Director 节点（独立版）
 * 用途：选择“导演 × 题材 × 规格 × 影调”的四件套组合，
 * 输出结构化的创作配置，供 n8n 工作流下游节点使用。
 *
 * 全部数据嵌入插件内部，不依赖外部项目。
 *
 * 四件套：
 *   - 导演透镜 (lenses)   - 决定构图、光色、节奏、表演注音
 *   - 题材 (genres)       - 决定冲突机制、人物机制、回报钩子
 *   - 规格 (forms)        - 决定结构块、ASL、平台、画质基线
 *   - 影调 (looks)        - 决定成像底层、色板、光比、材质响应
 *
 * 输出：每个选中要素的完整元数据 + 合成的创作配置对象
 *
 * CommonJS 版本：符合 n8n 自定义节点类导出规范。
 */

const { loadCatalog, findById, findGenre } = require('../../data/data-loader.js');
const { mergeNegativePrompts } = require('../../data/text-utils.js');
const { withPairedItem, handleItemError } = require('../../data/node-execute.js');
const { lensOptions, genreAllOptions, formOptions, lookOptions } = require('../../data/catalog-options.js');

/** 合成创作提示词模板 */
function synthesizePrompt(director, genre, form, look) {
  const parts = [];

  if (director) {
    parts.push(`[导演透镜] ${director.name}（${director.id}）：${director.oneliner}`);
  }
  if (genre) {
    parts.push(`[题材] ${genre.name}（${genre.id}）`);
  }
  if (form) {
    parts.push(`[规格] ${form.name}（${form.id}）`);
  }
  if (look) {
    parts.push(`[影调] ${look.name}（${look.id}）`);
  }

  const template = parts.length
    ? parts.join('\n') + '\n\n请基于上述导演透镜、题材、规格、影调，为该场景生成分镜与视频提示词。'
    : '请选择至少一个创作要素以生成提示词模板。';

  return template;
}

class DshMediaDirector {
  description = {
    name: 'dshMediaDirector',
    displayName: 'DSh 导演四件套',
    icon: 'file:media-director.svg',
    description: '选择导演透镜、题材、规格、影调的组合，输出结构化的媒体创作配置（数据嵌入插件，独立运行）',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["director"] || "未选导演"}} × {{$parameter["genre"] || "未选题材"}}',
    defaults: {
      name: 'DSh 导演四件套',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [],
    properties: [
      {
        displayName: '导演透镜',
        name: 'director',
        type: 'options',
        options: lensOptions,
        default: '',
        description: '导演透镜（构图、机位、光色、节奏、表演）。',
        placeholder: '选择导演透镜',
      },
      {
        displayName: '题材',
        name: 'genre',
        type: 'options',
        options: genreAllOptions,
        default: '',
        description: '叙事题材 / 行业题材（压力机制、观众回报）。',
        placeholder: '选择题材',
      },
      {
        displayName: '规格',
        name: 'form',
        type: 'options',
        options: formOptions,
        default: '',
        description: '类型规格（结构块、ASL、节奏、质量档）。',
        placeholder: '选择规格',
      },
      {
        displayName: '影调质感',
        name: 'look',
        type: 'options',
        options: lookOptions,
        default: '',
        description: '影调质感（成像底层、材质、渲染质感）。',
        placeholder: '选择影调',
      },
      {
        displayName: '自动生成创作提示词模板',
        name: 'autoPrompt',
        type: 'boolean',
        default: true,
        description: '开启后自动合成基于四件套的 AI 生成提示词模板。',
      },
    ],
  };

  async execute() {
    const items = [];
    const input = this.getInputData();

    for (let i = 0; i < input.length; i++) {
      const result = {
        director: null,
        genre: null,
        form: null,
        look: null,
        selectedCount: 0,
        promptTemplate: '',
        negativePrompt: '',
        promptParams: {},
        timestamp: new Date().toISOString(),
      };

      try {
        const directorId = this.getNodeParameter('director', i) || '';
        const genreId = this.getNodeParameter('genre', i) || '';
        const formId = this.getNodeParameter('form', i) || '';
        const lookId = this.getNodeParameter('look', i) || '';
        const autoPrompt = this.getNodeParameter('autoPrompt', i) !== false;

        const catalog = await loadCatalog();

        const directorMeta = directorId ? findById(catalog.lenses, directorId) : null;
        const genreMeta = genreId ? findGenre(catalog, genreId) : null;
        const formMeta = formId ? findById(catalog.forms, formId) : null;
        const lookMeta = lookId ? findById(catalog.looks, lookId) : null;

        result.director = directorMeta;
        result.genre = genreMeta;
        result.form = formMeta;
        result.look = lookMeta;
        result.selectedCount = [directorMeta, genreMeta, formMeta, lookMeta].filter(Boolean).length;

        // 提取负向词（合并去重，与提示词构建器一致）
        result.negativePrompt = mergeNegativePrompts(
          directorMeta?.negativePrompt,
          genreMeta?.negativePrompt,
          formMeta?.negativePrompt,
          lookMeta?.negativePrompt,
        );

        // 提取技术参数（合并，后续要素覆盖前面的）
        const params = {};
        if (directorMeta?.params) Object.assign(params, directorMeta.params);
        if (genreMeta?.params) Object.assign(params, genreMeta.params);
        if (formMeta?.params) Object.assign(params, formMeta.params);
        if (lookMeta?.params) Object.assign(params, lookMeta.params);
        result.promptParams = params;

        // 自动生成提示词模板
        if (autoPrompt) {
          result.promptTemplate = synthesizePrompt(directorMeta, genreMeta, formMeta, lookMeta);
        }

        items.push(withPairedItem(result, i));
      } catch (error) {
        handleItemError(this, items, error, i, result);
      }
    }

    return [items];
  }
}

module.exports = { DshMediaDirector };

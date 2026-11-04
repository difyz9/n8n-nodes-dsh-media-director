/**
 * DSh Media Prompt Builder 节点（独立版）
 * 用途：基于已选的导演透镜、题材、规格、影调，构建最终的 AI 生成提示词。
 *
 * 全部数据嵌入插件内部，不依赖外部项目。
 *
 * 功能：
 *   1. 合成中英文提示词（将各分类的 prompt 内容拼接）
 *   2. 提取并合并负向词
 *   3. 输出结构化的技术参数（焦段、光比、色温、景深、ASL 等）
 *   4. 支持自定义变量注入（如场景描述、角色、动作）
 *
 * 输入：通常接 DSh 导演四件套节点的输出（或直接传入 id）
 * 输出：最终提示词、负向词、技术参数、分镜建议
 *
 * CommonJS 版本：符合 n8n 自定义节点类导出规范。
 */

const { loadCatalog, findById, findGenre } = require('../../data/data-loader.js');
const { mergeNegativePrompts, renderTemplate, buildTemplateVars } = require('../../data/text-utils.js');
const { withPairedItem, handleItemError } = require('../../data/node-execute.js');
const { lensOptions, genreAllOptions, formOptions, lookOptions } = require('../../data/catalog-options.js');

/** 从中文切片提取英文关键词（简化：提取括号内英文） */
function extractKeywords(cnText) {
  if (!cnText) return '';
  const enMatches = cnText.match(/\(([^)]*[a-zA-Z][^)]*)\)/gu);
  const en = enMatches ? enMatches.map((m) => m.slice(1, -1).trim()).join(', ') : '';
  return en || cnText.slice(0, 200);
}

/** 从导演/影调 md 中提取分镜相关建议 */
function extractStoryboardFromMd(item) {
  if (!item) return {};
  const prompt = item.prompt || '';
  return {
    promptSlice: prompt.slice(0, 500),
    hasStoryboard: item.hasStoryboard || false,
  };
}

class DshMediaPromptBuilder {
  description = {
    name: 'dshMediaPromptBuilder',
    displayName: 'DSh 提示词构建器',
    icon: 'file:media-director.svg',
    description: '基于导演透镜、题材、规格、影调构建 AI 视频/图像生成提示词（数据嵌入插件，独立运行）',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["outputLanguage"] || "中文"}}',
    defaults: {
      name: 'DSh 提示词构建器',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [],
    properties: [
      {
        displayName: '导演透镜',
        name: 'directorId',
        type: 'options',
        options: lensOptions,
        default: '',
        description: '导演透镜（如 kubrick）。可映射自上游 DSh 导演四件套节点。',
      },
      {
        displayName: '题材',
        name: 'genreId',
        type: 'options',
        options: genreAllOptions,
        default: '',
        description: '叙事题材 / 行业题材（如 wuxia）。',
      },
      {
        displayName: '规格',
        name: 'formId',
        type: 'options',
        options: formOptions,
        default: '',
        description: '类型规格（如 short-drama）。',
      },
      {
        displayName: '影调质感',
        name: 'lookId',
        type: 'options',
        options: lookOptions,
        default: '',
        description: '影调质感（如 cold-noir）。',
      },
      {
        displayName: '场景描述（一句话事件）',
        name: 'sceneDescription',
        type: 'string',
        default: '',
        description: '本场景的一句话事件描述，会被注入到提示词模板中。',
        placeholder: '例如：一个人站在走廊尽头，犹豫着是否敲门',
      },
      {
        displayName: '自定义变量（JSON）',
        name: 'customVars',
        type: 'string',
        default: '{}',
        description: '可选：自定义变量键值对，用于替换提示词模板中的 {{var}} 占位符。',
        placeholder: '{"角色": "侠客", "场景": "客栈大堂"}',
      },
      {
        displayName: '输出语言',
        name: 'outputLanguage',
        type: 'options',
        options: [
          { name: '中文', value: 'zh' },
          { name: '英文', value: 'en' },
          { name: '中英双语', value: 'zh-en' },
        ],
        default: 'zh-en',
        description: '生成提示词的语言。AI 视频模型通常建议用英文。',
      },
      {
        displayName: '包含分镜建议',
        name: 'includeStoryboard',
        type: 'boolean',
        default: true,
        description: '开启后从 prompt 内容中提取分镜建议（景别、机位、运镜等关键词）。',
      },
    ],
  };

  async execute() {
    const items = [];
    const input = this.getInputData();

    for (let i = 0; i < input.length; i++) {
      const result = {
        directorId: '',
        genreId: '',
        formId: '',
        lookId: '',
        sceneDescription: '',
        customVars: {},
        outputLanguage: 'zh-en',
        promptZh: '',
        promptEn: '',
        promptFinal: '',
        negativePrompt: '',
        technicalParams: {},
        storyboardSuggestions: {},
        promptSlices: {},
        timestamp: new Date().toISOString(),
      };

      try {
        const directorId = this.getNodeParameter('directorId', i) || '';
        const genreId = this.getNodeParameter('genreId', i) || '';
        const formId = this.getNodeParameter('formId', i) || '';
        const lookId = this.getNodeParameter('lookId', i) || '';
        const sceneDescription = this.getNodeParameter('sceneDescription', i) || '';
        const outputLanguage = this.getNodeParameter('outputLanguage', i) || 'zh-en';
        const includeStoryboard = this.getNodeParameter('includeStoryboard', i) !== false;

        // 非法 JSON 当成空变量；参数读取失败仍交给外层处理
        const rawVars = this.getNodeParameter('customVars', i) || '{}';
        let customVars = {};
        if (typeof rawVars === 'string') {
          try {
            customVars = JSON.parse(rawVars);
          } catch {
            customVars = {};
          }
        } else if (rawVars && typeof rawVars === 'object') {
          customVars = rawVars;
        }

        result.directorId = directorId;
        result.genreId = genreId;
        result.formId = formId;
        result.lookId = lookId;
        result.sceneDescription = sceneDescription;
        result.customVars = customVars;
        result.outputLanguage = outputLanguage;

        const catalog = await loadCatalog();

        const directorMeta = directorId ? findById(catalog.lenses, directorId) : null;
        const genreMeta = genreId ? findGenre(catalog, genreId) : null;
        const formMeta = formId ? findById(catalog.forms, formId) : null;
        const lookMeta = lookId ? findById(catalog.looks, lookId) : null;

        // 收集各分类的 prompt 内容
        const slices = {};
        if (directorMeta?.prompt) slices.directorPrompt = directorMeta.prompt;
        if (genreMeta?.prompt) slices.genrePrompt = genreMeta.prompt;
        if (formMeta?.prompt) slices.formPrompt = formMeta.prompt;
        if (lookMeta?.prompt) slices.lookPrompt = lookMeta.prompt;
        result.promptSlices = slices;

        // 提取技术参数（合并，后续要素覆盖前面的）
        const params = {};
        if (directorMeta?.params) Object.assign(params, directorMeta.params);
        if (genreMeta?.params) Object.assign(params, genreMeta.params);
        if (formMeta?.params) Object.assign(params, formMeta.params);
        if (lookMeta?.params) Object.assign(params, lookMeta.params);
        result.technicalParams = params;

        // 提取负向词（合并去重）
        const negList = [
          directorMeta?.negativePrompt,
          genreMeta?.negativePrompt,
          formMeta?.negativePrompt,
          lookMeta?.negativePrompt,
        ].filter(Boolean);
        result.negativePrompt = mergeNegativePrompts(...negList);

        // 构建中文提示词
        const zhParts = [];
        if (sceneDescription) zhParts.push(`场景：${sceneDescription}`);
        if (slices.directorPrompt) zhParts.push(`[导演透镜] ${slices.directorPrompt}`);
        if (slices.genrePrompt) zhParts.push(`[题材] ${slices.genrePrompt}`);
        if (slices.formPrompt) zhParts.push(`[规格] ${slices.formPrompt}`);
        if (slices.lookPrompt) zhParts.push(`[影调] ${slices.lookPrompt}`);
        result.promptZh = zhParts.join('\n\n');

        // 构建英文提示词（核心关键词提取）。题材（含行业）与中文路径一起带上。
        const enParts = [];
        if (sceneDescription) enParts.push(`Scene: ${sceneDescription}`);
        if (slices.directorPrompt) enParts.push(`[Director Lens] ${extractKeywords(slices.directorPrompt)}`);
        if (slices.genrePrompt) enParts.push(`[Genre] ${extractKeywords(slices.genrePrompt)}`);
        if (slices.lookPrompt) enParts.push(`[Look] ${extractKeywords(slices.lookPrompt)}`);
        if (slices.formPrompt) enParts.push(`[Form] ${extractKeywords(slices.formPrompt)}`);
        result.promptEn = enParts.join('\n\n');

        // {{var}} 与 sceneDescription 注入中英文提示词，再按语言收成 promptFinal
        const templateVars = buildTemplateVars(sceneDescription, customVars);
        result.promptZh = renderTemplate(result.promptZh, templateVars);
        result.promptEn = renderTemplate(result.promptEn, templateVars);
        if (outputLanguage === 'zh') {
          result.promptFinal = result.promptZh;
        } else if (outputLanguage === 'en') {
          result.promptFinal = result.promptEn;
        } else {
          result.promptFinal = `${result.promptZh}\n\n---\n\n${result.promptEn}`;
        }

        // 分镜建议
        if (includeStoryboard) {
          result.storyboardSuggestions = {
            lensStoryboard: extractStoryboardFromMd(directorMeta),
            shotParams: {
              focal: params.focalRange || '',
              lightRatio: params.lightRatio || '',
              colorTemp: params.colorTemp || '',
              dof: params.dof || '',
              asl: params.asl || '',
            },
          };
        }

        items.push(withPairedItem(result, i));
      } catch (error) {
        handleItemError(this, items, error, i, result);
      }
    }

    return [items];
  }
}

module.exports = { DshMediaPromptBuilder };

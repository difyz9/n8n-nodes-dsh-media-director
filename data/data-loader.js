/**
 * @ninkch/dsh-infinite-canvas 媒体创作要素——嵌入式数据加载器
 *
 * 完全自包含：所有创作要素数据（导演透镜、题材、规格、影调、行业、运镜）
 * 均嵌入在 data/embedded-catalog.json 中，运行时不依赖原 @ninkch/dsh-infinite-canvas
 * 项目或任何外部资产路径。
 *
 * CommonJS 版本：供 n8n 自定义节点（N8N_CUSTOM_EXTENSIONS）加载使用。
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const HERE = path.join(__dirname, '..');
const CATALOG_PATH = path.join(HERE, 'data', 'embedded-catalog.json');

/** 分类键 -> 中文标签（用于 n8n 节点 UI 显示） */
const CATEGORY_LABELS = {
  lenses: '导演透镜',
  genres: '叙事题材',
  industries: '行业题材',
  forms: '规格',
  looks: '影调质感',
  moves: '运镜与节奏',
};

/** 分类键 -> 子目录名（兼容旧 manifest 结构） */
const CATEGORY_DIRS = {
  lenses: 'lenses',
  genres: 'genres',
  industries: 'industries',
  forms: 'forms',
  looks: 'looks',
  moves: 'moves',
};

/** 缓存成功读到的 catalog。读失败或 JSON 损坏时不写入缓存，下次调用会重试。 */
let _catalog = null;

/** 读取嵌入式 catalog。失败时抛出原始错误，不把空目录永久缓存下来。 */
async function loadCatalog() {
  if (_catalog) return _catalog;
  const parsed = JSON.parse(await fs.readFile(CATALOG_PATH, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid embedded catalog at ${CATALOG_PATH}`);
  }
  _catalog = parsed;
  return _catalog;
}

/** 从列表里按 id 查找 */
function findById(list, id) {
  if (!id || !Array.isArray(list)) return null;
  return list.find((x) => x.id === id) || null;
}

/**
 * 题材下拉（genreAllOptions）同时包含叙事题材和行业题材。
 * 先查 genres，再查 industries，与技能切片的 resolveItem 一致。
 */
function findGenre(catalog, id) {
  if (!id || !catalog) return null;
  return findById(catalog.genres, id) || findById(catalog.industries, id);
}

/** 列出指定分类的所有条目（轻量元数据） */
async function listCategory(category, groupFilter = '', lightweight = false) {
  const catalog = await loadCatalog();
  const list = Array.isArray(catalog[category]) ? catalog[category] : [];
  return list
    .filter((item) => !groupFilter || item.group === groupFilter)
    .map((item) => {
      if (lightweight) {
        return {
          id: item.id,
          name: item.name,
          oneliner: item.oneliner || '',
          group: item.group || '',
          category,
          label: CATEGORY_LABELS[category] || category,
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
        category,
        label: CATEGORY_LABELS[category] || category,
        negativePrompt: item.negativePrompt || '',
        params: item.params || {},
        hasStoryboard: item.hasStoryboard || false,
        prompt: item.prompt || '',
      };
    });
}

/** 获取单个条目的完整数据 */
async function getItem(category, id) {
  const list = await listCategory(category);
  return list.find((item) => item.id === id) || null;
}

/** 获取所有分类的条目总数 */
async function getStats() {
  const catalog = await loadCatalog();
  const stats = {};
  let total = 0;
  for (const [cat, label] of Object.entries(CATEGORY_LABELS)) {
    const arr = Array.isArray(catalog[cat]) ? catalog[cat] : [];
    stats[cat] = { count: arr.length, label };
    total += arr.length;
  }
  stats.total = total;
  return stats;
}

module.exports = {
  CATEGORY_LABELS,
  CATEGORY_DIRS,
  loadCatalog,
  findById,
  findGenre,
  listCategory,
  getItem,
  getStats,
};

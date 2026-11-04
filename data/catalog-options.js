/**
 * 从内嵌 catalog 同步生成 n8n 下拉选项（options / multiOptions）。
 * 供 DSh 导演四件套 / 技能切片 / 提示词构建器节点的 properties 使用。
 */

const catalog = require('./embedded-catalog.json');

/** 把一组条目映射成 n8n options：[{ name, value, description }] */
function toOptions(list, tag = '') {
  return (list || []).map((x) => ({
    name: tag ? `${tag}${x.name}（${x.id}）` : `${x.name}（${x.id}）`,
    value: x.id,
    description: x.oneliner || x.group || x.id,
  }));
}

const lensOptions = toOptions(catalog.lenses);
const genreOptions = toOptions(catalog.genres, '题材·');
const industryOptions = toOptions(catalog.industries, '行业·');
const genreAllOptions = [...genreOptions, ...industryOptions];
const formOptions = toOptions(catalog.forms);
const lookOptions = toOptions(catalog.looks);
const moveOptions = toOptions(catalog.moves);

module.exports = {
  catalog,
  lensOptions,
  genreOptions,
  industryOptions,
  genreAllOptions,
  formOptions,
  lookOptions,
  moveOptions,
};

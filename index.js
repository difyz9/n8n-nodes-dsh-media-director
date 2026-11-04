/**
 * n8n-nodes-dsh-media-director
 * 将 @ninkch/dsh-infinite-canvas 的导演透镜、题材、规格、影调、行业等
 * 创作要素迁移到 n8n 工作流，作为媒体创作节点使用。
 *
 * 入口文件：供 n8n 自定义扩展目录（N8N_CUSTOM_EXTENSIONS）加载。
 * 注意：n8n 会通过 glob 扫描目录内的 *.node.js 文件直接加载，
 * 此 index.js 仅作包入口说明，实际节点在 nodes/ 目录下。
 */

const { DshMediaCatalog } = require('./nodes/DshMediaCatalog/DshMediaCatalog.node.js');
const { DshMediaDirector } = require('./nodes/DshMediaDirector/DshMediaDirector.node.js');
const { DshMediaPromptBuilder } = require('./nodes/DshMediaPromptBuilder/DshMediaPromptBuilder.node.js');
const { DshSkillPack } = require('./nodes/DshSkillPack/DshSkillPack.node.js');

module.exports = {
  nodes: [
    DshMediaCatalog,
    DshMediaDirector,
    DshMediaPromptBuilder,
    DshSkillPack,
  ],
};

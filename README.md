# n8n-nodes-dsh-media-director

将媒体创作要素（导演透镜、题材、规格、影调、行业、运镜与节奏）作为**完全独立的 n8n 插件**使用。

**全部数据嵌入插件内部**（`data/embedded-catalog.json`，共 117 条），运行时**不依赖** `@ninkch/dsh-infinite-canvas` 项目、不依赖任何外部资产路径、不需要配置 `canvasAssetPath`。

---

## 节点列表

| 节点 | 作用 | 对应画布导演套件能力 |
|------|------|---------------------|
| **DSh 媒体清单** | 列出导演透镜、叙事题材、行业题材、规格、影调、运镜与节奏的全部条目元数据 | `canvas_list_skills` |
| **DSh 导演四件套** | 选择导演 × 题材 × 规格 × 影调的组合，输出结构化创作配置（含负向词、技术参数、提示词模板） | 配置（profile） |
| **DSh 技能切片** | 按生成能力（script/storyboard/prompt/assets）切出正确小节并拼装成可注入文本 | `canvas_skill_pack` |
| **DSh 提示词构建器** | 基于已选要素合成 AI 视频/图像生成提示词（中/英文），提取负向词与技术参数 | 提示词构建 |

---

## 安装

在 n8n 的节点安装页面，选择“从文件安装”，或在 n8n 目录下执行：

```bash
cd /path/to/n8n
npm install /path/to/n8n-nodes-dsh-media-director
```

重启 n8n 后，在节点面板搜索 "DSh" 即可看到四个节点。

---

## 使用流程示例

```
[手动触发]
   ↓
[DSh 媒体清单]  →  选一个分类（如“导演透镜”），拿到可用 id 列表
   ↓
[DSh 导演四件套]  →  填写 director=kubrick、genre=wuxia、form=short-drama、look=cold-noir
   ↓
[DSh 技能切片]  →  选 kind（script/storyboard/prompt/assets），切出可注入文本 + 字节数
   ↓
[DSh 提示词构建器]  →  填写场景描述，生成中英文提示词 + 负向词 + 技术参数
   ↓
[HTTP 请求]  →  将 promptFinal 发给 Seedance / Runway / Pika 等 AI 视频生成模型
```

### 技能切片（canvas_skill_pack 等价）

`DSh 技能切片` 节点按「生成能力」切片，绝不整份注入：

| kind | 内容 | 典型字节 |
|------|------|---------|
| `script` | 题材卡全部 + 透镜的叙事/节奏/表演节 + 规格的结构块 | ~12–16KB |
| `storyboard` | 透镜的镜头语言/灯光/风格参数/拍摄清单 + 规格卡 + 运镜词典 + 打斗节奏 | ~12–16KB |
| `prompt` | 透镜的风格参数/灯光/提示词模板 + 影调卡 + 负向词 | ~8–12KB |
| `assets` | 透镜的风格参数/灯光 + 影调卡 | ~4–6KB |

### 四件套说明

| 要素 | 决定什么 | 示例 id |
|------|---------|---------|
| 导演透镜 (lenses) | 构图、机位、光色、节奏、表演注音 | kubrick, miyazaki_hayao, wong_kar_wai |
| 叙事题材 (genres) | 冲突机制、人物机制、回报钩子 | wuxia, xianxia-cultivation, suspense-rule |
| 规格 (forms) | 结构块、ASL、平台、画质基线 | short-drama, cinematic, commercial, documentary |
| 影调 (looks) | 成像底层、色板、光比、材质响应 | cold-noir, ghibli-watercolor, realistic-cinema |

---

## 输出字段示例

### DSh 导演四件套 输出

```json
{
  "director": { "id": "kubrick", "name": "斯坦利·库布里克", "oneliner": "...", "group": "欧美", "tier": "" },
  "genre": { "id": "wuxia", "name": "武侠", "oneliner": "...", "group": "", "aliases": ["武侠","江湖"] },
  "form": { "id": "short-drama", "name": "短剧", "spec": { "durations": [60,90,120,180] } },
  "look": { "id": "cold-noir", "name": "冷调悬疑", "group": "冷调" },
  "selectedCount": 4,
  "promptTemplate": "[导演透镜] 斯坦利·库布里克（kubrick）：……\n[题材] 武侠（wuxia）\n……",
  "negativePrompt": "handheld shake, camera orbit, warm fill light, ...",
  "promptParams": { "focalRange": "18-25mm", "lightRatio": "2:1", "asl": "12-40" },
  "timestamp": "2026-..."
}
```

### DSh 提示词构建器 输出

```json
{
  "promptZh": "场景：一个人站在走廊尽头……\n\n[导演透镜] ……\n\n[影调] ……",
  "promptEn": "Scene: ……\n\n[Director Lens] ……",
  "promptFinal": "中英文双语提示词……",
  "negativePrompt": "handheld shake, warm fill light, ...",
  "technicalParams": { "focalRange": "35-135mm", "lightRatio": "1:5-1:9", ... },
  "storyboardSuggestions": { "hasStoryboard": true, "shotParams": {...} }
}
```

---

## 数据来源与独立性

所有创作要素数据（117 条）在构建时从 `@ninkch/dsh-infinite-canvas` 的 `assets/canvas-director/` 提取，嵌入到 `data/embedded-catalog.json` 中。插件发布后完全自包含：

- ✅ 不需要安装 `@ninkch/dsh-infinite-canvas`
- ✅ 不需要指向原项目的 `assets/` 目录
- ✅ 不需要配置任何外部路径或凭据
- ✅ 离线可用，数据随插件一同分发

如需更新数据，重新运行 `npm run build`（需访问原项目资产目录），或直接编辑 `data/embedded-catalog.json`。

---

## 许可证

Apache-2.0

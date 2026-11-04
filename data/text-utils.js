/**
 * 提示词文本小工具（CommonJS）。
 * 导演四件套与提示词构建器共用：负向词合并、{{var}} 替换。
 */

/** 合并负向词（按中文分隔符拆开后去重，保留首次出现顺序） */
function mergeNegativePrompts(...prompts) {
  const seen = new Set();
  const parts = [];
  for (const p of prompts) {
    if (!p) continue;
    const tokens = String(p).split(/[，、\n\r]+/u).map((t) => t.trim()).filter(Boolean);
    for (const t of tokens) {
      if (!seen.has(t)) {
        seen.add(t);
        parts.push(t);
      }
    }
  }
  return parts.join(', ');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 替换模板中的 {{var}} 占位符。
 * 用函数作为替换值，避免用户变量里的 $& / $1 被 String.replace 吃掉。
 */
function renderTemplate(template, vars) {
  let out = template == null ? '' : String(template);
  const entries = Object.entries(vars || {});
  for (const [key, val] of entries) {
    if (!key) continue;
    const pattern = new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'gu');
    const replacement = val == null ? '' : String(val);
    out = out.replace(pattern, () => replacement);
  }
  return out;
}

/**
 * 提示词构建器用的变量表。
 * sceneDescription 同时挂在 sceneDescription / scene / 场景 上，customVars 同名键覆盖它们。
 */
function buildTemplateVars(sceneDescription, customVars) {
  const scene = sceneDescription == null ? '' : String(sceneDescription);
  const vars = {
    sceneDescription: scene,
    scene,
    场景: scene,
  };
  if (customVars && typeof customVars === 'object' && !Array.isArray(customVars)) {
    for (const [key, val] of Object.entries(customVars)) {
      if (!key) continue;
      vars[key] = val == null ? '' : String(val);
    }
  }
  return vars;
}

module.exports = {
  mergeNegativePrompts,
  renderTemplate,
  buildTemplateVars,
};

/**
 * n8n 节点 execute 循环里共用的条目输出与失败处理（CommonJS）。
 * n8n-workflow 是 peerDependency：装了就用 NodeOperationError，没装就抛原始错误。
 */

function withPairedItem(json, itemIndex) {
  const item = { json };
  if (Number.isInteger(itemIndex) && itemIndex >= 0) {
    item.pairedItem = { item: itemIndex };
  }
  return item;
}

function throwAsNodeError(node, error, itemIndex) {
  const original = error instanceof Error ? error : new Error(String(error));
  let NodeOperationError;
  try {
    ({ NodeOperationError } = require('n8n-workflow'));
  } catch {
    throw original;
  }
  if (node && typeof node.getNode === 'function') {
    throw new NodeOperationError(node.getNode(), original, { itemIndex });
  }
  throw original;
}

/**
 * continueOnFail 为真时把错误写进该条输出并继续；否则让节点失败。
 */
function handleItemError(node, items, error, itemIndex, json) {
  if (typeof node.continueOnFail === 'function' && node.continueOnFail()) {
    items.push(withPairedItem({
      ...(json || {}),
      error: (error && error.message) || String(error),
    }, itemIndex));
    return;
  }
  throwAsNodeError(node, error, itemIndex);
}

module.exports = {
  withPairedItem,
  handleItemError,
};

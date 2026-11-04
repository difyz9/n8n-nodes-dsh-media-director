/**
 * 不依赖 n8n 进程的冒烟测试：行业题材解析、{{var}} 替换、
 * catalog 读失败不粘住空缓存、节点失败行为与图标路径。
 *
 * 用法：node scripts/smoke-test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const catalogPath = path.join(root, 'data', 'embedded-catalog.json');
const loaderPath = require.resolve('../data/data-loader.js');

function freshLoader() {
  delete require.cache[loaderPath];
  return require('../data/data-loader.js');
}

function mockNode(NodeClass, params, { input = [{ json: {} }], continueOnFail = false } = {}) {
  const node = new NodeClass();
  node.getInputData = () => input;
  node.getNodeParameter = (name) => (Object.prototype.hasOwnProperty.call(params, name) ? params[name] : undefined);
  node.continueOnFail = () => continueOnFail;
  return node;
}

async function testCatalogCache() {
  const backup = fs.readFileSync(catalogPath);
  try {
    {
      const { loadCatalog } = freshLoader();
      const first = await loadCatalog();
      assert.ok(first.industries.some((item) => item.id === 'auto'));
      fs.rmSync(catalogPath);
      const second = await loadCatalog();
      assert.equal(second, first);
      fs.writeFileSync(catalogPath, backup);
    }

    {
      fs.rmSync(catalogPath);
      const { loadCatalog } = freshLoader();
      await assert.rejects(() => loadCatalog());
      await assert.rejects(() => loadCatalog());
      fs.writeFileSync(catalogPath, backup);
      const recovered = await loadCatalog();
      assert.ok(recovered.industries.some((item) => item.id === 'auto'));
    }

    {
      fs.writeFileSync(catalogPath, '{');
      const { loadCatalog } = freshLoader();
      await assert.rejects(() => loadCatalog());
      await assert.rejects(() => loadCatalog());
      fs.writeFileSync(catalogPath, '[]');
      await assert.rejects(() => loadCatalog(), /Invalid embedded catalog/);
      await assert.rejects(() => loadCatalog(), /Invalid embedded catalog/);
    }
  } finally {
    fs.writeFileSync(catalogPath, backup);
    freshLoader();
  }
}

async function testLookupsAndNodes() {
  const { loadCatalog, findGenre } = require('../data/data-loader.js');
  const { mergeNegativePrompts, renderTemplate, buildTemplateVars } = require('../data/text-utils.js');
  const { DshMediaDirector } = require('../nodes/DshMediaDirector/DshMediaDirector.node.js');
  const { DshMediaPromptBuilder } = require('../nodes/DshMediaPromptBuilder/DshMediaPromptBuilder.node.js');
  const { DshMediaCatalog } = require('../nodes/DshMediaCatalog/DshMediaCatalog.node.js');
  const { DshSkillPack } = require('../nodes/DshSkillPack/DshSkillPack.node.js');

  const catalog = await loadCatalog();
  assert.equal(findGenre(catalog, 'auto').name, '汽车');
  assert.equal(findGenre(catalog, 'wuxia').id, 'wuxia');
  assert.equal(findGenre(catalog, 'missing-id'), null);

  assert.equal(
    mergeNegativePrompts('handheld shake', 'warm fill light、handheld shake', ''),
    'handheld shake, warm fill light',
  );
  assert.equal(renderTemplate('角色 {{角色}} $', { 角色: 'a $& b' }), '角色 a $& b $');
  assert.equal(
    renderTemplate('{{sceneDescription}} / {{场景}}', buildTemplateVars('门口犹豫', {})),
    '门口犹豫 / 门口犹豫',
  );

  const director = mockNode(DshMediaDirector, {
    director: 'kubrick',
    genre: 'auto',
    form: 'short-drama',
    look: 'cold-noir',
    autoPrompt: true,
  });
  const [directorItems] = await director.execute();
  const directed = directorItems[0];
  assert.equal(directed.pairedItem.item, 0);
  assert.equal(directed.json.genre.id, 'auto');
  assert.equal(directed.json.genre.name, '汽车');
  assert.equal(directed.json.selectedCount, 4);
  assert.match(directed.json.promptTemplate, /汽车（auto）/);
  assert.equal(directed.json.negativePrompt, catalog.looks.find((item) => item.id === 'cold-noir').negativePrompt);

  const narrative = mockNode(DshMediaDirector, { genre: 'wuxia', autoPrompt: true });
  const [narrativeItems] = await narrative.execute();
  assert.equal(narrativeItems[0].json.genre.id, 'wuxia');

  const unknown = mockNode(DshMediaDirector, { genre: 'not-a-real-genre', autoPrompt: false });
  const [unknownItems] = await unknown.execute();
  assert.equal(unknownItems[0].json.genre, null);
  assert.equal(unknownItems[0].json.selectedCount, 0);

  const builder = mockNode(DshMediaPromptBuilder, {
    directorId: '',
    genreId: 'auto',
    formId: '',
    lookId: '',
    sceneDescription: '门口站着{{角色}}',
    customVars: JSON.stringify({ 角色: '侠客' }),
    outputLanguage: 'zh',
    includeStoryboard: false,
  });
  const [builtItems] = await builder.execute();
  const built = builtItems[0];
  assert.equal(built.pairedItem.item, 0);
  assert.equal(built.json.promptFinal.includes('{{'), false);
  assert.match(built.json.promptFinal, /门口站着侠客/);
  assert.match(built.json.promptFinal, /\[题材\]/);
  assert.match(built.json.promptZh, /门缝/);

  const english = mockNode(DshMediaPromptBuilder, {
    genreId: 'auto',
    sceneDescription: 'car door {{part}}',
    customVars: '{"part":"gap"}',
    outputLanguage: 'en',
    includeStoryboard: false,
  });
  const [englishItems] = await english.execute();
  assert.match(englishItems[0].json.promptFinal, /Scene: car door gap/);
  assert.match(englishItems[0].json.promptFinal, /\[Genre\]/);
  assert.equal(englishItems[0].json.promptFinal.includes('{{'), false);

  const badJson = mockNode(DshMediaPromptBuilder, {
    sceneDescription: 'plain scene',
    customVars: '{bad',
    outputLanguage: 'zh',
    includeStoryboard: false,
  });
  const [badItems] = await badJson.execute();
  assert.match(badItems[0].json.promptFinal, /plain scene/);
  assert.deepEqual(badItems[0].json.customVars, {});

  const catalogNode = mockNode(DshMediaCatalog, {
    operation: 'industries',
    groupFilter: '',
    lightweight: true,
  });
  const [catalogItems] = await catalogNode.execute();
  assert.equal(catalogItems[0].pairedItem.item, 0);
  assert.ok(catalogItems[0].json.items.some((item) => item.id === 'auto'));

  const pack = mockNode(DshSkillPack, {
    kind: 'prompt',
    lens: '',
    genres: ['auto'],
    form: '',
    look: '',
    includeMoves: false,
    outputLanguage: 'zh',
  });
  const [packItems] = await pack.execute();
  assert.equal(packItems[0].pairedItem.item, 0);
  assert.deepEqual(packItems[0].json.missed, []);
  assert.equal(packItems[0].json.effective.genres[0].id, 'auto');

  const packNoInput = mockNode(DshSkillPack, {
    kind: 'assets',
    lens: '',
    genres: [],
    form: '',
    look: 'cold-noir',
    includeMoves: false,
    outputLanguage: 'zh',
  }, { input: [] });
  const [noInputItems] = await packNoInput.execute();
  assert.equal(noInputItems[0].pairedItem, undefined);
  assert.equal(noInputItems[0].json.effective.look.id, 'cold-noir');

  const failing = mockNode(DshMediaDirector, {}, { continueOnFail: false });
  failing.getNodeParameter = () => {
    throw new Error('param failed');
  };
  await assert.rejects(() => failing.execute(), /param failed/);

  const continuing = mockNode(DshMediaDirector, {}, { continueOnFail: true, input: [{ json: {} }, { json: {} }] });
  let calls = 0;
  continuing.getNodeParameter = () => {
    calls += 1;
    if (calls === 1) throw new Error('param failed');
    return '';
  };
  const [continued] = await continuing.execute();
  assert.equal(continued.length, 2);
  assert.match(continued[0].json.error, /param failed/);
  assert.equal(continued[0].pairedItem.item, 0);
  assert.equal(continued[1].json.error, undefined);
  assert.equal(continued[1].pairedItem.item, 1);
}

function testPackageAndIcons() {
  const pkg = require('../package.json');
  assert.equal(pkg.name, 'n8n-nodes-dsh-media-director');
  assert.equal(pkg.n8n.n8nNodesApiVersion, 1);
  assert.match(pkg.repository.url, /github\.com\/difyz9\/n8n-nodes-dsh-media-director/);
  assert.equal(pkg.n8n.nodes.length, 4);

  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.equal(readme.includes('三个节点'), false);
  assert.match(readme, /四个节点/);

  const nodeFiles = [
    ['nodes/DshMediaCatalog/DshMediaCatalog.node.js', 'DshMediaCatalog'],
    ['nodes/DshMediaDirector/DshMediaDirector.node.js', 'DshMediaDirector'],
    ['nodes/DshMediaPromptBuilder/DshMediaPromptBuilder.node.js', 'DshMediaPromptBuilder'],
    ['nodes/DshSkillPack/DshSkillPack.node.js', 'DshSkillPack'],
  ];
  for (const [file, exportName] of nodeFiles) {
    const mod = require(path.join(root, file));
    const desc = new mod[exportName]().description;
    assert.equal(desc.icon, 'file:media-director.svg');
    assert.equal(desc.icon.includes('..'), false);
    assert.equal(fs.existsSync(path.join(root, path.dirname(file), 'media-director.svg')), true);
  }
}

async function main() {
  await testCatalogCache();
  testPackageAndIcons();
  await testLookupsAndNodes();
  console.log('smoke ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

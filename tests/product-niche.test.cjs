const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(process.cwd(), 'src', name.slice(2)) : name, ...args);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const Fields = require('../src/app/produtos/niche-product-fields.tsx').default;
const { createProductSchema, updateProductSchema } = require('../src/lib/validations/product.ts');
const { getNicheAttributeKeys } = require('../src/lib/product-attributes.ts');
const render = (niche, attributes = {}) => renderToStaticMarkup(React.createElement(Fields, { niche, attributes, brand: '', onBrandChange() {}, onAttributesChange() {} }));

test('product fields follow the niche and container price follows its checkbox', () => {
 const cosmetics = render('COSMETICS');
 for (const label of ['Marca / Linha', 'Volume / Conteúdo', 'Data de validade', 'Lote']) assert.ok(cosmetics.includes(label));
 assert.ok(!cosmetics.includes('Tamanho') && !cosmetics.includes('Embalagem'));
 const clothing = render('CLOTHING');
 for (const label of ['Tamanho', 'Cor / Estampa', 'Gênero', 'Masculino', 'Feminino', 'Unissex', 'Infantil']) assert.ok(clothing.includes(label));
 assert.ok(!clothing.includes('Marca / Linha') && !clothing.includes('Volume'));
 const beverages = render('BEVERAGES');
 for (const label of ['Embalagem', 'Garrafa Retornável', 'Lata', 'Long Neck', 'PET', 'Chope', 'Volume', 'Exige Vasilhame / Casco']) assert.ok(beverages.includes(label));
 assert.ok(!beverages.includes('Valor do casco'));
 assert.ok(render('BEVERAGES', { requiresContainer: true, containerValue: 12.5 }).includes('Valor do casco'));
 assert.ok(render('CONSTRUCTION').includes('Marca / Fabricante'));
 assert.equal(render('OTHER'), ''); assert.equal(render(null), '');
 assert.deepEqual(getNicheAttributeKeys('CONSTRUCTION'), []);
});

test('optional niche characteristics validate dates, enums, lengths and money without weakening stock rules', () => {
 const base = { name: 'Produto QA', unitOfMeasure: 'un', sellByFraction: false, price: 10, stockQuantity: 3 };
 assert.ok(createProductSchema.safeParse(base).success);
 for (const attributes of [{ expiryDate: '2026-02-30' }, { gender: 'INVALID' }, { packaging: 'INVALID' }, { containerValue: -1 }, { containerValue: 1.234 }, { containerValue: '10' }, { requiresContainer: 'true' }, { volume: 'x'.repeat(121) }, { arbitrary: 'value' }]) assert.equal(createProductSchema.safeParse({ ...base, attributes }).success, false);
 assert.ok(createProductSchema.safeParse({ ...base, attributes: { expiryDate: '2028-02-29', volume: '100ml', lot: null } }).success);
 assert.ok(updateProductSchema.safeParse({ attributes: { color: null } }).success);
 assert.equal(createProductSchema.safeParse({ ...base, stockQuantity: 1.5 }).success, false);
});

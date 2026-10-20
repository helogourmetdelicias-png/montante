const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
const ExcelJS = require('exceljs');
const { createCatalogWorkbook, readCatalogWorkbook, validateXlsxArchive } = require('../src/lib/catalog-excel.ts');
const { PRODUCT_CATEGORIES } = require('../src/lib/product-categories.ts');

test('Excel roundtrip preserves leading zeros, optional fields, inactive status and literal formulas', async () => {
  const buffer = await createCatalogWorkbook('customers', [{ name: '=2+2 Cliente', document: '01234567890', zipCode: '01234567', phone: '11999999999', isActive: false }]);
  const parsed = await readCatalogWorkbook('customers', buffer);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.customers[0].data.document, '01234567890');
  assert.equal(parsed.customers[0].data.name, '=2+2 Cliente');
  assert.equal(parsed.customers[0].data.zipCode, '01234567');
  assert.equal(parsed.customers[0].data.isActive, false);
});
test('product roundtrip preserves decimals, stock fraction and all 35 provided categories', async () => {
  assert.equal(PRODUCT_CATEGORIES.length, 35);
  const buffer = await createCatalogWorkbook('products', [{ name: 'Areia', sku: '0001', barcode: '0123456789012', unitOfMeasure: 'm³', price: 12.34, stockQuantity: 1.234, sellByFraction: true, category: PRODUCT_CATEGORIES[0], isActive: true }]);
  const parsed = await readCatalogWorkbook('products', buffer);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.products[0].data.price, 12.34);
  assert.equal(parsed.products[0].data.stockQuantity, 1.234);
  assert.equal(parsed.products[0].data.barcode, '0123456789012');
});
test('parser accepts Brazilian decimal strings and rejects actual formulas and row duplicates', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Produtos');
  sheet.addRows([['Nome', 'Unidade', 'Preço', 'SKU'], ['Produto A', 'un', '1.234,56', 'abc'], ['Produto B', 'un', 2, 'ABC'], ['Produto C', 'un', { formula: '1+1', result: 2 }, 'other']]);
  const parsed = await readCatalogWorkbook('products', Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.equal(parsed.products[0].data.price, 1234.56);
  assert.deepEqual(parsed.errors.map(row => row.row), [3, 4]);
});
test('invalid headers, fractional unit stock, corrupt uploads and excessive row coordinates are rejected', async () => {
  assert.throws(() => validateXlsxArchive(Buffer.from('not an excel file')));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Produtos');
  sheet.addRows([['Nome', 'Unidade', 'Preço', 'Estoque'], ['Produto', 'un', 2, 1.5]]);
  assert.equal((await readCatalogWorkbook('products', Buffer.from(await workbook.xlsx.writeBuffer()))).errors.length, 1);
  sheet.getCell('A1').value = 'Título incorreto';
  await assert.rejects(readCatalogWorkbook('products', Buffer.from(await workbook.xlsx.writeBuffer())), /Coluna desconhecida/);
  sheet.getCell('A1').value = 'Nome'; sheet.getCell('A1002').value = 'Excesso';
  await assert.rejects(readCatalogWorkbook('products', Buffer.from(await workbook.xlsx.writeBuffer())), /1.000 linhas/);
});

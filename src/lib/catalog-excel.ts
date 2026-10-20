import ExcelJS from 'exceljs';
import { inflateRawSync } from 'node:zlib';
import type { z } from 'zod';
import { createCustomerSchema } from './validations/customer';
import { createProductSchema } from './validations/product';
import { PRODUCT_CATEGORIES } from './product-categories';

export type CatalogKind = 'customers' | 'products';
export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const EXPORT_MAX_ROWS = 10000;
export type ImportIssue = { row: number; message: string };
type Column = { key: string; title: string; kind?: 'number' | 'boolean'; required?: boolean };
export const catalogColumns: Record<CatalogKind, Column[]> = {
  customers: [
    { key: 'name', title: 'Nome', required: true }, { key: 'document', title: 'CPF/CNPJ' },
    { key: 'email', title: 'E-mail' }, { key: 'phone', title: 'Telefone' }, { key: 'zipCode', title: 'CEP' },
    { key: 'street', title: 'Rua' }, { key: 'number', title: 'Número' }, { key: 'neighborhood', title: 'Bairro' },
    { key: 'city', title: 'Cidade' }, { key: 'state', title: 'UF' }, { key: 'isActive', title: 'Ativo', kind: 'boolean' },
  ],
  products: [
    { key: 'name', title: 'Nome', required: true }, { key: 'sku', title: 'SKU' }, { key: 'barcode', title: 'Código de barras' },
    { key: 'unitOfMeasure', title: 'Unidade', required: true }, { key: 'price', title: 'Preço', kind: 'number', required: true },
    { key: 'stockQuantity', title: 'Estoque', kind: 'number' }, { key: 'sellByFraction', title: 'Fracionado', kind: 'boolean' },
    { key: 'category', title: 'Categoria' }, { key: 'description', title: 'Descrição' }, { key: 'brand', title: 'Marca' },
    { key: 'costPrice', title: 'Custo', kind: 'number' }, { key: 'stockMinAlert', title: 'Estoque mínimo', kind: 'number' },
    { key: 'stockAisle', title: 'Corredor' }, { key: 'stockShelf', title: 'Prateleira' }, { key: 'isActive', title: 'Ativo', kind: 'boolean' },
  ],
};
const sheetName = (kind: CatalogKind) => kind === 'customers' ? 'Clientes' : 'Produtos';
const normalize = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Bound ZIP expansion and worksheet coordinates before handing user input to the XLSX parser. */
export function validateXlsxArchive(buffer: Buffer) {
  if (buffer.length > IMPORT_MAX_BYTES || buffer.length < 22) throw new Error('Arquivo inválido ou maior que 2 MB.');
  let end = buffer.length - 22;
  while (end >= Math.max(0, buffer.length - 65557) && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || buffer.readUInt32LE(end) !== 0x06054b50) throw new Error('Envie uma planilha Excel .xlsx válida.');
  const entries = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  if (entries > 100 || offset === 0xffffffff) throw new Error('A planilha excede os limites de importação.');
  let totalSize = 0;
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Arquivo Excel inválido.');
    const flags = buffer.readUInt16LE(offset + 8), method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20), size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28), extra = buffer.readUInt16LE(offset + 30), comment = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    totalSize += size;
    if (flags & 1 || ![0, 8].includes(method) || totalSize > 10 * 1024 * 1024 || /vbaProject|externalLinks|xl\/media\//i.test(name)) throw new Error('Use uma planilha simples, sem senha, macros, imagens ou vínculos externos, até 10 MB descompactados.');
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) throw new Error('Arquivo Excel inválido.');
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    if (start + compressed > buffer.length) throw new Error('Arquivo Excel incompleto.');
    if (/\.xml$/i.test(name)) {
      const raw = buffer.subarray(start, start + compressed);
      const expanded = method === 8 ? inflateRawSync(raw, { maxOutputLength: 10 * 1024 * 1024 }) : raw;
      if (expanded.length !== size) throw new Error('Tamanho interno da planilha inválido.');
      const xml = expanded.toString('utf8');
      if (/<!DOCTYPE/i.test(xml)) throw new Error('Conteúdo XML não permitido.');
      if (/xl\/worksheets\//.test(name)) {
        let rows = 0, cells = 0;
        for (const ignored of xml.matchAll(/<row\b/g)) { void ignored; if (++rows > IMPORT_MAX_ROWS + 1) throw new Error('Use até 1.000 linhas de dados.'); }
        for (const ignored of xml.matchAll(/<c\b/g)) { void ignored; if (++cells > (IMPORT_MAX_ROWS + 1) * 26) throw new Error('Planilha com células demais.'); }
        for (const match of xml.matchAll(/\br\s*=\s*["']([A-Z]*)(\d+)["']/g)) {
          if (Number(match[2]) > IMPORT_MAX_ROWS + 1 || match[1].length > 1) throw new Error('Use até 1.000 linhas de dados e 26 colunas por planilha.');
        }
      }
    }
    offset += 46 + nameLength + extra + comment;
  }
}

function readValue(cell: ExcelJS.Cell, column: Column): unknown {
  const value = cell.value;
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'object') throw new Error(`${column.title}: use valores simples, sem fórmulas, links ou datas.`);
  if (column.kind === 'number') {
    if (typeof value === 'number') return value;
    const text = String(value).trim();
    const valid = text.includes(',') ? /^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d+$/.test(text) : /^-?\d+(?:\.\d+)?$/.test(text);
    if (!valid) throw new Error(`${column.title}: use um número ou valor decimal com vírgula.`);
    const number = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text);
    if (!text || !Number.isFinite(number)) throw new Error(`${column.title}: número inválido.`);
    return number;
  }
  if (column.kind === 'boolean') {
    const text = normalize(String(value));
    if (['sim', 'true', '1'].includes(text)) return true;
    if (['nao', 'false', '0'].includes(text)) return false;
    throw new Error(`${column.title}: informe Sim ou Não.`);
  }
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || Math.abs(value) > 999999999999999)) throw new Error(`${column.title}: formate o campo como texto para preservar seus dígitos.`);
  return typeof value === 'number' ? cell.text.trim() : String(value).trim();
}

export async function readCatalogWorkbook(kind: CatalogKind, buffer: Buffer) {
  validateXlsxArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer, { ignoreNodes: ['dataValidations', 'mergeCells', 'conditionalFormatting', 'drawing', 'extLst', 'hyperlinks'] });
  const sheet = workbook.getWorksheet(sheetName(kind)) ?? (workbook.worksheets.length === 1 ? workbook.worksheets[0] : undefined);
  if (!sheet) throw new Error(`A planilha precisa ter uma aba ${sheetName(kind)}.`);
  if (sheet.rowCount > IMPORT_MAX_ROWS + 1 || sheet.columnCount > 26) throw new Error('Limite de 1.000 linhas e 26 colunas excedido.');
  const columns = catalogColumns[kind];
  const headerMap = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, index) => {
    const name = normalize(String(cell.value ?? ''));
    const column = columns.find(col => normalize(col.title) === name || normalize(col.key) === name);
    if (!column) throw new Error(`Coluna desconhecida: ${cell.text}. Use o modelo disponível na tela.`);
    if (headerMap.has(column.key)) throw new Error(`Coluna repetida: ${column.title}.`);
    headerMap.set(column.key, index);
  });
  for (const column of columns) if (column.required && !headerMap.has(column.key)) throw new Error(`Coluna obrigatória ausente: ${column.title}.`);
  const customers: { row: number; data: z.infer<typeof createCustomerSchema> }[] = [];
  const products: { row: number; data: z.infer<typeof createProductSchema> }[] = [];
  const errors: ImportIssue[] = [];
  const seen = new Map<string, number>();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || !row.hasValues) return;
    try {
      const input: Record<string, unknown> = {};
      for (const column of columns) input[column.key] = headerMap.has(column.key) ? readValue(row.getCell(headerMap.get(column.key)!), column) : undefined;
      if (Object.values(input).every(value => value === undefined)) return;
      input.isActive ??= true;
      if (kind === 'products') { input.sellByFraction ??= false; input.stockQuantity ??= 0; }
      const parsed = kind === 'customers' ? createCustomerSchema.safeParse(input) : createProductSchema.safeParse(input);
      if (!parsed.success) { errors.push({ row: rowNumber, message: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') }); return; }
      if (kind === 'customers') {
        const data = createCustomerSchema.parse(input);
        if (data.document) {
          if (seen.has(data.document)) throw new Error(`CPF/CNPJ repetido na linha ${seen.get(data.document)}.`);
          seen.set(data.document, rowNumber);
        }
        customers.push({ row: rowNumber, data });
      } else {
        const data = createProductSchema.parse(input);
        data.sku = data.sku?.trim().toUpperCase() || null;
        data.barcode = data.barcode?.trim().toUpperCase() || null;
        for (const key of ['sku', 'barcode'] as const) if (data[key]) {
          const value = `${key}:${data[key]}`;
          if (seen.has(value)) throw new Error(`${key} repetido na linha ${seen.get(value)}.`);
          seen.set(value, rowNumber);
        }
        products.push({ row: rowNumber, data });
      }
    } catch (error) { errors.push({ row: rowNumber, message: error instanceof Error ? error.message : 'Linha inválida.' }); }
  });
  if (!customers.length && !products.length && !errors.length) throw new Error('A planilha está vazia. Preencha pelo menos uma linha.');
  return { customers, products, errors };
}

export async function createCatalogWorkbook(kind: CatalogKind, rows: Record<string, unknown>[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName(kind), { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = catalogColumns[kind].map(col => ({ header: col.title, key: col.key, width: col.key === 'name' ? 36 : 22 }));
  for (const column of catalogColumns[kind]) {
    sheet.getColumn(column.key).numFmt = column.kind === 'number' ? (column.key === 'stockQuantity' || column.key === 'stockMinAlert' ? '0.000' : '0.00') : '@';
  }
  for (const row of rows) sheet.addRow(Object.fromEntries(catalogColumns[kind].map(col => [col.key,
    row[col.key] === null || row[col.key] === undefined ? '' : col.kind === 'boolean' ? row[col.key] ? 'Sim' : 'Não' : col.kind === 'number' ? Number(row[col.key]) : String(row[col.key]),
  ])));
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: catalogColumns[kind].length } };
  const instructions = workbook.addWorksheet('Instruções');
  instructions.getColumn(1).width = 95;
  instructions.addRows([
    ['Importação cria novos cadastros. Não altera registros existentes.'],
    ['Até 1.000 linhas por importação. Corrija os erros antes de confirmar.'],
    ['CPF/CNPJ, CEP, SKU e código de barras devem ser texto para preservar zeros.'],
    ['Use valores numéricos ou decimais com vírgula. Para Ativo/Fracionado: Sim ou Não.'],
    ['Não use fórmulas. Campos vazios opcionais permanecem vazios; Ativo assume Sim e Fracionado assume Não.'],
    ...catalogColumns[kind].map(col => [`${col.title}: ${col.required ? 'obrigatório' : 'opcional'}`]),
  ]);
  if (kind === 'products') {
    const categories = workbook.addWorksheet('Categorias');
    categories.getColumn(1).width = 65;
    categories.addRows([['Categoria'], ...PRODUCT_CATEGORIES.map(name => [name])]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

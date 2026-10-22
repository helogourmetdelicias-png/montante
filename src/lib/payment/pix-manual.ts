import { createHash } from 'node:crypto';
import QRCode from 'qrcode';

export class ManualPixConfigurationError extends Error {}

export const PIX_KEY_TYPES = ['telefone', 'cpf', 'cnpj', 'email', 'aleatoria'] as const;
export type PixKeyType = typeof PIX_KEY_TYPES[number];
export type ManualPixConfig = { pixKey: string; pixKeyType: PixKeyType; merchantName: string; merchantCity: string };

export function normalizePixKey(value: string, type?: string): { key: string; type: PixKeyType } {
  const raw = value.trim();
  const digits = raw.replace(/[.\s()/+-]/g, '');
  let keyType = type?.trim();
  if (!keyType) {
    if (raw.includes('@')) keyType = 'email';
    else if (/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(raw)) keyType = 'aleatoria';
    else if (/^\+/.test(raw) || /[()]/.test(raw)) keyType = 'telefone';
    else if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(raw)) keyType = 'cpf';
    else if (/^\d{14}$/.test(digits)) keyType = 'cnpj';
    else throw new ManualPixConfigurationError('Selecione o tipo da chave Pix nas configurações de pagamentos. Telefone e CPF podem ter 11 números.');
  }
  let key = raw;
  let valid = false;
  switch (keyType) {
    case 'telefone':
      if (/^[+\d\s().-]+$/.test(raw)) {
        key = raw.startsWith('+') ? `+${digits}` : /^\d{10,11}$/.test(digits) ? `+55${digits}` : digits.startsWith('55') ? `+${digits}` : '';
        valid = /^\+[1-9]\d{7,14}$/.test(key);
      }
      break;
    case 'cpf': key = digits; valid = /^\d{11}$/.test(key); break;
    case 'cnpj': key = digits.toUpperCase(); valid = /^[A-Z\d]{12}\d{2}$/.test(key); break;
    case 'email': key = raw.toLowerCase(); valid = /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d-]+(?:\.[a-z\d-]+)+$/.test(key); break;
    case 'aleatoria': key = raw.toLowerCase(); valid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(key); break;
  }
  if (!valid || key.length > 77) throw new ManualPixConfigurationError('Confira a chave Pix e o tipo selecionado nas configurações de pagamentos.');
  return { key, type: keyType as PixKeyType };
}

function merchantText(value: string, max: number, field: string) {
  const result = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\d $%*+\-./:]/gi, '').replace(/\s+/g, ' ').trim().slice(0, max);
  if (!result) throw new ManualPixConfigurationError(`Informe ${field} nas configurações do Pix manual.`);
  return result;
}

export function resolveManualPixConfig(credentials: Record<string, unknown>, tenant?: { name: string; address_city: string | null }): ManualPixConfig {
  const text = (field: string) => typeof credentials[field] === 'string' ? credentials[field] as string : '';
  const { key, type } = normalizePixKey(text('pix_key'), text('pix_key_type'));
  return {
    pixKey: key, pixKeyType: type,
    merchantName: merchantText(text('merchant_name') || tenant?.name || '', 25, 'o nome do recebedor'),
    merchantCity: merchantText(text('merchant_city') || tenant?.address_city || '', 15, 'a cidade do recebedor'),
  };
}

function field(id: string, value: string) {
  const size = Buffer.byteLength(value, 'utf8');
  if (size > 99) throw new ManualPixConfigurationError('Os dados do Pix excedem o tamanho permitido.');
  return `${id}${String(size).padStart(2, '0')}${value}`;
}

export function pixCrc16(value: string) {
  let crc = 0xffff;
  for (const byte of Buffer.from(value, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** BR Code, BCB manual §2.6: key, BRL, amount, receiver, reference and CRC16. */
export function createStaticPixPayload(config: ManualPixConfig, amountCents?: number, txid = '***') {
  const key = normalizePixKey(config.pixKey, config.pixKeyType).key;
  if (amountCents !== undefined && (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 9_999_999_999)) throw new Error('O valor do Pix deve ser positivo e informado em centavos inteiros.');
  if (txid !== '***' && !/^[a-z\d]{1,25}$/i.test(txid)) throw new Error('Identificador Pix inválido.');
  const payload = field('00', '01') + field('26', field('00', 'br.gov.bcb.pix') + field('01', key)) + field('52', '0000') + field('53', '986') +
    (amountCents === undefined ? '' : field('54', (amountCents / 100).toFixed(2))) + field('58', 'BR') +
    field('59', merchantText(config.merchantName, 25, 'o nome do recebedor')) + field('60', merchantText(config.merchantCity, 15, 'a cidade do recebedor')) +
    field('62', field('05', txid)) + '6304';
  return payload + pixCrc16(payload);
}

export async function createManualPixPayment(config: ManualPixConfig, amountCents: number, reference?: string) {
  const txid = reference ? createHash('sha256').update(reference).digest('hex').slice(0, 25) : '***';
  const pixCopyPaste = createStaticPixPayload(config, amountCents, txid);
  // Local generation: no customer's payment data is sent to an image service.
  const png = await QRCode.toBuffer(pixCopyPaste, { type: 'png', errorCorrectionLevel: 'M', margin: 4, scale: 8 });
  return { pixCopyPaste, pixQrCode: png.toString('base64') };
}

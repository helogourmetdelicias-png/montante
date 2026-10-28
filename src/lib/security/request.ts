export class RequestError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

/** JSON/multipart mutations are same-origin; Origin-less CLI requests remain testable. */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new RequestError('Origem não autorizada.', 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new RequestError('Origem não autorizada.', 403);
}

export async function boundedFormData(request: Request, maxBytes: number) {
  if (!request.body) throw new RequestError('Selecione uma imagem.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > maxBytes + 65536) { await reader.cancel(); throw new RequestError('A imagem deve ter até 3 MB.', 413); }
    chunks.push(part.value);
  }
  return new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData();
}

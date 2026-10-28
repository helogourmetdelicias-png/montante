const { createClient } = require('@supabase/supabase-js');
const bucketName = 'montante-images';
(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configure as variáveis do Supabase no ambiente.');
  const storage = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).storage;
  const current = await storage.getBucket(bucketName);
  if (current.data) {
    if (current.data.public) throw new Error('O bucket existente é público. Revise a configuração antes de habilitar uploads.');
    console.log('Bucket privado montante-images já configurado.');
    return;
  }
  if (!['404', '400'].includes(String(current.error?.statusCode ?? current.error?.status))) throw new Error('Não foi possível consultar o armazenamento.');
  const created = await storage.createBucket(bucketName, { public: false, fileSizeLimit: 3 * 1024 * 1024, allowedMimeTypes: ['image/webp'] });
  if (created.error) throw new Error('Não foi possível criar o bucket privado. Confira as permissões do Supabase.');
  console.log('Bucket privado montante-images criado; limite de 3 MB e imagens WebP validadas pelo servidor.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });

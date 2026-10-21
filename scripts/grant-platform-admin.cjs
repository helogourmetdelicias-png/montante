const { PrismaClient } = require('@prisma/client');

// Explicit maintenance operation. No application route grants this permission.
const [id, email, tenantSlug] = process.argv.slice(2);
if (!id || !email || !tenantSlug) throw new Error('Informe ID da conta, e-mail e identificador da loja.');
const prisma = new PrismaClient();
(async () => {
  try {
    const where = { id, email: { equals: email, mode: 'insensitive' }, role: 'owner', is_active: true, tenant: { slug: tenantSlug, is_active: true } };
    const account = await prisma.user.findFirst({ where, select: { id: true, is_platform_admin: true } });
    if (!account) throw new Error('Conta ativa de proprietário não encontrada com os três identificadores. Nada foi alterado.');
    const result = await prisma.user.updateMany({ where, data: { is_platform_admin: true } });
    if (result.count !== 1) throw new Error('A conta mudou durante a validação. Verifique antes de repetir.');
    console.log('Acesso geral habilitado para a conta indicada. É necessário entrar novamente usando a senha.');
  } finally { await prisma.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

export const money = (value: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
export const dateTime = (date: Date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
export const saleStatus = (status: string) => ({ completed: 'Concluída', pending: 'Pendente', cancelled: 'Cancelada' }[status] ?? status);
export const paymentMethod = (method: string) => ({ FIADO: 'Fiado', CASH: 'Dinheiro', PIX: 'Pix', CREDIT_CARD: 'Cartão de crédito', DEBIT_CARD: 'Cartão de débito' }[method.toUpperCase()] ?? method);

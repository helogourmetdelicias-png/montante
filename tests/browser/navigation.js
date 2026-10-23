export const useRouter = () => ({ refresh: () => window.dispatchEvent(new Event('sale-refresh')) });

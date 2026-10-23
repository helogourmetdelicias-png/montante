import { headers } from 'next/headers';
import { localTestAccounts } from '@/lib/saved-login-accounts';
import LoginForm from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const initialAccounts = localTestAccounts(process.env.NODE_ENV, (await headers()).get('host'), process.env.LOGIN_TEST_ACCOUNTS);
  return <LoginForm initialAccounts={initialAccounts} />;
}

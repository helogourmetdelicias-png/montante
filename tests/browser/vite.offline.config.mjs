import { mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import base from './vite.personalization.config.mjs';
export default mergeConfig(base, { publicDir: fileURLToPath(new URL('../../public', import.meta.url)) });

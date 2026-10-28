import { mergeConfig } from 'vite';
import base from './vite.config.mjs';
// Next normally replaces process.env in client bundles; supply the same boundary in this isolated UI harness.
export default mergeConfig(base, { define: { 'process.env': { NODE_ENV: 'development' } } });

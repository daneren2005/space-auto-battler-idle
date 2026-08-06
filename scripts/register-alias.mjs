// Registers the `@/…` path-alias resolve hook (alias-loader.mjs) so `node --import ./scripts/register-alias.mjs`
// can run the TypeScript report scripts in this folder with the same alias the app and tests use.
import { register } from 'node:module';

register('./alias-loader.mjs', import.meta.url);

/** Registers the resolver in scripts/loader.mjs. See that file for why. */
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);

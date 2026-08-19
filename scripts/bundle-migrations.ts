import { writeFileSync } from 'node:fs';
import { buildBundle, migrationFiles } from './bundleMigrations';

const bundle = buildBundle();
writeFileSync('supabase/RUN_ALL_MIGRATIONS.sql', bundle);
console.log(`wrote supabase/RUN_ALL_MIGRATIONS.sql -- ${migrationFiles().length} migrations, ${bundle.length} bytes`);

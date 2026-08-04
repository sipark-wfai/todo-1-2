// drizzle-kit은 SvelteKit 런타임 밖에서 실행되므로 $env/static/private가 아니라
// process.env를 읽는다 (docs/ERD.md §6).

import { defineConfig } from 'drizzle-kit';

const url = process.env.DB_URL;
if (!url) throw new Error('DB_URL이 설정되지 않았습니다. .env를 확인하세요.');

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './src/lib/server/db/migrations',
	dialect: 'sqlite',
	dbCredentials: { url }
});

// Vitest 전역 설정.
//
// store.ts는 client.ts의 싱글턴 커넥션을 쓴다. 테스트마다 DB를 새로 만드는 대신
// 마이그레이션을 한 번 적용하고, 각 테스트 전에 모든 행을 지워 격리한다.
//
// 대상 DB는 .env.test의 DB_URL이다. mode=test에서 Vite가 그 파일을 읽으므로
// $env/static/private로 들어오는 값도 테스트 DB를 가리킨다.

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeAll, beforeEach } from 'vitest';
import { db, sqlite } from '../../src/lib/server/db/client';

beforeAll(() => {
	// 개발 DB를 건드리면 안 된다. 경로를 확인하고 아니면 즉시 실패시킨다.
	const file = sqlite.name;
	if (!/test-unit\.db$/.test(file)) {
		throw new Error(
			`테스트가 개발 DB를 가리키고 있습니다: ${file}\n.env.test의 DB_URL을 확인하세요.`
		);
	}
	migrate(db, { migrationsFolder: 'src/lib/server/db/migrations' });
});

beforeEach(() => {
	// 외래 키 CASCADE에 의존하지 않고 순서대로 지운다.
	sqlite.exec('delete from task_tags');
	sqlite.exec('delete from tasks');
	sqlite.exec('delete from tags');
	// AUTOINCREMENT 카운터도 되돌려 테스트가 id를 예측할 수 있게 한다.
	sqlite.exec("delete from sqlite_sequence where name in ('tasks', 'tags')");
});

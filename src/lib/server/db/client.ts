// SQLite 커넥션. 서버 전용이므로 $lib/server 아래에 둔다 (PRD NFR-501).

import { DB_URL } from '$env/static/private';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

/** libsql 호환을 위해 DB_URL은 `file:` 접두사를 쓴다. better-sqlite3는 경로만 받는다. */
export function resolveDbPath(url: string): string {
	return url.replace(/^file:/, '');
}

const path = resolveDbPath(DB_URL);
mkdirSync(dirname(path), { recursive: true });

const sqlite = new Database(path);

// docs/ERD.md §4 — 커넥션 직후 첫 문장으로 실행한다 (PRD NFR-201).
//
// better-sqlite3 v13은 foreign_keys=ON, synchronous=NORMAL, busy_timeout=5000을
// 이미 기본값으로 켜므로 아래 호출은 현재 드라이버에서는 중복이다. 그래도 남겨둔다:
// 요구사항(NFR-201)을 코드에 드러내고, 드라이버를 libsql로 바꾸거나 기본값이 달라져도
// 동작이 변하지 않게 하기 위함이다. raw SQLite에서 foreign_keys는 커넥션마다 기본 OFF이고,
// 이때 ON DELETE CASCADE가 조용히 동작하지 않아 task_tags에 고아 행이 쌓인다 (NFR-202).
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export { sqlite };

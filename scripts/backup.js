// DB 백업 (PRD FT-603, NFR-204).
//
// WAL 모드에서는 todo.db 파일만 복사하면 -wal에 있는 최근 커밋이 유실된다.
// 실측: 커넥션이 열려 WAL이 살아있는 상태에서 .db만 복사하면 마지막 커밋 1건이 빠졌다.
//
// VACUUM INTO는 WAL 내용까지 반영한 단일 파일을 만들고, 덤으로 조각화도 정리한다.
// 실행 중인 앱을 멈추지 않아도 안전하다.
//
// 사용: npm run db:backup [출력경로]

import Database from 'better-sqlite3';
import { config } from 'dotenv';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

config();

const url = process.env.DB_URL;
if (!url) throw new Error('DB_URL이 설정되지 않았습니다. .env를 확인하세요.');

const source = url.replace(/^file:/, '');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = resolve(process.argv[2] ?? `./data/backup/todo-${stamp}.db`);

mkdirSync(dirname(target), { recursive: true });

const db = new Database(source, { readonly: true });
// VACUUM INTO는 대상 파일이 이미 있으면 실패한다. 덮어쓰기 사고를 막아주므로 그대로 둔다.
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();

const check = new Database(target, { readonly: true });
const { n } = check.prepare('select count(*) as n from tasks').get();
check.close();

console.log(`백업 완료: ${target}`);
console.log(`  할 일 ${n}건이 담겼습니다.`);
console.log('  복원: 이 파일을 DB_URL 경로로 복사하면 됩니다.');

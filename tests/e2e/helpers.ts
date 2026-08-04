// E2E용 DB 조작 헬퍼.
//
// 화면을 통해 데이터를 만들면 준비 단계가 길어지고 테스트가 서로 얽힌다.
// 시드는 DB에 직접 넣고, 검증은 화면에서 한다.
//
// dev 서버가 같은 파일에 커넥션을 열고 있지만 WAL 모드라 다중 읽기 + 단일 쓰기가 가능하다.

import Database from 'better-sqlite3';
import { resolve } from 'node:path';

export const E2E_DB = resolve('./data/test-e2e.db');

function open() {
	const db = new Database(E2E_DB);
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 5000');
	return db;
}

/** 오늘 자정 기준 offset일의 Unix 초 */
export function day(offset: number): number {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + offset);
	return Math.floor(d.getTime() / 1000);
}

export function resetDb() {
	const db = open();
	try {
		db.exec('delete from task_tags');
		db.exec('delete from tasks');
		db.exec('delete from tags');
		db.exec("delete from sqlite_sequence where name in ('tasks', 'tags')");
	} finally {
		db.close();
	}
}

export interface SeedTask {
	title: string;
	description?: string | null;
	priority?: 1 | 2 | 3;
	/** 오늘 기준 offset일. null이면 마감일 없음 */
	dueOffset?: number | null;
	completedOffset?: number | null;
	tags?: string[];
}

/** 태그는 이름으로 자동 생성된다. 반환값은 삽입된 할 일 id 목록. */
export function seed(tasks: SeedTask[]): number[] {
	const db = open();
	try {
		const now = Math.floor(Date.now() / 1000);
		const tagId = new Map<string, number>();
		const insertTag = db.prepare('insert into tags (name, created_at) values (?, ?)');
		const insertTask = db.prepare(
			`insert into tasks (title, description, completed_at, due_date, priority, created_at, updated_at)
			 values (?, ?, ?, ?, ?, ?, ?)`
		);
		const link = db.prepare('insert into task_tags (task_id, tag_id) values (?, ?)');

		return db.transaction(() => {
			const ids: number[] = [];
			for (const task of tasks) {
				const id = Number(
					insertTask.run(
						task.title,
						task.description ?? null,
						task.completedOffset == null ? null : day(task.completedOffset),
						task.dueOffset == null ? null : day(task.dueOffset),
						task.priority ?? 2,
						now,
						now
					).lastInsertRowid
				);
				for (const name of task.tags ?? []) {
					if (!tagId.has(name)) tagId.set(name, Number(insertTag.run(name, now).lastInsertRowid));
					link.run(id, tagId.get(name)!);
				}
				ids.push(id);
			}
			return ids;
		})();
	} finally {
		db.close();
	}
}

/** 태그만 만든다 (할 일 없는 태그 검증용) */
export function seedTags(names: string[]): number[] {
	const db = open();
	try {
		const now = Math.floor(Date.now() / 1000);
		const insert = db.prepare('insert into tags (name, created_at) values (?, ?)');
		return db.transaction(() => names.map((n) => Number(insert.run(n, now).lastInsertRowid)))();
	} finally {
		db.close();
	}
}

/** 화면이 아니라 DB에서 직접 확인해야 하는 값들 */
export function readTask(id: number) {
	const db = open();
	try {
		return db.prepare('select * from tasks where id = ?').get(id) as
			| {
					id: number;
					title: string;
					description: string | null;
					completed_at: number | null;
					due_date: number | null;
					priority: number;
					created_at: number;
					updated_at: number;
			  }
			| undefined;
	} finally {
		db.close();
	}
}

export function counts() {
	const db = open();
	try {
		const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
		return {
			tasks: one('select count(*) as n from tasks'),
			tags: one('select count(*) as n from tags'),
			links: one('select count(*) as n from task_tags')
		};
	} finally {
		db.close();
	}
}

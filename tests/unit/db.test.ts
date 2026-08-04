// DB 레벨 보장: FR-109, FR-402, FR-403, FR-301, FR-601 ~ FR-603, NFR-201, NFR-202
//
// 앱 검증과 별개로 DB가 스스로 막아주는지 확인한다. 애플리케이션 코드에 버그가 생겨도
// 잘못된 데이터가 들어가지 않아야 한다는 이중 방어를 검증하는 것이다.

import Database from 'better-sqlite3';
import { isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, sqlite } from '../../src/lib/server/db/client';
import { tasks } from '../../src/lib/server/db/schema';
import {
	createTag,
	createTask,
	deleteTag,
	deleteTask,
	orderBy,
	updateTask
} from '../../src/lib/server/store';

const insertTask = (title: string, priority = 2, description: string | null = null) =>
	sqlite
		.prepare(
			'insert into tasks (title, description, priority, created_at, updated_at) values (?, ?, ?, 0, 0)'
		)
		.run(title, description, priority);

describe('NFR-201 커넥션 PRAGMA', () => {
	// pragma()는 [{ journal_mode: 'wal' }] 형태로 돌려준다. 키 이름이 PRAGMA마다 달라
	// (busy_timeout은 'timeout') 값만 꺼낸다.
	const pragma = (name: string): unknown => {
		const rows = sqlite.pragma(name) as Record<string, unknown>[];
		return Object.values(rows[0])[0];
	};

	it('journal_mode = WAL', () => {
		expect(pragma('journal_mode')).toBe('wal');
	});

	it('synchronous = NORMAL (1)', () => {
		expect(pragma('synchronous')).toBe(1);
	});

	it('foreign_keys = ON', () => {
		expect(pragma('foreign_keys')).toBe(1);
	});

	it('busy_timeout = 5000', () => {
		expect(pragma('busy_timeout')).toBe(5000);
	});
});

describe('FR-102 / FR-103 CHECK 제약 (앱 검증과 이중 방어)', () => {
	it('공백만인 제목을 DB가 거부한다', () => {
		expect(() => insertTask('   ')).toThrow(/tasks_title_len/);
	});

	it('201자 제목을 DB가 거부한다', () => {
		expect(() => insertTask('가'.repeat(201))).toThrow(/tasks_title_len/);
		expect(() => insertTask('가'.repeat(200))).not.toThrow();
	});

	it('2001자 설명을 DB가 거부한다', () => {
		expect(() => insertTask('설명 길이', 2, '가'.repeat(2001))).toThrow(/tasks_description_len/);
		expect(() => insertTask('설명 길이 통과', 2, '가'.repeat(2000))).not.toThrow();
	});
});

describe('FR-301 우선순위 제약', () => {
	it('1·2·3만 허용한다', () => {
		for (const p of [1, 2, 3]) expect(() => insertTask(`우선순위 ${p}`, p)).not.toThrow();
	});

	it('범위를 벗어난 값을 거부한다', () => {
		for (const p of [0, 4, 9, -1]) {
			expect(() => insertTask(`잘못된 ${p}`, p)).toThrow(/tasks_priority_range/);
		}
	});

	it('기본값은 2(보통)이다', () => {
		sqlite.prepare('insert into tasks (title, created_at, updated_at) values (?, 0, 0)').run('기본값');
		const row = sqlite.prepare('select priority from tasks where title = ?').get('기본값') as {
			priority: number;
		};
		expect(row.priority).toBe(2);
	});
});

describe('FR-402 / FR-403 태그 제약', () => {
	it('lower(name) 유니크 인덱스가 대소문자 무시 중복을 막는다', () => {
		const insert = (name: string) =>
			sqlite.prepare('insert into tags (name, created_at) values (?, 0)').run(name);

		insert('ZZTest');
		expect(() => insert('zztest')).toThrow(/idx_tags_name_nocase/);
		expect(() => insert('ZZTEST')).toThrow(/idx_tags_name_nocase/);
	});

	it('31자 태그 이름을 DB가 거부한다', () => {
		const insert = (name: string) =>
			sqlite.prepare('insert into tags (name, created_at) values (?, 0)').run(name);
		expect(() => insert('가'.repeat(31))).toThrow(/tags_name_len/);
		expect(() => insert('가'.repeat(30))).not.toThrow();
	});
});

describe('NFR-202 / FR-109 외래 키 CASCADE', () => {
	function linked() {
		const tag = createTag('업무');
		const task = createTask('연결된 할 일');
		updateTask(task.id, {
			title: '연결된 할 일',
			description: null,
			dueDate: null,
			priority: 2,
			completed: false,
			tagIds: [tag.id]
		});
		return { tagId: tag.id, taskId: task.id };
	}

	const linkCount = () =>
		(sqlite.prepare('select count(*) as n from task_tags').get() as { n: number }).n;

	const orphanCount = () =>
		(
			sqlite
				.prepare(
					`select count(*) as n from task_tags
					 where task_id not in (select id from tasks)
					    or tag_id not in (select id from tags)`
				)
				.get() as { n: number }
		).n;

	it('할 일을 지우면 연결이 함께 사라진다', () => {
		const { taskId } = linked();
		expect(linkCount()).toBe(1);
		deleteTask(taskId);
		expect(linkCount()).toBe(0);
		expect(orphanCount()).toBe(0);
	});

	it('태그를 지우면 연결이 함께 사라진다', () => {
		const { tagId } = linked();
		deleteTag(tagId);
		expect(linkCount()).toBe(0);
		expect(orphanCount()).toBe(0);
	});

	it('존재하지 않는 태그로 연결을 만들 수 없다', () => {
		const { taskId } = linked();
		expect(() =>
			sqlite.prepare('insert into task_tags (task_id, tag_id) values (?, ?)').run(taskId, 99999)
		).toThrow(/FOREIGN KEY/);
	});

	it('같은 태그를 두 번 연결할 수 없다 (복합 PK)', () => {
		const { taskId, tagId } = linked();
		expect(() =>
			sqlite.prepare('insert into task_tags (task_id, tag_id) values (?, ?)').run(taskId, tagId)
		).toThrow(/UNIQUE|PRIMARY/);
	});

	it('foreign_key_check가 위반을 보고하지 않는다', () => {
		linked();
		expect(sqlite.pragma('foreign_key_check')).toEqual([]);
	});
});

describe('FR-601 / FR-602 영속화', () => {
	it('DB 경로가 환경 변수(DB_URL)로 주어진다', () => {
		// .env.test의 DB_URL이 반영되어야 한다
		expect(sqlite.name).toMatch(/test-unit\.db$/);
	});

	it('새 커넥션으로 다시 열어도 데이터가 남아 있다 (프로세스 재시작 대체 검증)', () => {
		const task = createTask('영속화 확인');
		sqlite.pragma('wal_checkpoint(FULL)');

		const reopened = new Database(sqlite.name, { readonly: true });
		try {
			const row = reopened.prepare('select title from tasks where id = ?').get(task.id) as
				| { title: string }
				| undefined;
			expect(row?.title).toBe('영속화 확인');
		} finally {
			reopened.close();
		}
	});

	it('integrity_check가 ok를 반환한다', () => {
		expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
	});
});

describe('FR-603 마이그레이션으로 스키마가 재현된다', () => {
	it('세 테이블이 존재한다', () => {
		const tables = (
			sqlite
				.prepare("select name from sqlite_master where type = 'table' order by name")
				.all() as { name: string }[]
		).map((r) => r.name);
		expect(tables).toContain('tasks');
		expect(tables).toContain('tags');
		expect(tables).toContain('task_tags');
	});

	it('필요한 인덱스가 모두 만들어진다', () => {
		const indexes = (
			sqlite
				.prepare("select name from sqlite_master where type = 'index' and name not like 'sqlite_%'")
				.all() as { name: string }[]
		).map((r) => r.name);
		expect(indexes).toEqual(
			expect.arrayContaining([
				'idx_tags_name_nocase',
				'idx_task_tags_tag_id',
				'idx_tasks_completed_at',
				'idx_tasks_due_priority',
				'idx_tasks_priority_due'
			])
		);
	});

	it('기본 정렬 인덱스의 방향이 (due_date ASC, priority DESC)다', () => {
		const row = sqlite
			.prepare("select sql from sqlite_master where name = 'idx_tasks_due_priority'")
			.get() as { sql: string };
		expect(row.sql.toLowerCase()).toContain('"due_date" asc');
		expect(row.sql.toLowerCase()).toContain('"priority" desc');
	});

	it('마이그레이션 적용 이력이 기록된다', () => {
		const applied = sqlite
			.prepare("select count(*) as n from __drizzle_migrations")
			.get() as { n: number };
		expect(applied.n).toBeGreaterThan(0);
	});
});

describe('NFR-104 기본 정렬이 인덱스 순서를 그대로 쓴다', () => {
	/**
	 * store.ts가 실제로 만드는 정렬 SQL을 그대로 EXPLAIN한다.
	 * 쿼리를 하드코딩하면 orderBy() 구현이 바뀌어도 테스트가 통과해버린다.
	 */
	function planFor(sort: Parameters<typeof orderBy>[0]): string {
		const { sql: text } = db.select().from(tasks).orderBy(...orderBy(sort)).toSQL();
		return (sqlite.prepare(`explain query plan ${text}`).all() as { detail: string }[])
			.map((r) => r.detail)
			.join(' | ');
	}

	it('기본 정렬(마감일)에 임시 정렬(TEMP B-TREE)이 없다', () => {
		const plan = planFor('due');
		expect(plan).toContain('idx_tasks_due_priority');
		expect(plan).not.toContain('TEMP B-TREE');
	});

	it('상태 필터를 더해도 기본 정렬은 인덱스 순서를 유지한다', () => {
		const { sql: text } = db
			.select()
			.from(tasks)
			.where(isNull(tasks.completedAt))
			.orderBy(...orderBy('due'))
			.toSQL();
		// 행이 적으면 플래너가 다른 인덱스를 고를 수 있어 1,000행을 채운 뒤 측정한다
		const insert = sqlite.prepare(
			'insert into tasks (title, due_date, priority, created_at, updated_at) values (?, ?, ?, 0, 0)'
		);
		sqlite.transaction(() => {
			for (let i = 0; i < 1000; i++) insert.run(`부하 ${i}`, i % 7 === 0 ? null : i * 86400, (i % 3) + 1);
		})();
		sqlite.exec('analyze');

		const plan = (sqlite.prepare(`explain query plan ${text}`).all() as { detail: string }[])
			.map((r) => r.detail)
			.join(' | ');
		expect(plan).toContain('idx_tasks_due_priority');
		expect(plan).not.toContain('TEMP B-TREE FOR ORDER BY');

		sqlite.exec('analyze'); // 통계를 남겨두면 다음 테스트에 영향을 준다
		sqlite.exec('delete from tasks');
		sqlite.exec('drop table if exists sqlite_stat1');
	});

	it('생성일 정렬은 rowid 역순이라 정렬 단계가 없다', () => {
		expect(planFor('created')).not.toContain('TEMP B-TREE');
	});

	it('우선순위 정렬은 선두 항목에 인덱스를 쓴다', () => {
		const plan = planFor('priority');
		expect(plan).toContain('idx_tasks_priority_due');
	});
});

// docs/ERD.md §2의 테이블 정의를 Drizzle 스키마로 옮긴 것.
// 도메인 타입은 이 스키마에서 파생한다 (PRD NFR-602).

import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

/** 생성·수정 시각은 모든 테이블에서 같은 방식으로 다룬다 */
const createdAt = integer('created_at', { mode: 'timestamp' })
	.notNull()
	.$defaultFn(() => new Date());

export const tasks = sqliteTable(
	'tasks',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		title: text('title').notNull(),
		description: text('description'),
		/** null = 미완료 (ERD §3.1) */
		completedAt: integer('completed_at', { mode: 'timestamp' }),
		/** 해당 날짜 로컬 자정의 Unix 초 (ERD §3.3) */
		dueDate: integer('due_date', { mode: 'timestamp' }),
		/** 1=낮음, 2=보통, 3=높음 (ERD §3.2) */
		priority: integer('priority').notNull().default(2),
		createdAt,
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [
		// 앱 검증(FR-102, FR-103)과 이중 방어
		check('tasks_title_len', sql`length(trim(${t.title})) between 1 and 200`),
		check(
			'tasks_description_len',
			sql`${t.description} is null or length(${t.description}) <= 2000`
		),
		check('tasks_priority_range', sql`${t.priority} in (1, 2, 3)`),
		// 상태 필터 (FR-503)
		index('idx_tasks_completed_at').on(t.completedAt),
		// 기본 정렬 전용 복합 인덱스 (FR-502, NFR-104).
		// 방향을 (due_date ASC, priority DESC)로 맞춰야 ORDER BY가 인덱스 순서를 그대로 쓰고
		// TEMP B-TREE가 사라진다. 방향이 어긋나면 SQLite가 정렬을 다시 한다.
		// 이 인덱스가 due_date 단독 조회(FR-505)도 선두 컬럼으로 커버하므로
		// due_date 단일 인덱스는 두지 않는다.
		// 정렬 방향은 Drizzle 0.45의 sqlite 인덱스 빌더에 .asc()/.desc()가 없어 sql로 지정한다.
		index('idx_tasks_due_priority').on(sql`${t.dueDate} asc`, sql`${t.priority} desc`),
		// 우선순위 정렬 (FR-501)
		index('idx_tasks_priority_due').on(sql`${t.priority} desc`, sql`${t.dueDate} asc`)
	]
);

export const tags = sqliteTable(
	'tags',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		name: text('name').notNull(),
		createdAt
	},
	(t) => [
		check('tags_name_len', sql`length(trim(${t.name})) between 1 and 30`),
		// 대소문자를 무시한 중복을 DB가 막는다 (FR-402).
		// COLLATE NOCASE 대신 lower() 표현식 인덱스를 쓰면 마이그레이션을 손으로 고치지 않아도 된다.
		uniqueIndex('idx_tags_name_nocase').on(sql`lower(${t.name})`)
	]
);

export const taskTags = sqliteTable(
	'task_tags',
	{
		taskId: integer('task_id')
			.notNull()
			.references(() => tasks.id, { onDelete: 'cascade' }),
		tagId: integer('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' })
	},
	(t) => [
		// 동일 태그 중복 연결 방지
		primaryKey({ columns: [t.taskId, t.tagId] }),
		// 복합 PK는 task_id 선행이라 tag_id 단독 조회를 커버하지 못한다.
		// 태그 필터(FR-504)를 위해 별도 인덱스가 필요하다. (ERD §2.3)
		index('idx_task_tags_tag_id').on(t.tagId)
	]
);

export type TaskRow = typeof tasks.$inferSelect;
export type TagRow = typeof tags.$inferSelect;

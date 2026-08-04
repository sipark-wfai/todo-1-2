// 데이터 접근 계층. SQLite + Drizzle로 구현한다.
//
// 화면(+page.svelte)과 로드/액션(+page.server.ts)은 이 모듈의 함수 시그니처만 알고 있다.
// 와이어프레임 단계의 인메모리 목 데이터를 여기서만 교체했고 라우트는 손대지 않았다.
//
// better-sqlite3는 동기 API라 아래 함수들도 모두 동기다 (PRD §8 기술 결정).
// 쓰기 트랜잭션은 짧게 유지한다 — SQLite는 단일 writer이므로 트랜잭션 길이가
// 곧 쓰기 처리량 상한이다 (NFR-105).

import { and, eq, gte, inArray, isNull, isNotNull, lt, lte, or, sql } from 'drizzle-orm';
import { today } from '$lib/date';
import {
	DESCRIPTION_MAX,
	TAG_NAME_MAX,
	TITLE_MAX,
	type Priority,
	type Tag,
	type TagWithCount,
	type Task,
	type TaskQuery,
	type TaskWithTags
} from '$lib/types';
import { db } from './db/client';
import { tags, taskTags, tasks, type TagRow, type TaskRow } from './db/schema';

// ─── 행 → 도메인 타입 ────────────────────────────────────────────────────────

function toTask(row: TaskRow): Task {
	// priority는 DB에서 integer로 오지만 CHECK 제약이 1|2|3을 보장한다 (ERD §2.1)
	return { ...row, priority: row.priority as Priority };
}

function toTag(row: TagRow): Tag {
	return row;
}

function daysFromToday(offset: number): Date {
	const d = today();
	d.setDate(d.getDate() + offset);
	return d;
}

/** LIKE 패턴의 특수문자를 이스케이프한다. 검색어에 %나 _가 있어도 리터럴로 취급된다. */
function escapeLike(keyword: string): string {
	return keyword.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ─── 조회 ───────────────────────────────────────────────────────────────────

/** 상태 필터를 제외한 조건. 요약 건수와 목록이 같은 조건을 공유한다. */
function scopeConditions(query: TaskQuery) {
	const conditions = [];

	if (query.tagId !== null) {
		conditions.push(
			sql`exists (select 1 from ${taskTags} where ${taskTags.taskId} = ${tasks.id} and ${taskTags.tagId} = ${query.tagId})`
		);
	}

	if (query.due !== 'all') {
		const now = today();
		if (query.due === 'today') {
			conditions.push(eq(tasks.dueDate, now));
		} else if (query.due === 'overdue') {
			// 마감 지남은 미완료 항목에만 해당한다 (FR-202).
			// Date 값은 반드시 Drizzle 연산자로 넘긴다 — raw sql 템플릿에 Date를 바인딩하면
			// better-sqlite3가 거부한다 (숫자·문자열·bigint·buffer·null만 허용).
			conditions.push(and(lt(tasks.dueDate, now), isNull(tasks.completedAt)));
		} else {
			// 이번 주 = 오늘부터 7일(오늘 포함)
			conditions.push(and(gte(tasks.dueDate, now), lte(tasks.dueDate, daysFromToday(6))));
		}
	}

	const keyword = query.q.trim().toLowerCase();
	if (keyword) {
		const pattern = `%${escapeLike(keyword)}%`;
		conditions.push(
			or(
				sql`lower(${tasks.title}) like ${pattern} escape '\\'`,
				sql`lower(${tasks.description}) like ${pattern} escape '\\'`
			)
		);
	}

	return conditions;
}

function statusCondition(status: TaskQuery['status']) {
	if (status === 'open') return isNull(tasks.completedAt);
	if (status === 'done') return isNotNull(tasks.completedAt);
	return undefined;
}

function orderBy(sort: TaskQuery['sort']) {
	// 마감일 없음은 항상 뒤로 (FR-502).
	// `due_date is null`을 정렬 선두에 두는 대신 NULLS LAST를 쓴다. 전자는 표현식이라
	// 인덱스를 못 쓰고 TEMP B-TREE를 유발한다.
	const dueAsc = sql`${tasks.dueDate} asc nulls last`;
	const priorityDesc = sql`${tasks.priority} desc`;

	// id는 AUTOINCREMENT rowid라 id 역순 = 생성 역순이다.
	// created_at으로 정렬하면 인덱스가 없어 정렬 비용이 붙지만, id 역순은 rowid 역방향
	// 스캔이라 정렬이 아예 필요 없다.
	if (sort === 'created') return [sql`${tasks.id} desc`];
	if (sort === 'priority') return [priorityDesc, dueAsc];
	return [dueAsc, priorityDesc];
}

/** 여러 할 일의 태그를 한 번의 쿼리로 가져온다 (N+1 방지) */
function tagsByTaskId(taskIds: number[]): Map<number, Tag[]> {
	const grouped = new Map<number, Tag[]>();
	if (taskIds.length === 0) return grouped;

	const rows = db
		.select({ taskId: taskTags.taskId, tag: tags })
		.from(taskTags)
		.innerJoin(tags, eq(tags.id, taskTags.tagId))
		.where(inArray(taskTags.taskId, taskIds))
		.orderBy(tags.name)
		.all();

	for (const row of rows) {
		const list = grouped.get(row.taskId);
		if (list) list.push(toTag(row.tag));
		else grouped.set(row.taskId, [toTag(row.tag)]);
	}
	return grouped;
}

/**
 * 상태 필터를 제외한 조건으로 미완료/완료 건수를 세고,
 * 상태 필터까지 적용한 목록을 반환한다.
 * 요약 건수(화면설계서 SC-01 ⑪)가 상태 필터에 따라 0으로 사라지지 않게 하기 위함이다.
 */
export function listTasks(query: TaskQuery): {
	tasks: TaskWithTags[];
	openCount: number;
	doneCount: number;
} {
	const scope = scopeConditions(query);
	const scopeWhere = scope.length > 0 ? and(...scope) : undefined;

	const counts = db
		.select({
			open: sql<number>`coalesce(sum(case when ${tasks.completedAt} is null then 1 else 0 end), 0)`,
			done: sql<number>`coalesce(sum(case when ${tasks.completedAt} is not null then 1 else 0 end), 0)`
		})
		.from(tasks)
		.where(scopeWhere)
		.get();

	const status = statusCondition(query.status);
	const rows = db
		.select()
		.from(tasks)
		.where(status ? and(...scope, status) : scopeWhere)
		.orderBy(...orderBy(query.sort))
		.all();

	const tagMap = tagsByTaskId(rows.map((r) => r.id));

	return {
		tasks: rows.map((row) => ({ ...toTask(row), tags: tagMap.get(row.id) ?? [] })),
		openCount: counts?.open ?? 0,
		doneCount: counts?.done ?? 0
	};
}

export function getTask(id: number): TaskWithTags | null {
	const row = db.select().from(tasks).where(eq(tasks.id, id)).get();
	if (!row) return null;
	return { ...toTask(row), tags: tagsByTaskId([id]).get(id) ?? [] };
}

export function listTags(): Tag[] {
	return db.select().from(tags).orderBy(tags.name).all().map(toTag);
}

export function listTagsWithCount(): TagWithCount[] {
	return db
		.select({
			id: tags.id,
			name: tags.name,
			createdAt: tags.createdAt,
			taskCount: sql<number>`count(${taskTags.taskId})`
		})
		.from(tags)
		.leftJoin(taskTags, eq(taskTags.tagId, tags.id))
		.groupBy(tags.id)
		.orderBy(tags.name)
		.all();
}

export function getTag(id: number): TagWithCount | null {
	return (
		db
			.select({
				id: tags.id,
				name: tags.name,
				createdAt: tags.createdAt,
				taskCount: sql<number>`count(${taskTags.taskId})`
			})
			.from(tags)
			.leftJoin(taskTags, eq(taskTags.tagId, tags.id))
			.where(eq(tags.id, id))
			.groupBy(tags.id)
			.get() ?? null
	);
}

// ─── 검증 ───────────────────────────────────────────────────────────────────

/** 오류 메시지를 반환하고, 통과하면 null을 반환한다 (PRD FR-102, FR-103) */
export function validateTitle(title: string): string | null {
	const trimmed = title.trim();
	if (!trimmed) return '제목을 입력하세요.';
	if (trimmed.length > TITLE_MAX) return `제목은 ${TITLE_MAX}자까지 입력할 수 있습니다.`;
	return null;
}

export function validateDescription(description: string): string | null {
	if (description.length > DESCRIPTION_MAX)
		return `설명은 ${DESCRIPTION_MAX}자까지 입력할 수 있습니다.`;
	return null;
}

export function validateTagName(name: string): string | null {
	const trimmed = name.trim();
	if (!trimmed) return '태그 이름을 입력하세요.';
	if (trimmed.length > TAG_NAME_MAX) return `태그 이름은 ${TAG_NAME_MAX}자까지 입력할 수 있습니다.`;

	// 대소문자 무시 중복 검사. DB의 lower(name) UNIQUE 인덱스가 최종 보장을 한다 (ERD §2.2)
	const existing = db
		.select({ id: tags.id })
		.from(tags)
		.where(sql`lower(${tags.name}) = ${trimmed.toLowerCase()}`)
		.get();
	if (existing) return '이미 있는 태그입니다.';
	return null;
}

// ─── 변경 ───────────────────────────────────────────────────────────────────

export function createTask(title: string): Task {
	const now = new Date();
	const row = db
		.insert(tasks)
		.values({ title: title.trim(), createdAt: now, updatedAt: now })
		.returning()
		.get();
	return toTask(row);
}

export function updateTask(
	id: number,
	fields: {
		title: string;
		description: string | null;
		dueDate: Date | null;
		priority: Priority;
		completed: boolean;
		tagIds: number[];
	}
): boolean {
	return db.transaction((tx) => {
		const current = tx.select().from(tasks).where(eq(tasks.id, id)).get();
		if (!current) return false;

		tx.update(tasks)
			.set({
				title: fields.title.trim(),
				description: fields.description?.trim() || null,
				dueDate: fields.dueDate,
				priority: fields.priority,
				// 이미 완료된 항목의 완료 시각은 보존한다
				completedAt: fields.completed ? (current.completedAt ?? new Date()) : null,
				updatedAt: new Date()
			})
			.where(eq(tasks.id, id))
			.run();

		// 태그 연결 재작성
		tx.delete(taskTags).where(eq(taskTags.taskId, id)).run();
		if (fields.tagIds.length > 0) {
			// 존재하지 않는 태그 id는 걸러낸다. FK 위반으로 트랜잭션이 깨지는 것을 막는다.
			const valid = tx
				.select({ id: tags.id })
				.from(tags)
				.where(inArray(tags.id, fields.tagIds))
				.all();
			if (valid.length > 0) {
				tx.insert(taskTags)
					.values(valid.map((tag) => ({ taskId: id, tagId: tag.id })))
					.run();
			}
		}
		return true;
	});
}

export function toggleTask(id: number): boolean {
	return db.transaction((tx) => {
		const current = tx
			.select({ completedAt: tasks.completedAt })
			.from(tasks)
			.where(eq(tasks.id, id))
			.get();
		if (!current) return false;

		tx.update(tasks)
			.set({ completedAt: current.completedAt ? null : new Date(), updatedAt: new Date() })
			.where(eq(tasks.id, id))
			.run();
		return true;
	});
}

/** 할 일 삭제 시 태그 연결도 함께 제거된다 (FR-109 = ON DELETE CASCADE) */
export function deleteTask(id: number): boolean {
	const deleted = db.delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id }).all();
	return deleted.length > 0;
}

export function createTag(name: string): Tag {
	return toTag(
		db.insert(tags).values({ name: name.trim(), createdAt: new Date() }).returning().get()
	);
}

/** 태그 삭제 시 연결만 제거하고 할 일은 유지한다 (FR-404) */
export function deleteTag(id: number): boolean {
	const deleted = db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id }).all();
	return deleted.length > 0;
}

// 와이어프레임용 인메모리 목 데이터 스토어.
//
// 이 모듈이 나중에 Drizzle + SQLite 쿼리로 교체되는 유일한 지점이다.
// 화면(+page.svelte)과 로드/액션(+page.server.ts)은 아래 함수 시그니처만 알고 있으므로
// DB 도입 시 이 파일만 다시 쓰면 된다. (docs/ERD.md §5 참고)
//
// 주의: 프로세스 메모리에만 존재한다. 서버를 재시작하면 시드 상태로 돌아간다.
// 영속화는 PRD FR-601의 범위이며 이번 와이어프레임에는 포함되지 않는다.

import { startOfDay, today } from '$lib/date';
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

let nextTaskId = 1;
let nextTagId = 1;

const tags: Tag[] = [];
const tasks: Task[] = [];
/** ERD의 task_tags 조인 테이블에 대응 */
const taskTags: { taskId: number; tagId: number }[] = [];

function daysFromToday(offset: number): Date {
	const d = today();
	d.setDate(d.getDate() + offset);
	return d;
}

function seed() {
	const now = new Date();
	const [work, urgent, personal, study] = ['업무', '긴급', '개인', '공부'].map((name) => {
		const tag: Tag = { id: nextTagId++, name, createdAt: now };
		tags.push(tag);
		return tag;
	});

	const add = (
		title: string,
		priority: Priority,
		dueOffset: number | null,
		tagList: Tag[],
		completedOffset: number | null = null
	) => {
		const task: Task = {
			id: nextTaskId++,
			title,
			description: null,
			completedAt: completedOffset === null ? null : daysFromToday(completedOffset),
			dueDate: dueOffset === null ? null : daysFromToday(dueOffset),
			priority,
			createdAt: now,
			updatedAt: now
		};
		tasks.push(task);
		for (const tag of tagList) taskTags.push({ taskId: task.id, tagId: tag.id });
	};

	add('발표자료 초안 작성', 3, -3, [work, urgent]);
	add('병원 예약 전화', 2, 0, [personal]);
	add('주간 보고서 작성', 3, 1, [work]);
	add('책 반납', 1, 5, []);
	add('장바구니 정리', 2, null, [personal], -1);
	add('스터디 자료 읽기', 1, -1, [study], -1);
}

seed();

// ─── 조회 ───────────────────────────────────────────────────────────────────

function tagsOf(taskId: number): Tag[] {
	return taskTags
		.filter((link) => link.taskId === taskId)
		.map((link) => tags.find((t) => t.id === link.tagId))
		.filter((t): t is Tag => t !== undefined);
}

function withTags(task: Task): TaskWithTags {
	return { ...task, tags: tagsOf(task.id) };
}

function matchesDue(task: Task, due: TaskQuery['due']): boolean {
	if (due === 'all') return true;
	if (!task.dueDate) return false;
	const d = startOfDay(task.dueDate).getTime();
	const now = today().getTime();
	if (due === 'today') return d === now;
	if (due === 'overdue') return d < now && task.completedAt === null;
	// 이번 주 = 오늘부터 7일(오늘 포함)
	return d >= now && d <= daysFromToday(6).getTime();
}

function compare(a: Task, b: Task, sort: TaskQuery['sort']): number {
	// 마감일 없음은 항상 뒤로 (PRD FR-502)
	const byDue = () => {
		const av = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
		const bv = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
		return av - bv;
	};
	const byPriority = () => b.priority - a.priority;

	if (sort === 'created') return b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id;
	if (sort === 'priority') return byPriority() || byDue();
	return byDue() || byPriority();
}

/**
 * 상태 필터를 제외한 조건으로 먼저 좁힌 뒤 미완료/완료 건수를 세고,
 * 그 다음 상태 필터를 적용한 목록을 반환한다.
 * 요약 건수(화면설계서 SC-01 ⑪)가 상태 필터에 따라 0으로 사라지지 않게 하기 위함이다.
 */
export function listTasks(query: TaskQuery): {
	tasks: TaskWithTags[];
	openCount: number;
	doneCount: number;
} {
	const keyword = query.q.trim().toLowerCase();

	const scoped = tasks.filter((task) => {
		if (query.tagId !== null && !taskTags.some((l) => l.taskId === task.id && l.tagId === query.tagId))
			return false;
		if (!matchesDue(task, query.due)) return false;
		if (keyword) {
			const haystack = `${task.title} ${task.description ?? ''}`.toLowerCase();
			if (!haystack.includes(keyword)) return false;
		}
		return true;
	});

	const openCount = scoped.filter((t) => t.completedAt === null).length;
	const doneCount = scoped.length - openCount;

	const visible = scoped.filter((task) => {
		if (query.status === 'open') return task.completedAt === null;
		if (query.status === 'done') return task.completedAt !== null;
		return true;
	});

	return {
		tasks: [...visible].sort((a, b) => compare(a, b, query.sort)).map(withTags),
		openCount,
		doneCount
	};
}

export function getTask(id: number): TaskWithTags | null {
	const task = tasks.find((t) => t.id === id);
	return task ? withTags(task) : null;
}

export function listTags(): Tag[] {
	return [...tags].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export function listTagsWithCount(): TagWithCount[] {
	return listTags().map((tag) => ({
		...tag,
		taskCount: taskTags.filter((l) => l.tagId === tag.id).length
	}));
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
	// 대소문자 무시 중복 검사. DB에서는 UNIQUE COLLATE NOCASE가 보장한다 (ERD §2.2)
	if (tags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase()))
		return '이미 있는 태그입니다.';
	return null;
}

// ─── 변경 ───────────────────────────────────────────────────────────────────

export function createTask(title: string): Task {
	const now = new Date();
	const task: Task = {
		id: nextTaskId++,
		title: title.trim(),
		description: null,
		completedAt: null,
		dueDate: null,
		priority: 2,
		createdAt: now,
		updatedAt: now
	};
	tasks.push(task);
	return task;
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
	const task = tasks.find((t) => t.id === id);
	if (!task) return false;

	task.title = fields.title.trim();
	task.description = fields.description?.trim() || null;
	task.dueDate = fields.dueDate;
	task.priority = fields.priority;
	// 이미 완료된 항목의 완료 시각은 보존한다
	task.completedAt = fields.completed ? (task.completedAt ?? new Date()) : null;
	task.updatedAt = new Date();

	// 태그 연결 갱신 (task_tags 재작성)
	for (let i = taskTags.length - 1; i >= 0; i--) {
		if (taskTags[i].taskId === id) taskTags.splice(i, 1);
	}
	for (const tagId of fields.tagIds) {
		if (tags.some((t) => t.id === tagId)) taskTags.push({ taskId: id, tagId });
	}
	return true;
}

export function toggleTask(id: number): boolean {
	const task = tasks.find((t) => t.id === id);
	if (!task) return false;
	task.completedAt = task.completedAt ? null : new Date();
	task.updatedAt = new Date();
	return true;
}

/** 할 일 삭제 시 태그 연결도 함께 제거된다 (PRD FR-109 = ERD의 ON DELETE CASCADE) */
export function deleteTask(id: number): boolean {
	const index = tasks.findIndex((t) => t.id === id);
	if (index === -1) return false;
	tasks.splice(index, 1);
	for (let i = taskTags.length - 1; i >= 0; i--) {
		if (taskTags[i].taskId === id) taskTags.splice(i, 1);
	}
	return true;
}

export function createTag(name: string): Tag {
	const tag: Tag = { id: nextTagId++, name: name.trim(), createdAt: new Date() };
	tags.push(tag);
	return tag;
}

/** 태그 삭제 시 연결만 제거하고 할 일은 유지한다 (PRD FR-404) */
export function deleteTag(id: number): boolean {
	const index = tags.findIndex((t) => t.id === id);
	if (index === -1) return false;
	tags.splice(index, 1);
	for (let i = taskTags.length - 1; i >= 0; i--) {
		if (taskTags[i].tagId === id) taskTags.splice(i, 1);
	}
	return true;
}

export function getTag(id: number): TagWithCount | null {
	const tag = tags.find((t) => t.id === id);
	if (!tag) return null;
	return { ...tag, taskCount: taskTags.filter((l) => l.tagId === id).length };
}

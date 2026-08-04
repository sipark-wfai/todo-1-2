// docs/ERD.md의 테이블 정의와 1:1 대응하는 도메인 타입.
// DB 도입 시 Drizzle의 $inferSelect로 대체된다 (PRD NFR-602).

/** 1=낮음, 2=보통, 3=높음. 내림차순 정렬이 곧 "높음 우선" (ERD §3.2) */
export type Priority = 1 | 2 | 3;

export const PRIORITY_LABEL: Record<Priority, string> = {
	3: '높음',
	2: '보통',
	1: '낮음'
};

export const PRIORITY_OPTIONS: Priority[] = [3, 2, 1];

export interface Tag {
	id: number;
	name: string;
	createdAt: Date;
}

export interface Task {
	id: number;
	title: string;
	description: string | null;
	/** null = 미완료 (ERD §3.1) */
	completedAt: Date | null;
	dueDate: Date | null;
	priority: Priority;
	createdAt: Date;
	updatedAt: Date;
}

export interface TaskWithTags extends Task {
	tags: Tag[];
}

export interface TagWithCount extends Tag {
	taskCount: number;
}

export type StatusFilter = 'all' | 'open' | 'done';
export type DueFilter = 'all' | 'today' | 'week' | 'overdue';
export type SortKey = 'due' | 'priority' | 'created';

export interface TaskQuery {
	status: StatusFilter;
	tagId: number | null;
	due: DueFilter;
	q: string;
	sort: SortKey;
}

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
	{ value: 'all', label: '전체' },
	{ value: 'open', label: '미완료' },
	{ value: 'done', label: '완료' }
];

export const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
	{ value: 'all', label: '전체' },
	{ value: 'today', label: '오늘' },
	{ value: 'week', label: '이번 주' },
	{ value: 'overdue', label: '마감 지남' }
];

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
	{ value: 'due', label: '마감일' },
	{ value: 'priority', label: '우선순위' },
	{ value: 'created', label: '생성일' }
];

/** 입력 길이 제한 (PRD FR-103, FR-403) */
export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 2000;
export const TAG_NAME_MAX = 30;

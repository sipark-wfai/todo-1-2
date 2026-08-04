import type { TaskQuery } from '../../src/lib/types';

/** 조회 조건 기본값. 검사하려는 필드만 덮어쓴다. */
export function query(partial: Partial<TaskQuery> = {}): TaskQuery {
	return { status: 'all', tagId: null, due: 'all', q: '', sort: 'due', ...partial };
}

/** 오늘 자정 기준 offset일 */
export function day(offset: number): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + offset);
	return d;
}

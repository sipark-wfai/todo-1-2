// 마감일은 날짜 단위로만 다룬다 (PRD 가정 A4, ERD §3.3).

/** 해당 날짜의 로컬 자정 */
export function startOfDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

export function today(): Date {
	return startOfDay(new Date());
}

/** `<input type="date">`와 주고받는 YYYY-MM-DD 표기 */
export function toDateInput(date: Date | null): string {
	if (!date) return '';
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/** 빈 문자열이나 형식 오류는 null(마감일 없음)로 처리한다 */
export function fromDateInput(value: string): Date | null {
	if (!value) return null;
	const [y, m, d] = value.split('-').map(Number);
	if (!y || !m || !d) return null;
	const date = new Date(y, m - 1, d);
	return Number.isNaN(date.getTime()) ? null : date;
}

export type DueState = 'overdue' | 'today' | null;

/**
 * 미완료 항목의 마감 상태 (PRD FR-202, FR-203).
 * 완료된 항목은 마감 강조 대상이 아니다.
 */
export function dueState(dueDate: Date | null, completedAt: Date | null): DueState {
	if (!dueDate || completedAt) return null;
	const due = startOfDay(dueDate).getTime();
	const now = today().getTime();
	if (due < now) return 'overdue';
	if (due === now) return 'today';
	return null;
}

export const DUE_STATE_LABEL: Record<'overdue' | 'today', string> = {
	overdue: '지남',
	today: '오늘'
};

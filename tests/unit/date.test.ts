// 날짜 헬퍼: FR-201, FR-202, FR-203

import { describe, expect, it } from 'vitest';
import { dueState, fromDateInput, startOfDay, toDateInput } from '../../src/lib/date';
import { day } from './helpers';

describe('FR-201 마감일 입력/표시 변환', () => {
	it('Date → YYYY-MM-DD (로컬 기준)', () => {
		expect(toDateInput(new Date(2026, 7, 10, 23, 59))).toBe('2026-08-10');
	});

	it('마감일 없음은 빈 문자열', () => {
		expect(toDateInput(null)).toBe('');
	});

	it('YYYY-MM-DD → 로컬 자정 Date', () => {
		const d = fromDateInput('2026-08-10');
		expect(d).not.toBeNull();
		expect(d!.getFullYear()).toBe(2026);
		expect(d!.getMonth()).toBe(7);
		expect(d!.getDate()).toBe(10);
		expect([d!.getHours(), d!.getMinutes(), d!.getSeconds()]).toEqual([0, 0, 0]);
	});

	it('빈 문자열과 형식 오류는 null (마감일 없음도 유효한 상태)', () => {
		expect(fromDateInput('')).toBeNull();
		expect(fromDateInput('없는날짜')).toBeNull();
		expect(fromDateInput('2026-08')).toBeNull();
	});

	it('왕복 변환이 값을 보존한다', () => {
		expect(toDateInput(fromDateInput('2026-01-01'))).toBe('2026-01-01');
		expect(toDateInput(fromDateInput('2026-12-31'))).toBe('2026-12-31');
	});

	it('과거 날짜도 허용한다 (US-201 수용 기준 2)', () => {
		expect(toDateInput(fromDateInput('2020-03-04'))).toBe('2020-03-04');
	});

	it('startOfDay는 시각을 자정으로 내린다', () => {
		const d = startOfDay(new Date(2026, 7, 10, 13, 45, 30, 500));
		expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0]);
	});
});

describe('FR-202 / FR-203 마감 상태 판정', () => {
	it('미완료 + 마감일이 오늘 이전 → overdue', () => {
		expect(dueState(day(-1), null)).toBe('overdue');
		expect(dueState(day(-30), null)).toBe('overdue');
	});

	it('미완료 + 마감일이 오늘 → today', () => {
		expect(dueState(day(0), null)).toBe('today');
	});

	it('미완료 + 마감일이 미래 → 라벨 없음', () => {
		expect(dueState(day(1), null)).toBeNull();
	});

	it('마감일 없음 → 라벨 없음', () => {
		expect(dueState(null, null)).toBeNull();
	});

	it('완료된 항목은 마감 강조 대상이 아니다', () => {
		const completed = new Date();
		expect(dueState(day(-5), completed)).toBeNull();
		expect(dueState(day(0), completed)).toBeNull();
	});

	it('마감일에 시각이 섞여 있어도 날짜 단위로 판정한다', () => {
		const todayLate = new Date();
		todayLate.setHours(23, 59, 59);
		expect(dueState(todayLate, null)).toBe('today');
	});
});

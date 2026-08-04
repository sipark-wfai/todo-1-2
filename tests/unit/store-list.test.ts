// 목록 조회: 필터·정렬·검색 FR-104, FR-501 ~ FR-507

import { beforeEach, describe, expect, it } from 'vitest';
import type { Priority } from '../../src/lib/types';
import {
	createTag,
	createTask,
	listTasks,
	toggleTask,
	updateTask
} from '../../src/lib/server/store';
import { day, query } from './helpers';

/** 시드: 마감일·우선순위·완료 상태·태그가 골고루 섞인 6건 */
function seed() {
	const work = createTag('업무');
	const personal = createTag('개인');

	const add = (
		title: string,
		priority: Priority,
		dueOffset: number | null,
		tagIds: number[],
		completed = false,
		description: string | null = null
	) => {
		const task = createTask(title);
		updateTask(task.id, {
			title,
			description,
			dueDate: dueOffset === null ? null : day(dueOffset),
			priority,
			completed,
			tagIds
		});
		return task.id;
	};

	return {
		work,
		personal,
		overdueHigh: add('발표자료 초안 작성', 3, -3, [work.id, personal.id]),
		todayNormal: add('병원 예약 전화', 2, 0, [personal.id], false, '오전에 전화하기'),
		futureHigh: add('주간 보고서 작성', 3, 1, [work.id]),
		futureLow: add('책 반납', 1, 5, []),
		noDueNormal: add('장바구니 정리', 2, null, [personal.id]),
		doneOverdue: add('스터디 자료 읽기', 1, -1, [], true)
	};
}

const titles = (q = query()) => listTasks(q).tasks.map((t) => t.title);

describe('FR-104 전체 목록 조회', () => {
	it('등록된 할 일이 모두 나온다', () => {
		seed();
		expect(titles()).toHaveLength(6);
	});

	it('비어 있으면 빈 배열과 0건을 반환한다', () => {
		const result = listTasks(query());
		expect(result.tasks).toEqual([]);
		expect(result.openCount).toBe(0);
		expect(result.doneCount).toBe(0);
	});

	it('각 항목에 태그가 함께 실려 온다', () => {
		seed();
		const first = listTasks(query()).tasks.find((t) => t.title === '발표자료 초안 작성')!;
		expect(first.tags.map((t) => t.name).sort()).toEqual(['개인', '업무']);
	});
});

describe('FR-502 기본 정렬: 마감일 오름차순, 없음은 뒤로, 동일 시 우선순위 내림차순', () => {
	beforeEach(seed);

	it('마감일 순으로 정렬되고 마감일 없음이 마지막이다', () => {
		expect(titles()).toEqual([
			'발표자료 초안 작성', // -3
			'스터디 자료 읽기', // -1
			'병원 예약 전화', // 0
			'주간 보고서 작성', // +1
			'책 반납', // +5
			'장바구니 정리' // 없음
		]);
	});

	it('마감일이 같으면 우선순위가 높은 쪽이 먼저다', () => {
		const low = createTask('같은 날 낮음');
		const high = createTask('같은 날 높음');
		for (const [id, priority] of [
			[low.id, 1],
			[high.id, 3]
		] as const) {
			updateTask(id, {
				title: id === low.id ? '같은 날 낮음' : '같은 날 높음',
				description: null,
				dueDate: day(10),
				priority: priority as Priority,
				completed: false,
				tagIds: []
			});
		}
		const order = titles().filter((t) => t.startsWith('같은 날'));
		expect(order).toEqual(['같은 날 높음', '같은 날 낮음']);
	});
});

describe('FR-501 정렬 기준 선택', () => {
	beforeEach(seed);

	it('우선순위 정렬: 높음 → 보통 → 낮음', () => {
		const priorities = listTasks(query({ sort: 'priority' })).tasks.map((t) => t.priority);
		expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
		expect(priorities[0]).toBe(3);
		expect(priorities.at(-1)).toBe(1);
	});

	it('우선순위가 같으면 마감일 오름차순, 없음은 뒤로', () => {
		const normals = listTasks(query({ sort: 'priority' })).tasks.filter((t) => t.priority === 2);
		expect(normals.map((t) => t.title)).toEqual(['병원 예약 전화', '장바구니 정리']);
	});

	it('생성일 정렬: 최근에 만든 것이 먼저', () => {
		expect(titles(query({ sort: 'created' }))).toEqual([
			'스터디 자료 읽기',
			'장바구니 정리',
			'책 반납',
			'주간 보고서 작성',
			'병원 예약 전화',
			'발표자료 초안 작성'
		]);
	});
});

describe('FR-503 상태 필터', () => {
	beforeEach(seed);

	it('미완료만', () => {
		expect(titles(query({ status: 'open' })).includes('스터디 자료 읽기')).toBe(false);
		expect(titles(query({ status: 'open' }))).toHaveLength(5);
	});

	it('완료만', () => {
		expect(titles(query({ status: 'done' }))).toEqual(['스터디 자료 읽기']);
	});

	it('요약 건수는 상태 필터와 무관하게 유지된다 (화면설계서 SC-01 ⑪)', () => {
		const all = listTasks(query());
		const open = listTasks(query({ status: 'open' }));
		const done = listTasks(query({ status: 'done' }));

		expect([all.openCount, all.doneCount]).toEqual([5, 1]);
		expect([open.openCount, open.doneCount]).toEqual([5, 1]);
		expect([done.openCount, done.doneCount]).toEqual([5, 1]);
	});
});

describe('FR-504 태그 필터', () => {
	it('해당 태그가 붙은 할 일만 나온다', () => {
		const s = seed();
		expect(titles(query({ tagId: s.work.id })).sort()).toEqual([
			'발표자료 초안 작성',
			'주간 보고서 작성'
		]);
	});

	it('연결된 할 일이 없는 태그는 0건', () => {
		seed();
		const empty = createTag('빈태그');
		expect(titles(query({ tagId: empty.id }))).toEqual([]);
	});
});

describe('FR-505 마감일 필터', () => {
	beforeEach(seed);

	it('오늘', () => {
		expect(titles(query({ due: 'today' }))).toEqual(['병원 예약 전화']);
	});

	it('이번 주 = 오늘부터 7일 (오늘 포함, 과거·8일 이후 제외)', () => {
		expect(titles(query({ due: 'week' }))).toEqual([
			'병원 예약 전화',
			'주간 보고서 작성',
			'책 반납'
		]);
	});

	it('마감 지남은 미완료만 (완료된 지난 항목은 제외)', () => {
		expect(titles(query({ due: 'overdue' }))).toEqual(['발표자료 초안 작성']);
	});

	it('마감일 없는 항목은 마감일 필터에 걸리지 않는다', () => {
		for (const due of ['today', 'week', 'overdue'] as const) {
			expect(titles(query({ due }))).not.toContain('장바구니 정리');
		}
	});
});

describe('FR-507 텍스트 검색', () => {
	beforeEach(seed);

	it('제목 부분 일치', () => {
		expect(titles(query({ q: '보고서' }))).toEqual(['주간 보고서 작성']);
	});

	it('설명도 검색 대상이다', () => {
		expect(titles(query({ q: '오전에' }))).toEqual(['병원 예약 전화']);
	});

	it('대소문자를 구분하지 않는다', () => {
		const task = createTask('Weekly Report');
		updateTask(task.id, {
			title: 'Weekly Report',
			description: null,
			dueDate: null,
			priority: 2,
			completed: false,
			tagIds: []
		});
		expect(titles(query({ q: 'weekly' }))).toContain('Weekly Report');
		expect(titles(query({ q: 'WEEKLY' }))).toContain('Weekly Report');
	});

	it('검색어 앞뒤 공백은 무시한다', () => {
		expect(titles(query({ q: '  보고서  ' }))).toEqual(['주간 보고서 작성']);
	});

	it('LIKE 특수문자를 리터럴로 취급한다 — %가 전체 매칭이 되지 않는다', () => {
		expect(titles(query({ q: '%' }))).toEqual([]);
		expect(titles(query({ q: '_' }))).toEqual([]);
	});

	it('특수문자가 실제로 포함된 제목은 찾는다', () => {
		const task = createTask('진행률 50% 달성');
		expect(titles(query({ q: '50%' }))).toContain(task.title);
	});

	it('일치하는 항목이 없으면 빈 배열', () => {
		expect(titles(query({ q: '존재하지않는키워드' }))).toEqual([]);
	});
});

describe('FR-506 필터 AND 조합', () => {
	it('상태 + 마감일 + 태그 + 검색어가 모두 함께 적용된다', () => {
		const s = seed();

		// 업무 태그 + 미완료 = 발표자료(지남), 주간 보고서(+1)
		expect(titles(query({ tagId: s.work.id, status: 'open' })).sort()).toEqual([
			'발표자료 초안 작성',
			'주간 보고서 작성'
		]);

		// 여기에 마감 지남을 더하면 발표자료만 남는다
		expect(titles(query({ tagId: s.work.id, status: 'open', due: 'overdue' }))).toEqual([
			'발표자료 초안 작성'
		]);

		// 검색어까지 더해 교집합이 비게 만든다
		expect(
			titles(query({ tagId: s.work.id, status: 'open', due: 'overdue', q: '보고서' }))
		).toEqual([]);
	});

	it('완료 처리하면 미완료 필터 결과에서 빠진다', () => {
		const s = seed();
		expect(titles(query({ status: 'open' }))).toContain('병원 예약 전화');
		toggleTask(s.todayNormal);
		expect(titles(query({ status: 'open' }))).not.toContain('병원 예약 전화');
		expect(titles(query({ status: 'done' }))).toContain('병원 예약 전화');
	});
});

// 할 일 생성·수정·완료·삭제: FR-101 ~ FR-109, FR-201, FR-301, FR-401

import { describe, expect, it } from 'vitest';
import { DESCRIPTION_MAX, TITLE_MAX } from '../../src/lib/types';
import {
	createTag,
	createTask,
	deleteTask,
	getTask,
	listTasks,
	toggleTask,
	updateTask,
	validateDescription,
	validateTitle
} from '../../src/lib/server/store';
import { day, query } from './helpers';

describe('FR-101 제목만으로 생성', () => {
	it('제목 하나로 할 일이 만들어진다', () => {
		const task = createTask('발표자료 초안 작성');
		expect(task.id).toBeGreaterThan(0);
		expect(task.title).toBe('발표자료 초안 작성');
	});

	it('선택 속성은 비어 있고 우선순위 기본값은 보통(2)이다 (FR-301)', () => {
		const task = createTask('할 일');
		expect(task.description).toBeNull();
		expect(task.dueDate).toBeNull();
		expect(task.completedAt).toBeNull();
		expect(task.priority).toBe(2);
	});

	it('제목 앞뒤 공백을 제거한다', () => {
		expect(createTask('   공백 제거   ').title).toBe('공백 제거');
	});

	it('생성 시각과 수정 시각이 기록된다', () => {
		const task = createTask('시각 기록');
		expect(task.createdAt).toBeInstanceOf(Date);
		expect(task.updatedAt).toBeInstanceOf(Date);
	});
});

describe('FR-102 / FR-103 입력 검증', () => {
	it('빈 제목과 공백만인 제목을 거부한다', () => {
		expect(validateTitle('')).toBe('제목을 입력하세요.');
		expect(validateTitle('   ')).toBe('제목을 입력하세요.');
		expect(validateTitle('\t\n ')).toBe('제목을 입력하세요.');
	});

	it(`제목 ${TITLE_MAX}자는 통과, ${TITLE_MAX + 1}자는 거부한다`, () => {
		expect(validateTitle('가'.repeat(TITLE_MAX))).toBeNull();
		expect(validateTitle('가'.repeat(TITLE_MAX + 1))).toContain(`${TITLE_MAX}자`);
	});

	it(`설명 ${DESCRIPTION_MAX}자는 통과, ${DESCRIPTION_MAX + 1}자는 거부한다`, () => {
		expect(validateDescription('가'.repeat(DESCRIPTION_MAX))).toBeNull();
		expect(validateDescription('가'.repeat(DESCRIPTION_MAX + 1))).toContain(`${DESCRIPTION_MAX}자`);
	});

	it('빈 설명은 유효하다', () => {
		expect(validateDescription('')).toBeNull();
	});
});

describe('FR-104 조회', () => {
	it('id로 할 일과 태그를 함께 가져온다', () => {
		const tag = createTag('업무');
		const task = createTask('조회 대상');
		updateTask(task.id, {
			title: '조회 대상',
			description: null,
			dueDate: null,
			priority: 2,
			completed: false,
			tagIds: [tag.id]
		});

		const found = getTask(task.id);
		expect(found?.title).toBe('조회 대상');
		expect(found?.tags.map((t) => t.name)).toEqual(['업무']);
	});

	it('없는 id는 null을 반환한다', () => {
		expect(getTask(99999)).toBeNull();
	});
});

describe('FR-105 / FR-106 / FR-201 / FR-301 / FR-401 수정', () => {
	const fields = (over: Partial<Parameters<typeof updateTask>[1]> = {}) => ({
		title: '수정된 제목',
		description: '수정된 설명',
		dueDate: day(3),
		priority: 3 as const,
		completed: false,
		tagIds: [] as number[],
		...over
	});

	it('제목·설명·마감일·우선순위를 바꾼다', () => {
		const task = createTask('원본');
		expect(updateTask(task.id, fields())).toBe(true);

		const updated = getTask(task.id)!;
		expect(updated.title).toBe('수정된 제목');
		expect(updated.description).toBe('수정된 설명');
		expect(updated.dueDate?.getTime()).toBe(day(3).getTime());
		expect(updated.priority).toBe(3);
	});

	it('마감일을 null로 보내면 해제된다 (FR-201)', () => {
		const task = createTask('마감일 해제');
		updateTask(task.id, fields({ dueDate: day(1) }));
		updateTask(task.id, fields({ dueDate: null }));
		expect(getTask(task.id)!.dueDate).toBeNull();
	});

	it('빈 설명은 null로 저장된다', () => {
		const task = createTask('설명 비우기');
		updateTask(task.id, fields({ description: '   ' }));
		expect(getTask(task.id)!.description).toBeNull();
	});

	it('여러 태그를 연결하고 다시 0개로 만들 수 있다 (FR-401)', () => {
		const work = createTag('업무');
		const urgent = createTag('긴급');
		const task = createTask('태그 연결');

		updateTask(task.id, fields({ tagIds: [work.id, urgent.id] }));
		expect(getTask(task.id)!.tags.map((t) => t.name).sort()).toEqual(['긴급', '업무']);

		updateTask(task.id, fields({ tagIds: [] }));
		expect(getTask(task.id)!.tags).toEqual([]);
	});

	it('존재하지 않는 태그 id는 무시한다', () => {
		const task = createTask('없는 태그');
		expect(updateTask(task.id, fields({ tagIds: [12345] }))).toBe(true);
		expect(getTask(task.id)!.tags).toEqual([]);
	});

	it('updated_at이 갱신되고 created_at은 유지된다 (FR-106)', () => {
		const task = createTask('시각 갱신');
		const before = getTask(task.id)!;

		// updated_at은 Unix 초 단위라 같은 초 안에서는 값이 같을 수 있다.
		// 갱신 여부를 확실히 보려면 1초 이상 차이를 만들어야 한다.
		const target = new Date(Date.now() + 1500);
		while (Date.now() < target.getTime()) {
			/* 대기 */
		}
		updateTask(task.id, fields());

		const after = getTask(task.id)!;
		expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
		expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
	});

	it('없는 id는 false를 반환한다', () => {
		expect(updateTask(99999, fields())).toBe(false);
	});

	it('완료 상태로 저장하면 완료 시각이 기록되고, 재저장해도 그 시각이 보존된다', () => {
		const task = createTask('완료 보존');
		updateTask(task.id, fields({ completed: true }));
		const first = getTask(task.id)!.completedAt;
		expect(first).toBeInstanceOf(Date);

		updateTask(task.id, fields({ completed: true, title: '제목만 변경' }));
		expect(getTask(task.id)!.completedAt?.getTime()).toBe(first!.getTime());
	});

	it('완료를 해제하면 완료 시각이 지워진다', () => {
		const task = createTask('완료 해제');
		updateTask(task.id, fields({ completed: true }));
		updateTask(task.id, fields({ completed: false }));
		expect(getTask(task.id)!.completedAt).toBeNull();
	});
});

describe('FR-107 완료 토글', () => {
	it('토글하면 완료 시각이 기록된다', () => {
		const task = createTask('토글');
		expect(toggleTask(task.id)).toBe(true);
		expect(getTask(task.id)!.completedAt).toBeInstanceOf(Date);
	});

	it('다시 토글하면 미완료로 돌아온다', () => {
		const task = createTask('토글 2회');
		toggleTask(task.id);
		toggleTask(task.id);
		expect(getTask(task.id)!.completedAt).toBeNull();
	});

	it('없는 id는 false를 반환한다', () => {
		expect(toggleTask(99999)).toBe(false);
	});
});

describe('FR-108 / FR-109 삭제', () => {
	it('할 일이 삭제되고 목록에서 사라진다', () => {
		const task = createTask('삭제 대상');
		expect(deleteTask(task.id)).toBe(true);
		expect(getTask(task.id)).toBeNull();
		expect(listTasks(query()).tasks).toHaveLength(0);
	});

	it('없는 id는 false를 반환한다', () => {
		expect(deleteTask(99999)).toBe(false);
	});

	it('삭제하면 태그 연결도 함께 제거되고 태그 자체는 남는다 (FR-109)', () => {
		const tag = createTag('개인');
		const task = createTask('연결된 할 일');
		updateTask(task.id, {
			title: '연결된 할 일',
			description: null,
			dueDate: null,
			priority: 2,
			completed: false,
			tagIds: [tag.id]
		});

		deleteTask(task.id);

		// 태그는 남아 다른 할 일에 계속 쓸 수 있다
		const other = createTask('다른 할 일');
		expect(updateTask(other.id, {
			title: '다른 할 일',
			description: null,
			dueDate: null,
			priority: 2,
			completed: false,
			tagIds: [tag.id]
		})).toBe(true);
		expect(getTask(other.id)!.tags.map((t) => t.name)).toEqual(['개인']);
	});
});

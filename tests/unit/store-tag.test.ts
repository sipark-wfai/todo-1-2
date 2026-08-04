// 태그: FR-402, FR-403, FR-404

import { describe, expect, it } from 'vitest';
import { TAG_NAME_MAX } from '../../src/lib/types';
import {
	createTag,
	createTask,
	deleteTag,
	getTag,
	getTask,
	listTags,
	listTagsWithCount,
	updateTask,
	validateTagName
} from '../../src/lib/server/store';

function taskWithTags(title: string, tagIds: number[]) {
	const task = createTask(title);
	updateTask(task.id, {
		title,
		description: null,
		dueDate: null,
		priority: 2,
		completed: false,
		tagIds
	});
	return task.id;
}

describe('FR-402 태그 생성', () => {
	it('이름으로 태그를 만든다', () => {
		const tag = createTag('업무');
		expect(tag.id).toBeGreaterThan(0);
		expect(tag.name).toBe('업무');
	});

	it('앞뒤 공백을 제거한다', () => {
		expect(createTag('  개인  ').name).toBe('개인');
	});

	it('빈 이름과 공백만인 이름을 거부한다', () => {
		expect(validateTagName('')).toBe('태그 이름을 입력하세요.');
		expect(validateTagName('   ')).toBe('태그 이름을 입력하세요.');
	});

	it('같은 이름을 거부한다', () => {
		createTag('업무');
		expect(validateTagName('업무')).toBe('이미 있는 태그입니다.');
	});

	it('대소문자만 다른 이름도 거부한다', () => {
		createTag('Work');
		expect(validateTagName('work')).toBe('이미 있는 태그입니다.');
		expect(validateTagName('WORK')).toBe('이미 있는 태그입니다.');
		expect(validateTagName('wOrK')).toBe('이미 있는 태그입니다.');
	});

	it('공백만 다른 이름은 같은 이름으로 본다', () => {
		createTag('업무');
		expect(validateTagName('  업무  ')).toBe('이미 있는 태그입니다.');
	});

	it('다른 이름은 통과한다', () => {
		createTag('업무');
		expect(validateTagName('긴급')).toBeNull();
	});
});

describe('FR-403 태그 이름 길이 제한', () => {
	it(`${TAG_NAME_MAX}자는 통과, ${TAG_NAME_MAX + 1}자는 거부한다`, () => {
		expect(validateTagName('가'.repeat(TAG_NAME_MAX))).toBeNull();
		expect(validateTagName('가'.repeat(TAG_NAME_MAX + 1))).toContain(`${TAG_NAME_MAX}자`);
	});
});

describe('태그 목록', () => {
	it('이름순으로 정렬된다', () => {
		createTag('Work');
		createTag('Alpha');
		createTag('Beta');
		expect(listTags().map((t) => t.name)).toEqual(['Alpha', 'Beta', 'Work']);
	});

	it('연결된 할 일 건수를 함께 센다 (US-403 수용 기준 2)', () => {
		const work = createTag('업무');
		const idle = createTag('안쓰는태그');
		taskWithTags('할 일 A', [work.id]);
		taskWithTags('할 일 B', [work.id]);

		const counts = Object.fromEntries(listTagsWithCount().map((t) => [t.name, t.taskCount]));
		expect(counts['업무']).toBe(2);
		expect(counts['안쓰는태그']).toBe(0);
	});

	it('getTag도 연결 건수를 반환하고, 없는 id는 null이다', () => {
		const tag = createTag('개인');
		taskWithTags('할 일', [tag.id]);
		expect(getTag(tag.id)?.taskCount).toBe(1);
		expect(getTag(99999)).toBeNull();
	});
});

describe('FR-404 태그 삭제', () => {
	it('태그가 삭제된다', () => {
		const tag = createTag('삭제할태그');
		expect(deleteTag(tag.id)).toBe(true);
		expect(getTag(tag.id)).toBeNull();
		expect(listTags()).toEqual([]);
	});

	it('없는 id는 false를 반환한다', () => {
		expect(deleteTag(99999)).toBe(false);
	});

	it('연결된 할 일은 삭제되지 않고 연결만 제거된다', () => {
		const work = createTag('업무');
		const personal = createTag('개인');
		const taskId = taskWithTags('두 태그가 붙은 할 일', [work.id, personal.id]);

		deleteTag(work.id);

		const task = getTask(taskId);
		expect(task).not.toBeNull();
		expect(task!.title).toBe('두 태그가 붙은 할 일');
		// 삭제한 태그만 빠지고 나머지는 남는다
		expect(task!.tags.map((t) => t.name)).toEqual(['개인']);
	});

	it('같은 이름을 다시 만들 수 있다 (유니크 인덱스가 해제된다)', () => {
		const tag = createTag('업무');
		deleteTag(tag.id);
		expect(validateTagName('업무')).toBeNull();
		expect(createTag('업무').name).toBe('업무');
	});
});

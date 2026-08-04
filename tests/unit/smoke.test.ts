import { describe, expect, it } from 'vitest';
import { sqlite } from '../../src/lib/server/db/client';
import { createTask, listTasks } from '../../src/lib/server/store';

describe('테스트 환경 배선', () => {
	it('개발 DB가 아니라 테스트 DB를 가리킨다', () => {
		expect(sqlite.name).toMatch(/test-unit\.db$/);
	});

	it('beforeEach가 테이블을 비운다', () => {
		expect(listTasks({ status: 'all', tagId: null, due: 'all', q: '', sort: 'due' }).tasks).toHaveLength(0);
		createTask('격리 확인');
		expect(listTasks({ status: 'all', tagId: null, due: 'all', q: '', sort: 'due' }).tasks).toHaveLength(1);
	});

	it('이전 테스트의 데이터가 남지 않는다', () => {
		expect(listTasks({ status: 'all', tagId: null, due: 'all', q: '', sort: 'due' }).tasks).toHaveLength(0);
	});
});

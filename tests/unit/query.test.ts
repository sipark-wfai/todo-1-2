// URL 쿼리 파라미터가 조회 조건의 유일한 출처다: FR-508

import { describe, expect, it } from 'vitest';
import { actionWithQuery, parseTaskQuery } from '../../src/lib/query';

const url = (search: string) => new URL(`http://localhost${search}`);

describe('FR-508 조회 조건 ↔ URL 쿼리 파라미터', () => {
	it('파라미터가 없으면 기본값을 쓴다', () => {
		expect(parseTaskQuery(url('/'))).toEqual({
			status: 'all',
			tagId: null,
			due: 'all',
			q: '',
			sort: 'due'
		});
	});

	it('모든 조건을 읽어들인다', () => {
		expect(parseTaskQuery(url('/?status=open&tag=3&due=today&q=보고서&sort=priority'))).toEqual({
			status: 'open',
			tagId: 3,
			due: 'today',
			q: '보고서',
			sort: 'priority'
		});
	});

	it('허용되지 않은 값은 기본값으로 되돌린다', () => {
		const parsed = parseTaskQuery(url('/?status=해킹&due=999&sort=random'));
		expect(parsed.status).toBe('all');
		expect(parsed.due).toBe('all');
		expect(parsed.sort).toBe('due');
	});

	it('태그 id가 숫자가 아니면 무시한다', () => {
		expect(parseTaskQuery(url('/?tag=abc')).tagId).toBeNull();
		expect(parseTaskQuery(url('/?tag=')).tagId).toBeNull();
		expect(parseTaskQuery(url('/?tag=1;drop')).tagId).toBeNull();
	});

	it('검색어의 공백과 특수문자를 그대로 보존한다', () => {
		expect(parseTaskQuery(url('/?q=%20%25_')).q).toBe(' %_');
	});
});

describe('form action에 조회 조건 유지 (US-104 수용 기준 3)', () => {
	it('쿼리가 없으면 액션만 붙인다', () => {
		expect(actionWithQuery('', 'toggle')).toBe('?/toggle');
	});

	it('기존 쿼리를 유지한 채 액션을 덧붙인다', () => {
		expect(actionWithQuery('?status=open&sort=priority', 'toggle')).toBe(
			'?status=open&sort=priority&/toggle'
		);
	});

	it('앞의 물음표가 없어도 동작한다', () => {
		expect(actionWithQuery('status=open', 'delete')).toBe('?status=open&/delete');
	});
});

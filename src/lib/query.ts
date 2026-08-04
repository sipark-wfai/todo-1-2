// 필터·검색·정렬 상태는 URL 쿼리 파라미터가 유일한 출처다 (PRD FR-508).
// 덕분에 북마크·새로고침 후에도 조건이 유지되고, JS 없이 GET 폼 제출로 동작한다.

import type { DueFilter, SortKey, StatusFilter, TaskQuery } from '$lib/types';

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
	return allowed.includes(value as T) ? (value as T) : fallback;
}

export function parseTaskQuery(url: URL): TaskQuery {
	const tagParam = url.searchParams.get('tag');
	const tagId = tagParam && /^\d+$/.test(tagParam) ? Number(tagParam) : null;

	return {
		status: pick<StatusFilter>(url.searchParams.get('status'), ['all', 'open', 'done'], 'all'),
		tagId,
		due: pick<DueFilter>(url.searchParams.get('due'), ['all', 'today', 'week', 'overdue'], 'all'),
		q: url.searchParams.get('q') ?? '',
		sort: pick<SortKey>(url.searchParams.get('sort'), ['due', 'priority', 'created'], 'due')
	};
}

/**
 * form action에 현재 쿼리 문자열을 함께 실어 보낸다.
 * `action="?/toggle"`만 쓰면 기존 쿼리 파라미터가 날아가 필터가 초기화된다.
 * (화면설계서 SC-01 상호작용 규칙, PRD US-104 수용 기준 3)
 */
export function actionWithQuery(search: string, action: string): string {
	const params = search.replace(/^\?/, '');
	return params ? `?${params}&/${action}` : `?/${action}`;
}

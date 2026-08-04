// SC-01 할 일 목록 (docs/SCREENS.md §3)

import { fail } from '@sveltejs/kit';
import { parseTaskQuery } from '$lib/query';
import {
	createTask,
	deleteTask,
	getTask,
	listTags,
	listTasks,
	toggleTask,
	validateTitle
} from '$lib/server/store';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const query = parseTaskQuery(url);
	const { tasks, openCount, doneCount } = listTasks(query);

	return { tasks, openCount, doneCount, query, allTags: listTags() };
};

function taskId(data: FormData): number | null {
	const raw = data.get('id');
	const id = Number(raw);
	return typeof raw === 'string' && Number.isInteger(id) ? id : null;
}

export const actions: Actions = {
	// ② 추가 버튼
	create: async ({ request }) => {
		const data = await request.formData();
		const title = String(data.get('title') ?? '');

		const error = validateTitle(title);
		// 검증 실패 시 입력값을 함께 돌려보내 유실을 막는다 (PRD NFR-403)
		if (error) return fail(400, { createError: error, title });

		createTask(title);
		return { created: true };
	},

	// ⑫ 완료 체크박스
	toggle: async ({ request }) => {
		const data = await request.formData();
		const id = taskId(data);
		if (id === null || !toggleTask(id)) return fail(400, { toggleError: '할 일을 찾을 수 없습니다.' });
		return { toggled: true };
	},

	/**
	 * ⑰ 삭제.
	 * 확인 없이는 지우지 않는다 (PRD FR-108). 첫 제출은 확인 상태를 돌려주고,
	 * confirmed 값이 실려 온 두 번째 제출에서만 실제로 삭제한다.
	 * JS 유무와 무관하게 같은 경로로 동작한다 (NFR-401).
	 */
	delete: async ({ request }) => {
		const data = await request.formData();
		const id = taskId(data);
		if (id === null) return fail(400, { deleteError: '할 일을 찾을 수 없습니다.' });

		if (!data.get('confirmed')) {
			const task = getTask(id);
			if (!task) return fail(400, { deleteError: '할 일을 찾을 수 없습니다.' });
			return { pendingDelete: { id: task.id, title: task.title } };
		}

		if (!deleteTask(id)) return fail(400, { deleteError: '할 일을 찾을 수 없습니다.' });
		return { deleted: true };
	}
};

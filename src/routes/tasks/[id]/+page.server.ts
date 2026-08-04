// SC-02 할 일 상세·수정 (docs/SCREENS.md §3)

import { error, fail, redirect } from '@sveltejs/kit';
import { fromDateInput } from '$lib/date';
import {
	deleteTask,
	getTask,
	listTags,
	updateTask,
	validateDescription,
	validateTitle
} from '$lib/server/store';
import type { Priority } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

/**
 * ① 「목록으로」와 저장·삭제 후 복귀 경로.
 * from 파라미터는 사용자 입력이므로 그대로 리다이렉트하지 않고
 * URLSearchParams로 재조립해 오픈 리다이렉트를 차단한다.
 */
function backHref(url: URL): string {
	const from = url.searchParams.get('from') ?? '';
	const params = new URLSearchParams(from.replace(/^\?/, ''));
	const qs = params.toString();
	return qs ? `/?${qs}` : '/';
}

function parseId(value: string): number | null {
	return /^\d+$/.test(value) ? Number(value) : null;
}

export const load: PageServerLoad = async ({ params, url }) => {
	const id = parseId(params.id);
	const task = id === null ? null : getTask(id);
	// 없는 할 일은 SC-04(404)로 넘긴다
	if (!task) error(404, '요청한 할 일을 찾을 수 없습니다.');

	return { task, allTags: listTags(), backHref: backHref(url) };
};

export const actions: Actions = {
	// ⑨ 저장
	update: async ({ params, request, url }) => {
		const id = parseId(params.id);
		if (id === null || !getTask(id)) error(404, '요청한 할 일을 찾을 수 없습니다.');

		const data = await request.formData();
		const title = String(data.get('title') ?? '');
		const description = String(data.get('description') ?? '');
		const dueInput = String(data.get('dueDate') ?? '');
		const priorityRaw = Number(data.get('priority'));
		const priority: Priority = ([1, 2, 3] as const).includes(priorityRaw as Priority)
			? (priorityRaw as Priority)
			: 2;
		const completed = data.get('completed') !== null;
		const tagIds = data
			.getAll('tags')
			.map((v) => Number(v))
			.filter((n) => Number.isInteger(n));

		const titleError = validateTitle(title);
		const descriptionError = validateDescription(description);

		// 검증 실패 시 입력값 전부를 되돌려 화면에 유지한다 (PRD NFR-403)
		if (titleError || descriptionError) {
			return fail(400, {
				titleError,
				descriptionError,
				values: { title, description, dueDate: dueInput, priority, completed, tagIds }
			});
		}

		updateTask(id, {
			title,
			description,
			dueDate: fromDateInput(dueInput),
			priority,
			completed,
			tagIds
		});

		redirect(303, backHref(url));
	},

	// ⑪ 삭제: 확인 후에만 실행 (PRD FR-108). SC-01과 같은 2단계 방식.
	delete: async ({ params, request, url }) => {
		const id = parseId(params.id);
		if (id === null || !getTask(id)) error(404, '요청한 할 일을 찾을 수 없습니다.');

		const data = await request.formData();
		if (!data.get('confirmed')) return { pendingDelete: true };

		deleteTask(id);
		redirect(303, backHref(url));
	}
};

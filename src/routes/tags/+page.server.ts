// SC-03 태그 관리 (docs/SCREENS.md §3)

import { fail } from '@sveltejs/kit';
import { createTag, deleteTag, getTag, listTagsWithCount, validateTagName } from '$lib/server/store';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { tags: listTagsWithCount() };
};

function tagId(data: FormData): number | null {
	const raw = data.get('id');
	const id = Number(raw);
	return typeof raw === 'string' && Number.isInteger(id) ? id : null;
}

export const actions: Actions = {
	// ② 추가
	create: async ({ request }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '');

		const error = validateTagName(name);
		if (error) return fail(400, { createError: error, name });

		createTag(name);
		return { created: true };
	},

	/**
	 * ⑥ 삭제. 확인 단계에 연결된 할 일 개수를 표시한다 (PRD US-403 수용 기준 2).
	 * 태그를 지워도 할 일은 남는다 (FR-404).
	 */
	delete: async ({ request }) => {
		const data = await request.formData();
		const id = tagId(data);
		const tag = id === null ? null : getTag(id);
		if (!tag) return fail(400, { deleteError: '태그를 찾을 수 없습니다.' });

		if (!data.get('confirmed')) {
			return { pendingDelete: { id: tag.id, name: tag.name, taskCount: tag.taskCount } };
		}

		deleteTag(tag.id);
		return { deleted: true };
	}
};

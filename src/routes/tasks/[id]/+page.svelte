<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { toDateInput } from '$lib/date';
	import { actionWithQuery } from '$lib/query';
	import {
		DESCRIPTION_MAX,
		PRIORITY_LABEL,
		PRIORITY_OPTIONS,
		TITLE_MAX,
		type Priority
	} from '$lib/types';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const updateAction = $derived(actionWithQuery(page.url.search, 'update'));
	const deleteAction = $derived(actionWithQuery(page.url.search, 'delete'));

	// 검증 실패로 되돌아온 입력값이 있으면 그것을 우선 표시한다 (PRD NFR-403)
	const values = $derived({
		title: form?.values?.title ?? data.task.title,
		description: form?.values?.description ?? data.task.description ?? '',
		dueDate: form?.values?.dueDate ?? toDateInput(data.task.dueDate),
		priority: (form?.values?.priority ?? data.task.priority) as Priority,
		completed: form?.values?.completed ?? data.task.completedAt !== null,
		tagIds: form?.values?.tagIds ?? data.task.tags.map((t) => t.id)
	});
</script>

<svelte:head>
	<title>{data.task.title} · TODO</title>
</svelte:head>

<!-- ① 목록으로 -->
<nav class="wf-panel wf-panel--tight">
	<a href={data.backHref}>← 목록으로</a>
</nav>

<section class="wf-panel" aria-labelledby="edit-heading">
	<h2 class="wf-h2" id="edit-heading">할 일 상세</h2>

	<form method="POST" action={updateAction} use:enhance>
		<!-- ② 제목 -->
		<div class="wf-field">
			<label for="title">제목 *</label>
			<input
				id="title"
				name="title"
				type="text"
				required
				maxlength={TITLE_MAX}
				value={values.title}
				aria-describedby={form?.titleError ? 'title-error' : undefined}
				style="width: 100%"
			/>
			{#if form?.titleError}
				<p class="wf-error" id="title-error" role="alert">⚠ {form.titleError}</p>
			{/if}
		</div>

		<!-- ③ 설명 -->
		<div class="wf-field">
			<label for="description">설명</label>
			<textarea
				id="description"
				name="description"
				rows="4"
				maxlength={DESCRIPTION_MAX}
				aria-describedby={form?.descriptionError ? 'description-error' : undefined}
				>{values.description}</textarea
			>
			{#if form?.descriptionError}
				<p class="wf-error" id="description-error" role="alert">⚠ {form.descriptionError}</p>
			{/if}
		</div>

		<div class="wf-field-row">
			<!-- ④ 마감일 -->
			<div class="wf-field">
				<label for="dueDate">마감일</label>
				<input id="dueDate" name="dueDate" type="date" value={values.dueDate} />
				<p class="wf-hint">비우면 마감일 없음</p>
			</div>

			<!-- ⑤ 우선순위 -->
			<div class="wf-field">
				<label for="priority">우선순위</label>
				<select id="priority" name="priority">
					{#each PRIORITY_OPTIONS as level (level)}
						<option value={level} selected={values.priority === level}>
							{PRIORITY_LABEL[level]}
						</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- ⑥ 태그 선택 / ⑦ 태그 관리 -->
		<fieldset class="wf-fieldset">
			<legend>태그</legend>
			{#if data.allTags.length > 0}
				<div class="wf-checks">
					{#each data.allTags as tag (tag.id)}
						<label>
							<input
								type="checkbox"
								name="tags"
								value={tag.id}
								checked={values.tagIds.includes(tag.id)}
							/>
							{tag.name}
						</label>
					{/each}
					<a href="/tags">태그 관리 →</a>
				</div>
			{:else}
				<p class="wf-hint">등록된 태그가 없습니다. <a href="/tags">태그 관리 →</a></p>
			{/if}
		</fieldset>

		<!-- ⑧ 완료 -->
		<div class="wf-field">
			<div class="wf-checks">
				<label>
					<input type="checkbox" name="completed" checked={values.completed} />
					완료
				</label>
				{#if data.task.completedAt}
					<span class="wf-hint">(완료: {toDateInput(data.task.completedAt)})</span>
				{/if}
			</div>
		</div>

		<!-- ⑨ 저장 / ⑩ 취소 -->
		<div class="wf-actions">
			<button class="wf-btn" type="submit">저장</button>
			<a class="wf-link-btn" href={data.backHref}>취소</a>
		</div>
	</form>

	<!-- ⑪ 삭제 -->
	<div class="wf-actions wf-actions--split" style="margin-top: 0.75rem">
		<span></span>
		<form method="POST" action={deleteAction} use:enhance>
			<button class="wf-btn wf-btn--ghost" type="submit">삭제</button>
		</form>
	</div>

	{#if form?.pendingDelete}
		<div class="wf-confirm" role="alertdialog" aria-labelledby="confirm-heading">
			<p id="confirm-heading">
				이 할 일을 삭제할까요? — <strong>{data.task.title}</strong><br />
				삭제하면 복구할 수 없습니다.
			</p>
			<div class="wf-actions">
				<form method="POST" action={deleteAction} use:enhance>
					<input type="hidden" name="confirmed" value="1" />
					<button class="wf-btn" type="submit">삭제 확인</button>
				</form>
				<a class="wf-link-btn" href={page.url.pathname + page.url.search}>취소</a>
			</div>
		</div>
	{/if}

	<!-- ⑫ 메타 정보 -->
	<p class="wf-hint">
		생성 {toDateInput(data.task.createdAt)} · 수정 {toDateInput(data.task.updatedAt)}
	</p>
</section>

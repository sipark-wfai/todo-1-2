<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { DUE_STATE_LABEL, dueState, toDateInput } from '$lib/date';
	import { actionWithQuery } from '$lib/query';
	import { DUE_OPTIONS, PRIORITY_LABEL, SORT_OPTIONS, STATUS_OPTIONS, TITLE_MAX } from '$lib/types';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let titleInput: HTMLInputElement | null = $state(null);

	// form action에 현재 필터를 함께 실어야 조작 후에도 조건이 유지된다 (PRD US-104 수용 기준 3)
	const createAction = $derived(actionWithQuery(page.url.search, 'create'));
	const toggleAction = $derived(actionWithQuery(page.url.search, 'toggle'));
	const deleteAction = $derived(actionWithQuery(page.url.search, 'delete'));

	/** ⑯ 태그를 누르면 나머지 조건은 유지한 채 태그 필터만 바꾼다 */
	function tagHref(tagId: number): string {
		const params = new URLSearchParams(page.url.search);
		params.set('tag', String(tagId));
		return `?${params}`;
	}

	/** ⑬ 상세로 이동할 때 현재 조회 조건을 from으로 넘겨 복귀 시 복원한다 (화면설계서 SC-02 ①) */
	function taskHref(id: number): string {
		const search = page.url.search;
		return search ? `/tasks/${id}?from=${encodeURIComponent(search)}` : `/tasks/${id}`;
	}

	const hasFilter = $derived(
		data.query.status !== 'all' ||
			data.query.due !== 'all' ||
			data.query.tagId !== null ||
			data.query.q !== ''
	);
</script>

<svelte:head>
	<title>할 일 목록 · TODO</title>
</svelte:head>

<!-- ①②③ 추가 폼 -->
<section class="wf-panel" aria-labelledby="add-heading">
	<h2 class="wf-h2" id="add-heading">할 일 추가</h2>
	<form
		class="wf-inline-form"
		method="POST"
		action={createAction}
		use:enhance={() =>
			async ({ update }) => {
				await update();
				// 제출 후 입력창에 포커스를 되돌린다 (PRD US-101 수용 기준 3)
				titleInput?.focus();
			}}
	>
		<label class="wf-visually-hidden" for="new-title">할 일 제목</label>
		<input
			id="new-title"
			name="title"
			type="text"
			maxlength={TITLE_MAX}
			placeholder="할 일을 입력하세요"
			value={form?.title ?? ''}
			aria-describedby={form?.createError ? 'create-error' : undefined}
			bind:this={titleInput}
		/>
		<button class="wf-btn" type="submit">추가</button>
	</form>
	{#if form?.createError}
		<p class="wf-error" id="create-error" role="alert">⚠ {form.createError}</p>
	{/if}
</section>

<!-- ④⑤⑥⑦⑧⑨⑩ 필터 바: GET 폼이므로 JS 없이도 동작한다 (PRD NFR-402) -->
<section class="wf-panel" aria-labelledby="filter-heading">
	<h2 class="wf-h2" id="filter-heading">조회 조건</h2>
	<form class="wf-filters" method="GET" action="/">
		<div class="wf-field">
			<label for="f-status">상태</label>
			<select id="f-status" name="status">
				{#each STATUS_OPTIONS as opt (opt.value)}
					<option value={opt.value} selected={data.query.status === opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>

		<div class="wf-field">
			<label for="f-tag">태그</label>
			<select id="f-tag" name="tag">
				<option value="" selected={data.query.tagId === null}>전체</option>
				{#each data.allTags as tag (tag.id)}
					<option value={tag.id} selected={data.query.tagId === tag.id}>{tag.name}</option>
				{/each}
			</select>
		</div>

		<div class="wf-field">
			<label for="f-due">마감</label>
			<select id="f-due" name="due">
				{#each DUE_OPTIONS as opt (opt.value)}
					<option value={opt.value} selected={data.query.due === opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>

		<div class="wf-field">
			<label for="f-sort">정렬</label>
			<select id="f-sort" name="sort">
				{#each SORT_OPTIONS as opt (opt.value)}
					<option value={opt.value} selected={data.query.sort === opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>

		<div class="wf-field">
			<label for="f-q">검색</label>
			<input id="f-q" name="q" type="search" value={data.query.q} placeholder="제목·설명" />
		</div>

		<div class="wf-actions">
			<button class="wf-btn" type="submit">적용</button>
			<a class="wf-link-btn" href="/">초기화</a>
		</div>
	</form>
</section>

<!-- ⑰ 삭제 확인 단계 (PRD FR-108) -->
{#if form?.pendingDelete}
	<section class="wf-panel">
		<div class="wf-confirm" role="alertdialog" aria-labelledby="confirm-heading">
			<p id="confirm-heading">
				이 할 일을 삭제할까요? — <strong>{form.pendingDelete.title}</strong><br />
				삭제하면 복구할 수 없습니다.
			</p>
			<div class="wf-actions">
				<form method="POST" action={deleteAction} use:enhance>
					<input type="hidden" name="id" value={form.pendingDelete.id} />
					<input type="hidden" name="confirmed" value="1" />
					<button class="wf-btn" type="submit">삭제 확인</button>
				</form>
				<a class="wf-link-btn" href={page.url.search || '/'}>취소</a>
			</div>
		</div>
	</section>
{/if}

{#if form?.deleteError || form?.toggleError}
	<section class="wf-panel">
		<p class="wf-error" role="alert">⚠ {form.deleteError ?? form.toggleError}</p>
	</section>
{/if}

<!-- ⑪ 결과 요약 -->
<div class="wf-panel wf-panel--tight" aria-live="polite">
	미완료 {data.openCount}건 · 완료 {data.doneCount}건
	{#if hasFilter}<span>(조건 적용됨)</span>{/if}
</div>

<!-- ⑫~⑰ 할 일 목록 -->
{#if data.tasks.length > 0}
	<ul class="wf-list">
		{#each data.tasks as task (task.id)}
			{@const done = task.completedAt !== null}
			{@const state = dueState(task.dueDate, task.completedAt)}
			<li class="wf-item" class:wf-item--done={done}>
				<!--
					⑫ 완료 토글.
					체크박스는 클릭만으로 폼을 제출하지 못해 JS가 필요하므로,
					JS 없이도 동작하도록 토글 버튼(☐/☑)으로 구현한다. (PRD NFR-401)
				-->
				<form method="POST" action={toggleAction} use:enhance>
					<input type="hidden" name="id" value={task.id} />
					<button
						class="wf-btn wf-btn--ghost"
						type="submit"
						aria-pressed={done}
						aria-label={done ? `${task.title} 미완료로 되돌리기` : `${task.title} 완료로 표시`}
					>
						{done ? '☑' : '☐'}
					</button>
				</form>

				<div class="wf-item__body">
					<!-- ⑬ 제목 -->
					<a class="wf-item__title" href={taskHref(task.id)}>{task.title}</a>

					<p class="wf-item__meta">
						<!-- ⑭ 마감일 + 상태 라벨. 색이 아니라 텍스트로 구분한다 (NFR-304) -->
						{#if state}
							<span class="wf-badge" class:wf-badge--overdue={state === 'overdue'}>
								{DUE_STATE_LABEL[state]}
							</span>
						{/if}
						{#if task.dueDate}
							<span>{toDateInput(task.dueDate)}</span>
						{:else}
							<span>마감일 없음</span>
						{/if}

						<!-- ⑮ 우선순위 -->
						<span>{PRIORITY_LABEL[task.priority]}</span>

						{#if done && task.completedAt}
							<span>완료 {toDateInput(task.completedAt)}</span>
						{/if}

						<!-- ⑯ 태그 -->
						{#if task.tags.length > 0}
							<span class="wf-tags">
								{#each task.tags as tag (tag.id)}
									<a href={tagHref(tag.id)}>#{tag.name}</a>
								{/each}
							</span>
						{/if}
					</p>
				</div>

				<!-- ⑰ 삭제 -->
				<form method="POST" action={deleteAction} use:enhance>
					<input type="hidden" name="id" value={task.id} />
					<button class="wf-btn wf-btn--ghost" type="submit">삭제</button>
				</form>
			</li>
		{/each}
	</ul>
{:else if hasFilter}
	<!-- 빈 상태 (필터 결과 0건) -->
	<div class="wf-empty">
		<p>조건에 맞는 할 일이 없습니다.</p>
		<p><a href="/">필터 초기화</a></p>
	</div>
{:else}
	<!-- 빈 상태 (전체 0건) -->
	<div class="wf-empty">
		<p>등록된 할 일이 없습니다. 첫 할 일을 추가해 보세요.</p>
	</div>
{/if}

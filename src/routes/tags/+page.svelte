<script lang="ts">
	import { enhance } from '$app/forms';
	import { TAG_NAME_MAX } from '$lib/types';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let nameInput: HTMLInputElement | null = $state(null);
</script>

<svelte:head>
	<title>태그 관리 · TODO</title>
</svelte:head>

<section class="wf-panel" aria-labelledby="tags-heading">
	<h2 class="wf-h2" id="tags-heading">태그 관리</h2>

	<!-- ①②③ 태그 추가 -->
	<form
		class="wf-inline-form"
		method="POST"
		action="?/create"
		use:enhance={() =>
			async ({ update }) => {
				await update();
				nameInput?.focus();
			}}
	>
		<label class="wf-visually-hidden" for="tag-name">태그 이름</label>
		<input
			id="tag-name"
			name="name"
			type="text"
			maxlength={TAG_NAME_MAX}
			placeholder="새 태그 이름"
			value={form?.name ?? ''}
			aria-describedby={form?.createError ? 'tag-error' : undefined}
			bind:this={nameInput}
		/>
		<button class="wf-btn" type="submit">추가</button>
	</form>
	{#if form?.createError}
		<p class="wf-error" id="tag-error" role="alert">⚠ {form.createError}</p>
	{/if}
	{#if form?.deleteError}
		<p class="wf-error" role="alert">⚠ {form.deleteError}</p>
	{/if}

	<!-- ⑥ 삭제 확인 (연결 건수 명시) -->
	{#if form?.pendingDelete}
		<div class="wf-confirm" role="alertdialog" aria-labelledby="tag-confirm-heading">
			<p id="tag-confirm-heading">
				이 태그를 삭제할까요? — <strong>{form.pendingDelete.name}</strong><br />
				할 일 {form.pendingDelete.taskCount}건에 연결되어 있습니다. 태그 연결만 제거되고 할 일은
				삭제되지 않습니다. 삭제하면 복구할 수 없습니다.
			</p>
			<div class="wf-actions">
				<form method="POST" action="?/delete" use:enhance>
					<input type="hidden" name="id" value={form.pendingDelete.id} />
					<input type="hidden" name="confirmed" value="1" />
					<button class="wf-btn" type="submit">삭제 확인</button>
				</form>
				<a class="wf-link-btn" href="/tags">취소</a>
			</div>
		</div>
	{/if}
</section>

<!-- ④⑤⑥ 태그 목록 -->
{#if data.tags.length > 0}
	<div class="wf-panel">
		<table class="wf-table">
			<thead>
				<tr>
					<th scope="col">태그</th>
					<th scope="col">연결된 할 일</th>
					<th scope="col"><span class="wf-visually-hidden">작업</span></th>
				</tr>
			</thead>
			<tbody>
				{#each data.tags as tag (tag.id)}
					<tr>
						<!-- ④ 태그 이름: 해당 태그로 필터된 목록으로 이동 -->
						<td><a href="/?tag={tag.id}">{tag.name}</a></td>
						<!-- ⑤ 연결 건수 -->
						<td>할 일 {tag.taskCount}건</td>
						<!-- ⑥ 삭제 -->
						<td>
							<form method="POST" action="?/delete" use:enhance>
								<input type="hidden" name="id" value={tag.id} />
								<button class="wf-btn wf-btn--ghost" type="submit">삭제</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<div class="wf-empty">
		<p>아직 태그가 없습니다.</p>
	</div>
{/if}

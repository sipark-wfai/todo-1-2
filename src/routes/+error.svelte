<script lang="ts">
	import { page } from '$app/state';

	// SC-04 오류 / 없음 (docs/SCREENS.md §3)
	// 사용자를 막다른 길에 두지 않도록 항상 복구 경로를 제공한다.
	// 500에서는 내부 정보를 노출하지 않는다.
	const message = $derived(
		page.status === 404
			? (page.error?.message ?? '페이지를 찾을 수 없습니다.')
			: '일시적인 오류가 발생했습니다.'
	);
</script>

<svelte:head>
	<title>{page.status} · TODO</title>
</svelte:head>

<section class="wf-panel">
	<h2 class="wf-h2">{page.status}</h2>
	<p>{message}</p>
	<div class="wf-actions">
		{#if page.status !== 404}
			<a class="wf-link-btn" href={page.url.pathname}>다시 시도</a>
		{/if}
		<a class="wf-link-btn" href="/">목록으로</a>
	</div>
</section>

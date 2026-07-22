(() => {
	let loading = false;
	let retryTimer;

	function shortNumber(number) {
		if (number >= 1000000) return `${(number / 1000000).toFixed(1).replace(".0", "")}M`;
		if (number >= 1000) return `${(number / 1000).toFixed(1).replace(".0", "")}K`;
		return String(number);
	}

	async function refresh() {
		const card = document.getElementById("workers-usage-card");
		const value = document.getElementById("workers-usage-value");
		if (!card || !value || loading) return;
		loading = true;
		clearTimeout(retryTimer);
		try {
			const response = await fetch(`/static-api/workers-usage?t=${Date.now()}`, { cache: "no-store" });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const data = await response.json();
			const requests = Number(data.requests);
			const requestPercent = Number(data.requestPercent);
			if (!Number.isFinite(requests) || !Number.isFinite(requestPercent)) throw new Error("Invalid usage data");
			const percentText = `${requestPercent.toFixed(1).replace(".0", "")}%`;
			value.textContent = `${shortNumber(requests)} ${percentText}`;
			card.title = `Workers 今日请求量（UTC）：${requests.toLocaleString("zh-CN")}，使用率：${percentText}`;
		} catch {
			value.textContent = "--";
			card.title = "Workers 请求量暂不可用，正在重试";
			retryTimer = setTimeout(refresh, 10000);
		} finally {
			loading = false;
		}
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true });
	else refresh();
})();

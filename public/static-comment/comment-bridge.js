(() => {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, location.href);
    if (/^\/apis\/(?:api\.halo\.run\/v1alpha1\/comments\/[a-z0-9-]+\/reply|api\.commentnext\.xhhao\.com\/v1alpha1\/comments\/[a-z0-9-]+\/replies)$/i.test(url.pathname)) {
      const subject = document.querySelector('comment-widget[group="content.halo.run"][kind="Post"]')?.getAttribute('name');
      if (subject) url.searchParams.set('subjectName', subject);
      input = input instanceof Request ? new Request(url, input) : url.toString();
    }
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const interactionWrite = method === 'POST' && (
      url.pathname === '/apis/api.halo.run/v1alpha1/trackers/upvote' ||
      url.pathname === '/apis/api.halo.run/v1alpha1/trackers/downvote' ||
      /\/apis\/(?:api\.halo\.run\/v1alpha1\/comments(?:\/[a-z0-9-]+\/reply)?|api\.commentnext\.xhhao\.com\/v1alpha1\/comments(?:\/[a-z0-9-]+\/replies)?)$/i.test(url.pathname)
    );
    const result = nativeFetch(input, init);
    if (interactionWrite) result.then((response) => {
      if (response.ok) setTimeout(refreshPostStats, 300);
    }).catch(() => {});
    return result;
  };

  function getUpvotedNames() {
    try { return JSON.parse(localStorage.getItem('halo.upvoted.post.names') || '[]'); }
    catch { return []; }
  }

  function setUpvoteState(container, active) {
    const off = container.querySelector('[data-static-upvote-off]');
    const on = container.querySelector('[data-static-upvote-on]');
    off?.removeAttribute('x-cloak');
    on?.removeAttribute('x-cloak');
    if (off) off.hidden = active;
    if (on) on.hidden = !active;
    off?.classList.toggle('hidden', active);
    on?.classList.toggle('hidden', !active);
    container.setAttribute('aria-pressed', String(active));
  }

  function initStaticUpvote() {
    for (const counter of document.querySelectorAll('[data-upvote-post-name]')) {
      const name = counter.getAttribute('data-upvote-post-name');
      const container = counter.closest('.group');
      if (!name || !container || container.dataset.staticUpvoteReady) continue;
      container.dataset.staticUpvoteReady = 'true';
      container.setAttribute('role', 'button');
      container.setAttribute('tabindex', '0');
      setUpvoteState(container, getUpvotedNames().includes(name));

      const submit = async () => {
        if (container.dataset.staticUpvoteBusy) return;
        const active = getUpvotedNames().includes(name);
        container.dataset.staticUpvoteBusy = 'true';
        try {
          const response = await nativeFetch(`/apis/api.halo.run/v1alpha1/trackers/${active ? 'downvote' : 'upvote'}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ group: 'content.halo.run', plural: 'posts', name }),
          });
          if (!response.ok) throw new Error(`Vote change failed: ${response.status}`);
          const names = active
            ? getUpvotedNames().filter((item) => item !== name)
            : [...new Set([...getUpvotedNames(), name])];
          localStorage.setItem('halo.upvoted.post.names', JSON.stringify(names));
          setUpvoteState(container, !active);
          counter.textContent = String(Math.max(0, (Number(counter.textContent) || 0) + (active ? -1 : 1)));
          setTimeout(refreshPostStats, 300);
        } catch (error) {
          console.warn('Failed to change post vote', error);
        } finally {
          delete container.dataset.staticUpvoteBusy;
        }
      };
      container.addEventListener('click', submit);
      container.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); submit(); }
      });
    }
  }

  async function refreshPostStats() {
    const widget = document.querySelector('comment-widget[group="content.halo.run"][kind="Post"]');
    const name = widget?.getAttribute('name');
    if (!name) return;
    try {
      const response = await nativeFetch(`/static-api/post-stats?name=${encodeURIComponent(name)}`, {
        headers: { Accept: 'application/json' }, cache: 'no-store',
      });
      if (!response.ok) return;
      const stats = await response.json();
      const upvote = document.querySelector(`[data-upvote-post-name="${CSS.escape(name)}"]`);
      if (upvote) upvote.textContent = String(stats.upvote ?? 0);
      const commentLink = document.querySelector('a[href="#comment"]');
      const commentCount = commentLink?.querySelector('span.text-sm');
      if (commentCount) commentCount.textContent = String(stats.comment ?? 0);
    } catch (error) {
      console.warn('Failed to refresh post stats', error);
    }
  }

  document.addEventListener('DOMContentLoaded', () => { initStaticUpvote(); refreshPostStats(); });
  document.addEventListener('turbo:load', () => { initStaticUpvote(); refreshPostStats(); });
  window.addEventListener('halo:comment:created', refreshPostStats);

  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    for (const widget of document.querySelectorAll('comment-widget[group="content.halo.run"][kind="Post"]')) {
      const root = widget.shadowRoot;
      const active = root?.activeElement;
      const hasDraft = [...(root?.querySelectorAll('textarea, [contenteditable="true"]') || [])]
        .some((field) => String(field.value ?? field.textContent ?? '').trim());
      if (active || hasDraft) continue;
      const replacement = widget.cloneNode(false);
      widget.replaceWith(replacement);
    }
  }, 30000);

  setInterval(refreshPostStats, 30000);
})();

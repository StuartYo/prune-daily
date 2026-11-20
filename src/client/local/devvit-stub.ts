// Stand-ins for @devvit/web/client in the local preview build only.
export const context = { username: 'you', postId: 't3_local', subredditName: 'PruneDaily' };
export const requestExpandedMode = (_e: MouseEvent, entry: string) => {
  const q = window.location.search;
  window.location.href = `/${entry}.html${q}`;
};
let toastEl: HTMLDivElement | null = null;
export const showToast = (t: string | { text: string }) => {
  const text = typeof t === 'string' ? t : t.text;
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'local-toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.classList.add('on');
  window.setTimeout(() => toastEl?.classList.remove('on'), 2200);
};
export const canRunAsUser = async (_e: Event) => true;
export const navigateTo = (url: string) => window.open(url, '_blank');

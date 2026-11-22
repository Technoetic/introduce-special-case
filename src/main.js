import { LessonScreen } from './lesson.js';
import { routeFor, UpdateService } from './navigation.js';

const hero = document.querySelector('#hero');
const panel = document.querySelector('#lesson');
const lesson = new LessonScreen(panel);
const updates = new UpdateService(document.baseURI, document.querySelector('meta[name="tutorial-build"]').content);
const siteTitle = document.title;
let navigation = 0;

function focusLesson() {
  const heading = panel.querySelector('[data-lesson-heading], h2, h1') ?? panel;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
  panel.scrollIntoView({ block: 'start' });
}

function display(url, moveFocus) {
  const route = routeFor(url.hash);
  hero.hidden = route !== 'observe';
  if (route) {
    lesson.render(route);
  } else {
    panel.innerHTML = `<section class="lesson-missing">
      <h2>실습 단계를 찾을 수 없습니다</h2>
      <p>주소를 확인하거나 첫 단계에서 실습을 이어 가세요.</p>
      <a href="#/observe">첫 단계로 돌아가기</a>
    </section>`;
  }
  for (const link of document.querySelectorAll('a[data-nav]')) {
    const active = Boolean(route) && routeFor(link.hash) === route;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const title = panel.querySelector('[data-lesson-heading], h2, h1')?.textContent.trim();
  document.title = url.hash && title ? `${title} · ${siteTitle}` : siteTitle;
  if (moveFocus) focusLesson();
}

async function navigate(url, viaHistory) {
  const current = ++navigation;
  const changed = await updates.check();
  if (current !== navigation) return;
  if (changed) {
    // All lesson controls are synchronous practice selections; there are no pending edits or saves.
    const target = updates.targetUrl(url.href);
    if (viaHistory) location.replace(target);
    else location.assign(target);
    return;
  }
  if (!viaHistory && url.href !== location.href) history.pushState(null, '', url);
  display(url, Boolean(url.hash));
  if (!url.hash) {
    window.scrollTo(0, 0);
    if (!viaHistory) document.querySelector('[data-home]')?.focus({ preventScroll: true });
  }
}

document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  const start = event.target.closest('[data-start]');
  if (start) {
    event.preventDefault();
    focusLesson();
    return;
  }
  const link = event.target.closest('a');
  if (!link || link.target || link.hasAttribute('download')) return;
  if (!link.hasAttribute('data-home') && !link.getAttribute('href')?.startsWith('#/')) return;
  event.preventDefault();
  void navigate(new URL(link.href), false);
});
window.addEventListener('hashchange', () => { void navigate(new URL(location.href), true); });
window.addEventListener('pageshow', event => { if (event.persisted) void updates.check(); });
window.addEventListener('focus', () => { void updates.check(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void updates.check();
});

display(new URL(location.href), false);
if (location.hash) requestAnimationFrame(focusLesson);
void updates.check();

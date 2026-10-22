import './styles/app.css';
import { applyTheme } from './core/settings.js';
import { mount, reset, push, isTop } from './app.js';
import { loadDraft, hasDraft, newDraft } from './core/project.js';
import { onSharedImages } from './core/native.js';
import { homeScreen } from './views/home.js';
import { projectScreen } from './views/project.js';
import { importFiles } from './views/pick.js';

applyTheme();

/** صور وصلت من خارج التطبيق (مشاركة من تطبيق آخر، سحب وإفلات، لصق). */
async function receive(files) {
  if (!files.length) return;
  if (!hasDraft()) newDraft();
  const added = await importFiles(files);
  if (added && !isTop(projectScreen)) push(projectScreen);
}

async function boot() {
  await loadDraft().catch(() => {});
  mount(document.getElementById('app'));
  reset(homeScreen);
  document.getElementById('boot')?.remove();

  onSharedImages(receive);

  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    receive([...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/')));
  });
  window.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) receive(files);
  });
}

boot();

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

window.addEventListener('DOMContentLoaded', async () => {
  const t = window.tessera;
  const btn = document.getElementById('pick');
  const folderEl = document.getElementById('folder');
  const progressEl = document.getElementById('progress');

  if (!t || !t.pickFolder) {
    setText('status', 'Desktop - bridge unavailable');
    return;
  }

  btn.addEventListener('click', async () => {
    const folder = await t.pickFolder();
    if (!folder) return;
    folderEl.style.display = 'block';
    folderEl.textContent = `Download folder: ${folder}`;
  });

  if (t.onDownloadProgress) {
    t.onDownloadProgress((data) => {
      progressEl.style.display = 'block';
      const pct = data.total ? Math.round(((data.received || 0) / data.total) * 100) : 0;
      progressEl.textContent = `Downloading… ${pct}%`;
    });
  }
});

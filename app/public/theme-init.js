// Apply the saved appearance before the page renders to avoid a light flash.
(() => {
  let theme = 'light'
  try {
    if (localStorage.getItem('pan-command-builder-theme') === 'dark') theme = 'dark'
  } catch { /* The selector still works when browser storage is unavailable. */ }
  document.documentElement.dataset.theme = theme
})()

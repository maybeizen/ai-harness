/* global window */
/* Capture module-load failures before the Vue bundle can install its handlers.
 * Rust emits details only in explicitly enabled temporary-data qualification. */
window.addEventListener(
  'error',
  function (event) {
    var bridge = window.__TAURI_INTERNALS__;
    if (bridge && typeof bridge.invoke === 'function') {
      bridge
        .invoke('qualification_error', {
          message: event.message || 'An application asset failed to load.',
        })
        .catch(function () {});
    }
  },
  true,
);

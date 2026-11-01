import { invoke, isTauri } from '@tauri-apps/api/core';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './styles.css';
const app = createApp(App);
if (isTauri()) {
  app.config.errorHandler = (error) => {
    void invoke('qualification_error', { message: String(error) }).catch(
      () => undefined,
    );
  };
  window.addEventListener('unhandledrejection', (event) => {
    void invoke('qualification_error', { message: String(event.reason) }).catch(
      () => undefined,
    );
  });
  window.addEventListener('error', (event) => {
    void invoke('qualification_error', { message: event.message }).catch(
      () => undefined,
    );
  });
}
app.use(createPinia()).mount('#app');

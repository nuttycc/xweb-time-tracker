import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import router from './router';

const app = createApp(App);

// Install router
app.use(router);

// Mount the app
app.mount('#app');

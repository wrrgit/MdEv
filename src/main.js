import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import 'github-markdown-css/github-markdown.css'
import './styles/main.css'
// Tauri 构建下注入 window.api 垫片（Electron 构建下无副作用：preload 已注入则跳过）
import './api/tauriApi.js'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')

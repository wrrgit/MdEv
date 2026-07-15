import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import 'github-markdown-css/github-markdown.css'
import './styles/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')

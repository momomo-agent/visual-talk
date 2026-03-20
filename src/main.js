import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/base.css'
import './styles/canvas.css'
import './styles/blocks.css'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

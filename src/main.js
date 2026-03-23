import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/base.css'
import './styles/canvas.css'
import './styles/blocks.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.mount('#app')

// Expose for testing/debugging
if (typeof window !== 'undefined') {
  window.__pinia = pinia
}

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/base.css'
import './styles/canvas.css'
import './styles/blocks.css'
import './styles/blocks-renderer.css'
import './styles/themes/mercury.css'
import './styles/themes/dot.css'
import './styles/themes/sunny.css'
import './styles/themes/rainy.css'
import './styles/themes/moonlight.css'
import './styles/themes/snowy.css'
import './styles/themes/golden.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.mount('#app')

// Expose for testing/debugging
if (typeof window !== 'undefined') {
  window.__pinia = pinia
}

<template>
  <div class="input-bar">
    <input
      ref="inputRef"
      type="text"
      placeholder="say something..."
      autocomplete="off"
      v-model="inputText"
      @keydown="onKeyDown"
    />
    <button class="mic-btn" @mousedown="$emit('mic-down')" @mouseup="$emit('mic-up')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['send', 'mic-down', 'mic-up'])

const inputText = ref('')
const inputRef = ref(null)

function onKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    const text = inputText.value.trim()
    if (text) {
      emit('send', text)
      inputText.value = ''
    }
  }
}

defineExpose({ focus: () => inputRef.value?.focus() })
</script>

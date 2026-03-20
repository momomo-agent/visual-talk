<template>
  <div class="win-body">
    <template v-if="data.author || data.source">
      <div class="quote">"{{ data.text }}"</div>
      <div class="attribution">{{ data.author || '' }}{{ data.source ? ` — ${data.source}` : '' }}</div>
    </template>
    <template v-else>
      <div class="highlight">{{ data.text }}</div>
    </template>
  </div>
</template>

<script setup>
defineProps({
  data: { type: Object, required: true },
})
</script>

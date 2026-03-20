<template>
  <div class="win-body">
    <pre style="background:rgba(0,0,0,0.06);padding:14px;border-radius:4px;overflow-x:auto;font-size:12px;color:#4a3a2a"><code>{{ data.code || '' }}</code></pre>
  </div>
</template>

<script setup>
defineProps({
  data: { type: Object, required: true },
})
</script>

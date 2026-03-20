<template>
  <div class="win-body">
    <h3 v-if="data.title">{{ data.title }}</h3>
    <div class="cols" :style="{ gridTemplateColumns: `repeat(${(data.cols || []).length}, 1fr)` }">
      <div v-for="(c, i) in (data.cols || [])" :key="i" class="col">
        <h4 v-if="c.name">{{ c.name }}</h4>
        <div v-for="(it, j) in (c.items || [])" :key="j" class="col-item">{{ it }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  data: { type: Object, required: true },
})
</script>

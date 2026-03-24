<template>
  <div class="win-body table-block">
    <h3 v-if="data.title">{{ data.title }}</h3>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th v-for="(col, i) in columns" :key="i">{{ col }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in rows" :key="ri">
            <td v-for="(col, ci) in columns" :key="ci">{{ row[col] ?? row[ci] ?? '' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="data.footer" class="table-footer">{{ data.footer }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Object, required: true },
})

const columns = computed(() => {
  if (props.data.columns?.length) return props.data.columns
  // Infer from first row keys
  const first = props.data.rows?.[0]
  return first ? Object.keys(first) : []
})

const rows = computed(() => props.data.rows || [])
</script>

<style scoped>
.table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 2px solid var(--table-header-border);
  color: var(--table-header-color);
  font-weight: 600;
  font-size: 11px;
  white-space: nowrap;
}
td {
  padding: 5px 10px;
  border-bottom: 1px solid var(--table-cell-border);
  color: var(--table-cell-color);
}
tr:last-child td {
  border-bottom: none;
}
tbody tr:hover {
  background: var(--table-hover-bg);
}
.table-footer {
  color: var(--table-footer-color);
  font-size: 10px;
  margin-top: 8px;
}
</style>

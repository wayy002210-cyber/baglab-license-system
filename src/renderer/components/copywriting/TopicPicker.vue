<script setup lang="ts">
type Topic = { id: string; title: string; angle: string; hook: string };

defineProps<{
  topics: Topic[];
  selectedId: string | null;
  loading: boolean;
}>();
const emit = defineEmits<{
  select: [id: string];
  refresh: [];
}>();
</script>

<template>
  <section class="topic-picker">
    <header>
      <div>
        <strong>选题库</strong>
        <span>一次生成 5 个不同内容角度</span>
      </div>
      <button
        type="button"
        data-action="refresh-topics"
        :disabled="loading"
        @click="emit('refresh')"
      >
        {{ loading ? "生成中…" : "换一批" }}
      </button>
    </header>
    <div class="topic-list">
      <button
        v-for="(topic, index) in topics"
        :key="topic.id"
        type="button"
        :data-topic-id="topic.id"
        :class="{ selected: selectedId === topic.id }"
        @click="emit('select', topic.id)"
      >
        <span>{{ String.fromCharCode(65 + index) }}</span>
        <div>
          <strong>{{ topic.title }}</strong>
          <small>{{ topic.hook }} · {{ topic.angle }}</small>
        </div>
      </button>
    </div>
  </section>
</template>

<style scoped>
.topic-picker {
  display: grid;
  gap: 14px;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
header strong,
header span {
  display: block;
}
header span,
small {
  margin-top: 4px;
  color: var(--text-muted);
}
header button {
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: #fff;
}
.topic-list {
  display: grid;
  gap: 10px;
}
.topic-list > button {
  display: flex;
  gap: 14px;
  align-items: center;
  width: 100%;
  padding: 15px;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 13px;
  background: var(--surface-muted);
}
.topic-list > button > span {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  flex: none;
  border-radius: 50%;
  color: #fff;
  background: var(--brand-black);
}
.topic-list .selected {
  color: var(--brand-yellow);
  background: var(--brand-black);
}
.topic-list .selected small {
  color: #d1d1d1;
}
</style>

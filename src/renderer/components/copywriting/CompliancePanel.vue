<script setup lang="ts">
type Issue = {
  term: string;
  start: number;
  end: number;
  riskType: string;
  explanation: string;
  suggestion: string;
};
defineProps<{ issues: Issue[]; disclaimer: string }>();
const emit = defineEmits<{ apply: [issue: Issue] }>();
</script>

<template>
  <section class="compliance-panel">
    <article v-for="issue in issues" :key="`${issue.start}-${issue.end}`">
      <div>
        <strong>{{ issue.term }}</strong>
        <p>{{ issue.explanation }}</p>
        <small>建议：{{ issue.suggestion }}</small>
      </div>
      <button
        type="button"
        data-action="apply-suggestion"
        @click="emit('apply', issue)"
      >
        采用建议
      </button>
    </article>
    <p v-if="!issues.length" class="safe">未发现当前规则库中的高风险表达。</p>
    <footer>{{ disclaimer }}</footer>
  </section>
</template>

<style scoped>
.compliance-panel {
  display: grid;
  gap: 9px;
}
article {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 13px;
  border: 1px solid #f3d394;
  border-radius: 12px;
  background: #fff9e9;
}
article p,
article small {
  display: block;
  margin: 4px 0 0;
  color: #795c27;
}
article button {
  align-self: center;
  white-space: nowrap;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  color: #fff;
  background: var(--brand-black);
}
.safe {
  color: var(--success);
}
footer {
  color: var(--text-muted);
  font-size: 12px;
}
</style>

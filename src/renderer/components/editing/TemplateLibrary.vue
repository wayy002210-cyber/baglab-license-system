<script setup lang="ts">
type Template = Awaited<ReturnType<typeof window.autocut.listTemplates>>[number];
defineProps<{ templates: Template[]; selectedId: string | null }>();
defineEmits<{ select: [template: Template]; save: []; duplicate: [id: string] }>();
</script>
<template>
  <aside class="panel template-library">
    <header><div><h3>模板库</h3><p>套用镜头结构或保存当前结构</p></div><el-button size="small" @click="$emit('save')">保存模板</el-button></header>
    <button
      v-for="item in templates"
      :key="item.id"
      type="button"
      class="template-item"
      :class="{ active: item.id === selectedId }"
      @click="$emit('select', item)"
    >
      <strong>{{ item.name }}</strong>
      <span>{{ item.shots.length }} 个镜头</span>
      <small>{{ item.description || "自定义模板" }}</small>
    </button>
    <div v-if="!templates.length" class="empty">暂无模板，当前音频段落会自动形成镜头。</div>
  </aside>
</template>
<style scoped>
.panel{padding:18px}.panel header{display:flex;justify-content:space-between;gap:10px}.panel h3,.panel p{margin:0}.panel p,.empty{color:var(--muted);font-size:12px;margin-top:4px}.template-item{width:100%;display:grid;text-align:left;gap:5px;margin-top:12px;padding:14px;border:1px solid var(--line);border-radius:14px;background:#fff}.template-item.active{background:#111;color:#fff;border-color:#111}.template-item span,.template-item small{font-size:12px;color:#8a8a8a}
</style>

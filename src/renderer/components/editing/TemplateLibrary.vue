<script setup lang="ts">
type Template = Awaited<ReturnType<typeof window.autocut.listTemplates>>[number];
defineProps<{
  templates: Template[];
  selectedId: string | null;
  name: string;
  description: string;
}>();
defineEmits<{
  select: [template: Template];
  save: [];
  new: [];
  duplicate: [id: string];
  "update:name": [value: string];
  "update:description": [value: string];
}>();
</script>
<template>
  <aside class="panel template-library">
    <header><div><h3>模板库</h3><p>选择、复制或编辑镜头模板</p></div><el-button size="small" type="primary" @click="$emit('new')">新建</el-button></header>
    <div class="template-form">
      <label>模板名称
        <el-input :model-value="name" @update:model-value="$emit('update:name', String($event))" />
      </label>
      <label>模板说明
        <el-input :model-value="description" type="textarea" :rows="2" @update:model-value="$emit('update:description', String($event))" />
      </label>
      <el-button type="primary" @click="$emit('save')">
        {{ selectedId ? "保存修改" : "创建模板" }}
      </el-button>
    </div>
    <div
      v-for="item in templates"
      :key="item.id"
      class="template-entry"
    >
      <button
        type="button"
        class="template-item"
        :class="{ active: item.id === selectedId }"
        @click="$emit('select', item)"
      >
        <strong>{{ item.name }}</strong>
        <span>{{ item.shots.length }} 个镜头</span>
        <small>{{ item.description || "自定义模板" }}</small>
      </button>
      <el-button
        v-if="item.id === selectedId"
        size="small"
        class="duplicate"
        @click="$emit('duplicate', item.id)"
      >
        复制模板
      </el-button>
    </div>
    <div v-if="!templates.length" class="empty">暂无模板，当前音频段落会自动形成镜头。</div>
  </aside>
</template>
<style scoped>
.panel{padding:20px}.panel header{display:flex;justify-content:space-between;gap:10px}.panel h3,.panel p{margin:0}.panel p,.empty{color:var(--muted);font-size:12px;margin-top:4px}.template-form{display:grid;gap:10px;margin:16px 0;padding:14px;border-radius:14px;background:#f7f7f3}.template-form label{display:grid;gap:5px;font-size:12px;color:var(--muted)}.template-entry{display:grid;gap:6px;margin-top:12px}.template-item{width:100%;display:grid;text-align:left;gap:5px;padding:14px;border:1px solid var(--line);border-radius:14px;background:#fff}.template-item.active{background:#111;color:#fff;border-color:#111}.template-item span,.template-item small{font-size:12px;color:#8a8a8a}.duplicate{justify-self:stretch}
</style>

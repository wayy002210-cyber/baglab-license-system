<script setup lang="ts">
import { reactive, ref } from "vue";

type ReferenceScriptInput = {
  title: string;
  industry: string;
  tags: string[];
  content: string;
  structure: { hook: string; narrative: string; cta: string };
};

type ReferenceScript = ReferenceScriptInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

defineProps<{ scripts: ReferenceScript[] }>();
const emit = defineEmits<{
  create: [input: ReferenceScriptInput];
  update: [id: string, input: ReferenceScriptInput];
  delete: [id: string];
}>();
const expandedId = ref<string | null>(null);
const editingId = ref<string | null>(null);

const form = reactive({
  title: "",
  industry: "",
  tags: "",
  content: ""
});
const editForm = reactive({
  title: "",
  industry: "",
  tags: "",
  content: ""
});

function createScript(): void {
  const title = form.title.trim();
  const content = form.content.trim();
  if (!title || !content) return;
  emit("create", {
    title,
    industry: form.industry.trim(),
    tags: form.tags
      .split(/[,，、\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
    content,
    structure: { hook: "", narrative: "", cta: "" }
  });
  Object.assign(form, { title: "", industry: "", tags: "", content: "" });
}
function beginEdit(script: ReferenceScript): void {
  editingId.value = script.id;
  Object.assign(editForm, {
    title: script.title,
    industry: script.industry,
    tags: script.tags.join("，"),
    content: script.content
  });
}
function saveEdit(script: ReferenceScript): void {
  const title = editForm.title.trim();
  const content = editForm.content.trim();
  if (!title || !content) return;
  emit("update", script.id, {
    title,
    industry: editForm.industry.trim(),
    tags: editForm.tags
      .split(/[,，、\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
    content,
    structure: script.structure
  });
  editingId.value = null;
}
</script>

<template>
  <section class="reference-scripts">
    <div class="reference-form">
      <input v-model="form.title" data-field="title" placeholder="脚本标题" />
      <input v-model="form.industry" data-field="industry" placeholder="行业" />
      <input
        v-model="form.tags"
        data-field="tags"
        placeholder="标签，用逗号分隔"
      />
      <textarea
        v-model="form.content"
        data-field="content"
        rows="4"
        placeholder="粘贴优秀口播脚本"
      />
      <button
        type="button"
        data-action="create-script"
        class="primary"
        @click="createScript"
      >
        加入脚本库
      </button>
    </div>
    <div v-if="scripts.length" class="script-list">
      <article v-for="script in scripts" :key="script.id">
        <div class="script-summary">
          <strong>{{ script.title }}</strong>
          <small>{{ script.industry || "未分类" }} · {{ script.tags.join(" / ") }}</small>
        </div>
        <div class="script-actions">
          <button type="button" data-action="preview-script" @click="expandedId = expandedId === script.id ? null : script.id">
            {{ expandedId === script.id ? "收起" : "预览" }}
          </button>
          <button type="button" @click="beginEdit(script)">编辑</button>
          <button type="button" data-action="delete-script" class="danger" @click="emit('delete', script.id)">删除</button>
        </div>
        <div v-if="expandedId === script.id" class="script-preview">
          <pre>{{ script.content }}</pre>
        </div>
        <div v-if="editingId === script.id" class="edit-form">
          <input v-model="editForm.title" placeholder="脚本标题" />
          <input v-model="editForm.industry" placeholder="行业" />
          <input v-model="editForm.tags" placeholder="标签" />
          <textarea v-model="editForm.content" rows="8" />
          <div>
            <button type="button" @click="editingId = null">取消</button>
            <button type="button" class="primary" @click="saveEdit(script)">保存修改</button>
          </div>
        </div>
      </article>
    </div>
    <p v-else class="empty">还没有参考脚本，导入后会参与文案结构检索。</p>
  </section>
</template>

<style scoped>
.reference-scripts,
.reference-form {
  display: grid;
  gap: 10px;
}
.reference-form {
  grid-template-columns: 1fr 160px;
}
input,
textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
}
textarea {
  grid-column: 1 / -1;
  resize: vertical;
}
button {
  padding: 9px 14px;
  border: 0;
  border-radius: 9px;
  cursor: pointer;
}
.primary {
  width: max-content;
  color: #fff;
  background: var(--brand-black);
}
.script-list {
  display: grid;
  gap: 8px;
}
.script-list article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
}
.script-actions {
  display: flex;
  gap: 8px;
}
.script-preview,
.edit-form {
  grid-column: 1 / -1;
}
.script-preview {
  max-height: 260px;
  overflow: auto;
  padding: 14px;
  border-radius: 10px;
  background: #f7f7f3;
}
.script-preview pre {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.75;
  font-family: inherit;
}
.edit-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding-top: 12px;
}
.edit-form textarea,
.edit-form > div {
  grid-column: 1 / -1;
}
.edit-form > div {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.script-list strong,
.script-list small {
  display: block;
}
.script-list small,
.empty {
  margin-top: 4px;
  color: var(--text-muted);
}
.danger {
  color: var(--danger);
  background: #fff1f1;
}
</style>

<script setup lang="ts">
import { reactive } from "vue";

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
  delete: [id: string];
}>();

const form = reactive({
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
        <div>
          <strong>{{ script.title }}</strong>
          <small>{{ script.industry || "未分类" }} · {{ script.tags.join(" / ") }}</small>
        </div>
        <button
          type="button"
          data-action="delete-script"
          class="danger"
          @click="emit('delete', script.id)"
        >
          删除
        </button>
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
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

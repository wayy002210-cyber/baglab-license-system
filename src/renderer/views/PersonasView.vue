<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { CopyDocument, Delete, Edit, StarFilled } from "@element-plus/icons-vue";
import type { PersonaInput } from "../../shared/contracts";
import PageIntro from "../components/PageIntro.vue";

type Persona = PersonaInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

const personas = ref<Persona[]>([]);
const loading = ref(false);
const dialogOpen = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  name: "",
  industry: "",
  brandFactsText: "",
  tone: "",
  cta: "",
  bannedWordsText: "",
  isDefault: false
});

const dialogTitle = computed(() => (editingId.value ? "编辑账号档案" : "新建账号档案"));

function resetForm(): void {
  editingId.value = null;
  Object.assign(form, {
    name: "",
    industry: "",
    brandFactsText: "",
    tone: "",
    cta: "",
    bannedWordsText: "",
    isDefault: personas.value.length === 0
  });
}

function toInput(): PersonaInput {
  const toList = (value: string) =>
    value
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  return {
    name: form.name,
    industry: form.industry,
    brandFacts: toList(form.brandFactsText),
    tone: form.tone,
    cta: form.cta,
    bannedWords: toList(form.bannedWordsText),
    isDefault: form.isDefault
  };
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    personas.value = await window.autocut.listPersonas();
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  resetForm();
  dialogOpen.value = true;
}

function openEdit(persona: Persona): void {
  editingId.value = persona.id;
  Object.assign(form, {
    name: persona.name,
    industry: persona.industry,
    brandFactsText: persona.brandFacts.join("\n"),
    tone: persona.tone,
    cta: persona.cta,
    bannedWordsText: persona.bannedWords.join("，"),
    isDefault: persona.isDefault
  });
  dialogOpen.value = true;
}

async function save(): Promise<void> {
  if (!form.name.trim()) {
    ElMessage.warning("请输入档案名称");
    return;
  }
  if (editingId.value) {
    await window.autocut.updatePersona(editingId.value, toInput());
  } else {
    await window.autocut.createPersona(toInput());
  }
  dialogOpen.value = false;
  await load();
  ElMessage.success("档案已保存");
}

async function duplicate(id: string): Promise<void> {
  await window.autocut.duplicatePersona(id);
  await load();
  ElMessage.success("已创建档案副本");
}

async function remove(persona: Persona): Promise<void> {
  await ElMessageBox.confirm(`确认删除“${persona.name}”？`, "删除档案", {
    type: "warning",
    confirmButtonText: "删除",
    cancelButtonText: "取消"
  });
  await window.autocut.deletePersona(persona.id);
  await load();
}

onMounted(load);
</script>

<template>
  <div class="page">
    <PageIntro
      title="账号档案"
      description="沉淀品牌事实、人设与内容表达边界，为文案改写提供可靠依据"
      action="新建档案"
      @action="openCreate"
    />
    <section v-loading="loading" class="persona-grid">
      <article v-for="persona in personas" :key="persona.id" class="surface persona-card">
        <div class="persona-card__head">
          <div class="avatar">{{ persona.name.slice(0, 1) }}</div>
          <el-tag v-if="persona.isDefault" type="primary" effect="light" round>
            <el-icon><StarFilled /></el-icon>
            默认档案
          </el-tag>
        </div>
        <h3>{{ persona.name }}</h3>
        <p>{{ persona.industry || "未设置行业" }}</p>
        <div class="facts">
          <el-tag
            v-for="fact in persona.brandFacts.slice(0, 3)"
            :key="fact"
            effect="plain"
          >
            {{ fact }}
          </el-tag>
        </div>
        <blockquote>{{ persona.tone || "尚未设置表达风格" }}</blockquote>
        <footer>
          <el-button text :icon="Edit" @click="openEdit(persona)">编辑</el-button>
          <el-button text :icon="CopyDocument" @click="duplicate(persona.id)">复制</el-button>
          <el-button text type="danger" :icon="Delete" @click="remove(persona)">删除</el-button>
        </footer>
      </article>
      <button v-if="personas.length === 0 && !loading" class="empty-card surface" @click="openCreate">
        <span>＋</span>
        <strong>创建第一个账号档案</strong>
        <small>品牌事实会约束 AI 文案，减少内容幻觉</small>
      </button>
    </section>

    <el-dialog v-model="dialogOpen" :title="dialogTitle" width="620px">
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="档案名称" required>
            <el-input v-model="form.name" maxlength="80" />
          </el-form-item>
          <el-form-item label="所属行业">
            <el-input v-model="form.industry" maxlength="80" />
          </el-form-item>
        </div>
        <el-form-item label="品牌事实">
          <el-input
            v-model="form.brandFactsText"
            type="textarea"
            :rows="4"
            placeholder="每行一条，例如：自有工厂、十年经验"
          />
        </el-form-item>
        <el-form-item label="表达风格">
          <el-input v-model="form.tone" placeholder="例如：专业、直接、真实克制" />
        </el-form-item>
        <el-form-item label="行动引导">
          <el-input v-model="form.cta" placeholder="例如：关注我，了解更多工厂经营方法" />
        </el-form-item>
        <el-form-item label="禁用词">
          <el-input v-model="form.bannedWordsText" placeholder="使用逗号分隔" />
        </el-form-item>
        <el-checkbox v-model="form.isDefault">设为默认档案</el-checkbox>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" @click="save">保存档案</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.persona-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(240px, 1fr));
  gap: 18px;
}
.persona-card {
  min-height: 300px;
  padding: 22px;
}
.persona-card__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.avatar {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  color: white;
  font-size: 22px;
  font-weight: 800;
  background: linear-gradient(135deg, #5b8def, #786fed);
}
.persona-card h3 {
  margin: 18px 0 5px;
}
.persona-card > p {
  margin: 0;
  color: #8b97aa;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  min-height: 32px;
  margin-top: 18px;
}
blockquote {
  min-height: 48px;
  margin: 14px 0;
  padding: 12px;
  border-left: 3px solid #94b2f5;
  border-radius: 0 10px 10px 0;
  background: #f6f8fc;
  color: #67758c;
  font-size: 13px;
}
footer {
  display: flex;
  border-top: 1px solid #edf0f5;
  padding-top: 10px;
}
.empty-card {
  min-height: 300px;
  border-style: dashed;
  color: #8390a4;
  cursor: pointer;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 9px;
}
.empty-card span {
  font-size: 42px;
  color: #5b8def;
}
.empty-card small {
  max-width: 220px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
@media (max-width: 1100px) {
  .persona-grid {
    grid-template-columns: repeat(2, minmax(240px, 1fr));
  }
}
</style>

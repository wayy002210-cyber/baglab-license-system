<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  CopyDocument,
  Delete,
  Edit,
  Plus,
  Top,
  Bottom
} from "@element-plus/icons-vue";
import PageIntro from "../components/PageIntro.vue";

type VideoTemplate = Awaited<ReturnType<typeof window.autocut.listTemplates>>[number];
type Shot = VideoTemplate["shots"][number];
type Category = Awaited<ReturnType<typeof window.autocut.listAssetCategories>>[number];

const roleOptions = [
  { value: "hook", label: "开场钩子" },
  { value: "problem", label: "用户痛点" },
  { value: "proof", label: "事实证明" },
  { value: "solution", label: "解决方案" },
  { value: "cta", label: "行动引导" },
  { value: "custom", label: "自定义" }
] as const;

const templates = ref<VideoTemplate[]>([]);
const categories = ref<Category[]>([]);
const loading = ref(false);
const editorOpen = ref(false);
const editingId = ref<string | null>(null);
const form = reactive<{
  name: string;
  description: string;
  shots: Array<Omit<Shot, "id" | "index">>;
}>({
  name: "",
  description: "",
  shots: []
});
const editorTitle = computed(() => (editingId.value ? "编辑镜头模板" : "新建镜头模板"));

function freshShot(): Omit<Shot, "id" | "index"> {
  return {
    role: "custom",
    assetCategoryId: categories.value[0]?.id ?? null,
    copywriting: "",
    durationMode: "voice",
    durationSec: null,
    muteOriginal: true
  };
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    [templates.value, categories.value] = await Promise.all([
      window.autocut.listTemplates(),
      window.autocut.listAssetCategories()
    ]);
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  editingId.value = null;
  form.name = "";
  form.description = "";
  form.shots = [freshShot()];
  editorOpen.value = true;
}

function openEdit(template: VideoTemplate): void {
  editingId.value = template.id;
  form.name = template.name;
  form.description = template.description;
  form.shots = template.shots.map(({ id: _id, index: _index, ...shot }) => ({
    ...shot
  }));
  editorOpen.value = true;
}

function move(index: number, direction: -1 | 1): void {
  const target = index + direction;
  if (target < 0 || target >= form.shots.length) return;
  const [shot] = form.shots.splice(index, 1);
  form.shots.splice(target, 0, shot);
}

function removeShot(index: number): void {
  if (form.shots.length === 1) {
    ElMessage.warning("模板至少需要一个镜头");
    return;
  }
  form.shots.splice(index, 1);
}

async function save(): Promise<void> {
  if (!form.name.trim()) {
    ElMessage.warning("请输入模板名称");
    return;
  }
  const invalidFixed = form.shots.some(
    (shot) =>
      shot.durationMode === "fixed" &&
      (!shot.durationSec || shot.durationSec <= 0)
  );
  if (invalidFixed) {
    ElMessage.warning("固定时长镜头必须设置正数时长");
    return;
  }
  const input = {
    name: form.name,
    description: form.description,
    shots: form.shots.map((shot) => ({
      ...shot,
      durationSec: shot.durationMode === "fixed" ? shot.durationSec : null
    }))
  };
  if (editingId.value) {
    await window.autocut.updateTemplate(editingId.value, input);
  } else {
    await window.autocut.createTemplate(input);
  }
  editorOpen.value = false;
  await load();
  ElMessage.success("模板已保存");
}

async function duplicate(id: string): Promise<void> {
  await window.autocut.duplicateTemplate(id);
  await load();
  ElMessage.success("已创建模板副本");
}

async function removeTemplate(template: VideoTemplate): Promise<void> {
  await ElMessageBox.confirm(`确认删除“${template.name}”？`, "删除模板", {
    type: "warning",
    confirmButtonText: "删除",
    cancelButtonText: "取消"
  });
  await window.autocut.deleteTemplate(template.id);
  await load();
}

async function exportTemplate(template: VideoTemplate): Promise<void> {
  const path = await window.autocut.exportTemplate(template.id);
  if (path) ElMessage.success("模板已导出");
}

async function importTemplate(): Promise<void> {
  const imported = await window.autocut.importTemplate();
  if (imported) {
    await load();
    ElMessage.success("模板已导入");
  }
}

function categoryName(id: string | null): string {
  return categories.value.find((category) => category.id === id)?.name ?? "未绑定";
}

onMounted(load);
</script>

<template>
  <div class="page">
    <PageIntro
      title="镜头模板"
      description="用语义镜头槽位编排可复用的视频结构，任务创建后使用不可变快照"
      action="新建模板"
      @action="openCreate"
    />
    <div class="template-tools">
      <el-button @click="importTemplate">导入模板 JSON</el-button>
    </div>
    <section v-loading="loading" class="template-grid">
      <article v-for="template in templates" :key="template.id" class="surface template-card">
        <div class="template-card__preview">
          <div class="phone">
            <span v-for="shot in template.shots.slice(0, 6)" :key="shot.id" />
          </div>
          <el-tag effect="dark" round>{{ template.shots.length }} 镜头</el-tag>
        </div>
        <h3>{{ template.name }}</h3>
        <p>{{ template.description }}</p>
        <div class="structure">
          <span v-for="shot in template.shots.slice(0, 4)" :key="shot.id">
            {{ roleOptions.find((role) => role.value === shot.role)?.label }}
          </span>
          <span v-if="template.shots.length > 4">+{{ template.shots.length - 4 }}</span>
        </div>
        <footer>
          <el-button text :icon="Edit" @click="openEdit(template)">编辑</el-button>
          <el-button text :icon="CopyDocument" @click="duplicate(template.id)">复制</el-button>
          <el-button text @click="exportTemplate(template)">导出</el-button>
          <el-button text type="danger" :icon="Delete" @click="removeTemplate(template)">删除</el-button>
        </footer>
      </article>
    </section>

    <el-drawer v-model="editorOpen" :title="editorTitle" size="860px">
      <el-form label-position="top">
        <div class="header-fields">
          <el-form-item label="模板名称" required>
            <el-input v-model="form.name" maxlength="100" />
          </el-form-item>
          <el-form-item label="画布规格">
            <el-input model-value="1080 × 1920 · 30fps" disabled />
          </el-form-item>
        </div>
        <el-form-item label="模板说明">
          <el-input v-model="form.description" maxlength="500" />
        </el-form-item>
      </el-form>

      <div class="shot-heading">
        <div>
          <h3>镜头编排</h3>
          <p>配音模式会自动使用 TTS 音频时长。</p>
        </div>
        <el-button :icon="Plus" @click="form.shots.push(freshShot())">添加镜头</el-button>
      </div>

      <article v-for="(shot, index) in form.shots" :key="index" class="shot-row">
        <div class="shot-index">{{ index + 1 }}</div>
        <div class="shot-fields">
          <el-select v-model="shot.role" aria-label="镜头角色">
            <el-option
              v-for="role in roleOptions"
              :key="role.value"
              :label="role.label"
              :value="role.value"
            />
          </el-select>
          <el-select v-model="shot.assetCategoryId" aria-label="素材分类" clearable>
            <el-option
              v-for="category in categories"
              :key="category.id"
              :label="category.name"
              :value="category.id"
            />
          </el-select>
          <el-select v-model="shot.durationMode" aria-label="时长策略">
            <el-option label="跟随配音" value="voice" />
            <el-option label="固定时长" value="fixed" />
            <el-option label="自动时长" value="auto" />
          </el-select>
          <el-input-number
            v-if="shot.durationMode === 'fixed'"
            v-model="shot.durationSec"
            :min="0.5"
            :max="30"
            :step="0.5"
            controls-position="right"
          />
        </div>
        <el-input
          v-model="shot.copywriting"
          class="shot-copy"
          type="textarea"
          :rows="2"
          placeholder="填写本镜头的文案职责或默认文案"
        />
        <div class="shot-actions">
          <el-checkbox v-model="shot.muteOriginal">静音原声</el-checkbox>
          <el-tooltip :content="categoryName(shot.assetCategoryId)">
            <el-tag effect="plain">{{ categoryName(shot.assetCategoryId) }}</el-tag>
          </el-tooltip>
          <el-button circle :icon="Top" :disabled="index === 0" @click="move(index, -1)" />
          <el-button
            circle
            :icon="Bottom"
            :disabled="index === form.shots.length - 1"
            @click="move(index, 1)"
          />
          <el-button circle type="danger" plain :icon="Delete" @click="removeShot(index)" />
        </div>
      </article>

      <template #footer>
        <div class="drawer-footer">
          <span>共 {{ form.shots.length }} 个镜头</span>
          <div>
            <el-button @click="editorOpen = false">取消</el-button>
            <el-button type="primary" @click="save">保存模板</el-button>
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.template-tools {
  display: flex;
  justify-content: flex-end;
  margin-top: -12px;
}
.template-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(260px, 1fr));
  gap: 18px;
}
.template-card { padding: 18px; }
.template-card__preview {
  position: relative;
  height: 170px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: linear-gradient(135deg, #edf3ff, #e7ebfb);
}
.template-card__preview > .el-tag { position: absolute; top: 12px; right: 12px; }
.phone {
  width: 72px;
  height: 138px;
  padding: 9px;
  border: 5px solid #233653;
  border-radius: 17px;
  display: grid;
  gap: 3px;
  background: #fff;
}
.phone span { border-radius: 3px; background: linear-gradient(90deg, #9eb8ee, #d5def3); }
.template-card h3 { margin: 16px 0 6px; }
.template-card p { min-height: 38px; margin: 0; color: #8390a3; font-size: 13px; }
.structure { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0; }
.structure span { padding: 4px 8px; border-radius: 7px; background: #f0f4fa; color: #607087; font-size: 11px; }
.template-card footer { border-top: 1px solid #edf0f5; padding-top: 9px; }
.header-fields { display: grid; grid-template-columns: 1fr 240px; gap: 14px; }
.shot-heading, .drawer-footer { display: flex; justify-content: space-between; align-items: center; }
.shot-heading h3, .shot-heading p { margin: 0; }
.shot-heading p { margin-top: 4px; color: #8996a9; font-size: 12px; }
.shot-row {
  margin-top: 12px;
  padding: 16px;
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: 12px;
  border: 1px solid #e6ebf3;
  border-radius: 16px;
  background: #fafbfd;
}
.shot-index {
  width: 32px; height: 32px; display: grid; place-items: center;
  border-radius: 10px; background: #5b8def; color: white; font-weight: 800;
}
.shot-fields { display: grid; grid-template-columns: 140px 1fr 130px auto; gap: 9px; }
.shot-copy, .shot-actions { grid-column: 2; }
.shot-actions { display: flex; align-items: center; gap: 7px; }
.shot-actions .el-checkbox { margin-right: auto; }
.drawer-footer > span { color: #8290a4; }
@media (max-width: 1100px) { .template-grid { grid-template-columns: repeat(2, 1fr); } }
</style>

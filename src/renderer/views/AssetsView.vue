<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { FolderOpened, VideoPlay } from "@element-plus/icons-vue";
import PageIntro from "../components/PageIntro.vue";

type Category = Awaited<ReturnType<typeof window.autocut.listAssetCategories>>[number];
type Asset = Awaited<ReturnType<typeof window.autocut.listAssets>>[number];

const recommended = ["产品", "人物", "店内环境", "服务过程", "操作过程", "空镜", "门头"];
const categories = ref<Category[]>([]);
const assets = ref<Asset[]>([]);
const loading = ref(false);
const scanning = ref(false);
const drawerOpen = ref(false);
const activeCategory = ref<Category | null>(null);
const totalAssets = computed(() =>
  categories.value.reduce((sum, item) => sum + item.assetCount, 0)
);

async function load(): Promise<void> {
  loading.value = true;
  try {
    categories.value = await window.autocut.listAssetCategories();
  } finally {
    loading.value = false;
  }
}

async function scanFolder(): Promise<void> {
  scanning.value = true;
  try {
    const result = await window.autocut.selectAndScanAssets();
    if (!result) return;
    await load();
    ElMessage.success(`已扫描“${result.name}”，发现 ${result.assetCount} 个视频`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "素材扫描失败");
  } finally {
    scanning.value = false;
  }
}

async function showDetails(category: Category): Promise<void> {
  activeCategory.value = category;
  assets.value = await window.autocut.listAssets(category.id);
  drawerOpen.value = true;
}

function formatDuration(value: number | null): string {
  if (value === null) return "—";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

onMounted(load);
</script>

<template>
  <div class="page">
    <PageIntro
      title="素材中心"
      description="每个文件夹代表一个语义分类，扫描结果会保存在本地数据库"
      action="接入分类文件夹"
      @action="scanFolder"
    />
    <section class="summary surface">
      <div><strong>{{ categories.length }}</strong><span>已接入分类</span></div>
      <div><strong>{{ totalAssets }}</strong><span>素材总数</span></div>
      <div>
        <strong>{{ categories.reduce((sum, item) => sum + item.invalidCount, 0) }}</strong>
        <span>异常文件</span>
      </div>
      <el-button :loading="scanning" :icon="FolderOpened" @click="scanFolder">
        选择文件夹扫描
      </el-button>
    </section>

    <section v-loading="loading" class="category-grid">
      <article v-for="category in categories" :key="category.id" class="surface category">
        <div class="category__preview">
          <el-icon><VideoPlay /></el-icon>
        </div>
        <div class="category__title">
          <h3>{{ category.name }}</h3>
          <el-tag
            :type="category.assetCount < 10 ? 'warning' : 'success'"
            effect="light"
          >
            {{ category.assetCount < 10 ? "素材不足" : "素材充足" }}
          </el-tag>
        </div>
        <p :title="category.folderPath">{{ category.folderPath }}</p>
        <footer>
          <span>{{ category.assetCount }} 个片段</span>
          <el-button text type="primary" @click="showDetails(category)">查看详情</el-button>
        </footer>
      </article>

      <article
        v-for="name in recommended.filter((item) => !categories.some((category) => category.name === item))"
        :key="name"
        class="surface category category--recommended"
      >
        <div class="category__preview"><span>＋</span></div>
        <h3>{{ name }}</h3>
        <p>推荐素材分类</p>
        <el-button text type="primary" @click="scanFolder">接入文件夹</el-button>
      </article>
    </section>

    <el-drawer
      v-model="drawerOpen"
      :title="activeCategory ? `${activeCategory.name} · 素材详情` : '素材详情'"
      size="680px"
    >
      <el-table :data="assets" height="calc(100vh - 150px)">
        <el-table-column prop="fileName" label="文件" min-width="210" />
        <el-table-column label="时长" width="80">
          <template #default="{ row }">{{ formatDuration(row.durationSec) }}</template>
        </el-table-column>
        <el-table-column label="画面" width="120">
          <template #default="{ row }">
            {{ row.width && row.height ? `${row.width}×${row.height}` : "—" }}
          </template>
        </el-table-column>
        <el-table-column prop="codec" label="编码" width="90" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ready' ? 'success' : 'danger'">
              {{ row.status === "ready" ? "可用" : "异常" }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(120px, 1fr)) auto;
  align-items: center;
  gap: 20px;
  padding: 20px 24px;
}
.summary div {
  padding-right: 20px;
  border-right: 1px solid #e8edf5;
}
.summary strong,
.summary span {
  display: block;
}
.summary strong {
  font-size: 25px;
}
.summary span {
  margin-top: 4px;
  color: #8895a8;
  font-size: 12px;
}
.category-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(210px, 1fr));
  gap: 16px;
}
.category {
  padding: 16px;
}
.category__preview {
  height: 112px;
  border-radius: 14px;
  background:
    radial-gradient(circle at 70% 20%, rgba(91, 141, 239, 0.35), transparent 35%),
    linear-gradient(135deg, #edf3ff, #dce7f8);
  display: grid;
  place-items: center;
  color: #5b8def;
  font-size: 34px;
}
.category__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.category h3 {
  margin: 14px 0 5px;
}
.category p {
  overflow: hidden;
  margin: 0 0 12px;
  color: #8b97aa;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.category footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #6f7d91;
  font-size: 13px;
}
.category--recommended {
  border-style: dashed;
  box-shadow: none;
}
.category--recommended .category__preview {
  background: #f7f9fd;
}
@media (max-width: 1180px) {
  .category-grid {
    grid-template-columns: repeat(2, minmax(210px, 1fr));
  }
}
</style>

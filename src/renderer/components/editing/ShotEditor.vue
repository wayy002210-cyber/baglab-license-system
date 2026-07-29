<script setup lang="ts">
import type { CreationDraft } from "../../../shared/contracts";
type Shot = CreationDraft["shots"][number];
type Category = Awaited<ReturnType<typeof window.autocut.listAssetCategories>>[number];
const props = defineProps<{ shots: Shot[]; categories: Category[] }>();
const emit = defineEmits<{ "update:shots": [shots: Shot[]] }>();
function update(index: number, patch: Partial<Shot>) {
  emit("update:shots", props.shots.map((item, cursor) => cursor === index ? { ...item, ...patch } : item));
}
function move(index: number, offset: number) {
  const copy = [...props.shots]; const target = index + offset;
  if (target < 0 || target >= copy.length) return;
  [copy[index], copy[target]] = [copy[target], copy[index]];
  emit("update:shots", copy.map((item, cursor) => ({ ...item, index: cursor })));
}
function remove(index: number) {
  emit("update:shots", props.shots.filter((_, cursor) => cursor !== index).map((item, cursor) => ({ ...item, index: cursor })));
}
</script>
<template>
  <main class="panel shot-editor">
    <header><div><h3>镜头创作区</h3><p>每段口播对应一个镜头，并从指定素材分类自动取片。</p></div></header>
    <article v-for="(shot,index) in shots" :key="shot.id" class="shot">
      <span class="number">{{ index + 1 }}</span>
      <div class="copy">
        <el-input :model-value="shot.copywriting" type="textarea" :rows="2" @update:model-value="update(index,{copywriting:String($event)})" />
        <small>音频段：{{ shot.audioSegmentId }}</small>
      </div>
      <div class="settings">
        <label>素材类型
          <el-select :model-value="shot.assetCategoryId" placeholder="选择素材文件夹" @update:model-value="update(index,{assetCategoryId:String($event)})">
            <el-option v-for="category in categories" :key="category.id" :label="`${category.name}（${category.assetCount}）`" :value="category.id" />
          </el-select>
        </label>
        <label>时长策略
          <el-select :model-value="shot.durationMode" @update:model-value="update(index,{durationMode:$event})">
            <el-option label="跟随配音" value="voice" /><el-option label="固定时长" value="fixed" /><el-option label="自动" value="auto" />
          </el-select>
        </label>
        <el-checkbox :model-value="shot.muteOriginal" @update:model-value="update(index,{muteOriginal:Boolean($event)})">静音原声</el-checkbox>
      </div>
      <footer>
        <el-button size="small" :disabled="index===0" @click="move(index,-1)">上移</el-button>
        <el-button size="small" :disabled="index===shots.length-1" @click="move(index,1)">下移</el-button>
        <el-button size="small" type="danger" @click="remove(index)">删除</el-button>
      </footer>
    </article>
  </main>
</template>
<style scoped>
.panel{padding:18px}.panel h3,.panel p{margin:0}.panel p{color:var(--muted);font-size:12px;margin-top:4px}.shot{display:grid;grid-template-columns:34px minmax(220px,1fr) minmax(210px,.65fr);gap:12px;padding:14px;margin-top:12px;border:1px solid var(--line);border-radius:16px}.number{width:30px;height:30px;display:grid;place-items:center;border-radius:10px;background:var(--brand);font-weight:800}.copy small{color:var(--muted)}.settings{display:grid;gap:8px}.settings label{display:grid;gap:4px;font-size:12px;color:var(--muted)}.shot footer{grid-column:2/4;text-align:right}
</style>

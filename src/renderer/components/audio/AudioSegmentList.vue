<script setup lang="ts">
import type { CreationDraft } from "../../../shared/contracts";
type Segment = CreationDraft["audioSegments"][number];
defineProps<{ segments: Segment[]; generatingId: string | null }>();
defineEmits<{ generate: [segment: Segment]; preview: [segment: Segment] }>();
</script>

<template>
  <section class="segments">
    <div class="section-heading">
      <div><strong>口播分段</strong><small>文本或声音参数变化后，只需重做对应段落</small></div>
    </div>
    <article v-for="segment in segments" :key="segment.id" class="segment-card">
      <span class="segment-index">{{ segment.index + 1 }}</span>
      <p>{{ segment.text }}</p>
      <el-tag
        :type="segment.status === 'ready' ? 'success' : segment.status === 'failed' ? 'danger' : 'info'"
      >
        {{ segment.status === "ready" ? "已生成" : segment.status === "failed" ? "失败" : "待生成" }}
      </el-tag>
      <el-button
        size="small"
        :loading="generatingId === segment.id"
        @click="$emit('generate', segment)"
      >
        {{ segment.status === "failed" ? "重试" : "生成" }}
      </el-button>
      <el-button v-if="segment.audioPath" size="small" @click="$emit('preview', segment)">
        播放
      </el-button>
    </article>
  </section>
</template>

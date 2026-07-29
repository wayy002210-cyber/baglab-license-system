<script setup lang="ts">
import PageIntro from "../components/PageIntro.vue";
</script>
<template>
  <div class="page">
    <PageIntro title="任务中心" description="查看文案、配音、选片、合成和编码进度" action="创建任务" />
    <section class="surface placeholder-panel"><el-empty description="还没有生成任务" /></section>
  </div>
</template>

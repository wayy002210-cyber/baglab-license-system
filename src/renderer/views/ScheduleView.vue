<script setup lang="ts">
import PageIntro from "../components/PageIntro.vue";
</script>
<template>
  <div class="page">
    <PageIntro title="发布排期" description="把成片分配到平台账号和发布时间" action="新建排期" />
    <section class="surface placeholder-panel"><el-empty description="暂无待发布内容" /></section>
  </div>
</template>

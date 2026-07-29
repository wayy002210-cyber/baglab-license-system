<script setup lang="ts">
import PageIntro from "../components/PageIntro.vue";
</script>
<template>
  <div class="page">
    <PageIntro title="镜头模板" description="用语义镜头槽位编排可复用的视频结构" action="新建模板" />
    <section class="surface placeholder-panel"><el-empty description="内置模板将在初始化后显示" /></section>
  </div>
</template>

<script setup lang="ts">
import PageIntro from "../components/PageIntro.vue";
</script>
<template>
  <div class="page">
    <PageIntro title="发布账号" description="使用独立浏览器目录管理抖音和小红书登录态" action="添加账号" />
    <section class="surface placeholder-panel"><el-empty description="添加账号后由你手动完成扫码登录" /></section>
  </div>
</template>

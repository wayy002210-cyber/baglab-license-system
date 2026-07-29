<script setup lang="ts">
import PageIntro from "../components/PageIntro.vue";
const categories = ["产品", "人物", "店内环境", "服务过程", "操作过程", "空镜", "门头"];
</script>
<template>
  <div class="page">
    <PageIntro title="素材中心" description="用本地分类目录建立可重复使用的镜头素材池" action="选择素材目录" />
    <section class="category-grid">
      <article v-for="category in categories" :key="category" class="surface category">
        <div class="category__preview" />
        <h3>{{ category }}</h3>
        <p>0 个可用片段</p>
        <el-tag type="warning" effect="light">素材不足</el-tag>
      </article>
    </section>
  </div>
</template>
<style scoped>
.category-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.category { padding: 16px; }
.category__preview { height: 108px; border-radius: 14px; background: linear-gradient(135deg, #edf3ff, #dfe9f8); }
.category h3 { margin: 14px 0 5px; }
.category p { margin: 0 0 12px; color: #8b97aa; font-size: 13px; }
@media (max-width: 1100px) { .category-grid { grid-template-columns: repeat(2, 1fr); } }
</style>

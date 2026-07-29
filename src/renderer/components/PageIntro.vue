<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
  action?: string;
}>();
</script>

<template>
  <section class="page-heading">
    <div>
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
    </div>
    <el-button v-if="action" type="primary" size="large" round>
      {{ action }}
    </el-button>
  </section>
</template>

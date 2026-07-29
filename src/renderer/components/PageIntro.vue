<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
  action?: string;
}>();
defineEmits<{ action: [] }>();
</script>

<template>
  <section class="page-heading">
    <div>
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
    </div>
    <el-button v-if="action" type="primary" size="large" round @click="$emit('action')">
      {{ action }}
    </el-button>
  </section>
</template>

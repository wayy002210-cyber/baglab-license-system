<script setup lang="ts">
import AppShell from "./layouts/AppShell.vue";
import { useRoute } from "vue-router";
const route=useRoute();
</script>

<template>
  <RouterView v-if="route.meta.public" />
  <AppShell v-else />
</template>

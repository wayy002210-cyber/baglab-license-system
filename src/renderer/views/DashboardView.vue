<script setup lang="ts">
import { Collection, Files, Upload, VideoPlay } from "@element-plus/icons-vue";

const metrics = [
  { label: "可用素材", value: "0", unit: "条", icon: Files, tone: "blue" },
  { label: "镜头模板", value: "1", unit: "套", icon: Collection, tone: "violet" },
  { label: "生成任务", value: "0", unit: "个", icon: VideoPlay, tone: "cyan" },
  { label: "待发布", value: "0", unit: "条", icon: Upload, tone: "orange" }
];
</script>

<template>
  <div class="page">
    <section class="hero surface">
      <div>
        <span class="eyebrow">LOCAL-FIRST CONTENT ENGINE</span>
        <h2>把素材库变成持续生产力</h2>
        <p>分类素材、结构化分镜、智能配音与自动发布，一条生产线完成。</p>
        <div class="hero__actions">
          <el-button type="primary" size="large" round>创建生成任务</el-button>
          <el-button size="large" round>管理素材</el-button>
        </div>
      </div>
      <div class="hero__visual" aria-hidden="true">
        <div class="orbit orbit--one" />
        <div class="orbit orbit--two" />
        <div class="play">▶</div>
      </div>
    </section>
    <section class="metrics">
      <article v-for="metric in metrics" :key="metric.label" class="metric surface">
        <div :class="['metric__icon', `metric__icon--${metric.tone}`]">
          <el-icon><component :is="metric.icon" /></el-icon>
        </div>
        <div>
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }} <small>{{ metric.unit }}</small></strong>
        </div>
      </article>
    </section>
    <section class="dashboard-grid">
      <article class="surface panel">
        <div class="panel__head">
          <div>
            <h3>最近任务</h3>
            <p>跟踪生成、编码与发布状态</p>
          </div>
          <el-button text type="primary">查看全部</el-button>
        </div>
        <el-empty description="还没有生成任务" :image-size="92" />
      </article>
      <article class="surface panel">
        <div class="panel__head">
          <div>
            <h3>素材健康度</h3>
            <p>建议每个分类至少准备 10 条素材</p>
          </div>
        </div>
        <div class="health">
          <div class="health__ring"><strong>0%</strong><span>准备度</span></div>
          <p>导入素材后，这里会显示分类完整度与重复风险。</p>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.hero {
  min-height: 244px;
  padding: 34px 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
  background:
    radial-gradient(circle at 80% 20%, rgba(91, 141, 239, 0.18), transparent 34%),
    linear-gradient(135deg, #fff, #f5f8ff);
}
.eyebrow {
  color: #5b8def;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
}
.hero h2 {
  margin: 12px 0 8px;
  font-size: 34px;
}
.hero p {
  color: #718097;
}
.hero__actions {
  margin-top: 26px;
}
.hero__visual {
  position: relative;
  width: 220px;
  height: 180px;
}
.orbit {
  position: absolute;
  border: 1px solid rgba(91, 141, 239, 0.24);
  border-radius: 50%;
}
.orbit--one {
  inset: 10px 24px;
}
.orbit--two {
  inset: 34px 0;
  transform: rotate(35deg);
}
.play {
  position: absolute;
  inset: 55px 74px;
  display: grid;
  place-items: center;
  border-radius: 28px;
  color: white;
  background: linear-gradient(135deg, #5b8def, #7a6ff0);
  box-shadow: 0 18px 36px rgba(91, 141, 239, 0.32);
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.metric {
  padding: 20px;
  display: flex;
  gap: 14px;
  align-items: center;
}
.metric__icon {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  font-size: 21px;
}
.metric__icon--blue { color: #4f7ee8; background: #eaf1ff; }
.metric__icon--violet { color: #7a6ff0; background: #f0edff; }
.metric__icon--cyan { color: #2ba8b9; background: #e5f8fb; }
.metric__icon--orange { color: #e78c38; background: #fff2e6; }
.metric span,
.metric strong {
  display: block;
}
.metric span {
  color: #8490a3;
  font-size: 13px;
}
.metric strong {
  margin-top: 4px;
  font-size: 25px;
}
.metric small {
  font-size: 12px;
  color: #9aa5b5;
}
.dashboard-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 18px;
}
.panel {
  min-height: 300px;
  padding: 24px;
}
.panel__head {
  display: flex;
  justify-content: space-between;
}
.panel h3,
.panel p {
  margin: 0;
}
.panel p {
  margin-top: 5px;
  color: #8a97aa;
  font-size: 13px;
}
.health {
  min-height: 215px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 18px;
  text-align: center;
}
.health__ring {
  width: 126px;
  height: 126px;
  border-radius: 50%;
  display: grid;
  place-content: center;
  background: radial-gradient(circle, white 57%, transparent 59%), conic-gradient(#5b8def 0deg, #e8edf5 0deg);
}
.health__ring strong,
.health__ring span {
  display: block;
}
.health__ring strong { font-size: 25px; }
.health__ring span { color: #93a0b2; font-size: 12px; }
@media (max-width: 1080px) {
  .metrics { grid-template-columns: repeat(2, 1fr); }
  .dashboard-grid { grid-template-columns: 1fr; }
}
</style>

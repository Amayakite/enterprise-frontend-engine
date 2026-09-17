<template>
  <div class="location-picker">
    <div class="location-picker__fields">
      <el-input v-model="longitude" :disabled="disabled" placeholder="经度，如 121.505000">
        <template #prepend>经度</template>
      </el-input>
      <el-input v-model="latitude" :disabled="disabled" placeholder="纬度，如 31.235000">
        <template #prepend>纬度</template>
      </el-input>
    </div>
    <div class="location-picker__presets">
      <span>Mock 坐标：</span>
      <el-button :disabled="disabled" link type="primary" @click="pick('121.505000', '31.235000')">
        上海浦东
      </el-button>
      <el-button :disabled="disabled" link type="primary" @click="pick('118.796000', '32.060000')">
        南京玄武
      </el-button>
      <el-button :disabled="disabled" link type="primary" @click="pick('120.585000', '31.299000')">
        苏州虎丘
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ disabled?: boolean }>();
const longitude = defineModel<string>("longitude", { required: true });
const latitude = defineModel<string>("latitude", { required: true });
function pick(lng: string, lat: string) {
  longitude.value = lng;
  latitude.value = lat;
}
</script>

<style scoped lang="scss">
.location-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px dashed var(--el-border-color);
  border-radius: var(--card-radius);
  background: var(--el-fill-color-lighter);
}
.location-picker__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.location-picker__presets {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  color: var(--el-text-color-secondary);
}
@media (max-width: 640px) {
  .location-picker__fields {
    grid-template-columns: 1fr;
  }
}
</style>

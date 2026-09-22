<template>
  <div>
    <div class="page-toolbar">
      <div class="page-toolbar__left">
        <template v-for="action in actionViews" :key="action.key">
          <ActionButton
            v-if="action.availability.visible"
            :label="action.label"
            :tone="action.tone"
            :link="false"
            :disabled-reason="action.availability.reason"
            :loading="controller.busyActionKey === action.key"
            @click="controller.runAction(action.key)"
          />
        </template>
        <ActionButton
          v-if="canEdit"
          label="编辑"
          tone="primary"
          :link="false"
          :disabled="controller.state.phase !== 'ready' || !!controller.busyActionKey"
          :disabled-reason="editReason"
          @click="edit"
        />
        <slot name="actions" />
      </div>
      <div class="page-toolbar__right">
        <el-button
          :disabled="!!controller.busyActionKey"
          :loading="controller.state.phase === 'loading'"
          @click="controller.refresh"
        >
          刷新
        </el-button>
        <el-button v-if="back" :disabled="!!controller.busyActionKey" @click="leave">
          返回
        </el-button>
      </div>
    </div>
    <MyFeedback v-if="navigationError" :message="navigationError" tone="error" />
  </div>
</template>
<script setup lang="ts" generic="Model extends object, Entity, Id extends string | number">
import { computed, ref } from "vue";
import ActionButton from "../ActionButton.vue";
import MyFeedback from "../feedback/MyFeedback.vue";
import type { CrudDetailProps } from "./form-presentation";
defineOptions({ inheritAttrs: false });
const props = defineProps<
  Pick<CrudDetailProps<Model, Entity, Id, unknown>, "controller" | "actions" | "back"> & {
    /** 编辑入口，省略不执行。 */ edit?: () => Promise<void>;
    /** 是否展示编辑入口，默认不展示。 */ canEdit?: boolean;
    /** 编辑禁用原因，undefined 表示允许。 */ editReason?: string;
  }
>();
defineSlots<{ /** 附加详情业务操作。 */ actions?: () => unknown }>();
const actionViews = computed(() =>
  (props.actions ?? []).map((action) => ({
    ...action,
    availability: props.controller.actionAvailability(action.key),
  }))
);
const navigationError = ref("");
async function leave() {
  navigationError.value = "";
  try {
    await props.back?.();
  } catch (cause) {
    navigationError.value = cause instanceof Error ? cause.message : "返回失败";
  }
}
</script>

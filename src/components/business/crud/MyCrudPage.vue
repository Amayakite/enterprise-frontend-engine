<template>
  <RenderPage />
</template>

<script
  setup
  lang="ts"
  generic="
    T extends BusinessModuleContract,
    S extends object,
    V extends 'list' | 'add' | 'edit' | 'detail'
  "
>
import { useSlots } from "vue";
import type { BusinessModuleContract } from "./module";
import type { CrudPageBase, CrudPageSlots } from "./crud-page";

const props = defineProps<{
  /**
   * useCrudPage 创建的当前页面，保持控制器和插槽字段类型；不能混用其他标签实例。
   * @example
   * `<MyCrudPage :page="page" />`
   */
  page: CrudPageBase<T, S> & {
    /** 本实例固定场景，决定可用插槽。 */
    view: V;
  };
}>();
defineSlots<CrudPageSlots<T, V>>();
const slots = useSlots();
const RenderPage = () => props.page.render(slots);
</script>

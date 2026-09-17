import { createApp } from "vue";
import App from "./App.vue";

import "element-plus/theme-chalk/dark/css-vars.css";
import "element-plus/es/components/message-box/style/index";
import "@/assets/styles/index.scss";
import "uno.css";
import "animate.css";

import { setupDirective } from "@/directive";
import { setupRouter } from "@/router";
import { setupStore } from "@/stores";
import * as ElementPlusIcons from "@element-plus/icons-vue";
import { setupPermissionGuard } from "@/router/permission";

const app = createApp(App);

setupStore(app);
setupDirective(app);

Object.entries(ElementPlusIcons).forEach(([name, comp]) => app.component(name, comp));

setupPermissionGuard();
setupRouter(app);

app.mount("#app");

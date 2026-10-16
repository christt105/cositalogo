import { createApp } from "vue";
import { createWebHistory } from "vue-router";
import App from "./App.vue";
import { createAppRouter } from "./router.js";
import "./style.css";

createApp(App).use(createAppRouter(createWebHistory())).mount("#app");

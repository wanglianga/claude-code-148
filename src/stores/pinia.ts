// 全局唯一 Pinia 实例（无 Vue 应用，需手动 setActivePinia 供嵌套 useStore 调用）
import { createPinia, setActivePinia } from 'pinia';

export const pinia = createPinia();
setActivePinia(pinia);

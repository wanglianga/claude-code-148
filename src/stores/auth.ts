// 登录身份（演示账号见 README）
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { NurseUser, Role } from '@/types';

const AUTH_KEY = 'cnv_auth_v1';

interface AuthState {
  role: Role;
  nurse?: NurseUser;
  familyAccessCode?: string;
}

function load(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as AuthState) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const initial = load();
  const role = ref<Role | null>(initial?.role ?? null);
  const nurse = ref<NurseUser | undefined>(initial?.nurse);
  const familyAccessCode = ref<string | undefined>(initial?.familyAccessCode);

  const isNurse = computed(() => role.value === 'nurse');
  const isFamily = computed(() => role.value === 'family');

  function persist() {
    if (!role.value) localStorage.removeItem(AUTH_KEY);
    else localStorage.setItem(AUTH_KEY, JSON.stringify({ role: role.value, nurse: nurse.value, familyAccessCode: familyAccessCode.value }));
  }

  function loginNurse(n: NurseUser) {
    role.value = 'nurse';
    nurse.value = n;
    familyAccessCode.value = undefined;
    persist();
  }

  function loginFamily(accessCode: string) {
    role.value = 'family';
    familyAccessCode.value = accessCode;
    nurse.value = undefined;
    persist();
  }

  function logout() {
    role.value = null;
    nurse.value = undefined;
    familyAccessCode.value = undefined;
    persist();
  }

  return { role, nurse, familyAccessCode, isNurse, isFamily, loginNurse, loginFamily, logout };
});

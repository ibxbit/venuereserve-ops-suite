<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { setActiveRole } from "../auth/roles.js";
import { ACTOR_ID_KEY, loginWithPassword } from "../services/api.js";

const router = useRouter();
const loading = ref(false);
const error = ref("");
const form = ref({
  email: "",
  password: "",
});

async function submit() {
  loading.value = true;
  error.value = "";
  try {
    const data = await loginWithPassword({
      email: form.value.email,
      password: form.value.password,
    });

    if (!data?.token || !data?.user_id || !data?.role) {
      throw new Error("Invalid login response");
    }

    localStorage.setItem(ACTOR_ID_KEY, data.user_id);
    setActiveRole(data.role);
    window.dispatchEvent(new Event("studio-role-changed"));
    await router.replace("/");
  } catch (err) {
    error.value = err?.response?.data?.error || "Login failed";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="page">
    <div class="panel">
      <h2>Sign In</h2>
      <p>Use your studio account credentials to continue.</p>
      <p v-if="error" class="badge muted">{{ error }}</p>
      <form class="grid" @submit.prevent="submit">
        <label>
          <span>Email</span>
          <input v-model="form.email" type="email" required />
        </label>
        <label>
          <span>Password</span>
          <input v-model="form.password" type="password" required />
        </label>
        <button :disabled="loading" type="submit">
          {{ loading ? "Signing in..." : "Sign in" }}
        </button>
      </form>
    </div>
  </section>
</template>

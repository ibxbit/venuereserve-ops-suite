import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import LoginPage from "../LoginPage.vue";

const api = vi.hoisted(() => ({
  loginWithPassword: vi.fn(),
  ACTOR_ID_KEY: "studio-actor-user-id",
  AUTH_TOKEN_KEY: "studio-auth-token",
}));

vi.mock("../../services/api.js", () => api);

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("vue-router", () => ({ useRouter: () => router }));

describe("LoginPage.vue (unit)", () => {
  beforeEach(() => {
    api.loginWithPassword.mockReset();
    router.replace.mockReset();
    localStorage.clear();
  });

  test("renders the sign-in form", () => {
    const wrapper = mount(LoginPage);
    expect(wrapper.find("h2").text()).toMatch(/Sign In/);
    expect(wrapper.find('input[type="email"]').exists()).toBe(true);
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
  });

  test("successful submit stores actor id and redirects home", async () => {
    api.loginWithPassword.mockResolvedValue({
      token: "abc",
      user_id: "member-1",
      role: "member",
    });

    const wrapper = mount(LoginPage);
    await wrapper.find('input[type="email"]').setValue("member@test.local");
    await wrapper.find('input[type="password"]').setValue("Secret123!");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(api.loginWithPassword).toHaveBeenCalledWith({
      email: "member@test.local",
      password: "Secret123!",
    });
    expect(router.replace).toHaveBeenCalledWith("/");
    expect(localStorage.getItem(api.ACTOR_ID_KEY)).toBe("member-1");
  });

  test("shows error message when backend returns 401", async () => {
    api.loginWithPassword.mockRejectedValue({
      response: { data: { error: "invalid credentials" } },
    });

    const wrapper = mount(LoginPage);
    await wrapper.find('input[type="email"]').setValue("x@test.local");
    await wrapper.find('input[type="password"]').setValue("bad");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(wrapper.text()).toContain("invalid credentials");
    expect(router.replace).not.toHaveBeenCalled();
  });

  test("shows fallback error when response missing token", async () => {
    api.loginWithPassword.mockResolvedValue({});
    const wrapper = mount(LoginPage);
    await wrapper.find('input[type="email"]').setValue("x@test.local");
    await wrapper.find('input[type="password"]').setValue("pass");
    await wrapper.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(wrapper.text()).toContain("Login failed");
  });
});

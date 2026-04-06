import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import CommerceCartPage from "../CommerceCartPage.vue";

const api = vi.hoisted(() => ({
  fetchCommerceCatalog: vi.fn(),
  fetchCommerceCoupons: vi.fn(),
  quoteCommerceCart: vi.fn(),
  checkoutCommerceCart: vi.fn(),
  splitCommerceOrder: vi.fn(),
  mergeCommerceOrders: vi.fn(),
  payCommerceOrder: vi.fn(),
  cancelCommerceOrder: vi.fn(),
  transitionCommerceOrder: vi.fn(),
  expireUnpaidCommerceOrders: vi.fn(),
}));

vi.mock("../../services/api.js", () => api);

describe("Cart and checkout interactions", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      "studio-reservation-cart-draft",
      JSON.stringify({
        user_id: "member-a",
        reservation_lines: [{ reservation_id: "res-100" }],
      }),
    );

    api.fetchCommerceCatalog.mockResolvedValue([
      {
        id: "cat-1",
        name: "Class Pack",
        category: "class_pack",
        base_price: 80,
        fulfillment_path: "instant_activation",
      },
    ]);
    api.fetchCommerceCoupons.mockResolvedValue([
      {
        id: "coupon-1",
        code: "SAVE10OVER75",
        name: "$10 over $75",
        discount_type: "fixed",
        discount_value: 10,
        min_subtotal: 75,
        max_discount: null,
        applies_to_category: "",
      },
    ]);
    api.quoteCommerceCart.mockResolvedValue({
      subtotal_amount: 80,
      discount_amount: 0,
      total_amount: 80,
      lines: [{ category: "reservation" }],
      fulfillment_groups: [],
    });
    api.checkoutCommerceCart.mockResolvedValue({
      order_group_id: "grp-1",
      orders: [{ id: "ord-1", fulfillment_path: "mixed", state: "pending_payment", total_amount: 80 }],
    });
  });

  test("includes reservation lines in quote and checkout payload", async () => {
    const wrapper = mount(CommerceCartPage);
    await Promise.resolve();
    await Promise.resolve();

    const qtyInput = wrapper.find("tbody input[type='number']");
    await qtyInput.setValue("1");
    await Promise.resolve();

    expect(api.quoteCommerceCart).toHaveBeenCalled();
    expect(api.quoteCommerceCart.mock.calls.at(-1)[0].reservation_lines).toEqual([
      { reservation_id: "res-100" },
    ]);

    const checkoutButton = wrapper
      .findAll("button")
      .find((node) => node.text() === "Checkout");
    await checkoutButton.trigger("click");

    expect(api.checkoutCommerceCart).toHaveBeenCalled();
    expect(api.checkoutCommerceCart.mock.calls[0][0].reservation_lines).toEqual([
      { reservation_id: "res-100" },
    ]);
  });

  test("renders coupon rule hint and blocks card payment without reference", async () => {
    api.checkoutCommerceCart.mockResolvedValue({
      order_group_id: "grp-2",
      orders: [
        {
          id: "ord-2",
          fulfillment_path: "mixed",
          state: "pending_payment",
          total_amount: 80,
        },
      ],
    });

    const wrapper = mount(CommerceCartPage);
    await Promise.resolve();
    await Promise.resolve();

    const couponInput = wrapper.find("input[list='coupon-codes']");
    await couponInput.setValue("SAVE10OVER75");
    await Promise.resolve();

    expect(wrapper.text()).toContain("$10 off | cart-wide | min subtotal $75");

    const paymentSelect = wrapper.findAll("select")[1];
    await paymentSelect.setValue("card_terminal");

    const checkoutButton = wrapper
      .findAll("button")
      .find((node) => node.text().includes("Checkout"));
    await checkoutButton.trigger("click");
    await Promise.resolve();

    const payButton = wrapper
      .findAll("button")
      .find((node) => node.text().includes("Pay"));
    await payButton.trigger("click");
    await Promise.resolve();

    expect(wrapper.text()).toContain("Manual payment reference is required");
  });
});

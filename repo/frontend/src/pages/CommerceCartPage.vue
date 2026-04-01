<script setup>
import { computed, onMounted, ref, watch } from "vue";
import {
  cancelCommerceOrder,
  checkoutCommerceCart,
  expireUnpaidCommerceOrders,
  fetchCommerceCatalog,
  fetchCommerceCoupons,
  mergeCommerceOrders,
  payCommerceOrder,
  quoteCommerceCart,
  splitCommerceOrder,
  transitionCommerceOrder,
} from "../services/api.js";

const userId = ref("member-local");
const catalog = ref([]);
const coupons = ref([]);
const couponCode = ref("");
const splitMode = ref("auto_split");
const quantities = ref({});
const quote = ref(null);
const checkoutResult = ref(null);
const mergeOrderIdsText = ref("");
const paymentMethod = ref("cash");
const manualReference = ref("");
const message = ref("");
const error = ref("");
const loading = ref(false);

function makeIdempotencyKey(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const selectedItems = computed(() => {
  return Object.entries(quantities.value)
    .map(([catalog_item_id, quantity]) => ({
      catalog_item_id,
      quantity: Number(quantity || 0),
    }))
    .filter((item) => item.quantity > 0);
});

function categorize(category) {
  const labels = {
    membership_new: "Membership (New)",
    membership_renewal: "Membership (Renewal)",
    class_pack: "Class Pack",
    merchandise: "Merchandise",
  };
  return labels[category] || category;
}

function setQuantity(itemId, next) {
  quantities.value = {
    ...quantities.value,
    [itemId]: Math.max(0, Number(next || 0)),
  };
}

async function recalcQuote() {
  if (!selectedItems.value.length) {
    quote.value = null;
    return;
  }

  loading.value = true;
  error.value = "";
  try {
    quote.value = await quoteCommerceCart({
      user_id: userId.value,
      items: selectedItems.value,
      coupon_code: couponCode.value || null,
    });
  } catch (err) {
    error.value = err?.response?.data?.error || "Could not recalculate cart.";
  }
  loading.value = false;
}

async function runCheckout() {
  if (!quote.value) {
    error.value = "Cart is empty.";
    return;
  }

  loading.value = true;
  error.value = "";
  message.value = "";
  try {
    checkoutResult.value = await checkoutCommerceCart({
      user_id: userId.value,
      items: selectedItems.value,
      coupon_code: couponCode.value || null,
      split_mode: splitMode.value,
      idempotency_key: makeIdempotencyKey("checkout"),
    });
    message.value =
      "Checkout created. Complete payment before 15-minute expiry.";
  } catch (err) {
    error.value = err?.response?.data?.error || "Checkout failed.";
  }
  loading.value = false;
}

async function runSplit(orderId) {
  try {
    const response = await splitCommerceOrder(orderId, {
      idempotency_key: makeIdempotencyKey("split"),
    });
    message.value = `Split completed from ${response.split_from_order_id}.`;
  } catch (err) {
    error.value = err?.response?.data?.error || "Split failed.";
  }
}

async function runMerge() {
  const orderIds = mergeOrderIdsText.value
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (orderIds.length < 2) {
    error.value = "Enter at least two order IDs separated by commas.";
    return;
  }
  try {
    const response = await mergeCommerceOrders(orderIds, {
      idempotency_key: makeIdempotencyKey("merge"),
    });
    message.value = `Merged into order ${response.merged_order_id}.`;
  } catch (err) {
    error.value = err?.response?.data?.error || "Merge failed.";
  }
}

async function runPay(orderId) {
  try {
    const response = await payCommerceOrder(orderId, {
      idempotency_key: makeIdempotencyKey("pay"),
      payment_method: paymentMethod.value,
      manual_reference: manualReference.value,
    });
    message.value = `Payment captured for ${response.order_id}. State: ${response.state}.`;
  } catch (err) {
    error.value = err?.response?.data?.error || "Payment failed.";
  }
}

async function runCancel(orderId) {
  try {
    const response = await cancelCommerceOrder(orderId, {
      idempotency_key: makeIdempotencyKey("cancel"),
      reason: "Cancelled by front desk",
    });
    message.value = `Order ${response.order_id} cancelled.`;
  } catch (err) {
    error.value = err?.response?.data?.error || "Cancel failed.";
  }
}

async function runFulfill(orderId) {
  try {
    const response = await transitionCommerceOrder(orderId, {
      idempotency_key: makeIdempotencyKey("transition"),
      to_state: "fulfilled",
      reason: "Picked up at front desk",
    });
    message.value = `Order ${response.order_id} transitioned to ${response.state}.`;
  } catch (err) {
    error.value = err?.response?.data?.error || "Transition failed.";
  }
}

async function runExpireSweep() {
  try {
    const response = await expireUnpaidCommerceOrders();
    message.value = `Expired ${response.expired_count} unpaid order(s).`;
  } catch (err) {
    error.value = err?.response?.data?.error || "Expire sweep failed.";
  }
}

watch(
  [quantities, couponCode, userId],
  async () => {
    await recalcQuote();
  },
  { deep: true },
);

onMounted(async () => {
  catalog.value = await fetchCommerceCatalog();
  coupons.value = await fetchCommerceCoupons();
  quantities.value = Object.fromEntries(
    catalog.value.map((item) => [item.id, 0]),
  );
});
</script>

<template>
  <section class="page">
    <h2>Unified Cart & Checkout</h2>
    <p>
      Add memberships, class packs, and merchandise in one cart. Prices
      recalculate in real-time with coupon rules and fulfillment-aware
      split/merge support.
    </p>

    <p v-if="loading" class="badge">Calculating...</p>
    <p v-if="message" class="badge">{{ message }}</p>
    <p v-if="error" class="badge muted">{{ error }}</p>

    <div class="panel">
      <h3>Cart Inputs</h3>
      <div class="grid">
        <label>
          <span>User ID</span>
          <input v-model="userId" type="text" />
        </label>
        <label>
          <span>Coupon Code</span>
          <input
            v-model="couponCode"
            list="coupon-codes"
            type="text"
            placeholder="e.g. SAVE10OVER75"
          />
          <datalist id="coupon-codes">
            <option
              v-for="coupon in coupons"
              :key="coupon.id"
              :value="coupon.code"
            >
              {{ coupon.name }}
            </option>
          </datalist>
        </label>
        <label>
          <span>Checkout split mode</span>
          <select v-model="splitMode">
            <option value="auto_split">Auto split by fulfillment path</option>
            <option value="merge_all">Merge into single order</option>
          </select>
        </label>
        <label>
          <span>Payment method</span>
          <select v-model="paymentMethod">
            <option value="cash">Cash</option>
            <option value="card_terminal">External card terminal</option>
            <option value="gift_certificate">Gift certificate</option>
          </select>
        </label>
        <label>
          <span>Manual payment reference</span>
          <input
            v-model="manualReference"
            type="text"
            placeholder="Masked & last4 only stored"
          />
        </label>
      </div>
    </div>

    <div class="panel">
      <h3>Products</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>name</th>
              <th>category</th>
              <th>fulfillment</th>
              <th>price</th>
              <th>qty</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in catalog" :key="item.id">
              <td>{{ item.name }}</td>
              <td>{{ categorize(item.category) }}</td>
              <td>{{ item.fulfillment_path }}</td>
              <td>${{ item.base_price }}</td>
              <td>
                <input
                  :value="quantities[item.id] || 0"
                  type="number"
                  min="0"
                  @input="setQuantity(item.id, $event.target.value)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="quote" class="panel">
      <h3>Real-Time Pricing</h3>
      <p>Subtotal: ${{ quote.subtotal_amount }}</p>
      <p>Discount: ${{ quote.discount_amount }}</p>
      <p>Total: ${{ quote.total_amount }}</p>
      <p v-if="quote.applied_coupon">
        Applied coupon: {{ quote.applied_coupon.code }} (-${{
          quote.applied_coupon.discount_amount
        }})
      </p>
      <p v-if="quote.coupon_warning">
        Coupon message: {{ quote.coupon_warning }}
      </p>

      <h4>Fulfillment Split Preview</h4>
      <ul class="plain-list">
        <li
          v-for="group in quote.fulfillment_groups"
          :key="group.fulfillment_path"
        >
          {{ group.fulfillment_path }} - ${{ group.total_amount }} ({{
            group.items.length
          }}
          item line(s))
        </li>
      </ul>

      <button @click="runCheckout">Checkout</button>
      <button class="secondary" @click="runExpireSweep">
        Expire unpaid 15m+
      </button>
    </div>

    <div v-if="checkoutResult" class="panel">
      <h3>Checkout Result</h3>
      <p>Order group: {{ checkoutResult.order_group_id }}</p>
      <ul class="plain-list">
        <li v-for="order in checkoutResult.orders" :key="order.id">
          {{ order.id }} - {{ order.fulfillment_path }} - {{ order.state }} -
          ${{ order.total_amount }}
          <button class="secondary" @click="runPay(order.id)">Pay</button>
          <button class="secondary" @click="runCancel(order.id)">Cancel</button>
          <button class="secondary" @click="runFulfill(order.id)">
            Mark fulfilled
          </button>
          <button class="secondary" @click="runSplit(order.id)">Split</button>
        </li>
      </ul>
    </div>

    <div class="panel">
      <h3>Manual Merge Orders</h3>
      <div class="grid">
        <label>
          <span>Order IDs (comma separated)</span>
          <input v-model="mergeOrderIdsText" type="text" />
        </label>
      </div>
      <button class="secondary" @click="runMerge">Merge orders</button>
    </div>
  </section>
</template>

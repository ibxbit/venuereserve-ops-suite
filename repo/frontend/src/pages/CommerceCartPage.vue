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
import {
  formatCouponRule,
  getApiErrorMessage,
  hasActiveAction,
  makeIdempotencyKey,
  releaseActionLock,
  withActionLock,
} from "../utils/client-helpers.js";

const userId = ref("member-local");
const reservationLines = ref([]);
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
const RESERVATION_DRAFT_KEY = "studio-reservation-cart-draft";
const quoteRecalcQueued = ref(false);
const actionLock = ref({
  quote: false,
  checkout: false,
  split: false,
  merge: false,
  pay: false,
  cancel: false,
  fulfill: false,
  expire: false,
});

const hasActionInProgress = computed(() => hasActiveAction(actionLock));

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

const selectedCoupon = computed(() => {
  const code = String(couponCode.value || "").trim().toLowerCase();
  if (!code) return null;
  return (
    coupons.value.find(
      (coupon) => String(coupon.code || "").trim().toLowerCase() === code,
    ) || null
  );
});

const couponRuleHint = computed(() => formatCouponRule(selectedCoupon.value));

const quotedLineItems = computed(() => {
  if (!Array.isArray(quote.value?.lines)) return [];
  return quote.value.lines.filter((line) => line.line_type !== "reservation");
});

async function recalcQuote() {
  if (!withActionLock(actionLock, "quote")) {
    quoteRecalcQueued.value = true;
    return;
  }

  if (!selectedItems.value.length && !reservationLines.value.length) {
    quote.value = null;
    releaseActionLock(actionLock, "quote");
    return;
  }

  loading.value = true;
  error.value = "";
  try {
    quote.value = await quoteCommerceCart({
      user_id: userId.value,
      items: selectedItems.value,
      reservation_lines: reservationLines.value,
      coupon_code: couponCode.value || null,
    });
  } catch (err) {
    error.value = getApiErrorMessage(err, "Could not recalculate cart.");
  }
  loading.value = false;
  releaseActionLock(actionLock, "quote");
  if (quoteRecalcQueued.value) {
    quoteRecalcQueued.value = false;
    await recalcQuote();
  }
}

async function runCheckout() {
  if (!withActionLock(actionLock, "checkout")) return;

  if (!quote.value) {
    error.value = "Cart is empty.";
    releaseActionLock(actionLock, "checkout");
    return;
  }

  loading.value = true;
  error.value = "";
  message.value = "";
  try {
    checkoutResult.value = await checkoutCommerceCart({
      user_id: userId.value,
      items: selectedItems.value,
      reservation_lines: reservationLines.value,
      coupon_code: couponCode.value || null,
      split_mode: splitMode.value,
      idempotency_key: makeIdempotencyKey("checkout"),
    });
    message.value =
      "Checkout created. Complete payment before 15-minute expiry.";
  } catch (err) {
    error.value = getApiErrorMessage(err, "Checkout failed.");
  }
  loading.value = false;
  releaseActionLock(actionLock, "checkout");
}

async function runSplit(orderId) {
  if (!withActionLock(actionLock, "split")) return;
  try {
    const response = await splitCommerceOrder(orderId, {
      idempotency_key: makeIdempotencyKey("split"),
    });
    message.value = `Split completed from ${response.split_from_order_id}.`;
  } catch (err) {
    error.value = getApiErrorMessage(err, "Split failed.");
  }
  releaseActionLock(actionLock, "split");
}

function removeReservationLine(reservationId) {
  reservationLines.value = reservationLines.value.filter(
    (line) => line.reservation_id !== reservationId,
  );
}

async function runMerge() {
  if (!withActionLock(actionLock, "merge")) return;
  const orderIds = mergeOrderIdsText.value
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (orderIds.length < 2) {
    error.value = "Enter at least two order IDs separated by commas.";
    releaseActionLock(actionLock, "merge");
    return;
  }
  try {
    const response = await mergeCommerceOrders(orderIds, {
      idempotency_key: makeIdempotencyKey("merge"),
    });
    message.value = `Merged into order ${response.merged_order_id}.`;
  } catch (err) {
    error.value = getApiErrorMessage(err, "Merge failed.");
  }
  releaseActionLock(actionLock, "merge");
}

async function runPay(orderId) {
  if (!withActionLock(actionLock, "pay")) return;
  if (paymentMethod.value === "card_terminal" && !manualReference.value.trim()) {
    error.value = "Manual payment reference is required for card terminal payments.";
    releaseActionLock(actionLock, "pay");
    return;
  }
  try {
    const response = await payCommerceOrder(orderId, {
      idempotency_key: makeIdempotencyKey("pay"),
      payment_method: paymentMethod.value,
      manual_reference: manualReference.value,
    });
    message.value = `Payment captured for ${response.order_id}. State: ${response.state}.`;
  } catch (err) {
    error.value = getApiErrorMessage(err, "Payment failed.");
  }
  releaseActionLock(actionLock, "pay");
}

async function runCancel(orderId) {
  if (!withActionLock(actionLock, "cancel")) return;
  try {
    const response = await cancelCommerceOrder(orderId, {
      idempotency_key: makeIdempotencyKey("cancel"),
      reason: "Cancelled by front desk",
    });
    message.value = `Order ${response.order_id} cancelled.`;
  } catch (err) {
    error.value = getApiErrorMessage(err, "Cancel failed.");
  }
  releaseActionLock(actionLock, "cancel");
}

async function runFulfill(orderId) {
  if (!withActionLock(actionLock, "fulfill")) return;
  try {
    const response = await transitionCommerceOrder(orderId, {
      idempotency_key: makeIdempotencyKey("transition"),
      to_state: "fulfilled",
      reason: "Picked up at front desk",
    });
    message.value = `Order ${response.order_id} transitioned to ${response.state}.`;
  } catch (err) {
    error.value = getApiErrorMessage(err, "Transition failed.");
  }
  releaseActionLock(actionLock, "fulfill");
}

async function runExpireSweep() {
  if (!withActionLock(actionLock, "expire")) return;
  try {
    const response = await expireUnpaidCommerceOrders();
    message.value = `Expired ${response.expired_count} unpaid order(s).`;
  } catch (err) {
    error.value = getApiErrorMessage(err, "Expire sweep failed.");
  }
  releaseActionLock(actionLock, "expire");
}

watch(
  [quantities, couponCode, userId, reservationLines],
  async () => {
    await recalcQuote();
  },
  { deep: true },
);

onMounted(async () => {
  const draft = localStorage.getItem(RESERVATION_DRAFT_KEY);
  if (draft) {
    try {
      const parsed = JSON.parse(draft);
      if (Array.isArray(parsed?.reservation_lines)) {
        reservationLines.value = parsed.reservation_lines
          .map((line) => ({ reservation_id: String(line?.reservation_id || "") }))
          .filter((line) => line.reservation_id);
      }
      if (parsed?.user_id) {
        userId.value = String(parsed.user_id);
      }
    } catch {
      reservationLines.value = [];
    }
    localStorage.removeItem(RESERVATION_DRAFT_KEY);
  }

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
          <small v-if="couponRuleHint">{{ couponRuleHint }}</small>
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

    <div class="panel">
      <h3>Reservation Lines</h3>
      <p v-if="!reservationLines.length">
        No reservation lines yet. Add one from the Availability page.
      </p>
      <ul v-else class="plain-list">
        <li v-for="line in reservationLines" :key="line.reservation_id">
          Reservation {{ line.reservation_id }}
          <button class="secondary" @click="removeReservationLine(line.reservation_id)">
            Remove
          </button>
        </li>
      </ul>
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

      <button :disabled="hasActionInProgress" @click="runCheckout">
        {{ actionLock.checkout ? "Checking out..." : "Checkout" }}
      </button>
      <button
        class="secondary"
        :disabled="hasActionInProgress"
        @click="runExpireSweep"
      >
        Expire unpaid 15m+
      </button>

      <h4>Coupon Allocation</h4>
      <p v-if="!quotedLineItems.length">No discounted catalog lines yet.</p>
      <ul v-else class="plain-list">
        <li v-for="line in quotedLineItems" :key="line.line_key">
          {{ line.item_name }} - subtotal ${{ line.subtotal_amount }} - discount
          ${{ line.discount_amount }} - total ${{ line.total_amount }}
        </li>
      </ul>
    </div>

    <div v-if="checkoutResult" class="panel">
      <h3>Checkout Result</h3>
      <p>Order group: {{ checkoutResult.order_group_id }}</p>
      <ul class="plain-list">
        <li v-for="order in checkoutResult.orders" :key="order.id">
          {{ order.id }} - {{ order.fulfillment_path }} - {{ order.state }} -
          ${{ order.total_amount }}
          <button class="secondary" :disabled="hasActionInProgress" @click="runPay(order.id)">
            {{ actionLock.pay ? "Paying..." : "Pay" }}
          </button>
          <button class="secondary" :disabled="hasActionInProgress" @click="runCancel(order.id)">
            {{ actionLock.cancel ? "Cancelling..." : "Cancel" }}
          </button>
          <button class="secondary" :disabled="hasActionInProgress" @click="runFulfill(order.id)">
            Mark fulfilled
          </button>
          <button class="secondary" :disabled="hasActionInProgress" @click="runSplit(order.id)">
            Split
          </button>
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
      <button class="secondary" :disabled="hasActionInProgress" @click="runMerge">
        {{ actionLock.merge ? "Merging..." : "Merge orders" }}
      </button>
    </div>
  </section>
</template>

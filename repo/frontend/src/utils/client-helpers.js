export function getApiErrorMessage(error, fallbackMessage) {
  const details = error?.response?.data?.details;
  if (Array.isArray(details) && details.length) {
    const combined = details
      .map((item) => String(item?.message || "").trim())
      .filter(Boolean)
      .join(" ");
    if (combined) return combined;
  }

  const direct = String(error?.response?.data?.error || "").trim();
  if (direct) return direct;
  return fallbackMessage;
}

export function makeIdempotencyKey(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function withActionLock(lockState, key) {
  if (lockState.value[key]) return false;
  lockState.value = {
    ...lockState.value,
    [key]: true,
  };
  return true;
}

export function releaseActionLock(lockState, key) {
  if (!lockState.value[key]) return;
  lockState.value = {
    ...lockState.value,
    [key]: false,
  };
}

export function hasActiveAction(lockState) {
  return Object.values(lockState.value).some(Boolean);
}

export function validateReservationRequestForm(form, resource) {
  const errors = [];
  const userId = String(form.user_id || "").trim();
  if (!userId) {
    errors.push("Member/User ID is required.");
  }

  const requestedDate = new Date(`${String(form.date || "")}T00:00:00`);
  if (Number.isNaN(requestedDate.getTime())) {
    errors.push("Date is required.");
  }

  const startText = String(form.start_time || "").trim();
  if (!/^\d{2}:\d{2}$/.test(startText)) {
    errors.push("Preferred start time must use HH:mm format.");
  }

  const duration = Number(form.duration_minutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    errors.push("Duration must be a positive number.");
  } else {
    if (duration % 30 !== 0) {
      errors.push("Duration must be in 30-minute increments.");
    }
    if (resource) {
      const minDuration = Number(resource.min_duration_minutes || 30);
      const maxDuration = Number(resource.max_duration_minutes || 240);
      if (duration < minDuration) {
        errors.push(`Duration is below minimum (${minDuration} minutes).`);
      }
      if (duration > maxDuration) {
        errors.push(`Duration exceeds maximum (${maxDuration} minutes).`);
      }
    }
  }

  if (resource) {
    const bookingWindowDays = Number(resource.booking_window_days || 30);
    const latestBookable = new Date();
    latestBookable.setHours(0, 0, 0, 0);
    latestBookable.setDate(latestBookable.getDate() + bookingWindowDays);
    if (
      !Number.isNaN(requestedDate.getTime()) &&
      requestedDate.getTime() > latestBookable.getTime()
    ) {
      errors.push(
        `Date exceeds booking window (${bookingWindowDays} days ahead).`,
      );
    }
  }

  return errors;
}

export function formatCouponRule(coupon) {
  if (!coupon) return "";
  const discountType = coupon.discount_type === "percent" ? "%" : "$";
  const baseRule =
    discountType === "%"
      ? `${Number(coupon.discount_value || 0)}% off`
      : `$${Number(coupon.discount_value || 0)} off`;

  const scope = coupon.applies_to_category
    ? `on ${coupon.applies_to_category.replaceAll("_", " ")}`
    : "cart-wide";
  const threshold = Number(coupon.min_subtotal || 0)
    ? `min subtotal $${Number(coupon.min_subtotal)}`
    : null;
  const cap =
    coupon.max_discount !== null &&
    coupon.max_discount !== undefined &&
    Number(coupon.max_discount) > 0
      ? `max discount $${Number(coupon.max_discount)}`
      : null;
  return [baseRule, scope, threshold, cap].filter(Boolean).join(" | ");
}

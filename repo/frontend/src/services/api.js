import axios from "axios";

const STORAGE_PREFIX = "studio-cache";
const QUEUE_KEY = "studio-offline-queue";
export const ACTOR_ID_KEY = "studio-actor-user-id";
export const AUTH_TOKEN_KEY = "studio-auth-token";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1",
  timeout: 5000,
});

api.interceptors.request.use((config) => {
  const headers = { ...(config.headers || {}) };
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return { ...config, headers };
});

export function getStoredAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || null;
}

export function clearStoredAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function clearStoredActorUserId() {
  localStorage.removeItem(ACTOR_ID_KEY);
}

export async function loginWithPassword({ email, password }) {
  const response = await api.post("/auth/login", { email, password });
  const data = response.data;
  if (data?.token) {
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
  }
  if (data?.user_id) {
    localStorage.setItem(ACTOR_ID_KEY, data.user_id);
  }
  return data;
}

function cacheKey(entity) {
  return `${STORAGE_PREFIX}:${entity}`;
}

function readJSON(key, fallback = null) {
  const value = localStorage.getItem(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getCachedList(entity) {
  return readJSON(cacheKey(entity), []);
}

export function setCachedList(entity, data) {
  writeJSON(cacheKey(entity), data);
}

function getQueue() {
  return readJSON(QUEUE_KEY, []);
}

function setQueue(queue) {
  writeJSON(QUEUE_KEY, queue);
}

function enqueue(operation) {
  const queue = getQueue();
  queue.push(operation);
  setQueue(queue);
}

function isNetworkFailure(error) {
  return !error?.response;
}

function isForbidden(error) {
  return error?.response?.status === 403;
}

export async function syncQueue() {
  const queue = getQueue();
  if (!queue.length) return;

  const remaining = [];

  for (const item of queue) {
    try {
      await api.request({
        method: item.method,
        url: item.url,
        data: item.data,
        headers: item.headers,
      });
    } catch {
      remaining.push(item);
    }
  }

  setQueue(remaining);
}

function extractPaginatedList(payload) {
  if (Array.isArray(payload)) {
    return { data: payload, pagination: null };
  }
  if (payload && Array.isArray(payload.data)) {
    return {
      data: payload.data,
      pagination: payload.pagination || null,
    };
  }
  return { data: [], pagination: null };
}

export async function fetchList(
  entity,
  { page = 1, perPage = 20, filters = {} } = {},
) {
  try {
    const response = await api.get(`/${entity}`, {
      params: {
        page,
        per_page: perPage,
        ...filters,
      },
    });
    const parsed = extractPaginatedList(response.data);
    setCachedList(entity, parsed.data);
    return {
      data: parsed.data,
      pagination: parsed.pagination,
      offline: false,
      forbidden: false,
    };
  } catch (error) {
    if (isForbidden(error)) {
      return {
        data: [],
        pagination: null,
        offline: false,
        forbidden: true,
      };
    }
    return {
      data: getCachedList(entity),
      pagination: null,
      offline: true,
      forbidden: false,
    };
  }
}

export async function createEntity(entity, payload) {
  try {
    const response = await api.post(`/${entity}`, payload);
    return { data: response.data, queued: false, forbidden: false };
  } catch (error) {
    if (isForbidden(error)) {
      return { data: null, queued: false, forbidden: true };
    }
    if (!isNetworkFailure(error)) {
      throw error;
    }
    enqueue({ method: "post", url: `/${entity}`, data: payload });
    return { data: payload, queued: true, forbidden: false };
  }
}

export async function updateEntity(entity, id, payload) {
  try {
    const response = await api.put(`/${entity}/${id}`, payload);
    return { data: response.data, queued: false, forbidden: false };
  } catch (error) {
    if (isForbidden(error)) {
      return { data: null, queued: false, forbidden: true };
    }
    if (!isNetworkFailure(error)) {
      throw error;
    }
    enqueue({ method: "put", url: `/${entity}/${id}`, data: payload });
    return { data: { id, ...payload }, queued: true, forbidden: false };
  }
}

export async function deleteEntity(entity, id) {
  try {
    await api.delete(`/${entity}/${id}`);
    return { queued: false, forbidden: false };
  } catch (error) {
    if (isForbidden(error)) {
      return { queued: false, forbidden: true };
    }
    if (!isNetworkFailure(error)) {
      throw error;
    }
    enqueue({ method: "delete", url: `/${entity}/${id}` });
    return { queued: true, forbidden: false };
  }
}

export async function fetchRoleDashboard() {
  const response = await api.get("/me/dashboard");
  return response.data;
}

export async function fetchReport(type) {
  const response = await api.get(`/reports/${type}`);
  return response.data;
}

export async function fetchAuditTrails({
  page = 1,
  perPage = 20,
  entity = "",
  action = "",
  actorUserId = "",
} = {}) {
  const params = {
    page,
    per_page: perPage,
  };
  if (entity) params.entity = entity;
  if (action) params.action = action;
  if (actorUserId) params.actor_user_id = actorUserId;

  const response = await api.get("/audit-trails", { params });
  return response.data;
}

export async function fetchSecurityEvents({
  page = 1,
  perPage = 20,
  severity = "",
  eventType = "",
} = {}) {
  const params = {
    page,
    per_page: perPage,
  };
  if (severity) params.severity = severity;
  if (eventType) params.event_type = eventType;

  const response = await api.get("/security/events", { params });
  return response.data;
}

export async function fetchDailyReconciliation(date) {
  const response = await api.get("/reconciliation/daily", {
    params: { date },
  });
  return response.data;
}

export async function submitShiftClose(payload) {
  const response = await api.post("/reconciliation/shift-close", payload);
  return response.data;
}

export async function fetchShiftReconciliation(shiftKey) {
  const response = await api.get(
    `/reconciliation/shift/${encodeURIComponent(shiftKey)}`,
  );
  return response.data;
}

export async function checkInReservation(id) {
  try {
    const response = await api.post(`/reservations/${id}/check-in`);
    return { data: response.data, forbidden: false, offline: false };
  } catch (error) {
    if (isForbidden(error)) {
      return { data: null, forbidden: true, offline: false };
    }
    if (isNetworkFailure(error)) {
      return { data: null, forbidden: false, offline: true };
    }
    throw error;
  }
}

export async function markNoShows() {
  try {
    const response = await api.post("/reservations/mark-no-shows");
    return { data: response.data, forbidden: false, offline: false };
  } catch (error) {
    if (isForbidden(error)) {
      return { data: null, forbidden: true, offline: false };
    }
    if (isNetworkFailure(error)) {
      return { data: null, forbidden: false, offline: true };
    }
    throw error;
  }
}

export async function fetchAvailability({
  resourceId,
  date,
  durationMinutes,
  userId,
  startTime,
}) {
  const params = {
    resource_id: resourceId,
    date,
    duration_minutes: durationMinutes,
    user_id: userId,
  };

  if (startTime) {
    params.start_time = startTime;
  }

  const response = await api.get("/availability", { params });
  return response.data;
}

export async function fetchCalendarDayRules(date) {
  const response = await api.get("/calendar/day-rules", { params: { date } });
  return response.data;
}

export async function fetchBookingExceptions({
  status = "",
  userId = "",
} = {}) {
  const params = {};
  if (status) params.status = status;
  if (userId) params.user_id = userId;
  const response = await api.get("/booking-exceptions", { params });
  return response.data;
}

export async function createBookingException(payload) {
  const response = await api.post("/booking-exceptions", payload);
  return response.data;
}

export async function decideBookingException(id, payload) {
  const response = await api.post(
    `/booking-exceptions/${id}/decision`,
    payload,
  );
  return response.data;
}

export async function fetchAccountStanding(userId) {
  const response = await api.get(`/account-standing/${userId}`);
  return response.data;
}

export async function fetchStandingPolicy() {
  const response = await api.get("/account-standing-policy");
  return response.data;
}

export async function updateStandingPolicy(policyId, payload) {
  const response = await api.put(
    `/account-standing-policy/${policyId}`,
    payload,
  );
  return response.data;
}

export async function fetchReservationOverrides({
  userId = "",
  status = "",
} = {}) {
  const params = {};
  if (userId) params.user_id = userId;
  if (status) params.status = status;
  const response = await api.get("/reservation-overrides", { params });
  return response.data;
}

export async function createReservationOverride(payload) {
  const response = await api.post("/reservation-overrides", payload);
  return response.data;
}

export async function fetchAttendanceHistory(userId = "") {
  const params = { page: 1, per_page: 50 };
  if (userId) params.user_id = userId;
  const response = await api.get("/attendance-history", { params });
  return response.data?.data || response.data;
}

export async function fetchCommerceCatalog() {
  const response = await api.get("/commerce/catalog");
  return response.data;
}

export async function fetchCommerceCoupons() {
  const response = await api.get("/commerce/coupons");
  return response.data;
}

export async function quoteCommerceCart(payload) {
  const response = await api.post("/commerce/cart/quote", payload);
  return response.data;
}

export async function checkoutCommerceCart(payload) {
  const response = await api.post("/commerce/checkout", payload);
  return response.data;
}

export async function payCommerceOrder(orderId, payload) {
  const response = await api.post(`/commerce/orders/${orderId}/pay`, payload);
  return response.data;
}

export async function cancelCommerceOrder(orderId, payload) {
  const response = await api.post(
    `/commerce/orders/${orderId}/cancel`,
    payload,
  );
  return response.data;
}

export async function transitionCommerceOrder(orderId, payload) {
  const response = await api.post(
    `/commerce/orders/${orderId}/transition`,
    payload,
  );
  return response.data;
}

export async function expireUnpaidCommerceOrders(payload = {}) {
  const response = await api.post("/commerce/orders/expire-unpaid", payload);
  return response.data;
}

export async function splitCommerceOrder(orderId, payload = {}) {
  const response = await api.post(`/commerce/orders/${orderId}/split`, payload);
  return response.data;
}

export async function mergeCommerceOrders(orderIds, payload = {}) {
  const response = await api.post("/commerce/orders/merge", {
    order_ids: orderIds,
    ...payload,
  });
  return response.data;
}

export async function fetchCommunityFeed() {
  const response = await api.get("/community/feed", {
    params: { page: 1, per_page: 50 },
  });
  return response.data?.data || response.data;
}

export async function fetchMyCommunityReports() {
  const response = await api.get("/community/reports/mine", {
    params: { page: 1, per_page: 50 },
  });
  return response.data?.data || response.data;
}

export async function createCommunityCaptchaChallenge(payload = {}) {
  const response = await api.post("/community/captcha/challenge", payload);
  return response.data;
}

export async function createCommunityPost(payload) {
  const response = await api.post("/community/posts", payload);
  return response.data;
}

export async function reportCommunityPost(postId, payload) {
  const response = await api.post(`/community/posts/${postId}/report`, payload);
  return response.data;
}

export async function fetchCommunityModerationQueue() {
  const response = await api.get("/community/moderation/queue", {
    params: { page: 1, per_page: 50 },
  });
  return response.data;
}

export async function decideCommunityPost(postId, payload) {
  const response = await api.post(
    `/community/moderation/posts/${postId}/decision`,
    payload,
  );
  return response.data;
}

export async function decideCommunityReport(reportId, payload) {
  const response = await api.post(
    `/community/moderation/reports/${reportId}/decision`,
    payload,
  );
  return response.data;
}

window.addEventListener("online", () => {
  syncQueue();
});

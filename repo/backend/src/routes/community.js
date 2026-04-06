import Router from "@koa/router";
import { randomUUID } from "crypto";
import { db } from "../db.js";
import { requirePermission } from "../middleware/authorize.js";
import { writeAudit } from "../services/audit-service.js";

function toBool(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function normalizeText(text) {
  return String(text || "").trim();
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getActorUserId(ctx) {
  return normalizeText(ctx.state.actorUserId) || null;
}

async function getCommunitySettings() {
  const row = await db("community_settings")
    .orderBy("updated_at", "desc")
    .first();
  return {
    max_posts_per_hour: Number(row?.max_posts_per_hour || 10),
    max_device_posts_per_hour:
      row?.max_device_posts_per_hour === null ||
      row?.max_device_posts_per_hour === undefined
        ? null
        : Number(row.max_device_posts_per_hour),
    max_ip_posts_per_hour:
      row?.max_ip_posts_per_hour === null ||
      row?.max_ip_posts_per_hour === undefined
        ? null
        : Number(row.max_ip_posts_per_hour),
    captcha_required: toBool(row?.captcha_required ?? true),
    auto_hold_report_threshold: Number(row?.auto_hold_report_threshold || 3),
  };
}

async function getRules(ruleType, targetType) {
  return db("community_rules")
    .where({ rule_type: ruleType, target_type: targetType })
    .andWhere((builder) => {
      builder.where({ is_active: true }).orWhere({ is_active: 1 });
    });
}

function hasRuleValue(rules, value) {
  const key = normalizeText(value).toLowerCase();
  if (!key) return false;
  return rules.some((rule) => normalizeText(rule.value).toLowerCase() === key);
}

function contentContainsKeyword(content, keywordRules) {
  const lower = normalizeText(content).toLowerCase();
  if (!lower) return false;
  return keywordRules.some((rule) => {
    const keyword = normalizeText(rule.value).toLowerCase();
    return keyword && lower.includes(keyword);
  });
}

async function hasActiveBan(userId) {
  const now = new Date();
  const row = await db("community_bans")
    .where({ user_id: userId })
    .andWhere((builder) => {
      builder.where({ is_permanent: true }).orWhere("expires_at", ">", now);
    })
    .orderBy("created_at", "desc")
    .first();
  return row || null;
}

async function assertCaptchaIfNeeded({
  userId,
  settings,
  challengeId,
  answer,
  authorIp,
  deviceFingerprint,
  isAllowlisted,
}) {
  if (!settings.captcha_required || isAllowlisted) return;

  const id = normalizeText(challengeId);
  const response = normalizeText(answer);
  if (!id || !response) {
    const error = new Error("captcha challenge and answer are required");
    error.status = 400;
    throw error;
  }

  const challenge = await db("captcha_challenges").where({ id }).first();
  if (!challenge) {
    const error = new Error("captcha challenge not found");
    error.status = 400;
    throw error;
  }

  if (challenge.solved_at) {
    const error = new Error("captcha challenge already used");
    error.status = 400;
    throw error;
  }

  if (new Date(challenge.expires_at) < new Date()) {
    const error = new Error("captcha challenge expired");
    error.status = 400;
    throw error;
  }

  if (challenge.user_id && challenge.user_id !== userId) {
    const error = new Error("captcha challenge does not match user");
    error.status = 400;
    throw error;
  }

  if (challenge.author_ip && challenge.author_ip !== authorIp) {
    const error = new Error("captcha challenge does not match IP");
    error.status = 400;
    throw error;
  }

  if (
    challenge.device_fingerprint &&
    challenge.device_fingerprint !== deviceFingerprint
  ) {
    const error = new Error("captcha challenge does not match device");
    error.status = 400;
    throw error;
  }

  if (normalizeText(challenge.expected_answer) !== response) {
    const error = new Error("captcha answer is incorrect");
    error.status = 400;
    throw error;
  }

  await db("captcha_challenges")
    .where({ id })
    .update({ solved_at: new Date() });
}

async function assertThrottle({
  userId,
  authorIp,
  deviceFingerprint,
  settings,
  isAllowlisted,
}) {
  if (isAllowlisted) return;
  const cutoff = new Date(Date.now() - 60 * 60000);

  const userCountRow = await db("community_posts")
    .count({ count: "id" })
    .where({ user_id: userId })
    .andWhere("created_at", ">=", cutoff)
    .first();
  if (Number(userCountRow?.count || 0) >= settings.max_posts_per_hour) {
    const error = new Error("post throttle exceeded: max 10 posts per hour");
    error.status = 429;
    throw error;
  }

  if (settings.max_ip_posts_per_hour && authorIp) {
    const ipCountRow = await db("community_posts")
      .count({ count: "id" })
      .where({ author_ip: authorIp })
      .andWhere("created_at", ">=", cutoff)
      .first();
    if (Number(ipCountRow?.count || 0) >= settings.max_ip_posts_per_hour) {
      const error = new Error("IP throttle exceeded for posting");
      error.status = 429;
      throw error;
    }
  }

  if (settings.max_device_posts_per_hour && deviceFingerprint) {
    const deviceCountRow = await db("community_posts")
      .count({ count: "id" })
      .where({ device_fingerprint: deviceFingerprint })
      .andWhere("created_at", ">=", cutoff)
      .first();
    if (
      Number(deviceCountRow?.count || 0) >= settings.max_device_posts_per_hour
    ) {
      const error = new Error("device throttle exceeded for posting");
      error.status = 429;
      throw error;
    }
  }
}

export const communityRouter = new Router();

communityRouter.get(
  "/community/feed",
  requirePermission("community.read"),
  async (ctx) => {
    const page = parsePositiveInt(ctx.query.page, 1);
    const perPage = Math.min(parsePositiveInt(ctx.query.per_page, 20), 100);
    const offset = (page - 1) * perPage;
    const authorId = normalizeText(ctx.query.author_id || "");
    const status = normalizeText(ctx.query.status || "") || "published";

    const postsQuery = db("community_posts")
      .where({ status })
      .whereNull("parent_post_id")
      .orderBy("created_at", "desc");

    if (authorId) {
      postsQuery.where({ user_id: authorId });
    }

    const posts = await postsQuery.limit(perPage).offset(offset);

    const totalQuery = db("community_posts")
      .count({ total: "id" })
      .where({ status })
      .whereNull("parent_post_id");
    if (authorId) {
      totalQuery.where({ user_id: authorId });
    }
    const totalRow = await totalQuery.first();

    const postIds = posts.map((post) => post.id);
    const replies = postIds.length
      ? await db("community_posts")
          .where({ status: "published" })
          .whereIn("parent_post_id", postIds)
          .orderBy("created_at", "asc")
      : [];

    const repliesByParent = replies.reduce((acc, reply) => {
      const list = acc[reply.parent_post_id] || [];
      list.push(reply);
      acc[reply.parent_post_id] = list;
      return acc;
    }, {});

    ctx.body = {
      data: posts.map((post) => ({
        ...post,
        replies: repliesByParent[post.id] || [],
      })),
      pagination: {
        page,
        per_page: perPage,
        total: Number(totalRow?.total || 0),
      },
    };
  },
);

communityRouter.get(
  "/community/reports/mine",
  requirePermission("community.report"),
  async (ctx) => {
    const page = parsePositiveInt(ctx.query.page, 1);
    const perPage = Math.min(parsePositiveInt(ctx.query.per_page, 20), 100);
    const offset = (page - 1) * perPage;
    const status = normalizeText(ctx.query.status || "");
    const userId = getActorUserId(ctx);
    if (!userId) {
      ctx.throw(400, "x-actor-user-id is required");
    }

    const query = db("community_reports")
      .where({ reporter_user_id: userId })
      .orderBy("created_at", "desc");
    const countQuery = db("community_reports")
      .count({ total: "id" })
      .where({ reporter_user_id: userId });

    if (status) {
      query.where({ status });
      countQuery.where({ status });
    }

    const [{ total = 0 } = { total: 0 }, rows] = await Promise.all([
      countQuery,
      query.limit(perPage).offset(offset),
    ]);

    ctx.body = {
      data: rows,
      pagination: {
        page,
        per_page: perPage,
        total: Number(total || 0),
      },
    };
  },
);

communityRouter.post(
  "/community/captcha/challenge",
  requirePermission("community.read"),
  async (ctx) => {
    const userId = getActorUserId(ctx);
    const a = Math.floor(Math.random() * 8) + 2;
    const b = Math.floor(Math.random() * 8) + 2;
    const challenge = {
      id: randomUUID(),
      user_id: userId,
      challenge_text: `What is ${a} + ${b}?`,
      expected_answer: String(a + b),
      author_ip: normalizeText(ctx.ip) || null,
      device_fingerprint:
        normalizeText(ctx.request.body?.device_fingerprint || "") || null,
      expires_at: new Date(Date.now() + 5 * 60000),
      solved_at: null,
      created_at: new Date(),
    };

    await db("captcha_challenges").insert(challenge);
    ctx.status = 201;
    ctx.body = {
      id: challenge.id,
      challenge_text: challenge.challenge_text,
      expires_at: challenge.expires_at,
    };
  },
);

communityRouter.post(
  "/community/posts",
  requirePermission("community.write"),
  async (ctx) => {
    const userId = getActorUserId(ctx);
    if (!userId) {
      ctx.throw(400, "x-actor-user-id is required");
    }

    const ban = await hasActiveBan(userId);
    if (ban) {
      ctx.throw(403, "user is temporarily or permanently banned from posting");
    }

    const content = normalizeText(ctx.request.body?.content || "");
    if (!content) {
      ctx.throw(400, "content is required");
    }
    const parentPostId =
      normalizeText(ctx.request.body?.parent_post_id || "") || null;
    if (parentPostId) {
      const parent = await db("community_posts")
        .where({ id: parentPostId })
        .first();
      if (!parent) {
        ctx.throw(404, "parent post not found");
      }
    }

    const settings = await getCommunitySettings();
    const authorIp = normalizeText(ctx.ip) || null;
    const deviceFingerprint =
      normalizeText(ctx.request.body?.device_fingerprint || "") || null;

    const [allowUsers, allowIps, allowDevices] = await Promise.all([
      getRules("allowlist", "user"),
      getRules("allowlist", "ip"),
      getRules("allowlist", "device"),
    ]);
    const isAllowlisted =
      hasRuleValue(allowUsers, userId) ||
      hasRuleValue(allowIps, authorIp) ||
      hasRuleValue(allowDevices, deviceFingerprint);

    const [blockUsers, blockIps, blockDevices, blockKeywords] =
      await Promise.all([
        getRules("blocklist", "user"),
        getRules("blocklist", "ip"),
        getRules("blocklist", "device"),
        getRules("blocklist", "keyword"),
      ]);

    if (
      hasRuleValue(blockUsers, userId) ||
      hasRuleValue(blockIps, authorIp) ||
      hasRuleValue(blockDevices, deviceFingerprint)
    ) {
      ctx.throw(403, "posting is blocked for this account or source");
    }

    await assertCaptchaIfNeeded({
      userId,
      settings,
      challengeId: ctx.request.body?.captcha_challenge_id,
      answer: ctx.request.body?.captcha_answer,
      authorIp,
      deviceFingerprint,
      isAllowlisted,
    });

    await assertThrottle({
      userId,
      authorIp,
      deviceFingerprint,
      settings,
      isAllowlisted,
    });

    const heldByKeyword =
      !isAllowlisted && contentContainsKeyword(content, blockKeywords);
    const now = new Date();
    const row = {
      id: randomUUID(),
      user_id: userId,
      parent_post_id: parentPostId,
      content,
      status: heldByKeyword ? "held" : "published",
      hold_reason: heldByKeyword ? "blocked keyword flagged for review" : null,
      flag_count: 0,
      author_ip: authorIp,
      device_fingerprint: deviceFingerprint,
      published_at: heldByKeyword ? null : now,
      created_at: now,
      updated_at: now,
    };

    await db("community_posts").insert(row);
    await writeAudit({
      entity: "community_posts",
      entityId: row.id,
      action: "create",
      payload: {
        status: row.status,
        hold_reason: row.hold_reason,
      },
      actorUserId: userId,
    });

    ctx.status = 201;
    ctx.body = row;
  },
);

communityRouter.post(
  "/community/posts/:id/report",
  requirePermission("community.report"),
  async (ctx) => {
    const userId = getActorUserId(ctx);
    if (!userId) {
      ctx.throw(400, "x-actor-user-id is required");
    }

    const reason = normalizeText(ctx.request.body?.reason || "");
    if (!reason) {
      ctx.throw(400, "reason is required");
    }

    const post = await db("community_posts")
      .where({ id: ctx.params.id })
      .first();
    if (!post) {
      ctx.throw(404, "post not found");
    }

    const settings = await getCommunitySettings();
    const authorIp = normalizeText(ctx.ip) || null;
    const deviceFingerprint =
      normalizeText(ctx.request.body?.device_fingerprint || "") || null;

    await assertCaptchaIfNeeded({
      userId,
      settings,
      challengeId: ctx.request.body?.captcha_challenge_id,
      answer: ctx.request.body?.captcha_answer,
      authorIp,
      deviceFingerprint,
      isAllowlisted: false,
    });

    const existing = await db("community_reports")
      .where({ post_id: post.id, reporter_user_id: userId })
      .first();
    if (existing) {
      ctx.body = existing;
      return;
    }

    const now = new Date();
    const row = {
      id: randomUUID(),
      post_id: post.id,
      reporter_user_id: userId,
      reason,
      status: "open",
      resolution_note: null,
      resolved_by_user_id: null,
      resolved_at: null,
      created_at: now,
      updated_at: now,
    };

    await db("community_reports").insert(row);

    const nextFlagCount = Number(post.flag_count || 0) + 1;
    const updatePost = {
      flag_count: nextFlagCount,
      updated_at: now,
    };
    if (
      nextFlagCount >= settings.auto_hold_report_threshold &&
      post.status === "published"
    ) {
      updatePost.status = "held";
      updatePost.hold_reason = "auto-held due to report threshold";
      updatePost.published_at = null;
    }
    await db("community_posts").where({ id: post.id }).update(updatePost);

    await writeAudit({
      entity: "community_reports",
      entityId: row.id,
      action: "create",
      payload: {
        post_id: post.id,
        reason,
        status: row.status,
      },
      actorUserId: userId,
    });

    ctx.status = 201;
    ctx.body = row;
  },
);

communityRouter.get(
  "/community/moderation/queue",
  requirePermission("community.moderate"),
  async (ctx) => {
    const page = parsePositiveInt(ctx.query.page, 1);
    const perPage = Math.min(parsePositiveInt(ctx.query.per_page, 20), 100);
    const offset = (page - 1) * perPage;

    const heldPosts = await db("community_posts")
      .where({ status: "held" })
      .orderBy("created_at", "asc")
      .limit(perPage)
      .offset(offset);
    const reports = await db("community_reports")
      .whereIn("status", ["open", "in_review"])
      .orderBy("created_at", "asc")
      .limit(perPage)
      .offset(offset);

    const [heldTotalRow, reportTotalRow] = await Promise.all([
      db("community_posts")
        .count({ total: "id" })
        .where({ status: "held" })
        .first(),
      db("community_reports")
        .count({ total: "id" })
        .whereIn("status", ["open", "in_review"])
        .first(),
    ]);

    ctx.body = {
      held_posts: heldPosts,
      reports,
      pagination: {
        page,
        per_page: perPage,
        held_posts_total: Number(heldTotalRow?.total || 0),
        reports_total: Number(reportTotalRow?.total || 0),
      },
    };
  },
);

communityRouter.post(
  "/community/moderation/posts/:id/decision",
  requirePermission("community.moderate"),
  async (ctx) => {
    const post = await db("community_posts")
      .where({ id: ctx.params.id })
      .first();
    if (!post) {
      ctx.throw(404, "post not found");
    }

    const decision = normalizeText(
      ctx.request.body?.decision || "",
    ).toLowerCase();
    const reason = normalizeText(ctx.request.body?.reason || "");
    if (!decision || !["accept", "reject"].includes(decision)) {
      ctx.throw(400, "decision must be accept or reject");
    }
    if (!reason) {
      ctx.throw(400, "reason is required");
    }

    const now = new Date();
    const updatePayload =
      decision === "accept"
        ? {
            status: "published",
            hold_reason: null,
            published_at: post.published_at || now,
            updated_at: now,
          }
        : {
            status: "rejected",
            hold_reason: reason,
            published_at: null,
            updated_at: now,
          };

    await db("community_posts").where({ id: post.id }).update(updatePayload);

    await writeAudit({
      entity: "community_posts",
      entityId: post.id,
      action: decision,
      payload: { reason },
      actorUserId: getActorUserId(ctx),
    });

    ctx.body = { id: post.id, ...updatePayload };
  },
);

communityRouter.post(
  "/community/moderation/reports/:id/decision",
  requirePermission("community.moderate"),
  async (ctx) => {
    const report = await db("community_reports")
      .where({ id: ctx.params.id })
      .first();
    if (!report) {
      ctx.throw(404, "report not found");
    }
    if (!["open", "in_review"].includes(report.status)) {
      ctx.throw(400, "report is already resolved");
    }

    const decision = normalizeText(
      ctx.request.body?.decision || "",
    ).toLowerCase();
    if (!decision || !["accept", "reject", "ban_user"].includes(decision)) {
      ctx.throw(400, "decision must be accept, reject, or ban_user");
    }
    const reason = normalizeText(ctx.request.body?.reason || "");
    if (!reason) {
      ctx.throw(400, "reason is required");
    }

    const now = new Date();
    const status = decision === "reject" ? "rejected" : "accepted";

    await db("community_reports")
      .where({ id: report.id })
      .update({
        status,
        resolution_note: reason,
        resolved_by_user_id: getActorUserId(ctx),
        resolved_at: now,
        updated_at: now,
      });

    if (decision === "ban_user") {
      const post = await db("community_posts")
        .where({ id: report.post_id })
        .first();
      if (post) {
        const durationHoursRaw = ctx.request.body?.ban_duration_hours;
        const durationHours =
          durationHoursRaw === null || durationHoursRaw === undefined
            ? null
            : Number(durationHoursRaw);
        const isPermanent =
          durationHours === null || Number.isNaN(durationHours);
        const expiresAt = isPermanent
          ? null
          : new Date(Date.now() + Math.max(1, durationHours) * 60 * 60000);

        await db("community_bans").insert({
          id: randomUUID(),
          user_id: post.user_id,
          source_report_id: report.id,
          reason,
          is_permanent: isPermanent,
          expires_at: expiresAt,
          created_by_user_id: getActorUserId(ctx),
          created_at: now,
          updated_at: now,
        });
      }
    }

    await writeAudit({
      entity: "community_reports",
      entityId: report.id,
      action: decision,
      payload: {
        reason,
        ban_duration_hours: ctx.request.body?.ban_duration_hours ?? null,
      },
      actorUserId: getActorUserId(ctx),
    });

    ctx.body = {
      id: report.id,
      status,
      decision,
      reason,
    };
  },
);

const { isDeepStrictEqual } = require('node:util');

const NON_BUSINESS_FIELDS = new Set(['updated_at']);

function buildRecipeSnapshot(recipe, categories) {
  return {
    ...recipe,
    categories: [...(categories || [])].sort()
  };
}

function changedRecipeFields(beforeData, afterData) {
  const keys = new Set([
    ...Object.keys(beforeData || {}),
    ...Object.keys(afterData || {})
  ]);
  return [...keys]
    .filter(key => !NON_BUSINESS_FIELDS.has(key))
    .filter(key => !isDeepStrictEqual(beforeData?.[key], afterData?.[key]))
    .sort();
}

async function recordRecipeRevision(client, revision) {
  await client.query(
    `INSERT INTO recipe_revisions
       (recipe_id, action, before_data, after_data, changed_fields,
        admin_user_id, audit_log_id, request_id, session_id, ip, ua)
     VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$9,$10,$11)`,
    [
      revision.recipeId,
      revision.action,
      revision.beforeData == null ? null : JSON.stringify(revision.beforeData),
      revision.afterData == null ? null : JSON.stringify(revision.afterData),
      revision.changedFields || [],
      revision.adminUserId || null,
      revision.auditLogId || null,
      revision.requestId,
      revision.sessionId || null,
      revision.ip || null,
      revision.ua || null
    ]
  );
}

module.exports = { buildRecipeSnapshot, changedRecipeFields, recordRecipeRevision };

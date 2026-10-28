
import {
  json,
  parseJson,
  requireRole,
  randomId
} from '../_lib/auth.js';

const STAFF_ROLES = [
  'SCHOOL_ADMIN',
  'DEPUTY',
  'SENIOR_MANAGER',
  'SECRETARY',
  'FINANCE_OFFICE',
  'TEACHER'
];

export async function onRequestGet({ request, env }) {
  const auth = await requireRole(request, env, STAFF_ROLES);
  if (!auth.user) return auth.response;

  const user = auth.user;
  const schoolId = String(user.school_id || '');

  if (!schoolId) {
    return json({ error: 'School account required.' }, 403);
  }

  try {
    const rows = await env.DB.prepare(`
      SELECT c.id, c.title, c.type, c.created_at,
        (SELECT body FROM school_messages m
         WHERE m.conversation_id = c.id
         ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM school_messages m
         WHERE m.conversation_id = c.id
         ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
      FROM school_conversations c
      JOIN school_conversation_members cm
        ON cm.conversation_id = c.id
      WHERE CAST(c.school_id AS TEXT) = ?
        AND cm.user_id = ?
      ORDER BY COALESCE(last_message_at, c.created_at) DESC
      LIMIT 100
    `).bind(schoolId, user.id).all();

    return json({
      ok: true,
      conversations: rows.results || []
    });
  } catch (error) {
    console.error('Messages GET failed:', error);
    return json({ error: 'Unable to load messages.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await requireRole(request, env, STAFF_ROLES);
  if (!auth.user) return auth.response;

  const user = auth.user;
  const schoolId = String(user.school_id || '');
  if (!schoolId) return json({ error: 'School account required.' }, 403);

  const body = await parseJson(request);
  const action = String(body?.action || '');
  
  try {
    if (action === 'create') {
      const title = String(body?.title || '').trim().slice(0, 120);
      const type = body?.type === 'GROUP' ? 'GROUP' : 'DIRECT';
      const recipients = [...new Set(
        (Array.isArray(body?.recipient_ids) ? body.recipient_ids : [])
          .map(id => String(id).trim())
          .filter(id => id && id !== String(user.id))
      )].slice(0, 50);

      if (!recipients.length) {
        return json({ error: 'Select at least one other staff member.' }, 400);
      }

      const ids = [String(user.id), ...recipients];
      const placeholders = ids.map(() => '?').join(',');

      const valid = await env.DB.prepare(`
        SELECT id FROM auth_users
        WHERE CAST(school_id AS TEXT) = ?
          AND id IN (${recipients.map(() => '?').join(',')})
          AND active = 1
          AND role IN (
            'SCHOOL_ADMIN','DEPUTY','SENIOR_MANAGER',
            'SECRETARY','FINANCE_OFFICE','TEACHER'
          )
      `).bind(schoolId, ...recipients).all();

      if ((valid.results || []).length !== recipients.length) {
        return json({ error: 'One or more recipients are invalid.' }, 400);
      }

      const conversationId = randomId();

      await env.DB.prepare(`
        INSERT INTO school_conversations
          (id, school_id, title, type, created_by)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        conversationId, schoolId, title || null, type, user.id
      ).run();

      for (const memberId of ids) {
        await env.DB.prepare(`
          INSERT INTO school_conversation_members
            (conversation_id, user_id)
          VALUES (?, ?)
        `).bind(conversationId, memberId).run();
      }

      return json({ ok: true, id: conversationId }, 201);
    }

    if (action === 'send') {
      const conversationId = String(body?.conversation_id || '');
      const message = String(body?.body || '').trim().slice(0, 5000);

      if (!conversationId || !message) {
        return json({ error: 'Conversation and message are required.' }, 400);
      }

      const member = await env.DB.prepare(`
        SELECT c.id FROM school_conversations c
        JOIN school_conversation_members cm
          ON cm.conversation_id = c.id
        WHERE c.id = ?
          AND CAST(c.school_id AS TEXT) = ?
          AND cm.user_id = ?
        LIMIT 1
      `).bind(conversationId, schoolId, user.id).first();

      if (!member) {
        return json({ error: 'Conversation not found.' }, 404);
      }

      const messageId = randomId();

      await env.DB.prepare(`
        INSERT INTO school_messages
          (id, conversation_id, sender_id, body)
        VALUES (?, ?, ?, ?)
      `).bind(messageId, conversationId, user.id, message).run();

      return json({ ok: true, id: messageId }, 201);
    }

    if (action === 'read') {
      const conversationId = String(body?.conversation_id || '');

      const result = await env.DB.prepare(`
        UPDATE school_conversation_members
        SET last_read_at = CURRENT_TIMESTAMP
        WHERE conversation_id = ?
          AND user_id = ?
          AND EXISTS (
            SELECT 1 FROM school_conversations c
            WHERE c.id = school_conversation_members.conversation_id
              AND CAST(c.school_id AS TEXT) = ?
          )
      `).bind(conversationId, user.id, schoolId).run();

      return json({ ok: true, changes: result.meta?.changes || 0 });
    }

    return json({ error: 'Unknown message action.' }, 400);
  } catch (error) {
    console.error('Messages POST failed:', error);
    return json({ error: 'Unable to process message.' }, 500);
  }
}

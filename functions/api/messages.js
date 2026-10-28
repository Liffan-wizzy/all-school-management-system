
import { json, parseJson, requireRole, randomId } from '../_lib/auth.js';

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
    return json({ error: 'School account is required.' }, 400);
  }

  const url = new URL(request.url);
  const conversationId = url.searchParams.get('conversation_id');

  try {
    if (conversationId) {
      const member = await env.DB.prepare(`
        SELECT c.id
        FROM school_conversations c
        JOIN school_conversation_members m
          ON m.conversation_id = c.id
        WHERE c.id = ?
          AND c.school_id = ?
          AND m.user_id = ?
      `).bind(conversationId, schoolId, user.id).first();

      if (!member) {
        return json({ error: 'Conversation not found.' }, 404);
      }

      const rows = await env.DB.prepare(`
        SELECT id, sender_id, body, created_at
        FROM school_messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        LIMIT 500
      `).bind(conversationId).all();

      return json({ ok: true, messages: rows.results || [] });
    }

    const rows = await env.DB.prepare(`
      SELECT
        c.id,
        c.title,
        c.type,
        c.created_at,
        (
          SELECT m.body
          FROM school_messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS last_message,
        (
          SELECT m.created_at
          FROM school_messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS last_message_at
      FROM school_conversations c
      JOIN school_conversation_members cm
        ON cm.conversation_id = c.id
      WHERE c.school_id = ?
        AND cm.user_id = ?
      ORDER BY COALESCE(last_message_at, c.created_at) DESC
      LIMIT 200
    `).bind(schoolId, user.id).all();

    return json({ ok: true, conversations: rows.results || [] });
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

  if (!schoolId) {
    return json({ error: 'School account is required.' }, 400);
  }

  const body = await parseJson(request);
  if (!body) return json({ error: 'Invalid request.' }, 400);

  try {
    if (body.action === 'create') {
      const recipients = Array.isArray(body.recipients)
        ? [...new Set(body.recipients.map(String).filter(id => id && id !== String(user.id)))]
        : [];

      if (!recipients.length || recipients.length > 50) {
        return json({ error: 'Choose at least one recipient.' }, 400);
      }

      const placeholders = recipients.map(() => '?').join(',');

      const found = await env.DB.prepare(`
        SELECT id
        FROM auth_users
        WHERE CAST(school_id AS TEXT) = ?
          AND id IN (${placeholders})
          AND role IN (
            'SCHOOL_ADMIN','DEPUTY','SENIOR_MANAGER',
            'SECRETARY','FINANCE_OFFICE','TEACHER'
          )
      `).bind(schoolId, ...recipients).all();

      const validIds = (found.results || []).map(row => String(row.id));

      if (validIds.length !== recipients.length) {
        return json({
          error: 'One or more recipients are invalid for this school.'
        }, 400);
      }

      const conversationId = randomId();
      const title = String(body.title || '').trim().slice(0, 160) || null;
      const type = recipients.length > 1 ? 'GROUP' : 'DIRECT';

      await env.DB.prepare(`
        INSERT INTO school_conversations
          (id, school_id, title, type, created_by)
        VALUES (?, ?, ?, ?, ?)
      `).bind(conversationId, schoolId, title, type, user.id).run();

      await env.DB.prepare(`
        INSERT INTO school_conversation_members
          (conversation_id, user_id)
        VALUES (?, ?)
      `).bind(conversationId, user.id).run();

      for (const recipientId of validIds) {
        await env.DB.prepare(`
          INSERT INTO school_conversation_members
            (conversation_id, user_id)
          VALUES (?, ?)
        `).bind(conversationId, recipientId).run();
      }

      const firstMessage = String(body.message || '').trim().slice(0, 5000);

      if (firstMessage) {
        await env.DB.prepare(`
          INSERT INTO school_messages
            (id, conversation_id, sender_id, body)
          VALUES (?, ?, ?, ?)
        `).bind(randomId(), conversationId, user.id, firstMessage).run();
      }

      return json({ ok: true, conversation_id: conversationId }, 201);
    }

    if (body.action === 'send') {
      const conversationId = String(body.conversation_id || '');
      const message = String(body.message || '').trim().slice(0, 5000);

      if (!conversationId || !message) {
        return json({ error: 'Conversation and message are required.' }, 400);
      }

      const member = await env.DB.prepare(`
        SELECT c.id
        FROM school_conversations c
        JOIN school_conversation_members m
          ON m.conversation_id = c.id
        WHERE c.id = ?
          AND c.school_id = ?
          AND m.user_id = ?
      `).bind(conversationId, schoolId, user.id).first();

      if (!member) {
        return json({ error: 'Conversation not found.' }, 404);
      }

      const result = await env.DB.prepare(`
        INSERT INTO school_messages
          (id, conversation_id, sender_id, body)
        VALUES (?, ?, ?, ?)
      `).bind(randomId(), conversationId, user.id, message).run();

      return json({ ok: true, success: !!result.success }, 201);
    }

    if (body.action === 'read') {
      const conversationId = String(body.conversation_id || '');

      const result = await env.DB.prepare(`
        UPDATE school_conversation_members
        SET last_read_at = CURRENT_TIMESTAMP
        WHERE conversation_id = ?
          AND user_id = ?
          AND EXISTS (
            SELECT 1
            FROM school_conversations c
            WHERE c.id = school_conversation_members.conversation_id
              AND c.school_id = ?
          )
      `).bind(conversationId, user.id, schoolId).run();

      if (!result.meta?.changes) {
        return json({ error: 'Conversation not found.' }, 404);
      }

      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    console.error('Messages POST failed:', error);
    return json({ error: 'Unable to process message request.' }, 500);
  }
}

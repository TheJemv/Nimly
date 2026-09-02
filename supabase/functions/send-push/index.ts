import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Inyectadas automáticamente por Supabase en el servicio `functions`.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'http://kong:8000'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Si defines WEBHOOK_SECRET en el env del servicio `functions` y lo mandas como
// header `x-webhook-secret` desde el Database Webhook, se rechaza cualquier
// llamada que no lo traiga. Si no está definido, no se valida (compat hacia atrás).
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)

Deno.serve(async (req) => {
  try {
    if (!SERVICE_ROLE_KEY) {
      return new Response('Server misconfigured: missing service role key', { status: 500 })
    }
    if (WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { record, table } = await req.json()
    if (!record) return new Response('No record in payload', { status: 200 })

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    let targetUserId = ""
    let pushTitle = "Nimly"
    let pushBody = "You have a new update"

    // CASE A: viene de la tabla MESSAGES
    if (table === 'messages' || record.chat_id) {
      // Puede haber 0 o varias filas: no usamos .single() (que lanzaría).
      const { data: recipients } = await supabase
        .from('chat_participants')
        .select('user_id')
        .eq('chat_id', record.chat_id)
        .neq('user_id', record.sender_id)

      const recipient = recipients?.[0]
      if (!recipient) return new Response('No recipient found', { status: 200 })
      targetUserId = recipient.user_id

      const { data: sender } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', record.sender_id)
        .maybeSingle()

      pushTitle = `@${sender?.username || 'Someone'}`
      pushBody = record.type === 'text' ? 'sent you a message' : 'sent you a photo'
    }

    // CASE B: viene de la tabla NOTIFICATIONS
    else if (table === 'notifications' || record.user_id) {
      targetUserId = record.user_id
      pushTitle = record.title || "New Notification"
      pushBody = record.content || record.body || "Check your activity in Nimly"
    }

    if (!targetUserId) return new Response('No target user', { status: 200 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .eq('id', targetUserId)
      .maybeSingle()

    if (!profile?.expo_push_token) return new Response('User has no push token', { status: 200 })

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: profile.expo_push_token,
        title: pushTitle,
        body: pushBody,
        sound: 'default',
        data: { recordId: record.id, table, senderId: record.sender_id },
      }),
    })

    return new Response('Push sent successfully', { status: 200 })
  } catch (error) {
    return new Response(JSON.stringify({ error: errorMessage(error) }), { status: 400 })
  }
})

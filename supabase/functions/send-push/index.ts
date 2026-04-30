import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    // We get the 'record' (the data) and 'table' (to know where it comes from)
    const { record, table } = await req.json()
    
    const supabase = createClient(
      'https://supabase.platosmart.com',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzcxNTc1MjgsImV4cCI6MTkzNDgzNzUyOH0.JDdIHfNK1kAFxYpcVXBqgXbVJ_VVnLJ5KFGzszrLL3E' // Keep your key here
    )

    let targetUserId = ""
    let pushTitle = "Nimly Vault"
    let pushBody = "You have a new update"

    // CASE A: Notification comes from the MESSAGES table
    if (table === 'messages' || record.chat_id) {
      const { data: recipient } = await supabase
        .from('chat_participants')
        .select('user_id')
        .eq('chat_id', record.chat_id)
        .neq('user_id', record.sender_id)
        .single()
      
      if (!recipient) return new Response('No recipient found', { status: 200 })
      targetUserId = recipient.user_id

      const { data: sender } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', record.sender_id)
        .single()

      pushTitle = `@${sender?.username || 'Someone'} in Nimly Vault`
      pushBody = record.type === 'text' ? 'sent you an encrypted message' : 'sent you a one-time capsule'
    } 
    
    // CASE B: Notification comes from the NOTIFICATIONS table
    else if (table === 'notifications' || record.user_id) {
      targetUserId = record.user_id
      pushTitle = record.title || "New Notification"
      pushBody = record.content || record.body || "Check your activity in Nimly"
    }

    // 4. Fetch the Expo token
    const { data: profile } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .eq('id', targetUserId)
      .single()

    if (!profile?.expo_push_token) return new Response('User has no push token', { status: 200 })

    // 5. Send to Expo
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: profile.expo_push_token,
        title: pushTitle,
        body: pushBody,
        sound: 'default',
        data: { recordId: record.id, table: table, senderId: record.sender_id }
      }),
    })

    return new Response('Push sent successfully', { status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }
})
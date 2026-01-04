// supabase/functions/send-push/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from "https://esm.sh/web-push"

// Get Environment Variables from Supabase Secrets
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;

webpush.setVapidDetails('mailto:admin@example.com', VAPID_PUBLIC, VAPID_PRIVATE);

serve(async (req) => {
  // This 'record' comes from the Supabase Webhook payload
  const { record } = await req.json(); 
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Get all subscriptions EXCEPT the one belonging to the sender
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('subscription_json')
    .neq('username', record.username);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  // Send push notifications to all other active users
  const notifications = subs?.map(s => 
    webpush.sendNotification(s.subscription_json, JSON.stringify({
      title: `Message from ${record.username}`,
      body: "New secure message received", // We don't send decrypted content for security
      url: "/" 
    }))
  );

  await Promise.allSettled(notifications || []);

  return new Response(JSON.stringify({ success: true }), { 
    headers: { "Content-Type": "application/json" } 
  });
})
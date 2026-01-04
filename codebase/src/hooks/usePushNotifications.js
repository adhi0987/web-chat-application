// src/hooks/usePushNotifications.js
import { supabase } from '../services/supabase'; //

// PASTE YOUR PUBLIC KEY HERE
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function usePushNotifications() {
  const subscribeUser = async (username) => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn("Push messaging is not supported in this browser");
      return;
    }

    try {
      // Register the service worker file we created in public/sw.js
      const registration = await navigator.serviceWorker.register('/sw.js');
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY
      });

      // Store the subscription object in the database
      const { error } = await supabase.from('push_subscriptions').insert([{
        username: username,
        subscription_json: subscription
      }]);

      if (error) throw error;
      
      console.log('[Push] Subscription successful for:', username);
    } catch (err) {
      console.error('[Push] Subscription failed:', err);
    }
  };

  return { subscribeUser };
}
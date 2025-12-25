import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { decryptData } from '../services/crypto';

export function useChat(secretCode, username) {
  const [messages, setMessages] = useState([]);
  const [activeUsers, setActiveUsers] = useState(0);
  const [activeUserList, setActiveUserList] = useState([]);

  useEffect(() => {
    if (!secretCode) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_secret_code', secretCode)
        .order('created_at', { ascending: true });

      if (!error) {
        setMessages(data.map(msg => ({ ...msg, content: decryptData(msg.content) })));
      }
    };

    fetchMessages();

    const channel = supabase
      .channel(`room-${secretCode.substring(0, 8)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `room_secret_code=eq.${secretCode}`
      }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        setMessages((prev) => {
          if (eventType === 'INSERT') return [...prev, { ...newRow, content: decryptData(newRow.content) }];
          if (eventType === 'UPDATE') return prev.map(m => m.id === newRow.id ? { ...newRow, content: decryptData(newRow.content) } : m);
          if (eventType === 'DELETE') return prev.filter(m => m.id !== oldRow.id);
          return prev;
        });
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const names = Object.values(state || {}).flatMap(v => v.map(p => p.user)).filter(Boolean);
        const unique = [...new Set(names)];
        setActiveUsers(unique.length);
        setActiveUserList(unique);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user: username, online_at: new Date().toISOString() });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [secretCode, username]);

  return { messages, activeUsers, activeUserList };
}
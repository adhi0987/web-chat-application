import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { decryptData } from '../services/crypto';

export function useChat(secretCode, username) {
    const [messages, setMessages] = useState([]);
    const [activeUsers, setActiveUsers] = useState(0);
    const [activeUserList, setActiveUserList] = useState([]);

    const fetchMessages = useCallback(async () => {
        console.log("[Chat] Fetching messages...");
        const { data, error } = await supabase
            .from('messages')
            .select('*, reactions:message_reactions(*)')
            .eq('room_secret_code', secretCode)
            // 1. Order by DESCENDING to get the newest messages first
            .order('created_at', { ascending: false })
            // 2. Optional: Explicitly set a limit if you want more than 1000

        if (error) {
            console.error("[Chat] Fetch Error:", error.message);
            return;
        }
        console.log(`[Chat] Fetched ${data.length} messages`);

        // 3. Reverse the array so the oldest of the "latest" messages are at the top
        const processed = data.reverse().map(msg => ({
            ...msg,
            content: decryptData(msg.content),
            reactions: msg.reactions || []
        }));

        setMessages(processed);
    }, [secretCode]);

    useEffect(() => {
        if (!secretCode) return;

        fetchMessages();

        // Create a unique channel for this room
        const channel = supabase
            .channel(`room-${secretCode}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'messages',
                filter: `room_secret_code=eq.${secretCode}`
            }, (payload) => {
                console.log("[Chat] New Message Event:", payload.eventType);
                const { eventType, new: newRow, old: oldRow } = payload;

                setMessages((prev) => {
                    if (eventType === 'INSERT') {
                        return [...prev, { ...newRow, content: decryptData(newRow.content), reactions: [] }];
                    }
                    if (eventType === 'UPDATE') {
                        return prev.map(m => String(m.id) === String(newRow.id)
                            ? { ...newRow, content: decryptData(newRow.content), reactions: m.reactions }
                            : m
                        );
                    }
                    if (eventType === 'DELETE') {
                        return prev.filter(m => String(m.id) !== String(oldRow.id));
                    }
                    return prev;
                });
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'message_reactions'
            }, () => {
                console.log("[Chat] Reaction Change Detected - Refreshing...");
                fetchMessages();
            })
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const names = Object.values(state || {}).flatMap(v => v.map(p => p.user)).filter(Boolean);
                const unique = [...new Set(names)];
                setActiveUsers(unique.length);
                setActiveUserList(unique);
            })
            .subscribe((status) => {
                console.log(`[Chat] Subscription Status: ${status}`);
                if (status === 'SUBSCRIBED') {
                    channel.track({ user: username, online_at: new Date().toISOString() });
                }
            });

        return () => {
            console.log("[Chat] Cleaning up channel");
            supabase.removeChannel(channel);
        };
    }, [secretCode, username, fetchMessages]);

    return { messages, activeUsers, activeUserList };
}
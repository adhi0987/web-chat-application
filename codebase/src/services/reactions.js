import { supabase } from './supabase';

/**
 * Toggles an emoji reaction.
 * Handles the .single() error correctly to determine if we insert or delete.
 */
export const toggleReaction = async (messageId, username, emoji) => {
  console.log(`[Reaction] Toggling ${emoji} for message ${messageId}`);

  try {
    // Check if this specific reaction already exists
    const { data: existing, error } = await supabase
      .from('message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('username', username)
      .eq('emoji', emoji)
      .maybeSingle(); // maybeSingle doesn't throw an error if not found

    if (error) throw error;

    if (existing) {
      // Remove it if it exists
      const { error: delError } = await supabase
        .from('message_reactions')
        .delete()
        .eq('id', existing.id);
      if (delError) throw delError;
      console.log("[Reaction] Removed successfully");
    } else {
      // Add it if it doesn't
      const { error: insError } = await supabase
        .from('message_reactions')
        .insert([{ message_id: messageId, username, emoji }]);
      if (insError) throw insError;
      console.log("[Reaction] Added successfully");
    }
  } catch (err) {
    console.error("[Reaction] Error toggling reaction:", err.message);
  }
};
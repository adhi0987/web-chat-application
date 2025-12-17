import { createClient } from '@supabase/supabase-js'

// REPLACE WITH YOUR KEYS FROM SUPABASE DASHBOARD -> SETTINGS -> API
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Uploads an image file to Supabase Storage and returns the public URL.
 * @param {File} file - The image file to upload.
 * @param {string} userIdentifier - The unique identifier of the user (e.g., username).
 * @returns {Promise<string>} - The public URL of the uploaded image.
 */
export const uploadImage = async (file, userIdentifier) => {
  // Use userIdentifier (which is the username) for the folder path
  const fileExt = file.name.split(".").pop();
  // Generate a unique filename using timestamp and random string
  const fileName = `${userIdentifier}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  const filePath = `${fileName}`;

  const { data, error } = await supabase.storage
    .from("chat_images") // Ensure this bucket exists in your Supabase Storage
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw error;
  }

  // Get the public URL
  const { data: publicUrlData } = supabase.storage
    .from("chat_images")
    .getPublicUrl(filePath);

  return publicUrlData.publicUrl;
};

/**
 * Deletes an image from Supabase Storage.
 * @param {string} imageUrl - The public URL of the image to delete.
 */
export const deleteImage = async (imageUrl) => {
  // Extract the file path from the public URL.
  // Assumes the URL format: .../storage/v1/object/public/chat_images/user_identifier/filename.ext
  const urlParts = imageUrl.split("/");
  // Find the index of the bucket name and take everything after it
  const filePathIndex = urlParts.findIndex((part) => part === "chat_images") + 1;
  const filePath = urlParts.slice(filePathIndex).join("/");

  if (!filePath) {
    console.error("Could not extract file path from URL:", imageUrl);
    return;
  }

  const { error } = await supabase.storage.from("chat_images").remove([filePath]);

  if (error) {
    console.error("Error deleting image from storage:", error);
    throw error;
  }
};
import CryptoJS from 'crypto-js'

const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY;

export const encryptData = (text) => {
  if (!text) return '';
  try {
    return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
  } catch (e) {
    console.error("Encryption error:", e);
    return text;
  }
};

export const decryptData = (cipherText) => {
  if (!cipherText) return '';
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, ENCRYPTION_KEY);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    if (!originalText) throw new Error("Decryption returned empty string");
    return originalText;
  } catch (e) {
    return "[Encrypted Content]";
  }
};
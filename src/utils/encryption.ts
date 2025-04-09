import CryptoJS from 'crypto-js';

// Generate a random key for ECDH key exchange
export const generateKeyPair = (): { privateKey: string; publicKey: string } => {
  // For simplicity, we're using a random string as a key
  // In a production app, you would use actual ECDH key generation
  const privateKey = CryptoJS.lib.WordArray.random(32).toString();
  const publicKey = CryptoJS.SHA256(privateKey).toString();
  
  return { privateKey, publicKey };
};

// Derive a shared secret from your private key and their public key
export const deriveSharedSecret = (myPrivateKey: string, theirPublicKey: string): string => {
  // In a real ECDH implementation, you would use proper key derivation
  // This is a simplified version for demonstration purposes
  return CryptoJS.HmacSHA256(theirPublicKey, myPrivateKey).toString();
};

// Encrypt a message using AES with the shared secret
export const encryptMessage = (message: string, sharedSecret: string): string => {
  return CryptoJS.AES.encrypt(message, sharedSecret).toString();
};

// Decrypt a message using AES with the shared secret
export const decryptMessage = (encryptedMessage: string, sharedSecret: string): string => {
  const bytes = CryptoJS.AES.decrypt(encryptedMessage, sharedSecret);
  return bytes.toString(CryptoJS.enc.Utf8);
};

// Generate a session key that will be used for all messages in the chat
export const generateSessionKey = (): string => {
  return CryptoJS.lib.WordArray.random(32).toString();
};

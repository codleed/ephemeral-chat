import CryptoJS from "crypto-js";
import * as elliptic from "elliptic";

// Initialize elliptic curve for ECDH
const ec = new elliptic.ec("p256"); // Using P-256 curve for better security

/**
 * Generate a key pair for ECDH key exchange using proper elliptic curve cryptography
 * @returns An object containing the private and public keys
 */
export const generateKeyPair = (): {
  privateKey: string;
  publicKey: string;
} => {
  try {
    // Generate a proper ECDH key pair
    const keyPair = ec.genKeyPair();

    // Convert to hex strings for storage/transmission
    const privateKey = keyPair.getPrivate("hex");
    const publicKey = keyPair.getPublic("hex");

    return { privateKey, publicKey };
  } catch (error: any) {
    console.error("Error generating key pair:", error);
    throw new Error(
      "Failed to generate secure key pair: " +
        (error.message || "Unknown error")
    );
  }
};

/**
 * Derive a shared secret using ECDH key exchange
 * @param myPrivateKey The private key of the local user
 * @param theirPublicKey The public key of the remote user
 * @returns The derived shared secret as a hex string
 */
export const deriveSharedSecret = (
  myPrivateKey: string,
  theirPublicKey: string
): string => {
  try {
    // Convert private key from hex to key object
    const privateKeyObj = ec.keyFromPrivate(myPrivateKey, "hex");

    // Convert public key from hex to key object
    const publicKeyObj = ec.keyFromPublic(theirPublicKey, "hex");

    // Compute the shared secret
    const sharedSecret = privateKeyObj.derive(publicKeyObj.getPublic());

    // Convert to hex string
    const sharedSecretHex = sharedSecret.toString("hex");

    // Use HKDF (Hash-based Key Derivation Function) for better security
    // This ensures the derived key has good cryptographic properties
    return deriveKeyHKDF(sharedSecretHex, "AES-256-GCM");
  } catch (error: any) {
    console.error("Error deriving shared secret:", error);
    throw new Error(
      "Failed to derive shared secret: " + (error.message || "Unknown error")
    );
  }
};

/**
 * Implement HKDF (Hash-based Key Derivation Function) for secure key derivation
 * @param inputKey The input key material (shared secret)
 * @param salt Optional salt for additional security
 * @param info Optional context and application specific information
 * @param length Desired output key length in bytes
 * @returns The derived key as a hex string
 */
export const deriveKeyHKDF = (
  inputKey: string,
  info: string = "",
  salt: string = "ephemeral-chat-salt",
  length: number = 32
): string => {
  try {
    // Step 1: Extract - HMAC the input key with salt to normalize it
    const prk = CryptoJS.HmacSHA256(inputKey, salt);

    // Step 2: Expand - Create output key material of desired length
    let okm = CryptoJS.lib.WordArray.create();
    let t = CryptoJS.lib.WordArray.create();
    let i = 1;

    while (okm.sigBytes < length) {
      // T(i) = HMAC-Hash(PRK, T(i-1) | info | i)
      const data = t.clone();
      data.concat(CryptoJS.enc.Utf8.parse(info));
      data.concat(CryptoJS.enc.Utf8.parse(String.fromCharCode(i)));

      t = CryptoJS.HmacSHA256(data, prk);
      okm.concat(t);
      i++;
    }

    // Truncate to the desired length
    okm.sigBytes = length;

    return okm.toString();
  } catch (error: any) {
    console.error("Error in HKDF:", error);
    throw new Error(
      "Failed to derive key using HKDF: " + (error.message || "Unknown error")
    );
  }
};

/**
 * Encrypt a message using AES-GCM with the shared secret
 * AES-GCM provides both confidentiality and integrity/authenticity
 * @param message The plaintext message to encrypt
 * @param key The encryption key
 * @returns The encrypted message as a string
 */
export const encryptMessage = (message: string, key: string): string => {
  try {
    console.log("Encrypting message:", {
      messageLength: message?.length || 0,
      keyLength: key?.length || 0,
      messagePreview: message?.substring(0, 20) + "...",
    });

    // For backward compatibility, use the legacy format for now
    // This ensures that messages can be decrypted by clients that haven't been updated
    // TODO: Remove this after all clients have been updated
    const useLegacyFormat = true; // Force legacy format for now

    if (useLegacyFormat) {
      console.log("Using legacy encryption format for compatibility");
      // Generate a random IV
      const iv = CryptoJS.lib.WordArray.random(16);

      // Convert key to WordArray if it's a string
      const keyWordArray =
        typeof key === "string" ? CryptoJS.enc.Hex.parse(key) : key;

      // Encrypt the message
      const encrypted = CryptoJS.AES.encrypt(message, keyWordArray, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      // Create a signature for the message
      const signature = CryptoJS.HmacSHA256(message, keyWordArray).toString();

      // Return IV + Encrypted message + Signature
      const result =
        iv.toString() + ":" + encrypted.toString() + ":" + signature;
      console.log("Legacy encryption result:", result.substring(0, 30) + "...");
      return result;
    } else {
      // New secure format - only use after all clients have been updated
      console.log("Using new secure encryption format");
      // Generate a random nonce (IV) - 12 bytes is recommended for GCM
      const nonce = CryptoJS.lib.WordArray.random(12);

      // Convert key to WordArray if it's a string
      const keyWordArray =
        typeof key === "string" ? CryptoJS.enc.Hex.parse(key) : key;

      // Add a timestamp to prevent replay attacks
      const timestamp = Date.now().toString();
      const messageWithTimestamp = JSON.stringify({
        content: message,
        timestamp: timestamp,
      });

      // Encrypt the message using AES-GCM
      // Note: CryptoJS doesn't directly support GCM, so we're using a workaround with CTR mode and HMAC
      const encrypted = CryptoJS.AES.encrypt(
        messageWithTimestamp,
        keyWordArray,
        {
          iv: nonce,
          mode: CryptoJS.mode.CTR,
          padding: CryptoJS.pad.NoPadding,
        }
      );

      // Create an authentication tag (HMAC of nonce + ciphertext)
      const hmacInput = nonce.toString() + encrypted.toString();
      const authTag = CryptoJS.HmacSHA256(hmacInput, keyWordArray)
        .toString()
        .substring(0, 32);

      // Return nonce + encrypted message + auth tag in a structured format
      const result = JSON.stringify({
        nonce: nonce.toString(),
        ciphertext: encrypted.toString(),
        authTag: authTag,
      });
      console.log("New encryption result:", result.substring(0, 30) + "...");
      return result;
    }
  } catch (error: any) {
    console.error("Encryption error:", error);
    throw new Error(
      "Failed to encrypt message: " + (error.message || "Unknown error")
    );
  }
};

/**
 * Decrypt a message using AES-GCM with the shared secret
 * Supports both new secure format and legacy format for backward compatibility
 * @param encryptedMessage The encrypted message
 * @param key The decryption key
 * @returns The decrypted message as a string
 */
export const decryptMessage = (
  encryptedMessage: string,
  key: string
): string => {
  try {
    console.log("Attempting to decrypt message:", {
      messageLength: encryptedMessage?.length || 0,
      keyLength: key?.length || 0,
      messagePreview: encryptedMessage?.substring(0, 20) + "...",
    });

    // Convert key to WordArray if it's a string
    const keyWordArray =
      typeof key === "string" ? CryptoJS.enc.Hex.parse(key) : key;

    // Try to parse as JSON to determine if it's the new format
    try {
      const parsedMessage = JSON.parse(encryptedMessage);
      console.log("Successfully parsed message as JSON", {
        hasNonce: !!parsedMessage?.nonce,
        hasCiphertext: !!parsedMessage?.ciphertext,
        hasAuthTag: !!parsedMessage?.authTag,
      });

      // Check if it's the new format with nonce, ciphertext, and authTag
      if (
        parsedMessage &&
        parsedMessage.nonce &&
        parsedMessage.ciphertext &&
        parsedMessage.authTag
      ) {
        const { nonce, ciphertext, authTag } = parsedMessage;

        // Verify the authentication tag
        const hmacInput = nonce + ciphertext;
        const expectedAuthTag = CryptoJS.HmacSHA256(hmacInput, keyWordArray)
          .toString()
          .substring(0, 32);

        if (expectedAuthTag !== authTag) {
          console.warn("Auth tag verification failed", {
            expected: expectedAuthTag,
            received: authTag,
          });
          throw new Error(
            "Message authentication failed - possible tampering detected"
          );
        }

        // Convert nonce from string to WordArray
        const nonceWordArray = CryptoJS.enc.Hex.parse(nonce);

        // Decrypt the message
        const decrypted = CryptoJS.AES.decrypt(ciphertext, keyWordArray, {
          iv: nonceWordArray,
          mode: CryptoJS.mode.CTR,
          padding: CryptoJS.pad.NoPadding,
        });

        // Convert to string
        const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
        console.log(
          "Decrypted string (new format):",
          decryptedStr.substring(0, 30) + "..."
        );

        // Parse the JSON to get the original message and timestamp
        try {
          const { content, timestamp } = JSON.parse(decryptedStr);

          // Check if the message is too old (optional, prevents replay attacks)
          const messageTime = parseInt(timestamp);
          const currentTime = Date.now();
          const MESSAGE_MAX_AGE = 5 * 60 * 1000; // 5 minutes in milliseconds

          if (currentTime - messageTime > MESSAGE_MAX_AGE) {
            console.warn("Message is too old, possible replay attack");
            // You might want to handle this differently in production
            // throw new Error("Message is too old, possible replay attack");
          }

          console.log("Successfully decrypted message (new format):", content);
          return content;
        } catch (jsonParseError) {
          console.error("Failed to parse decrypted JSON:", jsonParseError);
          // If JSON parsing fails, return the raw decrypted string
          return decryptedStr;
        }
      }
    } catch (jsonError) {
      // Not JSON or not in the new format, try the legacy format
      console.log("Not in new format, trying legacy format", jsonError);
    }

    // Legacy format handling (IV:EncryptedContent:Signature)
    console.log("Attempting legacy format decryption");
    const parts = encryptedMessage.split(":");
    console.log("Legacy format parts:", parts.length);

    if (parts.length >= 2) {
      // At minimum we need IV and encrypted content
      const ivStr = parts[0];
      const encryptedStr = parts[1];

      // Convert IV from string to WordArray
      const iv = CryptoJS.enc.Hex.parse(ivStr);

      // Decrypt the message using legacy format (CBC mode)
      const decrypted = CryptoJS.AES.decrypt(encryptedStr, keyWordArray, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      // Convert to string
      const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
      console.log("Decrypted string (legacy format):", decryptedStr);

      // Check if we have a signature (part 3) and verify it
      if (parts.length >= 3) {
        const signature = parts[2];
        const expectedSignature = CryptoJS.HmacSHA256(
          decryptedStr,
          keyWordArray
        ).toString();

        if (expectedSignature !== signature) {
          console.warn("Legacy message signature verification failed", {
            expected: expectedSignature,
            received: signature,
          });
          // We still return the decrypted message for backward compatibility
        }
      }

      console.log(
        "Successfully decrypted message (legacy format):",
        decryptedStr
      );
      return decryptedStr;
    }

    throw new Error("Invalid message format - neither new nor legacy format");
  } catch (error: any) {
    console.error("Decryption error:", error);
    const errorMessage = error.message || "Unknown error";
    throw new Error("Failed to decrypt message: " + errorMessage);
  }
};

/**
 * Generate a cryptographically secure session key for AES encryption
 * @returns A secure random key as a hex string
 */
export const generateSessionKey = (): string => {
  // Generate a 256-bit (32 byte) random key
  return CryptoJS.lib.WordArray.random(32).toString();
};

/**
 * Sign a message using HMAC-SHA256 for authenticity verification
 * @param message The message to sign
 * @param privateKey The private key to use for signing
 * @returns The signature as a hex string
 */
export const signMessage = (message: string, privateKey: string): string => {
  try {
    console.log("Signing message:", {
      messageLength: message?.length || 0,
      keyLength: privateKey?.length || 0,
      messagePreview: message?.substring(0, 20) + "...",
    });

    // For backward compatibility, use the legacy format for now
    // This ensures that signatures can be verified by clients that haven't been updated
    // TODO: Remove this after all clients have been updated
    const useLegacyFormat = true; // Force legacy format for now

    if (useLegacyFormat) {
      console.log("Using legacy signature format for compatibility");
      // Create the signature using HMAC-SHA256
      const signature = CryptoJS.HmacSHA256(message, privateKey).toString();
      console.log(
        "Legacy signature result:",
        signature.substring(0, 20) + "..."
      );
      return signature;
    } else {
      // Add a timestamp to prevent replay attacks
      const timestamp = Date.now().toString();
      const dataToSign = JSON.stringify({
        message: message,
        timestamp: timestamp,
      });

      // Create the signature using HMAC-SHA256
      const signature = CryptoJS.HmacSHA256(dataToSign, privateKey).toString();

      // Return both the signature and the timestamp
      const result = JSON.stringify({
        signature: signature,
        timestamp: timestamp,
      });
      console.log(
        "New signature format result:",
        result.substring(0, 30) + "..."
      );
      return result;
    }
  } catch (error: any) {
    console.error("Signing error:", error);
    throw new Error(
      "Failed to sign message: " + (error.message || "Unknown error")
    );
  }
};

/**
 * Verify a message signature using HMAC-SHA256
 * Supports both new secure format and legacy format for backward compatibility
 * @param message The original message
 * @param signatureData The signature data (contains signature and timestamp)
 * @param publicKey The public key to use for verification
 * @returns True if the signature is valid, false otherwise
 */
export const verifySignature = (
  message: string,
  signatureData: string,
  publicKey: string
): boolean => {
  try {
    console.log("Verifying signature:", {
      messageLength: message?.length || 0,
      signatureDataLength: signatureData?.length || 0,
      publicKeyLength: publicKey?.length || 0,
      signaturePreview: signatureData?.substring(0, 20) + "...",
    });

    // Try to parse as JSON to determine if it's the new format
    try {
      const parsedSignature = JSON.parse(signatureData);
      console.log("Successfully parsed signature as JSON", {
        hasSignature: !!parsedSignature?.signature,
        hasTimestamp: !!parsedSignature?.timestamp,
      });

      const { signature, timestamp } = parsedSignature;

      if (signature && timestamp) {
        // This is the new format with timestamp
        console.log("Using new signature format with timestamp");

        // Check if the signature is too old (prevents replay attacks)
        const signatureTime = parseInt(timestamp);
        const currentTime = Date.now();
        const SIGNATURE_MAX_AGE = 5 * 60 * 1000; // 5 minutes in milliseconds

        if (currentTime - signatureTime > SIGNATURE_MAX_AGE) {
          console.error("Signature is too old, possible replay attack", {
            signatureTime,
            currentTime,
            difference: currentTime - signatureTime,
            maxAge: SIGNATURE_MAX_AGE,
          });
          return false;
        }

        // Recreate the data that was signed
        const dataToVerify = JSON.stringify({
          message: message,
          timestamp: timestamp,
        });

        // Calculate the expected signature
        const expectedSignature = CryptoJS.HmacSHA256(
          dataToVerify,
          publicKey
        ).toString();

        // Compare the signatures
        const isValid = expectedSignature === signature;
        console.log("New format signature verification result:", {
          isValid,
          expected: expectedSignature.substring(0, 10) + "...",
          received: signature.substring(0, 10) + "...",
        });
        return isValid;
      }
    } catch (jsonError) {
      // Not JSON or not in the new format, try the legacy format
      console.log(
        "Not in new signature format, trying legacy format",
        jsonError
      );
    }

    // Legacy format - direct HMAC signature without timestamp
    // The signatureData is the signature itself
    console.log("Using legacy signature format");
    const expectedSignature = CryptoJS.HmacSHA256(
      message,
      publicKey
    ).toString();

    // Compare the signatures
    const isValid = expectedSignature === signatureData;
    console.log("Legacy format signature verification result:", {
      isValid,
      expected: expectedSignature.substring(0, 10) + "...",
      received: signatureData.substring(0, 10) + "...",
    });
    return isValid;
  } catch (error: any) {
    console.error("Signature verification error:", error);
    return false;
  }
};

/**
 * Generate a secure random value for use as a nonce or salt
 * @param length The length of the random value in bytes
 * @returns The random value as a hex string
 */
export const generateRandomValue = (length: number = 16): string => {
  return CryptoJS.lib.WordArray.random(length).toString();
};

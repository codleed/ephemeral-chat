import { Socket } from "socket.io";

// Validation rules
const VALIDATION_RULES = {
  "create-session": [],
  "join-session": [
    {
      field: "code",
      validate: (value: any) =>
        typeof value === "string" && /^[A-Z0-9]{6}$/.test(value),
      message: "Session code must be a 6-character alphanumeric string",
    },
  ],
  "send-message": [
    {
      field: "encryptedContent",
      validate: (value: any) => {
        // Check if it's a string and not empty
        if (
          typeof value !== "string" ||
          value.length === 0 ||
          value.length > 20000
        ) {
          return false;
        }

        // Try to parse as JSON to validate the structure
        try {
          const parsed = JSON.parse(value);
          // Check if it has the required fields for our encryption format
          return (
            typeof parsed === "object" &&
            parsed !== null &&
            typeof parsed.nonce === "string" &&
            typeof parsed.ciphertext === "string" &&
            typeof parsed.authTag === "string"
          );
        } catch (e) {
          // If it's not valid JSON, it might be the old format or invalid
          // For backward compatibility, we'll still accept strings
          return true;
        }
      },
      message: "Message content must be a properly formatted encrypted message",
    },
    {
      field: "signature",
      validate: (value: any) => {
        // Signature is optional
        if (value === undefined) return true;

        // If provided, it must be a string
        if (
          typeof value !== "string" ||
          value.length === 0 ||
          value.length > 10000
        ) {
          return false;
        }

        // Try to parse as JSON to validate the structure
        try {
          const parsed = JSON.parse(value);
          // Check if it has the required fields for our signature format
          return (
            typeof parsed === "object" &&
            parsed !== null &&
            typeof parsed.signature === "string" &&
            typeof parsed.timestamp === "string"
          );
        } catch (e) {
          // If it's not valid JSON, it might be the old format or invalid
          // For backward compatibility, we'll still accept strings
          return true;
        }
      },
      message: "Message signature must be properly formatted",
    },
  ],
  "set-session-key": [
    {
      field: "sessionKey",
      validate: (value: any) =>
        typeof value === "string" && value.length >= 32 && value.length <= 256,
      message: "Session key must be a string between 32 and 256 characters",
    },
  ],
  "leave-session": [],
  "end-session": [],
};

/**
 * Sanitize a string to prevent XSS attacks
 * @param input The input string to sanitize
 * @returns The sanitized string
 */
export function sanitizeString(input: string): string {
  if (typeof input !== "string") return "";

  // Basic sanitization - replace HTML special chars
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Validate event data against defined rules
 * @param event The event name
 * @param data The event data
 * @returns An object with validation result and error message
 */
export function validateEventData(
  event: string,
  data: any
): { valid: boolean; message?: string } {
  // Get validation rules for this event
  const rules = VALIDATION_RULES[event as keyof typeof VALIDATION_RULES];

  // If no rules defined for this event, consider it valid
  if (!rules || !Array.isArray(rules)) {
    return { valid: true };
  }

  // Check if data is an object
  if (!data || typeof data !== "object") {
    return { valid: false, message: "Invalid data format" };
  }

  // Validate each field according to its rules
  for (const rule of rules) {
    const value = data[rule.field];

    // Check if the field exists and passes validation
    if (value === undefined || !rule.validate(value)) {
      return { valid: false, message: rule.message };
    }
  }

  return { valid: true };
}

/**
 * Apply validation to a socket event
 * @param socket The socket instance
 * @param event The event name
 * @param handler The event handler
 */
export function applyValidation(
  socket: Socket,
  event: string,
  handler: (...args: any[]) => void
): void {
  socket.on(event, (...args: any[]) => {
    // Get the data object (usually the first argument)
    const data = args[0] || {};

    // Validate the data
    const validation = validateEventData(event, data);

    if (validation.valid) {
      // If valid, call the handler
      handler(...args);
    } else {
      // If invalid, emit an error
      socket.emit("error", {
        message: validation.message || "Invalid data",
      });
    }
  });
}

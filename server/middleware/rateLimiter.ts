import { Socket } from "socket.io";

interface RateLimitInfo {
  count: number;
  lastReset: number;
  blocked: boolean;
  blockUntil: number;
  violations: number; // Track number of violations for progressive penalties
  lastViolation: number; // Track time of last violation
  ipAddress?: string; // Store IP address for additional tracking
}

// Store rate limit information for each client
const rateLimits = new Map<string, RateLimitInfo>();

// Store IP-based rate limits to prevent abuse from multiple socket connections
const ipRateLimits = new Map<
  string,
  {
    count: number;
    lastReset: number;
    blocked: boolean;
    blockUntil: number;
    socketIds: Set<string>; // Track all socket IDs from this IP
  }
>();

// Rate limit configuration
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds
const MAX_REQUESTS_PER_WINDOW = 100; // Maximum requests per window
const MAX_REQUESTS_PER_WINDOW_IP = 300; // Maximum requests per window per IP

// Progressive blocking durations
const BLOCK_DURATION_INITIAL = 5 * 60 * 1000; // 5 minutes for first violation
const BLOCK_DURATION_SECOND = 15 * 60 * 1000; // 15 minutes for second violation
const BLOCK_DURATION_THIRD = 60 * 60 * 1000; // 1 hour for third violation
const BLOCK_DURATION_MAX = 24 * 60 * 60 * 1000; // 24 hours for subsequent violations

// Violation expiry - reset violation count after this time
const VIOLATION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if a client is rate limited
 * @param socketId The socket ID of the client
 * @param ipAddress Optional IP address of the client for additional tracking
 * @returns true if the client is allowed to make a request, false if rate limited
 */
export function checkRateLimit(socketId: string, ipAddress?: string): boolean {
  const now = Date.now();

  // Get or create rate limit info for this client
  let rateInfo = rateLimits.get(socketId);
  if (!rateInfo) {
    rateInfo = {
      count: 0,
      lastReset: now,
      blocked: false,
      blockUntil: 0,
      violations: 0,
      lastViolation: 0,
      ipAddress,
    };
    rateLimits.set(socketId, rateInfo);
  }

  // If IP address is provided, check IP-based rate limiting
  if (ipAddress) {
    // Update the stored IP address
    rateInfo.ipAddress = ipAddress;

    // Get or create IP rate limit info
    let ipRateInfo = ipRateLimits.get(ipAddress);
    if (!ipRateInfo) {
      ipRateInfo = {
        count: 0,
        lastReset: now,
        blocked: false,
        blockUntil: 0,
        socketIds: new Set([socketId]),
      };
      ipRateLimits.set(ipAddress, ipRateInfo);
    } else {
      // Add this socket ID to the set for this IP
      ipRateInfo.socketIds.add(socketId);
    }

    // Check if IP is blocked
    if (ipRateInfo.blocked) {
      if (now > ipRateInfo.blockUntil) {
        // Unblock the IP
        ipRateInfo.blocked = false;
        ipRateInfo.count = 1;
        ipRateInfo.lastReset = now;
      } else {
        // IP is blocked, so block this socket too
        rateInfo.blocked = true;
        rateInfo.blockUntil = ipRateInfo.blockUntil;
        return false;
      }
    }

    // Check if we need to reset the IP counter
    if (now - ipRateInfo.lastReset > RATE_LIMIT_WINDOW) {
      ipRateInfo.count = 1;
      ipRateInfo.lastReset = now;
    } else {
      // Increment the IP counter
      ipRateInfo.count++;

      // Check if the IP has exceeded the rate limit
      if (ipRateInfo.count > MAX_REQUESTS_PER_WINDOW_IP) {
        // Block the IP and all its sockets
        ipRateInfo.blocked = true;
        ipRateInfo.blockUntil = now + BLOCK_DURATION_INITIAL;

        // Block all sockets from this IP
        for (const id of ipRateInfo.socketIds) {
          const socketRateInfo = rateLimits.get(id);
          if (socketRateInfo) {
            socketRateInfo.blocked = true;
            socketRateInfo.blockUntil = ipRateInfo.blockUntil;
            socketRateInfo.violations++;
          }
        }

        return false;
      }
    }
  }

  // Check if socket is blocked
  if (rateInfo.blocked) {
    // Check if block duration has expired
    if (now > rateInfo.blockUntil) {
      // Unblock the client
      rateInfo.blocked = false;
      rateInfo.count = 1;
      rateInfo.lastReset = now;
      return true;
    }
    return false;
  }

  // Check if we need to reset the counter (new time window)
  if (now - rateInfo.lastReset > RATE_LIMIT_WINDOW) {
    rateInfo.count = 1;
    rateInfo.lastReset = now;
    return true;
  }

  // Increment the counter
  rateInfo.count++;

  // Check if the client has exceeded the rate limit
  if (rateInfo.count > MAX_REQUESTS_PER_WINDOW) {
    // Increment violations and update last violation time
    rateInfo.violations++;
    rateInfo.lastViolation = now;

    // Determine block duration based on violation count
    let blockDuration = BLOCK_DURATION_INITIAL;

    // Reset violations if it's been a long time since the last one
    if (
      rateInfo.violations > 1 &&
      now - rateInfo.lastViolation > VIOLATION_EXPIRY
    ) {
      rateInfo.violations = 1;
    }

    // Apply progressive penalties
    if (rateInfo.violations === 2) {
      blockDuration = BLOCK_DURATION_SECOND;
    } else if (rateInfo.violations === 3) {
      blockDuration = BLOCK_DURATION_THIRD;
    } else if (rateInfo.violations > 3) {
      blockDuration = BLOCK_DURATION_MAX;
    }

    // Block the client
    rateInfo.blocked = true;
    rateInfo.blockUntil = now + blockDuration;

    // If we have an IP address, update the IP rate limit info too
    if (rateInfo.ipAddress) {
      const ipRateInfo = ipRateLimits.get(rateInfo.ipAddress);
      if (ipRateInfo) {
        ipRateInfo.count += MAX_REQUESTS_PER_WINDOW_IP / 2; // Penalize the IP
      }
    }

    return false;
  }

  return true;
}

/**
 * Apply rate limiting to a socket event
 * @param socket The socket instance
 * @param event The event name
 * @param handler The event handler
 * @param customLimit Optional custom limit for this specific event
 */
export function applyRateLimit(
  socket: Socket,
  event: string,
  handler: (...args: any[]) => void,
  customLimit?: number
): void {
  socket.on(event, (...args: any[]) => {
    // Get IP address from handshake if available
    const ipAddress =
      socket.handshake?.address ||
      (socket.handshake?.headers?.["x-forwarded-for"] as string) ||
      undefined;

    if (checkRateLimit(socket.id, ipAddress)) {
      // Apply additional event-specific rate limiting if needed
      if (customLimit) {
        const eventKey = `${socket.id}:${event}`;
        const now = Date.now();
        const eventRateInfo = rateLimits.get(eventKey) || {
          count: 0,
          lastReset: now,
          blocked: false,
          blockUntil: 0,
          violations: 0,
          lastViolation: 0,
        };

        // Reset counter if needed
        if (now - eventRateInfo.lastReset > RATE_LIMIT_WINDOW) {
          eventRateInfo.count = 0;
          eventRateInfo.lastReset = now;
        }

        // Increment counter
        eventRateInfo.count++;

        // Check if exceeded custom limit
        if (eventRateInfo.count > customLimit) {
          socket.emit("error", {
            message: `Rate limit exceeded for ${event}. Please try again later.`,
          });
          return;
        }

        // Save event rate info
        rateLimits.set(eventKey, eventRateInfo);
      }

      // If passed all rate limits, call the handler
      handler(...args);
    } else {
      // Get the rate info to determine block duration
      const rateInfo = rateLimits.get(socket.id);
      let blockTimeRemaining = 0;

      if (rateInfo && rateInfo.blocked) {
        blockTimeRemaining = Math.ceil(
          (rateInfo.blockUntil - Date.now()) / 1000 / 60
        );
      }

      // Notify the client they are rate limited
      socket.emit("error", {
        message: `Rate limit exceeded. Please try again in ${
          blockTimeRemaining || 5
        } minutes.`,
      });
    }
  });
}

/**
 * Clean up rate limit data for a socket
 * @param socketId The socket ID to clean up
 */
export function cleanupRateLimit(socketId: string): void {
  // Get the rate limit info for this socket
  const rateInfo = rateLimits.get(socketId);

  // If we have an IP address, remove this socket from the IP's set
  if (rateInfo && rateInfo.ipAddress) {
    const ipRateInfo = ipRateLimits.get(rateInfo.ipAddress);
    if (ipRateInfo) {
      ipRateInfo.socketIds.delete(socketId);

      // If there are no more sockets from this IP, clean up the IP rate limit info
      if (ipRateInfo.socketIds.size === 0) {
        ipRateLimits.delete(rateInfo.ipAddress);
      }
    }
  }

  // Delete the socket rate limit info
  rateLimits.delete(socketId);
}

/**
 * Periodically clean up stale rate limit data
 */
export function startRateLimitCleanup(): void {
  setInterval(() => {
    const now = Date.now();

    // Clean up socket rate limits
    for (const [socketId, rateInfo] of rateLimits.entries()) {
      // Remove entries that haven't been used in a while and aren't blocked
      if (
        !rateInfo.blocked &&
        now - rateInfo.lastReset > RATE_LIMIT_WINDOW * 2
      ) {
        cleanupRateLimit(socketId);
      }
      // Remove expired blocks
      else if (rateInfo.blocked && now > rateInfo.blockUntil) {
        // Unblock but don't remove - this preserves violation history
        rateInfo.blocked = false;
      }
      // Reset violation count if it's been a long time since the last violation
      else if (
        rateInfo.violations > 0 &&
        now - rateInfo.lastViolation > VIOLATION_EXPIRY
      ) {
        rateInfo.violations = 0;
      }
    }

    // Clean up IP rate limits
    for (const [ip, ipRateInfo] of ipRateLimits.entries()) {
      // Remove entries that haven't been used in a while and aren't blocked
      if (
        !ipRateInfo.blocked &&
        now - ipRateInfo.lastReset > RATE_LIMIT_WINDOW * 2 &&
        ipRateInfo.socketIds.size === 0
      ) {
        ipRateLimits.delete(ip);
      }
      // Remove expired blocks
      else if (ipRateInfo.blocked && now > ipRateInfo.blockUntil) {
        ipRateInfo.blocked = false;
      }
    }
  }, RATE_LIMIT_WINDOW);
}

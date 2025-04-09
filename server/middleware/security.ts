import { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { Express } from "express";

/**
 * Apply security headers to the Express application
 * @param app The Express application
 */
export function applySecurityHeaders(app: Express): void {
  // Use Helmet for security headers with custom configuration
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", "ws:", "wss:"],
          imgSrc: ["'self'", "data:"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Unsafe-inline needed for some styling frameworks
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'none'"],
          frameSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          baseUri: ["'self'"],
          manifestSrc: ["'self'"],
          workerSrc: ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "same-origin" },
      dnsPrefetchControl: { allow: false },
      // expectCt has been deprecated in newer versions of helmet
      // Removed it as it's no longer supported
      frameguard: { action: "deny" },
      hsts: {
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true,
        preload: true,
      },
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: { permittedPolicies: "none" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      xssFilter: true,
    })
  );

  // Add additional custom security headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Permissions-Policy (replaces Feature-Policy)
    res.setHeader(
      "Permissions-Policy",
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()"
    );

    // Cache control - prevent caching of sensitive data
    res.setHeader("Cache-Control", "no-store, max-age=0");

    // Clear-Site-Data - useful for logout endpoints
    if (req.path === "/logout" || req.path === "/clear-session") {
      res.setHeader("Clear-Site-Data", '"cache", "cookies", "storage"');
    }

    // Prevent MIME type sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Prevent clickjacking
    res.setHeader("X-Frame-Options", "DENY");

    next();
  });
}

/**
 * Apply CORS protection with enhanced security
 * @param app The Express application
 * @param allowedOrigins Array of allowed origins
 */
export function applyCorsProtection(
  app: Express,
  allowedOrigins: string[] = ["*"]
): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    // Check if the origin is allowed
    if (
      origin &&
      (allowedOrigins.includes("*") || allowedOrigins.includes(origin))
    ) {
      // In production, never use wildcard for CORS
      if (
        process.env.NODE_ENV === "production" &&
        allowedOrigins.includes("*")
      ) {
        console.warn(
          "WARNING: Using wildcard CORS in production is not recommended"
        );
      }

      // Set the specific origin instead of wildcard
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
      // If origin is not allowed, set to null
      res.setHeader("Access-Control-Allow-Origin", "null");
    }

    // Set other CORS headers with more restrictive values
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    // Only allow necessary headers
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
    );

    // Allow credentials (cookies, authorization headers, etc.)
    res.setHeader("Access-Control-Allow-Credentials", "true");

    // Set max age for preflight requests (5 minutes)
    res.setHeader("Access-Control-Max-Age", "300");

    // Don't expose any headers to the client
    res.setHeader("Access-Control-Expose-Headers", "");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });
}

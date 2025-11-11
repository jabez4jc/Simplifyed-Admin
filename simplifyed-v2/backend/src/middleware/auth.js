/**
 * Authentication Middleware
 * Handles authentication using Passport (Google OAuth) with test mode support
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import session from 'express-session';
import db from '../core/database.js';
import { config } from '../core/config.js';
import { log } from '../core/logger.js';
import { UnauthorizedError, ForbiddenError } from '../core/errors.js';

/**
 * Configure session middleware
 */
export function configureSession() {
  // Use memory store for now (for production, use connect-sqlite3 or similar)
  return session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.env === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  });
}

/**
 * Configure Passport with Google OAuth strategy
 */
export function configurePassport() {
  // Only configure Google OAuth if credentials are provided
  if (config.auth.googleClientId && config.auth.googleClientSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: config.auth.googleClientId,
          clientSecret: config.auth.googleClientSecret,
          callbackURL: `${config.baseUrl}/auth/google/callback`,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails[0].value;

            // Check if user exists
            let user = await db.get('SELECT * FROM users WHERE email = ?', [
              email,
            ]);

            if (!user) {
              // Create new user
              const result = await db.run(
                'INSERT INTO users (email, is_admin) VALUES (?, ?)',
                [email, 0] // New users are not admin by default
              );

              user = await db.get('SELECT * FROM users WHERE id = ?', [
                result.lastID,
              ]);

              log.info('New user created', { email });
            }

            return done(null, user);
          } catch (error) {
            log.error('Authentication error', error);
            return done(error);
          }
        }
      )
    );

    passport.serializeUser((user, done) => {
      done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
      try {
        const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
        done(null, user);
      } catch (error) {
        done(error);
      }
    });

    log.info('Google OAuth authentication configured');
  } else {
    log.warn('Google OAuth credentials not found - running in test mode');
  }

  return passport.initialize();
}

/**
 * Middleware to require authentication
 * In test mode, creates a test user
 */
export function requireAuth(req, res, next) {
  // Test mode: Allow all requests with test user
  if (config.env === 'development' && !config.auth.googleClientId) {
    req.user = {
      id: 1,
      email: 'test@example.com',
      is_admin: 1,
    };
    return next();
  }

  if (req.isAuthenticated()) {
    return next();
  }

  throw new UnauthorizedError('Authentication required');
}

/**
 * Middleware to require admin access
 */
export function requireAdmin(req, res, next) {
  // Test mode: Allow all requests
  if (config.env === 'development' && !config.auth.googleClientId) {
    return next();
  }

  if (!req.isAuthenticated()) {
    throw new UnauthorizedError('Authentication required');
  }

  if (!req.user.is_admin) {
    throw new ForbiddenError('Admin access required');
  }

  next();
}

/**
 * Optional auth middleware
 * Attaches user if authenticated, but doesn't require it
 */
export function optionalAuth(req, res, next) {
  // Test mode: Add test user
  if (config.env === 'development' && !config.auth.googleClientId) {
    req.user = {
      id: 1,
      email: 'test@example.com',
      is_admin: 1,
    };
  }

  next();
}

export default {
  configureSession,
  configurePassport,
  requireAuth,
  requireAdmin,
  optionalAuth,
};

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import session from 'express-session';
import ConnectSqlite3 from 'connect-sqlite3';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

const SQLiteStore = ConnectSqlite3(session);

let cachedSessionSecret;

function getSessionSecret() {
  if (cachedSessionSecret) {
    return cachedSessionSecret;
  }

  const provided = process.env.SESSION_SECRET;
  if (provided && provided.length >= 32) {
    cachedSessionSecret = provided;
    return cachedSessionSecret;
  }

  cachedSessionSecret = crypto.randomBytes(64).toString('hex');
  console.warn('⚠️  SESSION_SECRET not set or too short. Generated a temporary secret for this runtime.');
  return cachedSessionSecret;
}

// Load Google OAuth credentials
function loadGoogleCredentials(basePath) {
  const credPath = join(basePath, 'client_secret_SimplifyedAdmin.apps.googleusercontent.com.json');
  
  if (!existsSync(credPath)) {
    throw new Error(`Google credentials not found at: ${credPath}`);
  }
  
  const credentialsJson = readFileSync(credPath, 'utf8');
  const credentials = JSON.parse(credentialsJson);
  return credentials.web;
}

// Get callback URL based on environment
function getCallbackURL() {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';
  return `${baseURL}/auth/google/callback`;
}

// Configure authentication
export function configureAuth(app, basePath, dbAsync) {
  // Load Google credentials
  let googleCredentials;
  try {
    googleCredentials = loadGoogleCredentials(basePath);
    console.log('✅ Google OAuth credentials loaded successfully');
  } catch (error) {
    console.error('❌ Failed to load Google credentials:', error.message);
    process.exit(1);
  }

  // Session configuration
  const secureCookie = process.env.NODE_ENV === 'production';

  app.use(session({
    store: new SQLiteStore({
      db: 'sessions.db',
      dir: join(basePath, 'database')
    }),
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: secureCookie,
      httpOnly: true,
      sameSite: secureCookie ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  }));

  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Passport Google OAuth Strategy
  passport.use(new GoogleStrategy({
    clientID: googleCredentials.client_id,
    clientSecret: googleCredentials.client_secret,
    callbackURL: getCallbackURL()
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const userEmail = profile.emails[0].value.toLowerCase();
      const user = {
        id: profile.id,
        email: userEmail,
        emails: profile.emails,
        name: profile.displayName,
        picture: profile.photos[0].value,
        provider: 'google'
      };
      
      // Check if this is the first user (make them admin)
      const userCount = await dbAsync.get('SELECT COUNT(*) as count FROM users');
      
      if (userCount.count === 0) {
        // First user - make them admin
        await dbAsync.run('INSERT INTO users (email, is_admin) VALUES (?, 1)', [userEmail]);
        console.log(`✅ First user registered as admin: ${user.name} (${userEmail})`);
        return done(null, user);
      }
      
      // Check if user is in whitelist
      const authorizedUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', [userEmail]);
      
      if (!authorizedUser) {
        console.log(`❌ Unauthorized user attempt: ${user.name} (${userEmail})`);
        return done(null, false, { message: 'User not authorized. Please contact support@simplifyed.in to request access.' });
      }
      
      console.log(`✅ User authenticated: ${user.name} (${userEmail})`);
      return done(null, user);
    } catch (error) {
      console.error('❌ Authentication error:', error);
      return done(error, null);
    }
  }));

  // Serialize/Deserialize user
  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user);
  });
}

// Setup authentication routes
export function setupAuthRoutes(app) {
  // Google OAuth routes
  app.get('/auth/google',
    passport.authenticate('google', { 
      scope: ['profile', 'email'],
      prompt: 'select_account'
    })
  );

  app.get('/auth/google/callback',
    passport.authenticate('google', { 
      failureRedirect: '/auth/unauthorized',
      failureFlash: false 
    }),
    (req, res) => {
      console.log(`🔐 User ${req.user.name} logged in successfully`);
      // Redirect to frontend
      res.redirect(process.env.FRONTEND_URL || 'http://localhost:8080');
    }
  );

  // Unauthorized access route
  app.get('/auth/unauthorized', (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Access Denied - Simplifyed</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; background: #0f172a; color: #e2e8f0; }
          .container { max-width: 500px; margin: 100px auto; text-align: center; background: #1e293b; padding: 40px; border-radius: 16px; border: 1px solid #334155; }
          .icon { font-size: 64px; margin-bottom: 20px; }
          h1 { color: #f1f5f9; margin-bottom: 16px; }
          p { color: #94a3b8; margin-bottom: 24px; line-height: 1.6; }
          .email { background: #374151; padding: 8px 16px; border-radius: 8px; font-weight: 600; color: #60a5fa; margin: 16px 0; }
          a { color: #3b82f6; text-decoration: none; font-weight: 600; }
          a:hover { text-decoration: underline; }
          .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 16px; }
          .btn:hover { background: #2563eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">🚫</div>
          <h1>Access Denied</h1>
          <p>Your email address is not authorized to access the Simplifyed Trading Dashboard.</p>
          <div class="email">support@simplifyed.in</div>
          <p>Please contact the email address above to request access to the application.</p>
          <a href="${frontendUrl}" class="btn">Return to Login</a>
        </div>
      </body>
      </html>
    `);
  });

  // Login page route
  app.get('/login', (req, res) => {
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000');
  });

  // Logout route
  app.get('/auth/logout', (req, res) => {
    const userName = req.user?.name || 'User';
    req.logout((err) => {
      if (err) {
        console.error('❌ Logout error:', err);
      } else {
        console.log(`👋 User ${userName} logged out`);
      }
      req.session.destroy(() => {
        res.redirect(process.env.FRONTEND_URL || 'http://localhost:8080');
      });
    });
  });
}

// Authentication middleware
export function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

console.log('✅ Authentication module loaded successfully');

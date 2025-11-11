/**
 * API Versioning Middleware
 *
 * Supports multiple API versions with graceful deprecation.
 * Routes can be mounted under /api/v1, /api/v2, etc.
 */

/**
 * API version configuration
 */
export const API_VERSIONS = {
  v1: {
    version: '1.0.0',
    deprecated: false,
    deprecationDate: null,
    sunsetDate: null
  },
  // Future versions can be added here
  // v2: {
  //   version: '2.0.0',
  //   deprecated: false,
  //   deprecationDate: null,
  //   sunsetDate: null
  // }
};

/**
 * Get current API version from request
 *
 * Checks multiple sources in order:
 * 1. URL path (/api/v1/...)
 * 2. Accept-Version header
 * 3. Query parameter (?version=v1)
 * 4. Default to v1
 */
export function getApiVersion(req) {
  // Check URL path
  const pathMatch = req.path.match(/^\/api\/(v\d+)\//);
  if (pathMatch) {
    return pathMatch[1];
  }

  // Check Accept-Version header
  const headerVersion = req.get('Accept-Version');
  if (headerVersion && API_VERSIONS[headerVersion]) {
    return headerVersion;
  }

  // Check query parameter
  const queryVersion = req.query.version;
  if (queryVersion && API_VERSIONS[queryVersion]) {
    return queryVersion;
  }

  // Default to v1
  return 'v1';
}

/**
 * Add version information to response headers
 */
export function addVersionHeaders(req, res, next) {
  const version = getApiVersion(req);
  const versionInfo = API_VERSIONS[version];

  if (!versionInfo) {
    return res.status(400).json({
      error: {
        message: `Unsupported API version: ${version}`,
        type: 'VersionError',
        statusCode: 400,
        supportedVersions: Object.keys(API_VERSIONS)
      }
    });
  }

  // Add version headers
  res.set('API-Version', version);
  res.set('API-Version-Number', versionInfo.version);

  // Add deprecation warning if applicable
  if (versionInfo.deprecated) {
    res.set('Warning', `299 - "API version ${version} is deprecated"`);

    if (versionInfo.deprecationDate) {
      res.set('Deprecation', versionInfo.deprecationDate);
    }

    if (versionInfo.sunsetDate) {
      res.set('Sunset', versionInfo.sunsetDate);
    }
  }

  // Store version in request for route handlers
  req.apiVersion = version;

  next();
}

/**
 * Require specific API version
 *
 * Usage:
 *   app.get('/route', requireVersion('v1'), handler)
 */
export function requireVersion(requiredVersion) {
  return (req, res, next) => {
    const currentVersion = getApiVersion(req);

    if (currentVersion !== requiredVersion) {
      return res.status(400).json({
        error: {
          message: `This endpoint requires API version ${requiredVersion}`,
          type: 'VersionError',
          statusCode: 400,
          currentVersion,
          requiredVersion
        }
      });
    }

    next();
  };
}

/**
 * Deprecation warning middleware
 *
 * Logs when deprecated endpoints are accessed
 */
export function deprecationWarning(message, sunsetDate = null) {
  return (req, res, next) => {
    console.warn(`⚠️  Deprecated endpoint accessed: ${req.method} ${req.path}`);
    console.warn(`   Message: ${message}`);
    console.warn(`   User: ${req.user?.email || 'anonymous'}`);

    if (sunsetDate) {
      res.set('Sunset', sunsetDate);
      console.warn(`   Sunset date: ${sunsetDate}`);
    }

    res.set('Warning', `299 - "${message}"`);

    next();
  };
}

/**
 * Create versioned router
 *
 * Wraps Express router with version-specific middleware
 *
 * Usage:
 *   import express from 'express';
 *   const router = createVersionedRouter(express, 'v1');
 *   router.get('/instances', handler);
 *   app.use('/api/v1', router);
 */
export function createVersionedRouter(express, version) {
  const router = express.Router();

  // Add version to all routes
  router.use((req, res, next) => {
    req.apiVersion = version;
    next();
  });

  return router;
}

export default {
  API_VERSIONS,
  getApiVersion,
  addVersionHeaders,
  requireVersion,
  deprecationWarning,
  createVersionedRouter
};

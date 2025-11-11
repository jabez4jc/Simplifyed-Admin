/**
 * Rate Limiter
 * Token bucket algorithm for API rate limiting per instance
 * Phase 4: Order Placement & Rate Limiting
 */

class RateLimiter {
  constructor(maxTokens, refillRate, name = 'default') {
    this.maxTokens = maxTokens;           // Maximum tokens in bucket
    this.tokens = maxTokens;               // Current available tokens
    this.refillRate = refillRate;         // Tokens added per second
    this.lastRefill = Date.now();
    this.name = name;
    this.waitQueue = [];
  }

  /**
   * Refill tokens based on time elapsed
   */
  refill() {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // Convert to seconds
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Try to acquire a token immediately
   * Returns true if successful, false if no tokens available
   */
  tryAcquire() {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Acquire a token, waiting if necessary
   * Returns Promise that resolves when token is acquired
   */
  async acquireToken() {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return {
        acquired: true,
        waitTime: 0,
        tokensRemaining: this.tokens
      };
    }

    // Calculate wait time until next token available
    const tokensNeeded = 1 - this.tokens;
    const waitTime = (tokensNeeded / this.refillRate) * 1000; // Convert to ms

    // Wait for the calculated time
    await new Promise(resolve => setTimeout(resolve, waitTime));

    // Refill and try again
    this.refill();
    this.tokens -= 1;

    return {
      acquired: true,
      waitTime: Math.ceil(waitTime),
      tokensRemaining: this.tokens
    };
  }

  /**
   * Get current state
   */
  getState() {
    this.refill();

    return {
      name: this.name,
      tokens: this.tokens,
      maxTokens: this.maxTokens,
      refillRate: this.refillRate,
      utilizationPercent: ((this.maxTokens - this.tokens) / this.maxTokens * 100).toFixed(2)
    };
  }

  /**
   * Reset limiter to full tokens
   */
  reset() {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}

/**
 * Rate Limiter Manager
 * Manages rate limiters for multiple instances and endpoint types
 */
class RateLimiterManager {
  constructor(dbAsync) {
    this.dbAsync = dbAsync;
    this.limiters = new Map();

    // Default rate limits (from OpenAlgo documentation)
    this.defaultLimits = {
      order_api: { maxTokens: 10, refillRate: 10 },      // 10 req/sec
      smart_order: { maxTokens: 2, refillRate: 2 },      // 2 req/sec
      general_api: { maxTokens: 50, refillRate: 50 }     // 50 req/sec
    };
  }

  /**
   * Get or create rate limiter for instance and endpoint type
   */
  getLimiter(instanceId, endpointType = 'order_api') {
    const key = `${instanceId}:${endpointType}`;

    if (!this.limiters.has(key)) {
      const config = this.defaultLimits[endpointType] || this.defaultLimits.order_api;

      this.limiters.set(key, new RateLimiter(
        config.maxTokens,
        config.refillRate,
        `Instance${instanceId}-${endpointType}`
      ));
    }

    return this.limiters.get(key);
  }

  /**
   * Acquire token for instance and endpoint
   */
  async acquireToken(instanceId, endpointType = 'order_api') {
    const limiter = this.getLimiter(instanceId, endpointType);
    const result = await limiter.acquireToken();

    // Log rate limit acquisition
    if (this.dbAsync) {
      try {
        await this.logRateLimit(instanceId, endpointType, result);
      } catch (error) {
        console.error('[RateLimiter] Failed to log rate limit:', error.message);
      }
    }

    return result;
  }

  /**
   * Try to acquire token without waiting
   */
  tryAcquireToken(instanceId, endpointType = 'order_api') {
    const limiter = this.getLimiter(instanceId, endpointType);
    const acquired = limiter.tryAcquire();

    if (acquired && this.dbAsync) {
      this.logRateLimit(instanceId, endpointType, {
        acquired: true,
        waitTime: 0,
        tokensRemaining: limiter.tokens
      }).catch(err => {
        console.error('[RateLimiter] Failed to log rate limit:', err.message);
      });
    }

    return acquired;
  }

  /**
   * Get state of all limiters
   */
  getAllStates() {
    const states = {};

    for (const [key, limiter] of this.limiters.entries()) {
      states[key] = limiter.getState();
    }

    return states;
  }

  /**
   * Get state for specific instance
   */
  getInstanceState(instanceId) {
    const states = {};

    for (const [key, limiter] of this.limiters.entries()) {
      if (key.startsWith(`${instanceId}:`)) {
        const endpointType = key.split(':')[1];
        states[endpointType] = limiter.getState();
      }
    }

    return states;
  }

  /**
   * Reset all limiters
   */
  resetAll() {
    for (const limiter of this.limiters.values()) {
      limiter.reset();
    }
  }

  /**
   * Reset limiter for specific instance
   */
  resetInstance(instanceId) {
    for (const [key, limiter] of this.limiters.entries()) {
      if (key.startsWith(`${instanceId}:`)) {
        limiter.reset();
      }
    }
  }

  /**
   * Log rate limit event to database
   */
  async logRateLimit(instanceId, endpointType, result) {
    if (!this.dbAsync) return;

    try {
      await this.dbAsync.run(`
        INSERT INTO rate_limit_log (
          instance_id,
          endpoint,
          tokens_available,
          wait_time_ms,
          created_at
        ) VALUES (?, ?, ?, ?, datetime('now'))
      `, [
        instanceId,
        endpointType,
        result.tokensRemaining,
        result.waitTime || 0
      ]);
    } catch (error) {
      // Silently fail logging to not impact order flow
      console.error('[RateLimiter] Log error:', error.message);
    }
  }

  /**
   * Get rate limit statistics
   */
  async getRateLimitStats(instanceId, hours = 24) {
    if (!this.dbAsync) return null;

    const stats = await this.dbAsync.all(`
      SELECT
        endpoint,
        COUNT(*) as total_requests,
        AVG(wait_time_ms) as avg_wait_time,
        MAX(wait_time_ms) as max_wait_time,
        MIN(tokens_available) as min_tokens_available
      FROM rate_limit_log
      WHERE
        instance_id = ?
        AND created_at >= datetime('now', '-' || ? || ' hours')
      GROUP BY endpoint
      ORDER BY total_requests DESC
    `, [instanceId, hours]);

    return stats;
  }

  /**
   * Check if instance is experiencing rate limiting
   */
  async isRateLimited(instanceId, endpointType) {
    const limiter = this.getLimiter(instanceId, endpointType);
    limiter.refill();

    return limiter.tokens < 1;
  }

  /**
   * Get estimated wait time for token
   */
  getEstimatedWaitTime(instanceId, endpointType) {
    const limiter = this.getLimiter(instanceId, endpointType);
    limiter.refill();

    if (limiter.tokens >= 1) {
      return 0;
    }

    const tokensNeeded = 1 - limiter.tokens;
    return Math.ceil((tokensNeeded / limiter.refillRate) * 1000);
  }

  /**
   * Clean old rate limit logs
   */
  async cleanOldLogs(daysToKeep = 7) {
    if (!this.dbAsync) return;

    const result = await this.dbAsync.run(`
      DELETE FROM rate_limit_log
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `, [daysToKeep]);

    console.log(`[RateLimiter] Cleaned ${result.changes} old rate limit logs`);
    return result.changes;
  }
}

export { RateLimiter, RateLimiterManager };
export default RateLimiterManager;

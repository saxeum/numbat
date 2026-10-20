# Production Readiness Assessment & Recommendations

**Project**: numbat  
**Date**: 2025  
**Status**: Good architectural foundation, needs production hardening

---

## Executive Summary

**Verdict: NOT production-ready yet, but excellent foundation.**

The project has:
- ✅ Solid architecture and documentation
- ✅ Modern tech stack (TypeScript, Cloudflare Workers, React)
- ✅ Proper CI/CD with tests
- ✅ Monorepo structure with shared types

However, it's missing critical production requirements:
- ❌ Error handling and observability
- ❌ Security headers and rate limiting
- ❌ Input validation
- ❌ Error boundaries in React
- ❌ Environment configuration management

**Estimated work to production-ready: 2-3 days** (assuming D1 not yet needed)

---

## Critical Fixes Required (MUST HAVE)

### 1. API Error Handling & Middleware ⚠️ CRITICAL

**Current State**: No error handling, logging, or request tracking

**Required Implementation**:

```typescript
// apps/worker/src/middleware/error-handler.ts
import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorHandler = (err: Error, c: Context) => {
  const requestId = c.get('requestId');
  
  console.error({
    requestId,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
    path: c.req.path,
    method: c.req.method,
  });

  if (err instanceof AppError) {
    return c.json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      }
    }, err.statusCode);
  }

  if (err instanceof HTTPException) {
    return c.json({
      error: {
        code: 'HTTP_ERROR',
        message: err.message,
        requestId,
      }
    }, err.status);
  }

  // Unknown error - don't leak details
  return c.json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    }
  }, 500);
};

// apps/worker/src/middleware/request-id.ts
export const requestId = () => {
  return async (c: Context, next: () => Promise<void>) => {
    const id = crypto.randomUUID();
    c.set('requestId', id);
    c.res.headers.set('X-Request-ID', id);
    await next();
  };
};

// apps/worker/src/middleware/logger.ts
export const logger = () => {
  return async (c: Context, next: () => Promise<void>) => {
    const start = Date.now();
    const requestId = c.get('requestId');
    
    console.log({
      type: 'request',
      requestId,
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header('user-agent'),
    });

    await next();

    console.log({
      type: 'response',
      requestId,
      status: c.res.status,
      duration: Date.now() - start,
    });
  };
};

// apps/worker/src/index.ts
import { Hono } from 'hono';
import { health } from './api/routes/health';
import { errorHandler } from './middleware/error-handler';
import { requestId } from './middleware/request-id';
import { logger } from './middleware/logger';

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', requestId());
app.use('*', logger());

const api = new Hono<{ Bindings: Env }>();
api.route('/health', health);

app.route('/api', api);

// Error handling - must be last
app.onError(errorHandler);

export default app;
```

**Priority**: P0 - Block deployment without this

---

### 2. Frontend Error Handling ⚠️ CRITICAL

**Current State**: No error boundaries, crashes propagate up

**Required Implementation**:

```typescript
// apps/web/src/components/error-boundary.tsx
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    // TODO: Send to error tracking service (Sentry, etc.)
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }

      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold text-destructive mb-4">
              Something went wrong
            </h1>
            <p className="text-muted-foreground mb-6">
              {this.state.error.message}
            </p>
            <button
              onClick={this.reset}
              className="px-4 py-2 bg-primary text-primary-foreground rounded"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// apps/web/src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // Add global error handling
      throwOnError: false,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Log mutation errors
      onError: (error) => {
        console.error('Mutation error:', error);
        // TODO: Send to error tracking
      },
    },
  },
});

// apps/web/src/main.tsx
import { ErrorBoundary } from '@/components/error-boundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </ErrorBoundary>
  </StrictMode>,
);
```

**Priority**: P0 - Block deployment without this

---

### 3. Security Headers ⚠️ HIGH

**Current State**: No security headers configured

**Required Implementation**:

```typescript
// apps/worker/src/middleware/security.ts
export const securityHeaders = () => {
  return async (c: Context, next: () => Promise<void>) => {
    await next();
    
    // Security headers
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('X-Frame-Options', 'DENY');
    c.res.headers.set('X-XSS-Protection', '1; mode=block');
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // HSTS (if using HTTPS, which Cloudflare does)
    c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    // CSP - adjust based on your needs
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // Will need refinement
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
    ].join('; ');
    c.res.headers.set('Content-Security-Policy', csp);
  };
};

// Add to apps/worker/src/index.ts
import { securityHeaders } from './middleware/security';
app.use('*', securityHeaders());
```

**For the web Worker**, add similar headers in `wrangler.jsonc`:

```jsonc
{
  // ... existing config
  "routes": [{ "pattern": "foonix.net", "custom_domain": true }],
  "observability": { "enabled": true },
  // Add custom headers
  "rules": [
    {
      "action": "set_headers",
      "headers": {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
      }
    }
  ]
}
```

**Priority**: P0 - Required for production

---

### 4. Input Validation ⚠️ HIGH

**Current State**: No validation despite using `@hono/zod-openapi`

**Required Implementation**:

```typescript
// packages/shared/src/health.ts
import { z } from 'zod';

export const HealthResponse = z.object({ 
  ok: z.boolean(),
  timestamp: z.string().optional(),
  version: z.string().optional(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

// Example for a CRUD endpoint
export const CreateItemRequest = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  quantity: z.number().int().positive().optional(),
});
export type CreateItemRequest = z.infer<typeof CreateItemRequest>;

export const ItemResponse = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  quantity: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ItemResponse = z.infer<typeof ItemResponse>;

// apps/worker/src/api/routes/items.ts (example)
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { CreateItemRequest, ItemResponse } from '@numbat/shared';

export const items = new Hono<{ Bindings: Env }>();

items.post(
  '/',
  zValidator('json', CreateItemRequest),
  async (c) => {
    const data = c.req.valid('json');
    
    // Validation is automatic - request will never reach here with invalid data
    // The zValidator middleware returns 400 with error details
    
    // Your business logic here
    const item = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    return c.json(item satisfies ItemResponse, 201);
  }
);
```

**Priority**: P1 - Required before adding any user input

---

### 5. Environment Configuration ⚠️ HIGH

**Current State**: No environment variable management

**Required Implementation**:

```typescript
// apps/worker/worker-configuration.d.ts
interface Env {
  // Environment
  ENVIRONMENT: 'development' | 'staging' | 'production';
  
  // Future bindings
  DB?: D1Database;
  KV?: KVNamespace;
  
  // Secrets (set via wrangler secret put)
  // API_SECRET_KEY?: string;
}

// apps/worker/src/config.ts
import { z } from 'zod';

const EnvSchema = z.object({
  ENVIRONMENT: z.enum(['development', 'staging', 'production']),
  // Add other env vars as needed
});

export function validateEnv(env: Env) {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    console.error('Environment validation failed:', result.error);
    throw new Error('Invalid environment configuration');
  }
  return result.data;
}

// Use in apps/worker/src/index.ts
app.use('*', async (c, next) => {
  validateEnv(c.env); // Validates on first request
  await next();
});

// Create .env.example files
// apps/worker/.dev.vars.example
ENVIRONMENT=development

// apps/web/.env.example
VITE_API_BASE_URL=/api
```

**Priority**: P1 - Required before adding any configuration

---

## Important Enhancements (SHOULD HAVE)

### 6. Rate Limiting

```typescript
// apps/worker/src/middleware/rate-limit.ts
import { Context } from 'hono';

export const rateLimit = (options: {
  windowMs: number;
  max: number;
}) => {
  // Use KV or Durable Objects for distributed rate limiting
  // For now, per-worker memory (resets on deployment)
  const requests = new Map<string, number[]>();
  
  return async (c: Context, next: () => Promise<void>) => {
    const key = c.req.header('cf-connecting-ip') || 'unknown';
    const now = Date.now();
    const windowStart = now - options.windowMs;
    
    const userRequests = requests.get(key) || [];
    const recentRequests = userRequests.filter(time => time > windowStart);
    
    if (recentRequests.length >= options.max) {
      return c.json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          requestId: c.get('requestId'),
        }
      }, 429);
    }
    
    recentRequests.push(now);
    requests.set(key, recentRequests);
    
    await next();
  };
};

// Usage
api.use('*', rateLimit({ windowMs: 60_000, max: 100 }));
```

**Priority**: P1 - Required for public API

---

### 7. Request/Response Logging

```typescript
// Enhance logger middleware with more details
export const logger = () => {
  return async (c: Context, next: () => Promise<void>) => {
    const start = Date.now();
    const requestId = c.get('requestId');
    
    // Request log with more context
    console.log(JSON.stringify({
      level: 'info',
      type: 'request',
      requestId,
      timestamp: new Date().toISOString(),
      method: c.req.method,
      path: c.req.path,
      ip: c.req.header('cf-connecting-ip'),
      userAgent: c.req.header('user-agent'),
      referer: c.req.header('referer'),
    }));

    await next();

    // Response log
    console.log(JSON.stringify({
      level: c.res.status >= 500 ? 'error' : c.res.status >= 400 ? 'warn' : 'info',
      type: 'response',
      requestId,
      timestamp: new Date().toISOString(),
      status: c.res.status,
      duration: Date.now() - start,
    }));
  };
};
```

---

### 8. Health Check Enhancement

```typescript
// apps/worker/src/api/routes/health.ts
import type { HealthResponse } from '@numbat/shared';
import { Hono } from 'hono';

export const health = new Hono<{ Bindings: Env }>();

health.get('/', async (c) => {
  const checks: HealthResponse = {
    ok: true,
    timestamp: new Date().toISOString(),
    version: '0.1.0', // From package.json or env
  };

  // When D1 is added:
  // try {
  //   await c.env.DB.prepare('SELECT 1').first();
  //   checks.database = 'healthy';
  // } catch (err) {
  //   checks.ok = false;
  //   checks.database = 'unhealthy';
  // }

  return c.json(checks, checks.ok ? 200 : 503);
});
```

---

### 9. Monitoring & Observability Integration

```typescript
// apps/worker/src/middleware/analytics.ts
export const analytics = () => {
  return async (c: Context, next: () => Promise<void>) => {
    const start = Date.now();
    
    await next();
    
    // Cloudflare Analytics Engine (when configured)
    // c.env.ANALYTICS?.writeDataPoint({
    //   blobs: [c.req.path, c.req.method],
    //   doubles: [Date.now() - start],
    //   indexes: [c.res.status.toString()],
    // });
  };
};
```

**Consider adding**:
- Sentry for error tracking
- Cloudflare Analytics Engine for custom metrics
- Grafana/Prometheus if needed

---

## Nice to Have (COULD HAVE)

### 10. OpenAPI Documentation

```typescript
// Already have @hono/zod-openapi, now use it:
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

const app = new OpenAPIHono<{ Bindings: Env }>();

const route = createRoute({
  method: 'get',
  path: '/health',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: HealthResponse,
        },
      },
      description: 'Service health status',
    },
  },
});

app.openapi(route, (c) => {
  return c.json({ ok: true }, 200);
});

// Serve OpenAPI spec
app.doc('/api/openapi.json', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Numbat API',
  },
});
```

---

### 11. Better CI/CD

**Add to `.github/workflows/ci.yml`**:

```yaml
- name: Security audit
  run: npm audit --production

- name: Check for outdated dependencies
  run: npm outdated || true

# For deployment, add health check
- name: Deploy web
  id: deploy-web
  uses: cloudflare/wrangler-action@v3
  # ... existing config

- name: Health check after deployment
  run: |
    sleep 5
    curl --fail https://foonix.net/api/health || exit 1
```

---

### 12. Database Preparation (When Adding D1)

```typescript
// packages/shared/src/schema.ts (Drizzle schema)
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  quantity: integer('quantity').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// apps/worker/wrangler.jsonc
{
  // Add D1 binding
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "numbat-db",
      "database_id": "<your-d1-id>"
    }
  ]
}

// Migration: wrangler d1 migrations create numbat-db initial_schema
```

---

## Testing Enhancements

### Add API Integration Tests

```typescript
// apps/worker/test/items.test.ts (example for future CRUD)
import { SELF } from 'cloudflare:test';
import { describe, expect, it, beforeEach } from 'vitest';

describe('POST /api/items', () => {
  it('creates an item with valid data', async () => {
    const res = await SELF.fetch('https://foonix.net/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Item', quantity: 5 }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toHaveProperty('id');
    expect(data.name).toBe('Test Item');
  });

  it('rejects invalid data', async () => {
    const res = await SELF.fetch('https://foonix.net/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }), // Invalid
    });

    expect(res.status).toBe(400);
  });
});
```

---

## Deployment Checklist

Before going to production:

- [ ] All critical fixes implemented (P0)
- [ ] Error handling in place (API + frontend)
- [ ] Security headers configured
- [ ] Input validation on all endpoints
- [ ] Environment variables documented and validated
- [ ] Rate limiting configured
- [ ] Health check endpoint enhanced
- [ ] Error tracking service integrated (Sentry)
- [ ] Monitoring/alerting configured
- [ ] Load testing performed
- [ ] Security audit completed (`npm audit`)
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Incident response plan documented
- [ ] Rollback procedure tested

---

## Summary Recommendations

### Immediate (Before ANY Production Use)
1. ✅ Implement error handling middleware
2. ✅ Add React error boundaries
3. ✅ Configure security headers
4. ✅ Add input validation with Zod
5. ✅ Environment variable management

### Before Public Launch
6. ✅ Rate limiting
7. ✅ Enhanced logging & monitoring
8. ✅ Error tracking (Sentry)
9. ✅ Load testing
10. ✅ Security audit

### Post-Launch Priorities
11. OpenAPI documentation
12. D1 + Drizzle setup
13. Authentication implementation
14. Advanced monitoring & alerts

---

## Overall Assessment

**Strengths:**
- Excellent architectural decisions
- Modern, maintainable tech stack
- Good CI/CD foundation
- Comprehensive documentation

**Weaknesses:**
- Missing critical production middleware
- No error handling strategy
- No observability
- Security headers not configured

**Verdict:** With the critical fixes above (estimated 2-3 days of work), this would be a solid production system. The foundation is strong, but it needs the production hardening typical of any new system.

**Recommended next steps:**
1. Implement all P0 items (error handling, security)
2. Add monitoring/alerting
3. Perform load testing
4. Add D1 when needed
5. Implement auth before user-specific features

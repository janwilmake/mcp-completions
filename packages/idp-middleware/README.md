# IDP Middleware

Universal OAuth 2.1 identity provider middleware for Cloudflare Workers with Durable Objects. Provides RFC-compliant authentication management for any OAuth2-protected resource.

## Features

- **OAuth 2.1 Compliant**: Full implementation of OAuth 2.1 authorization flow
- **Protected Resource Metadata Discovery**: Automatic discovery via RFC 9728
- **Authorization Server Discovery**: Supports both OAuth 2.0 and OpenID Connect discovery
- **Client ID Metadata Documents**: Preferred registration method using HTTPS URLs as client identifiers
- **Dynamic Client Registration**: Fallback support for RFC 7591 dynamic registration
- **PKCE Required**: Enforces S256 code challenge method for security
- **Resource Indicators**: RFC 8807 support for explicit token audience binding
- **Token Management**: Handles access token storage, refresh, and expiration
- **Path-Based Matching**: Find the most specific provider for any URL
- **Multi-Resource**: Store and manage auth for multiple protected resources per user
- **Metadata Support**: Attach custom metadata to each provider

## Installation

```bash
npm install idp-middleware
```

## Quick Start

```typescript
import {
  createIdpMiddleware,
  OAuthProviders,
  IdpMiddlewareEnv,
} from "idp-middleware";

export { OAuthProviders };

export default {
  fetch: async (
    request: Request,
    env: IdpMiddlewareEnv,
    ctx: ExecutionContext,
  ) => {
    const idpHandler = createIdpMiddleware(
      {
        userId: "user-123",
        baseUrl: new URL(request.url).origin,
        clientInfo: {
          name: "My App",
          version: "1.0.0",
          uri: "https://myapp.com",
          logo_uri: "https://myapp.com/logo.png",
        },
      },
      env,
    );

    // Handle OAuth callbacks
    const oauthResponse = await idpHandler?.middleware(request, env, ctx);
    if (oauthResponse) return oauthResponse;

    // Your application logic here
    return new Response("Hello World");
  },
};
```

## Wrangler Configuration

```jsonc
{
  "durable_objects": {
    "bindings": [{ "name": "OAuthProviders", "class_name": "OAuthProviders" }],
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["OAuthProviders"] }],
}
```

## Client ID Metadata Document Setup

For CIMD support, host a metadata document at your application's domain:

```json
{
  "client_id": "https://myapp.com/oauth/client-metadata.json",
  "client_name": "My App",
  "client_uri": "https://myapp.com",
  "logo_uri": "https://myapp.com/logo.png",
  "redirect_uris": [
    "http://127.0.0.1:3000/oauth/callback/example.com",
    "http://localhost:3000/oauth/callback/example.com"
  ],
  "grant_types": ["authorization_code"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

## Usage

### Initialize Handler

```typescript
const idpHandler = createIdpMiddleware(
  {
    userId: "user-123",
    baseUrl: "https://your-app.com",
    clientInfo: {
      name: "My App",
      version: "1.0.0",
      uri: "https://your-app.com",
      logo_uri: "https://your-app.com/logo.png",
    },
    pathPrefix: "/oauth", // Optional, defaults to "/oauth"

    // Optional: Extract metadata after successful auth
    onAuthSuccess: async (resourceUrl: string, accessToken: string) => {
      return {
        name: "Custom Name",
        metadata: { foo: "bar" },
      };
    },
  },
  env,
);
```

### Get Authorization Header with Auto-Refresh

```typescript
// Get auth for a specific URL (finds most specific matching provider)
// Automatically refreshes tokens if expiring within 5 minutes
const result = await getAuthorizationForUrl(
  env,
  "user-123",
  "https://api.example.com/users/me",
  {
    clientInfo: {
      name: "My App",
      uri: "https://myapp.com",
    },
    baseUrl: "https://myapp.com",
  },
);

if (result.Authorization) {
  // Use the Authorization header
  const response = await fetch("https://api.example.com/users/me", {
    headers: { Authorization: result.Authorization },
  });
} else if (result.loginUrl) {
  // Redirect user to login
  return Response.redirect(result.loginUrl, 302);
}
```

### List Providers

```typescript
const providers = await idpHandler.getProviders();

for (const provider of providers) {
  console.log({
    url: provider.resource_url,
    name: provider.name,
    hasAuth: !!provider.access_token,
    isPublic: provider.public === 1,
    metadata: provider.metadata,
    reauthorizeUrl: provider.reauthorizeUrl,
  });
}
```

### Refresh Tokens

```typescript
// Refresh tokens for specific URLs (auto-refreshes if expiring within 5 minutes)
await idpHandler.refreshProviders([
  "https://api.example.com",
  "https://api.another.com",
]);
```

### Remove Provider

```typescript
await idpHandler.removeProvider("https://api.example.com");
```

## OAuth Flow

1. User initiates login by visiting `/oauth/login?url=https://api.example.com`
2. Handler tests if resource is public (HEAD request)
3. If protected, discovers resource metadata via RFC 9728
4. Discovers authorization server metadata via RFC 8414 or OpenID Connect Discovery
5. Verifies PKCE support (S256 required)
6. Registers client via CIMD (preferred) or Dynamic Registration
7. User is redirected to authorization endpoint with PKCE challenge and resource parameter
8. After authorization, callback at `/oauth/callback/{hostname}` exchanges code for tokens
9. Tokens are stored in Durable Object per user
10. Future requests can retrieve auth headers via `getAuthorizationForUrl()`

## Security Considerations

### PKCE Required

This implementation enforces PKCE with S256 code challenge method. Authorization servers must indicate PKCE support via `code_challenge_methods_supported` in their metadata.

### Resource Indicators

All token requests include the `resource` parameter per RFC 8807 to bind tokens to specific resources. Servers must validate token audience.

### Token Storage

Access tokens and refresh tokens are stored securely in Durable Objects with proper expiration tracking.

### HTTPS Required

All authorization server endpoints must use HTTPS. Redirect URIs must use HTTPS or localhost.

## Discovery Process

### Protected Resource Metadata

1. Check WWW-Authenticate header for `resource_metadata` URL
2. Try path-specific well-known URI: `/.well-known/oauth-protected-resource{path}`
3. Try root well-known URI: `/.well-known/oauth-protected-resource`

### Authorization Server Metadata

For URLs with path (e.g., `https://auth.example.com/tenant1`):

1. OAuth 2.0 with path insertion: `/.well-known/oauth-authorization-server/tenant1`
2. OpenID Connect with path insertion: `/.well-known/openid-configuration/tenant1`
3. OpenID Connect path appending: `/tenant1/.well-known/openid-configuration`

For URLs without path:

1. OAuth 2.0: `/.well-known/oauth-authorization-server`
2. OpenID Connect: `/.well-known/openid-configuration`

## Client Registration

Priority order:

1. **Client ID Metadata Documents** (if `client_id_metadata_document_supported` is true)
2. **Dynamic Client Registration** (if `registration_endpoint` is available)
3. Error if neither supported

## API Reference

### `createIdpMiddleware(config, env)`

Creates an IDP middleware instance.

**Config:**

- `userId: string` - Unique identifier for the user
- `clientInfo: ClientInfo` - Client metadata
  - `name: string` - Application name
  - `version?: string` - Application version
  - `uri?: string` - Application homepage (required for CIMD)
  - `logo_uri?: string` - Application logo
- `baseUrl?: string` - Base URL for OAuth callbacks
- `pathPrefix?: string` - Path prefix for OAuth endpoints (default: "/oauth")
- `onAuthSuccess?: (url, token) => Promise<{name, metadata}>` - Called after successful auth

**Returns:** `IdpMiddlewareHandlers | null`

### `IdpMiddlewareHandlers`

- `middleware(request, env, ctx)` - Handle OAuth requests
- `getAuthorizationForUrl(url)` - Get Authorization header for URL
- `getProviders()` - List all providers with metadata
- `refreshProviders(urls)` - Refresh tokens for specific URLs
- `removeProvider(url)` - Remove a provider
- `getStub()` - Get Durable Object stub

### `getAuthorizationForUrl(env, userId, resourceUrl, options)`

Utility function to get authorization without handler instance.

**Returns:** `Promise<{ Authorization?: string; loginUrl?: string }>`

## License

MIT

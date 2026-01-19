# MCP IDP

Universal OAuth2 identity provider for Cloudflare Workers with Durable Objects. Provides authentication management for any OAuth2-protected resource without chat completion functionality.

## Features

- **Universal OAuth2**: Automatic OAuth2 flow for any API returning 401 with `WWW-Authenticate`
- **Dynamic Client Registration**: Automatically registers OAuth2 clients with authorization servers
- **Token Management**: Handles access token storage, refresh, and expiration
- **PKCE Support**: Secure authorization code flow with PKCE
- **Multi-Resource**: Store and manage auth for multiple protected resources per user
- **Metadata Support**: Attach custom metadata to each provider
- **Path-Based Matching**: Find the most specific provider for any URL

## Installation

```bash
npm install mcp-idp
```

## Quick Start

```ts
import { createMCPIdpHandler, OAuthProviders, MCPIdpEnv } from "mcp-idp";

export { OAuthProviders };

export default {
  fetch: async (request: Request, env: MCPIdpEnv, ctx: ExecutionContext) => {
    const idpHandler = createMCPIdpHandler(
      {
        userId: "user-123",
        baseUrl: new URL(request.url).origin,
        clientInfo: { name: "My App", version: "1.0.0" },
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

## Usage

### Initialize Handler

```ts
const idpHandler = createMCPIdpHandler(
  {
    userId: "user-123",
    baseUrl: "https://your-app.com",
    clientInfo: { name: "My App", version: "1.0.0" },
    pathPrefix: "/oauth", // Optional, defaults to "/oauth"

    // Optional: Extract metadata after successful auth
    onAuthSuccess: async (resourceUrl: string, accessToken: string) => {
      // Fetch additional info about the resource
      return {
        name: "Custom Name",
        metadata: { foo: "bar" },
      };
    },
  },
  env,
);
```

### Get Authorization Header

```ts
// Get auth for a specific URL (finds most specific matching provider)
const auth = await idpHandler.getAuthorizationForUrl(
  "https://api.example.com/users/me",
);

if (auth) {
  // Use the Authorization header
  const response = await fetch("https://api.example.com/users/me", {
    headers: auth,
  });
}
```

### List Providers

```ts
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

```ts
// Refresh tokens for specific URLs (auto-refreshes if expiring within 5 minutes)
await idpHandler.refreshProviders([
  "https://api.example.com",
  "https://api.another.com",
]);
```

### Remove Provider

```ts
await idpHandler.removeProvider("https://api.example.com");
```

### Direct Durable Object Access

```ts
// Get the Durable Object stub for advanced operations
const stub = idpHandler.getStub();

// Find provider for URL with path-based matching
const provider = await stub.findProviderForUrl(
  "https://api.example.com/v1/users/123",
);
```

## OAuth Flow

1. User initiates login by visiting `/oauth/login?url=https://api.example.com`
2. Handler discovers OAuth2 metadata using `.well-known` endpoints
3. Dynamic client registration creates OAuth2 client
4. User is redirected to authorization endpoint with PKCE challenge
5. After authorization, callback at `/oauth/callback/{hostname}` exchanges code for tokens
6. Tokens are stored in Durable Object per user
7. Future requests can retrieve auth headers via `getAuthorizationForUrl()`

## Path-Based Provider Matching

The IDP uses path-based matching to find the most specific provider for a URL:

```ts
// Stored providers:
// - https://api.example.com
// - https://api.example.com/v1

// URL: https://api.example.com/v1/users/123
// Matches: https://api.example.com/v1 (most specific)

// URL: https://api.example.com/v2/posts
// Matches: https://api.example.com (fallback to base)
```

## Public Resources

Resources that don't require authentication are automatically detected and marked as public:

```ts
// HEAD request returns 200
// -> Provider created with public: true, no auth flow needed
```

## Metadata

Attach custom metadata to providers using the `onAuthSuccess` callback:

```ts
onAuthSuccess: async (resourceUrl, accessToken) => {
  // Fetch server info, available tools, etc.
  const info = await fetchResourceInfo(resourceUrl, accessToken);

  return {
    name: info.name,
    metadata: {
      type: "api",
      version: info.version,
      capabilities: info.capabilities,
    },
  };
};
```

## API Reference

### `createMCPIdpHandler(config, env)`

Creates an IDP handler instance.

**Config:**

- `userId: string` - Unique identifier for the user
- `baseUrl: string` - Base URL for OAuth callbacks (optional, defaults to request origin)
- `clientInfo: { name: string; version: string }` - Client metadata for OAuth registration
- `pathPrefix?: string` - Path prefix for OAuth endpoints (default: "/oauth")
- `onAuthSuccess?: (url, token) => Promise<{name, metadata}>` - Called after successful auth

**Returns:** `MCPIdpHandlers | null`

### `MCPIdpHandlers`

- `middleware(request, env, ctx)` - Handle OAuth requests, returns Response or null
- `getAuthorizationForUrl(url)` - Get Authorization header for URL
- `getProviders()` - List all providers with metadata
- `refreshProviders(urls)` - Refresh tokens for specific URLs
- `removeProvider(url)` - Remove a provider
- `getStub()` - Get Durable Object stub for advanced operations

### Utility Functions

- `getAuthorizationForUrl(env, userId, url)` - Get auth header without handler instance
- `parseWWWAuthenticate(header)` - Parse WWW-Authenticate header
- `constructAuthorizationUrl(resourceUrl, callbackUrl, clientInfo, options)` - Build OAuth URL
- `exchangeCodeForToken(code, authFlowData, redirectUri)` - Exchange auth code for tokens
- `refreshAccessToken(refreshToken, clientId, clientSecret, tokenEndpoint)` - Refresh an access token

## License

MIT

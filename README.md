Packages

- [`mcp-completions`](packages/mcp-completions/): Fetch proxy for /chat/completions with IDP built-in. Runs on cloudflare only. Inspired by [universal-mcp-oauth](https://github.com/janwilmake/universal-mcp-oauth).
- [`mcp-completions-stateless`](packages/mcp-completions-stateless/): fetch proxy for /chat/completions that runs tool-calls without permission, that needs auth token. Useful because it runs anywhere and can be used as testing framework.
- [`eval-mcp`](packages/eval-mcp/): Evaluation for MCP servers: Vibe-eval your MCP with tests and expected outcomes.

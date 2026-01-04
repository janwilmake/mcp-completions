Check [readme](https://github.com/janwilmake/universal-mcp-oauth/tree/main/mcp-completions).

- ✅ Intended usage: **package**
- ✅ Add shadow url object replacer such that github.com works
- ✅ Add extract url such that any other html/pdf response works with that as fallback
- ✅ ensure additional cost for extract and other apis gets properly added to chat completions usage cost
- ✅ improve error handling; also for url_context

After this; how can I add statefulness and other cool features?

- ✅ Use this in contextarea

NEXT TIME

- in contextarea, try for the resultpage to show the error. this cant be done because it requires to be an eventstream. maybe, the refactor to make it work with `/chat/completions` is nice to do now.
  - `index.html` should submit formdata, which should return `result.html` with data to start, but not start chatcompletion yet
  - `result.html` should use `POST: /chat/completions` or `GET /chat/completions/{UID}` if data indicates it.
- Ensure it works for most general url, now it seems to set up different ones for https://xymake.com/pepicrft/status/2003772976718581923 and https://xymake.com/transitive_bs/status/2004223560416731435. Debug with the db.
- Add auth BUTTONS instead of loading indicator if we get 401
- Make logged in mcps visible and easy to add

Let's simplify things

CLI:

- ✔️ GitHub/X login + Stripe credit? pricing
- ✔️ cache
- ✔️ frontmatter: `profile`, `mcp`, `model`, `base`
- ✔️ cronjobs
- ❌ og image and view of response
- ❌ responses api

Where does the CLI hook into the boundary of what i'm creating? Determine how I add `mcp-completions` into `contextarea` as well as the new `nlang.dev` cli

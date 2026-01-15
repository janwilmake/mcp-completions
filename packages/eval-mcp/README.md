End to end vibe-testing framework for MCPs:

Functionality:

- Define your tests in a JSON file
- Test with different models
- Test with multiple MCPs enabled
- Evaluate after running whether or not the result is as expected.

Usage

```sh
npx eval-mcp eval-mcp.json
```

eval-mcp.json

```json
{
  "$schema": "https://eval-mcp.wilmake.com",

  "evals": [
    //... your evals
  ]
}
```

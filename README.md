# API Typist

Generate TypeScript types, Zod/Valibot schemas, and typed API clients from JSON samples, OpenAPI specs, or GraphQL introspection.

## Features

- 🚀 **Multi-format support**: JSON samples, OpenAPI/Swagger, GraphQL introspection
- 🎨 **Framework agnostic**: TanStack Query, SWR, RTK Query, Axios, Fetch, Ky
- ✅ **Runtime validation**: Zod or Valibot schemas with optional runtime validation
- 🎭 **React hooks**: Auto-generated typed hooks for your API operations
- 🎲 **Mock generators**: Faker-inspired mock data factories for testing

## Installation

### CLI

```bash
npm install -g api-typist
# or
npx api-typist --help
```

### VS Code Extension

1. Install from VS Code Marketplace: `API Typist`
2. Or install locally:
   ```bash
   cd api-typist/vscode-extension
   npm install -g @vscode/vscode
   vsce package
   code --install-extension api-typist-*.vsix
   ```

## Usage

### Initialize Configuration

```bash
api-typist init
# Creates api-typist.config.json with default settings
```

### Generate from JSON Samples

```bash
# Single sample
api-typist merge -i sample.json -o ./generated

# Multiple samples (merged into one API)
api-typist merge -i ./samples.json -o ./generated

# With custom options
api-typist merge -i sample.json -o ./generated \
  -f tanstack-query \
  -v zod \
  --base-url https://api.example.com
```

### Generate from OpenAPI

```bash
api-typist openapi -i openapi.yaml -o ./generated
api-typist openapi -i swagger.json -o ./generated \
  -f swr \
  -v valibot
```

### Generate from GraphQL Introspection

```bash
# GraphQL introspection JSON
api-typist graphql -i introspection.json -o ./generated

# With TanStack Query hooks
api-typist graphql -i schema.json -o ./generated \
  -f tanstack-query \
  -v zod
```

### Watch Mode

```bash
api-typist watch sample.json -o ./generated
# Regenerates on file changes
```

## Configuration

### `api-typist.config.json`

```json
{
  "framework": "tanstack-query",
  "validator": "zod",
  "output": "./generated",
  "baseUrl": "https://api.example.com",
  "headers": {
    "Authorization": "Bearer ${token}"
  },
  "namingConvention": "pascal-case"
}
```

### Configuration Options

| Option | Values | Description |
|--------|--------|-------------|
| `framework` | `tanstack-query`, `swr`, `rtk-query`, `fetch`, `axios`, `ky` | Generated API client framework |
| `validator` | `zod`, `valibot`, `none` | Schema validation library |
| `output` | path | Output directory for generated files |
| `baseUrl` | url | Base URL for API endpoints |
| `headers` | object | Default headers for requests |
| `namingConvention` | `pascal-case`, `camel-case`, `kebab-case` | Naming convention for types |

## Output Files

For each input, API Typist generates:

| File | Description |
|------|-------------|
| `types.ts` | TypeScript type definitions |
| `schemas.ts` | Zod/Valibot validation schemas |
| `api.ts` | Typed fetch wrapper functions |
| `hooks.ts` | React Query/SWR hooks |
| `mocks.ts` | Mock data generators |
| `index.ts` | Barrel exports |

## VS Code Extension

### Commands

| Command | Description |
|---------|-------------|
| `Paste JSON to Types` | Paste selected JSON and generate types |
| `Generate from GraphQL` | Generate from GraphQL introspection file |
| `Generate from OpenAPI` | Generate from OpenAPI spec file |
| `Show Configuration` | Show current settings |

### Context Menu

Right-click on `.json` or `.yaml` files to generate types.

## CI/CD Integration

### GitHub Action

This repository includes a GitHub Action that:
- Detects API contract changes in pull requests
- Runs type generation on OpenAPI/GraphQL files
- Builds and tests the project
- Optionally publishes the VS Code extension

```yaml
# .github/workflows/api.yml
- name: Check API changes
  uses: api-typist/check-api-changes@v1
  with:
    openapi-path: './openapi.yaml'
    graphql-path: './schema.json'
```

## Project Structure

```
api-typist/
├── src/
│   ├── cli.ts           # CLI entry point
│   ├── types.ts         # Core IR definitions
│   ├── merge.ts         # Type inference & merging
│   ├── generate.ts      # Code generation
│   ├── openapi.ts       # OpenAPI adapter
│   └── graphql.ts       # GraphQL adapter
├── test/
│   └── merge.test.ts    # Test suite
├── samples.json         # Sample input
├── sample-openapi.yaml  # OpenAPI spec
├── sample-graphql.json  # GraphQL introspection
├── vscode-extension/    # VS Code extension
└── .github/            # GitHub Actions
```

## License

MIT

## Contributing

1. Fork the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Test: `npm test`
5. Submit a PR

## Roadmap

- [x] Phase 1: Core IR & Merge Engine
- [x] Phase 2: Code Generation
- [x] Phase 3: Input Adapters (JSON, OpenAPI, GraphQL)
- [x] Phase 4: CLI & DX (watch, init, config)
- [x] Phase 5: VS Code Extension & GitHub Action
- [ ] Phase 6: Team Features (shared schemas, versioning)
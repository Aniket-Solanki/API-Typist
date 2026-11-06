# Contributing to API Typist

Thank you for your interest in contributing to API Typist! This document outlines the process for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct.

## How to Contribute

### Reporting Bugs

Before creating a bug report, please check if the issue has already been reported. If not, create a new issue with:

- Clear title describing the problem
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Environment details (OS, Node.js version, package version)
- Sample input that triggers the issue (if applicable)

### Suggesting Features

Feature requests are welcome! Please create an issue with:

- Clear title describing the feature
- Use case - why is this needed?
- Proposed solution - how should it work?
- Alternatives considered - any other approaches?

### Pull Requests

1. Fork the repository
2. Create a branch from main: git checkout -b feature/your-feature-name
3. Make your changes following the guidelines below
4. Test your changes: npm test && npm run build
5. Commit with a clear message
6. Push to your fork
7. Open a Pull Request against main

## Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/API-Typist.git
cd API-Typist

# Install dependencies
npm install

# Build
npm run build

# Test
npm test

# Run CLI locally
npx api-typist --help
```

## Coding Standards

### TypeScript

- Use strict mode (enforced by tsconfig.json)
- Prefer type inference over explicit annotations
- Use interfaces for object types, type aliases for unions/primitives
- Avoid any - use unknown or proper generics instead

### Code Style

- ESLint + Prettier (run npm run lint and npm run format)
- 2-space indentation
- Single quotes for strings
- Trailing commas in multiline objects/arrays
- Semicolons required

### Commits

Follow Conventional Commits:

```
feat: add GraphQL directive support
fix: handle nullable fields in OpenAPI merge
docs: update CLI usage examples
refactor: simplify type merging logic
test: add edge cases for array merging
chore: update dependencies
```

### Testing

- Write tests for new features in test/
- Run full test suite: npm test
- Aim for meaningful coverage - test behavior, not implementation

## Project Structure

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
├── vscode-extension/    # VS Code extension
├── .github/
│   └── workflows/       # GitHub Actions
├── samples.json         # Sample JSON input
├── sample-openapi.yaml  # Sample OpenAPI spec
├── sample-graphql.json  # Sample GraphQL introspection
└── package.json
```

## Adding New Features

### New Framework Support

1. Add framework to Framework type in src/types.ts
2. Add template in src/generate.ts -> generateApiClient()
3. Add tests in test/merge.test.ts

### New Validator Support

1. Add validator to Validator type in src/types.ts
2. Add schema generation in src/generate.ts -> generateSchemas()
3. Add tests

### New Input Adapter

1. Create new file in src/ (e.g., protobuf.ts)
2. Export adapter function that returns IR
3. Register in src/cli.ts

## Release Process

Maintainers only:

1. Update version in package.json
2. Update CHANGELOG.md
3. Create git tag: git tag v0.x.x
4. Push tag: git push origin v0.x.x
5. GitHub Action publishes to npm and VS Code Marketplace

## Questions?

Feel free to open an issue for any questions about contributing!

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure with IR-first architecture
- JSON sample merging engine
- TypeScript type generation
- Zod/Valibot schema generation
- TanStack Query / SWR / RTK Query / Fetch / Axios / Ky client generation
- React hooks generation
- Mock data generators
- OpenAPI/Swagger adapter
- GraphQL introspection adapter
- CLI with merge, openapi, graphql, watch, init commands
- VS Code extension with context menu commands
- GitHub Action for API contract change detection

### Changed
- N/A

### Deprecated
- N/A

### Removed
- N/A

### Fixed
- N/A

### Security
- N/A

## [0.1.0] - 2026-11-06

### Added
- Initial release
- Core IR definitions (src/types.ts)
- Type inference & merging (src/merge.ts)
- Code generation (src/generate.ts)
- OpenAPI adapter (src/openapi.ts)
- GraphQL adapter (src/graphql.ts)
- CLI entry point (src/cli.ts)
- Test suite (test/merge.test.ts)
- Sample files for all input formats
- VS Code extension skeleton
- GitHub Actions workflow

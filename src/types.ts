/**
 * Core type definitions for api-typist
 * The Intermediate Representation (IR) is the single source of truth
 * that gets transformed into TypeScript, Zod, Valibot, and framework-specific code.
 */

/** Supported output frameworks for data fetching */
export type Framework =
  | 'tanstack-query'
  | 'swr'
  | 'rtk-query'
  | 'react-router-loader'
  | 'next-server-action'
  | 'astro-endpoint'
  | 'fetch'
  | 'axios'
  | 'ky';

/** Supported validation libraries */
export type Validator = 'zod' | 'valibot' | 'none';

/** Supported output languages */
export type TargetLanguage = 'typescript' | 'python' | 'go' | 'rust';

/** Configuration for code generation */
export interface GenerationConfig {
  /** Framework for data fetching hooks */
  framework: Framework;
  /** Validation library */
  validator: Validator;
  /** Target language (currently only TypeScript) */
  language: TargetLanguage;
  /** Whether to generate React Query / SWR hooks */
  generateHooks: boolean;
  /** Whether to generate fetch wrapper functions */
  generateFetch: boolean;
  /** Whether to generate mock data generators */
  generateMocks: boolean;
  /** Whether to generate TypeScript interfaces (vs type aliases) */
  useInterfaces: boolean;
  /** Whether to add runtime validation parse calls */
  addRuntimeValidation: boolean;
  /** Custom fetch function name */
  fetchFunctionName?: string;
  /** Base URL for API (for absolute paths) */
  baseUrl?: string;
  /** Header configuration */
  headers?: Record<string, string>;
  /** Whether to use strict null checks */
  strictNullChecks: boolean;
  /** Whether to generate discriminated unions from type discriminator fields */
  detectDiscriminatedUnions: boolean;
  /** Fields to treat as discriminators */
  discriminatorFields: string[];
  /** Whether to generate recursive types with z.lazy/Valibot lazy */
  handleRecursiveTypes: boolean;
  /** Output directory */
  outDir: string;
  /** File naming convention */
  namingConvention: 'kebab-case' | 'pascal-case' | 'camel-case';
}

/** Default generation config */
export const DEFAULT_CONFIG: GenerationConfig = {
  framework: 'tanstack-query',
  validator: 'zod',
  language: 'typescript',
  generateHooks: true,
  generateFetch: true,
  generateMocks: true,
  useInterfaces: true,
  addRuntimeValidation: true,
  strictNullChecks: true,
  detectDiscriminatedUnions: true,
  discriminatorFields: ['type', 'kind', 'status', 'discriminator', 'variant'],
  handleRecursiveTypes: true,
  outDir: './generated',
  namingConvention: 'pascal-case',
};

/** Represents a property in a type */
export interface PropertyIR {
  name: string;
  type: TypeIR;
  optional: boolean;
  nullable: boolean;
  description?: string;
  defaultValue?: unknown;
  deprecated?: boolean;
  /** For discriminated unions: the discriminator value this property belongs to */
  discriminatorValue?: string;
}

/** Type kinds in our IR */
export type TypeKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'undefined'
  | 'any'
  | 'array'
  | 'object'
  | 'union'
  | 'intersection'
  | 'literal'
  | 'enum'
  | 'reference'
  | 'recursive'
  | 'promise'
  | 'function';

/** Base type in IR */
export interface BaseTypeIR {
  kind: TypeKind;
  description?: string;
  examples?: unknown[];
}

/** Primitive types */
export interface StringTypeIR extends BaseTypeIR {
  kind: 'string';
  format?: 'uuid' | 'email' | 'date-time' | 'date' | 'time' | 'uri' | 'url' | 'ipv4' | 'ipv6' | 'regex';
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  enum?: string[];
}

export interface NumberTypeIR extends BaseTypeIR {
  kind: 'number';
  format?: 'float' | 'double' | 'int32' | 'int64' | 'bigint';
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean;
  exclusiveMaximum?: boolean;
  multipleOf?: number;
}

export interface BooleanTypeIR extends BaseTypeIR {
  kind: 'boolean';
}

export interface NullTypeIR extends BaseTypeIR {
  kind: 'null';
}

export interface UndefinedTypeIR extends BaseTypeIR {
  kind: 'undefined';
}

export interface AnyTypeIR extends BaseTypeIR {
  kind: 'any';
}

/** Array type */
export interface ArrayTypeIR extends BaseTypeIR {
  kind: 'array';
  items: TypeIR;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

/** Object type */
export interface ObjectTypeIR extends BaseTypeIR {
  kind: 'object';
  properties: PropertyIR[];
  required: string[];
  additionalProperties?: TypeIR | boolean;
  /** If this is a discriminated union member */
  discriminator?: string;
  /** Discriminator value for this object */
  discriminatorValue?: string;
}

/** Union type */
export interface UnionTypeIR extends BaseTypeIR {
  kind: 'union';
  types: TypeIR[];
  /** If this is a discriminated union */
  discriminator?: string;
}

/** Intersection type */
export interface IntersectionTypeIR extends BaseTypeIR {
  kind: 'intersection';
  types: TypeIR[];
}

/** Literal type */
export interface LiteralTypeIR extends BaseTypeIR {
  kind: 'literal';
  value: string | number | boolean;
}

/** Enum type */
export interface EnumTypeIR extends BaseTypeIR {
  kind: 'enum';
  values: (string | number)[];
  isConst?: boolean;
}

/** Reference to a named type */
export interface ReferenceTypeIR extends BaseTypeIR {
  kind: 'reference';
  name: string;
  /** Type arguments for generics */
  typeArguments?: TypeIR[];
}

/** Recursive type reference */
export interface RecursiveTypeIR extends BaseTypeIR {
  kind: 'recursive';
  name: string;
  /** The actual type definition (for codegen) */
  definition?: TypeIR;
}

/** Promise type */
export interface PromiseTypeIR extends BaseTypeIR {
  kind: 'promise';
  resolves: TypeIR;
}

/** Function type */
export interface FunctionTypeIR extends BaseTypeIR {
  kind: 'function';
  parameters: PropertyIR[];
  returnType: TypeIR;
  async: boolean;
}

/** Union of all type IRs */
export type TypeIR =
  | StringTypeIR
  | NumberTypeIR
  | BooleanTypeIR
  | NullTypeIR
  | UndefinedTypeIR
  | AnyTypeIR
  | ArrayTypeIR
  | ObjectTypeIR
  | UnionTypeIR
  | IntersectionTypeIR
  | LiteralTypeIR
  | EnumTypeIR
  | ReferenceTypeIR
  | RecursiveTypeIR
  | PromiseTypeIR
  | FunctionTypeIR;

/** Named type definition */
export interface NamedTypeIR {
  name: string;
  type: TypeIR;
  /** Whether this type was inferred from multiple samples (merged) */
  merged: boolean;
  /** Source samples that contributed to this type */
  sources: number;
  /** Original JSON samples for reference */
  samples?: unknown[];
}

/** Complete IR for a set of API responses */
export interface APISchemaIR {
  /** All named types discovered */
  types: Map<string, NamedTypeIR>;
  /** Root types (top-level response shapes) */
  roots: string[];
  /** Discriminated unions detected */
  discriminatedUnions: Map<string, { discriminator: string; members: string[] }>;
  /** Recursive types detected */
  recursiveTypes: Set<string>;
  /** Metadata */
  metadata: {
    sampleCount: number;
    generatedAt: string;
    config: GenerationConfig;
  };
}

/** Result of code generation */
export interface GenerationResult {
  /** Generated files */
  files: GeneratedFile[];
  /** Any warnings during generation */
  warnings: string[];
  /** Statistics */
  stats: {
    typesGenerated: number;
    filesWritten: number;
    discriminatedUnions: number;
    recursiveTypes: number;
  };
}

/** A single generated file */
export interface GeneratedFile {
  path: string;
  content: string;
  /** File type for organization */
  kind: 'types' | 'schemas' | 'api' | 'hooks' | 'mocks' | 'index' | 'config';
}

/** Sample input for merging */
export interface SampleInput {
  /** The JSON data */
  data: unknown;
  /** Optional source identifier (e.g., endpoint name) */
  source?: string;
  /** Optional metadata */
  meta?: Record<string, unknown>;
}

/** Merge options */
export interface MergeOptions {
  /** Discriminator field names to detect */
  discriminatorFields: string[];
  /** Whether to merge optional fields across samples */
  mergeOptionals: boolean;
  /** Whether to detect and create discriminated unions */
  detectDiscriminatedUnions: boolean;
  /** Maximum depth for recursive type detection */
  maxRecursiveDepth: number;
  /** Whether to treat null as nullable vs optional */
  nullAsNullable: boolean;
  /** Framework for generated code */
  framework: GenerationConfig['framework'];
  /** Validator library for generated code */
  validator: GenerationConfig['validator'];
}
/**
 * Core merge algorithm - the heart of api-typist
 * Takes multiple JSON samples and produces a unified, correct IR
 */

import {
  TypeIR,
  NamedTypeIR,
  APISchemaIR,
  PropertyIR,
  ObjectTypeIR,
  UnionTypeIR,
  ArrayTypeIR,
  SampleInput,
  MergeOptions,
  StringTypeIR,
  NumberTypeIR,
  BooleanTypeIR,
  NullTypeIR,
  UndefinedTypeIR,
  AnyTypeIR,
  LiteralTypeIR,
  EnumTypeIR,
  ReferenceTypeIR,
  RecursiveTypeIR,
  TypeKind,
  DEFAULT_CONFIG,
  GenerationConfig,
} from './types.js';

/** Default merge options */
export const DEFAULT_MERGE_OPTIONS: MergeOptions = {
  discriminatorFields: DEFAULT_CONFIG.discriminatorFields,
  mergeOptionals: true,
  detectDiscriminatedUnions: true,
  maxRecursiveDepth: 10,
  nullAsNullable: true,
  framework: DEFAULT_CONFIG.framework,
  validator: DEFAULT_CONFIG.validator,
};

/** Type registry for building named types */
interface TypeRegistry {
  types: Map<string, NamedTypeIR>;
  anonymousCounter: number;
  recursiveStack: Set<string>;
  discriminatedUnions: Map<string, { discriminator: string; members: string[] }>;
  recursiveTypes: Set<string>;
}

/** Create a new type registry */
function createRegistry(): TypeRegistry {
  return {
    types: new Map(),
    anonymousCounter: 0,
    recursiveStack: new Set(),
    discriminatedUnions: new Map(),
    recursiveTypes: new Set(),
  };
}

/** Generate a unique type name */
function generateTypeName(registry: TypeRegistry, baseName: string): string {
  const sanitized = baseName
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  let name = sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
  if (!/^[A-Z]/.test(name)) {
    name = 'Type' + name;
  }

  let counter = 0;
  let uniqueName = name;
  while (registry.types.has(uniqueName)) {
    counter++;
    uniqueName = `${name}${counter}`;
  }
  return uniqueName;
}

/** Infer TypeIR from a single JSON value */
export function inferTypeFromValue(value: unknown, registry: TypeRegistry, path: string = 'root'): TypeIR {
  if (value === null) {
    return { kind: 'null' } as NullTypeIR;
  }
  if (value === undefined) {
    return { kind: 'undefined' } as UndefinedTypeIR;
  }

  switch (typeof value) {
    case 'string': {
      const strType: StringTypeIR = { kind: 'string' };
      // Detect common formats
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        strType.format = 'uuid';
      } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        strType.format = 'email';
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(value)) {
        strType.format = 'date-time';
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        strType.format = 'date';
      } else if (/^https?:\/\//.test(value)) {
        strType.format = 'url';
      }
      return strType;
    }
    case 'number': {
      const numType: NumberTypeIR = { kind: 'number' };
      if (Number.isInteger(value)) {
        numType.format = value > 2147483647 || value < -2147483648 ? 'int64' : 'int32';
      } else {
        numType.format = 'float';
      }
      return numType;
    }
    case 'boolean':
      return { kind: 'boolean' } as BooleanTypeIR;
    case 'object': {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return { kind: 'array', items: { kind: 'any' } as AnyTypeIR } as ArrayTypeIR;
        }
        // Merge all array item types
        const itemTypes = value.map((item, i) =>
          inferTypeFromValue(item, registry, `${path}[${i}]`)
        );
        const mergedItems = mergeTypes(itemTypes, registry);
        return { kind: 'array', items: mergedItems } as ArrayTypeIR;
      }
      // Handle plain objects
      return inferObjectType(value as Record<string, unknown>, registry, path);
    }
    default:
      return { kind: 'any' } as AnyTypeIR;
  }
}

/** Infer object type, detecting discriminated unions and recursive types */
function inferObjectType(obj: Record<string, unknown>, registry: TypeRegistry, path: string): TypeIR {
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return { kind: 'object', properties: [], required: [], additionalProperties: false } as ObjectTypeIR;
  }

  // Check for discriminator field
  const discriminatorField = DEFAULT_MERGE_OPTIONS.discriminatorFields.find(f => f in obj);
  let discriminatorValue: string | undefined;

  const properties: PropertyIR[] = [];
  const required: string[] = [];

  for (const key of keys) {
    const value = obj[key];
    const isDiscriminator = key === discriminatorField;

    if (isDiscriminator && typeof value === 'string') {
      discriminatorValue = value;
      // Still include discriminator as a property
    }

    const propType = inferTypeFromValue(value, registry, `${path}.${key}`);
    const optional = false; // In single sample, all present fields are required

    properties.push({
      name: key,
      type: propType,
      optional: false,
      nullable: isNullable(propType),
      discriminatorValue: isDiscriminator ? discriminatorValue : undefined,
    });
    required.push(key);
  }

  const objectType: ObjectTypeIR = {
    kind: 'object',
    properties,
    required,
    additionalProperties: false,
  };

  if (discriminatorField && discriminatorValue) {
    objectType.discriminator = discriminatorField;
    objectType.discriminatorValue = discriminatorValue;
  }

  // Check for recursive types
  const typeName = generateTypeName(registry, path.split('.').pop() || 'Object');
  if (registry.recursiveStack.has(typeName)) {
    registry.recursiveTypes.add(typeName);
    return { kind: 'recursive', name: typeName } as RecursiveTypeIR;
  }

  return objectType;
}

/** Check if a type is nullable (includes null) */
function isNullable(type: TypeIR): boolean {
  if (type.kind === 'null') return true;
  if (type.kind === 'union') {
    return type.types.some(t => t.kind === 'null');
  }
  return false;
}

/** Merge multiple TypeIRs into a single unified type */
export function mergeTypes(types: TypeIR[], registry: TypeRegistry): TypeIR {
  if (types.length === 0) return { kind: 'any' } as AnyTypeIR;
  if (types.length === 1) return types[0] ?? { kind: 'any' } as AnyTypeIR;

  // Group by kind
  const byKind = new Map<TypeKind, TypeIR[]>();
  for (const t of types) {
    const arr = byKind.get(t.kind) || [];
    arr.push(t);
    byKind.set(t.kind, arr);
  }

  // If all same kind (except union), merge specifically
  if (byKind.size === 1) {
    const [kind, arr] = byKind.entries().next().value!;
    return mergeSameKind(kind, arr, registry);
  }

  // Different kinds -> union (but check for null/undefined)
  const hasNull = byKind.has('null');
  const hasUndefined = byKind.has('undefined');
  const nonNullableTypes = types.filter(t => t.kind !== 'null' && t.kind !== 'undefined') as TypeIR[];

  if (nonNullableTypes.length === 1) {
    let result: TypeIR = nonNullableTypes[0]!;
    if (hasNull) result = makeNullable(result);
    if (hasUndefined) result = makeOptional(result);
    return result;
  }

  // Multiple non-nullable types -> union
  const union: UnionTypeIR = { kind: 'union', types: [...nonNullableTypes] as TypeIR[] };
  if (hasNull) union.types.push({ kind: 'null' } as NullTypeIR);
  if (hasUndefined) union.types.push({ kind: 'undefined' } as UndefinedTypeIR);

  // Check if this union is actually a discriminated union
  return tryMakeDiscriminatedUnion(union, registry);
}

/** Merge types of the same kind */
function mergeSameKind(kind: TypeKind, types: TypeIR[], registry: TypeRegistry): TypeIR {
  const first = types[0];

  switch (kind) {
    case 'object':
      return mergeObjects(types as ObjectTypeIR[], registry);
    case 'array':
      return mergeArrays(types as ArrayTypeIR[], registry);
    case 'union':
      return mergeUnions(types as UnionTypeIR[], registry);
    case 'string':
      return mergeStrings(types as StringTypeIR[]);
    case 'number':
      return mergeNumbers(types as NumberTypeIR[]);
    case 'literal':
      return mergeLiterals(types as LiteralTypeIR[], registry);
    default:
      // For primitives, if all identical, return one; else union
      const allSame = types.every(t => JSON.stringify(t) === JSON.stringify(types[0]));
      return allSame ? types[0]! : { kind: 'union', types: [...types] } as UnionTypeIR;
  }
}

/** Merge object types - the most complex merge */
function mergeObjects(objects: ObjectTypeIR[], registry: TypeRegistry): TypeIR {
  // Collect all properties across all objects
  const propMap = new Map<string, { types: TypeIR[]; required: number; total: number; discriminatorValues: Set<string> }>();

  for (const obj of objects) {
    for (const prop of obj.properties) {
      const existing = propMap.get(prop.name) || { types: [], required: 0, total: 0, discriminatorValues: new Set() };
      existing.types.push(prop.type);
      if (!prop.optional) existing.required++;
      existing.total++;
      if (prop.discriminatorValue) existing.discriminatorValues.add(prop.discriminatorValue);
      propMap.set(prop.name, existing);
    }
  }

  const mergedProps: PropertyIR[] = [];
  const required: string[] = [];

  for (const [name, info] of propMap) {
    const mergedType = mergeTypes(info.types, registry);
    const isRequired = info.required === info.total;
    const isOptional = info.required < info.total;

    mergedProps.push({
      name,
      type: mergedType,
      optional: isOptional,
      nullable: isNullable(mergedType),
    });

    if (isRequired) required.push(name);
  }

  // Check for discriminated union across objects
  const discriminators = new Map<string, Map<string, ObjectTypeIR[]>>();
  for (const obj of objects) {
    if (obj.discriminator && obj.discriminatorValue) {
      const map = discriminators.get(obj.discriminator) || new Map();
      const arr = map.get(obj.discriminatorValue) || [];
      arr.push(obj);
      map.set(obj.discriminatorValue, arr);
      discriminators.set(obj.discriminator, map);
    }
  }

  let discriminatorField: string | undefined;
  let discriminatorValues: string[] | undefined;

  for (const [field, valueMap] of discriminators) {
    if (valueMap.size > 1) {
      discriminatorField = field;
      discriminatorValues = Array.from(valueMap.keys());
      break;
    }
  }

  const result: ObjectTypeIR = {
    kind: 'object',
    properties: mergedProps,
    required,
    additionalProperties: false,
  };

  if (discriminatorField && discriminatorValues) {
    result.discriminator = discriminatorField;
    // Store discriminated union info for later codegen
    const typeName = generateTypeName(registry, 'DiscriminatedUnion');
    registry.discriminatedUnions.set(typeName, {
      discriminator: discriminatorField,
      members: discriminatorValues,
    });
  }

  return result;
}

/** Merge array types */
function mergeArrays(arrays: ArrayTypeIR[], registry: TypeRegistry): ArrayTypeIR {
  const itemTypes = arrays.map(a => a.items);
  const mergedItems = mergeTypes(itemTypes, registry);
  return { kind: 'array', items: mergedItems } as ArrayTypeIR;
}

/** Merge union types */
function mergeUnions(unions: UnionTypeIR[], registry: TypeRegistry): TypeIR {
  const allTypes = unions.flatMap(u => u.types);
  return mergeTypes(allTypes, registry);
}

/** Merge string types */
function mergeStrings(strings: StringTypeIR[]): StringTypeIR {
  const result: StringTypeIR = { kind: 'string' };
  const formats = new Set(strings.map(s => s.format).filter(Boolean));
  if (formats.size === 1) result.format = formats.values().next().value;
  const patterns = strings.map(s => s.pattern).filter(Boolean);
  if (patterns.length > 0) result.pattern = patterns.join('|');
  const enums = strings.flatMap(s => s.enum || []);
  if (enums.length > 0) result.enum = [...new Set(enums)];
  return result;
}

/** Merge number types */
function mergeNumbers(numbers: NumberTypeIR[]): NumberTypeIR {
  const result: NumberTypeIR = { kind: 'number' };
  const formats = new Set(numbers.map(n => n.format).filter(Boolean));
  if (formats.size === 1) result.format = formats.values().next().value;
  const mins = numbers.map(n => n.minimum).filter(v => v !== undefined);
  const maxs = numbers.map(n => n.maximum).filter(v => v !== undefined);
  if (mins.length > 0) result.minimum = Math.min(...mins);
  if (maxs.length > 0) result.maximum = Math.max(...maxs);
  return result;
}

/** Merge literals into enum or union */
function mergeLiterals(literals: LiteralTypeIR[], registry: TypeRegistry): TypeIR {
  const values = literals.map(l => l.value);
  const uniqueValues = [...new Set(values)];

  if (uniqueValues.length <= 20 && uniqueValues.every(v => typeof v === 'string' || typeof v === 'number')) {
    return { kind: 'enum', values: uniqueValues } as EnumTypeIR;
  }
  return { kind: 'union', types: literals } as UnionTypeIR;
}

/** Make a type nullable (add null to union) */
function makeNullable(type: TypeIR): TypeIR {
  if (type.kind === 'union') {
    if (!type.types.some(t => t.kind === 'null')) {
      return { ...type, types: [...type.types, { kind: 'null' } as NullTypeIR] };
    }
    return type;
  }
  if (type.kind === 'null') return type;
  return { kind: 'union', types: [type, { kind: 'null' } as NullTypeIR] } as UnionTypeIR;
}

/** Make a type optional (add undefined to union) */
function makeOptional(type: TypeIR): TypeIR {
  if (type.kind === 'union') {
    if (!type.types.some(t => t.kind === 'undefined')) {
      return { ...type, types: [...type.types, { kind: 'undefined' } as UndefinedTypeIR] };
    }
    return type;
  }
  if (type.kind === 'undefined') return type;
  return { kind: 'union', types: [type, { kind: 'undefined' } as UndefinedTypeIR] } as UnionTypeIR;
}

/** Try to convert a union into a discriminated union */
function tryMakeDiscriminatedUnion(union: UnionTypeIR, registry: TypeRegistry): TypeIR {
  const objectTypes = union.types.filter(t => t.kind === 'object') as ObjectTypeIR[];
  if (objectTypes.length < 2) return union;

  // Find common discriminator field
  const discriminatorFields = new Map<string, Set<string>>();
  for (const obj of objectTypes) {
    for (const prop of obj.properties) {
      if (DEFAULT_MERGE_OPTIONS.discriminatorFields.includes(prop.name)) {
        const values = discriminatorFields.get(prop.name) || new Set();
        // We need to know the literal value - for now, skip if not literal
        discriminatorFields.set(prop.name, values);
      }
    }
  }

  // For now, return union as-is; discriminated union detection happens at object merge level
  return union;
}

/** Main entry: merge multiple samples into APISchemaIR */
export function mergeSamples(samples: SampleInput[], options: Partial<MergeOptions> = {}): APISchemaIR {
  const opts: MergeOptions = { ...DEFAULT_MERGE_OPTIONS, ...options };
  const registry = createRegistry();
  const rootTypes: string[] = [];

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (!sample) continue;
    const sourceName = sample.source || `sample${i + 1}`;
    const typeName = generateTypeName(registry, sourceName);
    
    if (!sample.data) {
      const emptyRoot: AnyTypeIR = { kind: 'any' };
      registry.types.set(typeName, {
        name: typeName,
        type: emptyRoot,
        merged: samples.length > 1,
        sources: 1,
        samples: [],
      });
      rootTypes.push(typeName);
      continue;
    }
    const rootType = inferTypeFromValue(sample.data, registry, sourceName);

    // Register root type
    registry.types.set(typeName, {
      name: typeName,
      type: rootType,
      merged: samples.length > 1,
      sources: 1,
      samples: [sample.data],
    });
    rootTypes.push(typeName);
  }

  // Post-process: resolve references, finalize discriminated unions
  // For now, return the IR
  return {
    types: registry.types,
    roots: rootTypes,
    discriminatedUnions: registry.discriminatedUnions,
    recursiveTypes: registry.recursiveTypes,
    metadata: {
      sampleCount: samples.length,
      generatedAt: new Date().toISOString(),
      config: {
        framework: opts.framework ?? DEFAULT_CONFIG.framework,
        validator: opts.validator ?? DEFAULT_CONFIG.validator,
        language: 'typescript' as GenerationConfig['language'],
        generateHooks: (opts.framework ?? DEFAULT_CONFIG.framework) === 'tanstack-query',
        generateFetch: true,
        generateMocks: true,
        useInterfaces: true,
                addRuntimeValidation: true,
                strictNullChecks: true,
                detectDiscriminatedUnions: opts.detectDiscriminatedUnions ?? true,
                discriminatorFields: opts.discriminatorFields ?? DEFAULT_CONFIG.discriminatorFields,
                handleRecursiveTypes: true,
                outDir: './generated',
                namingConvention: 'pascal-case' as GenerationConfig['namingConvention'],
                fetchFunctionName: undefined,
                baseUrl: undefined,
                headers: undefined,
              },
            },
          };
        }

        export type { MergeOptions } from './types.js';
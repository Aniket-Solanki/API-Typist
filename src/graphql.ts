/**
 * GraphQL Schema to IR converter
 * Converts GraphQL SDL/Introspection to our IR format
 */

import {
  TypeIR,
  NamedTypeIR,
  APISchemaIR,
  PropertyIR,
  ObjectTypeIR,
  StringTypeIR,
  NumberTypeIR,
  BooleanTypeIR,
  AnyTypeIR,
  IntersectionTypeIR,
  UnionTypeIR,
  ArrayTypeIR,
  EnumTypeIR,
  GenerationConfig,
  DEFAULT_CONFIG,
} from './types.js';

interface GraphQLIntrospection {
  __schema: {
    types: GraphQLType[];
    queryType?: { name: string };
    mutationType?: { name: string };
    subscriptionType?: { name: string };
  };
}

interface GraphQLType {
  kind: 'SCALAR' | 'OBJECT' | 'INTERFACE' | 'UNION' | 'ENUM' | 'INPUT_OBJECT' | 'LIST' | 'NON_NULL';
  name: string | null;
  description?: string | null;
  fields?: GraphQLField[];
  inputFields?: GraphQLInputField[];
  interfaces?: GraphQLType[];
  possibleTypes?: GraphQLType[];
  enumValues?: GraphQLEnumValue[];
  ofType?: GraphQLType;
}

interface GraphQLField {
  name: string;
  description?: string | null;
  type: GraphQLType;
  args?: GraphQLInputField[];
  isDeprecated?: boolean;
  deprecationReason?: string | null;
}

interface GraphQLInputField {
  name: string;
  description?: string | null;
  type: GraphQLType;
  defaultValue?: string | null;
}

interface GraphQLEnumValue {
  name: string;
  description?: string | null;
  isDeprecated?: boolean;
  deprecationReason?: string | null;
}

/** Convert GraphQL schema (SDL or introspection) to our IR format */
export async function graphqlToIR(
  schema: GraphQLIntrospection | string,
  config: Partial<GenerationConfig> = {}
): Promise<APISchemaIR> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  let introspection: GraphQLIntrospection;
  
  if (typeof schema === 'string') {
    // Parse SDL - for now, we'll need a GraphQL parser
    // This is a placeholder - in production use graphql-js parse + buildSchema + introspection
    introspection = await parseSDL(schema);
  } else {
    introspection = schema;
  }
  
  // Convert introspection to IR
  const ir = convertIntrospectionToIR(introspection, fullConfig);

  // Add metadata
  ir.metadata = {
    sampleCount: ir.roots.length,
    generatedAt: new Date().toISOString(),
    config: fullConfig,
  };

  return ir;
}

/** Parse GraphQL SDL to introspection format (placeholder - use graphql-js in production) */
async function parseSDL(sdl: string): Promise<GraphQLIntrospection> {
  // In production: use graphql-js
  // const { parse, buildSchema, introspectionFromSchema } = await import('graphql');
  // const ast = parse(sdl);
  // const schema = buildSchema(sdl);
  // return introspectionFromSchema(schema);
  
  // For now, throw - user should provide introspection JSON
  throw new Error('SDL parsing not implemented. Provide GraphQL introspection JSON from `graphql-cli introspect` or similar.');
}

/** Load GraphQL introspection from file */
export async function loadGraphQLIntrospection(filePath: string): Promise<GraphQLIntrospection> {
  const fs = await import('fs/promises');
  const content = await fs.readFile(filePath, 'utf-8');
  
  if (filePath.endsWith('.graphql') || filePath.endsWith('.gql')) {
    // SDL file - would need parsing
    throw new Error('SDL files not supported yet. Use introspection JSON.');
  }
  
  return JSON.parse(content);
}

/** Convert GraphQL introspection to our IR */
function convertIntrospectionToIR(
  introspection: GraphQLIntrospection,
  config: GenerationConfig
): APISchemaIR {
  const types = new Map<string, NamedTypeIR>();
  const recursiveTypes = new Set<string>();
  const discriminatedUnions = new Map<string, { discriminator: string; members: string[] }>();
  const processed = new Set<string>();
  const processing = new Set<string>();
  
  // Build type map for quick lookup
  const typeMap = new Map<string, GraphQLType>();
  for (const type of introspection.__schema.types) {
    if (type.name) {
      typeMap.set(type.name, type);
    }
  }
  
  // Detect discriminated unions (GraphQL unions/interfaces with __typename)
  for (const type of introspection.__schema.types) {
    if ((type.kind === 'UNION' || type.kind === 'INTERFACE') && type.possibleTypes) {
      const members = type.possibleTypes
        .map(t => t.name)
        .filter((n): n is string => Boolean(n));
      
      if (members.length > 0) {
        discriminatedUnions.set(type.name!, { 
          discriminator: '__typename', 
          members 
        });
      }
    }
  }
  
  // Convert each type
  function convertType(name: string, gqlType: GraphQLType, isRoot = false): TypeIR {
    // Handle circular references
    if (processing.has(name)) {
      recursiveTypes.add(name);
      return { kind: 'recursive', name };
    }
    
    if (processed.has(name)) {
      return { kind: 'reference', name };
    }
    
    processing.add(name);
    
    try {
      // Unwrap NON_NULL and LIST
      let currentType = gqlType;
      let isNullable = true;
      let isArray = false;
      
      while (currentType.kind === 'NON_NULL' || currentType.kind === 'LIST') {
        if (currentType.kind === 'NON_NULL') {
          isNullable = false;
        } else if (currentType.kind === 'LIST') {
          isArray = true;
        }
        currentType = currentType.ofType!;
      }
      
      // Now currentType is the base type
      let baseType: TypeIR;
      
      switch (currentType.kind) {
        case 'SCALAR': {
          baseType = convertScalar(currentType.name!);
          break;
        }
        case 'ENUM': {
          baseType = convertEnum(currentType);
          break;
        }
        case 'OBJECT': {
          // If the base type has a name in the type map, use a reference
          if (currentType.name && currentType.name !== name && typeMap.has(currentType.name)) {
            // Register it if not yet processed
            if (!processed.has(currentType.name)) {
              convertType(currentType.name, typeMap.get(currentType.name)!, true);
            }
            baseType = { kind: 'reference', name: currentType.name };
          } else {
            baseType = convertObject(currentType, name, typeMap);
          }
          break;
        }
        case 'INTERFACE': {
          baseType = convertInterface(currentType, name, typeMap);
          break;
        }
        case 'UNION': {
          baseType = convertUnion(currentType, name, typeMap);
          break;
        }
        case 'INPUT_OBJECT': {
          baseType = convertInputObject(currentType, name, typeMap);
          break;
        }
        default: {
          baseType = { kind: 'any' };
        }
      }
      
      // Wrap in array if needed
      if (isArray) {
        baseType = { kind: 'array', items: baseType };
      }
      
      // Wrap in union with null if nullable - but NOT for root types
      if (!isRoot) {
        if (isNullable) {
          // Nullable - union with null
          if (baseType.kind !== 'union' || !baseType.types.some(t => t.kind === 'null')) {
            baseType = { kind: 'union', types: [baseType, { kind: 'null' }] };
          }
        }
      }
      
      if (isRoot) {
        types.set(name, { 
          name, 
          type: baseType, 
          merged: false, 
          sources: 1 
        });
      }
      
      processed.add(name);
      processing.delete(name);
      return baseType;
      
    } catch (e) {
      processing.delete(name);
      processed.add(name);
      return { kind: 'any' };
    }
  }
  
  function convertScalar(name: string): TypeIR {
    switch (name) {
      case 'String': return { kind: 'string' };
      case 'Int': return { kind: 'number', format: 'int32' };
      case 'Float': return { kind: 'number', format: 'float' };
      case 'Boolean': return { kind: 'boolean' };
      case 'ID': return { kind: 'string', format: 'uuid' };
      default: return { kind: 'string' };
    }
  }
  
  function convertEnum(gqlType: GraphQLType): TypeIR {
    const values = gqlType.enumValues?.map(v => v.name) || [];
    return { kind: 'enum', values };
  }
  
  function convertObject(gqlType: GraphQLType, name: string, typeMap: Map<string, GraphQLType>): TypeIR {
    const fields = gqlType.fields || [];
    const properties: PropertyIR[] = [];
    
    for (const field of fields) {
      if (field.name.startsWith('__')) continue; // Skip __typename etc.
      
      const fieldType = convertType(`${name}_${field.name}`, field.type);
      properties.push({
        name: field.name,
        type: fieldType,
        optional: true, // GraphQL fields are nullable by default
        nullable: true,
        description: field.description || undefined,
      });
    }
    
    return { kind: 'object', properties, required: [] };
  }
  
  function convertInterface(gqlType: GraphQLType, name: string, typeMap: Map<string, GraphQLType>): TypeIR {
    if (!gqlType.possibleTypes || gqlType.possibleTypes.length === 0) {
      return convertObject(gqlType, name, typeMap);
    }
    
    const typesArr = gqlType.possibleTypes
      .map(t => t.name)
      .filter((n): n is string => Boolean(n))
      .map(n => convertType(n, typeMap.get(n)!, false));
    
    return { kind: 'union', types: typesArr };
  }
  
  function convertUnion(gqlType: GraphQLType, name: string, typeMap: Map<string, GraphQLType>): TypeIR {
    if (!gqlType.possibleTypes || gqlType.possibleTypes.length === 0) {
      return { kind: 'any' };
    }
    
    const typesArr = gqlType.possibleTypes
      .map(t => t.name)
      .filter((n): n is string => Boolean(n))
      .map(n => convertType(n, typeMap.get(n)!, false));
    
    return { kind: 'union', types: typesArr };
  }
  
  function convertInputObject(gqlType: GraphQLType, name: string, typeMap: Map<string, GraphQLType>): TypeIR {
    const fields = gqlType.inputFields || [];
    const properties: PropertyIR[] = [];
    
    for (const field of fields) {
      const fieldType = convertType(`${name}_${field.name}`, field.type);
      properties.push({
        name: field.name,
        type: fieldType,
        optional: field.defaultValue !== undefined || true,
        nullable: true,
        description: field.description || undefined,
      });
    }
    
    return { kind: 'object', properties, required: [] };
  }
  
  // First pass: Convert all OBJECT, INTERFACE, UNION, ENUM, INPUT_OBJECT types
  // Include Query and Mutation as they're operation root types
  for (const gqlType of introspection.__schema.types) {
    if (!gqlType.name) continue;
    if (gqlType.name.startsWith('__')) continue;
    
    const kind = gqlType.kind;
    if (['OBJECT', 'INTERFACE', 'UNION', 'ENUM', 'INPUT_OBJECT'].includes(kind)) {
      if (!processed.has(gqlType.name)) {
        convertType(gqlType.name, gqlType, true);
      }
    }
  }
  
  // Second pass: Extract query/mutation field return types as roots
  const queryType = typeMap.get('Query');
  const mutationType = typeMap.get('Mutation');
  const roots: string[] = [];
  
  // For GraphQL, Query and Mutation are the operation types
  if (queryType) roots.push('Query');
  if (mutationType) roots.push('Mutation');
  
  // If no roots found from operations, fall back to all object types
  if (roots.length === 0) {
    for (const [name, namedType] of types) {
      if (namedType.type.kind === 'object') {
        roots.push(name);
      }
    }
  }
  
  return {
    types,
    roots,
    discriminatedUnions,
    recursiveTypes,
    metadata: {
      sampleCount: 0,
      generatedAt: new Date().toISOString(),
      config,
    },
  };
}
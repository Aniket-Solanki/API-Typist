/**
 * OpenAPI/Swagger to IR converter
 * Directly converts JSON Schema to our IR format
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
  GenerationConfig,
  DEFAULT_CONFIG,
} from './types.js';

interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, OpenAPIOperation>>;
  components?: { schemas?: Record<string, OpenAPISchema> };
}

interface OpenAPIOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: { content: Record<string, { schema: OpenAPISchema }> };
  responses: Record<string, { description?: string; content?: Record<string, { schema: OpenAPISchema }> }>;
}

interface OpenAPIParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: OpenAPISchema;
  description?: string;
}

interface OpenAPISchema {
  type?: string;
  format?: string;
  enum?: unknown[];
  properties?: Record<string, OpenAPISchema>;
  items?: OpenAPISchema;
  required?: string[];
  additionalProperties?: boolean | OpenAPISchema;
  nullable?: boolean;
  allOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
  oneOf?: OpenAPISchema[];
  $ref?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean;
  exclusiveMaximum?: boolean;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

/** Convert OpenAPI spec to our IR format */
export async function openapiToIR(
  spec: OpenAPISpec,
  config: Partial<GenerationConfig> = {}
): Promise<APISchemaIR> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Extract all schemas from components
  const schemas = spec.components?.schemas || {};
  
  // Collect response schemas from all operations
  const responseSchemas = new Map<string, OpenAPISchema>();
  
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation.responses) continue;
      
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!response.content) continue;
        
        for (const [mediaType, content] of Object.entries(response.content)) {
          if (mediaType.includes('json') && content.schema) {
            const name = operation.operationId || `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
            responseSchemas.set(name, content.schema);
          }
        }
      }
    }
  }
  
  // Combine component schemas and response schemas
  const allSchemas = { ...schemas };
  for (const [name, schema] of responseSchemas) {
    if (!allSchemas[name]) {
      allSchemas[name] = schema;
    }
  }
  
  // Convert JSON schemas to our IR
  const ir = convertJSONSchemaToIR(allSchemas, fullConfig);
  
  // Set roots to the response schema names (prioritize actual API responses)
  ir.roots = Array.from(responseSchemas.keys()).length > 0 
    ? Array.from(responseSchemas.keys()) 
    : Array.from(Object.keys(schemas));
  
  // Add metadata
  ir.metadata = {
    sampleCount: ir.roots.length,
    generatedAt: new Date().toISOString(),
    config: fullConfig,
  };
  
  return ir;
}

/** Direct JSON Schema to IR conversion */
function convertJSONSchemaToIR(
  schemas: Record<string, OpenAPISchema>,
  config: GenerationConfig
): APISchemaIR {
  const types = new Map<string, NamedTypeIR>();
  const recursiveTypes = new Set<string>();
  const discriminatedUnions = new Map<string, { discriminator: string; members: string[] }>();
  const processed = new Set<string>();
  const processing = new Set<string>();
  
  // Detect discriminated unions
  for (const [name, schema] of Object.entries(schemas)) {
    if (schema.oneOf || schema.anyOf) {
      const unionSchemas = schema.oneOf || schema.anyOf || [];
      const members = unionSchemas
        .map(s => s.$ref?.replace('#/components/schemas/', ''))
        .filter((m): m is string => Boolean(m));
      
      if (members.length > 0) {
        // Try to find discriminator property
        const firstSchema = schemas[members[0]!];
        if (firstSchema?.properties) {
          const discProp = Object.keys(firstSchema.properties).find(
            k => config.discriminatorFields.includes(k.toLowerCase())
          );
          if (discProp) {
            discriminatedUnions.set(name, { discriminator: discProp, members });
          }
        }
      }
    }
  }
  
  // Convert each schema
  function convertSchema(name: string, schema: OpenAPISchema, isRoot = false): TypeIR {
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
      // Handle $ref
      if (schema.$ref) {
        const refName = schema.$ref.replace('#/components/schemas/', '');
        processed.add(name);
        processing.delete(name);
        return { kind: 'reference', name: refName };
      }
      
      // Handle allOf (intersection)
      if (schema.allOf) {
        const typesArr = schema.allOf.map((s, i) => convertSchema(`${name}_AllOf${i}`, s));
        const result: IntersectionTypeIR = typesArr.length === 1 
          ? { kind: 'intersection', types: typesArr }
          : { kind: 'intersection', types: typesArr };
        processed.add(name);
        processing.delete(name);
        return result;
      }
      
      // Handle anyOf/oneOf (union)
      if (schema.anyOf || schema.oneOf) {
        const unionSchemas = schema.anyOf || schema.oneOf || [];
        const typesArr = unionSchemas.map((s, i) => convertSchema(`${name}_Union${i}`, s));
        const result: UnionTypeIR = { kind: 'union', types: typesArr };
        processed.add(name);
        processing.delete(name);
        return result;
      }
      
      // Handle nullable
      if (schema.nullable) {
        const inner = convertSchema(name, { ...schema, nullable: false });
        const result: UnionTypeIR = { kind: 'union', types: [inner, { kind: 'null' }] };
        processed.add(name);
        processing.delete(name);
        return result;
      }
      
      // Handle basic types
      const type = schema.type || 'object';
      
      switch (type) {
        case 'string': {
          const str: StringTypeIR = { kind: 'string' };
          if (schema.format) str.format = schema.format as StringTypeIR['format'];
          if (schema.enum) str.enum = schema.enum as string[];
          if (schema.pattern) str.pattern = schema.pattern;
          if (schema.minLength) str.minLength = schema.minLength;
          if (schema.maxLength) str.maxLength = schema.maxLength;
          processed.add(name);
          processing.delete(name);
          return str;
        }
        
        case 'number':
        case 'integer': {
          const num: NumberTypeIR = { kind: 'number', format: type === 'integer' ? 'int32' : 'float' };
          if (schema.minimum !== undefined) num.minimum = schema.minimum;
          if (schema.maximum !== undefined) num.maximum = schema.maximum;
          if (schema.exclusiveMinimum) num.exclusiveMinimum = schema.exclusiveMinimum;
          if (schema.exclusiveMaximum) num.exclusiveMaximum = schema.exclusiveMaximum;
          if (schema.multipleOf) num.multipleOf = schema.multipleOf;
          processed.add(name);
          processing.delete(name);
          return num;
        }
        
        case 'boolean': {
          processed.add(name);
          processing.delete(name);
          return { kind: 'boolean' };
        }
        
        case 'array': {
          const items = schema.items ? convertSchema(`${name}_Item`, schema.items) : { kind: 'any' };
          const result: ArrayTypeIR = { kind: 'array', items: items as TypeIR };
          processed.add(name);
          processing.delete(name);
          return result;
        }
        
        case 'object': {
          if (!schema.properties && !schema.additionalProperties) {
            processed.add(name);
            processing.delete(name);
            return { kind: 'any' } as AnyTypeIR;
          }
          
          const properties: PropertyIR[] = [];
          
          if (schema.properties) {
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
              const required = schema.required?.includes(propName) ?? false;
              properties.push({
                name: propName,
                type: convertSchema(`${name}_${propName}`, propSchema),
                optional: !required,
                nullable: propSchema.nullable ?? false,
                description: propSchema.description,
              });
            }
          }
          
          const required = schema.required || [];
          
          const result: ObjectTypeIR = { kind: 'object', properties, required };
          
          if (isRoot) {
            types.set(name, { 
              name, 
              type: result, 
              merged: false, 
              sources: 1 
            });
          }
          
          processed.add(name);
          processing.delete(name);
          return result;
        }
        
        default: {
          processed.add(name);
          processing.delete(name);
          return { kind: 'any' };
        }
      }
    } catch (e) {
      processing.delete(name);
      processed.add(name);
      return { kind: 'any' };
    }
  }
  
  // Process all schemas
  for (const [name, schema] of Object.entries(schemas)) {
    if (!processed.has(name)) {
      convertSchema(name, schema, true);
    }
  }
  
  return {
    types,
    roots: [],
    discriminatedUnions,
    recursiveTypes,
    metadata: {
      sampleCount: 0,
      generatedAt: new Date().toISOString(),
      config,
    },
  };
}

/** Resolve $ref references in schema */
function resolveRefs(schema: OpenAPISchema, allSchemas: Record<string, OpenAPISchema>): OpenAPISchema {
  if (!schema || typeof schema !== 'object') return schema;
  
  if (schema.$ref) {
    const refName = schema.$ref.replace('#/components/schemas/', '');
    const refSchema = allSchemas[refName];
    if (refSchema) {
      return { ...resolveRefs(refSchema, allSchemas), ...schema };
    }
    return schema;
  }
  
  const resolved: any = { ...schema };
  
  for (const key of Object.keys(schema)) {
    const value = schema[key as keyof OpenAPISchema];
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        resolved[key] = value.map(v => resolveRefs(v as OpenAPISchema, allSchemas));
      } else {
        resolved[key] = resolveRefs(value as OpenAPISchema, allSchemas);
      }
    }
  }
  
  return resolved;
}

/** Load OpenAPI spec from file */
export async function loadOpenAPISpec(filePath: string): Promise<OpenAPISpec> {
  const fs = await import('fs/promises');
  const content = await fs.readFile(filePath, 'utf-8');
  
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    const yaml = await import('js-yaml');
    return yaml.load(content) as OpenAPISpec;
  }
  
  return JSON.parse(content);
}
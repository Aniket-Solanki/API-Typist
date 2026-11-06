/** CLI entry point for api-typist */

import { mergeSamples, MergeOptions } from './merge.js';
import { generateCode, GenerationConfig } from './generate.js';
import { openapiToIR, loadOpenAPISpec } from './openapi.js';
import { graphqlToIR, loadGraphQLIntrospection } from './graphql.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CLIOptions {
  command: 'merge' | 'openapi' | 'graphql' | 'watch' | 'init';
  input: string;
  output: string;
  framework: GenerationConfig['framework'];
  validator: GenerationConfig['validator'];
  baseUrl?: string;
  headers?: Record<string, string>;
  namingConvention: GenerationConfig['namingConvention'];
  configFile?: string;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    command: 'merge',
    input: '',
    output: './generated',
    framework: 'tanstack-query',
    validator: 'zod',
    namingConvention: 'pascal-case',
  };

  // Check for subcommand first
  if (args.length > 0 && args[0] && !args[0].startsWith('-')) {
    const cmd = args[0] as any;
    if (['merge', 'openapi', 'graphql', 'watch', 'init'].includes(cmd)) {
      options.command = cmd;
      args.shift();
    }
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-i':
      case '--input':
        i++;
        options.input = args[i] ?? '';
        break;
      case '-o':
      case '--output':
        i++;
        options.output = args[i] ?? '';
        break;
      case '-f':
      case '--framework':
        i++;
        options.framework = (args[i] as GenerationConfig['framework']) ?? 'tanstack-query';
        break;
      case '-v':
      case '--validator':
        i++;
        options.validator = (args[i] as GenerationConfig['validator']) ?? 'zod';
        break;
      case '--base-url':
        i++;
        options.baseUrl = args[i];
        break;
      case '--naming':
        i++;
        options.namingConvention = (args[i] as GenerationConfig['namingConvention']) ?? 'pascal-case';
        break;
      case '-c':
      case '--config':
        i++;
        options.configFile = args[i];
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  // Load config file if it exists
  const configPath = options.configFile || 'api-typist.config.json';
  if (existsSync(configPath)) {
    try {
      const configContent = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);
      Object.assign(options, config);
    } catch (e) {
      if (options.configFile) {
        console.error(`Error reading config file: ${configPath}`);
        process.exit(1);
      }
    }
  }

  if (options.command !== 'init' && !options.input) {
    console.error('Error: --input is required');
    printHelp();
    process.exit(1);
  }

  return options;
}

function printHelp() {
  console.log(`
api-typist - Generate TypeScript types, schemas, and API clients from JSON samples, OpenAPI specs, or GraphQL schemas

Usage:
  api-typist <command> -i <input> -o <output-dir> [options]

Commands:
  merge       Merge JSON samples and generate code
  openapi     Generate from OpenAPI/Swagger spec
  graphql     Generate from GraphQL introspection JSON
  watch       Watch input files and regenerate on change
  init        Initialize a new project with a config file

Options:
  -i, --input <file>           Input JSON file, directory of samples, OpenAPI spec, or GraphQL JSON
  -o, --output <dir>           Output directory (default: ./generated)
  -f, --framework <name>       Framework: tanstack-query | swr | rtk-query | fetch | axios | ky
  -v, --validator <name>       Validator: zod | valibot | none
  -c, --config <file>          Path to config file (default: api-typist.config.json)
  --base-url <url>             Base URL for API endpoints
  --naming <convention>        naming: pascal-case | camel-case | kebab-case
  -h, --help                   Show help
`);
}

async function runWatch(options: CLIOptions) {
  const { watch } = await import('chokidar');
  const inputPath = resolve(options.input);
  
  console.log(`Watching ${inputPath} for changes...`);
  
  const watcher = watch(inputPath, {
    persistent: true,
    ignoreInitial: false,
  });

  const run = async () => {
    try {
      if (options.command === 'openapi') await runOpenAPI(options);
      else if (options.command === 'graphql') await runGraphQL(options);
      else await runMerge(options);
    } catch (err) {
      console.error('Generation failed:', err);
    }
  };

  watcher.on('change', (path) => {
    console.log(`\nFile changed: ${path}. Regenerating...`);
    run();
  });

  // Run once at start
  await run();
}

async function runInit() {
  const configPath = 'api-typist.config.json';
  if (existsSync(configPath)) {
    console.error(`Error: ${configPath} already exists`);
    process.exit(1);
  }

  const defaultConfig = {
    framework: 'tanstack-query',
    validator: 'zod',
    output: './generated',
    namingConvention: 'pascal-case',
    baseUrl: 'https://api.example.com',
  };

  writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  console.log(`Created ${configPath}`);
}

async function runMerge(options: CLIOptions) {
  // Read input samples
  const inputPath = resolve(options.input);
  if (!existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const inputContent = readFileSync(inputPath, 'utf-8');
  let samples: unknown[];
  try {
    samples = JSON.parse(inputContent);
  } catch (e) {
    console.error('Error: Invalid JSON in input file');
    process.exit(1);
  }

  // Convert to SampleInput format
  const sampleInputs = Array.isArray(samples)
    ? samples.map((data, i) => ({ data, source: `sample${i + 1}` }))
    : [{ data: samples, source: 'sample1' }];

  console.log(`Merging ${sampleInputs.length} samples...`);

  // Merge samples into IR
  const mergeOptions: Partial<MergeOptions> = {
    framework: options.framework,
    validator: options.validator,
  };

  const ir = mergeSamples(sampleInputs, mergeOptions);
  console.log(`Generated IR with ${ir.types.size} types and ${ir.roots.length} roots`);

  // Generate code
  const config: Partial<GenerationConfig> = {
    framework: options.framework,
    validator: options.validator,
    outDir: options.output,
    namingConvention: options.namingConvention,
    baseUrl: options.baseUrl,
    headers: options.headers,
  };

  const result = generateCode(ir, config);
  console.log(`Generated ${result.files.length} files:`);

  // Write files
  for (const file of result.files) {
    const fullPath = resolve(file.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content);
    console.log(`  ${file.kind}: ${file.path}`);
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of result.warnings) {
      console.log(`  ⚠ ${w}`);
    }
  }

  console.log('\n✅ Done!');
}

async function runGraphQL(options: CLIOptions) {
  const inputPath = resolve(options.input);
  if (!existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Loading GraphQL introspection from ${inputPath}...`);
  const introspection = await loadGraphQLIntrospection(inputPath);
  console.log(`Loaded GraphQL schema`);

  console.log('Converting to IR...');
  const ir = await graphqlToIR(introspection, {
    framework: options.framework,
    validator: options.validator,
    namingConvention: options.namingConvention,
  });
  console.log(`Generated IR with ${ir.types.size} types and ${ir.roots.length} roots`);

  // Generate code
  const config: Partial<GenerationConfig> = {
    framework: options.framework,
    validator: options.validator,
    outDir: options.output,
    namingConvention: options.namingConvention,
    baseUrl: options.baseUrl,
    headers: options.headers,
  };

  const result = generateCode(ir, config);
  console.log(`Generated ${result.files.length} files:`);

  // Write files
  for (const file of result.files) {
    const fullPath = resolve(file.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content);
    console.log(`  ${file.kind}: ${file.path}`);
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of result.warnings) {
      console.log(`  ⚠ ${w}`);
    }
  }

  console.log('\n✅ Done!');
}

async function runOpenAPI(options: CLIOptions) {
  const inputPath = resolve(options.input);
  if (!existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Loading OpenAPI spec from ${inputPath}...`);
  const spec = await loadOpenAPISpec(inputPath);
  console.log(`Loaded OpenAPI ${spec.openapi || spec.swagger} spec: ${spec.info.title} v${spec.info.version}`);

  console.log('Converting to IR...');
  const ir = await openapiToIR(spec, {
    framework: options.framework,
    validator: options.validator,
    namingConvention: options.namingConvention,
  });
  console.log(`Generated IR with ${ir.types.size} types and ${ir.roots.length} roots`);

  // Generate code
  const config: Partial<GenerationConfig> = {
    framework: options.framework,
    validator: options.validator,
    outDir: options.output,
    namingConvention: options.namingConvention,
    baseUrl: options.baseUrl,
    headers: options.headers,
  };

  const result = generateCode(ir, config);
  console.log(`Generated ${result.files.length} files:`);

  // Write files
  for (const file of result.files) {
    const fullPath = resolve(file.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content);
    console.log(`  ${file.kind}: ${file.path}`);
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of result.warnings) {
      console.log(`  ⚠ ${w}`);
    }
  }

  console.log('\n✅ Done!');
}

// Main
const options = parseArgs();
if (options.command === 'init') {
  runInit();
} else if (options.command === 'watch') {
  runWatch(options).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
} else if (options.command === 'openapi') {
  runOpenAPI(options).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
} else if (options.command === 'graphql') {
  runGraphQL(options).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
} else {
  runMerge(options).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}
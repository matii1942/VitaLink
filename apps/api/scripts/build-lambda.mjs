/**
 * Bundles the two Lambda handlers.
 *
 * Runs on the output of `nest build`, not on the TypeScript sources, and that
 * order is not a preference. esbuild does not implement emitDecoratorMetadata:
 * it never resolves types, so it cannot write the `design:paramtypes` metadata
 * that TypeScript emits — and that metadata is exactly what NestJS reads to
 * know what to inject into each constructor. Bundle the sources directly and
 * everything compiles, then fails at run time with "Nest can't resolve
 * dependencies". So tsc emits, and esbuild only gathers.
 *
 * The output is one file per function, which Terraform zips with its
 * archive_file data source. Nothing here shells out to a zip tool, so the build
 * behaves the same on Windows and on a Linux runner.
 *
 * A note on what dominates the result, because it is not what anyone guesses.
 * Measured with the report this script prints, on both functions:
 *
 *   53%  @prisma/client      4.66 MB
 *    7%  mime-db             0.63 MB
 *    6%  iconv-lite          0.53 MB
 *    2%  soap                0.21 MB
 *
 * Prisma 7 has no Rust engine binary to ship, which is true and misleading: the
 * engine was compiled to WebAssembly and embedded as base64 inside a .js file,
 * and base64 costs a third more than the bytes it carries.
 *
 * There is a lever for it: the generator takes `compilerBuild = "small"`, which
 * swaps a 4.37 MB compiler for a 2.21 MB one and compiles queries more slowly.
 * It was measured against the deployed function and deliberately not taken —
 * the cold start costs 658 ms and the first query costs 1105 ms, so a smaller,
 * slower compiler would save the cheap phase and charge the expensive one. See
 * ADR 0011 before reaching for it.
 *
 * The other thing the report shows is that both functions carry everything. The
 * sync job ships mime-db and iconv-lite, which belong to the HTTP stack it never
 * serves, because it imports NestFactory and NestFactory reaches the Express
 * adapter. The API ships the SOAP client it never calls, because AppModule
 * imports SyncModule. Together that is about a megabyte of each bundle — worth
 * knowing, and not worth restructuring the application for until a cold start
 * has been measured and found wanting.
 */
import { build } from 'esbuild';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'dist-lambda');

const FUNCTIONS = [
  { name: 'api', entry: 'dist/lambda/api.handler.js' },
  { name: 'sync', entry: 'dist/lambda/sync.handler.js' },
];

/**
 * Packages NestJS asks for only if you use the feature, inside a try/catch.
 * esbuild cannot see that they are optional and stops at the first one it
 * cannot resolve, so they are declared external: not bundled, not needed, and
 * never reached at run time.
 */
const OPTIONAL_NEST_DEPENDENCIES = [
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module',
  '@nestjs/websockets',
  '@nestjs/websockets/socket-module',
  'cache-manager',
  'class-transformer',
  'class-transformer/storage',
  'class-validator',
];

/**
 * ESM has no `require`, and some of the CommonJS dependencies that end up in
 * the bundle call it. This gives them one built from the module's own URL.
 */
const ESM_REQUIRE_SHIM =
  "import { createRequire as __createRequire } from 'node:module';" +
  'const require = __createRequire(import.meta.url);';

/**
 * Markers of a development tool that has written itself into the dependency
 * tree. Console Ninja, a VS Code extension, prepends a build hook to
 * node_modules/@nestjs/core/index.js on disk, with an absolute path to the
 * extension inside the developer's home directory. It is useful while writing
 * code and has no business in a deployment artifact: the path does not exist on
 * Lambda, and shipping an editor extension to production is not a thing anyone
 * decided to do.
 *
 * `npm ci` restores the package. This check is here because the failure is
 * otherwise silent — the hook is wrapped in try/catch, so a bundle carrying it
 * runs perfectly well and nobody finds out.
 */
const DEVELOPMENT_TOOL_MARKERS = ['build-hook-start', 'console-ninja', 'wallabyjs'];

async function assertNoDevelopmentTools(outfile) {
  const bundled = await readFile(outfile, 'utf8');
  const found = DEVELOPMENT_TOOL_MARKERS.filter((marker) => bundled.includes(marker));

  if (found.length > 0) {
    throw new Error(
      `${path.basename(path.dirname(outfile))}: the bundle contains a development tool ` +
        `(${found.join(', ')}). Something has patched node_modules. Run \`npm ci\` to restore it, ` +
        'and turn the tool off so it does not patch it again.',
    );
  }
}

/**
 * Groups esbuild's per-input byte counts by the package they came from, so the
 * report answers "what is in here" rather than listing nine hundred files.
 */
function weighByPackage(metafile, outfile) {
  const key = path.relative(root, outfile).split(path.sep).join('/');
  const inputs = metafile.outputs[key]?.inputs ?? {};
  const byPackage = new Map();

  for (const [file, { bytesInOutput }] of Object.entries(inputs)) {
    const at = file.lastIndexOf('node_modules/');
    let owner = 'the project itself';

    if (at !== -1) {
      const rest = file.slice(at + 'node_modules/'.length).split('/');
      owner = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
    }

    byPackage.set(owner, (byPackage.get(owner) ?? 0) + bytesInOutput);
  }

  return [...byPackage.entries()].sort((a, b) => b[1] - a[1]);
}

async function bundle({ name, entry }) {
  const outfile = path.join(outDir, name, 'index.mjs');

  const result = await build({
    entryPoints: [path.join(root, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    // The Lambda runtime this deploys to. Set in one place here and in the
    // Terraform; they have to agree.
    target: 'node22',
    format: 'esm',
    banner: { js: ESM_REQUIRE_SHIM },
    external: [
      ...OPTIONAL_NEST_DEPENDENCIES,
      // The runtime already has the AWS SDK. Bundling a second copy would add
      // megabytes and a version nobody chose.
      '@aws-sdk/*',
    ],
    // Deliberately not minified. A few hundred kilobytes buy stack traces in
    // CloudWatch that name real functions, and this code is read when something
    // has already gone wrong.
    minify: false,
    // Asked for so the build can say what it is shipping. A Lambda package
    // whose size nobody has looked at is a cold start nobody can explain.
    metafile: true,
    logLevel: 'warning',
  });

  await assertNoDevelopmentTools(outfile);

  const { size } = await stat(outfile);
  return { name, outfile, size, weights: weighByPackage(result.metafile, outfile) };
}

/**
 * Looks for the patch before bundling rather than after.
 *
 * esbuild follows the injected require into the extension's own bundle and
 * fails on a dozen template engines it optionally supports, which arrives as a
 * wall of errors about packages this project has never heard of. One line
 * naming the real cause is worth more than all of them.
 */
async function assertDependenciesAreNotPatched() {
  const suspects = ['@nestjs/core/index.js', '@nestjs/common/index.js'];

  for (const suspect of suspects) {
    const file = path.join(root, 'node_modules', suspect);
    let contents;

    try {
      contents = await readFile(file, 'utf8');
    } catch {
      continue;
    }

    if (DEVELOPMENT_TOOL_MARKERS.some((marker) => contents.includes(marker))) {
      console.error(
        `\nnode_modules/${suspect} has been patched by a development tool.\n\n` +
          'Console Ninja, a VS Code extension, writes a build hook into installed\n' +
          'packages and re-writes it whenever the editor opens the project, so\n' +
          'pausing it is not enough. Uninstall it, or turn off its automatic\n' +
          'support for Nest, then run `npm ci` to restore the package.\n\n' +
          'This build stops here because the hook would otherwise travel into the\n' +
          'deployment package, wrapped in a try/catch, and fail in silence.\n',
      );
      process.exit(1);
    }
  }
}

await assertDependenciesAreNotPatched();
await mkdir(outDir, { recursive: true });

try {
  await readdir(path.join(root, 'dist', 'lambda'));
} catch {
  console.error(
    'dist/lambda is missing. Run `npm run build` first: esbuild bundles the\n' +
      'compiled output, not the TypeScript sources. See the comment at the top\n' +
      'of this file for why.',
  );
  process.exit(1);
}

const built = await Promise.all(FUNCTIONS.map(bundle));

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

for (const { name, size, weights } of built) {
  console.log(`\n${name} — ${mb(size)}`);

  for (const [owner, bytes] of weights.slice(0, 12)) {
    const share = ((bytes / size) * 100).toFixed(1).padStart(5);
    console.log(`  ${share}%  ${mb(bytes).padStart(8)}  ${owner}`);
  }

  const rest = weights.slice(12).reduce((sum, [, bytes]) => sum + bytes, 0);
  if (rest > 0) console.log(`         ${mb(rest).padStart(8)}  everything else`);
}

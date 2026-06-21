// ============================================================
// Runs each spec file in its own separate `wdio run` invocation, one
// at a time, rather than letting WDIO spawn one worker per spec file
// simultaneously (a well-documented WDIO behavior: maxInstances does
// NOT reliably force serial execution across multiple spec files with
// Mocha - see https://github.com/webdriverio/webdriverio/discussions/15053).
//
// This matters here because our specs share real backend/DB state and
// drive real Chrome instances - running 3 simultaneously on a typical
// dev laptop caused one Chrome session to become unresponsive and die
// mid-test ("invalid session id") during actual testing, not just in
// theory.
// ============================================================

const { spawnSync } = require('child_process');
const { globSync } = require('glob');

const specFiles = globSync('specs/**/*.spec.js', { cwd: __dirname }).sort();

if (specFiles.length === 0) {
    console.error('No spec files found under specs/**/*.spec.js');
    process.exit(1);
}

console.log(`Running ${specFiles.length} spec file(s) sequentially:\n${specFiles.join('\n')}\n`);

let anyFailed = false;

for (const spec of specFiles) {
    console.log(`\n${'='.repeat(60)}\nRunning: ${spec}\n${'='.repeat(60)}`);

    const result = spawnSync('npx', ['wdio', 'run', 'wdio.conf.js', '--spec', spec], {
        cwd: __dirname,
        stdio: 'inherit',
        env: process.env,
        // shell: true lets Node resolve 'npx' the same way a terminal
        // would (checking PATH, .cmd extensions on Windows, etc.)
        // instead of trying to spawn it as a literal executable name,
        // which is a common source of silent ENOENT-style failures on
        // Windows specifically.
        shell: true,
    });

    if (result.error) {
        // spawnSync failed to even launch the process - this is
        // different from the process launching and then failing its
        // tests. Surface the real reason instead of just reporting a
        // null exit code with no explanation.
        anyFailed = true;
        console.error(`\nFailed to launch test process for ${spec}:`);
        console.error(result.error);
        continue;
    }

    if (result.status !== 0) {
        anyFailed = true;
        console.error(`\nSpec failed: ${spec} (exit code ${result.status})`);
        // Keep going rather than stopping at the first failure - same
        // as the original all-at-once run, so you get a full picture
        // of every spec's result in one pass instead of stopping early.
    }
}

process.exit(anyFailed ? 1 : 0);

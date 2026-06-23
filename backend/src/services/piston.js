const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Wraps student code so all test cases run in one execution.
// Uses the actual function name from the question (e.g. twoSum, not hardcoded 'solution').
// stdin: JSON array of arg-lists  →  stdout: JSON array of {result, error}
const WRAPPER_TEMPLATE = `
import json, sys, io as _io

{student_code}

_fn = {function_name}
_inputs = json.loads(sys.stdin.read())
_results = []
for _args in _inputs:
    _saved = sys.stdout
    sys.stdout = _io.StringIO()
    try:
        _ret = _fn(*_args)
        sys.stdout = _saved
        _results.append({"result": _ret, "error": None})
    except Exception as _e:
        sys.stdout = _saved
        _results.append({"result": None, "error": type(_e).__name__ + ": " + str(_e)})

print(json.dumps(_results, ensure_ascii=False))
`;

// On Windows 'python' works; on Linux/Mac CI runners 'python3' is the command.
function getPythonCmd() {
    return process.platform === 'win32' ? 'python' : 'python3';
}

async function runPython(studentCode, testCaseArgsList, functionName = 'solution') {
    const code = WRAPPER_TEMPLATE
        .replace('{student_code}', studentCode)
        .replace('{function_name}', functionName);

    const tmpFile = path.join(os.tmpdir(), `cp_${crypto.randomBytes(8).toString('hex')}.py`);
    fs.writeFileSync(tmpFile, code, 'utf8');

    return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let killed = false;

        const proc = spawn(getPythonCmd(), [tmpFile]);

        const killer = setTimeout(() => {
            killed = true;
            proc.kill('SIGTERM');
        }, 10000);

        proc.stdin.write(JSON.stringify(testCaseArgsList));
        proc.stdin.end();

        proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

        proc.on('close', () => {
            clearTimeout(killer);
            fs.unlink(tmpFile, () => {});
            if (killed) {
                resolve({ run: { stdout: '', stderr: 'Time limit exceeded (10 seconds)' } });
            } else {
                resolve({ run: { stdout, stderr } });
            }
        });

        proc.on('error', (err) => {
            clearTimeout(killer);
            fs.unlink(tmpFile, () => {});
            reject(new Error(`Python not found on this server. Make sure Python is installed. (${err.message})`));
        });
    });
}

module.exports = { runPython };

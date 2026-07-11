import { spawn } from 'child_process';
import { chmod, mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import { env } from '../../config/env.js';
import * as pool from './pool.service.js';

// Docker Desktop (linuxkit VM) adds ~15-35s of container startup overhead.
// This buffer is subtracted from the wall-clock time to get actual code runtime.
const DOCKER_STARTUP_OVERHEAD_MS = 35_000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runnerTmpRoot = path.resolve(__dirname, '../../../../.runner-tmp');

const LANGUAGE_CONFIG = {
  python: {
    image: env.docker.images.python,
    fileName: 'main.py',
    command: ['python3', '/workspace/main.py']
  },
  java: {
    image: env.docker.images.java,
    fileName: 'Main.java',
    // Alpine uses busybox sh — use -c not -lc
    command: [
      'sh',
      '-c',
      'javac /workspace/Main.java && java -Xss512k -Xmx200m -cp /workspace Main'
    ]
  },
  cpp: {
    image: env.docker.images.cpp,
    fileName: 'main.cpp',
    // Alpine uses busybox sh — use -c not -lc
    command: [
      'sh',
      '-c',
      'g++ -std=c++17 -O2 -pipe /workspace/main.cpp -o /workspace/main && /workspace/main'
    ]
  }
};

function dockerArgs({ image, workdir, containerName, timeoutMs, memoryMb }) {
  const memory = memoryMb ? `${memoryMb}m` : env.docker.memory;

  return [
    'run',
    '--rm',
    '--name',
    containerName,
    '--network',
    'none',
    '--memory',
    memory,
    '--memory-swap',
    memory,
    '--cpus',
    env.docker.cpus,
    '--pids-limit',
    env.docker.pidsLimit,
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--tmpfs',
    `/tmp:rw,noexec,nosuid,size=${env.docker.tmpfsSize}`,
    '--workdir',
    '/workspace',
    '-v',
    `${workdir}:/workspace:rw`,
    image
  ];
}

function classifyFailure({ stderr, timedOut, signal, exitCode }) {
  if (timedOut || signal === 'SIGKILL' || exitCode === 124) {
    return 'Time Limit Exceeded';
  }

  const text = stderr || '';
  if (/javac|g\+\+|SyntaxError|IndentationError|compilation|compile/i.test(text)) {
    return 'Compilation Error';
  }

  return 'Runtime Error';
}

async function forceRemoveContainer(containerName) {
  await new Promise((resolve) => {
    const child = spawn('docker', ['rm', '-f', containerName], {
      stdio: 'ignore'
    });
    child.on('close', resolve);
    child.on('error', resolve);
  });
}

function runDockerProcess({ args, input, timeoutMs, containerName }) {
  return new Promise((resolve, reject) => {
    const wallStart = process.hrtime.bigint();
    const child = spawn('docker', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Wall-clock budget = code time limit + Docker startup overhead.
    // This prevents killing the container before it even starts.
    const wallBudgetMs = timeoutMs + DOCKER_STARTUP_OVERHEAD_MS;

    const timer = setTimeout(async () => {
      timedOut = true;
      child.kill('SIGKILL');
      await forceRemoveContainer(containerName);
    }, wallBudgetMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      const wallEnd = process.hrtime.bigint();
      const wallMs = Number((wallEnd - wallStart) / 1_000_000n);

      // Subtract startup overhead so reported runtime reflects only code execution.
      const runtimeMs = Math.max(0, wallMs - DOCKER_STARTUP_OVERHEAD_MS);

      // Treat as TLE if the wall clock exceeded the budget OR if the actual
      // code runtime (after subtracting overhead) exceeded the code time limit.
      const codeTle = !timedOut && runtimeMs > timeoutMs;

      resolve({
        stdout,
        stderr,
        exitCode,
        signal,
        timedOut: timedOut || codeTle,
        runtimeMs
      });
    });

    child.stdin.end(input ?? '');
  });
}

function runHostProcess({ command, args, input, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const wallStart = process.hrtime.bigint();
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      const wallEnd = process.hrtime.bigint();
      const wallMs = Number((wallEnd - wallStart) / 1_000_000n);

      resolve({
        stdout,
        stderr,
        exitCode,
        signal,
        timedOut,
        runtimeMs: wallMs
      });
    });

    child.stdin.end(input ?? '');
  });
}

export async function executeCode({
  language,
  code,
  input = '',
  timeoutMs = env.docker.timeoutMs,
  memoryLimitMb,
  runOnHost = false
}) {
  const config = LANGUAGE_CONFIG[language];
  if (!config) {
    const error = new Error(`Unsupported language: ${language}`);
    error.status = 400;
    throw error;
  }

  if (runOnHost) {
    const jobId = nanoid();
    const workdir = path.join(runnerTmpRoot, `coding-job-${jobId}`);
    await mkdir(workdir, { recursive: true });
    await chmod(workdir, 0o777);
    const sourcePath = path.join(workdir, config.fileName);
    await writeFile(sourcePath, code, 'utf8');
    await chmod(sourcePath, 0o666);

    try {
      const result = await runHostProcess({
        command: config.command[0],
        args: config.command.slice(1).map(arg => arg === '/workspace/main.py' ? sourcePath : arg),
        input,
        timeoutMs
      });

      // Parse timing from stderr and clean it up
      let cleanStderr = result.stderr || '';
      let executionMs = result.runtimeMs;
      const match = cleanStderr.match(/EXECUTION_TIME_MS:([0-9.]+)/);
      if (match) {
        executionMs = Math.max(0, Math.round(parseFloat(match[1])));
        cleanStderr = cleanStderr.replace(/EXECUTION_TIME_MS:[0-9.]+\r?\n?/, '').trim();
      }

      if (result.exitCode === 0 && !result.timedOut) {
        return {
          ok: true,
          output: result.stdout,
          error: null,
          stderr: cleanStderr || null,
          runtimeMs: executionMs,
          verdict: null
        };
      }

      const verdict = classifyFailure(result);
      return {
        ok: false,
        output: result.stdout,
        error: cleanStderr || verdict,
        stderr: cleanStderr || null,
        runtimeMs: executionMs,
        verdict
      };
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  }

  // Running inside the Warm Container Pool via TCP
  let attempts = 0;
  const maxAttempts = 3;
  let lastError;

  while (attempts < maxAttempts) {
    attempts++;
    const container = await pool.acquire(language);
    try {
      const poolRes = await pool.executeOnContainer(container, code, input, timeoutMs);
      
      let cleanStderr = poolRes.stderr || '';
      let executionMs = poolRes.runtimeMs;
      const match = cleanStderr.match(/EXECUTION_TIME_MS:([0-9.]+)/);
      if (match) {
        executionMs = Math.max(0, Math.round(parseFloat(match[1])));
        cleanStderr = cleanStderr.replace(/EXECUTION_TIME_MS:[0-9.]+\r?\n?/, '').trim();
      }

      const verdict = poolRes.timedOut 
        ? 'Time Limit Exceeded' 
        : (poolRes.ok 
            ? null 
            : (cleanStderr.includes('javac') || cleanStderr.includes('g++') || cleanStderr.includes('compilation') || cleanStderr.includes('compile') 
                ? 'Compilation Error' 
                : 'Runtime Error'));

      return {
        ok: poolRes.ok,
        output: poolRes.stdout,
        error: poolRes.ok ? null : (cleanStderr || verdict),
        stderr: cleanStderr || null,
        runtimeMs: executionMs,
        verdict
      };
    } catch (err) {
      lastError = err;
      if (err.message && (err.message.includes('ECONNREFUSED') || err.message.includes('socket') || err.message.includes('connection'))) {
        console.warn(`Connection to container ${container.name} failed (attempt ${attempts}/${maxAttempts}). Retrying on a different container...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      throw err;
    } finally {
      await pool.release(container);
    }
  }

  throw lastError || new Error('Warm container execution failed after maximum retries');
}


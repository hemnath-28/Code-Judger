import { exec } from 'child_process';
import { promisify } from 'util';
import net from 'net';
import { env } from '../../config/env.js';

const execAsync = promisify(exec);

// Prevent Docker API version mismatch errors on local systems
process.env.DOCKER_API_VERSION = process.env.DOCKER_API_VERSION || '1.54';


const DYNAMIC_PORT_START = Math.floor(Math.random() * 20000) + 15000;

const POOL_CONFIG = {
  python: { size: 3, portStart: DYNAMIC_PORT_START, image: env.docker.images.python },
  java:   { size: 1,   portStart: DYNAMIC_PORT_START + 150, image: env.docker.images.java },
  cpp:    { size: 1,   portStart: DYNAMIC_PORT_START + 300, image: env.docker.images.cpp }
};

const MAX_RUNS_BEFORE_RECYCLE = 100;

const containers = {
  python: [],
  java: [],
  cpp: []
};

const waitingQueues = {
  python: [],
  java: [],
  cpp: []
};

const RUN_ID = Math.random().toString(36).substring(2, 6);

let poolInitialized = false;

function getContainerName(lang, index) {
  return `pool-${RUN_ID}-${lang}-${index}`;
}

async function startContainer(lang, index, port) {
  const name = getContainerName(lang, index);
  const image = POOL_CONFIG[lang].image;
  
  // Clean up any existing container with the same name
  try {
    await execAsync(`docker rm -f ${name}`);
  } catch (e) {}

  const runCmd = [
    'docker run -d',
    `--name ${name}`,
    '--network coding-bridge',
    `--memory ${env.docker.memory}`,
    `--memory-swap ${env.docker.memory}`,
    `--cpus ${env.docker.cpus}`,
    `--pids-limit ${env.docker.pidsLimit}`,
    '--cap-drop ALL',
    `--tmpfs /workspace:rw,noexec,nosuid,size=${env.docker.tmpfsSize}`,
    `-p ${port}:8080`,
    image
  ].join(' ');

  await execAsync(runCmd);
}

export async function initPool() {
  if (poolInitialized) return;
  console.log('Initializing Warm Container Pool...');
  
  // Ensure the bridge network exists (plain bridge so port-publishing works)
  try {
    await execAsync('docker network create coding-bridge');
  } catch (e) {}

  // Bulk cleanup of ALL pool containers (running, created, dead, exited) to free host ports
  // Uses a 10s timeout so the server doesn't hang if Docker has deadlocked "removal in progress" containers.
  try {
    const listCmd = 'docker ps -aq --filter "name=pool-"';
    const { stdout } = await execAsync(listCmd, { timeout: 5000 });
    const ids = stdout.trim();
    if (ids) {
      console.log('Removing all old pool containers to free ports...');
      await execAsync(`docker rm -f ${ids.split('\n').join(' ')}`, { timeout: 10000 });
    }
  } catch (e) {
    // Ignore cleanup errors (e.g. Docker containerd zombie containers in "removal in progress").
    // New containers use unique RUN_ID names so they won't conflict with orphaned ones.
  }


  const tasks = [];

  for (const lang of Object.keys(POOL_CONFIG)) {
    const config = POOL_CONFIG[lang];
    for (let i = 0; i < config.size; i++) {
      const port = config.portStart + i;
      
      containers[lang].push({
        name: getContainerName(lang, i),
        lang,
        port,
        index: i,
        status: 'idle',
        runs: 0
      });

      tasks.push({ lang, index: i, port });
    }
  }

  // Concurrency-limited execution (max 3 concurrent container starts)
  const CONCURRENCY_LIMIT = 10;
  const executing = new Set();
  for (const task of tasks) {
    const p = (async () => {
      console.log(`Starting warm container ${getContainerName(task.lang, task.index)} on port ${task.port}...`);
      await startContainer(task.lang, task.index, task.port);
    })();
    
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    
    if (executing.size >= CONCURRENCY_LIMIT) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);

  poolInitialized = true;
  console.log('Warm Container Pool Initialized successfully.');
}

export async function shutdownPool() {
  if (!poolInitialized) return;
  console.log('\nShutting down Warm Container Pool...');
  
  const stopPromises = [];
  for (const lang of Object.keys(POOL_CONFIG)) {
    for (const container of containers[lang]) {
      stopPromises.push((async () => {
        try {
          console.log(`Stopping container ${container.name}...`);
          await execAsync(`docker rm -f ${container.name}`);
        } catch (e) {}
      })());
    }
  }
  await Promise.all(stopPromises);
  
  poolInitialized = false;
  console.log('Warm Container Pool Shutdown complete.');
}

export function acquire(lang) {
  return new Promise((resolve) => {
    const list = containers[lang];
    if (!list) {
      throw new Error(`Unsupported pool language: ${lang}`);
    }

    const idle = list.find(c => c.status === 'idle');
    if (idle) {
      idle.status = 'busy';
      resolve(idle);
    } else {
      waitingQueues[lang].push(resolve);
    }
  });
}

export async function release(container) {
  const lang = container.lang;
  container.runs++;

  // Recycle container if it reaches run threshold
  if (container.runs >= MAX_RUNS_BEFORE_RECYCLE) {
    console.log(`Recycling container ${container.name} after ${container.runs} runs...`);
    container.status = 'recycling';
    container.runs = 0;
    
    try {
      await startContainer(lang, container.index, container.port);
    } catch (e) {
      console.error(`Failed to recycle container ${container.name}:`, e);
    }
  }

  const queue = waitingQueues[lang];
  if (queue.length > 0) {
    const nextResolve = queue.shift();
    container.status = 'busy';
    nextResolve(container);
  } else {
    container.status = 'idle';
  }
}

export function executeOnContainer(container, code, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let dataBuffer = Buffer.alloc(0);
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.destroy();
        resolve({
          ok: false,
          exitCode: 124,
          timedOut: true,
          runtimeMs: timeoutMs,
          stdout: '',
          stderr: 'Time Limit Exceeded'
        });
      }
    }, timeoutMs + 1000); // 1s buffer beyond execution limit

    client.connect(container.port, '127.0.0.1', () => {
      // Serialize request payload
      const codeBuf = Buffer.from(code, 'utf8');
      const inputBuf = Buffer.from(input, 'utf8');
      const headerBuf = Buffer.alloc(12);

      headerBuf.writeUInt32BE(codeBuf.length, 0);
      headerBuf.writeUInt32BE(inputBuf.length, 4);
      headerBuf.writeUInt32BE(timeoutMs, 8);

      const payload = Buffer.concat([headerBuf, codeBuf, inputBuf]);
      client.write(payload);
      client.end(); // Half-close socket (signal EOF)
    });

    client.on('data', (chunk) => {
      dataBuffer = Buffer.concat([dataBuffer, chunk]);
    });

    client.on('end', () => {
      processResponse();
    });

    client.on('close', () => {
      processResponse();
    });

    function processResponse() {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);

      if (dataBuffer.length < 17) {
        return resolve({
          ok: false,
          exitCode: 1,
          timedOut: false,
          runtimeMs: 0,
          stdout: '',
          stderr: `Invalid socket response format (received ${dataBuffer.length} bytes)`
        });
      }

      // Parse binary header (17 bytes)
      const exitCode = dataBuffer.readInt32BE(0);
      const timedOut = dataBuffer.readUInt8(4) === 1;
      const runtimeMs = dataBuffer.readUInt32BE(5);
      const stdoutLen = dataBuffer.readUInt32BE(9);
      const stderrLen = dataBuffer.readUInt32BE(13);

      const expectedTotal = 17 + stdoutLen + stderrLen;
      if (dataBuffer.length < expectedTotal) {
        return resolve({
          ok: false,
          exitCode: 1,
          timedOut: false,
          runtimeMs: runtimeMs,
          stdout: '',
          stderr: `Socket stream truncated (expected ${expectedTotal} bytes, got ${dataBuffer.length})`
        });
      }

      const stdout = dataBuffer.subarray(17, 17 + stdoutLen).toString('utf8');
      const stderr = dataBuffer.subarray(17 + stdoutLen, 17 + stdoutLen + stderrLen).toString('utf8');

      resolve({
        ok: exitCode === 0 && !timedOut,
        exitCode,
        timedOut,
        runtimeMs,
        stdout,
        stderr
      });
    }

    client.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: 1,
        timedOut: false,
        runtimeMs: 0,
        stdout: '',
        stderr: `Warm container connection error: ${err.message}`
      });
    });
  });
}

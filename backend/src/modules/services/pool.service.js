import { execSync } from 'child_process';
import net from 'net';
import { env } from '../../config/env.js';

// Prevent Docker API version mismatch errors on local systems
process.env.DOCKER_API_VERSION = process.env.DOCKER_API_VERSION || '1.54';


const POOL_CONFIG = {
  python: { size: 5, portStart: 9000, image: env.docker.images.python },
  java:   { size: 3, portStart: 9005, image: env.docker.images.java },
  cpp:    { size: 3, portStart: 9008, image: env.docker.images.cpp }
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

let poolInitialized = false;

function getContainerName(lang, index) {
  return `coding-pool-${lang}-${index}`;
}

async function startContainer(lang, index, port) {
  const name = getContainerName(lang, index);
  const image = POOL_CONFIG[lang].image;
  
  // Clean up any existing container with the same name
  try {
    execSync(`docker rm -f ${name}`, { stdio: 'ignore' });
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

  console.log(`Starting warm container ${name} on port ${port}...`);
  execSync(runCmd);
}

export async function initPool() {
  if (poolInitialized) return;
  
  console.log('Initializing Warm Container Pool...');
  
  // Ensure the bridge network exists (plain bridge so port-publishing works)
  try {
    execSync('docker network create coding-bridge', { stdio: 'ignore' });
  } catch (e) {}

  // Clean up any legacy pool containers
  try {
    execSync('docker rm -f $(docker ps -a -q --filter "name=coding-pool-")', { stdio: 'ignore' });
  } catch (e) {}


  for (const lang of Object.keys(POOL_CONFIG)) {
    const config = POOL_CONFIG[lang];
    for (let i = 0; i < config.size; i++) {
      const port = config.portStart + i;
      await startContainer(lang, i, port);
      
      containers[lang].push({
        name: getContainerName(lang, i),
        lang,
        port,
        index: i,
        status: 'idle',
        runs: 0
      });
    }
  }

  poolInitialized = true;
  console.log('Warm Container Pool Initialized successfully.');

  // Hook exit handlers for clean shutdown
  process.on('SIGINT', shutdownPool);
  process.on('SIGTERM', shutdownPool);
}

export async function shutdownPool() {
  if (!poolInitialized) return;
  console.log('\nShutting down Warm Container Pool...');
  
  for (const lang of Object.keys(POOL_CONFIG)) {
    for (const container of containers[lang]) {
      try {
        console.log(`Stopping container ${container.name}...`);
        execSync(`docker rm -f ${container.name}`, { stdio: 'ignore' });
      } catch (e) {}
    }
  }
  
  poolInitialized = false;
  console.log('Warm Container Pool Shutdown complete.');
  process.exit(0);
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

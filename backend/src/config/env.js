import dotenv from 'dotenv';

dotenv.config();
// To keep everything in One Place
// easy to Checky
// Type Check
// Cleaner and more maintainable Code
export const env = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/coding_platform',
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379)
  },
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  docker: {
    memory: process.env.DOCKER_MEMORY || '256m',
    cpus: process.env.DOCKER_CPUS || '1',
    timeoutMs: Number(process.env.DOCKER_TIMEOUT_MS || 5000),
    pidsLimit: process.env.DOCKER_PIDS_LIMIT || '128',
    tmpfsSize: process.env.DOCKER_TMPFS_SIZE || '64m',
    images: {
      python: process.env.PYTHON_RUNNER_IMAGE || 'python-runner:3.12',
      java: process.env.JAVA_RUNNER_IMAGE || 'java-runner:21',
      cpp: process.env.CPP_RUNNER_IMAGE || 'cpp-runner:17'
    }
  }
};

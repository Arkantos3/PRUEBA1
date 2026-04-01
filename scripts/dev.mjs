import { spawn } from 'node:child_process';

function run(command, args, extraOptions = {}) {
  return spawn(command, args, {
    shell: true,
    stdio: 'inherit',
    ...extraOptions
  });
}

async function waitForVite(url, attempts = 60) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error('Vite no se ha iniciado a tiempo.');
}

const vite = run('npm', ['run', 'dev:renderer']);

try {
  await waitForVite('http://localhost:5173');
  const electron = run('npm', ['run', 'dev:electron'], {
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: 'http://localhost:5173'
    }
  });

  const closeChildren = () => {
    vite.kill();
    electron.kill();
  };

  process.on('SIGINT', closeChildren);
  process.on('SIGTERM', closeChildren);
} catch (error) {
  console.error(error);
  vite.kill();
  process.exit(1);
}

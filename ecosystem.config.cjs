module.exports = {
  apps: [
    {
      name: 'nod-frontend-5173',
      cwd: './frontend',
      script: 'node_modules/vite/bin/vite.js',
      args: '--port 5173 --host 0.0.0.0',
      interpreter: 'C:/Program Files/nodejs/node.exe',
      env: { NODE_ENV: 'development' }
    },
    {
      name: 'nod-backend-8000',
      cwd: './backend',
      script: 'start.cjs',
      interpreter: 'C:/Program Files/nodejs/node.exe',
      env: { PYTHONUNBUFFERED: '1' }
    }
  ]
};

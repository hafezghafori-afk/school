// PM2 process file. On the server, run:
//   pm2 start deploy/ecosystem.config.js
// from the repository root. PM2 keeps the backend running, restarts it if
// it crashes, and restarts it automatically after a server reboot once you
// also run `pm2 save` + `pm2 startup` (see DEPLOYMENT.md).
module.exports = {
  apps: [
    {
      name: 'school',
      script: './backend/server.js',
      cwd: __dirname + '/..',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};

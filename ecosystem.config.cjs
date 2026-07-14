module.exports = {
  apps: [
    {
      name: 'minutemind-backend',
      script: './backend/server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 6005,
      },
    },
    {
      name: 'minutemind-frontend',
      script: './frontend-server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 6006,
        DIST_PATH: './dist',
        BACKEND_URL: 'http://localhost:6005',
      },
    },
  ],
};

/** PM2 на VPS (Linux). После деплоя: pm2 start ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: "kadrovik-di",
      cwd: __dirname,
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

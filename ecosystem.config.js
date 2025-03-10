module.exports = {
  apps: [{
    name: "whatsapp-bot",
    script: "index.js",
    watch: false,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production"
    },
    error_file: "./logs/err.log",
    out_file: "./logs/out.log",
    instances: 1,
    autorestart: true,
    exec_mode: "fork"
  }]
}
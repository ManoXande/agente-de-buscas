module.exports = {
  apps: [
    {
      name: 'agente-buscas',
      script: './src/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      // Configurações de restart
      max_restarts: 5,
      min_uptime: '10s',
      max_memory_restart: '200M',
      
      // Configurações de log
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Configurações de monitoramento
      monitoring: false,
      pmx: true,
      
      // Configurações de autorestart
      watch: false,
      ignore_watch: [
        'node_modules',
        'logs',
        'data'
      ],
      
      // Variáveis de ambiente
      env_file: '.env',
      
      // Configurações de cluster
      listen_timeout: 8000,
      kill_timeout: 5000,
      
      // Configurações de cron
      cron_restart: '0 4 * * *', // Restart às 4h da manhã
      
      // Configurações de recursos
      node_args: '--max-old-space-size=512',
      
      // Configurações de autoreload
      autorestart: true,
      
      // Configurações de fonte
      source_map_support: true,
      
      // Configurações de time
      time: true
    }
  ],
  
  deploy: {
    production: {
      user: 'deploy',
      host: 'servidor.com',
      ref: 'origin/main',
      repo: 'git@github.com:usuario/agente-buscas.git',
      path: '/var/www/agente-buscas',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      'ssh_options': 'StrictHostKeyChecking=no'
    },
    
    staging: {
      user: 'deploy',
      host: 'staging.servidor.com',
      ref: 'origin/develop',
      repo: 'git@github.com:usuario/agente-buscas.git',
      path: '/var/www/agente-buscas-staging',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env staging',
      'pre-setup': '',
      'ssh_options': 'StrictHostKeyChecking=no'
    }
  }
}; 
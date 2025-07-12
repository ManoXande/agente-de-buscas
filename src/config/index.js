require('dotenv').config();

const config = {
  // Configurações do servidor
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Configurações da API
  apiSecret: process.env.API_SECRET || 'default-secret',
  jwtSecret: process.env.JWT_SECRET || 'default-jwt-secret',
  
  // Configurações dos LLMs
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  
  // Configurações de tokens externos
  githubToken: process.env.GITHUB_TOKEN,
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  
  // Configurações do banco de dados
  dbPath: process.env.DB_PATH || './data/searches.db',
  
  // Configurações de cache
  cacheTtl: parseInt(process.env.CACHE_TTL) || 3600,
  
  // Configurações de rate limiting
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutos
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  
  // Configurações de logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logFile: process.env.LOG_FILE || './logs/app.log',
  
  // Configurações dos MCPs
  mcpServers: {
    firecrawl: {
      name: 'firecrawl',
      url: process.env.MCP_FIRECRAWL_URL || 'http://localhost:3001',
      enabled: !!process.env.FIRECRAWL_API_KEY,
      config: {
        apiKey: process.env.FIRECRAWL_API_KEY,
        maxPages: 10,
        timeout: 30000
      }
    },
    github: {
      name: 'github',
      url: process.env.MCP_GITHUB_URL || 'http://localhost:3002',
      enabled: !!process.env.GITHUB_TOKEN,
      config: {
        token: process.env.GITHUB_TOKEN,
        maxResults: 50
      }
    },
    context7: {
      name: 'context7',
      url: process.env.MCP_CONTEXT7_URL || 'http://localhost:3003',
      enabled: true,
      config: {
        cacheSize: 1000,
        updateInterval: 3600000 // 1 hora
      }
    },
    filesystem: {
      name: 'filesystem',
      url: process.env.MCP_FILESYSTEM_URL || 'http://localhost:3004',
      enabled: true,
      config: {
        allowedPaths: ['./data', './public', './src'],
        maxFileSize: 50 * 1024 * 1024 // 50MB
      }
    }
  },
  
  // Configurações de busca
  search: {
    maxResults: 100,
    timeout: 30000,
    retryCount: 3,
    retryDelay: 1000,
    supportedTypes: [
      'web',
      'github',
      'files',
      'docs',
      'code',
      'all'
    ]
  },
  
  // Configurações de desenvolvimento
  debug: process.env.DEBUG === 'true',
  puppeteerHeadless: process.env.PUPPETEER_HEADLESS !== 'false',
  
  // Configurações de segurança
  security: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
    maxRequestSize: '10mb',
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 horas
    bcryptRounds: 12
  },
  
  // Configurações de WebSocket
  websocket: {
    pingTimeout: 60000,
    pingInterval: 25000,
    maxConnections: 100
  }
};

// Validar configurações obrigatórias
const requiredConfigs = [];

if (config.nodeEnv === 'production') {
  requiredConfigs.push('API_SECRET', 'JWT_SECRET');
}

for (const requiredConfig of requiredConfigs) {
  if (!process.env[requiredConfig]) {
    throw new Error(`Configuração obrigatória faltando: ${requiredConfig}`);
  }
}

module.exports = config; 
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
require('dotenv').config();

const config = require('./config');
const MCPManager = require('./services/mcpManager');
const SearchService = require('./services/searchService');
const DatabaseService = require('./services/databaseService');
const logger = require('./utils/logger');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middlewares de segurança
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimitWindow,
  max: config.rateLimitMax,
  message: 'Muitas requisições. Tente novamente mais tarde.'
});
app.use('/api/', limiter);

// Inicializar serviços
const mcpManager = new MCPManager();
const searchService = new SearchService(mcpManager);
const databaseService = new DatabaseService();

// Middleware para logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} - ${req.ip}`);
  next();
});

// Rotas da API
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    mcpServers: mcpManager.getServerStatus()
  });
});

app.get('/api/mcps', async (req, res) => {
  try {
    const mcps = await mcpManager.listAvailableMCPs();
    res.json(mcps);
  } catch (error) {
    logger.error('Erro ao listar MCPs:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/search', async (req, res) => {
  try {
    const { query, type = 'all', options = {} } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query é obrigatória' });
    }

    // Emitir evento de início da busca
    io.emit('search-started', { query, type });

    const results = await searchService.search(query, type, options);
    
    // Salvar busca no banco
    await databaseService.saveSearch({
      query,
      type,
      results: results.length,
      timestamp: new Date()
    });

    // Emitir resultados
    io.emit('search-completed', { query, results });

    res.json({
      success: true,
      query,
      type,
      results,
      meta: {
        totalResults: results.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Erro na busca:', error);
    io.emit('search-error', { query: req.body.query, error: error.message });
    res.status(500).json({ error: 'Erro durante a busca' });
  }
});

app.get('/api/search/history', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const history = await databaseService.getSearchHistory(page, limit);
    res.json(history);
  } catch (error) {
    logger.error('Erro ao buscar histórico:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/mcp/connect', async (req, res) => {
  try {
    const { serverName, config: serverConfig } = req.body;
    await mcpManager.connectToServer(serverName, serverConfig);
    res.json({ success: true, message: 'MCP conectado com sucesso' });
  } catch (error) {
    logger.error('Erro ao conectar MCP:', error);
    res.status(500).json({ error: 'Erro ao conectar MCP' });
  }
});

app.delete('/api/mcp/disconnect/:serverName', async (req, res) => {
  try {
    const { serverName } = req.params;
    await mcpManager.disconnectFromServer(serverName);
    res.json({ success: true, message: 'MCP desconectado com sucesso' });
  } catch (error) {
    logger.error('Erro ao desconectar MCP:', error);
    res.status(500).json({ error: 'Erro ao desconectar MCP' });
  }
});

// WebSocket para comunicação em tempo real
io.on('connection', (socket) => {
  logger.info(`Cliente conectado: ${socket.id}`);
  
  socket.on('disconnect', () => {
    logger.info(`Cliente desconectado: ${socket.id}`);
  });

  socket.on('search-request', async (data) => {
    try {
      const { query, type, options } = data;
      socket.emit('search-progress', { status: 'Iniciando busca...' });
      
      const results = await searchService.search(query, type, options);
      socket.emit('search-results', { results });
      
      await databaseService.saveSearch({
        query,
        type,
        results: results.length,
        timestamp: new Date()
      });
    } catch (error) {
      socket.emit('search-error', { error: error.message });
    }
  });
});

// Rota padrão - servir o frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Middleware de erro
app.use((err, req, res, next) => {
  logger.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Inicializar servidor
async function startServer() {
  try {
    // Inicializar banco de dados
    await databaseService.init();
    
    // Inicializar MCPs
    await mcpManager.init();
    
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
      logger.info(`🚀 Servidor rodando na porta ${port}`);
      logger.info(`🌐 Interface: http://localhost:${port}`);
      logger.info(`📊 API: http://localhost:${port}/api/health`);
    });
  } catch (error) {
    logger.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Tratamento de sinais para shutdown gracioso
process.on('SIGINT', async () => {
  logger.info('Recebido SIGINT, fazendo shutdown gracioso...');
  await mcpManager.shutdown();
  await databaseService.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Recebido SIGTERM, fazendo shutdown gracioso...');
  await mcpManager.shutdown();
  await databaseService.close();
  process.exit(0);
});

startServer(); 
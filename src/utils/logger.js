const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Garantir que o diretório de logs existe
const logDir = path.dirname(config.logFile);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Formato customizado para logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Formato para console
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    // Adicionar metadados se existirem
    if (Object.keys(meta).length > 0) {
      msg += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return msg;
  })
);

// Configuração dos transportes
const transports = [];

// Console transport
transports.push(
  new winston.transports.Console({
    level: config.debug ? 'debug' : config.logLevel,
    format: consoleFormat,
    handleExceptions: true,
    handleRejections: true
  })
);

// File transport
transports.push(
  new winston.transports.File({
    filename: config.logFile,
    level: config.logLevel,
    format: logFormat,
    handleExceptions: true,
    handleRejections: true,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  })
);

// Error file transport
transports.push(
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    format: logFormat,
    handleExceptions: true,
    handleRejections: true,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  })
);

// Criar logger principal
const logger = winston.createLogger({
  level: config.logLevel,
  format: logFormat,
  transports,
  exitOnError: false
});

// Middleware para logging de requisições HTTP
logger.httpMiddleware = (req, res, next) => {
  const start = Date.now();
  
  // Override do res.end para capturar dados da resposta
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    const contentLength = res.get('Content-Length') || 0;
    
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      contentLength,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress
    });
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

// Função para logging de performance
logger.performance = (operation, duration, metadata = {}) => {
  logger.info('Performance', {
    operation,
    duration: `${duration}ms`,
    ...metadata
  });
};

// Função para logging de busca
logger.search = (query, type, results, duration, metadata = {}) => {
  logger.info('Search', {
    query,
    type,
    results: results.length,
    duration: `${duration}ms`,
    ...metadata
  });
};

// Função para logging de MCP
logger.mcp = (action, server, details = {}) => {
  logger.info('MCP', {
    action,
    server,
    ...details
  });
};

// Função para logging de erros estruturados
logger.errorWithContext = (message, error, context = {}) => {
  logger.error(message, {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    context
  });
};

// Função para logging de debug com contexto
logger.debugWithContext = (message, context = {}) => {
  if (config.debug) {
    logger.debug(message, context);
  }
};

// Stream para integração com Morgan (se necessário)
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

// Função para criar loggers específicos para módulos
logger.createModuleLogger = (moduleName) => {
  return {
    info: (message, meta = {}) => logger.info(message, { module: moduleName, ...meta }),
    error: (message, meta = {}) => logger.error(message, { module: moduleName, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { module: moduleName, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { module: moduleName, ...meta })
  };
};

// Tratamento de exceções não capturadas
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    }
  });
  
  // Dar tempo para o log ser gravado antes de encerrar
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? {
      message: reason.message,
      stack: reason.stack,
      name: reason.name
    } : reason,
    promise: promise.toString()
  });
});

module.exports = logger; 
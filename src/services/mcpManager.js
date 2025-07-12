const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const config = require('../config');

class MCPManager extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map();
    this.servers = new Map();
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 5000;
  }

  async init() {
    logger.info('Inicializando MCP Manager...');
    
    // Conectar aos servidores MCP configurados
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      if (serverConfig.enabled) {
        try {
          await this.connectToServer(name, serverConfig);
        } catch (error) {
          logger.error(`Erro ao conectar com MCP ${name}:`, error);
        }
      }
    }
    
    logger.info(`MCP Manager inicializado com ${this.clients.size} clientes ativos`);
  }

  async connectToServer(name, serverConfig) {
    logger.info(`Conectando ao MCP Server: ${name}`);
    
    try {
      // Criar transporte baseado no tipo
      const transport = await this.createTransport(serverConfig);
      
      // Criar cliente MCP
      const client = new Client({
        name: 'agente-de-buscas',
        version: '1.0.0'
      }, {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      });

      // Conectar ao servidor
      await client.connect(transport);
      
      // Armazenar cliente e configuração
      this.clients.set(name, client);
      this.servers.set(name, serverConfig);
      this.reconnectAttempts.set(name, 0);
      
      // Configurar listeners para reconexão
      client.on('close', () => {
        logger.warn(`Conexão perdida com MCP ${name}`);
        this.handleReconnect(name);
      });
      
      client.on('error', (error) => {
        logger.error(`Erro no MCP ${name}:`, error);
        this.handleReconnect(name);
      });
      
      // Listar capacidades do servidor
      const capabilities = await this.getServerCapabilities(name);
      logger.info(`MCP ${name} conectado com sucesso. Capacidades:`, capabilities);
      
      this.emit('server-connected', { name, capabilities });
      return client;
      
    } catch (error) {
      logger.error(`Falha ao conectar com MCP ${name}:`, error);
      this.emit('server-connection-failed', { name, error: error.message });
      throw error;
    }
  }

  async createTransport(serverConfig) {
    // Para este exemplo, vamos usar stdio transport
    // Em produção, você pode implementar outros transportes (HTTP, WebSocket)
    
    const serverProcess = spawn('npx', [
      `-y`,
      `@modelcontextprotocol/server-${serverConfig.name}`
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return new StdioClientTransport({
      stdin: serverProcess.stdin,
      stdout: serverProcess.stdout,
      stderr: serverProcess.stderr
    });
  }

  async disconnectFromServer(name) {
    logger.info(`Desconectando do MCP Server: ${name}`);
    
    const client = this.clients.get(name);
    if (client) {
      try {
        await client.close();
      } catch (error) {
        logger.error(`Erro ao desconectar MCP ${name}:`, error);
      }
    }
    
    this.clients.delete(name);
    this.servers.delete(name);
    this.reconnectAttempts.delete(name);
    
    this.emit('server-disconnected', { name });
  }

  async handleReconnect(name) {
    const attempts = this.reconnectAttempts.get(name) || 0;
    
    if (attempts >= this.maxReconnectAttempts) {
      logger.error(`Máximo de tentativas de reconexão atingido para MCP ${name}`);
      this.emit('server-reconnect-failed', { name });
      return;
    }
    
    this.reconnectAttempts.set(name, attempts + 1);
    
    setTimeout(async () => {
      try {
        const serverConfig = this.servers.get(name);
        if (serverConfig) {
          await this.connectToServer(name, serverConfig);
        }
      } catch (error) {
        logger.error(`Falha na reconexão para MCP ${name}:`, error);
      }
    }, this.reconnectDelay);
  }

  async getServerCapabilities(name) {
    const client = this.clients.get(name);
    if (!client) {
      throw new Error(`Cliente MCP ${name} não encontrado`);
    }
    
    try {
      const capabilities = {};
      
      // Listar ferramentas disponíveis
      try {
        const tools = await client.listTools();
        capabilities.tools = tools.tools || [];
      } catch (error) {
        logger.debug(`Erro ao listar ferramentas do MCP ${name}:`, error);
        capabilities.tools = [];
      }
      
      // Listar recursos disponíveis
      try {
        const resources = await client.listResources();
        capabilities.resources = resources.resources || [];
      } catch (error) {
        logger.debug(`Erro ao listar recursos do MCP ${name}:`, error);
        capabilities.resources = [];
      }
      
      // Listar prompts disponíveis
      try {
        const prompts = await client.listPrompts();
        capabilities.prompts = prompts.prompts || [];
      } catch (error) {
        logger.debug(`Erro ao listar prompts do MCP ${name}:`, error);
        capabilities.prompts = [];
      }
      
      return capabilities;
    } catch (error) {
      logger.error(`Erro ao obter capacidades do MCP ${name}:`, error);
      return { tools: [], resources: [], prompts: [] };
    }
  }

  async callTool(serverName, toolName, arguments_) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Cliente MCP ${serverName} não encontrado`);
    }
    
    try {
      const result = await client.callTool({
        name: toolName,
        arguments: arguments_
      });
      
      return result;
    } catch (error) {
      logger.error(`Erro ao chamar ferramenta ${toolName} no MCP ${serverName}:`, error);
      throw error;
    }
  }

  async getResource(serverName, uri) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Cliente MCP ${serverName} não encontrado`);
    }
    
    try {
      const result = await client.readResource({ uri });
      return result;
    } catch (error) {
      logger.error(`Erro ao obter recurso ${uri} do MCP ${serverName}:`, error);
      throw error;
    }
  }

  async getPrompt(serverName, name, arguments_) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Cliente MCP ${serverName} não encontrado`);
    }
    
    try {
      const result = await client.getPrompt({
        name,
        arguments: arguments_
      });
      
      return result;
    } catch (error) {
      logger.error(`Erro ao obter prompt ${name} do MCP ${serverName}:`, error);
      throw error;
    }
  }

  getServerStatus() {
    const status = {};
    
    for (const [name, client] of this.clients) {
      status[name] = {
        connected: !!client,
        lastSeen: new Date().toISOString(),
        reconnectAttempts: this.reconnectAttempts.get(name) || 0
      };
    }
    
    return status;
  }

  async listAvailableMCPs() {
    const mcps = [];
    
    for (const [name, client] of this.clients) {
      try {
        const capabilities = await this.getServerCapabilities(name);
        const serverConfig = this.servers.get(name);
        
        mcps.push({
          name,
          connected: true,
          config: serverConfig,
          capabilities,
          status: 'connected'
        });
      } catch (error) {
        mcps.push({
          name,
          connected: false,
          error: error.message,
          status: 'error'
        });
      }
    }
    
    return mcps;
  }

  async shutdown() {
    logger.info('Fazendo shutdown do MCP Manager...');
    
    const disconnectPromises = Array.from(this.clients.keys()).map(name => 
      this.disconnectFromServer(name)
    );
    
    await Promise.all(disconnectPromises);
    
    logger.info('MCP Manager encerrado');
  }
}

module.exports = MCPManager; 
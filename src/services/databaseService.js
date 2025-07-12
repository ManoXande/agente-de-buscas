const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const config = require('../config');

class DatabaseService {
  constructor() {
    this.db = null;
    this.dbPath = config.dbPath;
  }

  async init() {
    try {
      // Garantir que o diretório existe
      const dbDir = path.dirname(this.dbPath);
      await fs.mkdir(dbDir, { recursive: true });
      
      // Conectar ao banco de dados
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error('Erro ao conectar com o banco de dados:', err);
          throw err;
        }
        logger.info(`Conectado ao banco de dados: ${this.dbPath}`);
      });
      
      // Criar tabelas
      await this.createTables();
      
      logger.info('Banco de dados inicializado com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar banco de dados:', error);
      throw error;
    }
  }

  async createTables() {
    const createSearchesTable = `
      CREATE TABLE IF NOT EXISTS searches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        type TEXT NOT NULL,
        results INTEGER DEFAULT 0,
        duration INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT,
        user_id TEXT,
        session_id TEXT
      )
    `;

    const createResultsTable = `
      CREATE TABLE IF NOT EXISTS search_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        search_id INTEGER,
        title TEXT,
        url TEXT,
        snippet TEXT,
        source TEXT,
        score REAL,
        position INTEGER,
        metadata TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (search_id) REFERENCES searches (id)
      )
    `;

    const createMcpLogsTable = `
      CREATE TABLE IF NOT EXISTS mcp_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_name TEXT NOT NULL,
        action TEXT NOT NULL,
        success BOOLEAN DEFAULT 1,
        duration INTEGER,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createUserSessionsTable = `
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        user_agent TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        search_count INTEGER DEFAULT 0
      )
    `;

    const createSearchTagsTable = `
      CREATE TABLE IF NOT EXISTS search_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        search_id INTEGER,
        tag TEXT NOT NULL,
        FOREIGN KEY (search_id) REFERENCES searches (id)
      )
    `;

    const tables = [
      createSearchesTable,
      createResultsTable,
      createMcpLogsTable,
      createUserSessionsTable,
      createSearchTagsTable
    ];

    for (const tableQuery of tables) {
      await this.run(tableQuery);
    }

    // Criar índices para performance
    const indices = [
      'CREATE INDEX IF NOT EXISTS idx_searches_timestamp ON searches(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_searches_query ON searches(query)',
      'CREATE INDEX IF NOT EXISTS idx_searches_type ON searches(type)',
      'CREATE INDEX IF NOT EXISTS idx_results_search_id ON search_results(search_id)',
      'CREATE INDEX IF NOT EXISTS idx_results_source ON search_results(source)',
      'CREATE INDEX IF NOT EXISTS idx_mcp_logs_server ON mcp_logs(server_name)',
      'CREATE INDEX IF NOT EXISTS idx_mcp_logs_timestamp ON mcp_logs(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_id ON user_sessions(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_tags_search_id ON search_tags(search_id)'
    ];

    for (const indexQuery of indices) {
      await this.run(indexQuery);
    }
  }

  async run(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(query, params, function(err) {
        if (err) {
          logger.error('Erro ao executar query:', err);
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async get(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(query, params, (err, row) => {
        if (err) {
          logger.error('Erro ao executar query:', err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async all(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          logger.error('Erro ao executar query:', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async saveSearch(searchData) {
    const {
      query,
      type,
      results,
      duration,
      metadata = {},
      userId,
      sessionId
    } = searchData;

    try {
      const insertQuery = `
        INSERT INTO searches (query, type, results, duration, metadata, user_id, session_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      const result = await this.run(insertQuery, [
        query,
        type,
        Array.isArray(results) ? results.length : results,
        duration,
        JSON.stringify(metadata),
        userId,
        sessionId
      ]);

      logger.info(`Busca salva com ID: ${result.lastID}`);
      return result.lastID;
    } catch (error) {
      logger.error('Erro ao salvar busca:', error);
      throw error;
    }
  }

  async saveSearchResults(searchId, results) {
    try {
      const insertQuery = `
        INSERT INTO search_results (search_id, title, url, snippet, source, score, position, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        await this.run(insertQuery, [
          searchId,
          result.title,
          result.url,
          result.snippet,
          result.source,
          result.score || 0,
          i + 1,
          JSON.stringify(result.metadata || {})
        ]);
      }

      logger.info(`${results.length} resultados salvos para a busca ${searchId}`);
    } catch (error) {
      logger.error('Erro ao salvar resultados:', error);
      throw error;
    }
  }

  async getSearchHistory(page = 1, limit = 20, filters = {}) {
    try {
      const offset = (page - 1) * limit;
      let whereConditions = [];
      let params = [];

      if (filters.query) {
        whereConditions.push('query LIKE ?');
        params.push(`%${filters.query}%`);
      }

      if (filters.type) {
        whereConditions.push('type = ?');
        params.push(filters.type);
      }

      if (filters.dateFrom) {
        whereConditions.push('timestamp >= ?');
        params.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        whereConditions.push('timestamp <= ?');
        params.push(filters.dateTo);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const searchQuery = `
        SELECT id, query, type, results, duration, timestamp, metadata
        FROM searches 
        ${whereClause}
        ORDER BY timestamp DESC 
        LIMIT ? OFFSET ?
      `;

      const countQuery = `
        SELECT COUNT(*) as total 
        FROM searches 
        ${whereClause}
      `;

      const [searches, countResult] = await Promise.all([
        this.all(searchQuery, [...params, limit, offset]),
        this.get(countQuery, params)
      ]);

      return {
        searches: searches.map(search => ({
          ...search,
          metadata: JSON.parse(search.metadata || '{}')
        })),
        total: countResult.total,
        page,
        limit,
        totalPages: Math.ceil(countResult.total / limit)
      };
    } catch (error) {
      logger.error('Erro ao buscar histórico:', error);
      throw error;
    }
  }

  async getSearchStatistics(timeRange = '7d') {
    try {
      const timeConditions = {
        '1d': "timestamp >= datetime('now', '-1 day')",
        '7d': "timestamp >= datetime('now', '-7 days')",
        '30d': "timestamp >= datetime('now', '-30 days')",
        '90d': "timestamp >= datetime('now', '-90 days')"
      };

      const timeCondition = timeConditions[timeRange] || timeConditions['7d'];

      const queries = {
        totalSearches: `SELECT COUNT(*) as count FROM searches WHERE ${timeCondition}`,
        searchesByType: `
          SELECT type, COUNT(*) as count 
          FROM searches 
          WHERE ${timeCondition} 
          GROUP BY type
        `,
        searchesByDay: `
          SELECT DATE(timestamp) as date, COUNT(*) as count 
          FROM searches 
          WHERE ${timeCondition} 
          GROUP BY DATE(timestamp) 
          ORDER BY date
        `,
        topQueries: `
          SELECT query, COUNT(*) as count 
          FROM searches 
          WHERE ${timeCondition} 
          GROUP BY query 
          ORDER BY count DESC 
          LIMIT 10
        `,
        avgResultsPerSearch: `
          SELECT AVG(results) as avg_results 
          FROM searches 
          WHERE ${timeCondition} AND results > 0
        `,
        avgDuration: `
          SELECT AVG(duration) as avg_duration 
          FROM searches 
          WHERE ${timeCondition} AND duration > 0
        `
      };

      const results = {};
      for (const [key, query] of Object.entries(queries)) {
        if (key === 'searchesByType' || key === 'searchesByDay' || key === 'topQueries') {
          results[key] = await this.all(query);
        } else {
          const result = await this.get(query);
          results[key] = result[Object.keys(result)[0]];
        }
      }

      return results;
    } catch (error) {
      logger.error('Erro ao buscar estatísticas:', error);
      throw error;
    }
  }

  async logMcpActivity(serverName, action, success = true, duration = null, details = {}) {
    try {
      const insertQuery = `
        INSERT INTO mcp_logs (server_name, action, success, duration, details)
        VALUES (?, ?, ?, ?, ?)
      `;

      await this.run(insertQuery, [
        serverName,
        action,
        success,
        duration,
        JSON.stringify(details)
      ]);
    } catch (error) {
      logger.error('Erro ao salvar log MCP:', error);
    }
  }

  async getMcpStatistics() {
    try {
      const queries = {
        totalActivities: 'SELECT COUNT(*) as count FROM mcp_logs',
        activitiesByServer: `
          SELECT server_name, COUNT(*) as count 
          FROM mcp_logs 
          GROUP BY server_name
        `,
        successRate: `
          SELECT 
            server_name,
            COUNT(*) as total,
            SUM(success) as successful,
            ROUND(SUM(success) * 100.0 / COUNT(*), 2) as success_rate
          FROM mcp_logs 
          GROUP BY server_name
        `,
        recentErrors: `
          SELECT server_name, action, details, timestamp 
          FROM mcp_logs 
          WHERE success = 0 
          ORDER BY timestamp DESC 
          LIMIT 10
        `
      };

      const results = {};
      for (const [key, query] of Object.entries(queries)) {
        if (key === 'activitiesByServer' || key === 'successRate' || key === 'recentErrors') {
          results[key] = await this.all(query);
        } else {
          const result = await this.get(query);
          results[key] = result[Object.keys(result)[0]];
        }
      }

      return results;
    } catch (error) {
      logger.error('Erro ao buscar estatísticas MCP:', error);
      throw error;
    }
  }

  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            logger.error('Erro ao fechar banco de dados:', err);
            reject(err);
          } else {
            logger.info('Banco de dados fechado');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = DatabaseService; 
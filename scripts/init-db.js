const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const config = require('../src/config');

const initializeDatabase = async () => {
  try {
    // Criar diretório data se não existir
    const dataDir = path.dirname(config.database.path);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`✓ Diretório criado: ${dataDir}`);
    }

    // Conectar ao banco
    const db = new sqlite3.Database(config.database.path);
    console.log('✓ Conectado ao banco de dados SQLite');

    // Criar tabelas
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        // Tabela de histórico de buscas
        db.run(`
          CREATE TABLE IF NOT EXISTS search_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT NOT NULL,
            sources TEXT NOT NULL,
            results_count INTEGER DEFAULT 0,
            duration_ms INTEGER DEFAULT 0,
            success BOOLEAN DEFAULT 1,
            error_message TEXT,
            user_agent TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Tabela de logs MCP
        db.run(`
          CREATE TABLE IF NOT EXISTS mcp_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            action TEXT NOT NULL,
            status TEXT NOT NULL,
            message TEXT,
            duration_ms INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Tabela de estatísticas
        db.run(`
          CREATE TABLE IF NOT EXISTS statistics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            metric_name TEXT NOT NULL,
            metric_value REAL NOT NULL,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Tabela de configurações
        db.run(`
          CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            description TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Tabela de sessões
        db.run(`
          CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE NOT NULL,
            user_data TEXT,
            last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Tabela de resultados em cache
        db.run(`
          CREATE TABLE IF NOT EXISTS cache_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_hash TEXT UNIQUE NOT NULL,
            query TEXT NOT NULL,
            sources TEXT NOT NULL,
            results TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });

    // Criar índices para melhor performance
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('CREATE INDEX IF NOT EXISTS idx_search_history_query ON search_history(query)');
        db.run('CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at)');
        db.run('CREATE INDEX IF NOT EXISTS idx_mcp_logs_server ON mcp_logs(server_name)');
        db.run('CREATE INDEX IF NOT EXISTS idx_mcp_logs_created_at ON mcp_logs(created_at)');
        db.run('CREATE INDEX IF NOT EXISTS idx_statistics_metric ON statistics(metric_name)');
        db.run('CREATE INDEX IF NOT EXISTS idx_cache_query_hash ON cache_results(query_hash)');
        db.run('CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_results(expires_at)', (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });

    // Inserir configurações padrão
    await new Promise((resolve, reject) => {
      const defaultSettings = [
        {
          key: 'search_timeout',
          value: '30000',
          description: 'Timeout para buscas em milissegundos'
        },
        {
          key: 'max_results_per_source',
          value: '10',
          description: 'Máximo de resultados por fonte'
        },
        {
          key: 'cache_ttl',
          value: '3600',
          description: 'TTL do cache em segundos'
        },
        {
          key: 'rate_limit_requests',
          value: '100',
          description: 'Limite de requisições por minuto'
        },
        {
          key: 'enable_analytics',
          value: 'true',
          description: 'Habilitar coleta de analytics'
        }
      ];

      let completed = 0;
      const total = defaultSettings.length;

      defaultSettings.forEach(setting => {
        db.run(
          'INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)',
          [setting.key, setting.value, setting.description],
          (err) => {
            if (err) {
              console.error(`Erro ao inserir configuração ${setting.key}:`, err);
            }
            completed++;
            if (completed === total) {
              resolve();
            }
          }
        );
      });
    });

    // Inserir dados de exemplo para desenvolvimento
    if (process.env.NODE_ENV === 'development') {
      await new Promise((resolve, reject) => {
        const sampleData = [
          {
            query: 'nodejs tutorial',
            sources: '["web", "github"]',
            results_count: 15,
            duration_ms: 2500,
            success: 1
          },
          {
            query: 'react components',
            sources: '["github", "documentation"]',
            results_count: 8,
            duration_ms: 1800,
            success: 1
          },
          {
            query: 'python machine learning',
            sources: '["web", "github"]',
            results_count: 12,
            duration_ms: 3200,
            success: 1
          }
        ];

        let completed = 0;
        const total = sampleData.length;

        sampleData.forEach(data => {
          db.run(
            'INSERT INTO search_history (query, sources, results_count, duration_ms, success) VALUES (?, ?, ?, ?, ?)',
            [data.query, data.sources, data.results_count, data.duration_ms, data.success],
            (err) => {
              if (err) {
                console.error('Erro ao inserir dados de exemplo:', err);
              }
              completed++;
              if (completed === total) {
                resolve();
              }
            }
          );
        });
      });
      console.log('✓ Dados de exemplo inseridos');
    }

    db.close();
    console.log('✓ Banco de dados inicializado com sucesso!');
    console.log(`✓ Localização: ${config.database.path}`);
    
  } catch (error) {
    console.error('❌ Erro ao inicializar banco de dados:', error);
    process.exit(1);
  }
};

// Executar se chamado diretamente
if (require.main === module) {
  initializeDatabase();
}

module.exports = initializeDatabase; 
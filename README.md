# Agente de Buscas - Search Workspace

Um sistema de busca inteligente que integra múltiplos servidores MCP (Model Context Protocol) e LLMs para fornecer capacidades de pesquisa avançadas.

## 🚀 Características

- **Busca Multi-fonte**: Web, GitHub, arquivos, documentação, código
- **Integração MCP**: Suporte para múltiplos servidores MCP
- **Interface Moderna**: UI responsiva com tema escuro
- **Tempo Real**: Atualizações via WebSocket
- **Histórico**: Armazenamento e análise de buscas
- **IA Integrada**: Melhoramento de resultados com Claude
- **Monitoramento**: Logs avançados e estatísticas

## 📋 Pré-requisitos

- Node.js 16+
- NPM ou Yarn
- Chaves de API (Anthropic, GitHub, etc.)

## 🛠 Instalação

### 1. Clone e instale dependências

```bash
# Clone o repositório
git clone https://github.com/ManoXande/agente-de-buscas.git
cd agente-de-buscas

# Instale as dependências
npm install
```

### 2. Configuração do ambiente

```bash
# Copie o arquivo de exemplo
cp exemplo.env .env

# Edite o arquivo .env com suas configurações
nano .env
```

### 3. Configure as chaves de API

Edite o arquivo `.env` e adicione suas chaves:

```env
# API Keys
ANTHROPIC_API_KEY=sua_chave_anthropic
GITHUB_TOKEN=seu_token_github
FIRECRAWL_API_KEY=sua_chave_firecrawl

# Database
DATABASE_PATH=./data/search.db

# Server
PORT=3000
NODE_ENV=development
```

### 4. Inicialize o banco de dados

```bash
npm run init-db
```

### 5. Inicie o servidor

```bash
# Desenvolvimento
npm run dev

# Produção
npm start
```

## 🔧 Configuração de Servidores MCP

### Servidores MCP Suportados

1. **Firecrawl** - Web scraping
2. **GitHub** - Busca em repositórios
3. **Filesystem** - Busca em arquivos
4. **Context7** - Documentação
5. **SQLite** - Banco de dados

### Configuração Manual

Edite `src/config/mcpServers.json` para adicionar novos servidores:

```json
{
  "servers": [
    {
      "name": "github",
      "url": "mcp://github-server",
      "enabled": true,
      "config": {
        "token": "process.env.GITHUB_TOKEN"
      }
    }
  ]
}
```

## 🎯 Uso

### Interface Web

1. Acesse `http://localhost:3000`
2. Digite sua consulta na barra de busca
3. Selecione as fontes desejadas
4. Visualize os resultados em tempo real

### API REST

```bash
# Busca simples
curl "http://localhost:3000/api/search?q=nodejs&sources=web,github"

# Status dos MCPs
curl "http://localhost:3000/api/mcp/status"

# Histórico de buscas
curl "http://localhost:3000/api/search/history"
```

### WebSocket

```javascript
const socket = new WebSocket('ws://localhost:3000');

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Resultado:', data);
};

// Enviar busca
socket.send(JSON.stringify({
  type: 'search',
  query: 'nodejs tutorial',
  sources: ['web', 'github']
}));
```

## 🔍 Fontes de Busca

### Web Search
- **Firecrawl**: Extração de conteúdo web
- **Puppeteer**: Scraping direto (fallback)

### GitHub Search
- **Repositórios**: Busca em repos públicos
- **Código**: Busca em arquivos de código
- **Issues**: Busca em issues e PRs

### File Search
- **Local**: Arquivos no sistema
- **Remoto**: Arquivos via MCP

### Documentation
- **Context7**: Documentação técnica
- **MDN**: Documentação web

## 📊 Monitoramento

### Logs
```bash
# Visualizar logs
tail -f logs/app.log

# Logs de erro
tail -f logs/error.log
```

### Métricas
- Acessível via `/api/stats`
- Dashboard web integrado
- Exportação para análise

## 🚀 Deployment

### Docker

```dockerfile
# Dockerfile incluído
docker build -t agente-buscas .
docker run -p 3000:3000 agente-buscas
```

### PM2

```bash
# Instalar PM2
npm install -g pm2

# Iniciar aplicação
pm2 start ecosystem.config.js

# Monitorar
pm2 monit
```

### Nginx

```nginx
# Configuração de proxy reverso
server {
    listen 80;
    server_name seu-dominio.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🧪 Testes

```bash
# Testes unitários
npm test

# Testes de integração
npm run test:integration

# Testes E2E
npm run test:e2e
```

## 🔒 Segurança

- Rate limiting implementado
- Validação de entrada
- Sanitização de dados
- CORS configurado
- Headers de segurança

## 📝 Scripts Disponíveis

```bash
npm start          # Inicia o servidor
npm run dev        # Modo desenvolvimento
npm run init-db    # Inicializa banco
npm run backup     # Backup do banco
npm run restore    # Restaura backup
npm test           # Executa testes
npm run lint       # Verifica código
npm run format     # Formata código
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

## 🔗 Links Úteis

- [MCP Documentation](https://modelcontextprotocol.io/)
- [Anthropic API](https://docs.anthropic.com/)
- [GitHub API](https://docs.github.com/en/rest)
- [Firecrawl Documentation](https://docs.firecrawl.dev/)

## 📞 Suporte

- 📧 Email: suporte@exemplo.com
- 💬 Discord: [Link do servidor]
- 📱 Telegram: [@suporte_agente]

## 📈 Roadmap

- [ ] Suporte a mais servidores MCP
- [ ] Interface mobile nativa
- [ ] Integração com mais LLMs
- [ ] Sistema de plugins
- [ ] Analytics avançados
- [ ] Busca por voz
- [ ] Exportação de resultados 
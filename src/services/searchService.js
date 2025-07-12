const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');

class SearchService {
  constructor(mcpManager) {
    this.mcpManager = mcpManager;
    this.anthropic = config.anthropicApiKey ? new Anthropic({
      apiKey: config.anthropicApiKey
    }) : null;
    this.cache = new Map();
  }

  async search(query, type = 'all', options = {}) {
    logger.info(`Iniciando busca: "${query}" (tipo: ${type})`);
    
    const startTime = Date.now();
    const results = [];
    
    try {
      // Buscar em paralelo baseado no tipo
      const searchPromises = [];
      
      if (type === 'all' || type === 'web') {
        searchPromises.push(this.searchWeb(query, options));
      }
      
      if (type === 'all' || type === 'github') {
        searchPromises.push(this.searchGitHub(query, options));
      }
      
      if (type === 'all' || type === 'files') {
        searchPromises.push(this.searchFiles(query, options));
      }
      
      if (type === 'all' || type === 'docs') {
        searchPromises.push(this.searchDocs(query, options));
      }
      
      if (type === 'all' || type === 'code') {
        searchPromises.push(this.searchCode(query, options));
      }
      
      // Executar todas as buscas em paralelo
      const searchResults = await Promise.allSettled(searchPromises);
      
      // Processar resultados
      for (const result of searchResults) {
        if (result.status === 'fulfilled' && result.value) {
          results.push(...result.value);
        } else if (result.status === 'rejected') {
          logger.error('Erro em busca:', result.reason);
        }
      }
      
      // Classificar e filtrar resultados
      const processedResults = await this.processResults(results, query, options);
      
      const endTime = Date.now();
      logger.info(`Busca concluída em ${endTime - startTime}ms. ${processedResults.length} resultados encontrados`);
      
      return processedResults;
      
    } catch (error) {
      logger.error('Erro durante a busca:', error);
      throw error;
    }
  }

  async searchWeb(query, options = {}) {
    const results = [];
    
    try {
      // Buscar usando Firecrawl MCP se disponível
      if (this.mcpManager.clients.has('firecrawl')) {
        const firecrawlResults = await this.searchWithFirecrawl(query, options);
        results.push(...firecrawlResults);
      }
      
      // Buscar usando Puppeteer como fallback
      const puppeteerResults = await this.searchWithPuppeteer(query, options);
      results.push(...puppeteerResults);
      
      return results;
      
    } catch (error) {
      logger.error('Erro na busca web:', error);
      return [];
    }
  }

  async searchWithFirecrawl(query, options = {}) {
    try {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      
      const result = await this.mcpManager.callTool('firecrawl', 'scrape', {
        url: searchUrl,
        formats: ['markdown', 'html'],
        includeTags: ['title', 'meta', 'h1', 'h2', 'h3', 'p', 'a'],
        excludeTags: ['nav', 'footer', 'aside', 'script', 'style'],
        waitFor: 2000
      });
      
      return this.parseSearchResults(result, 'web');
      
    } catch (error) {
      logger.error('Erro no Firecrawl:', error);
      return [];
    }
  }

  async searchWithPuppeteer(query, options = {}) {
    let browser;
    
    try {
      browser = await puppeteer.launch({
        headless: config.puppeteerHeadless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2' });
      
      const searchResults = await page.evaluate(() => {
        const results = [];
        const elements = document.querySelectorAll('div.g');
        
        for (const element of elements) {
          const titleElement = element.querySelector('h3');
          const linkElement = element.querySelector('a');
          const snippetElement = element.querySelector('.VwiC3b');
          
          if (titleElement && linkElement) {
            results.push({
              title: titleElement.textContent,
              url: linkElement.href,
              snippet: snippetElement ? snippetElement.textContent : '',
              source: 'web'
            });
          }
        }
        
        return results;
      });
      
      return searchResults.slice(0, options.maxResults || 10);
      
    } catch (error) {
      logger.error('Erro no Puppeteer:', error);
      return [];
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async searchGitHub(query, options = {}) {
    try {
      if (!this.mcpManager.clients.has('github')) {
        return [];
      }
      
      const results = [];
      
      // Buscar repositórios
      const repoResults = await this.mcpManager.callTool('github', 'search_repositories', {
        query: query,
        per_page: options.maxResults || 10
      });
      
      if (repoResults.repositories) {
        for (const repo of repoResults.repositories) {
          results.push({
            title: repo.full_name,
            url: repo.html_url,
            snippet: repo.description || '',
            source: 'github-repo',
            stars: repo.stargazers_count,
            language: repo.language,
            updatedAt: repo.updated_at
          });
        }
      }
      
      // Buscar código
      const codeResults = await this.mcpManager.callTool('github', 'search_code', {
        q: query,
        per_page: options.maxResults || 10
      });
      
      if (codeResults.items) {
        for (const item of codeResults.items) {
          results.push({
            title: item.name,
            url: item.html_url,
            snippet: item.repository.description || '',
            source: 'github-code',
            repository: item.repository.full_name,
            path: item.path
          });
        }
      }
      
      return results;
      
    } catch (error) {
      logger.error('Erro na busca GitHub:', error);
      return [];
    }
  }

  async searchFiles(query, options = {}) {
    try {
      if (!this.mcpManager.clients.has('filesystem')) {
        return [];
      }
      
      const results = [];
      const allowedPaths = config.mcpServers.filesystem.config.allowedPaths;
      
      for (const basePath of allowedPaths) {
        const searchResults = await this.mcpManager.callTool('filesystem', 'search', {
          path: basePath,
          query: query,
          extensions: options.extensions || ['.txt', '.md', '.js', '.json', '.py', '.html', '.css'],
          maxResults: options.maxResults || 20
        });
        
        if (searchResults.files) {
          for (const file of searchResults.files) {
            results.push({
              title: path.basename(file.path),
              url: `file://${file.path}`,
              snippet: file.preview || '',
              source: 'file',
              path: file.path,
              size: file.size,
              modifiedAt: file.modifiedAt
            });
          }
        }
      }
      
      return results;
      
    } catch (error) {
      logger.error('Erro na busca de arquivos:', error);
      return [];
    }
  }

  async searchDocs(query, options = {}) {
    try {
      if (!this.mcpManager.clients.has('context7')) {
        return [];
      }
      
      const results = await this.mcpManager.callTool('context7', 'search', {
        query: query,
        type: 'documentation',
        maxResults: options.maxResults || 10
      });
      
      return results.map(doc => ({
        title: doc.title,
        url: doc.url,
        snippet: doc.content,
        source: 'documentation',
        framework: doc.framework,
        version: doc.version
      }));
      
    } catch (error) {
      logger.error('Erro na busca de documentação:', error);
      return [];
    }
  }

  async searchCode(query, options = {}) {
    const results = [];
    
    try {
      // Buscar código no GitHub
      const githubResults = await this.searchGitHub(query, { ...options, codeOnly: true });
      results.push(...githubResults.filter(r => r.source === 'github-code'));
      
      // Buscar código local
      const localResults = await this.searchFiles(query, {
        ...options,
        extensions: ['.js', '.py', '.java', '.cpp', '.c', '.h', '.php', '.rb', '.go']
      });
      results.push(...localResults);
      
      return results;
      
    } catch (error) {
      logger.error('Erro na busca de código:', error);
      return [];
    }
  }

  async processResults(results, query, options = {}) {
    // Remover duplicatas
    const uniqueResults = this.removeDuplicates(results);
    
    // Classificar por relevância
    const scoredResults = await this.scoreResults(uniqueResults, query, options);
    
    // Ordenar por pontuação
    scoredResults.sort((a, b) => b.score - a.score);
    
    // Limitar resultados
    const maxResults = options.maxResults || config.search.maxResults;
    const limitedResults = scoredResults.slice(0, maxResults);
    
    // Enriquecer com IA se disponível
    if (this.anthropic && options.enrichWithAI) {
      return await this.enrichWithAI(limitedResults, query);
    }
    
    return limitedResults;
  }

  removeDuplicates(results) {
    const seen = new Set();
    return results.filter(result => {
      const key = `${result.url}-${result.title}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  async scoreResults(results, query, options = {}) {
    const queryTerms = query.toLowerCase().split(' ');
    
    return results.map(result => {
      let score = 0;
      
      // Pontuação baseada no título
      const titleLower = result.title.toLowerCase();
      for (const term of queryTerms) {
        if (titleLower.includes(term)) {
          score += 10;
        }
      }
      
      // Pontuação baseada no snippet
      const snippetLower = result.snippet.toLowerCase();
      for (const term of queryTerms) {
        if (snippetLower.includes(term)) {
          score += 5;
        }
      }
      
      // Bônus por fonte
      const sourceBonus = {
        'github-repo': 2,
        'github-code': 3,
        'documentation': 4,
        'file': 1,
        'web': 1
      };
      
      score += sourceBonus[result.source] || 0;
      
      // Bônus por métricas (stars, etc.)
      if (result.stars) {
        score += Math.min(result.stars / 1000, 5);
      }
      
      return { ...result, score };
    });
  }

  async enrichWithAI(results, query) {
    try {
      const prompt = `
        Analise os seguintes resultados de busca para a query "${query}" e forneça insights adicionais:
        
        ${JSON.stringify(results, null, 2)}
        
        Para cada resultado, forneça:
        1. Uma avaliação da relevância (0-10)
        2. Um resumo melhorado 
        3. Tags relevantes
        4. Sugestões de uso
        
        Retorne apenas um JSON válido com os resultados enriquecidos.
      `;
      
      const response = await this.anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      });
      
      const enrichedResults = JSON.parse(response.content[0].text);
      return enrichedResults;
      
    } catch (error) {
      logger.error('Erro ao enriquecer resultados com IA:', error);
      return results;
    }
  }

  parseSearchResults(rawResults, source) {
    // Parser genérico para resultados de busca
    const results = [];
    
    try {
      if (typeof rawResults === 'string') {
        const $ = cheerio.load(rawResults);
        
        // Lógica específica para cada fonte
        if (source === 'web') {
          $('.g').each((i, element) => {
            const title = $(element).find('h3').text();
            const url = $(element).find('a').attr('href');
            const snippet = $(element).find('.VwiC3b').text();
            
            if (title && url) {
              results.push({
                title,
                url,
                snippet,
                source
              });
            }
          });
        }
      }
      
      return results;
      
    } catch (error) {
      logger.error('Erro ao parsear resultados:', error);
      return [];
    }
  }
}

module.exports = SearchService; 
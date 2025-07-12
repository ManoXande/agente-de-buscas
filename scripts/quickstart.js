#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const log = (message, color = 'reset') => {
  console.log(colors[color] + message + colors.reset);
};

const checkRequirements = () => {
  log('\n🔍 Verificando requisitos...', 'cyan');
  
  try {
    const nodeVersion = process.version;
    log(`✓ Node.js: ${nodeVersion}`, 'green');
    
    const majorVersion = parseInt(nodeVersion.split('.')[0].replace('v', ''));
    if (majorVersion < 16) {
      log('⚠️  Aviso: Node.js 16+ é recomendado', 'yellow');
    }
    
    // Verificar npm
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    log(`✓ npm: ${npmVersion}`, 'green');
    
    return true;
  } catch (error) {
    log('❌ Erro ao verificar requisitos:', 'red');
    log(error.message, 'red');
    return false;
  }
};

const createDirectories = () => {
  log('\n📁 Criando diretórios necessários...', 'cyan');
  
  const directories = ['data', 'logs', 'backups'];
  
  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log(`✓ Criado: ${dir}/`, 'green');
    } else {
      log(`✓ Existe: ${dir}/`, 'blue');
    }
  });
};

const setupEnvironment = async () => {
  log('\n⚙️  Configurando ambiente...', 'cyan');
  
  if (!fs.existsSync('.env')) {
    if (fs.existsSync('exemplo.env')) {
      fs.copyFileSync('exemplo.env', '.env');
      log('✓ Arquivo .env criado a partir do exemplo', 'green');
    } else {
      log('❌ Arquivo exemplo.env não encontrado', 'red');
      return false;
    }
  } else {
    log('✓ Arquivo .env já existe', 'blue');
  }
  
  log('\n📝 Configuração das chaves de API:', 'yellow');
  log('Para usar todas as funcionalidades, você precisa configurar as seguintes chaves no arquivo .env:');
  log('• ANTHROPIC_API_KEY - Para integração com Claude');
  log('• GITHUB_TOKEN - Para busca no GitHub');
  log('• FIRECRAWL_API_KEY - Para web scraping');
  log('• CONTEXT7_API_KEY - Para busca em documentação');
  
  const configureNow = await question('\n❓ Deseja configurar as chaves agora? (y/N): ');
  
  if (configureNow.toLowerCase() === 'y' || configureNow.toLowerCase() === 'yes') {
    const keys = {
      'ANTHROPIC_API_KEY': 'Chave da API Anthropic (Claude)',
      'GITHUB_TOKEN': 'Token do GitHub (opcional)',
      'FIRECRAWL_API_KEY': 'Chave da API Firecrawl (opcional)',
      'CONTEXT7_API_KEY': 'Chave da API Context7 (opcional)'
    };
    
    let envContent = fs.readFileSync('.env', 'utf8');
    
    for (const [key, description] of Object.entries(keys)) {
      const value = await question(`${description}: `);
      if (value.trim()) {
        envContent = envContent.replace(
          new RegExp(`${key}=.*`),
          `${key}=${value.trim()}`
        );
      }
    }
    
    fs.writeFileSync('.env', envContent);
    log('✓ Configurações salvas no arquivo .env', 'green');
  } else {
    log('⚠️  Lembre-se de configurar as chaves no arquivo .env antes de usar', 'yellow');
  }
  
  return true;
};

const installDependencies = async () => {
  log('\n📦 Instalando dependências...', 'cyan');
  
  const install = await question('Instalar dependências agora? (Y/n): ');
  
  if (install.toLowerCase() !== 'n' && install.toLowerCase() !== 'no') {
    try {
      log('⏳ Executando npm install...', 'yellow');
      execSync('npm install', { stdio: 'inherit' });
      log('✓ Dependências instaladas com sucesso', 'green');
      return true;
    } catch (error) {
      log('❌ Erro ao instalar dependências:', 'red');
      log(error.message, 'red');
      return false;
    }
  } else {
    log('⚠️  Execute "npm install" manualmente antes de usar', 'yellow');
    return true;
  }
};

const initializeDatabase = async () => {
  log('\n🗄️  Inicializando banco de dados...', 'cyan');
  
  const initDb = await question('Inicializar banco de dados agora? (Y/n): ');
  
  if (initDb.toLowerCase() !== 'n' && initDb.toLowerCase() !== 'no') {
    try {
      execSync('npm run init-db', { stdio: 'inherit' });
      log('✓ Banco de dados inicializado', 'green');
      return true;
    } catch (error) {
      log('❌ Erro ao inicializar banco de dados:', 'red');
      log(error.message, 'red');
      return false;
    }
  } else {
    log('⚠️  Execute "npm run init-db" manualmente antes de usar', 'yellow');
    return true;
  }
};

const showNextSteps = () => {
  log('\n🎉 Configuração concluída!', 'green');
  log('\n📋 Próximos passos:', 'cyan');
  log('1. Configure as chaves de API no arquivo .env (se ainda não fez)');
  log('2. Inicie o servidor: npm start');
  log('3. Acesse: http://localhost:3000');
  log('4. Para desenvolvimento: npm run dev');
  log('');
  log('🔧 Comandos úteis:', 'cyan');
  log('• npm run backup       - Fazer backup do banco');
  log('• npm run restore      - Restaurar backup');
  log('• npm run pm2:start    - Iniciar com PM2');
  log('• npm run docker:build - Criar imagem Docker');
  log('');
  log('📚 Documentação completa no README.md', 'blue');
  log('');
  log('✨ Bom desenvolvimento!', 'magenta');
};

const main = async () => {
  log('🚀 Bem-vindo ao Agente de Buscas!', 'bright');
  log('Este script irá configurar o ambiente para você.', 'cyan');
  
  try {
    // Verificar requisitos
    if (!checkRequirements()) {
      log('\n❌ Requisitos não atendidos. Verifique a instalação do Node.js e npm.', 'red');
      rl.close();
      return;
    }
    
    // Criar diretórios
    createDirectories();
    
    // Configurar ambiente
    if (!await setupEnvironment()) {
      log('\n❌ Falha na configuração do ambiente', 'red');
      rl.close();
      return;
    }
    
    // Instalar dependências
    if (!await installDependencies()) {
      log('\n❌ Falha na instalação das dependências', 'red');
      rl.close();
      return;
    }
    
    // Inicializar banco de dados
    if (!await initializeDatabase()) {
      log('\n❌ Falha na inicialização do banco de dados', 'red');
      rl.close();
      return;
    }
    
    // Mostrar próximos passos
    showNextSteps();
    
  } catch (error) {
    log('\n❌ Erro durante a configuração:', 'red');
    log(error.message, 'red');
  } finally {
    rl.close();
  }
};

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = { main, checkRequirements, createDirectories, setupEnvironment }; 
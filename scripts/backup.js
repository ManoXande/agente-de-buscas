#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const config = require('../src/config');

const createBackup = async () => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(process.cwd(), 'backups');
    const backupFile = path.join(backupDir, `search-db-${timestamp}.backup`);
    
    // Criar diretório de backup se não existir
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
      console.log(`✓ Diretório de backup criado: ${backupDir}`);
    }
    
    // Verificar se o banco de dados existe
    if (!fs.existsSync(config.database.path)) {
      console.error('❌ Banco de dados não encontrado:', config.database.path);
      process.exit(1);
    }
    
    // Criar backup do banco de dados
    console.log('⏳ Criando backup do banco de dados...');
    fs.copyFileSync(config.database.path, backupFile);
    
    // Verificar tamanho do backup
    const stats = fs.statSync(backupFile);
    const fileSizeInBytes = stats.size;
    const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
    
    console.log(`✓ Backup criado com sucesso!`);
    console.log(`📁 Arquivo: ${backupFile}`);
    console.log(`📊 Tamanho: ${fileSizeInMB} MB`);
    
    // Criar arquivo de metadados
    const metadataFile = backupFile.replace('.backup', '.meta.json');
    const metadata = {
      timestamp: new Date().toISOString(),
      originalPath: config.database.path,
      backupPath: backupFile,
      size: fileSizeInBytes,
      version: process.env.npm_package_version || '1.0.0',
      node_version: process.version,
      platform: process.platform,
      arch: process.arch
    };
    
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    console.log(`✓ Metadados salvos: ${metadataFile}`);
    
    // Limpar backups antigos (manter apenas os últimos 10)
    const backupFiles = fs.readdirSync(backupDir)
      .filter(file => file.endsWith('.backup'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        mtime: fs.statSync(path.join(backupDir, file)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);
    
    if (backupFiles.length > 10) {
      const filesToDelete = backupFiles.slice(10);
      console.log(`🧹 Removendo ${filesToDelete.length} backup(s) antigo(s)...`);
      
      filesToDelete.forEach(file => {
        fs.unlinkSync(file.path);
        // Remover arquivo de metadados correspondente
        const metaFile = file.path.replace('.backup', '.meta.json');
        if (fs.existsSync(metaFile)) {
          fs.unlinkSync(metaFile);
        }
        console.log(`  ✓ Removido: ${file.name}`);
      });
    }
    
    console.log('✅ Backup concluído com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao criar backup:', error.message);
    process.exit(1);
  }
};

const listBackups = () => {
  const backupDir = path.join(process.cwd(), 'backups');
  
  if (!fs.existsSync(backupDir)) {
    console.log('📁 Nenhum backup encontrado');
    return;
  }
  
  const backupFiles = fs.readdirSync(backupDir)
    .filter(file => file.endsWith('.backup'))
    .map(file => {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);
      const metaFile = filePath.replace('.backup', '.meta.json');
      
      let metadata = null;
      if (fs.existsSync(metaFile)) {
        metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      }
      
      return {
        name: file,
        path: filePath,
        size: (stats.size / (1024 * 1024)).toFixed(2),
        created: stats.birthtime,
        metadata
      };
    })
    .sort((a, b) => b.created - a.created);
  
  if (backupFiles.length === 0) {
    console.log('📁 Nenhum backup encontrado');
    return;
  }
  
  console.log('\n📋 Backups disponíveis:');
  console.log('=' .repeat(80));
  
  backupFiles.forEach((backup, index) => {
    console.log(`${index + 1}. ${backup.name}`);
    console.log(`   📊 Tamanho: ${backup.size} MB`);
    console.log(`   📅 Criado: ${backup.created.toLocaleString()}`);
    console.log(`   📁 Caminho: ${backup.path}`);
    
    if (backup.metadata) {
      console.log(`   📝 Versão: ${backup.metadata.version}`);
      console.log(`   🚀 Node: ${backup.metadata.node_version}`);
    }
    
    console.log('');
  });
};

const validateBackup = (backupPath) => {
  try {
    if (!fs.existsSync(backupPath)) {
      console.error('❌ Arquivo de backup não encontrado:', backupPath);
      return false;
    }
    
    const stats = fs.statSync(backupPath);
    if (stats.size === 0) {
      console.error('❌ Arquivo de backup está vazio');
      return false;
    }
    
    console.log('✓ Backup válido');
    return true;
  } catch (error) {
    console.error('❌ Erro ao validar backup:', error.message);
    return false;
  }
};

// Processar argumentos da linha de comando
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'create':
    createBackup();
    break;
  case 'list':
    listBackups();
    break;
  case 'validate':
    if (args[1]) {
      validateBackup(args[1]);
    } else {
      console.error('❌ Forneça o caminho do backup para validar');
      process.exit(1);
    }
    break;
  default:
    console.log('🔧 Uso: node scripts/backup.js <comando>');
    console.log('');
    console.log('Comandos disponíveis:');
    console.log('  create    - Criar novo backup');
    console.log('  list      - Listar backups disponíveis');
    console.log('  validate  - Validar um backup específico');
    console.log('');
    console.log('Exemplos:');
    console.log('  node scripts/backup.js create');
    console.log('  node scripts/backup.js list');
    console.log('  node scripts/backup.js validate ./backups/search-db-2024-01-01.backup');
    break;
}

module.exports = { createBackup, listBackups, validateBackup }; 
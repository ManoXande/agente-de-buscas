#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const config = require('../src/config');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

const restoreBackup = async (backupPath, force = false) => {
  try {
    // Verificar se o arquivo de backup existe
    if (!fs.existsSync(backupPath)) {
      console.error('❌ Arquivo de backup não encontrado:', backupPath);
      process.exit(1);
    }
    
    // Verificar se o backup é válido
    const stats = fs.statSync(backupPath);
    if (stats.size === 0) {
      console.error('❌ Arquivo de backup está vazio');
      process.exit(1);
    }
    
    console.log('📋 Informações do backup:');
    console.log(`📁 Arquivo: ${backupPath}`);
    console.log(`📊 Tamanho: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`📅 Criado: ${stats.birthtime.toLocaleString()}`);
    
    // Verificar metadados se existirem
    const metaFile = backupPath.replace('.backup', '.meta.json');
    if (fs.existsSync(metaFile)) {
      const metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      console.log(`📝 Versão: ${metadata.version}`);
      console.log(`🚀 Node: ${metadata.node_version}`);
      console.log(`💻 Plataforma: ${metadata.platform} (${metadata.arch})`);
    }
    
    // Verificar se o banco atual existe
    const currentDbExists = fs.existsSync(config.database.path);
    if (currentDbExists && !force) {
      console.log('\n⚠️  ATENÇÃO: Existe um banco de dados atual que será substituído!');
      console.log(`📁 Localização atual: ${config.database.path}`);
      
      const currentStats = fs.statSync(config.database.path);
      console.log(`📊 Tamanho atual: ${(currentStats.size / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`📅 Modificado: ${currentStats.mtime.toLocaleString()}`);
      
      const confirmReplace = await question('\n❓ Deseja continuar? Esta ação não pode ser desfeita. (y/N): ');
      if (confirmReplace.toLowerCase() !== 'y' && confirmReplace.toLowerCase() !== 'yes') {
        console.log('✋ Operação cancelada pelo usuário');
        rl.close();
        return;
      }
    }
    
    // Criar backup do banco atual se existir
    if (currentDbExists) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(process.cwd(), 'backups');
      const currentBackupFile = path.join(backupDir, `search-db-before-restore-${timestamp}.backup`);
      
      console.log('\n💾 Criando backup do banco atual...');
      fs.copyFileSync(config.database.path, currentBackupFile);
      console.log(`✓ Backup atual salvo em: ${currentBackupFile}`);
    }
    
    // Criar diretório do banco se não existir
    const dbDir = path.dirname(config.database.path);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`✓ Diretório criado: ${dbDir}`);
    }
    
    // Restaurar o backup
    console.log('\n🔄 Restaurando backup...');
    fs.copyFileSync(backupPath, config.database.path);
    
    // Verificar se a restauração foi bem-sucedida
    const restoredStats = fs.statSync(config.database.path);
    console.log(`✓ Banco restaurado com sucesso!`);
    console.log(`📁 Localização: ${config.database.path}`);
    console.log(`📊 Tamanho: ${(restoredStats.size / (1024 * 1024)).toFixed(2)} MB`);
    
    // Verificar integridade do banco restaurado
    console.log('\n🔍 Verificando integridade do banco restaurado...');
    try {
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(config.database.path);
      
      await new Promise((resolve, reject) => {
        db.get('PRAGMA integrity_check', (err, row) => {
          if (err) {
            reject(err);
          } else {
            if (row && row.integrity_check === 'ok') {
              console.log('✓ Integridade do banco verificada');
            } else {
              console.log('⚠️  Possível problema de integridade detectado');
            }
            resolve();
          }
        });
      });
      
      // Verificar tabelas principais
      await new Promise((resolve, reject) => {
        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
          if (err) {
            reject(err);
          } else {
            console.log(`✓ ${rows.length} tabelas encontradas`);
            rows.forEach(row => {
              console.log(`  - ${row.name}`);
            });
            resolve();
          }
        });
      });
      
      db.close();
    } catch (error) {
      console.error('⚠️  Erro ao verificar integridade:', error.message);
    }
    
    console.log('\n✅ Restauração concluída com sucesso!');
    console.log('🔄 Reinicie a aplicação para aplicar as mudanças');
    
    rl.close();
    
  } catch (error) {
    console.error('❌ Erro ao restaurar backup:', error.message);
    rl.close();
    process.exit(1);
  }
};

const listAvailableBackups = () => {
  const backupDir = path.join(process.cwd(), 'backups');
  
  if (!fs.existsSync(backupDir)) {
    console.log('📁 Nenhum backup encontrado');
    return [];
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
    return [];
  }
  
  console.log('\n📋 Backups disponíveis:');
  console.log('='.repeat(80));
  
  backupFiles.forEach((backup, index) => {
    console.log(`${index + 1}. ${backup.name}`);
    console.log(`   📊 Tamanho: ${backup.size} MB`);
    console.log(`   📅 Criado: ${backup.created.toLocaleString()}`);
    
    if (backup.metadata) {
      console.log(`   📝 Versão: ${backup.metadata.version}`);
    }
    
    console.log('');
  });
  
  return backupFiles;
};

const interactiveRestore = async () => {
  try {
    const backups = listAvailableBackups();
    
    if (backups.length === 0) {
      console.log('❌ Nenhum backup disponível para restaurar');
      rl.close();
      return;
    }
    
    const choice = await question('\n❓ Digite o número do backup que deseja restaurar (ou 0 para cancelar): ');
    const backupIndex = parseInt(choice) - 1;
    
    if (choice === '0') {
      console.log('✋ Operação cancelada pelo usuário');
      rl.close();
      return;
    }
    
    if (backupIndex < 0 || backupIndex >= backups.length) {
      console.log('❌ Opção inválida');
      rl.close();
      return;
    }
    
    const selectedBackup = backups[backupIndex];
    console.log(`\n📦 Backup selecionado: ${selectedBackup.name}`);
    
    await restoreBackup(selectedBackup.path);
    
  } catch (error) {
    console.error('❌ Erro na restauração interativa:', error.message);
    rl.close();
    process.exit(1);
  }
};

const compareBackups = (backup1Path, backup2Path) => {
  try {
    if (!fs.existsSync(backup1Path) || !fs.existsSync(backup2Path)) {
      console.error('❌ Um ou ambos os arquivos de backup não existem');
      return;
    }
    
    const stats1 = fs.statSync(backup1Path);
    const stats2 = fs.statSync(backup2Path);
    
    console.log('\n🔍 Comparação de backups:');
    console.log('='.repeat(80));
    
    console.log(`📁 Backup 1: ${backup1Path}`);
    console.log(`   📊 Tamanho: ${(stats1.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`   📅 Criado: ${stats1.birthtime.toLocaleString()}`);
    
    console.log(`📁 Backup 2: ${backup2Path}`);
    console.log(`   📊 Tamanho: ${(stats2.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`   📅 Criado: ${stats2.birthtime.toLocaleString()}`);
    
    console.log('\n📊 Diferenças:');
    const sizeDiff = stats1.size - stats2.size;
    const timeDiff = stats1.birthtime - stats2.birthtime;
    
    console.log(`   📏 Diferença de tamanho: ${(sizeDiff / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`   ⏱️  Diferença de tempo: ${Math.abs(timeDiff / (1000 * 60 * 60)).toFixed(2)} horas`);
    
    if (sizeDiff > 0) {
      console.log('   📈 Backup 1 é maior');
    } else if (sizeDiff < 0) {
      console.log('   📉 Backup 2 é maior');
    } else {
      console.log('   📊 Backups têm o mesmo tamanho');
    }
    
  } catch (error) {
    console.error('❌ Erro ao comparar backups:', error.message);
  }
};

// Processar argumentos da linha de comando
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'restore':
    if (args[1]) {
      const force = args.includes('--force');
      restoreBackup(args[1], force);
    } else {
      console.error('❌ Forneça o caminho do backup para restaurar');
      rl.close();
      process.exit(1);
    }
    break;
  case 'interactive':
    interactiveRestore();
    break;
  case 'list':
    listAvailableBackups();
    rl.close();
    break;
  case 'compare':
    if (args[1] && args[2]) {
      compareBackups(args[1], args[2]);
    } else {
      console.error('❌ Forneça dois caminhos de backup para comparar');
      process.exit(1);
    }
    rl.close();
    break;
  default:
    console.log('🔧 Uso: node scripts/restore.js <comando>');
    console.log('');
    console.log('Comandos disponíveis:');
    console.log('  restore <caminho>     - Restaurar backup específico');
    console.log('  interactive          - Modo interativo para escolher backup');
    console.log('  list                 - Listar backups disponíveis');
    console.log('  compare <b1> <b2>    - Comparar dois backups');
    console.log('');
    console.log('Opções:');
    console.log('  --force              - Força a restauração sem confirmação');
    console.log('');
    console.log('Exemplos:');
    console.log('  node scripts/restore.js interactive');
    console.log('  node scripts/restore.js restore ./backups/search-db-2024-01-01.backup');
    console.log('  node scripts/restore.js restore ./backups/search-db-2024-01-01.backup --force');
    console.log('  node scripts/restore.js compare backup1.backup backup2.backup');
    rl.close();
    break;
}

module.exports = { restoreBackup, listAvailableBackups, compareBackups }; 
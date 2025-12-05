#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const target = process.argv[2]; // 'sqlite' or 'postgres'
const prismaDir = path.join(__dirname, '..', 'prisma');

if (!target || !['sqlite', 'postgres'].includes(target)) {
  console.error('Usage: node switch-db.js <sqlite|postgres>');
  process.exit(1);
}

const schemaFile = path.join(prismaDir, 'schema.prisma');
const backupFile = path.join(prismaDir, 'schema.backup.prisma');
const sourceFile = target === 'sqlite' 
  ? path.join(prismaDir, 'schema.prisma')
  : path.join(prismaDir, 'schema.postgresql.prisma');

// バックアップを作成
if (fs.existsSync(schemaFile)) {
  fs.copyFileSync(schemaFile, backupFile);
  console.log('Backup created:', backupFile);
}

// スキーマファイルをコピー
if (fs.existsSync(sourceFile)) {
  fs.copyFileSync(sourceFile, schemaFile);
  console.log(`${target === 'sqlite' ? 'SQLite' : 'PostgreSQL'} schema activated`);
} else {
  console.error(`Source file not found: ${sourceFile}`);
  process.exit(1);
}


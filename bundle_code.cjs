const fs = require('fs');
const path = require('path');

const desktopPath = path.join(__dirname, 'creora_codebase.txt');
const srcDir = path.join(__dirname, 'src');
const rootFiles = ['package.json', 'index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.node.json'];

let output = '';

function processFile(filePath) {
  try {
    const relativePath = path.relative(__dirname, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    output += `\n\n================================================================================\n`;
    output += `File: ${relativePath.replace(/\\/g, '/')}\n`;
    output += `================================================================================\n\n`;
    output += content;
  } catch (err) {
    console.warn(`Could not read ${filePath}: ${err.message}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.css') || fullPath.endsWith('.json')) {
      processFile(fullPath);
    }
  }
}

// Process src directory
if (fs.existsSync(srcDir)) {
  walkDir(srcDir);
}

// Process root files
for (const file of rootFiles) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    processFile(fullPath);
  }
}

fs.writeFileSync(desktopPath, output);
console.log(`Successfully bundled codebase to ${desktopPath}`);

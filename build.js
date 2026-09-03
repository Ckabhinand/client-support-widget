#!/usr/bin/env node
/* ==========================================================================
   BUILD.JS — Production Build Optimizer
   Bundles, minifies, and optimizes all JS/CSS for production
   ========================================================================== */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  inputDir: './app',
  outputDir: './dist',
  jsFiles: [
    'js/logger.js',
    'js/cache.js',
    'js/state.js',
    'js/constants.js',
    'js/optimizer.js',
    'js/sdk-service.js',
    'js/error-handler.js',
    'js/ui.js',
    'js/navigation.js',
    'js/geolocation.js',
    'js/contracts.js',
    'js/pricing.js',
    'js/requirements.js',
    'js/tasks.js',
    'js/bug-report.js',
    'js/settings.js',
    'js/dashboard.js',
    'js/app.js'
  ],
  cssFiles: [
    'css/base.css',
    'css/layout.css',
    'css/components.css',
    'css/pages.css',
    'css/responsive.css',
    'css/enhancements.css'
  ]
};

// Simple minification functions
function minifyJS(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\n\s*\n/g, '\n') // Remove empty lines
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/\s*([{};:,()])\s*/g, '$1') // Remove spaces around operators
    .trim();
}

function minifyCSS(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
    .replace(/\n\s*\n/g, '\n') // Remove empty lines
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/\s*([{};:,()])\s*/g, '$1') // Remove spaces around operators
    .trim();
}

// Create output directory
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Bundle JavaScript files
function bundleJS() {
  console.log('📦 Bundling JavaScript...');
  
  let bundled = '';
  let totalSize = 0;
  
  CONFIG.jsFiles.forEach(file => {
    const filePath = path.join(CONFIG.inputDir, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      bundled += `/* ===== ${path.basename(file)} ===== */\n${content}\n\n`;
      totalSize += content.length;
      console.log(`   ✓ ${file}`);
    } else {
      console.warn(`   ⚠ File not found: ${file}`);
    }
  });
  
  // Write bundled file
  const outputPath = path.join(CONFIG.outputDir, 'js', 'bundle.min.js');
  ensureDir(path.dirname(outputPath));
  
  const minified = minifyJS(bundled);
  fs.writeFileSync(outputPath, minified);
  
  const originalSize = (totalSize / 1024).toFixed(2);
  const minifiedSize = (Buffer.byteLength(minified, 'utf8') / 1024).toFixed(2);
  const savings = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
  
  console.log(`   📊 Original: ${originalSize} KB → Minified: ${minifiedSize} KB (${savings}% reduction)`);
  console.log(`   ✅ Written to: ${outputPath}\n`);
  
  return { original: originalSize, minified: minifiedSize };
}

// Bundle CSS files
function bundleCSS() {
  console.log('🎨 Bundling CSS...');
  
  let bundled = '';
  let totalSize = 0;
  
  CONFIG.cssFiles.forEach(file => {
    const filePath = path.join(CONFIG.inputDir, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      bundled += `/* ===== ${path.basename(file)} ===== */\n${content}\n\n`;
      totalSize += content.length;
      console.log(`   ✓ ${file}`);
    } else {
      console.warn(`   ⚠ File not found: ${file}`);
    }
  });
  
  // Write bundled file
  const outputPath = path.join(CONFIG.outputDir, 'css', 'bundle.min.css');
  ensureDir(path.dirname(outputPath));
  
  const minified = minifyCSS(bundled);
  fs.writeFileSync(outputPath, minified);
  
  const originalSize = (totalSize / 1024).toFixed(2);
  const minifiedSize = (Buffer.byteLength(minified, 'utf8') / 1024).toFixed(2);
  const savings = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
  
  console.log(`   📊 Original: ${originalSize} KB → Minified: ${minifiedSize} KB (${savings}% reduction)`);
  console.log(`   ✅ Written to: ${outputPath}\n`);
  
  return { original: originalSize, minified: minifiedSize };
}

// Copy HTML and update references
function processHTML() {
  console.log('📄 Processing HTML...');
  
  const htmlPath = path.join(CONFIG.inputDir, 'index.html');
  const outputPath = path.join(CONFIG.outputDir, 'index.html');
  
  let html = fs.readFileSync(htmlPath, 'utf8');
  
  // Replace individual CSS files with bundle
  const cssPattern = /<link rel="stylesheet" href="css\/[^"]+\.css" \/>/g;
  html = html.replace(cssPattern, '<link rel="stylesheet" href="css/bundle.min.css" />');
  
  // Replace individual JS files with bundle (keep only app.js reference and replace it)
  const jsFiles = CONFIG.jsFiles.map(f => f.replace('js/', 'js/').replace('.js', ''));
  jsFiles.forEach(file => {
    const pattern = new RegExp(`<script src="${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.js"><\\/script>`, 'g');
    html = html.replace(pattern, '');
  });
  
  // Add bundle script before closing body
  html = html.replace(
    '</body>',
    '    <script src="js/bundle.min.js"></script>\n  </body>'
  );
  
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, html);
  
  console.log(`   ✅ Written to: ${outputPath}\n`);
}

// Copy assets (images, fonts, etc.)
function copyAssets() {
  console.log('📁 Copying assets...');
  
  const assetsDir = path.join(CONFIG.inputDir, 'assets');
  const outputAssetsDir = path.join(CONFIG.outputDir, 'assets');
  
  if (fs.existsSync(assetsDir)) {
    fs.cpSync(assetsDir, outputAssetsDir, { recursive: true });
    console.log(`   ✅ Assets copied to: ${outputAssetsDir}\n`);
  } else {
    console.log('   ℹ No assets directory found\n');
  }
}

// Generate build manifest
function generateManifest(jsStats, cssStats) {
  console.log('📋 Generating build manifest...');
  
  const jsOrig = Number(jsStats.original);
  const jsMin = Number(jsStats.minified);
  const cssOrig = Number(cssStats.original);
  const cssMin = Number(cssStats.minified);
  const totalSavings = ((1 - (jsMin + cssMin) / (jsOrig + cssOrig)) * 100).toFixed(1);
  
  const manifest = {
    version: '1.0.0',
    buildDate: new Date().toISOString(),
    optimization: {
      javascript: {
        original: jsOrig.toFixed(2) + ' KB',
        minified: jsMin.toFixed(2) + ' KB',
        reduction: ((1 - jsMin / jsOrig) * 100).toFixed(1) + '%'
      },
      css: {
        original: cssOrig.toFixed(2) + ' KB',
        minified: cssMin.toFixed(2) + ' KB',
        reduction: ((1 - cssMin / cssOrig) * 100).toFixed(1) + '%'
      },
      totalSavings: totalSavings + '%',
      totalSize: (jsMin + cssMin).toFixed(2) + ' KB'
    },
    files: {
      js: ['js/bundle.min.js'],
      css: ['css/bundle.min.css'],
      html: ['index.html']
    }
  };
  
  const outputPath = path.join(CONFIG.outputDir, 'build-manifest.json');
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  
  console.log(`   ✅ Manifest written to: ${outputPath}\n`);
}

// Main build function
function build() {
  console.log('\n🚀 Starting production build...\n');
  console.log('=' .repeat(60) + '\n');
  
  const startTime = Date.now();
  
  // Clean output directory
  if (fs.existsSync(CONFIG.outputDir)) {
    fs.rmSync(CONFIG.outputDir, { recursive: true });
    console.log('🧹 Cleaned output directory\n');
  }
  
  // Run build steps
  const jsStats = bundleJS();
  const cssStats = bundleCSS();
  processHTML();
  copyAssets();
  generateManifest(jsStats, cssStats);
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('=' .repeat(60));
  console.log(`✅ Build completed in ${duration}s`);
  console.log(`📂 Output directory: ${CONFIG.outputDir}`);
  console.log(`💾 Total size: ${(Number(jsStats.minified) + Number(cssStats.minified)).toFixed(2)} KB`);
  console.log(`📉 Compression: ${((1 - (Number(jsStats.minified) + Number(cssStats.minified)) / (Number(jsStats.original) + Number(cssStats.original))) * 100).toFixed(1)}% reduction`);
  console.log('=' .repeat(60) + '\n');
}

// Run build
build();

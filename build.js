#!/usr/bin/env node
/* ============================================================================
 *  Vault Workbench · 构建脚本（零依赖）
 * ----------------------------------------------------------------------------
 *  把 src/ 下的片段按文件名字典序拼成根目录的 main.js。
 *
 *  为什么这样设计：
 *    - Obsidian 市场要求 release 附件就是 main.js / manifest.json / styles.css
 *      三个文件，插件目录里不会有 src/ 这种子目录，所以不能运行时 require。
 *    - 但我们又想让源码是多文件的（好读、好改、多人协作不打架）。
 *    - 于是：开发时改 src/，发布时拼成一个 main.js。
 *
 *  这不是打包器 —— 不做语法转换、不做依赖解析、不压缩，只是顺序拼接，
 *  所以「免构建」（不需要 npm / node_modules）这个特性依然成立。
 *
 *  用法： node build.js
 * ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC_DIR = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'main.js');

if (!fs.existsSync(SRC_DIR)) {
  console.error('找不到 src/ 目录');
  process.exit(1);
}

/* 按文件名字典序拼接 —— 所以片段文件名带数字前缀来固定顺序 */
const files = fs.readdirSync(SRC_DIR)
  .filter((f) => f.endsWith('.js'))
  .sort();

if (!files.length) {
  console.error('src/ 里没有 .js 片段');
  process.exit(1);
}

const BANNER = [
  '/* ==========================================================================',
  ' *  Vault Workbench · 库管理工作台',
  ' *',
  ' *  ⚠ 本文件由 build.js 从 src/ 拼接生成，请不要直接编辑。',
  ' *    要改代码请改 src/ 下对应的片段，然后跑：node build.js',
  ' *',
  ' *  片段顺序：' + files.join(' → '),
  ' * ========================================================================== */',
  ''
].join('\n');

const parts = [BANNER];
let total = 0;
for (const f of files) {
  const text = fs.readFileSync(path.join(SRC_DIR, f), 'utf8').replace(/\s*$/, '\n');
  parts.push(text);
  total += text.split('\n').length;
}

fs.writeFileSync(OUT, parts.join('\n'), 'utf8');
console.log('built main.js  ←  ' + files.length + ' 个片段 / ' + total + ' 行');

/* ----------------------------------------------------------------------------
 * i18n 构建期校验（兑现 docs/术语表.md 的承诺）
 * 抽取 05-i18n.js 里 I18N_ZH / I18N_EN 两侧的 key，断言：
 *   1. en 侧不得有 zh 侧不存在的孤儿 key（会显示中文兜底却多出一条死 key）
 *   2. 两侧条数一致（漏翻 / 多翻都会在这里报错，而不是等运行时）
 * 只做静态正则抽取（不 require，避免 05-i18n.js 的片段依赖），缺了就 exit 1。
 * -------------------------------------------------------------------------- */
const i18nFile = path.join(SRC_DIR, '05-i18n.js');
if (fs.existsSync(i18nFile)) {
  const dictSrc = fs.readFileSync(i18nFile, 'utf8');
  // 截取 I18N_ZH 与 I18N_EN 各自的字面量块
  const zhBlock = dictSrc.slice(dictSrc.indexOf('const I18N_ZH'), dictSrc.indexOf('const I18N_EN'));
  const enBlock = dictSrc.slice(dictSrc.indexOf('const I18N_EN'));
  // 抽取 key：行首两个空格 + 单引号字符串 + 冒号（对象字面量的 key）
  const keyRe = /^\s{2}'((?:[^'\\]|\\.)*)':\s*/gm;
  const pick = (block) => {
    const set = new Set();
    let m;
    while ((m = keyRe.exec(block))) set.add(m[1]);
    return set;
  };
  const zhKeys = pick(zhBlock);
  const enKeys = pick(enBlock);
  const orphan = [...enKeys].filter((k) => !zhKeys.has(k));
  const missing = [...zhKeys].filter((k) => !enKeys.has(k));
  if (orphan.length) {
    console.error('✗ i18n 校验失败：英文侧有 ' + orphan.length + ' 条中文侧不存在的孤儿 key：');
    orphan.forEach((k) => console.error('    ' + k));
    process.exit(1);
  }
  if (missing.length) {
    console.error('✗ i18n 校验失败：中文侧有 ' + missing.length + ' 条英文侧漏翻的 key：');
    missing.forEach((k) => console.error('    ' + k));
    process.exit(1);
  }
  console.log('✓ i18n 校验通过：zh ' + zhKeys.size + ' 条 = en ' + enKeys.size + ' 条');
}

/* -------------------------------------------------------------------------
 *  导出
 *  （本片段由 build.js 拼进 main.js，不要单独 require）
 * ------------------------------------------------------------------------- */
module.exports = VaultWorkbenchPlugin;
// 供本地冒烟测试引用（Obsidian 只关心默认导出，附加属性无副作用）
module.exports.VaultWorkbenchPlugin = VaultWorkbenchPlugin;
module.exports.WorkbenchView = WorkbenchView;
module.exports.WorkbenchSettingTab = WorkbenchSettingTab;
/* 库切换 / 可移植性的纯函数，冒烟测试直接对它们下断言
 * （Obsidian 侧只认默认导出，附加属性没有副作用） */
module.exports.helpers = {
  /* i18n（冒烟测试要断言 zh / en 两侧 key 集合完全一致） */
  tr, t: tr, setLang, getLang, tid, normLang, detectLang, I18N_ZH, I18N_EN, I18N_DICT,
  appDataDir, obsidianConfigPath, workbenchHome, sharedVaultsPath,
  readJsonFile, writeJsonFile, fsErrorText, cmpVer,
  vaultOpenUri, isCloudSyncedPath, looksLikeVault,
  deployWorkbenchToVault, enablePluginInVault, workbenchVersionIn,
  /* 跨库全文搜索（冒烟测试直接对它们下断言） */
  mdToPlainText, refreshSearchIndex, loadSearchIndex, saveSearchIndex, newSearchIndex,
  searchIndexPath, searchIndexDir, searchTermsOf, matchText, snippetOf, searchIndex, isSearchable,
  /* 外部库的结构改动（先算计划再执行，测试直接对这两步下断言） */
  planLinkRewrite, countRefs, applyLinkRewrite, undoLinkRewrite,
  renameInVault, trashInVault, restoreInVault, createNoteInVault, createFolderInVault,
  copyFileAcross, copyDirAcross, uniqueRelIn, readHeadAbs,
  /* 回收站映射（当前库删除也要能被回收站看到，见 deleteOneLocal） */
  trashCopyInVault, readTrashMap, writeTrashMap, listTrash,
  /* 批量打标（frontmatter 合并，测试直接对纯函数下断言） */
  addTagsToContent, parseTags, mergeTags,
  /* 常量表（冒烟要断言「常量里每个 id 在字典里都查得到」，
     否则会像 preset.dark / preset.minimal 那样键名对不上、界面直接显示 key） */
  PRESETS, WALLPAPERS, EDITOR_MENU, READ_MENU, NEW_MENU, OPEN_MODES, EDITOR_MODES
};

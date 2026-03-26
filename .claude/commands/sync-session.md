# Command: sync-session

## 描述
將當前對話 Session 的開發成果總結，並自動更新到文件與版本控制。

## 執行流程
當使用者呼叫此指令時，請嚴格執行以下步驟：

1. **總結內容**：根據當前對話，提取關鍵的開發改動 (Changes) 與決策 (Decisions)。
2. **更新文檔**：將內容寫入 `docs/` 目錄下的對應檔案（或建立新的 session-logs）。
3. **預覽確認**：顯示即將寫入的內容以及預計使用的 Git Commit Message。
4. **人工確認**：詢問使用者：「以上文檔更新與 Commit 訊息是否正確？是否執行 commit & push？」
5. **執行操作**：獲得同意後，依序執行：
   - `git add .`
   - `git commit -m "[docs] update session: <簡短描述>"`
   - `git push`

## 規則
- 如果文檔更新內容涉及 API 變更，必須標註 [BREAKING CHANGE]。
- Commit Message 必須符合 Conventional Commits 規範。
- 在執行 git 操作前，必須確保所有變更已正確寫入檔案系統。
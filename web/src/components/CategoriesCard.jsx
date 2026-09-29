import { categoryTree } from '../state.js';
import {
  addCategory, addSubcategory, renameCategory, renameSubcategory,
  deleteCategory, deleteSubcategory, mergeCategory, mergeSubcategory, isProtectedCategory
} from '../categories.js';
import { RulesEditor } from './RulesEditor.jsx';

// Port of index.html's renderCategoriesUI() — no manual re-render calls needed for the other
// cards that read categoryTree/budgets/dataset/overrides/learnedLookup (Budgets, Net Worth):
// they're already signal-reactive components and pick up every mutation here automatically.
export function CategoriesCard() {
  return (
    <details class="card">
      <summary><h2>Categories</h2></summary>
      <p style={{ color: 'var(--text-dim)', fontSize: '13px', margin: '0 0 14px' }}>
        Renaming or merging a category updates every transaction, budget, and categorization rule
        using it. A category can't be deleted while transactions or rules still use it. "Excluded"
        and "Other › Uncategorized" are built in and can't be renamed or removed.
      </p>
      <div id="category-tree-wrap">
        {categoryTree.value.map(entry => {
          const topProtected = isProtectedCategory(entry.key);
          return (
            <div class="cat-tree-row" key={entry.key}>
              <div class="cat-tree-header">
                <span class="cat-tree-name">{entry.key}{topProtected && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> (built in)</span>}</span>
                <span class="cat-tree-actions">
                  {!topProtected && <button onClick={() => renameCategory(entry.key)}>Rename</button>}
                  <button onClick={() => addSubcategory(entry.key)}>+ Sub</button>
                  {!topProtected && <button onClick={() => mergeCategory(entry.key)}>Merge into…</button>}
                  {!topProtected && <button onClick={() => deleteCategory(entry.key)}>Delete</button>}
                </span>
              </div>
              {entry.subs && entry.subs.length > 0 && (
                <div class="cat-tree-subs">
                  {entry.subs.map(sub => {
                    const subProtected = isProtectedCategory(entry.key + ' > ' + sub);
                    return (
                      <div class="cat-tree-sub-row" key={sub}>
                        <span>{sub}{subProtected && ' (built in)'}</span>
                        {!subProtected && (
                          <span class="cat-tree-actions">
                            <button onClick={() => renameSubcategory(entry.key, sub)}>Rename</button>
                            <button onClick={() => mergeSubcategory(entry.key, sub)}>Merge into…</button>
                            <button onClick={() => deleteSubcategory(entry.key, sub)}>Delete</button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: '14px' }}>
        <button class="btn-sm" onClick={addCategory}>+ Add category</button>
      </div>
      <RulesEditor />
    </details>
  );
}

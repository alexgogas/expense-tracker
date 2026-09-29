import { categoryTree } from '../state.js';
import {
  addCategory, addSubcategory, renameCategory, renameSubcategory,
  deleteCategory, deleteSubcategory, mergeCategory, mergeSubcategory
} from '../categories.js';

// Port of index.html's renderCategoriesUI() — no manual re-render calls needed for the other
// cards that read categoryTree/budgets/dataset/overrides/learnedLookup (Budgets, Net Worth):
// they're already signal-reactive components and pick up every mutation here automatically.
export function CategoriesCard() {
  return (
    <details class="card">
      <summary><h2>Categories</h2></summary>
      <p style={{ color: 'var(--text-dim)', fontSize: '13px', margin: '0 0 14px' }}>
        Renaming a category or subcategory updates every transaction using it. A category or
        subcategory can't be deleted while transactions still use it — recategorize them first.
      </p>
      <div id="category-tree-wrap">
        {categoryTree.value.map(entry => (
          <div class="cat-tree-row" key={entry.key}>
            <div class="cat-tree-header">
              <span class="cat-tree-name">{entry.key}</span>
              <span class="cat-tree-actions">
                <button onClick={() => renameCategory(entry.key)}>Rename</button>
                <button onClick={() => addSubcategory(entry.key)}>+ Sub</button>
                <button onClick={() => mergeCategory(entry.key)}>Merge into…</button>
                <button onClick={() => deleteCategory(entry.key)}>Delete</button>
              </span>
            </div>
            {entry.subs && entry.subs.length > 0 && (
              <div class="cat-tree-subs">
                {entry.subs.map(sub => (
                  <div class="cat-tree-sub-row" key={sub}>
                    <span>{sub}</span>
                    <span class="cat-tree-actions">
                      <button onClick={() => renameSubcategory(entry.key, sub)}>Rename</button>
                      <button onClick={() => mergeSubcategory(entry.key, sub)}>Merge into…</button>
                      <button onClick={() => deleteSubcategory(entry.key, sub)}>Delete</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: '14px' }}>
        <button class="btn-sm" onClick={addCategory}>+ Add category</button>
      </div>
    </details>
  );
}

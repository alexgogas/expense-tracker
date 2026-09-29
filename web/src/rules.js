// Editing actions for the user's categorization rules and role categories (both synced via
// app_settings.json). Every mutation replaces the signal's value with a shallow copy.

import { categorizationRules, categoryRoles } from './state.js';
import { markUnsaved } from './persistence.js';

export function isValidPattern(pattern) {
  try {
    new RegExp(pattern, 'i');
    return true;
  } catch (e) {
    return false;
  }
}

// First rule matching `merchant`, mirroring the engine's matching (case-insensitive, in order,
// skipping empty or invalid patterns) but reporting the rule's position in the list.
export function findMatchingRule(merchant) {
  const rules = categorizationRules.value;
  for (let i = 0; i < rules.length; i++) {
    const { pattern, category } = rules[i];
    if (!pattern || !category || !isValidPattern(pattern)) continue;
    if (new RegExp(pattern, 'i').test(merchant)) return { index: i, category };
  }
  return null;
}

export function addRule() {
  categorizationRules.value = [...categorizationRules.value, { pattern: '', category: '' }];
  markUnsaved();
}

export function updateRule(index, field, value) {
  categorizationRules.value = categorizationRules.value.map((r, i) => (i === index ? { ...r, [field]: value } : r));
  markUnsaved();
}

export function moveRule(index, delta) {
  const target = index + delta;
  const rules = categorizationRules.value;
  if (target < 0 || target >= rules.length) return;
  const next = rules.slice();
  [next[index], next[target]] = [next[target], next[index]];
  categorizationRules.value = next;
  markUnsaved();
}

export function deleteRule(index) {
  const rule = categorizationRules.value[index];
  if (rule.pattern && !confirm(`Delete the rule "${rule.pattern}" → ${rule.category || '(no category)'}?`)) return;
  categorizationRules.value = categorizationRules.value.filter((_, i) => i !== index);
  markUnsaved();
}

export function setRole(role, category) {
  categoryRoles.value = { ...categoryRoles.value, [role]: category };
  markUnsaved();
}

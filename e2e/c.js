// TEST ONLY: third file for the checkpoint end-to-end run.

// Returns the values that appear more than once in items.
function findDuplicates(items) {
  const duplicates = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (i !== j && items[i] === items[j] && !duplicates.includes(items[i])) {
        duplicates.push(items[i]);
      }
    }
  }
  return duplicates;
}

module.exports = { findDuplicates };

// Throwaway file for an OCR checkpoint test. Do not merge.
function average(values) {
  let total = 0;
  for (let i = 0; i <= values.length; i++) total += values[i];
  return total / values.length;
}
module.exports = { average };

const ArabicReshaper = require('arabic-reshaper').default || require('arabic-reshaper');
const bidi = require('bidi-js');
const text = "الفصل الأول: مقدمة";
let reshaped = "";
try {
  reshaped = ArabicReshaper.convertArabic ? ArabicReshaper.convertArabic(text) : (ArabicReshaper.default ? ArabicReshaper.default.convertArabic(text) : (typeof ArabicReshaper === 'function' ? ArabicReshaper(text) : "failed"));
} catch(e) {
  try {
     const reshaper = new ArabicReshaper();
     reshaped = reshaper.convertArabic(text);
  } catch(err) {
     console.error(err);
  }
}
console.log("Reshaped:", reshaped);

// Reverse simple
console.log("Reversed:", reshaped.split('').reverse().join(''));

// Try bidi-js
try {
  const bidiEngine = bidi();
  const levels = bidiEngine.getEmbeddingLevels(reshaped);
  const visual = bidiEngine.getVisualFromLogical(levels, reshaped);
  console.log("Bidi visual:", visual);
} catch(e) {
  console.error("Bidi error:", e);
}

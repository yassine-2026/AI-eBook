import ArabicReshaper from 'arabic-reshaper';
console.log(typeof ArabicReshaper);
if (typeof ArabicReshaper.convertArabic === 'function') {
  console.log("convertArabic:", ArabicReshaper.convertArabic("الفصل الأول"));
} else if (typeof ArabicReshaper === 'function') {
  console.log("func:", ArabicReshaper("الفصل الأول"));
} else {
  console.log("object:", ArabicReshaper);
}

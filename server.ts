import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import fs from "fs/promises";
import fsSync from "fs";
import { v4 as uuidv4 } from "uuid";
import { ZipArchive } from "archiver";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak, AlignmentType } from "docx";
import ArabicReshaper from "arabic-reshaper";

// Ensure static directories exist
const staticDir = path.join(process.cwd(), "static");
const booksDir = path.join(staticDir, "books");
const coversDir = path.join(staticDir, "covers");
[staticDir, booksDir, coversDir].forEach(d => {
  if (!fsSync.existsSync(d)) {
    fsSync.mkdirSync(d, { recursive: true });
  }
});

const LANGUAGES: Record<string, {name: string, code: string, direction: string, font: string}> = {
    'arabic': {name: 'العربية', code: 'ar', direction: 'rtl', font: 'Cairo'},
    'english': {name: 'English', code: 'en', direction: 'ltr', font: 'Helvetica'},
    'french': {name: 'Français', code: 'fr', direction: 'ltr', font: 'Helvetica'},
    'spanish': {name: 'Español', code: 'es', direction: 'ltr', font: 'Helvetica'},
    'german': {name: 'Deutsch', code: 'de', direction: 'ltr', font: 'Helvetica'},
    'italian': {name: 'Italiano', code: 'it', direction: 'ltr', font: 'Helvetica'},
    'portuguese': {name: 'Português', code: 'pt', direction: 'ltr', font: 'Helvetica'},
    'russian': {name: 'Русский', code: 'ru', direction: 'ltr', font: 'Helvetica'},
    'chinese': {name: '中文', code: 'zh', direction: 'ltr', font: 'Helvetica'}, // CJK fonts omitted for size, fallback
    'japanese': {name: '日本語', code: 'ja', direction: 'ltr', font: 'Helvetica'},
    'korean': {name: '한국어', code: 'ko', direction: 'ltr', font: 'Helvetica'},
    'hindi': {name: 'हिन्दी', code: 'hi', direction: 'ltr', font: 'Helvetica'},
    'turkish': {name: 'Türkçe', code: 'tr', direction: 'ltr', font: 'Helvetica'},
    'urdu': {name: 'اردو', code: 'ur', direction: 'rtl', font: 'Cairo'},
    'malay': {name: 'Bahasa Melayu', code: 'ms', direction: 'ltr', font: 'Helvetica'},
};

const COVER_THEMES: Record<string, {bg: string, accent: string, icon: string}> = {
    'educational': {bg: '#1a237e', accent: '#ffd600', icon: '📚'},
    'story': {bg: '#4a148c', accent: '#ff4081', icon: '📖'},
    'self_help': {bg: '#004d40', accent: '#00e5ff', icon: '💪'},
    'tech': {bg: '#0d47a1', accent: '#00e676', icon: '💻'},
    'religious': {bg: '#1b5e20', accent: '#ffd700', icon: '🕌'},
    'history': {bg: '#3e2723', accent: '#ffab00', icon: '📜'},
    'cooking': {bg: '#bf360c', accent: '#ffeb3b', icon: '🍳'},
    'business': {bg: '#01579b', accent: '#ff6d00', icon: '💼'},
    'science': {bg: '#311b92', accent: '#00e5ff', icon: '🔬'},
    'romance': {bg: '#880e4f', accent: '#ff80ab', icon: '💕'},
};

function processText(text: string, langKey: string): string {
    const lang = LANGUAGES[langKey] || LANGUAGES['english'];
    if (lang.direction === 'rtl') {
        const reshaped = ArabicReshaper.convertArabic(text);
        return reshaped.split('').reverse().join('');
    }
    return text;
}

function writePdfText(doc: typeof PDFDocument, text: string, langKey: string, options: any = {}) {
    const lang = LANGUAGES[langKey] || LANGUAGES['english'];
    if (lang.direction === 'rtl') {
        doc.text(processText(text, langKey), { align: 'right', ...options });
    } else {
        doc.text(text, options);
    }
}

function generateSvgCover(title: string, subtitle: string, author: string, genre: string, langKey: string): string {
    let theme = COVER_THEMES['educational'];
    for (const key of Object.keys(COVER_THEMES)) {
        if (genre.toLowerCase().includes(key) || genre === key) {
            theme = COVER_THEMES[key];
            break;
        }
    }

    return `<svg width="800" height="1200" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${theme.bg}" />
        
        <!-- Decorative pattern -->
        <g stroke="${theme.bg}" stroke-width="2">
            ${Array.from({length: 20}).map((_, i) => `<line x1="${i*40}" y1="0" x2="${i*40 + 20}" y2="1200" />`).join('')}
        </g>
        
        <!-- Border -->
        <rect x="20" y="20" width="760" height="1160" fill="none" stroke="${theme.accent}" stroke-width="3" />
        <rect x="30" y="30" width="740" height="1140" fill="none" stroke="${theme.accent}" stroke-width="1" />
        
        <g text-anchor="middle" font-family="sans-serif">
            <!-- Icon -->
            <text x="400" y="150" font-size="72">${theme.icon}</text>
            
            <text x="400" y="400" font-size="56" font-weight="bold" fill="${theme.accent}">${title}</text>
            <text x="400" y="500" font-size="28" font-weight="normal" fill="#ffffff">${subtitle}</text>
            
            <text x="400" y="1050" font-size="24" font-weight="normal" fill="#ffffff">${LANGUAGES[langKey]?.direction === 'rtl' ? 'تأليف' : 'By'}: ${author}</text>
        </g>
    </svg>`;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use('/static', express.static(path.join(process.cwd(), 'static')));

  app.post("/api/generate-book", async (req, res) => {
    try {
      const { topic, genre, chapters: chaptersCountStr, max_pages: maxPagesStr, language, author } = req.body;
      const chaptersCount = Math.min(parseInt(chaptersCountStr) || 5, 20); // allow up to 20
      const maxPages = Math.min(parseInt(maxPagesStr) || 100, 100);
      
      const groqKey = process.env.GROQ_API_KEY;
      const geminiKey = process.env.GEMINI_API_KEY;
      
      if (!groqKey && !geminiKey) {
          return res.status(500).json({ error: "No AI API Key configured." });
      }

      const generateText = async (prompt: string, maxTokens: number = 2000, asJson: boolean = false) => {
          if (groqKey) {
            const groq = new Groq({ apiKey: groqKey });
            const completion = await groq.chat.completions.create({
              messages: [{ role: "user", content: prompt }],
              model: "llama-3.3-70b-versatile",
              temperature: 0.8,
              max_tokens: maxTokens,
              ...(asJson ? { response_format: { type: "json_object" } } : {})
            });
            return completion.choices[0]?.message?.content || "";
          } else {
            const ai = new GoogleGenAI({ apiKey: geminiKey! });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    temperature: 0.8,
                    ...(asJson ? { responseMimeType: "application/json" } : {})
                }
            });
            return response.text || "";
          }
      };

      const langInfo = LANGUAGES[language] || LANGUAGES['english'];

      // STEP 1: Generate structure
      const prompt = `Write a complete ${genre} book in ${langInfo.name} about "${topic}".
Author: ${author}
Maximum pages: ${maxPages}

CRITICAL RULES:
1. Each chapter must have COMPLETELY DIFFERENT content
2. NO repetition between chapters
3. NO spelling or grammar errors
4. Write REAL, accurate content about the topic
5. Each chapter should be 300-500 words

Return ONLY valid JSON exactly in this format:
{
    "title": "Book Title",
    "subtitle": "Subtitle",
    "description": "2 sentence description",
    "chapters": [
        {"number": 1, "title": "Chapter Title", "content": "Full chapter content with paragraphs separated by newlines..."}
    ]
}`;

      let bookData: any = {};
      try {
          const text = await generateText(prompt, 8000, true);
          bookData = JSON.parse(text);
          if (!bookData.chapters || bookData.chapters.length === 0) {
              throw new Error("No chapters found in AI response");
          }
      } catch (e: any) {
          console.error("Failed to generate structure in one go. Using fallback.", e.message);
          console.error(e.stack);
          fsSync.writeFileSync('error.log', e.stack);
          return res.status(500).json({ error: "Failed to generate book content correctly. Try again." });
      }

      // Limit chapters
      bookData.chapters = bookData.chapters.slice(0, chaptersCount);
      bookData.author = author;

      const bookId = uuidv4().slice(0, 12);
      
      // Cover
      const coverSvg = generateSvgCover(bookData.title, bookData.subtitle || "", author, genre, language);
      const coverPath = `covers/cover_${bookId}.svg`;
      await fs.writeFile(path.join(staticDir, coverPath), coverSvg, "utf-8");

      const bookDir = path.join(booksDir, bookId);
      await fs.mkdir(bookDir, { recursive: true });

      // Generate HTML
      let htmlContent = `<!DOCTYPE html><html dir="${langInfo.direction}" lang="${langInfo.code}"><head><meta charset="UTF-8"><title>${bookData.title}</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.8}h1{color:#1a237e;text-align:center}h2{color:#4a148c;margin-top:40px}.chapter{margin:30px 0;padding:20px;background:#f5f5f5;border-radius:10px}</style></head><body><h1>${bookData.title}</h1><p style="text-align:center">By: ${author}</p><hr>`;
      
      // Generate TXT
      let txtContent = `${bookData.title}\nBy: ${author}\n==================================================\n\n`;
      
      bookData.chapters.forEach((ch: any) => {
          htmlContent += `<div class="chapter"><h2>Chapter ${ch.number}: ${ch.title}</h2><p>${ch.content.replace(/\\n/g, '<br>').split('\\n\\n').join('</p><p>')}</p></div>`;
          txtContent += `CHAPTER ${ch.number}: ${ch.title}\n------------------------------\n${ch.content}\n\n`;
      });
      htmlContent += `</body></html>`;

      await fs.writeFile(path.join(bookDir, `book.txt`), txtContent, "utf-8");
      await fs.writeFile(path.join(bookDir, `book.html`), htmlContent, "utf-8");

      // Generate DOCX
      const docxChildren = [
        new Paragraph({ text: bookData.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: bookData.subtitle || "", heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: `By: ${author}`, alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ text: 'Table of Contents', heading: HeadingLevel.HEADING_1 }),
      ];
      
      bookData.chapters.forEach((ch: any) => {
         docxChildren.push(new Paragraph({ text: `Chapter ${ch.number}: ${ch.title}` }));
      });
      
      bookData.chapters.forEach((ch: any) => {
          docxChildren.push(new Paragraph({ children: [new PageBreak()] }));
          docxChildren.push(new Paragraph({ text: `Chapter ${ch.number}: ${ch.title}`, heading: HeadingLevel.HEADING_1 }));
          const paras = ch.content.split('\n').filter((p: string) => p.trim());
          paras.forEach((p: string) => {
              docxChildren.push(new Paragraph({ text: p.trim() }));
          });
      });

      const doc = new Document({
          sections: [{ properties: {}, children: docxChildren }]
      });
      const docxBuffer = await Packer.toBuffer(doc);
      await fs.writeFile(path.join(bookDir, `book.docx`), docxBuffer);

      // Generate PDF
      const pdfPath = path.join(bookDir, `book.pdf`);
      await new Promise<void>((resolve, reject) => {
          const pdfDoc = new PDFDocument({ autoFirstPage: true, margin: 50 });
          const stream = fsSync.createWriteStream(pdfPath);
          pdfDoc.pipe(stream);
          
          if (fsSync.existsSync(path.join(process.cwd(), 'Cairo-Regular.ttf'))) {
              pdfDoc.registerFont('Cairo', path.join(process.cwd(), 'Cairo-Regular.ttf'));
              pdfDoc.registerFont('CairoBold', path.join(process.cwd(), 'Cairo-Bold.ttf'));
          }

          const fontRegular = langInfo.font === 'Cairo' ? 'Cairo' : 'Helvetica';
          const fontBold = langInfo.font === 'Cairo' ? 'CairoBold' : 'Helvetica-Bold';
          
          pdfDoc.font(fontBold).fontSize(28);
          writePdfText(pdfDoc, bookData.title, language, { align: 'center' });
          pdfDoc.moveDown();
          if (bookData.subtitle) {
              pdfDoc.font(fontRegular).fontSize(16);
              writePdfText(pdfDoc, bookData.subtitle, language, { align: 'center' });
              pdfDoc.moveDown();
          }
          pdfDoc.fontSize(14);
          writePdfText(pdfDoc, `${langInfo.direction === 'rtl' ? 'تأليف' : 'By'}: ${author}`, language, { align: 'center' });
          
          pdfDoc.addPage();
          pdfDoc.font(fontBold).fontSize(20);
          writePdfText(pdfDoc, "Table of Contents", language);
          pdfDoc.moveDown();
          pdfDoc.font(fontRegular).fontSize(14);
          bookData.chapters.forEach((ch: any) => {
              writePdfText(pdfDoc, `Chapter ${ch.number}: ${ch.title}`, language);
              pdfDoc.moveDown(0.5);
          });
          
          let pageCount = 2;
          for (const ch of bookData.chapters) {
             if (pageCount >= maxPages) break;
             pdfDoc.addPage();
             pageCount++;
             pdfDoc.font(fontBold).fontSize(20);
             writePdfText(pdfDoc, `Chapter ${ch.number}: ${ch.title}`, language);
             pdfDoc.moveDown();
             pdfDoc.font(fontRegular).fontSize(12);
             const paras = ch.content.split('\n').filter((p: string) => p.trim());
             for (const p of paras) {
                writePdfText(pdfDoc, p.trim(), language);
                pdfDoc.moveDown();
             }
          }

          pdfDoc.end();
          stream.on('finish', resolve);
          stream.on('error', reject);
      });

      // Generate ZIP
      const zipPath = path.join(bookDir, `book_formats.zip`);
      await new Promise<void>((resolve, reject) => {
          const output = fsSync.createWriteStream(zipPath);
          const archive = new ZipArchive({ zlib: { level: 9 } });
          output.on('close', resolve);
          archive.on('error', reject);
          archive.pipe(output);
          archive.file(path.join(bookDir, 'book.pdf'), { name: 'book.pdf' });
          archive.file(path.join(bookDir, 'book.docx'), { name: 'book.docx' });
          archive.file(path.join(bookDir, 'book.txt'), { name: 'book.txt' });
          archive.file(path.join(bookDir, 'book.html'), { name: 'book.html' });
          archive.finalize();
      });

      res.json({
        success: true,
        book_id: bookId,
        title: bookData.title,
        subtitle: bookData.subtitle,
        description: bookData.description,
        chapters: bookData.chapters,
        cover_url: `/static/${coverPath}`,
        downloads: {
            pdf: `/static/books/${bookId}/book.pdf`,
            docx: `/static/books/${bookId}/book.docx`,
            txt: `/static/books/${bookId}/book.txt`,
            html: `/static/books/${bookId}/book.html`,
            all: `/static/books/${bookId}/book_formats.zip`
        }
      });
      
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || "Failed to generate book" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

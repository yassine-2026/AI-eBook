import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import fs from "fs/promises";
import fsSync from "fs";
import { v4 as uuidv4 } from "uuid";
import archiver from "archiver";
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

function writeArabic(doc: typeof PDFDocument, text: string, options: any = {}) {
    const reshaped = ArabicReshaper.convertArabic(text);
    // Reverse the string for RTL rendering in pdfkit
    const reversed = reshaped.split('').reverse().join('');
    doc.text(reversed, { align: 'right', ...options });
}

function generateSvgCover(title: string, subtitle: string, author: string, genre: string): string {
    const themes: Record<string, { bg: string, accent: string }> = {
        'educational': { bg: '#1a237e', accent: '#ffd600' },
        'story': { bg: '#4a148c', accent: '#ff4081' },
        'self_help': { bg: '#004d40', accent: '#00e5ff' },
        'tech': { bg: '#0d47a1', accent: '#00e676' },
        'religious': { bg: '#1b5e20', accent: '#ffd700' },
        'history': { bg: '#3e2723', accent: '#ffab00' },
        'cooking': { bg: '#bf360c', accent: '#ffeb3b' },
        'business': { bg: '#01579b', accent: '#ff6d00' },
        'science': { bg: '#311b92', accent: '#00e5ff' },
        'romance': { bg: '#880e4f', accent: '#ff80ab' },
    };
    
    // find theme matching genre keywords or fallback
    let currentTheme = themes['educational'];
    for (const key of Object.keys(themes)) {
        if (genre.toLowerCase().includes(key.toLowerCase()) || genre === key) {
            currentTheme = themes[key];
            break;
        }
    }

    return `<svg width="800" height="1200" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${currentTheme.bg}" />
        <rect x="50" y="50" width="700" height="1100" fill="none" stroke="${currentTheme.accent}" stroke-width="4" />
        <rect x="70" y="70" width="660" height="1060" fill="none" stroke="${currentTheme.accent}" stroke-width="1" />
        <g text-anchor="middle" font-family="sans-serif">
            <text x="400" y="300" font-size="64" font-weight="bold" fill="${currentTheme.accent}">${title}</text>
            <text x="400" y="380" font-size="32" font-weight="normal" fill="#ffffff">${subtitle}</text>
            <text x="400" y="1050" font-size="24" font-weight="normal" fill="#ffffff">تأليف: ${author}</text>
        </g>
    </svg>`;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  
  // Serve static files
  app.use('/static', express.static(path.join(process.cwd(), 'static')));

  app.post("/api/generate-book", async (req, res) => {
    try {
      const { topic, genre, chapters: chaptersCountStr, language, author } = req.body;
      const chaptersCount = parseInt(chaptersCountStr) || 5;
      
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
                model: 'gemini-2.5-pro',
                contents: prompt,
                config: {
                    temperature: 0.8,
                    ...(asJson ? { responseMimeType: "application/json" } : {})
                }
            });
            return response.text || "";
          }
      };

      // STEP 1: Generate unique chapter titles
      const titlesPrompt = `Create ${chaptersCount} UNIQUE chapter titles for a ${genre} book about "${topic}" in ${language}.
Rules:
- Each title must be DIFFERENT from others
- No repetition in words
- Each title should be engaging and descriptive
- Return ONLY a JSON array of strings, inside a {"titles": []} object.
Example: {"titles": ["عنوان الفصل الأول","عنوان الفصل الثاني"]}`;

      console.log("Generating titles...");
      const titlesText = await generateText(titlesPrompt, 500, true);
      let chapterTitles: string[] = [];
      try {
          chapterTitles = JSON.parse(titlesText).titles;
          if (!Array.isArray(chapterTitles)) throw new Error("Not an array");
      } catch (e) {
          console.error("Failed to parse titles", titlesText);
          chapterTitles = Array.from({length: chaptersCount}, (_, i) => `Chapter ${i+1}`);
      }

      // STEP 2: Generate chapters with unique content
      const bookContent = [];
      const usedKeywords = new Set<string>();

      for (let i = 0; i < chaptersCount; i++) {
          const chTitle = chapterTitles[i] || `Chapter ${i+1}`;
          console.log(`Generating chapter ${i+1}/${chaptersCount}: ${chTitle}`);
          
          const contentPrompt = `Write Chapter ${i+1} of a ${genre} book about "${topic}" in ${language}.
Chapter title: ${chTitle}
Tone: professional

CRITICAL RULES:
- Write 400-600 words of ORIGINAL, highly educational content
- DO NOT repeat information from other chapters
- Avoid using these keywords heavily: ${Array.from(usedKeywords).slice(0, 10).join(', ')}
- Include practical examples and real-world facts
- ZERO spelling mistakes, perfect grammar and formatting
- Content must be specific to the chapter title: ${chTitle}

Return ONLY the chapter content, no other text. No markdown block wrappings like \`\`\` just the text. Use empty lines to separate paragraphs.`;
          
          let chapterContent = await generateText(contentPrompt, 2000, false);
          // clean markdown
          chapterContent = chapterContent.replace(/^```[a-z]*\n/i, '').replace(/```$/i, '').trim();

          bookContent.push({
              number: i + 1,
              title: chTitle,
              content: chapterContent
          });

          // Track keywords
          const words = chapterContent.toLowerCase().split(/\s+/).slice(0, 30);
          words.forEach(w => { if (w.length > 4) usedKeywords.add(w) });
      }

      // STEP 3: Generate Book Meta
      const metaPrompt = `Create a professional book title and description for a ${genre} book about "${topic}" in ${language}.
Return JSON exactly in this format:
{"title":"عنوان رئيسي جذاب","subtitle":"عنوان فرعي","description":"وصف تسويقي للكتاب في 3 جمل"}
No markdown.`;
      
      console.log("Generating meta...");
      const metaText = await generateText(metaPrompt, 500, true);
      let bookMeta = { title: topic, subtitle: "", description: "" };
      try {
          bookMeta = JSON.parse(metaText);
      } catch (e) {
          console.error("Failed to parse meta", metaText);
      }

      // STEP 4: Cover
      const bookId = uuidv4().slice(0, 12);
      const coverSvg = generateSvgCover(bookMeta.title, bookMeta.subtitle || "", author, genre);
      const coverPath = `covers/cover_${bookId}.svg`;
      await fs.writeFile(path.join(staticDir, coverPath), coverSvg, "utf-8");

      const bookDir = path.join(booksDir, bookId);
      await fs.mkdir(bookDir, { recursive: true });

      // Build text representations
      let txtContent = `${bookMeta.title}\n${bookMeta.subtitle || ''}\nAuthor: ${author}\n==================================================\n\n`;
      let htmlContent = `<!DOCTYPE html><html dir="${language.toLowerCase().includes('arabic') ? 'rtl' : 'ltr'}" lang="${language.toLowerCase().includes('arabic') ? 'ar' : 'en'}"><head><meta charset="UTF-8"><title>${bookMeta.title}</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.6}h1{color:#1a237e}h2{color:#4a148c;border-bottom:1px solid #ccc;padding-bottom:10px}.chapter{margin:30px 0;padding:20px;background:#fcfcfc;border-radius:10px}</style></head><body><h1>${bookMeta.title}</h1><h3>${bookMeta.subtitle || ''}</h3><p><strong>Author:</strong> ${author}</p><hr>`;
      
      bookContent.forEach(ch => {
          txtContent += `Chapter ${ch.number}: ${ch.title}\n------------------------------\n${ch.content}\n\n`;
          htmlContent += `<div class="chapter"><h2>Chapter ${ch.number}: ${ch.title}</h2><p>${ch.content.replace(/\\n/g, '<br>').split('\\n\\n').join('</p><p>')}</p></div>`;
      });
      htmlContent += `</body></html>`;

      await fs.writeFile(path.join(bookDir, `book.txt`), txtContent, "utf-8");
      await fs.writeFile(path.join(bookDir, `book.html`), htmlContent, "utf-8");

      // Generate DOCX
      const docxChildren = [
        new Paragraph({ text: bookMeta.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: bookMeta.subtitle || "", heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: `Author: ${author}`, alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ text: 'Table of Contents', heading: HeadingLevel.HEADING_1 }),
      ];
      
      bookContent.forEach(ch => {
         docxChildren.push(new Paragraph({ text: `Chapter ${ch.number}: ${ch.title}` }));
      });
      
      bookContent.forEach(ch => {
          docxChildren.push(new Paragraph({ children: [new PageBreak()] }));
          docxChildren.push(new Paragraph({ text: `Chapter ${ch.number}: ${ch.title}`, heading: HeadingLevel.HEADING_1 }));
          const paras = ch.content.split('\n').filter(p => p.trim());
          paras.forEach(p => {
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
          const doc = new PDFDocument({ autoFirstPage: true });
          const stream = fsSync.createWriteStream(pdfPath);
          doc.pipe(stream);
          
          doc.registerFont('Cairo', path.join(process.cwd(), 'Cairo-Regular.ttf'));
          doc.registerFont('CairoBold', path.join(process.cwd(), 'Cairo-Bold.ttf'));
          
          doc.font('CairoBold').fontSize(24);
          writeArabic(doc, bookMeta.title, { align: 'center' });
          if (bookMeta.subtitle) {
              doc.font('Cairo').fontSize(16);
              writeArabic(doc, bookMeta.subtitle, { align: 'center' });
          }
          doc.moveDown(2);
          doc.fontSize(14);
          writeArabic(doc, `تأليف: ${author}`, { align: 'center' });
          
          doc.addPage();
          doc.font('CairoBold').fontSize(20);
          writeArabic(doc, "فهرس المحتويات");
          doc.moveDown();
          doc.font('Cairo').fontSize(14);
          bookContent.forEach(ch => {
              writeArabic(doc, `الفصل ${ch.number}: ${ch.title}`);
              doc.moveDown(0.5);
          });
          
          bookContent.forEach(ch => {
             doc.addPage();
             doc.font('CairoBold').fontSize(20);
             writeArabic(doc, `الفصل ${ch.number}: ${ch.title}`);
             doc.moveDown();
             doc.font('Cairo').fontSize(12);
             const paras = ch.content.split('\n').filter(p => p.trim());
             paras.forEach(p => {
                writeArabic(doc, p.trim());
                doc.moveDown();
             });
          });

          doc.end();
          stream.on('finish', resolve);
          stream.on('error', reject);
      });

      // Generate ZIP
      const zipPath = path.join(bookDir, `book_all.zip`);
      await new Promise<void>((resolve, reject) => {
          const output = fsSync.createWriteStream(zipPath);
          const archive = archiver('zip', { zlib: { level: 9 } });
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
        meta: bookMeta,
        chapters: bookContent,
        cover_url: `/static/${coverPath}`,
        downloads: {
            pdf: `/static/books/${bookId}/book.pdf`,
            docx: `/static/books/${bookId}/book.docx`,
            txt: `/static/books/${bookId}/book.txt`,
            html: `/static/books/${bookId}/book.html`,
            all: `/static/books/${bookId}/book_all.zip`
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

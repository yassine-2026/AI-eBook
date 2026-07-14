import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/generate-book", async (req, res) => {
    try {
      const { topic, genre, chapters, language, author } = req.body;
      
      const prompt = `You are a professional author and structural editor. Write a complete, comprehensive book in ${language}.
Topic: ${topic}
Genre: ${genre}
Number of Chapters: ${chapters}
Author Name: ${author}

The book should be highly educational, engaging, and logically structured.

Return ONLY valid JSON in this exact structure, with no markdown formatting, no backticks, and no extra text outside the JSON object:
{
    "title": "Book Title",
    "subtitle": "Book Subtitle",
    "description": "Two sentence description of the book",
    "keywords": "comma, separated, keywords",
    "chapters": [
        {"number": 1, "title": "Chapter Title", "content": "Full, comprehensive chapter content. Write at least 300 words for this chapter. Format with proper paragraphs..."}
    ]
}

Make sure to respond with valid JSON only. Do not wrap in \`\`\`json. Every chapter must have substantial content. Ensure valid JSON escaping for quotes and newlines in content.`;

      let text = "";

      if (process.env.GROQ_API_KEY) {
        console.log("Using Groq API for generation");
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const completion = await groq.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: "llama-3.3-70b-versatile",
          temperature: 0.8,
          response_format: { type: "json_object" },
        });
        text = completion.choices[0]?.message?.content || "";
      } else if (process.env.GEMINI_API_KEY) {
        console.log("Using Gemini API for generation (Groq key not found)");
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                temperature: 0.8
            }
        });
        text = response.text || "";
      } else {
        return res.status(500).json({ error: "No AI API Key configured. Please add GEMINI_API_KEY or GROQ_API_KEY in Settings > Secrets." });
      }

      let bookData;
      try {
        bookData = JSON.parse(text);
      } catch (e) {
         // try to extract json if it got wrapped
         const start = text.indexOf('{');
         const end = text.lastIndexOf('}') + 1;
         if (start >= 0 && end > start) {
            bookData = JSON.parse(text.slice(start, end));
         } else {
            console.error("Raw LLM output:", text);
            throw new Error("Failed to parse AI response as JSON");
         }
      }

      // Ensure chapters are correctly typed and have content
      if (!bookData.chapters || !Array.isArray(bookData.chapters)) {
          throw new Error("Invalid book structure returned by AI (missing chapters).");
      }

      // Fetch Cover from Pexels
      let coverUrl = "";
      if (process.env.PEXELS_API_KEY) {
        try {
          const pexelsRes = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(topic + ' ' + genre)}&per_page=1&orientation=portrait`, {
            headers: {
              Authorization: process.env.PEXELS_API_KEY
            }
          });
          const pexelsData = await pexelsRes.json();
          if (pexelsData.photos && pexelsData.photos.length > 0) {
            coverUrl = pexelsData.photos[0].src.large;
          }
        } catch (err) {
          console.error("Pexels fetch error", err);
        }
      }
      
      // Fallback cover if Pexels fails or key missing
      if (!coverUrl) {
          coverUrl = `https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=800&auto=format&fit=crop`;
      }

      res.json({
        success: true,
        book: bookData,
        cover_url: coverUrl
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

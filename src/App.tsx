import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Sparkles, Download, Share2, Loader2, Image as ImageIcon, FileText, ChevronRight } from 'lucide-react';

interface Chapter {
  number: number;
  title: string;
  content: string;
}

interface BookData {
  title: string;
  subtitle: string;
  description: string;
  keywords: string;
  chapters: Chapter[];
}

const GENRES = [
  'educational',
  'story',
  'self_help',
  'tech',
  'religious',
  'history',
  'cooking',
  'business',
  'science',
  'romance'
];

const LANGUAGES = [
  { name: 'العربية', code: 'arabic' },
  { name: 'English', code: 'english' },
  { name: 'Français', code: 'french' },
  { name: 'Español', code: 'spanish' },
  { name: 'Deutsch', code: 'german' },
  { name: 'Italiano', code: 'italian' },
  { name: 'Português', code: 'portuguese' },
  { name: 'Русский', code: 'russian' },
  { name: '中文', code: 'chinese' },
  { name: '日本語', code: 'japanese' },
  { name: '한국어', code: 'korean' },
  { name: 'हिन्दी', code: 'hindi' },
  { name: 'Türkçe', code: 'turkish' },
  { name: 'اردو', code: 'urdu' },
  { name: 'Bahasa Melayu', code: 'malay' }
];

export default function App() {
  const [topic, setTopic] = useState('');
  const [genre, setGenre] = useState(GENRES[0]);
  const [chaptersCount, setChaptersCount] = useState(5);
  const [maxPages, setMaxPages] = useState(100);
  const [author, setAuthor] = useState('');
  const [language, setLanguage] = useState(LANGUAGES[0].code);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [book, setBook] = useState<BookData | null>(null);
  const [coverUrl, setCoverUrl] = useState('');

  const [downloads, setDownloads] = useState<any>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic || !author) {
      setError('Please fill in the topic and author name.');
      return;
    }

    setLoading(true);
    setError('');
    setBook(null);
    setCoverUrl('');
    setDownloads(null);

    try {
      const response = await fetch('/api/generate-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          genre,
          chapters: chaptersCount,
          max_pages: maxPages,
          author,
          language
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate book');
      }

      setBook({
        title: data.title || (data.meta?.title),
        subtitle: data.subtitle || (data.meta?.subtitle),
        description: data.description || (data.meta?.description),
        chapters: data.chapters || []
      });
      setCoverUrl(data.cover_url);
      setDownloads(data.downloads);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col md:flex-row print:bg-white print:block">
      {/* Sidebar - HIDDEN DURING PRINT */}
      <aside className="w-full md:w-[400px] md:h-screen md:sticky top-0 bg-white border-r border-slate-200 p-6 flex flex-col shadow-sm print:hidden overflow-y-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md">
            <BookOpen size={22} />
          </div>
          <div>
            <h1 className="font-bold text-xl leading-tight">AI eBook</h1>
            <p className="text-xs text-slate-500">صانع الكتب الذكي</p>
          </div>
        </div>

        <form onSubmit={handleGenerate} className="flex-1 flex flex-col gap-5">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Book Topic / موضوع الكتاب</label>
            <input
              type="text"
              required
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Artificial Intelligence Basics"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Author Name / اسم المؤلف</label>
            <input
              type="text"
              required
              value={author}
              onChange={e => setAuthor(e.target.value)}
              placeholder="John Doe"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Genre / التصنيف</label>
            <select
              value={genre}
              onChange={e => setGenre(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm appearance-none bg-white capitalize"
            >
              {GENRES.map(g => (
                <option key={g} value={g}>{g.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-4">
            <div className="space-y-1.5 flex-1">
              <label className="text-sm font-semibold text-slate-700">Chapters</label>
              <input
                type="number"
                min="3"
                max="10"
                value={chaptersCount}
                onChange={e => setChaptersCount(parseInt(e.target.value) || 3)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
              />
            </div>
            <div className="space-y-1.5 flex-1">
              <label className="text-sm font-semibold text-slate-700">Max Pages</label>
              <input
                type="number"
                min="10"
                max="100"
                value={maxPages}
                onChange={e => setMaxPages(parseInt(e.target.value) || 100)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
              />
            </div>
          </div>
          
          <div className="space-y-1.5 flex-1">
              <label className="text-sm font-semibold text-slate-700">Language</label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm appearance-none bg-white"
              >
                {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
              {error}
            </div>
          )}

          <div className="mt-auto pt-6">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-xl shadow-lg shadow-slate-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Writing Book...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Generate eBook
                </>
              )}
            </button>
            <p className="text-center text-xs text-slate-400 mt-3">Powered by Groq & Gemini</p>
          </div>
        </form>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 h-screen overflow-y-auto bg-slate-50 relative print:h-auto print:overflow-visible print:bg-white">
        
        {!book && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 print:hidden">
            <BookOpen size={64} className="mb-4 opacity-20" />
            <h2 className="text-xl font-medium text-slate-600 mb-2">No Book Generated Yet</h2>
            <p className="text-center max-w-sm text-sm">Fill out the form on the left to instantly generate a professional eBook complete with a cover, table of contents, and chapters.</p>
          </div>
        )}

        {loading && (
          <div className="h-full flex flex-col items-center justify-center p-8 print:hidden">
            <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
            <h2 className="text-xl font-medium text-slate-700 animate-pulse">Researching & Writing...</h2>
            <p className="text-slate-500 mt-2 text-sm max-w-md text-center">This might take a minute depending on the number of chapters.</p>
          </div>
        )}

        {book && (
          <AnimatePresence>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto p-8 md:p-12 print:p-0 print:max-w-none"
              dir={['arabic', 'urdu'].includes(language) ? 'rtl' : 'ltr'}
            >
              
              {/* Header Actions - HIDDEN IN PRINT */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-8 print:hidden" dir="ltr">
                <div className="flex items-center gap-2 flex-wrap flex-1">
                  {downloads && (
                    <>
                      <a href={downloads.pdf} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg shadow-sm text-sm font-medium transition-colors">
                        📕 PDF
                      </a>
                      <a href={downloads.docx} download className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg shadow-sm text-sm font-medium transition-colors">
                        📘 Word
                      </a>
                      <a href={downloads.txt} download className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg shadow-sm text-sm font-medium transition-colors">
                        📄 TXT
                      </a>
                      <a href={downloads.html} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg shadow-sm text-sm font-medium transition-colors">
                        🌐 HTML
                      </a>
                      <a href={downloads.all} download className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg shadow-sm text-sm font-medium transition-colors">
                        📦 ZIP (All)
                      </a>
                    </>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <a 
                    href={coverUrl}
                    download="cover.svg"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 text-sm font-medium text-slate-700 transition-colors"
                  >
                    <ImageIcon size={16} /> Cover
                  </a>
                  <button 
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 text-sm font-medium text-slate-700 transition-colors"
                    onClick={() => alert('Sharing is available in the full version!')}
                  >
                    <Share2 size={16} /> Share
                  </button>
                </div>
              </div>

              {/* BOOK COVER PAGE (Print Page 1) */}
              <div className="relative w-full aspect-[1/1.4] md:h-[800px] md:w-auto md:max-w-2xl mx-auto rounded-xl overflow-hidden shadow-2xl mb-24 print:shadow-none print:mb-0 print:rounded-none print:h-[100vh] print:w-[100vw] print:max-w-none print:flex print:items-center print:justify-center">
                <img 
                  src={coverUrl} 
                  alt="Cover Background" 
                  className="absolute inset-0 w-full h-full object-cover"
                  crossOrigin="anonymous" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-transparent"></div>
                <div className="absolute inset-0 p-12 flex flex-col items-center text-center justify-end pb-24 text-white">
                  <h1 className="text-5xl md:text-6xl font-bold mb-4 drop-shadow-lg" style={{ lineHeight: '1.2' }}>{book.title}</h1>
                  {book.subtitle && <p className="text-xl md:text-2xl text-slate-200 font-light mb-12 drop-shadow-md">{book.subtitle}</p>}
                  <div className="w-16 h-1 bg-indigo-500 mb-8 rounded-full"></div>
                  <p className="text-lg font-medium text-slate-300 uppercase tracking-widest drop-shadow-md">
                    {['arabic', 'urdu'].includes(language) ? 'تأليف' : 'By'}
                  </p>
                  <p className="text-2xl font-semibold mt-1 drop-shadow-md">{author}</p>
                </div>
              </div>

              {/* TABLE OF CONTENTS (Print Page Break) */}
              <div className="print-page bg-white p-10 md:p-16 rounded-xl shadow-sm border border-slate-100 mb-12 print:shadow-none print:border-none print:m-0 print:p-12 print:min-h-screen">
                <h2 className="text-3xl font-bold text-slate-900 mb-8 border-b border-slate-100 pb-4">
                  {['arabic', 'urdu'].includes(language) ? 'فهرس المحتويات' : 'Table of Contents'}
                </h2>
                <div className="space-y-4">
                  {book.chapters.map((ch, idx) => (
                    <div key={idx} className="flex items-baseline gap-4">
                      <span className="font-mono text-slate-400 font-medium">{ch.number.toString().padStart(2, '0')}</span>
                      <span className="flex-1 text-lg text-slate-800 font-medium border-b border-dotted border-slate-200 pb-1">{ch.title}</span>
                    </div>
                  ))}
                </div>
                
                <div className="mt-16 pt-8 border-t border-slate-100">
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    {['arabic', 'urdu'].includes(language) ? 'عن الكتاب' : 'About this Book'}
                  </h3>
                  <p className="text-slate-600 leading-relaxed">{book.description}</p>
                </div>
              </div>

              {/* CHAPTERS (Print Page Breaks) */}
              <div className="space-y-12 print:space-y-0">
                {book.chapters.map((ch, idx) => (
                  <div key={idx} className="print-page bg-white p-10 md:p-16 rounded-xl shadow-sm border border-slate-100 print:shadow-none print:border-none print:m-0 print:p-12 print:min-h-screen">
                    <div className="mb-10 text-center">
                      <span className="text-indigo-600 font-bold uppercase tracking-widest text-sm mb-2 block">
                        {['arabic', 'urdu'].includes(language) ? `الفصل ${ch.number}` : `Chapter ${ch.number}`}
                      </span>
                      <h2 className="text-3xl font-bold text-slate-900">{ch.title}</h2>
                    </div>
                    
                    <div className="prose prose-slate prose-lg max-w-none prose-p:leading-loose">
                      {ch.content.split('\n').filter(p => p.trim() !== '').map((p, i) => (
                        <p key={i} className="mb-6 text-slate-800 text-justify leading-relaxed">
                          {p.trim()}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}

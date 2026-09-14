import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Card, FeatureTag } from '../components/ui';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  sources?: { label: string; type: string }[];
  timestamp: string;
}

const PRESET_PROMPTS = [
  "Why is Gurugram currently top-ranked?",
  "Show the transaction trail for case NCRP-26-81942.",
  "Which mule account appears across multiple cases?",
  "Summarize this case for the report.",
  "What OSINT signals support the Gurugram prediction?",
  "How confident is the prediction and why?"
];

export default function AICopilot() {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg-1',
      sender: 'bot',
      text: "Welcome Officer. I am TRINETRA's AI Copilot. Ask me any question regarding active NCRP cases or spatial risk predictions.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'bot',
          text: '❌ ERROR: VITE_GEMINI_API_KEY is missing in your .env file!',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setIsTyping(false);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: `System Directive: You are TRINETRA AI Copilot, a high-level cybercrime intelligence assistant for police officers in India. Provide analytical, crisp, and forensic insights.\n\nUser Question: ${query}`
      });

      if (response.text) {
        setMessages(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'bot',
            text: response.text,
            sources: [{ label: 'TRINETRA Intelligence Core', type: 'system' }],
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      } else {
        throw new Error('No text returned from API.');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Copilot API Error:", err);
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'bot',
          text: `❌ Intelligence Engine Error: ${errorMessage}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const sfProFont = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif";

  return (
    <div className="p-7 space-y-6 max-w-6xl mx-auto" style={{ fontFamily: sfProFont }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Exact Sparkle Icon Container matching sidebar style */}
          <div 
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ backgroundColor: '#0d9488' }}
          >
            {/* 4-point sparkle icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M2 12h20M7 7l10 10M7 17L17 7" strokeWidth="0" />
              <path d="M12 3c0 4.5-3.5 8-8 8 4.5 0 8 3.5 8 8 0-4.5 3.5-8 8-8-4.5 0-8-3.5-8-8z" fill="currentColor" />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              AI Investigator Copilot
            </h1>
            <FeatureTag type="usp" />
          </div>
        </div>
      </div>

      {/* Chat Container */}
      <Card className="p-6 min-h-[440px] flex flex-col justify-between" style={{ fontFamily: sfProFont }}>
        <div className="space-y-6 overflow-y-auto max-h-[480px] pr-2">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-3xl space-y-2 ${msg.sender === 'user' ? 'flex flex-col items-end' : ''}`}>
                <div 
                  className="p-4 rounded-2xl text-[14px] leading-relaxed tracking-normal"
                  style={msg.sender === 'user'
                    ? { backgroundColor: 'var(--text-primary)', color: 'var(--text-inverted)', borderRadius: '16px 16px 4px 16px', fontFamily: sfProFont }
                    : { backgroundColor: 'var(--surface-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '16px 16px 16px 4px', fontFamily: sfProFont }
                  }
                >
                  <p className="whitespace-pre-line font-normal">{msg.text}</p>
                </div>

                {msg.sender === 'bot' && msg.sources && (
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Sources:</span>
                    {msg.sources.map((src, i) => (
                      <span 
                        key={i} 
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium border"
                        style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)', borderColor: 'var(--border)', fontFamily: sfProFont }}
                      >
                        {src.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex items-center gap-2 text-xs pl-2" style={{ color: 'var(--text-muted)', fontFamily: sfProFont }}>
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce"></span>
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce [animation-delay:0.2s]"></span>
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce [animation-delay:0.4s]"></span>
              <span className="ml-1 font-semibold" style={{ color: 'var(--text-primary)' }}>Analyzing intelligence sources...</span>
            </div>
          )}
        </div>

        {/* Input & Presets */}
        <div className="mt-6 space-y-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {PRESET_PROMPTS.map((prompt, i) => (
              <button 
                key={i} 
                onClick={() => handleSend(prompt)}
                className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border cursor-pointer"
                style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)', borderColor: 'var(--border)', fontFamily: sfProFont }}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="relative flex items-center">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask Copilot about NCRP cases, spatial risk, or suspect profiles..."
              className="w-full pl-4 pr-12 py-3 rounded-xl text-sm outline-none border"
              style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)', color: 'var(--input-text)', fontFamily: sfProFont }}
            />
            <button 
              onClick={() => handleSend()}
              className="absolute right-2 p-2 rounded-lg transition-colors cursor-pointer text-white"
              style={{ backgroundColor: 'var(--text-primary)' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
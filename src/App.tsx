import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Zap, MessageSquare, Github, Info, Volume2 } from 'lucide-react';
import LiveVoice from './components/LiveVoice';
import IntegrationGuide from './components/IntegrationGuide';
import TextToVoice from './components/TextToVoice';

export default function App() {
  const [activeTab, setActiveTab] = useState<'voice' | 'audio-chat' | 'integration'>('voice');

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="p-6 flex items-center justify-between border-bottom border-white/5 glass sticky top-0 z-50">
        <div className="flex items-center space-x-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Mic className="w-6 h-6 text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">VozAI</h1>
            <p className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold">Gemini Live Engine</p>
          </div>
        </div>

        <div className="flex items-center space-x-1 bg-white/5 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveTab('voice')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'voice' 
                ? 'bg-emerald-500 text-black shadow-md' 
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Voz en Vivo
          </button>
          <button
            onClick={() => setActiveTab('audio-chat')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'audio-chat' 
                ? 'bg-emerald-500 text-black shadow-md' 
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Chat de Audio
          </button>
          <button
            onClick={() => setActiveTab('integration')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'integration' 
                ? 'bg-emerald-500 text-black shadow-md' 
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Integración WhatsApp
          </button>
        </div>

        <div className="hidden md:flex items-center space-x-4">
          <a href="#" className="p-2 rounded-lg hover:bg-white/5 transition-colors">
            <Github className="w-5 h-5 text-zinc-400" />
          </a>
          <button className="px-4 py-2 rounded-lg bg-white/5 text-sm font-medium border border-white/10 hover:bg-white/10 transition-all">
            Documentación
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1"
          >
            {activeTab === 'voice' ? (
              <div className="h-full flex flex-col items-center justify-center py-20">
                <LiveVoice />
              </div>
            ) : activeTab === 'audio-chat' ? (
              <TextToVoice />
            ) : (
              <IntegrationGuide />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="p-8 border-t border-white/5 glass">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-6 text-sm text-zinc-500">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4" />
              <span>Powered by Gemini 2.5</span>
            </div>
            <div className="flex items-center space-x-2">
              <MessageSquare className="w-4 h-4" />
              <span>ManyChat Ready</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4 text-xs text-zinc-600">
            <span className="flex items-center space-x-1">
              <Info className="w-3 h-3" />
              <span>Demo Educativa</span>
            </span>
            <span>© 2026 VozAI Engine</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

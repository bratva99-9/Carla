import { useState } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Send, Volume2, Loader2, Play, MessageSquare, Zap, Database, Check } from 'lucide-react';
import { motion } from 'motion/react';

export default function TextToVoice() {
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [pcmData, setPcmData] = useState<Int16Array | null>(null);
  const [lastResponse, setLastResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir'>('Zephyr');
  const [supabaseData, setSupabaseData] = useState<any>(null);
  const [isFetchingSupabase, setIsFetchingSupabase] = useState(false);

  const fetchSupabaseData = async () => {
    setIsFetchingSupabase(true);
    setError(null);
    try {
      const res = await fetch('/api/supabase/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          functionName: 'get_accounting_summary', // Nombre de tu función en Supabase
          params: { user_id: 'test_user' } 
        })
      });
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const result = await res.json();
        if (result.status === 'success') {
          setSupabaseData(result.data);
        } else {
          throw new Error(result.error || result.message);
        }
      } else {
        const text = await res.text();
        console.error("Respuesta no JSON de la API:", text);
        throw new Error("La API devolvió una respuesta inesperada (HTML). Revisa que el servidor esté corriendo correctamente.");
      }
    } catch (err: any) {
      setError("Error al consultar Supabase: " + err.message);
    } finally {
      setIsFetchingSupabase(false);
    }
  };

  const voices = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir'];

  const playPcm = (data: Int16Array) => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const audioBuffer = audioContext.createBuffer(1, data.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      channelData[i] = data[i] / 32768.0;
    }
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
  };

  const generateAudioResponse = async () => {
    if (!input.trim()) return;
    
    setIsGenerating(true);
    setPcmData(null);
    setError(null);
    
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key de Gemini no encontrada.");

      const ai = new GoogleGenAI({ apiKey });
      
      // Contexto enriquecido con datos de Supabase si existen
      const context = supabaseData 
        ? `\n\nDATOS REALES DEL CLIENTE (Supabase): ${JSON.stringify(supabaseData)}` 
        : "";

      // Paso 1: Generar la respuesta contable en texto
      const textResult = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: input + context }] }],
        config: {
          systemInstruction: "Eres un Asistente Contable experto en Latinoamérica. Responde de forma profesional, clara y muy concisa (máximo 2 párrafos) en español latino. Si hay datos de Supabase, úsalos para dar una respuesta personalizada.",
        }
      });

      const textResponse = textResult.text;
      if (!textResponse) throw new Error("No se pudo generar la respuesta de texto.");
      setLastResponse(textResponse);

      // Paso 2: Convertir ese texto específico en audio
      const audioResult = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: textResponse }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
        },
      });

      const base64Audio = audioResult.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (base64Audio) {
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const data = new Int16Array(bytes.buffer);
        setPcmData(data);
        playPcm(data);
      } else {
        throw new Error("El modelo de voz no devolvió audio. Intenta con un mensaje más corto.");
      }
    } catch (error: any) {
      console.error("Error en el proceso de audio:", error);
      setError(error.message || "Error al procesar la solicitud.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full p-8 space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Asistente Contable IA</h2>
        <p className="text-zinc-400">Consulta tus dudas financieras y escucha la respuesta.</p>
        {error && (
          <p className="text-red-400 text-xs font-medium bg-red-400/10 py-1 px-3 rounded-full inline-block">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center justify-center space-x-4">
        <div className="flex flex-col space-y-1">
          <label className="text-[10px] uppercase font-bold text-zinc-500 ml-1">Voz de la IA</label>
          <select 
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value as any)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-zinc-300 outline-none focus:border-emerald-500/50 transition-all cursor-pointer"
          >
            {voices.map(v => <option key={v} value={v} className="bg-zinc-900">{v}</option>)}
          </select>
        </div>

        <div className="flex flex-col space-y-1">
          <label className="text-[10px] uppercase font-bold text-zinc-500 ml-1">Datos Supabase</label>
          <button
            onClick={fetchSupabaseData}
            disabled={isFetchingSupabase}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center space-x-2 border ${
              supabaseData 
                ? 'bg-orange-500/10 border-orange-500/50 text-orange-400' 
                : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
            }`}
          >
            {isFetchingSupabase ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            <span>{supabaseData ? 'Datos Cargados' : 'Consultar Supabase'}</span>
          </button>
        </div>
      </div>

      {supabaseData && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/20 flex items-center justify-between"
        >
          <div className="flex items-center space-x-2">
            <Check className="w-4 h-4 text-orange-500" />
            <span className="text-[10px] text-orange-300 font-medium">Contexto contable activo desde Supabase</span>
          </div>
          <button 
            onClick={() => setSupabaseData(null)}
            className="text-[10px] text-zinc-500 hover:text-white underline"
          >
            Limpiar
          </button>
        </motion.div>
      )}

      <div className="space-y-4">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe algo aquí..."
            className="w-full h-32 p-4 rounded-2xl glass bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all resize-none text-zinc-200"
          />
          <button
            onClick={generateAudioResponse}
            disabled={isGenerating || !input.trim()}
            className="absolute bottom-4 right-4 p-3 rounded-xl bg-emerald-500 text-black hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20"
          >
            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>

        {lastResponse && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-2xl glass border-emerald-500/20 bg-emerald-500/5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-emerald-500">
                <MessageSquare className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Respuesta de VozAI</span>
              </div>
              {pcmData && (
                <button 
                  onClick={() => playPcm(pcmData)}
                  className="flex items-center space-x-2 text-xs font-bold text-emerald-500 hover:underline"
                >
                  <Play className="w-3 h-3" />
                  <span>Escuchar de nuevo</span>
                </button>
              )}
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed italic">
              "{lastResponse}"
            </p>
          </motion.div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl glass border-white/5 space-y-2">
          <div className="flex items-center space-x-2 text-zinc-400">
            <Volume2 className="w-4 h-4" />
            <span className="text-xs font-bold">Voz: Zephyr</span>
          </div>
          <p className="text-[10px] text-zinc-500">Voz masculina, profesional y clara.</p>
        </div>
        <div className="p-4 rounded-xl glass border-white/5 space-y-2">
          <div className="flex items-center space-x-2 text-zinc-400">
            <Zap className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-bold">Modelo: Gemini TTS</span>
          </div>
          <p className="text-[10px] text-zinc-500">Generación de audio en milisegundos.</p>
        </div>
      </div>
    </div>
  );
}

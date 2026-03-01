import { useState } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Send, Volume2, Loader2, Play, MessageSquare, Zap } from 'lucide-react';
import { motion } from 'motion/react';

export default function TextToVoice() {
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [pcmData, setPcmData] = useState<Int16Array | null>(null);
  const [lastResponse, setLastResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<string>('Zephyr');
  const [rucData, setRucData] = useState<string | null>(null);

  const voices: { name: string; desc: string }[] = [
    { name: 'Zephyr', desc: 'Masculina · Calmada' },
    { name: 'Puck', desc: 'Masculina · Animada' },
    { name: 'Charon', desc: 'Masculina · Grave' },
    { name: 'Kore', desc: 'Femenina · Firme' },
    { name: 'Fenrir', desc: 'Masculina · Excitable' },
    { name: 'Aoede', desc: 'Femenina · Suave' },
    { name: 'Leda', desc: 'Femenina · Joven' },
    { name: 'Orus', desc: 'Masculina · Profunda' },
    { name: 'Schedar', desc: 'Femenina · Neutral' },
    { name: 'Achernar', desc: 'Masculina · Suave' },
    { name: 'Gacrux', desc: 'Masculina · Senior' },
    { name: 'Pulcherrima', desc: 'Femenina · Expresiva' },
    { name: 'Despina', desc: 'Femenina · Casual' },
    { name: 'Rasalgethi', desc: 'Masculina · Informativa' },
    { name: 'Alkes', desc: 'Masculina · Confiable' },
    { name: 'Sadachbia', desc: 'Masculina · Amigable' },
  ];

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
    setRucData(null);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key de Gemini no encontrada.");

      const ai = new GoogleGenAI({ apiKey });

      // Detectar RUC de 13 dígitos en el texto del usuario
      let contextoRuc = '';
      const rucMatch = input.match(/\b(\d{13})\b/);
      if (rucMatch) {
        const ruc = rucMatch[1];
        try {
          // Llamar ambas funciones en paralelo
          const [resRuc, resEstado] = await Promise.allSettled([
            fetch('/api/ruc/consultar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruc }) }),
            fetch('/api/ruc/estado-tributario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruc }) }),
          ]);

          let partes: string[] = [];

          if (resRuc.status === 'fulfilled') {
            if (resRuc.value.ok) {
              const json = await resRuc.value.json();
              if (json.data) partes.push(`Contribuyente: ${JSON.stringify(json.data)}`);
            } else {
              const errJson = await resRuc.value.json();
              partes.push(`Error Contribuyente: ${errJson.error || resRuc.value.status}`);
            }
          } else {
            partes.push(`Fallo red Contribuyente: ${resRuc.reason}`);
          }

          if (resEstado.status === 'fulfilled') {
            if (resEstado.value.ok) {
              const json = await resEstado.value.json();
              if (json.data) partes.push(`Estado tributario: ${typeof json.data === 'string' ? json.data : JSON.stringify(json.data)}`);
            } else {
              const errJson = await resEstado.value.json();
              partes.push(`Error Estado Tributario: ${errJson.error || resEstado.value.status}`);
            }
          } else {
            partes.push(`Fallo red Estado Tributario: ${resEstado.reason}`);
          }

          const info = partes.join(' | ');
          setRucData(`RUC ${ruc} → ${info}`);
          contextoRuc = `\n\n[DATOS REALES DE SUPABASE para RUC ${ruc}]:\n${partes.join('\n')}\nUsa ESTOS DATOS REALES para responder al usuario.`;
        } catch (e: any) {
          setRucData(`RUC ${ruc} → Error de código: ${e.message}`);
          contextoRuc = `\n\n[Error local al consultar RUC ${ruc}]`;
        }
      }


      // Paso 1: Generar la respuesta contable en texto
      const textResult = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: input + contextoRuc }] }],
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

      <div className="flex items-center justify-center">
        <div className="flex flex-col space-y-1">
          <label className="text-[10px] uppercase font-bold text-zinc-500 ml-1">Voz de la IA</label>
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-zinc-300 outline-none focus:border-emerald-500/50 transition-all cursor-pointer"
          >
            {voices.map(v => (
              <option key={v.name} value={v.name} className="bg-zinc-900">
                {v.name} — {v.desc}
              </option>
            ))}
          </select>
        </div>
      </div>

      {rucData && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 text-xs text-zinc-300 space-y-1"
        >
          <p className="text-blue-400 font-bold uppercase tracking-widest text-[10px]">✓ Supabase — Datos RUC recibidos</p>
          <p className="font-mono break-all">{rucData}</p>
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
            <span className="text-xs font-bold">Voz: {selectedVoice}</span>
          </div>
          <p className="text-[10px] text-zinc-500">
            {voices.find(v => v.name === selectedVoice)?.desc}
          </p>
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

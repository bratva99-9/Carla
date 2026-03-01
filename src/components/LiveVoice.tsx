import { useState, useRef } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Mic, MicOff, Volume2, Search, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Consulta RUC e estado tributario en paralelo desde Supabase
async function consultarRUC(ruc: string): Promise<string> {
  try {
    const [resRuc, resEstado] = await Promise.allSettled([
      fetch('/api/ruc/consultar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruc }) }),
      fetch('/api/ruc/estado-tributario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruc }) }),
    ]);

    let partes: string[] = [];

    if (resRuc.status === 'fulfilled' && resRuc.value.ok) {
      const json = await resRuc.value.json();
      const d = json.data;
      if (d) {
        const nombre = d.razon_social || d.nombre || d.name || JSON.stringify(d);
        const estado = d.estado || d.status || '';
        const tipo = d.tipo_contribuyente || d.tipo || '';
        const act = d.actividad_economica || d.actividad || '';
        let info = `Contribuyente: ${nombre}`;
        if (estado) info += `, Estado: ${estado}`;
        if (tipo) info += `, Tipo: ${tipo}`;
        if (act) info += `, Actividad: ${act}`;
        partes.push(info);
      }
    }

    if (resEstado.status === 'fulfilled' && resEstado.value.ok) {
      const json = await resEstado.value.json();
      if (json.data) {
        const estadoStr = typeof json.data === 'string' ? json.data : JSON.stringify(json.data);
        partes.push(`Estado tributario: ${estadoStr}`);
      }
    }

    if (partes.length === 0) return `No se encontraron datos para el RUC ${ruc} en Supabase.`;
    return `RUC ${ruc} — ${partes.join(' | ')}`;
  } catch (e: any) {
    return `Error al consultar el RUC ${ruc}: ${e.message}`;
  }
}


export default function LiveVoice() {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [aiTranscript, setAiTranscript] = useState<string>("");
  const [rucInfo, setRucInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioQueue = useRef<Int16Array[]>([]);
  const isPlaying = useRef(false);

  const lastQueriedRuc = useRef<string | null>(null);

  // Detecta RUCs (13 dígitos) en el texto transcrito del usuario
  // y envía el resultado real de Supabase de vuelta a la sesión de Gemini
  const detectAndQueryRUC = async (text: string) => {
    const match = text.match(/\b(\d{13})\b/);
    if (!match) return;
    const ruc = match[1];

    // Evitar consultar el mismo RUC múltiples veces en el mismo turno
    if (lastQueriedRuc.current === ruc) return;
    lastQueriedRuc.current = ruc;

    setRucInfo(`Consultando RUC ${ruc} en Supabase...`);
    const resultado = await consultarRUC(ruc);
    setRucInfo(resultado);

    // Inyectar el resultado real en la sesión de Gemini para que lo lea en voz alta
    if (sessionRef.current) {
      sessionRef.current.sendClientContent({
        turns: [{
          role: 'user',
          parts: [{ text: `[SISTEMA - Resultado de Supabase para RUC ${ruc}]: ${resultado}. Por favor lee esta información al usuario.` }]
        }],
        turnComplete: true,
      });
    }
  };

  const startSession = async () => {
    setIsConnecting(true);
    setError(null);
    setRucInfo(null);
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key de Gemini no encontrada.");

      const ai = new GoogleGenAI({ apiKey });

      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: `Eres VozAI, un asistente vocal inteligente especializado en consultas del SRI de Ecuador. 
Cuando el usuario mencione un número RUC (siempre de 13 dígitos), dile que lo estás consultando. 
El sistema procesará automáticamente la consulta y te dará los datos. 
Responde de forma concisa y profesional en español. Si el usuario no menciona un RUC, ayúdalo con preguntas sobre contribuyentes, facturas o el SRI.`,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log("Live session opened");
            startAudioCapture();
            setIsActive(true);
            setIsConnecting(false);
          },
          onmessage: async (message) => {
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const pcmData = new Int16Array(bytes.buffer);
              audioQueue.current.push(pcmData);
              if (!isPlaying.current) {
                playNextInQueue();
              }
            }

            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
              setAiTranscript(prev => prev + message.serverContent?.modelTurn?.parts?.[0]?.text);
            }

            // Detectar RUC en la transcripción del usuario
            const userText = (message as any).clientContent?.turns?.[0]?.parts?.[0]?.text
              || (message as any).serverContent?.inputTranscription?.text
              || '';
            if (userText) {
              setTranscript(userText);
              detectAndQueryRUC(userText);
            }

            if (message.serverContent?.interrupted) {
              audioQueue.current = [];
              isPlaying.current = false;
            }
          },
          onclose: () => {
            stopSession();
          },
          onerror: (err) => {
            console.error("Live session error:", err);
            stopSession();
          }
        }
      });
      sessionRef.current = session;
    } catch (error: any) {
      console.error("Failed to start session:", error);
      setError(error.message || "Error al conectar con la API de Voz.");
      setIsConnecting(false);
    }
  };

  const stopSession = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    stopAudioCapture();
    setIsActive(false);
    setIsConnecting(false);
    audioQueue.current = [];
    isPlaying.current = false;
    lastQueriedRuc.current = null;
  };

  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      processorRef.current.onaudioprocess = (e) => {
        if (isMuted) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }

        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        if (sessionRef.current) {
          sessionRef.current.sendRealtimeInput({
            media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      };

      sourceRef.current.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);
    } catch (err) {
      console.error("Error capturing audio:", err);
    }
  };

  const stopAudioCapture = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const playNextInQueue = async () => {
    if (audioQueue.current.length === 0) {
      isPlaying.current = false;
      return;
    }

    isPlaying.current = true;
    const pcmData = audioQueue.current.shift()!;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }

    const audioBuffer = audioContextRef.current.createBuffer(1, pcmData.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < pcmData.length; i++) {
      channelData[i] = pcmData[i] / 0x7FFF;
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => playNextInQueue();
    source.start();
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-8">
      <div className="relative">
        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1.2, opacity: 0.3 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute inset-0 rounded-full bg-emerald-500 animate-pulse-ring"
            />
          )}
        </AnimatePresence>

        <button
          onClick={isActive ? stopSession : startSession}
          disabled={isConnecting}
          className={`relative z-10 w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${isActive
            ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20'
            : 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'
            } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isConnecting ? (
            <Loader2 className="w-12 h-12 animate-spin text-white" />
          ) : isActive ? (
            <MicOff className="w-12 h-12 text-white" />
          ) : (
            <Mic className="w-12 h-12 text-white" />
          )}
        </button>
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">
          {isActive ? "Conversación en Vivo" : isConnecting ? "Conectando..." : "Inicia la IA de Voz"}
        </h2>
        <p className="text-zinc-400 max-w-md">
          {isActive
            ? "Habla ahora. La IA te responderá en tiempo real con voz natural."
            : "Experimenta la potencia de Gemini 2.5 Live API antes de integrarla en WhatsApp."}
        </p>
        {error && (
          <p className="text-red-400 text-xs font-medium bg-red-400/10 py-1 px-3 rounded-full inline-block">
            {error}
          </p>
        )}
      </div>

      {isActive && (
        <div className="flex space-x-4">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-3 rounded-full glass hover:bg-white/10 transition-colors"
          >
            {isMuted ? <MicOff className="w-6 h-6 text-red-400" /> : <Mic className="w-6 h-6 text-emerald-400" />}
          </button>
          <button
            className="p-3 rounded-full glass hover:bg-white/10 transition-colors"
          >
            <Volume2 className="w-6 h-6 text-zinc-300" />
          </button>
        </div>
      )}

      {aiTranscript && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg p-6 rounded-2xl glass text-sm leading-relaxed text-zinc-300 italic"
        >
          <span className="text-emerald-400 font-semibold mr-2 not-italic">VozAI:</span>
          {aiTranscript}
        </motion.div>
      )}

      {rucInfo && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg p-5 rounded-2xl border border-blue-500/30 bg-blue-500/10 text-sm"
        >
          <div className="flex items-center space-x-2 mb-2">
            <Search className="w-4 h-4 text-blue-400" />
            <span className="text-blue-400 font-semibold text-xs uppercase tracking-widest">Consulta RUC — SRI Ecuador</span>
          </div>
          <p className="text-zinc-200 leading-relaxed">{rucInfo}</p>
        </motion.div>
      )}
    </div>
  );
}

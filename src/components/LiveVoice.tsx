import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Mic, MicOff, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function LiveVoice() {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [aiTranscript, setAiTranscript] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioQueue = useRef<Int16Array[]>([]);
  const isPlaying = useRef(false);

  const startSession = async () => {
    setIsConnecting(true);
    setError(null);
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
          systemInstruction: "Eres un asistente de voz experto en automatización de WhatsApp y ManyChat. Tu nombre es VozAI. Eres amable, profesional y respondes de forma concisa.",
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
          className={`relative z-10 w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
            isActive 
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
          <span className="text-emerald-400 font-semibold mr-2">VozAI:</span>
          {aiTranscript}
        </motion.div>
      )}
    </div>
  );
}

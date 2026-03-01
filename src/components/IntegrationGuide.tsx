import { ExternalLink, Copy, Check, MessageSquare, Zap, Settings, Activity, RefreshCw, Volume2, Database } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function IntegrationGuide() {
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const webhookUrl = `${window.location.origin}/api/manychat/webhook`;

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      console.error("Error fetching logs:", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-12">
      <section className="space-y-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Zap className="w-6 h-6 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold">Integración con ManyChat</h2>
        </div>
        <p className="text-zinc-400">
          Sigue estos pasos para conectar tu flujo de WhatsApp en ManyChat con esta IA conversacional.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-8">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center space-x-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-black text-xs font-bold">1</span>
              <span>Configura el Webhook</span>
            </h3>
            <div className="p-4 rounded-xl glass space-y-3">
              <p className="text-xs text-zinc-500 uppercase font-bold tracking-wider">URL del Webhook</p>
              <div className="flex items-center space-x-2 bg-black/40 p-2 rounded-lg border border-white/5">
                <code className="text-xs text-emerald-400 truncate flex-1">{webhookUrl}</code>
                <button 
                  onClick={copyToClipboard}
                  className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-zinc-400" />}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center space-x-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-black text-xs font-bold">2</span>
              <span>En ManyChat</span>
            </h3>
            <ul className="space-y-3 text-sm text-zinc-400">
              <li className="flex items-start space-x-2">
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span>Ve a tu flujo de WhatsApp y añade un nodo de <b>External Request</b>.</span>
              </li>
              <li className="flex items-start space-x-2">
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span>Selecciona el método <b>POST</b> y pega la URL de arriba.</span>
              </li>
              <li className="flex items-start space-x-2">
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span>En el Body, envía el mensaje del usuario: <code>{"{ \"message\": \"{{last_text_input}}\" }"}</code>.</span>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center space-x-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-black text-xs font-bold">3</span>
              <span>Mapeo de Respuesta</span>
            </h3>
            <p className="text-sm text-zinc-400">En la pestaña <b>Mapeo de respuesta</b> de ManyChat, añade esto:</p>
            <div className="p-4 rounded-xl glass bg-black/20 border border-emerald-500/20">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-zinc-500 mb-1 uppercase font-bold">JSON Path</p>
                  <code className="text-emerald-400">$.reply</code>
                </div>
                <div>
                  <p className="text-zinc-500 mb-1 uppercase font-bold">Variable (User Field)</p>
                  <code className="text-white">tu_campo_personalizado</code>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-6 rounded-2xl glass border-emerald-500/20 bg-emerald-500/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-emerald-500">
                <Activity className="w-5 h-5" />
                <h4 className="font-bold">Historial de Webhooks</h4>
              </div>
              <button 
                onClick={fetchLogs}
                className={`p-1 hover:bg-white/10 rounded-md transition-colors ${loadingLogs ? 'animate-spin' : ''}`}
              >
                <RefreshCw className="w-4 h-4 text-zinc-500" />
              </button>
            </div>
            
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {logs.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-8 italic">No se han recibido peticiones aún.</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-3 rounded-lg bg-black/40 border border-white/5 space-y-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className={`px-1.5 py-0.5 rounded ${log.status === 200 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {log.status} {log.method}
                      </span>
                      <span className="text-zinc-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold">Payload Recibido:</p>
                      <code className="block text-[10px] text-zinc-300 bg-white/5 p-1.5 rounded truncate">
                        {log.payload}
                      </code>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-6 rounded-2xl glass space-y-4">
            <div className="flex items-center space-x-2 text-zinc-300">
              <Settings className="w-5 h-5" />
              <h4 className="font-bold">Ayuda con Errores</h4>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Si ves un error 400, revisa que el JSON en ManyChat tenga comillas dobles: <br/>
              <code className="text-emerald-500">{"{\"message\": \"{{last_text_input}}\"}"}</code>
            </p>
          </div>

          <div className="p-6 rounded-2xl glass border-blue-500/20 bg-blue-500/5 space-y-4">
            <div className="flex items-center space-x-2 text-blue-400">
              <Volume2 className="w-5 h-5" />
              <h4 className="font-bold">¿Llamadas en WhatsApp?</h4>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              WhatsApp API no permite interceptar llamadas telefónicas. La mejor alternativa es:
            </p>
            <ul className="text-[10px] space-y-2 text-zinc-400">
              <li className="flex items-center space-x-2">
                <div className="w-1 h-1 rounded-full bg-blue-400" />
                <span><b>Notas de Voz:</b> Procesa audios usando Gemini Multimodal.</span>
              </li>
              <li className="flex items-center space-x-2">
                <div className="w-1 h-1 rounded-full bg-blue-400" />
                <span><b>Web Call:</b> Envía un link a esta app para una llamada real.</span>
              </li>
            </ul>
          </div>
          <div className="p-6 rounded-2xl glass border-orange-500/20 bg-orange-500/5 space-y-4">
            <div className="flex items-center space-x-2 text-orange-400">
              <Database className="w-5 h-5" />
              <h4 className="font-bold">Conexión con Supabase</h4>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Puedes conectar tus tablas de facturación o clientes para que la IA responda con datos reales:
            </p>
            <div className="bg-black/40 p-3 rounded-lg border border-white/5">
              <code className="text-[10px] text-orange-300 leading-tight block whitespace-pre">
{`// Ejemplo de consulta en tu servidor
const { data } = await supabase
  .from('contabilidad')
  .select('*')
  .eq('usuario_id', id);

// Enviar a Gemini como contexto
const prompt = "Datos del cliente: " + JSON.stringify(data);`}
              </code>
            </div>
            <p className="text-[10px] text-zinc-500 italic">
              Ideal para estados de cuenta, saldos pendientes y reportes fiscales automáticos.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

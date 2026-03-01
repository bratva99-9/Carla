import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy Supabase client getter
let _supabase: any = null;
function getSupabase() {
  if (!_supabase) {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim();

    if (supabaseUrl && supabaseKey) {
      try {
        // Validar que sea una URL válida antes de intentar crear el cliente
        new URL(supabaseUrl);
        console.log("Initializing Supabase client with URL:", supabaseUrl);
        _supabase = createClient(supabaseUrl, supabaseKey);
      } catch (e: any) {
        console.error("Error crítico: La SUPABASE_URL proporcionada no es válida.", e.message);
        _supabase = null;
      }
    }
  }
  return _supabase;
}

// Initialize Database for logging
const db = new Database("logs.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS webhook_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    method TEXT,
    payload TEXT,
    response TEXT,
    status INTEGER
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API to fetch logs for the UI
  app.get("/api/logs", (req, res) => {
    const logs = db.prepare("SELECT * FROM webhook_logs ORDER BY timestamp DESC LIMIT 10").all();
    res.json(logs);
  });

  // Endpoint directo para consultar RUC via Edge Function de Supabase
  app.post("/api/ruc/consultar", async (req, res) => {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim();

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Supabase no configurado. Verifica SUPABASE_URL y SUPABASE_ANON_KEY en .env" });
    }

    const { ruc } = req.body;
    if (!ruc) {
      return res.status(400).json({ error: "Falta el parámetro 'ruc'" });
    }

    try {
      const edgeFnUrl = `${supabaseUrl}/functions/v1/consultar-ruc`;
      console.log(`Consultando RUC ${ruc} en: ${edgeFnUrl}`);

      const response = await fetch(edgeFnUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ruc }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Error en Edge Function consultar-ruc:", data);
        return res.status(response.status).json({ error: data?.error || "Error al consultar RUC", details: data });
      }

      console.log(`RUC ${ruc} consultado exitosamente.`);
      res.json({ status: "success", data });
    } catch (error: any) {
      console.error("Error consultando RUC:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Endpoint para consultar estado tributario (deudas y obligaciones pendientes)
  app.post("/api/ruc/estado-tributario", async (req, res) => {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim();
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Supabase no configurado." });
    }
    const { ruc } = req.body;
    if (!ruc) return res.status(400).json({ error: "Falta el parámetro 'ruc'" });
    try {
      const edgeFnUrl = `${supabaseUrl}/functions/v1/manychat-estado-tributario`;
      console.log(`Consultando estado tributario RUC ${ruc}`);
      const response = await fetch(edgeFnUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ruc }),
      });
      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json({ error: data?.error || "Error al consultar estado tributario", details: data });
      }
      console.log(`Estado tributario RUC ${ruc} consultado exitosamente.`);
      res.json({ status: "success", data });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API to call a Supabase RPC or Edge Function

  app.post("/api/supabase/rpc", async (req, res) => {
    console.log("POST /api/supabase/rpc hit with:", req.body);
    const supabase = getSupabase();
    if (!supabase) {
      console.error("Supabase client not initialized. Check env vars.");
      return res.status(500).json({ error: "Supabase no está configurado. Añade SUPABASE_URL y SUPABASE_ANON_KEY." });
    }

    const { functionName, params } = req.body;

    try {
      const { data, error } = await supabase.rpc(functionName, params);
      if (error) throw error;
      res.json({ status: "success", data });
    } catch (error: any) {
      console.error("Supabase RPC error:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // API to call a Supabase Edge Function
  app.post("/api/supabase/edge-function", async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ error: "Supabase no está configurado." });
    }

    const { functionName, body } = req.body;

    try {
      const { data, error } = await supabase.functions.invoke(functionName, { body });
      if (error) throw error;
      res.json({ status: "success", data });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // Error handler for malformed JSON
  app.use((err: any, req: any, res: any, next: any) => {
    if (err instanceof SyntaxError && 'body' in err) {
      const logEntry = db.prepare("INSERT INTO webhook_logs (method, payload, response, status) VALUES (?, ?, ?, ?)");
      logEntry.run("POST", "JSON MALFORMADO", "Error 400: JSON Inválido", 400);
      return res.status(400).json({ status: "error", message: "JSON inválido" });
    }
    next();
  });

  // Test route
  app.get("/api/manychat/webhook", (req, res) => {
    res.json({ status: "ok", message: "Servidor activo. Usa POST para ManyChat." });
  });

  // ManyChat Webhook Endpoint
  app.post("/api/manychat/webhook", (req, res) => {
    const payload = JSON.stringify(req.body);
    const responseBody = {
      status: "success",
      reply: `VozAI: Mensaje recibido correctamente a las ${new Date().toLocaleTimeString()}.`
    };

    const logEntry = db.prepare("INSERT INTO webhook_logs (method, payload, response, status) VALUES (?, ?, ?, ?)");
    logEntry.run("POST", payload, JSON.stringify(responseBody), 200);

    res.json(responseBody);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

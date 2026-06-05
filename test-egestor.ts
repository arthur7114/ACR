import { createClient } from "@supabase/supabase-js";
import { EgestorClient } from "./lib/server/egestor-client";

async function run() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl!, supabaseKey!);
  const { data: config } = await supabase.from("egestor_configuracoes").select("*").single();
  const client = new EgestorClient({ personalToken: config.personal_token });

  const payload = {
    codPlanoContas: 44,
    codFormaPgto: 0,
    numDoc: "TESTE-ACR",
    descricao: "TESTE INTEGRACAO ACR - FAVOR IGNORAR",
    valor: 1.50,
    dtVenc: new Date().toISOString().split("T")[0],
    dtComp: new Date().toISOString().split("T")[0],
    codContato: 233,
    codDisponivel: config.cod_disponivel_padrao ?? 2,
    recebido: false,
    dtPgto: null
  };

  try {
    const res = await client.createRecebimento(payload);
    console.log("Recebimento criado com dtPgto null!", res);
    if (res.codigo) {
      const tokenRes = await fetch("https://api.egestor.com.br/api/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "personal", personal_token: config.personal_token }) });
      const { access_token } = await tokenRes.json();
      await fetch(`https://api.egestor.com.br/api/v1/recebimentos/${res.codigo}`, { method: "DELETE", headers: { Authorization: `Bearer ${access_token}` } });
    }
  } catch (err: unknown) {
    console.error("dtPgto null failed", JSON.stringify((err as { payload?: unknown }).payload));
  }

  const payload2 = { ...payload, dtPgto: "" };
  try {
    const res2 = await client.createRecebimento(payload2);
    console.log("Recebimento criado com dtPgto vazio!", res2);
    if (res2.codigo) {
      const tokenRes = await fetch("https://api.egestor.com.br/api/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "personal", personal_token: config.personal_token }) });
      const { access_token } = await tokenRes.json();
      await fetch(`https://api.egestor.com.br/api/v1/recebimentos/${res2.codigo}`, { method: "DELETE", headers: { Authorization: `Bearer ${access_token}` } });
    }
  } catch (err: unknown) {
    console.error("dtPgto vazio failed", JSON.stringify((err as { payload?: unknown }).payload));
  }
}
run();

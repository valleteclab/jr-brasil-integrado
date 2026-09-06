"""Provisiona SOMENTE xerp-comercial-v1 na Evolution do CRM, sem enviar mensagens.

Executar como administrador na VPS. Segredos ficam em Docker secrets e em backup
local protegido (0600), nunca no Git nem no stdout. Não altera instâncias existentes.
"""
import json
import os
from pathlib import Path
import secrets
import subprocess

INSTANCE = "xerp-comercial-v1"
SECRET_DIR = Path("/root/.config/xerp-commercial-whatsapp")

def run(args, data=None):
    result = subprocess.run(args, input=data, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError("Falha em operação de provisionamento (detalhes omitidos para preservar credenciais).")
    return result.stdout.strip()

def main():
    os.umask(0o077)
    SECRET_DIR.mkdir(parents=True, exist_ok=True)
    crm = run(["docker", "ps", "-q", "--filter", "name=crm_api."]).splitlines()
    if len(crm) != 1:
        raise RuntimeError("Esperada uma réplica ativa da API do CRM.")
    saved = SECRET_DIR / "credentials.json"
    if saved.exists():
        values = json.loads(saved.read_text())
    else:
        values = {"apiKey": secrets.token_hex(32), "webhookSecret": secrets.token_hex(32)}
        saved.write_text(json.dumps(values))
        saved.chmod(0o600)
    # Credencial administrativa é lida dentro do container original, sem transferência ao ERP.
    js = r'''
const values = VALUES;
const instance = 'xerp-comercial-v1';
const base = process.env.EVOLUTION_BASE_URL.replace(/\/$/, '');
async function request(path, key, body) {
 const r = await fetch(base+path,{method:body?'POST':'GET',headers:{apikey:key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 return {status:r.status,data:await r.json()};
}
async function main() {
 let own = await request('/instance/connectionState/'+instance,values.apiKey);
 if (own.status!==200) {
   const list=await request('/instance/fetchInstances',process.env.EVOLUTION_API_KEY);
   if(list.status!==200 || !Array.isArray(list.data)) throw Error('Não foi possível verificar instâncias.');
   if(list.data.some(i=>(i.name||i.instance?.instanceName)===instance)) throw Error('Instância existente com outra credencial. Não foi alterada.');
   const made=await request('/instance/create',process.env.EVOLUTION_API_KEY,{instanceName:instance,integration:'WHATSAPP-BAILEYS',token:values.apiKey,qrcode:false});
   if(made.status!==201 && made.status!==200) throw Error('Falha ao criar instância comercial.');
   own=await request('/instance/connectionState/'+instance,values.apiKey);
 }
 if(own.status!==200) throw Error('Token exclusivo não autenticou.');
 const list=await request('/instance/fetchInstances',process.env.EVOLUTION_API_KEY);
 const other=list.data.find(i=>(i.name||i.instance?.instanceName)!==instance);
 if(other) {
   const name=other.name||other.instance?.instanceName;
   const denied=await request('/instance/connectionState/'+encodeURIComponent(name),values.apiKey);
   if(denied.status!==401 && denied.status!==403) throw Error('Token não isolado: não instalar no ERP.');
 }
 console.log(JSON.stringify({instance,state:own.data.instance?.state,isolated:!!other}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
'''.replace("VALUES", json.dumps(values))
    result = run(["docker", "exec", "-i", crm[0], "node"], js)
    for name, value in [("xerp_commercial_evolution_key", values["apiKey"]), ("xerp_commercial_webhook_secret", values["webhookSecret"])]:
        exists = subprocess.run(["docker", "secret", "inspect", name], capture_output=True).returncode == 0
        if not exists:
            run(["docker", "secret", "create", name, "-"], value)
    print(result)
    print("Docker secrets preparados; nenhuma mensagem enviada.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc))
        raise SystemExit(1)

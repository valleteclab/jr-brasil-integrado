"""Habilita o XERP WhatsApp das EMPRESAS (agente operacional) na Evolution do CRM.

Cria o Docker secret `xerp_evolution_global_key` com a chave global da Evolution, lida dentro
do container do CRM e nunca impressa. As instâncias por empresa (xerp-emp-*) são criadas pelo
ERP sob demanda, cada uma com token e segredo de webhook próprios. Não altera instâncias
existentes nem envia mensagens. Executar como administrador na VPS.
"""
import subprocess

SECRET_NAME = "xerp_evolution_global_key"

def run(args, data=None):
    result = subprocess.run(args, input=data, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError("Falha em operação de provisionamento (detalhes omitidos para preservar credenciais).")
    return result.stdout.strip()

def main():
    crm = run(["docker", "ps", "-q", "--filter", "name=crm_api."]).splitlines()
    if len(crm) != 1:
        raise RuntimeError("Esperada uma réplica ativa da API do CRM.")
    # Valida a chave contra a Evolution DE DENTRO do container do CRM; só o resultado sai.
    js = r'''
const base = process.env.EVOLUTION_BASE_URL.replace(/\/$/, '');
const key = process.env.EVOLUTION_API_KEY;
if (!key) { console.error('EVOLUTION_API_KEY ausente no CRM.'); process.exitCode = 1; }
else fetch(base + '/instance/fetchInstances', { headers: { apikey: key }, signal: AbortSignal.timeout(30000) })
  .then(r => { if (r.status !== 200) throw new Error('Chave global não autenticou na Evolution.'); return r.json(); })
  .then(list => console.log(JSON.stringify({ ok: true, instancias: Array.isArray(list) ? list.length : null })))
  .catch(e => { console.error(e.message); process.exitCode = 1; });
'''
    print(run(["docker", "exec", "-i", crm[0], "node"], js))
    exists = subprocess.run(["docker", "secret", "inspect", SECRET_NAME], capture_output=True).returncode == 0
    if exists:
        print(f"Secret {SECRET_NAME} já existe (para rotacionar: docker secret rm após remover do serviço).")
    else:
        key = run(["docker", "exec", crm[0], "printenv", "EVOLUTION_API_KEY"])
        run(["docker", "secret", "create", SECRET_NAME, "-"], key)
        print(f"Secret {SECRET_NAME} criado.")
    print("Aplique deploy/whatsapp-evolution-stack.yml (stack deploy) ou, sem redeploy completo:")
    print(f"  docker service update --secret-add {SECRET_NAME} "
          "--env-add WHATSAPP_EVOLUTION_URL=http://crm_evolution:8080 "
          f"--env-add WHATSAPP_EVOLUTION_API_KEY_FILE=/run/secrets/{SECRET_NAME} erp_erp")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc))
        raise SystemExit(1)

# NOKTOS — Workspace Overview & Handoff

> [!IMPORTANT]
> **This is the CANONICAL, git-tracked copy of the workspace-level index.** It lives inside
> `noktos-agent-backend` purely for git persistence/continuity, not because the workspace
> overview belongs exclusively to the backend. Companion file: `PROGRESS.md` in this same directory —
> read that one for cross-repo V2 product decisions and roadmap. A local convenience copy
> of this file also exists at the workspace root (`../../../HANDOFF.md` relative to here);
> if the two diverge, this one wins.

This workspace holds four repositories:

| Repo | Branch | Remote | State |
| --- | --- | --- | --- |
| `noktos-auth` | `loop/noktos-auth` | `AngelCstd/proyecto_esc` | `READY_FOR_HUMAN_REVIEW`, 29/29 tasks, no HUMAN_GATE |
| `noktos-agent-backend` (`agback`) | `loop/agent-backend` | `luiscastaneda-tos/agback` | **V2-A COMPLETE & PUSHED**. OpenAiLlmProvider (`openai: ^7.17.0`), natural-language hotel delegation, mock grounding, deterministic fallback, approvals intact. |
| `noktos-agent-frontend` (`agfront`) | `loop/agent-frontend` | `luiscastaneda-tos/agfront` | `READY_FOR_HUMAN_REVIEW`, 46/46 tasks. Frozen as V1 baseline per `P-001`. |
| `noktos-agent-next` | `main` | *(local repository)* | **V2-A COMPLETE**. Next.js 16 (Turbopack), contract locked v1.0.0, SSE stream, simple agent activity visualization, contextual approvals. |

---

## Estado Actual: Milestone V2-A Demo Completado

Se completó de punta a punta la integración para la demo:

1. **LLM Real en Backend:**
   - Implementado en [`src/llm/openai-llm-provider.ts`](file:///Users/angelcstd/Documents/Programación/trabajo/noktos/agback/src/llm/openai-llm-provider.ts) usando el SDK oficial `openai`.
   - `SupervisorAgent` interpreta lenguaje natural (ej. *"Busca hoteles en Cancún para dos personas"*), emitiendo la decisión estructurada `delegate_to_hotel_search` validada por Zod.
   - Fail-safe estricto: el LLM nunca ejecuta tools directamente; la ejecución la gobierna el pipeline `SupervisorAgent -> TaskProcessor -> HotelSearchAgent -> ToolInvoker -> PolicyEngine -> Executor -> MockNoktosClient`.
2. **Grounding en Catálogo Mock:**
   - [`MockNoktosClient`](file:///Users/angelcstd/Documents/Programación/trabajo/noktos/agback/src/noktos/mock-noktos-client.ts) contiene 3 hoteles consistentes de Cancún (*Mock Resort Cancún Caribe*, *Mock Cancún Oasis Hotel*, *Mock Playa Cancún Suites*) con precio, moneda y descripción, y búsqueda tolerante a acentos.
   - `HotelSearchAgent` recibe instrucciones explícitas de usar exclusivamente los datos del mock y presentar una respuesta conversacional en español.
3. **Visualización Simple en Frontend (`noktos-agent-next`):**
   - Sin UUIDs técnicos, sin JSON crudo, sin prompts ni chain-of-thought interno.
   - Muestra la progresión limpia en chat y en pestaña lateral "Agentes":
     - `Supervisor — Analizando solicitud...`
     - `Agente de hoteles — Buscando hoteles en Cancún...`
     - `Agente de hoteles — 3 opciones encontradas`
     - `Supervisor — Respuesta preparada`
4. **Fallback Determinista y Aprobaciones Intactas:**
   - Comandos `demo:greeting`, `demo:hotel-delegation`, y `demo:add-reservation-to-cart` continúan funcionando al 100% mediante fallback directo a `DemoScriptedLlmProvider`.
   - Flujo de aprobación humana (`demo:add-reservation-to-cart`) mantiene el chokepoint estricto y botones interactivos en el chat.

---

## Cómo Levantar la Demo Mañana

### 1. Variables de Entorno

**En `agback/.env` (Backend):**
```bash
PORT=3000
NOKTOS_BASE_URL=http://localhost:3000
APPROVAL_TTL_MS=900000

# Supabase Auth
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=sb_publishable_tu_clave_publica_aqui

# LLM: Modo OpenAI Real
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-tu-api-key-de-openai
OPENAI_MODEL=gpt-4o-mini
```

> [!TIP]
> **Modo Offline Fallback:** Si por cualquier motivo no hay conexión o se desea probar sin consumir API de OpenAI, simplemente cambia `LLM_PROVIDER=demo-provider` en `agback/.env` y reinicia el backend.

**En `noktos-agent-next/.env.local` (Frontend):**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_tu_clave_publica_aqui
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
```
*(Ninguna API key de LLM debe colocarse en el frontend).*

---

### 2. Comandos de Ejecución

**Terminal 1 — Backend (`agback`):**
```bash
cd agback
# Con Node 20+ se puede pasar el archivo .env directamente:
node --env-file=.env dist/main.js
# O alternativamente:
# export LLM_PROVIDER=openai
# export OPENAI_API_KEY="sk-..."
# npm run start
```

**Terminal 2 — Frontend (`noktos-agent-next`):**
```bash
cd noktos-agent-next
npm run dev
```

Abre en el navegador: **`http://localhost:3001`**.

---

## Verificaciones Ejecutadas

- **Backend (`agback`):**
  - `npm run build`: Compilación TypeScript exitosa.
  - `bash .loop/scripts/check-layering.sh`: 72 archivos escaneados, **0 violaciones**.
  - `bash .loop/scripts/verify.sh`: Build y layering verificados.
- **Frontend (`noktos-agent-next`):**
  - `npm test`: PASS (receiver de `globalThis.fetch` preservado, suite de 5 pruebas de derivación de actividad de agentes).
  - `npm run verify:contracts`: PASS (contratos v1.0.0 idénticos a `contracts.lock`).
  - `npm run build`: Next.js 16.3.5 Turbopack compilado en producción (4 rutas estáticas generadas).
  - `npm run lint`: 0 errores, 0 warnings.

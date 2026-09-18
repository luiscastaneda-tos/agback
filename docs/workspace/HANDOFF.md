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
| `noktos-agent-next` | `main` | `AngelCstd/next_agent` | **V2-A COMPLETE & PUSHED**. Next.js 16 (Turbopack), contract locked v1.0.0, SSE stream, simple agent activity visualization, contextual approvals. |

---

## 📌 Decisiones Clave de la Demo (P-013 a P-018)

1. **P-013 — Prioridad Demo-First:** Enfoque prioritario en una entrega funcional end-to-end para la demo ("Busca hoteles en Cancún para dos personas"), postergando hardening y documentación secundaria.
2. **P-014 — Proveedor Real únicamente OpenAI:** Proveedor real acotado a OpenAI con el SDK oficial `openai: ^7.17.0` (`OpenAiLlmProvider`). Cero dependencias multi-vendor complejas para la demo.
3. **P-015 — Enrutamiento Estructurado del Supervisor:** OpenAI devuelve decisiones estructuradas (`delegate_to_hotel_search` o respuesta) validadas con Zod. OpenAI **nunca** ejecuta tools directamente.
4. **P-016 — Grounding Estricto en Mock:** 3 hoteles ficticios en Cancún en `MockNoktosClient` con precios en MXN, moneda y descripciones. El LLM tiene prohibido inventar hoteles. Búsqueda tolerante a acentos (`Cancún` = `cancun`).
5. **P-017 — Visualización Simple (Sin Chain-of-Thought):** El frontend solo muestra estados operacionales simples (`Supervisor analizando...`, `Agente de hoteles buscando...`, `3 opciones encontradas`, `Respuesta preparada`). Cero CoT, cero JSON, cero UUIDs.
6. **P-018 — Fallback Determinista y Aprobaciones:** `demo:*` y `demo-provider` se conservan para contingencias offline. Chokepoint de aprobación humana de carrito intacto.
7. **Fuera de alcance:** LangGraph, LangChain, Noktos real, memoria RAG/vectores, follow-ups complejos y branding.

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

---

## 2026-09-18 (session 2) — Estado actual, UX hardening y fix de aprobación

**Este bloque es el estado vigente.** Lo de arriba (P-013 a P-018, "Cómo Levantar la Demo Mañana",
"Verificaciones Ejecutadas") sigue siendo correcto como referencia de arranque y de las decisiones
de la demo inicial — no se contradice, solo se complementa. Para el detalle completo de decisiones
y roadmap, ver `PROGRESS.md` en este mismo directorio, sección **"2026-09-18 (session 2) — CURRENT
STATE"** (autoridad para el próximo milestone).

### HEADs reales al cierre de esta sesión

- `noktos-agent-backend` / `loop/agent-backend`: **`ab8fab8`** — `fix: natural Spanish text for
  delegated/cart/confirm/cancel results`.
- `next_agent` / `main`: **`de944f8`** — `fix: stabilize chat auto-scroll and compact approval
  cards`.

Confirma siempre con `git log -5 --oneline`, `git status`, `git branch --show-current` antes de
asumir que estos hashes siguen siendo el HEAD — no los tomes como verdad si el repo avanzó desde
entonces.

### Qué se corrigió/agregó desde "Milestone V2-A Demo Completado"

1. **Memoria conversacional mínima** (`src/memory/`, commits `30b400c`/`594468e`): contexto por
   `conversationId` (mensajes recientes + última búsqueda de hoteles estructurada), usado para
   responder follow-ups ("¿cuál es más barato?") sin re-delegar ni inventar.
2. **Fix de aprobación post-approve**: el chat a veces se quedaba "callado" después de aprobar. Causa
   real: al reanudar, se volvía a invocar al LLM desde cero, que podía regenerar los argumentos del
   tool ligeramente distinto y fallar el chequeo de `payloadHash`, abriendo una segunda aprobación en
   silencio. Fix: `ApprovalRequest` ahora guarda `validatedArguments` (nunca expuesto por HTTP) y al
   reanudar se ejecuta directo con esos argumentos vía `SupervisorAgent.runApprovedAction()`, sin
   segunda llamada al LLM, sin tocar el chokepoint de ejecución.
3. **Copy natural en español**: `SupervisorTaskProcessor` ahora pone `data.text` natural (antes solo
   `summary` técnico en inglés) para `delegated`/`cart_completed`/`confirmation_completed`/
   `cancellation_completed`. `summary` se conserva igual para uso técnico/debug.
4. **UX del frontend** (`next_agent`, ver su propio `HANDOFF.md` para el detalle completo): activity
   y approval cards compactas/collapsibles y turn-scoped, layout de chat con scroll interno real,
   auto-scroll sticky-bottom confiable, sin botones de demo visibles, sin request storm, sin
   duplicados de mensajes.

### Nota de proceso importante

Todo lo anterior se implementó vía sesiones de Codex CLI acotadas (`codex exec --sandbox
workspace-write`), dirigidas y verificadas independientemente por una sesión supervisora de Claude
Code — nunca confiando solo en el self-report del implementer. Esto importó en la práctica: un
cambio de backend rompió el grafo de inyección de dependencias de Nest de una forma que ni `tsc` ni
los tests existentes detectaron (los tests instancian clases directamente, sin pasar por el
contenedor de Nest) — solo arrancar la app compilada de verdad (`node dist/main.js`) lo reveló. Para
cualquier cambio que toque wiring de módulos, composición en runtime, o flujos async/event-driven,
**arrancar la app real es parte obligatoria de la verificación, no opcional.**

### RESUME FROM HERE

Ver `PROGRESS.md` de este mismo directorio, sección **"2026-09-18 (session 2) — CURRENT STATE"**,
que contiene las instrucciones completas de reanudación (próximo milestone: **non-blocking
conversation / concurrent turns**) para no duplicarlas aquí. El `HANDOFF.md` de `next_agent` tiene
la contraparte frontend de esas mismas instrucciones, con el escenario objetivo concreto.

### NEXT CHAT STARTER PROMPT

> Lee `CLAUDE.md`, `AGENTS.md`, `HANDOFF.md` y `docs/workspace/PROGRESS.md` de
> `noktos-agent-backend`, y `CLAUDE.md`, `AGENTS.md`, `HANDOFF.md` de `next_agent`. Usa Git
> (`git log`, `git status`, `git branch --show-current`) como autoridad para el HEAD y estado real
> de cada repo — no asumas que los hashes documentados siguen vigentes. Sigue la sección "RESUME
> FROM HERE" al pie de la letra. No revises el roadmap desde cero ni me preguntes qué sigue: el
> próximo milestone ya está decidido — **non-blocking conversation / concurrent turns**. Actúa como
> Supervisor/Orchestrator (no implementes código de producto tú mismo), usa Codex CLI para
> cualquier cambio de código real en ambos repos, verifica todo de forma independiente (incluyendo
> arrancar la app real si el cambio toca wiring/async), y repórtame solo al final.

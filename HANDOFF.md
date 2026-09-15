# HANDOFF — noktos-agent-backend

**Estado:** ✅ **LOOP TERMINADO** — `READY_FOR_HUMAN_REVIEW` (2026-09-14)
**Rama:** `loop/agent-backend`
**Tareas completadas:** 63 / 63 (`BE-000` a `BE-025`)
**Worktree:** Limpio, todos los cambios integrados y verificados

> [!NOTE]
> `READY_FOR_HUMAN_REVIEW` es el estado terminal máximo previsto por el loop autónomo. No significa `PRODUCTION_READY`. V1 corre en memoria con datos ficticios y cliente de Noktos mockeado; la validación humana interactiva y la posterior migración a persistencia real quedan pendientes.

---

## 1. ¿Qué es este proyecto y qué se construyó?

`noktos-agent-backend` es el backend multi-agente observable para Noktos. Expone un runtime de agentes (SupervisorAgent y HotelSearchAgent) con tareas asíncronas, streaming de eventos vía Server-Sent Events (SSE) con soporte de reconexión/replay, y un sistema formal de aprobaciones humanas (*human-in-the-loop*).

### Aspectos arquitectónicos clave implementados:

1. **Chokepoint estructural de ejecución (`D-002`)**:
   - Ningún agente, definición de herramienta o modelo LLM puede causar efectos secundarios directamente.
   - Flujo único:
     ```text
     Agent -> ToolHandle/def (datos) -> ToolInvoker -> Validación esquema
           -> PolicyEngine -> ApprovalEngine -> ExecutorRegistry -> Executor -> NoktosClient (Mock)
     ```
   - Separación estricta por capas verificada mecánicamente (`check-layering.sh`): agentes y definiciones jamás importan `src/execution/` ni `src/noktos/`.

2. **Aislamiento de credenciales y AuthContext (`D-009`, `D-018`)**:
   - El token de acceso Supabase se valida remotamente al inicio de la petición.
   - En memoria se genera un identificador opaco `authContextId`.
   - El token de Supabase **NUNCA** se serializa en tareas, eventos SSE, prompts del LLM, URLs o logs.

3. **Proveedor LLM Scripted / Determinista para V1 (`D-021`)**:
   - `LLM_PROVIDER=demo-provider`, `LLM_MODEL=fictional-demo-model`.
   - Implementa `DemoScriptedLlmProvider` detrás de la interfaz común `LlmProvider`.
   - Permite demos reproducibles y captura determinista sin costo ni dependencias de APIs externas.

4. **Reencolado y reanudación automática de tareas aprobadas (`D-022`)**:
   - Cuando el propietario aprueba una solicitud (`POST /approvals/:id/decision`), la tarea en `awaiting_human_approval` se reencola automáticamente en `TaskQueueService`.
   - `activeApprovalId` se preserva a través de los estados `queued -> running` hasta que el `ToolInvoker` valida y consume la aprobación en el chokepoint.

5. **Productores de eventos de ciclo de vida de aprobación en runtime (`D-023`)**:
   - Emisión de `approval.requested`, `approval.approved`, `approval.rejected`, `approval.expired`, `approval.superseded` mediante `EventBusService` con payloads mínimos y redactados.

6. **Endpoint de snapshot de tareas autorizado (`D-025`)**:
   - `GET /conversations/:id/tasks` expone `AgentTask[]` tipado conforme al contrato 1.0.0, protegiendo por propiedad de conversación (`conversation.userId === identity.userId`).
   - Suministra los datos necesarios para que el frontend proyecte asíncronamente las respuestas del asistente.

---

## 2. Contrato de API (API Contract v1.0.0)

> [!IMPORTANT]
> Los contratos de API ya están formalmente definidos y congelados en versión **1.0.0** bajo el directorio [`contracts/`](./contracts/). Son compartidos byte a byte con `noktos-agent-frontend`.

### Referencias normativas de contratos:
- **[`contracts/http.md`](./contracts/http.md)**: Especificación de endpoints REST y SSE.
- **[`contracts/events.ts`](./contracts/events.ts)**: Tipos de eventos y payloads.
- **[`contracts/task.ts`](./contracts/task.ts)**: Entidad `AgentTask`, estados y códigos de error.
- **[`contracts/approval.ts`](./contracts/approval.ts)**: Entidad `ApprovalRequest`, preview y decisiones.
- **[`contracts/conversation.ts`](./contracts/conversation.ts)**: Modelo de conversación y mensajes.
- **[`contracts/agent.ts`](./contracts/agent.ts)**: Descriptores de agentes.

### Resumen de Endpoints Disponibles:

Todos los endpoints requieren header de autenticación:
`Authorization: Bearer <supabase_access_token>`

| Método | Ruta | Estado | Descripción |
| :--- | :--- | :---: | :--- |
| `POST` | `/conversations` | `201 Created` | Crea una nueva conversación en memoria para el usuario autenticado. |
| `POST` | `/conversations/:id/messages` | `202 Accepted` | Envía un mensaje a la conversación. Retorna `{ accepted: Message, createdTaskIds: UUID[] }` inmediatamente sin bloquearse. |
| `GET` | `/conversations/:id/events` | `200 OK` (`text/event-stream`) | Stream SSE de eventos. Soporta header `Last-Event-ID` para reemisión secuencial desde el ring buffer. |
| `GET` | `/conversations/:id/tasks` | `200 OK` | Retorna snapshot de `AgentTask[]` asociadas a la conversación. |
| `GET` | `/conversations/:id/approvals` | `200 OK` | Retorna lista de `ApprovalRequest[]` de la conversación. |
| `POST` | `/approvals/:id/decision` | `200 OK` | Registra decisión (`approve` / `reject`) con soporte de idempotencia (`idempotencyKey`). Reanuda la tarea si es aprobada. |
| `GET` | `/agents` | `200 OK` | Lista descriptores de los agentes registrados (`SupervisorAgent`, `HotelSearchAgent`). |

### Sobre de Errores Unificado:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Mensaje seguro y sanitizado",
    "requestId": "req_uuid"
  }
}
```

---

## 3. ¿Qué toca hacer a partir de aquí? (Próximos Pasos)

La entrega y verificación paso a paso se rige por **[`docs/HUMAN_REVIEW.md`](./docs/HUMAN_REVIEW.md)**.

### Paso 1: Configuración del entorno local
Copia el archivo de ejemplo y configura los valores (no agregues secretos a git):
```bash
cp .env.example .env
```
Variables principales en `.env`:
```dotenv
PORT=3000
LLM_PROVIDER=demo-provider
LLM_MODEL=fictional-demo-model
APPROVAL_TTL_MS=900000
NOKTOS_BASE_URL=http://localhost:4010/mock-noktos
SUPABASE_URL=https://<tu-proyecto>.supabase.co
SUPABASE_ANON_KEY=<tu-public-anon-key>
```

### Paso 2: Compilar e iniciar el servidor
```bash
npm run build
npm run start
```
El backend estará disponible en `http://localhost:3000`.

### Paso 3: Ejecutar la captura de fixtures con credenciales reales (`D-024`)
Tal como estableció la decisión `D-024`, las fixtures reales deben capturarse usando credenciales de un usuario de prueba de Supabase mediante los scripts preparados:

1. **Captura de búsqueda de hoteles**:
   ```bash
   node fixtures/capture-hotel-search.mjs --base-url http://localhost:3000 --output fixtures/hotel-search.sse
   ```
   *(Ingresa el token de acceso cuando el prompt seguro lo solicite).*

2. **Captura de flujo de aprobación de reserva**:
   ```bash
   node fixtures/capture-cart-approval.mjs --base-url http://localhost:3000 --output fixtures/cart-approval.sse
   ```
   *(Revisa el preview de aprobación en terminal y escribe `APPROVE` cuando lo solicite).*

### Paso 4: Completar el checklist de revisión humana
Revisa y completa los puntos en [`docs/HUMAN_REVIEW.md`](./docs/HUMAN_REVIEW.md):
- Confirmar que ningún token o handle sensible aparece en los eventos emitidos o en las fixtures.
- Validar el rechazo de peticiones no autenticadas o con token inválido.
- Validar la idempotencia de decisiones de aprobación.

### Paso 5: Roadmap para V2 (Post-V1)
1. **Persistencia duradera**: Sustituir `InMemoryTaskStore`, `InMemoryConversationStore` y `InMemoryApprovalStore` por PostgreSQL con Prisma o TypeORM.
2. **Integración con Noktos Core**: Conectar `NoktosClient` a los controladores públicos que exponga `noktos-auth`.
3. **Proveedor LLM Real**: Integrar proveedores generativos externos (Gemini / Anthropic / OpenAI) tras la interfaz `LlmProvider`.
4. **Matriz de roles y aprobaciones delegadas**: Soportar aprobación por administradores o managers una vez definida la matriz de roles en `noktos-auth` (`Q-001`).

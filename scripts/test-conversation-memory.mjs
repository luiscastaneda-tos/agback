import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ConversationMemoryStore } = require('../dist/memory/conversation-memory.store.js');
const {
  SupervisorAgent,
} = require('../dist/agents/supervisor/supervisor.agent.js');
const {
  HotelSearchAgent,
} = require('../dist/agents/hotel-search/hotel-search.agent.js');
const {
  HotelSearchTaskProcessor,
} = require('../dist/tasks/hotel-search-task-processor.js');
const {
  DemoScriptedLlmProvider,
} = require('../dist/llm/demo-scripted-llm-provider.js');
const {
  OpenAiLlmProvider,
} = require('../dist/llm/openai-llm-provider.js');

const inertHandle = (name) => ({
  name,
  description: `${name} test handle`,
  argsSchema: { type: 'object', properties: {} },
});

const toolContext = {
  taskId: 'task-1',
  conversationId: 'conversation-a',
  correlationId: 'correlation-1',
};

const cancunSearch = {
  destination: 'Cancún',
  criteria: 'Busca hoteles en Cancún para dos personas.',
  hotels: [
    {
      id: 'hotel-1', name: 'Hotel Mar', destination: 'Cancún',
      price: 3200, currency: 'MXN', description: 'Frente al mar.',
    },
    {
      id: 'hotel-2', name: 'Hotel Centro', destination: 'Cancún',
      price: 2450, currency: 'MXN', description: 'En la zona hotelera.',
    },
    {
      id: 'hotel-3', name: 'Hotel Playa', destination: 'Cancún',
      price: 1890, currency: 'MXN', description: 'A 5 minutos de la playa.',
    },
  ],
};

function testIsolationAndBounds() {
  const memory = new ConversationMemoryStore();
  memory.appendMessage('conversation-a', { role: 'user', text: 'Busca en Cancún.' });
  memory.setLastHotelSearch('conversation-a', cancunSearch);
  memory.appendMessage('conversation-b', { role: 'user', text: 'Busca en Mérida.' });

  assert.equal(memory.getContext('conversation-b').lastHotelSearch, undefined);
  assert.deepEqual(memory.getContext('conversation-b').messages, [
    { role: 'user', text: 'Busca en Mérida.' },
  ]);
  assert.deepEqual(memory.getContext('conversation-a').lastHotelSearch, cancunSearch);

  const copy = memory.getContext('conversation-a');
  copy.lastHotelSearch.hotels.length = 0;
  assert.equal(memory.getContext('conversation-a').lastHotelSearch.hotels.length, 3);

  for (let index = 0; index < 20; index += 1) {
    memory.appendMessage('bounded', { role: 'user', text: `message-${index}` });
  }
  assert.equal(memory.getContext('bounded').messages.length, 16);
  assert.equal(memory.getContext('bounded').messages[0].text, 'message-4');
}

async function testGroundedSupervisorContext() {
  for (const goal of [
    '¿Cuál de esos es el más barato?',
    '¿Cuál está más cerca de la playa?',
  ]) {
    let capturedRequest;
    const provider = {
      async generate(_model, request) {
        capturedRequest = request;
        return { text: 'Respuesta basada en los hoteles guardados.', toolCalls: [] };
      },
    };
    const supervisor = new SupervisorAgent(
      provider,
      'test-model',
      inertHandle('add_reservation_to_cart'),
      inertHandle('confirm_booking'),
      inertHandle('cancel_booking'),
      { invoke: async () => { throw new Error('No tool call expected.'); } },
    );

    const outcome = await supervisor.run(goal, toolContext, {
      messages: [
        { role: 'user', text: 'Busca hoteles en Cancún para dos personas.' },
        { role: 'assistant', text: 'Encontré tres hoteles.' },
      ],
      lastHotelSearch: cancunSearch,
    });

    assert.equal(outcome.kind, 'completed');
    assert.equal(capturedRequest.messages.at(-1).text, goal);
    const groundedMessage = capturedRequest.messages.find(
      (message) => message.role === 'system' && message.text.startsWith('PREVIOUS HOTEL SEARCH'),
    );
    assert.ok(groundedMessage);
    assert.match(groundedMessage.text, /Hotel Playa/);
    assert.match(groundedMessage.text, /1890/);
    assert.match(groundedMessage.text, /A 5 minutos de la playa/);
    assert.equal(capturedRequest.tools.some(
      (tool) => tool.name === 'delegate_to_hotel_search',
    ), true);
  }
}

async function testCapturedHotelSearchIsStored() {
  let generation = 0;
  const provider = {
    async generate() {
      generation += 1;
      return generation === 1
        ? {
            text: '',
            toolCalls: [{
              id: 'search-1', name: 'search_hotels', arguments: { destination: 'Cancún' },
            }],
          }
        : { text: 'Encontré tres hoteles mock en Cancún.', toolCalls: [] };
    },
  };
  const hotelAgent = new HotelSearchAgent(
    provider,
    'test-model',
    inertHandle('search_hotels'),
    { invoke: async () => ({ kind: 'completed', data: { mock: true, hotels: cancunSearch.hotels } }) },
  );
  const memory = new ConversationMemoryStore();
  const processor = new HotelSearchTaskProcessor(
    hotelAgent,
    { publish() {} },
    memory,
  );
  const outcome = await processor.process({
    id: 'hotel-task',
    conversationId: 'conversation-capture',
    agentName: 'HotelSearchAgent',
    status: 'running',
    goal: cancunSearch.criteria,
  }, { correlationId: 'correlation-capture' });

  assert.equal(outcome.kind, 'completed');
  assert.deepEqual(memory.getContext('conversation-capture').lastHotelSearch, cancunSearch);
  assert.equal(
    memory.getContext('conversation-capture').messages.at(-1).text,
    'Encontré tres hoteles mock en Cancún.',
  );
}

async function testDemoShortCircuitAndApprovalFlow() {
  const fallback = new DemoScriptedLlmProvider();
  const provider = new OpenAiLlmProvider({ apiKey: 'unit-test-key', fallbackProvider: fallback });
  const demo = await provider.generate('unused-model', {
    messages: [
      { role: 'system', text: 'stored context' },
      { role: 'user', text: 'old question' },
      { role: 'assistant', text: 'old answer', toolCalls: [] },
      { role: 'user', text: 'demo:greeting' },
    ],
    tools: [],
  });
  assert.match(demo.text, /Hello! I can demonstrate a fictional hotel search/);

  const runtime = {
    async invoke(name, _args, context) {
      assert.equal(name, 'add_reservation_to_cart');
      return context.approvalId === undefined
        ? { kind: 'awaiting_approval', approvalId: 'approval-1' }
        : { kind: 'completed', data: {
            mock: true, cartItemId: 'cart-item-1', status: 'added',
          } };
    },
  };
  const supervisor = new SupervisorAgent(
    fallback,
    'test-model',
    inertHandle('add_reservation_to_cart'),
    inertHandle('confirm_booking'),
    inertHandle('cancel_booking'),
    runtime,
  );
  const pending = await supervisor.run('demo:add-reservation-to-cart', toolContext, {
    messages: [], lastHotelSearch: cancunSearch,
  });
  assert.equal(pending.kind, 'stopped');
  assert.equal(pending.outcome.kind, 'awaiting_approval');

  const completed = await supervisor.run('demo:add-reservation-to-cart', {
    ...toolContext, approvalId: 'approval-1',
  });
  assert.deepEqual(completed, {
    kind: 'cart_completed',
    data: { mock: true, cartItemId: 'cart-item-1', status: 'added' },
  });
}

await testGroundedSupervisorContext();
await testCapturedHotelSearchIsStored();
await testDemoShortCircuitAndApprovalFlow();
testIsolationAndBounds();

console.log('conversation memory tests passed');

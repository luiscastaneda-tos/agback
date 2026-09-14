import type { LlmAssistantOutput, LlmProvider, LlmRequest, LlmToolCall } from './llm-provider';

const LABEL = 'DEMO / FICTIONAL / SCRIPTED';
const CLARIFICATION = `${LABEL}: Choose an exact scenario input from docs/demo-provider.md.`;

/** Deterministic intent generation only; no execution capability or conversation state. */
export class DemoScriptedLlmProvider implements LlmProvider {
  async generate(_model: string, request: LlmRequest): Promise<LlmAssistantOutput> {
    let userIndex = -1;
    for (let index = request.messages.length - 1; index >= 0; index -= 1) {
      if (request.messages[index].role === 'user') {
        userIndex = index;
        break;
      }
    }
    const user = request.messages[userIndex];
    const scenario = user?.role === 'user' ? user.text : undefined;
    const textOnly = (text: string): LlmAssistantOutput => ({ text, toolCalls: [] });

    let call: LlmToolCall;
    switch (scenario) {
      case 'demo:greeting':
        return textOnly(`${LABEL}: Hello! I can demonstrate a fictional hotel search.`);
      case 'demo:clarification':
        return textOnly(CLARIFICATION);
      case 'demo:hotel-delegation':
        call = {
          id: 'demo-delegation-1', name: 'delegate_to_hotel_search',
          arguments: { goal: 'demo:hotel-search' },
        };
        break;
      case 'demo:hotel-search':
        call = {
          id: 'demo-search-1', name: 'search_hotels',
          arguments: { destination: 'Demo Harbor' },
        };
        break;
      case 'demo:add-reservation-to-cart':
        call = {
          id: 'demo-cart-1', name: 'add_reservation_to_cart',
          arguments: {
            hotelId: 'fictional-hotel-1', hotelName: 'Fictional Demo Hotel',
            checkIn: '2030-01-10', checkOut: '2030-01-12',
            travelerId: 'fictional-traveler-1', travelerName: 'Fictional Demo Traveler',
            rooms: 1, totalPrice: 200, currency: 'MXN',
          },
        };
        break;
      case 'demo:confirm-booking':
        call = {
          id: 'demo-confirm-1', name: 'confirm_booking',
          arguments: {
            cartItemId: 'fictional-cart-item-1', travelerId: 'fictional-traveler-1',
            travelerName: 'Fictional Demo Traveler', totalPrice: 200, currency: 'MXN',
          },
        };
        break;
      case 'demo:cancel-booking':
        call = {
          id: 'demo-cancel-1', name: 'cancel_booking',
          arguments: {
            bookingId: 'fictional-booking-1', travelerId: 'fictional-traveler-1',
            travelerName: 'Fictional Demo Traveler', reason: 'Fictional demo cancellation',
          },
        };
        break;
      default:
        return textOnly(CLARIFICATION);
    }

    if (!request.tools.some((tool) => tool.name === call.name)) {
      return textOnly(CLARIFICATION);
    }

    // Correlate only within the latest user turn, and only after the assistant call.
    let callSeen = false;
    for (const message of request.messages.slice(userIndex + 1)) {
      if (message.role === 'assistant' && message.toolCalls.some(
        (previous) => previous.id === call.id && previous.name === call.name,
      )) {
        callSeen = true;
      } else if (callSeen && message.role === 'tool' && message.toolCallId === call.id) {
        return textOnly(call.name === 'search_hotels'
          ? `${LABEL}: The fictional hotel search returned a tool result. This demo provides no live availability or real bookings.`
          : `${LABEL}: A tool result was received for this scripted intent; no further call is requested.`);
      }
    }
    if (callSeen) {
      return textOnly(`${LABEL}: This scripted intent has already been requested; its result is pending.`);
    }

    return {
      text: `${LABEL}: Requesting a scripted intent only; execution and any required human approval remain with the runtime.`,
      toolCalls: [call],
    };
  }
}

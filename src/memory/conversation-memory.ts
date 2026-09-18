export type ConversationMemoryRole = 'user' | 'assistant';

export interface ConversationMemoryMessage {
  readonly role: ConversationMemoryRole;
  readonly text: string;
}

export interface RememberedHotel {
  readonly id: string;
  readonly name: string;
  readonly destination: string;
  readonly price?: number;
  readonly currency?: string;
  readonly description?: string;
}

export interface RememberedHotelSearch {
  readonly destination: string;
  readonly criteria: string;
  readonly hotels: readonly RememberedHotel[];
}

export interface ConversationMemoryContext {
  readonly messages: readonly ConversationMemoryMessage[];
  readonly lastHotelSearch?: RememberedHotelSearch;
}

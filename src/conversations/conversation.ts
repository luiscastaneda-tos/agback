export interface ConversationState {
  preferences: Record<string, unknown>;
  pendingUserNotes: string[];
  lastAppliedAt?: string;
}

export interface Conversation {
  readonly id: string;
  readonly userId: string;
  title?: string;
  readonly createdAt: string;
  updatedAt: string;
  state: ConversationState;
}

export interface CreateConversationInput {
  userId: string;
  title?: string;
}

export interface UpdateConversationInput {
  title?: string;
  state?: Partial<ConversationState>;
}

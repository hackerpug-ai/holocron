import { createBuilder, defineQueries, defineQuery } from '@rocicorp/zero';
import { schema } from './schema';

const builder = createBuilder(schema);

export const queries = defineQueries({
  chatMessages: {
    byConversation: defineQuery(({ args }: { args: { conversationId: string } }) =>
      builder.chat_messages
        .where('conversation_id', args.conversationId)
        .orderBy('created_at', 'asc')
    ),
  },
});

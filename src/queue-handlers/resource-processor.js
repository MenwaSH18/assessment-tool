import { ContentAgent } from '../agents/content-agent.js';

/**
 * Queue consumer handler for async document processing.
 * Handles messages from the 'resource-processing' queue.
 *
 * Message format: { type: 'parse_resource', resourceId: number }
 */
export async function handleQueueBatch(batch, env) {
  for (const message of batch.messages) {
    try {
      const { type, resourceId } = message.body;

      if (type === 'parse_resource' && resourceId) {
        const agent = new ContentAgent(env);
        const result = await agent.processResource(resourceId);

        if (result.success) {
          console.log(`Successfully processed resource ${resourceId}: ${result.chunks} chunks`);
        } else {
          console.error(`Failed to process resource ${resourceId}: ${result.error}`);
        }
      } else {
        console.warn('Unknown queue message type:', type);
      }

      // Acknowledge the message
      message.ack();
    } catch (err) {
      console.error('Queue processing error:', err.message);
      // Retry the message
      message.retry();
    }
  }
}

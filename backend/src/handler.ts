// Lambda entry point (template.yaml: Handler: handler.handler).
// Reads configuration from environment variables set by SAM and wires the
// real DynamoDB repository into the app.
import { createHandler } from './app';
import { DynamoTaskRepository } from './taskRepository';

const tableName = process.env.TABLE_NAME;
const allowedOrigin = process.env.ALLOWED_ORIGIN;

if (!tableName || !allowedOrigin) {
  // Fails the Lambda's startup, so misconfiguration shows up in CloudWatch Logs
  // immediately instead of as confusing errors later.
  throw new Error('TABLE_NAME and ALLOWED_ORIGIN environment variables must be set');
}

// Code outside the handler runs once per Lambda container ("cold start"),
// so the DynamoDB client is reused across requests.
const repository = new DynamoTaskRepository(tableName, process.env.DYNAMODB_ENDPOINT || undefined);

export const handler = createHandler({ repository, allowedOrigin });

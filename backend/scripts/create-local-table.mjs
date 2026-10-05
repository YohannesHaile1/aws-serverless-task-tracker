// Creates the "tasks-local" table in DynamoDB Local (see docker-compose.yml).
// Mirrors the TasksTable definition in template.yaml. Safe to run repeatedly.
//
// The endpoint is hard-coded to localhost and the credentials are dummies,
// so this script can never touch your real AWS account.
import { CreateTableCommand, DynamoDBClient, ResourceInUseException } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  endpoint: 'http://localhost:8000',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});

try {
  await client.send(
    new CreateTableCommand({
      TableName: 'tasks-local',
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: 'S' },
        { AttributeName: 'status', AttributeType: 'S' },
        { AttributeName: 'createdAt', AttributeType: 'S' },
      ],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'status-createdAt-index',
          KeySchema: [
            { AttributeName: 'status', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    }),
  );
  console.log('Created table "tasks-local" in DynamoDB Local.');
} catch (error) {
  if (error instanceof ResourceInUseException) {
    console.log('Table "tasks-local" already exists.');
  } else if (error.name === 'TimeoutError' || error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
    console.error('Could not reach DynamoDB Local on port 8000. Start it with: docker compose up -d');
    process.exit(1);
  } else {
    throw error;
  }
}
